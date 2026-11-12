// L'Effort pepfit (planche effort-pepfit, NOTES § 2, 4, 5, 6) : la formule et ses exemples, la saturation, la journée non
// additive, la semaine, le recalcul quand la courbe change (sans toucher aux charges), la muscu au ressenti, la cible, l'anneau.
import assert from "node:assert/strict";
// node --test (npm test) d'ordinaire.
// (« as string » : vitest n'est pas une dépendance de pepfit, le typage ne le cherche pas.)
const { test } = (process.env.VITEST ? await import("vitest" as string) : await import("node:test")) as typeof import("node:test");
import {
  arrondiEffort, chargeDeScore, chargeFc, chargeRessenti, chargeSeance, cibleEffort, COURBE_EFFORT, demiPoint, effortDeCharges, etatEffort,
  partAnneau, plageCible, REPERES_EFFORT, ressentiDeSeance, rythmeSemaine, scoreEffort, scoreSemaine, zoneAnneau, type CourbeEffort,
  type EntreeCible, MILIEU_SEMAINE,
} from "../src/ecrans/effort-pepfit.ts";
import { rpeDeRir } from "../src/boutique/poids.ts";
import { chargePasTotal } from "../src/ecrans/effort-activite.ts";
import {
  CHARGE_MUSCU, difficulteExercice, effortSeries, facteurHabitude, comptesParSeance, poidsReps, poidsReserve, pointsSansDetail, referenceExercice,
  reserveSerie, resteReference, type ExoMuscu, type SerieMuscu,
} from "../src/ecrans/effort-muscu.ts";
import { partsSeance } from "../src/ecrans/effort-pepfit.ts";

const proche = (a: number, b: number, eps = 0.05) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const affiche = (charge: number, c?: CourbeEffort) => arrondiEffort(scoreEffort(charge, c));

test("la courbe : 140 points font 5, et le tableau des paliers de NOTES § 2.2", () => {
  assert.equal(scoreEffort(140), 5);
  const paliers: [number, number][] = [[2, 46], [3, 71], [4, 101], [5, 140], [6, 194], [7, 276], [8, 424], [9, 812]];
  for (const [s, c] of paliers) proche(chargeDeScore(s), c, 1);
  for (const [s] of paliers) proche(scoreEffort(chargeDeScore(s)), s, 1e-9);
});

test("les exemples de NOTES § 2.3", () => {
  // FC max 182 : zones 91-109-127-146-164 ; charge = minutes × 1 à 5
  const ex: [string, number, number][] = [
    ["marche tranquille 45 min, zone 1", chargeFc([45, 0, 0, 0, 0]), 1.9],
    ["muscu 1 h à 110 bpm", chargeFc([25, 17, 3, 0, 0]), 2.9],
    ["muscu 1 h, ressenti « Dur »", chargeRessenti("dur", 60), 6.2],
    ["course 45 min en zone 3-4", chargeFc([0, 5, 20, 20, 0]), 5.2],
    ["padel 1 h 30 à 130 bpm", chargeFc([15, 30, 35, 10, 0]), 6.4],
    ["Push A + footing", 130 + 156, 7.1],
    ["marathon 3 h 30", chargeFc([0, 10, 50, 140, 10]), 9.0],
  ];
  assert.deepEqual(ex.map(([, c]) => c), [45, 68, 210, 150, 220, 286, 780]);
  for (const [nom, c, s] of ex) assert.equal(affiche(c), s, nom);
});

test("saturation : monter coûte de plus en plus, sans jamais toucher l'échelle", () => {
  assert.equal(scoreEffort(0), 0);
  assert.equal(scoreEffort(-5), 0);
  // de 7 à 8 : 150 points ; de 8 à 9 : 390
  proche(chargeDeScore(8) - chargeDeScore(7), 150, 5);
  proche(chargeDeScore(9) - chargeDeScore(8), 390, 5);
  for (const c of [1e3, 1e4, 1e6]) assert.ok(scoreEffort(c) < COURBE_EFFORT.echelle);
  assert.ok(scoreEffort(1e4) > scoreEffort(1e3));
  assert.equal(chargeDeScore(COURBE_EFFORT.echelle), Infinity);
  // doubler la charge autour de 5 ajoute environ 2
  proche(scoreEffort(280) - scoreEffort(140), 2, 0.2);
});

test("la journée additionne les points, jamais les scores : 4,8 et 5,3 font 7,1", () => {
  assert.equal(affiche(130), 4.8);
  assert.equal(affiche(156), 5.3);
  const j = effortDeCharges([130, 156]);
  assert.equal(j.charge, 286);
  assert.equal(arrondiEffort(j.score), 7.1);
  assert.notEqual(arrondiEffort(j.score), arrondiEffort(scoreEffort(130) + scoreEffort(156)));
});

test("la semaine : la même courbe, au milieu de 700 + une semaine ordinaire de pas (D1) ; la semaine de la planche avec ses pas reste vers 5,5", () => {
  // 7 jours à 8 000 pas au barème des pas : 268,8 points d'activité ; 968,8 points font 5
  const activite = 7 * chargePasTotal(8_000);
  assert.ok(Math.abs(activite - 268.8) < 1e-9);
  assert.ok(Math.abs(MILIEU_SEMAINE - (700 + activite)) < 1e-9);
  assert.ok(Math.abs(scoreSemaine(700 + activite) - 5) < 1e-9);
  // la semaine de la planche (826 points de séances, 5,5 avant l'activité) avec une semaine ordinaire de pas : 5,4
  assert.equal(arrondiEffort(scoreSemaine(826 + activite)), 5.4);
  // une semaine très chargée (1 400 points de séances, 7,0 avant) avec ses pas : 6,6
  assert.equal(arrondiEffort(scoreSemaine(1400 + activite)), 6.6);
});

