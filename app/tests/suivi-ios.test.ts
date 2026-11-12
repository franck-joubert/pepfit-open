// Suivi sur iPhone (docs/CODE-IOS-SUIVI.md) : couche JS (fabrique-ios.ts) avec un faux module Swift, même API que l'Android
// et que le repli ; trames 0x2A37 d'exemple (le décodeur Swift de Frequence.swift suit la même règle) ; plugin ios-suivi.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fabriquerSuiviIos, type NatifIos } from "../src/natif/suivi/fabrique-ios.ts";
import { suivi as repli } from "../src/natif/suivi/index.ts";
import { lireFrequence } from "../src/natif/suivi/logique.ts";
import type { EtatSuivi } from "../src/natif/suivi/types.ts";

const ETAT = { statut: "en_cours", id: "1730000000000", mode: "course" } as EtatSuivi;

/** Faux module Swift : note chaque appel, réponses réglables. */
function fauxNatif(reglages: { position?: boolean; bluetooth?: "accorde" | "refuse" | "bloque" } = {}) {
  const appels: [string, ...unknown[]][] = [];
  const ecouteurs: ((e: EtatSuivi) => void)[] = [];
  const natif: NatifIos = {
    addListener: (_e, f) => {
      ecouteurs.push(f);
      return { remove: () => void ecouteurs.splice(ecouteurs.indexOf(f), 1) };
    },
    capteurs: () => ({ barometre: true, gps: true, bluetooth: true, android: 0, promu: false }),
    demarrer: (o) => (appels.push(["demarrer", o]), ETAT),
    pause: () => (appels.push(["pause"]), { ...ETAT, statut: "pause" }),
    reprendre: () => (appels.push(["reprendre"]), ETAT),
    tour: () => null,
    terminer: () => (appels.push(["terminer"]), { ...ETAT, statut: "arrete" }),
    etat: () => null,
    points: async (id, depuis) => (appels.push(["points", id, depuis]), [[1000, 0, 48.85, 5.8037, null, 35.5, 5, 3.2], [2000, 1000, 48.851, 5.8037, 120.25, null, 8, null]]),
    frequences: async (id, depuis) => (appels.push(["frequences", id, depuis]), [[1000, 0, 72], [2000, 1000, null]]),
    tampons: async () => ["1730000000000"],
    effacer: async (id) => void appels.push(["effacer", id]),
    oublier: async () => void appels.push(["oublier"]),
    chercherFc: async (ms) => (appels.push(["chercherFc", ms]), [{ adresse: "6F1C-UUID", nom: "WHOOP 4A1", rssi: -60, fc: true }]),
    journal: async () => [[1730000000000, "debut", "mode=course;fc=1;ios=18.1;economie=0"], [1730000005000, "fin", ""]],
    demanderPosition: async () => (appels.push(["demanderPosition"]), reglages.position ?? true),
    etatBluetooth: () => reglages.bluetooth ?? "accorde",
    demanderBluetooth: async () => (appels.push(["demanderBluetooth"]), reglages.bluetooth ?? "accorde"),
  };
  return { natif, appels, ecouteurs };
}

test("iPhone : exactement les fonctions du repli (index.ts), donc celles de l'interface Suivi utilisée par l'appli", () => {
  const cles = (o: object) => Object.keys(o).sort();
  assert.deepEqual(cles(fabriquerSuiviIos(fauxNatif().natif)), cles(repli));
  assert.deepEqual(cles(fabriquerSuiviIos(null)), cles(repli));
});

test("iPhone sans le module (build plus ancien) : indisponible, démarrer rejette, le reste est vide", async () => {
  const s = fabriquerSuiviIos(null);
  assert.equal(s.disponible, false);
  await assert.rejects(s.demarrer({ mode: "course" }), /suivi indisponible/);
  assert.equal(await s.etat(), null);
  assert.deepEqual(await s.points("x"), []);
  assert.equal(await s.autoriser({ position: true, bluetooth: true }), false);
  assert.equal(await s.demanderAppareils(), "refuse");
});

