// Macros, D19 à D21 (planche des écrans validée le 01/11) : l'étape des garde-fous du parcours, le mode « sans chiffres » pour toute
// l'appli, et les réponses qui restent sur le téléphone (jamais synchronisées).
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import {
  CLE_DECLARATIONS,
  cibleSautee,
  casesGardeFous,
  cochesDepuisDeclarations,
  cocher,
  csvDepuisCoches,
  declarationsDepuisCoches,
  declarationsPourSexe,
  gardeFousRepondus,
  modeAffichage,
  peutContinuerGardeFous,
  type ChoixGardeFou,
} from "../src/nutrition/objectifs-calc.ts";
import { ecrireGardeFous, lireGardeFous, lireModeAffichage } from "../src/db/depots/objectifs.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { ajouterMensuration } from "../src/db/depots/profil.ts";
import { objectifNutrition, type ChargeRegle, type Declarations, type HistoriqueRegle, type ObjectifRegle, type ProfilRegle } from "../src/nutrition/regle.ts";
import { PREFIXES_REGLAGES_SYNC, REGLAGES_SYNC } from "../src/sync/schema.ts";
import { fr } from "../src/i18n/fr.ts";
import { en } from "../src/i18n/en.ts";

const JOUR = 86_400_000;
const sans: HistoriqueRegle = { depenseMesuree28j: null, depenseCalculee28j: null, perteRecentePct12Sem: null };
const repos: ChargeRegle = { seancesParSemaine: 3, depenseNetteSeanceKcal: 300, jour: "repos" };
const maintien: ObjectifRegle = { type: "maintien", rythmeSouhaitePctSemaine: null, poidsCibleKg: null, grasCiblePct: null };
const profil = (declarations: Declarations, extra: Partial<ProfilRegle> = {}): ProfilRegle => ({
  sexe: "f", age: 35, tailleCm: 165, poidsKg: 65, grasPct: 28, niveau: "intermediaire", activite: "debout", declarations, ...extra,
});
const mode = (declarations: Declarations, extra: Partial<ProfilRegle> = {}) => modeAffichage(objectifNutrition(profil(declarations, extra), maintien, repos, sans));

// ---- D19 : l'étape après le sexe ----------------------------------------------------------------------------------------------------

test("D19 : les cases selon le sexe, « Rien de tout ça » toujours en dernier ; la grossesse et l'allaitement seulement pour Femme et Non précisé (03/11)", () => {
  assert.deepEqual(casesGardeFous("f"), ["grossesse", "allaitement", "troubleAlimentaire", "diabeteOuRein", "traitementObesite", "rien"]);
  assert.deepEqual(casesGardeFous("x"), casesGardeFous("f"));
  assert.deepEqual(casesGardeFous("h"), ["troubleAlimentaire", "diabeteOuRein", "traitementObesite", "rien"]);
  assert.ok(!casesGardeFous(null).includes("grossesse") && !casesGardeFous(null).includes("allaitement"));
});

test("D19 : cocher plusieurs cases ; « Rien de tout ça » est exclusif ; « Continuer » dès une réponse, pas de « Passer »", () => {
  let c: ChoixGardeFou[] = [];
  assert.equal(peutContinuerGardeFous(c), false);
  c = cocher(c, "allaitement");
  c = cocher(c, "diabeteOuRein");
  assert.deepEqual(c, ["allaitement", "diabeteOuRein"]);
  assert.equal(peutContinuerGardeFous(c), true);
  c = cocher(c, "rien");
  assert.deepEqual(c, ["rien"]);
  c = cocher(c, "troubleAlimentaire");
  assert.deepEqual(c, ["troubleAlimentaire"], "cocher une case décoche « Rien de tout ça »");
  assert.deepEqual(cocher(c, "troubleAlimentaire"), [], "recocher la décoche");
});

test("D19 : les cases cochées → déclarations de la règle ; « injections ou opération » couvre l'obésité et la chirurgie ; l'étape faite sans case est « rien »", () => {
  assert.deepEqual(declarationsDepuisCoches(["allaitement", "traitementObesite"]), { allaitement: true, traitementObesite: true });
  assert.deepEqual(declarationsDepuisCoches(["rien"]), {});
  assert.equal(csvDepuisCoches(["rien"]), "rien");
  assert.equal(csvDepuisCoches([]), "rien");
  assert.equal(csvDepuisCoches(["allaitement", "diabeteOuRein"]), "allaitement,diabeteOuRein");
  assert.deepEqual(cochesDepuisDeclarations(null), [], "étape pas encore faite : rien de coché");
  assert.deepEqual(cochesDepuisDeclarations("rien"), ["rien"]);
  assert.deepEqual(cochesDepuisDeclarations("allaitement,chirurgieBariatrique"), ["allaitement", "traitementObesite"]);
  assert.equal(gardeFousRepondus(null), false);
  assert.equal(gardeFousRepondus("rien"), true);
});

