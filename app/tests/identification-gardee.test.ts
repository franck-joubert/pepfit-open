// Une activité identifiée (sport, titre, validation) est gardée en dur : déconnecter Whoop ne la défait pas, et une activité déjà
// validée ou déjà couverte par une séance du même créneau n'est jamais redemandée (« Padel ? » + « Oui » du 6/11).
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest, jour } from "./aide.ts";
import { associerActivite, lireActivites, lireActivitesAProposer, lireActiviteCatalogue, rafraichirActivites, type SanteActivites } from "../src/db/depots/activites.ts";
import { enregistrerSeances, purgerWhoop } from "../src/whoop/depot.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { REGLAGE } from "../src/whoop/constantes.ts";
import { MIGRATIONS } from "../src/db/migrations.ts";
import type { SeanceConvertie } from "../src/whoop/types.ts";

const MIN = 60_000;
const JOUR = 86_400_000;
const lundi = jour(2026, 10, 2, 0, 0);
const debut = lundi + 10 * 60 * MIN + 58 * MIN;
const MAINTENANT = lundi + 4 * JOUR + 22 * 60 * MIN;
const w = (id: string, sportId: number | null, d: number, f: number): SeanceConvertie => ({
  id, debut: d, fin: f, sportId, sport: "Activity", strain: 11.2, kj: 2600, fcMoy: 135, fcMax: 171, distanceM: null, zones: [0, 4, 12, 24, 19, 6],
});
const fcMontre = (d: number, f: number) => Array.from({ length: Math.round((f - d) / MIN) + 1 }, (_, i) => ({ t: d + i * MIN, bpm: 135 }));
const montre = (d: number, f: number): SanteActivites => ({
  seancesSport: async () => null,
  pasIntervalles: async () => null,
  fcEntre: async (a, b) => fcMontre(d, f).filter((x) => x.t >= a && x.t <= b),
  nuits: async () => null,
});
const seances = (db: Awaited<ReturnType<typeof baseDeTest>>["db"]) =>
  db.getAllAsync<{ id: string; titre: string; source_ref: string | null }>("SELECT id, titre, source_ref FROM seances ORDER BY debut", []);

test("déconnecter Whoop garde l'activité validée (sport, titre, séance) et ne la redemande pas", async () => {
  const { db } = await baseDeTest(true);
  await ecrireReglage(db, REGLAGE.connecte, "1");
  await ecrireReglage(db, "naissance", "1987-05-14");
  const fin = debut + 96 * MIN;
  await enregistrerSeances(db, [w("a1", -1, debut, fin)], MAINTENANT);
  await rafraichirActivites(db, lundi, montre(debut, fin), MAINTENANT);
  const [a] = await lireActivites(db, lundi, lundi + JOUR);
  const id = await associerActivite(db, a!, (await lireActiviteCatalogue(db, "cat:padel"))!, { profil: { fcRepos: 55, fcMax: 185 }, maintenant: MAINTENANT });
  assert.equal((await seances(db)).length, 1);

  await purgerWhoop(db);

  // la séance reste, avec son titre et son sport, sans dépendre d'une source Whoop
  const [s] = await seances(db);
  assert.equal(s!.id, id);
  assert.equal(s!.titre, "Padel");
  assert.ok(!s!.source_ref?.startsWith("whoop:"));
  assert.equal((await db.getFirstAsync<{ exercice_id: string }>("SELECT exercice_id FROM series WHERE seance_id = ?", [id]))!.exercice_id, "cat:padel");
  // sans Whoop, la FC de la montre voit le même créneau : rien n'est proposé
  await rafraichirActivites(db, lundi, montre(debut - 3 * MIN, fin), MAINTENANT);
  const lues = await lireActivites(db, lundi, lundi + JOUR);
  assert.deepEqual(lues.filter((x) => x.etat === "a-associer"), []);
  assert.equal(lues.find((x) => x.etat === "associee")?.seanceId, id);
});

test("séance Whoop reconnue d'office (sport nommé) : gardée à la déconnexion, jamais redemandée", async () => {
  const { db } = await baseDeTest(true);
  await ecrireReglage(db, REGLAGE.connecte, "1");
  await ecrireReglage(db, "naissance", "1987-05-14");
  const fin = debut + 96 * MIN;
  await enregistrerSeances(db, [w("p1", 249, debut, fin)], MAINTENANT);
  assert.equal((await seances(db))[0]!.titre, "Padel");
  await purgerWhoop(db);
  assert.equal((await seances(db)).length, 1);
  await rafraichirActivites(db, lundi, montre(debut, fin), MAINTENANT);
  assert.deepEqual(await lireActivites(db, lundi, lundi + JOUR), []);
});

test("une activité déjà validée ou couverte par une séance du créneau n'est jamais proposée (séance rendue sans sa source)", async () => {
  const { db } = await baseDeTest(true);
  await ecrireReglage(db, "naissance", "1987-05-14");
  const fin = debut + 96 * MIN;
  // une proposition restée « à associer » d'avant, puis la séance validée du même créneau
  await rafraichirActivites(db, lundi, montre(debut, fin), MAINTENANT);
  const [a] = await lireActivites(db, lundi, lundi + JOUR);
  assert.equal(a!.etat, "a-associer");
  await db.runAsync("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES ('s1','Padel 1 h 30',?,?,?)", [debut + 5 * MIN, fin - 5 * MIN, MAINTENANT]);
  await rafraichirActivites(db, lundi, montre(debut, fin), MAINTENANT);
  assert.deepEqual((await lireActivites(db, lundi, lundi + JOUR)).filter((x) => x.etat === "a-associer"), []);
});

