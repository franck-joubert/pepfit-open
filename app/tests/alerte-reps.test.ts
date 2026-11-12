// Fold du 31/10 (docs/ALERTE-REPS.md) : 85 répétitions tapées par erreur, corrigées en 5, puis la coche tout de suite. La
// feuille « Tu viens vraiment de faire 85 répétitions ? » montait quand même : la coche lisait la série en mémoire (85, relue
// après l'écriture différée), pas la case en saisie (5). La coche lit la valeur affichée et l'écrit avec elle.
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerExercice } from "../src/db/depots/exercices.ts";
import { creerRoutine } from "../src/db/depots/routines.ts";
import { cocherSerie, demarrerSeanceDepuisRoutine, ecrireSaisieSerie, lireSeance, modifierSerie } from "../src/db/depots/seances.ts";
import { clavierSeance } from "../src/ecrans/clavier-seance.ts";
import { avecCoches, cocherOptimiste, type Coche } from "../src/ecrans/coche-optimiste.ts";
import { minuteur } from "../src/natif/minuteur/index.ts";
import { patchSaisie, saisieDe, serieAffichee, serieDeCase } from "../src/ecrans/saisie-en-cours.ts";
import { meilleursDe, recordsDeSeance, valeurInhabituelle } from "../src/ecrans/seance-reperes.ts";
import { baseDeTest } from "./aide.ts";

async function seance() {
  const { db } = await baseDeTest();
  const curl = await creerExercice(db, { nom: "Curl Pupitre" });
  const r = await creerRoutine(db, "Bras", [{ exerciceId: curl, nbSeries: 3, reposS: 120 }]);
  const id = await demarrerSeanceDepuisRoutine(db, r, false);
  return { db, id, curl };
}

/** Le clavier de séance sur la case des répétitions de `serieId` ; le brouillon (écriture différée) va en base. */
function ouvrirReps(db: Awaited<ReturnType<typeof seance>>["db"], serieId: string, ecrites: Promise<void>[]) {
  clavierSeance.ouvrir({
    cle: `${serieId}-reps`,
    champ: "reps",
    decimal: false,
    temps: false,
    unite: "kg",
    paliers: null,
    saisie: { texte: "", remplacer: true },
    ecrire: () => {},
    brouillon: (t) => void ecrites.push(ecrireSaisieSerie(db, serieId, patchSaisie("reps", t, "kg"))),
  });
}

// Historique : 7 kg × 20 (comme sur la capture) ; au-delà de 40 répétitions, la valeur est inhabituelle.
const histo = meilleursDe([{ kg: 7, reps: 20, duree_s: null }]);
const inhabituelle = (x: { kg: number | null; reps: number | null; duree_s: number | null }) => valeurInhabituelle({ kg: x.kg, reps: x.reps, duree_s: x.duree_s }, histo);

