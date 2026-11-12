// Synchro Whoop : pagination (next_token), curseur incrémental, conversion, Whoop prioritaire sur Santé Connect sans doublon,
// séances Whoop qui enrichissent (±10 min) ou créent, idempotence, purge. Base SQLite réelle (migrations de l'appli).
import { describe, expect, it } from "./attendu.ts";
import { baseDeTest, jour } from "./aide.ts";
import type { ApiWhoop } from "../src/whoop/api.ts";
import { REGLAGE } from "../src/whoop/constantes.ts";
import { fusionnerJours, convertirSeance, convertirSommeil, nomSport } from "../src/whoop/convertir.ts";
import { purgerWhoop, seancePepfitCorrespondante, TOLERANCE_MS } from "../src/whoop/depot.ts";
import { synchroniserWhoop, RECOUVREMENT_MS } from "../src/whoop/synchro.ts";
import { nuitsWhoop, fusionnerNuits, resumesSeancesWhoop } from "../src/whoop/lecture.ts";
import { derniereMesure, ajouterMesures, historiqueMesure } from "../src/db/depots/mesures.ts";
import { lireReglage } from "../src/db/depots/reglages.ts";
import { migrer, MIGRATIONS, VERSION_COURANTE } from "../src/db/migrations.ts";
import type { Collection } from "../src/whoop/types.ts";

const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;
const H = 3_600_000;

const reveil = jour(2026, 10, 27, 7, 0);
const sommeil = (id = "sl-1", fin = reveil) => ({
  id, cycle_id: 1, start: iso(fin - 7.5 * H), end: iso(fin), nap: false, score_state: "SCORED",
  score: {
    stage_summary: { total_in_bed_time_milli: 7.5 * H, total_awake_time_milli: 30 * MIN, total_light_sleep_time_milli: 3.5 * H, total_slow_wave_sleep_time_milli: 1.5 * H, total_rem_sleep_time_milli: 2 * H },
    sleep_needed: { baseline_milli: 8 * H, need_from_sleep_debt_milli: 40 * MIN, need_from_recent_strain_milli: 0, need_from_recent_nap_milli: 0 },
    sleep_performance_percentage: 91,
  },
});
const recup = (sleep_id = "sl-1") => ({
  cycle_id: 1, sleep_id, created_at: iso(reveil + 5 * MIN), updated_at: iso(reveil + 5 * MIN), score_state: "SCORED",
  score: { recovery_score: 74, resting_heart_rate: 52, hrv_rmssd_milli: 68.34, spo2_percentage: 96.5, skin_temp_celsius: 33.4 },
});
const cycle = { id: 1, start: iso(reveil), end: null, score_state: "SCORED", score: { strain: 12.34, kilojoule: 9000, average_heart_rate: 70, max_heart_rate: 160 } };
const seanceW = (id: string, debut: number, fin: number, sport = "weightlifting") => ({
  id, start: iso(debut), end: iso(fin), sport_name: sport, sport_id: 45, score_state: "SCORED",
  score: { strain: 9.6, average_heart_rate: 118, max_heart_rate: 160, kilojoule: 800, zone_durations: { zone_zero_milli: 0, zone_one_milli: 5 * MIN, zone_two_milli: 20 * MIN, zone_three_milli: 10 * MIN, zone_four_milli: 0, zone_five_milli: 0 } },
});

/** API simulée : `pages[collection]` = liste de pages ; on garde les appels pour contrôler `start` et `nextToken`. */
function apiSimulee(pages: Partial<Record<Collection, unknown[][]>>, corps = {}) {
  const appels: { c: Collection; start: string; nextToken?: string | null }[] = [];
  const api: ApiWhoop = {
    async page(c, start, nextToken) {
      appels.push({ c, start, nextToken });
      const l = pages[c] ?? [];
      const i = nextToken ? Number(nextToken) : 0;
      return { records: (l[i] ?? []) as never[], next_token: i + 1 < l.length ? String(i + 1) : null };
    },
    corps: async () => corps,
    revoquer: async () => {},
  };
  return { api, appels };
}

