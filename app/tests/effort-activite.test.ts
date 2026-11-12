// L'activité de la journée hors séances (31/10 : « 20 000 pas ou 2 000 pas, ce n'est pas le même niveau
// d'effort » ; docs/EFFORT-ACTIVITE.md) : les repères chiffrés des pas, la cadence heure par heure, la FC de la journée
// prioritaire sur les pas, jamais de double compte avec une séance, la journée, la cible, la semaine, le recalcul quand les
// pas arrivent tard, la règle de synchro et la comparaison des journées du labo.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { rpeDeRir } from "../src/boutique/poids.ts";
import {
  bornesTranches, CHARGE_ACTIVITE, chargeActivite, chargePasTotal, chargePasTranches, coefCadence, minutesHors, pasHorsSeancesTotal,
  tranchesHorsSeances, zonesHorsSeances,
} from "../src/ecrans/effort-activite.ts";
import { activiteJour, assurerActiviteJour, isoJour, pasSeancesIndisponibles, recalculerActivite, type DepsActivite } from "../src/ecrans/effort-activite-donnees.ts";
import { correlation, effortsSeancesJour, lireComparaisonJours } from "../src/ecrans/effort-charges.ts";
import { cibleEffort, scoreEffort } from "../src/ecrans/effort-pepfit.ts";
import { lireEffortJour, lireHistoriqueEffort, lireSemaineEffort } from "../src/ecrans/sport-stats-donnees.ts";
import { garderActiviteMieuxMesuree, tableSync } from "../src/sync/schema.ts";
import { aleatoire, pret } from "../src/sync/chiffrement.ts";
import { synchroniser, type Changement, type Lot, type Transport } from "../src/sync/moteur.ts";

const MIN = 60_000;
const H = 60 * MIN;
const arrondi = (x: number) => Math.round(x * 10) / 10;
const proche = (x: number, y: number, eps = 1e-6) => assert.ok(Math.abs(x - y) <= eps, `${x} ≈ ${y}`);
const MAINTENANT = new Date(2026, 9, 30, 19, 10).getTime();
const jour = (n: number) => new Date(2026, 9, 30 + n).getTime();
const a = (h: number, m: number, n = 0) => jour(n) + (h * 60 + m) * MIN;

// ---------------------------------------------------------------- les repères (module pur)

test("les repères des pas : 2 000, 5 000, 10 000 et 20 000 pas au total, face à une séance sérieuse", () => {
  const s = (pas: number) => scoreEffort(chargePasTotal(pas));
  proche(chargePasTotal(10_000), 48);
  proche(chargePasTotal(20_000), 96);
  assert.equal(arrondi(s(2_000)), 0.3, "2 000 pas : presque rien");
  assert.equal(arrondi(s(5_000)), 1, "une journée très calme (moins de 5 000 pas, sédentaire pour Tudor-Locke) ≈ 1");
  assert.equal(arrondi(s(10_000)), 2.1, "10 000 pas ≈ 2 à 2,5");
  assert.equal(arrondi(s(20_000)), 3.8, "20 000 pas ≈ 3,5 à 4");
  assert.ok(s(10_000) >= 2 && s(10_000) <= 2.5);
  assert.ok(s(20_000) >= 3.5 && s(20_000) <= 4);
  // une séance sérieuse (165 points, le repère du tiroir) reste bien au-dessus de 20 000 pas
  assert.ok(scoreEffort(165) > 5.5 && scoreEffort(165) > s(20_000) + 1.5);
});

