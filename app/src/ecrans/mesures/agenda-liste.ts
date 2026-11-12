// Calculs de la page agenda des mesures (AgendaPage.tsx, retour du 29/10, point 5), sans React Native : les mois
// lus en remontant (un à la fois, jusqu'au mois du premier jour de l'historique), le regroupement de la vue liste (de la plus
// récente à la plus ancienne, par mois) et les points de la vue mois (ui/PageMois) ; le jour passé par la route d'une page de mesure (agenda,
// case de la page Santé). Tests : tests/mesures-agenda.test.ts.
import { debutMois, minuit } from "./periodes";

/** Le mois d'avant `mois` s'il reste de l'historique (le mois de `premier` compris) ; null sinon, ou sans historique. */
export function moisAvant(mois: number, premier: number | null): number | null {
  if (premier == null) return null;
  const p = debutMois(mois, -1);
  return p >= debutMois(premier, 0) ? p : null;
}

/** Vue liste : les entrées de la plus récente à la plus ancienne, groupées par mois (le plus récent d'abord). */
export function grouperParMois<T extends { date: number }>(entrees: readonly T[]): { mois: number; entrees: T[] }[] {
  const l: { mois: number; entrees: T[] }[] = [];
  for (const e of [...entrees].sort((a, b) => b.date - a.date)) {
    const m = debutMois(e.date, 0);
    const der = l[l.length - 1];
    if (der && der.mois === m) der.entrees.push(e);
    else l.push({ mois: m, entrees: [e] });
  }
  return l;
}

/** Vue mois : un point par jour qui a une entrée ; vrai (plein) si l'une des entrées du jour est « bonne ». */
export function pointsParJour(entrees: readonly { date: number; bon: boolean }[]): Map<number, boolean> {
  const m = new Map<number, boolean>();
  for (const e of entrees) {
    const j = minuit(e.date);
    m.set(j, (m.get(j) ?? false) || e.bon);
  }
  return m;
}

/** Jour passé par la route d'une page de mesure (`jour`, en ms) ; null sans lui ou illisible. */
export function jourDeRoute(v: string | string[] | undefined): number | null {
  const x = Array.isArray(v) ? v[0] : v;
  const n = Number(x);
  return x != null && x !== "" && Number.isFinite(n) && n > 0 ? n : null;
}
