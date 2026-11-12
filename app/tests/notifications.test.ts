// Notifications : autorisation demandée en contexte (fin du repos, suivi GPS, rappel posé), jamais au lancement.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { etapeHeureExacte, etapeNotif } from "../src/natif/notifications-etape.ts";

test("étape : accordée, expliquer puis demander, ou ne plus demander", () => {
  assert.equal(etapeNotif({ permise: true, redemandable: false, plusTard: false }), "accordee");
  assert.equal(etapeNotif({ permise: false, redemandable: true, plusTard: false }), "expliquer");
  assert.equal(etapeNotif({ permise: false, redemandable: false, plusTard: false }), "non");
  // « Plus tard » : pas de nouvelle feuille à chaque séance tant que l'appli reste ouverte.
  assert.equal(etapeNotif({ permise: false, redemandable: true, plusTard: true }), "non");
});

const fichiers = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? fichiers(join(d, f)) : [join(d, f)]));
const src = fichiers("src").filter((f) => /\.tsx?$/.test(f));
const lire = (f: string) => readFileSync(f, "utf8");

test("une seule demande d'autorisation, dans natif/notifications.ts", () => {
  const demandes = src.filter((f) => lire(f).includes("requestPermissionsAsync") && /Notifications\.requestPermissionsAsync/.test(lire(f)));
  assert.deepEqual(demandes.map((f) => f.replaceAll("\\", "/")), ["src/natif/notifications.ts"]);
  assert.ok(!lire("src/natif/suivi/index.android.ts").includes("POST_NOTIFICATIONS"), "le suivi ne demande plus les notifications avec la position");
});

test("demandée là où elle sert : séance, suivi, rappels posés par un geste", () => {
  assert.match(lire("src/ecrans/commencer.ts"), /demanderNotifications\("repos"\)/);
  assert.match(lire("src/ecrans/SuiviDepart.tsx"), /demanderNotifications\("suivi"\)/);
  assert.match(lire("src/ecrans/usePlanif.tsx"), /rafraichirRappels\(db, \{ demander: true \}\)/);
  assert.match(lire("src/ecrans/nutrition/RepasHoraires.tsx"), /rafraichirRappelsRepas\(db, \{ demander: true \}\)/);
  // Au lancement (accueil, Entraînements) : simple vérification.
  assert.doesNotMatch(lire("src/ecrans/accueil-donnees.ts"), /demander: true/);
  assert.match(lire("src/app/_layout.tsx"), /<FeuilleNotifications \/>/);
});

// Google Play : USE_EXACT_ALARM est réservée aux applis Horloge et agenda ; pepfit déclare SCHEDULE_EXACT_ALARM, accordée par
// l'utilisateur (« Alarmes et rappels »), demandée au moment où une alarme sert (docs/PUBLICATION-PLAY.md).
test("heure exacte : SCHEDULE_EXACT_ALARM, demandée au repos et à la sieste, une fois par ouverture", () => {
  assert.equal(etapeHeureExacte({ exacte: true, plusTard: false }), "accordee");
  assert.equal(etapeHeureExacte({ exacte: false, plusTard: false }), "expliquer");
  assert.equal(etapeHeureExacte({ exacte: false, plusTard: true }), "non");
  const perms: string[] = JSON.parse(lire("app.json")).expo.android.permissions;
  assert.ok(perms.includes("android.permission.SCHEDULE_EXACT_ALARM"));
  assert.ok(!perms.includes("android.permission.USE_EXACT_ALARM"));
  assert.match(lire("src/ecrans/commencer.ts"), /alarmeRecup\.demanderHeureExacte\(\)/);
  assert.match(lire("src/ecrans/SuiviDepart.tsx"), /alarmeRecup\.demanderHeureExacte\(\)/);
  assert.match(lire("src/ecrans/recuperer-vues/FeuilleRecuperer.tsx"), /alarmeRecup\.demanderHeureExacte\(\)/);
  // Accordée plus tard : l'alarme inexacte est reposée exacte.
  assert.match(lire("modules/pepfit-alarme/android/src/main/AndroidManifest.xml"), /SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED/);
});

// Google Play : SYSTEM_ALERT_WINDOW (posée d'office par le prebuild d'Expo) ne sert à rien dans pepfit ; retirée du manifeste.
test("SYSTEM_ALERT_WINDOW retirée du manifeste", () => {
  const blocage: string[] = JSON.parse(lire("app.json")).expo.android.blockedPermissions;
  assert.ok(blocage.includes("android.permission.SYSTEM_ALERT_WINDOW"));
});
