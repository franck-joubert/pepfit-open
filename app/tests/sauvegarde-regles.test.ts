// Règles de la sauvegarde périodique : nom, rotation, échéance, fournisseur du dossier, écart lisible.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ecart, fournisseur, nomSauvegarde, rotation, sauvegardeDue } from "../src/sauvegarde/regles.ts";
import { jour } from "./aide.ts";

const H = 3_600_000;

test("nom du fichier : date et heure locales, triable", () => {
  assert.equal(nomSauvegarde(jour(2026, 10, 28, 9, 5)), "pepfit-2026-10-28-0905.pepfit");
  assert.equal(nomSauvegarde(jour(2026, 10, 31, 11, 15), "Alex"), "alex-2026-10-31-1115.pepfit");
  assert.equal(nomSauvegarde(jour(2026, 10, 31, 11, 15), "a/b"), "ab-2026-10-31-1115.pepfit");
});

test("rotation : la nouvelle en tête, on garde les N dernières, jamais moins d'une", () => {
  assert.deepEqual(rotation(["c", "b", "a"], "d", 3), { liste: ["d", "c", "b"], effacer: ["a"] });
  assert.deepEqual(rotation(["b", "a"], "b", 5), { liste: ["b", "a"], effacer: [] });
  assert.deepEqual(rotation(["a"], "b", 0), { liste: ["b"], effacer: ["a"] });
});

test("échéance : jamais, chaque jour, chaque semaine, avec 2 h de marge", () => {
  const t = jour(2026, 10, 28, 9);
  assert.equal(sauvegardeDue("jamais", null, t), false);
  assert.equal(sauvegardeDue("jour", null, t), true);
  assert.equal(sauvegardeDue("jour", t - 23 * H, t), true);
  assert.equal(sauvegardeDue("jour", t - 21 * H, t), false);
  assert.equal(sauvegardeDue("semaine", t - 6 * 24 * H, t), false);
  assert.equal(sauvegardeDue("semaine", t - 7 * 24 * H + H, t), true);
  // Horloge revenue en arrière : on resauvegarde plutôt que d'attendre une semaine.
  assert.equal(sauvegardeDue("semaine", t + H, t), true);
});

test("fournisseur du dossier choisi", () => {
  assert.equal(fournisseur("content://com.google.android.apps.docs.storage/tree/acc%3D1%3Bdoc%3Dabc"), "drive");
  assert.equal(fournisseur("content://com.dropbox.product.android.dbapp.document_provider.documents/tree/x"), "dropbox");
  assert.equal(fournisseur("content://com.android.externalstorage.documents/tree/primary%3AFonte"), "telephone");
  assert.equal(fournisseur("content://com.inconnu/tree/x"), null);
});

test("écart lisible", () => {
  const t = jour(2026, 10, 28, 12);
  assert.deepEqual(ecart(t - 30_000, t), { n: 0, unite: "min" });
  assert.deepEqual(ecart(t - 2 * H - 60_000, t), { n: 2, unite: "h" });
  assert.deepEqual(ecart(t - 50 * H, t), { n: 2, unite: "j" });
});
