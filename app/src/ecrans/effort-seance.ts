// Effort en séance (planche programmes-charges, variante B validée le 29/10) : ce que la séance d'un programme écrit sous
// l'exercice et entre les séries. Pur, testé par tests/effort-seance.test.ts : la ligne du poids proposé (« + 2,5 kg : 6
// répétitions à toutes les séries la dernière fois. »), la ligne d'essai d'une première séance (« Encore facile : essaie
// 30 kg. ») et le mot écrit sous les répétitions d'une série cochée (« dur »).
import { essaiSuivant, materielDe, motDeRir, rirDeMot, rirDeRpe, type MotEffort } from "../boutique/poids";
import type { EffortExercice } from "../db/depots/effort";
import type { Serie } from "../db/types";
import { minuscule, t } from "../i18n/index";
import { charge, type Unite } from "./format";

export type IconeLigne = "hautFleche" | "basFleche" | "balance" | "check" | "page";
export interface LigneEffort {
  icone: IconeLigne;
  texte: string;
  /** Poids trouvé : en vert. */
  ok?: boolean;
}

const kgTexte = (kg: number, u: Unite) => `${charge(kg, u)} ${u}`;
const ecartTexte = (d: number, u: Unite) => `${d > 0 ? "+" : "−"} ${kgTexte(Math.abs(d), u)}`;

/** Ligne du poids proposé, sous l'exercice, tant qu'aucune série n'est cochée ; null sans proposition. */
export function ligneProposition(effort: EffortExercice | null | undefined, series: readonly Pick<Serie, "faite" | "kg">[], u: Unite): LigneEffort | null {
  const p = effort?.proposition;
  if (!p || series.some((x) => x.faite)) return null;
  const reps = effort!.cible.repsMax ?? effort!.cible.reps;
  switch (p.raison) {
    case "haut":
    case "facile":
      return { icone: "hautFleche", texte: t(`seance.propose.${p.raison}`, { ecart: ecartTexte(p.kg - p.avant, u), reps }) };
    case "rate":
      return { icone: "basFleche", texte: t("seance.propose.rate", { ecart: ecartTexte(p.kg - p.avant, u), reps: effort!.cible.reps }) };
    case "dur":
      return { icone: "balance", texte: t("seance.propose.dur") };
    case "garde":
      return { icone: "balance", texte: t("seance.propose.garde", { reps }) };
  }
}

/**
 * Ligne d'essai d'un exercice à découvrir, après la dernière série cochée dont l'effort est dit : le poids de la série
 * suivante (essaiSuivant), ou « C'est ton poids ». `apres` : id de cette série (la ligne se pose dessous). null sinon.
 */
export function ligneEssai(
  effort: EffortExercice | null | undefined,
  series: readonly Pick<Serie, "id" | "faite" | "kg" | "reps" | "rpe" | "type">[],
  equipement: string | null,
  u: Unite,
  paliers?: readonly number[] | null,
): (LigneEffort & { apres: string }) | null {
  if (!effort?.decouverte) return null;
  const faites = series.filter((x) => x.faite && x.type === "normale");
  const x = faites[faites.length - 1];
  const mot = x ? motDeRir(rirDeRpe(x.rpe)) : null;
  if (!x || !mot || x.kg == null || !(x.kg > 0) || x.reps == null) return null;
  const e = essaiSuivant({ kg: x.kg, reps: x.reps, ...rirDeMot(mot) }, effort.cible, materielDe(equipement), paliers);
  if (e.etat === "trouve") return { apres: x.id, icone: "check", ok: true, texte: t("seance.essai.trouve", { kg: kgTexte(e.kg, u) }) };
  return { apres: x.id, icone: e.etat === "monte" ? "hautFleche" : "basFleche", texte: t(`seance.essai.${e.etat}`, { kg: kgTexte(e.kg, u) }) };
}

/** Mot écrit sous les répétitions d'une série cochée dont l'effort est dit (« dur ») ; undefined sinon. */
export function motSousReps(x: Pick<Serie, "faite" | "rpe">): string | undefined {
  const m = x.faite ? motDeRir(rirDeRpe(x.rpe)) : null;
  return m ? minuscule(t(`seance.effort.${m}`)) : undefined;
}

/** Les quatre réponses de « C'était comment ? », avec leur traduction en répétitions ; `vise` : celle de la cible. */
export function choixEffort(rirVise: number | null): { mot: MotEffort; libelle: string; sous: string; vise: boolean }[] {
  const vise = rirVise == null ? null : motDeRir(rirVise);
  return (["max", "dur", "bien", "facile"] as const).map((mot) => ({
    mot,
    libelle: t(`seance.effort.${mot}`),
    sous: t(`seance.effort.${mot}Sous`),
    vise: mot === vise,
  }));
}
