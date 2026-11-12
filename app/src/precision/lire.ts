// Lecture de la précision pepfit : ce que la base et les capteurs savent de toi, compté par comptage.ts, puis le modèle
// (modele.ts). Tout se calcule sur le téléphone ; rien n'est envoyé au serveur. Une source qui échoue compte pour rien,
// jamais pour une erreur (la carte du volet s'affiche quand même).
import type { Executeur } from "../db/executeur";
import { historiqueMesure } from "../db/depots/mesures";
import { listerPesees } from "../db/depots/pesees";
import { historiqueMensuration, lireSexe, tailleProfil, type TypeMensuration } from "../db/depots/profil";
import { lireReglage } from "../db/depots/reglages";
import { lireEstimationsCourses, lireTestsVma } from "../db/depots/vma";
import { lireZonesFc } from "../db/depots/zones-fc";
import { lireActivites } from "../db/depots/activites";
import { kcalParJour } from "../db/depots/nutrition";
import { cleJour } from "../nutrition/calculs";
import { sante } from "../natif/sante/index";
import { REGLAGE as REGLAGE_WHOOP } from "../whoop/constantes";
import { ORIGINE_POLAR, REGLAGE as REGLAGE_POLAR, SOURCE_POLAR } from "../polar/constantes";
import { lireDernierMatinRecup } from "../ecrans/recup-donnees";
import { joursWhoop } from "../whoop/lecture";
import { lireNaissance } from "../ecrans/mesures/age-donnees";
import { lireObjectifPoids } from "../ecrans/mesures/corps-donnees";
import { JOURS_TEST, vmaRetenue } from "../ecrans/mesures/vma-calc";
import { lirePasJours, valeurPas } from "../ecrans/pas-source";
import { bmrA, jourEnergie } from "../ecrans/sante-donnees";
import { COURSE, SQL_SPORT } from "../ecrans/changer-activite";
import type { SourceFcMax as SourceFcMaxZones } from "../ecrans/zones-fc";
import { BORNES, fenetre28, grasNavy, JOUR, jourRepasTenu, jours, joursEntre, minuit, peseesRetenues, plausible, semainesAvec } from "./comptage";
import { CLE_MEMOIRE, lireMemoire } from "./memoire";
import { avecSigmaReel, type DonneesPrecision, type PartiePrecision, type SourceFcMax, type SourceVma } from "./modele";

/** Ce que la page dit de chaque calcul (« FC max mesurée », « Test VMA du 2 sept. ») et qui n'entre pas dans le score. */
export interface FaitsPrecision {
  whoop: boolean;
  /** Date du test VMA retenu, du dernier relevé de pesée. */
  vmaDate: number | null;
  /** La dépense d'aujourd'hui est recalée sur le poids (energie-precision.ts). */
  recalee: boolean;
  /** Masse grasse de la balance ou saisie, ou estimée par les tours. */
  grasNavy: number | null;
  /** Sexe pour les calculs : femme (la méthode US Navy demande aussi les hanches). */
  femme: boolean;
}

const ORIGINE_WHOOP = "com.whoop.android";
const sur = <T>(p: Promise<T>, defaut: T): Promise<T> => p.catch(() => defaut);

const FC_MAX: Record<SourceFcMaxZones, SourceFcMax> = { mesuree: "mesuree", saisie: "saisie", estimee: "age", defaut: "defaut" };

/** Tours les plus récents (cm) et l'ancienneté de la plus vieille des mesures utilisées. */
async function dernierTour(db: Executeur, type: TypeMensuration): Promise<{ valeur: number; date: number } | null> {
  const l = await historiqueMensuration(db, type);
  return l.length ? l.reduce((a, m) => (m.date > a.date ? m : a)) : null;
}

