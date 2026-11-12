// Retour Android à la racine : l'appli passe à l'arrière-plan, l'activité n'est jamais détruite.
// Le modèle d'Expo laisse Android 12+ décider : il ne met en arrière-plan qu'une tâche lancée par l'icône. Lancée par un
// lien pepfitopen:// (ou une notification), l'activité était détruite alors que le moteur JS restait vivant ; le lien suivant
// montait une seconde racine React, et le démontage tardif de l'ancienne déliait le routeur global d'expo-router
// (« The imperative router is unavailable before the first render has finished » au toucher suivant). Une seule racine.
const { withMainActivity } = require("expo/config-plugins");

const DEBUT = "override fun invokeDefaultOnBackPressed() {";

module.exports = function retourRacine(config) {
  return withMainActivity(config, (c) => {
    const src = c.modResults.contents;
    const i = src.indexOf(DEBUT);
    if (i < 0) throw new Error("retour-racine : invokeDefaultOnBackPressed introuvable dans MainActivity");
    // fin de la méthode : l'accolade qui ferme celle ouverte par DEBUT
    let n = 0, j = i + DEBUT.length - 1;
    for (; j < src.length; j++) {
      if (src[j] === "{") n++;
      else if (src[j] === "}" && --n === 0) break;
    }
    const corps = `${DEBUT}
      // racine de la tâche : arrière-plan (jamais finish, une seule racine React) ; sinon l'activité se ferme
      if (!moveTaskToBack(false)) super.invokeDefaultOnBackPressed()
  }`;
    c.modResults.contents = src.slice(0, i) + corps + src.slice(j + 1);
    return c;
  });
};
