// Sieste du 01/11 : l'alarme devait passer « Ne pas déranger » (avertissement seulement quand rien ne passerait) et la mesure
// de la montre devait primer sur les 90 min « au lit − 5 » de pepfit. Le cas réel : pepfit 15:00 → 16:35 (cycle complet de
// 90 min), sieste Whoop saisie à la main 15:04 → 16:29, 83 min de sommeil. Une seule sieste, 83 min, dette recalculée ; la
// relecture différée (recuperer-releve.ts) qui la ramène après la fin.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { avertissementAlarme } from "../src/ecrans/alerte-sieste.ts";
import { ecrireNuitsRecup } from "../src/ecrans/recup-donnees.ts";
import { enregistrerRecup, importerSiestesWhoop, lireRecup, lireRecupEntre } from "../src/ecrans/recuperer-donnees.ts";
import { demarrerRecup, lireDetteDuJour, terminerRecup } from "../src/ecrans/recuperer-session.ts";
import {
  apresReleve, attendreMontre, attentesDe, DELAIS_RELEVE, echeanceReleve, enAttenteDeMontre, lireAttentes, prochaineReleve, relireMontre,
} from "../src/ecrans/recuperer-releve.ts";
import type { DiagAlarme } from "../src/natif/alarme-recup/types.ts";
import type { SommeilWhoop } from "../src/whoop/types.ts";

const MIN = 60_000;
const jour = (n: number) => new Date(2026, 9, 30 + n).getTime();
const a = (h: number, m: number, n = 0) => jour(n) + (h * 60 + m) * MIN;

const napAlex: SommeilWhoop = {
  id: "nap-alex", start: new Date(a(15, 4)).toISOString(), end: new Date(a(16, 29)).toISOString(), nap: true, score_state: "SCORED",
  score: {
    stage_summary: {
      total_in_bed_time_milli: 84 * MIN, total_awake_time_milli: 1 * MIN, total_light_sleep_time_milli: 27 * MIN,
      total_slow_wave_sleep_time_milli: 32 * MIN, total_rem_sleep_time_milli: 24 * MIN,
    },
  },
} as SommeilWhoop;

async function baseAvecNuits() {
  const b = await baseDeTest();
  // 50 nuits de 7 h pour un besoin de 7 h 30 : une dette de sommeil à recalculer
  const ins = b.raw.prepare("INSERT INTO whoop_jour (jour, vfc, fc_repos, sommeil_debut, sommeil_fin, sommeil_min, besoin_base_min, maj_le) VALUES (?,?,?,?,?,?,?,?)");
  for (let n = -49; n <= 1; n++) ins.run(jour(n), [52, 56, 60, 54, 58][(n + 50) % 5]!, 53, a(0, 0, n), a(7, 0, n), 420, 450, 1);
  await ecrireNuitsRecup(b.db, jour(-49), jour(1), { maintenant: a(8, 0, 1) });
  return b;
}

const pepfit = { type: "sieste", debut: a(15, 0), fin: a(16, 35), mode: "minuteur", choisi: 90 } as const;

test("cas réel : pepfit (90 min comptées) puis la sieste Whoop : une seule sieste, 83 min, la dette suit", async () => {
  const { db } = await baseAvecNuits();
  const id = await enregistrerRecup(db, pepfit, a(16, 35));
  const avant = (await lireDetteDuJour(db, a(17, 0)))!;
  assert.equal(avant.siestes, 90, "sans la montre : la durée au lit moins 5 min");
  assert.equal(await importerSiestesWhoop(db, [napAlex], a(16, 40)), 1);
  const l = await lireRecupEntre(db, jour(0), jour(1));
  assert.equal(l.length, 1, "une seule sieste");
  assert.deepEqual([l[0]!.id, l[0]!.sommeilMin, l[0]!.sources.slice().sort()], [id, 83, ["pepfit", "whoop"]]);
  const apres = (await lireDetteDuJour(db, a(17, 0)))!;
  assert.equal(apres.siestes, 83);
  assert.equal(apres.avant, avant.avant, "la dette avant la sieste ne bouge pas");
  assert.equal(apres.apres, Math.max(0, apres.avant - 83));
  assert.ok(apres.apres > avant.apres || avant.apres === 0, "la dette d'après est celle de 83 min, pas de 90");
});

test("la mesure de Whoop prime quel que soit l'ordre d'arrivée", async () => {
  const { db } = await baseAvecNuits();
  assert.equal(await importerSiestesWhoop(db, [napAlex], a(16, 31)), 1);
  const id = await enregistrerRecup(db, pepfit, a(16, 35));
  const l = await lireRecupEntre(db, jour(0), jour(1));
  assert.equal(l.length, 1);
  assert.equal(l[0]!.sommeilMin, 83);
  assert.ok(l[0]!.sources.includes("whoop"));
  assert.equal((await lireRecup(db, id))?.sommeilMin ?? 83, 83);
});

test("sans montre, la sieste compte la durée au lit moins 5 min (inchangé)", async () => {
  const { db } = await baseAvecNuits();
  await enregistrerRecup(db, pepfit, a(16, 35));
  assert.equal((await lireDetteDuJour(db, a(17, 0)))!.siestes, 90);
});

// ---------------------------------------------------------------- la relecture différée

