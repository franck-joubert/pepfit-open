// Avant le premier écran (docs/AUDIT-PERF.md, M11) : réglages en une requête, témoins de migration vérifiés une fois par liste,
// fusion des doublons seulement quand ce qu'elle lit a changé. Et la boucle du corps de Santé qui dort entre deux images (M15).
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { Executeur } from "../src/db/executeur.ts";
import { CLE_MIGRATIONS_VERIFIEES, MIGRATIONS, empreinteMigrations, migrer } from "../src/db/migrations.ts";
import { CLE_DOUBLONS_VUS, fusionnerDoublonsSiChange } from "../src/db/depots/doublons.ts";
import { ecrireReglages, lireReglages } from "../src/ecrans/donnees.ts";
import { attenteCorps, INTERVALLE_SCAN_MS, planCorps } from "../src/ui/3d/verre.ts";
import { adapter, baseDeTest } from "./aide.ts";

/** L'exécuteur, avec les requêtes qu'il reçoit. */
function compte(db: Executeur) {
  const sql: string[] = [];
  const c: Executeur = {
    ...db,
    execAsync: (s) => (sql.push(s), db.execAsync(s)),
    runAsync: (s, p) => (sql.push(s), db.runAsync(s, p)),
    getFirstAsync: (s, p) => (sql.push(s), db.getFirstAsync(s, p)),
    getAllAsync: (s, p) => (sql.push(s), db.getAllAsync(s, p)),
  } as Executeur;
  return { c, sql };
}

test("réglages : une seule requête, mêmes valeurs qu'avant (défauts et choix gardés)", async () => {
  const db = adapter(new DatabaseSync(":memory:"));
  await migrer(db);
  await ecrireReglages(db, { ecranAllume: true, prenom: "Alex", parties: { train: true, food: false, health: true }, reposDefautS: 90 });
  const { c, sql } = compte(db);
  const r = await lireReglages(c, { poids: "lbs" });
  assert.equal(sql.length, 1);
  assert.equal(r.ecranAllume, true);
  assert.equal(r.prenom, "Alex");
  assert.equal(r.reposDefautS, 90);
  assert.equal(r.unite, "lbs"); // « auto » : l'unité détectée
  assert.deepEqual(r.parties, { train: true, food: false, health: true });
  assert.equal(r.rubanTempo, true);
  assert.equal(r.sonRepos, null);
});

test("migrations : base à jour et même liste, aucun témoin revérifié ; autre liste, tout est revérifié", async () => {
  const raw = new DatabaseSync(":memory:");
  const db = adapter(raw);
  await migrer(db);
  const valeur = () => (raw.prepare("SELECT valeur FROM reglages WHERE cle = ?").get(CLE_MIGRATIONS_VERIFIEES) as { valeur: string } | undefined)?.valeur;
  assert.equal(valeur(), empreinteMigrations(MIGRATIONS));
  const { c, sql } = compte(db);
  await migrer(c);
  assert.equal(sql.length, 2); // PRAGMA user_version, puis l'empreinte
  // une liste qui change (fusion d'une branche qui renumérote) : les témoins sont relus
  const autre = MIGRATIONS.map((m, i) => (i === MIGRATIONS.length - 1 ? { ...m, sql: `${m.sql}\n` } : m));
  const { c: c2, sql: sql2 } = compte(db);
  await migrer(c2, undefined, autre);
  assert.ok(sql2.some((s) => s.includes("sqlite_master")));
  assert.equal(valeur(), empreinteMigrations(autre));
});

test("doublons au lancement : fusion faite quand un perso change, rien à relire sinon", async () => {
  const { raw, db } = await baseDeTest(true);
  assert.equal(await fusionnerDoublonsSiChange(db), 0);
  assert.ok(raw.prepare("SELECT valeur FROM reglages WHERE cle = ?").get(CLE_DOUBLONS_VUS));
  // rien de changé : une requête pour l'empreinte, une pour le réglage, pas de recherche de paires
  const { c, sql } = compte(db);
  assert.equal(await fusionnerDoublonsSiChange(c), 0);
  assert.equal(sql.length, 2);
  // un perso au nom d'un exercice du catalogue (import Hevy) : fusionné au lancement suivant
  raw.prepare("INSERT INTO exercices (id, nom, nom_norm, perso, nature, cree_le, maj_le) VALUES ('perso-padel','Padel','padel',1,'duree',1,1)").run();
  assert.equal(await fusionnerDoublonsSiChange(db), 1);
  assert.equal(raw.prepare("SELECT id FROM exercices WHERE id = 'perso-padel'").get(), undefined);
  assert.equal(await fusionnerDoublonsSiChange(db), 0);
});

test("corps de Santé : la boucle dort jusqu'à la prochaine image prévue, endormie sans geste", () => {
  const actif = planCorps(0, false); // 30 i/s
  const repos = planCorps(8000, false); // 15 i/s
  const arret = planCorps(20_000, false);
  assert.ok(Math.abs(attenteCorps(actif, 10, false, Infinity)! - (1000 / 30 - 12)) < 1e-9);
  assert.ok(Math.abs(attenteCorps(repos, 10, false, Infinity)! - (1000 / 15 - 12)) < 1e-9);
  // le prochain scan arrive avant l'image suivante : on se réveille pour lui
  assert.equal(attenteCorps(repos, 0, false, 20), 20);
  // scan en cours : 30 i/s, même au repos
  assert.ok(Math.abs(attenteCorps(repos, 5, true, -100)! - (INTERVALLE_SCAN_MS - 7)) < 1e-9);
  // image déjà due : tout de suite
  assert.equal(attenteCorps(actif, 100, false, Infinity), 0);
  // plus rien après 14 s sans geste, ni en mouvement réduit : plus de minuteur, un geste réveille la boucle
  assert.equal(attenteCorps(arret, 0, false, 500), null);
  assert.equal(attenteCorps(planCorps(0, true), 0, false, 500), null);
});
