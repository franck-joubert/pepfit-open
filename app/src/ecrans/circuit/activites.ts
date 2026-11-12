import type { ActiviteCircuit } from "../../circuits/types";
import type { NomIcone } from "../../ui/Icone";

/** Le picto d'une activité de circuit (le Segmenté de la page, les puces du menu) : le VTT prend celui du vélo, comme sa durée. */
export function pictoActivite(a: ActiviteCircuit): NomIcone {
  return a === "randonnee" ? "pas" : a === "course" ? "course" : "velo";
}
