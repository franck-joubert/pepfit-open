// Données de l'âge pepfit : l'historique réel des neuf facteurs (Whoop, Santé Connect, séances pepfit, balance), la date de
// naissance et le sexe ; puis les 30 dernières semaines recalculées (age-calc.ts). Rien d'inventé : sans date de naissance,
// pas d'âge pepfit (la page propose de la saisir) ; un facteur sans donnée n'apporte rien.
import type { Executeur } from "../../db/executeur";
import { historiqueMesure } from "../../db/depots/mesures";
import { lireEstimationsCourses, lireTestsVma, TYPE_VMA_COURSE } from "../../db/depots/vma";
import { TYPE_TEST_VMA } from "../../db/depots/zones-fc";
import { vmaDemiCooper, vo2maxDeVma } from "./vma-calc";
import { historiqueMensuration, lireMorphologie, type TypeMensuration } from "../../db/depots/profil";
import { grasNavy } from "../../precision/comptage";
import { ecrireReglage, lireReglage, PREFIXE_CACHE } from "../../db/depots/reglages";
import { sante } from "../../natif/sante/index";
import { joursWhoop, journalWhoopGarde, seancesWhoopEntre } from "../../whoop/lecture";
import { lirePasJours, valeurPas } from "../pas-source";
import { extremes, GROUPES, lundiDe, rythme, semaines, semainesComparables, SEMAINES, FENETRE_JOURS, type GroupeAge, type HistoriqueAge, type SemaineAge } from "./age-calc";
import { decaler, joursEntre, minuit } from "./periodes";
import type { ReculAge } from "./age-attente";
import { regulariteNuits } from "./regularite-sommeil";
import { familleDe } from "../familles-sports";

/** Séances pepfit hors Whoop et leur sport, comme l'Effort (effort-charges.ts) : l'activité, sinon le premier exercice qui
 * porte un sport ; des exercices sans sport : la musculation. */
const SQL_SEANCES_SPORT = `SELECT s.debut, s.fin, COALESCE(s.activite_id, (SELECT se.exercice_id FROM seance_exercices se JOIN exercices e ON e.id = se.exercice_id
      WHERE se.seance_id = s.id AND (e.whoop_ids IS NOT NULL OR e.id = 'cat:musculation') ORDER BY se.position LIMIT 1)) AS sport
  FROM seances s WHERE s.fin IS NOT NULL AND (s.source_ref IS NULL OR s.source_ref NOT LIKE 'whoop:%')`;
/** Le facteur Musculation ne compte que la famille « force » (C9 : les courses y comptaient). */
const deForce = (s: { sport: string | null }) => familleDe(s.sport ?? "cat:musculation") === "force";

/** Séances pepfit mesurées à la FC hors Whoop (capteur en direct, montre par Santé Connect) : leurs minutes de Z1 à Z5
 * (seance_charge.zones, méthode « fc »). Celles qui ont une séance Whoop sont déjà comptées par Whoop. */
const SQL_SEANCES_FC = `SELECT s.debut, c.zones FROM seance_charge c JOIN seances s ON s.id = c.seance_id
  WHERE c.zones IS NOT NULL AND c.source_fc IN ('capteur', 'sante')
    AND NOT EXISTS (SELECT 1 FROM whoop_seance w WHERE w.seance_id = s.id)`;

/** Date de naissance (minuit local) : la date complète du profil, sinon le 1er juillet de l'année seule ; null sans rien. */
export async function lireNaissance(db: Executeur): Promise<{ date: number; precise: boolean } | null> {
  const iso = await lireReglage(db, "naissance");
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  if (m) return { date: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime(), precise: true };
  const a = Number(await lireReglage(db, "annee_naissance"));
  return a > 1900 ? { date: new Date(a, 6, 1).getTime(), precise: false } : null;
}

export type SourceFacteur = "whoop" | "sante" | "pepfit" | "balance" | null;

