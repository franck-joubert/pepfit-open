import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("jetons.ts est à jour avec scripts/jetons.py", () => {
  const r = spawnSync("python3", ["scripts/generer-jetons.py", "--verifier"]);
  assert.equal(r.status, 0, "relancer : npm run theme");
});
