// Poids de corps manuel et automatique : pesée datée, correction, origine des pesées importées (migration 10).
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerExercice } from "../src/db/depots/exercices.ts";
import { ajouterPesee, listerPesees, modifierPesee, synchroniserPoidsSante } from "../src/db/depots/pesees.ts";
import { recalculerExercice } from "../src/db/depots/recalcul.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { ajouterSerie, cocherSerie, demarrerSeance, lireSeance, modifierSerie, terminerSeance } from "../src/db/depots/seances.ts";
import { datePesee, jourPesee, lignesServices, nbJoursMois, nomOrigine, valeursAnnees } from "../src/ecrans/poids.ts";
import { baseDeTest, jour } from "./aide.ts";

type Db = Awaited<ReturnType<typeof baseDeTest>>["db"];

/** Une séance de dips lestés (10 kg × 10) faite à `debut`. */
async function dips(db: Db, exo: string, debut: number) {
  const id = await demarrerSeance(db, null, "Test");
  await db.runAsync("UPDATE seances SET debut = ? WHERE id = ?", [debut, id]);
  const sid = await ajouterSerie(db, { seanceId: id, exerciceId: exo });
  await modifierSerie(db, sid, { kg: 10, reps: 10, dureeS: null, distanceM: null });
  await cocherSerie(db, sid, true);
  await db.runAsync("UPDATE series SET fait_le = ? WHERE id = ?", [debut, sid]);
  await recalculerExercice(db, exo);
  await terminerSeance(db, id, debut + 3_600_000);
  return id;
}
const chargeEff = async (db: Db, s: string) => (await lireSeance(db, s))!.exercices[0]!.series[0]!.charge_eff;

test("une pesée datée dans le passé recalcule les séances faites après cette date, pas celles d'avant", async () => {
  const { db } = await baseDeTest();
  const exo = await creerExercice(db, { nom: "Dips", nature: "leste" });
  await ajouterPesee(db, 80, jour(2026, 1, 1));
  const mars = await dips(db, exo, jour(2026, 3, 10));
  const juin = await dips(db, exo, jour(2026, 6, 10));
  assert.equal(await chargeEff(db, juin), 90);

  // Saisie le 26 oct., datée du 1er mai (début du jour) : juin passe à 76 + 10, mars ne bouge pas.
  await ajouterPesee(db, 76, datePesee(1, 4, 2026, jour(2026, 10, 26)));
  assert.equal(await chargeEff(db, juin), 86);
  assert.equal(await chargeEff(db, mars), 90);
});

test("une pesée du jour même d'une séance passée compte pour cette séance (début du jour)", async () => {
  const { db } = await baseDeTest();
  const exo = await creerExercice(db, { nom: "Dips", nature: "leste" });
  await ajouterPesee(db, 80, jour(2026, 1, 1));
  const s = await dips(db, exo, jour(2026, 6, 10, 7, 30));
  await ajouterPesee(db, 75, datePesee(10, 5, 2026, jour(2026, 10, 26)));
  assert.equal(await chargeEff(db, s), 85);
});

test("une pesée plus ancienne que la première change les séances antérieures", async () => {
  const { db } = await baseDeTest();
  const exo = await creerExercice(db, { nom: "Dips", nature: "leste" });
  const fevrier = await dips(db, exo, jour(2026, 2, 10));
  await ajouterPesee(db, 80, jour(2026, 5, 1));
  assert.equal(await chargeEff(db, fevrier), 90); // avant la première pesée : la plus ancienne
  await ajouterPesee(db, 84, jour(2026, 1, 1));
  assert.equal(await chargeEff(db, fevrier), 94);
});

test("modifierPesee : changer la date ou le poids recalcule", async () => {
  const { db } = await baseDeTest();
  const exo = await creerExercice(db, { nom: "Dips", nature: "leste" });
  await ajouterPesee(db, 80, jour(2026, 1, 1));
  const id = await ajouterPesee(db, 76, jour(2026, 8, 1));
  const juin = await dips(db, exo, jour(2026, 6, 10));
  assert.equal(await chargeEff(db, juin), 90);
  await modifierPesee(db, id, { date: jour(2026, 5, 1, 0) });
  assert.equal(await chargeEff(db, juin), 86);
  await modifierPesee(db, id, { kg: 74 });
  assert.equal(await chargeEff(db, juin), 84);
  await assert.rejects(modifierPesee(db, id, { kg: 0 }), /illisible/);
});