export interface DonneesAge {
  naissance: number;
  sexe: "h" | "f" | null;
  /** Les 30 semaines, chacune sur les facteurs mesurés aujourd'hui (pas de point sans eux tous) : courbe, évolution. */
  semaines: SemaineAge[];
  /** La semaine en cours (dernier lundi). */
  courante: SemaineAge;
  rythme: number | null;
  /** Rythme semaine par semaine (null tant qu'il n'y a pas 26 semaines d'avant). */
  rythmes: (number | null)[];
  sources: { sommeil: SourceFacteur; marche: SourceFacteur; zones: SourceFacteur; muscu: SourceFacteur; fc: SourceFacteur; maigre: SourceFacteur; vo2: SourceFacteur };
  whoopUtilise: boolean;
}

/** %gras des tours (méthode US Navy) à la date du plus récent des tours utilisés ; null s'il en manque un. */
async function grasDesTours(db: Executeur): Promise<{ date: number; valeur: number } | null> {
  const dernier = async (t: TypeMensuration) => (await historiqueMensuration(db, t)).reduce<{ valeur: number; date: number } | null>((a, m) => (!a || m.date > a.date ? m : a), null);
  const [morpho, tour, cou, hanches] = await Promise.all([lireMorphologie(db), dernier("tour_taille"), dernier("cou"), dernier("hanches")]);
  const v = grasNavy({ sexe: morpho.sexe, tailleCm: morpho.tailleCm, tourTaille: tour?.valeur ?? null, cou: cou?.valeur ?? null, hanches: hanches?.valeur ?? null });
  return v == null ? null : { date: Math.max(tour!.date, cou!.date, ...(morpho.sexe === "f" && hanches ? [hanches.date] : [])), valeur: v };
}

