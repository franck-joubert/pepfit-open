// Proximité des noms d'exercice (src/db/proximite.ts) : le rattachement d'un exercice perso au catalogue. Paires réelles
// français et anglais (noms du catalogue et noms Hevy), et les faux positifs interdits.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { equipementDuCatalogue } from "../src/db/natures.ts";
import { jetons, preparerCatalogue, procheDuCatalogue, SEUIL_SUGGESTION, similarite, variantesDeRecherche } from "../src/db/proximite.ts";

interface Entree {
  slug: string;
  nom: string;
  nom_en: string;
  materiel: string | null;
  categorie: string | null;
  muscle: string | null;
}
const CATALOGUE = JSON.parse(readFileSync(new URL("../assets/catalogue/exercices.json", import.meta.url), "utf8")).exercices as Entree[];
// Comme l'appli : le matériel comparé est la colonne `equipement` de la base (« smith », « machine »…), pas le texte du catalogue.
const PREPARE = preparerCatalogue(CATALOGUE.map((e) => ({ ...e, materiel: equipementDuCatalogue(e) })));
const proche = (nom: string, materiel?: string, muscle?: string) => procheDuCatalogue(nom, PREPARE, { materiel, muscle })[0]?.slug;

// Un nom saisi ou importé → les exercices du catalogue acceptables (même geste, même matériel).
const PAIRES: [string, string[]][] = [
  ["Développé Épaules Assis (Machine)", ["leverage-shoulder-press", "machine-shoulder-military-press"]], // le constat du 07/11
  ["Shoulder Press (Machine)", ["leverage-shoulder-press", "machine-shoulder-military-press"]],
  ["Seated Shoulder Press (Machine)", ["leverage-shoulder-press", "machine-shoulder-military-press"]],
  ["Développé militaire (Machine)", ["leverage-shoulder-press", "machine-shoulder-military-press"]],
  ["Overhead Press (Barbell)", ["barbell-shoulder-press", "standing-military-press", "seated-barbell-military-press"]],
  ["Bench Press (Dumbbell)", ["dumbbell-bench-press"]],
  ["Développé couché (Haltère)", ["dumbbell-bench-press"]],
  ["Développé Couché Incliné (Haltère)", ["incline-dumbbell-press"]],
  ["Chest Press (Machine)", ["machine-bench-press", "leverage-chest-press"]],
  ["Lateral Raise (Cable)", ["cable-seated-lateral-raise"]],
  ["Élévation latérale (Haltère)", ["side-lateral-raise"]],
  ["Front Raise (Dumbbell)", ["front-dumbbell-raise"]],
  ["Tirage Poitrine (Poulie)", ["wide-grip-lat-pulldown", "close-grip-front-lat-pulldown", "v-bar-pulldown"]],
  ["Lat Pulldown (Cable)", ["wide-grip-lat-pulldown", "close-grip-front-lat-pulldown", "v-bar-pulldown"]],
  ["Leg Press (Machine)", ["leg-press"]],
  ["Presse à cuisses", ["leg-press", "smith-machine-leg-press"]],
  ["Hip Thrust (Barbell)", ["barbell-hip-thrust"]],
  ["Pompes", ["pushups"]],
  ["Push Up", ["pushups"]],
  ["Tractions", ["pullups", "v-bar-pullup"]],
  ["Pull Up", ["pullups", "v-bar-pullup"]],
  ["Traction lestée", ["weighted-pull-ups"]],
  ["Face Pull (Cable)", ["face-pull"]],
  ["Soulevé de terre roumain (Barre)", ["romanian-deadlift"]],
  ["Romanian Deadlift (Barbell)", ["romanian-deadlift"]],
  ["Triceps Pushdown (Cable)", ["triceps-pushdown"]],
  ["Extension jambes", ["leg-extensions", "single-leg-leg-extension"]],
  ["Leg Extension (Machine)", ["leg-extensions"]],
  ["Rowing haltère un bras", ["one-arm-dumbbell-row"]],
  ["Biceps Curl (Dumbbell)", ["dumbbell-bicep-curl"]],
  ["Curl Biceps (Haltère)", ["dumbbell-bicep-curl"]],
  ["Gainage", ["plank"]],
  ["Planche", ["plank"]],
  ["Mollets debout (Machine)", ["standing-calf-raises"]],
  ["Standing Calf Raise (Machine)", ["standing-calf-raises"]],
  ["Hanging Leg Raise", ["hanging-leg-raise"]],
  ["Roue abdominale", ["ab-roller"]],
  ["Écartés Poulie", ["cable-crossover"]],
  ["Butterfly (Pec Deck)", ["butterfly"]],
];

