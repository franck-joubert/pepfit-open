// Page Énergie (planche pas) : solde visé tiré de l'objectif de poids, objectif tenu, jours sans journal hors des moyennes,
// cumul qui part de zéro, moyenne lissée du poids pour la balance, échelles des graphiques.
import { describe, expect, it } from "./attendu.ts";
import {
  bonneJournee, cumulSoldes, depenseMoyenne, echelleJour, echelleSolde, grapheApportsDepense, KCAL_KG, moyenneMois, motSolde, objectifSolde, poidsLisse, statsEnergie, tenu, variationBalance, type JourE,
} from "../src/ecrans/mesures/energie-stats.ts";

const J = 86_400_000;
const jourE = (jour: number, apports: number | null, depense: number): JourE => ({
  jour,
  apports,
  depense,
  comp: { bmr: 1931, sport: depense - 1931 - 300, neat: 100, digestion: 200 },
  solde: apports == null ? null : apports - depense,
  seances: [],
});

describe("objectif de solde", () => {
  it("−0,5 kg/sem. → −550 kcal/j ; sans cible ou à rythme nul : aucun objectif (P11)", () => {
    expect(objectifSolde(-0.5, 75)).toBe(-550);
    expect(objectifSolde(0.25, 80)).toBe(275);
    expect(objectifSolde(-0.5, null)).toBeNull();
    expect(objectifSolde(0, 75)).toBeNull();
    expect(objectifSolde(null, 75)).toBeNull();
  });
  it("tenu : perte → au moins aussi déficitaire ; prise → au moins ce surplus", () => {
    expect(tenu(-600, -550)).toBe(true);
    expect(tenu(-75, -550)).toBe(false);
    expect(tenu(300, 275)).toBe(true);
    expect(bonneJournee(-75, null)).toBe(true);
    expect(bonneJournee(149, null)).toBe(false);
    expect(motSolde(-75)).toBe("deficit");
    expect(motSolde(0.3)).toBe("equilibre");
    expect(motSolde(149)).toBe("surplus");
  });
});

describe("statistiques d'une période", () => {
  const l = [jourE(0, 2000, 2516), jourE(J, 2600, 3062), null, jourE(3 * J, null, 2400), jourE(4 * J, 2700, 2551)];
  const s = statsEnergie(l, -550)!;
  it("un jour sans journal ne compte nulle part, un jour sans bilan non plus", () => {
    expect(s.n).toBe(3);
    expect(s.sans).toBe(2);
    expect(s.cumul).toBe(-516 - 462 + 149);
    expect(Math.round(s.moy)).toBe(Math.round((-516 - 462 + 149) / 3));
    expect(s.app).toBe((2000 + 2600 + 2700) / 3);
  });
  it("tenu, au-dessus (dont surplus), déficits", () => {
    expect(s.tenu).toBe(0);
    expect(s.dessus).toBe(3);
    expect(s.surplus).toBe(1);
    expect(s.deficit).toBe(2);
    const sans = statsEnergie(l, null)!;
    expect(sans.tenu).toBe(0);
    expect(sans.dessus).toBe(0);
  });
  it("aucun journal : pas de statistiques", () => {
    expect(statsEnergie([null, jourE(0, null, 2400)], -550)).toBeNull();
    expect(moyenneMois([null])).toBeNull();
    expect(moyenneMois(l)!.solde).toBe(s.moy);
  });
  it("sans journal, la dépense reste : moyenne du mois et graphe des barres en Mois et Année (30/10)", () => {
    const sansJournal = [jourE(0, null, 2400), null, jourE(2 * J, null, 2600)];
    expect(statsEnergie(sansJournal, null)).toBeNull();
    const m = moyenneMois(sansJournal)!;
    expect(m.solde).toBeNull();
    expect(m.app).toBeNull();
    expect(m.dep).toBe(2500);
    expect(depenseMoyenne(sansJournal)!.n).toBe(2);
    expect(depenseMoyenne([null])).toBeNull();
    // un mois mêlé : solde et apports des jours de journal, dépense de tous les jours avec bilan
    expect(moyenneMois(l)!.dep).toBe((2516 + 3062 + 2400 + 2551) / 4);
    expect(grapheApportsDepense("mois", [null, null])).toBe(true);
    expect(grapheApportsDepense("annee", [null, -300])).toBe(false);
    expect(grapheApportsDepense("semaine", [-300])).toBe(true);
  });
  it("le cumul part de zéro et garde sa valeur les jours sans journal", () => {
    expect(cumulSoldes(l)).toEqual([-516, -978, -978, -978, -829]);
    expect((-829 / KCAL_KG).toFixed(2)).toBe("-0.11");
  });
});

describe("balance et échelles", () => {
  it("moyenne lissée du poids : 10 % par pesée, les jours sans pesée gardent la valeur, rien avant la première", () => {
    const pesees = [
      { date: 2 * J + 7 * 3_600_000, kg: 80 },
      { date: 3 * J + 7 * 3_600_000, kg: 79 },
      { date: 3 * J + 8 * 3_600_000, kg: 78 },
    ];
    const l = poidsLisse(pesees, [J, 2 * J, 3 * J, 4 * J], (j) => j + J);
    expect(l[0]).toBeNull();
    expect(l[1]).toBe(80);
    expect(l[2]!.toFixed(3)).toBe((80 + 0.1 * (79 - 80) + 0.1 * (78 - 79.9)).toFixed(3));
    expect(l[3]).toBe(l[2]);
    expect(variationBalance(l[1]!, l[3]!)!.toFixed(2)).toBe("-0.29");
    expect(variationBalance(null, 78)).toBeNull();
  });
  it("échelles : ±1 200 au moins, arrondi à 400 ; barres du jour 2 400 au moins", () => {
    expect(echelleSolde([-516, 149, null])).toBe(1200);
    expect(echelleSolde([-1400])).toBe(1600);
    expect(echelleJour([2630, 2705])).toBe(3200);
    expect(echelleJour([1200])).toBe(2400);
  });
});