/** Tout l'historique utile : 6 mois avant la plus ancienne des 30 semaines. */
export async function lireHistorique(db: Executeur, maintenant: number): Promise<{ h: HistoriqueAge; sources: DonneesAge["sources"] }> {
  const fin = maintenant;
  const debut = decaler(lundiDe(maintenant), -7 * (SEMAINES - 1) - FENETRE_JOURS);
  const [whoop, nuitsSC, seancesW, seancesFcL, muscuL, fcM, grasM, jours, testsVma, coursesVma] = await Promise.all([
    joursWhoop(db, debut, fin),
    sante.nuits(debut, fin).catch(() => null),
    seancesWhoopEntre(db, debut, fin),
    db.getAllAsync<{ debut: number; zones: string }>(`${SQL_SEANCES_FC} AND s.debut >= ? AND s.debut < ? ORDER BY s.debut`, [debut, fin]).catch(() => []),
    db.getAllAsync<{ debut: number; fin: number; sport: string | null }>(`${SQL_SEANCES_SPORT} AND s.debut >= ? AND s.debut < ? ORDER BY s.debut`, [debut, fin]).then((l) => l.filter(deForce)),
    historiqueMesure(db, "fc", debut),
    historiqueMesure(db, "gras", debut),
    Promise.resolve(joursEntre(debut, decaler(minuit(fin), 1))),
    lireTestsVma(db).catch(() => []),
    lireEstimationsCourses(db, debut).catch(() => []),
  ]);
  // Sommeil : Whoop d'abord (sa nuit, sa régularité) ; sinon Santé Connect (durée, et régularité calculée sur ses nuits : SRI),
  // un réveil par jour.
  const nuits = new Map<number, { jour: number; minutes: number | null; regularite: number | null }>();
  const sri = regulariteNuits(nuitsSC ?? []);
  for (const n of nuitsSC ?? []) nuits.set(minuit(n.fin), { jour: minuit(n.fin), minutes: n.minutes, regularite: sri.get(minuit(n.fin)) ?? null });
  let sommeilWhoop = false;
  for (const j of whoop.values()) {
    if (j.sommeil_min == null && j.sommeil_regularite == null) continue;
    sommeilWhoop = true;
    nuits.set(j.jour, { jour: j.jour, minutes: j.sommeil_min, regularite: j.sommeil_regularite });
  }
  const pasChoix = await lirePasJours(db, jours, maintenant).catch(() => []);
  const navy = grasM.length ? null : await grasDesTours(db).catch(() => null);
  const pas = pasChoix.map((c, i) => ({ jour: jours[i]!, pas: valeurPas(c) })).filter((x): x is { jour: number; pas: number } => x.pas != null);
  const pasWhoop = pasChoix.some((c) => c.etat === "valeur" && c.source === "whoop");
  // FC au repos : Whoop, sinon les mesures (Santé Connect) ; une par jour.
  const fc = new Map<number, { date: number; valeur: number }>();
  for (const m of fcM) fc.set(minuit(m.date), { date: m.date, valeur: m.valeur });
  let fcWhoop = false;
  for (const j of whoop.values()) {
    if (j.fc_repos == null) continue;
    fcWhoop = true;
    fc.set(j.jour, { date: j.jour, valeur: j.fc_repos });
  }
  const premierWhoop = [...whoop.keys()].sort((a, b) => a - b)[0] ?? null;
  const seancesFc = seancesFcL.flatMap((x) => {
    try {
      const z = JSON.parse(x.zones) as unknown;
      return Array.isArray(z) && z.length >= 5 ? [{ debut: x.debut, zones: z.map((v) => Number(v) || 0) }] : [];
    } catch {
      return [];
    }
  });
  const premiereFc = await db.getFirstAsync<{ d: number | null }>(`SELECT MIN(debut) AS d FROM (${SQL_SEANCES_FC})`, []).catch(() => null);
  const premiereMuscu = { d: (await db.getAllAsync<{ debut: number; sport: string | null }>(`${SQL_SEANCES_SPORT} ORDER BY s.debut`, [])).find(deForce)?.debut ?? null };
  const h: HistoriqueAge = {
    nuits: [...nuits.values()].sort((a, b) => a.jour - b.jour),
    pas,
    seancesWhoop: seancesW.map((s) => ({ debut: s.debut, zones: s.zones })),
    debutWhoop: premierWhoop,
    seancesFc,
    debutFc: premiereFc?.d ?? null,
    muscu: muscuL.map((s) => ({ debut: s.debut, minutes: Math.max(0, (s.fin - s.debut) / 60_000) })),
    debutMuscu: premiereMuscu?.d ?? null,
    fcRepos: [...fc.values()],
    // masse maigre : la balance ; sans balance, le %gras des tours (US Navy : tour de taille, cou, et hanches pour une
    // femme), que la précision compte déjà (lot 6 : un facteur compté doit être lu)
    maigre: grasM.length
      ? grasM.filter((g) => g.valeur > 0 && g.valeur < 70).map((g) => ({ date: g.date, valeur: 100 - g.valeur }))
      : navy && navy.date >= debut && navy.date <= fin
        ? [{ date: navy.date, valeur: 100 - navy.valeur }]
        : [],
    // VO₂ max (lot 6 de la précision, 30/10 : elle n'était jamais transmise) : celle des tests VMA (3,5 × VMA, demi-Cooper)
    // et des courses GPS estimées, comme la page VO2max ; ni Uth (« à confirmer »), ni Whoop (son API ne la donne pas).
    vo2: [
      ...testsVma.flatMap((x) => {
        const v = vmaDemiCooper(x.distanceM);
        return v != null && x.date >= debut && x.date <= fin ? [{ date: x.date, valeur: vo2maxDeVma(v) }] : [];
      }),
      ...coursesVma.filter((c) => c.date <= fin).map((c) => ({ date: c.date, valeur: vo2maxDeVma(c.vma) })),
    ].sort((a, b) => a.date - b.date),
  };
  return {
    h,
    sources: {
      sommeil: nuits.size ? (sommeilWhoop ? "whoop" : "sante") : null,
      marche: pas.length ? (pasWhoop ? "whoop" : "sante") : null,
      zones: seancesW.length ? "whoop" : seancesFc.length ? "pepfit" : null,
      muscu: muscuL.length ? "pepfit" : null,
      fc: fc.size ? (fcWhoop ? "whoop" : "sante") : null,
      maigre: grasM.length ? "balance" : navy ? "pepfit" : null,
      vo2: testsVma.length || coursesVma.length ? "pepfit" : null,
    },
  };
}