test("les repères du tiroir suivent la courbe : 2, 5,5, 7,5, 9", () => {
  assert.deepEqual(REPERES_EFFORT.map((r) => demiPoint(scoreEffort(r.charge))), [2, 5.5, 7.5, 9]);
});

test("changer la courbe recalcule tout, sans toucher aux charges stockées", () => {
  const charges = [130, 156];
  const avant = effortDeCharges(charges);
  const nouvelle: CourbeEffort = { ...COURBE_EFFORT, version: COURBE_EFFORT.version + 1, milieu: 200 };
  const apres = effortDeCharges(charges, nouvelle);
  assert.deepEqual(charges, [130, 156], "les charges ne bougent pas");
  assert.equal(apres.charge, avant.charge);
  assert.ok(apres.score < avant.score);
  assert.equal(scoreEffort(200, nouvelle), 5);
  assert.ok(Math.abs(scoreSemaine(200 * COURBE_EFFORT.semaine, nouvelle) - 5) < 1e-9, "la semaine suit le milieu");
  // repères et cible se déplacent avec elle
  assert.ok(scoreEffort(REPERES_EFFORT[1].charge, nouvelle) < scoreEffort(REPERES_EFFORT[1].charge));
  const e = entree();
  assert.ok(cibleEffort(e, nouvelle)!.hautExact < cibleEffort(e)!.hautExact);
  assert.equal(cibleEffort(e, nouvelle)!.visee, cibleEffort(e)!.visee, "la charge visée ne dépend pas de la courbe");
});

test("ressenti d'une séance : le mot du milieu de ses séries dites", () => {
  const r = (rir: number) => rpeDeRir(rir);
  assert.equal(ressentiDeSeance([]), null);
  assert.equal(ressentiDeSeance([null, null]), null);
  assert.equal(ressentiDeSeance([r(2), r(2), r(1)]), "bien");
  assert.equal(ressentiDeSeance([r(3), r(2), r(1), r(0)]), "dur");
  assert.equal(ressentiDeSeance([r(0)]), "max");
  assert.equal(ressentiDeSeance([r(5), null]), "facile");
});

test("D3 : la muscu se mesure au ressenti, même avec la FC ; sans ressenti, la FC avec « ~ »", () => {
  const zones = [25, 17, 3, 0, 0];
  const avec = chargeSeance({ sportId: "cat:musculation", minutes: 60, zones, ressenti: "dur" })!;
  assert.equal(avec.methode, "ressenti");
  assert.equal(avec.charge, 210);
  assert.equal(avec.estime, false);
  assert.equal(affiche(avec.charge), 6.2);
  const sans = chargeSeance({ sportId: "cat:musculation", minutes: 60, zones, ressenti: null })!;
  assert.equal(sans.methode, "fc");
  assert.equal(sans.charge, 68);
  assert.equal(sans.estime, true);
  // Push A de la planche : « Bien » × 52 min = 130
  const push = chargeSeance({ sportId: null, minutes: 52, zones: null, ressenti: "bien" })!;
  assert.deepEqual([push.methode, push.charge], ["ressenti", 130]);
});

test("les autres sports : la FC d'abord, puis le ressenti, puis le barème « ~ » ; la récupération ne compte pas", () => {
  const foot = chargeSeance({ sportId: "cat:course", minutes: 47, zones: [0, 5, 22, 20, 0], ressenti: "bien" })!;
  assert.deepEqual([foot.methode, foot.charge, foot.estime], ["fc", 156, false]);
  // FC trop courte (moins de la moitié de la séance) : le ressenti
  const coupee = chargeSeance({ sportId: "cat:padel", minutes: 90, zones: [10, 5, 0, 0, 0], ressenti: "dur" })!;
  assert.equal(coupee.methode, "ressenti");
  const bareme = chargeSeance({ sportId: "cat:course", minutes: 30, zones: null, ressenti: null })!;
  assert.deepEqual([bareme.methode, bareme.estime], ["bareme", true]);
  proche(bareme.charge, 96, 1e-9);
  assert.equal(chargeSeance({ sportId: "cat:sauna", minutes: 20, zones: null, ressenti: null }), null);
  assert.equal(chargeSeance({ sportId: "cat:course", minutes: 0, zones: null, ressenti: null }), null);
});

test("le rythme : 966 ÷ 900 = 1,1, dans ton rythme ; les bandes de Gabbett", () => {
  const r = rythmeSemaine(966, 3600)!;
  proche(r.r, 1.07, 0.01);
  assert.equal(r.bande, "rythme");
  assert.equal(rythmeSemaine(500, 3600)!.bande, "calme");
  assert.equal(rythmeSemaine(1260, 3600)!.bande, "plus");
  assert.equal(rythmeSemaine(1800, 3600)!.bande, "beaucoup");
  assert.equal(rythmeSemaine(100, 0), null);
});

// ---------------------------------------------------------------- la cible

