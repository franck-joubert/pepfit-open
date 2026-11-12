// Connexion Polar (AccessLink v3) : conversion (durées ISO, heures locales et fuseaux, échantillons, stades), client de l'API
// (Bearer, inscription, 401/404/409/429/5xx), synchro sur une base SQLite réelle (historique puis incrémental), dédoublonnage
// avec Santé Connect et la saisie pepfit, usage par les calculs communs (Effort, kcal, Récupération, Précision), source Santé
// fusionnée, déconnexion (garder ou effacer).
// Réponses : les exemples de la documentation (https://www.polar.com/accesslink-api/ : « Exercise », « Continuous heart rate »,
// « Sleep », « Nightly Recharge », « Activity », « Register user »), mêmes champs et mêmes formes, dates ramenées en octobre
// 2026 et échantillons allongés pour faire une vraie séance. Aucun appel réel à Polar.
import { describe, expect, it } from "./attendu.ts";
import { baseDeTest, jour } from "./aide.ts";
import { ErreurWhoop } from "../src/whoop/types.ts";
import { creerApi, type ApiPolar } from "../src/polar/api.ts";
import {
  convertirActivite, convertirFcContinue, convertirNuit, convertirRecharge, convertirSeance, dureeIso, instantDeNuit, instantLocal, libelleSport, sportWhoop,
} from "../src/polar/convertir.ts";
import { enregistrerSeances, purgerPolar } from "../src/polar/depot.ts";
import { joursEntre, synchroniserPolar } from "../src/polar/synchro.ts";
import { avecPolar, fusionnerNuits, journee, lecteurPolar, oublierPolar } from "../src/polar/source.ts";
import { REGLAGE, SOURCE_POLAR } from "../src/polar/constantes.ts";
import type { ActivitePolar, FcContinuePolar, NuitPolar, RechargePolar, SeancePolar } from "../src/polar/types.ts";
import { ajouterMesures, historiqueMesure } from "../src/db/depots/mesures.ts";
import { ecrireReglage, lireReglage } from "../src/db/depots/reglages.ts";
import { fabriquerSante } from "../src/natif/sante/logique.ts";
import type { Sante, SommeilNuit } from "../src/natif/sante/types.ts";
import { effortSeance } from "../src/ecrans/effort-charges.ts";
import { lireFcMinutes, PREFIXE_FC_MINUTES } from "../src/ecrans/kcal-fc.ts";
import { ecrireNuitsRecup } from "../src/ecrans/recup-donnees.ts";
import { lireDonneesPrecision } from "../src/precision/lire.ts";
import { nouvelId } from "../src/db/id.ts";

const MIN = 60_000;
const H = 3_600_000;
const J = 24 * H;
const MAINTENANT = jour(2026, 10, 30, 12, 0);
const decalage = (ms: number) => -new Date(ms).getTimezoneOffset(); // minutes, comme start_time_utc_offset

/** Heure locale « AAAA-MM-JJTHH:MM:SS » (sans fuseau) de `ms`, comme Polar l'écrit pour une séance. */
const local = (ms: number) => {
  const d = new Date(ms);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
};
/** Même chose avec le fuseau (« +01:00 »), comme les bornes d'une nuit. */
const avecFuseau = (ms: number) => {
  const m = decalage(ms);
  const z = (n: number) => String(Math.abs(n)).padStart(2, "0");
  return `${local(ms)}${m < 0 ? "-" : "+"}${z(Math.trunc(m / 60))}:${z(m % 60)}`;
};

const DEBUT_COURSE = jour(2026, 10, 29, 18, 0);
/** Exemple « Exercise » de la documentation : 45 min de course, FC toutes les 5 s (sample-type 0), vitesse (1), tracé. */
function course(o: Partial<SeancePolar> = {}): SeancePolar {
  const fc = Array.from({ length: 540 }, (_, i) => (i === 7 ? "null" : String(140 + (i % 20))));
  return {
    id: "2AC312F",
    upload_time: "2026-10-29T19:10:02.000Z",
    device: "Polar M400",
    start_time: local(DEBUT_COURSE),
    start_time_utc_offset: decalage(DEBUT_COURSE),
    duration: "PT45M",
    calories: 530,
    distance: 7600,
    heart_rate: { average: 149, maximum: 167 },
    training_load: 143.22,
    sport: "RUNNING",
    has_route: true,
    detailed_sport_info: "RUNNING",
    heart_rate_zones: [
      { index: 1, "lower-limit": 110, "upper-limit": 130, "in-zone": "PT4S" },
      { index: 2, "lower-limit": 130, "upper-limit": 150, "in-zone": "PT30M" },
      { index: 3, "lower-limit": 150, "upper-limit": 170, "in-zone": "PT14M56S" },
    ],
    samples: [
      { "recording-rate": 5, "sample-type": "1", data: "0,10.2,10.5,11" },
      { "recording-rate": 5, "sample-type": "0", data: fc.join(",") },
    ],
    route: [
      { latitude: 48.8566, longitude: 5.8059, time: "PT0S", satellites: 4, fix: 1 },
      { latitude: 48.8571, longitude: 5.8068, time: "PT210.026S", satellites: 7, fix: 3 },
      { latitude: 48.8580, longitude: 5.8081, time: "PT420S", satellites: 7, fix: 3 },
    ],
    ...o,
  };
}

