// Poids et masse grasse (planche pas, NOTES § 5) : moyenne lissée (10 % par relevé, jours sans relevé = dernière valeur),
// tendance sur 28 jours, dates estimées, chemin parcouru, ce qui a bougé, périodes état, résumé des cartes (base réelle).
import { describe, expect, it } from "./attendu.ts";
import { baseDeTest } from "./aide.ts";
import {
  axeEtat, bouge, colonnesPiste, chemin, dateDans, indicesEtiquettes, jourEtat, joursReleves, pente, periodeEtat, periodeEtatExiste, relevesEntre, serieJours, statsEtat, xDepuisFin, type Releve,
} from "../src/ecrans/mesures/corps-calc.ts";
import { ajouterGras, lireGras, lireObjectifPoids, lireResumeCorps, lireTours, memePesee, supprimerGras, tourAuJour } from "../src/ecrans/mesures/corps-donnees.ts";
import { decaler, minuit } from "../src/ecrans/mesures/periodes.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { ajouterMesures } from "../src/db/depots/mesures.ts";
import { ajouterMensuration } from "../src/db/depots/profil.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";

const proche = (a: number | null, b: number) => a != null && Math.abs(a - b) < 1e-6;
const MAINTENANT = new Date(2026, 9, 28, 16, 42).getTime();
const AUJ = minuit(MAINTENANT);
const r = (jours: number, valeur: number, manuel = false): Releve => ({ id: `r${jours}`, date: decaler(AUJ, -jours) + 7 * 3_600_000, valeur, manuel, origine: manuel ? null : "com.withings.wiscale2" });

describe("moyenne lissée", () => {
  it("10 % par relevé ; un jour sans pesée garde la dernière valeur", () => {
    const s = serieJours([r(3, 80), r(1, 79)], decaler(AUJ, -3), AUJ);
    expect(s.map((p) => p.v)).toEqual([80, null, 79, null]);
    expect(s[0]!.l).toBe(80);
    expect(s[1]!.l).toBe(80);
    expect(proche(s[2]!.l, 79.9)).toBe(true);
    expect(proche(s[3]!.l, 79.9)).toBe(true);
  });
  it("lissée depuis le premier relevé, même avant le début de la période", () => {
    const s = serieJours([r(10, 80), r(1, 78)], decaler(AUJ, -1), AUJ);
    expect(s.length).toBe(2);
    expect(proche(s[0]!.l, 79.8)).toBe(true);
  });
  it("deux relevés le même jour : le plus récent compte", () => {
    const s = serieJours([r(0, 80), { ...r(0, 79), id: "b", date: AUJ + 9 * 3_600_000 }], AUJ, AUJ);
    expect(s[0]!.v).toBe(79);
  });
});

describe("tendance et objectif", () => {
  it("pente : régression de la moyenne lissée, par semaine", () => {
    const l = Array.from({ length: 28 }, (_, i) => r(27 - i, 80 - 0.1 * i));
    const s = serieJours(l, decaler(AUJ, -27), AUJ);
    expect(pente(s)! < 0).toBe(true);
    expect(pente(serieJours([], AUJ, AUJ))).toBeNull();
  });
  it("date estimée au rythme ; jamais si le rythme ne va pas vers la cible", () => {
    const d = dateDans(78.6, 75, -0.5, MAINTENANT)!;
    expect(Math.round((d - MAINTENANT) / 86_400_000)).toBe(Math.round((3.6 / 0.5) * 7));
    expect(dateDans(78.6, 75, 0.2, MAINTENANT)).toBeNull();
    expect(dateDans(78.6, 75, null, MAINTENANT)).toBeNull();
  });
  it("chemin parcouru, borné de 0 à 1", () => {
    expect(proche(chemin(80.8, 78.6, 75), 2.2 / 5.8)).toBe(true);
    expect(chemin(80, 81, 75)).toBe(0);
    expect(chemin(80, 74, 75)).toBe(1);
  });
});

describe("ce qui a bougé", () => {
  it("gras perdu, maigre stable / perdu / rien de net", () => {
    expect(bouge(80, 79, 17, 15.7).phrase).toBe("gras-seul");
    const b = bouge(79.9, 78.6, 15.0, 14.2);
    expect(proche(b.gras, 78.6 * 0.142 - 79.9 * 0.15)).toBe(true);
    expect(b.phrase).toBe("gras-et-maigre");
    expect(bouge(80, 80, 15, 15.1).phrase).toBe("rien");
    expect(bouge(80, 81, 15, 16).phrase).toBe("prise");
  });
});

