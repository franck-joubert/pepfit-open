// Muscle mis en avant dans la 3D : 5 s, changement de muscle, arrêt, fondus.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DUREE_FOCUS, ENTREE, SORTIE, focusActif, focusFini, toucherMuscle, voile } from "../src/ui/3d/focus";

test("Focus 3D : un tap met le muscle en avant 5 s, puis fondu de sortie", () => {
  const f = toucherMuscle(null, "biceps", 1000);
  assert.equal(f.muscle, "biceps");
  assert.equal(voile(f, 1000), 0);
  assert.equal(voile(f, 1000 + ENTREE), 1);
  assert.ok(focusActif(f, 1000 + DUREE_FOCUS - 1));
  assert.equal(focusActif(f, 1000 + DUREE_FOCUS), false);
  assert.equal(voile(f, 1000 + DUREE_FOCUS), 1);
  assert.ok(Math.abs(voile(f, 1000 + DUREE_FOCUS + SORTIE / 2) - 0.5) < 1e-9);
  assert.equal(voile(f, 1000 + DUREE_FOCUS + SORTIE), 0);
  assert.ok(focusFini(f, 1000 + DUREE_FOCUS + SORTIE));
  assert.ok(focusFini(null, 0));
});

test("Focus 3D : un autre muscle pendant les 5 s prend la place et relance, sans clignement", () => {
  const a = toucherMuscle(null, "biceps", 0);
  const b = toucherMuscle(a, "grand_dorsal", 3000);
  assert.equal(b.muscle, "grand_dorsal");
  assert.equal(b.fin, 3000 + DUREE_FOCUS);
  assert.equal(voile(b, 3000), 1); // le voile était plein : il le reste
  assert.ok(focusActif(b, 7000));
});

test("Focus 3D : retaper le même muscle l'arrête ; après la fin, le retaper le relance", () => {
  const a = toucherMuscle(null, "biceps", 0);
  const arret = toucherMuscle(a, "biceps", 2000);
  assert.equal(focusActif(arret, 2000), false);
  assert.equal(voile(arret, 2000), 1);
  assert.ok(focusFini(arret, 2000 + SORTIE));
  const encore = toucherMuscle(arret, "biceps", 2100);
  assert.ok(focusActif(encore, 2100));
  assert.equal(encore.fin, 2100 + DUREE_FOCUS);
  // pendant le fondu de sortie, le voile repart d'où il en est
  assert.ok(Math.abs(voile(encore, 2100) - voile(arret, 2100)) < 1e-9);
});