test("proximité : au moins 30 paires réelles, français et anglais, trouvent un exercice acceptable", () => {
  assert.ok(PAIRES.length >= 30);
  for (const [nom, attendus] of PAIRES) {
    const slug = proche(nom);
    assert.ok(slug && attendus.includes(slug), `${nom} : ${slug} au lieu de ${attendus.join(" ou ")}`);
  }
});

test("proximité : le constat d'Alex, Développé Épaules Assis (Machine), propose le développé à leviers, le matériel connu à part aide", () => {
  const departager = (s: string) => (s === "leverage-shoulder-press" ? 1 : 0);
  const [p] = procheDuCatalogue("Développé Épaules Assis (Machine)", PREPARE, { departager });
  assert.equal(p?.slug, "leverage-shoulder-press");
  assert.ok(p!.score >= 0.9);
  // le même nom sans (Machine), le matériel dit à part (colonne equipement de l'exercice perso)
  assert.ok(["leverage-shoulder-press", "machine-shoulder-military-press"].includes(proche("Développé Épaules Assis", "machine")!));
});

test("proximité : un même exercice en français et en anglais se ressemble (≥ seuil), dans les deux sens", () => {
  const FR_EN: [string, string][] = [
    ["Développé couché (Barre)", "Bench Press (Barbell)"],
    ["Développé couché incliné (Haltère)", "Incline Bench Press (Dumbbell)"],
    ["Soulevé de terre (Barre)", "Deadlift (Barbell)"],
    ["Curl biceps (Barre)", "Bicep Curl (Barbell)"],
    ["Élévation latérale (Haltère)", "Lateral Raise (Dumbbell)"],
    ["Extension triceps au-dessus de la tête (Poulie)", "Overhead Triceps Extension (Cable)"],
    ["Tirage poitrine (Poulie)", "Lat Pulldown (Cable)"],
    ["Presse épaules (Haltère)", "Shoulder Press (Dumbbell)"],
    ["Extension jambes (Machine)", "Leg Extension (Machine)"],
    ["Tractions", "Pull Up"],
    ["Pompes", "Push Up"],
    ["Gainage", "Plank"],
    ["Fentes (Haltère)", "Lunge (Dumbbell)"],
    ["Rowing haltère un bras", "One Arm Dumbbell Row"],
  ];
  for (const [fr, en] of FR_EN) {
    assert.ok(similarite(fr, en) >= SEUIL_SUGGESTION, `${fr} / ${en} : ${similarite(fr, en)}`);
    assert.ok(Math.abs(similarite(fr, en) - similarite(en, fr)) < 1e-9);
  }
});

test("proximité : un exercice du catalogue se reconnaît lui-même (score 1), sauf les rares noms sans geste ni muscle connu", () => {
  const rates = CATALOGUE.filter((e) => similarite(e.nom, e.nom) < 0.99).map((e) => e.nom);
  assert.ok(rates.length <= 5, rates.join(", "));
  assert.ok(jetons("Roller").length > 0);
});