/** Dernières données lues pour « maintenant » (la page Santé les lit pour l'âme) : la page Âge ouverte depuis l'âme s'affiche
 * avec elles tout de suite, le vol n'attend pas la base. */
let derniere: { maintenant: number; d: DonneesAge | null } | null = null;
export function donneesAgeRecentes(maintenant = Date.now(), validite = 10 * 60_000): { maintenant: number; d: DonneesAge | null } | null {
  return derniere && Math.abs(maintenant - derniere.maintenant) <= validite ? derniere : null;
}

/** Page de l'âge pepfit : null sans date de naissance. Pour maintenant : l'âge gardé, recalculé seulement s'il le faut
 * (ageAJour) ; pour une autre date (jour passé de Santé) : calculé. */
export async function lireDonneesAge(db: Executeur, maintenant: number = Date.now()): Promise<DonneesAge | null> {
  const present = Math.abs(Date.now() - maintenant) < 5_000;
  const d = present ? (await ageAJour(db, maintenant)).d : await lireDonneesAgeSansCache(db, maintenant);
  if (present) derniere = { maintenant, d };
  return d;
}

// ---- Âge gardé (31/10 : « l'âge est calculé une fois par semaine ») ----------------------------------------------
// Le calcul relit un an d'historique (2 à 4 s au lancement à froid sur l'émulateur) : son résultat est gardé dans la base,
// dans un réglage local (PREFIXE_CACHE : ni synchronisé, ni sauvegardé, ni exporté), et montré dès le lancement. Il n'est
// refait, en fond, que si une nouvelle semaine commence, ou si son empreinte change : une saisie qui le touche (pesée,
// tour, %gras, profil) ou une synchro qui apporte du neuf sur des semaines déjà comptées. Les données de la semaine en
// cours n'y entrent qu'au lundi suivant.

export const CLE_AGE_GARDE = `${PREFIXE_CACHE}age_pepfit`;

export interface AgeGarde {
  v: 1;
  /** Lundi de la semaine du calcul (minuit local). */
  lundi: number;
  empreinte: string;
  calcule: number;
  d: DonneesAge | null;
}

/** Le dernier âge gardé, null s'il n'y en a pas (ou illisible). */
export async function lireAgeGarde(db: Executeur): Promise<AgeGarde | null> {
  try {
    const g = JSON.parse((await lireReglage(db, CLE_AGE_GARDE)) ?? "null") as AgeGarde | null;
    return g?.v === 1 && typeof g.lundi === "number" && typeof g.empreinte === "string" ? g : null;
  } catch {
    return null;
  }
}

/**
 * Ce que le calcul lit et qui peut changer sans nouvelle semaine : le profil (naissance, sexe), les saisies (pesées, tours
 * et taille, %gras) en entier, et les données des semaines déjà comptées (avant `lundi`) : nuits, FC et pas Whoop, séances
 * Whoop et pepfit (et leurs zones mesurées à la FC), FC au repos et tests VMA. Quelques agrégats en une requête.
 */
