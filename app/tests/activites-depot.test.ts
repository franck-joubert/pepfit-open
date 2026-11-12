// Activités détectées en base : une journée relue de ses sources sans doublon, ignorer et rétablir, associer (le retraitement
// Whoop la garde), reconnaissance automatique au 5e choix, changer d'activité (remplacer, marquer, correction apprise, VMA),
// et l'énergie du jour : une activité ignorée garde ses kcal (même dépense).
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest, jour } from "./aide.ts";
import {
  associerActivite, changerActivite, ignorerActivite, lireActivites, lireActiviteCatalogue, lireChoix, lireSeanceAChanger, rafraichirActivites,
  retablirActivite, type SanteActivites,
} from "../src/db/depots/activites.ts";
import { enregistrerSeances, retraiterSeancesWhoop } from "../src/whoop/depot.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { REGLAGE } from "../src/whoop/constantes.ts";
import { jourEnergie } from "../src/ecrans/sante-donnees.ts";
import { lireJournee } from "../src/ecrans/journee-donnees.ts";
import { fusionnerParHeure, phrasePourquoi } from "../src/ecrans/activites-vue.ts";
import type { SeanceConvertie } from "../src/whoop/types.ts";

const MIN = 60_000;
const JOUR = 86_400_000;
const mardi = jour(2026, 10, 27, 0, 0);
const t0 = mardi + 18 * 60 * MIN + 42 * MIN;
const MAINTENANT = mardi + 21 * 60 * MIN;

const w = (id: string, sportId: number | null, d: number, f: number, autre: Partial<SeanceConvertie> = {}): SeanceConvertie => ({
  id, debut: d, fin: f, sportId, sport: "Activity", strain: 11.2, kj: 2600, fcMoy: 138, fcMax: 171, distanceM: null, zones: [0, 4, 12, 24, 19, 6], ...autre,
});
const sansSante: SanteActivites = {
  seancesSport: async () => null,
  pasIntervalles: async () => null,
  fcEntre: async () => null,
  nuits: async () => null,
};

test("Whoop « Activity » sans séance : une activité à associer, une seule fois ; ignorée puis rétablie", async () => {
  const { db } = await baseDeTest(true);
  await enregistrerSeances(db, [w("a1", -1, t0, t0 + 65 * MIN)], MAINTENANT);
  assert.deepEqual(await rafraichirActivites(db, mardi, sansSante, MAINTENANT), { ajoutees: 1, posees: 0 });
  assert.deepEqual(await rafraichirActivites(db, mardi, sansSante, MAINTENANT), { ajoutees: 0, posees: 0 });
  let [a] = await lireActivites(db, mardi, mardi + JOUR);
  assert.equal(a!.cle, "whoop:a1");
  assert.equal(a!.etat, "a-associer");
  assert.ok(Math.abs(a!.kcalBrutes! - 2600 / 4.184) < 0.01);
  await ignorerActivite(db, "whoop:a1", MAINTENANT);
  await rafraichirActivites(db, mardi, sansSante, MAINTENANT);
  [a] = await lireActivites(db, mardi, mardi + JOUR);
  assert.equal(a!.etat, "ignoree");
  await retablirActivite(db, "whoop:a1", MAINTENANT);
  [a] = await lireActivites(db, mardi, mardi + JOUR);
  assert.equal(a!.etat, "a-associer");
});