test("D19 : grossesse ou trouble alimentaire → l'étape de la cible (poids visé) est sautée ; la grossesse ne vaut plus pour un homme", () => {
  assert.equal(cibleSautee({ grossesse: true }), true);
  assert.equal(cibleSautee({ troubleAlimentaire: true }), true);
  assert.equal(cibleSautee({ allaitement: true, diabeteOuRein: true }), false);
  assert.deepEqual(declarationsPourSexe({ grossesse: true, allaitement: true }, "h"), { allaitement: true });
  assert.deepEqual(declarationsPourSexe({ grossesse: true }, "f"), { grossesse: true });
  assert.deepEqual(declarationsPourSexe({ grossesse: true }, "x"), { grossesse: true });
});

test("D19 : plusieurs cases, le statut le plus prudent l'emporte (non calculé, puis sans chiffres, puis limité)", () => {
  assert.equal(mode({ allaitement: true }).ecran, "limite");
  assert.equal(mode({ allaitement: true, diabeteOuRein: true }).ecran, "limite");
  assert.equal(mode({ allaitement: true, troubleAlimentaire: true }).ecran, "sans_chiffres");
  assert.equal(mode({ allaitement: true, troubleAlimentaire: true, grossesse: true }).ecran, "grossesse");
  assert.equal(mode({}).ecran, "complet");
});

test("D19 : la phrase de chaque case et les textes de l'étape existent en français et en anglais", () => {
  const cles = ["titre", "sousTitre", "pied", "continuer", ...casesGardeFous("f").map((c) => `case.${c}`), ...["grossesse", "allaitement", "troubleAlimentaire", "diabeteOuRein", "traitementObesite"].map((c) => `phrase.${c}`)];
  for (const c of cles) {
    for (const [langue, dico] of [["fr", fr], ["en", en]] as const) assert.equal(typeof (dico as Record<string, unknown>)[`macros.garde.${c}`], "string", `${langue} macros.garde.${c}`);
  }
  assert.equal((fr as Record<string, unknown>)["macros.garde.titre"], "Une de ces situations te concerne ?");
  assert.equal((fr as Record<string, unknown>)["macros.garde.case.rien"], "Rien de tout ça");
  assert.equal((fr as Record<string, unknown>)["macros.garde.phrase.allaitement"], "pepfit visera ton entretien, sans déficit, avec plus de protéines.");
  // chaque raison que la règle peut rendre a son titre
  for (const r of ["mineur", "grossesse", "allaitement", "troubleAlimentaire", "imcBas", "perteImcBas", "diabeteOuRein", "traitementObesite", "chirurgieBariatrique", "age65"]) {
    for (const dico of [fr, en]) assert.equal(typeof (dico as Record<string, unknown>)[`macros.titre.${r}`], "string", r);
  }
});

// ---- D20 : le mode sans chiffres, pour toute l'appli ----------------------------------------------------------------------------------

test("D20 : le mode d'affichage selon le statut : complet, limité, sans chiffres, grossesse, mineur", () => {
  const complet = mode({});
  assert.deepEqual([complet.ecran, complet.objectifsVisibles, complet.totauxJournalVisibles, complet.ciblesVisibles, complet.sansChiffres], ["complet", true, true, true, false]);
  const limite = mode({ allaitement: true });
  assert.deepEqual([limite.ecran, limite.objectifsVisibles, limite.totauxJournalVisibles, limite.ciblesVisibles, limite.sansChiffres], ["limite", true, true, false, false]);
  assert.deepEqual(limite.raisons, ["allaitement"]);
  assert.deepEqual(limite.renvois, ["allaitement"]);
  const trouble = mode({ troubleAlimentaire: true });
  assert.deepEqual([trouble.ecran, trouble.objectifsVisibles, trouble.totauxJournalVisibles, trouble.ciblesVisibles, trouble.sansChiffres], ["sans_chiffres", false, false, false, true]);
  const bas = mode({}, { poidsKg: 50 });
  assert.deepEqual([bas.ecran, bas.raisons[0], bas.sansChiffres], ["sans_chiffres", "imcBas", true]);
  const grossesse = mode({ grossesse: true });
  assert.deepEqual([grossesse.ecran, grossesse.objectifsVisibles, grossesse.totauxJournalVisibles, grossesse.sansChiffres], ["grossesse", false, true, false]);
  const mineur = mode({}, { age: 15 });
  assert.deepEqual([mineur.ecran, mineur.statut, mineur.objectifsVisibles, mineur.totauxJournalVisibles], ["mineur", "non_calcule", false, true]);
  // 65 ans et plus : le même gabarit limité que les autres, sans cibles
  const senior = mode({}, { age: 70 });
  assert.deepEqual([senior.ecran, senior.statut, senior.ciblesVisibles], ["limite", "limite", false]);
});