const COUCHER = jour(2026, 10, 29, 23, 39) + 7_000;
const REVEIL = jour(2026, 10, 30, 7, 19) + 37_000;
/** Exemple « Sleep » de la documentation, nuit du 29 au 30 octobre. */
const NUIT: NuitPolar = {
  date: "2026-10-30",
  sleep_start_time: avecFuseau(COUCHER),
  sleep_end_time: avecFuseau(REVEIL),
  light_sleep: 14400,
  deep_sleep: 5400,
  rem_sleep: 5400,
  unrecognized_sleep_stage: 0,
  total_interruption_duration: 1200,
  sleep_score: 80,
  sleep_cycles: 6,
  hypnogram: { "23:39": 2, "23:50": 3, "01:23": 4, "03:00": 1, "05:00": 0, "05:05": 2 },
  heart_rate_samples: { "23:41": 76, "23:46": 77, "00:51": 56 },
};
/** Exemple « Nightly Recharge » de la documentation. */
const RECHARGE: RechargePolar = {
  date: "2026-10-30",
  heart_rate_avg: 52,
  beat_to_beat_avg: 1150,
  heart_rate_variability_avg: 68,
  breathing_rate_avg: 14.1,
  nightly_recharge_status: 3,
  ans_charge: 0,
};
/** Exemple « Continuous heart rate » de la documentation. */
const fcDuJour = (date: string): FcContinuePolar => ({
  date,
  heart_rate_samples: [
    { heart_rate: 63, sample_time: "00:02:08" },
    { heart_rate: 62, sample_time: "00:07:08" },
  ],
});
/** Exemple « Activity » de la documentation. */
const activite = (date: string, steps = 8823): ActivitePolar => ({
  start_time: `${date}T08:15:30`,
  end_time: `${date}T23:59:59`,
  active_duration: "PT3H11M",
  inactive_duration: "PT18H23M30S",
  calories: 2500,
  active_calories: 1500,
  steps,
  distance_from_steps: 4590.53,
});

