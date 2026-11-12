// Page agenda des mesures : mois lus en remontant jusqu'au premier jour, vue liste groupée par mois (la plus récente
// d'abord), points de la vue mois (plein si une entrée du jour est bonne).
import { describe, expect, it } from "./attendu.ts";
import { grouperParMois, jourDeRoute, moisAvant, pointsParJour } from "../src/ecrans/mesures/agenda-liste.ts";

const j = (a: number, m: number, d: number, h = 12) => new Date(a, m, d, h).getTime();
const debut = (a: number, m: number) => new Date(a, m, 1).getTime();

describe("agenda des mesures", () => {
  it("remonte un mois à la fois jusqu'au mois du premier jour", () => {
    expect(moisAvant(debut(2026, 9), j(2026, 7, 20))).toBe(debut(2026, 8));
    expect(moisAvant(debut(2026, 8), j(2026, 7, 20))).toBe(debut(2026, 7));
    expect(moisAvant(debut(2026, 7), j(2026, 7, 20))).toBe(null);
    expect(moisAvant(debut(2026, 0), j(2025, 10, 3))).toBe(debut(2025, 11));
    expect(moisAvant(debut(2026, 9), null)).toBe(null);
  });

  it("vue liste : de la plus récente à la plus ancienne, par mois", () => {
    const l = grouperParMois([
      { date: j(2026, 8, 30), n: 1 },
      { date: j(2026, 9, 2), n: 2 },
      { date: j(2026, 9, 28, 7), n: 3 },
      { date: j(2026, 9, 28, 19), n: 4 },
    ]);
    expect(l.map((x) => x.mois)).toEqual([debut(2026, 9), debut(2026, 8)]);
    expect(l[0]!.entrees.map((x) => x.n)).toEqual([4, 3, 2]);
    expect(l[1]!.entrees.map((x) => x.n)).toEqual([1]);
    expect(grouperParMois([])).toEqual([]);
  });

  it("vue mois : un point par jour, plein si une entrée est bonne", () => {
    const p = pointsParJour([
      { date: j(2026, 9, 27, 7), bon: false },
      { date: j(2026, 9, 27, 20), bon: true },
      { date: j(2026, 9, 26), bon: false },
    ]);
    expect(p.size).toBe(2);
    expect(p.get(new Date(2026, 9, 27).getTime())).toBe(true);
    expect(p.get(new Date(2026, 9, 26).getTime())).toBe(false);
  });

  it("jour passé par la route : un nombre de ms, sinon null", () => {
    expect(jourDeRoute("1793228400000")).toBe(1793228400000);
    expect(jourDeRoute(["1793228400000", "2"])).toBe(1793228400000);
    expect(jourDeRoute(undefined)).toBe(null);
    expect(jourDeRoute("")).toBe(null);
    expect(jourDeRoute("abc")).toBe(null);
  });
});
