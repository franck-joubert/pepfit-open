// iPhone : Santé (HealthKit) pour modules/pepfit-sante (docs/CODE-IOS-SANTE.md). Droit com.apple.developer.healthkit et textes
// des demandes d'accès (en français ; l'anglais est dans locales/en.json). Pas de mode d'arrière-plan : l'appli lit Santé
// quand elle est ouverte, sans livraison en fond (HKObserverQuery), comme Santé Connect.
const { withEntitlementsPlist, withInfoPlist } = require("expo/config-plugins");

const LECTURE =
  "pepfit lit dans Santé tes pas, ton sommeil, ta fréquence cardiaque, ton poids, ta composition, tes séances et tes règles pour calculer ta dépense, ta récupération et tes progrès.";
const ECRITURE = "pepfit enregistre tes séances de musculation dans Santé.";

module.exports = function iosSante(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults.NSHealthShareUsageDescription = LECTURE;
    c.modResults.NSHealthUpdateUsageDescription = ECRITURE;
    return c;
  });
  return withEntitlementsPlist(config, (c) => {
    c.modResults["com.apple.developer.healthkit"] = true;
    // vide : aucun dossier médical (Health Records)
    c.modResults["com.apple.developer.healthkit.access"] = [];
    return c;
  });
};

module.exports.LECTURE = LECTURE;
module.exports.ECRITURE = ECRITURE;
