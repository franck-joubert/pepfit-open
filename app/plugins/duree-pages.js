// Écrans poussés (revue finale du 30/10, n° 59) : sur Android, react-native-screens joue des animations XML à durée fixe
// (fondu qui monte : 350 ms, retour 250 ; poussée de côté : 400) ; `animationDuration` n'est lu que sur iOS. Le module de
// l'appli redéclare ces ressources sous le même nom (celles de l'appli passent devant celles des bibliothèques) avec les
// jetons de src/theme/mouvement.ts : duree.page (260), duree.pageRetour (220), courbes « sortie » et « fermeture ».
// Écran poussé : il monte de 8 % en fondu ; retour : il redescend en s'effaçant. Page du mois (« slide_from_right ») : elle
// arrive par la droite et pousse l'onglet à gauche, retour inverse (planche planification : poussée depuis la droite, 260 ms).
const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("expo/config-plugins");

/** Mêmes valeurs que duree.page, duree.pageRetour, duree.entree et courbe (tests/mouvement.test.ts les compare). */
const DUREES = { page: 260, retour: 220, fondu: 200 };
const COURBES = { sortie: [0.23, 1, 0.32, 1], fermeture: [0.3, 0, 1, 1] };

const NS = 'xmlns:android="http://schemas.android.com/apk/res/android"';
const courbe = ([x1, y1, x2, y2]) =>
  `<pathInterpolator ${NS} android:controlX1="${x1}" android:controlY1="${y1}" android:controlX2="${x2}" android:controlY2="${y2}" />\n`;
const glisse = (axe, de, vers, ms, c = "pepfit_sortie") =>
  `<translate ${NS} android:interpolator="@interpolator/${c}" android:duration="${ms}" android:from${axe}Delta="${de}" android:to${axe}Delta="${vers}" />\n`;
const immobile = (ms) => `<alpha ${NS} android:fromAlpha="1.0" android:toAlpha="1.0" android:duration="${ms}" />\n`;

const RESSOURCES = {
  "interpolator/pepfit_sortie.xml": courbe(COURBES.sortie),
  "interpolator/pepfit_fermeture.xml": courbe(COURBES.fermeture),
  // Écran poussé : fondu en 200 ms et montée de 8 % en 260 ms ; l'écran dessous reste le même temps.
  "anim/rns_fade_from_bottom.xml": `<set ${NS} android:shareInterpolator="false">
  <alpha android:fromAlpha="0.0" android:toAlpha="1.0" android:interpolator="@interpolator/pepfit_sortie" android:duration="${DUREES.fondu}" />
  <translate android:fromYDelta="8%" android:toYDelta="0" android:interpolator="@interpolator/pepfit_sortie" android:duration="${DUREES.page}" />
</set>
`,
  "anim/rns_no_animation_350.xml": immobile(DUREES.page),
  // Retour : redescend de 8 % en 220 ms (courbe fermeture), s'efface sur la fin.
  "anim/rns_fade_to_bottom.xml": `<set ${NS} android:shareInterpolator="false">
  <alpha android:fromAlpha="1.0" android:toAlpha="0.0" android:interpolator="@android:interpolator/linear" android:startOffset="${DUREES.retour - 150}" android:duration="150" />
  <translate android:fromYDelta="0%" android:toYDelta="8%" android:interpolator="@interpolator/pepfit_fermeture" android:duration="${DUREES.retour}" />
</set>
`,
  "anim/rns_no_animation_250.xml": immobile(DUREES.retour),
  // Poussée depuis la droite (page du mois) et son retour.
  "anim/rns_slide_in_from_right.xml": glisse("X", "100%", "0%", DUREES.page),
  "anim/rns_slide_out_to_left.xml": glisse("X", "0%", "-100%", DUREES.page),
  "anim/rns_slide_in_from_left.xml": glisse("X", "-100%", "0%", DUREES.retour),
  "anim/rns_slide_out_to_right.xml": glisse("X", "0%", "100%", DUREES.retour),
};

function dureePages(config) {
  return withDangerousMod(config, [
    "android",
    (c) => {
      const res = path.join(c.modRequest.platformProjectRoot, "app/src/main/res");
      for (const [f, xml] of Object.entries(RESSOURCES)) {
        fs.mkdirSync(path.dirname(path.join(res, f)), { recursive: true });
        fs.writeFileSync(path.join(res, f), `<?xml version="1.0" encoding="utf-8"?>\n${xml}`);
      }
      return c;
    },
  ]);
}

module.exports = dureePages;
module.exports.DUREES = DUREES;
module.exports.COURBES = COURBES;
module.exports.RESSOURCES = RESSOURCES;
