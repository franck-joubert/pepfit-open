// Grille des valeurs de la Nutrition (31/10) : les kcal ne sont jamais tronquées tant qu'il y a la place, y compris
// sur l'écran extérieur du Fold (412 dp) et en grande police système.
import { describe, expect, it } from "./attendu.ts";
import { COL, COL_MIN, COL_SUC, colonnesGrille, GOUTTIERE, KCAL_MIN } from "../src/ecrans/nutrition/grille.ts";

/** Contenu d'une carte repas : écran moins la marge de la carte (16) et son retrait (16), de chaque côté. */
const carte = (ecran: number) => ecran - 64;
const premiere = (largeur: number, echelle: number) => {
  const { col, suc } = colonnesGrille(largeur, echelle);
  return largeur - 3 * col - suc - 4 * GOUTTIERE;
};

describe("grille des valeurs", () => {
  it("garde 59 et 58 quand la place le permet (Fold ouvert, tablette)", () => {
    expect(colonnesGrille(640, 1)).toEqual({ col: COL, suc: COL_SUC });
    expect(colonnesGrille(0, 1)).toEqual({ col: COL, suc: COL_SUC });
  });

  it("laisse « 99 999 kcal » entier sur l'écran extérieur du Fold (412 dp)", () => {
    expect(premiere(carte(412), 1) >= KCAL_MIN).toBe(true);
    expect(premiere(carte(412), 1.3) >= KCAL_MIN * 1.3).toBe(true);
  });

  it("ne resserre pas une colonne sous « 1 020 »", () => {
    const { col } = colonnesGrille(carte(320), 1.3);
    expect(col).toBe(Math.floor(COL_MIN * 1.3));
  });

  it("au-delà de la police de l'appli, la colonne ne grandit pas (échelle bornée par l'appelant)", () => {
    expect(colonnesGrille(carte(412), 0.85)).toEqual(colonnesGrille(carte(412), 1));
  });
});
