// Plans (migration 34) : un programme de la boutique démarré. Il crée de vraies routines typées (séries, charges, plages,
// tempos, supersets, zones en note de routine) et une programmation « unique » par séance : le plan se voit dans
// « Mes programmes » (en cours), dans le calendrier et dans les rappels, comme une routine programmée à la main.
import { transaction } from "../exclusif";
import { exercicesBoutique, lignesPlan, lignesRoutine } from "../../boutique/demarrage";
import type { OptionsDemarrage } from "../../boutique/calculs";
import type { Article, Langue, Programme, RoutineBoutique, Seance } from "../../boutique/modele";
import type { SerieHisto } from "../../boutique/poids";
import type { Regle } from "../../ecrans/planification";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import { lireReglage, ecrireReglage } from "./reglages";
import { sectionParDefaut } from "./sections";

// Les lignes elles-mêmes se calculent dans boutique/demarrage.ts, partagé avec le serveur MCP (une seule source).
export { idExercice } from "../../boutique/demarrage";

type Ligne = Record<string, string | number | null>;

async function inserer(db: Executeur, tab: string, l: Ligne, ouIgnorer = false): Promise<void> {
  const k = Object.keys(l);
  await db.runAsync(`INSERT ${ouIgnorer ? "OR IGNORE " : ""}INTO ${tab} (${k.join(", ")}) VALUES (${k.map(() => "?").join(",")})`, k.map((c) => l[c]!));
}

/** Crée les exercices propres à la boutique qui manquent (burpees, curl-up…), avec leurs deux noms. */
async function exercicesPerso(db: Executeur, p: Article): Promise<void> {
  for (const e of exercicesBoutique(p, Date.now())) await inserer(db, "exercices", e, true);
}

/**
 * Démarre un programme : le plan, ses routines (une par séance différente, une par charge pour un programme qui progresse),
 * leurs lignes et cibles, et une programmation par date. `charges` : charge de départ par exercice (slug du programme).
 * Une seule transaction. Renvoie l'id du plan.
 */
export async function demarrerPlan(
  db: Executeur,
  p: Programme,
  o: OptionsDemarrage,
  charges: Record<string, number | null>,
  langue: Langue,
): Promise<string> {
  let planId = "";
  await transaction(db, async (db) => {
    const l = lignesPlan(p, o, charges, langue, { section: await sectionParDefaut(db), ordre: await ordreSuivant(db), t: Date.now(), id: nouvelId });
    planId = String(l.plan.id);
    for (const e of l.exercices) await inserer(db, "exercices", e, true);
    await inserer(db, "plans", l.plan);
    for (const r of l.routines) await inserer(db, "routines", r);
    for (const r of l.routine_exercices) await inserer(db, "routine_exercices", r);
    for (const r of l.routine_series) await inserer(db, "routine_series", r);
    for (const n of l.notes) await inserer(db, "notes", n);
    for (const x of l.programmations) await inserer(db, "programmations", x);
  });
  return planId;
}

const ordreSuivant = async (db: Executeur) => ((await db.getFirstAsync<{ m: number | null }>("SELECT MAX(ordre) AS m FROM routines", []))?.m ?? -1) + 1;

/** Une vraie routine typée depuis une séance du catalogue (boutique/demarrage.ts, lignesRoutine). Renvoie l'id de la routine. */
async function insererRoutine(
  db: Executeur,
  s: Seance,
  kg: (number | null)[],
  o: { planId: string | null; section: string | null; ordre: number; t: number; langue: Langue },
): Promise<string> {
  const l = lignesRoutine(s, kg, { ...o, id: nouvelId });
  await inserer(db, "routines", l.routine);
  for (const r of l.routine_exercices) await inserer(db, "routine_exercices", r);
  for (const r of l.routine_series) await inserer(db, "routine_series", r);
  for (const n of l.notes) await inserer(db, "notes", n);
  return String(l.routine.id);
}

/** Réglage qui retient la routine créée depuis une routine de la boutique (pas de doublon si on y revient). */
export const cleRoutineBoutique = (catalogueId: string) => `boutique_routine:${catalogueId}`;

/**
 * Ajoute une routine de la boutique à « mes routines » (sans plan) et renvoie son id ; déjà ajoutée et toujours là : la
 * même. Les charges restent vides : la séance reprend celles de la dernière fois.
 */
export async function ajouterRoutineBoutique(db: Executeur, r: RoutineBoutique, langue: Langue): Promise<string> {
  const deja = await lireReglage(db, cleRoutineBoutique(r.id));
  if (deja && (await db.getFirstAsync<{ id: string }>("SELECT id FROM routines WHERE id = ?", [deja]))) return deja;
  let id = "";
  await transaction(db, async (db) => {
    await exercicesPerso(db, r);
    id = await insererRoutine(db, r.seance, r.seance.blocs.map(() => null), {
      planId: null, section: await sectionParDefaut(db), ordre: await ordreSuivant(db), t: Date.now(), langue,
    });
    await ecrireReglage(db, cleRoutineBoutique(r.id), id);
  });
  return id;
}

export interface Plan {
  id: string;
  catalogueId: string;
  nom: string;
  debut: string;
  fin: string;
  jours: number[];
  heure: string;
  nbSeances: number;
  /** Arrêté (ms) ; null : en cours ou terminé. */
  arreteLe: number | null;
}

