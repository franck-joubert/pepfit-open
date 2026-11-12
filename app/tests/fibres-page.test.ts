// Page de suivi des fibres (planche fibres-page, NOTES D2 à D13) : la liste « d'où viennent tes fibres », les moyennes des jours
// finis (aujourd'hui jamais compté, jour sans repas ni compté ni zéro, année pondérée par les jours), les plus riches, les conseils.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alimentsDuJour, atteint, fibresConnues, lignesVisibles, periodeFibres, plusRiches, statsFinis, VISIBLES, type LigneListe,
} from "../src/ecrans/mesures/fibres-calc.ts";
import { decaler, minuit, moyenne } from "../src/ecrans/mesures/periodes.ts";
import { CONSEILS, conseilsDuJour, type LigneAstuce } from "../src/nutrition/fibres-eau.ts";

let n = 0;
const ligne = (nom: string, g: number, nutriments: LigneListe["produit"]["nutriments"], repas = "r1", produit = nom): LigneListe => ({
  id: `l${++n}`, repas_id: repas, produit_id: produit, quantite_g: g, produit: { nom, nutriments },
});

test("un jour a des fibres connues, ou n'a pas de donnée : sans repas ou sans aucun aliment renseigné, ce n'est pas un zéro", () => {
  assert.equal(fibresConnues(null), null);
  assert.equal(fibresConnues({ g: 0, partiel: true }), null, "des aliments, aucun aux fibres connues");
  assert.equal(fibresConnues({ g: 0, partiel: false }), 0, "viande et huile : un vrai zéro");
  assert.equal(fibresConnues({ g: 13, partiel: true }), 13, "donnée partielle : la valeur, « au moins »");
});

test("d'où viennent tes fibres : classé par apport, part du total, ceux sans fibres connues à la fin, les zéros connus absents", () => {
  const l = alimentsDuJour([
    ligne("Pain complet", 30, { fibres: 6.5, glucides: 40 }, "pd"),
    ligne("Flocons d'avoine", 40, { fibres: 10, glucides: 60 }, "pd"),
    ligne("Poulet", 150, { proteines: 25, glucides: 0 }, "dej"),
    ligne("Houmous", 40, { glucides: 10 }, "dej"),
    ligne("Brocoli cuit", 150, { fibres: 2.6, glucides: 4 }, "dej"),
  ]);
  assert.deepEqual(l.aliments.map((a) => a.nom), ["Flocons d'avoine", "Brocoli cuit", "Pain complet", "Houmous"]);
  assert.deepEqual(l.aliments.map((a) => a.g), [4, 3.9, 1.95, null]);
  assert.equal(l.total, 9.85);
  assert.deepEqual(l.aliments.map((a) => a.part), [41, 40, 20, null]);
  assert.equal(l.sansFibres, 1);
  assert.equal(l.aliments[0]!.repasId, "pd");
  assert.deepEqual(alimentsDuJour([]), { aliments: [], sansFibres: 0, total: 0 });
});

test("cinq lignes puis « Voir les n autres » ; à six aliments ou moins, tout est visible", () => {
  const sept = Array.from({ length: 7 }, (_, i) => i);
  assert.deepEqual(lignesVisibles(sept, false), { montrees: [0, 1, 2, 3, 4], autres: 2 });
  assert.deepEqual(lignesVisibles(sept, true), { montrees: sept, autres: 2 });
  assert.equal(VISIBLES, 5);
  const six = sept.slice(0, 6);
  assert.deepEqual(lignesVisibles(six, false), { montrees: six, autres: 0 });
  assert.deepEqual(lignesVisibles([], false), { montrees: [], autres: 0 });
});

test("les plus riches : par produit, grammes cumulés, nombre de fois, part de la période ; sans fibres connues, absent", () => {
  const r = plusRiches([
    ligne("Flocons d'avoine", 40, { fibres: 10 }, "r1", "p1"),
    ligne("Flocons d'avoine", 40, { fibres: 10 }, "r1", "p1"),
    ligne("Lentilles", 100, { fibres: 4.8 }, "r1", "p2"),
    ligne("Pomme", 150, { fibres: 2 }, "r1", "p3"),
    ligne("Biscuit", 30, { glucides: 70 }, "r1", "p4"),
    ligne("Poulet", 100, { glucides: 0 }, "r1", "p5"),
  ]);
  assert.deepEqual(r.map((x) => [x.nom, x.fois, x.g]), [["Flocons d'avoine", 2, 8], ["Lentilles", 1, 4.8], ["Pomme", 1, 3]]);
  assert.deepEqual(r.map((x) => x.part), [51, 30, 19]);
  assert.equal(plusRiches(Array.from({ length: 9 }, (_, i) => ligne(`A${i}`, 100, { fibres: i + 1 }, "r1", `p${i}`))).length, 5, "cinq au plus");
});

