// Scan d'un produit perso déjà dans le compte (Picard 3270160101221, 09/11) : le scanner cherche d'abord dans la copie locale
// (trouverParCode, puis Open Food Facts). Un code gardé sous une autre forme (UPC-A à 12 chiffres,
// zéros de tête, espaces) ne se retrouvait pas : la recherche locale compare maintenant les formes équivalentes d'un même code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { enregistrerProduit, produitParCode, trouverParCode } from "../src/db/depots/nutrition.ts";
import { codeCanonique, variantesCode } from "../src/nutrition/codes.ts";
import { baseDeTest } from "./aide.ts";

const PICARD = "3270160101221";
const nut = { energie_kcal: 132, proteines: 8.1, glucides: 14, lipides: 4.6 };

test("variantes d'un code : EAN-13, UPC-A, GTIN-14, espaces et tirets", () => {
  assert.deepEqual(variantesCode(PICARD), [PICARD, `0${PICARD}`]);
  assert.deepEqual(variantesCode("0 12345 67890 5").slice(0, 1), ["012345678905"]);
  assert.ok(variantesCode("012345678905").includes("0012345678905"));
  assert.ok(variantesCode("0012345678905").includes("012345678905"));
  assert.deepEqual(variantesCode("abc"), []);
  assert.equal(codeCanonique("012345678905"), "0012345678905");
  assert.equal(codeCanonique("03270160101221"), PICARD);
  assert.equal(codeCanonique("3 270160 101221"), PICARD);
});

test("le produit perso retrouvé quel que soit le format du code gardé ou lu", async () => {
  for (const garde of [PICARD, `0${PICARD}`, "3 270160 101221", "3270160-101221"]) {
    const { db } = await baseDeTest();
    const p = await enregistrerProduit(db, { code_barres: garde, nom: "Crevettes sauce paprika, fusilli", marque: "Picard", nutriments: nut, source: "perso" });
    const lu = await produitParCode(db, PICARD);
    assert.equal(lu?.id, p.id, `gardé « ${garde} », lu ${PICARD}`);
    const parScan = await trouverParCode(db, PICARD, async () => assert.fail("off interrogé"));
    assert.equal(parScan?.id, p.id);
  }
});

test("un code lu à 14 chiffres retrouve le produit gardé à 13, et deux saisies du même code ne font qu'une fiche", async () => {
  const { db } = await baseDeTest();
  const a = await enregistrerProduit(db, { code_barres: PICARD, nom: "Picard", nutriments: nut, source: "perso" });
  assert.equal((await produitParCode(db, `0${PICARD}`))?.id, a.id);
  const b = await enregistrerProduit(db, { code_barres: `0${PICARD}`, nom: "Picard bis", nutriments: nut, source: "perso" });
  assert.equal(b.id, a.id, "même produit : mis à jour, pas dupliqué");
});

test("un autre produit ne ressemble pas au code cherché", async () => {
  const { db } = await baseDeTest();
  await enregistrerProduit(db, { code_barres: "3270160101238", nom: "Autre", nutriments: nut, source: "perso" });
  assert.equal(await produitParCode(db, PICARD), null);
});

test("un code trop court pour être un EAN se compare tel quel (l'index unique ne tolère pas deux fiches)", async () => {
  const { db } = await baseDeTest();
  const a = await enregistrerProduit(db, { code_barres: "111", nom: "Fiche à code court", nutriments: { energie_kcal: 100 }, source: "perso" });
  const b = await enregistrerProduit(db, { code_barres: "111", nom: "Fiche à code court revue", nutriments: { energie_kcal: 100 }, source: "perso" });
  assert.equal(b.id, a.id);
  assert.equal((await produitParCode(db, "111"))?.id, a.id);
  assert.equal(await produitParCode(db, "  "), null);
});
