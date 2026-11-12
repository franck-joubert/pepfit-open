// Le mouvement des onglets (ui/onglets-mouvement.ts) : la machine à états de la transition, sans écran, sans Reanimated, sans horloge réelle.
// Chaque test lit `canaux(course, ms)` à des instants choisis : le résultat ne dépend que de ses arguments, jamais de la charge de la machine.
// Refonte du 07/11 : un seul état (l'onglet actif), une horloge, des canaux purs ; rien d'intermédiaire ne survit à un changement d'onglet.
import assert from "node:assert/strict";
import { test } from "node:test";
import { courbe } from "../src/theme/mouvement.ts";
import { tempsOnglets as TEMPS } from "../src/theme/onglets.ts";
import { gabaritOuvert, gabaritRiche, voisinGlisse } from "../src/ui/onglets-calc.ts";
import {
  bezier,
  canaux,
  dureeCourse,
  encoche,
  immobile,
  opaciteGlisse,
  poser,
  progression,
  repos,
  reprise,
  suiviGlisse,
  type Canal,
  type Course,
} from "../src/ui/onglets-mouvement.ts";

const N = 5;
const CLE = "a|b|c|d|e";
const somme = (v: readonly number[]) => v.reduce((a, b) => a + b, 0);
const proche = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;
const CANAUX: Canal[] = ["geo", "libelle", "icone", "pose"];
const vers = (c: Course | null, ms: number, k: number, reduit = false, n = N, cle = CLE) => reprise(c, ms, { k, n, cle, reduit });

