// Agenda ≠ routines (lot AF, 02/11 ; docs/AGENDA-ROUTINES.md) : migration 62, routine cachée d'une séance prévue,
// retirer = masquer, purge, « Ajouter à mes routines » (copie indépendante), routine programmée liée, occurrence retouchée,
// retouche notée (modifie_par), synchro d'une ligne cachée.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { ajouterAMesRoutines, creerSeancePrevue, estRetouchee, personnaliserOccurrence } from "../src/db/depots/agenda.ts";
import { ajouterProgrammation, listerProgrammations, supprimerProgrammation } from "../src/db/depots/programmations.ts";
import {
  creerRoutine, definirCibleSerie, lireExercicesDeRoutine, listerRoutines, modifierRoutine, supprimerRoutine,
} from "../src/db/depots/routines.ts";
import { demarrerSeanceDepuisRoutine, terminerSeance } from "../src/db/depots/seances.ts";
import type { Executeur } from "../src/db/executeur.ts";
import { migrer } from "../src/db/migrations.ts";
import { instantDe, lirePlanning, lignesDuJour, type LigneJour } from "../src/ecrans/planif-donnees.ts";
import type { Regle } from "../src/ecrans/planification.ts";
import { texteRegle } from "../src/i18n/planif-saisie.ts";
import { adapter, baseDeTest, catalogue } from "./aide.ts";
import { chargerCatalogue } from "../src/db/catalogue.ts";

// Lundi 2 novembre 2026, 8 h : mercredi 4 et 11, vendredi 6 ; mercredi 28 octobre est passé.
const MAINTENANT = instantDe("2026-11-02", "08:00");
const LIGNES = [{ exerciceId: "cat:couche", nbSeries: 3 }];
const mercredis = (heure = "18:00"): Regle => ({ freq: "semaine", intervalle: 1, jours: [2], heure, debut: "2026-10-26" });

async function programmer(db: Executeur, routineId: string, r: Regle) {
  return ajouterProgrammation(db, routineId, texteRegle(r, "fr"), r);
}

const prevues = async (db: Executeur, jour: string) =>
  lignesDuJour(await lirePlanning(db, "2026-10-26", "2026-11-30", MAINTENANT), jour).filter((l): l is Extract<LigneJour, { genre: "prevue" }> => l.genre === "prevue");
const nbRoutines = async (db: Executeur, id: string) => (await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM routines WHERE id = ?", [id]))!.n;
const routine = (db: Executeur, id: string) =>
  db.getFirstAsync<{ nom: string; visible: number; origine: string; version_origine: string | null; modifie_par: string | null; modifie_le: number | null }>(
    "SELECT nom, visible, origine, version_origine, modifie_par, modifie_le FROM routines WHERE id = ?",
    [id],
  );


test("migration 62 sur une base existante : routines visibles et à soi, rien réécrit ni journalisé, déclencheurs posés", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 61);
  await chargerCatalogue(db, catalogue());
  const t = Date.now();
  raw.prepare("INSERT INTO routines (id, nom, ordre, cree_le, maj_le) VALUES ('r-ancienne', 'Push', 0, ?, ?)").run(t, t);
  raw.prepare("INSERT INTO routine_exercices (id, routine_id, exercice_id, position, nb_series, repos_s) VALUES ('l-1', 'r-ancienne', 'cat:couche', 0, 3, 120)").run();
  raw.prepare("INSERT INTO programmations (id, routine_id, texte, regle, actif, ordre, cree_le, maj_le) VALUES ('p-1', 'r-ancienne', 'mercredi', ?, 1, 0, ?, ?)").run(
    JSON.stringify(mercredis()), t, t,
  );
  const journal = () => raw.prepare("SELECT tab, cle, ms, supprime FROM sync_journal ORDER BY tab, cle").all();
  const avant = journal();
  await migrer(db);
  assert.deepEqual(journal(), avant, "aucune ligne réécrite : rien ne part au serveur");
  assert.deepEqual({ ...raw.prepare("SELECT visible, origine, version_origine, modifie_par, modifie_le FROM routines WHERE id = 'r-ancienne'").get() }, {
    visible: 1, origine: "moi", version_origine: null, modifie_par: null, modifie_le: null,
  });
  assert.deepEqual((await listerRoutines(db)).map((r) => r.id), ["r-ancienne"]);
  const declencheurs = raw.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'agenda_modif_%' ORDER BY name").all().map((x) => (x as { name: string }).name);
  assert.equal(declencheurs.length, 10);
  assert.ok(declencheurs.includes("agenda_modif_routine"));
  // Une routine sans version d'origine (à soi) n'est jamais marquée « modifiée ».
  raw.prepare("UPDATE routines SET nom = 'Push lourd' WHERE id = 'r-ancienne'").run();
  raw.prepare("UPDATE routine_exercices SET nb_series = 4 WHERE id = 'l-1'").run();
  assert.equal((raw.prepare("SELECT modifie_par FROM routines WHERE id = 'r-ancienne'").get() as { modifie_par: string | null }).modifie_par, null);
});

