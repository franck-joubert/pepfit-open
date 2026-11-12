// Lieu d'une séance prévue (retour du 03/11, migration 68 ; docs/LIEU-SEANCE-FUTURE.md) : la clé de la fiche, le
// lieu écrit dans l'agenda, la table programmation_lieux (pose, lecture, une occurrence seulement, copie d'une occurrence
// retouchée) et sa synchro.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleSeance, lieuDeSeance, lireCleSeance } from "../src/agenda/calcul.ts";

test("clé de la fiche : l'inverse de cleSeance ; une forme fausse ne donne rien", () => {
  assert.deepEqual(lireCleSeance(cleSeance("p1", "2026-11-05")), { programmationId: "p1", dateOrigine: "2026-11-05" });
  // Le jour est après le dernier « | ».
  assert.deepEqual(lireCleSeance("a|b|2026-11-05"), { programmationId: "a|b", dateOrigine: "2026-11-05" });
  for (const x of [undefined, null, "", "p1", "|2026-11-05", "p1|5 nov", "p1|2026-11-5"]) assert.equal(lireCleSeance(x), null, String(x));
});

test("agenda : le lieu choisi pour la séance passe avant celui de la routine ; « Aucun lieu » laisse le champ vide", () => {
  const derniers = new Map([["r1", "Maison"]]);
  const choisis = new Map<string, string | null>([["p1|2026-11-05", "12 rue de la Paix, Paris"], ["p1|2026-11-12", null]]);
  assert.equal(lieuDeSeance(choisis, derniers, "p1|2026-11-05", "r1"), "12 rue de la Paix, Paris");
  assert.equal(lieuDeSeance(choisis, derniers, "p1|2026-11-12", "r1"), null);
  assert.equal(lieuDeSeance(choisis, derniers, "p1|2026-11-19", "r1"), "Maison");
  assert.equal(lieuDeSeance(undefined, derniers, "p1|2026-11-19", "r1"), "Maison");
  assert.equal(lieuDeSeance(choisis, derniers, "p2|2026-11-19", "r2"), null);
});

test("synchro : programmation_lieux voyage, une seule ligne par occurrence, un lieu fusionné suit", async () => {
  const { TABLES_SYNC } = await import("../src/sync/schema.ts");
  const i = TABLES_SYNC.findIndex((x) => x.nom === "programmation_lieux");
  const t = TABLES_SYNC[i]!;
  assert.deepEqual(t.uniques, [["programmation_id", "date_origine"]]);
  assert.equal(t.fusion, "doublon");
  assert.deepEqual(t.sensibles, ["lieu_id"]);
  // Après son parent (ordre d'application des ajouts).
  assert.ok(i > TABLES_SYNC.findIndex((x) => x.nom === "programmations"));
  assert.ok(TABLES_SYNC.find((x) => x.nom === "salle")!.renvois!.some((r) => r.table === "programmation_lieux" && r.colonne === "lieu_id"));
});

