// Agenda du téléphone (planche agenda-ics, D10 à D15) : plan de la synchro, déplacements, créneaux pris, conflits, créneau libre.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleSeance, conflitDe, ecritParDefaut, empreinte, estDePepfit, evenementsPris, lienSeance, retrouver, fusionner, lusParDefaut, planReecriture, planSynchro, premierCreneauLibre, type EvenementAgenda,
  type LienAgenda, type SeanceAgenda,
} from "../src/agenda/calcul.ts";

const M = 60_000;
const MINUIT = Date.UTC(2026, 10, 3); // mardi 3 novembre 2026, en UTC pour le test
const h = (hh: number, mm = 0) => MINUIT + (hh * 60 + mm) * M;

const seance = (o: Partial<SeanceAgenda> = {}): SeanceAgenda => ({
  cle: cleSeance("p1", "2026-11-03"), programmationId: "p1", dateOrigine: "2026-11-03", routineId: "r1", titre: "Footing",
  notes: "Planifiée dans pepfit\npepfitopen://routine/view/r1?seance=p1%7C2026-11-03", lieu: null, debut: h(18), fin: h(18, 45), figee: false, ...o,
});
const lien = (o: Partial<LienAgenda> = {}): LienAgenda => ({
  cle: cleSeance("p1", "2026-11-03"), programmationId: "p1", dateOrigine: "2026-11-03", evenementId: "e1", debut: h(18), fin: h(18, 45), etat: "ecrite",
  vu: true, contenu: empreinte(seance()), ...o,
});
const ev = (o: Partial<EvenementAgenda> = {}): EvenementAgenda => ({
  id: "x", calendrierId: "travail", titre: "Réunion d'équipe", debut: h(17, 30), fin: h(18, 30), journee: false, libre: false, ...o,
});

test("synchro : une séance sans événement s'écrit", () => {
  const a = planSynchro([seance()], [], new Map(), MINUIT);
  assert.deepEqual(a.map((x) => x.genre), ["creer"]);
});

test("synchro : rien n'a bougé, rien à faire", () => {
  assert.deepEqual(planSynchro([seance()], [lien()], new Map([["e1", { debut: h(18), fin: h(18, 45) }]]), MINUIT), []);
});

test("synchro : déplacée ici, l'événement suit (D11)", () => {
  const a = planSynchro([seance({ debut: h(19), fin: h(19, 45) })], [lien()], new Map([["e1", { debut: h(18), fin: h(18, 45) }]]), MINUIT);
  assert.deepEqual(a.map((x) => x.genre), ["maj"]);
});

test("synchro : déplacée là-bas, elle se déplace ici (D12), et l'agenda gagne si les deux ont bougé", () => {
  const vers = { debut: h(19, 30), fin: h(20, 15) };
  const a = planSynchro([seance()], [lien()], new Map([["e1", vers]]), MINUIT);
  assert.equal(a.length, 1);
  assert.equal(a[0]!.genre, "deplacee");
  assert.deepEqual(a[0]!.genre === "deplacee" && a[0]!.vers, vers);
  const deux = planSynchro([seance({ debut: h(17) })], [lien()], new Map([["e1", vers]]), MINUIT);
  assert.deepEqual(deux.map((x) => x.genre), ["deplacee"]);
});

test("synchro : seule la durée change là-bas, rien ne bouge ici", () => {
  assert.deepEqual(planSynchro([seance()], [lien()], new Map([["e1", { debut: h(18), fin: h(19) }]]), MINUIT), []);
});

test("synchro : supprimée là-bas, gardée ici et pas réécrite d'office (D13)", () => {
  assert.deepEqual(planSynchro([seance()], [lien()], new Map([["e1", null]]), MINUIT).map((x) => x.genre), ["retiree"]);
  assert.deepEqual(planSynchro([seance()], [lien({ etat: "retiree" })], new Map([["e1", null]]), MINUIT), []);
});

test("synchro : événement non relu (erreur de lecture), on ne conclut rien", () => {
  assert.deepEqual(planSynchro([seance()], [lien()], new Map(), MINUIT), []);
});

