// Précision pepfit (docs/PRECISION.md § 2.5) : chaque règle juste, vérifiée sur les comptes inventés de la planche
// (planches/precision/outils/comptes.js ; aucune donnée réelle). Les chiffres attendus sont ceux de la planche validée.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  avecSigmaReel, calculer, capRetenu, conseilDepense, depuisSigma, etapeRapide, etapes, etapesCalcul, lecture, niveau, niveauSuivant, qualites, sigmaModele,
  type DonneesPrecision,
} from "../src/precision/modele.ts";
import { grasNavy, jourRepasTenu, joursEntre, minuit, peseesRetenues, semainesAvec } from "../src/precision/comptage.ts";
import { lireMemoire, passageAMontrer } from "../src/precision/memoire.ts";

const vide: DonneesPrecision = {
  naissance: null, sexe: false, taille: false, poidsJours: null, semainesPesees: 0, tourJours: null, navyJours: null, grasSource: null, grasJours: null,
  capteur: null, nuits14: 0, pas14: 0, fcSeances28: 0, fcMax: "defaut", vma: null,
  semainesActives: 0, seances8: 0, muscu8: null, choixReco: 0, nut30: 0, nut60: 0, nut28: 0, objectifPoids: false, semainesHistorique: 0,
};
// Noa : vient de finir la première utilisation (année de naissance, sexe, taille, poids) ; ne court pas.
const neuf: DonneesPrecision = { ...vide, naissance: "annee", sexe: true, taille: true, poidsJours: 0, semainesPesees: 1, fcMax: "age" };
// Alex : 3 mois, Santé Connect (pas, quelques nuits), course sans FC, muscu régulière, repas par périodes, pas de tour de taille.
const alex: DonneesPrecision = {
  ...vide, naissance: "date", sexe: true, taille: true, poidsJours: 5, semainesPesees: 3,
  capteur: "sc", nuits14: 6, nuitsAvant: 5, pas14: 13, pasAutorises: true, fcSeances28: 1, fcMax: "age", vma: "gps", court: true,
  semainesActives: 3, seances8: 11, muscu8: 6, choixReco: 2, nut30: 12, nut60: 8, nut28: 11, objectifPoids: true, semainesHistorique: 12,
};
// Sam : Whoop et balance, tout noté depuis des mois.
const sam: DonneesPrecision = {
  ...vide, naissance: "date", sexe: true, taille: true, poidsJours: 1, semainesPesees: 4, tourJours: 40, navyJours: 40, grasSource: "balance", grasJours: 1,
  capteur: "whoop", nuits14: 14, pas14: 14, pasAutorises: true, fcSeances28: 9, fcMax: "mesuree", vma: "test", court: true,
  semainesActives: 4, seances8: 22, muscu8: 10, choixReco: 9, nut30: 26, nut60: 21, nut28: 24, objectifPoids: true, semainesHistorique: 40,
};
// Léo : sportif avec Whoop, ne note pas ses repas.
const leo: DonneesPrecision = {
  ...vide, naissance: "date", sexe: true, taille: true, poidsJours: 3, semainesPesees: 3, tourJours: 60, navyJours: 60,
  capteur: "whoop", nuits14: 13, pas14: 14, pasAutorises: true, fcSeances28: 12, fcMax: "mesuree", vma: "test", court: true,
  semainesActives: 4, seances8: 26, muscu8: 8, choixReco: 7, semainesHistorique: 30,
};
const leoSansNutrition: DonneesPrecision = { ...leo, parties: { nutrition: false, sport: true, sante: true } };
const alexPause: DonneesPrecision = { ...alex, poidsJours: 12, semainesPesees: 2, semainesActives: 2, seances8: 9, nut30: 9, nut60: 9, nut28: 8, fcSeances28: 0 };
const alexApres: DonneesPrecision = { ...alex, tourJours: 0, navyJours: 0 };
const samPanne: DonneesPrecision = { ...sam, nuits14: 0, nuitsAvant: 14, pas14: 0, pasAvant: 14, fcSeances28: 4 };
const sansCapteur: DonneesPrecision = { ...sam, capteur: null, nuits14: 0, pas14: 0, fcSeances28: 0, fcMax: "saisie", vma: "gps", choixReco: 0, grasSource: "saisie" };

