// Questions fréquentes (D13 ; src/aide/fusion.ts, contenu-fr.ts, contenu-en.ts) : contenu intégré complet dans les deux
// langues, mis à jour par le serveur sans jamais casser l'aide.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { ARTICLES_EN } from "../src/aide/contenu-en.ts";
import { ARTICLES_FR } from "../src/aide/contenu-fr.ts";
import { ECRAN } from "../src/aide/ecrans.ts";
import { ajouterAuCache, CACHE_VIDE, fusionner, lireArticleServeur, lireCache } from "../src/aide/fusion.ts";
import { THEMES_AIDE } from "../src/aide/types.ts";

const APP = new URL("../src/app/", import.meta.url).pathname;

test("le contenu intégré : mêmes clés dans les deux langues, chaque thème a ses réponses, tout se lit comme du serveur", () => {
  assert.deepEqual(ARTICLES_EN.map((x) => x.cle), ARTICLES_FR.map((x) => x.cle));
  assert.equal(new Set(ARTICLES_FR.map((x) => x.cle)).size, ARTICLES_FR.length);
  for (const th of THEMES_AIDE) assert.ok(ARTICLES_FR.some((x) => x.theme === th), th);
  for (const x of [...ARTICLES_FR, ...ARTICLES_EN]) {
    assert.ok(lireArticleServeur({ ...x, publie: true, maj: "" }), x.cle);
    assert.ok(x.titre && x.etapes.length, x.cle);
    const en = ARTICLES_EN.find((y) => y.cle === x.cle)!;
    assert.equal(en.theme, x.theme, x.cle);
    assert.equal(en.ecran, x.ecran, x.cle);
  }
});

test("chaque écran qu'une réponse peut ouvrir existe", () => {
  for (const [nom, e] of Object.entries(ECRAN)) {
    const base = e.route.replace(/^\//, "");
    assert.ok(existsSync(`${APP}${base}.tsx`) || existsSync(`${APP}${base}/index.tsx`), `${nom} : ${e.route}`);
  }
});

const integres = [
  { cle: "aa", theme: "sport" as const, titre: "A", intro: "", etapes: ["1"], ordre: 2 },
  { cle: "bb", theme: "compte" as const, titre: "B", intro: "", etapes: ["1"], ordre: 1 },
];

test("le serveur remplace, ajoute ou retire une réponse ; rangées par thème puis par ordre", () => {
  const c = ajouterAuCache(
    CACHE_VIDE,
    [
      { cle: "aa", theme: "sport", titre: "A2", intro: "", etapes: ["x"], ordre: 2, publie: true, maj: "m" },
      { cle: "bb", theme: "compte", titre: "", publie: false },
      { cle: "cc", theme: "compte", titre: "C", etapes: [], ordre: 5, publie: true },
    ],
    "2026-11-03T10:00:00Z",
  );
  assert.equal(c.depuis, "2026-11-03T10:00:00Z");
  const l = fusionner(integres, c);
  assert.deepEqual(l.map((x) => `${x.cle}:${x.titre}`), ["cc:C", "aa:A2"]);
  assert.ok(!("publie" in l[0]!));
});

test("ce qui vient du serveur est lu prudemment", () => {
  assert.equal(lireArticleServeur(null), null);
  assert.equal(lireArticleServeur({ cle: "x", theme: "sport", titre: "T" }), null); // clé trop courte
  assert.equal(lireArticleServeur({ cle: "ok-cle", theme: "inconnu", titre: "T" }), null);
  assert.equal(lireArticleServeur({ cle: "ok-cle", theme: "sport", titre: "" }), null);
  // écran inconnu de cette version : la réponse reste, sans bouton
  const a = lireArticleServeur({ cle: "ok-cle", theme: "sport", titre: "T", ecran: "futur", etapes: ["1", 2, "3"] })!;
  assert.equal(a.ecran, undefined);
  assert.deepEqual(a.etapes, ["1", "3"]);
  assert.equal(lireArticleServeur({ cle: "ok-cle", theme: "sport", titre: "T", ecran: "whoop" })!.ecran, "whoop");
});

test("le cache illisible repart vide ; relu, il garde ses articles", () => {
  assert.deepEqual(lireCache(null), CACHE_VIDE);
  assert.deepEqual(lireCache("{pas du json"), CACHE_VIDE);
  const c = ajouterAuCache(CACHE_VIDE, [{ cle: "ok-cle", theme: "sport", titre: "T", publie: true }], "d");
  assert.deepEqual(lireCache(JSON.stringify(c)), c);
});
