// Withings : FC au repos de la nuit, depuis la FC à la minute (Measure v2 getintradayactivity, scope user.activity).
// Réponse INVENTÉE au format de la documentation (pas relevée chez un vrai compte) :
//   { status: 0, body: { series: { "1594159644": { heart_rate: 70, model: "ScanWatch", model_id: 93, deviceid: "…" }, … } } }
import { describe, expect, it } from "./attendu.ts";
import { baseDeTest } from "./aide.ts";
import { ErreurWhoop } from "../src/whoop/types.ts";
import { creerApi, type ApiWithings } from "../src/withings/api.ts";
import { lireFcRepos, pointsFc } from "../src/withings/fc-nuit.ts";
import { enregistrerJoursWithings } from "../src/withings/depot-plus.ts";
import { synchroniserPlus } from "../src/withings/synchro-plus.ts";
import { convertirNuits } from "../src/withings/plus.ts";
import { purgerWithings } from "../src/withings/depot.ts";
import { REGLAGE } from "../src/withings/constantes.ts";
import { ajouterMesures, historiqueMesure } from "../src/db/depots/mesures.ts";
import { lireReglage } from "../src/db/depots/reglages.ts";
import type { PageIntraday, SerieSommeilBrute } from "../src/withings/types.ts";

const local = (a: number, m: number, j: number, h = 0, min = 0) => new Date(a, m - 1, j, h, min).getTime();
const sec = (ms: number) => Math.floor(ms / 1000);
const maintenant = local(2026, 11, 5, 9);
const SCOPE = "user.info,user.metrics,user.activity";

const nuit = (date: string, o: Partial<SerieSommeilBrute> = {}): SerieSommeilBrute => {
  const [a, m, j] = date.split("-").map(Number) as [number, number, number];
  return {
    id: 1, timezone: "Europe/Paris", model: 32, startdate: sec(local(a, m, j - 1, 23, 20)), enddate: sec(local(a, m, j, 7, 5)), date,
    data: { total_sleep_time: 25200, total_timeinbed: 27900, lightsleepduration: 13800, deepsleepduration: 6600, remsleepduration: 4800, hr_average: 56, hr_min: 47, hr_max: 74 },
    ...o,
  };
};

/** FC à la minute d'une nuit : 60 bpm, un creux à 52 bpm de 2 h à 5 h après l'endormissement, bpm 47 isolé (minimum brut). */
function seriePour(debutS: number, finS: number, creux = 52): PageIntraday {
  const series: PageIntraday["series"] = {};
  for (let t = debutS; t < finS; t += 60) {
    const h = (t - debutS) / 3600;
    series[String(t)] = { heart_rate: h >= 2 && h < 5 ? creux : 60, model: "ScanWatch", model_id: 93 };
  }
  series[String(debutS + 3 * 3600 + 30)] = { heart_rate: 47 };
  return { series };
}

async function avecNuit(date = "2026-11-05") {
  const { db } = await baseDeTest();
  await enregistrerJoursWithings(db, [...convertirNuits([nuit(date)]).values()], maintenant);
  return db;
}

function apiFc(f: (d: number, fin: number) => Promise<PageIntraday>) {
  const appels: [number, number][] = [];
  const api: ApiWithings = {
    mesures: async () => ({ updatetime: 0, measuregrps: [] }),
    activite: async () => ({ activities: [] }),
    sommeil: async () => ({ series: [] }),
    intraday: async (d, fin) => (appels.push([d, fin]), f(d, fin)),
  };
  return { api, appels };
}

describe("Withings : FC à la minute", () => {
  it("pointsFc : clés en secondes, FC absurdes et clés illisibles écartées", () => {
    const p = pointsFc({ series: { "1000": { heart_rate: 61 }, "1060": { heart_rate: 0 }, "1120": { heart_rate: 400 }, abc: { heart_rate: 60 }, "980": { heart_rate: 58 }, "1180": {} } });
    expect(p).toEqual([{ t: 980_000, bpm: 58 }, { t: 1_000_000, bpm: 61 }]);
  });

  it("la demande : getintradayactivity, heart_rate, startdate et enddate en secondes", async () => {
    let corps = "";
    const api = creerApi({
      acces: async () => "J", attendre: async () => {},
      fetch: async (url, init) => ((corps = `${url} ${init?.body}`), { status: 200, json: async () => ({ status: 0, body: { series: { "5": { heart_rate: 60 } } } }) }),
      quotas: { attenteAvant: () => ({ attendre_ms: 0 }), noterAppel() {}, noterReponse() {} } as never,
    });
    const r = await api.intraday(1000, 2000);
    expect(corps).toContain("/v2/measure");
    expect(corps).toContain("action=getintradayactivity");
    expect(corps).toContain("data_fields=heart_rate");
    expect(corps).toContain("startdate=1000");
    expect(corps).toContain("enddate=2000");
    expect(Object.keys(r.series)).toEqual(["5"]);
  });
});

