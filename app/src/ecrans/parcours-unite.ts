// Poids du parcours dans l'unité des réglages (revue finale n° 45), toujours enregistré en kg. En livres : une livre par
// cran (66 à 551 lb, les 30 à 250 kg des molettes) et des rythmes de 0,5 · 1 · 1,5 lb par semaine, plutôt que des kg
// convertis (« 154,3 », « 0,55 »).
import { depuisUnite, nombre, versUnite, type Unite } from "./format";
import { POIDS_MOLETTE, RYTHMES } from "./parcours-calc";

const lbEnKg = (lb: number) => Math.round(depuisUnite(lb, "lbs") * 1000) / 1000;
const POIDS_LBS = Array.from({ length: 486 }, (_, i) => lbEnKg(66 + i));
const RYTHMES_LBS = [0.5, 1, 1.5].map(lbEnKg);

/** Crans des molettes de poids et rythmes proposés (par semaine, sans signe), en kg, pour l'unité affichée. */
export const crans = (u: Unite): { poids: readonly number[]; rythmes: readonly number[] } =>
  u === "lbs" ? { poids: POIDS_LBS, rythmes: RYTHMES_LBS } : { poids: POIDS_MOLETTE, rythmes: RYTHMES };

/** Poids en kg écrit dans l'unité des réglages, sans l'unité : « 70,5 », « 155 ». */
export const poidsTexte = (kg: number, u: Unite) => nombre(versUnite(kg, u), 1);