test("synchro : séance retirée de pepfit, son événement à venir est supprimé, le passé oublié", () => {
  assert.deepEqual(planSynchro([], [lien()], new Map(), MINUIT).map((x) => x.genre), ["supprimer"]);
  assert.deepEqual(planSynchro([], [lien({ debut: MINUIT - 6 * 3600_000 })], new Map(), MINUIT).map((x) => x.genre), ["oublier"]);
  // Déjà retirée de l'agenda : rien à supprimer.
  assert.deepEqual(planSynchro([], [lien({ etat: "retiree" })], new Map(), MINUIT).map((x) => x.genre), ["oublier"]);
});

test("synchro : une séance faite (ou au-delà de la fenêtre) ne touche pas à l'agenda", () => {
  assert.deepEqual(planSynchro([seance({ figee: true })], [], new Map(), MINUIT), []);
  assert.deepEqual(planSynchro([seance({ figee: true, debut: h(7) })], [lien()], new Map([["e1", null]]), MINUIT), []);
});

// « Réécrire mes séances dans l'agenda » (03/11) : trois séances, chacune écrite sous son événement e1, e2, e3.
const trois = [1, 2, 3].map((i) => {
  const jour = `2026-11-0${i + 2}`;
  const s = seance({ cle: cleSeance("p1", jour), dateOrigine: jour, notes: `Planifiée dans pepfit\n${lienSeance("r1", cleSeance("p1", jour))}`, debut: h(18) + (i - 1) * 86_400_000, fin: h(18, 45) + (i - 1) * 86_400_000 });
  return { s, l: lien({ cle: s.cle, dateOrigine: jour, evenementId: `e${i}`, debut: s.debut, fin: s.fin, contenu: empreinte(s) }) };
});
const lues = (absents: string[]) => new Map(trois.map(({ l }) => [l.evenementId, absents.includes(l.evenementId) ? null : { debut: l.debut, fin: l.fin }]));
/** Chaque séance une seule fois, et chaque événement mis à jour une seule fois : jamais de doublon. */
const sansDoublon = (a: ReturnType<typeof planReecriture>) => {
  assert.equal(new Set(a.map((x) => x.seance.cle)).size, a.length);
  const ids = a.flatMap((x) => (x.genre === "maj" ? [x.evenementId] : []));
  assert.equal(new Set(ids).size, ids.length);
};

test("réécrire : tout supprimé dans l'agenda, tout est recréé, « retirées » comprises", () => {
  const liens = trois.map(({ l }, i) => (i === 0 ? { ...l, etat: "retiree" as const } : l));
  const a = planReecriture(trois.map((x) => x.s), liens, lues(["e1", "e2", "e3"]), []);
  assert.deepEqual(a.map((x) => x.genre), ["creer", "creer", "creer"]);
  sansDoublon(a);
  // Sans lien du tout (oubliés) : créées aussi.
  assert.deepEqual(planReecriture(trois.map((x) => x.s), [], new Map(), []).map((x) => x.genre), ["creer", "creer", "creer"]);
});

test("réécrire : rien supprimé, chaque événement est mis à jour sous son identifiant, aucun n'est créé", () => {
  const a = planReecriture(trois.map((x) => x.s), trois.map((x) => x.l), lues([]), []);
  assert.deepEqual(a.map((x) => (x.genre === "maj" ? x.evenementId : x.genre)), ["e1", "e2", "e3"]);
  sansDoublon(a);
});

test("réécrire : un seul supprimé, lui seul est recréé ; retrouvé sous un autre identifiant, il est mis à jour", () => {
  const liens = trois.map(({ l }, i) => (i === 1 ? { ...l, etat: "retiree" as const } : l));
  const a = planReecriture(trois.map((x) => x.s), liens, lues(["e2"]), []);
  assert.deepEqual(a.map((x) => (x.genre === "maj" ? x.evenementId : x.genre)), ["e1", "creer", "e3"]);
  assert.equal(a[1]!.seance.cle, trois[1]!.s.cle);
  sansDoublon(a);
  const ailleurs = ev({ id: "g2", calendrierId: "perso", debut: trois[1]!.s.debut, fin: trois[1]!.s.fin, notes: trois[1]!.s.notes });
  const b = planReecriture(trois.map((x) => x.s), liens, lues(["e2"]), [ailleurs]);
  assert.deepEqual(b.map((x) => (x.genre === "maj" ? x.evenementId : x.genre)), ["e1", "g2", "e3"]);
  sansDoublon(b);
});

