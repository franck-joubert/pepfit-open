// Pages VFC et Fréquence cardiaque au repos, point de couleur du jour (retour du 29/10) : ta normale robuste des
// 30 nuits d'avant (médiane, dispersion), quatre niveaux (vert mieux, bleu normal, orange un peu dessous, rouge nettement),
// neutre sous 7 nuits ; la même valeur n'a pas la même couleur chez deux personnes ; seuils du sommeil.
import { describe, expect, it } from "./attendu.ts";
import { ecartFavorable, niveauNuit, normaleAu, nuitBonne, phraseCoeur, referenceRobuste } from "../src/ecrans/mesures/coeur-calc.ts";
import { niveauSommeil } from "../src/ecrans/mesures/niveau-point.ts";
import { decaler, minuit } from "../src/ecrans/mesures/periodes.ts";

const J = minuit(new Date(2026, 9, 29, 9).getTime());
/** Nuits des jours d'avant J (la première = la veille). */
const nuits = (l: readonly number[]) => new Map(l.map((v, i) => [decaler(J, -1 - i), v]));
// Alex : VFC haute (médiane ~88 ms), qui descend parfois vers 70
const ALEX = [92, 78, 101, 88, 71, 97, 90, 83, 104, 86, 74, 95, 89, 81, 99, 76, 93, 87, 96, 80, 106, 85, 91, 72, 98, 84, 90, 102, 79, 88];
// Camille : VFC plus basse (médiane ~45 ms), qui descend parfois à 30
const SAM = [45, 38, 52, 30, 48, 41, 55, 35, 47, 50, 33, 44, 58, 40, 46, 37, 49, 42, 60, 36, 47, 43, 51, 31, 45, 39, 53, 44, 48, 41];

describe("ta normale et le point de la nuit", () => {
  it("Alex : 85 ms est dans sa normale (bleu), 100 mieux (vert), 60 nettement dessous (rouge)", () => {
    const n = normaleAu("vfc", nuits(ALEX), J)!;
    expect(Math.round(n.centre)).toBe(88);
    expect(niveauNuit("vfc", 85, n)).toBe("normal");
    expect(niveauNuit("vfc", 100, n)).toBe("mieux");
    expect(niveauNuit("vfc", 60, n)).toBe("tresBas");
  });
  it("Camille : 60 ms est meilleur que d'habitude (vert) ; la même valeur n'a pas la même couleur chez Alex", () => {
    const n = normaleAu("vfc", nuits(SAM), J)!;
    expect(Math.round(n.centre)).toBe(44);
    expect(niveauNuit("vfc", 60, n)).toBe("mieux");
    expect(niveauNuit("vfc", 44, n)).toBe("normal");
    expect(niveauNuit("vfc", 60, normaleAu("vfc", nuits(ALEX), J))).toBe("tresBas");
  });
  it("orange : un peu en dessous (entre 0,5 et 1 dispersion sous ta normale)", () => {
    const n = normaleAu("vfc", nuits(ALEX), J)!;
    const v = n.centre * Math.exp(-0.75 * n.dispersion);
    expect(niveauNuit("vfc", v, n)).toBe("bas");
    expect(Math.abs(ecartFavorable("vfc", v, n) + 0.75) < 1e-9).toBe(true);
  });
  it("FC au repos : plus basse = mieux ; plancher de 2 bpm de dispersion (une FC stable ne rougit pas pour 2 bpm)", () => {
    const fc = [45, 44, 46, 45, 43, 47, 45, 44, 46, 45, 44, 45, 46, 43, 45, 44, 47, 45, 46, 44, 45, 45, 43, 46, 44, 45, 46, 44, 45, 45];
    const n = normaleAu("fc", nuits(fc), J)!;
    expect(n.centre).toBe(45);
    expect(n.dispersion).toBe(2);
    expect(niveauNuit("fc", 42, n)).toBe("mieux");
    expect(niveauNuit("fc", 46, n)).toBe("normal");
    expect(niveauNuit("fc", 47, n)).toBe("bas");
    expect(niveauNuit("fc", 50, n)).toBe("tresBas");
    expect(phraseCoeur("fc", 50, n)).toBe("hausse");
    expect(nuitBonne("fc", 46, n)).toBe(true);
    expect(nuitBonne("fc", 47, n)).toBe(false);
  });
  it("moins de 7 nuits : pas de normale, point neutre", () => {
    expect(normaleAu("vfc", nuits(ALEX.slice(0, 6)), J)).toBeNull();
    expect(niveauNuit("vfc", 85, normaleAu("vfc", nuits(ALEX.slice(0, 6)), J))).toBe("neutre");
    expect(niveauNuit("vfc", 85, normaleAu("vfc", nuits(ALEX.slice(0, 7)), J))).not.toBe("neutre");
    expect(niveauNuit("vfc", null, normaleAu("vfc", nuits(ALEX), J))).toBe("neutre");
  });
  it("une nuit aberrante (VFC à 20 ms) ne déplace pas ta normale", () => {
    const sans = normaleAu("vfc", nuits(ALEX), J)!;
    const avec = normaleAu("vfc", nuits([...ALEX.slice(0, 29), 20]), J)!;
    expect(Math.abs(avec.centre - sans.centre) < 1).toBe(true);
    expect(Math.abs(avec.dispersion - sans.dispersion) < 0.02).toBe(true);
  });
  it("référence robuste : médiane et 1,4826 × écart absolu médian, au moins le plancher", () => {
    expect(referenceRobuste([1, 2, 3, 4, 100], 0)).toEqual({ centre: 3, dispersion: 1.4826 });
    expect(referenceRobuste([5, 5, 5, 5], 2).dispersion).toBe(2);
  });
});

describe("point du sommeil", () => {
  it("performance : vert dès 85 %, bleu de 67 à 84, orange de 34 à 66, rouge jusqu'à 33, neutre sans %", () => {
    expect(niveauSommeil(85)).toBe("mieux");
    expect(niveauSommeil(84)).toBe("normal");
    expect(niveauSommeil(67)).toBe("normal");
    expect(niveauSommeil(66)).toBe("bas");
    expect(niveauSommeil(34)).toBe("bas");
    expect(niveauSommeil(33)).toBe("tresBas");
    expect(niveauSommeil(null)).toBe("neutre");
  });
});