test("faux positifs interdits : gestes ou muscles différents ne se confondent pas", () => {
  const DIFFERENTS: [string, string][] = [
    ["Pompes", "Développé couché (Barre)"],
    ["Pompes", "Développé couché"],
    ["Développé couché", "Développé épaules"],
    ["Bench Press (Barbell)", "Shoulder Press (Barbell)"],
    ["Squat (Barre)", "Soulevé de terre (Barre)"],
    ["Curl biceps (Barre)", "Extension triceps (Barre)"],
    ["Leg curl", "Curl biceps"],
    ["Leg extension", "Triceps extension"],
    ["Tractions", "Tirage vertical"],
    ["Pull Up", "Lat Pulldown (Cable)"],
    ["Élévation latérale (Haltère)", "Élévation frontale (Haltère)"],
    ["Crunch", "Relevé de buste"],
    ["Fentes", "Squat"],
    ["Rowing (Barre)", "Rowing (Haltère)"],
    ["Développé couché incliné (Barre)", "Développé couché décliné (Barre)"],
    ["Développé couché (Barre)", "Développé couché incliné (Barre)"],
    ["Développé couché (Haltère)", "Développé couché (Barre)"],
    ["Curl marteau (Haltère)", "Curl biceps (Barre)"],
    ["Presse à cuisses", "Presse à pectoraux"],
    ["Mollets debout (Machine)", "Étirement mollets"],
    ["Dips", "Pompes"],
    ["Hip Thrust (Barbell)", "Squat (Barbell)"],
  ];
  for (const [a, b] of DIFFERENTS) assert.ok(similarite(a, b) < SEUIL_SUGGESTION, `${a} / ${b} : ${similarite(a, b)}`);
});

test("faux positifs interdits : aucun exercice du catalogue à pompes ne propose un développé couché, et inversement", () => {
  const pompes = CATALOGUE.filter((e) => /^pompe/i.test(e.nom));
  const developpes = CATALOGUE.filter((e) => /^développé couché/i.test(e.nom));
  assert.ok(pompes.length > 3 && developpes.length > 3);
  for (const p of pompes) for (const d of developpes) assert.ok(similarite(p.nom, d.nom) < SEUIL_SUGGESTION, `${p.nom} / ${d.nom}`);
  for (const p of pompes) assert.ok(!/couch/i.test(proche(p.nom) ?? ""), p.nom);
  for (const d of developpes) assert.ok(!/push-?up/i.test(proche(d.nom) ?? ""), d.nom);
});

test("proximité : un nom sans geste ni muscle reconnu ne propose rien", () => {
  for (const nom of ["Mon exercice", "Test", "Machine", "Haltères", "Perso 1", "", "   "]) assert.equal(proche(nom), undefined, nom);
});

test("proximité : un exercice absent du catalogue ne propose rien de faux", () => {
  for (const nom of ["Burpees", "Tai chi", "Corde à sauter double unders"]) {
    const s = proche(nom);
    assert.ok(!s || similarite(nom, CATALOGUE.find((e) => e.slug === s)!.nom) >= SEUIL_SUGGESTION);
  }
});

test("proximité : les égalités se départagent par le picto propre, puis par le nom le plus simple", () => {
  const [a] = procheDuCatalogue("Développé couché", PREPARE, { departager: (s) => (s === "dumbbell-bench-press" ? 1 : 0) });
  assert.equal(a?.slug, "dumbbell-bench-press");
  assert.equal(procheDuCatalogue("Développé couché", PREPARE, { n: 3 }).length, 3);
  const sauf = procheDuCatalogue("Pompes", PREPARE, { sauf: new Set(["pushups"]) })[0];
  assert.notEqual(sauf?.slug, "pushups");
});

// Retour d'Alex (09/11) : un hip thrust perso (Smith) se voyait proposer « Relevé de hanches (Smith) », un exercice d'abdominaux.
const HIP_THRUST = ["barbell-hip-thrust", "hip-thrust-machine", "smith-machine-hip-thrust"];
const catalogueSlug = (slug: string) => CATALOGUE.find((e) => e.slug === slug)!;

test("hip thrust : le catalogue a les trois variantes (barre, machine, Smith), fessiers, chacune avec son nom anglais", () => {
  for (const slug of HIP_THRUST) assert.equal(catalogueSlug(slug).muscle, "Fessiers", slug);
  assert.equal(catalogueSlug("smith-machine-hip-thrust").nom_en, "Smith Machine Hip Thrust");
  assert.equal(catalogueSlug("smith-machine-hip-thrust").nom, "Hip thrust (Smith)");
  assert.equal(catalogueSlug("hip-thrust-machine").nom, "Hip thrust (Machine)");
  assert.equal(equipementDuCatalogue(catalogueSlug("smith-machine-hip-thrust")), "smith");
  // « Pont fessiers (Barre) » n'est pas un doublon : hanches poussées depuis le sol, pas depuis un banc ; les deux restent
  assert.equal(catalogueSlug("barbell-glute-bridge").muscle, "Fessiers");
  assert.notEqual(catalogueSlug("barbell-glute-bridge").nom_en, catalogueSlug("barbell-hip-thrust").nom_en);
});

