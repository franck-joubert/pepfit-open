// Recherche de l'aide (planche aide-retours e6, D13 ; src/aide/recherche.ts) : mots sans accents, début de mot, tri.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chercherArticles, chercherParMots, morceaux, motsDe } from "../src/aide/recherche.ts";
import type { ArticleAide } from "../src/aide/types.ts";

const a = (cle: string, titre: string, intro = "", etapes: string[] = [], mots?: string): ArticleAide => ({ cle, theme: "appareils", titre, intro, etapes, mots, ordre: 0 });
const ARTICLES = [
  a("deux-nombres-pas", "Pourquoi deux nombres de pas ?", "Withings d'abord, puis le téléphone."),
  a("pas-telephone", "Mes pas du téléphone ne remontent plus", "Le capteur est coupé."),
  a("depasser", "Dépasser son objectif", "Rien à voir."),
  a("cache", "Une réponse", "", [], "synchronisation montre"),
];

test("les mots : sans accents ni majuscules, une lettre seule ne compte pas, sans doublon", () => {
  assert.deepEqual(motsDe("  Pas  WHOOP, à pas "), ["pas", "whoop"]);
  assert.deepEqual(motsDe("Récupération"), ["recuperation"]);
  assert.deepEqual(motsDe(""), []);
});

test("tous les mots au début d'un mot ; le titre qui en a le plus passe devant", () => {
  assert.deepEqual(chercherArticles("pas telephone", ARTICLES).map((x) => x.cle), ["pas-telephone", "deux-nombres-pas"]);
  // « pas » ne trouve pas « dépasser » (milieu de mot)
  assert.ok(!chercherArticles("pas", ARTICLES).some((x) => x.cle === "depasser"));
  assert.deepEqual(chercherArticles("DEPASS", ARTICLES).map((x) => x.cle), ["depasser"]);
  assert.deepEqual(chercherArticles("synchro", ARTICLES).map((x) => x.cle), ["cache"]);
  assert.deepEqual(chercherArticles("pas balance", ARTICLES), []);
  assert.deepEqual(chercherArticles(" ", ARTICLES), []);
});

test("les réglages, mot par mot : ceux qui répondent au plus de mots", () => {
  const index: Record<string, { id: string }[]> = { whoop: [{ id: "whoop" }, { id: "connexions" }], pas: [{ id: "whoop" }, { id: "repos" }] };
  assert.deepEqual(chercherParMots("whoop pas", (m) => index[m] ?? []).map((e) => e.id), ["whoop"]);
  assert.deepEqual(chercherParMots("whoop", (m) => index[m] ?? [], 1).map((e) => e.id), ["whoop"]);
  assert.deepEqual(chercherParMots("rien", () => []), []);
});

test("le texte surligné : seul le début qui correspond est en gras, le texte reste tel quel", () => {
  const m = morceaux("Mes pas Whoop, dépassés", "pas whoop");
  assert.equal(m.map((x) => x.t).join(""), "Mes pas Whoop, dépassés");
  assert.deepEqual(m.filter((x) => x.fort).map((x) => x.t), ["pas", "Whoop"]);
  assert.deepEqual(morceaux("Récupération", "recup").filter((x) => x.fort).map((x) => x.t), ["Récup"]);
});
