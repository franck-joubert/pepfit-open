// Sommeil, changement d'heure et voyage (planche sommeil, D12 à D15 ; docs/CODE-HEURE-VOYAGE.md) : dates du changement
// lues dans le fuseau (Intl), plan du jeudi au dimanche, plan du voyage, arrivée vue au fuseau du téléphone, rappel de coucher,
// heure des séances en voyage. Horloge simulée : des instants fixés.
import assert from "node:assert/strict";
import { test } from "node:test";
import { definirActif } from "../src/i18n/index.ts";
import { bandeauDuJour } from "../src/ecrans/heure-voyage/bandeau.ts";
import { changementProche, planChangement, prochainChangement, rythmeHabituel } from "../src/ecrans/heure-voyage/changement-heure.ts";
import { duree, hhmm, heurePile, instantDans, jourDans, minutesDans } from "../src/ecrans/heure-voyage/horloge.ts";
import { corpsRappel, soirsRappel, titreRappel } from "../src/ecrans/heure-voyage/rappel-coucher.ts";
import { decalageVoyage, enVoyage, fuseauDesSeances, momentVoyage, planVoyage, surFuseauAppareil, type Voyage } from "../src/ecrans/heure-voyage/voyage.ts";
import type { NuitStat } from "../src/ecrans/mesures/sommeil-stats.ts";

const PARIS = "Europe/Paris";
const NY = "America/New_York";
const fr = () => definirActif({ langue: "fr", fuseau: PARIS, poids: "kg", distance: "km" });
const en = () => definirActif({ langue: "en", fuseau: PARIS, poids: "kg", distance: "km" });
const a = (jour: string, h: number, m = 0, z = PARIS) => instantDans(jour, h * 60 + m, z);
/** Rythme de la planche : coucher 23:45, lever 7:00 (changement d'heure) ou 7:30 (voyage). */
const RYTHME = { coucher: 23 * 60 + 45, lever: 7 * 60 };
const RYTHME_VOYAGE = { coucher: 23 * 60 + 45, lever: 7 * 60 + 30 };

test("horloge : jour, minutes et instant dans un fuseau, heures et durées", () => {
  fr();
  const t = Date.UTC(2027, 2, 25, 22, 30);
  assert.equal(jourDans(t, PARIS), "2027-03-25");
  assert.equal(minutesDans(t, PARIS), 23 * 60 + 30);
  assert.equal(jourDans(t, NY), "2027-03-25");
  assert.equal(minutesDans(t, NY), 18 * 60 + 30);
  assert.equal(instantDans("2027-03-25", 23 * 60 + 30, PARIS), t);
  // au-delà de minuit : le lendemain
  assert.equal(instantDans("2027-03-25", 24 * 60 + 45, PARIS), Date.UTC(2027, 2, 25, 23, 45));
  assert.equal(hhmm(1485), "00:45");
  assert.equal(hhmm(-15), "23:45");
  assert.equal(duree(20), "20 min");
  assert.equal(duree(-60), "1 h");
  assert.equal(duree(90), "1 h 30");
  assert.equal(heurePile(120), "2 h");
  en();
  assert.equal(heurePile(120), "2:00 AM");
});

test("changement d'heure : lu dans le fuseau, sans table (Paris et New York, été et hiver)", () => {
  const ete = prochainChangement(a("2027-03-25", 0), PARIS)!;
  assert.equal(ete.instant, Date.UTC(2027, 2, 28, 1));
  assert.deepEqual([ete.avant, ete.apres, ete.delta, ete.ete, ete.jour, ete.heureAvant, ete.heureApres], [60, 120, 60, true, "2027-03-28", 120, 180]);
  const hiver = prochainChangement(a("2027-10-28", 0), PARIS)!;
  assert.equal(hiver.instant, Date.UTC(2027, 9, 31, 1));
  assert.deepEqual([hiver.delta, hiver.ete, hiver.jour, hiver.heureAvant, hiver.heureApres], [-60, false, "2027-10-31", 180, 120]);
  // New York : deuxième dimanche de mars, premier de novembre
  const ny = prochainChangement(a("2027-03-01", 0, 0, NY), NY)!;
  assert.deepEqual([ny.jour, ny.instant, ny.heureAvant, ny.heureApres], ["2027-03-14", Date.UTC(2027, 2, 14, 7), 120, 180]);
  assert.equal(prochainChangement(a("2027-10-15", 0, 0, NY), NY)!.jour, "2027-11-07");
  // Tokyo ne change pas d'heure
  assert.equal(prochainChangement(Date.UTC(2027, 0, 1), "Asia/Tokyo", 400), null);
});