test("associer : une séance de padel (activité, série de la durée, séance Whoop rattachée) que le retraitement garde ; le choix est appris", async () => {
  const { db } = await baseDeTest(true);
  await enregistrerSeances(db, [w("a1", -1, t0, t0 + 65 * MIN)], MAINTENANT);
  await rafraichirActivites(db, mardi, sansSante, MAINTENANT);
  const [a] = await lireActivites(db, mardi, mardi + JOUR);
  const padel = (await lireActiviteCatalogue(db, "cat:padel"))!;
  const id = await associerActivite(db, a!, padel, { profil: { fcRepos: 55, fcMax: 185 }, maintenant: MAINTENANT });
  const s = await db.getFirstAsync<{ titre: string; source_ref: string }>("SELECT titre, source_ref FROM seances WHERE id = ?", [id]);
  assert.deepEqual({ ...s }, { titre: "Padel", source_ref: "whoop:a1" });
  const serie = await db.getFirstAsync<{ exercice_id: string; duree_s: number }>("SELECT exercice_id, duree_s FROM series WHERE seance_id = ?", [id]);
  assert.deepEqual({ ...serie }, { exercice_id: "cat:padel", duree_s: 3900 });
  assert.equal((await db.getFirstAsync<{ seance_id: string }>("SELECT seance_id FROM whoop_seance WHERE id = 'a1'", []))!.seance_id, id);
  // le retraitement Whoop retirait les séances d'une activité non nommée : plus celle à qui l'utilisateur a donné un sport
  await retraiterSeancesWhoop(db, MAINTENANT);
  assert.ok(await db.getFirstAsync("SELECT 1 AS x FROM seances WHERE id = ?", [id]));
  // la ligne ne revient pas
  await rafraichirActivites(db, mardi, sansSante, MAINTENANT);
  assert.equal((await lireActivites(db, mardi, mardi + JOUR))[0]!.etat, "associee");
  const choix = (await lireChoix(db, MAINTENANT)).filter((c) => c.detectee !== false);
  assert.equal(choix.length, 1);
  assert.equal(choix[0]!.sport, "cat:padel");
  assert.equal(choix[0]!.contexte.jour, 1);
});

test("cinq mardis soir de padel : le sixième est posé tout seul (« Reconnu »), sauf si l'automatique est coupé", async () => {
  for (const auto of [true, false]) {
    const { db } = await baseDeTest(true);
    if (!auto) await ecrireReglage(db, "reco_auto", "0");
    const padel = (await lireActiviteCatalogue(db, "cat:padel"))!;
    for (let k = 5; k >= 1; k--) {
      const j = mardi - k * 7 * JOUR;
      await enregistrerSeances(db, [w(`p${k}`, -1, j + 19 * 60 * MIN, j + 20 * 60 * MIN)], MAINTENANT);
      await rafraichirActivites(db, j, sansSante, MAINTENANT);
      const [a] = await lireActivites(db, j, j + JOUR);
      await associerActivite(db, a!, padel, { profil: null, maintenant: MAINTENANT });
    }
    await enregistrerSeances(db, [w("p0", -1, mardi + 19 * 60 * MIN + 5 * MIN, mardi + 20 * 60 * MIN + 10 * MIN)], MAINTENANT);
    const r = await rafraichirActivites(db, mardi, sansSante, MAINTENANT);
    assert.equal(r.posees, auto ? 1 : 0);
    const [a] = await lireActivites(db, mardi, mardi + JOUR);
    assert.equal(a!.etat, auto ? "associee" : "a-associer");
    if (!auto) continue;
    const s = (await lireSeanceAChanger(db, a!.seanceId!))!;
    assert.equal(s.reconnu?.sport, "cat:padel");
    assert.equal(phrasePourquoi(s.reconnu!.pourquoi), "Comme tes mardis soir");
  }
});

test("pepfit sans Whoop : un effort net de la FC de la montre devient une activité ; Whoop connecté aussi (une activité qu'il a détectée sans qu'elle soit traitée n'est pas encore dans son API, 09/11)", async () => {
  const fc = Array.from({ length: 61 }, (_, i) => ({ t: t0 + i * MIN, bpm: 140 }));
  const montre: SanteActivites = { ...sansSante, fcEntre: async (a, b) => fc.filter((x) => x.t >= a && x.t <= b) };
  const { db } = await baseDeTest(true);
  await rafraichirActivites(db, mardi, montre, MAINTENANT);
  const [a] = await lireActivites(db, mardi, mardi + JOUR);
  assert.equal(a!.source, "pepfit");
  assert.equal(a!.fcMoy, 140);
  const autre = await baseDeTest(true);
  await ecrireReglage(autre.db, REGLAGE.connecte, "1");
  await rafraichirActivites(autre.db, mardi, montre, MAINTENANT);
  const [b] = await lireActivites(autre.db, mardi, mardi + JOUR);
  assert.equal(b?.source, "pepfit");
});

