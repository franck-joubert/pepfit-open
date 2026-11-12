// Données du tiroir de lancement, du bloc programme de fin de séance et de la carte de fin de programme (planche
// seance-tiroirs v2). Les calculs sont dans tiroir-seance-calc.ts (pur, testé) ; ici, les lectures de la base.
import { programme as programmeDu, tx } from "../boutique/donnees";
import type { Programme } from "../boutique/modele";
import { lirePlan, seancesDuPlan, type Plan } from "../db/depots/plans";
import { lireReglage } from "../db/depots/reglages";
import { lireRoutine, type RoutineDetail } from "../db/depots/routines";
import type { Executeur } from "../db/executeur";
import { dureeEstimee } from "./donnees";
import { jourDe } from "./planif-donnees";
import { ecartJ } from "./planification";
import {
  avancement, dureePrevue, genreTiroir, meilleurGain, rappelTiroir, reposTypique, type Avancement, type ChargeSeance, type DureePrevue,
  type GenreTiroir, type Rappel,
} from "./tiroir-seance-calc";

/** Le programme auquel une séance est liée (ou qu'elle ne fait pas avancer, D9). */
export interface LienProgramme {
  planId: string;
  nom: string;
  /** Programme du catalogue (vignette, accent de la semaine) ; null pour un programme perso. */
  programme: Programme | null;
  /** Picto de repli (premier exercice de la séance) quand il n'y a pas de vignette du catalogue. */
  picto: string | null;
  avancement: Avancement;
}

export interface DonneesTiroir {
  routine: RoutineDetail;
  genre: GenreTiroir;
  /** Programme de la routine (genre « programme ») ou programme en cours qu'elle ne fait pas avancer (« horsProgramme »). */
  lien: LienProgramme | null;
  /** Hors programme : la routine de la séance prévue du programme (« La faire »). */
  routinePrevue: string | null;
  rappel: Rappel;
  duree: DureePrevue | null;
  /** Séries de la routine et repos le plus fréquent (« 11 séries, repos de 3 min »). */
  series: number;
  reposS: number | null;
}

const planDe = async (db: Executeur, routineId: string) =>
  (await db.getFirstAsync<{ plan_id: string | null }>("SELECT plan_id FROM routines WHERE id = ?", [routineId]))?.plan_id ?? null;

/** Lien d'un plan non arrêté : avancement en tiroir (`fin` faux) ou en fin de séance. null si le plan est arrêté ou absent. */
async function lien(db: Executeur, p: Plan, routineId: string | null, auj: string, fin: boolean, pictoRepli: string | null): Promise<LienProgramme | null> {
  if (p.arreteLe != null) return null;
  const seances = await seancesDuPlan(db, p.id);
  if (!seances.length) return null;
  const faites = await db.getAllAsync<{ routine_id: string; debut: number }>(
    "SELECT routine_id, debut FROM seances WHERE fin IS NOT NULL AND routine_id IN (SELECT id FROM routines WHERE plan_id = ?) ORDER BY debut",
    [p.id],
  );
  const prog = programmeDu(p.catalogueId);
  return {
    planId: p.id,
    nom: prog ? tx(prog.nom) : p.nom,
    programme: prog,
    picto: pictoRepli,
    avancement: avancement({
      debut: p.debut,
      semaines: prog?.semaines,
      seances,
      faites: faites.map((f) => ({ routineId: f.routine_id, jour: jourDe(f.debut) })),
      routineId,
      auj,
      fin,
    }),
  };
}

/** Un autre programme en cours qui a encore une séance à faire (D9) : le plus récent. */
async function planEnCours(db: Executeur, sauf: string | null): Promise<Plan | null> {
  const l = await db.getAllAsync<{ id: string }>("SELECT id FROM plans WHERE arrete_le IS NULL ORDER BY cree_le DESC", []);
  const auj = jourDe(Date.now());
  for (const { id } of l) {
    if (id === sauf) continue;
    const p = await lirePlan(db, id);
    if (p && p.debut <= auj && p.fin >= auj) return p;
  }
  return null;
}

/** Les 3 dernières fois d'une routine : jour (ms), séries faites, minutes. */
async function dernieresFois(db: Executeur, routineId: string) {
  const l = await db.getAllAsync<{ id: string; debut: number; fin: number }>(
    "SELECT id, debut, fin FROM seances WHERE routine_id = ? AND fin IS NOT NULL ORDER BY debut DESC LIMIT 3",
    [routineId],
  );
  const out: { jour: number; series: number; minutes: number }[] = [];
  for (const s of l) {
    const n = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM series WHERE seance_id = ? AND faite = 1", [s.id]);
    out.push({ jour: s.debut, series: n?.n ?? 0, minutes: Math.round((s.fin - s.debut) / 60_000) });
  }
  return out;
}

const premierSlug = (r: RoutineDetail) => r.blocs[0]?.lignes[0]?.exercice.slug ?? null;

