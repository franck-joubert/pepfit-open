// « Récupérer » en base (planche recuperer, NOTES § 2 et 3) : la migration 59 (les séances de récupération passées migrées,
// D2), l'enregistrement et la fusion avec la montre (une seule sieste), les imports Whoop et Santé Connect sans réimport, la
// sieste dans la Récupération du lendemain, les kcal du sauna dans la dépense, « Ce qui marche pour toi » et la synchro de
// deux téléphones (chiffrée, une seule session importée).
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { adapter, baseDeTest, catalogue } from "./aide.ts";
import { chargerCatalogue } from "../src/db/catalogue.ts";
import { migrer } from "../src/db/migrations.ts";
import {
  derniereDuType, enregistrerRecup, estRecupWhoop, importerActivitesWhoop, importerRecupSante, importerSiestesWhoop, lireCeQuiMarche, lireRecup,
  lireRecupEntre, siestesParJour, supprimerRecup,
} from "../src/ecrans/recuperer-donnees.ts";
import { ecrireNuitsRecup, lireRecupJour } from "../src/ecrans/recup-donnees.ts";
import { seancesPepfit } from "../src/ecrans/energie-lot.ts";
import { kcalSeance } from "../src/ecrans/kcal-seance.ts";
import { nuitsParJour } from "../src/natif/sante/logique.ts";
import { tableSync } from "../src/sync/schema.ts";
import { aleatoire, pret } from "../src/sync/chiffrement.ts";
import { synchroniser, type Changement, type Lot, type Transport } from "../src/sync/moteur.ts";
import type { SeanceConvertie, SommeilWhoop } from "../src/whoop/types.ts";

const MIN = 60_000;
const jour = (n: number) => new Date(2026, 9, 30 + n).getTime();
const a = (h: number, m: number, n = 0) => jour(n) + (h * 60 + m) * MIN;
const MAINTENANT = a(19, 50);

test("migration 59 (D2) : les séances de sauna, bain froid, massage, étirements et méditation deviennent des activités de récupération ; le yoga reste", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 58);
  await chargerCatalogue(db, catalogue());
  const s = raw.prepare("INSERT INTO seances (id, debut, fin, maj_le, activite_id, source_ref) VALUES (?, ?, ?, ?, ?, ?)");
  s.run("s-sauna", a(19, 5), a(19, 20), 1, "cat:sauna", null);
  s.run("s-yoga", a(8, 0), a(8, 30), 1, "cat:yoga", null);
  s.run("s-muscu", a(10, 0), a(11, 0), 1, null, null);
  s.run("s-whoop", a(7, 0, -1), a(7, 3, -1), 1, "cat:bain-froid", "whoop:abc");
  s.run("s-medit", a(7, 35, -2), a(7, 40, -2), 1, null, null);
  raw.prepare("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES (?, ?, ?)").run("s-medit", "cat:meditation", 0);
  raw.prepare("INSERT INTO whoop_seance (id, debut, fin, sport_id, seance_id, maj_le) VALUES ('abc', ?, ?, 88, 's-whoop', 1)").run(a(7, 0, -1), a(7, 3, -1));
  await migrer(db);
  const l = raw.prepare("SELECT id, type, mode, sources, id_externe FROM recup_activite ORDER BY debut").all() as Record<string, unknown>[];
  assert.deepEqual(l.map((x) => [x.id, x.type, x.mode, x.sources, x.id_externe]), [
    ["seance:s-medit", "respiration", "apres-coup", '["pepfit"]', null],
    ["seance:s-whoop", "bain-froid", "import", '["whoop"]', "whoop:abc"],
    ["seance:s-sauna", "sauna", "apres-coup", '["pepfit"]', null],
  ]);
  const restent = (raw.prepare("SELECT id FROM seances ORDER BY id").all() as { id: string }[]).map((x) => x.id);
  assert.deepEqual(restent, ["s-muscu", "s-yoga"]);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM whoop_seance").get() as { n: number }).n, 0);
  // au journal de la synchro : les activités créées et les séances parties
  const j = raw.prepare("SELECT tab, cle, supprime FROM sync_journal WHERE tab IN ('recup_activite', 'seances') ORDER BY tab, cle").all() as Record<string, unknown>[];
  assert.ok(j.some((x) => x.tab === "recup_activite" && x.cle === "seance:s-sauna" && x.supprime === 0));
  assert.ok(j.some((x) => x.tab === "seances" && x.cle === "s-sauna" && x.supprime === 1));
});