test("réécrire : lecture ratée (identifiant non relu, agenda illisible) ou séance figée, rien n'est touché", () => {
  const evs = lues(["e2"]);
  evs.delete("e1");
  const a = planReecriture(trois.map((x, i) => (i === 2 ? { ...x.s, figee: true } : x.s)), trois.map((x) => x.l), evs, null);
  assert.deepEqual(a, []);
});

test("créneaux pris : sans journée entière, ni « disponible », ni ce que pepfit a écrit ; triés", () => {
  const l = evenementsPris(
    [ev({ id: "b", debut: h(20), fin: h(21) }), ev({ id: "a" }), ev({ id: "j", journee: true }), ev({ id: "l", libre: true }), ev({ id: "e1" })],
    new Set(["e1"]),
  );
  assert.deepEqual(l.map((e) => e.id), ["a", "b"]);
});

test("fusion des créneaux : ceux qui se touchent ou se chevauchent n'en font qu'un", () => {
  const f = fusionner([
    { debut: h(10), fin: h(11) },
    { debut: h(9), fin: h(10) },
    { debut: h(10, 30), fin: h(12) },
    { debut: h(14), fin: h(15) },
  ]);
  assert.deepEqual(f, [
    { debut: h(9), fin: h(12) },
    { debut: h(14), fin: h(15) },
  ]);
});

test("conflit : le premier rendez-vous qui chevauche (D15), aucun bord à bord", () => {
  const s = { debut: h(18), fin: h(18, 45) };
  assert.equal(conflitDe(s, [ev({ id: "tard", debut: h(18, 30), fin: h(19) }), ev({ id: "reu" })])?.id, "reu");
  assert.equal(conflitDe(s, [ev({ debut: h(17), fin: h(18) }), ev({ debut: h(18, 45), fin: h(19) })]), null);
});

test("créneau libre : « Décaler à 18:30 » après la réunion (planche 4b)", () => {
  const d = premierCreneauLibre({ debut: h(18), dureeMs: 45 * M, minuit: MINUIT, maintenant: h(8), pris: [{ debut: h(17, 30), fin: h(18, 30) }] });
  assert.equal(d, h(18, 30));
});

test("créneau libre : les autres rendez-vous et séances du jour comptent, au quart d'heure", () => {
  const d = premierCreneauLibre({
    debut: h(18), dureeMs: 45 * M, minuit: MINUIT, maintenant: h(8),
    pris: [{ debut: h(17, 30), fin: h(18, 30) }, { debut: h(18, 40), fin: h(19, 5) }],
  });
  assert.equal(d, h(19, 15));
});

test("créneau libre : la séance finit avant 22:00, sinon le plus proche avant ; jamais avant maintenant ni 06:00", () => {
  const tard = premierCreneauLibre({ debut: h(21), dureeMs: 60 * M, minuit: MINUIT, maintenant: h(8), pris: [{ debut: h(20, 30), fin: h(22) }] });
  assert.equal(tard, h(19, 30));
  const rien = premierCreneauLibre({ debut: h(7), dureeMs: 60 * M, minuit: MINUIT, maintenant: h(8), pris: [{ debut: h(6), fin: h(22) }] });
  assert.equal(rien, null);
  const pasAvantMaintenant = premierCreneauLibre({ debut: h(9), dureeMs: 30 * M, minuit: MINUIT, maintenant: h(9, 50), pris: [{ debut: h(9), fin: h(9, 30) }] });
  assert.equal(pasAvantMaintenant, h(10));
});

test("agendas par défaut (D10) : lus sauf anniversaires, fériés et lecture seule ; écrit = le principal modifiable", () => {
  const cals = [
    { id: "1", titre: "Perso", modifiable: true, principal: true },
    { id: "2", titre: "Travail", modifiable: true, principal: false },
    { id: "3", titre: "Anniversaires", modifiable: false, principal: false },
    { id: "4", titre: "Jours fériés en France", modifiable: false, principal: false },
    { id: "5", titre: "Holidays in France", modifiable: true, principal: false },
    { id: "6", titre: "Club (abonnement)", modifiable: false, principal: false },
  ];
  assert.deepEqual(lusParDefaut(cals), ["1", "2"]);
  assert.equal(ecritParDefaut(cals), "1");
  assert.equal(ecritParDefaut([{ id: "a", modifiable: false, principal: true }, { id: "b", modifiable: true, principal: false }]), "b");
  assert.equal(ecritParDefaut([{ id: "a", modifiable: false, principal: true }]), null);
});

