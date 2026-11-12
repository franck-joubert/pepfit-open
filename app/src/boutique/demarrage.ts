// Démarrer un programme de la boutique, ou ajouter une de ses routines : les lignes à écrire (plan, exercices propres à la
// boutique, routines, lignes, cibles, notes, programmations), calculées sans base de données. Une seule source pour
// l'appli (db/depots/plans.ts les insère) et pour le serveur MCP (serveur/mcp/src/outils/entrainement.ts les écrit par la
// synchro), qui importe ce fichier tel quel : il ne doit tirer que du code pur (imports listés dans serveur/mcp/appli.liste,
// vérifiés par test).
import { calendrierPlan, noteBloc, prochainLundi, routinesDuPlan, type OptionsDemarrage } from "./calculs";
import { texte, type Article, type Langue, type Programme, type Seance } from "./modele";
import { ajouterJ, type Regle } from "../ecrans/planification";
import { texteRegle } from "../i18n/planif-saisie";
import { normaliser } from "../db/normaliser";

type Ligne = Record<string, string | number | null>;

export { aUneLongue, conseil, type OptionsDemarrage } from "./calculs";

/** Premier jour proposé par la feuille Démarrer : le lundi qui suit demain (« AAAA-MM-JJ »). */
export const debutParDefaut = (aujourdhui: string) => prochainLundi(ajouterJ(aujourdhui, 1));

/** Id d'un exercice d'un programme : `cat:<slug>` du catalogue, ou `bq:<clé>` pour un exercice propre à la boutique. */
export const idExercice = (exo: string) => (exo.startsWith("perso:") ? `bq:${exo.slice(6)}` : `cat:${exo}`);

/** « 2 », « 1 ou 2 » : réserves visées d'une séance, de la plus petite à la plus grande. */
const ou = (l: number[], langue: Langue) => (l.length === 1 ? String(l[0]) : `${l.slice(0, -1).join(", ")} ${langue === "fr" ? "ou" : "or"} ${l[l.length - 1]}`);

/** Note de séance (en haut) : la consigne d'effort, d'après les réserves visées de ses blocs ; null sans cible. */
export function noteEffort(s: Seance, langue: Langue): string | null {
  const l = [...new Set(s.blocs.filter((b) => b.rir != null).map((b) => b.rir!))].sort((a, b) => a - b);
  if (!l.length) return null;
  if (l.length === 1 && l[0] === 0) return { fr: "Effort : va jusqu'au bout de chaque série.", en: "Effort: take every set all the way." }[langue];
  return {
    fr: `Effort : arrête chaque série quand tu pourrais encore en faire ${ou(l, "fr")}.`,
    en: `Effort: stop each set when you could still do ${ou(l, "en")} more.`,
  }[langue];
}

/** Exercices propres à la boutique (burpees, curl-up…), avec leurs deux noms ; à insérer seulement s'ils manquent. */
export function exercicesBoutique(p: Article, t: number): Ligne[] {
  return Object.entries(p.exercicesPerso).map(([cle, e]) => ({
    id: `bq:${cle}`, nom: e.nom.fr, nom_norm: normaliser(e.nom.fr), nom_en: e.nom.en, nom_en_norm: normaliser(e.nom.en), equipement: "poids_du_corps",
    poids_corps: 1, secondaires: "", perso: 1, nature: e.nature, allure: e.nature === "distance_duree" ? "km" : null, cree_le: t, maj_le: t,
  }));
}

export interface LignesRoutine {
  routine: Ligne;
  routine_exercices: Ligne[];
  routine_series: Ligne[];
  /** Notes de routine (zone, consigne du bloc), une par ligne qui en a. */
  notes: Ligne[];
}

/**
 * Une vraie routine typée depuis une séance du catalogue : ses lignes (séries, charges, plages, tempos, supersets) et les
 * zones en note de routine. `kg` : charge par bloc (null : reprise de la dernière séance).
 */
