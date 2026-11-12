// Page Âge pepfit en attente de données (planche age-attente, validée le 31/10) : les trois cas de la planche, un test par
// cas (sans date de naissance, trop peu de données, presque prêt), aujourd'hui samedi 31 octobre 2026.
import assert from "node:assert/strict";
import { test } from "node:test";
import { calculer, type DonneesPrecision } from "../src/precision/modele.ts";
import { attente, dateCourte, texteApres, textePrecision, texteQuand, type EntreeAttente } from "../src/ecrans/mesures/age-attente.ts";

const JOUR = 86_400_000;
const MAINTENANT = new Date(2026, 9, 31, 12, 42).getTime();
const LUNDI_2 = new Date(2026, 10, 2).getTime();
const LUNDI_9 = new Date(2026, 10, 9).getTime();

const base: DonneesPrecision = {
  naissance: "date", sexe: true, taille: true, poidsJours: 2, semainesPesees: 3, tourJours: null, navyJours: null, grasSource: null, grasJours: null,
  capteur: "sc", nuits14: 0, nuitsAvant: 0, pas14: 0, pasAvant: 0, pasAutorises: true, fcSeances28: 0, fcMax: "age", vma: null,
  semainesActives: 0, seances8: 2, muscu8: 2, choixReco: 0, nut30: 15, nut60: 10, nut28: 14, objectifPoids: false, semainesHistorique: 1,
};
const entree = (d: DonneesPrecision, recul: Partial<EntreeAttente["recul"]> = {}): EntreeAttente => ({
  d, recul: { debutWhoop: null, debutMuscu: null, seancesMuscu: 0, ...recul }, vmaDate: null, maintenant: MAINTENANT,
});
const ligne = (a: ReturnType<typeof attente>, id: string) => a.facteurs.find((f) => f.id === id)!;

test("cas a, sans date de naissance : 3 facteurs prêts, bouton, premier Âge lundi 2 novembre si tu la saisis", () => {
  // une montre sur Santé Connect depuis 10 jours, deux séances de muscu (la première il y a 9 jours)
  const d: DonneesPrecision = { ...base, naissance: null, nuits14: 10, pas14: 10, semainesActives: 4, fcSeances28: 2 };
  const a = attente(entree(d, { debutMuscu: MAINTENANT - 9 * JOUR, seancesMuscu: 2 }));
  assert.equal(a.cas, "naissance");
  assert.equal(a.precision, 0);
  assert.equal(a.prets, 3);
  assert.deepEqual(a.facteurs.map((f) => f.etat), ["option", "pret", "pret", "option", "option", "encours", "afaire", "pret", "afaire"]);
  assert.equal(ligne(a, "duree").sous, "Prête, 10 nuits, Santé Connect");
  assert.equal(ligne(a, "pasJour").sous, "Prêts, 10 jours, Santé Connect");
  assert.equal(ligne(a, "regularite").sous, "Avec une montre qui mesure ton sommeil");
  assert.equal(ligne(a, "regularite").action, "capteur");
  assert.equal(ligne(a, "zones13").action, null);
  assert.equal(ligne(a, "muscu").sous, "2 séances, compte dès le 5 novembre");
  assert.deepEqual(ligne(a, "muscu").traits, { n: 9, sur: 14 });
  assert.equal(ligne(a, "vo2").sous, "Un test VMA de 6 minutes suffit");
  assert.equal(ligne(a, "vo2").action, "vma");
  assert.equal(ligne(a, "maigre").action, "gras");
  assert.equal(a.date?.lundi, LUNDI_2);
  assert.equal(texteApres(a.date), "Saisis-la aujourd'hui : ton premier Âge pepfit lundi 2 novembre.");
  assert.equal(textePrecision(a, true), "0 sur 60, ta date de naissance d'abord");
  assert.equal(a.flou, 15);
});

