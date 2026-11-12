import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { MIGRATIONS, VERSION_COURANTE, migrer } from "../src/db/migrations.ts";

type P = (string | number | null)[];

function adapter(db: DatabaseSync) {
  return {
    execAsync: async (sql: string) => void db.exec(sql),
    runAsync: async (sql: string, p: P) => db.prepare(sql).run(...p),
    getFirstAsync: async (sql: string, p: P) => (db.prepare(sql).get(...p) as never) ?? null,
    getAllAsync: async (sql: string, p: P) => db.prepare(sql).all(...p) as never[],
    withTransactionAsync: async (t: () => Promise<void>) => {
      db.exec("BEGIN");
      try {
        await t();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

function neuve() {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  return { raw, db: adapter(raw) };
}

/** Numéros réservés par une branche pas encore fusionnée ; la règle des témoins couvre l'ordre d'arrivée. */
// 78 à 89 : numéros des autres branches en cours ; le parcours de séance unifié commence à 90.
// 91 à 99 : réservés aux autres branches ; les restes du coach commencent à 100.
// 101 à 159 : réservés aux autres branches ; la lecture de l'activité et du sommeil Withings commence à 160.
// 161 à 169 : réservés aux autres branches ; la FC au repos Withings commence à 170.
// 171 à 179 : réservés aux autres branches ; les machines des lieux (signaux anonymes) commencent à 180.
// 183 : trou voulu, jamais attribué (la branche Fibres et eau l'avait réservé ; les activités gardées ont pris 184 avant elle, et la base
// applique par PRAGMA user_version : un 183 arrivé après un 184 déjà installé serait sauté). Fibres et eau (eau_ajout) prend 185.
// 189 : polar (main) ; le lieu privé partagé (salle.lieu_partage) prend 190.
const RESERVEES = new Set<number>([...Array.from({ length: 12 }, (_, i) => 78 + i), ...Array.from({ length: 9 }, (_, i) => 91 + i), ...Array.from({ length: 59 }, (_, i) => 101 + i), ...Array.from({ length: 9 }, (_, i) => 161 + i), ...Array.from({ length: 9 }, (_, i) => 171 + i), 183]);

test("les versions de migration se suivent sans trou (hors numéros réservés)", () => {
  const max = MIGRATIONS[MIGRATIONS.length - 1]!.version;
  const attendu = Array.from({ length: max }, (_, i) => i + 1).filter((v) => !RESERVEES.has(v));
  assert.deepEqual(MIGRATIONS.map((m) => m.version), attendu);
});

test("migrer crée le schéma et fixe user_version, puis est idempotent", async () => {
  const { raw, db } = neuve();
  assert.equal(await migrer(db), VERSION_COURANTE);
  assert.equal(await migrer(db), VERSION_COURANTE);
  const v = raw.prepare("PRAGMA user_version").get() as { user_version: number };
  assert.equal(v.user_version, VERSION_COURANTE);
  const tables = (raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name);
  for (const t of ["exercices", "routines", "routine_exercices", "seances", "series", "reglages", "records", "seance_exercices", "exercice_alias"]) {
    assert.ok(tables.includes(t), t);
  }
});

test("superset : deux exercices d'une routine partagent un groupe", async () => {
  const { raw, db } = neuve();
  await migrer(db);
  raw.exec(`INSERT INTO exercices (id,nom,poids_corps,cree_le,maj_le) VALUES ('e1','Tirage',0,1,1),('e2','Rowing',0,1,1);
    INSERT INTO routines (id,nom,note,ordre,cree_le,maj_le) VALUES ('r1','Pull',NULL,0,1,1);
    INSERT INTO routine_exercices (id,routine_id,exercice_id,position,groupe_superset) VALUES ('a','r1','e1',0,1),('b','r1','e2',1,1);`);
  const n = raw.prepare("SELECT COUNT(*) AS n FROM routine_exercices WHERE routine_id='r1' AND groupe_superset=1").get() as { n: number };
  assert.equal(n.n, 2);
});

test("le type de série est contraint et les clés étrangères sont appliquées", async () => {
  const { raw, db } = neuve();
  await migrer(db);
  raw.exec(`INSERT INTO exercices (id,nom,poids_corps,cree_le,maj_le) VALUES ('e1','Tirage',0,1,1); INSERT INTO seances (id,debut,maj_le) VALUES ('s1',1,1);`);
  assert.throws(() => raw.exec(`INSERT INTO series (id,seance_id,exercice_id,position,type) VALUES ('x','s1','e1',0,'bizarre')`));
  assert.throws(() => raw.exec(`INSERT INTO series (id,seance_id,exercice_id,position) VALUES ('y','nope','e1',0)`));
  raw.exec(`INSERT INTO series (id,seance_id,exercice_id,position,type) VALUES ('ok','s1','e1',0,'degressive')`);
});

test("migration 8 : la colonne tempo des lignes de routine existe, vide par défaut", async () => {
  const { raw, db } = neuve();
  await migrer(db, 7);
  raw.exec(`INSERT INTO exercices (id,nom,poids_corps,cree_le,maj_le) VALUES ('e1','Squat',0,1,1); INSERT INTO routines (id,nom,ordre,cree_le,maj_le) VALUES ('r1','R',0,1,1); INSERT INTO routine_exercices (id,routine_id,exercice_id,position) VALUES ('l1','r1','e1',0);`);
  await migrer(db);
  assert.equal((raw.prepare("SELECT tempo FROM routine_exercices WHERE id = 'l1'").get() as { tempo: string | null }).tempo, null);
  raw.exec("UPDATE routine_exercices SET tempo = '3-1-1-0' WHERE id = 'l1'");
});

test("migration 15 : seance_exercices.tempo existe, vide par défaut", async () => {
  const { raw, db } = neuve();
  await migrer(db, 14);
  raw.exec(`INSERT INTO exercices (id,nom,poids_corps,cree_le,maj_le) VALUES ('e1','Squat',0,1,1); INSERT INTO seances (id,debut,maj_le) VALUES ('s1',1,1); INSERT INTO seance_exercices (seance_id,exercice_id,position) VALUES ('s1','e1',0);`);
  await migrer(db);
  assert.equal((raw.prepare("SELECT tempo FROM seance_exercices WHERE seance_id = 's1'").get() as { tempo: string | null }).tempo, null);
  raw.exec("UPDATE seance_exercices SET tempo = '3-1-1-0' WHERE seance_id = 's1'");
});

test("migration 20 : nom_en_norm existe et indexé, vide au départ ; completerNoms le remplit sur une base ancienne", async () => {
  const { raw, db } = neuve();
  await migrer(db, 19);
  raw.exec(`INSERT INTO exercices (id,nom,nom_en,nom_norm,perso,poids_corps,cree_le,maj_le) VALUES ('c1','Tractions','Pull-Up','tractions',0,0,1,1), ('p1','Lat Pulldown Wide','','lat pulldown wide',1,0,1,1), ('p2','Gainage maison',NULL,'gainage maison',1,0,1,1);`);
  await migrer(db);
  assert.equal((raw.prepare("SELECT nom_en_norm FROM exercices WHERE id = 'c1'").get() as { nom_en_norm: string | null }).nom_en_norm, null);
  assert.ok(raw.prepare("SELECT 1 FROM pragma_index_list('exercices') WHERE name = 'idx_exercices_nom_en_norm'").get());
  const { completerNoms } = await import("../src/db/depots/noms.ts");
  assert.equal(await completerNoms(db), 2);
  const l = (id: string) => ({ ...(raw.prepare("SELECT nom, nom_en, nom_en_norm FROM exercices WHERE id = ?").get(id) as Record<string, string | null>) });
  assert.deepEqual(l("c1"), { nom: "Tractions", nom_en: "Pull-Up", nom_en_norm: "pull up" });
  assert.deepEqual(l("p1"), { nom: "Lat Pulldown Wide", nom_en: "Lat Pulldown Wide", nom_en_norm: "lat pulldown wide" });
  assert.deepEqual(l("p2"), { nom: "Gainage maison", nom_en: null, nom_en_norm: null });
});

test("migration 190 : salle.lieu_partage existe, vide pour les salles déjà là", async () => {
  const { raw, db } = neuve();
  await migrer(db, 188);
  raw.exec("INSERT INTO salle (id,nom,cree_le,maj_le) VALUES ('s1','Ma salle',1,1)");
  await migrer(db);
  assert.equal((raw.prepare("SELECT lieu_partage FROM salle WHERE id = 's1'").get() as { lieu_partage: string | null }).lieu_partage, null);
  raw.exec("UPDATE salle SET lieu_partage = 'lieu1' WHERE id = 's1'");
  assert.equal((raw.prepare("SELECT lieu_partage FROM salle WHERE id = 's1'").get() as { lieu_partage: string }).lieu_partage, "lieu1");
});
