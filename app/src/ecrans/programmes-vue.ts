// Textes des programmes typés (planche idee-programmes, 28/10) : résumé du format d'un WOD, détail d'une carte, création.
import { creerRoutine } from "../db/depots/routines";
import type { Executeur } from "../db/executeur";
import { VALEUR_DEFAUT, vocabulaire, type FormatWod, type TypeProgramme } from "../db/programmes";
import { t, tp } from "../i18n/index";
import { approx, dureeCourte, pluriel } from "./format";

/** « AMRAP 12 min », « EMOM 10 min », « For time · 20 min max », « 5 rounds » ; null sans format. */
export function resumeFormat(format: FormatWod | null, valeur: number | null): string | null {
  if (!format) return null;
  const v = valeur ?? VALEUR_DEFAUT[format];
  if (format === "rounds") return tp("programmes.nbRounds", v);
  if (format === "fortime") return t("programmes.resume.cap", { duree: dureeCourte(v) });
  return t("programmes.resume.duree", { format: t(`programmes.format.${format}`), duree: dureeCourte(v) });
}

/** Valeur affichée à droite d'une carte : le format d'un WOD, sinon la durée estimée « ~ 45 min ». */
export function metaCarte(r: { format: FormatWod | null; formatValeur: number | null; dureeS: number }): string {
  return resumeFormat(r.format, r.formatValeur) ?? approx(dureeCourte(r.dureeS));
}

/** Détail d'une carte : « 18 séries · … » en musculation, « 4 mouvements · … » en cross training, « 3 postures · … » en mobilité. */
export function detailCarte(r: { type: TypeProgramme; series: number; exercices: { nom: string }[] }): string {
  const noms = r.exercices.map((e) => e.nom).join(", ");
  const n = r.exercices.length;
  const tete = r.type === "cross" ? tp("programmes.nbMouvements", n) : r.type === "mobilite" ? tp("programmes.nbPostures", n) : pluriel(r.series, "communs.serie");
  return `${tete}, ${noms}`;
}

/** Crée un programme vide du type, sous son nom par défaut (« Nouveau WOD »), un WOD en AMRAP 12 min (planche). */
export function creerProgramme(db: Executeur, type: TypeProgramme): Promise<string> {
  const format = type === "cross" ? "amrap" : null;
  return creerRoutine(db, t(vocabulaire(type).nomDefaut), [], undefined, { type, format, formatValeur: format ? VALEUR_DEFAUT[format] : null });
}