describe("périodes état", () => {
  const l = [r(100, 82), r(40, 80), r(20, 79.5), r(2, 78.2), r(1, 77.96)];
  it("mois : 30 jours finissant aujourd'hui ; stats sur les relevés", () => {
    const p = periodeEtat(l, "mois", 0, MAINTENANT);
    expect(p.pts.length).toBe(30);
    const s = statsEtat(p);
    expect(s.n).toBe(3);
    expect(s.min!.v).toBe(77.96);
    expect(s.max!.v).toBe(79.5);
    expect(s.variation! < 0).toBe(true);
  });
  it("tout : depuis le premier relevé ; pas de période d'avant", () => {
    const p = periodeEtat(l, "tout", 0, MAINTENANT);
    expect(p.pts.length).toBe(101);
    expect(periodeEtatExiste(l, "tout", 1, MAINTENANT)).toBe(false);
  });
  it("la période d'avant existe si elle a un relevé", () => {
    expect(periodeEtatExiste(l, "mois", 1, MAINTENANT)).toBe(true);
    expect(periodeEtatExiste(l, "mois", 2, MAINTENANT)).toBe(false);
    expect(periodeEtatExiste(l, "mois", 3, MAINTENANT)).toBe(true);
  });
  it("axe : pas de 0,5 sous 4 unités, 1 au-delà, puis 2, 5, 10 (8 intervalles au plus) ; étiquettes début, milieu, fin", () => {
    expect(axeEtat([78, 79.9]).pas).toBe(0.5);
    expect(axeEtat([76, 80]).pas).toBe(1);
    expect(axeEtat([70, 80]).pas).toBe(2);
    const vfc = axeEtat([42, 88]);
    expect(vfc.pas).toBe(10);
    expect(vfc.reperes).toEqual([40, 50, 60, 70, 80, 90]);
    expect(indicesEtiquettes("mois", 30)).toEqual([0, 14, 29]);
    expect(indicesEtiquettes("tout", 101)).toEqual([0, 100]);
  });
  it("axe pleine période : 30 j, 90 j, 1 an gardent tous leurs jours même sans relevé (la partie vide reste vide)", () => {
    const recents = [r(3, 78.4), r(1, 78.1)];
    for (const [type, n] of [["mois", 30], ["trim", 90], ["annee", 365]] as const) {
      const p = periodeEtat(recents, type, 0, MAINTENANT);
      expect(p.pts.length).toBe(n);
      expect(p.debut).toBe(decaler(AUJ, -(n - 1)));
      expect(p.pts[0]!.jour).toBe(p.debut);
      expect(p.pts[p.pts.length - 1]!.jour).toBe(AUJ);
      expect(p.pts.slice(0, n - 4).every((x) => x.v == null && x.l == null)).toBe(true);
    }
    // « Tout » : depuis le premier relevé
    expect(periodeEtat(recents, "tout", 0, MAINTENANT).debut).toBe(decaler(AUJ, -3));
  });
  it("échelle du temps ancrée à droite : le dernier jour ne bouge pas, les jours au-delà de la durée sont à gauche du bord", () => {
    expect(xDepuisFin(0, 30, 300)).toBe(295);
    expect(proche(xDepuisFin(0, 90, 300), 300 - 300 / 180)).toBe(true);
    expect(xDepuisFin(29, 30, 300)).toBe(5);
    expect(xDepuisFin(30, 30, 300) < 0).toBe(true);
    expect(xDepuisFin(60, 90, 300) > 0).toBe(true);
  });
  it("jour choisi : son relevé, sa moyenne lissée ; un jour sans pesée garde la moyenne et dit la pesée d'avant", () => {
    const l = [r(10, 80), r(3, 79), r(1, 78.5)];
    const j1 = jourEtat(l, decaler(AUJ, -1));
    expect(j1.releve!.valeur).toBe(78.5);
    const j2 = jourEtat(l, decaler(AUJ, -2));
    expect(j2.releve).toBeNull();
    expect(proche(j2.l, 80 + 0.1 * (79 - 80))).toBe(true);
    expect(j2.precedent!.valeur).toBe(79);
    expect(jourEtat(l, decaler(AUJ, -20)).l).toBeNull();
    expect(joursReleves(l).has(decaler(AUJ, -3))).toBe(true);
    expect(relevesEntre(l, decaler(AUJ, -3), AUJ).map((x) => x.valeur)).toEqual([79, 78.5]);
  });
  it("piste : l'axe compte en colonnes, la colonne touchée reste le jour visé", () => {
    expect(colonnesPiste(30, 356)).toBe(Math.round((30 * 356) / 328));
  });
});

