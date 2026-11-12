import type { ChampSerie, LigneRoutineDetail, Serie, TypeSerie } from "../db/api";
import { charge, distanceTexte, plageTexte, serieNatureTexte, tempsTexte, type Unite } from "./format";

/** Une case de la page d'une routine : la cible réglée (`vise`), sinon ce que la séance reprendra du précédent. */
export interface CaseLecture {
  champ: ChampSerie;
  texte: string;
  vise: boolean;
}

export interface SerieLecture {
  type: TypeSerie;
  precedent: string;
  cases: CaseLecture[];
}

const VIDE = "–";

function texteChamp(champ: ChampSerie, v: { kg: number | null; reps: number | null; duree_s: number | null; distance_m: number | null }, u: Unite): string {
  if (champ === "kg") return charge(v.kg, u);
  if (champ === "reps") return v.reps != null ? String(v.reps) : "";
  if (champ === "duree_s") return tempsTexte(v.duree_s);
  return distanceTexte(v.distance_m);
}

/**
 * Séries d'une ligne de routine telles que la séance les montrera : « Précédent » de la dernière séance
 * (la k-ième série hors échauffement face à la k-ième d'alors), cases = cible de la routine, sinon le précédent repris.
 */
export function seriesLecture(ligne: LigneRoutineDetail, precedent: Serie[], champs: readonly ChampSerie[], u: Unite): SerieLecture[] {
  let k = 0;
  return ligne.cibles.map((c) => {
    const p = c.type === "echauffement" ? undefined : precedent[k++];
    const prec = p ? serieNatureTexte(champs, p, u) || VIDE : VIDE;
    const cases = champs.map((champ): CaseLecture => {
      if (champ === "reps" && ligne.plage_reps) {
        const plage = plageTexte(c.reps, c.reps_max);
        if (plage) return { champ, texte: plage.replace("-", "–"), vise: true };
      }
      const vise = texteChamp(champ, c, u);
      if (vise) return { champ, texte: vise, vise: true };
      const repris = p ? texteChamp(champ, p, u) : "";
      return { champ, texte: repris || VIDE, vise: false };
    });
    return { type: c.type, precedent: prec, cases };
  });
}
