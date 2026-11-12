// expo-camera embarque par défaut le lecteur de documents ML Kit (play-services-mlkit-document-scanner) en plus du lecteur
// de codes-barres. pepfit n'utilise que les codes-barres et les codes QR : le scanner de documents est coupé dans
// gradle.properties (expo.camera.document-scanner-enabled=false, lu par expo-camera/android/build.gradle, la dépendance
// passe en compileOnly). Le lecteur de codes-barres (play-services-code-scanner) reste intact.
const { withGradleProperties } = require("expo/config-plugins");

const CLE = "expo.camera.document-scanner-enabled";

module.exports = (config) =>
  withGradleProperties(config, (c) => {
    c.modResults = c.modResults.filter((p) => !(p.type === "property" && p.key === CLE));
    c.modResults.push({ type: "property", key: CLE, value: "false" });
    return c;
  });
