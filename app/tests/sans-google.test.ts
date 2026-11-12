// Édition F-Droid : aucune bibliothèque Google non libre dans l'APK Android. Firebase (expo-notifications), ML Kit / Play
// Services (expo-camera) et Install Referrer (expo-application) sont retirés par patches/ (patch-package) ; expo-location, qui tire play-services-location, n'est pas
// lié sur Android : modules/pepfit-position (LocationManager) le remplace derrière src/natif/position.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const lire = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const NON_LIBRE = /com\.google\.(android\.gms|firebase|mlkit)|com\.android\.installreferrer/;

/** Les lignes ajoutées par un patch. */
const ajouts = (patch: string) =>
  lire(`patches/${readdirSync(new URL("../patches", import.meta.url)).find((f) => f.startsWith(`${patch}+`))}`)
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"));
const retraits = (patch: string) =>
  lire(`patches/${readdirSync(new URL("../patches", import.meta.url)).find((f) => f.startsWith(`${patch}+`))}`)
    .split("\n")
    .filter((l) => l.startsWith("-") && !l.startsWith("---"));

test("expo-notifications : firebase-messaging retiré, rien de Google ajouté", () => {
  assert.ok(retraits("expo-notifications").some((l) => l.includes("com.google.firebase:firebase-messaging")));
  assert.ok(retraits("expo-notifications").some((l) => l.includes("ExpoFirebaseMessagingService")));
  assert.ok(!ajouts("expo-notifications").some((l) => NON_LIBRE.test(l)));
  // le plugin n'écrit plus les réglages FCM (com.google.firebase.messaging.default_notification_*) dans le manifeste
  for (const cle of ["ICON", "ICON_COLOR", "DEFAULT_CHANNEL_ID"]) {
    const ajout = `addMetaDataItemToMainApplication(mainApplication, META_DATA_FCM_NOTIFICATION_${cle},`;
    assert.ok(retraits("expo-notifications").some((l) => l.includes(ajout)), cle);
    assert.ok(!ajouts("expo-notifications").some((l) => l.includes(ajout)), cle);
  }
});

test("expo-camera : ML Kit et Play Services retirés, ZXing à la place", () => {
  for (const dep of ["play-services-code-scanner", "com.google.mlkit:barcode-scanning", "play-services-mlkit-document-scanner"]) {
    assert.ok(retraits("expo-camera").some((l) => l.includes(dep)), dep);
  }
  assert.ok(ajouts("expo-camera").some((l) => l.includes('implementation "com.google.zxing:core:')));
  assert.ok(!ajouts("expo-camera").some((l) => NON_LIBRE.test(l)));
});

test("expo-application : Install Referrer (Play Store) retiré", () => {
  assert.ok(retraits("expo-application").some((l) => l.includes("com.android.installreferrer:installreferrer")));
  assert.ok(!ajouts("expo-application").some((l) => NON_LIBRE.test(l)));
});

test("expo-location n'est pas lié sur Android, pepfit-position le remplace", () => {
  const pkg = JSON.parse(lire("package.json"));
  assert.deepEqual(pkg.expo.autolinking.android.exclude, ["expo-location"]);
  // Les modules Expo arrivent aussi en AAR précompilés (local-maven-repo) : sans cela, les patchs ne seraient pas compilés
  // et les dépendances Google d'origine reviendraient par leur POM. F-Droid veut de toute façon tout compiler.
  assert.deepEqual(pkg.expo.autolinking.android.buildFromSource, [".*"]);
  assert.match(lire("src/natif/position/index.android.ts"), /requireNativeModule<Natif>\("PepfitPosition"\)/);
  assert.doesNotMatch(lire("src/natif/position/index.android.ts"), /from "expo-location"/);
  assert.doesNotMatch(lire("modules/pepfit-position/android/build.gradle"), NON_LIBRE);
});

test("seul src/natif/position importe expo-location", () => {
  const fichiers = readdirSync(new URL("../src", import.meta.url), { recursive: true, encoding: "utf8" }).filter((f) =>
    /\.tsx?$/.test(f),
  );
  const importeurs = fichiers.filter((f) => /from "expo-location"/.test(lire(`src/${f}`)));
  assert.deepEqual(importeurs, ["natif/position/index.ts"]);
});

test("modules locaux : aucune dépendance Google non libre", () => {
  for (const m of readdirSync(new URL("../modules", import.meta.url))) {
    let gradle = "";
    try {
      gradle = lire(`modules/${m}/android/build.gradle`);
    } catch {
      continue;
    }
    assert.doesNotMatch(gradle, NON_LIBRE, m);
  }
});
