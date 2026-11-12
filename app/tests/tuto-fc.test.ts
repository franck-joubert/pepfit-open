// Lot 6 de la course guidée : tuto « Activer la FC en direct » (Whoop, ceinture) et « Appareils à proximité ».
import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "../src/i18n/dico-en/gps.ts";
import { fr } from "../src/i18n/dico-fr/gps.ts";
import { etatTuto, reessayerAuRetour, type EtatFc } from "../src/ecrans/suivi-direct-vue.ts";
import { readFileSync } from "node:fs";
import { DESSIN_SOUS, ETAPES_TUTO, PAQUET_WHOOP, SITE_WHOOP } from "../src/ecrans/tuto-fc.ts";

const dico = (d: Record<string, string>, cles: readonly string[]) => cles.map((c) => d[c]);

test("tuto Whoop : le chemin vérifié, dans l'ordre, en français et en anglais", () => {
  const titres = ETAPES_TUTO.whoop.map((e) => e.titre);
  assert.deepEqual(dico(fr, titres), ["Plus", "Paramètres", "Paramètres de l'appareil", "Onglet Statut", "Diffuser la fréquence cardiaque"]);
  assert.deepEqual(dico(en, titres), ["More", "Settings", "Device Settings", "Status tab", "Heart Rate Broadcast"]);
  assert.equal(fr["gps.fc.tuto.w5s"], "tout en bas : active-la");
  // le dessin (interrupteur cerclé) vient sous la dernière étape, avec le libellé tel que l'écrit Whoop
  assert.equal(DESSIN_SOUS.whoop, ETAPES_TUTO.whoop.length - 1);
  assert.equal(fr["gps.fc.tuto.dessinLigne"], "DIFFUSER LA FRÉQUENCE CARDIAQUE");
  assert.equal(fr["gps.fc.tuto.dessinOnglet"], "STATUT");
  assert.match(fr["gps.fc.tuto.unSeul"], /un appareil à la fois/);
  assert.match(en["gps.fc.tuto.unSeul"], /one device at a time/);
});

test("« Ouvrir Whoop » : le paquet de l'appli, sinon le site de Whoop, jamais un magasin d'applis", () => {
  assert.equal(PAQUET_WHOOP, "com.whoop.android");
  assert.equal(SITE_WHOOP, "https://www.whoop.com/");
  const ecran = readFileSync(new URL("../src/ecrans/appareils-proximite.ts", import.meta.url), "utf8");
  assert.match(ecran, /Linking\.openURL\(SITE_WHOOP\)/);
  for (const f of ["src/ecrans/tuto-fc.ts", "src/ecrans/appareils-proximite.ts"]) {
    assert.doesNotMatch(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"), /market:|play\.google\.com|apps\.apple\.com/, f);
  }
});

test("toutes les étapes ont leur texte en français et en anglais ; un dessin par cas, sous une étape qui existe", () => {
  for (const [cas, etapes] of Object.entries(ETAPES_TUTO)) {
    assert.ok(etapes.length >= 3, cas);
    for (const e of etapes) {
      for (const c of [e.titre, e.sous].filter((x): x is NonNullable<typeof x> => x != null)) {
        assert.ok(fr[c as keyof typeof fr], `${c} fr`);
        assert.ok(en[c as keyof typeof en], `${c} en`);
      }
    }
    const i = DESSIN_SOUS[cas as keyof typeof DESSIN_SOUS];
    assert.ok(i >= 0 && i < etapes.length, cas);
  }
});

test("ligne d'état du tuto : muette à l'ouverture, puis recherche, coche verte ou « toujours rien »", () => {
  const absente: EtatFc = { etat: "absente" };
  const trouvee: EtatFc = { etat: "trouvee", appareil: { adresse: "AA" } };
  // ouvert sur un échec : on ne le redit pas
  assert.equal(etatTuto("fc", false, absente, true), null);
  assert.equal(etatTuto("fc", true, { etat: "recherche" }, true), "recherche");
  assert.equal(etatTuto("fc", true, trouvee, true), "ok");
  assert.equal(etatTuto("fc", true, absente, true), "rien");
  assert.equal(etatTuto("fc", true, { etat: "refus" }, false), "rien");
  // « Appareils à proximité » : la coche dès qu'ils sont accordés, quelle que soit la FC
  assert.equal(etatTuto("appareils", false, { etat: "refus" }, false), null);
  assert.equal(etatTuto("appareils", true, { etat: "refus" }, false), "rien");
  assert.equal(etatTuto("appareils", true, { etat: "recherche" }, true), "ok");
});

test("retour dans pepfit : la FC allumée qui manquait est recherchée de nouveau, seule", () => {
  assert.equal(reessayerAuRetour(true, { etat: "absente" }, true), true, "diffusion activée dans Whoop");
  assert.equal(reessayerAuRetour(true, { etat: "refus" }, true), true, "appareils autorisés dans les réglages");
  assert.equal(reessayerAuRetour(true, { etat: "refus" }, false), false, "toujours refusés : rien à chercher");
  assert.equal(reessayerAuRetour(true, { etat: "recherche" }, true), false, "déjà en cours");
  assert.equal(reessayerAuRetour(true, { etat: "trouvee", appareil: { adresse: "AA" } }, true), false, "déjà trouvée");
  assert.equal(reessayerAuRetour(false, { etat: "absente" }, true), false, "FC éteinte");
});
