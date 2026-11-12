import type { TypeSerie } from "../db/types";
import { t } from "../i18n/index";
import { ErreurImport } from "./hevy-csv";

export interface SerieRoutineHevy {
  type: TypeSerie;
  kg: number | null;
  /** Répétitions visées, ou borne basse d'une plage. */
  reps: number | null;
  /** Borne haute d'une plage de répétitions ; null sinon. */
  repsMax: number | null;
  dureeS: number | null;
  distanceM: number | null;
}

export interface ExerciceRoutineHevy {
  nom: string;
  groupeSuperset: number | null;
  /** Repos après chaque série ; 0 si Hevy n'en donne pas. */
  reposS: number;
  note: string | null;
  series: SerieRoutineHevy[];
}

export interface RoutineHevy {
  /** Clé d'idempotence : id Hevy de la routine. */
  ref: string;
  titre: string;
  note: string | null;
  dossier: string | null;
  exercices: ExerciceRoutineHevy[];
}

const TYPES: Record<string, TypeSerie> = { normal: "normale", warmup: "echauffement", dropset: "degressive", failure: "rate" };

type Brut = Record<string, unknown>;
const objet = (v: unknown): Brut | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Brut) : null);
const liste = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const nombre = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const texte = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Routines au format de l'API Hevy v1 : `{routines, dossiers | routine_folders}`, une page `{routines}` ou une liste.
 * Ordre : dossiers dans leur ordre Hevy, routines dans l'ordre du fichier, celles sans dossier à la fin.
 * Lève ErreurImport si ce ne sont pas des routines Hevy.
 */
export function lireRoutinesHevy(contenu: string): { routines: RoutineHevy[]; erreurs: string[] } {
  let json: unknown;
  try {
    json = JSON.parse(contenu);
  } catch {
    throw new ErreurImport(t("profil.importPasRoutines"));
  }
  const racine = objet(json);
  const brutes = Array.isArray(json) ? json : liste(racine?.routines);
  if (brutes.length === 0 || !brutes.every((r) => objet(r) && Array.isArray(objet(r)!.exercises))) {
    throw new ErreurImport(t("profil.importRoutinesIncomplet"));
  }
  const dossiers = liste(racine?.dossiers ?? racine?.routine_folders)
    .map(objet)
    .filter((d): d is Brut => d !== null)
    .sort((a, b) => (nombre(a.index) ?? 0) - (nombre(b.index) ?? 0));
  const rangDossier = new Map(dossiers.map((d, i) => [d.id, i]));
  const nomDossier = new Map(dossiers.map((d) => [d.id, texte(d.title)]));

  const erreurs: string[] = [];
  const routines: (RoutineHevy & { rang: number })[] = [];
  for (const [n, brute] of brutes.entries()) {
    const r = objet(brute)!;
    const ref = r.id === undefined || r.id === null ? null : String(r.id);
    if (!ref) {
      erreurs.push(t("profil.importRoutineSansId", { n: n + 1 }));
      continue;
    }
    const exercices: ExerciceRoutineHevy[] = [];
    const exBruts = liste(r.exercises).map(objet).filter((e): e is Brut => e !== null);
    exBruts.sort((a, b) => (nombre(a.index) ?? 0) - (nombre(b.index) ?? 0));
    for (const e of exBruts) {
      const nom = texte(e.title);
      if (!nom) continue;
      const sets = liste(e.sets).map(objet).filter((s): s is Brut => s !== null);
      sets.sort((a, b) => (nombre(a.index) ?? 0) - (nombre(b.index) ?? 0));
      const series = sets.map((s): SerieRoutineHevy => {
        const plage = objet(s.rep_range);
        const debut = nombre(plage?.start);
        const fin = nombre(plage?.end);
        return {
          type: TYPES[String(s.type ?? "").toLowerCase()] ?? "normale",
          kg: nombre(s.weight_kg),
          reps: debut ?? nombre(s.reps),
          repsMax: debut !== null && fin !== null && fin > debut ? fin : null,
          dureeS: nombre(s.duration_seconds),
          distanceM: nombre(s.distance_meters),
        };
      });
      const groupe = nombre(e.superset_id);
      const ex: ExerciceRoutineHevy = { nom, groupeSuperset: groupe, reposS: nombre(e.rest_seconds) ?? 0, note: texte(e.notes), series };
      // Le même exercice deux fois de suite (échauffement puis séries de travail) : une seule ligne, séries bout à bout.
      const prec = exercices[exercices.length - 1];
      if (prec && groupe === null && prec.groupeSuperset === null && prec.nom === nom) {
        prec.series.push(...series);
        prec.reposS = Math.max(prec.reposS, ex.reposS);
        if (ex.note && ex.note !== prec.note) prec.note = prec.note ? `${prec.note}\n${ex.note}` : ex.note;
      } else exercices.push(ex);
    }
    // Un « superset » d'un seul exercice n'en est pas un ; dans un vrai, le repos du tour est celui du dernier exercice.
    const parGroupe = new Map<number, ExerciceRoutineHevy[]>();
    for (const e of exercices) if (e.groupeSuperset !== null) parGroupe.set(e.groupeSuperset, [...(parGroupe.get(e.groupeSuperset) ?? []), e]);
    for (const g of parGroupe.values()) {
      if (g.length < 2) g[0]!.groupeSuperset = null;
      else for (const e of g.slice(0, -1)) e.reposS = 0;
    }
    const dossier = r.folder_id ?? null;
    routines.push({
      ref: `hevy-routine:${ref}`,
      titre: texte(r.title) ?? "Routine",
      note: texte(r.notes),
      dossier: nomDossier.get(dossier) ?? null,
      exercices,
      rang: rangDossier.get(dossier) ?? dossiers.length,
    });
  }
  // Tri stable : l'ordre du fichier est gardé dans chaque dossier.
  routines.sort((a, b) => a.rang - b.rang);
  return { routines: routines.map(({ rang: _, ...r }) => r), erreurs };
}
