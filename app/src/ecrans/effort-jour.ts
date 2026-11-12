// Minutes de FC par zone d'une séance : l'entrée de la charge d'Edwards de l'Effort pepfit (effort-pepfit.ts). Pur (sans React
// Native ni base) : testé par tests/effort-jour.test.ts. L'effort du jour sur 21 (strain de Whoop, TRIMP de Banister) a été
// remplacé par l'Effort pepfit le 31/10 (planche effort-pepfit).
import { bornesDe, type RefZones } from "./zones-fc";

/** Trou au-delà duquel un échantillon de FC ne couvre plus le temps qui suit (s), comme le bloc d'effort : celui du capteur en
 * direct. La FC d'une montre (Santé Connect, Whoop) peut être plus espacée : CHARGE_EFFORT.trouFcS, selon la source (C3). */
export const TROU_FC_S = 10;

/** FC de repos prise quand on n'en connaît aucune (adulte moyen). */
export const FC_REPOS_DEFAUT = 60;

/** Minutes passées dans Z1 à Z5 (zones personnelles, ou tranches d'une FC max) ; sous Z1, rien n'est compté. */
export function minutesParZone(fc: readonly { s: number; bpm: number }[], fcMax: RefZones, trouS: number = TROU_FC_S): [number, number, number, number, number] {
  const b = bornesDe(fcMax);
  const m: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (let i = 0; i < fc.length; i++) {
    const e = fc[i]!;
    const suivant = fc[i + 1];
    const dureeS = suivant ? Math.min(trouS, Math.max(0, (suivant.s - e.s) / 1000)) : 1;
    let z = -1;
    for (let k = 4; k >= 0; k--) if (e.bpm >= b[k]!) { z = k; break; }
    if (z >= 0) m[z] = m[z]! + dureeS / 60;
  }
  return m;
}
