// Accueil modulable (planche B · Mosaïque) : grille dense, ordre, opérations du mode Modifier, persistance (migration 22).
import assert from "node:assert/strict";
import { test } from "node:test";
import { lireAccueil, ecrireAccueil } from "../src/db/depots/accueil.ts";
import {
  aAjouter, ajouter, bornerTenu, BRANCHE, demarrerASuivreTonal, changerTaille, hauteurGrille, deplacer, descendre, disposer, fusionnerCaches, grilleDense, lireBlocs, monter,
  ordreAffiche, PAR_DEFAUT, rangVise, retirer, visibles, type Bloc, type IdBloc,
} from "../src/ecrans/accueil-blocs.ts";
import { baseDeTest } from "./aide.ts";

const P = (id: IdBloc): Bloc => ({ id, taille: "pleine" });
const D = (id: IdBloc): Bloc => ({ id, taille: "demie" });
const ids = (l: Bloc[]) => l.map((b) => b.id);

test("grille dense : un demi seul est rejoint par le demi suivant, par-dessus les pleins", () => {
  const g = grilleDense([D("semaine"), P("derniere"), D("records"), D("poids")]);
  assert.deepEqual(g.map(ids), [["semaine", "records"], ["derniere"], ["poids"]]);
  assert.deepEqual(ids(ordreAffiche([D("semaine"), P("derniere"), D("records")])), ["semaine", "records", "derniere"]);
});

test("disposer : demi = (largeur − écart) / 2, une rangée prend la hauteur de son plus haut bloc", () => {
  const r = disposer([D("semaine"), D("records"), P("derniere")], { semaine: 132, records: 150, derniere: 200 }, 380, 8);
  assert.deepEqual(r.get("semaine"), { x: 0, y: 0, l: 186, h: 150 });
  assert.deepEqual(r.get("records"), { x: 194, y: 0, l: 186, h: 150 });
  assert.deepEqual(r.get("derniere"), { x: 0, y: 158, l: 380, h: 200 });
});

test("déplacer, monter, descendre suivent l'ordre affiché", () => {
  const l = [D("semaine"), P("derniere"), D("records")]; // affiché : semaine, records, derniere
  assert.deepEqual(ids(deplacer(l, "derniere", 0)), ["derniere", "semaine", "records"]);
  assert.deepEqual(ids(monter(l, "records")), ["records", "semaine", "derniere"]);
  assert.deepEqual(ids(descendre(l, "records")), ["semaine", "derniere", "records"]);
  assert.deepEqual(ids(monter(l, "semaine")), ["semaine", "records", "derniere"]);
});

test("rang visé : le centre du bloc tenu choisit sa place", () => {
  const l = [P("a-suivre"), D("semaine"), D("records"), P("derniere")];
  const h = { "a-suivre": 160, semaine: 132, records: 132, derniere: 200 };
  // Sans bouger : il reste.
  assert.equal(rangVise(l, "derniere", 190, 300 + 100, h, 380, 8), 3);
  // Tenu tout en haut : premier.
  assert.equal(rangVise(l, "derniere", 190, 40, h, 380, 8), 0);
  // Le demi de gauche porté à droite : il passe après records.
  assert.equal(rangVise(l, "semaine", 290, 168 + 66, h, 380, 8), 2);
});

// Glisser : pleins et demis mélangés, comme sur le Fold (grille de 380, écart de 8).
const MIX = [P("a-suivre"), D("semaine"), P("derniere"), D("records"), D("poids"), P("pas")];
const H_MIX = { "a-suivre": 180, semaine: 132, derniere: 260, records: 150, poids: 132, pas: 140 };

/** Rangées serrées de haut en bas, sans chevauchement ni trou ; deux demis côte à côte ; un plein seul. */
function grilleSaine(places: Map<IdBloc, { x: number; y: number; l: number; h: number }>) {
  const rangs = [...new Set([...places.values()].map((r) => r.y))].sort((a, b) => a - b);
  let y = 0;
  for (const ry of rangs) {
    assert.equal(ry, y, "pas de trou entre deux rangées");
    const r = [...places.values()].filter((p) => p.y === ry).sort((a, b) => a.x - b.x);
    if (r.length === 1 && r[0]!.l === 380) assert.equal(r[0]!.x, 0);
    else r.forEach((p, k) => assert.deepEqual([p.x, p.l], [k * 194, 186]));
    assert.ok(r.length <= 2);
    y = ry + r[0]!.h + 8;
  }
}

