// Horaires d'une activité (planche Effort v2.2, D6 et D7) : début, fin et durée liés, bornes, séries dehors, changement de jour,
// fuseau et passage à l'heure d'hiver. Les instants sont écrits en UTC : le test ne dépend pas du fuseau de la machine.
import assert from "node:assert/strict";
import { test } from "node:test";
import { definirActif } from "../src/i18n/index.ts";
import {
  dureeMin, ecartJourRoue, instantAvecJour, instantRoues, JOURS_HORAIRES, lier, libelleJourHoraires, modifie, phraseEffet, phraseLien,
  phraseRefus, refuser, valeursJoursHoraires, type Effet, type Horaires,
} from "../src/ecrans/horaires.ts";

definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });

const MIN = 60_000;
// Paris, vendredi 6 novembre 2026 (UTC+1) : 15:45 → 17:16, il est 17:22.
const h = (hh: number, mm: number, j = 6) => Date.UTC(2026, 10, j, hh - 1, mm);
const MAINTENANT = h(17, 22);
const PADEL: Horaires = { debut: h(15, 45), fin: h(17, 16) };
const BORNES = { maintenant: MAINTENANT };

test("la durée est en minutes entières", () => {
  assert.equal(dureeMin(PADEL), 91);
  assert.equal(dureeMin({ debut: 5, fin: 5 }), 0);
  assert.equal(dureeMin({ debut: 10 * MIN, fin: 5 * MIN }), 0);
});

test("le début déplace l'activité : la durée reste, la fin suit", () => {
  const r = lier(PADEL, "debut", h(15, 30));
  assert.equal(r.debut, h(15, 30));
  assert.equal(dureeMin(r), 91);
  assert.equal(r.fin, h(17, 1));
  assert.equal(phraseLien(PADEL, r, "debut"), "La durée reste 1 h 31, la fin passe à 17:01.");
});

test("la fin recalcule la durée : le début reste", () => {
  const r = lier(PADEL, "fin", h(17, 10));
  assert.equal(r.debut, PADEL.debut);
  assert.equal(dureeMin(r), 85);
  assert.equal(phraseLien(PADEL, r, "fin"), "Le début reste 15:45, la durée passe à 1 h 25.");
});

test("la durée déplace la fin : le début reste", () => {
  const r = lier(PADEL, "duree", 60);
  assert.equal(r.debut, PADEL.debut);
  assert.equal(r.fin, h(16, 45));
  assert.equal(phraseLien(PADEL, r, "duree"), "Le début reste 15:45, la fin passe à 16:45.");
});

test("les liens sont réversibles : début puis début d'origine rend l'original", () => {
  const r = lier(lier(PADEL, "debut", h(10, 0)), "debut", PADEL.debut);
  assert.deepEqual(r, PADEL);
  const d = lier(lier(PADEL, "duree", 30), "duree", 91);
  assert.deepEqual(d, PADEL);
});

test("un instant est arrondi à la minute", () => {
  assert.equal(lier(PADEL, "fin", h(17, 10) + 29_000).fin, h(17, 10));
  assert.equal(lier(PADEL, "fin", h(17, 10) + 31_000).fin, h(17, 11));
});

test("bornes : ni futur, ni fin avant le début, ni plus de 99 h 59", () => {
  assert.equal(refuser(PADEL, BORNES), null);
  const futur = refuser(lier(PADEL, "fin", h(17, 40)), BORNES);
  assert.equal(futur?.motif, "futur");
  assert.equal(futur?.champ, "fin");
  assert.equal(phraseRefus(futur!), "Pas dans le futur : il est 17:22.");
  const avant = refuser({ debut: h(15, 45), fin: h(15, 30) }, BORNES);
  assert.equal(avant?.motif, "finAvantDebut");
  assert.equal(phraseRefus(avant!), "La fin doit être après le début.");
  assert.equal(refuser({ debut: h(15, 45), fin: h(15, 45) }, BORNES)?.motif, "finAvantDebut", "une minute au moins");
  assert.equal(refuser({ debut: h(15, 45), fin: h(15, 46) }, BORNES), null);
  assert.equal(refuser({ debut: h(8, 0, 1), fin: h(8, 0, 6) }, BORNES)?.motif, "tropLong");
  assert.equal(refuser({ debut: h(8, 0, 2), fin: h(8, 0, 2) + (99 * 60 + 59) * MIN }, { maintenant: h(23, 0) }), null);
  assert.equal(refuser({ debut: h(8, 0, 2), fin: h(8, 0, 2) + (99 * 60 + 60) * MIN }, { maintenant: h(23, 0) })?.motif, "tropLong");
  assert.equal(refuser({ debut: NaN, fin: h(9, 0) }, BORNES)?.motif, "finAvantDebut");
});

