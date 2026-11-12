// Données de l'Effort pepfit pour la jauge de Sport et la page Effort (planche effort-pepfit, 31/10) : la cible du jour, l'effort
// d'un jour, d'une semaine (barres, cible de chaque jour, rythme) et l'historique de 12 semaines. Lectures en base ; les
// calculs sont purs (effort-pepfit.ts), les charges viennent de effort-charges.ts (séances) et effort-activite-donnees.ts
// (l'activité de la journée hors séances, docs/EFFORT-ACTIVITE.md) : les charges s'ajoutent, partout (D5).
import type { Executeur } from "../db/executeur";
import { lireAge } from "../db/depots/profil";
import { listerExceptions, listerProgrammations, lireReglagesPlanif } from "../db/depots/programmations";
import { activitesEntre, activiteJour, type ActiviteJour } from "./effort-activite-donnees";
import { chargesParJour, effortsSeancesJour, premierJourSeance, seancesChargees } from "./effort-charges";
import {
  cibleEffort, COURBE_EFFORT, effortDeCharges, rythmeSemaine, scoreEffort, scoreSemaine, type Cible, type CourbeEffort,
} from "./effort-pepfit";
import { decaler } from "./mesures/periodes";
import { lireRecupJour } from "./recup-donnees";
import { isoDe, occurrences } from "./planification";

const JOUR_MS = 86_400_000;
/** Fenêtre des jours d'une séance prévue (sa médiane, § 5, 3). */
const JOURS_SEANCE = 120;

