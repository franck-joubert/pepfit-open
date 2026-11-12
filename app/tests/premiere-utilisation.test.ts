// Parcours de première utilisation (planches/parcours, NOTES.md) : âge, molettes, onglets, étapes, objectif de kcal par
// défaut (exemple de la planche).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ageDe,
  anneesNaissance,
  etapes,
  jourValide,
  lanceurDepuis,
  lireNaissance,
  macrosVisibles,
  naissanceIso,
  objectifParDefaut,
  opacitesMolette,
  partiesDepuis,
  NB_ETAPES,
  RANG,
  rythmeSigne,
  seancesParSemaine,
  semainesPour,
  SPORTS_PARCOURS,
  THEME,
  voisine,
} from "../src/ecrans/parcours-calc.ts";
import { dateEstimee } from "../src/nutrition/calculs.ts";

const AUJ = new Date(2026, 9, 28); // 28 octobre 2026, comme la planche

test("âge : recalculé au jour près, molettes bornées à 125 ans", () => {
  assert.equal(ageDe({ j: 14, m: 5, a: 1987 }, AUJ), 39);
  assert.equal(ageDe({ j: 28, m: 10, a: 2010 }, AUJ), 16, "anniversaire aujourd'hui : 16 ans");
  assert.equal(ageDe({ j: 29, m: 10, a: 2010 }, AUJ), 15, "demain : encore 15 ans");
  const a = anneesNaissance(AUJ);
  assert.equal(a.length, 126);
  assert.equal(a[0], 1901);
  assert.equal(a.at(-1), 2026);
});

test("jours inexistants ramenés au dernier jour valide", () => {
  assert.deepEqual(jourValide({ j: 31, m: 4, a: 1990 }), { j: 30, m: 4, a: 1990 });
  assert.deepEqual(jourValide({ j: 29, m: 2, a: 2023 }), { j: 28, m: 2, a: 2023 });
  assert.deepEqual(jourValide({ j: 29, m: 2, a: 2024 }), { j: 29, m: 2, a: 2024 });
});

test("date de naissance gardée en ISO, relue ; une date impossible est refusée", () => {
  assert.equal(naissanceIso({ j: 4, m: 5, a: 1987 }), "1987-05-04");
  assert.deepEqual(lireNaissance("1987-05-04"), { j: 4, m: 5, a: 1987 });
  assert.equal(lireNaissance("2023-02-29"), null);
  assert.equal(lireNaissance(null), null);
});

test("molettes : opacités de roue.ts sous le masque de la planche, rien au-delà des lignes visibles", () => {
  const o7 = opacitesMolette(7);
  assert.equal(o7[0], 1);
  assert.ok(Math.abs(o7[1]! - 0.6) < 0.02, String(o7[1]));
  assert.ok(Math.abs(o7[2]! - 0.21) < 0.02, String(o7[2]));
  assert.ok(o7[3]! < 0.06, String(o7[3]));
  assert.equal(o7[4], 0);
  const o5 = opacitesMolette(5);
  assert.equal(o5.length, 4);
  assert.equal(o5[3], 0);
});

test("onglets : selon objectifs, sports et case de poids ; rien choisi = tout allumé", () => {
  assert.deepEqual(partiesDepuis(["sport", "poids"], 0, false), { food: true, train: true, health: false });
  assert.deepEqual(partiesDepuis([], 2, false), { food: false, train: true, health: false });
  assert.deepEqual(partiesDepuis(["santeGenerale"], 0, true), { food: true, train: false, health: true });
  assert.deepEqual(partiesDepuis([], 0, false), { food: true, train: true, health: true });
  assert.deepEqual(partiesDepuis(["evenement"], 0, false), { food: false, train: true, health: false });
});