test("hip thrust : le nom choisit la bonne variante (Smith, machine, barre), en français comme en anglais, avec ou sans fautes", () => {
  const PAR_NOM: [string, string][] = [
    ["Hip Thrust (Smith)", "smith-machine-hip-thrust"],
    ["Hip thrust à la Smith", "smith-machine-hip-thrust"],
    ["Hip Thrust (Smith Machine)", "smith-machine-hip-thrust"],
    ["Smith Machine Hip Thrust", "smith-machine-hip-thrust"],
    ["Poussée de hanches (Smith)", "smith-machine-hip-thrust"],
    ["Poussée de hanches à la Smith", "smith-machine-hip-thrust"],
    ["Poussées de hanches Smith", "smith-machine-hip-thrust"],
    ["Poussée de bassin Smith", "smith-machine-hip-thrust"],
    ["Hip trust Smith", "smith-machine-hip-thrust"],
    ["Hip Thrust (Machine)", "hip-thrust-machine"],
    ["Poussée de hanches (machine)", "hip-thrust-machine"],
    ["Machine Hip Thrust", "hip-thrust-machine"],
    ["Hip Thrust (Barbell)", "barbell-hip-thrust"],
    ["Hip thrust (Barre)", "barbell-hip-thrust"],
    ["Poussée de hanches (barre)", "barbell-hip-thrust"],
  ];
  for (const [nom, attendu] of PAR_NOM) assert.equal(proche(nom, undefined, "Fessiers"), attendu, nom);
  // le matériel dit à part (colonne equipement) tranche quand le nom se tait ; celui du nom l'emporte s'il se contredit
  assert.equal(proche("Hip thrust", "smith", "Fessiers"), "smith-machine-hip-thrust");
  assert.equal(proche("Hip thrust", "machine", "Fessiers"), "hip-thrust-machine");
  assert.equal(proche("Hip thrust", "barre", "Fessiers"), "barbell-hip-thrust");
  assert.equal(proche("Hip thrust (Smith)", "machine", "Fessiers"), "smith-machine-hip-thrust");
});

test("hip thrust : sans matériel dans le nom, les trois variantes sont proposées ensemble", () => {
  for (const nom of ["Hip thrust", "Poussée de hanches", "Hip Thrusts"]) {
    const l = procheDuCatalogue(nom, PREPARE, { n: 3, ecart: 0.02, muscle: "Fessiers" }).map((p) => p.slug).sort();
    assert.deepEqual(l, [...HIP_THRUST].sort(), nom);
  }
  // un matériel dit : une seule proposition (les autres sont plus loin que l'écart)
  assert.deepEqual(procheDuCatalogue("Hip thrust (Smith)", PREPARE, { n: 3, ecart: 0.02 }).map((p) => p.slug), ["smith-machine-hip-thrust"]);
});

test("hip thrust : jamais un exercice d'abdominaux (ni d'un autre muscle) pour un exercice perso de fessiers", () => {
  const NOMS = ["Hip Thrust (Smith)", "Poussée de hanches Smith", "Hip trust smith", "Hip thrust", "Relevé de hanches Smith", "Élévation de hanches (Smith)", "Hip raise Smith", "Poussée de bassin (Smith)", "Pont fessier (Smith)", "Hip thrust Smith Machine"];
  for (const nom of NOMS) {
    for (const materiel of [undefined, "smith", "machine"]) {
      for (const p of procheDuCatalogue(nom, PREPARE, { materiel, muscle: "Fessiers", n: 5, seuil: 0.3 })) {
        const e = catalogueSlug(p.slug);
        assert.ok(e.muscle === "Fessiers" || e.muscle === null, `${nom} (${materiel}) : ${e.nom} (${e.muscle})`);
      }
    }
  }
  assert.notEqual(proche("Hip Thrust (Smith)", "smith", "Fessiers"), "smith-machine-hip-raise");
  // « Relevé de hanches (Smith) » reste l'exercice d'abdominaux qu'il est, pour qui le nomme tel quel
  assert.equal(proche("Relevé de hanches (Smith)", "smith", "Abdominaux"), "smith-machine-hip-raise");
  assert.equal(proche("Relevé de hanches (Smith)"), "smith-machine-hip-raise");
  // mais un perso de fessiers qui porterait ce nom, même à l'identique, ne s'y fait pas rattacher (autre muscle)
  assert.equal(procheDuCatalogue("Relevé de hanches (Smith)", PREPARE, { muscle: "Fessiers" }).length, 0);
  for (const p of procheDuCatalogue("Relevé de hanches", PREPARE, { muscle: "Fessiers", n: 5 })) assert.equal(catalogueSlug(p.slug).muscle, "Fessiers", p.slug);
});