test("pepfit sans Whoop : une marche ordinaire vue par la montre (FC modérée, 105 pas/min) n'est jamais une activité", async () => {
  const { db } = await baseDeTest(true);
  // FC au repos 55 (nuits Whoop), FC max d'après l'âge : 39 ans → 181 ; seuils 105 (effort) et 118 (marche)
  await ecrireReglage(db, "naissance", "1987-05-14");
  for (let k = 0; k < 10; k++) await db.runAsync("INSERT INTO mesure_corps (id, type, date, valeur, source, cree_le) VALUES (?,?,?,?,?,?)", [`n${k}`, "fc", MAINTENANT - (k + 1) * JOUR, 55, "whoop", MAINTENANT]);
  const fc = Array.from({ length: 46 }, (_, i) => ({ t: t0 + i * MIN, bpm: 112 }));
  const appels: number[][] = [];
  const montre: SanteActivites = {
    ...sansSante,
    fcEntre: async (a, b) => fc.filter((x) => x.t >= a && x.t <= b),
    pasIntervalles: async (bornes) => {
      appels.push(bornes);
      return [Math.round(((bornes[1]! - bornes[0]!) / MIN) * 105)];
    },
  };
  await rafraichirActivites(db, mardi, montre, MAINTENANT);
  assert.equal((await lireActivites(db, mardi, mardi + JOUR)).length, 0);
  // les pas ne sont lus que sur la plage candidate (une lecture), pas sur toute la journée
  assert.equal(appels.length, 1);
  // la même FC presque sans pas (vélo, rameur) : une activité
  const velo = await baseDeTest(true);
  await ecrireReglage(velo.db, "naissance", "1987-05-14");
  for (let k = 0; k < 10; k++) await velo.db.runAsync("INSERT INTO mesure_corps (id, type, date, valeur, source, cree_le) VALUES (?,?,?,?,?,?)", [`n${k}`, "fc", MAINTENANT - (k + 1) * JOUR, 55, "whoop", MAINTENANT]);
  await rafraichirActivites(velo.db, mardi, { ...montre, pasIntervalles: async () => [40] }, MAINTENANT);
  assert.equal((await lireActivites(velo.db, mardi, mardi + JOUR)).length, 1);
});

