// La Récupération pepfit (planche recuperation, NOTES § 2, 3, 5) : le tableau des exemples, la planche entière recalculée
// depuis ses nuits, la somme des apports, la garde, la part absente, le seuil de 25 %, la norme faite des nuits d'AVANT, et
// un changement de RECUP qui déplace tout sans toucher aux données.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ajustementCible, decalerIso, formeCible, niveauRecup, norme, partCharge, partEcart, partSommeil, qualiteNorme, RECUP, scoreParts, scoreRecup,
  scoresRecup, type DonneesRecup, type NuitRecup, type ParamsRecup, type PartEvaluee,
} from "../src/ecrans/recup-pepfit.ts";
import { cibleEffort, demiPoint, scoreEffort } from "../src/ecrans/effort-pepfit.ts";

// ---- les exemples de NOTES § 3 (normes fixes : VFC 56 ms à 0,12 sur le logarithme, FC 53 ± 2, 900 points par semaine)
const NV = { n: 42, m: Math.log(56), sd: 0.12, log: true, centre: 56, zone: [0, 0] as [number, number], q: 1 };
const NF = { n: 42, m: 53, sd: 2, log: false, centre: 53, zone: [0, 0] as [number, number], q: 1 };
const MOY = 900 / 7;
const v = (x: number | null, q = 1): PartEvaluee | null => (x == null ? null : { part: partEcart(x, NV, 1).part, q });
const f = (x: number | null, q = 1): PartEvaluee | null => (x == null ? null : { part: partEcart(x, NF, -1).part, q });
const s = (o: Parameters<typeof partSommeil>[0] | null, q = 1): PartEvaluee | null => (o == null ? null : { part: partSommeil(o).part, q });
const c = (veille: number, avantVeille: number): PartEvaluee => ({ part: partCharge({ veille, avantVeille, moyJour: MOY }).part, q: 1 });
const SOMMEIL = { dormi: 432, besoin: 460, regularite: 24, dette: 110 };
/** La cible d'Effort des exemples : habitude 260 points × la forme, ± 15 %, au demi-point (CODE-EFFORT § 5). */
const cible = (forme: number) => [demiPoint(scoreEffort(0.85 * 260 * forme)), demiPoint(scoreEffort(1.15 * 260 * forme))];

test("les parts de NOTES § 2 : VFC, FC, sommeil, charge", () => {
  assert.equal(Math.round(partEcart(62, NV, 1).part), 91);
  assert.equal(Math.round(partEcart(51, NF, -1).part), 95);
  const so = partSommeil(SOMMEIL);
  assert.deepEqual([Math.round(so.duree), Math.round(so.regularite!), Math.round(so.dette!), Math.round(so.part)], [88, 87, 82, 86]);
  // une seule nuit (téléphone) : la durée seule
  assert.equal(Math.round(partSommeil({ dormi: 432, besoin: 460, regularite: null, dette: null }).part), 88);
  const ch = partCharge({ veille: 236, avantVeille: 0, moyJour: MOY });
  assert.equal(Math.round(ch.r * 100) / 100, 1.22);
  assert.equal(Math.round(ch.part), 71);
  // deux jours de repos : 100 ; une charge habituelle : 80 ; 1,5 fois : 60 ; 3 fois : 0
  assert.equal(partCharge({ veille: 0, avantVeille: 0, moyJour: 100 }).part, 100);
  assert.equal(partCharge({ veille: 100, avantVeille: 100, moyJour: 100 }).part, 80);
  assert.equal(partCharge({ veille: 150, avantVeille: 150, moyJour: 100 }).part, 60);
  assert.equal(partCharge({ veille: 300, avantVeille: 300, moyJour: 100 }).part, 0);
});