test("cas b, trop peu de données : le temps seul ne suffit pas ; lundi 9 novembre avec un test VMA ou une pesée", () => {
  // une montre sur Santé Connect depuis 4 jours, une séance de muscu
  const d: DonneesPrecision = { ...base, nuits14: 4, pas14: 4, semainesActives: 1, muscu8: 1, seances8: 1 };
  const a = attente(entree(d, { debutMuscu: MAINTENANT - 4 * JOUR, seancesMuscu: 1 }));
  assert.equal(a.cas, "peu");
  assert.equal(a.prets, 0);
  assert.ok(a.precision < 60);
  assert.equal(ligne(a, "duree").sous, "4 nuits sur 7, garde ta montre la nuit");
  assert.deepEqual(ligne(a, "duree").traits, { n: 4, sur: 7 });
  assert.equal(ligne(a, "pasJour").sous, "4 jours sur 7, ils se comptent tout seuls");
  assert.equal(ligne(a, "fcRepos").sous, "4 nuits sur 7, avec ta montre, la nuit");
  assert.deepEqual(a.date, { lundi: LUNDI_9, jours: 7, actions: ["vma", "gras"] });
  assert.equal(dateCourte(a.date!.lundi), "9 nov.");
  assert.equal(texteQuand(a.date!, true), "lundi, avec un test VMA ou une pesée");
  assert.equal(ligne(a, "vo2").sous, "Un test VMA de 6 minutes suffit, il suffit pour le 9 novembre");
  assert.equal(ligne(a, "maigre").sous, "Une pesée sur balance connectée, ou ton % de gras, suffit aussi");
  assert.equal(textePrecision(a, true), `${calculer(d).p.age} sur 60 pour ouvrir l'Âge`);
  assert.equal(a.flou, 8);
  // jamais de « ~ » ni de « vers » : la date est exacte si la condition tient
  for (const f of a.facteurs) assert.doesNotMatch(f.sous, /~|≈|vers /);
});

test("cas c, presque prêt : Whoop depuis 13 jours, lundi 2 novembre après une nuit de plus", () => {
  const d: DonneesPrecision = { ...base, capteur: "whoop", nuits14: 11, pas14: 13, semainesActives: 2, muscu8: null, seances8: 0 };
  const a = attente(entree(d, { debutWhoop: MAINTENANT - 13 * JOUR }));
  assert.equal(a.cas, "presque");
  assert.ok(a.precision >= 50 && a.precision < 60, String(a.precision));
  assert.equal(a.prets, 4);
  assert.equal(ligne(a, "regularite").sous, "Prête, 11 nuits, Whoop");
  assert.equal(ligne(a, "zones13").sous, "13 jours sur 14, prêtes demain");
  assert.deepEqual(ligne(a, "zones45").traits, { n: 13, sur: 14 });
  assert.equal(ligne(a, "muscu").etat, "option");
  assert.equal(ligne(a, "muscu").action, "muscu");
  assert.equal(ligne(a, "vo2").sous, "Whoop ne la donne pas : un test VMA de 6 minutes");
  assert.deepEqual(a.date, { lundi: LUNDI_2, jours: 1, actions: [] });
  assert.equal(texteQuand(a.date!, true), "lundi, après une nuit de plus");
  assert.equal(textePrecision(a, true), `${a.precision} sur 60, une nuit de plus`);
  assert.equal(a.flou, 3.5);
});

test("sans montre ni action qui suffise dans les 4 semaines : pas de date, juste les actions", () => {
  const d: DonneesPrecision = { ...base, capteur: null, pasAutorises: false, vma: "test", vmaJours: 3, grasSource: "balance", grasJours: 2 };
  const a = attente(entree(d));
  assert.equal(a.date, null);
  assert.equal(ligne(a, "duree").sous, "Relier une montre");
  assert.equal(ligne(a, "pasJour").action, "pas");
  assert.equal(ligne(a, "vo2").etat, "pret");
  assert.equal(ligne(a, "maigre").sous, "Prête, balance, il y a 2 jours");
});
