// Santé Connect : autorisations au plus juste (lectures de la page Santé ; écriture des séances)
// et minSdk 26, exigé par androidx.health.connect. La justification et les <queries> sont dans le manifeste du module.
const { AndroidConfig, withAndroidManifest, withGradleProperties } = require("expo/config-plugins");

const PERMISSIONS = [
  "READ_WEIGHT", "READ_STEPS", "READ_SLEEP", "READ_RESTING_HEART_RATE", "WRITE_EXERCISE",
  // page Santé : composition, métabolisme de base, VFC, respiration, séances et kcal actives des autres applis
  "READ_BODY_FAT", "READ_LEAN_BODY_MASS", "READ_BONE_MASS", "READ_BODY_WATER_MASS", "READ_BASAL_METABOLIC_RATE",
  "READ_HEART_RATE_VARIABILITY", "READ_RESPIRATORY_RATE", "READ_EXERCISE", "READ_ACTIVE_CALORIES_BURNED",
  // distance du jour : longueur réelle du pas (kcal par pas Automatique)
  "READ_DISTANCE",
  // page Corps : la taille d'une autre appli (Whoop, Samsung Health…)
  "READ_HEIGHT",
  // activité détectée sans Whoop : la FC de la montre, pour reconnaître un effort net
  "READ_HEART_RATE",
  // suivi du cycle (planche cycle, D7) : règles et intensité, rien d'autre de cette famille (ni tests, ni glaire, ni
  // température basale, ni activité sexuelle)
  "READ_MENSTRUATION",
  // historique au-delà des 30 jours d'avant la première autorisation (reprise par tranches, src/ecrans/sante-historique.ts)
  "READ_HEALTH_DATA_HISTORY",
].map(
  (p) => `android.permission.health.${p}`,
);

module.exports = function santeConnect(config) {
  config = withAndroidManifest(config, (c) => {
    AndroidConfig.Permissions.ensurePermissions(c.modResults, PERMISSIONS);
    // compteur de pas du téléphone, en repli quand aucun appareil ne donne les pas (src/ecrans/pas-telephone.ts) ; demandée
    // à l'activation seulement, jamais au lancement
    AndroidConfig.Permissions.ensurePermissions(c.modResults, ["android.permission.ACTIVITY_RECOGNITION"]);
    return c;
  });
  return withGradleProperties(config, (c) => {
    c.modResults = c.modResults.filter((p) => !(p.type === "property" && p.key === "android.minSdkVersion"));
    c.modResults.push({ type: "property", key: "android.minSdkVersion", value: "26" });
    return c;
  });
};
