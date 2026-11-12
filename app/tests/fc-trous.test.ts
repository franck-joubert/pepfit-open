// FC coupée pendant un suivi (padel du 30/10 à 16 h 32, 1 h 25 : flux de la Whoop perdu entre 25 et 40 min puis sur la fin,
// écran éteint ; la courbe reliait les bords par de grandes lignes droites). Trous, complément par Whoop ou Santé Connect,
// courbe coupée, ligne qui le dit, zones et FC moyenne sur le seul temps mesuré, relecture de Whoop pour une séance récente.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest, jour } from "./aide.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { enregistrerSuivi } from "../src/db/depots/suivi-gps.ts";
import { lireSeance } from "../src/db/depots/seances.ts";
import { chargerEffort } from "../src/ecrans/effort-donnees.ts";
import { vueEffort } from "../src/ecrans/effort-vue.ts";
import {
  bilanCoupure, completerFc, etatCoupure, morceauxCourbe, serieCourbeFc, texteCoupure, trousFc, TROU_COURBE_S, type FcSourcee,
} from "../src/ecrans/fc-trous.ts";
import { ATTENTE_WHOOP_MS, doitRelireWhoop, sourcesSeance, type DepsSources } from "../src/ecrans/seance-sources.ts";
import { REGLAGE } from "../src/whoop/constantes.ts";
import { enregistrerSeances } from "../src/whoop/depot.ts";

const S = 1000;
const MIN = 60 * S;
const DEBUT = jour(2026, 10, 30, 16, 32);
const DUREE = 85 * MIN;
const FIN = DEBUT + DUREE;

/** FC inventée du padel, une mesure par seconde, sauf entre 25 et 40 min et après 77 min (flux coupé). */
function direct(): { t: number; s: number; bpm: number }[] {
  const l: { t: number; s: number; bpm: number }[] = [];
  for (let s = 0; s <= DUREE; s += S) {
    if ((s > 25 * MIN && s < 40 * MIN) || s > 77 * MIN) continue;
    l.push({ t: DEBUT + s, s, bpm: Math.round(135 + 20 * Math.sin(s / 90_000)) });
  }
  return l;
}
/** FC de Whoop toutes les 6 s sur toute la séance (heure murale). */
const whoop = (debut = DEBUT, fin = FIN) => Array.from({ length: Math.floor((fin - debut) / 6000) + 1 }, (_, i) => ({ t: debut + i * 6000, bpm: 120 + (i % 30) }));

test("trous : plus de 20 s sans mesure, et après la dernière jusqu'à la fin ; rien avant la première", () => {
  const d = direct();
  const tr = trousFc(d, DUREE);
  assert.deepEqual(tr.map((x) => [x.deS / MIN, Math.round(x.aS / MIN)]), [[25, 40], [77, 85]]);
  assert.equal(tr[1]!.aT, FIN);
  // 20 s tout juste : pas un trou ; 21 s : un trou
  assert.deepEqual(trousFc([{ s: 0 }, { s: TROU_COURBE_S * S }], TROU_COURBE_S * S), []);
  assert.equal(trousFc([{ s: 0 }, { s: 21 * S }], 21 * S).length, 1);
  // connexion lente au début : pas une coupure ; aucune mesure : pas de FC du tout, pas de trou
  assert.deepEqual(trousFc([{ s: 60 * S }, { s: 61 * S }], 61 * S), []);
  assert.deepEqual(trousFc([], DUREE), []);
});

test("complément : les points de Whoop vont dans les trous seulement, au temps de séance, marqués de leur provenance", () => {
  const d = direct();
  const fc = completerFc(d, whoop(), "whoop", DUREE);
  const ajoutes = fc.filter((f) => f.source);
  assert.ok(ajoutes.every((f) => f.source === "whoop" && ((f.s > 25 * MIN && f.s < 40 * MIN) || f.s > 77 * MIN)));
  // 15 min et 8 min à un point toutes les 6 s, bords exclus
  assert.equal(ajoutes.length, 149 + 79);
  assert.equal(fc.length, d.length + ajoutes.length);
  assert.ok(fc.every((f, i) => i === 0 || f.s >= fc[i - 1]!.s));
  // le temps de séance suit l'heure murale du bord gauche
  const premier = ajoutes[0]!;
  assert.equal(premier.s, premier.t! - DEBUT);
  // un trou qui contient une pause (le mur avance de 10 min de plus que la séance) n'est pas comblé
  const pause = [{ t: DEBUT, s: 0, bpm: 120 }, { t: DEBUT + 15 * MIN, s: 5 * MIN, bpm: 120 }];
  assert.deepEqual(completerFc(pause, whoop(), "whoop", 5 * MIN).filter((f) => f.source), []);
  // rien de l'autre source : le direct tel quel
  assert.deepEqual(completerFc(d, [], "sante", DUREE).length, d.length);
});

