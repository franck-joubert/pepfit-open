// Données du bilan d'énergie de plusieurs jours, lues en lot (audit de performance, M2 ; docs/PERF-B.md). Le recalage d'un jour
// calcule la formule des 28 jours d'avant : jour par jour, c'était une vingtaine de requêtes et 4 à 6 lectures Santé Connect
// par jour (5 000 requêtes et 870 lectures à la première visite de Sport). Ici, la base est lue une fois pour toute la plage
// (une requête par source), et Santé Connect une fois par source (séances, pas par heure, distance par jour). Les lectures
// Santé Connect d'un jour fini depuis 48 h sont gardées en base (réglage local « cache_sc_jour:<minuit> », ni synchronisé, ni
// sauvegardé, ni exporté) : une montre a fini de se synchroniser, le jour ne bouge plus. Le calcul, lui, reste celui de
// sante-donnees.ts, jour par jour, sur ces données : la base est toujours relue, seul Santé Connect est gardé.
import type { Executeur } from "../db/executeur";
import { consommationsEntre, type Consommation } from "../db/depots/nutrition";
import { mesuresJusqua, type MesureCorps } from "../db/depots/mesures";
import { JOURS_PESEE_CALCUL, peseeAvantDans } from "../db/depots/pesees";
import { lireAnneeNaissance, lireDateNaissance, lireMorphologie, type DateNaissance } from "../db/depots/profil";
import { lireReglage, PREFIXE_CACHE } from "../db/depots/reglages";
import { lireActivites, type ActiviteLue } from "../db/depots/activites";
import type { Pesee } from "../db/types";
import { t } from "../i18n/index";
import { sante as santeConnect, type PermissionSante, type Sante, type SeanceSport } from "../natif/sante/index";
import { REGLAGE } from "../whoop/constantes";
import { pasWhoopJours } from "../whoop/lecture";
import { pasWithingsJours, withingsConnecte } from "../withings/lecture";
import { PERMISSION_PAS } from "./journee-donnees";
import { choisirPas, pasWhoopDuJour, type ChoixPas, type SantePas } from "./pas-source";
import { decaler } from "./energie-precision";
import { BORNES_FC_SANTE, lireFcMinutes, PREFIXE_FC_MINUTES } from "./kcal-fc";
import { ressentiDeSeance } from "./effort-pepfit";
import { activite, estTypeRecup, type TypeRecup } from "./recuperer";
import { CLE_CALIBRATION_KCAL, facteursDepuisReglage } from "./calibration";
import type { FacteursKcal } from "./kcal-seance";
import type { MotEffort } from "../boutique/poids";

const JOUR = 86_400_000;
/** Un jour fini depuis 48 h : ses lectures Santé Connect sont gardées en base. */
export const STABLE_MS = 48 * 3_600_000;
export const PREFIXE_CACHE_SC = `${PREFIXE_CACHE}sc_jour:`;
/** Forme des lectures gardées : un changement la fait relire. */
const VERSION_CACHE = 1;

/** Lectures Santé Connect d'un jour : séances commencées ce jour-là, pas, distance, et pas et distance de plages (séances). */
interface LuSante {
  sports: SeanceSport[] | null;
  nbPas: number | null;
  dist: number | null;
  plages: Record<string, { nbPas?: number | null; dist?: number | null }>;
}

export interface SeancePepfit {
  id: string;
  debut: number;
  fin: number;
  nom: string;
  /** FC minute par minute gardée par effort-charges.ts (kcal-fc.ts) ; null : pas encore gardée, ou sans FC. */
  fc: number[] | null;
  /** FC moyenne de la séance Whoop rattachée (la plus longue). */
  fcMoy: number | null;
  /** Ressenti des séries de travail. */
  ressenti: MotEffort | null;
  sportId: string | null;
  pasWhoop: number | null;
}

/** Séance Whoop de la plage : sa FC moyenne sert à une séance Santé Connect qu'elle recouvre ; sans séance pepfit, une
 * marche de tous les jours (ignorée). */
export interface WhoopPlage {
  debut: number;
  fin: number;
  fcMoy: number | null;
  seanceId: string | null;
}