// Retours d'Alex du 03/11 (capture : « Pris : Pull, 17:30 – 18:14 » et « Retirée de ton agenda » sous la séance Pull de
// 17:30). Les deux viennent du même fait : l'événement que pepfit a écrit est toujours là, mais sous un autre identifiant que
// celui gardé dans agenda_liens (Google l'a réinséré à la synchro, ou un ancien lien a été oublié).
const NOTE_PULL = "Planifiée dans pepfit\npepfitopen://routine/view/r1";
const pull = (o: Partial<EvenementAgenda> = {}) => ev({ id: "e2", calendrierId: "perso", titre: "Footing", debut: h(18), fin: h(18, 45), notes: NOTE_PULL, ...o });

test("bug du 03/11 : l'événement écrit par pepfit n'est jamais un conflit, même sous un autre identifiant", () => {
  // e1 : l'identifiant gardé ; e2 : le même événement, relu sous un autre identifiant.
  assert.deepEqual(evenementsPris([pull()], new Set(["e1"])), []);
  assert.equal(conflitDe(seance(), evenementsPris([pull(), ev({ id: "reu" })], new Set(["e1"])))?.id, "reu");
  // En anglais, ou une note recopiée sans le lien : reconnu aussi.
  assert.deepEqual(evenementsPris([pull({ notes: "Planned in pepfit" }), pull({ id: "e3", notes: "x\nPlanifiée dans pepfit" })], new Set()), []);
});

test("bug du 03/11 : introuvable par son identifiant mais retrouvé dans l'agenda, la séance n'est pas « retirée »", () => {
  const a = planSynchro([seance()], [lien()], new Map([["e1", null]]), MINUIT, [pull()]);
  assert.deepEqual(a.map((x) => x.genre), ["relier"]);
  assert.equal(a[0]!.genre === "relier" && a[0]!.evenement.id, "e2");
});

test("bug du 03/11 : « retirée » seulement si l'événement, déjà relu une fois, n'est plus nulle part", () => {
  // Jamais relu sous son identifiant, et introuvable : réécrit sans rien dire.
  assert.deepEqual(planSynchro([seance()], [lien({ vu: false })], new Map([["e1", null]]), MINUIT, []).map((x) => x.genre), ["recreer"]);
  // Lecture de l'agenda ratée : rien de sûr, rien ne bouge.
  assert.deepEqual(planSynchro([seance()], [lien()], new Map([["e1", null]]), MINUIT, null), []);
  // Déjà relu, introuvable partout : vraiment supprimé là-bas.
  assert.deepEqual(planSynchro([seance()], [lien()], new Map([["e1", null]]), MINUIT, [pull({ notes: "Réunion" })]).map((x) => x.genre), ["retiree"]);
  // Relu une première fois : le lien est marqué vu.
  assert.deepEqual(planSynchro([seance()], [lien({ vu: false })], new Map([["e1", { debut: h(18), fin: h(18, 45) }]]), MINUIT).map((x) => x.genre), ["vu"]);
  // Relu et déplacé ici en même temps : une seule écriture, qui porte « vu ».
  const maj = planSynchro([seance({ debut: h(19), fin: h(19, 45) })], [lien({ vu: false })], new Map([["e1", { debut: h(18), fin: h(18, 45) }]]), MINUIT);
  assert.deepEqual(maj.map((x) => [x.genre, x.genre === "maj" && x.lien.vu]), [["maj", true]]);
});

test("bug du 03/11 : une séance déjà « retirée » à tort redevient écrite si son événement est encore là", () => {
  const a = planSynchro([seance()], [lien({ etat: "retiree" })], new Map(), MINUIT, [pull()]);
  assert.deepEqual(a.map((x) => x.genre), ["relier"]);
  // Vraiment supprimée : elle reste retirée (D13).
  assert.deepEqual(planSynchro([seance()], [lien({ etat: "retiree" })], new Map(), MINUIT, []), []);
});