test("le tableau de NOTES § 3 : score, mot, précision, cible d'Effort", () => {
  const qn = qualiteNorme(20);
  const cas: [string, Record<"vfc" | "fc" | "sommeil" | "charge", PartEvaluee | null>, number | null, number, number, string, number[]][] = [
    ["semi", { vfc: v(44), fc: f(57), sommeil: s({ dormi: 380, besoin: 460, regularite: 35, dette: 240 }), charge: c(420, 60) }, 32, 32, 100, "fatigue", [5.5, 6.5]],
    ["nuit courte", { vfc: v(55), fc: f(54), sommeil: s({ dormi: 310, besoin: 460, regularite: 60, dette: 400 }), charge: c(150, 200) }, 57, 57, 100, "correct", [6, 7]],
    ["garde", { vfc: v(46), fc: f(50), sommeil: s({ dormi: 480, besoin: 460, regularite: 15, dette: 0 }), charge: c(0, 0) }, 66, 66, 100, "correct", [6.5, 7]],
    ["repos", { vfc: v(64), fc: f(52), sommeil: s({ dormi: 470, besoin: 460, regularite: 18, dette: 30 }), charge: c(0, 0) }, 95, 95, 100, "pret", [7, 7.5]],
    ["téléphone", { vfc: null, fc: null, sommeil: s({ dormi: 432, besoin: 460, regularite: null, dette: null }, RECUP.sommeil.qualiteTelephone), charge: c(236, 0) }, 75, 75, 25, "pret", [6.5, 7]],
    ["FC seule", { vfc: null, fc: f(51), sommeil: s(SOMMEIL), charge: c(236, 0) }, 79, 79, 55, "pret", [6.5, 7.5]],
    ["20 nuits", { vfc: v(62, qn), fc: f(51, qn), sommeil: s(SOMMEIL), charge: c(236, 0) }, 89, 89, 81, "pret", [6.5, 7.5]],
    ["charge seule", { vfc: null, fc: null, sommeil: null, charge: c(300, 250) }, null, 66, 10, "", [6.5, 7]],
  ];
  for (const [nom, parts, score, calcule, precision, mot, ci] of cas) {
    const r = scoreParts(parts);
    assert.equal(r.valeur, calcule, nom);
    assert.equal(r.precision, precision, nom);
    const sc = r.precision >= RECUP.precision.score ? r.valeur : null;
    assert.equal(sc, score, nom);
    if (sc != null) assert.equal(niveauRecup(sc), mot, nom);
    assert.deepEqual(cible(formeCible(sc, r.precision)), ci, nom);
  }
  // la garde : le brut ferait 68 (« Prêt »), le score s'arrête à 66
  const g = scoreParts(cas[2]![1]);
  assert.equal(Math.round(g.brut), 68);
  assert.ok(g.garde);
});

// ---- la planche entière, depuis ses nuits (le générateur à graine fixe de planches/recuperation/outils/donnees.js)
function serie() {
  let graine = 20261030;
  const alea = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648;
  const gauss = () => {
    let x = 0;
    for (let i = 0; i < 6; i++) x += alea();
    return (x - 3) / Math.sqrt(0.5);
  };
  const N = 84;
  const vfc: number[] = [];
  const fc: number[] = [];
  for (let i = 0; i < N; i++) {
    const creux = i >= N - 19 && i <= N - 16 ? -0.22 + 0.05 * (i - (N - 19)) : 0;
    vfc.push(Math.round(56 * Math.exp(0.1 * gauss() + creux)));
    fc.push(Math.round(53 + 1.8 * gauss() - creux * 12));
  }
  vfc[N - 1] = 62;
  fc[N - 1] = 51;
  return { N, vfc, fc };
}

