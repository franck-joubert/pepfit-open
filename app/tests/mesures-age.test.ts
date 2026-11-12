// Âge pepfit (D17) : courbes de risque des études, conversion de Gompertz (×2 = 8 ans), bornes de ±3 ans, facteurs sans
// donnée qui n'apportent rien, moyennes sur 6 mois, semaines sans assez de données, calendrier du lundi, rythme.
import { describe, expect, it } from "./attendu.ts";
import {
  ageA, ANS_PAR_LN, calculerSemaine, definitions, extremes, impactAns, lnRR, lundiAvant, lundiDe, prochainCalcul, rythme, semaines, semainesComparables, valeursEntre,
  type HistoriqueAge, type SemaineAge,
} from "../src/ecrans/mesures/age-calc.ts";

const JOUR = 86_400_000;
const MAINTENANT = new Date(2026, 9, 28, 16, 42).getTime(); // mercredi 28/10/2026
const NAISSANCE = new Date(1987, 6, 10).getTime();
const proche = (a: number, b: number, e = 0.05) => Math.abs(a - b) <= e;

const vide = (): HistoriqueAge & { pas: { jour: number; pas: number }[] } => ({ nuits: [], pas: [], seancesWhoop: [], debutWhoop: null, muscu: [], debutMuscu: null, fcRepos: [], maigre: [], vo2: [] });

describe("courbes de risque et conversion", () => {
  it("Gompertz : un risque doublé vaut 8 ans", () => {
    expect(proche(Math.LN2 * ANS_PAR_LN, 8, 1e-9)).toBe(true);
  });
  it("interpolation par segments, plate au-delà des points", () => {
    const p = [[0, 0], [10, 1]] as const;
    expect(lnRR(p, 5)).toBe(0.5);
    expect(lnRR(p, -3)).toBe(0);
    expect(lnRR(p, 20)).toBe(1);
  });
  it("valeur neutre : aucun impact ; pas de donnée : aucun impact", () => {
    const d = definitions("h");
    expect(impactAns(d.pasJour, 8000)).toBe(0);
    expect(impactAns(d.duree, 7.5)).toBe(0);
    expect(impactAns(d.duree, 7.9)).toBe(0);
    expect(impactAns(d.fcRepos, null)).toBe(0);
  });
  it("FC au repos (Zhang 2016, RR 1,09 par 10 bpm) : 45 bpm contre 70 = −2,5 ans", () => {
    const d = definitions("h");
    expect(proche(impactAns(d.fcRepos, 45), -2.5 * Math.log(1.09) * ANS_PAR_LN)).toBe(true);
    expect(proche(impactAns(d.fcRepos, 45), -2.49)).toBe(true);
  });
  it("pas (Paluch 2022) : 10 901 pas rajeunit, 3 553 vieillit, borné à 3 ans", () => {
    const d = definitions("h");
    expect(impactAns(d.pasJour, 10901) < -1).toBe(true);
    expect(impactAns(d.pasJour, 3553)).toBe(3);
  });
  it("chaque facteur est borné à ±3 ans (VO₂ max très haute)", () => {
    expect(impactAns(definitions("f").vo2, 60)).toBe(-3);
  });
  it("sommeil long (Cappuccio 2010, RR 1,30) vieillit plus que court (RR 1,12)", () => {
    const d = definitions(null);
    expect(impactAns(d.duree, 9.5) > impactAns(d.duree, 5.5)).toBe(true);
    expect(impactAns(d.duree, 5.5) > 0).toBe(true);
  });
  it("masse maigre : plage selon le sexe", () => {
    expect(impactAns(definitions("f").maigre, 75) < 0).toBe(true);
    expect(impactAns(definitions("h").maigre, 75) > 0).toBe(true);
  });
});

describe("moyennes sur la fenêtre", () => {
  it("zones par semaine sur la seule part couverte par Whoop ; rien sous 14 jours", () => {
    const fin = new Date(2026, 9, 26).getTime();
    const h = vide();
    h.debutWhoop = fin - 28 * JOUR;
    h.seancesWhoop = [
      { debut: fin - 20 * JOUR, zones: [5, 30, 30, 30, 10, 2] },
      { debut: fin - 5 * JOUR, zones: [0, 60, 60, 60, 0, 0] },
    ];
    const v = valeursEntre(h, fin - 182 * JOUR, fin);
    // 270 min de zones 1 à 3 sur 4 semaines couvertes
    expect(proche(v.zones13!, 270 / 4)).toBe(true);
    expect(proche(v.zones45!, 12 / 4)).toBe(true);
    h.debutWhoop = fin - 10 * JOUR;
    expect(valeursEntre(h, fin - 182 * JOUR, fin).zones13).toBeNull();
  });
  it("une moyenne quotidienne demande au moins 7 jours", () => {
    const fin = new Date(2026, 9, 26).getTime();
    const h = vide();
    h.pas = Array.from({ length: 6 }, (_, i) => ({ jour: fin - (i + 1) * JOUR, pas: 9000 }));
    expect(valeursEntre(h, fin - 182 * JOUR, fin).pasJour).toBeNull();
    h.pas = Array.from({ length: 7 }, (_, i) => ({ jour: fin - (i + 1) * JOUR, pas: 9000 }));
    expect(valeursEntre(h, fin - 182 * JOUR, fin).pasJour).toBe(9000);
  });
});