describe("Polar : conversion", () => {
  it("durées ISO 8601 ; heure locale avec décalage (start_time_utc_offset) ou dans le fuseau du téléphone", () => {
    expect(dureeIso("PT2H44M45S")).toBe((2 * 3600 + 44 * 60 + 45) * 1000);
    expect(dureeIso("PT210.026S")).toBe(210_026);
    expect(dureeIso("PT4S")).toBe(4000);
    expect(dureeIso("P1DT2H")).toBe(26 * H);
    expect(dureeIso("n'importe quoi")).toBe(0);
    expect(instantLocal("2008-10-13T10:40:02", 180)).toBe(Date.UTC(2008, 9, 13, 7, 40, 2));
    expect(instantLocal("2026-10-29T18:00:00")).toBe(DEBUT_COURSE);
  });

  it("séance : bornes, FC (sample-type 0, « null » écarté), vitesse ignorée, zones en minutes, tracé, sport", () => {
    const s = convertirSeance(course())!;
    expect([s.id, s.debut, s.fin, s.sport, s.kcal, s.distanceM, s.fcMoy, s.fcMax]).toEqual(["2AC312F", DEBUT_COURSE, DEBUT_COURSE + 45 * MIN, "RUNNING", 530, 7600, 149, 167]);
    expect(s.fc).toHaveLength(539);
    expect(s.fc[0]).toEqual({ t: DEBUT_COURSE, bpm: 140 });
    expect(s.fc[7]).toEqual({ t: DEBUT_COURSE + 8 * 5000, bpm: 148 });
    expect(s.zones).toEqual([0.07, 30, 14.93]);
    expect(s.trace.map((p) => p.t - DEBUT_COURSE)).toEqual([0, 210_026, 420_000]);
    expect(convertirSeance(course({ duration: "?" }))).toBeNull();
    expect(convertirSeance(course({ samples: null, route: null }))!.fc).toEqual([]);
  });

  it("nuit : heures « HH:MM » qui passent minuit, phases (min), stades de Santé Connect, FC de nuit", () => {
    const n = convertirNuit(NUIT)!;
    expect([n.jour, n.debut, n.fin]).toEqual(["2026-10-30", COUCHER, REVEIL]);
    expect(n.phases).toEqual({ leger: 240, profond: 90, paradoxal: 90, eveil: 20 });
    expect(n.minutes).toBe(420);
    expect(instantDeNuit("01:23", NUIT.sleep_start_time)).toBe(jour(2026, 10, 30, 1, 23));
    expect(instantDeNuit("23:39", NUIT.sleep_start_time)).toBe(jour(2026, 10, 29, 23, 39));
    // 2 et 3 (léger) -> 4 ; 4 (profond) -> 5 ; 1 (paradoxal) -> 6 ; 0 (éveil) -> 1
    expect(n.etapes.map((e) => e.type)).toEqual([4, 4, 5, 6, 1, 4]);
    expect(n.etapes[0]!.debut).toBe(COUCHER);
    expect(n.etapes.at(-1)!.fin).toBe(REVEIL);
    expect(n.fc.map((x) => [x.t, x.bpm])).toEqual([[jour(2026, 10, 29, 23, 41), 76], [jour(2026, 10, 29, 23, 46), 77], [jour(2026, 10, 30, 0, 51), 56]]);
  });

  it("Nightly Recharge, FC continue (heure de l'appareil), activité du jour, sport Polar -> activité", () => {
    expect(convertirRecharge(RECHARGE)).toEqual({ jour: "2026-10-30", fcMoy: 52, rmssd: 68, respiration: 14.1 });
    expect(convertirRecharge({ date: "2026-10-30", heart_rate_variability_avg: 0 }).rmssd).toBeNull();
    expect(convertirFcContinue(fcDuJour("2026-10-30"))).toEqual([{ t: jour(2026, 10, 30, 0, 2) + 8000, bpm: 63 }, { t: jour(2026, 10, 30, 0, 7) + 8000, bpm: 62 }]);
    expect(convertirActivite(activite("2026-10-29"))).toEqual({ jour: "2026-10-29", pas: 8823, kcal: 2500, kcalActives: 1500, distanceM: 4590.53, actifMin: 191 });
    expect([sportWhoop("RUNNING"), sportWhoop("TRAIL_RUNNING"), sportWhoop("MOUNTAIN_BIKING"), sportWhoop("INDOOR_CYCLING"), sportWhoop("STRENGTH_TRAINING"), sportWhoop("TABLE_TENNIS"), sportWhoop("OTHER")]).toEqual([0, 0, 57, 1, 45, 230, null]);
    expect(libelleSport("STRENGTH_TRAINING")).toBe("Strength training");
  });
});

/** fetch simulé : chaque appel reçoit la réponse suivante ; les demandes sont gardées. */
function fetchSimule(reponses: ({ status: number; json?: unknown } | "panne")[]) {
  const appels: { url: string; methode: string; corps: string | undefined; jeton: string }[] = [];
  const f = async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    appels.push({ url, methode: init?.method ?? "GET", corps: init?.body, jeton: init?.headers?.Authorization ?? "" });
    const r = reponses.shift();
    if (!r || r === "panne") throw new TypeError("Network request failed");
    return { status: r.status, json: async () => r.json };
  };
  return { f, appels };
}
const deps = (f: unknown, attentes: number[] = []) => ({ acces: async () => "AT-POLAR", fetch: f as never, attendre: async (ms: number) => void attentes.push(ms) });
const code = async (p: Promise<unknown>) => ((await p.catch((x: unknown) => x)) as ErreurWhoop).code;

