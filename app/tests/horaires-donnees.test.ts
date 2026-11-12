// Horaires en base (planche Effort v2.2, D6 et D7) : séance de muscu (séries qui gardent leur heure), séance importée (original gardé,
// « Rétablir », la synchro ne l'écrase pas), récupération, nuit, effet sur le point du jour et la série. Données inventées.
import assert from "node:assert/strict";
import { test } from "node:test";
import { definirActif } from "../src/i18n/index.ts";
import { associerActivite, lireActiviteCatalogue, lireActivites, rafraichirActivites, type SanteActivites } from "../src/db/depots/activites.ts";
import { ajouterSerie, cocherSerie, demarrerSeance, terminerSeance } from "../src/db/depots/seances.ts";
import { effortSeance } from "../src/ecrans/effort-charges.ts";
import {
  ecrireDebutSeanceEnCours, ecrireHoraires, effetHoraires, lireHoraires, lireHorairesSeance, retablirHoraires, type CibleHoraires,
} from "../src/ecrans/horaires-donnees.ts";
import { phraseEffet } from "../src/ecrans/horaires.ts";
import { lireHorairesNuits, appliquerHorairesNuits, nuitModifiee } from "../src/ecrans/mesures/sommeil-horaires.ts";
import type { Nuit } from "../src/ecrans/mesures/sommeil-donnees.ts";
import { enregistrerRecup, lireRecup } from "../src/ecrans/recuperer-donnees.ts";
import { tableSync } from "../src/sync/schema.ts";
import { enregistrerSeances } from "../src/whoop/depot.ts";
import type { SeanceConvertie } from "../src/whoop/types.ts";
import { baseDeTest, jour } from "./aide.ts";

definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });

const MIN = 60_000;
const JOUR = 86_400_000;
// Un vendredi, 17:22 ; la semaine d'avant est le lundi 26 au dimanche 1er novembre.
const vendredi = jour(2026, 11, 6, 0, 0);
const A = (j: number, h: number, m: number) => vendredi + j * JOUR + (h * 60 + m) * MIN;
const MAINTENANT = A(0, 17, 22);

const w = (id: string, d: number, f: number): SeanceConvertie => ({
  id, debut: d, fin: f, sportId: -1, sport: "Activity", strain: 11.2, kj: 2600, fcMoy: 138, fcMax: 171, distanceM: null, zones: [0, 4, 12, 24, 19, 6],
});
const sansSante: SanteActivites = { seancesSport: async () => null, pasIntervalles: async () => null, fcEntre: async () => null, nuits: async () => null };

type Base = Awaited<ReturnType<typeof baseDeTest>>;

/** Une séance de muscu terminée : 8:30 à 9:42, séries à 8:41, 8:46 et 8:52. */
async function muscu(db: Base["db"], j = 0): Promise<string> {
  const id = await demarrerSeance(db, null, "Haut du corps");
  for (const [k, h, m] of [[0, 8, 41], [1, 8, 46], [2, 8, 52]] as const) {
    const s = await ajouterSerie(db, { seanceId: id, exerciceId: "cat:couche", kg: 60 + k, reps: 10 });
    await cocherSerie(db, s, true);
    await db.runAsync("UPDATE series SET fait_le = ? WHERE id = ?", [A(j, h, m), s]);
  }
  await db.runAsync("UPDATE seances SET debut = ? WHERE id = ?", [A(j, 8, 30), id]);
  await terminerSeance(db, id, A(j, 9, 42));
  return id;
}

/** Un padel de Whoop rattaché à une séance (une série de durée) : 15:45 à 17:16. */
async function padelWhoop(db: Base["db"]): Promise<string> {
  await enregistrerSeances(db, [w("a1", A(0, 15, 45), A(0, 17, 16))], MAINTENANT);
  await rafraichirActivites(db, vendredi, sansSante, MAINTENANT);
  const [a] = await lireActivites(db, vendredi, vendredi + JOUR);
  const padel = (await lireActiviteCatalogue(db, "cat:padel"))!;
  return associerActivite(db, a!, padel, { profil: { fcRepos: 55, fcMax: 185 }, maintenant: MAINTENANT });
}

const cible = (id: string): CibleHoraires => ({ genre: "seance", id });

