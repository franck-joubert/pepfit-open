// iPhone : textes de la fenêtre d'accès à l'agenda (expo-calendar, src/natif/agenda/ios.ts), en français. Le plugin
// d'expo-calendar pose des textes anglais par défaut mais garde une valeur déjà là : ceux-ci les remplacent dans les deux ordres.
// Les Rappels ne sont jamais demandés (on lit les agendas « event ») ; leurs textes sont posés quand même par expo-calendar.
const { withInfoPlist } = require("expo/config-plugins");

const AGENDA = "pepfit écrit tes séances dans l'agenda que tu choisis et voit quand tu es pris, pour te proposer un créneau libre. Le nom de tes rendez-vous ne quitte pas ce téléphone.";
const RAPPELS = "pepfit n'utilise pas tes rappels.";

const CLES = {
  NSCalendarsFullAccessUsageDescription: AGENDA,
  // iOS 16 (avant l'accès complet)
  NSCalendarsUsageDescription: AGENDA,
  NSRemindersFullAccessUsageDescription: RAPPELS,
  NSRemindersUsageDescription: RAPPELS,
};

module.exports = function iosAgenda(config) {
  return withInfoPlist(config, (c) => {
    Object.assign(c.modResults, CLES);
    return c;
  });
};
module.exports.CLES = CLES;