export function lignesRoutine(
  s: Seance,
  kg: (number | null)[],
  o: { planId: string | null; section: string | null; ordre: number; t: number; langue: Langue; id: () => string },
): LignesRoutine {
  const { langue, t } = o;
  const id = o.id();
  const r: LignesRoutine = {
    routine: {
      id, nom: texte(s.nom, langue), note: [s.note ? texte(s.note, langue) : null, noteEffort(s, langue)].filter(Boolean).join("\n") || null, ordre: o.ordre,
      section_id: o.section, type: s.type, format: s.format ?? null, format_valeur: s.formatValeur ?? null, plan_id: o.planId, cree_le: t, maj_le: t,
    },
    routine_exercices: [],
    routine_series: [],
    notes: [],
  };
  // Superset : le repos du tour est porté par le dernier membre, les autres enchaînent (règle de routines.ts).
  for (const [i, b] of s.blocs.entries()) {
    const ligne = o.id();
    const dernierDuGroupe = b.superset == null || s.blocs[i + 1]?.superset !== b.superset;
    r.routine_exercices.push({
      id: ligne, routine_id: id, exercice_id: idExercice(b.exo), position: i, groupe_superset: b.superset ?? null, nb_series: b.series,
      repos_s: dernierDuGroupe ? (b.reposS ?? 0) : 0, repos_transition_s: b.superset != null ? (b.transitionS ?? 0) : 0, plage_reps: b.repsMax ? 1 : 0,
      tempo: b.tempo ?? null, zone: b.zone ?? null, rir: b.rir ?? null,
    });
    for (let rang = 0; rang < b.series; rang++)
      r.routine_series.push({
        ligne_id: ligne, rang, kg: kg[i] ?? null, reps: b.repsParSerie ? b.repsParSerie[rang]! : (b.reps ?? null), duree_s: b.dureeS ?? null,
        distance_m: b.distanceM ?? null, type: "normale", reps_max: b.repsMax ?? null,
      });
    const note = noteBloc(b, langue)?.trim();
    if (note) r.notes.push({ id: o.id(), type: "routine", exercice_id: idExercice(b.exo), ligne_id: ligne, seance_id: null, texte: note, position: 0, cree_le: t, maj_le: t });
  }
  return r;
}

export interface LignesPlan extends Omit<LignesRoutine, "routine"> {
  plan: Ligne;
  exercices: Ligne[];
  routines: Ligne[];
  programmations: Ligne[];
}

/**
 * Démarrer un programme : le plan, ses routines (une par séance différente, une par charge pour un programme qui progresse),
 * leurs lignes et cibles, et une programmation « unique » par date. `charges` : charge de départ par exercice (slug du
 * programme). `ordre` : rang de la première routine ; `section` : section des routines.
 */
export function lignesPlan(
  p: Programme,
  o: OptionsDemarrage,
  charges: Record<string, number | null>,
  langue: Langue,
  x: { section: string | null; ordre: number; t: number; id: () => string },
): LignesPlan {
  const { poses } = calendrierPlan(p, o);
  const { routines, dates } = routinesDuPlan(p, poses, charges);
  const { t } = x;
  const planId = x.id();
  const out: LignesPlan = {
    plan: {
      id: planId, catalogue_id: p.id, catalogue_version: p.version, nom: texte(p.nom, langue), debut: o.debut, fin: poses[poses.length - 1]?.date ?? o.debut,
      jours: JSON.stringify([...new Set(o.jours)].sort()), heure: o.heure, nb_seances: poses.length, cree_le: t, maj_le: t,
    },
    exercices: exercicesBoutique(p, t),
    routines: [],
    routine_exercices: [],
    routine_series: [],
    notes: [],
    programmations: [],
  };
  let ordre = x.ordre;
  const idDe = new Map<string, string>();
  for (const r of routines) {
    const l = lignesRoutine(p.seances[r.seance]!, r.kg, { planId, section: x.section, ordre: ordre++, t, langue, id: x.id });
    idDe.set(r.cle, String(l.routine.id));
    out.routines.push(l.routine);
    out.routine_exercices.push(...l.routine_exercices);
    out.routine_series.push(...l.routine_series);
    out.notes.push(...l.notes);
  }
  for (const d of dates) {
    const regle: Regle = { freq: "unique", intervalle: 1, jours: [], date: d.date, heure: o.heure, debut: d.date };
    out.programmations.push({
      id: x.id(), routine_id: idDe.get(d.cle)!, texte: texteRegle(regle, langue), regle: JSON.stringify(regle), actif: 1, rappel_min: null, ordre: 0, cree_le: t, maj_le: t,
    });
  }
  return out;
}