const minuitDe = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Charges des jours de [debut, fin[ (minuits) : la journée entière, les jours de séance seuls, l'activité des jours sans séance. */
export interface ChargesJournees {
  /** Séances + activité, chaque jour qui a l'une ou l'autre. */
  totales: Map<number, number>;
  /** Les jours avec séance notée : séances + activité (les jours d'entraînement de la cible). */
  entrainement: Map<number, number>;
  /** Les jours sans séance notée : l'activité seule (l'habitude d'un repos prévu). */
  repos: Map<number, number>;
}

/** Les charges de chaque jour : séances (calculées si elles manquent) et activité déjà mesurée, additionnées. */
export async function chargesJournees(db: Executeur, debut: number, fin: number): Promise<ChargesJournees> {
  const [seances, activites] = await Promise.all([chargesParJour(db, debut, fin), activitesEntre(db, debut, fin)]);
  const totales = new Map<number, number>();
  const entrainement = new Map<number, number>();
  const repos = new Map<number, number>();
  for (const [j, c] of seances) {
    const t = c + (activites.get(j)?.charge ?? 0);
    totales.set(j, t);
    entrainement.set(j, t);
  }
  for (const [j, a] of activites) {
    if (seances.has(j)) continue;
    totales.set(j, a.charge);
    repos.set(j, a.charge);
  }
  return { totales, entrainement, repos };
}

/**
 * La forme du jour (§ 5, 2) : celle de la Récupération pepfit du matin (recup-pepfit.ts, formeCible ; NOTES § 5 de la planche
 * recuperation) ; 1 sans score ou sous 40 % de précision. Une seule lecture de la nuit dans toute l'appli.
 */
export async function lireForme(db: Executeur, jour: number): Promise<number> {
  return (await lireRecupJour(db, jour).catch(() => null))?.forme ?? 1;
}

/**
 * Ce que prévoit le programme ce jour : les routines prévues (ou faites, pour un jour passé), et si c'est un repos prévu (un
 * programme suivi couvre le jour, sans séance ce jour-là).
 */
async function prevuDuJour(db: Executeur, jour: number): Promise<{ routines: Set<string>; repos: boolean }> {
  const iso = isoDe(new Date(jour));
  const [prevues, faites, plans] = await Promise.all([
    (async () => {
      const [progs, exceptions, reg] = await Promise.all([listerProgrammations(db), listerExceptions(db), lireReglagesPlanif(db)]);
      return occurrences(progs, exceptions, iso, iso, reg.heureDefaut);
    })().catch(() => []),
    db.getAllAsync<{ routine_id: string }>("SELECT DISTINCT routine_id FROM seances WHERE routine_id IS NOT NULL AND debut >= ? AND debut < ?", [jour, jour + JOUR_MS]),
    db
      .getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM plans WHERE debut <= ? AND fin >= ? AND arrete_le IS NULL", [iso, iso])
      .catch(() => null),
  ]);
  const routines = new Set<string>();
  for (const o of prevues) if (o.date === iso && o.routineId) routines.add(o.routineId);
  for (const f of faites) routines.add(f.routine_id);
  return { routines, repos: (plans?.n ?? 0) > 0 && !prevues.some((o) => o.date === iso) && !faites.length };
}

/**
 * Cible d'un jour (minuit `jour`) ; null dans les cas de § 5 (moins de 28 jours, blessure…). Un jour passé : celle de ce
 * matin-là. `formeLue` : celle de la Récupération déjà lue (la jauge de Sport la lit pour elle-même), sinon relue ici.
 */
export async function lireCible(db: Executeur, jour: number, maintenant = Date.now(), courbe: CourbeEffort = COURBE_EFFORT, formeLue?: number): Promise<Cible | null> {
  if (jour > maintenant) return null;
  const iso = isoDe(new Date(jour));
  const [journees, premier, forme, age, blessure, prevu] = await Promise.all([
    chargesJournees(db, decaler(jour, -JOURS_SEANCE), jour),
    premierJourSeance(db),
    formeLue ?? lireForme(db, jour),
    lireAge(db, maintenant).catch(() => null),
    db
      .getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM blessure WHERE statut = 'active' AND supprime_le IS NULL AND debut <= ?", [iso])
      .catch(() => null),
    prevuDuJour(db, jour),
  ]);
  const charges = journees.entrainement;
  // Séance prévue ce jour (ou faite, pour un jour passé) : la médiane de tes jours avec elle, s'il y en a au moins 4 ; avec
  // plusieurs routines, celle qui a le plus de jours.
  let joursSeance: number[] | null = null;
  for (const r of prevu.routines) {
    const l = await db.getAllAsync<{ debut: number }>("SELECT debut FROM seances WHERE routine_id = ? AND fin IS NOT NULL AND debut >= ? AND debut < ?", [
      r,
      decaler(jour, -JOURS_SEANCE),
      jour,
    ]);
    const jours = new Set(l.map((x) => minuitDe(x.debut)));
    const c = [...jours].map((j) => charges.get(j)).filter((v): v is number => v != null);
    if (!joursSeance || c.length > joursSeance.length) joursSeance = c;
  }
  return cibleEffort(
    { jour, charges, chargesRepos: journees.repos, premier, forme, joursSeance, repos: prevu.repos, age: age?.age ?? null, blessure: (blessure?.n ?? 0) > 0, futur: false },
    courbe,
  );
}

/** L'effort d'un jour : la somme des charges de ses séances notées et de son activité, puis la courbe ; null sans rien. */
export interface EffortJour {
  charge: number;
  score: number;
  /** Au moins une séance estimée (« ~ »). */
  estime: boolean;
  seances: number;
  /** L'activité de la journée hors séances (pas ou FC), null sans mesure. */
  activite: ActiviteJour | null;
}

export async function lireEffortJour(db: Executeur, jour: number, courbe: CourbeEffort = COURBE_EFFORT): Promise<EffortJour | null> {
  const [efforts, activite] = await Promise.all([effortsSeancesJour(db, jour, courbe), activiteJour(db, jour, courbe)]);
  const l = [...efforts.values()].filter((x) => x != null);
  const a = activite && activite.charge > 0 ? activite : null;
  if (!l.length && !a) return null;
  const e = effortDeCharges([...l.map((x) => x.charge), a?.charge ?? 0], courbe);
  return { ...e, estime: l.some((x) => x.estime), seances: l.length, activite: a };
}

export interface JourSemaine {
  jour: number;
  /** null : jour à venir. 0 : rien de noté. */
  charge: number | null;
  score: number;
  cible: Cible | null;
  seances: number;
}

export interface SemaineEffort {
  lundi: number;
  jours: JourSemaine[];
  charge: number;
  /** Effort de la semaine (D6). */
  score: number;
  seances: number;
  joursAvecSeance: number;
  /** Le rythme des 7 derniers jours (jusqu'à aujourd'hui, ou jusqu'au dimanche d'une semaine passée). */
  rythme: ReturnType<typeof rythmeSemaine>;
}

/** La semaine du lundi `lundi` : chaque jour, sa charge et sa cible ; l'effort de la semaine ; le rythme. */
export async function lireSemaineEffort(db: Executeur, lundi: number, maintenant = Date.now(), courbe: CourbeEffort = COURBE_EFFORT): Promise<SemaineEffort> {
  const auj = minuitDe(maintenant);
  const dimanche = decaler(lundi, 6);
  const finRythme = Math.min(auj, dimanche);
  const charges = (await chargesJournees(db, decaler(Math.min(finRythme, lundi), -27), decaler(dimanche, 1))).totales;
  // après les charges : les séances de la semaine sans charge viennent d'être calculées
  const nbSeances = await db.getAllAsync<{ debut: number }>(
    "SELECT s.debut FROM seances s JOIN seance_charge c ON c.seance_id = s.id WHERE s.debut >= ? AND s.debut < ?",
    [lundi, decaler(lundi, 7)],
  );
  const parJour = new Map<number, number>();
  for (const s of nbSeances) parJour.set(minuitDe(s.debut), (parJour.get(minuitDe(s.debut)) ?? 0) + 1);
  const jours: JourSemaine[] = [];
  for (let i = 0; i < 7; i++) {
    const j = decaler(lundi, i);
    const futur = j > auj;
    const charge = futur ? null : (charges.get(j) ?? 0);
    jours.push({ jour: j, charge, score: scoreEffort(charge ?? 0, courbe), cible: futur ? null : await lireCible(db, j, maintenant, courbe).catch(() => null), seances: parJour.get(j) ?? 0 });
  }
  const charge = jours.reduce((a, j) => a + (j.charge ?? 0), 0);
  let c7 = 0, c28 = 0;
  for (let i = 0; i < 28; i++) {
    const c = charges.get(decaler(finRythme, -i)) ?? 0;
    if (i < 7) c7 += c;
    c28 += c;
  }
  return {
    lundi,
    jours,
    charge,
    score: scoreSemaine(charge, courbe),
    seances: nbSeances.length,
    joursAvecSeance: jours.filter((j) => j.seances > 0).length,
    rythme: rythmeSemaine(c7, c28),
  };
}

export interface HistoriqueEffort {
  /** 12 semaines, la plus ancienne d'abord ; la dernière est celle de `maintenant`. */
  semaines: { lundi: number; charge: number; score: number }[];
  /** Ton habitude : l'effort d'une semaine moyenne des 4 semaines d'avant celle-ci ; null sans charge. */
  habitude: number | null;
  /** La moyenne des 12 semaines (charge moyenne, puis la courbe : jamais une moyenne de scores). */
  moyenne: number | null;
  jourMax: { jour: number; score: number; lundi: number; nom: string | null } | null;
}

export const SEMAINES_HISTORIQUE = 12;

const lundiDe = (t: number) => {
  const d = new Date(minuitDe(t));
  return decaler(d.getTime(), -((d.getDay() + 6) % 7));
};

export async function lireHistoriqueEffort(db: Executeur, maintenant = Date.now(), courbe: CourbeEffort = COURBE_EFFORT): Promise<HistoriqueEffort> {
  const lundi = lundiDe(maintenant);
  const debut = decaler(lundi, -7 * (SEMAINES_HISTORIQUE - 1));
  const [seances, activites] = await Promise.all([seancesChargees(db, debut, decaler(lundi, 7)), activitesEntre(db, debut, decaler(lundi, 7))]);
  const semaines = Array.from({ length: SEMAINES_HISTORIQUE }, (_, i) => ({ lundi: decaler(debut, 7 * i), charge: 0, score: 0 }));
  const jours = new Map<number, { charge: number; noms: { nom: string | null; charge: number }[] }>();
  const ajouter = (t: number, charge: number, nom: { nom: string | null; charge: number } | null) => {
    const k = semaines.findIndex((w) => t >= w.lundi && t < decaler(w.lundi, 7));
    if (k >= 0) semaines[k]!.charge += charge;
    const j = minuitDe(t);
    const x = jours.get(j) ?? { charge: 0, noms: [] };
    x.charge += charge;
    if (nom) x.noms.push(nom);
    jours.set(j, x);
  };
  for (const s of seances) ajouter(s.debut, s.charge, { nom: s.nom, charge: s.charge });
  // l'activité de la journée compte dans la semaine et le jour, sans être un nom de séance
  for (const [j, a] of activites) ajouter(j, a.charge, null);
  for (const w of semaines) w.score = scoreSemaine(w.charge, courbe);
  const avant = semaines.slice(-5, -1).map((w) => w.charge);
  const habitude = avant.some((c) => c > 0) ? scoreSemaine(avant.reduce((a, b) => a + b, 0) / avant.length, courbe) : null;
  const total = semaines.reduce((a, w) => a + w.charge, 0);
  let jourMax: HistoriqueEffort["jourMax"] = null;
  for (const [j, x] of jours) {
    const score = scoreEffort(x.charge, courbe);
    if (!jourMax || score > jourMax.score) {
      const nom = [...x.noms].sort((a, b) => b.charge - a.charge)[0]?.nom ?? null;
      jourMax = { jour: j, score, lundi: lundiDe(j), nom };
    }
  }
  return { semaines, habitude, moyenne: total > 0 ? scoreSemaine(total / semaines.length, courbe) : null, jourMax };
}
