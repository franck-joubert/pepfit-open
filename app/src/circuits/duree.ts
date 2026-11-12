// Durée d'un circuit (planche Circuits, D7) : calculée à l'affichage, jamais stockée, parce qu'elle dépend de l'activité choisie et que la
// formule peut changer sans migration. Marche : 4,5 km/h plus 1 h par 600 m de dénivelé positif (Naismith adoucie) ; course : 9 km/h plus
// 1 h par 900 m ; vélo (route, gravel) : 16 km/h plus 1 h par 500 m. Arrondie aux 5 minutes. La planche ne dit rien du VTT : il prend la
// formule du vélo (à trancher avec Alex).
import type { ActiviteCircuit } from "./types";

interface Allure {
  kmh: number;
  /** Mètres de dénivelé positif qui coûtent une heure de plus. */
  metresParHeure: number;
}

export const ALLURES: Record<ActiviteCircuit, Allure> = {
  randonnee: { kmh: 4.5, metresParHeure: 600 },
  course: { kmh: 9, metresParHeure: 900 },
  bicycling: { kmh: 16, metresParHeure: 500 },
  vtt: { kmh: 16, metresParHeure: 500 },
};

const PAS_MIN = 5;

/** Durée estimée en minutes, arrondie aux 5 minutes (5 au moins). Sans dénivelé connu : la distance seule. */
export function dureeEstimeeMin(distanceM: number, denivelePlusM: number | null, activite: ActiviteCircuit): number {
  const a = ALLURES[activite];
  const heures = Math.max(0, distanceM) / 1000 / a.kmh + Math.max(0, denivelePlusM ?? 0) / a.metresParHeure;
  return Math.max(PAS_MIN, Math.round((heures * 60) / PAS_MIN) * PAS_MIN);
}

/** « 1 h 05 » en deux parties pour l'affichage (le chiffre grand, l'unité petite) : `h` nul sous l'heure. */
export function partiesDuree(minutes: number): { h: number; min: number } {
  const m = Math.max(0, Math.round(minutes));
  return { h: Math.floor(m / 60), min: m % 60 };
}