test("muscu : les séries gardent leur heure, seule l'enveloppe bouge ; pas d'original pour une saisie à la main", async () => {
  const { db } = await baseDeTest(true);
  const id = await muscu(db);
  const l = (await lireHorairesSeance(db, id))!;
  assert.deepEqual(l.horaires, { debut: A(0, 8, 30), fin: A(0, 9, 42) });
  assert.equal(l.premiereSerie, A(0, 8, 41));
  assert.equal(l.derniereSerie, A(0, 8, 52));
  assert.equal(l.source, null);
  assert.equal(l.original, null);

  assert.equal(await ecrireHoraires(db, cible(id), { debut: A(0, 8, 0), fin: A(0, 10, 0) }, MAINTENANT), null);
  const apres = (await lireHorairesSeance(db, id))!;
  assert.deepEqual(apres.horaires, { debut: A(0, 8, 0), fin: A(0, 10, 0) });
  assert.equal(apres.original, null, "saisie à la main : rien à rétablir");
  const series = await db.getAllAsync<{ fait_le: number }>("SELECT fait_le FROM series WHERE seance_id = ? ORDER BY position", [id]);
  assert.deepEqual(series.map((s) => s.fait_le), [A(0, 8, 41), A(0, 8, 46), A(0, 8, 52)], "chaque série garde son heure");
});

test("muscu : une enveloppe qui laisse une série dehors est refusée, rien n'est écrit", async () => {
  const { db, raw } = await baseDeTest(true);
  const id = await muscu(db);
  raw.exec("DELETE FROM sync_journal");
  const tard = await ecrireHoraires(db, cible(id), { debut: A(0, 8, 50), fin: A(0, 9, 42) }, MAINTENANT);
  assert.equal(tard?.motif, "serieDebut");
  const tot = await ecrireHoraires(db, cible(id), { debut: A(0, 8, 30), fin: A(0, 8, 45) }, MAINTENANT);
  assert.equal(tot?.motif, "serieFin");
  const autreJour = await ecrireHoraires(db, cible(id), { debut: A(-3, 8, 30), fin: A(-3, 9, 42) }, MAINTENANT);
  assert.equal(autreJour?.motif, "serieFin", "les séries restent à leur heure : la séance ne change pas de jour sans elles");
  assert.deepEqual((await lireHorairesSeance(db, id))!.horaires, { debut: A(0, 8, 30), fin: A(0, 9, 42) });
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM sync_journal WHERE tab = 'seances'").get() as { n: number }).n, 0);
});

test("bornes relues dans la base : futur, fin avant le début, une minute au moins", async () => {
  const { db } = await baseDeTest(true);
  const id = await muscu(db);
  assert.equal((await ecrireHoraires(db, cible(id), { debut: A(0, 8, 30), fin: A(0, 17, 40) }, MAINTENANT))?.motif, "futur");
  assert.equal((await ecrireHoraires(db, cible(id), { debut: A(0, 8, 30), fin: A(0, 8, 30) }, MAINTENANT))?.motif, "finAvantDebut");
  assert.equal((await ecrireHoraires(db, cible(id), { debut: A(0, 8, 30), fin: A(0, 8, 31) }, MAINTENANT))?.motif, "serieFin");
});

test("sport importé : la série de durée suit l'enveloppe, l'original est gardé, « Rétablir » le remet", async () => {
  const { db } = await baseDeTest(true);
  const id = await padelWhoop(db);
  const l0 = (await lireHorairesSeance(db, id))!;
  assert.equal(l0.source, "whoop");
  assert.equal(l0.original, null);
  assert.equal(l0.premiereSerie, null, "un sport n'a pas de série dehors : la série est la séance");

  // la fin recule de 6 minutes
  assert.equal(await ecrireHoraires(db, cible(id), { debut: A(0, 15, 45), fin: A(0, 17, 10) }, MAINTENANT), null);
  let l = (await lireHorairesSeance(db, id))!;
  assert.deepEqual(l.horaires, { debut: A(0, 15, 45), fin: A(0, 17, 10) });
  assert.deepEqual(l.original, { debut: A(0, 15, 45), fin: A(0, 17, 16) });
  const serie = (await db.getFirstAsync<{ duree_s: number; fait_le: number }>("SELECT duree_s, fait_le FROM series WHERE seance_id = ?", [id]))!;
  assert.equal(serie.duree_s, 85 * 60);
  assert.equal(serie.fait_le, A(0, 17, 10));

  // une seconde modification ne remplace pas l'original
  await ecrireHoraires(db, cible(id), { debut: A(0, 15, 30), fin: A(0, 17, 1) }, MAINTENANT);
  l = (await lireHorairesSeance(db, id))!;
  assert.deepEqual(l.original, { debut: A(0, 15, 45), fin: A(0, 17, 16) });

  // rétablir : horaires, série et original d'avant
  const remis = await retablirHoraires(db, cible(id), MAINTENANT);
  assert.deepEqual(remis, { debut: A(0, 15, 45), fin: A(0, 17, 16) });
  l = (await lireHorairesSeance(db, id))!;
  assert.deepEqual(l.horaires, { debut: A(0, 15, 45), fin: A(0, 17, 16) });
  assert.equal(l.original, null);
  assert.equal((await db.getFirstAsync<{ duree_s: number }>("SELECT duree_s FROM series WHERE seance_id = ?", [id]))!.duree_s, 91 * 60);
  assert.equal(await retablirHoraires(db, cible(id), MAINTENANT), null, "rien à rétablir deux fois");
});

