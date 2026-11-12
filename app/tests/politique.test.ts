import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { urlPolitique } from "../src/politique.ts";

test("sans site configuré (EXPO_PUBLIC_PEPFIT_SITE_URL), aucune politique en ligne n'est proposée", () => {
  assert.equal(urlPolitique("fr"), "");
  assert.equal(urlPolitique("en"), "");
});

test("Santé Connect montre la politique dans l'appli, sans adresse en dur", () => {
  const kt = readFileSync(new URL("../modules/pepfit-sante/android/src/main/java/fit/pep/sante/Justification.kt", import.meta.url), "utf8");
  assert.doesNotMatch(kt, /https?:\/\//);
});