const J = new Date(2026, 9, 30).getTime();
const jour = (n: number) => new Date(2026, 9, 30 + n).getTime();
function entree(x: Partial<EntreeCible> = {}): EntreeCible {
  // 28 jours avant : une séance un jour sur deux, médiane 260 (la planche)
  const charges = new Map<number, number>();
  for (let i = 1; i <= 34; i++) if (i % 2 === 0) charges.set(jour(-i), i % 4 === 0 ? 240 : 280);
  charges.set(jour(-14), 260);
  charges.set(jour(-1), 260);
  return { jour: J, charges, premier: jour(-34), forme: 1, age: 46, blessure: false, futur: false, ...x };
}

test("cible de la planche : habitude 260, forme 1 → de 6,4 à 7,2, affichée 6,5 – 7 ; 7,1 y est", () => {
  const c = cibleEffort(entree())!;
  assert.equal(c.habitude, 260);
  assert.equal(c.m, 1);
  assert.equal(c.base, "habitude");
  proche(c.basExact, 6.4);
  proche(c.hautExact, 7.2);
  assert.equal(c.bas, 6.5);
  assert.equal(c.haut, 7);
  assert.equal(etatEffort(7.1, c), "ok");
  assert.equal(etatEffort(5, c), "cours");
  assert.equal(etatEffort(8.5, c), "ok");
  assert.equal(etatEffort(8.4, c), "ok");
});

test("cible : séance prévue faite 4 fois, repos prévu, forme bornée", () => {
  assert.equal(cibleEffort(entree({ joursSeance: [300, 320, 310] }))!.base, "habitude");
  const s = cibleEffort(entree({ joursSeance: [300, 320, 310, 330] }))!;
  assert.equal(s.base, "seance");
  assert.equal(s.visee, 315);
  const r = cibleEffort(entree({ repos: true }))!;
  assert.deepEqual([r.base, r.bas, r.haut], ["repos", 0, 1]);
  // la forme vient de la Récupération (recup-pepfit.ts) : bornée de 0,6 à 1,2 ; null vaut 1, la cible habituelle
  assert.equal(cibleEffort(entree({ forme: 0.2 }))!.m, 0.6);
  assert.equal(cibleEffort(entree({ forme: 3 }))!.m, 1.2);
  assert.equal(cibleEffort(entree({ forme: null }))!.m, 1);
});

test("pas de cible : moins de 7 jours depuis la première séance, jour à venir, blessure, moins de 18 ans (rien de la nuit : la cible habituelle)", () => {
  assert.equal(cibleEffort(entree({ premier: jour(-5) })), null);
  assert.ok(cibleEffort(entree({ premier: jour(-8) })), "7 jours depuis la première séance suffisent");
  assert.equal(cibleEffort(entree({ premier: null })), null);
  assert.deepEqual([cibleEffort(entree({ forme: null }))!.bas, cibleEffort(entree({ forme: null }))!.haut], [6.5, 7]);
  assert.equal(cibleEffort(entree({ futur: true })), null);
  assert.equal(cibleEffort(entree({ blessure: true })), null);
  assert.equal(cibleEffort(entree({ age: 16 })), null);
  assert.equal(cibleEffort(entree({ charges: new Map() })), null);
});

test("la plage de la cible se resserre de 7 à 28 jours depuis la première séance", () => {
  const [b7, h7] = plageCible(7), [b28, h28] = plageCible(28);
  proche(b7, 0.7, 1e-9); proche(h7, 1.3, 1e-9);
  proche(b28, 0.85, 1e-9); proche(h28, 1.15, 1e-9);
  assert.deepEqual(plageCible(60), plageCible(28));
  const jeune = cibleEffort(entree({ premier: jour(-8) }))!, mure = cibleEffort(entree({ premier: jour(-34) }))!;
  assert.ok(jeune.haut - jeune.bas > mure.haut - mure.bas, "plus large au début");
});

test("D7 : l'anneau est toujours sur 0 à 10, avec ou sans cible ; l'arc de la cible est sur le même tour", () => {
  const c = { bas: 4.5, haut: 5.5 };
  proche(partAnneau(6.4), 0.64, 1e-9); // 6,4 avec la cible 4,5 à 5,5 : 64 %, plus plein
  proche(partAnneau(7.1), 0.71, 1e-9);
  assert.equal(partAnneau(0), 0);
  assert.equal(partAnneau(null), 0);
  assert.equal(partAnneau(10), 1);
  assert.equal(partAnneau(14), 1, "au-delà de 10 : plafonné à 100 %");
  assert.equal(partAnneau(-1), 0);
  const z = zoneAnneau(c)!;
  proche(z[0], 0.45, 1e-9);
  proche(z[1], 0.55, 1e-9);
  assert.equal(zoneAnneau(null), null);
  assert.equal(zoneAnneau({ bas: 0, haut: 0 }), null);
  const repos = zoneAnneau({ bas: 0, haut: 1 })!;
  assert.deepEqual([repos[0], repos[1]], [0, 0.1], "repos : de 0 à 1");
  assert.deepEqual(zoneAnneau({ bas: 9.5, haut: 12 }), [0.95, 1], "cible hors échelle : plafonnée");
  assert.deepEqual(zoneAnneau({ bas: 11, haut: 12 }), [1, 1]);
});

// ---------------------------------------------------------------- la muscu à ses séries (docs/CODE-EFFORT-CHARGE.md)