describe("données (base réelle)", () => {
  it("résumé des cartes : dernière pesée, % de gras, écarts sur 30 jours, objectif", async () => {
    const { db } = await baseDeTest();
    await ajouterPesee(db, 80, decaler(AUJ, -40) + 7 * 3_600_000, "sante_connect", "com.withings.wiscale2");
    await ajouterPesee(db, 78, decaler(AUJ, -1) + 7 * 3_600_000, "sante_connect", "com.withings.wiscale2");
    await ajouterMesures(db, "gras", [{ valeur: 15, date: decaler(AUJ, -40) + 7 * 3_600_000, origine: "com.withings.wiscale2" }, { valeur: 14.2, date: decaler(AUJ, -1) + 7 * 3_600_000, origine: "com.withings.wiscale2" }]);
    await ecrireReglage(db, "nutri_poids_cible", "75");
    await ecrireReglage(db, "nutri_rythme", "-0.5");
    const res = await lireResumeCorps(db, MAINTENANT);
    expect(res.poids!.valeur).toBe(78);
    expect(res.gras!.valeur).toBe(14.2);
    expect(proche(res.ecart30Kg!, -0.2)).toBe(true);
    expect(res.serieKg.length).toBe(30);
    expect(res.objectif!.cible).toBe(75);
    expect(res.objectif!.dateRythme! > MAINTENANT).toBe(true);
    expect(await lireObjectifPoids(db)).toEqual({ cible: 75, rythme: -0.5 });
  });
  it("sans relevé ni objectif : rien d'inventé", async () => {
    const { db } = await baseDeTest();
    const res = await lireResumeCorps(db, MAINTENANT);
    expect(res.poids).toBeNull();
    expect(res.lisseKg).toBeNull();
    expect(res.ecart30Kg).toBeNull();
    expect(res.serieKg).toEqual([]);
    expect(res.objectif).toBeNull();
  });
  it("% de gras saisi : borné, supprimable ; une mesure importée ne se supprime pas", async () => {
    const { db } = await baseDeTest();
    expect(await ajouterGras(db, 90)).toBe(false);
    expect(await ajouterGras(db, 15.5, MAINTENANT)).toBe(true);
    await ajouterMesures(db, "gras", [{ valeur: 14, date: MAINTENANT - 86_400_000, origine: "com.withings.wiscale2" }]);
    const l = await lireGras(db);
    expect(l.map((x) => [x.valeur, x.manuel])).toEqual([[14, false], [15.5, true]]);
    for (const x of l) await supprimerGras(db, x.id);
    expect((await lireGras(db)).map((x) => x.valeur)).toEqual([14]);
  });
  it("même pesée : à moins de 12 h", () => {
    expect(memePesee([r(1, 78)], decaler(AUJ, -1) + 8 * 3_600_000)!.valeur).toBe(78);
    expect(memePesee([r(2, 78)], decaler(AUJ, -1) + 8 * 3_600_000)).toBeNull();
  });
});

// Bug du 30/10 (retours) : changer de jour gardait les mêmes tours ; ils suivent maintenant le jour choisi.
describe("tours au jour choisi", () => {
  const h = (jours: number, heures = 8) => decaler(AUJ, -jours) + heures * 3_600_000;
  it("la mesure du jour, sinon la dernière d'avant ; rien avant la première", async () => {
    const { db } = await baseDeTest();
    await ajouterMensuration(db, "mollet", 37, h(20));
    await ajouterMensuration(db, "mollet", 37.5, h(5));
    await ajouterMensuration(db, "mollet", 38, h(0));
    const l = (await lireTours(db)).mollet!;
    expect(tourAuJour(l, AUJ)).toEqual({ m: l[0], duJour: true, precedente: l[1], ecart: 1 });
    const hier = tourAuJour(l, decaler(AUJ, -1))!;
    expect([hier.m.valeur, hier.duJour, hier.precedente?.valeur, hier.ecart]).toEqual([37.5, false, 37, 0.5]);
    expect(tourAuJour(l, decaler(AUJ, -20))!.precedente).toBeNull();
    const j5 = tourAuJour(l, decaler(AUJ, -5))!;
    expect([j5.m.valeur, j5.duJour]).toEqual([37.5, true]);
    expect(tourAuJour(l, decaler(AUJ, -21))).toBeNull();
  });
  it("écart sur les 90 jours qui finissent au jour choisi ; nul à 0,1 cm près = pas d'écart", () => {
    const m = (id: string, jours: number, valeur: number) => ({ id, type: "poitrine" as const, date: h(jours), valeur });
    const l = [m("a", 0, 100), m("b", 50, 98), m("c", 100, 90)];
    expect(tourAuJour(l, AUJ)!.ecart).toBe(2);
    expect(tourAuJour(l, decaler(AUJ, -50))!.ecart).toBe(8);
    expect(tourAuJour(l, decaler(AUJ, -100))!.ecart).toBeNull();
    expect(tourAuJour([m("a", 0, 100), m("b", 3, 100.02)], AUJ)!.ecart).toBeNull();
  });
});
