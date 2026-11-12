// Recherche d'un exercice (rechercherExercices, utilisée par l'écran de choix, le remplacement et les tops du cercle) : nom anglais,
// équivalents français/anglais, début de mot, sans casse ni accents. Retour d'Alex (09/11) : « si je tape hip, ça doit sortir les
// exos de hanches ».
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerExercice, rechercherExercices } from "../src/db/depots/exercices.ts";
import { baseDeTest } from "./aide.ts";

const slugs = async (db: Awaited<ReturnType<typeof baseDeTest>>["db"], texte: string, plus = {}) =>
  (await rechercherExercices(db, { texte, limite: 2000, ...plus })).map((e) => e.slug ?? e.id);

const HIP_THRUST = ["barbell-hip-thrust", "hip-thrust-machine", "smith-machine-hip-thrust"];

test("recherche : « hip » sort les exercices de hanches, y compris ceux dont le nom anglais ne dit pas hip", async () => {
  const { db } = await baseDeTest(true);
  const l = await slugs(db, "hip");
  for (const s of [...HIP_THRUST, "cable-hip-adduction", "standing-hip-circles", "hip-flexion-with-band", "smith-machine-hip-raise"]) assert.ok(l.includes(s), s);
  // un exercice dont le nom français dit « hanche » mais pas le nom anglais (« Thigh Abductor »)
  const { raw } = await baseDeTest(true);
  raw.prepare("UPDATE exercices SET nom = 'Abduction de hanche (Machine)' WHERE slug = 'thigh-abductor'").run();
  assert.ok((await slugs(db, "hip")).length >= l.length);
});

test("recherche : la saisie française et l'anglaise donnent la même liste (hanche, hip ; poussée de hanches, hip thrust)", async () => {
  const { db } = await baseDeTest(true);
  assert.deepEqual((await slugs(db, "hanche")).sort(), (await slugs(db, "hip")).sort());
  assert.deepEqual((await slugs(db, "hanches")).sort(), (await slugs(db, "hip")).sort());
  assert.deepEqual((await slugs(db, "hip thrust")).sort(), [...HIP_THRUST].sort());
  assert.deepEqual((await slugs(db, "poussée de hanches")).sort(), [...HIP_THRUST].sort());
  assert.deepEqual((await slugs(db, "Poussée de hanche")).sort(), [...HIP_THRUST].sort());
  const ponts = (await slugs(db, "pont fessier")).sort();
  assert.deepEqual(ponts, (await slugs(db, "glute bridge")).sort());
  assert.ok(ponts.includes("barbell-glute-bridge") && ponts.includes("butt-lift-bridge"));
});

test("recherche : insensible à la casse et aux accents, par début de mot (« hip » ne trouve pas « ships »)", async () => {
  const { db } = await baseDeTest(true);
  const hip = (await slugs(db, "hip")).sort();
  for (const q of ["HIP", "Hip", "  hip  ", "HANCHÉ", "Hànche"]) assert.deepEqual((await slugs(db, q)).sort(), hip, q);
  assert.ok(!hip.includes("kettlebell-pirate-ships"));
  assert.ok((await slugs(db, "ship")).includes("kettlebell-pirate-ships"));
  // pas au milieu d'un mot
  assert.ok(!(await slugs(db, "rust")).includes("barbell-hip-thrust"));
  assert.ok((await slugs(db, "thru")).includes("barbell-hip-thrust"));
  // début d'un mot quelconque du nom : « thrust » trouve « Hip thrust », « Thruster »
  assert.ok((await slugs(db, "thrust")).includes("hip-thrust-machine"));
});

test("recherche : un exercice perso au nom français seul se trouve en anglais, et inversement", async () => {
  const { db } = await baseDeTest(true);
  const fr = await creerExercice(db, { nom: "Poussée de hanches (Smith) maison", muscle: "Fessiers", equipement: "smith" });
  const en = await creerExercice(db, { nom: "Home Hip Abduction Rig", muscle: "Abducteurs" });
  assert.ok((await slugs(db, "hip thrust")).includes(fr));
  assert.ok((await slugs(db, "hip")).includes(fr));
  assert.ok((await slugs(db, "hanche")).includes(en));
  assert.ok((await slugs(db, "hip abduction")).includes(en));
  // les persos d'abord, comme avant
  assert.deepEqual((await slugs(db, "hip")).slice(0, 2).sort(), [en, fr].sort());
});

test("recherche : les mots se cumulent (tous requis) et se combinent aux filtres muscle et matériel", async () => {
  const { db } = await baseDeTest(true);
  assert.deepEqual(await slugs(db, "hip thrust smith"), ["smith-machine-hip-thrust"]);
  assert.deepEqual(await slugs(db, "hip thrust", { muscles: ["Fessiers"], equipements: ["smith"] }), ["smith-machine-hip-thrust"]);
  assert.deepEqual((await slugs(db, "hip thrust", { muscles: ["Abdominaux"] })), []);
  assert.deepEqual(await slugs(db, "hip raise smith", { muscles: ["Abdominaux"] }), ["smith-machine-hip-raise"]);
  assert.ok((await slugs(db, "pompes sur haltère")).includes("close-grip-push-up-off-of-a-dumbbell"));
  assert.ok((await slugs(db, "push up dumbbell")).includes("close-grip-push-up-off-of-a-dumbbell"));
});

test("recherche : sans texte, tout le catalogue ; un mot de liaison seul ne casse rien ; ponctuation et chiffres", async () => {
  const { db } = await baseDeTest(true);
  assert.ok((await slugs(db, "")).length > 900);
  assert.ok((await slugs(db, "de")).length > 0);
  assert.ok((await slugs(db, "3/4")).includes("3-4-sit-up"));
  assert.ok((await slugs(db, "push-up")).length > 10);
  assert.ok((await slugs(db, "bench press")).includes("couche"));
  assert.ok((await slugs(db, "développé couché")).includes("couche"));
  assert.ok(!(await slugs(db, "lying")).includes("couche"), "« lying » ne ramène pas le développé couché");
});