test("la sieste de la planche : pepfit 14:07 – 14:32, puis la Galaxy Watch 14:11 – 14:31 : une seule sieste, 19 min de la montre, jamais réimportée", async () => {
  const { db, raw } = await baseDeTest();
  const id = await enregistrerRecup(db, { type: "sieste", debut: a(14, 7), fin: a(14, 32), mode: "minuteur", choisi: 20 }, a(14, 32));
  // sans la montre : 20 min comptées (25 au lit moins 5)
  assert.equal((await siestesParJour(db, jour(0), jour(0))).get("2026-10-30"), 20);
  const sessions = async () => [{ debut: a(14, 11), fin: a(14, 31), minutes: 19, phases: { leger: 15, profond: 0, paradoxal: 4, eveil: 1 }, origine: "com.sec.android.app.shealth" }];
  assert.equal(await importerRecupSante(db, jour(-1), MAINTENANT, { sessionsSommeil: sessions }, MAINTENANT), 1);
  const l = await lireRecupEntre(db, jour(0), jour(1));
  assert.equal(l.length, 1);
  assert.deepEqual([l[0]!.id, l[0]!.mode, l[0]!.choisi, l[0]!.sommeilMin, l[0]!.sources, l[0]!.idExterne], [
    id, "minuteur", 20, 19, ["pepfit", "com.sec.android.app.shealth"], `sante:com.sec.android.app.shealth:${a(14, 11)}`,
  ]);
  assert.equal((await siestesParJour(db, jour(0), jour(0))).get("2026-10-30"), 19);
  // la synchro suivante relit Santé Connect : rien de neuf
  assert.equal(await importerRecupSante(db, jour(-1), MAINTENANT, { sessionsSommeil: sessions }, MAINTENANT + MIN), 0);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM recup_activite").get() as { n: number }).n, 1);
});

test("Santé Connect (D4) : une session de 10 h à 20 h de moins de 3 h est une sieste, jamais une nuit ; étirements et respiration guidée importés, pas la marche", async () => {
  const { db } = await baseDeTest();
  const sessions = async () => [
    { debut: a(23, 41, -1), fin: a(7, 2), minutes: 432, phases: null, origine: "com.sec.android.app.shealth" },
    { debut: a(14, 11), fin: a(14, 31), minutes: 20, phases: null, origine: "com.sec.android.app.shealth" },
    { debut: a(15, 0), fin: a(15, 30), minutes: 30, phases: null, origine: "fit.pep" },
  ];
  const seances = async () => [
    { debut: a(7, 35), fin: a(7, 40), type: 33, titre: null, origine: "com.sec.android.app.shealth", kcal: null, pas: null },
    { debut: a(18, 0), fin: a(18, 15), type: 71, titre: null, origine: "com.google.android.apps.fitness", kcal: null, pas: null },
    { debut: a(12, 0), fin: a(12, 40), type: 79, titre: null, origine: "com.sec.android.app.shealth", kcal: null, pas: 4000 },
    { debut: a(8, 0), fin: a(8, 30), type: 83, titre: null, origine: "com.sec.android.app.shealth", kcal: null, pas: null },
  ];
  assert.equal(await importerRecupSante(db, jour(-1), MAINTENANT, { sessionsSommeil: sessions, seancesSport: seances }, MAINTENANT), 3);
  const l = await lireRecupEntre(db, jour(0), jour(1));
  assert.deepEqual(l.map((x) => [x.type, x.mode, x.sommeilMin]), [["respiration", "import", null], ["sieste", "import", null], ["etirements", "import", null]]);
  // sans phases, le sommeil d'une sieste importée compte sa durée entière
  assert.equal((await siestesParJour(db, jour(0), jour(0))).get("2026-10-30"), 20);
  // les nuits ne prennent jamais une sieste : un jour sans nuit n'a pas de nuit
  const brutes = [
    { debut: a(14, 11), fin: a(14, 31), origine: "x", etapes: [] },
    { debut: a(23, 41, -2), fin: a(7, 2, -1), origine: "x", etapes: [] },
  ];
  assert.deepEqual(nuitsParJour(brutes).map((n) => n.debut), [a(23, 41, -2)]);
});