const JMS = 86_400_000;
const D = new Date(2026, 10, 3, 18).getTime();
type Exo = Pick<SerieMuscu, "exo" | "nom" | "slug" | "muscle" | "equipement" | "nature">;
const EXOS: Record<string, Exo> = {
  tirage: { exo: "tirage", nom: "Tirage vertical (Poulie)", slug: "lat-pulldown", muscle: "Grand dorsal", equipement: "poulie", nature: "poids_reps" },
  rowing: { exo: "rowing", nom: "Rowing barre penché", slug: "bent-over-barbell-row", muscle: "Milieu du dos", equipement: "barre", nature: "poids_reps" },
  tractions: { exo: "tractions", nom: "Tractions", slug: "pull-up", muscle: "Grand dorsal", equipement: "poids_du_corps", nature: "reps" },
  curl: { exo: "curl", nom: "Curl (Haltère)", slug: "dumbbell-curl", muscle: "Biceps", equipement: "halteres", nature: "poids_reps" },
  facepull: { exo: "facepull", nom: "Face pull (Poulie)", slug: "face-pull", muscle: "Épaules", equipement: "poulie", nature: "poids_reps" },
  presse: { exo: "presse", nom: "Presse à cuisses (Machine)", slug: "leg-press", muscle: "Quadriceps", equipement: "machine", nature: "poids_reps" },
  squat: { exo: "squat", nom: "Squat (Barre)", slug: "squat", muscle: "Quadriceps", equipement: "barre", nature: "poids_reps" },
  dc: { exo: "dc", nom: "Développé couché (Barre)", slug: "bench-press", muscle: "Pectoraux", equipement: "barre", nature: "poids_reps" },
  rameur: { exo: "rameur", nom: "Rameur", slug: "rowing-stationary", muscle: null, equipement: "cardio", nature: "distance_duree" },
  sdt: { exo: "sdt", nom: "Soulevé de terre roumain (Barre)", slug: "romanian-deadlift", muscle: "Ischio-jambiers", equipement: "barre", nature: "poids_reps" },
  legcurl: { exo: "legcurl", nom: "Leg curl (Machine)", slug: "lying-leg-curl", muscle: "Ischio-jambiers", equipement: "machine", nature: "poids_reps" },
  legext: { exo: "legext", nom: "Leg extension (Machine)", slug: "leg-extension", muscle: "Quadriceps", equipement: "machine", nature: "poids_reps" },
  mollets: { exo: "mollets", nom: "Mollets debout (Machine)", slug: "standing-calf-raise", muscle: "Mollets", equipement: "machine", nature: "poids_reps" },
  incline: { exo: "incline", nom: "Développé incliné (Haltères)", slug: "incline-dumbbell-press", muscle: "Pectoraux", equipement: "halteres", nature: "poids_reps" },
  militaire: { exo: "militaire", nom: "Développé militaire (Barre)", slug: "overhead-press", muscle: "Épaules", equipement: "barre", nature: "poids_reps" },
  dips: { exo: "dips", nom: "Dips", slug: "dips", muscle: "Triceps", equipement: "poids_du_corps", nature: "reps" },
  elevations: { exo: "elevations", nom: "Élévations latérales (Haltères)", slug: "lateral-raise", muscle: "Épaules", equipement: "halteres", nature: "poids_reps" },
  triceps: { exo: "triceps", nom: "Extension triceps (Poulie)", slug: "triceps-pushdown", muscle: "Triceps", equipement: "poulie", nature: "poids_reps" },
  goblet: { exo: "goblet", nom: "Squat goblet (Haltère)", slug: "goblet-squat", muscle: "Quadriceps", equipement: "halteres", nature: "poids_reps" },
  pompes: { exo: "pompes", nom: "Pompes", slug: "push-up", muscle: "Pectoraux", equipement: "poids_du_corps", nature: "reps" },
  rowingH: { exo: "rowingH", nom: "Rowing (Haltère)", slug: "dumbbell-row", muscle: "Milieu du dos", equipement: "halteres", nature: "poids_reps" },
};
const serieM = (e: string, kg: number | null, reps: number, date: number, o: Partial<SerieMuscu> = {}): SerieMuscu => ({
  ...EXOS[e]!, seance: String(date), date, type: "normale", kg, reps, rpe: null, chargeEff: e === "tractions" ? 80 : null, dureeS: null, ...o,
});
const fois = (e: string, kg: number | null, reps: number, n: number, date: number, o: Partial<SerieMuscu> = {}) =>
  Array.from({ length: n }, () => serieM(e, kg, reps, date, o));
/** Le Pull d'Alex (37 min, FC moy. 117 : 1,7 avant) : tirage 95 × 12 × 3, rowing, tractions, curl, face pull ; 9 141 kg. */
const pull = (date: number) => [
  ...fois("tirage", 95, 12, 3, date), ...fois("rowing", 70, 10, 3, date), ...fois("tractions", null, 8, 3, date),
  ...fois("curl", 16, 12, 3, date), ...fois("facepull", 25, 15, 3, date),
];
/** Le même Pull deux fois par semaine pendant six mois, jusqu'à `fin`. */
const histoPull = (fin: number) => {
  const l: SerieMuscu[] = [];
  for (let d = fin - 3 * JMS; d > fin - 190 * JMS; d -= 3.5 * JMS) l.push(...pull(d));
  return l;
};
const ZONES_PULL = [31, 4, 0, 0, 0]; // FC moy. 117 sur 37 min : 39 points, 1,7
const muscu = (seance: SerieMuscu[], histo: SerieMuscu[], zones: number[] | null, minutes = 37, ressenti: "bien" | "dur" | null = null) =>
  chargeSeance({ sportId: "cat:musculation", minutes, zones, ressenti, series: effortSeries(seance, histo, D) })!;