test("retirer de Mes routines une routine programmée la masque : l'agenda garde ses séances (règle 5)", async () => {
  const { db } = await baseDeTest(true);
  const id = await creerRoutine(db, "Push", LIGNES);
  await programmer(db, id, mercredis());
  assert.equal(await supprimerRoutine(db, id), "masquee");
  assert.deepEqual(await listerRoutines(db), []);
  assert.equal((await prevues(db, "2026-11-04"))[0]?.nom, "Push");
  assert.equal((await prevues(db, "2026-11-04"))[0]?.propre, true, "masquée : son contenu n'est plus dans Mes routines");
  // Sans séance prévue : supprimée.
  const libre = await creerRoutine(db, "Jambes", LIGNES);
  assert.equal(await supprimerRoutine(db, libre), "supprimee");
  assert.equal(await nbRoutines(db, libre), 0);
});

test("routine de la bibliothèque programmée : la modifier change ses séances à venir (liée)", async () => {
  const { db } = await baseDeTest(true);
  const id = await creerRoutine(db, "Push", LIGNES);
  await programmer(db, id, mercredis());
  assert.equal((await prevues(db, "2026-11-04"))[0]?.propre, false, "dans Mes routines : pas d'« Ajouter à mes routines »");
  await modifierRoutine(db, id, { nom: "Push lourd" });
  assert.equal((await prevues(db, "2026-11-04"))[0]?.nom, "Push lourd");
  assert.equal((await prevues(db, "2026-11-11"))[0]?.occ.routineId, id);
});

test("Ajouter à mes routines : copie indépendante, dans les deux sens ; la séance prévue garde son contenu", async () => {
  const { db } = await baseDeTest(true);
  const s = await creerSeancePrevue(db, { date: "2026-11-04", heure: "07:30", nom: "Séance de l'IA", lignes: LIGNES, origine: "ia" }, "fr");
  assert.deepEqual(await listerRoutines(db), []);
  const [l] = await prevues(db, "2026-11-04");
  assert.deepEqual([l?.nom, l?.origine, l?.propre, l?.occ.heure], ["Séance de l'IA", "ia", true, "07:30"]);

  const copie = (await ajouterAMesRoutines(db, s.routineId))!;
  assert.notEqual(copie, s.routineId);
  assert.deepEqual((await listerRoutines(db)).map((r) => [r.id, r.nom]), [[copie, "Séance de l'IA"]]);
  assert.deepEqual([(await routine(db, copie))!.visible, (await routine(db, copie))!.origine], [1, "moi"]);
  assert.equal((await routine(db, s.routineId))!.visible, 0, "la routine de la séance reste cachée");

  // Modifier la copie ne touche pas l'agenda…
  await modifierRoutine(db, copie, { nom: "Ma version" });
  const ligneCopie = (await lireExercicesDeRoutine(db, copie))[0]!;
  await definirCibleSerie(db, ligneCopie.id, 0, { kg: 80 });
  assert.equal((await prevues(db, "2026-11-04"))[0]?.nom, "Séance de l'IA");
  const kgSeance = await db.getAllAsync<{ kg: number | null }>(
    "SELECT rs.kg FROM routine_series rs JOIN routine_exercices re ON re.id = rs.ligne_id WHERE re.routine_id = ?",
    [s.routineId],
  );
  assert.ok(kgSeance.every((x) => x.kg !== 80));
  // … et l'inverse.
  await modifierRoutine(db, s.routineId, { nom: "Séance de l'IA (retouchée)" });
  assert.equal((await routine(db, copie))!.nom, "Ma version");

  // Retirer la séance de l'agenda : la copie reste, la routine cachée part (plus rien ne l'utilise).
  await supprimerProgrammation(db, s.programmationId);
  assert.equal(await nbRoutines(db, s.routineId), 0);
  assert.equal(await nbRoutines(db, copie), 1);
  assert.deepEqual(await prevues(db, "2026-11-04"), []);
});