describe("Polar : client AccessLink", () => {
  it("Bearer, adresses de la documentation ; inscription (POST /v3/users, member-id) : 200 et 409 (déjà inscrit) sont bons", async () => {
    const { f, appels } = fetchSimule([
      { status: 200, json: { "polar-user-id": 2278512, "member-id": "pepfit-x" } },
      { status: 409 },
      { status: 200, json: [course()] },
      { status: 200, json: course() },
      { status: 200, json: { nights: [NUIT] } },
      { status: 200, json: { recharges: [RECHARGE] } },
      { status: 200, json: fcDuJour("2026-10-30") },
      { status: 200, json: [activite("2026-10-29")] },
      { status: 204 },
    ]);
    const api = creerApi(deps(f));
    await api.inscrire("pepfit-x");
    await api.inscrire("pepfit-x");
    expect(await api.seances()).toHaveLength(1);
    expect((await api.seance("2AC312F"))?.id).toBe("2AC312F");
    expect(await api.nuits()).toHaveLength(1);
    expect(await api.recharges()).toHaveLength(1);
    expect((await api.fcJour("2026-10-30"))?.heart_rate_samples).toHaveLength(2);
    expect(await api.activites("2026-10-03", "2026-10-30")).toHaveLength(1);
    await api.desinscrire("10579");
    expect(appels.map((a) => `${a.methode} ${a.url.replace("https://www.polaraccesslink.com", "")}`)).toEqual([
      "POST /v3/users",
      "POST /v3/users",
      "GET /v3/exercises",
      "GET /v3/exercises/2AC312F?samples=true&zones=true&route=true",
      "GET /v3/users/sleep",
      "GET /v3/users/nightly-recharge",
      "GET /v3/users/continuous-heart-rate/2026-10-30",
      "GET /v3/users/activities?from=2026-10-03&to=2026-10-30",
      "DELETE /v3/users/10579",
    ]);
    expect(appels.every((a) => a.jeton === "Bearer AT-POLAR")).toBe(true);
    expect(JSON.parse(appels[0]!.corps!)).toEqual({ "member-id": "pepfit-x" });
  });

  it("404 (rien ce jour-là) : null ; 401 : « expire » ; 403 (consentements) : « refuse » ; panne : « reseau »", async () => {
    expect(await creerApi(deps(fetchSimule([{ status: 404 }]).f)).fcJour("2026-10-01")).toBeNull();
    expect(await code(creerApi(deps(fetchSimule([{ status: 401 }]).f)).nuits())).toBe("expire");
    expect(await code(creerApi(deps(fetchSimule([{ status: 403 }]).f)).inscrire("x"))).toBe("refuse");
    expect(await code(creerApi(deps(fetchSimule(["panne"]).f)).seances())).toBe("reseau");
  });

  it("429 : attend et rejoue, puis « limite » ; 5xx : deux nouveaux essais, puis « serveur »", async () => {
    const attentes: number[] = [];
    const { f } = fetchSimule([{ status: 429 }, { status: 200, json: { nights: [] } }]);
    expect(await creerApi(deps(f, attentes)).nuits()).toEqual([]);
    expect(attentes).toEqual([5000]);
    expect(await code(creerApi(deps(fetchSimule(Array.from({ length: 5 }, () => ({ status: 429 }))).f)).nuits())).toBe("limite");
    const panne = fetchSimule([{ status: 502 }, { status: 503 }, { status: 502 }]);
    expect(await code(creerApi(deps(panne.f)).nuits())).toBe("serveur");
    expect(panne.appels).toHaveLength(3);
  });
});

/** API Polar simulée (réponses de la documentation) ; garde chaque appel. */
function apiSimulee(o: { seances?: SeancePolar[]; nuits?: NuitPolar[]; recharges?: RechargePolar[]; pas?: Record<string, number> } = {}) {
  const appels: string[] = [];
  const seances = o.seances ?? [course()];
  const api: ApiPolar = {
    inscrire: async (m) => void appels.push(`inscrire ${m.startsWith("pepfit-")}`),
    desinscrire: async (id) => void appels.push(`desinscrire ${id}`),
    seances: async () => (appels.push("seances"), seances.map(({ samples: _s, route: _r, heart_rate_zones: _z, ...x }) => x)),
    seance: async (id) => (appels.push(`seance ${id}`), seances.find((s) => s.id === id) ?? null),
    fcJour: async (j) => (appels.push(`fc ${j}`), j === "2026-10-30" ? fcDuJour(j) : null),
    nuits: async () => (appels.push("nuits"), o.nuits ?? [NUIT]),
    recharges: async () => (appels.push("recharges"), o.recharges ?? [RECHARGE]),
    activites: async (de, a) => {
      appels.push(`activites ${de} ${a}`);
      return joursEntre(de, a).flatMap((j) => (o.pas ?? { "2026-10-29": 8823 })[j] != null ? [activite(j, (o.pas ?? { "2026-10-29": 8823 })[j])] : []);
    },
  };
  return { api, appels };
}

