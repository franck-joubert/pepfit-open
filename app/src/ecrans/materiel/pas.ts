// Pas proposés par les pas à pas du matériel (plage, pile d'une machine) : on passe d'un pas courant au suivant.
export const PAS: readonly number[] = [0.5, 1, 1.25, 2, 2.5, 4, 5, 10, 15, 20];

/** Le pas courant voisin, dans le sens voulu (un pas hors liste rejoint le plus proche dans ce sens). */
export function pasSuivant(pas: number, sens: 1 | -1): number {
  if (sens > 0) return PAS.find((p) => p > pas + 1e-9) ?? PAS[PAS.length - 1]!;
  return [...PAS].reverse().find((p) => p < pas - 1e-9) ?? PAS[0]!;
}

/** Ajoute `delta` à une valeur sans dériver (centièmes), jamais sous `min`. */
export const pousser = (v: number, delta: number, min = 0): number => Math.max(min, Math.round((v + delta) * 100) / 100);
