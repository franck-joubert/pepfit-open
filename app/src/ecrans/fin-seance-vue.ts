// Fin de séance (refonte du 26/10) : calculs sans écran. Une carte par exercice qui bat un record (le plus parlant),
// avec l'ancien record pour l'écart ; l'écart de chaque exercice avec la fois précédente.
import type { RecordExercice, TypeRecord, TypeSerie } from "../db/types";
import { t } from "../i18n/index";
import { distanceTexte, nombre, pluriel, tempsTexte, versUnite, type Unite } from "./format";

/** Séance enregistrée ou abandonnée depuis la fin de séance : retour à l'onglet Sport, pas à l'Accueil (30/10). */
export const RETOUR_FIN_SEANCE = "/train";

/** Du plus parlant au moins parlant : une seule carte par exercice. */
export const PRIORITE: readonly TypeRecord[] = ["e1rm", "charge", "reps", "duree", "distance", "allure", "volume_serie"];

export interface CarteRecord {
  exerciceId: string;
  nom: string;
  type: TypeRecord;
  /** Série qui a battu le record (son texte sert pour « Meilleure série »). */
  serieId: string | null;
  valeur: number;
  /** Ancien record, ou null : premier record de l'exercice. */
  precedent: number | null;
}

/**
 * Cartes de record de la séance `seanceId` : pour chaque exercice dont une série a battu un record, le type le plus
 * parlant, sa valeur et l'ancien record (le dernier battu avant, dans une autre séance). `historiques` : records de
 * l'exercice, du plus récent au plus ancien (recordsExercice).
 */
export function cartesRecords(
  seanceId: string,
  exercices: readonly { id: string; nom: string; records: readonly TypeRecord[] }[],
  historiques: Readonly<Record<string, readonly RecordExercice[]>>,
): CarteRecord[] {
  const cartes: CarteRecord[] = [];
  for (const e of exercices) {
    const histo = historiques[e.id] ?? [];
    for (const type of PRIORITE) {
      if (!e.records.includes(type)) continue;
      const actuel = histo.find((r) => r.type === type && r.seance_id === seanceId);
      if (!actuel) continue;
      const avant = histo.find((r) => r.type === type && r.seance_id !== seanceId && r.atteint_le <= actuel.atteint_le);
      cartes.push({ exerciceId: e.id, nom: e.nom, type, serieId: actuel.serie_id, valeur: actuel.valeur, precedent: avant?.valeur ?? null });
      break;
    }
  }
  return cartes;
}

/** Libellé de la mesure d'une carte. */
export function mesureRecord(type: TypeRecord, assiste = false): string {
  return {
    e1rm: t("seance.record.e1rm"),
    charge: assiste ? t("seance.record.aide") : t("seance.record.charge"),
    reps: t("seance.record.reps"),
    duree: t("seance.record.duree"),
    distance: t("seance.record.distance"),
    allure: t("seance.record.allure"),
    volume_serie: t("seance.record.volumeSerie"),
    volume_seance: t("seance.record.volumeSeance"),
  }[type];
}

/** Valeur d'un record sans son unité, et son unité à part (« 104,5 » et « kg »). */
export function valeurRecord(type: TypeRecord, v: number, u: Unite): { valeur: string; unite: string } {
  if (type === "e1rm" || type === "charge") return { valeur: nombre(versUnite(v, u), 1), unite: u };
  if (type === "volume_serie" || type === "volume_seance") return { valeur: nombre(Math.round(versUnite(v, u)), 0), unite: u };
  if (type === "reps") return { valeur: String(v), unite: t("seance.record.unite") };
  if (type === "duree" || type === "allure") return { valeur: tempsTexte(v), unite: type === "allure" ? "/km" : "" };
  return { valeur: distanceTexte(v), unite: "" };
}

/** Écart avec l'ancien record, signé : « +2,5 kg », « +2 réps », « −0:05 » ; null au premier record. */
export function ecartRecord(c: Pick<CarteRecord, "type" | "valeur" | "precedent">, u: Unite): string | null {
  if (c.precedent == null) return null;
  const d = c.valeur - c.precedent;
  if (d === 0) return null;
  const signe = d > 0 ? "+" : "−";
  const a = Math.abs(d);
  const type = c.type;
  const texte =
    type === "e1rm" || type === "charge"
      ? `${nombre(versUnite(a, u), 1)} ${u}`
      : type === "volume_serie" || type === "volume_seance"
        ? `${nombre(Math.round(versUnite(a, u)), 0)} ${u}`
        : type === "reps"
          ? pluriel(a, "communs.rep")
          : type === "duree" || type === "allure"
            ? tempsTexte(a)
            : distanceTexte(a);
  return `${signe}${texte}`;
}

interface SerieComparee {
  type: TypeSerie;
  faite: number;
  kg: number | null;
  reps: number | null;
  precedent_kg: number | null;
  precedent_reps: number | null;
}

/**
 * Écart d'un exercice avec la fois précédente, en répétitions, quand les charges n'ont pas changé : « = », « +1 rép »,
 * « −2 réps ». Null sans précédent, ou si une charge a changé (les réps ne se comparent plus).
 */
export function ecartExercice(series: readonly SerieComparee[]): { texte: string; signe: -1 | 0 | 1 } | null {
  const comparees = series.filter((s) => s.faite && s.type !== "echauffement" && s.reps != null && s.precedent_reps != null);
  if (!comparees.length) return null;
  if (comparees.some((s) => (s.kg ?? 0) !== (s.precedent_kg ?? 0))) return null;
  const d = comparees.reduce((somme, s) => somme + s.reps! - s.precedent_reps!, 0);
  // Mêmes réps qu'à la séance précédente : un mot, pas « = » qui se lisait comme une poignée (audit du 28/10, n° 40).
  if (d === 0) return { texte: t("seance.fin.stable"), signe: 0 };
  return d > 0 ? { texte: `+${pluriel(d, "communs.rep")}`, signe: 1 } : { texte: `−${pluriel(-d, "communs.rep")}`, signe: -1 };
}

/** Meilleure série faite d'un exercice : le meilleur 1RM estimé, sinon le plus de réps, sinon la première. */
export function meilleureSerie<T extends { faite: number; type: TypeSerie; e1rm: number | null; reps: number | null }>(series: readonly T[]): T | null {
  const faites = series.filter((s) => s.faite && s.type !== "echauffement");
  const l = faites.length ? faites : series.filter((s) => s.faite);
  if (!l.length) return null;
  return l.reduce((m, s) => ((s.e1rm ?? 0) > (m.e1rm ?? 0) || ((s.e1rm ?? 0) === (m.e1rm ?? 0) && (s.reps ?? 0) > (m.reps ?? 0)) ? s : m));
}
