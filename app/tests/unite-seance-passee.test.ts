// Anomalie « LBS » : une séance passée faite en kg, dont la routine est en kg, montrait « LBS » en tête de colonne dès que
// sa salle avait (aujourd'hui) des haltères ou une machine réglés en lbs : la salle réglée depuis, posée après coup par la
// détection du lieu ou reçue d'un autre appareil.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ecrireMateriel } from "../src/db/depots/materiel.ts";
import { creerSalle } from "../src/db/depots/salles.ts";
import { ajouterSerie, cocherSerie, demarrerSeance, lireSeance, modifierSeance, terminerSeance } from "../src/db/depots/seances.ts";
import { unitesExercices, unitesSeance } from "../src/ecrans/donnees.ts";
import { baseDeTest } from "./aide.ts";

async function monde() {
  const { db } = await baseDeTest(true);
  const exo = (await db.getFirstAsync<{ id: string }>("SELECT id FROM exercices WHERE equipement = ? LIMIT 1", ["halteres"]))!.id;
  const salle = await creerSalle(db, "Lofting", ["halteres"]);
  // Les haltères de la salle sont en lbs (planche salles-inventaire : l'unité se règle par équipement).
  await ecrireMateriel(db, salle, {
    genre: "halteres", forme: null, nom: null, poids: [5, 10, 25, 50], poidsPropre: null, nombre: null, chargeMax: null, maxParCote: null, trou: null,
    prechargee: false, disques: [], unite: "lbs",
  });
  const s = await demarrerSeance(db, null);
  await cocherSerie(db, await ajouterSerie(db, { seanceId: s, exerciceId: exo, kg: 20, reps: 10 }), true);
  return { db, exo, salle, s };
}

test("reproduction : l'ancienne règle donne LBS à une séance passée posée après coup à la salle, la routine reste en kg", async () => {
  const { db, exo, salle, s } = await monde();
  await terminerSeance(db, s);
  await modifierSeance(db, s, { salleId: salle });
  const d = (await lireSeance(db, s))!;
  assert.equal((await unitesExercices(db, [exo], "kg", d.salle?.id ?? null))[exo], "lbs");
  assert.equal((await unitesExercices(db, [exo], "kg"))[exo], "kg", "la routine (sans salle) est en kg");
});

test("séance passée : l'unité suit celle de la routine (kg), pas l'équipement de la salle", async () => {
  const { db, exo, salle, s } = await monde();
  await terminerSeance(db, s);
  await modifierSeance(db, s, { salleId: salle });
  assert.equal((await unitesSeance(db, (await lireSeance(db, s))!, "kg"))[exo], "kg");
});

test("séance en cours : l'équipement de la salle compte toujours (on charge ses haltères)", async () => {
  const { db, exo, salle, s } = await monde();
  await modifierSeance(db, s, { salleId: salle });
  assert.equal((await unitesSeance(db, (await lireSeance(db, s))!, "kg"))[exo], "lbs");
});

test("séance passée : un choix d'unité de l'exercice (bascule KG / LBS) reste respecté", async () => {
  const { db, exo, s } = await monde();
  await terminerSeance(db, s);
  await db.runAsync("INSERT INTO reglages (cle, valeur) VALUES (?, 'lbs')", [`unite:${exo}`]);
  assert.equal((await unitesSeance(db, (await lireSeance(db, s))!, "kg"))[exo], "lbs");
});
