// Règles pures du parcours de séance unifié : sports, durée (48 h), quand, lieu, étiquette Programme.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DUREE_MAX_MIN, dureeBornee, dureeDepuisColonnes, dureeLibelle, etiquetteProgramme, heuresDuree, lieuParDefaut, minutesDuree,
  peutRetirerSport, quandAuJour, quandLibelle, sansHeurePermis, SPORTS_DEFAUT, sportsAffiches,
} from "../src/ecrans/parcours-seance.ts";

test("sports : trois par défaut quand rien n'est choisi, et le dernier ne se retire pas", () => {
  assert.deepEqual(SPORTS_DEFAUT, ["cat:musculation", "cat:course", "cat:bicycling"]);
  assert.deepEqual(sportsAffiches([]), SPORTS_DEFAUT);
  assert.deepEqual(sportsAffiches(["cat:natation"]), ["cat:natation"]);
  assert.equal(peutRetirerSport(["cat:natation"]), false);
  assert.equal(peutRetirerSport(["cat:natation", "cat:course"]), true);
});

test("durée : bornée à 48 h, libellé sans « non définie »", () => {
  assert.equal(DUREE_MAX_MIN, 2880);
  assert.equal(dureeBornee(5000), 2880);
  assert.equal(dureeBornee(-4), 0);
  assert.equal(dureeBornee(null), null);
  assert.equal(dureeLibelle(null), "Définir durée");
  assert.equal(dureeLibelle(0), "Définir durée");
  assert.equal(dureeLibelle(45), "45 min");
  assert.equal(dureeLibelle(120), "2 h");
  assert.equal(dureeLibelle(90), "1 h 30");
  assert.equal(dureeLibelle(2880), "48 h");
  assert.ok(!/non d[ée]finie/i.test(dureeLibelle(null)));
});

test("sélecteur de durée : heures 0 à 48, minutes 0 à 59 sauf à 48 h pile", () => {
  const h = heuresDuree();
  assert.equal(h.length, 49);
  assert.equal(h.at(-1), 48);
  assert.equal(minutesDuree(2).length, 60);
  assert.deepEqual(minutesDuree(48), [0]);
  assert.equal(dureeDepuisColonnes(1, 30), 90);
  assert.equal(dureeDepuisColonnes(48, 59), 2880);
});

test("quand : « Aujourd'hui » seul sans heure, sans heure seulement aujourd'hui, virgule et jamais de point médian", () => {
  const aujourdhui = "2026-11-04";
  const jourTexte = (j: string) => (j === "2026-11-06" ? "Vendredi" : j);
  const heureTexte = (h: string) => h.replace(":", " h ");
  assert.equal(quandLibelle({ jour: aujourdhui, heure: null }, aujourdhui, jourTexte, heureTexte), "Aujourd'hui");
  assert.equal(quandLibelle({ jour: aujourdhui, heure: "18:00" }, aujourdhui, jourTexte, heureTexte), "Aujourd'hui, 18 h 00");
  assert.equal(quandLibelle({ jour: "2026-11-06", heure: "07:30" }, aujourdhui, jourTexte, heureTexte), "Vendredi, 07 h 30");
  assert.ok(!quandLibelle({ jour: "2026-11-06", heure: "07:30" }, aujourdhui, jourTexte, heureTexte).includes("·"));
  assert.equal(sansHeurePermis(aujourdhui, aujourdhui), true);
  assert.equal(sansHeurePermis("2026-11-06", aujourdhui), false);
  assert.deepEqual(quandAuJour({ jour: aujourdhui, heure: null }, "2026-11-06", aujourdhui, "18:00"), { jour: "2026-11-06", heure: "18:00" });
  assert.deepEqual(quandAuJour({ jour: aujourdhui, heure: null }, aujourdhui, aujourdhui, "18:00"), { jour: aujourdhui, heure: null });
  assert.deepEqual(quandAuJour({ jour: aujourdhui, heure: "20:00" }, "2026-11-06", aujourdhui, "18:00"), { jour: "2026-11-06", heure: "20:00" });
});

test("lieu : dernier lieu du sport, sinon « Non défini » sans id", () => {
  assert.deepEqual(lieuParDefaut({ id: "l1", nom: "Salle Nord" }), { id: "l1", nom: "Salle Nord" });
  assert.deepEqual(lieuParDefaut(null), { id: null, nom: "Non défini" });
  assert.deepEqual(lieuParDefaut(undefined), { id: null, nom: "Non défini" });
});

test("étiquette Programme : seulement pour une séance de programme", () => {
  assert.equal(etiquetteProgramme("p1"), "Programme");
  assert.equal(etiquetteProgramme(null), null);
  assert.equal(etiquetteProgramme(undefined), null);
});
