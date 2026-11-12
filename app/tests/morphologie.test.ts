// Morphologie du personnage de Santé : ce qui existe ou rien, défaut homme 1,80 m IMC 22, curseurs, cases sans donnée absentes, cadence.
import assert from "node:assert/strict";
import { test } from "node:test";
import { corpsAffiche, CURSEURS, imcDe, morphologieDe } from "../src/ecrans/morphologie-calc.ts";
import { CASE, casesSante, dispositionMoi, dureeSommeil, HAUT_DES_BRAS, resumeSante, SOUS_LES_BRAS } from "../src/ecrans/sante-vue.ts";
import { planCorps, rotationCorps, yCorps } from "../src/ui/3d/verre.ts";

test("morphologieDe : rien de connu → null ; sinon seulement ce qui existe", () => {
  assert.equal(morphologieDe(null, null), null);
  assert.deepEqual(morphologieDe("femme", 62.5), { sexe: "f", tailleCm: null, poidsKg: 62.5 });
  assert.deepEqual(morphologieDe(null, 80), { sexe: null, tailleCm: null, poidsKg: 80 });
  assert.deepEqual(morphologieDe("homme", null), { sexe: "h", tailleCm: null, poidsKg: null });
  assert.equal(morphologieDe(null, -3), null, "poids illisible ignoré");
  assert.equal(morphologieDe(null, null, 20), null, "taille illisible ignorée");
});

test("sans donnée, le corps affiché est l'homme de 1,80 m, IMC 22, aux épaules naturelles", () => {
  const c = corpsAffiche(null);
  assert.equal(c.sexe, "h");
  assert.equal(c.tailleCm, 180);
  assert.equal(c.imc, 22);
  assert.equal(c.curseurs.length, CURSEURS.length);
  assert.ok(Math.abs(c.curseurs[CURSEURS.indexOf("adiposite")]!) < 0.1);
  assert.ok(c.curseurs.every((v, i) => i === CURSEURS.indexOf("adiposite") || v === 0));
  assert.equal(c.epaules, true);
  assert.equal(c.echelle(1.8), 1);
});

test("calcul B : l'IMC seul règle l'adiposité (bornée), l'homme n'a ni bonnet ni tenue", () => {
  const adip = CURSEURS.indexOf("adiposite");
  const f = corpsAffiche({ sexe: "f", tailleCm: 165, poidsKg: 76 });
  assert.equal(imcDe(76, 165), 27.9);
  assert.ok(f.curseurs[adip]! > 0.6 && f.curseurs[adip]! < 0.8, String(f.curseurs[adip]));
  const h = corpsAffiche({ sexe: "h", tailleCm: 180, poidsKg: 150 });
  assert.equal(h.curseurs[adip], 1);
  assert.equal(h.curseurs[CURSEURS.indexOf("bonnet")], 0);
  assert.equal(h.curseurs[CURSEURS.indexOf("tenue")], 0);
  const maigre = corpsAffiche({ sexe: "h", tailleCm: 180, poidsKg: 40 });
  assert.equal(maigre.curseurs[adip], -1);
  // les tours saisis règlent leur curseur : un tour de bras plus gros grossit le bras
  const bras = (cm: number) => corpsAffiche({ sexe: "h", tailleCm: 180, poidsKg: 76, tours: { bras: cm } }).curseurs[CURSEURS.indexOf("bras")]!;
  assert.ok(bras(36) > bras(31));
  assert.equal(imcDe(null, 180), null);
  assert.equal(imcDe(70, null), null);
});