describe("conversion", () => {
  it("sommeil : phases, temps endormi, performance, dette ; les siestes et non-notés sont ignorés", () => {
    const j = convertirSommeil(sommeil() as never)!;
    expect(j).toMatchObject({ sommeilMin: 420, legerMin: 210, profondMin: 90, paradoxalMin: 120, eveilMin: 30, sommeilPerf: 91, sommeilDetteMin: 40 });
    expect(convertirSommeil({ ...sommeil(), nap: true } as never)).toBeNull();
    expect(convertirSommeil({ ...sommeil(), score_state: "PENDING_SCORE" } as never)).toBeNull();
  });
  it("séance : zones en minutes, nom du sport lisible", () => {
    const s = convertirSeance(seanceW("w", reveil, reveil + 40 * MIN) as never)!;
    expect(s.zones).toEqual([0, 5, 20, 10, 0, 0]);
    expect(nomSport("weightlifting_msk")).toBe("Weightlifting msk");
    expect(nomSport(undefined)).toBe("Whoop");
  });
  it("fusion par jour : le dernier non nul gagne, rien d'écrasé par null", () => {
    const l = fusionnerJours([{ jour: 1, recup: 50 }, { jour: 1, strain: 3, recup: null }, { jour: 0, kj: 1 }]);
    expect(l).toEqual([{ jour: 0, kj: 1 }, { jour: 1, recup: 50, strain: 3 }]);
  });
});