test("la cadence : des pas épars comptent comme au total ; une heure de marche soutenue vaut une heure en zone 1", () => {
  assert.equal(coefCadence(0), 1);
  assert.equal(coefCadence(60), 1);
  assert.equal(coefCadence(80), 1.5);
  assert.equal(coefCadence(100), 2);
  assert.equal(coefCadence(160), 3.5);
  assert.equal(coefCadence(200), 3.5);
  // 10 000 pas répartis sur 14 heures (714 par heure, 12 pas/min) : la même charge qu'au total
  const epars = Array.from({ length: 14 }, () => ({ minutes: 60, pas: 10_000 / 14 }));
  proche(chargePasTranches(epars), chargePasTotal(10_000));
  // une heure à 100 pas/min : 6 000 pas × 0,0048 × 2 = 57,6 points, environ 1 point par minute (Edwards, zone 1)
  proche(chargePasTranches([{ minutes: 60, pas: 6_000 }]), 57.6);
  // la même journée de 20 000 pas, avec deux heures de marche soutenue : plus chargée que des pas épars
  const marche = [{ minutes: 60, pas: 6_000 }, { minutes: 60, pas: 6_000 }, ...Array.from({ length: 8 }, () => ({ minutes: 60, pas: 1_000 }))];
  assert.ok(chargePasTranches(marche) > chargePasTotal(20_000));
});

test("pas hors séances au total : les pas mesurés d'une séance retirés ; sans les pas d'une séance, inconnu (jamais un prorata)", () => {
  assert.equal(pasHorsSeancesTotal(15_000, [{ pas: 7_000 }]), 8_000);
  assert.equal(pasHorsSeancesTotal(9_429, []), 9_429, "un jour sans séance : tous les pas");
  // le cas d'Alex (08/11) : padel de 98 min sans pas mesurés, 9 429 pas du jour : plus de « 8 467 »
  assert.equal(pasHorsSeancesTotal(9_429, [{ pas: null }]), null);
  assert.equal(pasHorsSeancesTotal(16_000, [{ pas: 3_000 }, { pas: null }]), null, "une seule séance sans pas suffit");
  assert.equal(pasHorsSeancesTotal(1_000, [{ pas: 7_000 }]), 0, "jamais négatif");
});

test("sans pas hors séances connus, pas d'activité : ni charge ni prorata", () => {
  assert.equal(chargeActivite({ fc: null, minutesHors: 800, tranches: null, pasTotal: null }), null);
});

test("tranches : les bornes des séances coupent les heures, et les tranches de la séance sont retirées", () => {
  const heures = Array.from({ length: 25 }, (_, h) => jour(0) + h * H);
  const seance = { debut: a(18, 10), fin: a(19, 0) };
  const bornes = bornesTranches(heures, [seance]);
  assert.ok(bornes.includes(seance.debut));
  assert.equal(bornes.length, 26, "24 heures + le début de la séance (sa fin tombe sur une heure)");
  const pas = bornes.slice(1).map((b, i) => ((b - bornes[i]!) / MIN) * (bornes[i] === seance.debut ? 160 : 10));
  const t = tranchesHorsSeances({ bornes, pas }, [seance])!;
  assert.equal(t.length, 24, "25 tranches, moins celle de la séance");
  proche(t.reduce((x, y) => x + y.pas, 0), 24 * 60 * 10 - 50 * 10);
  assert.equal(tranchesHorsSeances({ bornes, pas: pas.map(() => null) }, [seance]), null, "aucune donnée");
});

test("FC hors séances : au-dessus de la zone 1 seulement, au barème des séances ; les échantillons de la séance retirés", () => {
  // FC max 190 en tranches : Z1 95, Z2 114, Z3 133, Z4 152, Z5 171. Un échantillon toutes les 5 min, de 0 h à 20 h.
  const fc: { t: number; bpm: number }[] = [];
  for (let t = jour(0); t < a(20, 0); t += 5 * MIN) {
    const h = (t - jour(0)) / H;
    fc.push({ t, bpm: h >= 9 && h < 9.5 ? 120 : h >= 18 && h < 19 ? 160 : h >= 12 && h < 14 ? 100 : 60 });
  }
  const seance = { debut: a(18, 0), fin: a(19, 0) };
  const z = zonesHorsSeances(fc, { debut: jour(0), fin: a(20, 0) }, [seance], 190);
  proche(z.zones[0]!, 120, 1e-9);
  proche(z.zones[1]!, 30, 1e-9);
  assert.equal(z.zones[3], 0, "la séance (Z4) n'est pas comptée");
  proche(z.couvertes, 19 * 60, 1e-9);
  proche(minutesHors(jour(0), a(20, 0), [seance]), 19 * 60);
  // 120 min en zone 1 ne comptent pas, 30 min en zone 2 font 60 points
  const c = chargeActivite({ fc: z, minutesHors: 19 * 60, tranches: null, pasTotal: 12_000 })!;
  assert.deepEqual([c.methode, c.charge, c.pas, c.rang], ["fc", 60, 12_000, 2]);
});

