// Suivi GPS et FC sur iPhone (modules/pepfit-suivi/ios, docs/CODE-IOS-SUIVI.md) : textes des autorisations et modes
// d'arrière-plan. location : le GPS continue écran verrouillé (indicateur bleu, autorisation « pendant l'utilisation »
// suffisante, comme le service au premier plan d'Android) ; bluetooth-central : iOS réveille l'appli à chaque mesure du
// capteur de FC et la relance pour lui (restauration d'état). Les mêmes textes, traduits, sont dans locales/*.json : iOS
// les préfère à ceux d'Info.plist. Android n'est pas touché.
const { withInfoPlist } = require("expo/config-plugins");

const TEXTES = {
  NSLocationWhenInUseUsageDescription:
    "pepfit utilise ta position pour tracer tes sorties (distance, allure, carte), même écran verrouillé, et pour trouver les salles autour de toi.",
  NSLocationAlwaysAndWhenInUseUsageDescription:
    "pepfit utilise ta position pendant tes sorties pour en mesurer la distance et l'allure, même écran verrouillé. Rien n'est suivi en dehors d'une séance.",
  NSBluetoothAlwaysUsageDescription:
    "pepfit se connecte à ta ceinture cardio ou à ta Whoop pour afficher ta fréquence cardiaque pendant la séance, même écran verrouillé.",
  NSMotionUsageDescription: "pepfit utilise le baromètre de ton iPhone pour mesurer le dénivelé de tes sorties.",
};

// Position exacte coupée dans Réglages : demande ponctuelle au départ d'une sortie (clé « suivi » de SuiviService.swift)
const PRECISION = { suivi: "pepfit a besoin de ta position exacte pour mesurer la distance et l'allure de ta sortie." };

const MODES = ["location", "bluetooth-central"];

module.exports = function iosSuivi(config) {
  return withInfoPlist(config, (c) => {
    Object.assign(c.modResults, TEXTES);
    c.modResults.NSLocationTemporaryUsageDescriptionDictionary = {
      ...c.modResults.NSLocationTemporaryUsageDescriptionDictionary,
      ...PRECISION,
    };
    const modes = Array.isArray(c.modResults.UIBackgroundModes) ? c.modResults.UIBackgroundModes : [];
    c.modResults.UIBackgroundModes = [...modes, ...MODES.filter((m) => !modes.includes(m))];
    return c;
  });
};

module.exports.TEXTES = TEXTES;
module.exports.MODES = MODES;