test("créer une séance pour une date « dans mes routines » : visible et programmée, liée", async () => {
  const { db } = await baseDeTest(true);
  const s = await creerSeancePrevue(db, { date: "2026-11-06", nom: "Cardio", lignes: LIGNES, dansMesRoutines: true }, "fr");
  assert.deepEqual((await listerRoutines(db)).map((r) => r.id), [s.routineId]);
  const [l] = await prevues(db, "2026-11-06");
  assert.deepEqual([l?.origine, l?.propre], ["moi", false]);
  // Retirer la programmation ne supprime jamais une routine de Mes routines.
  await supprimerProgrammation(db, s.programmationId);
  assert.equal(await nbRoutines(db, s.routineId), 1);
});

test("routine retirée avec deux programmations : masquée, purgée à la dernière ; jamais si une séance la garde", async () => {
  const { db } = await baseDeTest(true);
  const id = await creerRoutine(db, "Push", LIGNES);
  const p1 = await programmer(db, id, mercredis());
  const p2 = await programmer(db, id, { freq: "semaine", intervalle: 1, jours: [4], heure: "18:00", debut: "2026-10-26" });
  assert.equal(await supprimerRoutine(db, id), "masquee");
  await supprimerProgrammation(db, p1);
  assert.equal(await nbRoutines(db, id), 1, "une programmation reste");
  await supprimerProgrammation(db, p2);
  assert.equal(await nbRoutines(db, id), 0, "purgée");

  // Avec une séance faite : jamais purgée, la séance garde son lien et son titre.
  const j = await creerRoutine(db, "Jambes", LIGNES);
  const pj = await programmer(db, j, mercredis());
  const seance = await demarrerSeanceDepuisRoutine(db, j);
  await terminerSeance(db, seance);
  assert.equal(await supprimerRoutine(db, j), "masquee");
  await supprimerProgrammation(db, pj);
  assert.equal(await nbRoutines(db, j), 1);
  assert.deepEqual({ ...(await db.getFirstAsync<object>("SELECT routine_id, titre FROM seances WHERE id = ?", [seance])) }, { routine_id: j, titre: "Jambes" });
  assert.deepEqual(await listerRoutines(db), []);
});

test("occurrence retouchée : seules les séances à venir non retouchées suivent la routine ; jamais le passé", async () => {
  const { db } = await baseDeTest(true);
  const id = await creerRoutine(db, "Push", LIGNES);
  const p = await programmer(db, id, mercredis());
  // Mercredi 28 octobre : faite.
  const seance = await demarrerSeanceDepuisRoutine(db, id);
  await db.runAsync("UPDATE seances SET debut = ? WHERE id = ?", [instantDe("2026-10-28", "18:00"), seance]);
  await terminerSeance(db, seance, instantDe("2026-10-28", "19:00"));

  // Le 11 novembre est retouché pour sa date (charge du jour).
  const r = (await personnaliserOccurrence(db, p, "2026-11-11", "fr"))!;
  assert.notEqual(r.routineId, id);
  const copie = (await lireExercicesDeRoutine(db, r.routineId))[0]!;
  await definirCibleSerie(db, copie.id, 0, { kg: 90 });
  const regle = (await listerProgrammations(db, r.routineId))[0]!.regle;
  assert.ok(estRetouchee(regle));
  assert.deepEqual(regle.remplace, { programmationId: p, date: "2026-11-11" });
  assert.deepEqual(await listerRoutines(db).then((l) => l.map((x) => x.id)), [id], "la retouche n'entre pas dans Mes routines");

  await modifierRoutine(db, id, { nom: "Push lourd" });
  assert.equal((await prevues(db, "2026-11-04"))[0]?.nom, "Push lourd", "à venir, non retouchée : suit");
  assert.equal((await prevues(db, "2026-11-18"))[0]?.nom, "Push lourd");
  const onze = await prevues(db, "2026-11-11");
  assert.equal(onze.length, 1, "une seule séance ce jour-là : l'occurrence d'origine est retirée");
  assert.deepEqual([onze[0]!.nom, onze[0]!.occ.routineId, onze[0]!.occ.heure], ["Push", r.routineId, "18:00"]);
  assert.equal((await db.getFirstAsync<{ titre: string }>("SELECT titre FROM seances WHERE id = ?", [seance]))!.titre, "Push", "le passé ne bouge pas");

  // Retoucher encore la même date rend la même copie.
  assert.deepEqual(await personnaliserOccurrence(db, r.programmationId, "2026-11-11", "fr"), r);
  // Retirer la séance retouchée de l'agenda purge sa copie.
  await supprimerProgrammation(db, r.programmationId);
  assert.equal(await nbRoutines(db, r.routineId), 0);
});