test("base : lieu posé pour une seule occurrence, remplacé, « Aucun lieu », lieu disparu ; repris par la fiche et par l'agenda", async () => {
  const { baseDeTest } = await import("./aide.ts");
  const { creerRoutine } = await import("../src/db/depots/routines.ts");
  const { creerSalle } = await import("../src/db/depots/salles.ts");
  const { ajouterProgrammation, lireLieuPrevu, lireSeancePrevue, poserException, poserLieuPrevu } = await import("../src/db/depots/programmations.ts");
  const { lirePlanning, instantDe } = await import("../src/ecrans/planif-donnees.ts");
  const { lireContexte, seancesAgenda } = await import("../src/agenda/synchro.ts");
  const { db, raw } = await baseDeTest(true);
  const rid = await creerRoutine(db, "Gym Upper", [{ exerciceId: "cat:couche", nbSeries: 4 }]);
  const maison = await creerSalle(db, "Maison");
  const salle = await creerSalle(db, "Basic-Fit Bastille", [], "12 rue de la Paix, Paris");
  // Chaque mercredi ; la dernière séance faite était à la Maison.
  raw.prepare("INSERT INTO seances (id, routine_id, titre, debut, fin, salle_id, maj_le) VALUES (?, ?, 'x', ?, ?, ?, 0)").run("s1", rid, Date.UTC(2026, 9, 20), Date.UTC(2026, 9, 20) + 3600_000, maison);
  const pid = await ajouterProgrammation(db, rid, "le mercredi", { freq: "semaine", intervalle: 1, jours: [2], heure: "17:30", debut: "2026-11-01" });

  // Rien de choisi : la fiche dit « rien », la synchro de l'agenda prend le lieu de la dernière séance.
  assert.equal(await lireLieuPrevu(db, pid, "2026-11-04"), undefined);
  const avant = await lireSeancePrevue(db, pid, "2026-11-04");
  assert.deepEqual(avant, { programmationId: pid, dateOrigine: "2026-11-04", date: "2026-11-04", heure: null, repetee: true, lieu: undefined });

  // Basic-Fit le 4, seulement le 4.
  await poserLieuPrevu(db, pid, "2026-11-04", salle);
  assert.deepEqual(await lireLieuPrevu(db, pid, "2026-11-04"), { id: salle, nom: "Basic-Fit Bastille" });
  assert.equal(await lireLieuPrevu(db, pid, "2026-11-11"), undefined);
  // « Aucun lieu » le 11 ; le 4 changé pour la Maison : toujours une ligne par jour.
  await poserLieuPrevu(db, pid, "2026-11-11", null);
  await poserLieuPrevu(db, pid, "2026-11-04", maison);
  assert.equal(await lireLieuPrevu(db, pid, "2026-11-11"), null);
  assert.deepEqual(await lireLieuPrevu(db, pid, "2026-11-04"), { id: maison, nom: "Maison" });
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM programmation_lieux").get() as { n: number }).n, 2);
  // Chaque pose part à la synchro.
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM sync_journal WHERE tab = 'programmation_lieux' AND supprime = 0").get() as { n: number }).n, 2);
  await poserLieuPrevu(db, pid, "2026-11-04", salle);

  // Agenda : le 4 à Basic-Fit (son adresse), le 11 sans lieu, le 18 à la Maison (dernière séance).
  const p = await lirePlanning(db, "2026-11-02", "2026-11-20", instantDe("2026-11-02", "08:00"));
  const lieux = Object.fromEntries(seancesAgenda(p, p.a, await lireContexte(db, p, { titre: { ordre: ["emoji", "sport", "nom", "duree"], coches: ["nom"] } })).map((s) => [s.dateOrigine, s.lieu]));
  assert.deepEqual(lieux, { "2026-11-04": "12 rue de la Paix, Paris", "2026-11-11": null, "2026-11-18": "Maison" });

  // Décalée au jeudi : la fiche montre le nouveau jour, le lieu reste (clé : le jour d'origine). Retirée : plus de fiche.
  await poserException(db, pid, "2026-11-04", { type: "decalee", nouvelleDate: "2026-11-05" });
  const decalee = await lireSeancePrevue(db, pid, "2026-11-04");
  assert.deepEqual([decalee?.date, decalee?.lieu], ["2026-11-05", { id: salle, nom: "Basic-Fit Bastille" }]);
  await poserException(db, pid, "2026-11-18", { type: "retiree" });
  assert.equal(await lireSeancePrevue(db, pid, "2026-11-18"), null);
  assert.equal(await lireSeancePrevue(db, "inconnue", "2026-11-04"), null);

  // Lieu supprimé depuis : rien de choisi (le tiroir reprend le lieu probable).
  raw.prepare("DELETE FROM salle WHERE id = ?").run(salle);
  assert.equal(await lireLieuPrevu(db, pid, "2026-11-04"), undefined);

  // Une séance posée pour un jour (règle unique) : pas « seulement ».
  const unique = await ajouterProgrammation(db, rid, "le 20 nov.", { freq: "unique", intervalle: 1, jours: [], date: "2026-11-20", heure: null, debut: "2026-11-20" });
  assert.equal((await lireSeancePrevue(db, unique, "2026-11-20"))?.repetee, false);
  // La règle supprimée emporte ses lieux.
  raw.prepare("DELETE FROM programmations WHERE id = ?").run(pid);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM programmation_lieux WHERE programmation_id = ?").get(pid) as { n: number }).n, 0);
});

test("base : une occurrence retouchée (copie pour ce jour) garde son lieu", async () => {
  const { baseDeTest } = await import("./aide.ts");
  const { creerRoutine } = await import("../src/db/depots/routines.ts");
  const { creerSalle } = await import("../src/db/depots/salles.ts");
  const { ajouterProgrammation, lireLieuPrevu, poserLieuPrevu } = await import("../src/db/depots/programmations.ts");
  const { personnaliserOccurrence } = await import("../src/db/depots/agenda.ts");
  const { db } = await baseDeTest(true);
  const rid = await creerRoutine(db, "Gym Upper", [{ exerciceId: "cat:couche", nbSeries: 4 }]);
  const salle = await creerSalle(db, "Basic-Fit Bastille");
  const pid = await ajouterProgrammation(db, rid, "le mercredi", { freq: "semaine", intervalle: 1, jours: [2], heure: "17:30", debut: "2026-11-01" });
  await poserLieuPrevu(db, pid, "2026-11-04", salle);
  const copie = await personnaliserOccurrence(db, pid, "2026-11-04", "fr");
  assert.ok(copie);
  assert.deepEqual(await lireLieuPrevu(db, copie.programmationId, "2026-11-04"), { id: salle, nom: "Basic-Fit Bastille" });
});

test("textes : la ligne « Lieu » de la fiche, en fr et en en", async () => {
  const { fr } = await import("../src/i18n/fr.ts");
  const { en } = await import("../src/i18n/en.ts");
  for (const k of ["exercices.routine.lieu", "exercices.routine.aucunLieu", "exercices.routine.lieuSeance", "exercices.routine.lieuSeule", "exercices.routine.lieuLibelle"] as const) {
    assert.ok(fr[k] && en[k], k);
    assert.doesNotMatch(fr[k] + en[k], /[~≈]/);
  }
  assert.equal(fr["exercices.routine.aucunLieu"], "Aucun lieu");
  assert.equal(fr["exercices.routine.lieuSeule"], "Séance du {date} seulement");
});