const score = (d: DonneesPrecision) => calculer(d).score;

test("comptes inventés : le score et le cap de la planche (§ 2.4)", () => {
  const attendu: [string, DonneesPrecision, number, string][] = [
    ["vide", vide, 5, "esquisse"],
    ["Noa", neuf, 24, "contour"],
    ["Alex", alex, 60, "portrait"],
    ["Alex, une semaine sans rien", alexPause, 56, "portrait"],
    ["Alex après son tour de taille", alexApres, 65, "relief"],
    ["Léo", leo, 80, "relief"],
    ["Léo, Nutrition éteinte", leoSansNutrition, 90, "surMesure"],
    ["Tout à la main, sans montre", sansCapteur, 64, "portrait"],
    ["Sam, deux semaines sans montre", samPanne, 88, "surMesure"],
    ["Sam", sam, 97, "surMesure"],
  ];
  for (const [nom, d, s, cap] of attendu) {
    const r = calculer(d);
    assert.equal(r.score, s, nom);
    assert.equal(r.cap.id, cap, nom);
  }
});

test("étapes proposées en premier (§ 2.4) : profil, montre, tour de taille, repas", () => {
  assert.deepEqual(etapes(vide, 1).map((e) => [e.id, e.affiche]), [["profil", 18]]);
  assert.deepEqual(etapeRapide(neuf)?.id, "pas");
  assert.equal(etapeRapide(neuf)?.affiche, 5);
  assert.equal(etapes(neuf, 6).find((e) => e.id === "capteur")?.affiche, 22);
  assert.deepEqual([etapeRapide(alex)?.id, etapeRapide(alex)?.affiche], ["tour", 5]);
  // la page d'Alex : immédiates d'abord, puis celles qui prennent des semaines
  assert.deepEqual(etapes(alex).map((e) => [e.id, e.affiche]), [["tour", 5], ["vma", 4], ["repas", 10]]);
  assert.deepEqual(etapeRapide(alexApres)?.id, "vma");
  assert.deepEqual([etapeRapide(leo)?.id, etapes(leo, 6)[0]?.id, etapes(leo, 6).find((e) => e.id === "repas")?.affiche], ["gras", "gras", 14]);
  assert.equal(etapes(leoSansNutrition, 6).some((e) => e.id === "repas"), false);
  assert.deepEqual([etapes(sansCapteur, 6).find((e) => e.id === "capteur")?.affiche], [24]);
  assert.deepEqual(etapes(samPanne).map((e) => [e.id, e.affiche]), [["nuits", 9]]);
  assert.deepEqual(etapes(sam), []);
});

test("règle 1 : décroissance douce, des jours sur une fenêtre, jamais une série", () => {
  assert.equal(score(alex) - score(alexPause), 4);
  assert.equal(calculer(alexPause).cap.id, "portrait");
  const samSemaine = { ...sam, poidsJours: 8, semainesPesees: 3, semainesActives: 3, seances8: 20, nut30: 19, nut60: 21, nut28: 17, fcSeances28: 7 };
  assert.equal(score(sam) - score(samSemaine), 3);
  const samMoisSansRepas = { ...sam, nut30: 0, nut60: 26, nut28: 0 };
  assert.ok(score(samMoisSansRepas) >= 85 && score(samMoisSansRepas) < score(sam));
  assert.equal(score(samPanne), 88);
  // une semaine sans pesée coûte un quart des pesées, pas tout
  assert.equal(qualites({ ...sam, semainesPesees: 3 }).pesees, 0.75);
  // la montre : 14 derniers jours pleins, les 14 d'avant à moitié
  assert.equal(qualites({ ...vide, nuits14: 0, nuitsAvant: 14 }).nuits, 7 / 12);
});