test("revenir à la main aux horaires d'origine efface l'original", async () => {
  const { db } = await baseDeTest(true);
  const id = await padelWhoop(db);
  await ecrireHoraires(db, cible(id), { debut: A(0, 15, 30), fin: A(0, 17, 1) }, MAINTENANT);
  assert.ok((await lireHorairesSeance(db, id))!.original);
  await ecrireHoraires(db, cible(id), { debut: A(0, 15, 45), fin: A(0, 17, 16) }, MAINTENANT);
  assert.equal((await lireHorairesSeance(db, id))!.original, null);
});

test("la synchro Whoop n'écrase pas une séance modifiée : l'original suit, la modification reste", async () => {
  const { db } = await baseDeTest(true);
  const id = await padelWhoop(db);
  await ecrireHoraires(db, cible(id), { debut: A(0, 15, 30), fin: A(0, 17, 1) }, MAINTENANT);
  // Whoop corrige sa séance (15:40 à 17:20)
  await enregistrerSeances(db, [w("a1", A(0, 15, 40), A(0, 17, 20))], MAINTENANT);
  const l = (await lireHorairesSeance(db, id))!;
  assert.deepEqual(l.horaires, { debut: A(0, 15, 30), fin: A(0, 17, 1) }, "la modification reste");
  assert.deepEqual(l.original, { debut: A(0, 15, 40), fin: A(0, 17, 20) }, "l'original est celui de Whoop maintenant");
  // non modifiée : elle suit Whoop comme avant
  const autre = await db.getFirstAsync<{ id: string }>("SELECT id FROM seances WHERE id <> ?", [id]);
  assert.equal(autre, null);
  await retablirHoraires(db, cible(id), MAINTENANT);
  assert.deepEqual((await lireHorairesSeance(db, id))!.horaires, { debut: A(0, 15, 40), fin: A(0, 17, 20) });
  await enregistrerSeances(db, [w("a1", A(0, 15, 45), A(0, 17, 16))], MAINTENANT);
  assert.deepEqual((await lireHorairesSeance(db, id))!.horaires, { debut: A(0, 15, 45), fin: A(0, 17, 16) }, "sans modification, elle suit Whoop");
});

test("l'effort se recalcule sur la nouvelle enveloppe : la FC n'est lue qu'entre le début et la fin", async () => {
  const { db } = await baseDeTest(true);
  const id = await padelWhoop(db);
  // la FC du capteur, une mesure par minute pendant tout le padel (15:45 à 17:16), 150 bpm
  await db.runAsync("UPDATE whoop_seance SET zones = NULL WHERE seance_id = ?", [id]);
  for (let m = 0; m <= 91; m++) {
    await db.runAsync("INSERT INTO seance_fc (seance_id, t, s, bpm) VALUES (?,?,?,?)", [id, A(0, 15, 45) + m * MIN, m * 60, 150]);
  }
  const avant = (await effortSeance(db, id))!;
  await ecrireHoraires(db, cible(id), { debut: A(0, 16, 45), fin: A(0, 17, 15) }, MAINTENANT);
  const apres = (await effortSeance(db, id))!;
  assert.ok(apres.score < avant.score, `${apres.score} < ${avant.score}`);
  const sec = await db.getAllAsync<{ s: number }>("SELECT s FROM seance_fc WHERE seance_id = ? AND t = ?", [id, A(0, 17, 0)]);
  assert.equal(sec[0]!.s, 15 * MIN, "le temps écoulé gardé suit le nouveau début");
  const s = (await db.getFirstAsync<{ debut: number; fin: number }>("SELECT debut, fin FROM seances WHERE id = ?", [id]))!;
  assert.equal(s.fin - s.debut, 30 * MIN);
});

