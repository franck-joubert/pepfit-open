// Barre « séance en cours » flottante : exercice affiché, pointillés de la bordure.
import assert from "node:assert/strict";
import { test } from "node:test";
import { avantChangementComete, cadenceComete, decalageComete, perimetre, resumerSeance } from "../src/ecrans/bandeau-seance.ts";
import { comete } from "../src/theme/mouvement.ts";
import type { SeanceDetail } from "../src/db";

const serie = (id: string, exercice_id: string, faite: number) => ({ id, exercice_id, faite, type: "normale", volume: 0, records: [] });
const exo = (id: string, nom: string, series: ReturnType<typeof serie>[]) => ({ exercice: { id, nom }, series });

function seance(blocs: ReturnType<typeof exo>[][], titre: string | null = null, routineNom: string | null = null): SeanceDetail {
  const exercices = blocs.flat();
  return {
    seance: { id: "s1", titre, debut: 1000, pause_debut: null, pause_cumul_s: 0 },
    routineNom,
    salle: null,
    exercices,
    blocs: blocs.map((b) => ({ exercices: b })),
  } as unknown as SeanceDetail;
}

test("exercice en cours : celui de la première série non faite", () => {
  const d = seance([[exo("a", "Développé couché", [serie("1", "a", 1), serie("2", "a", 1)])], [exo("b", "Écarté", [serie("3", "b", 0)])]], null, "Pectoraux");
  const r = resumerSeance(d);
  assert.equal(r.exercice, "Écarté");
  assert.equal(r.titre, "Pectoraux");
  assert.equal(r.seriesFaites, 2);
  assert.deepEqual(r.chrono, { debut: 1000, pauseDebut: null, pauseCumulS: 0 });
});

test("superset : on suit l'ordre d'exécution, tour par tour", () => {
  const d = seance([[exo("a", "Curl", [serie("1", "a", 1), serie("2", "a", 0)]), exo("b", "Triceps", [serie("3", "b", 0), serie("4", "b", 0)])]]);
  assert.equal(resumerSeance(d).exercice, "Triceps");
});

test("tout fait ou rien dedans : pas d'exercice, titre par défaut", () => {
  assert.equal(resumerSeance(seance([[exo("a", "Curl", [serie("1", "a", 1)])]])).exercice, null);
  const vide = resumerSeance(seance([]));
  assert.equal(vide.exercice, null);
  assert.equal(vide.titre, "Séance");
  assert.equal(resumerSeance(seance([], "Mon titre", "Routine")).titre, "Mon titre");
});

test("périmètre d'un rectangle arrondi", () => {
  assert.ok(Math.abs(perimetre(100, 50, 0) - 300) < 1e-9);
  assert.ok(Math.abs(perimetre(100, 100, 50) - 2 * Math.PI * 50) < 1e-9);
});

test("la comète boucle sans à-coup : un tour décale le pointillé d'un périmètre exact", () => {
  const P = perimetre(378, 54, 11);
  for (const L of [P * 0.22, P * 0.11, 3]) {
    assert.ok(Math.abs(decalageComete(L, 0, P) - decalageComete(L, 1, P) - P) < 1e-9);
  }
  // Tête de la comète à la position p·P : la queue commence L avant.
  assert.ok(Math.abs(-decalageComete(20, 0.5, 400) - (0.5 * 400 - 20)) < 1e-9);
});

test("comète au rythme de l'aura : pleine après un geste, repos après 6 s, fixe après 14 s ou en mouvement réduit", () => {
  assert.equal(cadenceComete(0, false), "pleine");
  assert.equal(cadenceComete(5999, false), "pleine");
  assert.equal(cadenceComete(6000, false), "repos");
  assert.equal(cadenceComete(13999, false), "repos");
  assert.equal(cadenceComete(14000, false), "fixe");
  assert.equal(cadenceComete(0, true), "fixe");
  assert.equal(comete.tour, 1000);
  assert.equal(comete.periodeRepos, 4000);
});

test("comète : prochain changement de cadence sans geste", () => {
  assert.equal(avantChangementComete(0, false), 6000);
  assert.equal(avantChangementComete(5000, false), 1000);
  assert.equal(avantChangementComete(6000, false), 8000);
  assert.equal(avantChangementComete(14000, false), null);
  assert.equal(avantChangementComete(0, true), null);
});
