// Entrées de la règle des macros (objectifs-calc.ts) et leur lecture dans la base (dépôt des objectifs) : historique de dépense
// sur 28 jours (D1), niveau, déclarations, séances, perte récente, et les statuts rendus à l'appelant (D12).
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import {
  contexteDepuis,
  declarationsDepuis,
  historiqueDepense,
  jourDepenseDepuis,
  niveauDepuisSport,
  niveauEntrainement,
  perteRecente,
  seancesParSemaineMesurees,
  type JourDepense,
} from "../src/nutrition/objectifs-calc.ts";
import { OBJECTIF_DEFAUT, decalerJour } from "../src/nutrition/calculs.ts";
import { lireObjectif, objectifCalcule, objectifDetailCalcule } from "../src/db/depots/objectifs.ts";
import { ajouterGras } from "../src/ecrans/mesures/corps-donnees.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { ajouterMensuration } from "../src/db/depots/profil.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";

const proche = (a: number | null | undefined, b: number, e = 1) => assert.ok(a != null && Math.abs(a - b) <= e, `${a} ≠ ${b} (±${e})`);
const JOUR = 86_400_000;
const AUJ = "2026-11-01";
const jours = (n: number, f: (i: number, jour: string) => Partial<JourDepense> = () => ({})): JourDepense[] =>
  Array.from({ length: n }, (_, i) => {
    const jour = decalerJour(AUJ, -(i + 1));
    return { jour, kcal: 2800, recalee: true, enCours: false, apportsJournal: true, ...f(i, jour) };
  });

test("D1 : dépense mesurée = moyenne des jours recalés sur 28 jours, avec 14 jours d'apports au moins", () => {
  const h = historiqueDepense(jours(28, (i) => ({ kcal: i % 2 ? 2900 : 2800 })), AUJ);
  assert.deepEqual(h.depenseMesuree28j, { kcal: 2850, joursAvecApports: 28 });
  assert.equal(h.joursAvecApports28j, 28);
  assert.equal(h.depenseCalculee28j, 2850);
  // 13 jours d'apports : pas de mesure, la calculée reste
  const treize = historiqueDepense(jours(28, (i) => ({ apportsJournal: i < 13 })), AUJ);
  assert.equal(treize.depenseMesuree28j, null);
  assert.equal(treize.depenseCalculee28j, 2800);
  // pas de jour recalé (journal ou pesées insuffisants) : calculée seulement
  assert.equal(historiqueDepense(jours(28, () => ({ recalee: false })), AUJ).depenseMesuree28j, null);
  // moins de 7 jours : rien
  assert.deepEqual(historiqueDepense(jours(5), AUJ), { depenseMesuree28j: null, depenseCalculee28j: null, joursAvecApports28j: 5 });
});

test("D1 : la fenêtre s'arrête à hier et ne remonte pas au-delà de 28 jours ; un jour passé resté ouvert est écarté", () => {
  const vieux = jours(10).map((j, i) => ({ ...j, jour: decalerJour(AUJ, -40 - i), kcal: 9999 }));
  const h = historiqueDepense([...jours(28), ...vieux, { jour: AUJ, kcal: 9999, recalee: true, enCours: true, apportsJournal: true }], AUJ);
  assert.equal(h.depenseCalculee28j, 2800);
  const ouverts = historiqueDepense(jours(28, (i) => ({ enCours: i < 21, kcal: i < 21 ? 100 : 2800 })), AUJ);
  assert.equal(ouverts.depenseCalculee28j, 2800); // 7 jours finis seulement
});

test("jour_energie : une ligne de dépense devient un jour ; sans kcal, rien", () => {
  assert.deepEqual(jourDepenseDepuis("2026-10-31", { kcal: 2858, recalee: true, en_cours: false, apports: { kcal: 2500, source: "journal" } }), {
    jour: "2026-10-31", kcal: 2858, recalee: true, enCours: false, apportsJournal: true,
  });
  assert.equal(jourDepenseDepuis("2026-10-31", { kcal: 2858, apports: { kcal: 2500, source: "habitudes" } })!.apportsJournal, false);
  assert.equal(jourDepenseDepuis("2026-10-31", { kcal: 0 }), null);
  assert.equal(jourDepenseDepuis("2026-10-31", null), null);
});

test("niveau : choisi à la main, sinon celui du parcours (0 débutant, 1 et 2 intermédiaire, 3 avancé), sinon intermédiaire", () => {
  assert.equal(niveauDepuisSport("0"), "debutant");
  assert.equal(niveauDepuisSport(1), "intermediaire");
  assert.equal(niveauDepuisSport("2"), "intermediaire");
  assert.equal(niveauDepuisSport("3"), "avance");
  assert.equal(niveauDepuisSport(null), "intermediaire");
  assert.equal(niveauEntrainement("avance", "0"), "avance");
  assert.equal(niveauEntrainement("n'importe quoi", "0"), "debutant");
});

