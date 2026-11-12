#!/bin/bash
# Builds app/dist/pepfit.apk locally (no Expo cloud): expo prebuild, then Gradle --no-daemon with bounded memory.
# Needs an Android SDK (ANDROID_HOME) and JDK 17 or 21 (JAVA_HOME / java on the PATH).
# Release signing: set PEPFIT_KEYSTORE, PEPFIT_KEY_ALIAS, PEPFIT_STORE_PASSWORD and PEPFIT_KEY_PASSWORD in the environment
# (plugins/signature-release.js); without them the debug key is used. DEBUG=1 builds assembleDebug instead.
# ABIS=arm64-v8a limits the native ABIs (default: arm64-v8a,x86_64).
set -euo pipefail
cd "$(dirname "$0")"

: "${ANDROID_HOME:?set ANDROID_HOME to your Android SDK}"
export NODE_ENV=production

python3 scripts/generer-jetons.py

# Dependency patches (patches/, patch-package): applied by npm ci's postinstall, re-applied here (no-op if already done).
if [ -d patches ]; then
  npx --no-install patch-package || { echo "patch-package missing (run npm ci in app/) or a patch was refused" >&2; exit 1; }
fi

# Prebuild again when the native configuration changes.
natif=$(find app.json package-lock.json assets modules plugins -type f -print0 2>/dev/null | sort -z | xargs -0 sha256sum | sha256sum | cut -c1-16)
if [ ! -d android ] || [ "${PREBUILD:-0}" = 1 ] || [ "$(cat .prebuild.hash 2>/dev/null)" != "$natif" ]; then
  npx expo prebuild -p android --no-install --clean
  echo "$natif" > .prebuild.hash
fi

sed -i '/^org.gradle.jvmargs=/d;/^reactNativeArchitectures=/d;/^org.gradle.workers.max=/d;/^org.gradle.parallel=/d;/^android.enableMinifyInReleaseBuilds=/d;/^kotlin.compiler.execution.strategy=/d' android/gradle.properties
[ -z "$(tail -c1 android/gradle.properties)" ] || echo >> android/gradle.properties
cat >> android/gradle.properties <<'P'
org.gradle.jvmargs=-Xmx2560m -XX:MaxMetaspaceSize=512m
kotlin.compiler.execution.strategy=in-process
org.gradle.workers.max=2
org.gradle.parallel=false
android.enableMinifyInReleaseBuilds=false
P
echo "reactNativeArchitectures=${ABIS:-arm64-v8a,x86_64}" >> android/gradle.properties
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

if [ "${DEBUG:-0}" = 1 ]; then tache=assembleDebug; sortie=apk/debug/app-debug.apk
else tache=assembleRelease; sortie=apk/release/app-release.apk; fi
(cd android && ./gradlew --no-daemon ":app:$tache")

mkdir -p dist
cp "android/app/build/outputs/$sortie" dist/pepfit.apk
ls -l dist/pepfit.apk
