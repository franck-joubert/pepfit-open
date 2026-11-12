// iPhone : rappels, alarmes et notifications du serveur (docs/CODE-IOS-RAPPELS.md). Au prebuild iOS seulement (Android
// inchangé) :
//  - aps-environment : le droit de recevoir les notifications d'Apple (APNs), donc un jeton pour le serveur
//    (natif/notifications-coach). « development » s'il manque (déjà posé par expo-notifications) ; l'export pour l'App Store
//    le passe en « production » d'après le profil de distribution ;
//  - com.apple.developer.usernotifications.time-sensitive : les « Notifications urgentes » (fin du repos, fin de sieste),
//    qui passent une Concentration si l'utilisateur les laisse allumées. Capacité à cocher sur l'identifiant de l'appli
//    chez Apple (EAS la synchronise d'après ce droit) ;
//  - UIBackgroundModes « remote-notification » (une notification du serveur réveille l'appli) et « fetch » (demandé par la
//    mission ; à retirer si la revue d'Apple demande à quoi il sert : aucune tâche de fond ne l'utilise aujourd'hui) ;
//  - les sons des alarmes (assets/sons, scripts/sons-ios.py) copiés dans l'appli : une notification iOS ne joue que des
//    sons de son bundle.
const { withEntitlementsPlist, withInfoPlist, withXcodeProject } = require("expo/config-plugins");
const { setNotificationSounds } = require("expo-notifications/plugin/build/withNotificationsIOS");

const SONS = ["./assets/sons/pepfit-repos.wav", "./assets/sons/pepfit-reveil.wav", "./assets/sons/pepfit-silence.wav"];
const MODES_DE_FOND = ["remote-notification", "fetch"];

module.exports = function iosRappels(config) {
  config = withEntitlementsPlist(config, (c) => {
    if (!c.modResults["aps-environment"]) c.modResults["aps-environment"] = "development";
    c.modResults["com.apple.developer.usernotifications.time-sensitive"] = true;
    return c;
  });
  config = withInfoPlist(config, (c) => {
    const modes = Array.isArray(c.modResults.UIBackgroundModes) ? c.modResults.UIBackgroundModes : [];
    for (const m of MODES_DE_FOND) if (!modes.includes(m)) modes.push(m);
    c.modResults.UIBackgroundModes = modes;
    return c;
  });
  return withXcodeProject(config, (c) => {
    c.modResults = setNotificationSounds(c.modRequest.projectRoot, { sounds: SONS, project: c.modResults, projectName: c.modRequest.projectName });
    return c;
  });
};
