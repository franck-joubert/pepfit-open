// Clavier de séance instantané (31/10 : « ça met trop de temps à modifier ») : une touche n'écrit que la case,
// l'écran de séance ne se redessine pas, la base est écrite en différé, regroupée, et vidée en arrière-plan.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";
import { BROUILLON_MS, clavierSeance, type CaseActive } from "../src/ecrans/clavier-seance.ts";
import { creerExercice } from "../src/db/depots/exercices.ts";
import { ajouterExerciceASeance, demarrerSeance, ecrireSaisieSerie, lireSeance, modifierSerie } from "../src/db/depots/seances.ts";
import { baseDeTest } from "./aide.ts";

const lire = (s: string) => readFileSync(new URL(`../src/${s}`, import.meta.url), "utf8");

function caseDeTest(cle: string) {
  const ecrits: string[] = [];
  const brouillons: string[] = [];
  const c: CaseActive = {
    cle,
    champ: "reps",
    decimal: false,
    temps: false,
    unite: "kg",
    paliers: null,
    saisie: { texte: "8", remplacer: true },
    ecrire: (t) => ecrits.push(t),
    brouillon: (t) => brouillons.push(t),
  };
  return { c, ecrits, brouillons };
}

test("une touche s'affiche dans la case tout de suite, sans aucune écriture synchrone en base", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { c, ecrits, brouillons } = caseDeTest("a");
    clavierSeance.ouvrir(c);
    clavierSeance.toucher("1");
    assert.deepEqual(ecrits, ["1"]);
    assert.deepEqual(brouillons, []);
    clavierSeance.toucher("2");
    clavierSeance.toucher("5");
    mock.timers.tick(BROUILLON_MS - 1);
    assert.deepEqual(brouillons, []);
    // Une seule écriture pour toute la rafale, avec la dernière valeur.
    mock.timers.tick(1);
    assert.deepEqual(ecrits, ["1", "12", "125"]);
    assert.deepEqual(brouillons, ["125"]);
    clavierSeance.fermer("a");
  } finally {
    mock.timers.reset();
  }
});

test("la case fermée enregistre elle-même : l'écriture différée est oubliée ; l'arrière-plan l'écrit tout de suite", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const a = caseDeTest("a");
    clavierSeance.ouvrir(a.c);
    clavierSeance.toucher("3");
    clavierSeance.fermer("a");
    mock.timers.tick(BROUILLON_MS * 2);
    assert.deepEqual(a.brouillons, []);
    const b = caseDeTest("b");
    clavierSeance.ouvrir(b.c);
    clavierSeance.toucher("4");
    clavierSeance.viderBrouillon();
    assert.deepEqual(b.brouillons, ["4"]);
    mock.timers.tick(BROUILLON_MS * 2);
    assert.deepEqual(b.brouillons, ["4"]);
    clavierSeance.fermer("b");
  } finally {
    mock.timers.reset();
  }
});

test("saisie en cours en base : le seul champ tapé, sans recalcul (la fin de la saisie recalcule)", async () => {
  const { db } = await baseDeTest();
  const e = await creerExercice(db, { nom: "Presse" });
  const s = await demarrerSeance(db, null);
  const [id] = await ajouterExerciceASeance(db, s, e, { nbSeries: 1, prefill: false });
  await modifierSerie(db, id!, { kg: 100, reps: 5 });
  const avant = (await lireSeance(db, s))!.exercices[0]!.series[0]!;
  await ecrireSaisieSerie(db, id!, { reps: 12 });
  const x = (await lireSeance(db, s))!.exercices[0]!.series[0]!;
  assert.equal(x.reps, 12);
  assert.equal(x.kg, 100);
  assert.equal(x.volume, avant.volume);
  await ecrireSaisieSerie(db, id!, { kg: null });
  assert.equal((await lireSeance(db, s))!.exercices[0]!.series[0]!.kg, null);
});

test("écran de séance : abonné ni à la case active ni à l'ouverture du clavier ; touche à l'appui ; molette en différé, jamais recréée à chaque chiffre", () => {
  const seance = lire("app/session.tsx");
  // Le composant de l'écran (jusqu'à la barre de repos) ne s'abonne à rien du clavier : ouvrir une case ne le redessine pas.
  const ecran = seance.slice(seance.indexOf("export default function EcranSeance"), seance.indexOf("function Repos"));
  assert.doesNotMatch(ecran, /useCaseActive|useCaseClavier|useClavierOuvert|useClavierAffiche/);
  // Le défilement, le brouillon à l'arrière-plan et la zone vide sont partagés (ui/useClavierEcran.ts) avec la séance passée
  // et l'éditeur de routine.
  assert.match(ecran, /useClavierEcran\(defilement\)/);
  const hote = lire("ui/useClavierEcran.ts");
  assert.match(hote, /clavierSeance\.estOuvert\(\)/);
  assert.match(hote, /viderBrouillon/);
  assert.doesNotMatch(hote, /useCaseActive|useCaseClavier|useClavierOuvert|useClavierAffiche/);
  const clavier = lire("ui/ClavierSeance.tsx");
  assert.match(clavier, /onPressIn=\{\(\) => \{\s*mesureClavier\.appui\(\);[^}]*if \(!clavierSeance\.toucher\(k\)\) haptique\.refus\(\);/);
  assert.match(clavier, /useDeferredValue\(/);
  // Molette : sa clé et son saut viennent de moletteDe (le champ, pas la case ni le nombre de touches : tests/budgets-perf).
  assert.match(clavier, /moletteDe\(c\)/);
  assert.match(clavier, /key=\{pour\.cle\}\s*saut=\{pour\.saut\}/);
});