test("retrouver : par la séance du lien, sinon (écrit avant le 03/11) par la routine et le début ; jamais un autre événement", () => {
  const avecSeance = pull({ id: "s", debut: h(20), notes: `Planifiée dans pepfit\n${lienSeance("r1", cleSeance("p1", "2026-11-03"))}` });
  assert.equal(retrouver(lien(), "r1", [pull({ id: "x", notes: "Réunion" }), avecSeance])?.id, "s");
  assert.equal(retrouver(lien(), "r1", [pull({ id: "ancien" })])?.id, "ancien");
  assert.equal(retrouver(lien(), "r1", [pull({ id: "autre heure", debut: h(19) })]), null);
  assert.equal(retrouver(lien(), "r2", [pull()]), null, "une autre routine");
  assert.equal(retrouver(lien(), "r1", [pull({ id: "autre jour", notes: `Planifiée dans pepfit\n${lienSeance("r1", cleSeance("p1", "2026-11-04"))}` })]), null);
  assert.equal(lienSeance("r 1", "p1|2026-11-03"), "pepfitopen://routine/view/r%201?seance=p1%7C2026-11-03");
  assert.ok(estDePepfit("Squat, 4 séries\n\nPlanned in pepfit") && !estDePepfit("Réunion") && !estDePepfit(undefined));
});

test("synchro : le titre, le lieu ou la description changent (format, routine), l'événement est réécrit", () => {
  const ok = new Map([["e1", { debut: h(18), fin: h(18, 45) }]]);
  assert.deepEqual(planSynchro([seance({ titre: "🏃 Footing" })], [lien()], ok, MINUIT).map((x) => x.genre), ["maj"]);
  assert.deepEqual(planSynchro([seance({ lieu: "Maison" })], [lien()], ok, MINUIT).map((x) => x.genre), ["maj"]);
  assert.deepEqual(planSynchro([seance()], [lien({ contenu: null })], ok, MINUIT).map((x) => x.genre), ["maj"], "écrit avant le 03/11 : réécrit une fois");
  assert.notEqual(empreinte({ titre: "a", lieu: "b", notes: "" }), empreinte({ titre: "ab", lieu: null, notes: "" }));
});

// Titre, description et lieu de l'événement écrit (ajustements du 03/11, agenda/titre.ts).
test("emoji du sport : chaque sport du catalogue en a un ; musculation 🏋️‍♂️, inconnu par sa famille, sans sport 💪", async () => {
  const { readFileSync } = await import("node:fs");
  const { EMOJI_SPORT, emojiSport } = await import("../src/agenda/titre.ts");
  const cat = JSON.parse(readFileSync(new URL("../assets/catalogue/exercices.json", import.meta.url), "utf8")) as { exercices: { slug: string; whoop_ids?: unknown }[] };
  const sports = cat.exercices.filter((e) => e.whoop_ids).map((e) => e.slug);
  assert.ok(sports.length > 80);
  assert.deepEqual(sports.filter((x) => !EMOJI_SPORT[x]), [], "un emoji pour chaque sport du catalogue");
  assert.equal(emojiSport("cat:musculation"), "🏋️‍♂️");
  assert.equal(emojiSport("cat:padel"), "🎾");
  assert.equal(emojiSport("course"), "🏃");
  assert.equal(emojiSport(null), "💪");
  assert.ok(emojiSport("cat:sport-de-demain").length > 0);
});

