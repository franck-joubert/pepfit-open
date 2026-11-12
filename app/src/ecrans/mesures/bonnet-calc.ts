// Tour de dos et bonnet (planche articulations, D10 à D14, validée le 03/11) : fonctions pures, sans base ni React
// Native (testées dans tests/bonnet.test.ts). Rangés dans « mensurations » (D11) : « bonnet » vaut 0 pour « Pas de poitrine ou
// très petite », 1 à 9 pour AA à H ; « tour_dos » est le tour sous la poitrine en cm, la taille française moins 15 (85 → 70).
// Ils ne servent qu'au dessin du personnage : jamais partagés au coach (D12), jamais exposés à l'IA (docs/PARITE-MCP.md).

/** Les deux types de « mensurations » du soutien-gorge, à part des tours (ni page de tour, ni parcours, ni IA). */
export const TYPES_SOUTIEN = ["bonnet", "tour_dos"] as const;
export type TypeSoutien = (typeof TYPES_SOUTIEN)[number];

/** Bonnets dans l'ordre de la valeur rangée (1 = AA … 9 = H) ; 0 = pas de poitrine ou très petite. */
export const BONNETS = ["AA", "A", "B", "C", "D", "E", "F", "G", "H"] as const;
/** « DD » (03/11) : le volume d'un E, tenu comme un D (poitrine souvent refaite). Valeur 10 pour ne rien renuméroter ; il s'affiche entre D et E. */
export const BONNET_DD = 10;
export type Bonnet = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
/** Les choix dans l'ordre où on les lit : lettre et valeur enregistrée. */
export const CHOIX_BONNET: readonly { lettre: string; v: Bonnet }[] = [
  ...BONNETS.slice(0, 5).map((lettre, i) => ({ lettre, v: (i + 1) as Bonnet })),
  { lettre: "DD", v: BONNET_DD },
  ...BONNETS.slice(5).map((lettre, i) => ({ lettre, v: (i + 6) as Bonnet })),
];
export const PAS_DE_POITRINE = 0;

/** Tailles françaises proposées en puces (D14) : de 70 à 120, de 5 en 5. */
export const TAILLES_DOS = [70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120] as const;
/** Taille française = tour de dos (sous la poitrine) + 15. */
const ECART_TAILLE_FR = 15;
/** Tour de dos plausible (cm) : en dehors, la valeur est ignorée, comme une donnée illisible. */
const DOS_MIN = 50;
const DOS_MAX = 120;

/** Ce que la feuille saisit : `bonnet` 0 à 9, `tourDos` en cm (null : « si tu le connais »). */
export interface Soutien {
  bonnet: Bonnet;
  tourDos: number | null;
}

export const estBonnet = (v: unknown): v is Bonnet => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10;
export const tourDosValide = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= DOS_MIN && v <= DOS_MAX;

/** Taille française (85) → tour de dos rangé (70). */
export const tourDosDeTaille = (tailleFr: number) => tailleFr - ECART_TAILLE_FR;
/** Tour de dos rangé (70) → taille française (85), arrondie au 5 le plus proche (les puces). */
export const tailleDeTourDos = (cm: number) => Math.round((cm + ECART_TAILLE_FR) / 5) * 5;

/** Lettre du bonnet (« B ») ; null pour 0 (pas de poitrine). */
export const lettreBonnet = (b: Bonnet): string | null => (b === PAS_DE_POITRINE ? null : b === BONNET_DD ? "DD" : BONNETS[b - 1]!);

/** Valeur affichée (D14) : « 85 B », « B » sans tour de dos ; null pour « pas de poitrine » (l'écran dit « Très petite ou aucune »). */
export function texteSoutien(s: Soutien): string | null {
  const l = lettreBonnet(s.bonnet);
  if (l == null) return null;
  return s.tourDos != null ? `${tailleDeTourDos(s.tourDos)} ${l}` : l;
}

/**
 * Écart entre le tour de poitrine et le tour de dessous, en cm, d'après la norme EN 13402-3 (D13) : AA 10 à 12, A 12 à 14,
 * puis 2 cm par bonnet jusqu'à H 26 à 28 ; « aucune » : moins de 10 (de 0 à 10). `milieu` est le volume de référence.
 */
export function ecartBonnet(b: Bonnet): { min: number; max: number; milieu: number } {
  if (b === PAS_DE_POITRINE) return { min: 0, max: 10, milieu: 5 };
  const min = 8 + 2 * (b === BONNET_DD ? 6 : b); // DD : l'écart d'un E
  return { min, max: min + 2, milieu: min + 1 };
}

/** Lignes lues dans « mensurations » → la dernière saisie : le bonnet le plus récent et le tour de dos de la même saisie. */
export function soutienDe(lignes: readonly { type: string; date: number; valeur: number }[]): (Soutien & { date: number }) | null {
  let b: { date: number; valeur: number } | null = null;
  for (const l of lignes) if (l.type === "bonnet" && estBonnet(l.valeur) && (!b || l.date > b.date)) b = l;
  if (!b) return null;
  // le tour de dos d'une saisie plus ancienne ne vaut plus : la feuille écrit les deux ensemble, à la même date
  const d = lignes.find((l) => l.type === "tour_dos" && l.date === b.date && tourDosValide(l.valeur));
  return { bonnet: b.valeur as Bonnet, tourDos: d?.valeur ?? null, date: b.date };
}

/** La saisie n'est proposée qu'aux femmes et à « Non précisé » (D10). */
export const soutienPropose = (sexe: "h" | "f" | null) => sexe !== "h";
