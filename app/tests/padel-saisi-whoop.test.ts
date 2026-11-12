// Padel du 08/11 (retour du 20 h 27) : l'activité Whoop détectée 07:52 à 09:29 (sans sport, -1) est associée au padel
// programmé ; Alex saisit alors « Padel » de 08:00:30 à 09:30:30 dans Whoop (4 491 pas) ; Whoop réduit l'activité détectée à une
// marche de 07:50 à 07:54 (313 pas). Avant : la séance prenait les heures de la marche (4 min), lisait ses 313 pas, et la saisie
// créait une seconde séance. Maintenant : la séance garde ses heures détectées, la saisie l'enrichit (ses 4 491 pas), une seule séance.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest, jour } from "./aide.ts";
import { rafraichirActivites, type SanteActivites } from "../src/db/depots/activites.ts";
import { creerRoutine } from "../src/db/depots/routines.ts";
import { ajouterProgrammation, poserReglagesPrevus } from "../src/db/depots/programmations.ts";
import { ecrireFcMaxSaisie, ecrireModeFcMax } from "../src/db/depots/zones-fc.ts";
import { sourcesSeance, type DepsSources } from "../src/ecrans/seance-sources.ts";
import { enregistrerSeances, retraiterSeancesWhoop } from "../src/whoop/depot.ts";
import type { SeanceConvertie } from "../src/whoop/types.ts";

const MIN = 60_000;
const dimanche = jour(2026, 11, 8, 0, 0);
const J = "2026-11-08";
const MAINTENANT = jour(2026, 11, 8, 20, 30);
const DETECTEE = { debut: jour(2026, 11, 8, 7, 52), fin: jour(2026, 11, 8, 9, 29) + 59_000 };
const SAISIE = { debut: jour(2026, 11, 8, 8, 0) + 30_000, fin: jour(2026, 11, 8, 9, 30) + 30_000 };
const REDUITE = { debut: jour(2026, 11, 8, 7, 50), fin: jour(2026, 11, 8, 7, 54) };

const sante: SanteActivites = { seancesSport: async () => null, pasIntervalles: async () => [5000], fcEntre: async () => null, nuits: async () => null };
const whoop = (id: string, h: { debut: number; fin: number }, sportId: number, sport: string): SeanceConvertie => ({
  id, ...h, sportId, sport, strain: 12.8, kj: 2100, fcMoy: 130, fcMax: 168, distanceM: null, zones: [3, 20, 38, 28, 8, 0],
});
const detectee = () => whoop("451de453", DETECTEE, -1, "Activity");
const reduite = () => whoop("451de453", REDUITE, 63, "Walking");
const saisie = () => whoop("3cd178a7", SAISIE, 106, "Paddle Tennis");

/** Le padel programmé de 8:00, l'activité détectée de 7:52 à 9:29, associée toute seule au padel programmé (réglage par défaut). */
async function baseAssociee() {
  const b = await baseDeTest(true);
  const { db } = b;
  await ecrireModeFcMax(db, "saisie");
  await ecrireFcMaxSaisie(db, 185);
  const rid = await creerRoutine(db, "Padel", [{ exerciceId: "cat:padel", nbSeries: 1 }]);
  const pid = await ajouterProgrammation(db, rid, "le 8 nov.", { freq: "unique", intervalle: 1, jours: [], date: J, heure: "08:00", debut: J });
  await poserReglagesPrevus(db, pid, { sport: "cat:padel", dureeMin: 90, sansHeure: false });
  await enregistrerSeances(db, [detectee()], MAINTENANT - 60 * MIN);
  assert.equal((await rafraichirActivites(db, dimanche, sante, MAINTENANT - 60 * MIN)).posees, 1);
  const s = (await db.getFirstAsync<{ id: string }>("SELECT id FROM seances WHERE source_ref = 'whoop:451de453'", []))!.id;
  return { ...b, id: s };
}

const seances = async (db: Awaited<ReturnType<typeof baseDeTest>>["db"]) =>
  (await db.getAllAsync<{ id: string; debut: number; fin: number }>("SELECT id, debut, fin FROM seances ORDER BY debut", [])).map((s) => ({ id: s.id, debut: s.debut, fin: s.fin }));
const lien = async (db: Awaited<ReturnType<typeof baseDeTest>>["db"], w: string) => (await db.getFirstAsync<{ seance_id: string | null }>("SELECT seance_id FROM whoop_seance WHERE id = ?", [w]))!.seance_id;