/** Un petit générateur déterministe (graine fixe) : mêmes rafales à chaque exécution, quelle que soit la machine. */
function hasard(graine: number) {
  let s = graine >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// ——— La courbe ———

test("bezier : 0 en 0, 1 en 1, croissante, et fidèle à la courbe CSS (sortie : 0,23 1 0,32 1 ; ease : 0,25 0,1 0,25 1)", () => {
  for (const c of [courbe.sortie, TEMPS.courbeFondu]) {
    assert.equal(bezier(c, 0), 0);
    assert.equal(bezier(c, 1), 1);
    assert.equal(bezier(c, -0.5), 0);
    assert.equal(bezier(c, 1.5), 1);
    let avant = 0;
    for (let i = 1; i <= 200; i++) {
      const y = bezier(c, i / 200);
      assert.ok(y >= avant - 1e-9, `croissante à ${i / 200}`);
      avant = y;
    }
  }
  // Valeurs de référence (cubic-bezier CSS calculé à part) : la sortie est déjà à 90 % à 80 ms sur 220, l'ease à mi-course est à 80 %.
  assert.ok(Math.abs(bezier(courbe.sortie, 80 / 220) - 0.9) < 0.02, `sortie à 80 ms : ${bezier(courbe.sortie, 80 / 220)}`);
  assert.ok(Math.abs(bezier(TEMPS.courbeFondu, 0.5) - 0.8024) < 0.01, `ease à 50 % : ${bezier(TEMPS.courbeFondu, 0.5)}`);
});

// ——— Le repos et la pose ———

test("repos : un 1 sous l'actif, des 0 ailleurs, l'icône à sa taille ; une course posée est immobile", () => {
  const r = repos(2, N);
  assert.deepEqual(r.geo, [0, 0, 1, 0, 0]);
  assert.deepEqual(r.libelle, [0, 0, 1, 0, 0]);
  assert.deepEqual(r.icone, [0, 0, 1, 0, 0]);
  assert.deepEqual(r.pose, [1, 1, 1, 1, 1]);
  const c = poser(2, N, CLE);
  assert.equal(immobile(c), true);
  assert.deepEqual(canaux(c, 0), r);
  assert.deepEqual(canaux(c, 9999), r);
});

test("durées : 220 ms (jeton `deplace`), 120 ms sous « réduire les animations »", () => {
  assert.equal(dureeCourse(false), 220);
  assert.equal(dureeCourse(true), 120);
  assert.equal(TEMPS.deplace, 220);
});

// ——— Une course de 0 vers 3 ———

test("course : au départ, tout est comme au repos de l'ancien actif ; à la fin, EXACTEMENT le repos du nouveau", () => {
  const c = vers(poser(0, N, CLE), 0, 3);
  assert.equal(immobile(c), false);
  assert.deepEqual(canaux(c, 0).geo, [1, 0, 0, 0, 0]);
  assert.deepEqual(canaux(c, 0).libelle, [1, 0, 0, 0, 0]);
  assert.deepEqual(canaux(c, 0).icone, [1, 0, 0, 0, 0]);
  const fin = canaux(c, dureeCourse(false));
  assert.deepEqual(fin, repos(3, N), "exactement 0 et 1, pas 0,999999");
  assert.deepEqual(canaux(c, 5000), repos(3, N));
});

test("course : la part de géométrie passe de l'ancien au nouvel onglet, la somme vaut toujours 1, rien ne bouge ailleurs", () => {
  const c = vers(poser(0, N, CLE), 0, 3);
  for (let ms = 0; ms <= 240; ms += 4) {
    const g = canaux(c, ms).geo;
    assert.ok(proche(somme(g), 1), `somme à ${ms} ms : ${somme(g)}`);
    assert.equal(g[1], 0);
    assert.equal(g[2], 0);
    assert.equal(g[4], 0);
    assert.ok(g[0]! >= 0 && g[3]! <= 1);
  }
});

test("course : le libellé qui sort s'efface en 100 ms, celui qui entre paraît après 60 ms (ils se croisent, sans trou ni double)", () => {
  const c = vers(poser(0, N, CLE), 0, 3);
  const at = (ms: number) => canaux(c, ms).libelle;
  assert.equal(at(0)[3], 0);
  assert.equal(at(60)[3], 0, "il n'a pas encore paru avant 60 ms");
  assert.ok(at(80)[3]! > 0 && at(80)[3]! < 0.3, "il commence");
  assert.equal(at(100)[0], 0, "le sortant est effacé à 100 ms");
  assert.ok(at(20)[0]! < 1 && at(20)[0]! > 0.4, "il part dès le début");
  assert.equal(at(220)[3], 1, "l'entrant est plein à 220 ms");
  // Aucun instant où les deux sont à la fois nuls ET où la page paraît vide de libellé plus de 60 ms : l'entrant paraît quand le sortant a presque disparu.
  assert.ok(at(60)[0]! < 0.15, "le sortant est presque effacé quand l'entrant va paraître");
  // Monotonie : le sortant ne revient jamais, l'entrant ne recule jamais.
  let [s, e] = [1, 0];
  for (let ms = 0; ms <= 240; ms += 2) {
    const l = at(ms);
    assert.ok(l[0]! <= s + 1e-9 && l[3]! >= e - 1e-9, `monotone à ${ms} ms`);
    [s, e] = [l[0]!, l[3]!];
  }
});

test("course : l'icône prend sa couleur en 160 ms, avec la courbe douce (pas de saut) ; l'icône qui arrive se pose de 0,82 à 1", () => {
  const c = vers(poser(0, N, CLE), 0, 3);
  assert.equal(canaux(c, 0).icone[3], 0);
  assert.equal(canaux(c, 160).icone[3], 1);
  assert.equal(canaux(c, 160).icone[0], 0);
  const i = (ms: number) => canaux(c, ms).icone[3]!;
  for (let ms = 1; ms <= 160; ms++) assert.ok(i(ms) - i(ms - 1) < 0.06, `pas de saut de couleur à ${ms} ms : ${i(ms) - i(ms - 1)}`);
  assert.equal(canaux(c, 0).pose[3], TEMPS.poseDepart, "l'icône qui arrive part de 0,82");
  assert.equal(canaux(c, 0).pose[0], 1, "celle qui part ne bouge pas");
  assert.equal(canaux(c, 220).pose[3], 1);
});

// ——— Reprise : on repart de ce qui est affiché ———

test("reprise : un changement d'onglet en route repart exactement de l'affiché (aucun saut), canal par canal", () => {
  const premiere = vers(poser(0, N, CLE), 0, 3);
  for (const ms of [0, 10, 37, 60, 90, 150, 219]) {
    const avant = canaux(premiere, ms);
    const seconde = vers(premiere, ms, 1);
    const apres = canaux(seconde, 0);
    for (const nom of CANAUX) {
      avant[nom].forEach((v, i) => {
        // Seule la pose de l'icône qui arrive d'un onglet fermé change : elle part de 0,82 (une pose, pas un saut visible : l'icône est sous le libellé).
        if (nom === "pose" && i === 1) return;
        assert.ok(proche(apres[nom][i]!, v), `${nom}[${i}] à ${ms} ms : ${v} puis ${apres[nom][i]}`);
      });
    }
    assert.ok(proche(somme(apres.geo), 1));
    assert.deepEqual(canaux(seconde, 9999), repos(1, N));
  }
});

test("reprise : l'aller-retour rapide (0 → 1 → 0 avant la fin) revient au repos de 0, sans libellé resté ouvert", () => {
  let c = vers(poser(0, N, CLE), 0, 1);
  c = vers(c, 40, 0);
  const fin = canaux(c, dureeCourse(false));
  assert.deepEqual(fin, repos(0, N));
  // Pendant le retour, l'onglet 1 (qui s'ouvrait) se referme, jamais en dessous de 0.
  for (let ms = 0; ms <= 220; ms += 5) {
    const x = canaux(c, ms);
    for (const nom of ["geo", "libelle", "icone"] as const) x[nom].forEach((v) => assert.ok(v >= -1e-9 && v <= 1 + 1e-9, `${nom} dans [0, 1] à ${ms} ms : ${v}`));
    assert.ok(proche(somme(x.geo), 1));
  }
});

test("reprise : le même onglet en route continue vers le même repos (un rendu de plus ne coupe rien, rien ne saute)", () => {
  const premiere = vers(poser(0, N, CLE), 0, 3);
  const meme = vers(premiere, 70, 3);
  assert.deepEqual(canaux(meme, 0).geo, canaux(premiere, 70).geo);
  assert.deepEqual(canaux(meme, 9999), repos(3, N));
});

test("reprise : une autre liste (valeurs ou nombre) pose le nouveau repos sans route ; sans course, aussi", () => {
  const en = vers(poser(0, N, CLE), 0, 3);
  const autre = reprise(en, 50, { k: 1, n: 4, cle: "a|b|c|d", reduit: false });
  assert.equal(immobile(autre), true);
  assert.deepEqual(canaux(autre, 0), repos(1, 4));
  const memeNombre = reprise(en, 50, { k: 2, n: N, cle: "x|b|c|d|e", reduit: false });
  assert.equal(immobile(memeNombre), true);
  assert.deepEqual(canaux(memeNombre, 0), repos(2, N));
  assert.equal(immobile(reprise(null, 0, { k: 2, n: N, cle: CLE, reduit: false })), true);
});

test("réduit : rien ne glisse (géométrie et pose sautent), le libellé et l'icône fondent en 120 ms", () => {
  const c = vers(poser(0, N, CLE, true), 0, 3, true);
  assert.deepEqual(canaux(c, 0).geo, repos(3, N).geo, "l'encoche est tout de suite sous l'onglet d'arrivée");
  assert.deepEqual(canaux(c, 0).pose, [1, 1, 1, 1, 1], "l'icône ne se pose pas");
  assert.ok(canaux(c, 60).libelle[3]! > 0.4 && canaux(c, 60).libelle[3]! < 0.6, "fondu linéaire : à mi-course, à moitié");
  assert.equal(canaux(c, 120).libelle[3], 1);
  assert.equal(canaux(c, 120).libelle[0], 0);
  assert.deepEqual(canaux(c, 120), repos(3, N));
  assert.equal(dureeCourse(true), 120);
});

test("progression : 0 avant le retard, bornée dans [0, 1], le libellé déjà à moitié paru n'attend pas ses 60 ms en entier", () => {
  assert.equal(progression("libelle", true, 59, false), 0);
  assert.equal(progression("libelle", true, 300, false), 1);
  assert.ok(progression("libelle", true, 40, false, 0.5) > progression("libelle", true, 40, false, 0), "départ avancé");
  assert.equal(progression("geo", true, -10, false), 0);
  assert.equal(progression("geo", true, 220, false), 1);
});

// ——— Rafales, au hasard et à graine fixe ———

test("rafale : 400 courses de 2 à 9 toucher à des instants quelconques finissent toujours au repos exact de l'onglet visé", () => {
  const alea = hasard(20251107);
  for (let essai = 0; essai < 400; essai++) {
    let k = Math.floor(alea() * N);
    let c: Course = poser(k, N, CLE);
    let ms = 0;
    const touches = 2 + Math.floor(alea() * 8);
    for (let t = 0; t < touches; t++) {
      // l'instant du toucher suivant : de 0 à 300 ms après le précédent (parfois après la fin de la course)
      ms = Math.min(dureeCourse(false), ms + Math.floor(alea() * 300));
      const avant = canaux(c, ms);
      const nouveau = Math.floor(alea() * N);
      c = vers(c, ms, nouveau);
      const apres = canaux(c, 0);
      assert.ok(proche(somme(apres.geo), 1), `somme à la reprise : ${somme(apres.geo)}`);
      for (const nom of ["geo", "libelle", "icone"] as const) apres[nom].forEach((v, i) => assert.ok(proche(v, avant[nom][i]!), `reprise sans saut (${nom}[${i}])`));
      k = nouveau;
      ms = 0;
      // en route : toujours dans [0, 1], la somme de la géométrie vaut 1
      for (let s = 0; s <= 240; s += 20) {
        const x = canaux(c, s);
        assert.ok(proche(somme(x.geo), 1), `somme en route : ${somme(x.geo)}`);
        for (const nom of CANAUX) x[nom].forEach((v) => assert.ok(Number.isFinite(v) && v >= -1e-9 && v <= 1.0000001, `${nom} borné : ${v}`));
      }
    }
    assert.deepEqual(canaux(c, dureeCourse(false)), repos(k, N), `essai ${essai} : au repos exact`);
    assert.deepEqual(canaux(c, 10_000), repos(k, N));
  }
});

// ——— Encoche et géométrie ———

test("encoche : à 0 ou 1, exactement les bords de l'onglet ; entre les deux, entre les bords de l'ancien et du nouveau", () => {
  const marques = ["aucune", "aucune", "aucune", "aucune", "aucune"] as const;
  const libelles = [60, 70, 80, 55, 40];
  const g = gabaritRiche({ largeur: 390, marge: 16, libelles, marques, actif: 0 });
  const g3 = gabaritRiche({ largeur: 390, marge: 16, libelles, marques, actif: 3 });
  const c = vers(poser(0, N, CLE), 0, 3);
  const x = (ms: number) => {
    const o = gabaritOuvert({ largeur: 390, marge: 16, libelles, marques, ouvertures: canaux(c, ms).geo });
    return encoche(o, canaux(c, ms).geo);
  };
  assert.ok(proche(x(0).x0, g.x[0]!) && proche(x(0).x1, g.x[0]! + g.largeurs[0]!), "au départ : sous l'onglet 0");
  assert.ok(proche(x(220).x0, g3.x[3]!) && proche(x(220).x1, g3.x[3]! + g3.largeurs[3]!), "à l'arrivée : sous l'onglet 3");
  let avant = x(0).x0;
  for (let ms = 1; ms <= 220; ms++) {
    const e = x(ms);
    assert.ok(e.x1 > e.x0, "une encoche d'une largeur positive");
    assert.ok(e.x0 >= avant - 1e-6, "l'encoche avance, ne recule pas");
    avant = e.x0;
  }
});

test("gabaritOuvert : à 0 et 1 il redonne `gabaritRiche` ; entre les deux, la somme des largeurs et des écarts reste la barre (rien ne déborde)", () => {
  const marques = ["pastille", "aucune", "pastilleLongue", "point", "aucune"] as const;
  const libelles = [60, 70, 80, 55, 40];
  for (let k = 0; k < N; k++) {
    const attendu = gabaritRiche({ largeur: 390, marge: 16, libelles, marques, actif: k });
    const ouvert = gabaritOuvert({ largeur: 390, marge: 16, libelles, marques, ouvertures: repos(k, N).geo });
    assert.deepEqual(ouvert, attendu);
  }
  const c = vers(poser(0, N, CLE), 0, 4);
  for (let ms = 0; ms <= 220; ms += 11) {
    const o = gabaritOuvert({ largeur: 390, marge: 16, libelles, marques, ouvertures: canaux(c, ms).geo });
    const total = somme(o.largeurs) + 2 * (N - 1) + 32;
    assert.ok(proche(total, 390, 1e-6) || o.defile, `la rangée remplit la barre à ${ms} ms : ${total}`);
    for (const l of o.largeurs) assert.ok(l >= 48 - 1e-9, `un onglet fait 48 au moins : ${l}`);
  }
});

test("gabaritOuvert : sans largeur mesurée (0), les onglets font 48 et ne défilent pas", () => {
  const o = gabaritOuvert({ largeur: 0, marge: 16, libelles: [0, 0, 0], marques: ["aucune", "aucune", "aucune"], ouvertures: [1, 0, 0] });
  assert.deepEqual(o.largeurs, [48 + 8, 48, 48]);
  assert.equal(o.defile, false);
});

// ——— Glissement ———

test("suiviGlisse : le panneau suit le doigt à moitié, avec une butée douce à 96 dp, et presque rien au bord de la liste", () => {
  assert.equal(suiviGlisse(0, true), 0);
  assert.ok(proche(suiviGlisse(40, true), (96 * 20) / (96 + 20)), "à 40 dp de doigt : 20 dp de panneau, ralenti par la butée");
  assert.equal(suiviGlisse(-40, true), -suiviGlisse(40, true), "symétrique");
  assert.ok(Math.abs(suiviGlisse(5000, true)) < 96, "ne dépasse jamais la butée");
  assert.ok(suiviGlisse(5000, true) > 90, "mais s'en approche");
  assert.ok(suiviGlisse(60, false) < suiviGlisse(60, true) / 2, "au bord : moins de la moitié de ce que suit un panneau qui a un voisin");
  let avant = 0;
  for (let dx = 0; dx <= 600; dx += 5) {
    const x = suiviGlisse(dx, true);
    assert.ok(x >= avant, "croissant avec le doigt, sans saccade");
    avant = x;
  }
});

test("opaciteGlisse : 1 au repos, 0,6 à la butée, jamais en dessous", () => {
  assert.equal(opaciteGlisse(0), 1);
  assert.ok(proche(opaciteGlisse(96), TEMPS.suiviOpacite));
  assert.ok(proche(opaciteGlisse(-96), TEMPS.suiviOpacite));
  assert.ok(proche(opaciteGlisse(500), TEMPS.suiviOpacite));
  assert.ok(opaciteGlisse(48) > TEMPS.suiviOpacite && opaciteGlisse(48) < 1);
});

test("voisinGlisse : le panneau voisin non désactivé dans le sens du doigt, null au bord", () => {
  const d = [false, true, false, false];
  assert.equal(voisinGlisse(d, 0, 1), 2, "saute le désactivé");
  assert.equal(voisinGlisse(d, 2, -1), 0);
  assert.equal(voisinGlisse(d, 0, -1), null, "rien avant le premier");
  assert.equal(voisinGlisse(d, 3, 1), null, "rien après le dernier");
  assert.equal(voisinGlisse([false, true], 0, 1), null, "que des désactivés après");
});
