// La session « Récupérer » (planche recuperer, § 3.2 et 3.8) : démarrer, « Je suis réveillé » (fin réelle, ou l'heure de
// l'alarme), « Annuler » (rien), la sieste oubliée enregistrée seule, la libre fermée à 3 h, la saisie après coup, le
// ressenti ; l'alarme et ses canaux (le réglage à part, sans « rien ») ; les notifications appli ouverte (l'alarme de sieste
// sonne et vibre toujours) ; le rappel.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { canalSieste, lireAlerteSieste, PREFIXE_CANAL_SIESTE } from "../src/ecrans/alerte-sieste.ts";
import { canalRepos, PREFIXE_CANAL } from "../src/ecrans/alerte-repos.ts";
import {
  annulerRecup, demarrerRecup, enregistrerApresCoup, finDe, lireEnCoursRecup, lireReglagesRecup, noterRessenti, planifierRappel, reprendreRecup, terminerRecup,
} from "../src/ecrans/recuperer-session.ts";
import { lireRecup, lireRecupEntre } from "../src/ecrans/recuperer-donnees.ts";
import { aRetirer, cibleEcran, cibleNotif, retourNotif, ROUTE_CIBLE } from "../src/natif/notifications-regles.ts";

const MIN = 60_000;
const a = (h: number, m: number, n = 0) => new Date(2026, 9, 30 + n, h, m).getTime();

test("une sieste de 20 min démarrée à 14:07 : l'alarme à 14:32 ; « Je suis réveillé » à 14:30 enregistre 14:07 – 14:30", async () => {
  const { db } = await baseDeTest();
  const e = await demarrerRecup(db, { type: "sieste", choisi: 20 }, a(14, 7));
  assert.equal(e.alarme, a(14, 32));
  assert.deepEqual(await lireEnCoursRecup(db), e);
  const id = await terminerRecup(db, a(14, 30));
  assert.equal(id, e.id);
  const s = (await lireRecup(db, id!))!;
  assert.deepEqual([s.debut, s.fin, s.mode, s.choisi, s.sources], [a(14, 7), a(14, 30), "minuteur", 20, ["pepfit"]]);
  assert.equal(await lireEnCoursRecup(db), null);
});

test("après l'alarme, la fin est l'heure de l'alarme ; oubliée 30 min, la sieste s'enregistre seule ; « Annuler » n'enregistre rien", async () => {
  const { db } = await baseDeTest();
  const e = await demarrerRecup(db, { type: "sieste", choisi: 20 }, a(14, 7));
  assert.equal(finDe(e, a(14, 40)), a(14, 32));
  assert.deepEqual(await reprendreRecup(db, a(14, 50)), { enCours: e, enregistree: null });
  const r = await reprendreRecup(db, a(15, 10));
  assert.equal(r.enregistree, e.id);
  assert.equal((await lireRecup(db, e.id))!.fin, a(14, 32));
  await demarrerRecup(db, { type: "sieste", choisi: 90 }, a(16, 0));
  await annulerRecup(db);
  assert.equal(await lireEnCoursRecup(db), null);
  assert.equal((await lireRecupEntre(db, a(15, 30), a(23, 0))).length, 0);
});

test("« Libre » : pas d'alarme, fermée d'office au bout de 3 h ; une activité sonne à sa durée", async () => {
  const { db } = await baseDeTest();
  const e = await demarrerRecup(db, { type: "sieste", choisi: null }, a(13, 0));
  assert.equal(e.alarme, null);
  const r = await reprendreRecup(db, a(17, 0));
  assert.equal((await lireRecup(db, r.enregistree!))!.fin, a(16, 0));
  assert.equal((await lireRecup(db, r.enregistree!))!.mode, "libre");
  const sauna = await demarrerRecup(db, { type: "sauna", choisi: 15 }, a(19, 5));
  assert.equal(sauna.alarme, a(19, 20));
  await terminerRecup(db, a(19, 21), { moy: 98, debut: 80, fin: 110 });
  const s = (await lireRecup(db, sauna.id))!;
  assert.deepEqual([s.fin, s.fcMoy, s.fcDebut, s.fcFin], [a(19, 20), 98, 80, 110]);
});

test("une session arrêtée avant une minute n'est pas enregistrée, comme « Annuler »", async () => {
  const { db } = await baseDeTest();
  await demarrerRecup(db, { type: "respiration", choisi: 5 }, a(19, 11));
  assert.equal(await terminerRecup(db, a(19, 11) + 7000), null);
  assert.equal(await lireEnCoursRecup(db), null);
  assert.equal((await lireRecupEntre(db, a(19, 0), a(20, 0))).length, 0);
});

