// Le scanner de documents ML Kit d'expo-camera est coupé au prébuild (gradle.properties), le lecteur de codes-barres reste.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);

test("plugin : expo.camera.document-scanner-enabled=false, sans toucher au lecteur de codes-barres", async () => {
  const cfg = require("../plugins/camera-sans-scanner-documents.js")({ name: "t", slug: "t" });
  const mod = cfg.mods.android.gradleProperties;
  const c = await mod({
    ...cfg,
    modRequest: { projectRoot: "", platformProjectRoot: "", modName: "gradleProperties", platform: "android", introspect: true },
    modResults: [{ type: "property", key: "expo.camera.document-scanner-enabled", value: "true" }, { type: "property", key: "autre", value: "1" }],
  });
  assert.deepEqual(c.modResults.filter((p: { key: string }) => p.key.startsWith("expo.camera")), [{ type: "property", key: "expo.camera.document-scanner-enabled", value: "false" }]);
  assert.ok(c.modResults.some((p: { key: string }) => p.key === "autre"));
  assert.ok(!c.modResults.some((p: { key: string }) => p.key === "expo.camera.barcode-scanner-enabled"));
});

test("app.json déclare le plugin", () => {
  const app = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8"));
  assert.ok(app.expo.plugins.includes("./plugins/camera-sans-scanner-documents.js"));
});