for (const ordre of ["la marche d'abord", "la saisie d'abord"] as const) {
  test(`Whoop remplace l'activité détectée par la saisie à la main (${ordre}) : une seule séance, heures détectées gardées, enrichie par la saisie`, async () => {
    const { db, id } = await baseAssociee();
    assert.equal(await lien(db, "451de453"), id);
    const lot = ordre === "la marche d'abord" ? [reduite(), saisie()] : [saisie(), reduite()];
    await enregistrerSeances(db, lot, MAINTENANT);
    await retraiterSeancesWhoop(db, MAINTENANT);
    // jamais deux séances pour le même padel, et les heures détectées (07:52, 1 h 38) restent
    assert.deepEqual(await seances(db), [{ id, ...DETECTEE }]);
    assert.equal(await lien(db, "3cd178a7"), id, "la saisie enrichit la séance détectée");
    assert.equal(await lien(db, "451de453"), null, "la marche de 4 min ne dit plus rien de la séance");
    // idempotent : une synchro de plus ne change rien
    await enregistrerSeances(db, lot, MAINTENANT + MIN);
    await retraiterSeancesWhoop(db, MAINTENANT + MIN);
    assert.deepEqual(await seances(db), [{ id, ...DETECTEE }]);
    assert.equal(await lien(db, "3cd178a7"), id);
  });
}

test("état déjà abîmé (séance raccourcie à 07:50-07:54, seconde séance créée pour la saisie) : remis en ordre à la synchro suivante", async () => {
  const { db, id } = await baseAssociee();
  // ce que l'ancienne version a fait : heures de la marche, séance de la saisie à part
  await db.runAsync("UPDATE seances SET debut = ?, fin = ? WHERE id = ?", [REDUITE.debut, REDUITE.fin, id]);
  await db.runAsync("UPDATE whoop_seance SET debut = ?, fin = ?, sport_id = 63, sport = 'Walking' WHERE id = '451de453'", [REDUITE.debut, REDUITE.fin]);
  await db.runAsync("INSERT INTO seances (id, titre, debut, fin, source_ref, maj_le) VALUES ('doublon', 'Padel', ?, ?, 'whoop:3cd178a7', 1)", [SAISIE.debut, SAISIE.fin]);
  await db.runAsync(
    "INSERT INTO whoop_seance (id, debut, fin, sport_id, sport, seance_id, maj_le) VALUES ('3cd178a7', ?, ?, 106, 'Paddle Tennis', 'doublon', 1)",
    [SAISIE.debut, SAISIE.fin],
  );
  await enregistrerSeances(db, [reduite(), saisie()], MAINTENANT);
  await retraiterSeancesWhoop(db, MAINTENANT);
  assert.deepEqual(await seances(db), [{ id, ...DETECTEE }]);
  assert.equal(await lien(db, "3cd178a7"), id);
  assert.equal(await lien(db, "451de453"), null);
});

test("Whoop ajuste l'activité détectée de quelques minutes : la séance suit, rien n'est détaché", async () => {
  const { db, id } = await baseAssociee();
  await enregistrerSeances(db, [whoop("451de453", { debut: DETECTEE.debut - 2 * MIN, fin: DETECTEE.fin + MIN }, 106, "Paddle Tennis")], MAINTENANT);
  assert.equal(await lien(db, "451de453"), id);
  assert.deepEqual(await seances(db), [{ id, debut: DETECTEE.debut - 2 * MIN, fin: DETECTEE.fin + MIN }]);
});

test("pas de la fiche : Santé Connect lu sur la plage de l'activité saisie (4 491), jamais sur celle de la marche (313)", async () => {
  const { db, id } = await baseAssociee();
  await enregistrerSeances(db, [reduite(), saisie()], MAINTENANT);
  await retraiterSeancesWhoop(db, MAINTENANT);
  const plages: number[] = [];
  const deps: DepsSources = {
    sante: { autorisees: async () => ["pas"], pasEntre: async (d) => (plages.push(d), d === REDUITE.debut ? 313 : 4491), fcEntre: async () => null },
    maintenant: MAINTENANT,
  };
  const r = await sourcesSeance(db, { id, ...DETECTEE }, deps);
  assert.deepEqual(r.pas, { pas: 4491, source: "sante" });
  assert.ok(!plages.includes(REDUITE.debut), "jamais la plage de la marche");
});

// ---- Fragments voisins : jamais une seconde séance pour le même padel -------------------------------------------------------

