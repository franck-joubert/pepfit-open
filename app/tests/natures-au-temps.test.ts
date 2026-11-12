// Natures au temps (retour du 30/10 : bain froid, arts martiaux, boxe proposaient des répétitions). Par famille
// de sports : chaque sport se mesure au temps (durée, ou distance et durée en endurance). Les efforts au temps de la
// salle (gainage, isométrie, cordes, sac) ont une nature au temps ; les portés et traîneaux, charge et distance. Une
// installation existante corrige les exercices jamais servis, pas ceux qui ont déjà des séances.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { chargerCatalogue } from "../src/db/catalogue.ts";
import { auTemps, natureDuCatalogue, type Nature } from "../src/db/natures.ts";
import { familleDe, SPORTS_RANGES, type Famille } from "../src/ecrans/familles-sports.ts";
import { adapter, baseDeTest, catalogue } from "./aide.ts";

const cat = catalogue();
const parSlug = new Map(cat.exercices.map((e) => [e.slug, e]));
const nature = (slug: string): Nature => natureDuCatalogue(parSlug.get(slug)!);

const ATTENDU: Record<Famille, readonly Nature[]> = {
  force: ["duree"],
  dehors: ["distance_duree"],
  interieur: ["distance_duree", "duree"],
  seance: ["duree"],
  recup: ["duree"],
};

test("chaque sport, famille par famille, se mesure au temps", () => {
  for (const slug of SPORTS_RANGES) {
    assert.ok(parSlug.has(slug), `${slug} absent du catalogue`);
    const f = familleDe(`cat:${slug}`);
    const n = nature(slug);
    assert.ok(auTemps(n), `${slug} (${f}) : ${n}`);
    assert.ok(ATTENDU[f].includes(n), `${slug} (${f}) : ${n}`);
  }
  // ceux du retours
  for (const s of ["bain-froid", "arts-martiaux", "boxe", "kickboxing", "sauna", "hiit"]) assert.equal(nature(s), "duree", s);
});

test("efforts au temps de la salle : nature au temps ; portés et traîneaux : charge et distance", () => {
  for (const s of ["plank", "side-bridge", "isometric-chest-squeezes", "isometric-neck-exercise-sides", "battling-ropes", "heavy-bag-thrust", "fast-skipping", "one-handed-hang"]) {
    assert.ok(auTemps(nature(s)), s);
  }
  assert.equal(nature("air-bike"), "distance_duree");
  for (const s of ["farmers-walk", "yoke-walk", "sled-push", "sled-drag-harness"]) assert.equal(nature(s), "poids_distance", s);
  // les répétitions restent aux répétitions
  for (const s of ["pushups", "crunches", "squat"]) assert.ok(!auTemps(nature(s)), s);
  // toutes les étirements et le cardio, au temps
  for (const e of cat.exercices) if (e.categorie === "Étirement" || e.categorie === "Cardio") assert.ok(auTemps(natureDuCatalogue(e)), e.slug);
});

test("mise à jour du catalogue : un exercice jamais servi prend sa nature au temps, un exercice servi garde la sienne", async () => {
  const { raw } = await baseDeTest(true);
  // installation d'avant : ces trois-là à la nature déduite (répétitions)
  raw.exec("UPDATE exercices SET nature = 'reps' WHERE slug IN ('side-bridge', 'isometric-chest-squeezes')");
  raw.exec("UPDATE exercices SET nature = 'poids_reps' WHERE slug = 'battling-ropes'");
  // une séance enregistrée avec le gainage latéral en répétitions
  raw.exec("INSERT INTO seances (id, routine_id, titre, debut, fin, maj_le) VALUES ('s1', NULL, NULL, 1, 2, 2)");
  raw.exec("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES ('s1', 'cat:side-bridge', 0)");
  raw.exec("INSERT INTO series (id, seance_id, exercice_id, position, type, reps, faite) VALUES ('x1', 's1', 'cat:side-bridge', 0, 'normale', 12, 1)");
  // un réglage d'Alex (nature choisie à la main, autre que la déduite) n'est jamais défait
  raw.exec("UPDATE exercices SET nature = 'duree_poids' WHERE slug = 'heavy-bag-thrust'");
  await chargerCatalogue(adapter(raw), { ...cat, version: cat.version + 1 });
  const n = (slug: string) => (raw.prepare("SELECT nature FROM exercices WHERE slug = ?").get(slug) as { nature: string }).nature;
  assert.equal(n("isometric-chest-squeezes"), "duree");
  assert.equal(n("battling-ropes"), "duree");
  assert.equal(n("side-bridge"), "reps");
  assert.equal(n("heavy-bag-thrust"), "duree_poids");
  const serie = raw.prepare("SELECT reps, duree_s FROM series WHERE id = 'x1'").get() as { reps: number; duree_s: number | null };
  assert.deepEqual({ ...serie }, { reps: 12, duree_s: null });
});

test("éditeur de WOD : un mouvement au temps demande un temps, pas des répétitions", () => {
  const src = readFileSync(new URL("../src/ecrans/EditionWod.tsx", import.meta.url), "utf8");
  assert.match(src, /setReglage\(\{ quoi: temps \? "duree" : "reps", ligne: l \}\)/);
  assert.match(src, /definirCibleSerie\(db, g\.ligne\.id, 0, \{ dureeS: brouillon \}\)/);
  assert.equal(auTemps("duree"), true);
  assert.equal(auTemps("distance_duree"), true);
  assert.equal(auTemps("reps"), false);
  assert.equal(auTemps("poids_distance"), false);
});