test("la FC de la journée passe avant les pas ; trop clairsemée, ce sont les pas", () => {
  const fc = { zones: [200, 10, 0, 0, 0], couvertes: 900 };
  const pas = { tranches: [{ minutes: 60, pas: 10_000 }], pasTotal: null };
  assert.equal(chargeActivite({ fc, minutesHors: 1_200, ...pas })!.methode, "fc", "900 min sur 1 200 : 75 %, la FC");
  const pauvre = chargeActivite({ fc: { ...fc, couvertes: 300 }, minutesHors: 1_200, ...pas })!;
  assert.deepEqual([pauvre.methode, pauvre.heures, pauvre.rang], ["pas", true, 1]);
  assert.equal(chargeActivite({ fc: null, minutesHors: 1_200, tranches: null, pasTotal: 8_000 })!.rang, 0);
  assert.equal(chargeActivite({ fc: null, minutesHors: 1_200, tranches: null, pasTotal: null }), null, "rien mesuré : rien");
  assert.equal(CHARGE_ACTIVITE.couvertureFc, 0.6);
});

test("cible d'un repos prévu : l'habitude des jours sans séance (tes pas), au moins 1", () => {
  const j = jour(0);
  const charges = new Map<number, number>();
  const repos = new Map<number, number>();
  for (let i = 1; i <= 28; i++) (i % 2 ? charges : repos).set(jour(-i), i % 2 ? 250 : 60);
  const base = { jour: j, charges, premier: jour(-40), forme: 1, age: 40, blessure: false, futur: false };
  const c = cibleEffort({ ...base, repos: true, chargesRepos: repos })!;
  assert.equal(c.base, "repos");
  assert.equal(c.bas, 0);
  assert.equal(c.haut, Math.round(scoreEffort(1.15 * 60) * 2) / 2, "une journée de 12 500 pas reste dans la cible");
  assert.ok(c.haut > 1);
  assert.equal(cibleEffort({ ...base, repos: true })!.haut, 1, "sans activité connue : 0 à 1");
});

test("règle de synchro : une journée mesurée plus finement n'est jamais remplacée par plus grossier", () => {
  assert.equal(garderActiviteMieuxMesuree({ rang: 2 }, { rang: 1 }), true);
  assert.equal(garderActiviteMieuxMesuree({ rang: 1 }, { rang: 1 }), false, "égalité : la plus récente gagne");
  assert.equal(garderActiviteMieuxMesuree({ rang: 0 }, { rang: 2 }), false);
});

// ---------------------------------------------------------------- en base

/** Des pas par minute sur des plages ; lecture « Santé Connect » : la somme de chaque tranche, null hors des plages portées. */
function fauxPas(plages: { debut: number; fin: number; ppm: number }[], porte: { debut: number; fin: number } = { debut: jour(-60), fin: MAINTENANT }) {
  const lus: number[][] = [];
  const pasSante = async (bornes: number[]) => {
    lus.push(bornes);
    return bornes.slice(1).map((fin, i) => {
      const debut = bornes[i]!;
      if (fin <= porte.debut || debut >= porte.fin) return null;
      return Math.round(plages.reduce((t, p) => t + (Math.max(0, Math.min(fin, p.fin) - Math.max(debut, p.debut)) / MIN) * p.ppm, 0));
    });
  };
  return { pasSante, lus };
}

async function base() {
  const { db, raw } = await baseDeTest();
  await ecrireReglage(db, "fc_max_mode", "saisie");
  await ecrireReglage(db, "fc_max", "190");
  await ecrireReglage(db, "zones_methode", "fcmax");
  return { db, raw };
}