test("cases : absentes sans donnée, présentes sinon ; ni Taille ni IMC (dans le résumé), VFC à la place", () => {
  assert.deepEqual(casesSante(null, null, "kg"), []);
  const seul = casesSante({ sexe: null, tailleCm: null, poidsKg: 72.4 }, null, "kg");
  assert.deepEqual(seul.map((c) => c.id), ["poids"]);
  assert.equal(resumeSante(null), "");
  const plein = casesSante({ sexe: "h", tailleCm: 180, poidsKg: 72 }, { sommeilMin: 432, fcRepos: 58, pas: 8420, vfc: 47.6, gras: 14.24 }, "kg");
  assert.deepEqual(plein.map((c) => c.id).sort(), ["fc", "gras", "poids", "sommeil", "vfc"]);
  // Social v4 (planche Moi) : plus de case Pas sur le corps, la rangée Récupération · Pas · Effort sous le semainier l'ouvre
  assert.ok(!plein.some((c) => c.id === "pas"));
  assert.equal(dureeSommeil(432), "7 h 12");
  assert.equal(dureeSommeil(425), "7 h 05");
  assert.equal(plein.find((c) => c.id === "vfc")!.valeur, "48");
  assert.equal(plein.find((c) => c.id === "vfc")!.unite, "ms");
  assert.equal(plein.find((c) => c.id === "gras")!.valeur, "14,2");
  assert.equal(plein.find((c) => c.id === "sommeil")!.valeur, "7 h 12");
  assert.equal(plein.find((c) => c.id === "sommeil")!.largeur, 150);
  // chaque case ouvre sa page de mesure (planche pas, 28/10)
  assert.deepEqual(plein.filter((c) => !c.ouvre).map((c) => c.id), []);
  // D10 : poids et masse grasse empilés dans une case double, à gauche (hanches) ; le poids à une décimale (D2 de la revue finale)
  const p = plein.find((c) => c.id === "poids")!, g = plein.find((c) => c.id === "gras")!;
  assert.deepEqual([p.double, g.double, p.cote, g.cote, g.y - p.y, p.hauteur], ["haut", "bas", "g", "g", CASE.demi, CASE.demi]);
  assert.equal(p.valeur, "72,0");
  // sans masse grasse, la case Poids reste simple
  assert.equal(seul[0]!.double, undefined);
  // D14 : avec la performance, « 43 % » et la durée « 4 h 37 » à côté du libellé (« Sommeil 4 h 37 », planche Moi v4)
  const perf = casesSante(null, { sommeilMin: 277, performance: 43, fcRepos: null, pas: null }, "kg")[0]!;
  assert.equal(perf.valeur, "43 %");
  assert.equal(perf.suite, null);
  assert.equal(perf.aCote, "4 h 37");
  assert.equal(plein.find((c) => c.id === "sommeil")!.aCote, undefined, "sans performance, la durée est la valeur");
  // le sexe n'est plus dit dans le résumé (le personnage le montre) : taille et IMC seulement
  assert.match(resumeSante({ sexe: "h", tailleCm: 180, poidsKg: 72 }), /^1,80 m, IMC 22,2$/);
  assert.equal(resumeSante({ sexe: null, tailleCm: null, poidsKg: 72 }), "");
});

test("placement : Sommeil et l'Âge en haut, de part et d'autre de la tête ; dessous, deux blocs miroirs sous les bras", () => {
  for (const taille of [165, 175, 182]) {
    const d = dispositionMoi(taille);
    const { sommeil, age, poids, gras, vfc, fc } = d.seules;
    assert.equal(sommeil.y, 10);
    assert.deepEqual([age.y, age.hauteur, age.largeur, age.cote], [sommeil.y, sommeil.hauteur, sommeil.largeur, "d"]);
    // le personnage est remonté jusqu'à ce que le haut de ses bras tienne sous les cartes du haut (8 dp d'air), sans les toucher
    const hautBras = yCorps(HAUT_DES_BRAS, taille) - d.decalage;
    assert.ok(hautBras >= sommeil.y + sommeil.hauteur + 7.5 && hautBras <= sommeil.y + sommeil.hauteur + 8.5, `${taille} cm : bras à ${hautBras.toFixed(1)}`);
    // la tête est entre les deux cartes, à leur hauteur
    assert.ok(yCorps(0.99, taille) - d.decalage >= sommeil.y, `${taille} cm : tête au niveau des cartes du haut`);
    for (const k of [poids, gras, vfc, fc]) {
      assert.ok(k.y > yCorps(SOUS_LES_BRAS, taille) - d.decalage, `${taille} cm : ${k.cote} sous les bras`);
      assert.equal(k.y, poids.y, "un seul niveau, haut contre haut");
    }
    assert.deepEqual([poids.cote, gras.cote, vfc.cote, fc.cote], ["g", "g", "d", "d"]);
    // blocs miroirs : même niveau, même hauteur, même largeur, collés
    const { gauche, droite } = d.blocs;
    assert.deepEqual([gauche.haut.y, gauche.haut.hauteur, gauche.haut.largeur], [droite.haut.y, droite.haut.hauteur, droite.haut.largeur]);
    for (const b of [gauche, droite]) assert.equal(b.bas.y, b.haut.y + b.haut.hauteur, "moitiés collées");
    assert.deepEqual([gauche.haut.cote, droite.haut.cote, gauche.haut.double, gauche.bas.double], ["g", "d", "haut", "bas"]);
    // pas de vide sous les pieds : la zone s'arrête à 4 dp d'eux, rien ne la dépasse
    assert.equal(d.hauteur, Math.ceil(yCorps(0, taille)) + 4 - d.decalage);
    assert.ok(droite.bas.y + droite.bas.hauteur <= d.hauteur, `${taille} cm : bloc dans la zone`);
  }
  // le personnage a toujours sa taille : plus petit, ses épaules sont plus bas et il est remonté d'autant
  assert.ok(dispositionMoi(165).decalage > dispositionMoi(182).decalage);
  assert.ok(dispositionMoi(165).hauteur < dispositionMoi(182).hauteur, "la zone s'arrête sous les pieds, qui remontent avec le reste");
  // police agrandie : cartes plus hautes (jusqu'à 1,3), le personnage descend juste ce qu'il faut pour rester sous elles
  const normal = dispositionMoi(175), grande = dispositionMoi(175, 412, 1.3), au_dela = dispositionMoi(175, 412, 2);
  assert.ok(grande.seules.sommeil.hauteur > normal.seules.sommeil.hauteur && grande.decalage < normal.decalage);
  assert.deepEqual([au_dela.seules.sommeil.hauteur, au_dela.decalage], [grande.seules.sommeil.hauteur, grande.decalage], "plafonnée comme Texte");
  assert.equal(grande.blocs.gauche.haut.hauteur, Math.ceil(CASE.demi * 1.3));
  // écran étroit : les cartes se resserrent, jamais sur la tête (22 dp de part et d'autre de l'axe)
  for (const w of [320, 360, 390, 412, 430]) {
    const x = dispositionMoi(175, w);
    assert.ok(CASE.marge + x.seules.sommeil.largeur <= w / 2 - 22 - 6, `${w} : Sommeil touche la tête`);
    assert.ok(CASE.marge + x.blocs.gauche.haut.largeur <= w / 2 - 46 + 6, `${w} : bloc sur le corps`);
  }
  assert.deepEqual([dispositionMoi(175, 412).seules.sommeil.largeur, dispositionMoi(175, 412).blocs.gauche.haut.largeur], [150, 112], "412 : comme avant");
});