test("85 tapé, corrigé en 5, coché tout de suite : 0 alerte, 5 enregistré", async () => {
  const { db, id } = await seance();
  minuteur.passer();
  const x0 = (await lireSeance(db, id))!.exercices[0]!.series[1]!;
  await modifierSerie(db, x0.id, { kg: 7 });
  const ecrites: Promise<void>[] = [];
  ouvrirReps(db, x0.id, ecrites);
  clavierSeance.toucher("8");
  clavierSeance.toucher("5");
  clavierSeance.viderBrouillon(); // l'écriture différée a eu lieu…
  await Promise.all(ecrites);
  const relue = (await lireSeance(db, id))!; // …et une relecture a mis 85 dans la séance en mémoire
  const x = relue.exercices[0]!.series[1]!;
  assert.equal(x.reps, 85);
  clavierSeance.toucher("effacer");
  clavierSeance.toucher("effacer");
  clavierSeance.toucher("5"); // la case montre 5 ; le brouillon attend encore
  assert.equal(clavierSeance.caseActive()!.saisie.texte, "5");

  // Le défaut : la série en mémoire alerte.
  assert.equal(inhabituelle(x), "reps");
  // La coche lit la valeur affichée : aucune alerte.
  const vue = serieAffichee(x, clavierSeance.caseActive(), "kg");
  assert.equal(vue.reps, 5);
  assert.equal(inhabituelle(vue), null);

  // La coche écrit 5 avec elle ; la séance affichée montre 5 (et pas de record à 85) avant toute relecture.
  const saisie = saisieDe(x.id, clavierSeance.caseActive(), "kg");
  let posee: Coche | null = null;
  await cocherOptimiste({ db, seance: relue, serie: x, faite: true, saisie, file: { current: Promise.resolve() }, apres: (f) => f(), poser: (c) => void (posee = c), retirer: () => {}, erreur: (e) => assert.fail(String(e)) });
  const affichee = avecCoches(relue, new Map([[x.id, posee!]])).exercices[0]!.series[1]!;
  assert.equal(affichee.reps, 5);
  assert.equal(affichee.faite, 1);
  const recs = recordsDeSeance([{ id: x.id, exercice_id: x.exercice_id, kg: affichee.kg, reps: affichee.reps, duree_s: null, faite: 1, echauffement: false }], { [x.exercice_id]: histo });
  assert.equal(recs.size, 0, "5 répétitions ne battent pas 7 × 20");
  clavierSeance.fermer(`${x.id}-reps`); // la case perd le focus (le brouillon en attente est oublié)
  const fin = (await lireSeance(db, id))!.exercices[0]!.series[1]!;
  assert.equal(fin.reps, 5);
  assert.equal(fin.faite, 1);
  minuteur.passer();
});

test("la case perd le focus pendant la coche : les deux écritures ne s'écrasent pas", async () => {
  const { db, id } = await seance();
  const x = (await lireSeance(db, id))!.exercices[0]!.series[0]!;
  await ecrireSaisieSerie(db, x.id, { reps: 85 });
  // L'enregistrement de la case (5) et la coche partent ensemble : avant, chacune relisait la ligne hors transaction et la
  // seconde réécrivait 85 ou décochait.
  await Promise.all([modifierSerie(db, x.id, { reps: 5 }), cocherSerie(db, x.id, true)]);
  const s = (await lireSeance(db, id))!.exercices[0]!.series[0]!;
  assert.equal(s.reps, 5);
  assert.equal(s.faite, 1);
});

test("kg, temps, distance : la case en saisie l'emporte, dans l'unité affichée ; une autre série n'est pas touchée", () => {
  const x = { id: "s1", kg: 70, reps: 8, duree_s: 60, distance_m: 1000 };
  const c = (champ: string, texte: string, temps = false) => ({ cle: `s1-${champ}`, temps, saisie: { texte } });
  assert.equal(serieAffichee(x, c("kg", "72,5"), "kg").kg, 72.5);
  assert.equal(serieAffichee(x, c("kg", "100"), "lbs").kg, 45.359);
  assert.equal(serieAffichee(x, c("duree_s", "  : 1:27", true), "kg").duree_s, 87);
  assert.equal(serieAffichee(x, c("distance_m", "1500"), "kg").distance_m, 1500);
  assert.equal(serieAffichee(x, { cle: "s2-reps", temps: false, saisie: { texte: "5" } }, "kg"), x, "autre série : même objet");
  assert.equal(serieAffichee(x, null, "kg"), x);
  assert.deepEqual(serieDeCase("ab-cd-reps"), { serieId: "ab-cd", champ: "reps" });
  assert.deepEqual(serieDeCase("ab-distance_m"), { serieId: "ab", champ: "distance_m" });
});

test("écran : coche, alerte, chrono et Terminer lisent la valeur affichée", async () => {
  const { readFileSync } = await import("node:fs");
  const lire = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  const a = lire("ecrans/actions-seance.tsx");
  assert.match(a, /const x = affichee\(y\);\n\s+if \(!x\.faite\)/, "onToggle");
  assert.match(a, /const x = affichee\(y\);\n\s+\/\/ Temps réel/, "onChrono");
  assert.match(a, /const x = affichee\(alerte\.serie\)/, "Ignorer l'avertissement");
  assert.match(a, /saisie,\n\s+file: ecritures/, "la coche écrit la saisie");
  assert.match(lire("app/session.tsx"), /enregistrerSaisie\(\)[^\n]*router\.push\("\/done"\)/);
});
