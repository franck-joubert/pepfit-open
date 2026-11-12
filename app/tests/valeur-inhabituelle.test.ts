// Valeur inhabituelle à la coche : > 1,5 × le record en kg, > 2 × en réps ou durée, < 1/3 de la dernière fois ;
// sans historique : 300 kg, 100 réps, 60 min.
import assert from "node:assert/strict";
import { test } from "node:test";
import { AUCUN, meilleursDe, texteInhabituel, valeurInhabituelle } from "../src/ecrans/seance-reperes.ts";

const histo = meilleursDe([{ kg: 80, reps: 10, duree_s: null }]);
const v = (kg: number | null, reps: number | null, duree_s: number | null = null) => ({ kg, reps, duree_s });

test("au-dessus du record : 1,5 × en kg, 2 × en réps", () => {
  assert.equal(valeurInhabituelle(v(120, 8), histo), null);
  assert.equal(valeurInhabituelle(v(120.5, 8), histo), "kg");
  assert.equal(valeurInhabituelle(v(80, 20), histo), null);
  assert.equal(valeurInhabituelle(v(80, 21), histo), "reps");
  assert.equal(valeurInhabituelle(v(80, 6588), histo), "reps");
});

test("une valeur basse n'alerte jamais", () => {
  assert.equal(valeurInhabituelle(v(8, 9), histo), null);
  assert.equal(valeurInhabituelle(v(80, 1), histo), null);
});

test("durée : 2 × le record", () => {
  const g = meilleursDe([{ kg: null, reps: null, duree_s: 90 }]);
  assert.equal(valeurInhabituelle(v(null, null, 180), g), null);
  assert.equal(valeurInhabituelle(v(null, null, 181), g), "duree_s");
});

test("sans historique : 300 kg, 100 réps, 60 min", () => {
  assert.equal(valeurInhabituelle(v(300, 100, 3600), AUCUN), null);
  assert.equal(valeurInhabituelle(v(301, 10), AUCUN), "kg");
  assert.equal(valeurInhabituelle(v(50, 101), AUCUN), "reps");
  assert.equal(valeurInhabituelle(v(null, null, 3601), AUCUN), "duree_s");
  // Exercice connu en réps seulement : la première charge suit le plafond.
  assert.equal(valeurInhabituelle(v(350, 10), meilleursDe([v(null, 10)])), "kg");
});

test("champs vides ou à zéro : jamais inhabituels", () => {
  assert.equal(valeurInhabituelle(v(null, null), histo), null);
  assert.equal(valeurInhabituelle(v(0, 0), histo), null);
});

test("texte de la feuille", () => {
  const t = texteInhabituel("reps", v(80, 6588), "kg");
  assert.equal(t.titre, "Valeur de répétition inhabituelle");
  assert.equal(`${t.avant}${t.valeur}${t.apres}`, "Tu viens vraiment de faire 6\u202f588 répétitions ?");
  assert.equal(texteInhabituel("reps", v(80, 1), "kg").apres, " répétition ?");
  assert.equal(texteInhabituel("kg", v(400, 8), "kg").valeur, "400 kg");
  assert.equal(texteInhabituel("duree_s", v(null, null, 5400), "kg").valeur, "1:30:00");
});