export interface LotEnergie {
  db: Executeur;
  s: Sante;
  maintenant: number;
  /** Premier et dernier jour (minuits) dont la base est lue. */
  debut: number;
  fin: number;
  sexe: "h" | "f" | null;
  tailleCm: number | null;
  naissance: { date: DateNaissance | null; annee: number | null };
  /** Mesures jusqu'à la fin du lot, de la plus récente à la plus ancienne. */
  mesures: Record<"bmr" | "maigre" | "gras" | "fc" | "fc_max", MesureCorps[]>;
  /** Pesées de la plage (et l'année d'avant), par date croissante ; la toute première. */
  pesees: Pesee[];
  premierePesee: Pesee | null;
  pepfit: SeancePepfit[];
  /** Facteurs personnels des kcal à la FC (calibration.ts), null : aucun actif. */
  calibration: FacteursKcal | null;
  whoopSansSeance: WhoopPlage[];
  whoop: WhoopPlage[];
  consommations: Map<string, Consommation[]>;
  activites: ActiviteLue[];
  whoopPas: Map<number, number>;
  withingsActif: boolean;
  withingsPas: Map<number, number>;
  autorisees: PermissionSante[];
  sc: Map<number, LuSante>;
  /** Jours dont une lecture Santé Connect a échoué : jamais gardés. */
  echecs: Set<number>;
  /** Jours finis lus ou complétés : à garder en base. */
  aGarder: Set<number>;
  /** FC minute par minute gardée des séances des autres applis, par clé (kcal-fc.ts, cleFcSante) : leurs kcal à la FC (C11). */
  fcSante?: Map<string, number[] | null>;
}

const cleJour = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dans = (x: { debut: number }, jour: number) => x.debut >= jour && x.debut < jour + JOUR;
const stable = (lot: LotEnergie, jour: number) => decaler(jour, 1) + STABLE_MS <= lot.maintenant;
const clePlage = (debut: number, fin: number) => `${debut}-${fin}`;
const joursEntre = (debut: number, fin: number) => {
  const l: number[] = [];
  for (let j = debut; j <= fin; j = decaler(j, 1)) l.push(j);
  return l;
};

/** Séances pepfit, Hevy et Whoop terminées de [debut, fin), avec ce que lit leur calcul de kcal (kcal-seance.ts) : la FC
 * minute par minute gardée, la FC moyenne de la séance Whoop rattachée (la plus longue), le ressenti et le sport. Une seule
 * requête : jamais les kcal de Whoop (décision du 31/10). */
export async function seancesPepfit(db: Executeur, debut: number, fin: number): Promise<SeancePepfit[]> {
  const l = await db.getAllAsync<{
    id: string; debut: number; fin: number; nom: string | null; fc_min: string | null; fc_moy: number | null; rpes: string | null; sport: string | null; pas_whoop: number | null;
  }>(
    `SELECT s.id, s.debut, s.fin, COALESCE(s.titre, r.nom) AS nom,
       (SELECT g.valeur FROM reglages g WHERE g.cle = '${PREFIXE_FC_MINUTES}' || s.id) AS fc_min,
       (SELECT w.fc_moy FROM whoop_seance w WHERE w.seance_id = s.id AND w.fc_moy IS NOT NULL ORDER BY w.fin - w.debut DESC LIMIT 1) AS fc_moy,
       (SELECT GROUP_CONCAT(x.rpe) FROM series x WHERE x.seance_id = s.id AND x.faite = 1 AND x.type != 'echauffement' AND x.rpe IS NOT NULL) AS rpes,
       (SELECT d.pas FROM whoop_seance w JOIN whoop_seance_detail d ON d.whoop_id = w.id WHERE w.seance_id = s.id AND d.pas IS NOT NULL
         ORDER BY w.fin - w.debut DESC LIMIT 1) AS pas_whoop,
       COALESCE(s.activite_id, (SELECT se.exercice_id FROM seance_exercices se JOIN exercices e ON e.id = se.exercice_id
         WHERE se.seance_id = s.id AND (e.whoop_ids IS NOT NULL OR e.id = 'cat:musculation') ORDER BY se.position LIMIT 1)) AS sport
     FROM seances s LEFT JOIN routines r ON r.id = s.routine_id WHERE s.fin IS NOT NULL AND s.debut >= ? AND s.debut < ? ORDER BY s.debut`,
    [debut, fin],
  );
  // Récupérer (planche recuperer, D2) : le sauna et le bain froid gardent leurs kcal aux MET (famille thermique), comptées
  // dans la dépense du jour sous le nom « Récupération · Sauna » ; les autres activités de récupération n'en ont pas
  const recup = await db
    .getAllAsync<{ id: string; type: string; debut: number; fin: number }>(
      "SELECT id, type, debut, fin FROM recup_activite WHERE supprime = 0 AND type IN ('sauna', 'bain-froid') AND debut >= ? AND debut < ?",
      [debut, fin],
    )
    .catch(() => []);
  const deRecup: SeancePepfit[] = recup.filter((x) => estTypeRecup(x.type)).map((x) => ({
    id: `recup:${x.id}`,
    debut: x.debut,
    fin: x.fin,
    nom: t("recuperer.energie", { nom: t(`recuperer.type.${x.type as TypeRecup}` as "recuperer.type.sauna") }),
    fc: null,
    fcMoy: null,
    ressenti: null,
    sportId: activite(x.type as TypeRecup).sportKcal,
    pasWhoop: null,
  }));
  // le sport donne ses MET à une séance sans FC (planche activite-detectee : la dépense suit le sport)
  return [...l.map((x) => ({
    id: x.id,
    debut: x.debut,
    fin: x.fin,
    nom: x.nom ?? t("sante.musculation"),
    fc: lireFcMinutes(x.fc_min),
    fcMoy: x.fc_moy,
    ressenti: x.rpes ? ressentiDeSeance(x.rpes.split(",").map(Number)) : null,
    sportId: x.sport,
    pasWhoop: x.pas_whoop,
  })), ...deRecup].sort((a, b) => a.debut - b.debut);
}