test("recalage : le Pull reconstitué (37 min, 9 141 kg, FC moy. 117) passe de 1,7 à 5,2 ; sans FC 4,3", () => {
  assert.equal(pull(D).reduce((t, s) => t + (s.kg ?? s.chargeEff!) * s.reps!, 0), 9141);
  // avant : la FC seule, faute de ressenti (D3)
  const avant = chargeSeance({ sportId: "cat:musculation", minutes: 37, zones: ZONES_PULL, ressenti: null })!;
  assert.deepEqual([avant.methode, avant.estime, affiche(avant.charge)], ["fc", true, 1.7]);
  const c = muscu(pull(D), histoPull(D), ZONES_PULL);
  assert.deepEqual([c.methode, c.estime, c.series], ["fc", false, 15]);
  // séries à leur habitude (2 en réserve) : 111 points ; la FC (39) en entier
  proche(c.muscu!, 110.7, 0.1);
  proche(c.charge, c.muscu! + 39, 1e-9);
  assert.equal(affiche(c.charge), 5.2);
  assert.equal(affiche(muscu(pull(D), histoPull(D), null).charge), 4.3);
  // avec le ressenti « Bien » : moitié séries, moitié Foster (37 × 2,5)
  const bien = muscu(pull(D), histoPull(D), ZONES_PULL, 37, "bien");
  proche(bien.muscu!, (c.muscu! + 92.5) / 2, 1e-9);
  assert.equal(affiche(bien.charge), 5);
});

test("recalage : une séance type de 60 min et 20 séries vaut un ressenti « Bien » sans FC, plus avec ; un circuit reste surtout cardio", () => {
  const corps = (d: number) => [...fois("squat", 100, 8, 4, d), ...fois("presse", 200, 10, 4, d), ...fois("dc", 80, 8, 4, d), ...fois("rowing", 70, 10, 4, d), ...fois("curl", 16, 12, 4, d)];
  const h: SerieMuscu[] = [];
  for (let d = D - 3 * JMS; d > D - 190 * JMS; d -= 3.5 * JMS) h.push(...corps(d));
  const sans = muscu(corps(D), h, null, 60);
  // 158 points : un ressenti « Bien » (150) à 5 % près, depuis le recalage sur Whoop (docs/CODE-EFFORT-CHARGE.md § 5)
  proche(sans.charge, chargeRessenti("bien", 60), 10);
  assert.equal(affiche(sans.charge), 5.4);
  assert.equal(affiche(muscu(corps(D), h, [40, 10, 0, 0, 0], 60).charge), 6.3);
  // circuit : des séries légères, le cœur en zones 3-4 : jamais moins que la FC seule, et surtout cardio
  const circuit = muscu(fois("squat", 60, 15, 5, D), h, [5, 10, 15, 10, 0], 40);
  assert.ok(circuit.charge >= chargeFc([5, 10, 15, 10, 0]));
  const p = partsSeance(circuit)!;
  assert.ok(p.cardio > 0.75, String(p.cardio));
});

test("jamais le tonnage : une presse légère (4 500 kg) compte bien moins qu'un tirage lourd (3 420 kg)", () => {
  const h: SerieMuscu[] = [];
  for (let d = D - 3 * JMS; d > D - 120 * JMS; d -= 7 * JMS) h.push(...fois("presse", 200, 10, 3, d), ...fois("tirage", 95, 12, 3, d));
  const presse = effortSeries(fois("presse", 100, 15, 3, D), h, D)!;
  const tirage = effortSeries(fois("tirage", 95, 12, 3, D), h, D)!;
  assert.ok(presse.points < tirage.points / 1.8, `${presse.points} / ${tirage.points}`);
  // la presse à 100 kg, sa référence à 200 × 10 : 30 répétitions en réserve, le poids plancher
  assert.equal(reserveSerie(fois("presse", 100, 15, 1, D)[0]!, referenceExercice(h, "presse", D)).rir > 6, true);
  assert.equal(poidsReserve(30), CHARGE_MUSCU.reserve.at(-1));
});

test("le tirage bras tendus à la corde est de l'isolation pour l'effort, malgré le mot « tirage » ; celle d'un gros muscle pèse 0,85", () => {
  type E = Parameters<typeof difficulteExercice>[0];
  const corde: E = { nom: "Tirage vertical bras tendus corde (Poulie)", slug: "rope-straight-arm-pulldown", muscle: "Grand dorsal", equipement: "poulie" };
  assert.equal(difficulteExercice(corde), 0.85);
  // isolation d'un gros muscle (dos, pectoraux, cuisses) : 0,85, sans le bonus du bas du corps ; d'un petit muscle : 0,7
  assert.equal(difficulteExercice({ nom: "Leg extension (Machine)", slug: "leg-extension", muscle: "Quadriceps", equipement: "machine" }), 0.85);
  assert.equal(difficulteExercice({ nom: "Écarté (Haltères)", slug: "dumbbell-fly", muscle: "Pectoraux", equipement: "halteres" }), 0.85);
  assert.equal(difficulteExercice({ nom: "Élévations latérales (Haltères)", slug: "lateral-raise", muscle: "Épaules", equipement: "halteres" }), 0.7);
  assert.equal(difficulteExercice(PULL_3_11.visage!), 0.7);
});

