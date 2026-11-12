// Arrivée sur Santé (30/10) : quand l'entrée se joue, dans quel ordre, en combien de temps ; silhouette de chargement.
import assert from "node:assert/strict";
import { test } from "node:test";
import { decisionEntree, FIN_ENTREE, rangs, signatureCases } from "../src/ecrans/sante-entree-calc.ts";
import { santeEntree as E } from "../src/theme/mouvement.ts";
import { ligneArrivee } from "../src/ui/3d/arrivee.ts";
import { SILHOUETTE } from "../src/ui/3d/silhouette.ts";

test("entrée de Santé : moins de 400 ms, traits avant leurs vignettes", () => {
  assert.ok(FIN_ENTREE < 400, `${FIN_ENTREE} ms`);
  assert.ok(E.corps < 400 && E.debutTraits + 6 * E.ecart + E.trait <= FIN_ENTREE);
  // chaque vignette part pendant que son trait se trace, jamais avant lui
  for (let r = 0; r <= 6; r++) assert.ok(E.debutCases + r * E.ecart > E.debutTraits + r * E.ecart);
  assert.ok(E.ecart >= 15 && E.ecart <= 80, "décalage perceptible, pas une file d'attente");
});

test("entrée de Santé : jouée au premier affichage, puis seulement quand les valeurs changent", () => {
  const e = { pret: false, charge: false, attendu: false, signature: "s0" };
  // premier affichage : rien tant que le corps ou les données manquent
  assert.deepEqual(decisionEntree(null, e), { jouer: false, montre: null });
  assert.deepEqual(decisionEntree(null, { ...e, pret: true }), { jouer: false, montre: null });
  assert.deepEqual(decisionEntree(null, { ...e, charge: true }), { jouer: false, montre: null });
  const premier = decisionEntree(null, { ...e, pret: true, charge: true, signature: "s1" });
  assert.deepEqual(premier, { jouer: true, montre: "s1" });
  // retour d'onglet, mêmes valeurs : rien
  assert.deepEqual(decisionEntree("s1", { pret: true, charge: true, attendu: true, signature: "s1" }), { jouer: false, montre: "s1" });
  // les valeurs changent (jour choisi, nouvelle mesure) : rejouée
  assert.deepEqual(decisionEntree("s1", { pret: true, charge: true, attendu: true, signature: "s2" }), { jouer: true, montre: "s2" });
  // données en cours de relecture : on attend
  assert.deepEqual(decisionEntree("s1", { pret: true, charge: false, attendu: true, signature: "s3" }), { jouer: false, montre: "s1" });
});

test("entrée de Santé : corps ou données trop lents, les vignettes se posent quand même, une seule fois", () => {
  // l'attente écoulée, l'entrée est déjà partie sur le fil UI : rien à relancer, on retient ce qui est montré
  const lent = decisionEntree(null, { pret: false, charge: false, attendu: true, signature: "vide" });
  assert.deepEqual(lent, { jouer: false, montre: "…" });
  // fil JS pris par la première image du corps : corps et données arrivent après l'attente, pas de seconde entrée
  assert.deepEqual(decisionEntree(null, { pret: true, charge: true, attendu: true, signature: "s1" }), { jouer: false, montre: "s1" });
  // les vraies valeurs arrivent ensuite : posées en place, sans seconde entrée
  const arrivee = decisionEntree(lent.montre, { pret: true, charge: true, attendu: true, signature: "s1" });
  assert.deepEqual(arrivee, { jouer: false, montre: "s1" });
  // puis un vrai changement rejoue
  assert.equal(decisionEntree(arrivee.montre, { pret: true, charge: true, attendu: true, signature: "s2" }).jouer, true);
});

test("entrée de Santé : vignettes de haut en bas, gauche avant droite, signature des valeurs", () => {
  const r = rangs([
    { id: "fc", y: 300, cote: "d" },
    { id: "sommeil", y: 0, cote: "g" },
    { id: "age", y: 0, cote: "d" },
    { id: "poids", y: 320, cote: "g" },
  ]);
  assert.deepEqual(r, { sommeil: 0, age: 1, fc: 2, poids: 3 });
  const a = signatureCases([{ id: "poids", valeur: "78,0" }]);
  assert.notEqual(a, signatureCases([{ id: "poids", valeur: "78,4" }]));
  assert.equal(a, signatureCases([{ id: "poids", valeur: "78,0" }]));
});

test("silhouette de chargement : homme et femme, pieds à 0, tête à 1, bras ouverts", () => {
  for (const d of [SILHOUETTE.homme, SILHOUETTE.femme]) {
    const pts = d.slice(1, -1).split("L").map((p) => p.split(" ").map(Number));
    assert.ok(pts.length > 60 && pts.length < 400, `${pts.length} points`);
    const ys = pts.map((p) => p[1]!), xs = pts.map((p) => p[0]!);
    assert.ok(Math.min(...ys) < 0.01 && Math.max(...ys) > 0.99, `y ${Math.min(...ys)} à ${Math.max(...ys)}`);
    // envergure (bras à l'horizontale) proche de la taille, de part et d'autre de l'axe
    assert.ok(Math.max(...xs) - Math.min(...xs) > 0.85 && Math.min(...xs) < -0.4 && Math.max(...xs) > 0.4);
  }
});

test("mesure de l'arrivée : une ligne lisible dans logcat", () => {
  const l = ligneArrivee({ numero: 1, reperes: { monte: 120.4, image1: 840.6 }, durees: { parse: 310.2 }, jsMax: 402.7, longs: 3, cumulLongs: 690 });
  assert.equal(l, "[arrivee] n=1 monte=120 image1=841 | parse=310 | js_max=403 js_longs=3/690ms");
});