test("Whoop : les siestes (nap) et les activités de récupération (sauna, bain froid…) vont dans Récupérer, pas dans les nuits ni les séances", async () => {
  const { db } = await baseDeTest();
  const nap: SommeilWhoop = {
    id: "nap-1", start: new Date(a(13, 40)).toISOString(), end: new Date(a(14, 10)).toISOString(), nap: true, score_state: "SCORED",
    score: { stage_summary: { total_in_bed_time_milli: 30 * MIN, total_awake_time_milli: 4 * MIN, total_light_sleep_time_milli: 20 * MIN, total_slow_wave_sleep_time_milli: 0, total_rem_sleep_time_milli: 6 * MIN } },
  };
  const nuit: SommeilWhoop = { ...nap, id: "nuit", start: new Date(a(23, 0, -1)).toISOString(), end: new Date(a(7, 0)).toISOString(), nap: false };
  assert.equal(await importerSiestesWhoop(db, [nap, nuit], MAINTENANT), 1);
  assert.equal(await importerSiestesWhoop(db, [nap], MAINTENANT), 0, "pas de réimport");
  const sauna = { id: "w1", debut: a(19, 5), fin: a(19, 20), sportId: 233, sport: "Sauna", strain: 2, kj: 100, fcMoy: 98, fcMax: 120, distanceM: null, zones: null } as SeanceConvertie;
  const air = { ...sauna, id: "w2", sportId: 236 } as SeanceConvertie;
  const course = { ...sauna, id: "w3", sportId: 0 } as SeanceConvertie;
  assert.deepEqual([sauna, air, course].map(estRecupWhoop), [true, false, false]);
  assert.equal(await importerActivitesWhoop(db, [sauna, air, course], MAINTENANT), 1);
  const l = await lireRecupEntre(db, jour(0), jour(1));
  assert.deepEqual(l.map((x) => [x.type, x.sommeilMin, x.fcMoy, x.sources, x.idExterne]), [
    ["sieste", 26, null, ["whoop"], "whoop-sieste:nap-1"],
    ["sauna", null, 98, ["whoop"], "whoop:w1"],
  ]);
});

test("deux appareils mesurent la même sieste : Whoop prime ; une session supprimée par la personne ne revient pas", async () => {
  const { db } = await baseDeTest();
  await importerRecupSante(db, jour(-1), MAINTENANT, { sessionsSommeil: async () => [{ debut: a(14, 11), fin: a(14, 31), minutes: 19, phases: null, origine: "com.sec.android.app.shealth" }] }, MAINTENANT);
  const nap: SommeilWhoop = {
    id: "nap-2", start: new Date(a(14, 10)).toISOString(), end: new Date(a(14, 30)).toISOString(), nap: true, score_state: "SCORED",
    score: { stage_summary: { total_in_bed_time_milli: 20 * MIN, total_awake_time_milli: 2 * MIN, total_light_sleep_time_milli: 18 * MIN, total_slow_wave_sleep_time_milli: 0, total_rem_sleep_time_milli: 0 } },
  };
  await importerSiestesWhoop(db, [nap], MAINTENANT);
  const l = await lireRecupEntre(db, jour(0), jour(1));
  assert.deepEqual(l.map((x) => x.sources), [["whoop"]]);
  await supprimerRecup(db, l[0]!.id, MAINTENANT);
  assert.equal(await importerSiestesWhoop(db, [nap], MAINTENANT + MIN), 0);
  assert.deepEqual(await lireRecupEntre(db, jour(0), jour(1)), []);
});