test("règle 2 : un cap se garde à 5 points sous son seuil ; une lecture ouverte à 10 points", () => {
  assert.equal(capRetenu(80, 5).id, "surMesure");
  assert.equal(capRetenu(79, 5).id, "relief");
  assert.equal(capRetenu(60, 4).id, "relief");
  assert.equal(capRetenu(59, 4).id, "portrait");
  assert.equal(capRetenu(61, null).id, "portrait");
  assert.equal(calculer(alexPause, { cap: 3 }).cap.id, "portrait");
  // Âge d'Alex après son tour de taille : 61 (≥ 60) ; une baisse à 52 la garde ouverte, à 49 elle repasse en attente
  assert.equal(lecture(calculer(alexApres), "age").ouverte, true);
  const ageA = (d: DonneesPrecision) => calculer(d).p.age!;
  const bas = { ...alexApres, nuits14: 3, nuitsAvant: 3 };
  assert.ok(ageA(bas) < 60 && ageA(bas) >= 50, `âge ${ageA(bas)}`);
  assert.equal(lecture(calculer(bas, { cap: 4 }), "age").ouverte, false);
  assert.equal(lecture(calculer(bas, { cap: 4, lectures: ["age"] }), "age").ouverte, true);
  const tresBas = { ...alexApres, nuits14: 0, nuitsAvant: 0, pas14: 3, pasAvant: 3 };
  assert.ok(ageA(tresBas) < 50);
  assert.equal(lecture(calculer(tresBas, { cap: 4, lectures: ["age"] }), "age").ouverte, false);
});

test("lectures : le cap et le calcul (P1) ; Âge ≥ 60, VO2max ≥ 50", () => {
  const a = calculer(alex);
  assert.equal(a.p.age, 57);
  assert.deepEqual([lecture(a, "age").capAtteint, lecture(a, "age").donneesOk, lecture(a, "age").ouverte], [true, false, false]);
  assert.equal(lecture(a, "vo2").ouverte, true);
  const n = calculer(neuf);
  assert.equal(lecture(n, "vo2").capAtteint, false);
  assert.equal(lecture(n, "objectifsPerso").ouverte, true);
  assert.equal(lecture(calculer(vide), "objectifsPerso").ouverte, false);
  const r = calculer(alexApres);
  assert.deepEqual(r.lectures.filter((l) => l.ouverte).map((l) => l.id), ["objectifsPerso", "zonesReserve", "age", "vo2", "masses", "arrivee"]);
  const l = calculer(leo);
  assert.equal(lecture(l, "age").ouverte, true);
  assert.equal(lecture(l, "vo2").ouverte, true);
  assert.equal(lecture(l, "rythme").ouverte, true);
  assert.equal(lecture(calculer(sam), "liens").ouverte, true);
});

test("règle 3 : une donnée fausse ne triche pas (présence, pas valeur ; bornes ; une pesée par jour ; l'isolée ne compte pas)", () => {
  const j = (n: number, h = 8) => new Date(2026, 9, n, h).getTime();
  const l = peseesRetenues([
    { date: j(1), kg: 80 }, { date: j(1, 9), kg: 80.2 }, { date: j(1, 10), kg: 80.1 }, // trois le même jour : une seule
    { date: j(2), kg: 80.4 }, { date: j(3), kg: 92 }, // isolée à +14 % : ne compte pas
    { date: j(4), kg: 80.3 }, { date: j(5), kg: 1000 }, // implausible
  ]);
  assert.deepEqual(l.map((p) => new Date(p.date).getDate()), [1, 2, 4]);
  assert.equal(l[0]!.kg, 80.1);
  // deux pesées seules : rien à comparer, elles comptent
  assert.equal(peseesRetenues([{ date: j(1), kg: 80 }, { date: j(2), kg: 90 }]).length, 2);
  // repas : au moins 2 repas et la moitié du métabolisme de base
  assert.equal(jourRepasTenu(1, 2500, 1700), false);
  assert.equal(jourRepasTenu(3, 800, 1700), false);
  assert.equal(jourRepasTenu(2, 850, 1700), true);
  // le score ne lit aucune valeur : deux comptes aux mêmes données ont le même score, quelles que soient leurs valeurs
  assert.equal(score({ ...alex }), score(alex));
});