test("D20 : sans chiffres, la règle ne rend aucun nombre de nutrition", () => {
  const r = objectifNutrition(profil({ troubleAlimentaire: true }), maintien, repos, sans);
  for (const k of ["kcal", "proteinesG", "lipidesG", "glucidesG", "fibresMinG", "sucresRepereG", "kcalMoyenneSemaine", "depenseEntretienKcal", "kcalAffichees", "depenseAffichee", "ecartAfficheKcal", "glucidesParKg", "rythmeMax", "cible"] as const) {
    assert.equal(r[k], null, k);
  }
  assert.equal(r.sansChiffres, true);
});

test("D20 : lireModeAffichage lit la base : sans profil d'après les seules réponses et l'âge, avec profil d'après la règle entière", async () => {
  const { db } = await baseDeTest();
  const t = new Date(2026, 10, 1, 12).getTime();
  assert.equal((await lireModeAffichage(db, t)).ecran, "complet", "rien de renseigné : complet");
  await ecrireReglage(db, "sexe", "f");
  await ecrireGardeFous(db, ["troubleAlimentaire"]);
  const sans_profil = await lireModeAffichage(db, t);
  assert.deepEqual([sans_profil.ecran, sans_profil.totauxJournalVisibles], ["sans_chiffres", false]);
  await ecrireGardeFous(db, ["grossesse"]);
  assert.equal((await lireModeAffichage(db, t)).ecran, "grossesse");
  await ecrireGardeFous(db, ["rien"]);
  assert.equal((await lireModeAffichage(db, t)).ecran, "complet");
  // un mineur : la date de naissance suffit
  await ecrireReglage(db, "naissance", "2012-03-01");
  assert.equal((await lireModeAffichage(db, t)).ecran, "mineur");
  // un poids bas, avec profil complet
  await ecrireReglage(db, "naissance", "1987-05-14");
  await ajouterMensuration(db, "taille", 180, t - JOUR);
  await ajouterPesee(db, 55, t - 3_600_000);
  const bas = await lireModeAffichage(db, t);
  assert.deepEqual([bas.ecran, bas.raisons], ["sans_chiffres", ["imcBas"]]);
});

// ---- D21 : les réponses restent sur le téléphone -------------------------------------------------------------------------------------

test("D21 : lire et écrire les réponses ; « nutri_declarations » est un réglage local", async () => {
  const { db } = await baseDeTest();
  assert.deepEqual(await lireGardeFous(db), { repondu: false, coches: [], declarations: {} });
  await ecrireReglage(db, "sexe", "h");
  await ecrireGardeFous(db, ["allaitement", "diabeteOuRein"]);
  const g = await lireGardeFous(db);
  assert.deepEqual([g.repondu, g.coches, g.declarations], [true, ["allaitement", "diabeteOuRein"], { allaitement: true, diabeteOuRein: true }]);
  await ecrireGardeFous(db, ["rien"]);
  assert.deepEqual(await lireGardeFous(db), { repondu: true, coches: ["rien"], declarations: {} });
  assert.equal(CLE_DECLARATIONS, "nutri_declarations");
});

test("D21 : ni dans la liste synchronisée, ni dans les déclencheurs ; le niveau et l'alerte de glucides, eux, voyagent", async () => {
  for (const cle of ["nutri_declarations", "nutri_cible_geste"]) {
    assert.ok(!REGLAGES_SYNC.includes(cle), cle);
    assert.ok(!PREFIXES_REGLAGES_SYNC.some((p) => cle.startsWith(p)), cle);
  }
  assert.ok(REGLAGES_SYNC.includes("nutri_niveau") && REGLAGES_SYNC.includes("nutri_alerte_glucides"));
  const { raw } = await baseDeTest();
  const declencheur = String((raw.prepare("SELECT sql FROM sqlite_master WHERE name = 'sync_i_reglages'").get() as { sql: string }).sql);
  assert.doesNotMatch(declencheur, /nutri_declarations|nutri_cible_geste/);
  assert.match(declencheur, /'nutri_niveau'/);
});
