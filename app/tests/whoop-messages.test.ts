// Connexion Whoop ratée (29/10) : un refus de l'utilisateur dans Whoop (access_denied), des identifiants à revoir (client refusé,
// URL de retour différente) et une panne (5xx, réseau, retour illisible) ne disent pas la même chose ; la panne propose Réessayer.
import assert from "node:assert/strict";
import { test } from "node:test";
import { echangerCode } from "../src/oauth/client.ts";
import { codeRetour, messageConnexion } from "../src/whoop/messages.ts";
import { ErreurWhoop } from "../src/whoop/types.ts";
import { fr } from "../src/i18n/fr.ts";
import { en } from "../src/i18n/en.ts";

const panne = { cle: "whoop.connexion.indisponible", reessayer: true };
const identifiants = { cle: "connexion.verifierIdentifiants", reessayer: false };
const ids = { clientId: "id", clientSecret: "secret", redirection: "pepfitopen://whoop" };

test("retour du navigateur : access_denied est un refus de l'utilisateur, un client refusé des identifiants à revoir", () => {
  assert.equal(codeRetour("access_denied"), "acces-refuse");
  for (const e of ["invalid_request", "invalid_client", "unauthorized_client", "invalid_scope"]) assert.equal(codeRetour(e), "refuse", e);
  for (const e of ["echange", "server_error", "temporarily_unavailable"]) assert.equal(codeRetour(e), "serveur", e);
  assert.deepEqual(messageConnexion(new ErreurWhoop(codeRetour("access_denied"))), { cle: "whoop.connexion.refusee", reessayer: false });
  assert.deepEqual(messageConnexion(new ErreurWhoop(codeRetour("invalid_client"))), identifiants);
  assert.deepEqual(messageConnexion(new ErreurWhoop(codeRetour("echange"))), panne);
});

test("échange du code : 4xx = identifiants à revoir ; 5xx et réseau = panne, avec Réessayer", async () => {
  const echange = (status: number | "jette") =>
    echangerCode("whoop", ids, "code", async () => {
      if (status === "jette") throw new Error("hors ligne");
      return { status, json: async () => ({}) };
    });
  for (const s of [400, 401, 403]) assert.deepEqual(messageConnexion(await echange(s).catch((x: unknown) => x)), identifiants, `statut ${s}`);
  for (const s of [500, 502, 503, "jette"] as const) {
    const e = await echange(s).catch((x: unknown) => x);
    assert.ok(e instanceof ErreurWhoop, String(s));
    assert.deepEqual(messageConnexion(e), panne, `statut ${s}`);
  }
  assert.deepEqual(messageConnexion(new ErreurWhoop("non-connecte", "identifiants")), identifiants);
  assert.deepEqual(messageConnexion(new ErreurWhoop("serveur", "state")), panne);
  assert.deepEqual(messageConnexion(new Error("inattendue")), panne);
  assert.deepEqual(messageConnexion(new ErreurWhoop("limite")), { cle: "whoop.erreur.limite", reessayer: true });
});

test("textes fr et en", () => {
  assert.equal(fr["whoop.connexion.refusee"], "Tu as refusé l’accès dans Whoop.");
  assert.match(fr["whoop.connexion.indisponible"], /réessaie dans un moment/);
  assert.doesNotMatch(fr["whoop.connexion.indisponible"], /refus/);
  assert.match(en["whoop.connexion.indisponible"], /try again/);
  assert.match(fr["connexion.verifierIdentifiants"], /identifiants API/);
  assert.ok(en["whoop.reessayer"] && fr["whoop.reessayer"]);
});
