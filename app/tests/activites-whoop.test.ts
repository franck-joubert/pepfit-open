// Activités Whoop dans le catalogue (donnees/whoop-activites.csv, outils/whoop_activites.py) : pas de doublon, chaque
// sport_id Whoop rangé une seule fois, padel unique, chargement en base et import Hevy.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normaliser } from "../src/db/normaliser.ts";
import { importerHevyTexte } from "../src/import/importer.ts";
import { baseDeTest, catalogue } from "./aide.ts";

const lignes = readFileSync(new URL("./fixtures/whoop-activites.csv", import.meta.url), "utf8").trim().split("\n");
const entete = lignes[0]!.split(",");
const activites = lignes.slice(1).map((l) => {
  const v = l.split(",");
  return Object.fromEntries(entete.map((c, i) => [c, v[i]!])) as Record<string, string>;
});
const ids = (a: Record<string, string>) => a["whoop_ids"]!.split("|").map(Number);

test("liste Whoop : slugs et noms uniques, chaque id une seule fois, padel unique", () => {
  assert.deepEqual(entete, ["slug", "nom", "nom_en", "whoop_ids", "categorie", "saisie", "picto"]);
  assert.equal(activites.length, 88);
  assert.equal(new Set(activites.map((a) => a["slug"])).size, activites.length);
  assert.equal(new Set(activites.map((a) => normaliser(a["nom"]!))).size, activites.length);
  const tous = activites.flatMap(ids);
  assert.equal(new Set(tous).size, tous.length);
  assert.equal(tous.length, 100);
  const padel = activites.filter((a) => /padel|paddle tennis/i.test(a["nom"]! + a["nom_en"]!));
  assert.equal(padel.length, 1);
  assert.deepEqual(ids(padel[0]!), [106, 249]);
  for (const a of activites) assert.ok(["duree", "duree_distance"].includes(a["saisie"]!), a["slug"]);
});

test("catalogue : activités présentes une fois, sans doublon de slug ni de nom avec les exercices", () => {
  const cat = catalogue();
  assert.equal(cat.version, 15); // 5 : champ picto mis à jour (picto-3d/v8) ; 6 : les 50 sports (pictos-activites, sports50.py) ; 7 : piste I (groupes one-arm et élastique à part) ; 8 : natures au temps (retours du 30/10) ; 9 : pictos manquants (docs/CODE-PICTOS-MANQUANTS.md) ; 10 : fin du lot 1 et lot 2 des pictos manquants ; 11 : fin du lot 2 (10 pictos) ; 12 : développé au sol kettlebell ; 13 : même picto refait (deux bras droits) ; 14 : hip thrust à la machine et à la Smith au catalogue (retours du 09/11) ; 15 : pictos du hip thrust Smith et des pompes prise serrée sur haltères
  assert.equal(new Set(cat.exercices.map((e) => e.slug)).size, cat.exercices.length);
  const parSlug = new Map(cat.exercices.map((e) => [e.slug, e]));
  for (const a of activites) {
    const e = parSlug.get(a["slug"]!);
    assert.ok(e, a["slug"]);
    assert.equal(e.nom, a["nom"]);
    assert.deepEqual(e.whoop_ids, ids(a));
    assert.equal(e.nature, a["saisie"] === "duree" ? "duree" : "distance_duree");
    const homonymes = cat.exercices.filter((x) => normaliser(x.nom) === normaliser(e.nom));
    assert.equal(homonymes.length, 1, e.nom);
  }
  const tous = cat.exercices.flatMap((e) => e.whoop_ids ?? []);
  assert.equal(new Set(tous).size, tous.length);
  assert.equal(tous.length, 100);
  // Existants enrichis plutôt que recréés.
  assert.deepEqual(parSlug.get("rowing-stationary")!.whoop_ids, [18]);
  assert.equal(parSlug.get("running-treadmill")!.nom, "Course sur tapis");
  // Noms anglais courts (v4) : les noms Whoop joints par « / » étaient coupés dans les tuiles du lanceur.
  assert.equal(parSlug.get("musculation")!.nom_en, "Weightlifting");
  assert.equal(parSlug.get("padel")!.nom_en, "Padel");
  for (const a of activites) assert.ok(!parSlug.get(a["slug"]!)!.nom_en.includes(" / "), a["slug"]);
});

test("chargement : whoop_ids, nature et allure en base ; « Padel » de Hevy reconnu", async () => {
  const { db, raw } = await baseDeTest(true);
  const ligne = (slug: string) =>
    raw.prepare("SELECT whoop_ids, nature, allure, equipement FROM exercices WHERE slug = ?").get(slug) as Record<string, string | null>;
  assert.deepEqual({ ...ligne("padel") }, { whoop_ids: "106|249", nature: "duree", allure: null, equipement: "autre" });
  assert.deepEqual({ ...ligne("course") }, { whoop_ids: "0|253", nature: "distance_duree", allure: "km", equipement: "cardio" });
  assert.equal(ligne("bicycling").allure, "kmh");
  assert.equal(ligne("vtt").allure, "kmh");
  assert.equal(ligne("squat").whoop_ids, null);

  const r = await importerHevyTexte(
    db,
    '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"\n' +
      '"Padel","22 Oct 2026, 19:00","22 Oct 2026, 20:30","","Padel","","","0","normal","","","","5400",""',
  );
  assert.deepEqual(r.exercicesNonReconnus, []);
  const e = raw.prepare("SELECT e.slug, e.perso FROM seance_exercices se JOIN exercices e ON e.id = se.exercice_id").get() as Record<string, unknown>;
  assert.deepEqual({ ...e }, { slug: "padel", perso: 0 });
});

test("migration 14 : « Autre activité » effacée si rien ne s'en sert, gardée sinon", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { migrer } = await import("../src/db/migrations.ts");
  const { adapter } = await import("./aide.ts");
  for (const servie of [false, true]) {
    const raw = new DatabaseSync(":memory:");
    const db = adapter(raw);
    await migrer(db, 13);
    raw.exec("INSERT INTO exercices (id, nom, nom_norm, slug, perso, cree_le, maj_le) VALUES ('cat:autre-activite', 'Autre activité', 'autre activite', 'autre-activite', 0, 1, 1)");
    if (servie) {
      raw.exec("INSERT INTO seances (id, debut, maj_le) VALUES ('s', 1, 1)");
      raw.exec("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES ('s', 'cat:autre-activite', 0)");
    }
    await migrer(db);
    const reste = raw.prepare("SELECT COUNT(*) AS n FROM exercices WHERE slug = 'autre-activite'").get() as { n: number };
    assert.equal(reste.n, servie ? 1 : 0);
  }
});