test("une pesée importée ne se modifie pas ; synchroniser garde l'appli d'origine (migration 10)", async () => {
  const { db, raw } = await baseDeTest();
  const cols = (raw.prepare("PRAGMA table_info(pesee)").all() as { name: string }[]).map((c) => c.name);
  assert.ok(cols.includes("origine"));

  await ecrireReglage(db, "sante_poids", "1");
  const source = { disponible: async () => true, dernierPoids: async () => ({ kg: 78.4, date: jour(2026, 10, 25), origine: "com.withings.wiscale2" }) };
  assert.equal(await synchroniserPoidsSante(db, source), true);
  assert.equal(await synchroniserPoidsSante(db, source), false); // dédoublonné
  const [p] = await listerPesees(db);
  assert.equal(p!.source, "sante_connect");
  assert.equal(p!.origine, "com.withings.wiscale2");
  assert.equal(nomOrigine(p!.origine), "Withings");
  assert.equal(nomOrigine(null), "Import automatique");
  await assert.rejects(modifierPesee(db, p!.id, { date: jour(2026, 10, 1) }), /importée/);

  const manuelle = await ajouterPesee(db, 79, jour(2026, 10, 20));
  assert.equal((await listerPesees(db)).find((x) => x.id === manuelle)!.origine, null);
});

test("datePesee : début du jour dans le passé, jamais dans le futur, fin de mois ramenée", () => {
  const maintenant = jour(2026, 10, 26, 9, 15);
  assert.equal(datePesee(22, 9, 2026, maintenant), new Date(2026, 9, 22).getTime());
  assert.equal(datePesee(26, 9, 2026, maintenant), maintenant); // aujourd'hui garde l'heure
  assert.equal(datePesee(3, 11, 2026, maintenant), maintenant); // futur : maintenant
  assert.equal(datePesee(31, 1, 2026, maintenant), new Date(2026, 1, 28).getTime());
  assert.equal(datePesee(31, 1, 2024, maintenant), new Date(2024, 1, 29).getTime());
  assert.equal(nbJoursMois(2026, 3), 30);
  const a = valeursAnnees(maintenant);
  assert.equal(a[0], 2015);
  assert.equal(a.at(-1), 2026);
});

test("jourPesee : aujourd'hui, hier, jour court, année si autre", () => {
  const maintenant = jour(2026, 10, 26, 9);
  assert.equal(jourPesee(jour(2026, 10, 26, 7), maintenant), "Aujourd'hui");
  assert.equal(jourPesee(jour(2026, 10, 25, 23), maintenant), "Hier");
  assert.match(jourPesee(jour(2026, 10, 22), maintenant), /^\S+ 22 oct\.?$/);
  assert.match(jourPesee(jour(2024, 10, 3), maintenant), / 2024$/);
});

test("lignesServices : éteintes sans module, état par appli sinon, Google Fit remplacée", () => {
  const eteint = lignesServices({ connecteur: "non-branche", applis: [] });
  assert.deepEqual(eteint.map((l) => l.etat), ["eteint", "eteint", "eteint", "remplacee"]);
  assert.equal(eteint[3]!.detail, "Remplacée par Santé Connect");
  assert.ok(eteint.slice(0, 3).every((l) => l.detail === null));

  const pret = lignesServices({
    connecteur: "pret",
    applis: [
      { paquet: "com.sec.android.app.shealth", installee: true, partage: true },
      { paquet: "com.withings.wiscale2", installee: true, partage: false },
    ],
  });
  assert.deepEqual(pret.map((l) => l.etat), ["reconnu", "a-autoriser", "pas-installee", "remplacee"]);
  assert.equal(pret[2]!.detail, "Pas installée");
});