test("la sieste compte dans la Récupération du lendemain, pas dans celle du jour ; la saisie après coup est pré-remplie comme la dernière", async () => {
  const { db, raw } = await baseDeTest();
  // 50 nuits Whoop : 7 h 00 de sommeil pour un besoin de 7 h 30
  const ins = raw.prepare("INSERT INTO whoop_jour (jour, vfc, fc_repos, sommeil_debut, sommeil_fin, sommeil_min, besoin_base_min, maj_le) VALUES (?,?,?,?,?,?,?,?)");
  for (let n = -49; n <= 1; n++) ins.run(jour(n), [52, 56, 60, 54, 58][(n + 50) % 5]!, 53, a(0, 0, n), a(7, 0, n), 420, 450, 1);
  await ecrireNuitsRecup(db, jour(-49), jour(1), { maintenant: a(8, 0, 1) });
  const avant = await lireRecupJour(db, jour(1));
  await enregistrerRecup(db, { type: "sieste", debut: a(14, 0), fin: a(15, 35), mode: "minuteur", choisi: 90 }, MAINTENANT);
  const jourMeme = await lireRecupJour(db, jour(0));
  const lendemain = await lireRecupJour(db, jour(1));
  assert.equal(lendemain.detail.sommeil.sieste, 90);
  assert.ok(lendemain.brut > avant.brut, "la sieste relève un peu la Récupération de demain");
  assert.equal(lendemain.detail.sommeil.dormi, avant.detail.sommeil.dormi, "la nuit ne change pas");
  assert.equal(jourMeme.detail.sommeil.sieste, 0);
  await enregistrerRecup(db, { type: "sauna", debut: a(19, 5), fin: a(19, 20), mode: "apres-coup" }, MAINTENANT);
  const d = await derniereDuType(db, "sauna");
  assert.deepEqual([d!.debut, (d!.fin - d!.debut) / MIN], [a(19, 5), 15]);
});

test("le sauna garde ses kcal aux MET dans la dépense du jour (15 min, 75 kg, 1 750 kcal : 6 kcal) ; les autres activités n'en ont pas", async () => {
  const { db } = await baseDeTest();
  const id = await enregistrerRecup(db, { type: "sauna", debut: a(19, 5), fin: a(19, 20), mode: "apres-coup" }, MAINTENANT);
  await enregistrerRecup(db, { type: "massage", debut: a(17, 0), fin: a(17, 30), mode: "apres-coup" }, MAINTENANT);
  const l = await seancesPepfit(db, jour(0), jour(1));
  assert.deepEqual(l.map((x) => [x.id, x.sportId, x.nom]), [[`recup:${id}`, "cat:sauna", "Récupération, Sauna"]]);
  const k = kcalSeance({ minutes: 15, sportId: l[0]!.sportId, fcMoy: 120 }, { sexe: "h", kg: 75, age: 40 }, 1750);
  assert.deepEqual([Math.round(k.kcal), k.methode], [6, "met"]);
  // supprimée : plus rien dans la dépense
  await supprimerRecup(db, id);
  assert.deepEqual(await seancesPepfit(db, jour(0), jour(1)), []);
  assert.equal(await lireRecup(db, id), null);
});