/** Tout ce que montre le tiroir d'une routine ; null si la routine n'existe plus. */
export async function lireTiroir(db: Executeur, routineId: string, maintenant = Date.now()): Promise<DonneesTiroir | null> {
  const routine = await lireRoutine(db, routineId);
  if (!routine) return null;
  const auj = jourDe(maintenant);
  const idPlan = await planDe(db, routineId);
  const plan = idPlan ? await lirePlan(db, idPlan) : null;
  const propre = plan ? await lien(db, plan, routineId, auj, false, premierSlug(routine)) : null;
  const autre = propre ? null : await planEnCours(db, idPlan);
  let horsLien: LienProgramme | null = null;
  let routinePrevue: string | null = null;
  if (autre) {
    // La séance à faire de l'autre programme : la première non faite d'aujourd'hui ou après, sinon la plus ancienne en retard.
    const base = await lien(db, autre, null, auj, false, null);
    const seances = base ? await seancesDuPlan(db, autre.id) : [];
    const a = base?.avancement;
    if (base && a) {
      const etats = a.colonnes.flat();
      const i = etats.findIndex((e, k) => e === "avenir" && seances[k]!.date >= auj);
      const k = i >= 0 ? i : etats.findIndex((e) => e === "manquee" || e === "avenir");
      if (k >= 0) {
        routinePrevue = seances[k]!.routineId;
        const r = await lireRoutine(db, routinePrevue);
        horsLien = { ...base, picto: r ? premierSlug(r) : null, avancement: { ...a, rang: k + 1 } };
      }
    }
  }
  const genre = genreTiroir(propre?.planId ?? null, horsLien?.planId ?? null);
  const lignes = routine.blocs.flatMap((b) => b.lignes);
  const series = lignes.reduce((n, l) => n + l.nb_series, 0);
  const dernieres = genre === "programme" ? [] : await dernieresFois(db, routineId);
  const semaine = propre?.programme?.calendrier[propre.avancement.semaine - 1];
  return {
    routine,
    genre,
    lien: propre ?? horsLien,
    routinePrevue,
    rappel: rappelTiroir({ genre, accent: semaine?.accent ? tx(semaine.accent) : null, note: routine.note, derniere: dernieres[0] ?? null }),
    duree: dureePrevue(genre, dureeEstimee(routine), dernieres.map((d) => d.minutes)),
    series,
    reposS: reposTypique(routine.blocs.flatMap((b) => (b.groupeSuperset == null ? b.lignes.map((l) => l.repos_s) : [b.reposS]))),
  };
}

/** Bloc programme de la fin de séance (D10) : la séance compte (genre « programme »), ou ne compte pas (« horsProgramme »). */
export interface FinProgramme {
  genre: "programme" | "horsProgramme";
  lien: LienProgramme;
}

export async function lireFinProgramme(db: Executeur, routineId: string | null, maintenant = Date.now()): Promise<FinProgramme | null> {
  const auj = jourDe(maintenant);
  const r = routineId ? await lireRoutine(db, routineId) : null;
  const idPlan = routineId ? await planDe(db, routineId) : null;
  const plan = idPlan ? await lirePlan(db, idPlan) : null;
  const propre = plan ? await lien(db, plan, routineId, auj, true, r ? premierSlug(r) : null) : null;
  if (propre && propre.avancement.rang != null) return { genre: "programme", lien: propre };
  // Séance libre ou routine hors programme : une ligne calme si un programme est en cours (D9).
  const autre = await planEnCours(db, idPlan);
  const l = autre ? await lien(db, autre, null, auj, false, null) : null;
  if (!l) return null;
  const etats = l.avancement.colonnes.flat();
  const k = etats.findIndex((e) => e === "avenir" || e === "manquee");
  if (k < 0) return null;
  const s = (await seancesDuPlan(db, l.planId))[k];
  const rp = s ? await lireRoutine(db, s.routineId) : null;
  return { genre: "horsProgramme", lien: { ...l, picto: rp ? premierSlug(rp) : null, avancement: { ...l.avancement, rang: k + 1 } } };
}

/** Carte de fin de programme (D11 à D14). */
export interface CarteFin {
  planId: string;
  nom: string;
  programme: Programme | null;
  prenom: string;
  faites: number;
  total: number;
  semaines: number;
  gain: { nom: string; kg: number } | null;
}

export async function lireCarteFin(db: Executeur, planId: string): Promise<CarteFin | null> {
  const p = await lirePlan(db, planId);
  if (!p) return null;
  const prog = programmeDu(p.catalogueId);
  const seances = await seancesDuPlan(db, planId, true);
  const faites = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM seances WHERE fin IS NOT NULL AND routine_id IN (SELECT id FROM routines WHERE plan_id = ?)",
    [planId],
  );
  const charges = await db.getAllAsync<ChargeSeance>(
    `SELECT s.exercice_id AS exo, e.nom AS nom, se.debut AS debut, s.kg AS kg FROM series s
     JOIN seances se ON se.id = s.seance_id JOIN exercices e ON e.id = s.exercice_id
     WHERE se.fin IS NOT NULL AND s.faite = 1 AND s.type != 'echauffement' AND s.kg > 0
       AND se.routine_id IN (SELECT id FROM routines WHERE plan_id = ?)`,
    [planId],
  );
  // Les séances d'un même jour comptent pour une : « debut » ramené au jour.
  const parJour = charges.map((c) => ({ ...c, debut: Math.floor(c.debut / 86_400_000) }));
  const semaines = prog?.semaines ?? Math.ceil((ecartJ(p.debut, p.fin) + 1) / 7);
  return {
    planId,
    nom: prog ? tx(prog.nom) : p.nom,
    programme: prog,
    prenom: (await lireReglage(db, "prenom"))?.trim() ?? "",
    faites: Math.min(faites?.n ?? 0, seances.length || p.nbSeances),
    total: seances.length || p.nbSeances,
    semaines,
    gain: meilleurGain(parJour),
  };
}