test("une sieste finie attend la mesure ; les relectures suivent 2, 5, 10, 20, 40, 90, 180, 360 min après la fin", async () => {
  const { db } = await baseDeTest();
  await demarrerRecup(db, { type: "sieste", choisi: 90 }, a(15, 0));
  const id = (await terminerRecup(db, a(16, 35)))!;
  assert.equal(await enAttenteDeMontre(db, id), true);
  const [att] = await attentesDe(db);
  assert.deepEqual(att, { id, fin: a(16, 35), faites: 0 });
  assert.equal(echeanceReleve(att!), a(16, 37));
  assert.equal(await prochaineReleve(db, a(16, 35)), 2 * MIN);
  assert.deepEqual(DELAIS_RELEVE, [2, 5, 10, 20, 40, 90, 180, 360]);
  // appli rouverte tard : une seule relecture pour toutes les échéances passées
  assert.equal(apresReleve(att!, a(17, 30)).faites, 5, "2, 5, 10, 20 et 40 min sont passées, pas 90");
  assert.equal(echeanceReleve({ ...att!, faites: 8 }), null);
  assert.deepEqual(lireAttentes("pas du json"), []);
  assert.deepEqual(lireAttentes(JSON.stringify([{ id: "x", fin: 1, faites: 0 }, { id: 3 }])), [{ id: "x", fin: 1, faites: 0 }]);
});

test("une activité (sauna) n'attend aucune montre", async () => {
  const { db } = await baseDeTest();
  await demarrerRecup(db, { type: "sauna", choisi: 15 }, a(19, 0));
  const id = (await terminerRecup(db, a(19, 16)))!;
  assert.equal(await enAttenteDeMontre(db, id), false);
});

test("relireMontre : rien avant l'échéance ; à l'échéance la montre est lue, la mesure absorbe la session et sort de l'attente", async () => {
  const { db } = await baseAvecNuits();
  const id = await enregistrerRecup(db, pepfit, a(16, 35));
  await attendreMontre(db, id, a(16, 35));
  const appels: string[] = [];
  const deps = {
    montre: async () => true,
    whoop: async () => {
      appels.push("whoop");
      await importerSiestesWhoop(db, [napAlex], a(16, 40));
    },
    sante: async () => void appels.push("sante"),
  };
  assert.equal(await relireMontre(db, deps, a(16, 36)), 0, "trop tôt");
  assert.deepEqual(appels, []);
  assert.equal(await relireMontre(db, deps, a(16, 38)), 1);
  assert.deepEqual(appels, ["whoop", "sante"]);
  assert.equal((await lireRecup(db, id))!.sommeilMin, 83);
  assert.equal(await enAttenteDeMontre(db, id), false);
  assert.equal(await prochaineReleve(db, a(16, 40)), null);
});

test("relireMontre : la mesure qui n'est pas là garde l'attente, l'échéance suivante avance ; sans montre reliée, l'attente est abandonnée", async () => {
  const { db } = await baseAvecNuits();
  const id = await enregistrerRecup(db, pepfit, a(16, 35));
  await attendreMontre(db, id, a(16, 35));
  const vide = { montre: async () => true, whoop: async () => {}, sante: async () => {} };
  assert.equal(await relireMontre(db, vide, a(16, 38)), 0);
  assert.deepEqual(await attentesDe(db), [{ id, fin: a(16, 35), faites: 1 }]);
  assert.equal(await enAttenteDeMontre(db, id), true);
  assert.equal(await relireMontre(db, { ...vide, montre: async () => false }, a(16, 41)), 0);
  assert.deepEqual(await attentesDe(db), []);
  assert.equal((await lireRecup(db, id))!.sommeilMin, null);
});

test("relireMontre : une sieste supprimée sort de l'attente ; une erreur de lecture ne casse rien", async () => {
  const { db } = await baseAvecNuits();
  const id = await enregistrerRecup(db, pepfit, a(16, 35));
  await attendreMontre(db, id, a(16, 35));
  await db.runAsync("UPDATE recup_activite SET supprime = 1 WHERE id = ?", [id]);
  const casse = { montre: async () => true, whoop: async () => Promise.reject(new Error("réseau")), sante: async () => {} };
  const err = console.error;
  console.error = () => {};
  try {
    assert.equal(await relireMontre(db, casse, a(16, 40)), 0);
  } finally {
    console.error = err;
  }
  assert.deepEqual(await attentesDe(db), []);
});

// ---------------------------------------------------------------- l'avertissement au démarrage

const diag = (c: Partial<DiagAlarme> = {}): DiagAlarme => ({ neDeranger: "non", alarmesPermises: true, sonnerie: "normal", volumeAlarme: 5, pleinEcran: true, heureExacte: true, economie: false, ...c });

test("avertissementAlarme : seulement quand l'alarme ne passerait vraiment pas", () => {
  assert.equal(avertissementAlarme(null), null, "sans module natif : rien à dire");
  assert.equal(avertissementAlarme(diag()), null);
  assert.equal(avertissementAlarme(diag({ sonnerie: "silencieux" })), null, "sonnerie coupée : l'alarme passe");
  assert.equal(avertissementAlarme(diag({ sonnerie: "vibreur" })), null);
  assert.equal(avertissementAlarme(diag({ neDeranger: "alarmes" })), null, "alarmes seulement : elle passe");
  assert.equal(avertissementAlarme(diag({ neDeranger: "priorite", alarmesPermises: true })), null, "priorité avec l'exception alarmes : elle passe");
  assert.equal(avertissementAlarme(diag({ neDeranger: "priorite", alarmesPermises: false })), "bloquee");
  assert.equal(avertissementAlarme(diag({ neDeranger: "total" })), "total");
  assert.equal(avertissementAlarme(diag({ volumeAlarme: 0 })), "volume");
  assert.equal(avertissementAlarme(diag({ heureExacte: false })), "retard", "« Alarmes et rappels » refusée : elle sonne, en retard peut-être");
  assert.equal(avertissementAlarme(diag({ heureExacte: false, volumeAlarme: 0 })), "volume", "ce qui coupe l'alarme passe avant le retard");
});