test("changement d'heure : le bandeau du jeudi au dimanche, pas avant ni après", () => {
  assert.equal(changementProche(a("2027-03-24", 12), PARIS), null);
  assert.equal(changementProche(a("2027-03-25", 8, 10), PARIS)?.jour, "2027-03-28");
  assert.equal(changementProche(a("2027-03-28", 0, 30), PARIS)?.jour, "2027-03-28");
  assert.equal(changementProche(a("2027-03-28", 22), PARIS)?.jour, "2027-03-28");
  assert.equal(changementProche(a("2027-03-29", 8), PARIS), null);
});

test("plan du changement d'heure : 20 min par soir (été), jeudi et vendredi (hiver), lever du lendemain", () => {
  const ete = planChangement(prochainChangement(a("2027-03-25", 0), PARIS)!, RYTHME);
  assert.deepEqual(ete.map((l) => l.jour), ["2027-03-25", "2027-03-26", "2027-03-27", "2027-03-28"]);
  assert.deepEqual(ete.map((l) => l.decalage), [-20, -40, -60, 0]);
  // planche c2 : 23:25, 23:05, 22:45, 23:45 ; lever ven. 06:40, sam. 06:20, dim. 07:00 (heure d'été), lun. 07:00
  assert.deepEqual(ete.map((l) => hhmm(l.coucher!)), ["23:25", "23:05", "22:45", "23:45"]);
  assert.deepEqual(ete.map((l) => hhmm(l.lever!)), ["06:40", "06:20", "07:00", "07:00"]);
  assert.deepEqual(ete.map((l) => [l.nouvelle, l.fin]), [[false, false], [false, false], [true, false], [false, true]]);
  const hiver = planChangement(prochainChangement(a("2027-10-28", 0), PARIS)!, RYTHME);
  assert.deepEqual(hiver.map((l) => l.decalage), [20, 40, 40, 0]);
  assert.deepEqual(hiver.map((l) => hhmm(l.coucher!)), ["00:05", "00:25", "00:25", "23:45"]);
  assert.equal(hhmm(hiver[2]!.lever!), "06:40");
  // sans rythme connu : le décalage seul
  assert.deepEqual(planChangement(prochainChangement(a("2027-03-25", 0), PARIS)!, null).map((l) => [l.decalage, l.coucher]), [[-20, null], [-40, null], [-60, null], [0, null]]);
});

test("rythme habituel : moyenne des 7 dernières nuits aux 5 min, rien sous 3 nuits", () => {
  const n = (jour: number, coucher: number, lever: number): NuitStat => ({ jour, sommeilMin: 420, auLitMin: 450, phases: null, coucher, lever, perf: null });
  assert.equal(rythmeHabituel([n(1, -20, 410), n(2, -10, 425)]), null);
  assert.deepEqual(rythmeHabituel([n(1, -20, 410), n(2, -10, 425), n(3, 5, 430)]), { coucher: 1430, lever: 420 });
});

