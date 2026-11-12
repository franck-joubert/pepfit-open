// Titre d'une séance libre (audit du 28/10, n° 36) : rien en base, titre par défaut dans la langue du moment ; les anciens
// titres « Séance libre » / « Open workout » écrits en base se lisent comme absents.
import assert from "node:assert/strict";
import { test } from "node:test";
import { definirActif } from "../src/i18n/index.ts";
import { demarrerSeance, lireSeance, seanceEnCours, terminerSeance } from "../src/db/depots/seances.ts";
import { historiqueSeances } from "../src/db/stats.ts";
import { baseDeTest } from "./aide.ts";

test("séance libre : titre vide en base, traduit à l'affichage ; anciens titres par défaut relus comme vides", async () => {
  const { db } = await baseDeTest();
  const libre = await demarrerSeance(db, null);
  assert.equal((await db.getFirstAsync<{ titre: string | null }>("SELECT titre FROM seances WHERE id = ?", [libre]))?.titre, null);
  await terminerSeance(db, libre);
  const ancienne = await demarrerSeance(db, null, "Séance libre");
  assert.equal((await seanceEnCours(db))?.titre, null);
  assert.equal((await lireSeance(db, ancienne))?.seance.titre, null);
  await terminerSeance(db, ancienne);
  const nommee = await demarrerSeance(db, null, "Jambes");
  await terminerSeance(db, nommee);
  definirActif({ langue: "en", fuseau: "Europe/Paris", poids: "kg", distance: "km" });
  try {
    const titres = (await historiqueSeances(db, { limite: 10 })).map((s) => s.titre).sort();
    assert.deepEqual(titres, ["Jambes", "Workout", "Workout"]);
  } finally {
    definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });
  }
});