/** Lit la base pour les jours de `debut` à `fin` (minuits, compris) : une requête par source. */
export async function chargerLot(db: Executeur, debut: number, fin: number, maintenant: number, s: Sante = santeConnect): Promise<LotEnergie> {
  const apres = decaler(fin, 1);
  const [morpho, date, mesBmr, mesMaigre, mesGras, mesFc, mesFcMax, pesees, premiere, pepfit, whoopLu, consommations, activites, whoop, autorisees, cal, fcSante, withingsActif] = await Promise.all([
    lireMorphologie(db),
    lireDateNaissance(db),
    mesuresJusqua(db, "bmr", apres),
    mesuresJusqua(db, "maigre", apres),
    mesuresJusqua(db, "gras", apres),
    // FC au repos et FC max : le domaine de Keytel pour les kcal des séances (kcal-seance.ts)
    mesuresJusqua(db, "fc", apres),
    mesuresJusqua(db, "fc_max", apres),
    db.getAllAsync<Pesee>("SELECT id, date, kg, source, origine FROM pesee WHERE date >= ? AND date <= ? ORDER BY date", [debut - (JOURS_PESEE_CALCUL + 1) * JOUR, apres]),
    db.getFirstAsync<Pesee>("SELECT id, date, kg, source, origine FROM pesee ORDER BY date LIMIT 1", []),
    seancesPepfit(db, debut, apres),
    db.getAllAsync<{ debut: number; fin: number; fc_moy: number | null; seance_id: string | null }>(
      "SELECT debut, fin, fc_moy, seance_id FROM whoop_seance WHERE debut >= ? AND debut < ?",
      [debut, apres],
    ),
    consommationsEntre(db, cleJour(debut), cleJour(fin)),
    lireActivites(db, debut, apres).catch(() => []),
    pasWhoopJours(db, joursEntre(debut, fin)),
    s.autorisees().catch((): PermissionSante[] => []),
    lireReglage(db, CLE_CALIBRATION_KCAL).catch(() => null),
    db.getAllAsync<{ cle: string; valeur: string }>("SELECT cle, valeur FROM reglages WHERE cle >= ? AND cle < ?", [...BORNES_FC_SANTE]).catch(() => []),
    withingsConnecte(db),
  ]);
  const withingsPas = withingsActif ? await pasWithingsJours(db, joursEntre(debut, fin)) : new Map<number, number>();
  const whoopPlages: WhoopPlage[] = whoopLu.map((w) => ({ debut: w.debut, fin: w.fin, fcMoy: w.fc_moy, seanceId: w.seance_id }));
  return {
    db, s, maintenant, debut, fin,
    sexe: morpho.sexe,
    tailleCm: morpho.tailleCm,
    naissance: { date, annee: date ? null : await lireAnneeNaissance(db) },
    mesures: { bmr: mesBmr, maigre: mesMaigre, gras: mesGras, fc: mesFc, fc_max: mesFcMax },
    pesees,
    premierePesee: premiere,
    pepfit,
    calibration: facteursDepuisReglage(cal),
    whoopSansSeance: whoopPlages.filter((w) => w.seanceId == null),
    whoop: whoopPlages,
    consommations,
    activites,
    whoopPas: whoop,
    withingsActif,
    withingsPas,
    autorisees,
    sc: new Map(),
    echecs: new Set(),
    aGarder: new Set(),
    fcSante: new Map(fcSante.map((x) => [x.cle.slice(PREFIXE_FC_MINUTES.length), lireFcMinutes(x.valeur)])),
  };
}

