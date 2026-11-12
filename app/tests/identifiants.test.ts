// Identifiants développeur de chaque API (src/identifiants/modele.ts) : complets ou rien, URL de retour https:// ou pepfitopen://,
// ce qui est gardé passe avant le préremplissage de la construction.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aProposer, lireIdentifiants, REDIRECTION_APPLI, redirectionValide } from "../src/identifiants/modele.ts";

test("complets ou rien ; espaces retirés", () => {
  assert.deepEqual(lireIdentifiants({ clientId: " a ", clientSecret: "b", redirection: "pepfitopen://whoop" }), { clientId: "a", clientSecret: "b", redirection: "pepfitopen://whoop" });
  assert.equal(lireIdentifiants({ clientId: "a", clientSecret: "", redirection: "pepfitopen://whoop" }), null);
  assert.equal(lireIdentifiants({ clientId: "a", clientSecret: "b", redirection: "" }), null);
  assert.equal(lireIdentifiants(null), null);
  assert.equal(lireIdentifiants("texte"), null);
});

test("URL de retour : https:// ou le schéma de l'appli, rien d'autre", () => {
  for (const u of ["https://exemple.org/withings.html", "https://moi.github.io/relais/retour.html", "pepfitopen://whoop", "pepfitopen://polar/"]) assert.ok(redirectionValide(u), u);
  for (const u of ["http://exemple.org/r", "https://", "autre://whoop", "pepfitopen://", "exemple.org", "https://exemple.org/ a"]) assert.ok(!redirectionValide(u), u);
});

test("à proposer : le gardé, sinon la construction, sinon le retour direct dans l'appli (Withings : vide, il lui faut HTTPS)", () => {
  const garde = { clientId: "g", clientSecret: "s", redirection: "pepfitopen://whoop" };
  assert.deepEqual(aProposer("whoop", garde, { clientId: "env" }), garde);
  assert.deepEqual(aProposer("whoop", null, { clientId: "env", clientSecret: "sec" }), { clientId: "env", clientSecret: "sec", redirection: "pepfitopen://whoop" });
  assert.deepEqual(aProposer("withings", null, {}), { clientId: "", clientSecret: "", redirection: "" });
  assert.equal(REDIRECTION_APPLI.polar, "pepfitopen://polar");
});