describe("Withings : FC au repos de la nuit", () => {
  it("la plus basse moyenne sur 30 minutes (52), pas le minimum brut (47), rangée en withings_jour et en mesure « fc »", async () => {
    const db = await avecNuit();
    const { api, appels } = apiFc(async (d, f) => seriePour(d, f));
    expect(await lireFcRepos(db, api, maintenant)).toBe(1);
    expect(appels).toHaveLength(1);
    expect(appels[0]).toEqual([sec(local(2026, 11, 4, 23, 20)), sec(local(2026, 11, 5, 7, 5))]);
    const j = await db.getFirstAsync<{ fc_repos: number }>("SELECT fc_repos FROM withings_jour", []);
    expect(j!.fc_repos).toBe(52);
    const m = await historiqueMesure(db, "fc");
    expect(m.map((x) => [x.valeur, x.source, x.origine, x.date])).toEqual([[52, "withings", "withings", local(2026, 11, 5, 7, 5)]]);
  });

  it("rejeu : pas de nouvelle demande, pas de doublon", async () => {
    const db = await avecNuit();
    const { api, appels } = apiFc(async (d, f) => seriePour(d, f));
    await lireFcRepos(db, api, maintenant);
    expect(await lireFcRepos(db, api, maintenant)).toBe(0);
    expect(appels).toHaveLength(1);
    expect((await historiqueMesure(db, "fc")).length).toBe(1);
  });

  it("Santé Connect la même nuit : Withings prime, une seule FC au repos", async () => {
    const db = await avecNuit();
    await ajouterMesures(db, "fc", [{ valeur: 55, date: local(2026, 11, 5, 7, 10), origine: "com.withings.wiscale2" }], "sante_connect", maintenant);
    await ajouterMesures(db, "fc", [{ valeur: 57, date: local(2026, 11, 5, 7, 5), origine: "fit.pep" }], "pepfit", maintenant);
    await lireFcRepos(db, apiFc(async (d, f) => seriePour(d, f)).api, maintenant);
    expect((await historiqueMesure(db, "fc")).map((x) => [x.valeur, x.source])).toEqual([[52, "withings"]]);
  });

  it("Whoop la même nuit : Whoop prime sur Withings", async () => {
    const db = await avecNuit();
    await ajouterMesures(db, "fc", [{ valeur: 50, date: local(2026, 11, 5, 6, 40), origine: "whoop" }], "whoop", maintenant);
    await lireFcRepos(db, apiFc(async (d, f) => seriePour(d, f)).api, maintenant);
    expect((await historiqueMesure(db, "fc")).map((x) => [x.valeur, x.source])).toEqual([[50, "whoop"]]);
  });

  it("montre sans FC continue (série vide) : rien d'inventé ; la nuit fraîche est réessayée, la vieille abandonnée (0)", async () => {
    const db = await avecNuit("2026-11-05");
    await enregistrerJoursWithings(db, [...convertirNuits([nuit("2026-11-02")]).values()], maintenant);
    const { api, appels } = apiFc(async () => ({ series: {} }));
    expect(await lireFcRepos(db, api, maintenant)).toBe(0);
    expect(appels).toHaveLength(2);
    const l = await db.getAllAsync<{ jour: number; fc_repos: number | null }>("SELECT jour, fc_repos FROM withings_jour ORDER BY jour", []);
    expect(l.map((x) => x.fc_repos)).toEqual([0, null]);
    await lireFcRepos(db, api, maintenant);
    expect(appels).toHaveLength(3); // seule la nuit fraîche
    expect((await historiqueMesure(db, "fc")).length).toBe(0);
  });

  it("nuits de plus de 7 jours : pas lues ; 3 demandes au plus par synchro", async () => {
    const { db } = await baseDeTest();
    const nuits = ["2026-11-05", "2026-11-04", "2026-11-03", "2026-11-02", "2026-10-20"].map((d) => nuit(d));
    await enregistrerJoursWithings(db, [...convertirNuits(nuits).values()], maintenant);
    const { api, appels } = apiFc(async (d, f) => seriePour(d, f));
    expect(await lireFcRepos(db, api, maintenant)).toBe(3);
    expect(appels).toHaveLength(3);
    expect(await lireFcRepos(db, api, maintenant)).toBe(1);
    expect(await lireFcRepos(db, api, maintenant)).toBe(0);
    expect(appels).toHaveLength(4);
  });

  it("nuit de plus de 24 h : coupée à ses dernières 24 h (limite d'une demande)", async () => {
    const db = await avecNuit();
    await db.runAsync("UPDATE withings_jour SET sommeil_debut = ?", [local(2026, 11, 3, 20)]);
    const { api, appels } = apiFc(async () => ({ series: {} }));
    await lireFcRepos(db, api, maintenant);
    expect(appels[0]![1] - appels[0]![0]).toBe(86400);
  });

  it("erreur réseau : rien d'abandonné, réessayé ; refus de Withings : nuit marquée 0, erreur gardée ; jamais d'exception", async () => {
    const db = await avecNuit();
    let code: "reseau" | "refuse" = "reseau";
    const { api } = apiFc(async () => { throw new ErreurWhoop(code); });
    expect(await lireFcRepos(db, api, maintenant)).toBe(0);
    expect(await lireReglage(db, REGLAGE.fcErreur)).toBe("reseau");
    expect((await db.getFirstAsync<{ fc_repos: number | null }>("SELECT fc_repos FROM withings_jour", []))!.fc_repos).toBe(null);
    code = "refuse";
    await lireFcRepos(db, api, maintenant);
    expect(await lireReglage(db, REGLAGE.fcErreur)).toBe("refuse");
    expect((await db.getFirstAsync<{ fc_repos: number | null }>("SELECT fc_repos FROM withings_jour", []))!.fc_repos).toBe(0);
  });

  it("une nuit relue avec une autre fin (sieste, correction) : la FC au repos est recalculée", async () => {
    const db = await avecNuit();
    await lireFcRepos(db, apiFc(async (d, f) => seriePour(d, f)).api, maintenant);
    await enregistrerJoursWithings(db, [...convertirNuits([nuit("2026-11-05", { enddate: sec(local(2026, 11, 5, 7, 40)) })]).values()], maintenant + 1);
    expect((await db.getFirstAsync<{ fc_repos: number | null }>("SELECT fc_repos FROM withings_jour", []))!.fc_repos).toBe(null);
  });

  it("synchroniserPlus : la FC est lue après le sommeil, et son échec ne fait pas échouer la synchro", async () => {
    const { db } = await baseDeTest();
    const { api, appels } = apiFc(async () => { throw new ErreurWhoop("serveur"); });
    api.sommeil = async () => ({ series: [nuit("2026-11-05")] });
    const b = await synchroniserPlus(db, api, SCOPE, maintenant);
    expect(b.jours).toBe(1);
    expect(appels).toHaveLength(1);
    expect(await lireReglage(db, REGLAGE.plusErreur)).toBe("");
    expect(await lireReglage(db, REGLAGE.fcErreur)).toBe("serveur");
  });

  it("connexion sans user.activity : aucune demande de FC", async () => {
    const { db } = await baseDeTest();
    const { api, appels } = apiFc(async () => ({ series: {} }));
    await synchroniserPlus(db, api, "user.info,user.metrics", maintenant);
    expect(appels).toHaveLength(0);
  });

  it("déconnexion : la mesure « fc » de Withings et la FC au repos sont effacées, celle de Santé Connect reste", async () => {
    const db = await avecNuit();
    await ajouterMesures(db, "fc", [{ valeur: 55, date: local(2026, 11, 1, 7), origine: "com.withings.wiscale2" }], "sante_connect", maintenant);
    await lireFcRepos(db, apiFc(async (d, f) => seriePour(d, f)).api, maintenant);
    await purgerWithings(db);
    expect((await historiqueMesure(db, "fc")).map((x) => x.source)).toEqual(["sante_connect"]);
    expect(await db.getAllAsync("SELECT * FROM withings_jour", [])).toEqual([]);
  });
});