test("la difficulté : polyarticulaire (libre ou guidé) > isolation ; le bas du corps pèse plus ; le rameur n'est pas une série", () => {
  assert.equal(difficulteExercice(EXOS.rowing!), 1);
  assert.equal(difficulteExercice(EXOS.tractions!), 1);
  assert.equal(difficulteExercice(EXOS.tirage!), 1);
  assert.equal(difficulteExercice(EXOS.curl!), 0.7);
  assert.equal(difficulteExercice(EXOS.facepull!), 0.7);
  proche(difficulteExercice(EXOS.squat!), 1.2, 1e-9);
  proche(difficulteExercice(EXOS.presse!), 1.2, 1e-9);
  assert.equal(effortSeries(fois("rameur", null, 0, 1, D, { dureeS: 600 }), [], D), null);
  // l'échauffement ne compte pas
  assert.equal(effortSeries(fois("squat", 40, 10, 2, D, { type: "echauffement" }), [], D), null);
});

test("la proximité de l'échec : le ressenti dit d'abord ; sinon déduite de la référence ; une série ratée est à l'échec", () => {
  const ref = 95 * (1 + 14 / 30); // 95 × 12 à 2 en réserve
  assert.deepEqual(reserveSerie(serieM("tirage", 95, 12, D, { rpe: rpeDeRir(0) }), ref), { rir: 0, repere: true });
  proche(reserveSerie(serieM("tirage", 95, 12, D), ref).rir, 2, 1e-9);
  proche(reserveSerie(serieM("tirage", 95, 10, D), ref).rir, 4, 1e-9);
  assert.equal(reserveSerie(serieM("tirage", 110, 12, D), ref).rir, 0, "au-delà de la référence : à l'échec");
  assert.deepEqual(reserveSerie(serieM("tirage", 95, 12, D, { type: "rate" }), null), { rir: 0, repere: true });
  assert.deepEqual(reserveSerie(serieM("tirage", 95, 12, D), null), { rir: CHARGE_MUSCU.reserveSansRepere, repere: false });
  assert.deepEqual([0, 1, 2, 3, 6, 9].map(poidsReserve), [1.2, 1.1, 1, 0.85, 0.4, 0.4]);
  proche(poidsReserve(2.5), 0.925, 1e-9);
});

test("la référence : la deuxième meilleure séance (une faute de frappe ne compte pas) ; rien au-delà de six mois", () => {
  const h = [...fois("rowing", 70, 10, 3, D - 7 * JMS), ...fois("rowing", 72.5, 10, 3, D - 4 * JMS), ...fois("rowing", 700, 10, 1, D - 10 * JMS)];
  proche(referenceExercice(h, "rowing", D)!, 72.5 * (1 + 12 / 30), 1e-9);
  assert.equal(referenceExercice(fois("rowing", 70, 10, 3, D - 200 * JMS), "rowing", D), null);
  // le ressenti dit d'une série passée sert à sa référence
  proche(referenceExercice(fois("rowing", 70, 10, 1, D - 2 * JMS, { rpe: rpeDeRir(0) }), "rowing", D)!, 70 * (1 + 10 / 30), 1e-9);
});

test("désentraînement : la référence ne bouge pas 3 semaines, puis baisse doucement (2 mois : 10 % de moins) ; le même Pull rapporte 6,1 au retour", () => {
  assert.equal(resteReference(0), 1);
  assert.equal(resteReference(21), 1);
  proche(resteReference(61), 0.9, 0.001);
  assert.equal(resteReference(1000), 1 - CHARGE_MUSCU.reference.perteMax);
  const retour = muscu(pull(D), histoPull(D - 61 * JMS), ZONES_PULL);
  const habituel = muscu(pull(D), histoPull(D), ZONES_PULL);
  assert.ok(retour.muscu! > habituel.muscu! * 1.35, `${retour.muscu} / ${habituel.muscu}`);
  assert.equal(affiche(retour.charge), 6.1);
  assert.equal(effortSeries(pull(D), histoPull(D - 61 * JMS), D)!.habitude, CHARGE_MUSCU.habitude.max);
});

test("l'habitude : 1 en rythme, jusqu'à 1,2 après une pause complète, entre les deux au retour ; 1 sans passé", () => {
  const h = histoPull(D);
  assert.equal(facteurHabitude(comptesParSeance(h), D), 1);
  assert.equal(facteurHabitude([], D), 1);
  assert.equal(facteurHabitude(comptesParSeance(histoPull(D - 61 * JMS)), D), 1.2);
  // deux semaines de reprise après la pause : la moitié du volume habituel des 28 derniers jours
  const reprise = [...histoPull(D - 75 * JMS), ...pull(D - 3 * JMS), ...pull(D - 7 * JMS), ...pull(D - 10 * JMS), ...pull(D - 14 * JMS)];
  const f = facteurHabitude(comptesParSeance(reprise), D);
  assert.ok(f > 1.05 && f < 1.15, String(f));
});

test("sans historique : une réserve prudente, la valeur est marquée « ~ » ; le ressenti de la séance l'enlève", () => {
  const c = muscu(pull(D), [], ZONES_PULL);
  assert.equal(c.estime, true);
  assert.ok(c.muscu! < muscu(pull(D), histoPull(D), ZONES_PULL).muscu!, "plus prudent qu'à l'habitude");
  assert.equal(affiche(c.charge), 4.8);
  assert.equal(muscu(pull(D), [], ZONES_PULL, 37, "bien").estime, false);
  assert.equal(muscu(pull(D), [], null).methode, "bareme");
});