test("garde-fou muscle : un exercice du catalogue se retrouve toujours lui-même, et jamais un autre muscle que le sien", () => {
  let verifies = 0;
  for (const e of CATALOGUE) {
    if (!e.muscle || !/\p{L}/u.test(e.nom)) continue;
    const l = procheDuCatalogue(e.nom, PREPARE, { muscle: e.muscle, materiel: equipementDuCatalogue(e), n: 3 });
    for (const p of l) {
      const m = catalogueSlug(p.slug).muscle;
      assert.ok(m === e.muscle || m === null, `${e.nom} (${e.muscle}) → ${p.slug} (${m})`);
    }
    verifies++;
  }
  assert.ok(verifies > 700);
});

test("garde-fou muscle : les paires réelles passent avec le muscle de l'exercice perso", () => {
  const AVEC_MUSCLE: [string, string, string[]][] = [
    ["Développé Épaules Assis (Machine)", "Épaules", ["leverage-shoulder-press", "machine-shoulder-military-press"]],
    ["Bench Press (Dumbbell)", "Pectoraux", ["dumbbell-bench-press"]],
    ["Pompes", "Pectoraux", ["pushups"]],
    ["Leg Press (Machine)", "Quadriceps", ["leg-press"]],
    ["Triceps Pushdown (Cable)", "Triceps", ["triceps-pushdown"]],
    ["Hip Thrust (Barbell)", "Fessiers", ["barbell-hip-thrust"]],
  ];
  for (const [nom, muscle, attendus] of AVEC_MUSCLE) assert.ok(attendus.includes(proche(nom, undefined, muscle)!), nom);
  // sans muscle, rien n'est écarté : le nom exact passe d'abord
  assert.equal(proche("Pompes"), "pushups");
  assert.equal(proche("Hip thrust (Smith)"), "smith-machine-hip-thrust");
});

test("pompes prise serrée sur haltère : le catalogue l'a, le nom en français et en anglais le retrouve", () => {
  const slug = "close-grip-push-up-off-of-a-dumbbell";
  assert.equal(proche("Pompes prise serrée sur haltère"), slug);
  assert.equal(proche("Close-Grip Push-Up off of a Dumbbell"), slug);
  assert.equal(proche("Pompes prise serrée sur haltère", undefined, "Triceps"), slug);
});

test("recherche : une saisie se décline en équivalents français et anglais, par début de mot", () => {
  const dit = (q: string) => JSON.stringify(variantesDeRecherche(q));
  assert.ok(dit("hip").includes('["hanche"]'));
  assert.ok(dit("Hanches").includes('["hip"]'));
  assert.ok(dit("poussée de hanches").includes('["hip","thrust"]'));
  assert.ok(dit("glute bridge").includes('["fessier"]') && dit("glute bridge").includes('["pont"]'));
  assert.ok(dit("bench press").includes('["developpe","couche"]'));
  // les mots trop généraux ne s'étendent pas : « lying » ne ramène pas tout « couché »
  assert.equal(dit("lying"), '[[["lying"]]]');
  assert.equal(dit("developpe"), '[[["developpe"]]]');
  // une lettre ou des mots vides seuls restent tels quels ; un mot de liaison tombe quand il y en a d'autres
  assert.equal(dit("a"), '[[["a"]]]');
  assert.equal(dit("pompes sur haltère").includes('"sur"'), false);
  // des mots courts ne servent jamais d'équivalent (« ab » ramènerait abduction, abductor…)
  assert.ok(!dit("abdominaux").includes('["ab"]'));
});