test("une journée sans séance, avec des pas seulement, donne de l'Effort : 2 000, 10 000, 20 000 pas", async () => {
  const { db } = await base();
  // trois jours passés, des pas répartis de 8 h à 20 h (12 h) : 2 000, 10 000, 20 000 pas
  const plages = [
    { debut: a(8, 0, -3), fin: a(20, 0, -3), ppm: 2_000 / 720 },
    { debut: a(8, 0, -2), fin: a(20, 0, -2), ppm: 10_000 / 720 },
    { debut: a(8, 0, -1), fin: a(20, 0, -1), ppm: 20_000 / 720 },
  ];
  const { pasSante } = fauxPas(plages);
  const r = await recalculerActivite(db, { pasSante, maintenant: MAINTENANT }, 5);
  assert.equal(r.calculees, 3);
  const scores = [];
  for (const n of [-3, -2, -1]) {
    const e = (await lireEffortJour(db, jour(n)))!;
    assert.equal(e.seances, 0);
    assert.deepEqual([e.activite!.methode, e.activite!.heures, e.activite!.sourcePas], ["pas", true, "sante"]);
    scores.push(arrondi(e.score));
  }
  // 20 000 pas sur 12 h : 28 pas/min, cadence plate : le total
  assert.deepEqual(scores, [0.3, 2.1, 3.8]);
  assert.equal(await lireEffortJour(db, jour(-5)), null, "un jour sans rien de mesuré");
});

test("une séance avec ses pas : jamais de double compte (les tranches de la séance sont retirées)", async () => {
  const { db, raw } = await base();
  // footing de 18 h 00 à 18 h 45 hier, à 160 pas/min (7 200 pas), FC du capteur à 145 (Z3) ; 10 000 pas ailleurs
  raw.prepare("INSERT INTO seances (id, titre, debut, fin, maj_le, activite_id) VALUES ('foot', 'Footing', ?, ?, 0, 'cat:course')").run(a(18, 0, -1), a(18, 45, -1));
  const fc = raw.prepare("INSERT INTO seance_fc (seance_id, t, s, bpm) VALUES (?,?,?,?)");
  for (let k = 0; k < 45 * 60; k += 5) fc.run("foot", a(18, 0, -1) + k * 1000, k * 1000, 145);
  const { pasSante, lus } = fauxPas([
    { debut: a(8, 0, -1), fin: a(18, 0, -1), ppm: 10_000 / 600 },
    { debut: a(18, 0, -1), fin: a(18, 45, -1), ppm: 160 },
  ]);
  await recalculerActivite(db, { pasSante, maintenant: MAINTENANT }, 2);
  assert.ok(lus.some((b) => b.includes(a(18, 0, -1)) && b.includes(a(18, 45, -1))), "les bornes de la séance sont lues");
  const act = (await activiteJour(db, jour(-1)))!;
  assert.equal(act.pas, 10_000, "les 7 200 pas du footing n'y sont pas");
  proche(act.charge, 48, 0.01);
  const foot = (await effortsSeancesJour(db, jour(-1))).get("foot")!;
  const j = (await lireEffortJour(db, jour(-1)))!;
  assert.equal(j.seances, 1);
  proche(j.charge, foot.charge + act.charge, 1e-9);
  assert.equal(j.score, scoreEffort(foot.charge + act.charge), "les charges s'ajoutent, pas les scores");
  assert.ok(j.score < foot.score + act.score);
});

test("la FC de la journée est prioritaire sur les pas, et la FC de la séance n'y est pas", async () => {
  const { db, raw } = await base();
  raw.prepare("INSERT INTO seances (id, titre, debut, fin, maj_le, activite_id) VALUES ('foot', 'Footing', ?, ?, 0, 'cat:course')").run(a(18, 0, -1), a(19, 0, -1));
  // Santé Connect : un échantillon par minute toute la journée ; 40 min en Z2 (120) le matin, la séance en Z4 (160)
  const fcSante = async (d: number, f: number) => {
    const l: { t: number; bpm: number }[] = [];
    for (let t = d; t < f; t += MIN) l.push({ t, bpm: t >= a(9, 0, -1) && t < a(9, 40, -1) ? 120 : t >= a(18, 0, -1) && t < a(19, 0, -1) ? 160 : 70 });
    return l;
  };
  const { pasSante } = fauxPas([{ debut: a(8, 0, -1), fin: a(20, 0, -1), ppm: 15_000 / 720 }]);
  await recalculerActivite(db, { pasSante, fcSante, maintenant: MAINTENANT }, 2);
  const act = (await activiteJour(db, jour(-1)))!;
  assert.deepEqual([act.methode, act.sourceFc, act.charge], ["fc", "sante", 80], "40 min en zone 2 : 80 points ; la séance en Z4 n'y est pas");
  assert.equal(act.pas, 13_750, "les pas hors séance restent connus (affichés), sans compter");
});