test("Whoop revient après sa déconnexion : sa séance reprend la séance gardée, sans doublon", async () => {
  const { db } = await baseDeTest(true);
  await ecrireReglage(db, REGLAGE.connecte, "1");
  const fin = debut + 96 * MIN;
  await enregistrerSeances(db, [w("p1", 249, debut, fin)], MAINTENANT);
  await purgerWhoop(db);
  const bilan = await enregistrerSeances(db, [w("p1", 249, debut, fin)], MAINTENANT);
  assert.deepEqual([bilan.enrichies, bilan.creees], [1, 0]);
  assert.equal((await seances(db)).length, 1);
});

test("lireActivitesAProposer : ni une activité couverte par une séance, ni une couverte par une activité associée", async () => {
  const { db } = await baseDeTest(true);
  const fin = debut + 96 * MIN;
  await ecrireReglage(db, "naissance", "1987-05-14");
  await rafraichirActivites(db, lundi, montre(debut, fin), MAINTENANT);
  assert.equal((await lireActivitesAProposer(db, lundi, lundi + JOUR)).length, 1);
  // séance du créneau arrivée depuis (sans nouvelle lecture de la FC) : la ligne n'est pas montrée
  await db.runAsync("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES ('s1','Padel 1 h 30',?,?,?)", [debut + 2 * MIN, fin - 4 * MIN, MAINTENANT]);
  assert.equal((await lireActivitesAProposer(db, lundi, lundi + JOUR)).length, 0);
});

test("migration 184 : une activité validée dont la séance a disparu est recréée (sport du choix gardé), le reste ne bouge pas", async () => {
  const { db, raw } = await baseDeTest(true);
  const fin = debut + 96 * MIN;
  const m = MIGRATIONS.find((x) => x.version === 184)!;
  assert.equal(m.temoin, "temoin_activites_gardees");
  const ligne = db.runAsync.bind(db);
  // validée avec un choix retenu, séance disparue : réparée
  await ligne("INSERT INTO activite_detectee (cle, source, debut, fin, etat, seance_id, maj_le) VALUES ('whoop:a1','whoop',?,?,'associee','perdue',1)", [debut, fin]);
  await ligne("INSERT INTO reconnaissance_choix (id, sport, detectee, seance_id, contexte, le) VALUES ('c1','cat:padel',1,'perdue','{}',1)", []);
  // reconnue d'office (aucun choix gardé) : rien n'est inventé
  const deux = lundi + 2 * JOUR + 11 * 60 * MIN;
  await ligne("INSERT INTO activite_detectee (cle, source, debut, fin, etat, seance_id, maj_le) VALUES ('whoop:a2','whoop',?,?,'associee','perdue2',1)", [deux, deux + 60 * MIN]);
  // une séance toujours là : intacte
  const trois = lundi + 3 * JOUR + 9 * 60 * MIN;
  await ligne("INSERT INTO seances (id, titre, debut, fin, source_ref, maj_le) VALUES ('vivante','Tennis',?,?,'whoop:a3',1)", [trois, trois + 3600_000]);
  await ligne("INSERT INTO activite_detectee (cle, source, debut, fin, etat, seance_id, maj_le) VALUES ('whoop:a3','whoop',?,?,'associee','vivante',1)", [trois, trois + 3600_000]);
  // proposition d'une autre source sur le créneau de la validée
  await ligne("INSERT INTO activite_detectee (cle, source, debut, fin, etat, maj_le) VALUES ('pepfit:x','pepfit',?,?,'a-associer',1)", [debut - 3 * MIN, fin]);

  raw.exec(m.sql.replace("CREATE TABLE temoin_activites_gardees (fait INTEGER);", ""));

  const s = await db.getFirstAsync<{ id: string; titre: string; source_ref: string; reconnu: string | null; debut: number; fin: number }>("SELECT * FROM seances WHERE id = 'perdue'", []);
  assert.deepEqual([s!.titre, s!.source_ref, s!.reconnu, s!.debut, s!.fin], ["Padel", "ancien-whoop:a1", null, debut, fin]);
  assert.equal((await db.getFirstAsync<{ exercice_id: string }>("SELECT exercice_id FROM seance_exercices WHERE seance_id = 'perdue'", []))!.exercice_id, "cat:padel");
  const serie = await db.getFirstAsync<{ duree_s: number; faite: number }>("SELECT duree_s, faite FROM series WHERE seance_id = 'perdue'", []);
  assert.deepEqual({ ...serie }, { duree_s: 5760, faite: 1 });
  assert.equal(await db.getFirstAsync("SELECT 1 AS x FROM seances WHERE id = 'perdue2'", []), null);
  assert.equal((await db.getFirstAsync<{ titre: string }>("SELECT titre FROM seances WHERE id = 'vivante'", []))!.titre, "Tennis");
  assert.equal(await db.getFirstAsync("SELECT 1 AS x FROM activite_detectee WHERE cle = 'pepfit:x'", []), null, "la proposition que couvre la séance recréée est retirée");
  // relancée, elle ne change plus rien
  raw.exec(m.sql.replace("CREATE TABLE temoin_activites_gardees (fait INTEGER);", ""));
  assert.equal((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM seances", []))!.n, 2);
});