describe("synchro Whoop", () => {
  it("première synchro : les 4 collections, résumé du jour, mesures en source whoop, curseur posé", async () => {
    const { db } = await baseDeTest();
    const maintenant = reveil + 2 * H;
    const { api, appels } = apiSimulee({ sleep: [[sommeil()]], recovery: [[recup()]], cycle: [[cycle]], workout: [[seanceW("w1", reveil + 3 * H, reveil + 4 * H)]] }, { height_meter: 1.8, weight_kilogram: 80.25, max_heart_rate: 181 });
    const b = await synchroniserWhoop(db, api, maintenant);
    expect(b).toMatchObject({ jours: 1, seances: { enrichies: 0, creees: 1 }, mesures: 2, pages: 4 });
    // 90 jours en arrière à la première synchro
    expect(Date.parse(appels[0]!.start)).toBe(maintenant - 90 * 86_400_000);
    const j = await db.getFirstAsync<Record<string, number>>("SELECT * FROM whoop_jour", []);
    expect(j).toMatchObject({ recup: 74, vfc: 68.3, fc_repos: 52, spo2: 96.5, temp_peau: 33.4, sommeil_min: 420, sommeil_perf: 91, sommeil_dette_min: 40, strain: 12.3, kj: 9000, fc_moy: 70, fc_max: 160 });
    expect((await derniereMesure(db, "vfc", maintenant))).toMatchObject({ valeur: 68.3, source: "whoop", origine: "com.whoop.android" });
    expect((await derniereMesure(db, "fc", maintenant))?.valeur).toBe(52);
    expect(await lireReglage(db, REGLAGE.derniereSynchro)).toBe(String(maintenant));
    // poids et taille
    expect(await db.getFirstAsync("SELECT kg, origine FROM pesee", [])).toEqual({ kg: 80.3, origine: "com.whoop.android" });
    // taille et FC max : mesures Whoop (la saisie, dans « mensurations » et le réglage fc_max, primera à la lecture)
    expect(await db.getFirstAsync("SELECT valeur, source FROM mesure_corps WHERE type = 'taille'", [])).toEqual({ valeur: 180, source: "whoop" });
    expect(await db.getFirstAsync("SELECT valeur FROM mesure_corps WHERE type = 'fc_max'", [])).toEqual({ valeur: 181 });
    expect((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM mensurations", []))!.n).toBe(0);
  });

  it("next_token : toutes les pages sont lues, dans l'ordre", async () => {
    const { db } = await baseDeTest();
    const { api, appels } = apiSimulee({ workout: [[seanceW("a", reveil, reveil + 30 * MIN)], [seanceW("b", reveil + H, reveil + 90 * MIN)], [seanceW("c", reveil + 3 * H, reveil + 4 * H)]] });
    const b = await synchroniserWhoop(db, api, reveil + 5 * H);
    expect(b.seances.creees).toBe(3);
    expect(appels.filter((a) => a.c === "workout").map((a) => a.nextToken ?? null)).toEqual([null, "1", "2"]);
  });

  it("incrémentale : la deuxième synchro repart du curseur moins le recouvrement, sans rien dupliquer", async () => {
    const { db } = await baseDeTest();
    const donnees = { sleep: [[sommeil()]], recovery: [[recup()]], cycle: [[cycle]], workout: [[seanceW("w1", reveil + 3 * H, reveil + 4 * H)]] };
    await synchroniserWhoop(db, apiSimulee(donnees).api, reveil + 5 * H);
    const { api, appels } = apiSimulee(donnees);
    const b = await synchroniserWhoop(db, api, reveil + 6 * H);
    expect(Date.parse(appels.find((a) => a.c === "workout")!.start)).toBe(reveil + 3 * H - RECOUVREMENT_MS);
    expect(b.seances).toEqual({ enrichies: 0, creees: 0, ignorees: 0 });
    expect((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM seances", []))!.n).toBe(1);
    expect((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM whoop_jour", []))!.n).toBe(1);
    expect((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM mesure_corps", []))!.n).toBe(2);
    expect((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM pesee", []))!.n).toBe(0);
  });

  it("une note arrivée après coup (SCORED) complète la ligne sans effacer le reste", async () => {
    const { db } = await baseDeTest();
    const nonNote = { ...cycle, score_state: "PENDING_SCORE", score: undefined };
    await synchroniserWhoop(db, apiSimulee({ sleep: [[sommeil()]], recovery: [[recup()]], cycle: [[nonNote]] }).api, reveil + 2 * H);
    expect((await db.getFirstAsync<{ strain: number | null }>("SELECT strain FROM whoop_jour", []))!.strain).toBeNull();
    await synchroniserWhoop(db, apiSimulee({ cycle: [[cycle]] }).api, reveil + 20 * H);
    expect(await db.getFirstAsync("SELECT strain, recup, sommeil_min FROM whoop_jour", [])).toEqual({ strain: 12.3, recup: 74, sommeil_min: 420 });
  });

  it("un échec de poids/taille ne perd pas le reste", async () => {
    const { db } = await baseDeTest();
    const { api } = apiSimulee({ cycle: [[cycle]] });
    api.corps = async () => {
      throw new Error("boom");
    };
    await expect(synchroniserWhoop(db, api, reveil + 2 * H)).resolves.toMatchObject({ jours: 1 });
  });
});

describe("séances : pas de doublon avec pepfit (±10 min)", () => {
  async function seancePepfit(db: Awaited<ReturnType<typeof baseDeTest>>["db"], id: string, debut: number, fin: number) {
    await db.runAsync("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES (?,?,?,?,?)", [id, "Haut du corps", debut, fin, 1]);
  }
  const debut = jour(2026, 10, 27, 18, 0);

  it("chevauchement exact : la séance Whoop enrichit la séance pepfit, aucune séance créée", async () => {
    const { db } = await baseDeTest();
    await seancePepfit(db, "f1", debut, debut + 60 * MIN);
    const b = await synchroniserWhoop(db, apiSimulee({ workout: [[seanceW("w1", debut + 2 * MIN, debut + 58 * MIN)]] }).api, debut + 2 * H);
    expect(b.seances).toEqual({ enrichies: 1, creees: 0, ignorees: 0 });
    expect((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM seances", []))!.n).toBe(1);
    expect((await resumesSeancesWhoop(db)).get("f1")).toMatchObject({ fcMoy: 118, fcMax: 160 });
    expect("strain" in (await resumesSeancesWhoop(db)).get("f1")!).toBe(false);
  });

  it("à 10 min près : enrichit ; à plus de 10 min : crée sa propre séance", async () => {
    const { db } = await baseDeTest();
    await seancePepfit(db, "f1", debut, debut + 60 * MIN);
    // Whoop finit 9 min avant que pepfit commence -> dans la tolérance
    expect(await seancePepfitCorrespondante(db, debut - 69 * MIN, debut - 9 * MIN)).toBe("f1");
    // 11 min avant -> hors tolérance
    expect(await seancePepfitCorrespondante(db, debut - 71 * MIN, debut - 11 * MIN)).toBeNull();
    expect(TOLERANCE_MS).toBe(10 * MIN);
    const b = await synchroniserWhoop(db, apiSimulee({ workout: [[seanceW("loin", debut + 3 * H, debut + 4 * H, "running")]] }).api, debut + 5 * H);
    expect(b.seances).toEqual({ enrichies: 0, creees: 1, ignorees: 0 });
    expect(await db.getFirstAsync("SELECT titre, source_ref FROM seances WHERE id <> 'f1'", [])).toEqual({ titre: "Running", source_ref: "whoop:loin" });
  });

  it("resynchro : la séance Whoop créée reste seule, pas de doublon", async () => {
    const { db } = await baseDeTest();
    const donnees = { workout: [[seanceW("w1", debut, debut + 45 * MIN)]] };
    await synchroniserWhoop(db, apiSimulee(donnees).api, debut + 2 * H);
    await synchroniserWhoop(db, apiSimulee(donnees).api, debut + 3 * H);
    expect((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM seances", []))!.n).toBe(1);
  });

  it("ne rattache jamais une séance Whoop à une autre séance créée par Whoop", async () => {
    const { db } = await baseDeTest();
    await synchroniserWhoop(db, apiSimulee({ workout: [[seanceW("w1", debut, debut + 45 * MIN), seanceW("w2", debut + 5 * MIN, debut + 50 * MIN)]] }).api, debut + 2 * H);
    expect((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM seances", []))!.n).toBe(2);
  });
});

describe("Whoop prioritaire sur Santé Connect", () => {
  it("VFC : la mesure Santé Connect de la même nuit est écartée, celle d'un autre jour reste", async () => {
    const { db } = await baseDeTest();
    await ajouterMesures(db, "vfc", [{ valeur: 40, date: reveil + 3 * H }, { valeur: 45, date: reveil - 2 * 86_400_000 }], "sante_connect");
    expect((await derniereMesure(db, "vfc", reveil + 10 * H))?.valeur).toBe(40);
    await synchroniserWhoop(db, apiSimulee({ sleep: [[sommeil()]], recovery: [[recup()]] }).api, reveil + 4 * H);
    const l = await historiqueMesure(db, "vfc");
    expect(l.map((m) => [m.source, m.valeur])).toEqual([["whoop", 68.3], ["sante_connect", 45]]);
    expect((await derniereMesure(db, "vfc", reveil + 10 * H))?.source).toBe("whoop");
  });
  it("sommeil : la nuit Whoop remplace celle de Santé Connect du même réveil", async () => {
    const { db } = await baseDeTest();
    await synchroniserWhoop(db, apiSimulee({ sleep: [[sommeil()]] }).api, reveil + 4 * H);
    const w = await nuitsWhoop(db, reveil - 24 * H, reveil + 24 * H);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ minutes: 420, origine: "com.whoop.android", phases: { leger: 210, profond: 90, paradoxal: 120, eveil: 30 } });
    const sante = [{ debut: reveil - 7 * H, fin: reveil + 5 * MIN, minutes: 400, phases: null, origine: "com.sec.android.app.shealth" }, { debut: reveil - 31 * H, fin: reveil - 24 * H, minutes: 380, phases: null, origine: null }];
    const f = fusionnerNuits(sante, w);
    expect(f.map((n) => n.minutes)).toEqual([380, 420]);
  });
});

describe("purge à la déconnexion", () => {
  it("efface les données Whoop et les séances créées pour lui, garde les séances pepfit et leurs séries", async () => {
    const { db } = await baseDeTest();
    const debut = jour(2026, 10, 27, 18, 0);
    await db.runAsync("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES ('f1','Dos',?,?,1)", [debut, debut + 60 * MIN]);
    await synchroniserWhoop(
      db,
      apiSimulee({ sleep: [[sommeil()]], recovery: [[recup()]], cycle: [[cycle]], workout: [[seanceW("w1", debut, debut + 60 * MIN), seanceW("w2", debut + 4 * H, debut + 5 * H)]] }, { weight_kilogram: 80 }).api,
      debut + 6 * H,
    );
    await purgerWhoop(db);
    for (const t of ["whoop_jour", "whoop_seance", "mesure_corps", "pesee"]) expect((await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`, []))!.n).toBe(0);
    expect((await db.getAllAsync<{ id: string }>("SELECT id FROM seances", [])).map((s) => s.id)).toEqual(["f1"]);
    expect(await lireReglage(db, REGLAGE.derniereSynchro)).toBeNull();
  });
});

describe("migration 33 (règle des témoins)", () => {
  it("a un témoin, crée ses tables, et est sautée si le témoin existe déjà sous un autre numéro", async () => {
    const m = MIGRATIONS.find((x) => x.version === 33)!;
    expect(m.temoin).toBe("whoop_jour");
    const { db } = await baseDeTest();
    expect((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('whoop_jour','whoop_seance')", []))!.n).toBe(2);
    await db.execAsync("PRAGMA user_version = 32");
    await expect(migrer(db)).resolves.toBe(VERSION_COURANTE);
  });
});