test("règle 4 : ce qui vient d'une montre ne se tape pas ; tout à la main plafonne vers 64 %", () => {
  assert.ok(score(sansCapteur) <= 65);
  assert.ok(qualites({ ...sam, fcMax: "saisie" }).fcMax < qualites(sam).fcMax);
  const gainMontre = etapes(sansCapteur, 6).find((e) => e.id === "capteur")!.affiche;
  assert.ok(gainMontre >= 14 && gainMontre <= 24, `montre +${gainMontre}`);
  assert.equal(etapes(neuf, 6).find((e) => e.id === "capteur")!.affiche, 22);
});

test("règle 5 : un sportif sans repas monte à Relief ; Sur mesure demande les repas ; Nutrition éteinte, ses calculs sortent", () => {
  assert.equal(calculer(leo).cap.id, "relief");
  assert.equal(score({ ...sam, nut30: 0, nut60: 0, nut28: 0 }), 84);
  const r = calculer(leoSansNutrition);
  // la Récupération n'est pas lue dans ces jeux (recup absent) : elle ne compte pas
  assert.deepEqual(r.calculs.filter((c) => !c.actif).map((c) => c.id), ["objectifs", "bilan", "recup"]);
  // cycliste : pas de muscu, les 1RM ne le concernent pas ; tout rempli et la dépense mesurée finement, il atteint 100 %
  const cycliste = avecSigmaReel({ ...sam, muscu8: null }, 0.03);
  assert.equal(calculer(cycliste).calculs.find((c) => c.id === "rm")!.actif, false);
  assert.equal(score(cycliste), 100);
});

test("règle 6 : le gain affiché est le vrai ; tour de taille et masse grasse, seule la meilleure", () => {
  for (const d of [vide, neuf, alex, leo, sansCapteur, samPanne]) {
    for (const e of etapes(d, 6)) assert.ok(e.affiche >= 0 && e.affiche <= Math.ceil(e.gain) + 1);
  }
  const ids = etapes(alex, 10).map((e) => e.id);
  assert.ok(!(ids.includes("tour") && ids.includes("gras")));
  // le gain d'Alex (+5 : le %gras des tours compte aussi dans les objectifs) est exactement le score refait
  assert.equal(score(alexApres) - score(alex), 5);
});

test("dépense : la précision est celle d'energie-precision.ts (σ), déplacée par une étape de ce qu'elle change au modèle", () => {
  assert.equal(depuisSigma(0.06), 85);
  assert.equal(depuisSigma(0.1), 65);
  assert.equal(depuisSigma(0.14), 40);
  assert.equal(depuisSigma(0.2), 0);
  const reel = avecSigmaReel(alex, 0.12);
  assert.equal(calculer(reel).p.depense, Math.round(depuisSigma(0.12)));
  const apres = calculer({ ...reel, tourJours: 0, navyJours: 0 }).p.depense!;
  const delta = sigmaModele(qualites(alexApres)) - sigmaModele(qualites(alex));
  assert.equal(apres, Math.round(depuisSigma(0.12 + delta)));
  // le conseil de l'Énergie est la meilleure étape qui fait monter la dépense
  assert.equal(conseilDepense(alex), "gras");
  assert.equal(conseilDepense(neuf), "pas");
});

test("feuille d'un calcul : étapes de ce calcul, gain du calcul, au moins 2 points", () => {
  assert.deepEqual(etapesCalcul(alex, "sommeil").map((e) => [e.id, Math.round(e.gain)]), [["nuits", 22]]);
  assert.deepEqual(etapesCalcul(alex, "depense").map((e) => e.id), ["gras", "repas"]);
  assert.deepEqual(etapesCalcul(sam, "sommeil"), []);
  const s = calculer(alex).p.sommeil!;
  assert.equal(s, 53);
  assert.equal(niveau(s), "moyenne");
  assert.deepEqual(niveauSuivant(s), { niveau: "bonne", min: 65 });
  assert.equal(niveauSuivant(97), null);
});

