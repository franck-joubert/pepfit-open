// Signature de publication : le build release est signé par votre clé quand le build reçoit ses variables d'environnement
// (PEPFIT_KEYSTORE, PEPFIT_KEY_ALIAS, PEPFIT_STORE_PASSWORD, PEPFIT_KEY_PASSWORD). Sans elles, repli sur la clé de debug,
// sauf avec PEPFIT_UNSIGNED=1 : APK non signé (app-release-unsigned.apk), celui que F-Droid signe lui-même.
// Aucune valeur n'est écrite ici ni dans android/ : Gradle lit l'environnement. android/ est régénéré par prebuild, ce plugin
// le reconfigure à chaque fois.
const { withAppBuildGradle } = require("expo/config-plugins");

const CONFIG = `
        release {
            def ks = System.getenv('PEPFIT_KEYSTORE')
            if (ks) {
                storeFile file(ks)
                storePassword System.getenv('PEPFIT_STORE_PASSWORD')
                keyAlias System.getenv('PEPFIT_KEY_ALIAS')
                keyPassword System.getenv('PEPFIT_KEY_PASSWORD')
            }
        }`;

module.exports = function signatureRelease(config) {
  return withAppBuildGradle(config, (c) => {
    let s = c.modResults.contents;
    if (s.includes("PEPFIT_KEYSTORE")) return c;
    const a = s.indexOf("signingConfigs {");
    const b = s.indexOf("buildTypes {");
    if (a < 0 || b < 0) throw new Error("signature-release : signingConfigs ou buildTypes introuvable dans app/build.gradle");
    // fin du bloc debug (première accolade fermante après « debug { »)
    const d = s.indexOf("}", s.indexOf("debug {", a)) + 1;
    s = s.slice(0, d) + CONFIG + s.slice(d);
    const r = s.indexOf("release {", s.indexOf("buildTypes {"));
    const l = s.indexOf("signingConfig signingConfigs.debug", r);
    if (r < 0 || l < 0) throw new Error("signature-release : signingConfig du build release introuvable");
    s =
      s.slice(0, l) +
      "signingConfig System.getenv('PEPFIT_KEYSTORE') ? signingConfigs.release : (System.getenv('PEPFIT_UNSIGNED') ? null : signingConfigs.debug)" +
      s.slice(l + "signingConfig signingConfigs.debug".length);
    c.modResults.contents = s;
    return c;
  });
};
