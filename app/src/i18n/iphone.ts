import type { Langue } from "./detection";
import type { CleSimple } from "./fr";

// Textes qui nomment Android, remplacés sur iPhone (src/i18n/plateforme.ios.ts) ; même clé, même sens. Seulement ceux d'écrans
// visibles sur iPhone : la batterie « Non restreinte » (gps.batterie.*, reglages.batterieOptimisee) n'y est pas montrée.
type Surcharges = Partial<Record<CleSimple, string>>;

const fr: Surcharges = {
  "agenda.refus.texte": "pepfit ne peut ni lire ni écrire ton agenda. Autorise‑le dans les réglages de l'iPhone, puis reviens ici.",
  "agenda.refus.ouvrir": "Ouvrir les réglages de l'iPhone",
  "agenda.android.titre": "Accès à l'agenda dans l'iPhone",
  "agenda.consent.note": "L'iPhone va te demander l'accès à ton agenda. Tu peux le retirer quand tu veux.",
  "verrou.moyens": "Face ID, Touch ID ou code de l'iPhone",
  "verrou.verrouilleSous": "Face ID, Touch ID ou code de l'iPhone.",
  "verrou.sansVerrou": "Il faut d'abord un code sur l'iPhone",
  "verrou.sansVerrouAide": "Ajoute un code dans Réglages › Face ID et code, puis reviens ici.",
  "verrou.ouvrirReglages": "Ouvrir les réglages",
  "verrou.indisponible": "Le verrou n'est pas disponible sur cet iPhone.",
  "verrou.explication": "pepfit prend le verrou de ton iPhone : rien de plus à retenir. Verrouillé, son aperçu est masqué quand tu changes d'app ; le minuteur de repos reste visible dans les notifications.",
  "notifs.repos.corps": "pepfit te prévient à la fin de chaque repos, même téléphone verrouillé ou appli fermée. L'iPhone va te demander d'autoriser les notifications.",
  "notifs.suivi.corps": "Pendant le suivi, le temps et la distance restent affichés dans une notification, écran éteint. L'iPhone va te demander d'autoriser les notifications.",
  "notifs.position.corps": "pepfit trace ton parcours, ta distance et ton allure avec le GPS. L'iPhone va te demander d'autoriser la position.",
  "notifs.appareils.corps": "pepfit lit ta fréquence cardiaque en Bluetooth (Whoop, ceinture cardio). L'iPhone va te demander d'autoriser le Bluetooth ; pepfit ne s'en sert pas pour te localiser.",
  "notifs.rappel.corps": "Pour te rappeler tes séances et tes repas à l'heure prévue, pepfit a besoin des notifications. L'iPhone va te demander de les autoriser.",
  "notifs.sieste.corps": "pepfit te réveille à la fin de la sieste, même téléphone verrouillé ou appli fermée. L'iPhone va te demander d'autoriser les notifications.",
};

const en: Surcharges = {
  "agenda.refus.texte": "pepfit can't read or write your calendar. Allow it in iPhone Settings, then come back here.",
  "agenda.refus.ouvrir": "Open Settings",
  "agenda.android.titre": "Calendar access on iPhone",
  "agenda.consent.note": "Your iPhone will ask you for access to your calendar. You can remove it whenever you like.",
  "verrou.moyens": "Face ID, Touch ID or iPhone passcode",
  "verrou.verrouilleSous": "Face ID, Touch ID or iPhone passcode.",
  "verrou.sansVerrou": "Your iPhone needs a passcode first",
  "verrou.sansVerrouAide": "Add a passcode in Settings › Face ID & Passcode, then come back here.",
  "verrou.ouvrirReglages": "Open Settings",
  "verrou.indisponible": "App lock isn't available on this iPhone.",
  "verrou.explication": "pepfit uses your iPhone's lock: nothing more to remember. While locked, its preview is hidden in the app switcher; the rest timer stays visible in notifications.",
  "notifs.repos.corps": "pepfit lets you know when each rest ends, even with the phone locked or the app closed. Your iPhone will ask you to allow notifications.",
  "notifs.suivi.corps": "While tracking, time and distance stay in a notification with the screen off. Your iPhone will ask you to allow notifications.",
  "notifs.position.corps": "pepfit tracks your route, distance and pace with GPS. Your iPhone will ask you to allow location.",
  "notifs.appareils.corps": "pepfit reads your heart rate over Bluetooth (Whoop, chest strap). Your iPhone will ask you to allow Bluetooth; pepfit doesn't use it to locate you.",
  "notifs.rappel.corps": "To remind you of your workouts and meals on time, pepfit needs notifications. Your iPhone will ask you to allow them.",
  "notifs.sieste.corps": "pepfit wakes you at the end of your nap, even with the phone locked or the app closed. Your iPhone will ask you to allow notifications.",
};