test("titre composé : toutes les combinaisons cochées, dans l'ordre par défaut ; «, » entre les éléments, une espace après l'emoji", async () => {
  const { ELEMENTS_TITRE, TITRE_DEFAUT, normaliserTitre, titreEvenement } = await import("../src/agenda/titre.ts");
  const gym = { nom: "Gym Upper", sport: "cat:musculation", nomSport: "Musculation", duree: "45 min" };
  assert.deepEqual(TITRE_DEFAUT, { ordre: ["emoji", "sport", "nom", "duree"], coches: ["nom"] });
  const morceaux: Record<string, string> = { emoji: "🏋️‍♂️", sport: "Musculation", nom: "Gym Upper", duree: "45 min" };
  const optionnels = ELEMENTS_TITRE.filter((e) => e !== "nom");
  // Les 8 combinaisons (le nom toujours là), chacune comparée au titre attendu.
  for (let m = 0; m < 1 << optionnels.length; m++) {
    const coches = ["nom", ...optionnels.filter((_, i) => m & (1 << i))];
    const titre = titreEvenement(gym, normaliserTitre({ ordre: ELEMENTS_TITRE, coches }));
    const attendu = ELEMENTS_TITRE.filter((e) => coches.includes(e) && e !== "emoji").map((e) => morceaux[e]).join(", ");
    assert.equal(titre, coches.includes("emoji") ? `🏋️‍♂️ ${attendu}` : attendu, coches.join("+"));
  }
  const tout = normaliserTitre({ ordre: ELEMENTS_TITRE, coches: ELEMENTS_TITRE });
  assert.equal(titreEvenement(gym, tout), "🏋️‍♂️ Musculation, Gym Upper, 45 min");
  // Le sport n'est pas répété ; une séance sans nom prend celui du sport.
  assert.equal(titreEvenement({ ...gym, nom: "Course à pied", sport: "cat:course", nomSport: "Course a pied" }, tout), "🏃 Course à pied, 45 min");
  assert.equal(titreEvenement({ ...gym, nom: " " }, TITRE_DEFAUT), "Musculation");
  assert.equal(titreEvenement({ ...gym, sport: null, nomSport: null }, tout), "💪 Gym Upper, 45 min", "routine sans sport");
});

test("titre composé : l'ordre choisi est suivi, l'emoji collé à son voisin par une espace", async () => {
  const { normaliserTitre, titreEvenement } = await import("../src/agenda/titre.ts");
  const gym = { nom: "Gym Upper", sport: "cat:musculation", nomSport: "Musculation", duree: "45 min" };
  const t = (ordre: string[], coches: string[] = ordre) => titreEvenement(gym, normaliserTitre({ ordre, coches }));
  assert.equal(t(["nom", "duree", "sport", "emoji"]), "Gym Upper, 45 min, Musculation 🏋️‍♂️");
  assert.equal(t(["duree", "emoji", "nom", "sport"]), "45 min 🏋️‍♂️ Gym Upper, Musculation");
  assert.equal(t(["sport", "nom", "emoji", "duree"], ["nom", "duree"]), "Gym Upper, 45 min", "décochés : absents, l'ordre des autres gardé");
  assert.equal(t(["nom", "emoji"], ["nom", "emoji"]), "Gym Upper 🏋️‍♂️");
});

test("titre composé : le nom ne se décoche pas ; réglage illisible ou incomplet remis d'aplomb", async () => {
  const { TITRE_DEFAUT, basculerElement, deplacerElement, lireTitre, normaliserTitre, placerElement } = await import("../src/agenda/titre.ts");
  assert.deepEqual(basculerElement(TITRE_DEFAUT, "nom"), TITRE_DEFAUT, "le nom reste coché");
  assert.deepEqual(normaliserTitre({ coches: [] }).coches, ["nom"]);
  assert.deepEqual(basculerElement(TITRE_DEFAUT, "duree").coches, ["nom", "duree"]);
  assert.deepEqual(basculerElement(basculerElement(TITRE_DEFAUT, "duree"), "duree"), TITRE_DEFAUT);
  // Coches rendues dans l'ordre du titre, quel que soit l'ordre des clics.
  assert.deepEqual(basculerElement(basculerElement(TITRE_DEFAUT, "duree"), "emoji").coches, ["emoji", "nom", "duree"]);
  // Réglage lu : JSON abîmé, éléments inconnus, doublons, manquants.
  for (const v of [null, "", "{", "42", "null", "[]"]) assert.deepEqual(lireTitre(v), TITRE_DEFAUT, String(v));
  assert.deepEqual(lireTitre(JSON.stringify({ ordre: ["duree", "lieu", "duree", "nom"], coches: ["duree", "x"] })), { ordre: ["duree", "nom", "emoji", "sport"], coches: ["duree", "nom"] });
  // Monter, descendre, poser : au bord rien ne bouge.
  assert.deepEqual(deplacerElement(TITRE_DEFAUT, "nom", -1).ordre, ["emoji", "nom", "sport", "duree"]);
  assert.deepEqual(deplacerElement(TITRE_DEFAUT, "emoji", -1), TITRE_DEFAUT);
  assert.deepEqual(deplacerElement(TITRE_DEFAUT, "duree", 1), TITRE_DEFAUT);
  assert.deepEqual(placerElement(TITRE_DEFAUT, "emoji", 3).ordre, ["sport", "nom", "duree", "emoji"]);
  assert.deepEqual(placerElement(TITRE_DEFAUT, "duree", 0).ordre, ["duree", "emoji", "sport", "nom"]);
  assert.deepEqual(placerElement(TITRE_DEFAUT, "duree", 9), TITRE_DEFAUT);
});

