// Volet du profil : les cinq derniers records (une carte par exercice et par séance, le type le plus parlant).
import assert from "node:assert/strict";
import { test } from "node:test";
import { derniersRecords, type RecordRecent } from "../src/ecrans/profil-vue.ts";
import { recordsRecents } from "../src/db/stats.ts";
import { baseDeTest } from "./aide.ts";

const r = (seance: string, ex: string, type: RecordRecent["type"], quand: number, valeur = 100): RecordRecent => ({
  exercice_id: ex,
  nom: ex,
  nature: null,
  type,
  valeur,
  seance_id: seance,
  atteint_le: quand,
});

test("une carte par exercice et par séance, le type le plus parlant", () => {
  const l = derniersRecords([r("s2", "dc", "volume_serie", 20), r("s2", "dc", "e1rm", 20), r("s2", "dc", "reps", 20), r("s1", "dc", "charge", 10)]);
  assert.deepEqual(
    l.map((x) => [x.seance_id, x.type]),
    [
      ["s2", "e1rm"],
      ["s1", "charge"],
    ],
  );
});

test("les cinq plus récents seulement, du plus récent au plus ancien", () => {
  const lignes = Array.from({ length: 8 }, (_, i) => r(`s${i}`, `e${i}`, "charge", i * 10));
  const l = derniersRecords(lignes.reverse());
  assert.equal(l.length, 5);
  assert.deepEqual(
    l.map((x) => x.exercice_id),
    ["e7", "e6", "e5", "e4", "e3"],
  );
});

test("aucun record : aucune carte", () => {
  assert.deepEqual(derniersRecords([]), []);
});

test("base : records battus en séance avec le nom de l'exercice, du plus récent au plus ancien", async () => {
  const { db, raw } = await baseDeTest();
  raw.exec(`
    INSERT INTO exercices (id, nom, cree_le, maj_le) VALUES ('dc', 'Développé couché', 0, 0), ('sq', 'Squat', 0, 0);
    INSERT INTO seances (id, debut, maj_le) VALUES ('s1', 1000, 0), ('s2', 2000, 0);
    INSERT INTO series (id, seance_id, exercice_id, position, faite) VALUES ('a', 's1', 'dc', 0, 1), ('b', 's2', 'sq', 0, 1);
    INSERT INTO records (id, exercice_id, type, valeur, serie_id, seance_id, atteint_le, actuel) VALUES
      ('r1', 'dc', 'charge', 80, 'a', 's1', 1000, 1),
      ('r2', 'sq', 'e1rm', 120, 'b', 's2', 2000, 1),
      ('r3', 'sq', 'volume_seance', 3000, NULL, 's2', 2000, 1);
  `);
  const l = await recordsRecents(db);
  assert.deepEqual(
    l.map((x) => [x.nom, x.type]),
    [
      ["Squat", "e1rm"],
      ["Développé couché", "charge"],
    ],
  );
});

test("sommaire du volet : préférences, connexions, autorisations de Santé Connect", async () => {
  const { definirActif } = await import("../src/i18n/index.ts");
  const { resumeConnexions, resumePermissions, resumePreferences } = await import("../src/ecrans/profil-vue.ts");
  definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });
  assert.equal(resumePreferences("Auto", "Français", "kg"), "Auto, Français, kg");
  assert.equal(resumeConnexions(true, ["Claude", ""]), "Santé Connect, Claude");
  assert.equal(resumeConnexions(false, []), "Aucune");
  assert.equal(resumePermissions(["sommeil", "poids", "gras", "pas", "frequence-cardiaque"]), "Pas, poids, sommeil");
  definirActif({ langue: "en", fuseau: "Europe/Paris", poids: "kg", distance: "km" });
  assert.equal(resumeConnexions(true, []), "Health Connect");
  definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });
});