test("déclarations : clés séparées par des virgules, les inconnues sont ignorées", () => {
  assert.deepEqual(declarationsDepuis("grossesse, diabeteOuRein,truc"), { grossesse: true, diabeteOuRein: true });
  assert.deepEqual(declarationsDepuis(null), {});
  assert.deepEqual(declarationsDepuis(""), {});
});

test("séances : le rythme des 8 dernières semaines (4 séances au moins), sinon celui du niveau ; régulier à 24 séances", () => {
  const t = new Date(2026, 10, 1, 12).getTime();
  const debuts = (n: number) => Array.from({ length: n }, (_, i) => t - (i + 1) * JOUR);
  assert.deepEqual(seancesParSemaineMesurees(debuts(48), t, 3), { seancesParSemaine: 6, regulier8Semaines: true });
  assert.deepEqual(seancesParSemaineMesurees(debuts(16), t, 3), { seancesParSemaine: 2, regulier8Semaines: false });
  assert.deepEqual(seancesParSemaineMesurees(debuts(2), t, 3), { seancesParSemaine: 6, regulier8Semaines: false }); // niveau 3 : 6
  assert.deepEqual(seancesParSemaineMesurees(debuts(0), t, null), { seancesParSemaine: 3, regulier8Semaines: false });
  assert.equal(seancesParSemaineMesurees([t - 100 * JOUR], t, 1).seancesParSemaine, 3);
});

test("perte récente : plus haut poids des 12 dernières semaines moins le dernier, en %", () => {
  const t = new Date(2026, 10, 1).getTime();
  const p = [{ date: t - 80 * JOUR, kg: 84 }, { date: t - 40 * JOUR, kg: 80 }, { date: t - 2 * JOUR, kg: 78 }];
  proche(perteRecente(p, t), ((84 - 78) / 84) * 100, 0.001);
  assert.equal(perteRecente([{ date: t - 3 * JOUR, kg: 78 }], t), null);
  assert.equal(perteRecente([{ date: t - 100 * JOUR, kg: 90 }, { date: t - 2 * JOUR, kg: 78 }], t), null); // le plus haut est hors fenêtre : une seule pesée
  assert.equal(perteRecente([{ date: t - 20 * JOUR, kg: 70 }, { date: t - 2 * JOUR, kg: 74 }], t), null);
});

test("contexteDepuis : tout est rassemblé de la même façon pour l'appli et pour le serveur", () => {
  const t = new Date(2026, 10, 1, 12).getTime();
  const c = contexteDepuis({
    maintenant: t, niveauSport: "2", niveauChoisi: null, declarations: "allaitement", alerteGlucides: "0",
    debutsSeances: Array.from({ length: 48 }, (_, i) => t - (i + 1) * JOUR), pesees: [], jours: jours(28),
  });
  assert.equal(c.niveau, "intermediaire");
  assert.equal(c.seancesParSemaine, 6);
  assert.equal(c.regulier8Semaines, true);
  assert.deepEqual(c.declarations, { allaitement: true });
  assert.equal(c.alerteGlucides, false);
  assert.equal(c.historique!.depenseMesuree28j!.kcal, 2800);
});

// ---- Dans la base ----------------------------------------------------------------------------------------------------------------

async function profilType() {
  const { db } = await baseDeTest();
  const t = new Date(2026, 10, 1, 12).getTime();
  await ecrireReglage(db, "sexe", "h");
  await ecrireReglage(db, "naissance", "1987-05-14");
  await ajouterMensuration(db, "taille", 180, t - JOUR);
  await ajouterPesee(db, 78, t - 3_600_000);
  assert.ok(await ajouterGras(db, 14.2, t - 1_800_000));
  await ecrireReglage(db, "nutri_poids_cible", "82");
  await ecrireReglage(db, "nutri_gras_cible", "12.2");
  await ecrireReglage(db, "nutri_rythme", "0.25");
  await ecrireReglage(db, "niveau_sport", "2");
  return { db, t };
}

const ecrireJours = async (db: Awaited<ReturnType<typeof profilType>>["db"], t: number, n: number) => {
  for (let i = 1; i <= n; i++) {
    const jour = decalerJour("2026-11-01", -i);
    const depense = JSON.stringify({ kcal: 2858, recalee: true, en_cours: false, apports: { kcal: 2700, source: "journal" } });
    await db.runAsync("INSERT INTO jour_energie (jour, depense, seances, maj_le) VALUES (?,?,?,?)", [jour, depense, "[]", t]);
  }
};

