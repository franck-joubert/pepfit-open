// Métamorphose des jauges de la page Activité (planche du 09/11) : le calcul pur de ecrans/metamorphose-jauges.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AIR,
  ANNEAU_PETIT,
  COURSE,
  HAUT_LIGNE,
  avancement,
  avanceeAnneau,
  cibleDeFin,
  defilementDeCible,
  defilementDeDock,
  etatCellule,
  geometrieAnneau,
  hautRangee,
  hauteurMinimale,
  hauteurRangee,
  lacherImmediat,
  mesures,
  remplaceeReduit,
  sensDe,
  VITESSE_LACHER,
} from "../src/ecrans/metamorphose-jauges.ts";
import { HAUT_COMPACTE } from "../src/ui/semainier.ts";

const proche = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const M = mesures(false);
const CW = (390 - 32) / 3; // une case : un tiers de la rangée

test("mesures : grande jauge de 96 dp (112 sur le Fold), rangée de 160 (176), ligne fixée de 44 = le semainier resserré", () => {
  assert.equal(HAUT_LIGNE, HAUT_COMPACTE);
  assert.equal(M.anneau, 96);
  assert.equal(M.hauteur, AIR.haut + 96 + AIR.libelle + AIR.hautLibelle + AIR.bas);
  assert.equal(M.hauteur, 160);
  assert.equal(M.perte, 116);
  const F = mesures(true);
  assert.deepEqual([F.anneau, F.hauteur, F.perte], [112, 176, 132]);
  proche(F.k, 112 / 96);
});

test("avancement : de 0 à 1 sur 64 dp de défilement à partir du haut de la rangée au semainier, borné, sans saut", () => {
  const yDock = defilementDeDock(116); // la date finit à 116 : la rangée touche le semainier (44) à 72
  assert.equal(yDock, 72);
  assert.equal(COURSE, 64);
  assert.equal(avancement(0, yDock), 0);
  assert.equal(avancement(72, yDock), 0);
  proche(avancement(104, yDock), 0.5);
  assert.equal(avancement(136, yDock), 1);
  assert.equal(avancement(900, yDock), 1);
  assert.equal(avancement(-30, yDock), 0, "le tirage au-delà du haut ne métamorphose rien");
  let prec = -1;
  for (let y = 0; y <= 200; y += 0.5) {
    const p = avancement(y, yDock);
    assert.ok(p >= prec, "jamais en arrière à défilement croissant");
    prec = p;
  }
  assert.equal(defilementDeDock(20), 0, "une rangée déjà sous le semainier : tout de suite");
});

test("haut et hauteur de la rangée : elle suit la page puis se fixe sous le semainier, et finit sur 44 dp", () => {
  assert.equal(hautRangee(0, 116, 72), 116);
  assert.equal(hautRangee(20, 116, 72 - 20), 96, "la bande se resserre : 52, la rangée est encore plus bas");
  assert.equal(hautRangee(72, 116, 44), 44);
  assert.equal(hautRangee(500, 116, 44), 44, "fixée");
  assert.equal(hauteurRangee(0, M), 160);
  assert.equal(hauteurRangee(1, M), 44);
  proche(hauteurRangee(0.5, M), 102);
});

test("la rangée rétrécit plus vite que le doigt, mais le vide sous elle reste petit (52 dp au plus) et se comble", () => {
  const yDock = 72;
  let vide = 0;
  let max = 0;
  for (let y = 0; y <= 260; y += 1) {
    const p = avancement(y, yDock);
    const bas = hautRangee(y, 116, 44) + hauteurRangee(p, M); // bas de la rangée dans la zone
    const hautListe = 116 + M.hauteur - y; // haut de la liste, qui garde la vitesse du doigt
    const trou = Math.max(0, hautListe - bas);
    assert.ok(trou >= -1e-9 || y > 188, "la liste ne passe jamais sous la rangée avant d'être au bord");
    max = Math.max(max, trou);
    vide = trou;
  }
  proche(max, 52, 1e-6);
  assert.ok(vide <= 52);
  // pendant la course : la rangée perd 116 dp pour 64 dp de défilement (≈ 1,8 fois la vitesse du doigt)
  proche((hauteurRangee(0, M) - hauteurRangee(1, M)) / COURSE, 116 / 64);
});

