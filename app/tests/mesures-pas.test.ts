// Page Pas (planche pas, NOTES § 5) : cumul horaire, rythme habituel à cette minute, avance, projection, objectif d'après
// tes pas, séries, statistiques d'une période, distance (rien sans taille), objectif lu dans les réglages.
import { describe, expect, it } from "./attendu.ts";
import { baseDeTest } from "./aide.ts";
import {
  choixObjectif, cumul, distanceKm, habituelA, lireObjectif, objectifProfil, projection, rythmeHabituel, series, statsPas,
} from "../src/ecrans/mesures/pas-calc.ts";
import { ecrireObjectifPas, lireObjectifPas } from "../src/ecrans/mesures/pas-donnees.ts";

// Planche : rythme habituel de 30 jours (cumul ≈ 8 410) et aujourd'hui heure par heure (6 248 à 16 h 42)
const HABITUEL = [10, 0, 0, 0, 0, 20, 160, 640, 980, 380, 300, 420, 960, 520, 330, 380, 470, 720, 610, 520, 400, 290, 180, 60];
const HEURES = [0, 0, 0, 0, 0, 0, 120, 690, 1310, 260, 210, 340, 1180, 690, 310, 420, 718];

describe("journée", () => {
  it("cumul : les heures sans donnée comptent pour 0", () => {
    expect(cumul([1, null, 2])).toEqual([1, 1, 3]);
  });
  it("avance et projection de la planche : +819 pas, ~9 170 ce soir", () => {
    const total = HEURES.reduce((a, b) => a + b, 0);
    expect(total).toBe(6248);
    const h = 16 + 42 / 60;
    expect(Math.round(total - habituelA(HABITUEL, h))).toBe(819);
    expect(Math.round(projection(total, HABITUEL, h) / 10) * 10).toBe(9170);
  });
  it("rythme habituel : moyenne par heure des seuls jours suivis", () => {
    const j1 = Array.from({ length: 24 }, (_, i) => (i === 8 ? 1000 : 0));
    const j2 = Array.from({ length: 24 }, (_, i) => (i === 8 ? 500 : i === 9 ? 200 : 0));
    const vide = Array.from({ length: 24 }, () => null);
    const r = rythmeHabituel([j1, j2, vide])!;
    expect(r[8]).toBe(750);
    expect(r[9]).toBe(100);
    expect(rythmeHabituel([vide])).toBeNull();
  });
});

describe("objectif", () => {
  it("d'après tes pas : moyenne + 10 %, arrondie à 500, bornée 6 000–12 000, dès 30 jours", () => {
    expect(objectifProfil(Array.from({ length: 29 }, () => 8000))).toBeNull();
    expect(objectifProfil(Array.from({ length: 30 }, () => 8377))!.objectif).toBe(9000);
    expect(objectifProfil([...Array.from({ length: 30 }, () => 3000), null])!.objectif).toBe(6000);
    expect(objectifProfil(Array.from({ length: 40 }, () => 20000))!.objectif).toBe(12000);
  });
  it("réglage illisible ou absent : 8 000 ; le choix courant", () => {
    expect(lireObjectif(null)).toBe(8000);
    expect(lireObjectif("abc")).toBe(8000);
    expect(lireObjectif("9500")).toBe(9500);
    expect(choixObjectif(8000, 9000)).toBe("defaut");
    expect(choixObjectif(9000, 9000)).toBe("profil");
    expect(choixObjectif(10500, 9000)).toBe("perso");
  });
  it("écrit et relu dans la base", async () => {
    const { db } = await baseDeTest();
    expect(await lireObjectifPas(db)).toBe(8000);
    await ecrireObjectifPas(db, 9500);
    expect(await lireObjectifPas(db)).toBe(9500);
  });
});

describe("séries et statistiques", () => {
  const J = (v: (number | null)[]) => v.map((x, i) => ({ jour: 1000 - i, v: x }));
  it("aujourd'hui pas encore à l'objectif : la série court jusqu'à hier ; un jour sans donnée la casse", () => {
    const s = series(J([6248, 9000, 8500, 4000, 9000, 9000, 9000, null, 9000]), 8000);
    expect(s.enCours).toBe(2);
    expect(s.record).toBe(3);
    expect(s.dernier).toBe(999);
  });
  it("aujourd'hui atteint : il compte", () => {
    expect(series(J([8000, 9000, 4000]), 8000).enCours).toBe(2);
    expect(series(J([4000, 4000]), 8000)).toEqual({ enCours: 0, record: 0, dernier: null });
  });
  it("période : total, moyenne et objectif atteint sur les seuls jours avec donnée", () => {
    const s = statsPas(J([6248, 4579, 10441, null, 7685, 10678, 7662]), 8000);
    expect(s.n).toBe(6);
    expect(s.total).toBe(47293);
    expect(s.atteints).toBe(2);
    expect(s.meilleur!.v).toBe(10678);
  });
  it("distance : taille × 0,415 ; rien sans taille", () => {
    expect(distanceKm(6248, 183)!.toFixed(1)).toBe("4.7");
    expect(distanceKm(6248, null)).toBeNull();
  });
});