test("sports : 18, ordre de popularité ; ceux choisis passent en tête du lanceur, sans doublon ni perte", () => {
  assert.equal(SPORTS_PARCOURS.length, 18);
  assert.equal(SPORTS_PARCOURS.filter((s) => !s.picto).length, 0, "chaque sport a son picto (les 7 de D4 : picto-3d/v8)");
  assert.deepEqual(lanceurDepuis(["padel", "musculation", "cardio"], ["cat:course", "cat:padel"]), ["cat:musculation", "cat:padel", "cat:course"]);
  assert.deepEqual(lanceurDepuis([], ["cat:course"]), ["cat:course"]);
  assert.deepEqual(lanceurDepuis(["cat:aviron", "yoga"], []), ["cat:yoga", "cat:aviron"], "« Autre sport » après ceux de l'écran");
});

test("étapes : garde-fous après le sexe (D19) ; l'objectif de poids seulement si la case est cochée ; barre sur 9 ; thèmes de la planche", () => {
  assert.deepEqual(etapes(false).slice(0, 6), ["prenom", "age", "sexe", "gardeFous", "mensurations", "objectifs"]);
  assert.equal(voisine("sexe", false, 1), "gardeFous");
  assert.equal(voisine("mensurations", true, 1), "cible");
  assert.equal(voisine("mensurations", true, 1, true), "objectifs", "grossesse ou trouble : pas de poids à viser");
  assert.equal(RANG.gardeFous / NB_ETAPES, 4 / 9, "barre à 44 % (planche 7)");
  assert.equal(THEME.gardeFous, "sante");
  assert.equal(voisine("mensurations", false, 1), "objectifs");
  assert.equal(voisine("prenom", false, -1), null);
  assert.equal(voisine("niveau", false, 1), "objets");
  assert.equal(RANG.objets, NB_ETAPES);
  assert.equal(voisine("objets", false, 1), "bravo");
  assert.equal(RANG.cible, RANG.mensurations);
  assert.deepEqual([THEME.prenom, THEME.sexe, THEME.sports, THEME.niveau], ["accueil", "sante", "entrainement", "accueil"]);
});

test("objectif par défaut : exemple de la planche (homme, 39 ans, 178 cm, 84 kg, Intermédiaire, − 0,5 kg/semaine)", () => {
  const o = objectifParDefaut({ sexe: "h", age: 39, tailleCm: 178, poidsKg: 84, rythme: -0.5, niveauSport: 1, nbSports: 3 });
  // la règle des macros (docs/CODE-MACROS.md) : Mifflin × 1,4 + 3/7 × 300 = 2 596, moins le déficit de 0,5 kg/semaine (≈ 0,6 % du poids, sous le plafond de 0,75 %)
  // (la formule d'avant donnait 1 918 / 2 218 / 2 050)
  assert.equal(o.kcalRepos, 2016);
  assert.equal(o.kcalEntrainement, 2316);
  assert.equal(o.moyenne, 2150);
  assert.equal(o.approche, false);
  assert.equal(o.statut, "ok");
  // protéines : 2,2 g/kg en sèche forte, mais jamais plus de 35 % des kcal du jour (176 g sur 2 016 kcal) ; 1,8 g/kg avant
  assert.equal(o.repos.proteines, Math.round((0.35 * 2016) / 4));
  // 6 kg à 0,5 kg/semaine : 12 semaines, le 20 janvier 2027
  assert.equal(semainesPour(84, 78, 0.5), 12);
  const d = dateEstimee(84, 78, -0.5, AUJ)!;
  assert.deepEqual([d.getFullYear(), d.getMonth() + 1, d.getDate()], [2027, 1, 20]);
});