test("changement de jour : le point suit et la série se recalcule en entier", async () => {
  const { db } = await baseDeTest(true);
  const id = await padelWhoop(db);
  // le mardi 3 avait déjà une séance : la série (semaine du 2 au 8) ne change pas
  const e = (await effetHoraires(db, cible(id), { debut: A(-3, 15, 30), fin: A(-3, 17, 1) }, MAINTENANT))!;
  assert.equal(e.genre, "seance");
  assert.equal(e.seulAvant, true, "c'était la seule séance de son jour");
  assert.equal(e.serieAvant, 1);
  assert.equal(e.serieApres, 1);
  assert.equal(phraseEffet(e, MAINTENANT), "Le point du jour passe du vendredi 6 au mardi 3. La série reste à 1 semaine.");
  // même jour : pas de changement de jour
  const meme = (await effetHoraires(db, cible(id), { debut: A(0, 14, 0), fin: A(0, 15, 0) }, MAINTENANT))!;
  assert.equal(phraseEffet(meme, MAINTENANT), null);
  // une autre séance le même jour : le point ne s'éteint pas
  await muscu(db, 0);
  const deux = (await effetHoraires(db, cible(id), { debut: A(-3, 15, 30), fin: A(-3, 17, 1) }, MAINTENANT))!;
  assert.equal(deux.seulAvant, false);
});

test("la série change quand l'activité passe d'une semaine à l'autre", async () => {
  const { db } = await baseDeTest(true);
  // trois semaines d'affilée : la semaine du 12 au 18 octobre, celle du 19 au 25, et celle-ci (la séance du vendredi 6)
  const hier = await muscu(db, -14);
  const avant = await muscu(db, -7);
  assert.ok(hier && avant);
  const id = await padelWhoop(db);
  const e = (await effetHoraires(db, cible(id), { debut: A(-9, 15, 30), fin: A(-9, 17, 1) }, MAINTENANT))!;
  assert.equal(e.serieAvant, 3);
  assert.equal(e.serieApres, 2, "la semaine du 2 novembre n'a plus d'activité : la série court depuis la semaine d'avant");
  assert.equal(phraseEffet(e, MAINTENANT), "Le point du jour passe du vendredi 6 au mercredi 28. Ta série passe de 3 à 2 semaines.");
  const e2 = (await effetHoraires(db, cible(id), { debut: A(-3, 15, 30), fin: A(-3, 17, 1) }, MAINTENANT))!;
  assert.equal(e2.serieApres, 3, "même semaine, la série ne change pas");
});

