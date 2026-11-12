// Règle des témoins (src/db/migrations.ts, en tête) : dès la 25, une migration s'applique si son témoin manque même si son
// numéro est passé, et se saute si son témoin existe même si son numéro n'est pas encore passé.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { MIGRATIONS, PREMIERE_A_TEMOIN, VERSION_COURANTE, migrer, temoinPresent } from "../src/db/migrations.ts";
import { adapter } from "./aide.ts";

function base() {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  return { raw, db: adapter(raw) };
}
const version = (raw: DatabaseSync) => (raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
const existe = (raw: DatabaseSync, nom: string) => !!raw.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(nom);

/** Migration « lieux » de la branche lieux-code (sa 25 sur le Fold), réduite à ce qu'elle crée. */
const LIEUX_SQL = `
  ALTER TABLE salle ADD COLUMN type TEXT NOT NULL DEFAULT 'salle';
  CREATE TABLE lieu_activite (
    lieu_id TEXT NOT NULL REFERENCES salle(id) ON DELETE CASCADE,
    exercice_id TEXT NOT NULL REFERENCES exercices(id) ON DELETE CASCADE,
    ordre INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (lieu_id, exercice_id)
  );`;

test("chaque migration à partir de la 25 déclare un témoin qu'elle crée elle-même", () => {
  const a = MIGRATIONS.filter((m) => m.version >= PREMIERE_A_TEMOIN);
  assert.ok(a.length > 0);
  for (const m of a) {
    assert.ok(m.temoin, `migration ${m.version} sans témoin`);
    const [table, colonne] = m.temoin!.split(".");
    // une migration qui ne crée que des index a pour témoin l'un d'eux (migration 54)
    const cree = colonne
      ? new RegExp(`ALTER TABLE ${table} ADD COLUMN ${colonne}\\b`).test(m.sql)
      : new RegExp(`CREATE TABLE ${table}\\s*\\(`).test(m.sql) || new RegExp(`CREATE (UNIQUE )?INDEX (IF NOT EXISTS )?${table} ON\\b`).test(m.sql);
    assert.ok(cree, `migration ${m.version} ne crée pas son témoin ${m.temoin}`);
  }
});

test("témoin : table ou table.colonne", async () => {
  const { db } = base();
  await migrer(db, 24);
  assert.equal(await temoinPresent(db, "salle"), true);
  assert.equal(await temoinPresent(db, "salle.nom"), true);
  assert.equal(await temoinPresent(db, "salle.type"), false);
  assert.equal(await temoinPresent(db, "blessure"), false);
});

test("témoin absent, numéro passé : la migration s'applique, la version ne bouge pas, une seule fois", async () => {
  const { raw, db } = base();
  await migrer(db, 24);
  raw.exec(`PRAGMA user_version = ${VERSION_COURANTE}`);
  await migrer(db);
  assert.ok(existe(raw, "blessure") && existe(raw, "prise"));
  await migrer(db);
  assert.equal(version(raw), VERSION_COURANTE);
});

test("témoin présent, numéro pas encore passé : la migration est sautée sans planter, la version avance", async () => {
  const { raw, db } = base();
  await migrer(db, 24);
  // les blessures déjà là (reçues sous un autre numéro) : refaire CREATE TABLE blessure planterait
  raw.exec("CREATE TABLE blessure (id TEXT PRIMARY KEY NOT NULL)");
  assert.equal(version(raw), 24);
  // jusqu'à la 47 : la 48 (hors du médical) efface des lignes de prise, absente de cette base fabriquée
  await migrer(db, 47);
  assert.equal(version(raw), 47);
  assert.ok(!existe(raw, "prise"), "sautée en entier");
});

test("base du Fold : une « 25 » venue de la migration lieux (salle.type), puis main, puis lieux renuméroté en 26", async () => {
  const { raw, db } = base();
  await migrer(db, 24);
  raw.exec(`${LIEUX_SQL} PRAGMA user_version = 25;`);
  // main avant les lieux : la 25 des blessures manque (son numéro est pris) → appliquée
  await migrer(db, 25);
  assert.ok(existe(raw, "blessure") && existe(raw, "lieu_activite"));
  assert.equal(version(raw), 25);
  // lieux fusionné plus tard en 26, avec son témoin : déjà faite sur ce téléphone → sautée, sans ALTER refait
  const lieux26 = MIGRATIONS.find((m) => m.nom === "lieux")!;
  assert.deepEqual([lieux26.version, lieux26.temoin], [26, "salle.type"]);
  assert.equal(await migrer(db, 26), 26);
  assert.equal(version(raw), 26);
  assert.equal(raw.prepare("PRAGMA foreign_key_check").all().length, 0);
  // une base neuve reçoit les deux
  const neuve = base();
  await migrer(neuve.db, 26);
  assert.ok(existe(neuve.raw, "blessure") && existe(neuve.raw, "lieu_activite"));
  assert.equal(await temoinPresent(neuve.db, "salle.type"), true);
  assert.equal(version(neuve.raw), 26);
});