test("anneau : q = p^1,3, de 96 à 20 dp, centré dans sa case puis aligné à gauche, trait de 7 à 2,5 dp", () => {
  proche(avanceeAnneau(0), 0);
  proche(avanceeAnneau(1), 1);
  assert.ok(avanceeAnneau(0.5) < 0.5, "l'anneau rétrécit un peu moins vite que la rangée");
  const a = etatCellule(0, CW, M);
  proche(a.taille, 96);
  proche(a.echelle, 1);
  proche(a.haut, 16);
  proche(a.gauche, CW / 2 - 48);
  proche(a.cx, CW / 2);
  proche(geometrieAnneau(0, M).rayon, 40);
  proche(geometrieAnneau(0, M).epaisseur, 7);
  const z = etatCellule(1, CW, M);
  proche(z.taille, ANNEAU_PETIT);
  proche(z.haut, 12);
  proche(z.gauche, 0);
  proche(z.cy, 22, 1e-9); // centré dans la ligne de 44
  // même anneau que la petite jauge de l'appli (GEO.mini : r 17 et trait 6 sur une boîte de 48)
  const g1 = geometrieAnneau(1, M);
  proche(g1.rayon, 34);
  proche(g1.epaisseur * ANNEAU_PETIT / 96, 2.5);
  proche(g1.epaisseur, 12);
  // le trait en dp (unités × échelle × k) suit son interpolation, et ne grossit jamais à tort
  const dp = (p: number) => geometrieAnneau(p, M).epaisseur * etatCellule(p, CW, M).echelle * M.k;
  proche(dp(0), 7);
  proche(dp(1), 2.5);
  for (let p = 0; p < 1; p += 0.05) assert.ok(dp(p + 0.05) <= dp(p) + 1e-9, "le trait ne fait que s'amincir");
  // Fold déplié : 112 dp, trait de 7 × 112/96
  const F = mesures(true);
  proche(etatCellule(0, 640 / 3, F).taille, 112);
  proche(geometrieAnneau(0, F).epaisseur * F.k, 7 * F.k);
});

test("fondu croisé : jamais deux valeurs lisibles en même temps, l'icône et le libellé partis avant l'unité", () => {
  for (let p = 0; p <= 1.0001; p += 0.01) {
    const e = etatCellule(Math.min(1, p), CW, M);
    assert.ok(Math.min(e.dedansOpacite, e.dehorsOpacite) === 0, `p ${p.toFixed(2)} : la valeur dedans et la valeur dehors se recouvrent`);
    assert.ok(e.dedansOpacite >= 0 && e.dedansOpacite <= 1 && e.dehorsOpacite >= 0 && e.dehorsOpacite <= 1);
    assert.ok(e.uniteOpacite === 0 || e.dehorsOpacite === 1, "l'unité n'apparaît qu'une fois la valeur dehors posée");
  }
  const haut = etatCellule(0, CW, M);
  assert.deepEqual([haut.iconeOpacite, haut.dedansOpacite, haut.dehorsOpacite, haut.uniteOpacite, haut.libelleOpacite], [1, 1, 0, 0, 1]);
  const bas = etatCellule(1, CW, M);
  assert.deepEqual([bas.iconeOpacite, bas.dedansOpacite, bas.dehorsOpacite, bas.uniteOpacite, bas.libelleOpacite], [0, 0, 1, 1, 0]);
  // le libellé s'efface en suivant le bas de l'anneau
  const mi = etatCellule(0.5, CW, M);
  proche(mi.libelleY, mi.haut + mi.taille + AIR.libelle);
});

test("fin de course au lâcher : dans le sens du geste, jamais coincée à mi-course, rien à finir aux extrémités", () => {
  assert.equal(cibleDeFin(0.5, 1), 1, "la page montait : jauges fixées");
  assert.equal(cibleDeFin(0.5, -1), 0, "la page redescendait : grandes jauges");
  assert.equal(cibleDeFin(0.5, 0), 1);
  assert.equal(cibleDeFin(0, 1), null);
  assert.equal(cibleDeFin(1, -1), null);
  assert.equal(defilementDeCible(0, 72), 72);
  assert.equal(defilementDeCible(1, 72), 136);
});

test("mouvement réduit : pas de métamorphose, la ligne fixée remplace la grande rangée quand elle est sortie", () => {
  const yDock = 72;
  assert.equal(remplaceeReduit(0, yDock, M.perte), 0);
  assert.equal(remplaceeReduit(187.9, yDock, M.perte), 0, "la grande rangée n'est pas encore sortie");
  assert.equal(remplaceeReduit(188, yDock, M.perte), 1);
});

