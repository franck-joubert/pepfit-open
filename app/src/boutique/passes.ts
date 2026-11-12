// Programmes passés et mois (planche sport-programmes-routines v2, A2), sans base ni React Native (tests/programmes-passes.test.ts).
import { deMurale, formater } from "../i18n/temps";
import type { PlanEnCours } from "./donnees";

/** « mars » cette année, « sept. 2025 » une autre année. */
export function moisDe(jour: string, aujourdhui: string): string {
  const [a, m, j] = jour.split("-").map(Number) as [number, number, number];
  const d = deMurale(new Date(a, m - 1, j, 12, 0));
  return jour.slice(0, 4) === aujourdhui.slice(0, 4) ? formater(d, { month: "long" }) : formater(d, { month: "short", year: "numeric" });
}

/**
 * Programmes passés de la page Programmes (A2) : un par programme du catalogue, le plus récent d'abord ; « Terminé 2 fois »
 * quand il a été fini plusieurs fois (`fois`), « Arrêté semaine 5 » quand le dernier suivi a été arrêté.
 */
export function plansPasses(suivis: readonly PlanEnCours[]): (PlanEnCours & { fois: number })[] {
  const passes = suivis.filter((p) => p.fini || p.arreteLe != null);
  const vus = new Map<string, PlanEnCours & { fois: number }>();
  for (const p of passes) {
    const d = vus.get(p.catalogueId);
    if (!d) vus.set(p.catalogueId, { ...p, fois: p.fini ? 1 : 0 });
    else if (p.fini) d.fois++;
  }
  return [...vus.values()];
}
