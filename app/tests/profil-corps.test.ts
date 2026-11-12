// Profil du corps (page Corps, 29/10) : chaque valeur avec sa source, la saisie qui prime, Whoop et Santé Connect sans
// doublon, l'âge depuis la date de naissance complète (l'année seule en repli). Valeurs fictives.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { ajouterMesures } from "../src/db/depots/mesures.ts";
import { ajouterPesee, importerPeseesSante, listerPesees } from "../src/db/depots/pesees.ts";
import {
  ageA, ajouterMensuration, ecrireAnneeNaissance, ecrireDateNaissance, ecrireSexe, lireAge, lireAnneeNaissance, lireDateIso, lireProfilCorps,
} from "../src/db/depots/profil.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { lireFcMax } from "../src/db/depots/suivi-gps.ts";
import { ecrireModeFcMax } from "../src/db/depots/zones-fc.ts";
import { enregistrerCorps } from "../src/whoop/depot.ts";
import { corpsVersPepfit } from "../src/whoop/convertir.ts";
import { etatEnergie, routeManque } from "../src/ecrans/sante-donnees.ts";

const H = 3_600_000;
const T = new Date(2026, 9, 29, 9).getTime();

test("âge : depuis la date complète (anniversaire passé ou non), sinon l'année seule", () => {
  assert.equal(ageA({ a: 1980, m: 10, j: 29 }, null, T), 46, "anniversaire aujourd'hui");
  assert.equal(ageA({ a: 1980, m: 10, j: 30 }, null, T), 45, "demain");
  assert.equal(ageA(null, 1980, T), 46);
  assert.equal(ageA(null, null, T), null);
  assert.deepEqual(lireDateIso("1981-02-29"), null, "29 février d'une année non bissextile");
  assert.deepEqual(lireDateIso("1984-02-29"), { a: 1984, m: 2, j: 29 });
});

test("migration douce : l'année seule reste lue ; la date complète la remplace et garde l'année à jour", async () => {
  const { db } = await baseDeTest();
  await ecrireAnneeNaissance(db, 1980);
  assert.deepEqual(await lireAge(db, T), { age: 46, precision: "annee" });
  let p = await lireProfilCorps(db, T);
  assert.equal(p.naissance, null);
  assert.equal(p.anneeSeule, 1980);
  await ecrireDateNaissance(db, { a: 1980, m: 12, j: 3 });
  assert.deepEqual(await lireAge(db, T), { age: 45, precision: "date" });
  assert.equal(await lireAnneeNaissance(db), 1980);
  p = await lireProfilCorps(db, T);
  assert.deepEqual(p.naissance, { a: 1980, m: 12, j: 3 });
  assert.equal(p.anneeSeule, null);
  assert.equal(p.age, 45);
});

test("Whoop : poids, taille et FC max avec leur source ; la saisie prime ; rien n'est écrit deux fois", async () => {
  const { db } = await baseDeTest();
  const whoop = corpsVersPepfit({ height_meter: 1.75, weight_kilogram: 72.04, max_heart_rate: 186 });
  assert.deepEqual(whoop, { tailleCm: 175, kg: 72, fcMax: 186 });
  await enregistrerCorps(db, whoop, T - 2 * H);
  await enregistrerCorps(db, whoop, T - H); // même profil : rien de neuf
  assert.equal((await listerPesees(db)).length, 1);
  assert.equal((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM mesure_corps", []))!.n, 2);
  let p = await lireProfilCorps(db, T);
  assert.deepEqual(p.poids, { valeur: 72, date: T - 2 * H, source: "whoop", origine: "com.whoop.android" });
  assert.equal(p.taille?.source, "whoop");
  assert.equal(p.taille?.valeur, 175);
  assert.deepEqual(p.fcMax, { valeur: 186, date: T - 2 * H, source: "whoop", origine: "com.whoop.android" });
  assert.equal(await lireFcMax(db, T), 186);

  // la saisie prime : taille du parcours, FC max réglée, pesée du jour
  await ajouterMensuration(db, "taille", 176, T - 30 * 86_400_000);
  await ecrireReglage(db, "fc_max", "190");
  await ajouterPesee(db, 71.5, T - 10 * 60_000);
  // une seule résolution de la FC max (lot 6 de la précision) : la saisie compte quand on l'a choisie (feuille FC max)
  await ecrireModeFcMax(db, "saisie");
  p = await lireProfilCorps(db, T);
  assert.deepEqual([p.taille?.valeur, p.taille?.source], [176, "saisie"]);
  assert.deepEqual([p.fcMax?.valeur, p.fcMax?.source], [190, "saisie"]);
  assert.deepEqual([p.poids?.valeur, p.poids?.source], [71.5, "saisie"]);
  assert.equal(await lireFcMax(db, T), 190);

  // un profil Whoop au même poids que la dernière pesée ne la double pas
  await enregistrerCorps(db, { tailleCm: null, kg: 71.5, fcMax: null }, T);
  assert.equal((await listerPesees(db)).length, 2);
});

test("Santé Connect : pesées importées une fois, sans doubler une saisie ; coupé si l'utilisateur l'a éteint", async () => {
  const { db } = await baseDeTest();
  await ajouterPesee(db, 70.2, T - 24 * H + 5 * 60_000); // saisie à la main, même pesée que la balance
  const sc = {
    pesees: async () => [
      { kg: 70.2, date: T - 24 * H, origine: "com.exemple.balance" },
      { kg: 70.6, date: T - 3 * 24 * H, origine: "com.exemple.balance" },
    ],
  };
  assert.equal(await importerPeseesSante(db, sc), 1);
  assert.equal(await importerPeseesSante(db, sc), 0);
  const l = await listerPesees(db);
  assert.deepEqual(l.map((x) => [x.kg, x.source]), [[70.2, "manuel"], [70.6, "sante_connect"]]);
  await ecrireReglage(db, "sante_poids", "0");
  assert.equal(await importerPeseesSante(db, { pesees: async () => [{ kg: 69, date: T, origine: null }] }), 0);
});

test("taille de Santé Connect : lue avec son appli ; le bilan Énergie se précise avec ces mêmes sources", async () => {
  const { db } = await baseDeTest();
  const minuit = new Date(2026, 9, 29).getTime();
  const manques = async () => {
    const e = await etatEnergie(db, minuit, T);
    assert.equal(e.etat, "bilan", "toujours un bilan (29/10)");
    return e.etat === "bilan" ? e.e.bmr.manques ?? [] : null;
  };
  assert.deepEqual(await manques(), ["poids", "taille", "age", "sexe"]);
  await ajouterMesures(db, "taille", [{ valeur: 168, date: T - 48 * H, origine: "com.exemple.sante" }]);
  await enregistrerCorps(db, { tailleCm: null, kg: 64, fcMax: null }, T - H);
  const p = await lireProfilCorps(db, T);
  assert.deepEqual(p.taille, { valeur: 168, date: T - 48 * H, source: "sante_connect", origine: "com.exemple.sante" });
  assert.deepEqual(await manques(), ["age", "sexe"]);
  assert.equal(routeManque(["age", "sexe"]), "/settings/corps");
  assert.equal(routeManque(["poids", "sexe"]), "/sante/composition");
  await ecrireSexe(db, "f");
  await ecrireDateNaissance(db, { a: 1990, m: 4, j: 12 });
  const e = await etatEnergie(db, minuit, T);
  assert.ok(e.etat === "bilan" && e.e.bmr.methode === "mifflin", "profil complet : Mifflin");
});