test("la fin tout juste maintenant passe, une minute plus tard non", () => {
  assert.equal(refuser({ debut: h(16, 0), fin: MAINTENANT }, BORNES), null);
  assert.equal(refuser({ debut: h(16, 0), fin: MAINTENANT + MIN }, BORNES)?.motif, "futur");
});

test("séries : l'enveloppe doit contenir toutes les séries", () => {
  const seance: Horaires = { debut: h(8, 30), fin: h(9, 42) };
  const b = { maintenant: MAINTENANT, premiereSerie: h(8, 41), derniereSerie: h(8, 52) };
  assert.equal(refuser(seance, b), null);
  const tard = refuser(lier(seance, "debut", h(8, 50)), b);
  assert.equal(tard?.motif, "serieDebut");
  assert.equal(tard?.champ, "debut");
  assert.equal(phraseRefus(tard!), "Une série est enregistrée à 8:41 : le début ne peut pas être après.");
  const tot = refuser(lier(seance, "fin", h(8, 45)), b);
  assert.equal(tot?.motif, "serieFin");
  assert.equal(phraseRefus(tot!), "Une série est enregistrée à 8:52 : la fin ne peut pas être avant.");
  // à l'heure exacte d'une série : accepté
  assert.equal(refuser({ debut: h(8, 41), fin: h(8, 52) }, b), null);
  // sans série : pas de borne
  assert.equal(refuser({ debut: h(8, 50), fin: h(8, 55) }, { maintenant: MAINTENANT, premiereSerie: null, derniereSerie: null }), null);
});

test("la roue du jour remonte à 90 jours, jamais dans le futur", () => {
  const v = valeursJoursHoraires();
  assert.equal(v.length, JOURS_HORAIRES);
  assert.equal(v[0], -(JOURS_HORAIRES - 1));
  assert.equal(v[v.length - 1], 0);
  assert.equal(ecartJourRoue(MAINTENANT, MAINTENANT), 0);
  assert.equal(ecartJourRoue(h(23, 10, 5), MAINTENANT), -1);
  assert.equal(ecartJourRoue(h(0, 5, 3), MAINTENANT), -3);
  assert.equal(ecartJourRoue(h(12, 0, 1), MAINTENANT), -5);
  assert.equal(ecartJourRoue(h(12, 0, 1) - 400 * 86_400_000, MAINTENANT), -(JOURS_HORAIRES - 1), "ramené dans la roue");
  assert.equal(ecartJourRoue(MAINTENANT + 3 * 86_400_000, MAINTENANT), 0);
});

test("libellés de la roue : aujourd'hui, hier, avant-hier, puis le jour", () => {
  assert.equal(libelleJourHoraires(0, MAINTENANT), "Aujourd'hui");
  assert.equal(libelleJourHoraires(-1, MAINTENANT), "Hier");
  assert.equal(libelleJourHoraires(-2, MAINTENANT), "Avant-hier");
  assert.match(libelleJourHoraires(-3, MAINTENANT), /mar\.? 3 nov/);
  assert.match(libelleJourHoraires(-5, MAINTENANT), /dim\.? 1 nov/);
  assert.equal(instantAvecJour(h(15, 30), MAINTENANT), "Aujourd'hui, 15:30");
  assert.match(instantAvecJour(h(15, 30, 3), MAINTENANT), /^mar\.? 3 nov\.?, 15:30$/);
});

test("roues : jour, heure et minute donnent le bon instant, et inversement", () => {
  assert.equal(instantRoues(0, 15, 30, MAINTENANT), h(15, 30));
  assert.equal(instantRoues(-3, 15, 30, MAINTENANT), h(15, 30, 3));
  assert.equal(instantRoues(-1, 23, 10, MAINTENANT), h(23, 10, 5));
});

test("passage à l'heure d'hiver : la nuit du 24 au 25 octobre dure une heure de plus, le lien suit les millisecondes", () => {
  // Paris : samedi 24 octobre 23:00 (UTC+2) → dimanche 25 octobre 07:00 (UTC+1) = 9 h réelles.
  const nuit: Horaires = { debut: Date.UTC(2026, 9, 24, 21, 0), fin: Date.UTC(2026, 9, 25, 6, 0) };
  assert.equal(dureeMin(nuit), 9 * 60);
  const maintenant = Date.UTC(2026, 9, 25, 12, 0);
  assert.equal(refuser(nuit, { maintenant }), null);
  // Décaler le début d'une heure en avance garde 9 h réelles, la fin suit
  const r = lier(nuit, "debut", Date.UTC(2026, 9, 24, 20, 0));
  assert.equal(r.fin, Date.UTC(2026, 9, 25, 5, 0));
  assert.equal(dureeMin(r), 9 * 60);
  // La roue : dimanche 25 octobre 02:30 existe deux fois ; l'instant construit reste une heure de Paris valide (jamais dans le futur)
  const dim = instantRoues(0, 7, 0, maintenant);
  assert.equal(dim, Date.UTC(2026, 9, 25, 6, 0));
  const sam = instantRoues(-1, 23, 0, maintenant);
  assert.equal(sam, Date.UTC(2026, 9, 24, 21, 0));
  assert.equal(ecartJourRoue(sam, maintenant), -1);
});