// ------------------------------------------------------------------ Statistiques

const MAINTENANT = new Date(2026, 10, 6, 15, 42).getTime(); // vendredi 6 nov. 2026
const AUJ = minuit(MAINTENANT);

test("aujourd'hui n'est jamais compté dans les moyennes, un jour sans repas non plus (ni comme un zéro)", () => {
  // semaine du lundi 2 au dimanche 8 : lun 21, mar 27, mer 31, jeu sans repas, ven (aujourd'hui) 18
  const v: Record<number, number> = { [decaler(AUJ, -4)]: 21, [decaler(AUJ, -3)]: 27, [decaler(AUJ, -2)]: 31, [AUJ]: 18 };
  const p = periodeFibres("semaine", 0, MAINTENANT, (j) => (j in v ? { g: v[j]!, partiel: false } : null));
  assert.equal(p.barres[4]!.v, 18, "la barre d'aujourd'hui se dessine");
  assert.equal(p.barres[4]!.enCours, true);
  assert.equal(p.barres[3]!.v, null, "jeudi : pas de donnée");
  assert.equal(p.barres[5]!.aVenir, true);
  const s = statsFinis(p.jours, AUJ, 30);
  assert.equal(s.n, 3);
  assert.equal(s.moyenne, (21 + 27 + 31) / 3);
  assert.deepEqual(s.meilleur, { jour: decaler(AUJ, -2), v: 31 });
  assert.equal(s.atteints, 1, "31 g seulement");
});

test("un jour dont aucun aliment n'a de fibres connues reste vide, partiel ou non", () => {
  const p = periodeFibres("semaine", 0, MAINTENANT, (j) => (j === decaler(AUJ, -1) ? { g: 0, partiel: true } : j === decaler(AUJ, -2) ? { g: 0, partiel: false } : null));
  assert.equal(p.barres[3]!.v, null);
  assert.equal(p.barres[2]!.v, 0, "viande et huile : zéro vrai");
});

test("la moyenne de l'année est celle de tous les jours finis, pas des douze moyennes de mois (D13)", () => {
  // octobre : 3 jours à 10 g ; novembre (en cours) : 1 jour fini à 40 g, aujourd'hui à 100 g (jamais compté)
  const lire = (j: number) => {
    const d = new Date(j);
    if (d.getMonth() === 9 && d.getDate() <= 3) return { g: 10, partiel: false };
    if (d.getMonth() === 10 && d.getDate() === 2) return { g: 40, partiel: false };
    if (j === AUJ) return { g: 100, partiel: false };
    return null;
  };
  const p = periodeFibres("annee", 0, MAINTENANT, lire);
  const moisOct = p.barres[10]!;
  const moisNov = p.barres[11]!;
  assert.equal(moisOct.v, 10);
  assert.equal(moisNov.v, 40, "le mois en cours : moyenne de ses jours finis");
  assert.equal(moyenne(p.barres.map((b) => b.v)), 25, "la moyenne des mois serait 25");
  const s = statsFinis(p.jours, AUJ, 30);
  assert.equal(s.n, 4);
  assert.equal(s.moyenne, 17.5, "70 / 4 : un mois d'un jour pèse un jour");
});

test("objectifs masqués : aucun jour n'atteint l'objectif ; l'objectif se compare arrondi au gramme, comme la barre du Journal", () => {
  const jours = [{ jour: decaler(AUJ, -1), v: 45 }, { jour: decaler(AUJ, -2), v: 29.6 }, { jour: decaler(AUJ, -3), v: 29.4 }];
  assert.equal(statsFinis(jours, AUJ, null).atteints, 0);
  assert.equal(statsFinis(jours, AUJ, 30).atteints, 2, "29,6 g s'arrondit à 30 g, 29,4 g à 29 g");
  assert.equal(atteint(29.6, 30), true);
  assert.equal(atteint(29.4, 30), false);
  assert.equal(statsFinis([{ jour: AUJ, v: 40 }], AUJ, 30).n, 0, "aujourd'hui seul : rien de fini");
});