const de: Surcharges = {
  "agenda.refus.texte": "pepfit kann deinen Kalender weder lesen noch bearbeiten. Erlaube es in den iPhone-Einstellungen und komm dann zurück.",
  "agenda.refus.ouvrir": "Einstellungen öffnen",
  "agenda.android.titre": "Kalenderzugriff auf dem iPhone",
  "agenda.consent.note": "Dein iPhone fragt nach dem Zugriff auf deinen Kalender. Du kannst ihn jederzeit wieder entziehen.",
  "verrou.moyens": "Face ID, Touch ID oder iPhone-Code",
  "verrou.verrouilleSous": "Face ID, Touch ID oder iPhone-Code.",
  "verrou.sansVerrou": "Dein iPhone braucht zuerst einen Code",
  "verrou.sansVerrouAide": "Lege einen Code fest unter Einstellungen › Face ID & Code und komm dann zurück.",
  "verrou.ouvrirReglages": "Einstellungen öffnen",
  "verrou.indisponible": "Die App-Sperre ist auf diesem iPhone nicht verfügbar.",
  "verrou.explication": "pepfit nutzt die Sperre deines iPhones: Du musst dir nichts weiter merken. Gesperrt ist die Vorschau im App-Umschalter ausgeblendet; der Pausen-Timer bleibt in den Benachrichtigungen sichtbar.",
  "notifs.repos.corps": "pepfit sagt dir Bescheid, wenn eine Pause endet, auch bei gesperrtem Telefon oder geschlossener App. Dein iPhone fragt, ob du Benachrichtigungen erlaubst. Im Stumm-Modus vibriert es nur.",
  "notifs.suivi.corps": "Während der Aufzeichnung bleiben Zeit und Distanz bei ausgeschaltetem Bildschirm in einer Benachrichtigung. Dein iPhone fragt, ob du Benachrichtigungen erlaubst.",
  "notifs.position.corps": "pepfit zeichnet deine Strecke, Distanz und Pace per GPS auf. Dein iPhone fragt, ob du den Standortzugriff erlaubst.",
  "notifs.appareils.corps": "pepfit liest deine Herzfrequenz per Bluetooth (Whoop, Brustgurt). Dein iPhone fragt, ob du Bluetooth erlaubst; pepfit nutzt es nicht, um dich zu orten.",
  "notifs.rappel.corps": "Damit pepfit dich pünktlich an Trainings und Mahlzeiten erinnert, braucht es Benachrichtigungen. Dein iPhone fragt, ob du sie erlaubst.",
  "notifs.sieste.corps": "pepfit weckt dich am Ende deines Nickerchens, auch bei gesperrtem Telefon oder geschlossener App. Dein iPhone fragt, ob du Benachrichtigungen erlaubst.",
};

const es: Surcharges = {
  "agenda.refus.texte": "pepfit no puede leer ni escribir en tu calendario. Permítelo en los Ajustes del iPhone y vuelve aquí.",
  "agenda.refus.ouvrir": "Abrir Ajustes",
  "agenda.android.titre": "Acceso al calendario en el iPhone",
  "agenda.consent.note": "Tu iPhone te pedirá acceso a tu calendario. Puedes retirarlo cuando quieras.",
  "verrou.moyens": "Face ID, Touch ID o código del iPhone",
  "verrou.verrouilleSous": "Face ID, Touch ID o código del iPhone.",
  "verrou.sansVerrou": "Tu iPhone necesita antes un código",
  "verrou.sansVerrouAide": "Añade un código en Ajustes › Face ID y código, y vuelve aquí.",
  "verrou.ouvrirReglages": "Abrir Ajustes",
  "verrou.indisponible": "El bloqueo no está disponible en este iPhone.",
  "verrou.explication": "pepfit usa el bloqueo de tu iPhone: nada más que recordar. Bloqueada, su vista previa se oculta al cambiar de app; el temporizador de descanso sigue visible en las notificaciones.",
  "notifs.repos.corps": "pepfit te avisa al final de cada descanso, aunque el teléfono esté bloqueado o la app cerrada. Tu iPhone te pedirá permitir las notificaciones. En modo silencio, vibra sin sonar.",
  "notifs.suivi.corps": "Durante el seguimiento, el tiempo y la distancia siguen en una notificación con la pantalla apagada. Tu iPhone te pedirá permitir las notificaciones.",
  "notifs.position.corps": "pepfit registra tu recorrido, tu distancia y tu ritmo con el GPS. Tu iPhone te pedirá permitir la ubicación.",
  "notifs.appareils.corps": "pepfit lee tu frecuencia cardiaca por Bluetooth (Whoop, banda de pecho). Tu iPhone te pedirá permitir el Bluetooth; pepfit no lo usa para localizarte.",
  "notifs.rappel.corps": "Para recordarte tus entrenamientos y comidas a la hora prevista, pepfit necesita las notificaciones. Tu iPhone te pedirá permitirlas.",
  "notifs.sieste.corps": "pepfit te despierta al final de la siesta, aunque el teléfono esté bloqueado o la app cerrada. Tu iPhone te pedirá permitir las notificaciones.",
};

export const SURCHARGES_IPHONE: Record<Langue, Surcharges> = { fr, en, de, es };
