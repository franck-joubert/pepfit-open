// Configuration iPhone (docs/CODE-IOS.md) : textes d'usage d'Info.plist présents en français et en anglais (iOS préfère
// locales/*.json à Info.plist), mêmes textes français dans app.json, dans les plugins d'Expo et dans les plugins iOS des
// modules (plugins/ios-*.js, TEXTES), modes d'arrière-plan cohérents, manifeste de confidentialité sans suivi, eas.json.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const lire = (f: string) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"));
const expo = lire("app.json").expo;
const ios = expo.ios;
const fr = lire("locales/fr.json").ios as Record<string, string>;
const en = lire("locales/en.json").ios as Record<string, string>;
const usage = (o: Record<string, unknown>) => Object.keys(o).filter((k) => /^NS\w+UsageDescription$/.test(k));
const plugin = (nom: string) => expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === nom)?.[1] ?? {};

const require = createRequire(import.meta.url);
const pluginsIos = readdirSync(new URL("../plugins/", import.meta.url))
  .filter((f) => /^ios-.*\.js$/.test(f))
  .map((f) => [f, require(`../plugins/${f}`).TEXTES ?? {}] as [string, Record<string, string>]);

test("chaque texte d'usage d'app.json est traduit, en français identique", () => {
  for (const k of usage(ios.infoPlist)) {
    assert.equal(fr[k], ios.infoPlist[k], `fr ${k}`);
    assert.ok(en[k], `en ${k}`);
  }
  assert.deepEqual(usage(fr).sort(), usage(en).sort());
});

test("les plugins iOS des modules : leurs textes sont dans app.json et dans les deux langues", () => {
  for (const [f, textes] of pluginsIos)
    for (const [k, v] of Object.entries(textes)) {
      assert.equal(ios.infoPlist[k], v, `${f} : ${k} (app.json)`);
      assert.equal(fr[k], v, `${f} : ${k} (fr)`);
      assert.ok(en[k], `${f} : ${k} (en)`);
    }
});

test("les plugins d'Expo reprennent les textes d'app.json", () => {
  const p = ios.infoPlist;
  assert.equal(plugin("expo-camera").cameraPermission, p.NSCameraUsageDescription);
  assert.equal(plugin("expo-image-picker").cameraPermission, p.NSCameraUsageDescription);
  assert.equal(plugin("expo-image-picker").photosPermission, p.NSPhotoLibraryUsageDescription);
  assert.equal(plugin("expo-location").locationWhenInUsePermission, p.NSLocationWhenInUseUsageDescription);
  assert.equal(plugin("expo-location").locationAlwaysAndWhenInUsePermission, p.NSLocationAlwaysAndWhenInUseUsageDescription);
  assert.equal(plugin("expo-location").motionUsagePermission, p.NSMotionUsageDescription);
  assert.equal(plugin("expo-calendar").calendarPermission, p.NSCalendarsFullAccessUsageDescription);
});

test("textes : ni « ~ » ni « ≈ »", () => {
  for (const t of [...Object.values(fr), ...Object.values(en), ...Object.values(ios.infoPlist).filter((v) => typeof v === "string")])
    assert.ok(!/[~≈]/.test(t as string), t as string);
});

test("modes d'arrière-plan, tâches, liens, droits", () => {
  const modes: string[] = ios.infoPlist.UIBackgroundModes;
  for (const m of ["location", "bluetooth-central", "fetch", "processing"]) assert.ok(modes.includes(m), m);
  // « processing » sans identifiant de tâche : envoi refusé par App Store Connect
  assert.ok(ios.infoPlist.BGTaskSchedulerPermittedIdentifiers.length > 0);
  // version libre : ni lien universel ni notification du serveur
  assert.equal(ios.associatedDomains, undefined);
  assert.ok(!modes.includes("remote-notification"));
  assert.equal(ios.bundleIdentifier, "fit.pep.open");
  assert.equal(ios.config.usesNonExemptEncryption, true);
  assert.equal(ios.entitlements["com.apple.developer.healthkit"], true);
  // pas de dossier médical (Health Records) : liste d'accès vide
  assert.deepEqual(ios.entitlements["com.apple.developer.healthkit.access"], []);
});

test("manifeste de confidentialité : aucun suivi, aucune donnée collectée", () => {
  const m = ios.privacyManifests;
  assert.equal(m.NSPrivacyTracking, false);
  assert.deepEqual(m.NSPrivacyTrackingDomains, []);
  assert.deepEqual(m.NSPrivacyCollectedDataTypes, []);
  const types = m.NSPrivacyAccessedAPITypes.map((t: { NSPrivacyAccessedAPIType: string }) => t.NSPrivacyAccessedAPIType);
  for (const t of ["UserDefaults", "FileTimestamp", "DiskSpace", "SystemBootTime"]) assert.ok(types.includes(`NSPrivacyAccessedAPICategory${t}`), t);
});