// ---- Ce que lit le calcul d'un jour (sante-donnees.ts, calculerJour) ----------------------------------------------------

/** Dernière mesure d'une liste (de la plus récente à la plus ancienne) à la date `t`, comme derniereMesure. */
export const derniereDans = (l: readonly MesureCorps[], t: number): MesureCorps | null => l.find((m) => m.date <= t) ?? null;

export const peseeDuLot = (lot: LotEnergie, t: number) => peseeAvantDans(lot.pesees, lot.premierePesee, t, JOURS_PESEE_CALCUL);

export const pepfitDuJour = (lot: LotEnergie, jour: number) => lot.pepfit.filter((x) => dans(x, jour));
export const whoopSansSeanceDuJour = (lot: LotEnergie, jour: number) => lot.whoopSansSeance.filter((x) => dans(x, jour));
export const whoopDuJour = (lot: LotEnergie, jour: number) => lot.whoop.filter((x) => dans(x, jour));
export const activitesDuJour = (lot: LotEnergie, jour: number) => lot.activites.filter((x) => dans(x, jour));
export const consommationsDuJourLot = (lot: LotEnergie, jour: number) => lot.consommations.get(cleJour(jour)) ?? [];

/** Jours tenus du journal entre deux minuits (compris), kcal de chacun (dans la plage du lot). */
export function apportsDuLot(lot: LotEnergie, debut: number, fin: number): { jour: number; kcal: number }[] {
  const l: { jour: number; kcal: number }[] = [];
  for (let j = debut; j <= fin; j = decaler(j, 1)) {
    const kcal = consommationsDuJourLot(lot, j).reduce((a, c) => a + c.macros.kcal, 0);
    if (kcal > 0) l.push({ jour: j, kcal });
  }
  return l;
}

export const sportsDuJour = (lot: LotEnergie, jour: number): SeanceSport[] | null => lot.sc.get(jour)?.sports ?? null;

/** Choix des pas d'un jour (même règle que lirePasJour : Whoop, Withings, Santé Connect). */
export function choixPasDuJour(lot: LotEnergie, jour: number): ChoixPas {
  const w = pasWhoopDuJour(lot.whoopPas.get(jour), jour, lot.maintenant);
  const santeAutorise = lot.autorisees.includes(PERMISSION_PAS);
  return choisirPas({
    whoopActif: w != null, whoop: w, withingsActif: lot.withingsActif, withings: lot.withingsPas.get(jour) ?? null,
    santeAutorise, sante: santeAutorise && w == null ? (lot.sc.get(jour)?.nbPas ?? null) : null,
  });
}

export const distanceDuJour = (lot: LotEnergie, jour: number): number | null => lot.sc.get(jour)?.dist ?? null;

/** Pas ou distance d'une plage (séance) du jour : gardés en base pour un jour fini, sinon lus (puis gardés). */
async function plage(lot: LotEnergie, jour: number, debut: number, fin: number, quoi: "nbPas" | "dist"): Promise<number | null> {
  const lu = lot.sc.get(jour) ?? { sports: null, nbPas: null, dist: null, plages: {} };
  lot.sc.set(jour, lu);
  const k = clePlage(debut, fin);
  const connu = lu.plages[k]?.[quoi];
  if (connu !== undefined) return connu;
  let v: number | null;
  try {
    v = quoi === "nbPas" ? await lot.s.pasEntre(debut, fin) : await lot.s.distanceEntre(debut, fin);
  } catch {
    lot.echecs.add(jour);
    return null;
  }
  lu.plages[k] = { ...lu.plages[k], [quoi]: v };
  if (stable(lot, jour)) lot.aGarder.add(jour);
  return v;
}

export const distancePlage = (lot: LotEnergie, jour: number, debut: number, fin: number) => plage(lot, jour, debut, fin, "dist");

/** Pour pasDesSeances : les autorisations du lot, et les pas des plages par le lot. */
export const santePasDuJour = (lot: LotEnergie, jour: number): SantePas => ({
  autorisees: async () => lot.autorisees,
  pasEntre: (debut, fin) => plage(lot, jour, debut, fin, "nbPas"),
});