test("Whoop au total : ses pas du jour moins ceux de la séance (mesurés) ; sans eux, pas d'activité (cas d'Alex, 08/11)", async () => {
  const { db, raw } = await base();
  await ecrireReglage(db, "whoop_pas_actif", "1");
  raw.prepare("INSERT INTO whoop_jour (jour, pas, strain, maj_le) VALUES (?, ?, ?, ?)").run(jour(-1), 9_429, 12, MAINTENANT);
  raw.prepare("INSERT INTO seances (id, titre, debut, fin, maj_le, activite_id) VALUES ('padel', 'Padel', ?, ?, 0, 'cat:padel')").run(a(8, 0, -1), a(9, 38, -1));
  // Santé Connect a aussi des pas : la règle commune (pas-source.ts) prend Whoop
  const { pasSante } = fauxPas([{ debut: a(8, 0, -1), fin: a(20, 0, -1), ppm: 5 }]);
  // une ancienne ligne (version 2) avait compté 9 429 - 962 = 8 467 pas hors séances
  raw.prepare(
    `INSERT INTO jour_activite (jour, charge, methode, pas, heures, zones, source_pas, source_fc, rang, version, empreinte, maj_le)
     VALUES (?, 40.6, 'pas', 8467, 0, NULL, 'whoop', NULL, 0, 2, 'ancienne', 0)`,
  ).run(isoJour(jour(-1)));
  await recalculerActivite(db, { pasSante, maintenant: MAINTENANT }, 2);
  assert.equal(await activiteJour(db, jour(-1)), null, "padel de 98 min sans pas mesurés : pas d'activité, la ligne du prorata est retirée");
  assert.equal(await pasSeancesIndisponibles(db, jour(-1)), true);
  // le padel est connu de Whoop, sa fiche donne 6 396 pas (lue en fond ou à l'ouverture) : 9 429 - 6 396
  raw.prepare("INSERT INTO whoop_seance (id, debut, fin, sport_id, sport, seance_id, maj_le) VALUES ('wp', ?, ?, 0, 'Padel', 'padel', 0)").run(a(8, 0, -1), a(9, 38, -1));
  raw.prepare("INSERT INTO whoop_seance_detail (whoop_id, pas, fc, lu_le) VALUES ('wp', 6396, NULL, 0)").run();
  await recalculerActivite(db, { pasSante, maintenant: MAINTENANT + 10 * MIN }, 2);
  const act = (await activiteJour(db, jour(-1)))!;
  assert.deepEqual([act.sourcePas, act.heures, act.pas], ["whoop", false, 3_033]);
  proche(act.charge, 3_033 * 0.0048);
  assert.equal(await pasSeancesIndisponibles(db, jour(-1)), false);
});