test("ligne : « FC coupée 23 min, complétée par Whoop », en partie, ou non complétée", () => {
  const d = direct();
  const non = bilanCoupure(d, DUREE)!;
  assert.deepEqual(non, { coupeeS: 23 * 60, completeeS: 0, source: null });
  assert.equal(etatCoupure(non), "non");
  assert.equal(texteCoupure(non), "FC coupée 23 min, non complétée");

  const complete = bilanCoupure(completerFc(d, whoop(), "whoop", DUREE), DUREE)!;
  assert.equal(complete.coupeeS, 23 * 60);
  assert.ok(complete.completeeS >= 0.95 * complete.coupeeS, `${complete.completeeS}`);
  assert.equal(texteCoupure(complete), "FC coupée 23 min, complétée par Whoop");

  // Santé Connect n'a que le premier trou
  const partiel = bilanCoupure(completerFc(d, whoop(DEBUT + 25 * MIN, DEBUT + 40 * MIN), "sante", DUREE), DUREE)!;
  assert.equal(texteCoupure(partiel), "FC coupée 23 min, en partie complétée par Santé Connect");
  // sans trou, pas de ligne ; une coupure de moins d'une minute en secondes
  assert.equal(bilanCoupure(d.filter((f) => f.s <= 20 * MIN), 20 * MIN), null);
  assert.equal(texteCoupure({ coupeeS: 40, completeeS: 0, source: null }), "FC coupée 40 s, non complétée");
});

test("zones et FC moyenne : seulement le temps mesuré (le direct, puis ce que Whoop comble)", () => {
  const d = direct();
  const seul = vueEffort({ points: [], fc: d, bornes: [], denivelePlusM: null, barometre: false }, DUREE / S, 181);
  const total = seul.zonesS!.reduce((a, b) => a + b, 0);
  // 25 + 37 min mesurées (chaque bord couvre encore ses 10 s au plus), pas 85
  assert.ok(Math.abs(total - 62 * 60) <= 20, `${total}`);
  assert.equal(seul.coupureFc?.coupeeS, 23 * 60);

  const fc = completerFc(d, whoop(), "whoop", DUREE);
  const comble = vueEffort({ points: [], fc, bornes: [], denivelePlusM: null, barometre: false }, DUREE / S, 181);
  const totalComble = comble.zonesS!.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(totalComble - 85 * 60) <= 10, `${totalComble}`);
  // Whoop (120 à 149) tire la moyenne vers le bas : elle compte ses 23 min, pas plus
  const moyDirect = d.reduce((a, f) => a + f.bpm, 0) / d.length;
  const moyWhoop = whoop().reduce((a, f) => a + f.bpm, 0) / whoop().length;
  const attendu = (moyDirect * 62 + moyWhoop * 23) / 85;
  assert.ok(Math.abs(comble.fcMoy! - attendu) <= 1, `${comble.fcMoy} ≠ ${attendu}`);
});

test("courbe : coupée aux trous, jamais par la décimation ; provenance gardée, ligne continue au changement de source", () => {
  const serie = serieCourbeFc(direct(), 300);
  assert.ok(serie.length <= 310, `${serie.length}`);
  assert.deepEqual(serie.flatMap((p) => (p.coupe ? [Math.round(p.s / 60)] : [])), [40]);
  // 2 h sans trou à 1 Hz : 300 points espacés de plus de 20 s, mais aucune coupure
  const long: FcSourcee[] = Array.from({ length: 7201 }, (_, i) => ({ s: i * S, bpm: 120 + (i % 50) }));
  const l = serieCourbeFc(long, 300);
  assert.ok(l.some((p, i) => i > 0 && p.s - l[i - 1]!.s > TROU_COURBE_S));
  assert.equal(l.filter((p) => p.coupe).length, 0);

  const comblee = serieCourbeFc(completerFc(direct(), whoop(), "whoop", DUREE), 300);
  assert.equal(comblee.filter((p) => p.coupe).length, 0);
  const m = morceauxCourbe(comblee);
  assert.deepEqual(m.map((x) => x.source), [null, "whoop", null, "whoop"]);
  // le morceau de Whoop part du dernier point du direct : pas de blanc entre les deux
  assert.equal(m[1]!.points[0], m[0]!.points.at(-1));
  // coupé : deux morceaux qui ne se touchent pas
  const coupee = morceauxCourbe(serie);
  assert.equal(coupee.length, 2);
  assert.ok(coupee[1]!.points[0]!.coupe);
});