const VENDREDI = "2026-10-30";
function planche(): DonneesRecup & { nuits: Map<string, NuitRecup>; charges: Map<string, number> } {
  const { N, vfc, fc } = serie();
  const nuits = new Map<string, NuitRecup>();
  for (let i = 0; i < N; i++) nuits.set(decalerIso(VENDREDI, i - (N - 1)), { rmssd: vfc[i]!, fcRepos: fc[i]!, sommeilMin: null, milieuMin: null, besoinMin: null, sourceSommeil: null });
  // Le sommeil des 7 nuits : 7 h 12 cette nuit pour un besoin de 7 h 40 ; 1 h 50 de dette ; milieu de nuit à ± 24 min.
  const k = Math.sqrt((24 * 24 * 6) / 28);
  const milieux = [-3, -2, -1, 0, 1, 2, 3].map((x) => 720 + x * k);
  const manques = [14, 14, 14, 14, 13, 13, 28];
  for (let i = 0; i < 7; i++) {
    const j = decalerIso(VENDREDI, i - 6);
    nuits.set(j, { ...nuits.get(j)!, sommeilMin: 460 - manques[i]!, milieuMin: milieux[i]!, besoinMin: 460, sourceSommeil: "montre" });
  }
  // Charge : jeudi 236 points, mercredi repos, 900 points par semaine en moyenne sur les 28 jours d'avant.
  const charges = new Map<string, number>([[decalerIso(VENDREDI, -1), 236]]);
  for (let i = 3; i <= 28; i++) charges.set(decalerIso(VENDREDI, -i), (3600 - 236) / 26);
  return { nuits, charges, objectifSommeil: 460 };
}

// Version 4 (planche sommeil) : la part sommeil lit notre besoin (460 + 45 de rattrapage + 20 d'effort récent, jeudi 1,8 fois
// la moyenne = 8 h 45, au lieu des 7 h 40 du capteur) et « à rattraper » (68 min, pondéré, au lieu de 110 min de cumul brut) :
// le score de la planche recuperation passe de 90 à 86 (sommeil 86 → 74), sans toucher aux données.
test("la planche, version 4 : 41 + 20 + 18 + 7 = 86, précision 100 %, zones 49 – 63 ms et 51 – 55 bpm, cible relevée de 13 %", () => {
  const r = scoreRecup(VENDREDI, planche());
  assert.equal(r.score, 86);
  assert.equal(r.niveau, "pret");
  assert.equal(r.precision, 100);
  assert.deepEqual([r.apports.vfc.apport, r.apports.fc.apport, r.apports.sommeil.apport, r.apports.charge.apport], [41, 20, 18, 7]);
  assert.deepEqual([Math.round(r.apports.vfc.valeur), Math.round(r.apports.fc.valeur), Math.round(r.apports.sommeil.valeur), Math.round(r.apports.charge.valeur)], [92, 97, 74, 71]);
  assert.deepEqual(r.detail.vfc.norme!.zone.map(Math.round), [49, 63]);
  assert.deepEqual(r.detail.fc.norme!.zone.map(Math.round), [51, 55]);
  assert.equal(Math.round(r.detail.sommeil.regularite!), 24);
  assert.equal(r.detail.sommeil.dette, 68);
  assert.equal(r.detail.sommeil.besoin, 525);
  assert.deepEqual([r.detail.sommeil.calcul.besoin.rattrapage, r.detail.sommeil.calcul.besoin.effort], [45, 20]);
  assert.deepEqual([Math.round(r.detail.sommeil.sous!.duree), Math.round(r.detail.sommeil.sous!.dette!)], [65, 89]);
  assert.equal(Math.round(r.detail.charge.r! * 100) / 100, 1.22);
  assert.equal(ajustementCible(r.forme), 13);
  assert.deepEqual(cible(r.forme), [6.5, 7.5]);
  assert.equal(r.prudent, false);
});

test("la somme des apports fait le score, sur chaque matin des 6 semaines", () => {
  const d = planche();
  for (let i = 0; i < 42; i++) {
    const r = scoreRecup(decalerIso(VENDREDI, -i), d);
    if (r.garde) continue;
    const somme = r.apports.vfc.apport + r.apports.fc.apport + r.apports.sommeil.apport + r.apports.charge.apport;
    assert.equal(somme, r.calcule, decalerIso(VENDREDI, -i));
  }
});