test("bandeau du changement d'heure : les textes de la planche (c1, c5a), puis le soir du plan", () => {
  fr();
  const base = { fuseau: PARIS, appareil: PARIS, rythme: RYTHME, voyage: null };
  const jeudi = bandeauDuJour({ ...base, maintenant: a("2027-03-25", 8, 10) })!;
  assert.deepEqual([jeudi.genre, jeudi.titre, jeudi.sous, jeudi.route], ["ete", "Dimanche, heure d'été", "À 2 h, il sera 3 h. Avance ton coucher de 20 min dès ce soir.", "/sante/heure"]);
  const hiver = bandeauDuJour({ ...base, maintenant: a("2027-10-28", 8) })!;
  assert.deepEqual([hiver.titre, hiver.sous], ["Dimanche, heure d'hiver", "À 3 h, il sera 2 h. Recule ton coucher de 20 min jeudi et vendredi."]);
  assert.equal(bandeauDuJour({ ...base, maintenant: a("2027-03-26", 8) })!.sous, "À 2 h, il sera 3 h. Ce soir, couche-toi vers 23:05 : 40 min plus tôt.");
  const dimanche = bandeauDuJour({ ...base, maintenant: a("2027-03-28", 9) })!;
  assert.deepEqual([dimanche.titre, dimanche.sous], ["Heure d'été depuis cette nuit", "Cette nuit, à 2 h, il était 3 h. Ce soir, reprends ton heure."]);
  assert.equal(bandeauDuJour({ ...base, maintenant: a("2027-03-24", 9) }), null);
  en();
  const e = bandeauDuJour({ ...base, maintenant: a("2027-03-25", 8, 10) })!;
  assert.deepEqual([e.titre, e.sous], ["Sunday, summer time", "At 2:00 AM, it will be 3:00 AM. Go to bed 20 min earlier from tonight."]);
});

// Le voyage de la planche (c3) : Paris → New York, jeu. 12 → dim. 22 nov., préparé 2 jours avant.
const NEW_YORK: Voyage = { origine: PARIS, destination: NY, aller: "2026-11-12", retour: "2026-11-22", preparer: true, auto: false };

test("voyage : décalage, 2 jours de préparation, puis 1 h 30 par jour sur place (ouest)", () => {
  assert.equal(decalageVoyage(NEW_YORK, Date.UTC(2026, 10, 12, 12)), -360);
  const p = planVoyage(NEW_YORK, RYTHME_VOYAGE);
  assert.deepEqual([p.decalage, p.ouest, p.sousSeuil, p.court, p.prepa], [-360, true, false, false, 120]);
  assert.deepEqual(p.lignes.map((l) => [l.jour, l.lieu]), [["2026-11-10", "chez"], ["2026-11-11", "chez"], ["2026-11-12", "vol"], ["2026-11-13", "lieu"], ["2026-11-14", "lieu"]]);
  // mar. 10 de la frise : sommeil 24,75 → 32,5 ; lumière 18 → 22 ; peu de lumière 32,5 → 34,5 ; repas 13, 21, 33
  const mar = p.lignes[0]!;
  assert.deepEqual([mar.coucher / 60, mar.lever / 60, mar.lumiere!.map((m) => m / 60), mar.eviter!.map((m) => m / 60), mar.repas.map((m) => m / 60)], [24.75, 32.5, [18, 22], [32.5, 34.5], [13, 21, 33]]);
  assert.equal(p.lignes[1]!.coucher / 60, 25.75);
  // sur place : il reste 4 h à rattraper, 1 h 30 par nuit (CDC) : 2 h 30, 1 h, puis rien
  assert.deepEqual(p.lignes.slice(2).map((l) => [l.fuseau, hhmm(l.coucher), l.reste]), [[NY, "21:15", 150], [NY, "22:45", 60], [NY, "23:45", 0]]);
  assert.equal(p.lignes[4]!.lumiere, null);
  assert.deepEqual(p.lignes[2]!.repas.length, 2);
});