export async function empreinteAge(db: Executeur, lundi: number): Promise<string> {
  const r = await db.getFirstAsync<Record<string, number | string | null>>(
    `SELECT
       (SELECT group_concat(cle || '=' || valeur, ';') FROM (SELECT cle, valeur FROM reglages WHERE cle IN ('naissance', 'annee_naissance', 'sexe') ORDER BY cle)) AS profil,
       (SELECT COUNT(*) || ':' || IFNULL(MAX(date), 0) || ':' || IFNULL(SUM(kg), 0) FROM pesee) AS pesees,
       (SELECT COUNT(*) || ':' || IFNULL(MAX(date), 0) || ':' || IFNULL(SUM(valeur), 0) FROM mensurations) AS tours,
       (SELECT COUNT(*) || ':' || IFNULL(MAX(date), 0) || ':' || IFNULL(SUM(valeur), 0) FROM mesure_corps WHERE type = 'gras') AS gras,
       (SELECT COUNT(*) || ':' || IFNULL(SUM(valeur), 0) FROM mesure_corps WHERE type IN ('fc', ?, ?) AND date < ?) AS mesures,
       (SELECT COUNT(*) || ':' || IFNULL(SUM(sommeil_min), 0) || ':' || IFNULL(SUM(sommeil_regularite), 0) || ':' || IFNULL(SUM(fc_repos), 0) || ':' || IFNULL(SUM(pas), 0)
          FROM whoop_jour WHERE jour < ?) AS whoop,
       (SELECT COUNT(*) || ':' || IFNULL(SUM(fin - debut), 0) || ':' || IFNULL(SUM(length(zones)), 0) FROM whoop_seance WHERE debut < ?) AS seancesWhoop,
       (SELECT COUNT(*) || ':' || IFNULL(SUM(fin - debut), 0) FROM seances WHERE fin IS NOT NULL AND debut < ?) AS seances,
       (SELECT COUNT(*) || ':' || IFNULL(SUM(length(zones)), 0) FROM (${SQL_SEANCES_FC} AND s.debut < ?)) AS seancesFc`,
    [TYPE_TEST_VMA, TYPE_VMA_COURSE, lundi, lundi, lundi, lundi, lundi],
  );
  return r ? Object.values(r).map((x) => String(x ?? "")).join("|") : "";
}

let enCours: Promise<{ d: DonneesAge | null; recalcule: boolean }> | null = null;

/**
 * L'âge de maintenant : le gardé s'il vaut encore (même semaine, même empreinte), sinon recalculé et gardé. Deux appels en
 * même temps (Santé, Accueil) partagent le même passage. `garde` : déjà lu par l'appelant.
 */
export function ageAJour(db: Executeur, maintenant: number = Date.now(), garde?: AgeGarde | null): Promise<{ d: DonneesAge | null; recalcule: boolean }> {
  enCours ??= (async () => {
    const lundi = lundiDe(maintenant);
    const [g, empreinte] = await Promise.all([garde !== undefined ? garde : lireAgeGarde(db), empreinteAge(db, lundi)]);
    if (g && g.lundi === lundi && g.empreinte === empreinte) return { d: g.d, recalcule: false };
    const d = await lireDonneesAgeSansCache(db, maintenant);
    const nouveau: AgeGarde = { v: 1, lundi, empreinte, calcule: maintenant, d };
    await ecrireReglage(db, CLE_AGE_GARDE, JSON.stringify(nouveau));
    return { d, recalcule: true };
  })().finally(() => {
    enCours = null;
  });
  return enCours;
}

/**
 * Lancement de Santé, de l'Accueil ou de la page Âge : le dernier âge gardé tout de suite ; s'il fallait le refaire, le
 * recalcul tourne en fond et `ensuite` reçoit le nouveau. Sans âge gardé (premier lancement) : le calcul est attendu.
 */
export async function lireAgeVite(db: Executeur, ensuite: (d: DonneesAge | null) => void, maintenant: number = Date.now()): Promise<DonneesAge | null> {
  const g = await lireAgeGarde(db);
  const maj = ageAJour(db, maintenant, g).then((r) => {
    derniere = { maintenant: Date.now(), d: r.d };
    return r;
  });
  if (!g) return (await maj).d;
  derniere = { maintenant: Date.now(), d: g.d };
  maj.then((r) => r.recalcule && ensuite(r.d)).catch((e: unknown) => console.error(e));
  return g.d;
}