function historiqueComplet(lundi: number): HistoriqueAge {
  const jours = Array.from({ length: 182 }, (_, i) => lundi - (i + 1) * JOUR);
  return {
    ...vide(),
    pas: jours.map((jour) => ({ jour, pas: 10901 })),
    fcRepos: jours.map((date) => ({ date, valeur: 45 })),
    nuits: jours.map((jour) => ({ jour, minutes: 450, regularite: 81 })),
  };
}

describe("semaine", () => {
  it("âge pepfit = âge réel + somme des impacts ; groupes", () => {
    const lundi = lundiDe(MAINTENANT);
    const s = calculerSemaine(historiqueComplet(lundi), lundi, NAISSANCE, "h");
    expect(s.nbDonnees).toBe(4);
    expect(proche(s.ageReel, ageA(NAISSANCE, lundi), 1e-9)).toBe(true);
    const somme = s.facteurs.reduce((a, f) => a + f.impact, 0);
    expect(proche(s.age!, s.ageReel + somme, 1e-9)).toBe(true);
    expect(s.groupes.sommeil).toBe(0);
    expect(s.groupes.effort < 0).toBe(true);
    expect(s.facteurs.find((f) => f.id === "vo2")!.v6).toBeNull();
  });
  it("moins de 3 facteurs : pas d'âge (pas de point)", () => {
    const lundi = lundiDe(MAINTENANT);
    const h = { ...vide(), pas: Array.from({ length: 30 }, (_, i) => ({ jour: lundi - (i + 1) * JOUR, pas: 9000 })) };
    expect(calculerSemaine(h, lundi, NAISSANCE, "h").age).toBeNull();
  });
  it("30 semaines, la plus ancienne d'abord ; rythme sur 26 semaines", () => {
    const l = semaines(historiqueComplet(lundiDe(MAINTENANT)), MAINTENANT, NAISSANCE, "h");
    expect(l.length).toBe(30);
    expect(l[29]!.lundi).toBe(lundiDe(MAINTENANT));
    expect(l[0]!.lundi).toBe(lundiAvant(MAINTENANT, 29));
  });
  it("rythme : écart qui recule de 0,25 an en 6 mois = 0,5x", () => {
    // trois facteurs mesurés : le premier porte l'écart
    const f = (id: string, impact: number, v6: number | null = 1) => ({ id, groupe: "effort", v6, v30: null, impact }) as SemaineAge["facteurs"][number];
    const s = (ecart: number, plus: SemaineAge["facteurs"] = []): SemaineAge => ({
      lundi: 0, ageReel: 39, age: 39 + ecart, ecart, facteurs: [f("pasJour", ecart), f("zones13", 0), f("muscu", 0), ...plus],
      groupes: { sommeil: 0, effort: 0, forme: 0 }, nbDonnees: 3 + plus.length,
    });
    const l = Array.from({ length: 30 }, (_, i) => s(i === 29 ? -2.25 : -2));
    expect(proche(rythme(l)!, 0.5, 1e-9)).toBe(true);
    // un facteur mesuré seulement aujourd'hui (Whoop relié depuis peu) ne change pas le rythme
    l[29] = s(-2.25, [f("regularite", -3)]);
    l[29] = { ...l[29]!, ecart: -5.25 };
    expect(proche(rythme(l)!, 0.5, 1e-9)).toBe(true);
    // moins de 3 facteurs communs : pas de rythme
    l[3] = s(-2, []);
    l[3] = { ...l[3]!, facteurs: [f("pasJour", -2), f("zones13", 0, null), f("muscu", 0, null), f("regularite", 0)] };
    expect(rythme(l)).toBeNull();
    l[3] = { ...s(-2), age: null };
    expect(rythme(l)).toBeNull();
  });
  it("ce qui rajeunit le plus, ce qui est à travailler", () => {
    const f = [
      { id: "pasJour", groupe: "effort", v6: 9000, v30: null, impact: -1 },
      { id: "duree", groupe: "sommeil", v6: 6, v30: null, impact: 0.6 },
      { id: "vo2", groupe: "forme", v6: null, v30: null, impact: 0 },
    ] as const;
    const e = extremes(f as never);
    expect(e.meilleur!.id).toBe("pasJour");
    expect(e.pire!.id).toBe("duree");
  });
});