test("au lâcher : lent, la course se finit tout de suite ; vif, l'élan joue d'abord ; le sens est celui du dernier déplacement net", () => {
  assert.equal(lacherImmediat(0), true);
  assert.equal(lacherImmediat(VITESSE_LACHER - 0.01), true);
  assert.equal(lacherImmediat(-(VITESSE_LACHER - 0.01)), true, "la vitesse se lit en valeur absolue (le doigt monte : négative sur Android)");
  assert.equal(lacherImmediat(VITESSE_LACHER), false);
  assert.equal(lacherImmediat(-1), false);
  assert.equal(sensDe(1, -3), -1);
  assert.equal(sensDe(-1, 3), 1);
  assert.equal(sensDe(-1, 0.2), -1, "un arrêt garde le sens du geste");
  assert.equal(sensDe(1, 0), 1);
});

test("page courte : le contenu fait de quoi aller au bout de la course, même un jour sans séance", () => {
  const yDock = defilementDeDock(116);
  assert.equal(yDock, 72);
  assert.equal(hauteurMinimale(700, yDock), 700 + 72 + COURSE);
});

test("page courte en mouvement réduit : la rangée peut sortir en entier avant que la ligne fixée la remplace", () => {
  const m = mesures(false);
  const yDock = defilementDeDock(116);
  const haut = hauteurMinimale(700, yDock, m.perte);
  assert.equal(haut, 700 + 72 + m.perte);
  // au bout de la page (défilement max = contenu moins hauteur visible), le remplacement a eu lieu
  assert.equal(remplaceeReduit(haut - 700, yDock, m.perte), 1);
  // avec la seule course (64), il n'aurait jamais lieu : la grande rangée resterait coincée sous le semainier
  assert.equal(remplaceeReduit(hauteurMinimale(700, yDock) - 700, yDock, m.perte), 0);
});

// Branchement (le rendu se voit à l'émulateur) : lu dans les sources.
const src = (chemin: string) => readFileSync(new URL(`../src/${chemin}`, import.meta.url), "utf8");

test("page Activité : défilement lu sur le fil UI, deux copies des jauges, bord coupé suivi par la zone, plus de ligne fixe séparée", () => {
  const train = src("app/(tabs)/train.tsx");
  assert.match(train, /<Reanimated\.ScrollView[\s\S]*?onScroll=\{jauges\.defilement\}/);
  assert.doesNotMatch(train, /onScroll=\{\(e\)/, "plus de onScroll JavaScript : un à chaque image retarderait les jauges");
  assert.doesNotMatch(train, /LigneFixeSport|montrerLigne|setBasRangee|<RangeeSport/);
  assert.match(train, /fixee=\{jaugesActives \? <JaugesActivite[^>]*p=\{jauges\.p\}[^>]*visible=\{jauges\.fixeVisible\}/);
  assert.match(train, /progression=\{jauges\.p\}/);
  assert.match(train, /<JaugesActivite date=\{j\} p=\{jauges\.repos\} visible=\{jauges\.pageVisible\}/);
  assert.match(train, /jaugesDuJour\(j, p\.aujourdhui\) \? null : <JaugesActivite/, "pas de jauges (ni de place) pour un jour à venir");
  assert.match(train, /minHeight: jauges\.hauteurMin/);
  assert.match(train, /jauges\.mesurerHautPages\(/);
});

test("zone du semainier : la rangée fixée repousse le bord coupé et l'ombre de son avancement ; Nutrition n'a pas à changer", () => {
  const zone = src("ui/ZoneSemainier.tsx");
  assert.match(zone, /avance\.value \* HAUT_COMPACTE/);
  assert.match(zone, /\{fixee\}/);
  assert.match(src("ui/semainier.ts"), /export function compactDe\([^)]*\): number \{\s*"worklet";/, "compactDe tourne sur le fil UI");
  assert.doesNotMatch(src("ecrans/nutrition/Journal.tsx"), /fixee|progression=/);
});

test("jauges : tout par transform et opacité sur le fil UI, trois cases touchables, texte lu depuis lireJauges", () => {
  const j = src("ecrans/JaugesActivite.tsx");
  assert.match(j, /useAnimatedStyle/);
  assert.match(j, /morphe=\{\{ p, mesures: m \}\}/);
  assert.match(j, /accessibilityLabel=\{jauge\.lu\}/);
  assert.match(j, /pathname: j\.route/);
  assert.match(j, /Math\.max\(HAUT_LIGNE, hauteurRangee\(p\.value, m\)\)/, "la zone de clic suit la rangée, jamais sous 44");
  assert.doesNotMatch(j, /useState|setInterval|setTimeout/, "aucun état ni minuterie : rien ne se rend à chaque pixel");
});