// ---- Santé Connect : gardé en base pour les jours finis, sinon lu d'un coup ------------------------------------------------

const permissions = (lot: LotEnergie) => [...lot.autorisees].sort().join(",");

/**
 * Lectures Santé Connect des jours donnés (dans le lot) : celles gardées en base pour les jours finis, puis, pour les autres,
 * une lecture par source sur leur plage (séances, pas par heure, distance de chaque jour).
 */
export async function prechargerSante(lot: LotEnergie, jours: Iterable<number>): Promise<void> {
  const voulus = [...new Set(jours)].filter((j) => !lot.sc.has(j)).sort((a, b) => a - b);
  if (!voulus.length) return;
  const finis = voulus.filter((j) => stable(lot, j));
  if (finis.length) {
    const perm = permissions(lot);
    const l = await lot.db
      .getAllAsync<{ cle: string; valeur: string }>("SELECT cle, valeur FROM reglages WHERE cle >= ? AND cle <= ?", [
        `${PREFIXE_CACHE_SC}${finis[0]}`,
        `${PREFIXE_CACHE_SC}${finis[finis.length - 1]}`,
      ])
      .catch(() => []);
    const voulu = new Set(finis);
    for (const x of l) {
      const jour = Number(x.cle.slice(PREFIXE_CACHE_SC.length));
      if (!voulu.has(jour)) continue;
      try {
        const v = JSON.parse(x.valeur) as LuSante & { v: number; perm: string };
        if (v.v !== VERSION_CACHE || v.perm !== perm) continue;
        lot.sc.set(jour, { sports: v.sports, nbPas: v.nbPas, dist: v.dist, plages: v.plages ?? {} });
      } catch {
        // illisible : relu
      }
    }
  }
  // jours à venir : Santé Connect n'a rien
  const aLire = voulus.filter((j) => !lot.sc.has(j) && j < lot.maintenant);
  for (const j of voulus) if (!lot.sc.has(j) && j >= lot.maintenant) lot.sc.set(j, { sports: [], nbPas: null, dist: null, plages: {} });
  if (!aLire.length) return;
  const de = aLire[0]!;
  const a = aLire[aLire.length - 1]!;
  // bornes : chaque minuit de la plage, puis la fin du dernier jour (maintenant pour aujourd'hui)
  const bornes: number[] = [];
  for (let j = de; j <= a; j = decaler(j, 1)) bornes.push(j);
  bornes.push(Math.min(decaler(a, 1), lot.maintenant));
  const ok = new Set(lot.autorisees);
  const lire = <T>(p: Promise<T>) => p.then((v) => ({ v, ok: true }), () => ({ v: null, ok: false }));
  const [sports, nbPas, dist] = await Promise.all([
    lire(lot.s.seancesSport(de, decaler(a, 1))),
    ok.has(PERMISSION_PAS) ? lire(lot.s.pasIntervalles(bornes)) : Promise.resolve({ v: null, ok: true }),
    ok.has("distance") ? lire(lot.s.distanceIntervalles(bornes)) : Promise.resolve({ v: null, ok: true }),
  ]);
  const echec = !sports.ok || !nbPas.ok || !dist.ok;
  for (const jour of aLire) {
    const i = bornes.indexOf(jour);
    lot.sc.set(jour, {
      sports: sports.v ? sports.v.filter((x) => dans(x, jour)) : null,
      nbPas: nbPas.v?.[i] ?? null,
      dist: dist.v?.[i] ?? null,
      plages: {},
    });
    if (echec) lot.echecs.add(jour);
    else if (stable(lot, jour)) lot.aGarder.add(jour);
  }
}

/** Garde en base les lectures des jours finis (une écriture) ; une erreur ne gêne jamais l'affichage. */
export async function garderLot(lot: LotEnergie): Promise<void> {
  const jours = [...lot.aGarder].filter((j) => !lot.echecs.has(j) && lot.sc.has(j));
  lot.aGarder.clear();
  if (!jours.length) return;
  const perm = permissions(lot);
  const valeurs = jours.flatMap((j) => [`${PREFIXE_CACHE_SC}${j}`, JSON.stringify({ v: VERSION_CACHE, perm, ...lot.sc.get(j)! })]);
  await lot.db
    .runAsync(
      `INSERT INTO reglages (cle, valeur) VALUES ${jours.map(() => "(?, ?)").join(", ")} ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`,
      valeurs,
    )
    .catch((e: unknown) => console.warn("[energie] cache", e));
}
