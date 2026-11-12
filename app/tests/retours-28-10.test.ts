// Retours d'Alex du 28/10 : logo de l'accueil, page Entraînements (bouton du bas, feuille des sports), glissé de page,
// onglets actifs, jour d'entraînement, séance en cours.
import assert from "node:assert/strict";
import { test } from "node:test";
import { formeLogo, LARGEUR_MIN_LOGO } from "../src/ui/logo.ts";

test("logo : entier dès 80 px (proportions du kit), symbole « p. » en dessous", () => {
  assert.equal(LARGEUR_MIN_LOGO, 80);
  assert.deepEqual(formeLogo(88), { forme: "logo", largeur: 88, hauteur: 29 });
  assert.equal(formeLogo(80).forme, "logo");
  assert.equal(formeLogo(79).forme, "symbole");
  assert.equal(formeLogo(32).hauteur, 32);
});

import { garderDemarrage, type ChoixEnCours, type EnCours, type OutilsGarde } from "../src/ecrans/garde-demarrage.ts";

function outils(enCours: EnCours | null, choix: ChoixEnCours) {
  const journal: string[] = [];
  const o: OutilsGarde = {
    enCours: async () => enCours,
    demander: async () => (journal.push("demander"), choix),
    reprendre: () => void journal.push("reprendre"),
    terminer: async () => void journal.push("terminer"),
    abandonner: async () => void journal.push("abandonner"),
  };
  const lancer = async () => void journal.push("lancer");
  return { o, lancer, journal };
}
const seance: EnCours = { genre: "seance", id: "s1", titre: "Push A" };

test("garde : rien en cours, la séance démarre sans feuille", async () => {
  const { o, lancer, journal } = outils(null, "annuler");
  assert.equal(await garderDemarrage(o, lancer), "lancee");
  assert.deepEqual(journal, ["lancer"]);
});

test("garde : séance en cours, chaque choix de la feuille", async () => {
  const cas: [ChoixEnCours, string, string[]][] = [
    ["reprendre", "reprise", ["demander", "reprendre"]],
    ["terminer", "lancee", ["demander", "terminer", "lancer"]],
    ["abandonner", "lancee", ["demander", "abandonner", "lancer"]],
    ["annuler", "annulee", ["demander"]],
  ];
  for (const [choix, issue, attendu] of cas) {
    const { o, lancer, journal } = outils(seance, choix);
    assert.equal(await garderDemarrage(o, lancer), issue);
    assert.deepEqual(journal, attendu);
  }
});

test("garde : un suivi GPS en cours est gardé de même", async () => {
  const { o, lancer, journal } = outils({ genre: "suivi", titre: "Course à pied" }, "terminer");
  assert.equal(await garderDemarrage(o, lancer), "lancee");
  assert.deepEqual(journal, ["demander", "terminer", "lancer"]);
});

test("garde : un double toucher pendant la feuille est ignoré", async () => {
  let repondre: (c: ChoixEnCours) => void = () => {};
  const journal: string[] = [];
  const o: OutilsGarde = {
    enCours: async () => seance,
    demander: () => new Promise((r) => (repondre = r)),
    reprendre: () => {},
    terminer: async () => {},
    abandonner: async () => {},
  };
  const premier = garderDemarrage(o, async () => void journal.push("1"));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(await garderDemarrage(o, async () => void journal.push("2")), "annulee");
  repondre("abandonner");
  assert.equal(await premier, "lancee");
  assert.deepEqual(journal, ["1"]);
});

import { disposerTuiles, MAX_FEUILLE, sportsDeLaFeuille } from "../src/ecrans/lanceur-sports.ts";