test("Whoop au total, un jour sans séance : tous les pas comptent ; un jour mesuré plus tard n'est pas figé vide", async () => {
  const { db, raw } = await base();
  await ecrireReglage(db, "whoop_pas_actif", "1");
  raw.prepare("INSERT INTO whoop_jour (jour, pas, strain, maj_le) VALUES (?, ?, ?, ?)").run(jour(-3), 9_429, 12, MAINTENANT);
  await recalculerActivite(db, { maintenant: MAINTENANT }, 5);
  const act = (await activiteJour(db, jour(-3)))!;
  assert.deepEqual([act.pas, act.sourcePas], [9_429, "whoop"]);
  assert.equal(await pasSeancesIndisponibles(db, jour(-3)), false);
  // un jour ancien avec séance sans pas : vide, puis relu dès que les pas de la séance arrivent (ils sont dans l'empreinte)
  raw.prepare("INSERT INTO whoop_jour (jour, pas, strain, maj_le) VALUES (?, ?, ?, ?)").run(jour(-4), 9_429, 12, MAINTENANT);
  raw.prepare("INSERT INTO seances (id, titre, debut, fin, maj_le, activite_id) VALUES ('p4', 'Padel', ?, ?, 0, 'cat:padel')").run(a(8, 0, -4), a(9, 38, -4));
  raw.prepare("INSERT INTO whoop_seance (id, debut, fin, sport_id, sport, seance_id, maj_le) VALUES ('w4', ?, ?, 0, 'Padel', 'p4', 0)").run(a(8, 0, -4), a(9, 38, -4));
  await recalculerActivite(db, { maintenant: MAINTENANT }, 6);
  assert.equal(await activiteJour(db, jour(-4)), null);
  raw.prepare("INSERT INTO whoop_seance_detail (whoop_id, pas, fc, lu_le) VALUES ('w4', 6000, NULL, 0)").run();
  await recalculerActivite(db, { maintenant: MAINTENANT + 3 * H }, 6);
  assert.equal((await activiteJour(db, jour(-4)))!.pas, 3_429);
});

test("recalcul : hier, relu quand ses pas arrivent tard ; une journée ancienne, seulement quand ce qui a servi change", async () => {
  const { db, raw } = await base();
  const plages = [
    { debut: a(8, 0, -1), fin: a(12, 0, -1), ppm: 3_000 / 240 },
    { debut: a(8, 0, -5), fin: a(12, 0, -5), ppm: 4_000 / 240 },
  ];
  const tot = fauxPas(plages, { debut: 0, fin: a(12, 0, -1) });
  await recalculerActivite(db, { pasSante: tot.pasSante, maintenant: MAINTENANT }, 7);
  assert.equal((await activiteJour(db, jour(-1)))!.pas, 3_000);
  // la montre synchronise l'après-midi d'hier ce matin : 9 000 pas de plus
  plages.push({ debut: a(14, 0, -1), fin: a(20, 0, -1), ppm: 9_000 / 360 });
  const tard = fauxPas(plages);
  const r = await recalculerActivite(db, { pasSante: tard.pasSante, maintenant: MAINTENANT + 30 * MIN }, 7);
  assert.equal((await activiteJour(db, jour(-1)))!.pas, 12_000, "hier est relu");
  assert.ok(tard.lus.every((b) => b[0]! >= jour(-1)), "les journées anciennes déjà mesurées ne sont pas relues");
  assert.ok(r.calculees >= 1);
  assert.equal((await activiteJour(db, jour(-5)))!.pas, 4_000);
  // une séance ajoutée à une journée ancienne : elle est relue, les pas de la séance retirés
  raw.prepare("INSERT INTO seances (id, titre, debut, fin, maj_le, activite_id) VALUES ('m', 'Marche', ?, ?, 0, 'cat:marche')").run(a(8, 0, -5), a(9, 0, -5));
  await recalculerActivite(db, { pasSante: tard.pasSante, maintenant: MAINTENANT + 40 * MIN }, 7);
  assert.equal((await activiteJour(db, jour(-5)))!.pas, 3_000);
  // les journées sans rien ne sont lues qu'une fois
  const n = tard.lus.length;
  await recalculerActivite(db, { pasSante: tard.pasSante, maintenant: MAINTENANT + 50 * MIN }, 7);
  assert.equal(tard.lus.filter((b) => b[0]! < jour(-1)).length, tard.lus.slice(0, n).filter((b) => b[0]! < jour(-1)).length);
});

