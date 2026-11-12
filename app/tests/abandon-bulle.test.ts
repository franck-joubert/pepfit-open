// Abandon depuis la bulle « séance en cours » : une lecture de la base faite avant la suppression ne ressuscite pas la bulle
// (bug du 27/10 : il fallait abandonner deux fois, et la désintégration repartait en « retour »).
import assert from "node:assert/strict";
import { test } from "node:test";
import { sansAbandonnees } from "../src/ui/bulle-seance.ts";
import { fusionner, marquerSuppression, prendreMarque, type Entree } from "../src/ui/suppression-animee.ts";

const cle = (x: { id: string }) => x.id;
const etats = (l: Entree<{ id: string }>[]) => l.map((e) => `${e.cle}:${e.etat}`);
const s1 = { id: "abandon-s1" };

test("sansAbandonnees : la séance abandonnée lue avant sa suppression compte pour absente", () => {
  const abandonnees = new Set(["abandon-s1"]);
  assert.equal(sansAbandonnees(s1, abandonnees), null);
  assert.equal(sansAbandonnees(null, abandonnees), null);
  assert.deepEqual(sansAbandonnees({ id: "autre" }, abandonnees), { id: "autre" });
  assert.deepEqual(sansAbandonnees(s1, new Set()), s1);
});

test("abandon : la bulle sort une seule fois, la lecture périmée ne la fait pas revenir", () => {
  const parties = new Set<string>();
  const abandonnees = new Set<string>();
  let e = fusionner([], [s1], cle, prendreMarque, parties);
  // Confirmer : marque, la séance est tenue pour abandonnée, la bulle quitte la liste.
  marquerSuppression(s1.id);
  abandonnees.add(s1.id);
  e = fusionner(e, [], cle, prendreMarque, parties);
  assert.deepEqual(etats(e), ["abandon-s1:sort"]);
  // La relecture partie avant la suppression rend encore la séance : filtrée, la liste reste vide, la sortie continue.
  const lu = sansAbandonnees(s1, abandonnees);
  e = fusionner(e, lu ? [lu] : [], cle, prendreMarque, parties);
  assert.deepEqual(etats(e), ["abandon-s1:sort"]);
  // Sans le filtre, la même lecture la faisait « revenir » (comme un Annuler) : c'était le double geste.
  const p2 = new Set<string>();
  marquerSuppression(s1.id);
  let f = fusionner(fusionner([], [s1], cle, prendreMarque, p2), [], cle, prendreMarque, p2);
  f = fusionner(f, [s1], cle, prendreMarque, p2);
  assert.deepEqual(etats(f), ["abandon-s1:entre"]);
});