/** Une séance du plan : sa date (programmation, décalée s'il le faut), sa routine, faite ou non. */
export interface SeancePlan {
  date: string;
  heure: string;
  routineId: string;
  nom: string;
  programmationId: string;
}

interface LignePlan {
  id: string;
  catalogue_id: string;
  nom: string;
  debut: string;
  fin: string;
  jours: string;
  heure: string;
  nb_seances: number;
  arrete_le?: number | null;
}
const lirePlanLigne = (l: LignePlan): Plan => ({
  id: l.id, catalogueId: l.catalogue_id, nom: l.nom, debut: l.debut, fin: l.fin, jours: JSON.parse(l.jours) as number[], heure: l.heure, nbSeances: l.nb_seances,
  arreteLe: l.arrete_le ?? null,
});

/** Les plans, le plus récent d'abord. */
export async function listerPlans(db: Executeur): Promise<Plan[]> {
  return (await db.getAllAsync<LignePlan>("SELECT * FROM plans ORDER BY cree_le DESC", [])).map(lirePlanLigne);
}

export async function lirePlan(db: Executeur, id: string): Promise<Plan | null> {
  const l = await db.getFirstAsync<LignePlan>("SELECT * FROM plans WHERE id = ?", [id]);
  return l ? lirePlanLigne(l) : null;
}

/**
 * Les séances d'un plan, dans l'ordre des dates (date d'origine de la programmation ; un décalage se lit dans le planning).
 * `toutes` : aussi celles d'un plan arrêté (programmations désactivées), pour son historique.
 */
export async function seancesDuPlan(db: Executeur, planId: string, toutes = false): Promise<SeancePlan[]> {
  const l = await db.getAllAsync<{ id: string; routine_id: string; regle: string; nom: string }>(
    "SELECT p.id, p.routine_id, p.regle, r.nom FROM programmations p JOIN routines r ON r.id = p.routine_id WHERE r.plan_id = ? AND (p.actif = 1 OR ?)",
    [planId, toutes ? 1 : 0],
  );
  return l
    .map((x) => {
      const r = JSON.parse(x.regle) as Regle;
      return { date: r.date ?? r.debut, heure: r.heure ?? "", routineId: x.routine_id, nom: x.nom, programmationId: x.id };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.heure.localeCompare(b.heure));
}

/**
 * Arrête un plan (migration 42) : ses programmations sont désactivées (plus rien de prévu), le plan et ses routines restent
 * pour l'historique (« Arrêté semaine 5 »). Les séances déjà faites restent dans le journal.
 */
export async function arreterPlan(db: Executeur, planId: string, maintenant: number = Date.now()): Promise<void> {
  await transaction(db, async (db) => {
    await db.runAsync("UPDATE programmations SET actif = 0, maj_le = ? WHERE routine_id IN (SELECT id FROM routines WHERE plan_id = ?)", [maintenant, planId]);
    await db.runAsync("UPDATE plans SET arrete_le = ?, maj_le = ? WHERE id = ?", [maintenant, maintenant, planId]);
  });
}

/** Supprime un plan passé (glisser, D7) : ses routines (et donc ses programmations) et le plan ; le journal ne bouge pas. */
export async function supprimerPlan(db: Executeur, planId: string): Promise<void> {
  await transaction(db, async (db) => {
    await db.runAsync("DELETE FROM routines WHERE plan_id = ?", [planId]);
    await db.runAsync("DELETE FROM plans WHERE id = ?", [planId]);
  });
}

/**
 * Dernière charge de travail d'un exercice (la plus lourde série faite, hors échauffement, de la dernière séance où il a été
 * fait) : base des charges de départ (90 %). null sans historique.
 */
export async function derniereCharge(db: Executeur, exerciceId: string): Promise<{ kg: number; reps: number | null } | null> {
  const s = await db.getFirstAsync<{ kg: number; reps: number | null }>(
    `SELECT s.kg, s.reps FROM series s JOIN seances se ON se.id = s.seance_id
     WHERE s.exercice_id = ? AND s.faite = 1 AND s.type != 'echauffement' AND s.kg > 0
       AND se.debut = (SELECT MAX(se2.debut) FROM series s2 JOIN seances se2 ON se2.id = s2.seance_id
                       WHERE s2.exercice_id = ? AND s2.faite = 1 AND s2.type != 'echauffement' AND s2.kg > 0)
     ORDER BY s.kg DESC, s.reps DESC LIMIT 1`,
    [exerciceId, exerciceId],
  );
  return s ? { kg: s.kg, reps: s.reps } : null;
}

/**
 * Séries de travail faites depuis `depuis` (ms), sur les exercices du catalogue, avec l'effort noté (RPE) : base des poids de
 * départ (boutique/poids.ts, meilleur 1RM estimé sur 3 mois).
 */
export async function historiqueSeries(db: Executeur, depuis: number): Promise<SerieHisto[]> {
  return db.getAllAsync<SerieHisto>(
    `SELECT e.slug AS exo, s.kg, s.reps, s.rpe, se.debut AS date FROM series s
     JOIN seances se ON se.id = s.seance_id JOIN exercices e ON e.id = s.exercice_id
     WHERE s.faite = 1 AND s.type != 'echauffement' AND s.kg > 0 AND s.reps > 0 AND se.debut >= ? AND e.slug IS NOT NULL`,
    [depuis],
  );
}
