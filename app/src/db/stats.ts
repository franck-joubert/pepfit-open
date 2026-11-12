import type { Executeur } from "./executeur";
import { titreSeance } from "./depots/seances";
import { t } from "../i18n/index";
import { nomSql } from "./noms";
import type { RecordExercice, TypeRecord } from "./types";

export async function compter(db: Executeur): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of ["exercices", "routines", "seances", "series"]) {
    const l = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`, []);
    out[t] = l?.n ?? 0;
  }
  return out;
}

const JOUR_MS = 86_400_000;

/** Lundi 00:00 (heure locale) de la semaine contenant `t`. */
export function debutDeSemaine(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function jourSuivant(t: number, n = 1): number {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

function dureeMin(debut: number, fin: number | null): number {
  return fin === null ? 0 : Math.max(0, Math.round((fin - debut) / 60_000));
}

export interface SeanceResume {
  id: string;
  titre: string;
  routineId: string | null;
  debut: number;
  fin: number | null;
  dureeMin: number;
  volumeKg: number;
  nbSeries: number;
  nbExercices: number;
  /** Exercices qui ont battu au moins un record dans la séance. */
  nbRecords: number;
  /** Sport posé par pepfit d'après les habitudes (« Reconnu », planche activite-detectee). */
  reconnu?: boolean;
}

interface LigneSeance {
  id: string; titre: string | null; routine_nom: string | null; routine_id: string | null; debut: number; fin: number | null;
  volume_kg: number; nb_series: number; nb_exercices: number; nb_records: number; reconnu: number | null;
}

const SELECT_SEANCE = `
  SELECT se.id, se.titre, r.nom AS routine_nom, se.routine_id, se.debut, se.fin, se.volume_kg, se.nb_series, se.reconnu IS NOT NULL AS reconnu,
         (SELECT COUNT(DISTINCT exercice_id) FROM series WHERE seance_id = se.id AND faite = 1) AS nb_exercices,
         (SELECT COUNT(DISTINCT exercice_id) FROM records WHERE seance_id = se.id AND serie_id IS NOT NULL) AS nb_records
  FROM seances se LEFT JOIN routines r ON r.id = se.routine_id`;

function resume(l: LigneSeance): SeanceResume {
  return {
    id: l.id, titre: titreSeance(l.titre) ?? l.routine_nom ?? t("seance.seance.titreDefaut"), routineId: l.routine_id, debut: l.debut, fin: l.fin,
    dureeMin: dureeMin(l.debut, l.fin), volumeKg: l.volume_kg, nbSeries: l.nb_series, nbExercices: l.nb_exercices, nbRecords: l.nb_records,
    ...(l.reconnu ? { reconnu: true } : {}),
  };
}

/** Séances terminées, de la plus récente à la plus ancienne ; `avantDebut` pagine. */
export async function historiqueSeances(db: Executeur, opts: { limite?: number; avantDebut?: number } = {}): Promise<SeanceResume[]> {
  const l = await db.getAllAsync<LigneSeance>(
    `${SELECT_SEANCE} WHERE se.fin IS NOT NULL AND se.debut < ? ORDER BY se.debut DESC LIMIT ?`,
    [opts.avantDebut ?? Number.MAX_SAFE_INTEGER, opts.limite ?? 50],
  );
  return l.map(resume);
}

/** Séances (terminées ou en cours) dont le début tombe entre `de` et `a` (ms), dans l'ordre (calendrier de planification). */
export async function seancesEntre(db: Executeur, de: number, a: number): Promise<SeanceResume[]> {
  const l = await db.getAllAsync<LigneSeance>(`${SELECT_SEANCE} WHERE se.debut >= ? AND se.debut < ? ORDER BY se.debut`, [de, a]);
  return l.map(resume);
}

export interface JourSemaine {
  /** Minuit local du jour. */
  date: number;
  fait: boolean;
  seances: { id: string; titre: string; volumeKg: number }[];
}

export interface StatsAccueil {
  semaine: { debut: number; jours: JourSemaine[]; nbSeances: number; volumeKg: number; dureeMin: number };
  aSuivre: { routineId: string; nom: string; nbExercices: number; derniereFois: number | null } | null;
  derniereSeance:
    | (SeanceResume & { meilleuresSeries: { exerciceId: string; nom: string; kg: number | null; reps: number | null }[] })
    | null;
}

/** Données de l'écran Accueil : semaine en 7 jours, routine à suivre (la moins récente), dernière séance et ses meilleures séries. */
export async function statsAccueil(db: Executeur, maintenant: number = Date.now()): Promise<StatsAccueil> {
  const debut = debutDeSemaine(maintenant);
  const fin = jourSuivant(debut, 7);
  const seances = (
    await db.getAllAsync<LigneSeance>(`${SELECT_SEANCE} WHERE se.fin IS NOT NULL AND se.debut >= ? AND se.debut < ? ORDER BY se.debut`, [debut, fin])
  ).map(resume);
  const jours: JourSemaine[] = [];
  for (let i = 0; i < 7; i++) {
    const d = jourSuivant(debut, i);
    const f = jourSuivant(debut, i + 1);
    const du = seances.filter((s) => s.debut >= d && s.debut < f);
    jours.push({ date: d, fait: du.length > 0, seances: du.map((s) => ({ id: s.id, titre: s.titre, volumeKg: s.volumeKg })) });
  }
  const r = await db.getFirstAsync<{ id: string; nom: string; n: number; derniere: number | null }>(
    `SELECT r.id, r.nom, (SELECT COUNT(*) FROM routine_exercices WHERE routine_id = r.id) AS n,
            (SELECT MAX(debut) FROM seances WHERE routine_id = r.id) AS derniere
     FROM routines r WHERE EXISTS (SELECT 1 FROM routine_exercices WHERE routine_id = r.id)
       AND NOT EXISTS (SELECT 1 FROM plans WHERE id = r.plan_id) AND r.visible = 1
     ORDER BY COALESCE(derniere, 0), r.ordre LIMIT 1`,
    [],
  );
  const der = (await db.getAllAsync<LigneSeance>(`${SELECT_SEANCE} WHERE se.fin IS NOT NULL AND se.debut <= ? ORDER BY se.debut DESC LIMIT 1`, [maintenant]))[0];
  let derniereSeance: StatsAccueil["derniereSeance"] = null;
  if (der) {
    const meilleures = await db.getAllAsync<{ exercice_id: string; nom: string; kg: number | null; reps: number | null }>(
      `SELECT s.exercice_id, ${nomSql("e")} AS nom, s.kg, s.reps FROM series s JOIN exercices e ON e.id = s.exercice_id
       WHERE s.seance_id = ? AND s.faite = 1 AND s.type != 'echauffement'
       ORDER BY (SELECT position FROM seance_exercices WHERE seance_id = s.seance_id AND exercice_id = s.exercice_id), COALESCE(s.e1rm, 0) DESC, COALESCE(s.reps, 0) DESC`,
      [der.id],
    );
    const vus = new Set<string>();
    const meilleuresSeries = meilleures
      .filter((m) => (vus.has(m.exercice_id) ? false : (vus.add(m.exercice_id), true)))
      .map((m) => ({ exerciceId: m.exercice_id, nom: m.nom, kg: m.kg, reps: m.reps }));
    derniereSeance = { ...resume(der), meilleuresSeries };
  }
  return {
    semaine: {
      debut,
      jours,
      nbSeances: seances.length,
      volumeKg: seances.reduce((a, s) => a + s.volumeKg, 0),
      dureeMin: seances.reduce((a, s) => a + s.dureeMin, 0),
    },
    aSuivre: r ? { routineId: r.id, nom: r.nom, nbExercices: r.n, derniereFois: r.derniere } : null,
    derniereSeance,
  };
}

export interface SemaineHistorique {
  debut: number;
  nbSeances: number;
  volumeKg: number;
  dureeMin: number;
}

/** Séances, volume et durée par semaine sur `nbSemaines` semaines, de la plus ancienne à la semaine en cours. */
export async function seancesParSemaine(db: Executeur, nbSemaines = 12, maintenant: number = Date.now()): Promise<SemaineHistorique[]> {
  const fin = debutDeSemaine(maintenant);
  const premier = jourSuivant(fin, -7 * (nbSemaines - 1));
  const l = await db.getAllAsync<{ debut: number; fin: number | null; volume_kg: number }>(
    "SELECT debut, fin, volume_kg FROM seances WHERE fin IS NOT NULL AND debut >= ? AND debut < ?",
    [premier, jourSuivant(fin, 7)],
  );
  const out: SemaineHistorique[] = [];
  for (let i = 0; i < nbSemaines; i++) {
    const d = jourSuivant(premier, 7 * i);
    const f = jourSuivant(d, 7);
    const s = l.filter((x) => x.debut >= d && x.debut < f);
    out.push({ debut: d, nbSeances: s.length, volumeKg: s.reduce((a, x) => a + x.volume_kg, 0), dureeMin: s.reduce((a, x) => a + dureeMin(x.debut, x.fin), 0) });
  }
  return out;
}

/**
 * `reps` : meilleure série en répétitions ; `reps_total` : répétitions de la séance ; `charge_eff` : charge effective (D8, absente sans pesée) ;
 * `duree`, `distance` : meilleure valeur ; `allure` : secondes par kilomètre, plus bas = mieux (axe inversé, D11).
 */
export type MesureProgression = "charge" | "e1rm" | "volume" | "reps" | "reps_total" | "charge_eff" | "duree" | "distance" | "allure";

/** Les mesures où plus bas = mieux. */
export const MESURES_INVERSEES: readonly MesureProgression[] = ["allure"];

export interface PointProgression {
  seanceId: string;
  date: number;
  valeur: number;
}

export interface Progression {
  points: PointProgression[];
  /** Dernière valeur moins la première de la période (0 s'il y a moins de 2 points). */
  gain: number;
}

const EXPR_PROGRESSION: Record<MesureProgression, string> = {
  charge: "MAX(s.kg)",
  e1rm: "MAX(s.e1rm)",
  volume: "SUM(s.volume)",
  reps: "MAX(s.reps)",
  reps_total: "SUM(s.reps)",
  charge_eff: "MAX(s.charge_eff)",
  duree: "MAX(s.duree_s)",
  distance: "MAX(s.distance_m)",
  allure: "MIN(CASE WHEN s.distance_m > 0 AND s.duree_s > 0 THEN s.duree_s * 1000.0 / s.distance_m END)",
};

/** Courbe d'un exercice : une valeur par séance (meilleure charge, 1RM estimé, volume, réps), depuis `depuis` (ms). */
export async function progressionExercice(db: Executeur, exerciceId: string, mesure: MesureProgression, depuis = 0): Promise<Progression> {
  const expr = EXPR_PROGRESSION[mesure];
  const points = await db.getAllAsync<PointProgression>(
    `SELECT se.id AS seanceId, se.debut AS date, ${expr} AS valeur
     FROM series s JOIN seances se ON se.id = s.seance_id
     WHERE s.exercice_id = ? AND s.faite = 1 AND s.type != 'echauffement' AND se.debut >= ?
     GROUP BY se.id HAVING valeur IS NOT NULL AND valeur > 0 ORDER BY se.debut`,
    [exerciceId, depuis],
  );
  const gain = points.length > 1 ? Math.round((points[points.length - 1]!.valeur - points[0]!.valeur) * 100) / 100 : 0;
  return { points, gain };
}

export type MesureRoutine = "volume" | "reps" | "duree";

const EXPR_ROUTINE: Record<MesureRoutine, string> = {
  volume: "se.volume_kg",
  reps: "(SELECT COALESCE(SUM(s.reps), 0) FROM series s WHERE s.seance_id = se.id AND s.faite = 1 AND s.type != 'echauffement')",
  duree: "ROUND((se.fin - se.debut) / 60000.0)",
};

/** Courbe d'une routine : une valeur par séance terminée faite avec elle (volume en kg, réps totales, durée en minutes), depuis `depuis` (ms). */
export async function progressionRoutine(db: Executeur, routineId: string, mesure: MesureRoutine, depuis = 0): Promise<Progression> {
  const points = await db.getAllAsync<PointProgression>(
    `SELECT se.id AS seanceId, se.debut AS date, ${EXPR_ROUTINE[mesure]} AS valeur
     FROM seances se WHERE se.routine_id = ? AND se.fin IS NOT NULL AND se.debut >= ?
     ORDER BY se.debut`,
    [routineId, depuis],
  );
  const gain = points.length > 1 ? Math.round((points[points.length - 1]!.valeur - points[0]!.valeur) * 100) / 100 : 0;
  return { points, gain };
}

/** Nombre de séances terminées faites avec une routine (elles restent dans l'historique si on la supprime). */
export async function nbSeancesRoutine(db: Executeur, routineId: string): Promise<number> {
  const l = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM seances WHERE routine_id = ? AND fin IS NOT NULL", [routineId]);
  return l?.n ?? 0;
}

export interface RecordsExercice {
  /** Meilleure valeur actuelle par type de record. */
  actuels: Partial<Record<TypeRecord, RecordExercice>>;
  /** Tous les records battus, du plus récent au plus ancien. */
  historique: RecordExercice[];
}

/** Records d'un exercice : valeurs actuelles et historique des records battus. */
export async function recordsExercice(db: Executeur, exerciceId: string): Promise<RecordsExercice> {
  const l = await db.getAllAsync<RecordExercice>("SELECT * FROM records WHERE exercice_id = ? ORDER BY atteint_le DESC, valeur DESC", [exerciceId]);
  const actuels: RecordsExercice["actuels"] = {};
  for (const r of l) if (r.actuel) actuels[r.type] = r;
  return { actuels, historique: l };
}

export interface SeancePourExercice {
  seanceId: string;
  date: number;
  series: {
    id: string; type: string; kg: number | null; reps: number | null; duree_s: number | null; distance_m: number | null; faite: number;
    e1rm: number | null; charge_eff: number | null; records: TypeRecord[];
  }[];
}

/** Les `limite` dernières séances d'un exercice avec leurs séries (écran Progression). */
export async function dernieresSeancesExercice(db: Executeur, exerciceId: string, limite = 5): Promise<SeancePourExercice[]> {
  const ss = await db.getAllAsync<{ id: string; debut: number }>(
    `SELECT se.id, se.debut FROM seances se WHERE EXISTS (SELECT 1 FROM series WHERE seance_id = se.id AND exercice_id = ? AND faite = 1)
     ORDER BY se.debut DESC LIMIT ?`,
    [exerciceId, limite],
  );
  const out: SeancePourExercice[] = [];
  for (const s of ss) {
    const series = await db.getAllAsync<Omit<SeancePourExercice["series"][number], "records">>(
      "SELECT id, type, kg, reps, duree_s, distance_m, faite, e1rm, charge_eff FROM series WHERE seance_id = ? AND exercice_id = ? ORDER BY position",
      [s.id, exerciceId],
    );
    const rec = await db.getAllAsync<{ serie_id: string; type: TypeRecord }>(
      "SELECT serie_id, type FROM records WHERE seance_id = ? AND exercice_id = ? AND serie_id IS NOT NULL",
      [s.id, exerciceId],
    );
    out.push({ seanceId: s.id, date: s.debut, series: series.map((x) => ({ ...x, records: rec.filter((r) => r.serie_id === x.id).map((r) => r.type) })) });
  }
  return out;
}

export interface StatsProfil {
  nbSeances: number;
  volumeKg: number;
  dureeTotaleMin: number;
  premiereSeance: number | null;
  nbRecords: number;
}

/** Chiffres du Profil : séances, volume total, durée totale, ancienneté, records battus. */
export async function statsProfil(db: Executeur): Promise<StatsProfil> {
  const l = await db.getFirstAsync<{ n: number; v: number | null; d: number | null; p: number | null }>(
    "SELECT COUNT(*) AS n, SUM(volume_kg) AS v, SUM(fin - debut) AS d, MIN(debut) AS p FROM seances WHERE fin IS NOT NULL",
    [],
  );
  // Records comptés par exercice et par séance, comme les cartes de la fin de séance (décision, 27/10).
  const r = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM (SELECT DISTINCT seance_id, exercice_id FROM records WHERE serie_id IS NOT NULL)",
    [],
  );
  return {
    nbSeances: l?.n ?? 0,
    volumeKg: l?.v ?? 0,
    dureeTotaleMin: Math.round((l?.d ?? 0) / 60_000),
    premiereSeance: l?.p ?? null,
    nbRecords: r?.n ?? 0,
  };
}

/** Records battus en séance, du plus récent au plus ancien, avec le nom de l'exercice (cartes du profil). */
export async function recordsRecents(db: Executeur, limite = 60) {
  return db.getAllAsync<{ exercice_id: string; nom: string; nature: string | null; type: TypeRecord; valeur: number; seance_id: string; atteint_le: number }>(
    `SELECT r.exercice_id, ${nomSql("e")} AS nom, e.nature, r.type, r.valeur, r.seance_id, r.atteint_le
     FROM records r JOIN exercices e ON e.id = r.exercice_id
     WHERE r.serie_id IS NOT NULL ORDER BY r.atteint_le DESC, r.valeur DESC LIMIT ?`,
    [limite],
  );
}

export { JOUR_MS };