test("changer d'activité : Tennis → Padel (Whoop), la correction est apprise ; muscu → CrossFit garde ses exercices", async () => {
  const { db } = await baseDeTest(true);
  // séance Whoop « Tennis » (34) créée par la synchro
  await enregistrerSeances(db, [w("t1", 34, t0, t0 + 65 * MIN, { sport: "Tennis" })], MAINTENANT);
  const id = (await db.getFirstAsync<{ id: string }>("SELECT id FROM seances WHERE source_ref = 'whoop:t1'", []))!.id;
  const padel = (await lireActiviteCatalogue(db, "cat:padel"))!;
  const plan = (await changerActivite(db, id, padel, MAINTENANT))!;
  assert.equal(plan.ecriture.genre, "remplacer");
  assert.equal(plan.depense, "fc");
  const apres = (await lireSeanceAChanger(db, id))!;
  assert.equal(apres.activite?.id, "cat:padel");
  assert.equal(apres.titre, "Padel");
  assert.equal((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM series WHERE seance_id = ? AND exercice_id = 'cat:padel'", [id]))!.n, 1);
  // séance de muscu : deux exercices, la séance porte le sport
  const muscu = "m1";
  await db.runAsync("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES (?,?,?,?,?)", [muscu, "Push A", mardi + 12 * 60 * MIN, mardi + 13 * 60 * MIN, MAINTENANT]);
  const exos = await db.getAllAsync<{ id: string }>("SELECT id FROM exercices WHERE categorie = 'Force' AND whoop_ids IS NULL LIMIT 2", []);
  for (const [i, e] of exos.entries()) {
    await db.runAsync("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES (?,?,?)", [muscu, e.id, i]);
    await db.runAsync("INSERT INTO series (id, seance_id, exercice_id, position, type, kg, reps, faite) VALUES (?,?,?,0,'normale',60,10,1)", [`s${i}`, muscu, e.id]);
  }
  const crossfit = (await lireActiviteCatalogue(db, "cat:crossfit")) ?? (await lireActiviteCatalogue(db, "cat:cross-training"))!;
  const p2 = (await changerActivite(db, muscu, crossfit, MAINTENANT))!;
  assert.deepEqual(p2.ecriture, { genre: "marquer", activite: crossfit.id });
  assert.equal(p2.garde.exercices, 2);
  const m = (await lireSeanceAChanger(db, muscu))!;
  assert.equal(m.activite?.id, crossfit.id);
  assert.equal(m.titre, "Push A");
  assert.equal((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM series WHERE seance_id = ?", [muscu]))!.n, 2);
});

test("énergie du jour : l'activité à associer compte dans Sport ; ignorée, ses kcal passent aux pas, même dépense", async () => {
  const { db } = await baseDeTest(true);
  await enregistrerSeances(db, [w("a1", -1, t0, t0 + 65 * MIN)], MAINTENANT);
  await rafraichirActivites(db, mardi, sansSante, MAINTENANT);
  const avant = (await jourEnergie(db, mardi, MAINTENANT)).bilan;
  assert.equal(avant.sport.seances.length, 1);
  assert.equal(avant.sport.seances[0]!.detectee, true);
  assert.ok(avant.sport.kcal > 400, String(avant.sport.kcal));
  await ignorerActivite(db, "whoop:a1", MAINTENANT);
  const apres = (await jourEnergie(db, mardi, MAINTENANT)).bilan;
  assert.equal(apres.sport.seances.length, 0);
  assert.equal(apres.neat?.ignorees, 1);
  assert.ok(Math.abs(apres.depense.kcal - avant.depense.kcal) < 1, `${avant.depense.kcal} → ${apres.depense.kcal}`);
});

test("lignes du jour : chaque activité à son heure parmi les séances faites, les prévues après", () => {
  const faites = [{ d: 12 }, { d: 20 }];
  const l = fusionnerParHeure<{ d: number | null }, { debut: number }>([...faites, { d: null }], [{ debut: 7 }, { debut: 18 }], (x) => x.d);
  assert.deepEqual(l, [{ debut: 7 }, { d: 12 }, { debut: 18 }, { d: 20 }, { d: null }]);
});

test("familles : le sport choisi décide de la famille (sauna associé hors de l'effort du jour, changé en padel il y entre ; muscu marquée yoga, hors)", async () => {
  const { db } = await baseDeTest(true);
  await enregistrerSeances(db, [w("a1", -1, t0, t0 + 65 * MIN)], MAINTENANT);
  await rafraichirActivites(db, mardi, sansSante, MAINTENANT);
  const [a] = await lireActivites(db, mardi, mardi + JOUR);
  const id = await associerActivite(db, a!, (await lireActiviteCatalogue(db, "cat:sauna"))!, { profil: null, maintenant: MAINTENANT });
  assert.equal((await lireJournee(db, mardi)).effort, null);
  await changerActivite(db, id, (await lireActiviteCatalogue(db, "cat:padel"))!, MAINTENANT);
  assert.ok(((await lireJournee(db, mardi)).effort?.score ?? 0) > 0);
  // une séance d'exercices marquée (activite_id) : la famille suit la marque
  const { db: db2 } = await baseDeTest(true);
  await db2.runAsync("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES ('m1','Push A',?,?,?)", [mardi + 12 * 60 * MIN, mardi + 13 * 60 * MIN, MAINTENANT]);
  const e = (await db2.getFirstAsync<{ id: string }>("SELECT id FROM exercices WHERE categorie = 'Force' AND whoop_ids IS NULL LIMIT 1", []))!;
  await db2.runAsync("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES ('m1',?,0)", [e.id]);
  await db2.runAsync("INSERT INTO series (id, seance_id, exercice_id, position, type, kg, reps, faite) VALUES ('s0','m1',?,0,'normale',60,10,1)", [e.id]);
  assert.ok(((await lireJournee(db2, mardi)).effort?.score ?? 0) > 0);
  await changerActivite(db2, "m1", (await lireActiviteCatalogue(db2, "cat:yoga"))!, MAINTENANT);
  assert.equal((await lireJournee(db2, mardi)).effort, null);
});