test("la page : aujourd'hui calculé à l'arrivée ; une mesure plus grossière ne remplace pas une plus fine", async () => {
  const { db } = await base();
  const { pasSante } = fauxPas([{ debut: a(8, 0), fin: a(17, 0), ppm: 1_000 / 60 }]);
  const act = (await assurerActiviteJour(db, jour(0), { pasSante, maintenant: MAINTENANT }))!;
  assert.deepEqual([act.pas, act.heures], [9_000, true]);
  // un autre passage sans Santé Connect mais avec Whoop au total (rang 0) : la mesure heure par heure reste
  await ecrireReglage(db, "whoop_pas_actif", "1");
  const deps: DepsActivite = { maintenant: MAINTENANT + MIN };
  await db.runAsync("INSERT INTO whoop_jour (jour, pas, maj_le) VALUES (?, ?, ?)", [jour(0), 20_000, MAINTENANT]);
  const apres = (await assurerActiviteJour(db, jour(0), deps))!;
  assert.deepEqual([apres.pas, apres.heures], [9_000, true]);
});

test("la semaine et l'historique comptent l'activité", async () => {
  const { db, raw } = await base();
  // une séance par semaine depuis 6 semaines (Push A au ressenti « Bien », 52 min : 130 points), des pas tous les jours
  raw.prepare("INSERT INTO exercices (id, nom, cree_le, maj_le) VALUES ('dc', 'Développé couché', 0, 0)").run();
  const plages: { debut: number; fin: number; ppm: number }[] = [];
  for (let n = -42; n <= -1; n++) plages.push({ debut: a(8, 0, n), fin: a(20, 0, n), ppm: 10_000 / 720 });
  for (let n = -38; n <= -1; n += 7) {
    raw.prepare("INSERT INTO seances (id, titre, debut, fin, maj_le, activite_id) VALUES (?, 'Push A', ?, ?, 0, 'cat:musculation')").run(`p${n}`, a(6, 0, n), a(6, 52, n));
    raw.prepare("INSERT INTO series (id, seance_id, exercice_id, position, type, kg, reps, faite, rpe) VALUES (?,?,?,?,?,?,?,?,?)").run(`s${n}`, `p${n}`, "dc", 0, "normale", 70, 8, 1, rpeDeRir(2));
  }
  const { pasSante } = fauxPas(plages);
  await recalculerActivite(db, { pasSante, maintenant: MAINTENANT }, 45);
  const lundi = new Date(2026, 9, 26).getTime();
  const s = await lireSemaineEffort(db, lundi, MAINTENANT);
  // lundi 26 à jeudi 29 : 4 jours de 10 000 pas (48 points chacun), dont le mardi 27 avec sa séance
  const jeudi = s.jours[3]!;
  proche(jeudi.charge!, 48, 0.05);
  assert.equal(arrondi(jeudi.score), 2.1);
  const pushMardi = (await effortsSeancesJour(db, jour(-3))).get("p-3")!;
  proche(s.jours[1]!.charge!, pushMardi.charge + 48, 0.05);
  proche(s.charge, 4 * 48 + pushMardi.charge, 0.2);
  const h = await lireHistoriqueEffort(db, MAINTENANT);
  proche(h.semaines.at(-1)!.charge, s.charge, 0.01);
  assert.equal(h.jourMax!.nom, "Push A", "le jour le plus chargé garde le nom de sa séance");
});

test("labo : les journées entières (séances + activité) face à la valeur du jour de Whoop", async () => {
  const { db, raw } = await base();
  const plages = [-4, -3, -2, -1].map((n, i) => ({ debut: a(8, 0, n), fin: a(20, 0, n), ppm: ((i + 1) * 5_000) / 720 }));
  [-4, -3, -2, -1].forEach((n, i) => raw.prepare("INSERT INTO whoop_jour (jour, strain, pas, maj_le) VALUES (?, ?, ?, ?)").run(jour(n), 6 + 2 * i, (i + 1) * 5_000, MAINTENANT));
  const { pasSante } = fauxPas(plages);
  await recalculerActivite(db, { pasSante, maintenant: MAINTENANT }, 5);
  const l = await lireComparaisonJours(db, undefined, MAINTENANT);
  assert.equal(l.length, 4);
  assert.deepEqual(l.map((x) => x.pasWhoop), [20_000, 15_000, 10_000, 5_000]);
  l.forEach((x) => proche(x.pas!, x.pasWhoop!, 10));
  assert.ok(correlation(l.map((x) => [x.score, x.whoop]))! > 0.95);
});