describe("évolution sur 30 semaines : les facteurs d'aujourd'hui (D1 du 29/10)", () => {
  // Pas (Santé Connect), masse maigre (balance) et séances pepfit depuis toujours ; Whoop relié il y a 8 semaines : sommeil,
  // FC au repos et zones arrivent en cours de période. Données constantes : la forme ne bouge pas.
  function arriveeWhoop(): HistoriqueAge {
    const debut = lundiAvant(MAINTENANT, 29) - 190 * JOUR;
    const whoop = lundiAvant(MAINTENANT, 8);
    const jours = Array.from({ length: Math.ceil((MAINTENANT - debut) / JOUR) }, (_, i) => debut + i * JOUR);
    const apres = jours.filter((j) => j >= whoop);
    return {
      ...vide(),
      pas: jours.map((jour) => ({ jour, pas: 9500 })),
      maigre: jours.filter((_, i) => i % 7 === 0).map((date) => ({ date, valeur: 83 })),
      muscu: jours.filter((_, i) => i % 3 === 0).map((d) => ({ debut: d + 18 * 3_600_000, minutes: 50 })),
      debutMuscu: debut,
      nuits: apres.map((jour) => ({ jour, minutes: 440, regularite: 88 })),
      fcRepos: apres.map((date) => ({ date, valeur: 46 })),
      seancesWhoop: apres.filter((_, i) => i % 2 === 0).map((d) => ({ debut: d + 7 * 3_600_000, zones: [5, 20, 20, 15, 4, 1] })),
      debutWhoop: whoop,
    };
  }
  const sauts = (l: readonly SemaineAge[]) => {
    const r: number[] = [];
    for (let i = 1; i < l.length; i++) if (l[i]!.age != null && l[i - 1]!.age != null) r.push(Math.abs(l[i]!.age! - l[i - 1]!.age!));
    return r;
  };

  it("arrivée de Whoop en cours de période : l'âge brut saute, la courbe non", () => {
    const brutes = semaines(arriveeWhoop(), MAINTENANT, NAISSANCE, "h");
    const l = semainesComparables(brutes);
    // l'âge brut perd plusieurs années quand le sommeil, la FC et les zones entrent dans le calcul
    expect(Math.max(...sauts(brutes)) > 1.5).toBe(true);
    // sur les facteurs d'aujourd'hui : d'une semaine à l'autre, l'âge réel (7 jours ≈ 0,02 an) et les zones de la semaine
    // (3 ou 4 séances dans la fenêtre : ±0,1 an), plus de saut
    expect(sauts(l).length >= 4).toBe(true);
    expect(Math.max(...sauts(l)) < 0.3).toBe(true);
    // la semaine en cours ne change pas
    expect(l[29]).toBe(brutes[29]);
  });

  it("une semaine sans tous les facteurs d'aujourd'hui n'a pas de point, même avec 3 facteurs ou plus", () => {
    const brutes = semaines(arriveeWhoop(), MAINTENANT, NAISSANCE, "h");
    const l = semainesComparables(brutes);
    const actuels = brutes[29]!.facteurs.filter((f) => f.v6 != null).map((f) => f.id);
    expect(actuels.length).toBe(8);
    l.forEach((s, i) => {
      const complete = actuels.every((id) => brutes[i]!.facteurs.find((f) => f.id === id)!.v6 != null);
      expect(s.age == null).toBe(!complete);
    });
    // avant Whoop, l'âge brut existait (pas, masse maigre, musculation) : il n'est plus montré
    expect(brutes[0]!.age).not.toBeNull();
    expect(l[0]!.age).toBeNull();
    // évolution : de la première semaine complète à aujourd'hui, l'âge réel seulement
    const valides = l.filter((s) => s.age != null);
    const evolution = valides[valides.length - 1]!.age! - valides[0]!.age!;
    expect(proche(evolution, valides[valides.length - 1]!.ageReel - valides[0]!.ageReel, 0.05)).toBe(true);
  });

  it("un facteur que la semaine passée avait et plus aujourd'hui (source coupée) n'entre pas dans son âge", () => {
    const f = (id: string, impact: number, v6: number | null = 1) => ({ id, groupe: "effort", v6, v30: null, impact }) as SemaineAge["facteurs"][number];
    const s = (facteurs: SemaineAge["facteurs"]): SemaineAge => ({
      lundi: 0, ageReel: 39, age: 39 + facteurs.reduce((t, x) => t + x.impact, 0), ecart: facteurs.reduce((t, x) => t + x.impact, 0), facteurs,
      groupes: { sommeil: 0, effort: 0, forme: 0 }, nbDonnees: facteurs.filter((x) => x.v6 != null).length,
    });
    const avant = s([f("pasJour", -1), f("zones13", -0.5), f("muscu", -0.5), f("fcRepos", -2.5)]);
    const maintenant = s([f("pasJour", -1), f("zones13", -0.5), f("muscu", -0.5), f("fcRepos", 0, null)]);
    const l = semainesComparables([avant, maintenant]);
    expect(proche(l[0]!.age!, 37, 1e-9)).toBe(true);
    expect(proche(l[0]!.ecart, -2, 1e-9)).toBe(true);
    expect(proche(l[0]!.groupes.effort, -2, 1e-9)).toBe(true);
  });
});

describe("calendrier", () => {
  it("recalcul le lundi : semaine du 26 oct., prochain calcul lundi 2 nov., dans 5 jours", () => {
    expect(lundiDe(MAINTENANT)).toBe(new Date(2026, 9, 26).getTime());
    const p = prochainCalcul(MAINTENANT);
    expect(p.lundi).toBe(new Date(2026, 10, 2).getTime());
    expect(p.jours).toBe(5);
  });
});
