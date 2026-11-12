import assert from "node:assert/strict";
import { test } from "node:test";
import { exporterJson, exportReconnu } from "../src/sync/export.ts";
import { baseDeTest } from "./aide.ts";

test("l'import accepte « application: Fonte » (anciens exports) et « pepfit »", async () => {
  assert.equal(exportReconnu({ application: "Fonte", format: 1 }), true);
  assert.equal(exportReconnu({ application: "pepfit", format: 1 }), true);
  assert.equal(exportReconnu({ application: "Autre" }), false);
  assert.equal(exportReconnu(null), false);
  const { db } = await baseDeTest(true);
  assert.equal(exportReconnu(JSON.parse(await exporterJson(db))), true);
  assert.equal(JSON.parse(await exporterJson(db)).application, "pepfit");
});