test("objectif par défaut : replis (35 ans, taille selon le sexe, IMC 22,5) et constante −78 hors homme et femme", () => {
  const rien = objectifParDefaut({ sexe: null, age: null, tailleCm: null, poidsKg: null, rythme: 0, niveauSport: null, nbSports: 0 });
  assert.equal(rien.approche, true);
  // 168 cm, 63,5 kg, 35 ans : (635 + 1050 − 175 − 78) × 1,4 = 2 005 kcal un jour de repos
  assert.ok(Math.abs(rien.kcalRepos - 2005) <= 1, String(rien.kcalRepos));
  assert.equal(rien.moyenne, 2000);
  const nb = objectifParDefaut({ sexe: "nb", age: 30, tailleCm: 170, poidsKg: 65, rythme: 0, niveauSport: 0, nbSports: 1 });
  const h = objectifParDefaut({ sexe: "h", age: 30, tailleCm: 170, poidsKg: 65, rythme: 0, niveauSport: 0, nbSports: 1 });
  assert.ok(Math.abs(h.kcalRepos - nb.kcalRepos - 83 * 1.4) <= 1);
  assert.equal(nb.approche, false);
  // plancher d'énergie (1 200 chez la femme, 30 kcal par kg de maigre) : jamais en dessous
  const mince = objectifParDefaut({ sexe: "f", age: 30, tailleCm: 160, poidsKg: 52, rythme: -0.75, niveauSport: null, nbSports: 0 });
  assert.ok(mince.kcalRepos >= 1200 && mince.statut === "ok", String(mince.kcalRepos));
  // garde-fous (D12) : IMC bas et plus de 65 ans → limite, sans chiffres (valeurs par défaut) ; moins de 18 ans → non calculé
  const bas = objectifParDefaut({ sexe: "f", age: 80, tailleCm: 150, poidsKg: 40, rythme: -0.75, niveauSport: null, nbSports: 0 });
  assert.deepEqual([bas.statut, bas.raisons.includes("imcBas"), bas.raisons.includes("age65")], ["limite", true, true]);
  const jeune = objectifParDefaut({ sexe: "h", age: 16, tailleCm: 175, poidsKg: 60, rythme: 0, niveauSport: 1, nbSports: 1 });
  assert.deepEqual([jeune.statut, jeune.raisons], ["non_calcule", ["mineur"]]);
});

test("séances par semaine selon le niveau ; rythme signé selon l'écart", () => {
  assert.deepEqual([0, 1, 2, 3].map((n) => seancesParSemaine(n as 0, 0)), [2, 3, 4, 6]);
  assert.equal(seancesParSemaine(null, 0), 0);
  assert.equal(seancesParSemaine(null, 2), 2);
  assert.equal(rythmeSigne(0.5, 84, 78), -0.5);
  assert.equal(rythmeSigne(0.5, 60, 65), 0.5);
  assert.equal(rythmeSigne(0.5, 70, 70), 0);
});

test("niveau en nutrition : il règle les macros montrées (D5)", () => {
  assert.deepEqual(macrosVisibles(0), ["kcal"]);
  assert.deepEqual(macrosVisibles(1), ["kcal", "proteines"]);
  assert.equal(macrosVisibles(3).length, 5);
  assert.equal(macrosVisibles(null).length, 5);
});

test("enregistrement : réponses relues à l'identique, objectifs de Nutrition, lanceur, onglets ; premier lancement", async () => {
  const { parcoursAFaire, enregistrerReponses, lireReponses, marquerParcoursFait, etatParcours, REPONSES_VIDES } = await import("../src/ecrans/parcours-donnees.ts");
  const { lireObjectif } = await import("../src/db/depots/objectifs.ts");
  const { baseDeTest } = await import("./aide.ts");
  const { db } = await baseDeTest(true);
  etatParcours.aFaire = null;
  assert.equal(await parcoursAFaire(db), true, "base neuve : le parcours s'ouvre");
  const r = {
    ...REPONSES_VIDES,
    prenom: "Alex",
    naissance: { j: 14, m: 5, a: 1987 },
    sexe: "h" as const,
    poidsKg: 84,
    tailleCm: 178,
    changerPoids: true,
    cibleKg: 78,
    rythme: -0.5,
    objectifs: ["sport" as const],
    sports: ["padel", "musculation", "cat:escalade"],
    niveauSport: 1 as const,
    niveauNutrition: 0 as const,
    gardeFous: ["rien" as const],
  };
  const { objectif, parties } = await enregistrerReponses(db, r, new Date(2026, 9, 28).getTime());
  assert.equal(objectif.moyenne, 2150);
  assert.deepEqual(parties, { food: true, train: true, health: false });
  const lu = await lireReponses(db);
  assert.deepEqual({ ...lu, poidsKg: lu.poidsKg }, r);
  assert.equal((await lireObjectif(db, "repos")).proteines, objectif.repos.proteines);
  const lanceur = (await db.getAllAsync<{ exercice_id: string }>("SELECT exercice_id FROM lanceur_sport ORDER BY ordre", [])).map((x) => x.exercice_id);
  assert.deepEqual(lanceur, ["cat:musculation", "cat:padel", "cat:escalade"]);
  await marquerParcoursFait(db);
  etatParcours.aFaire = null;
  assert.equal(await parcoursAFaire(db), false);
});