test("glisser : quel que soit le rang visé, la grille reste serrée (ni chevauchement, ni trou)", () => {
  for (const b of MIX) for (let v = 0; v < MIX.length; v++) grilleSaine(disposer(deplacer(MIX, b.id, v), H_MIX, 380, 8));
});

test("glisser : porté sur une place, le bloc y est déposé (vers le haut, vers le bas, premier et dernier rang)", () => {
  for (const b of MIX)
    for (let v = 0; v < MIX.length; v++) {
      const cible = disposer(deplacer(MIX, b.id, v), H_MIX, 380, 8).get(b.id)!;
      const r = rangVise(MIX, b.id, cible.x + cible.l / 2, cible.y + cible.h / 2, H_MIX, 380, 8);
      assert.deepEqual(disposer(deplacer(MIX, b.id, r), H_MIX, 380, 8).get(b.id), cible, `${b.id} vers ${v}`);
    }
});

test("glisser : le cas de la capture (quatre pleins), Dernière séance montée au-dessus de Pas puis descendue", () => {
  const l = [P("a-suivre"), P("semaine"), P("pas"), P("derniere")];
  const h = { "a-suivre": 150, semaine: 160, pas: 120, derniere: 240 };
  // Base : a-suivre 0, semaine 158, pas 326, derniere 454. Centre de derniere porté sur la place de pas (326 + 120).
  const v = rangVise(l, "derniere", 190, 326 + 120, h, 380, 8);
  assert.equal(v, 2);
  const apres = deplacer(l, "derniere", v);
  assert.deepEqual(ids(apres), ["a-suivre", "semaine", "derniere", "pas"]);
  const p = disposer(apres, h, 380, 8);
  assert.deepEqual(p.get("derniere"), { x: 0, y: 326, l: 380, h: 240 });
  assert.deepEqual(p.get("pas"), { x: 0, y: 574, l: 380, h: 120 });
  // Puis tout en bas : dernier rang.
  assert.equal(rangVise(apres, "derniere", 190, 900, h, 380, 8), 3);
  // Le demi tout en haut passe premier, à gauche.
  assert.equal(rangVise(MIX, "poids", 93, 0, H_MIX, 380, 8), 0);
});

test("glisser : une hauteur qui change (données chargées après coup) décale la suite sans trou", () => {
  const avant = disposer(MIX, H_MIX, 380, 8);
  const apres = disposer(MIX, { ...H_MIX, derniere: 400 }, 380, 8);
  grilleSaine(apres);
  assert.equal(apres.get("poids")!.y - avant.get("poids")!.y, 140);
  assert.deepEqual(apres.get("a-suivre"), avant.get("a-suivre"));
  assert.equal(hauteurGrille(apres) - hauteurGrille(avant), 140);
  // Le rang visé suit les hauteurs : à y = 560, Pas passe sous Dernière séance (260) ou au-dessus (400).
  assert.equal(rangVise(MIX, "pas", 190, 560, H_MIX, 380, 8), 4);
  assert.equal(rangVise(MIX, "pas", 190, 560, { ...H_MIX, derniere: 400 }, 380, 8), 2);
});

test("glisser : le bloc tenu ne sort jamais de la grille (à la marge près)", () => {
  const r0 = { x: 0, y: 100, l: 380, h: 200 };
  assert.deepEqual(bornerTenu(r0, 16, -8, 380, 900, 16), { x: 16, y: 92 });
  assert.deepEqual(bornerTenu(r0, 300, 2000, 380, 900, 16), { x: 16, y: 716 });
  assert.deepEqual(bornerTenu(r0, -300, -2000, 380, 900, 16), { x: -16, y: -16 });
  const demi = { x: 194, y: 0, l: 186, h: 132 };
  assert.deepEqual(bornerTenu(demi, 100, 0, 380, 900, 16), { x: 210, y: 0 });
  // Grille plus basse que le bloc : collé en haut.
  assert.deepEqual(bornerTenu(r0, 0, 50, 380, 100, 16), { x: 0, y: -16 });
});