test("la norme est faite des 42 nuits d'AVANT : la nuit du jour n'y entre jamais", () => {
  const d = planche();
  const a = scoreRecup(VENDREDI, d);
  d.nuits.set(VENDREDI, { ...d.nuits.get(VENDREDI)!, rmssd: 90 });
  const b = scoreRecup(VENDREDI, d);
  assert.deepEqual(b.detail.vfc.norme, a.detail.vfc.norme);
  assert.ok(b.apports.vfc.valeur > a.apports.vfc.valeur);
  // une nuit d'avant la fenêtre (43 nuits) ne compte pas non plus
  const c1 = scoreRecup(VENDREDI, d);
  d.nuits.set(decalerIso(VENDREDI, -43), { ...d.nuits.get(decalerIso(VENDREDI, -43))!, rmssd: 200 });
  assert.deepEqual(scoreRecup(VENDREDI, d).detail.vfc.norme, c1.detail.vfc.norme);
});

test("sans la montre : la part absente compte pour 70, la précision baisse, la cible n'est pas ajustée", () => {
  const d = planche();
  d.nuits.set(VENDREDI, { rmssd: null, fcRepos: null, sommeilMin: 432, milieuMin: null, besoinMin: 460, sourceSommeil: "telephone" });
  const r = scoreRecup(VENDREDI, d);
  assert.equal(r.apports.vfc.absente, true);
  assert.equal(r.apports.vfc.valeur, 70);
  assert.equal(r.precision, 25);
  assert.equal(r.score, 70);
  assert.equal(r.prudent, true);
  assert.equal(r.forme, 1);
  assert.deepEqual([r.apports.vfc.apport, r.apports.fc.apport, r.apports.sommeil.apport, r.apports.charge.apport], [31, 14, 18, 7]);
  assert.equal(r.detail.sommeil.source, "telephone");
  assert.equal(r.detail.sommeil.regularite, null);
  // version 4 (D17) : la nuit du téléphone compte dans la dette, à moitié pour sa précision (6 nuits de montre : 88 %)
  assert.equal(r.detail.sommeil.dette, 68);
  assert.equal(r.detail.sommeil.calcul.dette.precision, 88);
});

test("sous 25 % : pas de score (la charge seule), et sans rien du tout non plus", () => {
  const d = planche();
  d.nuits.delete(VENDREDI);
  const r = scoreRecup(VENDREDI, d);
  assert.equal(r.score, null);
  assert.equal(r.niveau, null);
  assert.equal(r.precision, 10);
  assert.equal(r.nuit, false);
  assert.equal(r.forme, 1);
  const vide = scoreRecup(VENDREDI, { nuits: new Map(), charges: new Map(), objectifSommeil: 450 });
  assert.equal(vide.score, null);
  assert.equal(vide.precision, 0);
  assert.equal(vide.calcule, 70);
});

test("la norme : inutilisable sous 14 nuits, à moitié à 14, pleine à 28", () => {
  assert.equal(qualiteNorme(13), 0);
  assert.equal(qualiteNorme(14), 0.5);
  assert.equal(qualiteNorme(21), 0.75);
  assert.equal(qualiteNorme(28), 1);
  assert.equal(qualiteNorme(42), 1);
  const n = norme([50, 50, 50], false, 2);
  assert.equal(n!.sd, 2);
  assert.equal(norme([], false, 2), null);
  // 10 nuits seulement : la VFC et la FC comptent comme absentes
  const d = planche();
  for (let i = 11; i <= 84; i++) {
    const j = decalerIso(VENDREDI, -i);
    d.nuits.set(j, { ...d.nuits.get(j)!, rmssd: null, fcRepos: null });
  }
  const r = scoreRecup(VENDREDI, d);
  assert.ok(r.apports.vfc.absente && r.apports.fc.absente);
  assert.equal(r.precision, 35);
});

test("la garde : une VFC très basse plafonne à 66, jamais « Prêt »", () => {
  const d = planche();
  d.nuits.set(VENDREDI, { ...d.nuits.get(VENDREDI)!, rmssd: 38, fcRepos: 49 });
  // tout le reste au mieux : deux jours de repos
  d.charges.delete(decalerIso(VENDREDI, -1));
  const r = scoreRecup(VENDREDI, d);
  assert.ok(r.apports.vfc.valeur < RECUP.garde.partVfc);
  if (r.brut > 66) {
    assert.equal(r.score, 66);
    assert.ok(r.garde);
  }
  assert.notEqual(r.niveau, "pret");
});