test("titre composé : migration de l'ancien réglage (modèle et interrupteur d'emoji) sans changement visible", async () => {
  const { FORMATS_ANCIENS, titreDepuisAncien, titreEvenement } = await import("../src/agenda/titre.ts");
  const gym = { nom: "Gym Upper", sport: "cat:musculation", nomSport: "Musculation", duree: "45 min" };
  // Titres de la première version (radios), tels qu'ils étaient écrits.
  const avant: Record<string, string> = {
    nom: "Gym Upper", sportNom: "Musculation, Gym Upper", nomDuree: "Gym Upper, 45 min", sportNomDuree: "Musculation, Gym Upper, 45 min",
  };
  for (const f of FORMATS_ANCIENS)
    for (const emoji of [false, true]) {
      const t = titreDepuisAncien(f, emoji);
      assert.deepEqual(t.ordre, ["emoji", "sport", "nom", "duree"]);
      assert.equal(titreEvenement(gym, t), emoji ? `🏋️‍♂️ ${avant[f]}` : avant[f], `${f}, emoji ${emoji}`);
    }
  assert.deepEqual(titreDepuisAncien(null, false), { ordre: ["emoji", "sport", "nom", "duree"], coches: ["nom"] }, "rien de réglé : nom seul");
  assert.deepEqual(titreDepuisAncien("inconnu", true).coches, ["emoji", "nom"]);
});

test("description et lieu : exercices, durée, « Planifiée dans pepfit » et le lien ; l'adresse, sinon le nom du lieu", async () => {
  const { descriptionEvenement, lieuEvenement } = await import("../src/agenda/titre.ts");
  const d = descriptionEvenement({ exercices: ["Squat, 4 séries", "Course à pied, 3 × 400 m"], duree: "Durée estimée : 45 min", note: "Planifiée dans pepfit", lien: lienSeance("r1", "p1|2026-11-03") });
  assert.equal(d, "Squat, 4 séries\nCourse à pied, 3 × 400 m\nDurée estimée : 45 min\n\nPlanifiée dans pepfit\npepfitopen://routine/view/r1?seance=p1%7C2026-11-03");
  assert.ok(estDePepfit(d));
  assert.equal(lieuEvenement({ nom: "Maison", adresse: null }), "Maison");
  assert.equal(lieuEvenement({ nom: "Basic-Fit", adresse: "12 rue de la Paix, Paris" }), "12 rue de la Paix, Paris");
  assert.equal(lieuEvenement({ nom: "Maison", adresse: "  " }), "Maison");
  assert.equal(lieuEvenement(null), null);
});

