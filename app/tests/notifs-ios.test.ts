// iPhone : rappels et alarmes (docs/CODE-IOS-RAPPELS.md). Règles pures, et ce qui doit exister
// pour le premier build iOS (sons, module Swift, plugin), lu dans les fichiers.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { avertissementAlarme } from "../src/ecrans/alerte-sieste.ts";
import type { DiagAlarme } from "../src/natif/alarme-recup/types.ts";
import { cibleNotif, retourNotif } from "../src/natif/notifications-regles.ts";
import {
  ECART_RELANCE_MS, estRelance, lireDiagIos, PLAFOND_IOS, plafonner, relances, RELANCES, SON_REPOS, SON_REVEIL, SON_SILENCE, sonIos, SONS_IOS,
} from "../src/natif/notifs-ios.ts";

const lire = (f: string) => readFileSync(f, "utf8");

test("plafond iOS : 64 notifications programmées au plus, alarmes comprises", () => {
  const rappels = Object.values(PLAFOND_IOS).reduce((a, b) => a + b, 0);
  // fin-repos, fin-cible, fin-sieste et ses relances, fin-sieste-libre, rappel-sieste
  const alarmes = 3 + RELANCES + 2;
  assert.ok(rappels + alarmes <= 64, `${rappels} rappels + ${alarmes} alarmes`);
  const l = [{ quand: 30 }, { quand: 10 }, { quand: 20 }, { quand: 40 }];
  assert.deepEqual(plafonner(l, 2, (x) => x.quand), [{ quand: 10 }, { quand: 20 }], "les plus proches, dans l'ordre");
  assert.deepEqual(plafonner(l, 10, (x) => x.quand).length, 4);
  assert.deepEqual(plafonner(l, -1, (x) => x.quand), []);
  assert.deepEqual(l.map((x) => x.quand), [30, 10, 20, 40], "la liste reçue n'est pas touchée");
});

test("son d'une alarme sur iPhone : le son, un son muet pour vibrer seulement, ou rien", () => {
  assert.equal(sonIos({ sonne: true, vibre: true, son: SON_REVEIL }), SON_REVEIL);
  assert.equal(sonIos({ sonne: true, vibre: false, son: SON_REPOS }), SON_REPOS);
  assert.equal(sonIos({ sonne: false, vibre: true, son: SON_REPOS }), SON_SILENCE);
  assert.equal(sonIos({ sonne: false, vibre: false, son: SON_REPOS }), false);
});

test("relances de la fin de sieste : 3, toutes les 30 s, reconnues comme la fin", () => {
  const r = relances(1_000_000);
  assert.deepEqual(r.map((x) => x.id), ["fin-sieste-r1", "fin-sieste-r2", "fin-sieste-r3"]);
  assert.deepEqual(r.map((x) => x.quand), [1_000_000 + ECART_RELANCE_MS, 1_000_000 + 2 * ECART_RELANCE_MS, 1_000_000 + 3 * ECART_RELANCE_MS]);
  assert.ok(r.every((x) => estRelance(x.id)));
  assert.ok(!estRelance("fin-sieste") && !estRelance("fin-sieste-libre"));
  assert.equal(cibleNotif("fin-sieste-r2"), "recuperer");
  // appli ouverte : une relance sonne et vibre comme la fin (alarme de réveil)
  assert.deepEqual(retourNotif({ premierPlan: true, identifiant: "fin-sieste-r1", ecran: "recuperer", sonne: true, vibreSieste: true }), retourNotif({ premierPlan: true, identifiant: "fin-sieste", ecran: "recuperer", sonne: true, vibreSieste: true }));
});

const diagIos = (o: Partial<NonNullable<DiagAlarme["ios"]>> = {}): DiagAlarme => ({
  ios: { autorisees: true, sons: true, urgentes: "oui", verrou: true, ...o },
  neDeranger: "non", alarmesPermises: true, sonnerie: "normal", volumeAlarme: 1, pleinEcran: true, heureExacte: true, economie: false,
});