/** Le padel en suivi pepfit (mode FC, sans GPS), rattaché à son activité Whoop. */
async function padel(avecWhoop = true) {
  const { db } = await baseDeTest(true);
  const fc = direct();
  const id = await enregistrerSuivi(db, {
    exerciceId: "cat:padel", titre: "Padel", salleId: null, mode: "fc", debut: DEBUT, fin: FIN, dureeS: DUREE / S, distanceM: 0,
    denivelePlusM: null, deniveleMoinsM: null, barometre: false, points: [], fc, tours: [],
  });
  if (avecWhoop) {
    await enregistrerSeances(db, [
      { id: "w-padel", debut: DEBUT - MIN, fin: FIN + MIN, sportId: 249, sport: "Padel", strain: 14.2, kj: 4000, fcMoy: 133, fcMax: 164, distanceM: null, zones: null },
    ]);
  }
  return { db, id };
}

test("séance rapprochée de Whoop : pas de Santé Connect, trous comblés par la FC de Santé Connect, la ligne le dit", async () => {
  const { db, id } = await padel();
  assert.equal((await db.getFirstAsync<{ seance_id: string }>("SELECT seance_id FROM whoop_seance WHERE id = 'w-padel'", []))!.seance_id, id);
  const sc: DepsSources["sante"] = { autorisees: async () => ["pas", "fc-montre"], pasEntre: async () => 6100, fcEntre: async () => whoop() };
  const r = await sourcesSeance(db, { id, debut: DEBUT, fin: FIN }, { sante: sc, maintenant: FIN + 3_600_000 });
  // la séance garde sa FC (fc null) ; Santé Connect comble ses trous et donne les pas
  assert.deepEqual([r.pas, r.fc, r.complement?.source], [{ pas: 6100, source: "sante" }, null, "sante"]);

  const seance = (await lireSeance(db, id))!;
  const e = (await chargerEffort(db, seance, r.complement))!;
  assert.equal(e.source, "Whoop");
  assert.equal("effort" in e, false, "le score de Whoop n'est jamais repris");
  assert.equal(etatCoupure(e.vue.coupureFc!), "completee");
  assert.ok(e.vue.serieFc.some((p) => p.source === "sante"));
  // sans complément (avant la lecture de Whoop) : la courbe est coupée, rien n'est inventé
  const avant = (await chargerEffort(db, seance))!;
  assert.equal(texteCoupure(avant.vue.coupureFc!), "FC coupée 23 min, non complétée");
  assert.ok(avant.vue.serieFc.some((p) => p.coupe));
  assert.ok(!avant.vue.serieFc.some((p) => p.source));
});

test("séance sans Whoop : Santé Connect comble les trous ; sans trou, rien n'est lu", async () => {
  const { db, id } = await padel(false);
  const plages: [number, number][] = [];
  const sc: DepsSources["sante"] = { autorisees: async () => ["fc-montre"], pasEntre: async () => null, fcEntre: async (d, f) => (plages.push([d, f]), whoop().reverse()) };
  const r = await sourcesSeance(db, { id, debut: DEBUT, fin: FIN }, { sante: sc, maintenant: FIN + 60_000 });
  assert.deepEqual([r.fc, r.complement?.source, plages], [null, "sante", [[DEBUT, FIN]]]);
  assert.ok(r.complement!.echantillons[0]!.t < r.complement!.echantillons[1]!.t);
});

test("fiche d'une séance récente sans son activité Whoop : Whoop relu (une fois toutes les 5 min, 36 h au plus)", async () => {
  const { db, id } = await padel(false);
  const s = { id, fin: FIN };
  // Whoop pas connecté : rien
  assert.equal(await doitRelireWhoop(db, s, FIN + 6 * MIN), false);
  await ecrireReglage(db, REGLAGE.connecte, "1");
  // capture du 30/10 : 6 min après la fin, synchro faite avant la séance
  await ecrireReglage(db, REGLAGE.derniereSynchro, String(DEBUT - 10 * MIN));
  assert.equal(await doitRelireWhoop(db, s, FIN + 6 * MIN), true);
  // relu il y a 2 min : pas encore
  await ecrireReglage(db, REGLAGE.derniereSynchro, String(FIN + 4 * MIN));
  assert.equal(await doitRelireWhoop(db, s, FIN + 6 * MIN), false);
  // trop vieille : Whoop l'aurait déjà rangée
  assert.equal(await doitRelireWhoop(db, s, FIN + ATTENTE_WHOOP_MS + 1), false);
  // rattachée : plus rien à attendre
  await enregistrerSeances(db, [{ id: "w-padel", debut: DEBUT, fin: FIN, sportId: 249, sport: "Padel", strain: 14, kj: 4000, fcMoy: 133, fcMax: 164, distanceM: null, zones: null }]);
  assert.equal(await doitRelireWhoop(db, s, FIN + 30 * MIN), false);
});