test("dépôt : sans jour_energie la formule sert (« estimation à affiner »), avec 28 jours la dépense mesurée d'Alex (2 858)", async () => {
  const { db, t } = await profilType();
  const avant = (await objectifDetailCalcule(db, "repos", t))!;
  assert.equal(avant.source, "formule");
  assert.ok(avant.alertes.includes("estimationAAffiner"));
  await ecrireJours(db, t, 28);
  const apres = (await objectifDetailCalcule(db, "repos", t))!;
  assert.equal(apres.source, "mesuree");
  assert.equal(apres.depenseEntretienKcal, 2858);
  assert.equal(apres.statut, "ok");
  assert.equal(apres.type, "prise");
  // la cible de 82 kg à 12,2 % de gras demande trop de maigre : signalée, avec la fourchette réaliste
  assert.ok(apres.alertes.includes("cibleMaigreIrrealiste"));
  assert.equal(apres.cible!.realiste, false);
  assert.ok(apres.cible!.fourchetteMaigreKg![1] < apres.cible!.gainMaigreKg);
  // kcal de la semaine proches de la dépense mesurée (+ l'excédent de la prise, < 10 %)
  assert.ok(apres.kcalMoyenneSemaine! > 2858 && apres.kcalMoyenneSemaine! <= 2858 * 1.1 + 1);
  // les écrans lisent les mêmes valeurs
  const o = (await objectifCalcule(db, "repos", t))!;
  assert.equal(o.proteines, apres.proteinesG);
  assert.equal(o.glucides, apres.glucidesG);
});

test("dépôt : une grossesse déclarée → non_calcule, pas de chiffres ; l'écran garde les objectifs réglés ou ceux par défaut", async () => {
  const { db, t } = await profilType();
  await ecrireReglage(db, "sexe_declare", "f");
  await ecrireReglage(db, "nutri_auto", "1");
  await ecrireReglage(db, "nutri_declarations", "grossesse");
  const d = (await objectifDetailCalcule(db, "repos", t))!;
  assert.equal(d.statut, "non_calcule");
  assert.deepEqual(d.raisons, ["grossesse"]);
  assert.equal(d.kcal, null);
  assert.equal(await objectifCalcule(db, "repos", t), null);
  assert.deepEqual(await lireObjectif(db, "repos"), OBJECTIF_DEFAUT.repos);
});

test("dépôt : les séances des 8 dernières semaines fixent le rythme (6 par semaine → Ten Haaf sans mesure) ; l'alerte des glucides s'éteint", async () => {
  const { db, t } = await profilType();
  for (let i = 1; i <= 48; i++) await db.runAsync("INSERT INTO seances (id, debut, fin, maj_le) VALUES (?,?,?,?)", [`s${i}`, t - i * JOUR, t - i * JOUR + 3_600_000, t]);
  const d = (await objectifDetailCalcule(db, "repos", t))!;
  assert.equal(d.source, "formule");
  assert.equal(d.methodeRepos, "tenHaaf");
  await ecrireReglage(db, "nutri_alerte_glucides", "0");
  assert.ok(!(await objectifDetailCalcule(db, "repos", t))!.alertes.includes("glucidesBas"));
});

test("ancienneté d'entraînement : la première séance connue règle le niveau quand rien n'est choisi (02/11)", async () => {
  const { niveauDepuisAnciennete, niveauEntrainement } = await import("../src/nutrition/objectifs-calc");
  const J = 86_400_000;
  const maintenant = Date.UTC(2026, 10, 2);
  assert.equal(niveauDepuisAnciennete(null, maintenant), null);
  assert.equal(niveauDepuisAnciennete(maintenant - 30 * J, maintenant), null, "historique trop court : le parcours décide");
  assert.equal(niveauDepuisAnciennete(maintenant - 200 * J, maintenant), "debutant");
  assert.equal(niveauDepuisAnciennete(maintenant - 800 * J, maintenant), "intermediaire");
  assert.equal(niveauDepuisAnciennete(maintenant - 1500 * J, maintenant), "avance");
  // le choix à la main prime, puis l'ancienneté, puis le parcours
  assert.equal(niveauEntrainement("debutant", 3, maintenant - 1500 * J, maintenant), "debutant");
  assert.equal(niveauEntrainement(null, 0, maintenant - 1500 * J, maintenant), "avance");
  assert.equal(niveauEntrainement(null, 3, maintenant - 10 * J, maintenant), "avance", "historique court : niveau du parcours");
});
