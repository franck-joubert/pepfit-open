// Barre de repos et clavier (retour du 07/11) : le temps restant reste visible quand le clavier du téléphone s'ouvre
// (note, titre de séance, champ d'un exercice). Choix de la position et décalage purs ; l'écran ne s'abonne toujours pas au clavier.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decalageSurClavier, positionRepos } from "../src/ecrans/repos-barre.ts";

const lire = (s: string) => readFileSync(new URL(`../src/${s}`, import.meta.url), "utf8");

test("position : aucun clavier, la bande ; pavé de pepfit, le pavé ; clavier du téléphone, ce clavier ; le pavé gagne", () => {
  assert.equal(positionRepos({ clavierSeance: false, clavierSysteme: false }), "bande");
  assert.equal(positionRepos({ clavierSeance: true, clavierSysteme: false }), "clavierSeance");
  assert.equal(positionRepos({ clavierSeance: false, clavierSysteme: true }), "clavierSysteme");
  assert.equal(positionRepos({ clavierSeance: true, clavierSysteme: true }), "clavierSeance");
});

test("décalage : bord bas de la barre moins haut du clavier, jamais négatif, jamais plus que le clavier", () => {
  // Écran de 2000, clavier de 700 (haut à 1300), barre dont le bas est à 1930 (bande de 70 dessous) : elle monte de 630.
  assert.equal(decalageSurClavier(1930, 1300, 700), 630);
  // Déjà posée sur le clavier (mesurée après décalage, ramenée à sa place sans décalage) : même résultat.
  assert.equal(decalageSurClavier(1300 + 630, 1300, 700), 630);
  // Clavier plus bas que la barre (clavier flottant en bas) : rien à monter.
  assert.equal(decalageSurClavier(1200, 1300, 700), 0);
  // Clavier flottant en haut d'écran : la barre ne monte pas de plus que la hauteur du clavier.
  assert.equal(decalageSurClavier(1930, 200, 300), 300);
});

test("seule la barre de repos suit le clavier du téléphone ; l'écran de séance ne s'y abonne pas (audit M5)", () => {
  const seance = lire("app/session.tsx");
  const debut = seance.indexOf("export default function EcranSeance");
  const repos = seance.indexOf("function Repos");
  const ecran = seance.slice(debut, repos);
  assert.doesNotMatch(ecran, /useClavier\(|Keyboard\.addListener|clavierSysteme/);
  const barre = seance.slice(repos, seance.indexOf("/** Après la pose de l'écran"));
  assert.match(barre, /useClavier\(\)/);
  assert.match(barre, /positionRepos\(/);
  // La liste se resserre déjà au-dessus du clavier : en « padding », elle se recale d'elle-même quand la barre lui prend la place.
  assert.match(seance, /<KeyboardAvoidingView style=\{\{ flex: 1 \}\} behavior="padding">/);
});