test("ligne de l'écran de la sieste sur iPhone : ce qui couperait la notification d'alarme", () => {
  assert.equal(avertissementAlarme(diagIos({ autorisees: false })), "notifications");
  assert.equal(avertissementAlarme(diagIos({ sons: false })), "sons");
  assert.equal(avertissementAlarme(diagIos({ sons: false }), false), null, "vibration seule : les sons n'y font rien");
  assert.equal(avertissementAlarme(diagIos({ urgentes: "non" })), "urgentes");
  assert.equal(avertissementAlarme(diagIos({ urgentes: "absent" })), "silencieux", "sans le droit : rien à proposer, le mode silencieux reste à dire");
  assert.equal(avertissementAlarme(diagIos()), "silencieux");
  assert.equal(avertissementAlarme(diagIos(), false), null);
});

test("diagnostic du module Swift lu prudemment", () => {
  assert.equal(lireDiagIos(null), null);
  assert.deepEqual(lireDiagIos({ autorisees: true, sons: true, urgentes: "non", verrou: false }), { autorisees: true, sons: true, urgentes: "non", verrou: false });
  assert.deepEqual(lireDiagIos({}), { autorisees: false, sons: true, urgentes: "absent", verrou: true });
  assert.equal(lireDiagIos({ urgentes: "peut-être" })!.urgentes, "absent");
});

test("sons de l'iPhone : présents, WAV PCM, au plus 30 s, copiés par le plugin", () => {
  const plugin = lire("plugins/ios-rappels.js");
  for (const nom of SONS_IOS) {
    const f = `assets/sons/${nom}`;
    assert.ok(existsSync(f), f);
    const b = readFileSync(f);
    assert.equal(b.toString("ascii", 0, 4), "RIFF");
    assert.equal(b.readUInt16LE(20), 1, "PCM");
    const duree = b.readUInt32LE(40) / b.readUInt32LE(28);
    assert.ok(duree <= 30, `${nom} : ${duree} s`);
    assert.ok(plugin.includes(`./assets/sons/${nom}`), `plugin : ${nom}`);
  }
});

test("premier build iOS : module Swift déclaré, plugin branché, une version iPhone de chaque alarme et rappel", () => {
  const conf = JSON.parse(lire("modules/pepfit-alarme/expo-module.config.json"));
  assert.ok(conf.platforms.includes("apple") && conf.platforms.includes("android"));
  assert.deepEqual(conf.apple.modules, ["PepfitAlarmeModule"]);
  assert.deepEqual(conf.android.modules, ["fit.pep.alarme.PepfitAlarmeModule"], "Android inchangé");
  const swift = lire("modules/pepfit-alarme/ios/PepfitAlarmeModule.swift");
  assert.match(swift, /public class PepfitAlarmeModule: Module/);
  assert.match(swift, /Name\("PepfitAlarme"\)/);
  for (const f of ["jouer", "arreterSon", "diagnostic", "ouvrirReglages"]) assert.match(swift, new RegExp(`AsyncFunction\\("${f}"\\)`));
  assert.ok(existsSync("modules/pepfit-alarme/ios/PepfitAlarme.podspec"));
  const app = JSON.parse(lire("app.json"));
  assert.ok(app.expo.plugins.includes("./plugins/ios-rappels.js"));
  for (const d of ["minuteur", "alarme-recup", "son-alarme"]) assert.ok(existsSync(`src/natif/${d}/index.ios.ts`), d);
  for (const d of ["rappels", "rappels-repas", "rappels-traitements", "rappel-coucher"]) {
    assert.ok(existsSync(`src/natif/${d}/index.native.ts`) && !existsSync(`src/natif/${d}/index.android.ts`), `${d} : Android et iPhone`);
    assert.match(lire(`src/natif/${d}/index.native.ts`), /Platform\.OS === "ios"[^\n]*plafonner/, `${d} : plafond iOS`);
  }
});