test("base : l'événement d'une routine porte son titre, sa description, le lieu de sa dernière séance ; le lien garde vu et l'empreinte", async () => {
  const { baseDeTest } = await import("./aide.ts");
  const { creerRoutine } = await import("../src/db/depots/routines.ts");
  const { creerSalle } = await import("../src/db/depots/salles.ts");
  const { ajouterProgrammation } = await import("../src/db/depots/programmations.ts");
  const { lirePlanning, instantDe } = await import("../src/ecrans/planif-donnees.ts");
  const { lireContexte, seancesAgenda } = await import("../src/agenda/synchro.ts");
  const { ecrireLien, listerLiens, lireReglagesAgenda, ecrireReglagesAgenda } = await import("../src/agenda/depot.ts");
  const { db, raw } = await baseDeTest(true);
  const rid = await creerRoutine(db, "Gym Upper", [{ exerciceId: "cat:couche", nbSeries: 4 }]);
  const maison = await creerSalle(db, "Maison");
  const salle = await creerSalle(db, "Basic-Fit", [], "12 rue de la Paix, Paris");
  // Deux séances faites : la plus récente, à la Maison, donne le lieu.
  raw.prepare("INSERT INTO seances (id, routine_id, titre, debut, fin, salle_id, maj_le) VALUES (?, ?, 'x', ?, ?, ?, 0)").run("s1", rid, Date.UTC(2026, 9, 1), Date.UTC(2026, 9, 1) + 3600_000, salle);
  raw.prepare("INSERT INTO seances (id, routine_id, titre, debut, fin, salle_id, maj_le) VALUES (?, ?, 'x', ?, ?, ?, 0)").run("s2", rid, Date.UTC(2026, 9, 20), Date.UTC(2026, 9, 20) + 3600_000, maison);
  await ajouterProgrammation(db, rid, "le mercredi", { freq: "semaine", intervalle: 1, jours: [2], heure: "17:30", debut: "2026-11-01" });
  const maintenant = instantDe("2026-11-02", "08:00");
  const p = await lirePlanning(db, "2026-11-02", "2026-11-10", maintenant);
  // Réglage de la première version (interrupteur et modèle), sans titre composé : converti à la lecture.
  const { ecrireReglage, PREFIXE_CACHE } = await import("../src/db/depots/reglages.ts");
  await ecrireReglage(db, `${PREFIXE_CACHE}agenda_emoji`, "1");
  await ecrireReglage(db, `${PREFIXE_CACHE}agenda_format`, "nomDuree");
  const r = await lireReglagesAgenda(db);
  assert.deepEqual(r.titre, { ordre: ["emoji", "sport", "nom", "duree"], coches: ["emoji", "nom", "duree"] });
  const [s] = seancesAgenda(p, p.a, await lireContexte(db, p, r));
  assert.ok(s);
  assert.match(s.titre, /^🏋️‍♂️ Gym Upper, \d+ min$/);
  // Titre composé écrit : il l'emporte sur l'ancien réglage, et l'empreinte change (la synchro réécrit l'événement).
  await ecrireReglagesAgenda(db, { titre: { ordre: ["duree", "nom", "emoji", "sport"], coches: ["duree", "nom"] } });
  const r2 = await lireReglagesAgenda(db);
  assert.deepEqual(r2.titre, { ordre: ["duree", "nom", "emoji", "sport"], coches: ["duree", "nom"] });
  const [s2] = seancesAgenda(p, p.a, await lireContexte(db, p, r2));
  assert.match(s2!.titre, /^\d+ min, Gym Upper$/);
  assert.notEqual(empreinte(s2!), empreinte(s));
  const ok = new Map([["42", { debut: s.debut, fin: s.fin }]]);
  const ecrit = { ...s, evenementId: "42", etat: "ecrite" as const, vu: true, contenu: empreinte(s) };
  assert.deepEqual(planSynchro([s2!], [ecrit], ok, maintenant).map((x) => x.genre), ["maj"], "séance déjà écrite : réécrite au nouveau titre");
  assert.equal(s.lieu, "Maison");
  assert.match(s.notes, /^Développé couché.*, 4 séries\nDurée estimée : \d+ min\n\nPlanifiée dans pepfit\npepfitopen:\/\/routine\/view\//);
  assert.ok(s.notes.endsWith(`?seance=${encodeURIComponent(s.cle)}`));
  // Sans contexte (conflits, feuille) : le nom seul.
  assert.equal(seancesAgenda(p)[0]!.titre, "Gym Upper");
  await ecrireLien(db, { ...s, evenementId: "42", etat: "ecrite", vu: false, contenu: empreinte(s) });
  await ecrireLien(db, { ...(await listerLiens(db))[0]!, vu: true });
  const [l] = await listerLiens(db);
  assert.deepEqual([l!.vu, l!.contenu, l!.evenementId], [true, empreinte(s), "42"]);
});

test("textes : la ligne du conflit dit « Même horaire » (« Same time ») ; plus « Pris : »", async () => {
  const { fr } = await import("../src/i18n/fr.ts");
  const { en } = await import("../src/i18n/en.ts");
  assert.equal(fr["agenda.conflit.ligne"], "Même horaire : {nom}, {de} – {a}");
  assert.equal(en["agenda.conflit.ligne"], "Same time: {nom}, {de} – {a}");
});
