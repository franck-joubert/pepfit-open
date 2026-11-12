import { kcalObjectif, type CleMacro, type Objectif } from "./calculs";

/** Ce qu'il reste d'une valeur à son objectif : jamais négatif, `atteint` dès que l'objectif est rempli ou franchi. */
export function resteDe(valeur: number, cible: number): { reste: number; atteint: boolean } {
  const r = Math.round(cible) - Math.round(valeur);
  return r > 0 ? { reste: r, atteint: false } : { reste: 0, atteint: true };
}

/** Macros du bloc « Il reste » : le sucre n'y est pas (08/11), ni les fibres et l'eau (leurs barres sont au-dessus des repas). */
export const MACROS_RESTE = ["proteines", "glucides", "lipides"] as const satisfies readonly Exclude<CleMacro, "kcal" | "sucres">[];

export type ResteDuJour = { kcal: { reste: number; atteint: boolean }; macros: Record<(typeof MACROS_RESTE)[number], number> };

export function resteDuJour(total: Record<CleMacro, number>, objectif: Objectif): ResteDuJour {
  return {
    kcal: resteDe(total.kcal, kcalObjectif(objectif)),
    macros: { proteines: resteDe(total.proteines, objectif.proteines).reste, glucides: resteDe(total.glucides, objectif.glucides).reste, lipides: resteDe(total.lipides, objectif.lipides).reste },
  };
}

/** Le bloc ne se montre qu'aujourd'hui (ni un jour passé, ni un jour à venir : rien pour le futur), avec les totaux et les objectifs visibles. */
export function blocResteVisible({ jour, aujourdhui, objectif, chiffres }: { jour: string; aujourdhui: string; objectif: Objectif | null | undefined; chiffres: boolean }): boolean {
  return !!objectif && chiffres && jour === aujourdhui;
}