test("après coup (D11) et le ressenti (D13)", async () => {
  const { db } = await baseDeTest();
  const id = await enregistrerApresCoup(db, { type: "sauna", debut: a(19, 5), minutes: 15 }, a(19, 30));
  const s = (await lireRecup(db, id))!;
  assert.deepEqual([s.mode, (s.fin - s.debut) / MIN], ["apres-coup", 15]);
  await noterRessenti(db, id, "repose");
  assert.equal((await lireRecup(db, id))!.ressenti, "repose");
  await noterRessenti(db, id, null);
  assert.equal((await lireRecup(db, id))!.ressenti, null);
});

test("l'alarme (D9) : son et vibration par défaut, jamais « rien » ; ses canaux ne touchent jamais ceux du minuteur de repos", async () => {
  assert.equal(lireAlerteSieste(null), "les-deux");
  assert.equal(lireAlerteSieste("rien"), "les-deux");
  assert.equal(lireAlerteSieste("vibration"), "vibration");
  assert.equal(canalSieste("vibration", null), "fin-sieste-vibration");
  assert.match(canalSieste("les-deux", "content://son/1"), /^fin-sieste-les-deux-[0-9a-z]+$/);
  assert.equal(canalSieste("son", null), "fin-sieste-son-defaut");
  assert.ok(!canalSieste("son", null).startsWith(PREFIXE_CANAL) && !canalRepos("son", null)!.startsWith(PREFIXE_CANAL_SIESTE));
  const { db } = await baseDeTest();
  await ecrireReglage(db, "son_repos_uri", "content://son/1");
  const r = await lireReglagesRecup(db);
  assert.deepEqual(r, { alerte: "les-deux", sonUri: "content://son/1", rappel: false, heureRappel: 13 * 60 + 30 });
});

test("appli ouverte (docs/NOTIFICATIONS.md) : pas de notification système, mais l'alarme de sieste sonne et vibre toujours ; bandeau hors de l'écran de la sieste", () => {
  assert.equal(cibleNotif("fin-sieste"), "recuperer");
  assert.equal(cibleNotif("rappel-sieste"), "recuperation");
  assert.equal(cibleEcran("/recuperer/en-cours"), "recuperer");
  assert.equal(ROUTE_CIBLE.recuperer, "/recuperer/en-cours");
  const surSieste = retourNotif({ premierPlan: true, identifiant: "fin-sieste", ecran: "recuperer", sonne: true, vibreSieste: true });
  assert.deepEqual(surSieste, { systeme: false, son: true, vibration: true, reveil: true, bandeau: false });
  const ailleurs = retourNotif({ premierPlan: true, identifiant: "fin-sieste", ecran: "nutrition", sonne: true, vibre: false, vibreSieste: true });
  assert.deepEqual([ailleurs.systeme, ailleurs.son, ailleurs.vibration, ailleurs.bandeau], [false, true, true, true]);
  // vibration seule : pas de son, la vibration quand même
  assert.deepEqual(retourNotif({ premierPlan: true, identifiant: "fin-sieste", ecran: "recuperer", sonne: false, vibreSieste: true }).vibration, true);
  // écran éteint ou appli en arrière-plan : la notification part telle quelle (alarme exacte, flux alarme)
  assert.deepEqual(retourNotif({ premierPlan: false, identifiant: "fin-sieste", ecran: null, sonne: true }), { systeme: true, son: true, vibration: false, bandeau: false });
  // le rappel est silencieux ; appli ouverte, un bandeau seulement hors de la page Récupération
  assert.deepEqual(retourNotif({ premierPlan: true, identifiant: "rappel-sieste", ecran: "recuperation", sonne: false }), { systeme: false, son: false, vibration: false, bandeau: false });
  assert.equal(retourNotif({ premierPlan: true, identifiant: "rappel-sieste", ecran: "seance", sonne: false }).bandeau, true);
  // arrivée sur l'écran de la sieste : la notification de fin est retirée
  assert.deepEqual(aRetirer(["fin-sieste", "fin-repos"], "recuperer"), ["fin-sieste"]);
});

test("le rappel : éteint par défaut ; activé sans dette (aucune nuit), rien n'est programmé", async () => {
  const { db } = await baseDeTest();
  assert.equal(await planifierRappel(db, a(10, 0)), false);
  await ecrireReglage(db, "rappel_sieste", "1");
  assert.equal(await planifierRappel(db, a(10, 0)), false);
});