test("les parts musculaire et cardio : en lecture seule, avec la FC seulement", () => {
  const c = muscu(pull(D), histoPull(D), ZONES_PULL);
  const p = partsSeance(c)!;
  proche(p.musculaire, c.muscu! / c.charge, 1e-9);
  proche(p.musculaire + p.cardio, 1, 1e-9);
  assert.ok(p.musculaire > 0.7, String(p.musculaire));
  assert.equal(partsSeance(muscu(pull(D), histoPull(D), null)), null, "sans FC : rien");
  assert.equal(partsSeance(chargeSeance({ sportId: "cat:course", minutes: 47, zones: [0, 5, 22, 20, 0], ressenti: null })!), null, "hors séries : rien");
});

test("sans séries, la muscu garde ses règles (D3) ; les autres sports ignorent les séries", () => {
  const avec = chargeSeance({ sportId: "cat:musculation", minutes: 60, zones: [25, 17, 3, 0, 0], ressenti: "dur", series: null })!;
  assert.deepEqual([avec.methode, avec.charge, avec.muscu], ["ressenti", 210, undefined]);
  const foot = chargeSeance({ sportId: "cat:course", minutes: 47, zones: [0, 5, 22, 20, 0], ressenti: null, series: effortSeries(pull(D), [], D) })!;
  assert.deepEqual([foot.methode, foot.charge, foot.muscu], ["fc", 156, undefined]);
});

// ---------------------------------------------------------------- recalage sur Whoop : le Pull du 3/11 (docs/CODE-EFFORT-CHARGE.md § 5)

/** Les cinq exercices du Pull du 3/11, tels qu'au catalogue. */
const PULL_3_11: Record<string, Exo> = {
  tirage: { exo: "cat:wide-grip-lat-pulldown", nom: "Tirage poitrine prise large (Poulie)", slug: "wide-grip-lat-pulldown", muscle: "Grand dorsal", equipement: "poulie", nature: "poids_reps" },
  rowing: { exo: "cat:seated-cable-rows", nom: "Rowing poulie assis", slug: "seated-cable-rows", muscle: "Milieu du dos", equipement: "poulie", nature: "poids_reps" },
  tractions: { exo: "cat:pullups", nom: "Tractions", slug: "pullups", muscle: "Grand dorsal", equipement: "poids_du_corps", nature: "reps" },
  corde: { exo: "cat:rope-straight-arm-pulldown", nom: "Tirage vertical bras tendus corde (Poulie)", slug: "rope-straight-arm-pulldown", muscle: "Grand dorsal", equipement: "poulie", nature: "poids_reps" },
  visage: { exo: "cat:face-pull", nom: "Tirage visage (Poulie)", slug: "face-pull", muscle: "Épaules", equipement: "poulie", nature: "poids_reps" },
};
const serie311 = (e: string, kg: number | null, reps: number, n: number, date: number): SerieMuscu[] =>
  Array.from({ length: n }, () => ({ ...PULL_3_11[e]!, seance: String(date), date, type: "normale", kg, reps, rpe: null, chargeEff: null, dureeS: null }));
/** Le Pull du 3/11 saisi en entier, au détail de Whoop : 5 exercices, 15 séries, 162 répétitions, 7 470 kg (tractions à 0 kg chez Whoop). */
const pull311 = (d: number) => [
  ...serie311("tirage", 95, 12, 3, d), ...serie311("rowing", 60, 12, 3, d), ...serie311("tractions", null, 8, 3, d),
  ...serie311("corde", 27.5, 12, 3, d), ...serie311("visage", 30, 10, 3, d),
];
/** Historique prudent : le même Pull, aux mêmes charges, une fois par semaine pendant six mois (aucun progrès, aucune pause). */
const histo311 = () => {
  const l: SerieMuscu[] = [];
  for (let d = D - 5 * JMS; d > D - 182 * JMS; d -= 7 * JMS) l.push(...pull311(d));
  return l;
};
/** La FC de pepfit ce jour-là : 37 min, moy. 117, max 156 ; Z1 25:58, Z2 6:44, Z3 4:01. */
const ZONES_311 = [25 + 58 / 60, 6 + 44 / 60, 4 + 1 / 60, 0, 0];
const pull311Charge = (seance: SerieMuscu[], exos: ExoMuscu[] = [], zones: number[] | null = ZONES_311) =>
  chargeSeance({ sportId: "cat:musculation", minutes: 37, zones, ressenti: null, series: effortSeries(seance, histo311(), D, undefined, exos) })!;

test("recalage sur Whoop : le Pull du 3/11 saisi en entier (Whoop 13,8 sur 21) vaut entre 5,5 et 6,6, sans « ~ »", () => {
  const s = pull311(D);
  assert.deepEqual([s.length, s.reduce((t, x) => t + x.reps!, 0), s.reduce((t, x) => t + (x.kg ?? 0) * x.reps!, 0)], [15, 162, 7470]);
  // la FC seule : 51,5 points, 2,2
  proche(chargeFc(ZONES_311), 51.5, 0.05);
  assert.equal(affiche(chargeFc(ZONES_311)), 2.2);
  const c = pull311Charge(s);
  assert.deepEqual([c.methode, c.estime, c.series], ["fc", false, 15]);
  const e = affiche(c.charge);
  assert.ok(e >= 5.5 && e <= 6.6, String(e));
  // 5,5 : le bas de la fourchette (§ 5 bis : la corde en isolation d'un gros muscle, 0,85)
  assert.equal(e, 5.5);
  // les parts : musculaire 69 %, cardio 31 % (Whoop : 80 % et 20 %)
  proche(partsSeance(c)!.musculaire, 0.69, 0.01);
  assert.equal(effortSeries(s, histo311(), D)!.habitude, 1, "historique prudent : aucun bonus de reprise");
});

