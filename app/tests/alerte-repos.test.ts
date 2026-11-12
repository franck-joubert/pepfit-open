// Alerte de fin de repos : migration de l'ancien booléen et canal Android par combinaison.
import assert from "node:assert/strict";
import { test } from "node:test";
import { alerteSonne, alerteVibre, canalRepos, lireAlerteRepos, PREFIXE_CANAL } from "../src/ecrans/alerte-repos.ts";

test("migration de son_fin_repos", () => {
  assert.equal(lireAlerteRepos(null, "1"), "les-deux");
  assert.equal(lireAlerteRepos(null, "0"), "rien");
  assert.equal(lireAlerteRepos(null, null), "son");
  assert.equal(lireAlerteRepos("vibration", "0"), "vibration");
  assert.equal(lireAlerteRepos("son", "1"), "son");
  assert.equal(lireAlerteRepos("n'importe", "0"), "rien");
});

test("son et vibration selon le mode", () => {
  assert.deepEqual([alerteSonne("vibration"), alerteVibre("vibration")], [false, true]);
  assert.deepEqual([alerteSonne("son"), alerteVibre("son")], [true, false]);
  assert.deepEqual([alerteSonne("les-deux"), alerteVibre("les-deux")], [true, true]);
  assert.deepEqual([alerteSonne("rien"), alerteVibre("rien")], [false, false]);
});

test("canal : un par combinaison, aucun pour rien", () => {
  const a = "content://media/internal/audio/media/12";
  const b = "content://media/internal/audio/media/13";
  assert.equal(canalRepos("rien", a), null);
  assert.equal(canalRepos("vibration", a), canalRepos("vibration", b));
  assert.notEqual(canalRepos("son", a), canalRepos("son", b));
  assert.notEqual(canalRepos("son", a), canalRepos("les-deux", a));
  assert.equal(canalRepos("son", a), canalRepos("son", a));
  assert.equal(canalRepos("son", null), "fin-repos-son-defaut");
  for (const m of ["vibration", "son", "les-deux"] as const) {
    const c = canalRepos(m, a)!;
    assert.ok(c.startsWith(PREFIXE_CANAL));
    assert.notEqual(c, "fin-repos-alarme"); // l'ancien canal, à supprimer
    assert.match(c, /^[a-z0-9-]+$/);
  }
});