test("placement des blocs : une case seule garde sa place et sa hauteur, un bloc n'existe qu'à deux", () => {
  const m = { sexe: "h" as const, tailleCm: 180, poidsKg: 72 };
  const place = (cases: ReturnType<typeof casesSante>, id: string) => cases.find((c) => c.id === id)!;
  // les quatre : poids · masse grasse à gauche, VFC · FC repos à droite, au même niveau
  const plein = casesSante(m, { sommeilMin: 432, fcRepos: 58, pas: 8420, vfc: 47.6, gras: 14.2 }, "kg");
  assert.deepEqual(["poids", "gras", "vfc", "fc"].map((id) => place(plein, id).y), [place(plein, "poids").y, place(plein, "poids").y + CASE.demi, place(plein, "poids").y, place(plein, "poids").y + CASE.demi]);
  assert.deepEqual(["vfc", "fc"].map((id) => place(plein, id).double), ["haut", "bas"]);
  // pas de masse grasse : Poids seul à gauche, VFC · FC repos restent un bloc à droite
  const sansGras = casesSante(m, { sommeilMin: null, fcRepos: 58, pas: null, vfc: 47.6 }, "kg");
  assert.deepEqual([place(sansGras, "poids").double, place(sansGras, "poids").hauteur, place(sansGras, "vfc").double], [undefined, CASE.hauteur, "haut"]);
  assert.equal(place(sansGras, "poids").y, place(sansGras, "vfc").y);
  // pas de VFC : FC repos seule à droite, à la même hauteur que Poids · Masse grasse
  const sansVfc = casesSante(m, { sommeilMin: null, fcRepos: 58, pas: null, gras: 14.2 }, "kg");
  assert.deepEqual([place(sansVfc, "fc").double, place(sansVfc, "fc").hauteur, place(sansVfc, "fc").cote, place(sansVfc, "poids").double], [undefined, CASE.hauteur, "d", "haut"]);
  assert.equal(place(sansVfc, "fc").y, place(sansVfc, "poids").y);
  // masse grasse sans poids (pesée absente) : seule à gauche
  const grasSeul = casesSante({ sexe: "h", tailleCm: 180, poidsKg: null }, { sommeilMin: null, fcRepos: null, pas: null, gras: 14.2 }, "kg");
  // (la lecture est faite sans nuit : la vignette « Pas de donnée » du Sommeil reste, elle ouvre la page)
  assert.deepEqual(grasSeul.filter((c) => c.id !== "sommeil").map((c) => [c.id, c.cote, c.double]), [["gras", "g", undefined]]);
  assert.equal(grasSeul.find((c) => c.id === "sommeil")?.vide, true);
  // sans sommeil ni âge : les cartes du bas ne bougent pas (positions calculées, pas de rang)
  assert.equal(place(sansGras, "vfc").y, place(plein, "vfc").y);
});

test("cadence du corps : 30 i/s, 15 i/s, arrêt ; mouvement réduit fixe", () => {
  assert.equal(planCorps(0, false).intervalleMs, 1000 / 30);
  assert.equal(planCorps(6000, false).intervalleMs, 1000 / 15);
  assert.equal(planCorps(14000, false).intervalleMs, null);
  assert.equal(planCorps(0, true).intervalleMs, null);
  assert.equal(rotationCorps(5, 1, true), rotationCorps(50, 1, true));
  assert.ok(Math.abs(rotationCorps(1, 1, false) + 0.1) <= 0.24 + 1e-9);
});

test("ancrage : la tête est plus haut que les pieds à l'écran", () => {
  assert.ok(yCorps(0.93, 180) < yCorps(0.03, 180));
  assert.ok(yCorps(0.93, 165) > yCorps(0.93, 190));
});