// ---------------------------------------------------------------- la synchro

class FauxServeur {
  lignes = new Map<string, Changement & { seq: number }>();
  seq = 0;
  transport(): Transport {
    return {
      pousser: async (lot) => {
        for (const c of lot) this.lignes.set(`${c.tab}/${c.cle}`, { ...c, seq: ++this.seq });
      },
      tirer: async (curseur, limite): Promise<Lot> => {
        const depuis = curseur ? Number(curseur) : 0;
        const l = [...this.lignes.values()].filter((x) => x.seq > depuis).sort((a, b) => a.seq - b.seq);
        const p = l.slice(0, limite);
        return { changements: p.map(({ seq: _, ...c }) => c), curseur: p.length ? String(p.at(-1)!.seq) : curseur, encore: l.length > limite };
      },
      envoyerFichier: async () => {},
      lireFichier: async () => null,
      supprimerFichier: async () => {},
    };
  }
  ligne(jour: string): Record<string, unknown> | null {
    const l = this.lignes.get(`jour_activite/${jour}`);
    return l && !l.supprime ? (JSON.parse(l.charge!) as Record<string, unknown>) : null;
  }
}

test("deux téléphones : la journée mesurée heure par heure voyage ; celui qui n'a que le total ne l'écrase jamais", async () => {
  await pret();
  assert.equal(tableSync("jour_activite")!.garderLocale, garderActiviteMieuxMesuree);
  const cle = aleatoire(32);
  const serveur = new FauxServeur();
  const A = await base();
  const B = await base();
  const sync = (t: { db: typeof A.db }, noeud: string) => synchroniser({ db: t.db, transport: serveur.transport(), cle, noeud });
  // A : Santé Connect heure par heure, 10 000 pas hier
  const { pasSante } = fauxPas([{ debut: a(8, 0, -1), fin: a(18, 0, -1), ppm: 1_000 / 60 }]);
  await recalculerActivite(A.db, { pasSante, maintenant: MAINTENANT }, 2);
  await sync(A, "A");
  const surServeur = serveur.ligne("2026-10-29")!;
  assert.deepEqual([surServeur.rang, surServeur.pas, surServeur.methode], [1, 10_000, "pas"]);
  assert.equal(Object.keys(surServeur).some((k) => /score|strain/.test(k)), false, "jamais de score");
  // B : Whoop au total seulement (rang 0), 14 000 pas : il garde la ligne de A, ne la réécrit pas, n'envoie rien de plus
  await sync(B, "B");
  await ecrireReglage(B.db, "whoop_pas_actif", "1");
  B.raw.prepare("INSERT INTO whoop_jour (jour, pas, maj_le) VALUES (?, ?, ?)").run(jour(-1), 14_000, MAINTENANT);
  await recalculerActivite(B.db, { maintenant: MAINTENANT + MIN }, 2);
  assert.equal((await activiteJour(B.db, jour(-1)))!.pas, 10_000);
  await sync(B, "B");
  assert.equal(serveur.ligne("2026-10-29")!.pas, 10_000);
  // et la journée compte chez B dans l'Effort du jour
  proche((await lireEffortJour(B.db, jour(-1)))!.charge, 48, 0.01);
});

test("une journée tout en zone 1 donne quand même l'effort des pas (1 623 pas, 01/11)", () => {
  const fc = { zones: [900, 0, 0, 0, 0], couvertes: 900 };
  const c = chargeActivite({ fc, minutesHors: 1_000, tranches: null, pasTotal: 1_623 })!;
  assert.equal(c.methode, "pas");
  assert.equal(Math.round(c.charge * 10) / 10, Math.round(chargePasTotal(1_623) * 10) / 10);
  // dès que la FC donne quelque chose, elle prime
  const vive = chargeActivite({ fc: { zones: [0, 300, 0, 0, 0], couvertes: 900 }, minutesHors: 1_000, tranches: null, pasTotal: 1_623 })!;
  assert.equal(vive.methode, "fc");
});
