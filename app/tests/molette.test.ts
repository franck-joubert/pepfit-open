// Molette du parcours (retour du 30/10 : « le scroll mois / jour / année bug un peu, je peux pas le lancer
// librement, il s'arrête ») : un lancer n'est plus coupé par les rendus en retard du parent, le jour s'arrête au mois.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { EchosMolette, fenetreMolette, indiceMolette, margeBas } from "../src/ui/molette-calc.ts";

/**
 * Un lancer de `crans` crans, un événement de défilement par cran. Le parent rend toutes les `cadence` valeurs (les envois
 * entre deux rendus sont regroupés) et son effet passe `retard` événements plus tard : la molette a déjà avancé. Rend les
 * indices où la règle `glisse` aurait relancé un scrollTo (qui coupe l'élan natif).
 */
function lancer(glisse: (indice: number, courant: number, auRepos: boolean) => boolean, crans: number, cadence: number, retard: number): number[] {
  const effets: { quand: number; indice: number }[] = [];
  const coupes: number[] = [];
  let courant = 0;
  for (let t = 1; t <= crans + retard; t++) {
    if (t <= crans) {
      courant = t;
      if (t % cadence === 0 || t === crans) effets.push({ quand: t + retard, indice: t });
    }
    for (const e of effets.filter((x) => x.quand === t)) if (glisse(e.indice, courant, t > crans)) coupes.push(e.indice);
  }
  return coupes;
}

test("cause du blocage : l'ancienne règle (« indice ≠ position → scrollTo ») coupe le lancer dès qu'un rendu est en retard", () => {
  const ancienne = (indice: number, courant: number) => indice !== courant;
  assert.ok(lancer(ancienne, 40, 3, 1).length > 5, "un rendu en retard d'un seul événement suffit");
  assert.deepEqual(lancer(ancienne, 40, 3, 0), [], "sans retard, rien");
});

test("un lancer : les rendus en retard du parent sont des échos, la molette ne glisse jamais", () => {
  for (const [cadence, retard] of [[1, 1], [3, 1], [3, 4], [7, 2], [1, 10]] as const) {
    const echos = new EchosMolette();
    const glisse = (indice: number, courant: number, auRepos: boolean) => echos.recu(indice, courant, auRepos);
    const envoyer = (crans: number) => Array.from({ length: crans }, (_, i) => echos.envoi(i + 1));
    envoyer(60);
    assert.deepEqual(lancer(glisse, 60, cadence, retard), [], `cadence ${cadence}, retard ${retard}`);
  }
});

test("aller-retour pendant le geste : les échos arrivent dans l'ordre, aucun ne fait glisser", () => {
  const e = new EchosMolette();
  for (const i of [5, 6, 7, 6]) e.envoi(i);
  assert.equal(e.recu(5, 6, false), false);
  assert.equal(e.recu(6, 6, false), false);
  assert.equal(e.recu(7, 6, false), false, "le 7 en retard reste un écho");
  assert.equal(e.recu(6, 6, true), false);
});

test("vrai changement extérieur au repos (jour ramené au 30 quand le mois change) : la molette y glisse", () => {
  const e = new EchosMolette();
  assert.equal(e.recu(29, 30, true), true);
  // pendant un geste, la main garde la molette : rien ne la reprend
  assert.equal(e.recu(29, 30, false), false);
});

test("rendus regroupés : la fin du geste oublie les envois sautés, un vrai changement vers l'un d'eux fait glisser", () => {
  const e = new EchosMolette();
  for (const i of [5, 6, 7, 6]) e.envoi(i);
  // le parent n'a rendu que la dernière valeur, pendant l'élan : les envois 7 et 6 d'avant restent en attente…
  assert.equal(e.recu(6, 6, false), false);
  e.repos(6, 6);
  // …et sont oubliés au repos : un vrai changement vers 7 n'est pas pris pour un écho
  assert.equal(e.recu(7, 6, true), true);
});

test("borne : le jour s'arrête au dernier du mois, les jours exclus restent visibles dessous", () => {
  // 7 lignes visibles (3 de chaque côté de la bande), 31 jours
  assert.equal(margeBas(3, 31, 30), 3);
  assert.equal(margeBas(3, 31, 29), 2);
  assert.equal(margeBas(3, 31, 27), 0);
  assert.equal(margeBas(2, 31, 27), 0, "jamais négative");
  assert.equal(indiceMolette(30 * 44 + 10, 44, 29), 29, "jamais au-delà du dernier jour");
  assert.equal(indiceMolette(-20, 44, 29), 0);
  assert.equal(indiceMolette(5 * 44 + 23, 44, 30), 6);
});

test("Molette.tsx : l'indice reçu passe par les échos, le défilement reste natif (un cran par ligne, inertie normale)", () => {
  const m = readFileSync(new URL("../src/ui/Molette.tsx", import.meta.url), "utf8");
  assert.match(m, /echos\.recu\(/);
  // snapToInterval est tronqué au pixel par Android (96,5 px → 96) : dérive d'un demi-pixel par ligne
  assert.match(m, /snapToOffsets=\{crans\}/);
  assert.doesNotMatch(m, /snapToInterval=/);
  assert.match(m, /decelerationRate="normal"/);
  assert.match(m, /useNativeDriver: true/);
  // Android cale seul après tout arrêt (pagingEnabled) ; un scrollTo au lâcher couperait l'élan que la ScrollView vient de lancer
  assert.doesNotMatch(m, /onScrollEndDrag/);
});

test("molette fenêtrée (clavier de séance) : 20 crans au moins de chaque côté du centre, 50 lignes au plus, recentrée par pas de 10", () => {
  assert.deepEqual(fenetreMolette(5, 201), { debut: 0, fin: 200 }, "sans fenêtre : toutes les lignes");
  for (let c = 0; c < 721; c++) {
    const { debut, fin } = fenetreMolette(c, 721, 20);
    assert.ok(c - debut >= 20 || debut === 0, `centre ${c} : ${debut}`);
    assert.ok(fin - c >= 20 || fin === 720, `centre ${c} : ${fin}`);
    assert.ok(fin - debut + 1 <= 50);
  }
  // Même fenêtre d'un cran à l'autre dans un même pas : pas de rendu des lignes à chaque cran.
  assert.deepEqual(fenetreMolette(30, 201, 20), fenetreMolette(39, 201, 20));
  assert.notDeepEqual(fenetreMolette(39, 201, 20), fenetreMolette(40, 201, 20));
  assert.match(readFileSync(new URL("../src/ui/ClavierSeance.tsx", import.meta.url), "utf8"), /fenetre=\{20\}/);
});
