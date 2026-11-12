# pepfit open

An offline-first strength-training and health app for Android, released under the GNU AGPL v3 (`AGPL-3.0-only`).

This is the **local edition** of pepfit: everything lives in a SQLite database on your phone. There is no account,
no pepfit server and no social layer. The app never phones home.

## What it does

- Log workouts (sets, reps, loads, rest timer, supersets), programs and routines, with an exercise catalogue,
  pictograms and a 3D body model.
- Track outdoor sessions with GPS (distance, pace, elevation), save private routes ("circuits"), import GPX files.
- Nutrition log with barcode scanning (Open Food Facts), import from Fitatu and Hevy.
- Health dashboards: readiness gauges, sleep, heart rate, body composition, cycle.
- Optional connections, each with **your own developer credentials** (see [SELF-HOSTING.md](SELF-HOSTING.md)):
  Whoop, Withings and Polar (official APIs), plus Health Connect and Bluetooth heart-rate straps.
- Daily steps from Health Connect, or, without it, from the phone's own step sensor (Android `TYPE_STEP_COUNTER`,
  `ACTIVITY_RECOGNITION` permission, no Google service).
- Interface in French, English, German and Spanish.

## Repository layout

```
app/              Expo / React Native application (TypeScript)
  src/            screens (src/app, expo-router), domain code, SQLite migrations, i18n
  modules/        local native modules (Kotlin / Swift): alarms, Health Connect, GPS tracking…
  plugins/        Expo config plugins
  tests/          unit tests (node:test)
  assets/         fonts, pictograms, 3D models, sounds
relais/           static OAuth return page (needed for Withings, optional for the others)
```

## Build

Requirements: Node 22, JDK 21, the Android SDK (platform 37, NDK 27, CMake 3.22), Python 3.

```bash
cd app
npm ci
npx tsc --noEmit        # type check
npm test                # unit tests
DEBUG=1 ANDROID_HOME=~/Android/Sdk ./build-android.sh   # -> app/dist/pepfit.apk
```

The app id is `fit.pep.open` and its link scheme `pepfitopen://`: it installs next to the Play Store edition (`fit.pep`)
without conflict.

`build-android.sh` runs `expo prebuild` then Gradle (`--no-daemon`, bounded memory). Without `DEBUG=1` it builds a
release APK, signed with your key if `PEPFIT_KEYSTORE`, `PEPFIT_KEY_ALIAS`, `PEPFIT_STORE_PASSWORD` and
`PEPFIT_KEY_PASSWORD` are set, with the debug key otherwise.

Whoop, Withings and Polar credentials are entered in the app (Settings › Connections › My API credentials). For a
personal build you may prefill them with environment variables; see [SELF-HOSTING.md](SELF-HOSTING.md).

## Non-free dependencies

Some Expo modules pull Google libraries. They block an F-Droid build as is:

| Dependency | Pulled by | Use in this edition | Way out |
|---|---|---|---|
| `com.google.firebase:firebase-messaging` | `expo-notifications` | none (reminders are local) | local notifications only (own module or a fork without FCM) |
| `com.google.mlkit:barcode-scanning`, `play-services-code-scanner`, `camera-mlkit-vision` | `expo-camera` | food barcodes | `expo.camera.barcode-scanner-enabled=false` and a free reader (ZXing / zxing-cpp) |
| `com.google.android.gms:play-services-location` | `expo-location` | GPS of outdoor sessions | own module on `LocationManager` (background tracking is already native, `modules/pepfit-suivi`) |

The ML Kit document scanner is already left out (`plugins/camera-sans-scanner-documents.js`). The Fitatu import reads
the session of Fitatu's web app (a non-public service): F-Droid would flag it "NonFreeNet".

## License

Copyright (C) 2025-2026 Franck Joubert.

- Source code: **GNU Affero General Public License v3.0 only** (SPDX: `AGPL-3.0-only`), see [LICENSE](LICENSE).
- Artwork created for pepfit (pictograms, illustrations, 3D models, sounds): **CC BY-SA 4.0** (SPDX: `CC-BY-SA-4.0`),
  see [LICENSE-ASSETS](LICENSE-ASSETS) for the directories.
- The Inter font: SIL Open Font License 1.1 ([app/assets/fonts/OFL.txt](app/assets/fonts/OFL.txt)).
- Per-file licensing in the [REUSE](https://reuse.software) format: [REUSE.toml](REUSE.toml); summary in [NOTICE](NOTICE).

The **pepfit name and logo belong to Franck Joubert and are not covered by these licenses**: see
[TRADEMARKS.md](TRADEMARKS.md). If you distribute a modified version, give it another name and icon.

Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).