test("iPhone : démarrer envoie les options complétées comme l'Android", async () => {
  const { natif, appels } = fauxNatif();
  const s = fabriquerSuiviIos(natif);
  assert.equal(s.disponible, true);
  assert.equal(await s.demarrer({ mode: "fc" }), ETAT);
  await s.demarrer({ mode: "muscu", fc: false, appareil: "6F1C-UUID", titre: "Muscu", debut: 1_730_000_000_000, pauseCumulMs: 60_000 });
  assert.deepEqual(appels, [
    ["demarrer", { mode: "fc", fc: true, appareil: null, titre: "Suivi", debut: null, pauseCumulMs: 0 }],
    ["demarrer", { mode: "muscu", fc: false, appareil: "6F1C-UUID", titre: "Muscu", debut: 1_730_000_000_000, pauseCumulMs: 60_000 }],
  ]);
  assert.equal((await s.pause()).statut, "pause");
  assert.equal((await s.terminer()).statut, "arrete");
  assert.equal(await s.tour(), null);
  assert.equal(await s.etat(), null);
});

test("iPhone : points et FC du tampon, cases vides en null ou 0 comme l'Android", async () => {
  const { natif, appels } = fauxNatif();
  const s = fabriquerSuiviIos(natif);
  assert.deepEqual(await s.points("1730000000000"), [
    { t: 1000, s: 0, lat: 48.85, lon: 5.8037, altBaro: null, altGps: 35.5, precision: 5, vitesse: 3.2 },
    { t: 2000, s: 1000, lat: 48.851, lon: 5.8037, altBaro: 120.25, altGps: null, precision: 8, vitesse: null },
  ]);
  assert.deepEqual(await s.frequences("1730000000000", 4), [{ t: 1000, s: 0, bpm: 72 }, { t: 2000, s: 1000, bpm: 0 }]);
  assert.deepEqual(appels, [["points", "1730000000000", 0], ["frequences", "1730000000000", 4]]);
});

test("iPhone : autorisations par iOS (position, Bluetooth) au lieu de PermissionsAndroid", async () => {
  let f = fauxNatif();
  assert.equal(await fabriquerSuiviIos(f.natif).autoriser({ position: false, bluetooth: false }), true);
  assert.deepEqual(f.appels, []);

  f = fauxNatif();
  assert.equal(await fabriquerSuiviIos(f.natif).autoriser({ position: true, bluetooth: true }), true);
  assert.deepEqual(f.appels, [["demanderPosition"], ["demanderBluetooth"]]);

  // position refusée : faux, le Bluetooth est quand même demandé (même geste qu'Android, une seule fois)
  f = fauxNatif({ position: false });
  assert.equal(await fabriquerSuiviIos(f.natif).autoriser({ position: true, bluetooth: true }), false);
  assert.deepEqual(f.appels, [["demanderPosition"], ["demanderBluetooth"]]);

  f = fauxNatif({ bluetooth: "bloque" });
  const s = fabriquerSuiviIos(f.natif);
  assert.equal(await s.autoriser({ position: false, bluetooth: true }), false);
  assert.equal(await s.appareils(), false);
  assert.equal(await s.demanderAppareils(), "bloque");

  f = fauxNatif({ bluetooth: "refuse" });
  assert.equal(await fabriquerSuiviIos(f.natif).appareils(), false);
  assert.equal(await fabriquerSuiviIos(fauxNatif().natif).appareils(), true);
});

test("iPhone : écoute de l'état, désabonnement", () => {
  const { natif, ecouteurs } = fauxNatif();
  const recus: EtatSuivi[] = [];
  const arreter = fabriquerSuiviIos(natif).ecouter((e) => recus.push(e));
  ecouteurs.forEach((f) => f(ETAT));
  assert.deepEqual(recus, [ETAT]);
  arreter();
  assert.equal(ecouteurs.length, 0);
});

test("iPhone : réglages propres à Android absents (batterie, ouvrir une appli), journal et recherche du capteur", async () => {
  const { natif, appels } = fauxNatif();
  const s = fabriquerSuiviIos(natif);
  assert.equal(await s.batterie(), null);
  assert.equal(await s.ouvrirReglagesBatterie(), null);
  assert.equal(await s.ouvrirAppli("com.whoop.android"), false);
  assert.deepEqual(await s.journal(), [
    { t: 1730000000000, evenement: "debut", detail: "mode=course;fc=1;ios=18.1;economie=0" },
    { t: 1730000005000, evenement: "fin", detail: "" },
  ]);
  assert.deepEqual(await s.chercherFc(8000), [{ adresse: "6F1C-UUID", nom: "WHOOP 4A1", rssi: -60, fc: true }]);
  assert.deepEqual(await s.capteurs(), { barometre: true, gps: true, bluetooth: true, android: 0, promu: false });
  assert.deepEqual(await s.tampons(), ["1730000000000"]);
  await s.effacer("1730000000000");
  await s.oublier();
  assert.deepEqual(appels.slice(-3), [["chercherFc", 8000], ["effacer", "1730000000000"], ["oublier"]]);
});