test("ajouter en fin, en demie si possible ; retirer ; changer de taille", () => {
  const l = [P("a-suivre")];
  assert.deepEqual(ajouter(l, "records"), [P("a-suivre"), D("records")]);
  assert.deepEqual(ajouter(l, "a-suivre"), [P("a-suivre")]);
  assert.deepEqual(ajouter(l, "nutrition"), [P("a-suivre")]);
  assert.deepEqual(retirer([P("a-suivre"), D("records")], "a-suivre"), [D("records")]);
  assert.deepEqual(changerTaille([D("records")], "records", "pleine"), [P("records")]);
  assert.deepEqual(changerTaille([D("nutrition")], "nutrition", "pleine"), [D("nutrition")]);
});

test("feuille d'ajout : absents et branchés, Nutrition en « bientôt »", () => {
  const l = aAjouter([P("a-suivre"), P("semaine")]);
  assert.ok(!l.some((d) => d.id === "a-suivre" || d.id === "semaine"));
  assert.ok(!l.some((d) => d.id === "whoop"));
  // Prochaines séances : branché avec la planification (27/10).
  assert.ok(l.some((d) => d.id === "pas"));
  assert.ok(l.some((d) => d.id === "seances"));
  assert.equal(l.at(-1)?.id, "nutrition");
  assert.equal(l.at(-1)?.bientot, true);
});

test("lecture de la base : ids inconnus et doublons écartés, taille ramenée à une taille permise", () => {
  assert.deepEqual(
    lireBlocs([{ id: "records", taille: "demie" }, { id: "x", taille: "pleine" }, { id: "records", taille: "pleine" }, { id: "poids", taille: "geante" }]),
    [D("records"), D("poids")],
  );
});

test("les blocs non branchés restent stockés, cachés, après les visibles", () => {
  const stockes = [P("a-suivre"), P("whoop"), P("semaine"), P("derniere")];
  assert.deepEqual(ids(visibles(stockes)), ["a-suivre", "semaine", "derniere"]);
  const modifies = retirer(visibles(stockes), "semaine");
  assert.deepEqual(ids(fusionnerCaches(stockes, modifies)), ["a-suivre", "derniere", "whoop"]);
  assert.equal(BRANCHE.whoop, false);
  assert.equal(BRANCHE.pas, true);
});

test("base neuve : l'accueil par défaut ; écrire puis relire garde l'ordre et les tailles ; vide = tout retiré", async () => {
  const { db } = await baseDeTest();
  assert.deepEqual(lireBlocs(await lireAccueil(db)), PAR_DEFAUT);
  const l = [D("records"), P("derniere"), D("poids")];
  await ecrireAccueil(db, l);
  assert.deepEqual(lireBlocs(await lireAccueil(db)), l);
  await ecrireAccueil(db, []);
  assert.deepEqual(await lireAccueil(db), []);
});

test("n° 20 : « À suivre » en tonal seulement si la séance du jour a son Démarrer plein (Séances prévues en pleine)", () => {
  const tout = { ...BRANCHE, seances: true };
  const pleine: Bloc[] = [{ id: "a-suivre", taille: "pleine" }, { id: "seances", taille: "pleine" }];
  assert.equal(demarrerASuivreTonal(pleine, true, tout), true);
  assert.equal(demarrerASuivreTonal(pleine, false, tout), false);
  assert.equal(demarrerASuivreTonal([{ id: "a-suivre", taille: "pleine" }, { id: "seances", taille: "demie" }], true, tout), false);
  assert.equal(demarrerASuivreTonal([{ id: "a-suivre", taille: "pleine" }], true, tout), false);
  assert.equal(demarrerASuivreTonal(pleine, true, { ...tout, seances: false }), false);
});