async function lireDonneesAgeSansCache(db: Executeur, maintenant: number): Promise<DonneesAge | null> {
  const naissance = await lireNaissance(db);
  if (!naissance) return null;
  const [{ h, sources }, morpho, connecte, journal] = await Promise.all([lireHistorique(db, maintenant), lireMorphologie(db), lireReglage(db, "whoop_connecte"), journalWhoopGarde(db).catch(() => false)]);
  // le rythme compare lui-même les facteurs communs aux deux dates (semaines brutes) ; la courbe et l'évolution suivent les
  // facteurs d'aujourd'hui (D1 du 29/10 : pas de saut quand une source arrive)
  const brutes = semaines(h, maintenant, naissance.date, morpho.sexe);
  const rythmes = brutes.map((_, i) => rythme(brutes, i));
  const l = semainesComparables(brutes);
  return {
    naissance: naissance.date,
    sexe: morpho.sexe,
    semaines: l,
    courante: l[l.length - 1]!,
    rythme: rythmes[rythmes.length - 1] ?? null,
    rythmes,
    sources,
    // relié, ou déconnecté avec son journal gardé : ses mesures servent encore
    whoopUtilise: connecte === "1" || journal,
  };
}

/** Page en attente (age-attente.ts) : le recul des zones (premier jour Whoop, première séance mesurée à la FC) et des séances
 * pepfit, que la précision ne lit pas ; mêmes sources que lireHistorique. Trois requêtes. */
export async function lireReculAge(db: Executeur, maintenant: number = Date.now()): Promise<ReculAge> {
  const [w, s, fc] = await Promise.all([
    db.getFirstAsync<{ d: number | null }>("SELECT MIN(jour) AS d FROM whoop_jour", []),
    db.getAllAsync<{ debut: number; sport: string | null }>(`${SQL_SEANCES_SPORT} ORDER BY s.debut`, []).then((l) => {
      const force = l.filter(deForce);
      return { d: force[0]?.debut ?? null, n: force.filter((x) => x.debut >= maintenant - FENETRE_JOURS * 86_400_000).length };
    }),
    db.getFirstAsync<{ d: number | null }>(`SELECT MIN(debut) AS d FROM (${SQL_SEANCES_FC})`, []).catch(() => null),
  ]);
  return { debutWhoop: w?.d ?? null, debutFc: fc?.d ?? null, debutMuscu: s?.d ?? null, seancesMuscu: s?.n ?? 0 };
}

export interface ResumeAge {
  /** Âge pepfit de la semaine, null s'il manque des facteurs (moins de 3 avec donnée). */
  age: number | null;
  ageReel: number;
  /** Âge pepfit − âge réel (négatif : plus jeune). */
  ecart: number;
  groupes: Record<GroupeAge, number>;
  /** Âge pepfit des 30 semaines (null : pas de point). */
  serie: (number | null)[];
  /** Évolution sur les 30 semaines (premier point valide → dernier), null sans deux points. */
  evolution: number | null;
  meilleur: string | null;
  /** Rythme de vieillissement (null : pas encore 26 semaines comparables) et dernière FC de repos (bpm, null : inconnue) :
   * la vitesse et le battement de l'âme de la page Santé. */
  rythme: number | null;
  fc: number | null;
}

/** Résumé pour les cartes (Accueil, page Santé) ; null sans date de naissance. */
export async function lireResumeAge(db: Executeur, maintenant: number = Date.now()): Promise<ResumeAge | null> {
  return resumeAge(await lireDonneesAge(db, maintenant));
}

/** Le résumé des cartes, tiré des données de la page. */
export function resumeAge(d: DonneesAge | null): ResumeAge | null {
  if (!d) return null;
  const c = d.courante;
  const serie = d.semaines.map((s) => s.age);
  const premier = serie.find((x) => x != null);
  return {
    age: c.age,
    ageReel: c.ageReel,
    ecart: c.ecart,
    groupes: Object.fromEntries(GROUPES.map((g) => [g, c.groupes[g]])) as Record<GroupeAge, number>,
    serie,
    evolution: c.age != null && premier != null && serie.filter((x) => x != null).length > 1 ? c.age - premier : null,
    meilleur: extremes(c.facteurs).meilleur?.id ?? null,
    rythme: d.rythme,
    fc: ((f) => f?.v30 ?? f?.v6 ?? null)(c.facteurs.find((f) => f.id === "fcRepos")),
  };
}