test("feuille « Démarrer une séance » : 9 sports au plus (3 rangées de 3), dans l'ordre, même grille adaptative (1 à 9)", () => {
  assert.equal(MAX_FEUILLE, 9);
  assert.deepEqual(sportsDeLaFeuille(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"]), ["a", "b", "c", "d", "e", "f", "g", "h", "i"]);
  assert.deepEqual(sportsDeLaFeuille(["a", "b"]), ["a", "b"]);
  assert.equal(disposerTuiles(sportsDeLaFeuille(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]).length, 400, 8).length, 9);
});

import { confirmerRepos } from "../src/nutrition/jour-entrainement.ts";

test("jour d'entraînement → repos : confirmation seulement avec une séance enregistrée, et une seule fois", () => {
  assert.equal(confirmerRepos({ entrainement: true, seancesFaites: 1, dejaConfirme: false }), true);
  assert.equal(confirmerRepos({ entrainement: true, seancesFaites: 1, dejaConfirme: true }), false);
  assert.equal(confirmerRepos({ entrainement: true, seancesFaites: 0, dejaConfirme: false }), false);
  // repos → entraînement : jamais de confirmation
  assert.equal(confirmerRepos({ entrainement: false, seancesFaites: 3, dejaConfirme: false }), false);
});

import { ongletVoisin, prendGlisse, sensGlisse } from "../src/ui/glisser-jour.ts";

test("glissé de page : horizontal seulement, au-delà de 14 px", () => {
  assert.ok(prendGlisse(30, 5));
  assert.ok(prendGlisse(-30, 10));
  assert.ok(!prendGlisse(10, 0));
  assert.ok(!prendGlisse(30, 25));
});

test("glissé de page : au lâcher, jour suivant vers la gauche, précédent vers la droite, sinon retour", () => {
  assert.equal(sensGlisse(-120, 0, 400), 1);
  assert.equal(sensGlisse(120, 0, 400), -1);
  assert.equal(sensGlisse(-60, 0, 400), 0);
  // geste vif : la vitesse suffit, dans le sens du doigt
  assert.equal(sensGlisse(-40, -0.9, 400), 1);
  assert.equal(sensGlisse(-40, 0.9, 400), 0);
  assert.equal(sensGlisse(-20, -2, 400), 0);
});

test("menu du bas : onglet voisin dans le sens du glissé, bornes comprises", () => {
  const o = ["/", "/train", "/food", "/health"];
  assert.equal(ongletVoisin(o, "/food", -1), "/train");
  assert.equal(ongletVoisin(o, "/food", 1), "/health");
  assert.equal(ongletVoisin(o, "/health", 1), "/health");
  assert.equal(ongletVoisin(o, "/", -1), "/");
  assert.equal(ongletVoisin(["/", "/food"], "/food", -1), "/");
});

import { abonnerQuitte, signalerChemin } from "../src/ui/onglet-quitte.ts";

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("onglet quitté : prévenu en passant à un autre onglet (après la transition), pas pour un écran poussé", async () => {
  const vus: string[] = [];
  const fin = abonnerQuitte("/food", () => vus.push("food"));
  signalerChemin("/food", true);
  signalerChemin("/nutrition/mois", false);
  signalerChemin("/food", true);
  await attendre(400);
  assert.deepEqual(vus, [], "page du mois : pas un départ");
  signalerChemin("/", true);
  assert.deepEqual(vus, [], "pas pendant la transition");
  await attendre(400);
  assert.deepEqual(vus, ["food"]);
  // retour avant la fin de l'attente : prévenu tout de suite, une seule fois
  signalerChemin("/food", true);
  signalerChemin("/train", true);
  signalerChemin("/food", true);
  assert.deepEqual(vus, ["food", "food"]);
  await attendre(400);
  assert.deepEqual(vus, ["food", "food"]);
  fin();
});

import { ongletsVisibles, TOUTES_PARTIES } from "../src/ui/menu-flottant.ts";
import { DatabaseSync } from "node:sqlite";
import { adapter } from "./aide.ts";
import { lancementDirect } from "../src/ecrans/lanceur-sports.ts";
import { capteursDepart, departSansGps } from "../src/ecrans/suivi-direct-vue.ts";
import { migrer } from "../src/db/migrations.ts";
import { ecrireReglages, lireReglages } from "../src/ecrans/donnees.ts";

test("écran toujours allumé en séance : non par défaut, choix déjà fait gardé (retours du 28/10, b)", async () => {
  const db = adapter(new DatabaseSync(":memory:"));
  await migrer(db);
  assert.equal((await lireReglages(db)).ecranAllume, false);
  await ecrireReglages(db, { ecranAllume: true });
  assert.equal((await lireReglages(db)).ecranAllume, true);
  await ecrireReglages(db, { ecranAllume: false });
  assert.equal((await lireReglages(db)).ecranAllume, false);
});

test("menu du bas : les onglets allumés dans l'ordre, aucun obligatoire, jamais une barre vide (Social v4, A)", () => {
  assert.deepEqual(ongletsVisibles(TOUTES_PARTIES).map((o) => o.chemin), ["/health", "/train", "/food"]);
  assert.deepEqual(ongletsVisibles({ train: false, food: true, health: false }).map((o) => o.chemin), ["/food"]);
  assert.deepEqual(ongletsVisibles({ train: false, food: true, health: true }).map((o) => o.chemin), ["/health", "/food"]);
  // réglage abîmé (tout éteint) : le premier onglet reste, la barre n'est jamais vide
  assert.deepEqual(ongletsVisibles({ train: false, food: false, health: false }).map((o) => o.chemin), ["/health"]);
});

test("parties du menu : toutes allumées par défaut, réglage gardé en base", async () => {
  const db = adapter(new DatabaseSync(":memory:"));
  await migrer(db);
  assert.deepEqual((await lireReglages(db)).parties, TOUTES_PARTIES);
  await ecrireReglages(db, { parties: { train: true, food: false, health: false } });
  assert.deepEqual((await lireReglages(db)).parties, { train: true, food: false, health: false });
});

test("« Démarrer une séance » → un sport, sans feuille : séance vide, départ du suivi ou chrono (retours du 28/10, b)", () => {
  assert.equal(lancementDirect("cat:musculation", "muscu"), "muscu");
  assert.equal(lancementDirect("cat:cross-training", "cross"), "muscu", "Cross training : WOD libre, comme la musculation");
  // Familles (30/10) : les autres sports ouvrent tous le départ du suivi, le HIIT compris (un sport et cours, D1).
  for (const id of ["cat:course", "cat:bicycling", "cat:randonnee", "cat:padel", "cat:hiit"]) assert.equal(lancementDirect(id, null), "suivi", id);
});

test("départ du suivi : Extérieur / Intérieur pour la course ; en intérieur, ni GPS ni capteur (retours du 28/10, b)", () => {
  assert.deepEqual(capteursDepart("cat:course", false), { segment: true, gps: true, fc: true });
  // tapis : sans GPS, la FC de la Whoop reste (retour du 29/10) ; le vélo a Dehors / Intérieur
  assert.deepEqual(capteursDepart("cat:course", true), { segment: true, gps: false, fc: true });
  assert.deepEqual(capteursDepart("cat:bicycling", false), { segment: true, gps: true, fc: true });
  assert.deepEqual(capteursDepart("cat:bicycling", true), { segment: true, gps: false, fc: true });
  // D2 du 29/10 : sans GPS, le suivi en direct sans carte, avec ou sans FC (service « health ») ; tests/tapis.test.ts
  assert.equal(departSansGps(true), "fc");
  // Alex, 07/11 : le segmenté n'existe que si les deux choix existent ; pour la rando, pas de segmenté et le GPS reste
  assert.deepEqual(capteursDepart("cat:randonnee", true), { segment: false, gps: true, fc: true }, "pas d'intérieur pour la rando : le GPS reste");
});
