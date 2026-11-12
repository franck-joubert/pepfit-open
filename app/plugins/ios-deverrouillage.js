// iPhone : texte de Face ID (verrou d'ouverture et liens de Connexion IA, modules/pepfit-deverrouillage/ios). Exigé par
// Apple dès qu'une appli demande Face ID.
const { withInfoPlist } = require("expo/config-plugins");

const CLES = {
  NSFaceIDUsageDescription: "pepfit utilise Face ID pour se déverrouiller et pour protéger tes liens de connexion IA.",
};

module.exports = function iosDeverrouillage(config) {
  return withInfoPlist(config, (c) => {
    Object.assign(c.modResults, CLES);
    return c;
  });
};
module.exports.CLES = CLES;