const fragment = (id = "frag") => whoop(id, { debut: DETECTEE.debut, fin: SAISIE.debut - 30_000 }, 106, "Paddle Tennis");

test("fragment d'activité voisin (07:52 à 08:00, même sport) d'une séance Whoop plus longue : absorbé, jamais une seconde séance", async () => {
  const { db } = await baseDeTest(true);
  await enregistrerSeances(db, [saisie()], MAINTENANT);
  const [seule] = await seances(db);
  assert.ok(seule, "la saisie crée sa séance");
  await enregistrerSeances(db, [fragment()], MAINTENANT);
  await retraiterSeancesWhoop(db, MAINTENANT);
  assert.deepEqual(await seances(db), [seule]);
  assert.equal(await lien(db, "frag"), seule!.id);
  // une synchro de plus : toujours une seule séance, aucune activité ne change de séance
  await enregistrerSeances(db, [fragment(), saisie()], MAINTENANT + MIN);
  await retraiterSeancesWhoop(db, MAINTENANT + MIN);
  assert.deepEqual(await seances(db), [seule]);
  assert.equal(await lien(db, "3cd178a7"), seule!.id);
});

test("fragment déjà devenu sa propre séance (état du 08/11 20 h 36) : fondu dans la séance de la saisie, la plus longue", async () => {
  const { db } = await baseDeTest(true);
  // la saisie a sa séance (avec son activité Padel) ; l'ancienne version avait fait du fragment « Padel, Reconnu, 4 min » une seconde séance
  await enregistrerSeances(db, [saisie()], MAINTENANT);
  const grande = (await seances(db))[0]!.id;
  await db.runAsync("INSERT INTO seances (id, titre, debut, fin, source_ref, maj_le) VALUES ('petite', 'Padel', ?, ?, 'whoop:frag', 1)", [DETECTEE.debut, SAISIE.debut - 30_000]);
  await db.runAsync("INSERT INTO seance_exercices (seance_id, exercice_id, position) SELECT 'petite', exercice_id, position FROM seance_exercices WHERE seance_id = ?", [grande]);
  await db.runAsync("INSERT INTO whoop_seance (id, debut, fin, sport_id, sport, seance_id, maj_le) VALUES ('frag', ?, ?, 106, 'Paddle Tennis', 'petite', 1)", [DETECTEE.debut, SAISIE.debut - 30_000]);
  assert.equal((await seances(db)).length, 2);
  await retraiterSeancesWhoop(db, MAINTENANT);
  assert.deepEqual((await seances(db)).map((s) => s.id), [grande]);
  assert.equal(await lien(db, "frag"), grande);
  assert.equal(await lien(db, "3cd178a7"), grande);
});

test("deux padels séparés (une heure d'écart) restent deux séances ; une activité sans sport voisine ne crée pas de séance", async () => {
  const { db } = await baseDeTest(true);
  await enregistrerSeances(db, [saisie()], MAINTENANT);
  await enregistrerSeances(db, [whoop("apres", { debut: SAISIE.fin + 60 * MIN, fin: SAISIE.fin + 100 * MIN }, 106, "Paddle Tennis")], MAINTENANT);
  await enregistrerSeances(db, [whoop("inconnue", { debut: SAISIE.debut - 8 * MIN, fin: SAISIE.debut + 2 * MIN }, -1, "Activity")], MAINTENANT);
  await retraiterSeancesWhoop(db, MAINTENANT);
  assert.equal((await seances(db)).length, 2);
  assert.equal(await lien(db, "inconnue"), null);
});

test("occurrence programmée : deux activités détectées du même padel, une seule séance posée toute seule", async () => {
  const { db } = await baseAssociee();
  // reprise à zéro : deux activités sans nom au même créneau programmé (le fragment et la saisie), aucune encore associée
  await db.runAsync("DELETE FROM seances", []);
  await db.runAsync("DELETE FROM activite_detectee", []);
  await db.runAsync("DELETE FROM whoop_seance", []);
  await enregistrerSeances(db, [whoop("a", { debut: jour(2026, 11, 8, 7, 52), fin: jour(2026, 11, 8, 9, 29) }, -1, "Activity"), whoop("b", { debut: jour(2026, 11, 8, 8, 5), fin: jour(2026, 11, 8, 9, 20) }, -1, "Activity")], MAINTENANT);
  await rafraichirActivites(db, dimanche, sante, MAINTENANT);
  const posees = await seances(db);
  assert.equal(posees.length, 1);
});