test("changer RECUP recalcule tout l'historique, sans toucher aux données", () => {
  const d = planche();
  const avant = JSON.stringify([...d.nuits]);
  const jours = Array.from({ length: 14 }, (_, i) => decalerIso(VENDREDI, -i));
  const a = scoresRecup(jours, d);
  const p2: ParamsRecup = { ...RECUP, version: 2, poids: { vfc: 0.25, fc: 0.25, sommeil: 0.25, charge: 0.25 } };
  const b = scoresRecup(jours, d, p2);
  assert.equal(JSON.stringify([...d.nuits]), avant);
  assert.equal(b.get(VENDREDI)!.version, 2);
  assert.ok(jours.some((j) => a.get(j)!.calcule !== b.get(j)!.calcule));
  // les seuils aussi : 90 n'est plus « Prêt » avec un seuil à 95
  const p3: ParamsRecup = { ...RECUP, version: 3, seuils: [34, 95] };
  assert.equal(scoreRecup(VENDREDI, d, p3).niveau, "correct");
});

test("la forme de la cible : 1 à 65, + 15 % à 90, − 20 % à 32, amortie par la précision, bornée", () => {
  assert.equal(formeCible(65, 100), 1);
  assert.equal(Math.round(formeCible(90, 100) * 100) / 100, 1.15);
  assert.equal(Math.round(formeCible(32, 100) * 1000) / 1000, 0.802);
  assert.equal(formeCible(90, 39), 1);
  assert.equal(formeCible(null, 100), 1);
  assert.ok(Math.abs(formeCible(90, 50) - 1.075) < 1e-9);
  assert.equal(formeCible(0, 100), 0.61);
  assert.equal(formeCible(-500, 100), 0.6);
});

test("la cible d'Effort suit la Récupération (forme passée à cibleEffort), et un repos prévu garde la sienne", () => {
  const charges = new Map<number, number>();
  const jour = new Date(2026, 9, 30).getTime();
  const decaler = (n: number) => new Date(2026, 9, 30 + n).getTime();
  for (let i = 1; i <= 28; i++) charges.set(decaler(-i), 260);
  const base = { jour, charges, premier: decaler(-40), age: 40, blessure: false, futur: false };
  const avec = cibleEffort({ ...base, forme: 1.15 })!;
  const sans = cibleEffort({ ...base, forme: 1 })!;
  assert.deepEqual([avec.bas, avec.haut], [7, 7.5]);
  assert.deepEqual([sans.bas, sans.haut], [6.5, 7]);
  // sans Récupération (rien de la nuit) : la cible existe quand même, l'habituelle
  assert.deepEqual([cibleEffort({ ...base, forme: null })!.bas], [6.5]);
  const repos = cibleEffort({ ...base, forme: 1.2, repos: true })!;
  assert.equal(repos.base, "repos");
  assert.equal(repos.bas, 0);
});

test("la dette des 7 nuits se mesure contre l'objectif, pas contre le besoin de la nuit (qui contient déjà la dette) ni celui de Whoop", () => {
  // 7 nuits de 6 h pour un objectif de 8 h : 2 h par nuit, pondérées 7/7 … 1/7 (4 nuits pleines) = 8 h à rattraper, même si
  // le besoin de Whoop (besoinMin) dit 10 h ; le besoin lu est le nôtre : 8 h + 45 min de rattrapage
  const nuits = new Map<string, NuitRecup>();
  for (let i = 0; i < 8; i++) nuits.set(decalerIso(VENDREDI, -i), { ...planche().nuits.get(VENDREDI)!, sommeilMin: 360, besoinMin: 600 });
  const r = scoreRecup(VENDREDI, { nuits, charges: new Map(), objectifSommeil: 480 });
  assert.equal(r.detail.sommeil.dette, 4 * 120);
  assert.equal(r.detail.sommeil.calcul.dette.cumul, 7 * 120);
  assert.equal(r.detail.sommeil.besoin, 480 + 45);
});
