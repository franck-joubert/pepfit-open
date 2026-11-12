// Correctifs de dépendances (patches/, patch-package) : posés par le postinstall de npm ci et par build-android.sh. Un patch
// qui ne correspond plus à la version installée, ou un patch natif d'un module Expo livré précompilé (local-maven-repo) sans
// « buildFromSource », serait ignoré sans bruit : le 31/10, le premier APK du correctif d'expo-gl ne le contenait pas.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const racine = new URL("../", import.meta.url);
const lire = (chemin: string) => readFileSync(new URL(chemin, racine), "utf8");
const pkg = JSON.parse(lire("package.json")) as {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
  expo?: { autolinking?: { android?: { buildFromSource?: string[] } } };
};
const verrou = JSON.parse(lire("package-lock.json")) as { packages: Record<string, { version: string }> };
const patchs = readdirSync(new URL("patches/", racine)).filter((f) => f.endsWith(".patch"));

test("patch-package : postinstall et dépendance figée", () => {
  assert.equal(pkg.scripts.postinstall, "patch-package");
  assert.match(pkg.devDependencies["patch-package"] ?? "", /^\d+\.\d+\.\d+$/);
  assert.ok(patchs.length > 0);
});

test("chaque patch vise la version installée (package-lock)", () => {
  for (const f of patchs) {
    const m = /^(.+)\+(\d+\.\d+\.\d+)\.patch$/.exec(f);
    assert.ok(m, `nom de patch inattendu : ${f}`);
    const nom = m[1]!.replace("+", "/");
    assert.equal(verrou.packages[`node_modules/${nom}`]?.version, m[2], `${f} : ${nom} n'est plus en ${m[2]}`);
  }
});

test("un patch natif d'un module Expo précompilé force sa compilation depuis les sources", () => {
  const sources = pkg.expo?.autolinking?.android?.buildFromSource ?? [];
  for (const f of patchs) {
    const nom = /^(.+)\+\d/.exec(f)![1]!.replace("+", "/");
    const natif = lire(`patches/${f}`).includes(`/node_modules/${nom}/android/`);
    const precompile = existsSync(new URL(`node_modules/${nom}/local-maven-repo`, racine));
    if (natif && precompile) assert.ok(sources.some((r) => new RegExp(`^${r}$`).test(nom)), `${nom} : absent de expo.autolinking.android.buildFromSource`);
  }
});

test("expo-gl : le contexte ne part plus avec la surface", () => {
  const p = lire("patches/expo-gl+58.0.3.patch");
  assert.match(p, /detachSurface/);
  assert.match(p, /attachSurface/);
  assert.match(p, /OnViewDestroys/);
});
