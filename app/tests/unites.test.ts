// Formatage des unités du suivi GPS (src/ecrans/unites.ts) : km / miles, stockage inchangé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { definirActif } from "../src/i18n/index.ts";
import { vueEffort } from "../src/ecrans/effort-vue.ts";
import {
  allureAffichee, altitudeEnUnite, distanceCompteur, graduationsDistance, libelleAllure, libelleAltitude, libelleDistance, libelleVitesse,
  M_PAR_MI, metresParUnite, vitesseAffichee,
} from "../src/ecrans/unites.ts";

const base = { langue: "en", fuseau: "UTC", poids: "kg" } as const;
const regler = (distance: "km" | "mi") => definirActif({ ...base, distance });

regler("km");

  test("libellés", () => {
    assert.deepEqual([libelleDistance("km"), libelleAllure("km"), libelleVitesse("km"), libelleAltitude("km")], ["km", "/km", "km/h", "m"]);
    assert.deepEqual([libelleDistance("mi"), libelleAllure("mi"), libelleVitesse("mi"), libelleAltitude("mi")], ["mi", "/mi", "mph", "ft"]);
  });
  test("compteur tronqué", () => {
    assert.equal(distanceCompteur(6268, "km"), "6.26");
    assert.equal(distanceCompteur(M_PAR_MI * 3.894, "mi"), "3.89");
    assert.equal(distanceCompteur(-5, "mi"), "0.00");
  });
  test("allure : 5'00\"/km = 8'03\"/mi", () => {
    assert.equal(allureAffichee(300, "km"), "5'00\"");
    assert.equal(allureAffichee(300, "mi"), "8'03\"");
    assert.equal(allureAffichee(null, "mi"), "—");
  });
  test("vitesse : 20 km/h = 12,4 mph", () => {
    assert.equal(vitesseAffichee(20, "km"), "20.0");
    assert.equal(vitesseAffichee(20, "mi"), "12.4");
    assert.equal(vitesseAffichee(null, "mi"), "—");
  });
  test("dénivelé : mètres en km, pieds en miles", () => {
    assert.equal(altitudeEnUnite(100, "km"), 100);
    assert.equal(altitudeEnUnite(100, "mi"), 328);
  });
  test("graduations", () => {
    assert.deepEqual(graduationsDistance(2500, "km"), [0, 0.5, 1, 1.5, 2, 2.5]);
    assert.deepEqual(graduationsDistance(M_PAR_MI * 3, "mi"), [0, 1, 2, 3]);
  });
  test("le réglage actif est la valeur par défaut", () => {
    regler("mi");
    assert.equal(libelleDistance(), "mi");
    assert.equal(metresParUnite(), M_PAR_MI);
    regler("km");
    assert.equal(libelleDistance(), "km");
  });
  test("« Par km » devient « par mile » : 3 mi = 3 morceaux de 1609 m, stockage intact", () => {
    const points = Array.from({ length: 1001 }, (_, i) => ({
      t: i * 1000, s: i * 1000, lat: 48.85 + (i * 5) / 111_195, lon: 5.8037, altBaro: null, altGps: null, precision: 5, vitesse: 5,
    }));
    const d = { points, fc: [], bornes: [], denivelePlusM: null, barometre: false };
    const km = vueEffort(d, 1000, 190, "km");
    const mi = vueEffort(d, 1000, 190, "mi");
    assert.equal(km.km.filter((l) => !l.partiel).length, 5);
    assert.equal(mi.km.filter((l) => !l.partiel).length, 3);
    assert.ok(Math.abs(mi.km[0]!.distanceM - M_PAR_MI) < 1);
    assert.equal(mi.distanceM, km.distanceM);
    assert.equal(mi.allure, km.allure);
  });