const n = async (db: Awaited<ReturnType<typeof baseDeTest>>["db"], sql: string, p: (string | number)[] = []) => (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${sql}`, p))!.n;

describe("Polar : synchro", () => {
  it("premier passage : inscription, séance créée (activité, FC, tracé), nuit et Nightly Recharge, FC continue (28 jours), activité (365 jours)", async () => {
    const { db } = await baseDeTest(true);
    const { api, appels } = apiSimulee();
    const b = await synchroniserPolar(db, api, MAINTENANT);
    expect(b).toMatchObject({ historique: true, seances: { enrichies: 0, creees: 1 }, nuits: 1, mesures: 2, jours: 1 });
    expect(appels.slice(0, 3)).toEqual(["inscrire true", "seances", "seance 2AC312F"]);
    expect(appels.filter((a) => a.startsWith("fc "))).toHaveLength(28);
    expect(appels.filter((a) => a.startsWith("activites "))).toHaveLength(14);
    expect(appels.find((a) => a.startsWith("activites "))).toBe("activites 2025-10-31 2025-11-27"); // 365 jours, aujourd'hui compris

    const s = (await db.getFirstAsync<{ id: string; titre: string; debut: number; fin: number; source_ref: string }>("SELECT id, titre, debut, fin, source_ref FROM seances", []))!;
    expect([s.titre, s.debut, s.fin, s.source_ref]).toEqual(["Course à pied", DEBUT_COURSE, DEBUT_COURSE + 45 * MIN, "polar:2AC312F"]);
    expect(await n(db, "seance_exercices WHERE seance_id = ?", [s.id])).toBe(1);
    expect(await n(db, "seance_fc WHERE seance_id = ?", [s.id])).toBe(539);
    expect(await n(db, "suivi_point WHERE seance_id = ?", [s.id])).toBe(3);
    expect(await db.getFirstAsync("SELECT fc_ecrite, trace_ecrite, kcal FROM polar_seance", [])).toEqual({ fc_ecrite: 1, trace_ecrite: 1, kcal: 530 });

    // VFC (RMSSD) et FC de nuit : mesures du corps datées du réveil ; la respiration reste dans la nuit Polar
    for (const [type, v] of [["vfc", 68], ["fc", 52]] as const) {
      expect((await historiqueMesure(db, type)).map((m) => [m.valeur, m.date, m.source])).toEqual([[v, REVEIL, "polar"]]);
    }
    expect(await db.getFirstAsync("SELECT minutes, profond_min, rmssd, fc_moy, respiration FROM polar_nuit WHERE jour = '2026-10-30'", [])).toEqual({ minutes: 420, profond_min: 90, rmssd: 68, fc_moy: 52, respiration: 14.1 });
    expect(await n(db, "polar_fc")).toBe(5); // 2 points de FC continue, 3 de la nuit
    expect(await db.getFirstAsync("SELECT pas, kcal_actives FROM polar_jour WHERE jour = '2026-10-29'", [])).toEqual({ pas: 8823, kcal_actives: 1500 });
    expect([await lireReglage(db, REGLAGE.inscrit), await lireReglage(db, REGLAGE.curseurFc), await lireReglage(db, REGLAGE.curseurActivite)]).toEqual(["1", "2026-10-30", "2026-10-30"]);
  });

  it("incrémental : la séance connue n'est pas relue, FC et activité depuis la veille ; rejouable sans doublon", async () => {
    const { db } = await baseDeTest(true);
    await synchroniserPolar(db, apiSimulee().api, MAINTENANT);
    const { api, appels } = apiSimulee();
    const b = await synchroniserPolar(db, api, MAINTENANT + 2 * H);
    expect(appels).toEqual(["seances", "nuits", "recharges", "fc 2026-10-29", "fc 2026-10-30", "activites 2026-10-29 2026-10-30"]);
    expect(b).toMatchObject({ historique: false, seances: { enrichies: 0, creees: 0 }, mesures: 0 });
    expect([await n(db, "seances"), await n(db, "seance_fc"), await n(db, "mesure_corps"), await n(db, "polar_fc")]).toEqual([1, 539, 2, 5]);
  });

  it("une erreur en cours de route n'avance pas les curseurs (la reprise relit tout)", async () => {
    const { db } = await baseDeTest(true);
    const { api } = apiSimulee();
    const enPanne: ApiPolar = { ...api, fcJour: async () => Promise.reject(new ErreurWhoop("reseau")) };
    expect(await code(synchroniserPolar(db, enPanne, MAINTENANT))).toBe("reseau");
    expect(await lireReglage(db, REGLAGE.curseurFc)).toBeNull();
    expect(await lireReglage(db, REGLAGE.derniereSynchro)).toBeNull();
  });

  it("nuit lue sans son sommeil (Nightly Recharge seul, datée de 7 h), puis avec : une seule mesure par type", async () => {
    const { db } = await baseDeTest(true);
    await synchroniserPolar(db, apiSimulee({ nuits: [] }).api, MAINTENANT);
    expect((await historiqueMesure(db, "vfc")).map((m) => m.date)).toEqual([jour(2026, 10, 30, 7, 0)]);
    await synchroniserPolar(db, apiSimulee().api, MAINTENANT + H);
    expect((await historiqueMesure(db, "vfc")).map((m) => [m.valeur, m.date])).toEqual([[68, REVEIL]]);
  });
});

describe("Polar : dédoublonnage", () => {
  it("séance pepfit de course aux mêmes heures : enrichie (pas de nouvelle séance) ; FC du capteur gardée, tracé Polar ajouté", async () => {
    const { db } = await baseDeTest(true);
    const id = nouvelId();
    await db.runAsync("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES (?, 'Footing', ?, ?, 0)", [id, DEBUT_COURSE + 3 * MIN, DEBUT_COURSE + 47 * MIN]);
    await db.runAsync("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES (?, (SELECT id FROM exercices WHERE slug = 'course'), 0)", [id]);
    await db.runAsync("INSERT INTO seance_fc (seance_id, t, s, bpm) VALUES (?, ?, 0, 120)", [id, DEBUT_COURSE + 3 * MIN]);
    const b = await synchroniserPolar(db, apiSimulee().api, MAINTENANT);
    expect(b.seances).toEqual({ enrichies: 1, creees: 0 });
    expect(await n(db, "seances")).toBe(1);
    expect(await n(db, "seance_fc WHERE seance_id = ?", [id])).toBe(1);
    expect(await n(db, "suivi_point WHERE seance_id = ?", [id])).toBe(3);
    expect(await db.getFirstAsync("SELECT seance_id, fc_ecrite, trace_ecrite FROM polar_seance", [])).toEqual({ seance_id: id, fc_ecrite: 0, trace_ecrite: 1 });
  });

  it("séance de musculation aux mêmes heures : famille différente, la course Polar devient sa propre séance", async () => {
    const { db } = await baseDeTest(true);
    const id = nouvelId();
    await db.runAsync("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES (?, 'Pecs', ?, ?, 0)", [id, DEBUT_COURSE, DEBUT_COURSE + 45 * MIN]);
    await db.runAsync("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES (?, (SELECT id FROM exercices WHERE slug = 'bench-press-powerlifting'), 0)", [id]);
    expect((await synchroniserPolar(db, apiSimulee().api, MAINTENANT)).seances).toEqual({ enrichies: 0, creees: 1 });
  });

  it("mesures : la VFC Polar cache celle de Santé Connect de la même nuit ; une autre nuit reste", async () => {
    const { db } = await baseDeTest(true);
    await ajouterMesures(db, "vfc", [{ valeur: 61, date: REVEIL + 20 * MIN, origine: "fi.polar.polarflow" }, { valeur: 55, date: REVEIL - 2 * J, origine: "com.ouraring.oura" }]);
    await synchroniserPolar(db, apiSimulee().api, MAINTENANT);
    expect((await historiqueMesure(db, "vfc")).map((m) => [m.valeur, m.source])).toEqual([[68, "polar"], [55, "sante_connect"]]);
  });
});

/** Santé Connect factice : quelques lectures, le reste comme sans module natif. */
function santeConnect(o: Partial<Sante> = {}): Sante {
  return { ...fabriquerSante(null), ...o };
}

describe("Polar : source Santé fusionnée", () => {
  it("sans donnée Polar : Santé Connect tel quel (autorisations comprises)", async () => {
    const { db } = await baseDeTest();
    oublierPolar();
    const s = avecPolar(santeConnect({ autorisees: async () => ["vfc"] }), lecteurPolar(async () => db));
    expect(await s.autorisees()).toEqual(["vfc"]);
    expect(await s.fcEntre(0, MAINTENANT)).toBeNull();
    expect(await s.nuits(0, MAINTENANT)).toBeNull();
  });

  it("avec Polar : FC réunie, nuit Polar à la place de sa copie, séance Polar Flow écartée, pas complétés, autorisations", async () => {
    const { db } = await baseDeTest(true);
    await synchroniserPolar(db, apiSimulee({ pas: { "2026-10-28": 7000, "2026-10-29": 8823 } }).api, MAINTENANT);
    oublierPolar();
    const copie: SommeilNuit = { debut: COUCHER + MIN, fin: REVEIL - MIN, minutes: 400, phases: null, origine: "fi.polar.polarflow" };
    const autre: SommeilNuit = { debut: COUCHER - 2 * J, fin: REVEIL - 2 * J, minutes: 380, phases: null, origine: "com.sec.android.app.shealth" };
    const sc = santeConnect({
      autorisees: async () => ["sommeil", "sport"],
      fcEntre: async () => [{ t: jour(2026, 10, 30, 0, 4), bpm: 60 }],
      nuits: async () => [autre, copie],
      seancesSport: async () => [
        { debut: DEBUT_COURSE, fin: DEBUT_COURSE + 45 * MIN, type: 56, titre: "Course", origine: "fi.polar.polarflow", kcal: 500, pas: null },
        { debut: DEBUT_COURSE - J, fin: DEBUT_COURSE - J + 30 * MIN, type: 8, titre: "Vélo", origine: "com.garmin.android.apps.connectmobile", kcal: 200, pas: null },
      ],
      pasIntervalles: async (b) => b.slice(1).map((_, i) => (i === 1 ? 9100 : null)),
    });
    const s = avecPolar(sc, lecteurPolar(async () => db), () => MAINTENANT);
    expect(await s.autorisees()).toEqual(["sommeil", "sport", "fc-montre", "pas"]);
    expect((await s.fcEntre(jour(2026, 10, 30, 0, 0), jour(2026, 10, 30, 0, 10)))!.map((x) => x.bpm)).toEqual([63, 60, 62]);
    expect((await s.nuits(0, MAINTENANT))!.map((x) => [x.origine, x.minutes])).toEqual([["com.sec.android.app.shealth", 380], ["polar", 420]]);
    expect((await s.nuits(0, MAINTENANT))!.at(-1)!.etapes).toHaveLength(6);
    expect((await s.seancesSport(0, MAINTENANT))!.map((x) => x.titre)).toEqual(["Vélo"]);
    // trois jours entiers : Santé Connect d'abord (9100), Polar pour les jours sans pas ; une heure seule : jamais Polar
    const j28 = jour(2026, 10, 28, 0, 0);
    expect(await s.pasIntervalles([j28, j28 + J, j28 + 2 * J, j28 + 3 * J])).toEqual([7000, 9100, null]);
    expect(await s.pasIntervalles([j28, j28 + H])).toEqual([null]);
  });

  it("une nuit Polar remplace celles qu'elle recouvre ; journée entière ou aujourd'hui jusqu'à maintenant", () => {
    const p: SommeilNuit = { debut: 10, fin: 20, minutes: 9, phases: null, origine: "polar" };
    expect(fusionnerNuits([{ ...p, debut: 15, fin: 25, origine: "x" }, { ...p, debut: 30, fin: 40, origine: "y" }], [p]).map((x) => x.origine)).toEqual(["polar", "y"]);
    const m = jour(2026, 10, 30, 0, 0);
    expect(journee(m, m + J, MAINTENANT)).toBe("2026-10-30");
    expect(journee(m, MAINTENANT, MAINTENANT)).toBe("2026-10-30");
    expect(journee(m - J, m, MAINTENANT)).toBe("2026-10-29");
    expect(journee(m, m + H, MAINTENANT)).toBe(null);
  });
});

describe("Polar : usage par les calculs communs", () => {
  it("la FC de la séance Polar fait l'Effort (à la FC) et les kcal (FC minute par minute)", async () => {
    const { db } = await baseDeTest(true);
    await synchroniserPolar(db, apiSimulee().api, MAINTENANT);
    const id = (await db.getFirstAsync<{ id: string }>("SELECT id FROM seances", []))!.id;
    const e = (await effortSeance(db, id, undefined, { maintenant: MAINTENANT }))!;
    expect([e.methode, e.sourceFc]).toEqual(["fc", "capteur"]);
    expect(e.charge > 0).toBe(true);
    const minutes = lireFcMinutes(await lireReglage(db, PREFIXE_FC_MINUTES + id));
    expect(minutes?.length).toBe(45);
    expect(minutes!.every((x) => x >= 140)).toBe(true);
  });

  it("la VFC et la FC de nuit, et la nuit de Polar, font la nuit de la Récupération", async () => {
    const { db } = await baseDeTest(true);
    await synchroniserPolar(db, apiSimulee().api, MAINTENANT);
    oublierPolar();
    const s = avecPolar(santeConnect(), lecteurPolar(async () => db), () => MAINTENANT);
    const m = jour(2026, 10, 30, 0, 0);
    await ecrireNuitsRecup(db, m, m, { nuitsSante: (d, f) => s.nuits(d, f), maintenant: MAINTENANT });
    expect(await db.getFirstAsync("SELECT rmssd, fc_repos, sommeil_min, source_vfc, source_sommeil FROM recup_nuit", [])).toEqual({
      rmssd: 68, fc_repos: 52, sommeil_min: 420, source_vfc: SOURCE_POLAR, source_sommeil: "montre",
    });
  });

  it("Précision : Polar connecté est le capteur", async () => {
    const { db } = await baseDeTest();
    await ecrireReglage(db, REGLAGE.connecte, "1");
    expect((await lireDonneesPrecision(db, { sante: false }, MAINTENANT)).d.capteur).toBe("polar");
  });
});

describe("Polar : déconnexion", () => {
  async function monde() {
    const b = await baseDeTest(true);
    const pepfit = nouvelId();
    await b.db.runAsync("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES (?, 'Footing', ?, ?, 0)", [pepfit, DEBUT_COURSE - J, DEBUT_COURSE - J + 40 * MIN]);
    await b.db.runAsync("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES (?, (SELECT id FROM exercices WHERE slug = 'course'), 0)", [pepfit]);
    const veille = course({ id: "VEILLE", start_time: local(DEBUT_COURSE - J), start_time_utc_offset: decalage(DEBUT_COURSE - J), duration: "PT40M" });
    await synchroniserPolar(b.db, apiSimulee({ seances: [veille, course()] }).api, MAINTENANT);
    await ajouterMesures(b.db, "vfc", [{ valeur: 55, date: REVEIL - 3 * J, origine: "com.ouraring.oura" }]);
    return { ...b, pepfit };
  }

  it("effacer : séances créées pour Polar, FC écrite dans la séance pepfit, mesures et tables Polar partent ; la séance pepfit et Santé Connect restent", async () => {
    const { db, pepfit } = await monde();
    expect([await n(db, "seances"), await n(db, "seance_fc WHERE seance_id = ?", [pepfit])]).toEqual([2, 480]);
    await purgerPolar(db, false);
    expect((await db.getAllAsync<{ id: string }>("SELECT id FROM seances", [])).map((x) => x.id)).toEqual([pepfit]);
    expect([await n(db, "seance_fc"), await n(db, "suivi_point"), await n(db, "polar_seance"), await n(db, "polar_fc"), await n(db, "polar_nuit"), await n(db, "polar_jour")]).toEqual([0, 0, 0, 0, 0, 0]);
    expect((await historiqueMesure(db, "vfc")).map((m) => m.source)).toEqual(["sante_connect"]);
    expect(await lireReglage(db, REGLAGE.curseurFc)).toBeNull();
  });

  it("garder : tout reste, seuls l'état de la connexion et les curseurs partent", async () => {
    const { db } = await monde();
    await ecrireReglage(db, REGLAGE.connecte, "1");
    await purgerPolar(db, true);
    expect([await n(db, "seances"), await n(db, "polar_seance"), await n(db, "polar_fc"), await n(db, "mesure_corps WHERE source = 'polar'")]).toEqual([2, 2, 5, 2]);
    expect([await lireReglage(db, REGLAGE.connecte), await lireReglage(db, REGLAGE.curseurFc), await lireReglage(db, REGLAGE.inscrit)]).toEqual([null, null, null]);
  });

  it("enregistrerSeances est rejouable : une séance connue n'est ni recréée ni doublée", async () => {
    const { db } = await baseDeTest(true);
    const s = convertirSeance(course())!;
    expect(await enregistrerSeances(db, [s], MAINTENANT)).toEqual({ enrichies: 0, creees: 1 });
    expect(await enregistrerSeances(db, [s], MAINTENANT)).toEqual({ enrichies: 0, creees: 0 });
    expect([await n(db, "seances"), await n(db, "seance_fc")]).toEqual([1, 539]);
  });
});
