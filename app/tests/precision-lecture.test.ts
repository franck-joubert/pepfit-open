// Précision pepfit lue d'une vraie base SQLite (Santé Connect absent sous Node) : compte neuf, profil, pesées comptées une
// fois par jour et sans l'isolée, mémoire du téléphone (cap, dernier cap vu) écrite par la façade, jamais synchronisée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ajouterMensuration, ecrireDateNaissance, ecrireSexe } from "../src/db/depots/profil.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { lireReglage } from "../src/db/depots/reglages.ts";
import { lireDonneesPrecision } from "../src/precision/lire.ts";
import { CLE_MEMOIRE, lireMemoire } from "../src/precision/memoire.ts";
import { calculer, etapeRapide } from "../src/precision/modele.ts";
import { invaliderPrecision, lirePrecision, marquerVu } from "../src/precision/service.ts";
import { TABLES_SYNC, voyage } from "../src/sync/schema.ts";
import { baseDeTest } from "./aide.ts";

const J = 86_400_000;
const M = new Date(2026, 9, 30, 12).getTime();

test("compte neuf : Esquisse, « Complète ton profil » d'abord ; rien de mesuré", async () => {
  const { db } = await baseDeTest();
  const { d } = await lireDonneesPrecision(db, {}, M);
  assert.deepEqual([d.naissance, d.sexe, d.taille, d.poidsJours, d.capteur, d.nuits14, d.pas14, d.nut30], [null, false, false, null, null, 0, 0, 0]);
  const r = calculer(d);
  assert.equal(r.cap.id, "esquisse");
  assert.equal(etapeRapide(d)?.id, "profil");
  // la dépense a la précision de son σ (energie-precision.ts) : adulte de référence, faible
  assert.ok(d.sigmaReel != null && d.sigmaReel > 0.14, String(d.sigmaReel));
});

test("profil et pesées : une par jour, l'isolée ne compte pas ; Contour", async () => {
  const { db } = await baseDeTest();
  await ecrireDateNaissance(db, { a: 1990, m: 3, j: 4 });
  await ecrireSexe(db, "f");
  await ajouterMensuration(db, "taille", 166, M - 100 * J);
  for (const [j, kg] of [[1, 61], [1.1, 61.2], [2, 61.1], [9, 61.4], [10, 75], [11, 61.3], [16, 61.5]] as const) await ajouterPesee(db, kg, M - j * J);
  const { d } = await lireDonneesPrecision(db, {}, M);
  assert.equal(d.naissance, "date");
  assert.equal(d.sexe && d.taille, true);
  assert.equal(d.poidsJours, 1);
  // semaines finissant aujourd'hui : [0-6] [7-13] [14-20] : trois semaines avec une pesée
  assert.equal(d.semainesPesees, 3);
  assert.ok(calculer(d).cap.n >= 2);
});

test("mémoire du téléphone : écrite par la façade (reglages, cette clé jamais synchronisée), un passage de cap montré une fois", async () => {
  const { db } = await baseDeTest();
  invaliderPrecision();
  const e = await lirePrecision(db, {}, M);
  const m = lireMemoire(await lireReglage(db, CLE_MEMOIRE));
  assert.ok(m);
  assert.equal(m!.cap, e.r.cap.n);
  assert.equal(m!.vu, e.r.cap.n, "premier calcul : le cap d'aujourd'hui est déjà vu");
  await marquerVu(db, e);
  assert.equal(lireMemoire(await lireReglage(db, CLE_MEMOIRE))!.affiche, e.r.score);
  // Les réglages ne voyagent qu'en partie (migration 49) : la mémoire de la précision reste sur le téléphone.
  const reglages = TABLES_SYNC.find((t) => t.nom === "reglages");
  assert.ok(!reglages || !voyage(reglages, CLE_MEMOIRE), "la précision ne part pas au serveur");
});
