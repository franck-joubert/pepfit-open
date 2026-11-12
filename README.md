# pepfit open

An offline-first strength-training and health app for Android, released under the GNU AGPL v3 (`AGPL-3.0-only`).

This is the **local edition** of pepfit: everything lives in a SQLite database on your phone. There is no account,
no pepfit server and no social layer. The app never phones home.

## What it does

- Log workouts (sets, reps, loads, rest timer, supersets), programs and routines, with an exercise catalogue,
  pictograms and a 3D body model.
- Track outdoor sessions with GPS (distance, pace, elevation), save private routes ("circuits"), import GPX files.
- Nutrition log with barcode scanning (Open Food Facts); workouts import from Hevy.
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

## No Google library (F-Droid)

The Android build contains no Google Play Services, Firebase nor ML Kit code, so it can be built by F-Droid
(`metadata/fit.pep.open.yml`, store texts in `fastlane/metadata/android/`). Three Expo modules pulled them; they are
replaced or patched (`app/patches/`, applied by `patch-package` at `npm ci`):

| Was | Pulled by | Now |
|---|---|---|
| `com.google.firebase:firebase-messaging` | `expo-notifications` | removed: reminders are local notifications, there is no push |
| `com.google.mlkit:barcode-scanning`, `play-services-code-scanner`, ML Kit document scanner | `expo-camera` | food barcodes read by [ZXing](https://github.com/zxing/zxing) (`com.google.zxing:core`, Apache-2.0) on the CameraX frames |
| `com.google.android.gms:play-services-location` | `expo-location` | not linked on Android: `modules/pepfit-position` on the platform `LocationManager` (background tracking is already native, `modules/pepfit-suivi`) |

`app/tests/sans-google.test.ts` keeps it that way. Health Connect (`androidx.health.connect`) is an AndroidX library
under Apache-2.0 and stays.

The recipe builds an unsigned release (`PEPFIT_UNSIGNED=1`) for F-Droid to sign, compiles every Expo module from
source (`expo.autolinking.android.buildFromSource` in `app/package.json`) and declares one anti-feature,
`NonFreeAssets`: the pepfit logo and icon are reserved (see [TRADEMARKS.md](TRADEMARKS.md), which allows redistributing
the unmodified app) and the app shows the logos of the services it connects to. Its Codeberg addresses are a proposal
until the repository exists.

The app only talks to official, documented APIs (Whoop, Withings, Polar, with your own credentials) and to open data
services (Open Food Facts, OpenStreetMap through Overpass and Photon, OpenFreeMap tiles). The Fitatu import of the Play
Store edition, which read a private web API, is not part of this edition.

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