test("D19 : garde-fous du parcours ; grossesse : pas de poids visé enregistré, pas de chiffres ; relus à l'identique", async () => {
  const { enregistrerReponses, lireReponses, cibleSauteeReponses, REPONSES_VIDES } = await import("../src/ecrans/parcours-donnees.ts");
  const { lireReglage } = await import("../src/db/depots/reglages.ts");
  const { lireModeAffichage } = await import("../src/db/depots/objectifs.ts");
  const { baseDeTest } = await import("./aide.ts");
  const { db } = await baseDeTest(true);
  const r = { ...REPONSES_VIDES, naissance: { j: 2, m: 3, a: 1994 }, sexe: "np" as const, poidsKg: 64, tailleCm: 166, changerPoids: true, cibleKg: 60, rythme: -0.25, gardeFous: ["grossesse" as const] };
  assert.equal(cibleSauteeReponses(r), true);
  assert.equal(cibleSauteeReponses({ ...r, sexe: "h" }), false, "« Je suis enceinte » écarté pour un homme");
  const { objectif } = await enregistrerReponses(db, r, new Date(2026, 9, 28).getTime());
  assert.equal(objectif.statut, "non_calcule");
  assert.equal(await lireReglage(db, "nutri_poids_cible"), null);
  assert.deepEqual((await lireReponses(db)).gardeFous, ["grossesse"]);
  assert.equal((await lireModeAffichage(db)).ecran, "grossesse", "« Non précisé » compte comme x pour la règle");
});

test("premier lancement : une installation d'avant le parcours (prénom déjà là) n'y est pas renvoyée", async () => {
  const { parcoursAFaire, etatParcours } = await import("../src/ecrans/parcours-donnees.ts");
  const { ecrireReglage } = await import("../src/db/depots/reglages.ts");
  const { baseDeTest } = await import("./aide.ts");
  const { db } = await baseDeTest();
  await ecrireReglage(db, "prenom", "Camille");
  etatParcours.aFaire = null;
  assert.equal(await parcoursAFaire(db), false);
});

test("mensurations : molettes non touchées = ni pesée ni taille en base, objectifs approchés (audit 28/10, n° 2)", async () => {
  const { enregistrerReponses, mesuresDesMolettes, REPONSES_VIDES } = await import("../src/ecrans/parcours-donnees.ts");
  const { POIDS_DEPART, TAILLE_DEPART } = await import("../src/ecrans/parcours-calc.ts");
  const { baseDeTest } = await import("./aide.ts");
  const { db } = await baseDeTest(true);
  const molettes = { poids: POIDS_DEPART, poidsTouche: false, taille: TAILLE_DEPART, tailleTouchee: false };
  const m = mesuresDesMolettes(molettes, REPONSES_VIDES);
  assert.deepEqual(m, { poidsKg: null, tailleCm: null });
  const { objectif } = await enregistrerReponses(db, { ...REPONSES_VIDES, sexe: "h", ...m }, new Date(2026, 9, 28).getTime());
  assert.equal((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM pesee", []))?.n, 0);
  assert.equal((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM mensurations", []))?.n, 0);
  assert.equal(objectif.approche, true);
  // Une seule molette touchée : elle seule compte ; parcours rejoué sans geste : la mesure connue reste.
  assert.deepEqual(mesuresDesMolettes({ ...molettes, poids: 82, poidsTouche: true }, REPONSES_VIDES), { poidsKg: 82, tailleCm: null });
  assert.deepEqual(mesuresDesMolettes(molettes, { poidsKg: 78, tailleCm: 180 }), { poidsKg: 78, tailleCm: 180 });
});