export async function lireDonneesPrecision(
  db: Executeur,
  parties: Partial<Record<PartiePrecision, boolean>>,
  maintenant = Date.now(),
): Promise<{ d: DonneesPrecision; faits: FaitsPrecision }> {
  const aujourdhui = minuit(maintenant);
  const debut28 = aujourdhui - 27 * JOUR;
  const debut56 = maintenant - 56 * JOUR;
  const [naissance, sexe, taille, pesees, tour, cou, hanches, grasL, whoop, autorisees, zones, tests, polarConnecte] = await Promise.all([
    sur(lireNaissance(db), null),
    sur(lireSexe(db), null),
    sur(tailleProfil(db, maintenant), null),
    sur(listerPesees(db), []),
    sur(dernierTour(db, "tour_taille"), null),
    sur(dernierTour(db, "cou"), null),
    sur(dernierTour(db, "hanches"), null),
    sur(historiqueMesure(db, "gras"), []),
    sur(
      lireReglage(db, REGLAGE_WHOOP.connecte).then((c) => ({ connecte: c === "1" })),
      null,
    ),
    sur(sante.autorisees(), []),
    sur(lireZonesFc(db, maintenant), null),
    sur(lireTestsVma(db), []),
    sur(lireReglage(db, REGLAGE_POLAR.connecte).then((c) => c === "1"), false),
  ]);

  // Poids : pesées plausibles, une par jour, sans l'isolée qui s'écarte de 5 % de sa semaine
  const p = peseesRetenues(pesees.filter((x) => x.date <= maintenant));
  const derniere = p[p.length - 1] ?? null;

  // %gras : la balance ou la saisie (la plus récente plausible), sinon l'estimation par les tours (US Navy)
  const gras = grasL.filter((g) => g.date <= maintenant && plausible(g.valeur, BORNES.gras)).sort((a, b) => b.date - a.date)[0] ?? null;
  const tailleCm = taille && plausible(taille.valeur, BORNES.cm) ? taille.valeur : null;
  const navy = grasNavy({ sexe, tailleCm, tourTaille: tour?.valeur ?? null, cou: cou?.valeur ?? null, hanches: hanches?.valeur ?? null });
  const navyDate = navy == null ? null : Math.min(tour!.date, cou!.date, ...(sexe === "f" && hanches ? [hanches.date] : []));

  // Nuits avec une montre (FC de repos ou sommeil), sur 28 jours : Whoop, Santé Connect, mesures de FC au repos
  const [jw, nuitsSC, fcRepos] = await Promise.all([
    sur(joursWhoop(db, debut28, maintenant), new Map()),
    autorisees.includes("sommeil") ? sur(sante.nuits(debut28, maintenant), null) : Promise.resolve(null),
    sur(historiqueMesure(db, "fc", debut28), []),
  ]);
  const nuitsWhoop = [...jw.values()].filter((j) => j.fc_repos != null || j.sommeil_min != null).map((j) => j.jour);
  const nuits = [...nuitsWhoop, ...(nuitsSC ?? []).map((n) => n.fin), ...fcRepos.filter((m) => plausible(m.valeur, BORNES.fcRepos)).map((m) => m.date)];
  const fn = fenetre28(nuits, maintenant);
  const fs = fenetre28((nuitsSC ?? []).map((n) => n.fin), maintenant);
  const whoopConnecte = !!whoop?.connecte;
  const nuitsSante = (nuitsSC ?? []).some((n) => n.origine !== ORIGINE_WHOOP) || fcRepos.some((m) => m.source !== "whoop");
  // Polar en direct (docs/POLAR.md) : connecté, ou ses nuits et ses mesures de nuit sont là
  const polar = polarConnecte || (nuitsSC ?? []).some((n) => n.origine === ORIGINE_POLAR) || fcRepos.some((m) => m.source === SOURCE_POLAR);
  const capteur = whoopConnecte || nuitsWhoop.length ? "whoop" : polar ? "polar" : nuitsSante ? "sc" : null;

  // Pas mesurés, sur 28 jours
  const jours28 = Array.from({ length: 28 }, (_, i) => aujourdhui - (27 - i) * JOUR);
  const pasL = await sur(lirePasJours(db, jours28, maintenant), []);
  const joursPas = pasL.flatMap((c, i) => (c.etat === "valeur" && (valeurPas(c) ?? 0) > 0 ? [jours28[i]!] : []));
  const fp = fenetre28(joursPas, maintenant);
  const pasAutorises = autorisees.includes("pas");

  // Séances : terminées sur 8 semaines, muscu, avec FC (≥ 2 min) sur 28 jours, toutes sources (capteur, Whoop, Santé Connect :
  // seance_charge.avec_fc), semaines actives (et activités de 20 min)
  const [seances, fcPepfit, fcCharge, fcWhoop, activites, choix, courses, coursesFc] = await Promise.all([
    sur(
      db.getAllAsync<{ id: string; debut: number; muscu: number }>(
        `SELECT s.id, s.debut, EXISTS (SELECT 1 FROM seance_exercices se JOIN exercices e ON e.id = se.exercice_id WHERE se.seance_id = s.id AND NOT ${SQL_SPORT}) AS muscu
         FROM seances s WHERE s.fin IS NOT NULL AND s.debut >= ? AND s.debut <= ?`,
        [debut56, maintenant],
      ),
      [],
    ),
    // séances commencées au plus un jour avant la fenêtre : la clé (seance_id, t) sert, plus de parcours de toute la FC
    sur(
      db.getAllAsync<{ seance_id: string; d: number }>(
        "SELECT seance_id, MAX(t) - MIN(t) AS d FROM seance_fc WHERE seance_id IN (SELECT id FROM seances WHERE debut >= ?) AND t >= ? GROUP BY seance_id",
        [debut28 - JOUR, debut28],
      ),
      [],
    ),
    sur(
      db.getAllAsync<{ seance_id: string }>(
        "SELECT c.seance_id FROM seance_charge c JOIN seances s ON s.id = c.seance_id WHERE c.avec_fc = 1 AND s.debut >= ? AND s.debut <= ?",
        [debut28, maintenant],
      ),
      [],
    ),
    sur(db.getAllAsync<{ seance_id: string | null; debut: number; fin: number }>("SELECT seance_id, debut, fin FROM whoop_seance WHERE debut >= ? AND fc_moy IS NOT NULL", [debut28]), []),
    sur(lireActivites(db, debut28, maintenant), []),
    sur(db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM reconnaissance_choix", []), null),
    sur(lireEstimationsCourses(db, maintenant - 90 * JOUR), []),
    sur(
      db.getAllAsync<{ id: string }>(
        `SELECT DISTINCT s.id FROM seances s WHERE s.debut >= ? AND EXISTS (SELECT 1 FROM seance_exercices se WHERE se.seance_id = s.id AND se.exercice_id = ?)
         AND (EXISTS (SELECT 1 FROM seance_fc f WHERE f.seance_id = s.id) OR EXISTS (SELECT 1 FROM whoop_seance w WHERE w.seance_id = s.id AND w.fc_moy IS NOT NULL)
           OR EXISTS (SELECT 1 FROM seance_charge c WHERE c.seance_id = s.id AND c.avec_fc = 1))`,
        [maintenant - 182 * JOUR, COURSE],
      ),
      [],
    ),
  ]);
  const avecFc = new Set<string>();
  for (const f of fcPepfit) if (f.d >= 120_000) avecFc.add(f.seance_id);
  for (const c of fcCharge) avecFc.add(c.seance_id);
  let fcSeances28 = avecFc.size;
  for (const w of fcWhoop) if (w.fin - w.debut >= 120_000 && !(w.seance_id && avecFc.has(w.seance_id))) fcSeances28++;
  const detectees = activites.filter((a) => a.etat !== "ignoree" && a.fin - a.debut >= 20 * 60_000).map((a) => a.debut);
  const muscu8 = seances.filter((s) => s.muscu).length;

  // VMA : test de moins de 6 mois, vieux test, courses GPS avec ou sans FC, sinon Uth (FC de repos et FC max)
  const meilleure = courses.reduce<(typeof courses)[number] | null>((a, c) => (!a || c.vma > a.vma ? c : a), null);
  const v = vmaRetenue(tests, meilleure, maintenant);
  const coursesAvecFc = new Set(coursesFc.map((c) => c.id));
  const vma: SourceVma = !v
    ? zones?.fcRepos ? "uth" : null
    : v.source === "test"
      ? maintenant - v.date <= JOURS_TEST * JOUR ? "test" : "vieux"
      : meilleure && coursesAvecFc.has(meilleure.seanceId) ? "gpsfc" : "gps";
  const court = tests.length > 0 || courses.length > 0 || coursesFc.length > 0;

  // Repas : un jour tenu a au moins 2 repas et la moitié du métabolisme de base ; 30 derniers jours, 30 d'avant, 28
  const debut60 = aujourdhui - 59 * JOUR;
  const [kcal, repas, bmr] = await Promise.all([
    sur(kcalParJour(db, cleJour(new Date(debut60)), cleJour(new Date(maintenant))), new Map<string, number>()),
    sur(
      db.getAllAsync<{ date: string; n: number }>("SELECT date, COUNT(DISTINCT repas_id) AS n FROM consommations WHERE date >= ? AND date <= ? GROUP BY date", [
        cleJour(new Date(debut60)),
        cleJour(new Date(maintenant)),
      ]),
      [],
    ),
    sur(bmrA(db, maintenant), 1600),
  ]);
  const tenus = repas
    .filter((r) => jourRepasTenu(r.n, kcal.get(r.date) ?? 0, bmr))
    .map((r) => {
      const [a, m, j] = r.date.split("-").map(Number);
      return new Date(a!, m! - 1, j!).getTime();
    });

  // Semaines de facteurs de l'Âge : depuis la première nuit mesurée (FC de repos), 30 au plus
  const premiere = await sur(
    db.getFirstAsync<{ d: number | null }>(
      "SELECT MIN(d) AS d FROM (SELECT MIN(jour) AS d FROM whoop_jour WHERE fc_repos IS NOT NULL UNION ALL SELECT MIN(date) AS d FROM mesure_corps WHERE type = 'fc')",
      [],
    ),
    null,
  );

  // σ de la dépense d'aujourd'hui (energie-precision.ts) : la précision de la dépense est la sienne
  const energie = parties.sante === false ? null : await sur(jourEnergie(db, aujourdhui, maintenant), null);
  const sigmaRel = energie && energie.bilan.depense.kcal > 0 ? energie.bilan.depense.sigma / energie.bilan.depense.kcal : null;

  // la Récupération : le dernier matin de la semaine avec une nuit mesurée (sa précision et son âge)
  const recup = parties.sante === false ? null : await sur(lireDernierMatinRecup(db, maintenant), null);

  const d: DonneesPrecision = {
    naissance: naissance ? (naissance.precise ? "date" : "annee") : null,
    sexe: sexe != null,
    taille: tailleCm != null,
    poidsJours: jours(derniere?.date, maintenant),
    semainesPesees: semainesAvec(p.map((x) => x.date), maintenant),
    tourJours: jours(tour?.date, maintenant),
    navyJours: jours(navyDate, maintenant),
    grasSource: gras ? (gras.source === "manuel" ? "saisie" : "balance") : null,
    grasJours: jours(gras?.date, maintenant),
    capteur,
    nuits14: fn.recents,
    nuitsAvant: fn.avant,
    sommeil14: fs.recents,
    sommeilAvant: fs.avant,
    pas14: fp.recents,
    pasAvant: fp.avant,
    pasAutorises,
    fcSeances28,
    fcMax: zones ? FC_MAX[zones.fcMax.source] : "defaut",
    fcMaxJours: zones?.fcMax.source === "mesuree" ? jours(zones.fcMax.date, maintenant) : null,
    vma,
    vmaJours: v ? jours(v.date, maintenant) : null,
    court,
    semainesActives: semainesAvec([...seances.map((s) => s.debut), ...detectees], maintenant),
    seances8: seances.length,
    muscu8: muscu8 > 0 ? muscu8 : null,
    choixReco: choix?.n ?? 0,
    nut30: joursEntre(tenus, maintenant, 0, 30),
    nut60: joursEntre(tenus, maintenant, 30, 60),
    nut28: joursEntre(tenus, maintenant, 0, 28),
    objectifPoids: !!(await sur(lireObjectifPoids(db), null)),
    semainesHistorique: premiere?.d ? Math.min(30, Math.floor((maintenant - premiere.d) / (7 * JOUR))) : 0,
    parties,
    recup,
  };
  return {
    d: avecSigmaReel(d, sigmaRel),
    faits: { whoop: capteur === "whoop", vmaDate: v?.source === "test" ? v.date : null, recalee: !!energie?.bilan.depense.recalee, grasNavy: gras ? null : navy, femme: sexe === "f" },
  };
}

export const lireMemoirePrecision = async (db: Executeur) => lireMemoire(await lireReglage(db, CLE_MEMOIRE));