test("recalage sur Whoop : le Pull du 3/11 avec le seul tirage détaillé (Whoop 8,5 sur 21) vaut entre 3,5 et 4,5, avec « ~ »", () => {
  const detail = serie311("tirage", 95, 12, 3, D);
  const exos = Object.values(PULL_3_11);
  // avant la règle : les quatre exercices sans séries comptaient zéro
  const avant = pull311Charge(detail);
  assert.deepEqual([affiche(avant.charge), avant.estime], [3.2, false]);
  const c = pull311Charge(detail, exos);
  const e = affiche(c.charge);
  assert.ok(e >= 3.5 && e <= 4.5, String(e));
  assert.deepEqual([e, c.estime, c.series], [4, true, 3]);
  // les parts : musculaire 49 %, cardio 51 % (Whoop : 36 % et 64 %)
  proche(partsSeance(c)!.musculaire, 0.49, 0.01);
  assert.equal(effortSeries(detail, histo311(), D, undefined, exos)!.estimes, 4);
  // sans FC : les séries seules, toujours « ~ »
  assert.equal(pull311Charge(detail, exos, null).estime, true);
});

test("cohérence (§ 5 bis) : jambes lourdes, push, full body léger, isolation seule ; rien d'absurde face au ressenti équivalent", () => {
  type Bloc = [string, number | null, number, number];
  const seance = (b: Bloc[], d: number) => b.flatMap(([e, kg, reps, n]) => fois(e, kg, reps, n, d));
  // le même programme une fois par semaine pendant six mois : chaque série à son habitude (2 en réserve, un ressenti « Bien »)
  const habitude = (b: Bloc[]) => {
    const l: SerieMuscu[] = [];
    for (let d = D - 5 * JMS; d > D - 182 * JMS; d -= 7 * JMS) l.push(...seance(b, d));
    return l;
  };
  const points = (b: Bloc[], h: Bloc[] = b) => effortSeries(seance(b, D), habitude(h), D)!.points;
  const jambes = points([["squat", 120, 5, 5], ["presse", 220, 10, 4], ["sdt", 100, 8, 3], ["legcurl", 50, 12, 3], ["mollets", 80, 15, 3]]);
  const push = points([["dc", 80, 8, 4], ["incline", 30, 10, 3], ["militaire", 50, 8, 3], ["dips", null, 10, 3], ["elevations", 10, 15, 3], ["triceps", 30, 12, 3]]);
  // full body de 45 min volontairement léger : un tiers sous les charges habituelles (les pompes restent au poids du corps)
  const leger = points(
    [["goblet", 20, 12, 3], ["pompes", null, 12, 3], ["rowingH", 20, 12, 3], ["elevations", 6, 15, 2], ["curl", 10, 12, 2]],
    [["goblet", 28, 12, 3], ["pompes", null, 12, 3], ["rowingH", 28, 12, 3], ["elevations", 9, 15, 2], ["curl", 14, 12, 2]],
  );
  const isolation = points([["curl", 16, 12, 3], ["elevations", 10, 15, 3], ["triceps", 30, 12, 3], ["legext", 60, 12, 3]]);
  proche(jambes, 141, 0.1);
  proche(push, 137.1, 0.1);
  proche(leger, 59.8, 0.1);
  proche(isolation, 79.7, 0.1);
  // jambes (18 séries, 60 min) et push (19 séries, 55 min) : une séance sérieuse, autour d'un ressenti « Bien » (150 points)
  for (const p of [jambes, push]) assert.ok(p > 125 && p < 165, String(p));
  // le full body léger reste sous un ressenti « Facile » de 45 min, l'isolation seule sous un « Bien » de 35 min
  assert.ok(leger < chargeRessenti("facile", 45), String(leger));
  assert.ok(isolation > chargeRessenti("facile", 35) && isolation < chargeRessenti("bien", 35), String(isolation));
  // et le Pull du 3/11 (15 séries, 37 min) reste sous la séance type de 60 min et 20 séries (157,9)
  assert.ok(effortSeries(pull311(D), histo311(), D)!.points < 157.9);
});

test("un exercice sans série notée : une série prudente (10 répétitions, 3 en réserve), une fois ; ni le cardio ni les exercices notés", () => {
  const exos = Object.values(PULL_3_11);
  const r = PULL_3_11.rowing!;
  proche(pointsSansDetail(r), CHARGE_MUSCU.serie * 1 * poidsReserve(3) * poidsReps(10), 1e-9);
  proche(pointsSansDetail(r), 6.8, 1e-9);
  const detail = serie311("tirage", 95, 12, 3, D);
  const base = effortSeries(detail, histo311(), D)!;
  // un exercice listé deux fois compte une fois ; le rameur ne compte pas ; le tirage, noté, n'est pas estimé
  const avec = effortSeries(detail, histo311(), D, undefined, [r, r, EXOS.rameur!, PULL_3_11.tirage!])!;
  assert.equal(avec.estimes, 1);
  proche(avec.points, base.points + pointsSansDetail(r), 1e-9);
  assert.notEqual(avec.sig, base.sig, "l'empreinte change : la séance est recalculée");
  // des exercices sans aucune série : rien (la règle D3 reste)
  assert.equal(effortSeries([], histo311(), D, undefined, exos), null);
  // le ressenti de la séance enlève le « ~ »
  const bien = chargeSeance({ sportId: "cat:musculation", minutes: 37, zones: ZONES_311, ressenti: "bien", series: effortSeries(detail, histo311(), D, undefined, exos) })!;
  assert.equal(bien.estime, false);
});
