import type { TypeSerie } from "../db/types";
import { t } from "../i18n/index";
import { deMurale } from "../i18n/temps";
import { lireCsv } from "./csv";

export class ErreurImport extends Error {}

export interface SerieHevy {
  index: number;
  type: TypeSerie;
  kg: number | null;
  reps: number | null;
  distanceM: number | null;
  dureeS: number | null;
  rpe: number | null;
}

export interface ExerciceHevy {
  nom: string;
  groupeSuperset: number | null;
  note: string | null;
  series: SerieHevy[];
}

export interface SeanceHevy {
  /** Clé d'idempotence : titre + début tels qu'écrits dans le fichier. */
  ref: string;
  titre: string;
  debut: number;
  fin: number | null;
  description: string | null;
  exercices: ExerciceHevy[];
}

// Mois de l'export, en anglais (« Oct ») ou en français (« oct. », « févr. », « août ») selon la langue de Hevy : on compare
// les trois premières lettres sans accent. « juin » et « juil. » se départagent sur la quatrième.
const MOIS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MOIS_FR: Record<string, number> = { jan: 0, fev: 1, mar: 2, avr: 3, mai: 4, juin: 5, juil: 6, aou: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const sansAccent = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function moisHevy(mot: string): number {
  const m = sansAccent(mot).replace(/\.$/, "");
  const en = MOIS.indexOf(m.slice(0, 3));
  if (en >= 0 && !m.startsWith("jui")) return en;
  return MOIS_FR[m.slice(0, 4)] ?? MOIS_FR[m.slice(0, 3)] ?? -1;
}
const LB_EN_KG = 0.45359237;
const MILE_EN_M = 1609.344;
const TYPES: Record<string, TypeSerie> = { normal: "normale", warmup: "echauffement", dropset: "degressive", failure: "rate" };

/** « 25 Oct 2026, 10:58 » ou « 25 oct. 2026, 10:58 » (heure locale de l'appareil, comme l'export Hevy) -> ms ; null si illisible. */
export function dateHevy(s: string): number | null {
  const m = /^\s*(\d{1,2}) ([^\s\d,]+) (\d{4}),?(?: à)? (\d{1,2})[:h](\d{2})/.exec(s);
  if (m) {
    const mois = moisHevy(m[2]!);
    if (mois < 0) return null;
    return deMurale(new Date(Number(m[3]), mois, Number(m[1]), Number(m[4]), Number(m[5])));
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

function nombre(s: string | undefined): number | null {
  if (s === undefined || s.trim() === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const arrondir = (n: number) => Math.round(n * 100) / 100;

/** Séances d'un export CSV Hevy (kg ou lbs, km ou miles). Lève ErreurImport si ce n'est pas un export Hevy. */
export function lireExportHevy(texte: string): { seances: SeanceHevy[]; erreurs: string[] } {
  const lignes = lireCsv(texte);
  const entete = (lignes[0] ?? []).map((c) => c.trim().toLowerCase());
  const col = (nom: string) => entete.indexOf(nom);
  for (const requis of ["title", "start_time", "exercise_title"]) {
    if (col(requis) < 0) throw new ErreurImport(t("profil.importPasHevy"));
  }
  const [cTitre, cDebut, cFin, cDesc, cEx, cSuper, cNote, cIdx, cType, cKg, cLb, cReps, cKm, cMi, cDur, cRpe] = [
    "title", "start_time", "end_time", "description", "exercise_title", "superset_id", "exercise_notes", "set_index", "set_type",
    "weight_kg", "weight_lbs", "reps", "distance_km", "distance_miles", "duration_seconds", "rpe",
  ].map(col) as number[];
  const get = (l: string[], c: number) => (c >= 0 ? (l[c] ?? "") : "");

  const seances = new Map<string, SeanceHevy>();
  const erreurs: string[] = [];
  const invalides = new Set<string>();
  for (const [n, l] of lignes.slice(1).entries()) {
    const titre = get(l, cTitre!).trim();
    const debutTxt = get(l, cDebut!);
    const cle = `${titre}|${debutTxt}`;
    if (invalides.has(cle)) continue;
    let s = seances.get(cle);
    if (!s) {
      const debut = dateHevy(debutTxt);
      if (debut === null) {
        invalides.add(cle);
        erreurs.push(t("profil.importDateIllisible", { ligne: n + 2, date: debutTxt, titre }));
        continue;
      }
      const fin = get(l, cFin!) ? dateHevy(get(l, cFin!)) : null;
      s = { ref: `hevy:${cle}`, titre: titre || "Séance", debut, fin, description: get(l, cDesc!).trim() || null, exercices: [] };
      seances.set(cle, s);
    }
    const nomEx = get(l, cEx!).trim();
    if (!nomEx) continue;
    const groupe = nombre(get(l, cSuper!));
    let e = s.exercices[s.exercices.length - 1];
    if (!e || e.nom !== nomEx || e.groupeSuperset !== groupe) {
      e = { nom: nomEx, groupeSuperset: groupe, note: get(l, cNote!).trim() || null, series: [] };
      s.exercices.push(e);
    }
    const lb = nombre(get(l, cLb!));
    const kg = nombre(get(l, cKg!)) ?? (lb === null ? null : arrondir(lb * LB_EN_KG));
    const km = nombre(get(l, cKm!));
    const mi = nombre(get(l, cMi!));
    const reps = nombre(get(l, cReps!));
    e.series.push({
      index: nombre(get(l, cIdx!)) ?? e.series.length,
      type: TYPES[get(l, cType!).trim().toLowerCase()] ?? "normale",
      kg,
      reps: reps === null ? null : Math.round(reps),
      distanceM: km !== null ? km * 1000 : mi !== null ? arrondir(mi * MILE_EN_M) : null,
      dureeS: nombre(get(l, cDur!)),
      rpe: nombre(get(l, cRpe!)),
    });
  }
  const out = [...seances.values()];
  for (const s of out) {
    for (const e of s.exercices) e.series.sort((a, b) => a.index - b.index);
    // Un « superset » d'un seul exercice n'en est pas un.
    const parGroupe = new Map<number, Set<string>>();
    for (const e of s.exercices) if (e.groupeSuperset !== null) parGroupe.set(e.groupeSuperset, (parGroupe.get(e.groupeSuperset) ?? new Set()).add(e.nom));
    for (const e of s.exercices) if (e.groupeSuperset !== null && (parGroupe.get(e.groupeSuperset)?.size ?? 0) < 2) e.groupeSuperset = null;
  }
  return { seances: out, erreurs };
}