test("voyage : vers l'est, ½ h par jour pour les couche-tard, pas de lumière tôt au-delà de 8 h", () => {
  const tokyo: Voyage = { origine: PARIS, destination: "Asia/Tokyo", aller: "2026-11-12", retour: "2026-11-30", preparer: true, auto: false };
  const p = planVoyage(tokyo, RYTHME_VOYAGE);
  assert.deepEqual([p.decalage, p.ouest], [480, false]);
  assert.deepEqual(p.lignes.slice(0, 2).map((l) => hhmm(l.coucher)), ["22:45", "21:45"]);
  assert.equal(planVoyage(tokyo, { coucher: 24 * 60 + 30, lever: 8 * 60 }).prepa, 60);
  // 8 h tout juste : la lumière du matin, dès le lever
  assert.deepEqual(p.lignes[2]!.lumiere, [p.lignes[2]!.lever, p.lignes[2]!.lever + 240]);
  const sydney = planVoyage({ ...tokyo, destination: "Australia/Sydney" }, RYTHME_VOYAGE);
  assert.equal(sydney.decalage, 600);
  const l = sydney.lignes[2]!;
  assert.deepEqual([l.eviter, l.lumiere], [[l.lever, l.lever + 180], [l.lever + 180, l.lever + 420]]);
  assert.deepEqual(sydney.lignes[4]!.lumiere, [sydney.lignes[4]!.lever, sydney.lignes[4]!.lever + 240]);
});

test("voyage : sous 3 h, court séjour, sans préparer", () => {
  assert.equal(planVoyage({ ...NEW_YORK, destination: "Europe/London" }, RYTHME_VOYAGE).sousSeuil, true);
  const court = planVoyage({ ...NEW_YORK, retour: "2026-11-14" }, RYTHME_VOYAGE);
  assert.deepEqual([court.court, court.lignes.length], [true, 0]);
  const sans = planVoyage({ ...NEW_YORK, preparer: false }, RYTHME_VOYAGE);
  assert.equal(sans.lignes[0]!.lieu, "vol");
  assert.equal(hhmm(sans.lignes[0]!.coucher), "19:15");
});

test("bandeau du voyage : préparation, jour du départ, arrivée vue au fuseau du téléphone (c5b, c5c)", () => {
  fr();
  const base = { fuseau: PARIS, appareil: PARIS, rythme: RYTHME_VOYAGE, voyage: NEW_YORK };
  assert.equal(bandeauDuJour({ ...base, maintenant: a("2026-11-09", 21) }), null);
  const mardi = bandeauDuJour({ ...base, maintenant: a("2026-11-10", 21, 30) })!;
  assert.deepEqual([mardi.genre, mardi.titre, mardi.sous, mardi.route], ["voyage", "Jeudi, New York, 6 h de moins", "Ce soir, couche-toi vers 0:45 : 1 h plus tard.", "/sante/voyage"]);
  const vendredi = { ...base, fuseau: NY, appareil: NY, maintenant: a("2026-11-13", 20, 0, NY) };
  const arrivee = bandeauDuJour(vendredi)!;
  assert.deepEqual([arrivee.genre, arrivee.titre, arrivee.sous], ["arrivee", "Tu es à l'heure de New York", "Ton plan continue : ce soir, couche-toi vers 22:45."]);
  // téléphone resté à l'heure de Paris le jour du départ
  const jeudi = bandeauDuJour({ ...base, maintenant: a("2026-11-12", 9) })!;
  assert.deepEqual([jeudi.titre, jeudi.sous], ["Aujourd'hui, New York, 6 h de moins", "Ce soir, à l'heure de New York, couche-toi vers 21:15."]);
  // plan fini : plus rien
  assert.equal(bandeauDuJour({ ...vendredi, maintenant: a("2026-11-16", 9, 0, NY) }), null);
  const court = bandeauDuJour({ ...base, voyage: { ...NEW_YORK, retour: "2026-11-14" }, maintenant: a("2026-11-11", 9) })!;
  assert.equal(court.sous, "Moins de 3 jours : garde ton heure de chez toi.");
  assert.equal(momentVoyage(NEW_YORK, planVoyage(NEW_YORK, RYTHME_VOYAGE), a("2026-11-23", 9)), "fini");
});