// ------------------------------------------------------------------ Conseils

const astuce = (nom: string, g: number, repas = "r1"): LigneAstuce => ({ repas_id: repas, quantite_g: g, produit: { nom, nutriments: {} } });
const conseils = (date: string, jour: LigneAstuce[] = [], semaine: LigneAstuce[] = jour, n = 3) => conseilsDuJour({ date, jour, semaine, n });

test("conseils : cinq conseils, trois par jour, la fenêtre avance d'un cran chaque jour", () => {
  assert.equal(CONSEILS.length, 5);
  const j1 = conseils("2026-11-06").map((c) => c.cle);
  const j2 = conseils("2026-11-07").map((c) => c.cle);
  assert.equal(j1.length, 3);
  assert.deepEqual(j2.slice(0, 2), j1.slice(1, 3), "d'un jour à l'autre, un cran");
  assert.notEqual(j1[0], j2[0]);
  // au bout de cinq jours, la fenêtre revient
  assert.deepEqual(conseils("2026-11-11").map((c) => c.cle), j1);
  // deux conseils d'une même page ne se répètent pas
  assert.equal(new Set(j1).size, 3);
});

test("conseils : celui qui s'appuie sur un repas du jour passe en premier ; le Journal montre le premier", () => {
  const jour = [astuce("Riz blanc cuit", 180, "dej")];
  const c = conseils("2026-11-06", jour, jour);
  assert.deepEqual(c[0], { cle: "riz", gainG: 2, repasId: "dej" });
  assert.equal(c.filter((x) => x.cle === "riz").length, 1, "le riz du jeu général est écarté");
  assert.equal(conseils("2026-11-06", jour, jour, 1).length, 1);
  assert.deepEqual(conseils("2026-11-06", jour, jour, 1)[0], c[0]);
});

test("conseils : pas de légumineuses si la semaine en a eu, pas de riz complet à qui en a mangé, jus et pomme ne font qu'un", () => {
  for (let i = 0; i < 5; i++) {
    const date = `2026-11-${String(6 + i).padStart(2, "0")}`;
    const avecLentilles = conseils(date, [astuce("Poulet", 150)], [astuce("Salade de lentilles", 150)], 5);
    assert.equal(avecLentilles.some((c) => c.cle === "legumineuses"), false, date);
    const rizComplet = conseils(date, [astuce("Riz complet", 180)], [astuce("Riz complet", 180), astuce("Lentilles", 100)], 5);
    assert.equal(rizComplet.some((c) => c.cle === "riz"), false, date);
  }
  const jus = conseils("2026-11-06", [astuce("Jus de pomme", 200)], [astuce("Lentilles", 80)], 5);
  assert.equal(jus[0]!.cle, "pomme");
  assert.equal(jus.some((c) => c.cle === "orange"), false, "un seul conseil sur les jus");
});

test("conseils : pas de poignée de fruits à coque à qui en a mangé aujourd'hui", () => {
  for (let i = 0; i < 5; i++) {
    const date = `2026-11-${String(6 + i).padStart(2, "0")}`;
    const amandes = conseils(date, [astuce("Amandes", 15)], [astuce("Amandes", 15), astuce("Lentilles", 100)], 5);
    assert.equal(amandes.some((c) => c.cle === "coque"), false, date);
    assert.equal(conseils(date, [astuce("Poulet", 150)], [astuce("Poulet", 150)], 5).some((c) => c.cle === "coque"), true, `${date} : sans noix, le conseil reste`);
  }
});

test("grammes des conseils généraux : environ 2, 4 et 5 g, comme la planche (ordres de grandeur Ciqual, voir fibres-eau.ts)", () => {
  assert.deepEqual(CONSEILS.map((c) => [c.cle, c.gainG]), [["riz", 2], ["legumes", 4], ["legumineuses", 5], ["coque", 2], ["orange", 2]]);
  assert.equal(CONSEILS.find((c) => c.cle === "legumes")!.repasCle, "diner");
});