test("récupération importée : original gardé, « Rétablir », jamais de point ni de série", async () => {
  const { db } = await baseDeTest(true);
  const id = await enregistrerRecup(db, {
    type: "sauna", debut: A(0, 12, 20), fin: A(0, 12, 35), mode: "import", sources: ["whoop"], idExterne: "w-sauna-1",
  }, MAINTENANT);
  const l = (await lireHoraires(db, { genre: "recup", id }))!;
  assert.equal(l.source, "whoop");
  assert.equal(l.original, null);
  assert.equal(await ecrireHoraires(db, { genre: "recup", id }, { debut: A(0, 12, 5), fin: A(0, 12, 25) }, MAINTENANT), null);
  const m = (await lireRecup(db, id))!;
  assert.deepEqual({ debut: m.debut, fin: m.fin }, { debut: A(0, 12, 5), fin: A(0, 12, 25) });
  assert.deepEqual({ debut: m.debutOrig, fin: m.finOrig }, { debut: A(0, 12, 20), fin: A(0, 12, 35) });
  const e = (await effetHoraires(db, { genre: "recup", id }, { debut: A(-1, 12, 5), fin: A(-1, 12, 25) }, MAINTENANT))!;
  assert.equal(e.genre, "recup");
  assert.match(phraseEffet(e, MAINTENANT) ?? "", /n'allume pas de point/);
  assert.equal(await ecrireHoraires(db, { genre: "recup", id }, { debut: A(0, 12, 5), fin: A(0, 12, 25) + 24 * 3600_000 }, MAINTENANT).then((r) => r?.motif), "futur");
  await retablirHoraires(db, { genre: "recup", id }, MAINTENANT);
  const r = (await lireRecup(db, id))!;
  assert.deepEqual({ debut: r.debut, fin: r.fin, o: r.debutOrig }, { debut: A(0, 12, 20), fin: A(0, 12, 35), o: null });
});

test("récupération saisie à la main : pas d'original", async () => {
  const { db } = await baseDeTest(true);
  const id = await enregistrerRecup(db, { type: "sieste", debut: A(0, 14, 5), fin: A(0, 14, 22), mode: "apres-coup" }, MAINTENANT);
  await ecrireHoraires(db, { genre: "recup", id }, { debut: A(0, 14, 0), fin: A(0, 14, 30) }, MAINTENANT);
  const m = (await lireRecup(db, id))!;
  assert.equal(m.debutOrig, null);
  assert.equal(m.finOrig, null);
  assert.equal(await retablirHoraires(db, { genre: "recup", id }, MAINTENANT), null);
});

const nuit = (jourReveil: number, debut: number, fin: number, sommeilMin: number): Nuit => ({
  jour: jourReveil, debut, fin, sommeilMin, auLitMin: Math.round((fin - debut) / MIN),
  phases: { eveil: 20, leger: 200, profond: 80, paradoxal: 90 }, source: "sante", origine: "com.exemple", etapes: [{ debut, fin, phase: "leger" }],
  perf: 88, besoin: null, efficacite: 90, efficaciteCalculee: false, regularite: null, reveils: 2, respiration: null, heure: fin,
});

test("nuit : les horaires modifiés remplacent ceux de la source, l'original est gardé, rien d'inventé pour les phases", () => {
  const lue = nuit(A(0, 0, 0), A(-1, 23, 5), A(0, 6, 50), 420);
  const n = nuitModifiee(lue, { jour: "2026-11-06", debut: A(-1, 23, 30), fin: A(0, 7, 10), debutOrig: lue.debut, finOrig: lue.fin });
  assert.equal(n.debut, A(-1, 23, 30));
  assert.equal(n.fin, A(0, 7, 10));
  assert.equal(n.auLitMin, 460);
  assert.equal(n.sommeilMin, 420 + (460 - 465), "le sommeil suit l'écart du temps au lit");
  assert.equal(n.phases, null);
  assert.equal(n.etapes, null);
  assert.equal(n.perf, null);
  assert.equal(n.efficaciteCalculee, true);
  assert.deepEqual(n.original, { debut: lue.debut, fin: lue.fin });
  assert.equal(n.cle, "2026-11-06");
  assert.equal(n.jour, A(0, 0, 0), "la nuit compte au jour du réveil");
});

test("nuit : la fin passe sur un autre jour, la nuit compte ce jour-là ; une nuit déjà là reste si elle a plus de sommeil", () => {
  const lue = nuit(A(0, 0, 0), A(-1, 23, 5), A(0, 6, 50), 420);
  const { nuits, originauxADeplacer } = appliquerHorairesNuits(new Map([[lue.jour, lue]]), [
    { jour: "2026-11-06", debut: A(-2, 23, 30), fin: A(-1, 7, 10), debutOrig: lue.debut, finOrig: lue.fin },
  ]);
  assert.equal(originauxADeplacer.length, 0);
  assert.equal(nuits.has(A(0, 0, 0)), false);
  assert.equal(nuits.get(A(-1, 0, 0))?.fin, A(-1, 7, 10));
  // une autre nuit existe déjà au jour d'arrivée : celle qui a le plus de sommeil reste
  const autre = nuit(A(-1, 0, 0), A(-2, 22, 0), A(-1, 6, 0), 480);
  const m = appliquerHorairesNuits(new Map([[lue.jour, lue], [autre.jour, autre]]), [
    { jour: "2026-11-06", debut: A(-2, 23, 30), fin: A(-1, 7, 10), debutOrig: lue.debut, finOrig: lue.fin },
  ]);
  assert.equal(m.nuits.get(A(-1, 0, 0))?.sommeilMin, 480);
  assert.equal(m.nuits.get(A(0, 0, 0))?.fin, lue.fin, "la nuit lue revient à son jour");
});

test("nuit : la source corrige sa nuit, l'original suit et la modification reste", () => {
  const lue = nuit(A(0, 0, 0), A(-1, 23, 0), A(0, 7, 0), 430);
  const { nuits, originauxADeplacer } = appliquerHorairesNuits(new Map([[lue.jour, lue]]), [
    { jour: "2026-11-06", debut: A(-1, 23, 30), fin: A(0, 7, 10), debutOrig: A(-1, 23, 5), finOrig: A(0, 6, 50) },
  ]);
  assert.equal(nuits.get(A(0, 0, 0))?.debut, A(-1, 23, 30));
  assert.deepEqual(originauxADeplacer.map((h) => [h.debutOrig, h.finOrig]), [[lue.debut, lue.fin]]);
});

test("nuit : écrite en base, synchronisée, retirée quand elle redevient l'original", async () => {
  const { db, raw } = await baseDeTest();
  const { ecrireHorairesNuit, retablirNuit } = await import("../src/ecrans/mesures/sommeil-horaires.ts");
  assert.ok(tableSync("sommeil_horaires"));
  raw.exec("DELETE FROM sync_journal");
  await ecrireHorairesNuit(db, { jour: "2026-11-06", debut: A(-1, 23, 30), fin: A(0, 7, 10), debutOrig: A(-1, 23, 5), finOrig: A(0, 6, 50) }, MAINTENANT);
  assert.equal((await lireHorairesNuits(db)).length, 1);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM sync_journal WHERE tab = 'sommeil_horaires'").get() as { n: number }).n, 1);
  await ecrireHorairesNuit(db, { jour: "2026-11-06", debut: A(-1, 23, 40), fin: A(0, 7, 15), debutOrig: A(-1, 23, 5), finOrig: A(0, 6, 50) }, MAINTENANT);
  assert.equal((await lireHorairesNuits(db)).length, 1, "une ligne par nuit");
  await ecrireHorairesNuit(db, { jour: "2026-11-06", debut: A(-1, 23, 5), fin: A(0, 6, 50), debutOrig: A(-1, 23, 5), finOrig: A(0, 6, 50) }, MAINTENANT);
  assert.equal((await lireHorairesNuits(db)).length, 0, "égal à l'original : plus de modification");
  await ecrireHorairesNuit(db, { jour: "2026-11-06", debut: A(-1, 23, 30), fin: A(0, 7, 10), debutOrig: A(-1, 23, 5), finOrig: A(0, 6, 50) }, MAINTENANT);
  await retablirNuit(db, "2026-11-06");
  assert.equal((await lireHorairesNuits(db)).length, 0);
});

test("les colonnes d'original voyagent avec la ligne (synchro générique), le serveur n'a rien de spécifique", () => {
  const s = tableSync("seances")!;
  assert.ok(s, "seances est synchronisée");
  assert.ok(tableSync("recup_activite"));
});

test("séance qui court : le début s'écrit sans décaler les séries, jamais après la première ni dans le futur", async () => {
  const { db } = await baseDeTest(true);
  const id = await demarrerSeance(db, null, "Haut du corps");
  const s = await ajouterSerie(db, { seanceId: id, exerciceId: "cat:couche", kg: 60, reps: 10 });
  await cocherSerie(db, s, true);
  await db.runAsync("UPDATE series SET fait_le = ? WHERE id = ?", [A(0, 8, 41), s]);
  await db.runAsync("UPDATE seances SET debut = ? WHERE id = ?", [A(0, 8, 30), id]);
  const plusTard = await ecrireDebutSeanceEnCours(db, id, A(0, 8, 50), MAINTENANT);
  assert.equal(plusTard?.motif, "serieDebut");
  const futur = await ecrireDebutSeanceEnCours(db, id, A(0, 18, 0), MAINTENANT);
  assert.equal(futur?.motif, "futur");
  assert.equal((await db.getFirstAsync<{ debut: number }>("SELECT debut FROM seances WHERE id = ?", [id]))!.debut, A(0, 8, 30));
  assert.equal(await ecrireDebutSeanceEnCours(db, id, A(0, 8, 10), MAINTENANT), null);
  assert.equal((await db.getFirstAsync<{ debut: number }>("SELECT debut FROM seances WHERE id = ?", [id]))!.debut, A(0, 8, 10));
  assert.equal((await db.getFirstAsync<{ fait_le: number }>("SELECT fait_le FROM series WHERE id = ?", [s]))!.fait_le, A(0, 8, 41));
});

test("séance terminée : l'écriture d'une séance qui court n'y touche pas", async () => {
  const { db } = await baseDeTest(true);
  const id = await muscu(db);
  assert.equal(await ecrireDebutSeanceEnCours(db, id, A(0, 8, 0), MAINTENANT), null);
  assert.equal((await lireHorairesSeance(db, id))!.horaires.debut, A(0, 8, 30));
});