test("ce qui marche pour toi, depuis la base : la VFC des lendemains de sauna face à ta norme ; sous 8 fois, on attend", async () => {
  const { db, raw } = await baseDeTest();
  const ins = raw.prepare("INSERT INTO recup_nuit (jour, rmssd, rang, maj_le) VALUES (?, ?, 4, 1)");
  const iso = (n: number) => {
    const d = new Date(jour(n));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  // 100 nuits autour de 56 ms ; les 12 lendemains de sauna à 62 ms
  const saunas = new Set([-50, -46, -42, -38, -33, -29, -25, -20, -16, -12, -7, -3]);
  for (let n = -99; n <= 0; n++) ins.run(iso(n), saunas.has(n - 1) ? 62 + (n % 3) : 56 + ((n * 7) % 5) - 2, );
  for (const n of saunas) await enregistrerRecup(db, { type: "sauna", debut: a(19, 0, n), fin: a(19, 15, n), mode: "apres-coup" }, MAINTENANT);
  for (const n of [-30, -10, -4]) await enregistrerRecup(db, { type: "bain-froid", debut: a(7, 0, n), fin: a(7, 3, n), mode: "apres-coup" }, MAINTENANT);
  const m = await lireCeQuiMarche(db, MAINTENANT);
  assert.deepEqual(m.map((x) => [x.type, x.etat.etat]), [["sauna", "net"], ["bain-froid", "attente"]]);
  const s = m[0]!;
  assert.ok(s.etat.etat === "net" && s.etat.ecart > 0.06 && s.etat.n === 12);
  assert.ok(s.avecMs! > s.sansMs!);
  assert.deepEqual(m[1]!.etat, { etat: "attente", n: 3, manque: 5 });
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
}

test("deux téléphones : la sieste voyage chiffrée ; la même session importée sur les deux n'en fait qu'une ; une suppression part partout", async () => {
  await pret();
  assert.deepEqual(tableSync("recup_activite")!.sensibles, ["sommeil_min", "fc_moy", "fc_debut", "fc_fin", "ressenti"]);
  const cle = aleatoire(32);
  const serveur = new FauxServeur();
  const A = await baseDeTest();
  const B = await baseDeTest();
  const sync = (t: { db: typeof A.db }, noeud: string) => synchroniser({ db: t.db, transport: serveur.transport(), cle, noeud });
  const id = await enregistrerRecup(A.db, { type: "sieste", debut: a(14, 7), fin: a(14, 32), mode: "minuteur", choisi: 20, sommeilMin: 19, ressenti: "repose" }, MAINTENANT);
  await sync(A, "A");
  const charge = serveur.lignes.get(`recup_activite/${id}`)!.charge ?? "";
  assert.equal(/"sommeil_min":19|repose/.test(charge), false, "le sommeil et le ressenti voyagent chiffrés");
  await sync(B, "B");
  assert.deepEqual((await lireRecup(B.db, id))!.ressenti, "repose");
  // le même bain froid de Whoop importé sur les deux téléphones avant leur synchro
  const bain = { id: "w9", debut: a(7, 0), fin: a(7, 3), sportId: 88, sport: "Ice Bath", strain: 1, kj: 10, fcMoy: 80, fcMax: 90, distanceM: null, zones: null } as SeanceConvertie;
  await importerActivitesWhoop(A.db, [bain], MAINTENANT);
  await importerActivitesWhoop(B.db, [bain], MAINTENANT + 1000);
  await sync(A, "A");
  await sync(B, "B");
  await sync(A, "A");
  for (const t of [A, B]) {
    const n = t.raw.prepare("SELECT COUNT(*) AS n FROM recup_activite WHERE id_externe = 'whoop:w9'").get() as { n: number };
    assert.equal(n.n, 1);
  }
  // supprimée sur B : partie sur A aussi
  await supprimerRecup(B.db, id, MAINTENANT + 2000);
  await sync(B, "B");
  await sync(A, "A");
  assert.equal(await lireRecup(A.db, id), null);
});
