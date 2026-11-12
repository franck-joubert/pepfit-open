// Édition de la séance (titre, date, durée) : logique pure et effets sur l'historique.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  avecHeureMinute, avecJour, dureeAffichee, finDepuisDuree, heuresMinutes, minutesEntre, pasDeCinq, raccourcisJour, titreFinal, validerDebut,
} from "../src/ecrans/edition-seance.ts";
import { creerExercice } from "../src/db/depots/exercices.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { ajouterSerie, cocherSerie, demarrerSeance, lireSeance, modifierSeance, modifierSerie, terminerSeance } from "../src/db/depots/seances.ts";
import { baseDeTest, jour } from "./aide.ts";

const MIN = 60_000;

test("raccourcis : aujourd'hui, hier, avant-hier à minuit", () => {
  const r = raccourcisJour(jour(2026, 3, 1, 15, 30));
  assert.deepEqual(r.map((x) => x.libelle), ["Aujourd'hui", "Hier", "Avant-hier"]);
  assert.deepEqual(r.map((x) => x.jour), [jour(2026, 3, 1, 0), jour(2026, 2, 28, 0), jour(2026, 2, 27, 0)]);
});

test("changer le jour garde l'heure, changer l'heure garde le jour", () => {
  const d = jour(2026, 4, 10, 18, 42);
  assert.equal(avecJour(d, jour(2026, 4, 8, 0)), jour(2026, 4, 8, 18, 42));
  assert.equal(avecHeureMinute(d, 7, 5), jour(2026, 4, 10, 7, 5));
  assert.equal(avecHeureMinute(d, 40, -3), jour(2026, 4, 10, 23, 0)); // borné
});

test("minutes par pas de 5", () => {
  assert.equal(pasDeCinq(17, 1), 20);
  assert.equal(pasDeCinq(17, -1), 15);
  assert.equal(pasDeCinq(20, 1), 25);
  assert.equal(pasDeCinq(20, -1), 15);
  assert.equal(pasDeCinq(2, -1), 0);
  assert.equal(pasDeCinq(0, -1), -5);
});

test("pas de date dans le futur", () => {
  const now = jour(2026, 5, 5, 12, 0);
  assert.equal(validerDebut(now + MIN, now).ok, false);
  assert.deepEqual(validerDebut(now, now), { ok: true, debut: now });
  assert.deepEqual(validerDebut(now - 3 * 86_400_000, now), { ok: true, debut: now - 3 * 86_400_000 });
  assert.equal(validerDebut(Number.NaN, now).ok, false);
});

test("durée vivante tant qu'elle n'est pas réglée, figée ensuite", () => {
  const debut = jour(2026, 5, 5, 10, 0);
  assert.equal(dureeAffichee(debut, null, debut + 47 * MIN), 47);
  assert.equal(dureeAffichee(debut, null, debut + 50 * MIN), 50);
  assert.equal(dureeAffichee(debut, 60, debut + 90 * MIN), 60);
  assert.equal(minutesEntre(debut, debut - MIN), 0);
});

test("fin = début + durée, sans passer dans le futur", () => {
  const debut = jour(2026, 5, 5, 10, 0);
  const now = jour(2026, 5, 5, 12, 0);
  assert.equal(finDepuisDuree(debut, 75, now), debut + 75 * MIN);
  assert.equal(finDepuisDuree(debut, 300, now), now);
  assert.deepEqual(heuresMinutes(125), { h: 2, m: 5 });
});

test("titre vide ou d'espaces : retour au nom de la routine (null)", () => {
  assert.equal(titreFinal(""), null);
  assert.equal(titreFinal("   "), null);
  assert.equal(titreFinal("  Push   du  matin "), "Push du matin");
});

test("changer la date d'une séance déplace les séries, la charge effective suit la pesée avant la nouvelle date, le titre reste indépendant", async () => {
  const { db } = await baseDeTest();
  const dips = await creerExercice(db, { nom: "Dips", nature: "leste" });
  await ajouterPesee(db, 80, jour(2026, 1, 1));
  await ajouterPesee(db, 76, jour(2026, 5, 1));
  const id = await demarrerSeance(db, null, "Test");
  await db.runAsync("UPDATE seances SET debut = ? WHERE id = ?", [jour(2026, 6, 10, 18), id]);
  const sid = await ajouterSerie(db, { seanceId: id, exerciceId: dips });
  await modifierSerie(db, sid, { kg: 10, reps: 10 });
  await cocherSerie(db, sid, true);
  await db.runAsync("UPDATE series SET fait_le = ? WHERE id = ?", [jour(2026, 6, 10, 18, 20), sid]);
  await terminerSeance(db, id, jour(2026, 6, 10, 19));
  await modifierSeance(db, id, { debut: jour(2026, 6, 10, 18) });
  assert.equal((await lireSeance(db, id))!.exercices[0]!.series[0]!.charge_eff, 86);

  const nouveau = jour(2026, 2, 3, 18);
  await modifierSeance(db, id, { titre: "Mon titre", debut: nouveau, fin: nouveau + 60 * MIN });
  const s = (await lireSeance(db, id))!;
  assert.equal(s.seance.debut, nouveau);
  assert.equal(s.seance.fin, nouveau + 60 * MIN);
  assert.equal(s.seance.titre, "Mon titre");
  assert.equal(s.exercices[0]!.series[0]!.fait_le, jour(2026, 2, 3, 18, 20));
  assert.equal(s.exercices[0]!.series[0]!.charge_eff, 90); // pesée de janvier (80) + 10

  await modifierSeance(db, id, { titre: null });
  assert.equal((await lireSeance(db, id))!.seance.titre, null);
});