test("arrivée détectée : voyage créé au changement de fuseau, retiré au retour, chez soi après 30 jours", () => {
  const t = a("2026-11-13", 12);
  assert.deepEqual(surFuseauAppareil({ maison: null, voyage: null }, PARIS, t), { maison: PARIS, voyage: null });
  const arrive = surFuseauAppareil({ maison: PARIS, voyage: null }, NY, t);
  assert.deepEqual(arrive.voyage, { destination: NY, origine: PARIS, aller: "2026-11-13", retour: null, preparer: false, auto: true });
  // Londres : 1 h, pas de voyage
  assert.equal(surFuseauAppareil({ maison: PARIS, voyage: null }, "Europe/London", t).voyage, null);
  // le voyage saisi à la main est gardé à l'arrivée
  assert.equal(surFuseauAppareil({ maison: PARIS, voyage: NEW_YORK }, NY, t).voyage, NEW_YORK);
  // de retour à la maison
  assert.equal(surFuseauAppareil(arrive, PARIS, a("2026-11-20", 12)).voyage, null);
  // installé
  assert.deepEqual(surFuseauAppareil(arrive, NY, a("2026-12-20", 12)), { maison: NY, voyage: null });
  // voyage saisi fini (retour passé)
  assert.equal(surFuseauAppareil({ maison: PARIS, voyage: NEW_YORK }, PARIS, a("2026-11-24", 12)).voyage, null);
});

test("séances en voyage (D14) : l'heure du lieu par défaut, celle de chez soi au choix", () => {
  const t = a("2026-11-14", 9, 0, NY);
  assert.equal(enVoyage(NEW_YORK, t), true);
  assert.equal(enVoyage(NEW_YORK, a("2026-11-10", 9)), false);
  assert.equal(fuseauDesSeances("lieu", NEW_YORK, PARIS, NY, t), NY);
  assert.equal(fuseauDesSeances("maison", NEW_YORK, PARIS, NY, t), PARIS);
  assert.equal(fuseauDesSeances("maison", null, PARIS, NY, t), NY);
});

test("rappel de coucher (D15) : 30 min avant, suit le plan, sinon l'heure habituelle", () => {
  fr();
  const c = prochainChangement(a("2027-03-25", 0), PARIS);
  const e = { maintenant: a("2027-03-25", 8, 10), fuseau: PARIS, rythme: RYTHME, changement: c, voyage: null, avant: 30, suivrePlan: true };
  const s = soirsRappel(e);
  assert.equal(s.length, 7);
  assert.deepEqual([s[0]!.id, s[0]!.instant], ["coucher-2027-03-25", a("2027-03-25", 22, 55)]);
  assert.equal(titreRappel(30), "Coucher dans 30 min");
  assert.equal(corpsRappel(s[0]!), "Ce soir 23:25, 20 min plus tôt : heure d'été dimanche.");
  assert.equal(corpsRappel(s[3]!), "Ce soir 23:45, ton heure habituelle.");
  assert.deepEqual(soirsRappel({ ...e, suivrePlan: false }).map((x) => x.source), Array(7).fill("habituel"));
  // ce soir passé : on commence demain
  assert.equal(soirsRappel({ ...e, maintenant: a("2027-03-25", 23) })[0]!.jour, "2027-03-26");
  assert.deepEqual(soirsRappel({ ...e, rythme: null }), []);
  // en voyage : l'heure du lieu, le plan du voyage
  const v = soirsRappel({ ...e, changement: null, voyage: NEW_YORK, fuseau: NY, maintenant: a("2026-11-13", 9, 0, NY), rythme: RYTHME_VOYAGE });
  assert.deepEqual([v[0]!.fuseau, hhmm(v[0]!.coucher), v[0]!.source], [NY, "22:45", "voyage"]);
  assert.equal(corpsRappel(v[0]!), "Ce soir 22:45, 1 h plus tôt : ton plan de voyage.");
  assert.equal(v[0]!.instant, a("2026-11-13", 22, 15, NY));
});