test("passage à l'heure d'été : la nuit du 28 au 29 mars dure une heure de moins", () => {
  const nuit: Horaires = { debut: Date.UTC(2026, 2, 28, 22, 0), fin: Date.UTC(2026, 2, 29, 5, 0) };
  assert.equal(dureeMin(nuit), 7 * 60);
  const maintenant = Date.UTC(2026, 2, 29, 12, 0);
  assert.equal(instantRoues(-1, 23, 0, maintenant), Date.UTC(2026, 2, 28, 22, 0));
  assert.equal(instantRoues(0, 7, 0, maintenant), Date.UTC(2026, 2, 29, 5, 0));
});

test("fuseau : les mêmes instants se lisent dans le fuseau choisi", () => {
  definirActif({ langue: "fr", fuseau: "America/New_York", poids: "kg", distance: "km" });
  try {
    const maintenant = Date.UTC(2026, 10, 6, 22, 22); // 17:22 à New York (UTC-5)
    assert.equal(instantRoues(0, 15, 45, maintenant), Date.UTC(2026, 10, 6, 20, 45));
    assert.equal(instantAvecJour(Date.UTC(2026, 10, 6, 20, 45), maintenant), "Aujourd'hui, 15:45");
    assert.equal(ecartJourRoue(Date.UTC(2026, 10, 6, 2, 0), maintenant), -1, "2 h UTC = veille au soir à New York");
  } finally {
    definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });
  }
});

const EFFET: Effet = {
  genre: "seance", jourAvant: h(15, 45), jourApres: h(15, 30, 3), seulAvant: true, serieAvant: 41, serieApres: 41,
};

test("effet : un autre jour, le point suit et la série reste", () => {
  assert.equal(phraseEffet(EFFET, MAINTENANT), "Le point du jour passe du vendredi 6 au mardi 3. La série reste à 41 semaines.");
});

test("effet : même jour, aucune phrase d'effet", () => {
  assert.equal(phraseEffet({ ...EFFET, jourApres: h(10, 0) }, MAINTENANT), null);
});

test("effet : une autre activité tient déjà le point de l'ancien jour, on allume seulement le nouveau", () => {
  assert.equal(
    phraseEffet({ ...EFFET, seulAvant: false, serieAvant: 41, serieApres: 41 }, MAINTENANT),
    "Le point du mardi 3 s'allume. La série reste à 41 semaines.",
  );
});

test("effet : la série change d'une semaine à l'autre, la phrase le dit", () => {
  assert.equal(
    phraseEffet({ ...EFFET, serieApres: 12 }, MAINTENANT),
    "Le point du jour passe du vendredi 6 au mardi 3. Ta série passe de 41 à 12 semaines.",
  );
  assert.equal(phraseEffet({ ...EFFET, serieAvant: 0, serieApres: 0 }, MAINTENANT), "Le point du jour passe du vendredi 6 au mardi 3.");
  assert.equal(
    phraseEffet({ ...EFFET, serieAvant: 1, serieApres: 1 }, MAINTENANT),
    "Le point du jour passe du vendredi 6 au mardi 3. La série reste à 1 semaine.",
  );
});

test("effet : une récupération et une nuit n'allument jamais de point (D5)", () => {
  const recup = phraseEffet({ ...EFFET, genre: "recup" }, MAINTENANT);
  assert.match(recup ?? "", /n'allume pas de point/);
  const nuit = phraseEffet({ ...EFFET, genre: "nuit", jourAvant: h(7, 0, 5), jourApres: h(7, 0, 6) }, MAINTENANT);
  assert.equal(nuit, "Une nuit commence la veille et finit le jour du réveil : elle compte dans la journée d'aujourd'hui.");
  const autre = phraseEffet({ ...EFFET, genre: "nuit", jourAvant: h(7, 0, 5), jourApres: h(7, 0, 3) }, MAINTENANT);
  assert.equal(autre, "Une nuit finit le jour du réveil : elle compte dans la journée du mardi 3.");
  assert.doesNotMatch(`${recup}${nuit}${autre}`, /point du/);
});

test("modifié : seulement si les horaires diffèrent de l'original gardé", () => {
  assert.equal(modifie(PADEL, null), false, "saisie à la main : pas d'original");
  assert.equal(modifie(PADEL, { ...PADEL }), false);
  assert.equal(modifie(lier(PADEL, "debut", h(15, 30)), PADEL), true);
  assert.equal(modifie({ ...PADEL, fin: PADEL.fin + MIN }, PADEL), true);
});
