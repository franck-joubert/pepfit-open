// Icône : seulement l'icône adaptative. Expo génère aussi une icône ronde (android:roundIcon) et des PNG de secours
// par densité (mipmap-*dpi/ic_launcher*.webp). Des lanceurs tiers comme Smart Launcher (le Fold d'un testeur, 28/10)
// lisent ces PNG au lieu de l'icône adaptative et les posent, réduits, sur une plaque blanche. minSdk 26 : les PNG de
// secours ne servent à aucun appareil ; sans eux, tous les lanceurs prennent l'icône adaptative (calques gardés).
// Pas de calque monochrome non plus (app.json) : Smart Launcher ne sait pas lire une icône adaptative qui en a un et la
// traite alors comme une ancienne icône (réduite sur plaque blanche), comme Speedtest sans monochrome ne l'est pas.
const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

const SECOURS = ["ic_launcher.webp", "ic_launcher.png", "ic_launcher_round.webp", "ic_launcher_round.png"];

module.exports = function iconeSansRond(config) {
  config = withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application?.[0];
    if (app?.$) delete app.$["android:roundIcon"];
    return c;
  });
  return withDangerousMod(config, [
    "android",
    (c) => {
      const res = path.join(c.modRequest.platformProjectRoot, "app/src/main/res");
      for (const d of fs.readdirSync(res).filter((n) => n.startsWith("mipmap-"))) {
        for (const f of SECOURS) {
          // l'XML adaptatif (mipmap-anydpi-v26/ic_launcher.xml) reste : seuls les PNG de secours partent
          if (d !== "mipmap-anydpi-v26") fs.rmSync(path.join(res, d, f), { force: true });
        }
      }
      fs.rmSync(path.join(res, "mipmap-anydpi-v26/ic_launcher_round.xml"), { force: true });
      return c;
    },
  ]);
};