test("comptage : semaines sur 4 (pas une série), jours sur une fenêtre", () => {
  const m = new Date(2026, 9, 30, 12).getTime();
  const il = (n: number) => m - n * 86_400_000;
  assert.equal(semainesAvec([il(1), il(2), il(15), il(22)], m), 3);
  assert.equal(semainesAvec([il(29)], m), 0);
  assert.equal(joursEntre([il(0), il(1), il(1), il(31)], m, 0, 30), 2);
  assert.equal(joursEntre([il(31)], m, 30, 60), 1);
  assert.equal(minuit(m), new Date(2026, 9, 30).getTime());
});

test("US Navy : %gras des tours ; rien sans le cou, ni pour une femme sans les hanches", () => {
  const h = grasNavy({ sexe: "h", tailleCm: 178, tourTaille: 86, cou: 38, hanches: null });
  assert.ok(h != null && h > 12 && h < 20, `homme ${h}`);
  assert.equal(grasNavy({ sexe: "h", tailleCm: 178, tourTaille: 86, cou: null, hanches: null }), null);
  assert.equal(grasNavy({ sexe: "f", tailleCm: 165, tourTaille: 72, cou: 33, hanches: null }), null);
  const f = grasNavy({ sexe: "f", tailleCm: 165, tourTaille: 72, cou: 33, hanches: 98 });
  assert.ok(f != null && f > 20 && f < 35, `femme ${f}`);
});

test("mémoire du téléphone : lue sans planter, bornée", () => {
  assert.equal(lireMemoire(null), null);
  assert.equal(lireMemoire("{"), null);
  assert.deepEqual(lireMemoire('{"cap":9,"vu":3,"lectures":["age",4],"score":61}'), { cap: 1, vu: 3, lectures: ["age"], score: 61, affiche: null, lecturesVues: ["age"] });
});

test("passage de cap : une fois par cap, depuis la dernière valeur vue", () => {
  const m = { cap: 3, vu: 3, lectures: ["vo2"], score: 61, affiche: 61, lecturesVues: ["vo2"] };
  assert.deepEqual(passageAMontrer(m, 4, 65), { capAvant: 3, scoreAvant: 61, lecturesAvant: ["vo2"] });
  assert.equal(passageAMontrer({ ...m, vu: 4 }, 4, 65), null);
  // redescendu puis remonté : déjà vu, rien
  assert.equal(passageAMontrer({ ...m, vu: 4 }, 3, 60), null);
});

test("Récupération : la précision de son dernier matin, et son âge (pleine ce matin, un quart de moins par jour)", () => {
  assert.equal(calculer({ ...sam, recup: { precision: 100, jours: 0, parts: 4 } }).p.recup, 100);
  assert.equal(calculer({ ...sam, recup: { precision: 80, jours: 1, parts: 3 } }).p.recup, 60);
  assert.equal(calculer({ ...sam, recup: { precision: 100, jours: 4, parts: 4 } }).p.recup, 0);
  assert.equal(calculer({ ...sam, recup: null }).p.recup, 0, "aucune nuit cette semaine");
  assert.equal(calculer(sam).p.recup, null, "non lue : ne compte pas");
  const avec = calculer({ ...sam, recup: { precision: 25, jours: 0, parts: 2 } });
  assert.equal(avec.calculs.find((c) => c.id === "recup")!.actif, true);
  assert.ok(score({ ...sam, recup: { precision: 25, jours: 0, parts: 2 } }) < score({ ...sam, recup: { precision: 100, jours: 0, parts: 4 } }));
});

test("le sommeil compte la qualité des sources (planche sommeil, D17) : des nuits du téléphone valent moitié", () => {
  const p = (d: DonneesPrecision) => calculer(d).calculs.find((c) => c.id === "sommeil")!.brut!;
  const montre = p({ ...alex, recup: { precision: 80, jours: 0, parts: 4, qualiteSommeil: 1 } });
  const tel = p({ ...alex, recup: { precision: 80, jours: 0, parts: 4, qualiteSommeil: 0.5 } });
  assert.equal(montre, p(alex), "sans qualité lue : comme une montre");
  assert.ok(tel < montre, `${tel} < ${montre}`);
});
