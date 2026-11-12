// Bloc Énergie de Santé : jamais « à compléter ». Installation neuve : un bilan quand même (adulte de référence), précision
// faible et le conseil qui rapporte le plus ; chaque donnée ajoutée fait monter la précision. Base SQLite réelle, Santé
// Connect absent sous Node.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ajouterMensuration, ecrireAnneeNaissance, ecrireSexe } from "../src/db/depots/profil.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { etatEnergie, jourEnergie, listeManques, manquesProfil } from "../src/ecrans/sante-donnees.ts";
import { conseilDepense } from "../src/precision/modele.ts";
import { lireDonneesPrecision } from "../src/precision/lire.ts";
import { baseDeTest } from "./aide.ts";

const H = 3_600_000;
const MINUIT = new Date(2026, 9, 28).getTime();

test("manques dans l'ordre de la phrase", () => {
  assert.deepEqual(manquesProfil({ sexe: null, tailleCm: null, kg: null, age: null }), ["poids", "taille", "age", "sexe"]);
  assert.deepEqual(manquesProfil({ sexe: "h", tailleCm: 180, kg: null, age: 39 }), ["poids"]);
  assert.deepEqual(manquesProfil({ sexe: "f", tailleCm: 165, kg: 60, age: 36 }), []);
});

test("phrase : « ton poids, ta taille et ton âge »", () => {
  assert.equal(listeManques(["poids", "taille", "age"]), "ton poids, ta taille et ton âge");
  assert.equal(listeManques(["sexe"]), "ton sexe");
});

test("installation neuve : un bilan (métabolisme par défaut), précision faible, conseil « complète ton profil »", async () => {
  const { db } = await baseDeTest();
  const e = await etatEnergie(db, MINUIT, MINUIT + 12 * H);
  assert.equal(e.etat, "bilan");
  assert.ok(e.etat === "bilan");
  assert.equal(e.e.bmr.methode, "defaut");
  assert.equal(e.e.bilan.depense.precision, "faible");
  assert.equal(conseilDepense((await lireDonneesPrecision(db, {}, MINUIT + 12 * H)).d), "profil");
  // la dépense du jour en cours monte avec la journée (le métabolisme de base au prorata des heures écoulées)
  assert.ok(e.e.bilan.depense.kcal > 700 && e.e.bilan.depense.kcal < 1500, String(e.e.bilan.depense.kcal));
  const soir = await etatEnergie(db, MINUIT, MINUIT + 23 * H);
  assert.ok(soir.etat === "bilan" && soir.e.bilan.depense.kcal > 1500, "fin de journée : la dépense entière");
});

test("chaque donnée ajoutée fait baisser l'incertitude relative ; profil complet : Mifflin, plus de conseil de profil", async () => {
  const { db } = await baseDeTest();
  const relatif = (d: { sigma: number; kcal: number }) => d.sigma / d.kcal;
  const sigma = async () => relatif((await jourEnergie(db, MINUIT, MINUIT + 12 * H)).bilan.depense);
  const s0 = await sigma();
  await ajouterPesee(db, 78, MINUIT + H, "manuel");
  const s1 = await sigma();
  await ecrireSexe(db, "h");
  const s2 = await sigma();
  await ecrireAnneeNaissance(db, 1987);
  const s3 = await sigma();
  await ajouterMensuration(db, "taille", 180, MINUIT - 24 * H);
  const e = await jourEnergie(db, MINUIT, MINUIT + 12 * H);
  assert.ok(s0 > s1 && s1 > s2 && s2 > s3 && s3 > relatif(e.bilan.depense), `${s0} ${s1} ${s2} ${s3}`);
  assert.equal(e.bmr.methode, "mifflin");
  // sous Node, aucune source de pas : le conseil restant est de les brancher
  assert.equal(conseilDepense((await lireDonneesPrecision(db, {}, MINUIT + 12 * H)).d), "pas");
});