// Trames réelles du format Heart Rate Measurement (Bluetooth SIG), à la main : drapeaux, FC, [énergie], [RR...].
test("0x2A37, trames d'exemple : ceinture (uint8, contact, plusieurs RR), uint16, octet de RR incomplet", () => {
  // 0x16 = RR (0x10) + contact pris en charge (0x04) + contact (0x02) ; 64 bpm ; RR 0x0400 = 1000 ms, 0x0380 = 875 ms
  assert.deepEqual(lireFrequence([0x16, 64, 0x00, 0x04, 0x80, 0x03]), { bpm: 64, contact: true, rr: [1000, 875] });
  // contact pris en charge mais perdu (0x04 sans 0x02)
  assert.deepEqual(lireFrequence([0x14, 58, 0x00, 0x04]), { bpm: 58, contact: false, rr: [1000] });
  // FC sur 16 bits (0x01) : 0x00B4 = 180 bpm, énergie (0x08) 0x0123 sautée, RR 0x0200 = 500 ms
  assert.deepEqual(lireFrequence([0x19, 0xb4, 0x00, 0x23, 0x01, 0x00, 0x02]), { bpm: 180, contact: null, rr: [500] });
  // octet de RR seul en fin de trame : ignoré
  assert.deepEqual(lireFrequence([0x10, 70, 0x00, 0x04, 0x99]), { bpm: 70, contact: null, rr: [1000] });
  // RR annoncé sans octets
  assert.deepEqual(lireFrequence([0x10, 70]), { bpm: 70, contact: null, rr: [] });
  // trames trop courtes
  assert.equal(lireFrequence([]), null);
  assert.equal(lireFrequence([0x00]), null);
});

test("Swift et TypeScript lisent 0x2A37 avec les mêmes masques (relecture : le Swift ne se compile pas ici)", () => {
  const swift = readFileSync(new URL("../modules/pepfit-suivi/ios/Frequence.swift", import.meta.url), "utf8");
  for (const masque of ["f & 0x01 != 0", "f & 0x04 != 0 ? (f & 0x02 != 0) : nil", "f & 0x08 != 0 { i += 2 }", "f & 0x10 != 0", "/ 1024 * 1000"]) {
    assert.ok(swift.includes(masque), `Frequence.swift : ${masque}`);
  }
});

test("plugin ios-suivi : textes en français, modes d'arrière-plan location et bluetooth-central, sans ~ ni ≈", () => {
  const plugin = createRequire(import.meta.url)("../plugins/ios-suivi.js") as { TEXTES: Record<string, string>; MODES: string[] };
  assert.deepEqual(Object.keys(plugin.TEXTES).sort(), [
    "NSBluetoothAlwaysUsageDescription", "NSLocationAlwaysAndWhenInUseUsageDescription", "NSLocationWhenInUseUsageDescription", "NSMotionUsageDescription",
  ]);
  assert.deepEqual(plugin.MODES, ["location", "bluetooth-central"]);
  const fr = JSON.parse(readFileSync(new URL("../locales/fr.json", import.meta.url), "utf8")).ios as Record<string, string>;
  const en = JSON.parse(readFileSync(new URL("../locales/en.json", import.meta.url), "utf8")).ios as Record<string, string>;
  for (const [cle, texte] of Object.entries(plugin.TEXTES)) {
    assert.match(texte, /^pepfit /);
    assert.doesNotMatch(texte, /[~≈]/);
    // iOS préfère le texte traduit : le même en français, un en anglais
    assert.equal(fr[cle], texte, `locales/fr.json : ${cle}`);
    assert.ok(en[cle]?.startsWith("pepfit "), `locales/en.json : ${cle}`);
  }
});
