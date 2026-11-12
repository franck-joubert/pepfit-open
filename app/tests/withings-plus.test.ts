// Withings : activité (Measure v2 getactivity) et sommeil (Sleep v2 getsummary). Réponses INVENTÉES au format de la
// documentation de Withings (developer.withings.com), pas relevées chez un vrai compte :
//   getactivity : { status: 0, body: { activities: [{ date, timezone, deviceid, is_tracker, steps, distance, calories,
//     totalcalories, hr_average, hr_min, hr_max }], more, offset } }
//   getsummary  : { status: 0, body: { series: [{ id, timezone, model, startdate, enddate, date, data: { total_sleep_time,
//     total_timeinbed, lightsleepduration, deepsleepduration, remsleepduration, wakeupduration, wakeupcount, hr_average,
//     hr_min, hr_max, rr_average, sleep_score }, modified }], more, offset } }
// Aucun appel réel : un compte de test Withings manque (voir docs/CODE-WITHINGS-PLUS.md, points non vérifiés).
import { describe, expect, it } from "./attendu.ts";
import { baseDeTest } from "./aide.ts";
import { ErreurWhoop } from "../src/whoop/types.ts";
import { creerApi, type ApiWithings, type PlageWithings } from "../src/withings/api.ts";
import { convertirActivites, convertirNuits, dateLocale, minuitDeDate } from "../src/withings/plus.ts";
import { enregistrerJoursWithings } from "../src/withings/depot-plus.ts";
import { aLeDroitActivite, synchroniserPlus } from "../src/withings/synchro-plus.ts";
import { fusionnerNuitsWithings, nuitsWithings, pasWithingsJours } from "../src/withings/lecture.ts";
import { purgerWithings } from "../src/withings/depot.ts";
import { convertirGroupe } from "../src/withings/convertir.ts";
import { REGLAGE, JOURS_TRANCHE } from "../src/withings/constantes.ts";
import { choisirPas } from "../src/ecrans/pas-source.ts";
import { lireReglage } from "../src/db/depots/reglages.ts";
import type { ActiviteBrute, PageActivite, PageSommeil, SerieSommeilBrute } from "../src/withings/types.ts";

const local = (a: number, m: number, j: number, h = 0, min = 0) => new Date(a, m - 1, j, h, min).getTime();
const sec = (ms: number) => Math.floor(ms / 1000);
const JOUR_MS = 86_400_000;

const activite = (date: string, o: Partial<ActiviteBrute> = {}): ActiviteBrute => ({
  date, timezone: "Europe/Paris", deviceid: "892359876fd8805ac45bab078c4828692f0276b1", is_tracker: true,
  steps: 8421, distance: 6390.5, calories: 312.4, totalcalories: 2310.9, hr_average: 71, hr_min: 49, hr_max: 148, ...o,
});

/** Une nuit de 23:20 à 07:05 (7 h 45 au lit), réveil le `date`. */
const nuit = (date: string, o: Partial<SerieSommeilBrute> = {}): SerieSommeilBrute => {
  const [a, m, j] = date.split("-").map(Number) as [number, number, number];
  return {
    id: 2909449485, timezone: "Europe/Paris", model: 32, startdate: sec(local(a, m, j - 1, 23, 20)), enddate: sec(local(a, m, j, 7, 5)), date,
    data: {
      total_sleep_time: 25200, total_timeinbed: 27900, lightsleepduration: 13800, deepsleepduration: 6600, remsleepduration: 4800,
      wakeupduration: 2400, wakeupcount: 3, hr_average: 56, hr_min: 47, hr_max: 74, rr_average: 14.2, sleep_score: 82,
    },
    modified: 1_700_000_000, ...o,
  };
};

describe("Withings plus : conversion de l'activité", () => {
  it("un jour : pas, distance, calories actives et totales, FC du jour", () => {
    const j = convertirActivites([activite("2026-11-04")]).get(local(2026, 11, 4))!;
    expect(j).toMatchObject({ pas: 8421, distanceM: 6390.5, kcalActives: 312.4, kcalTotales: 2310.9, fcMoy: 71, fcMin: 49, fcMax: 148, sommeilMin: null });
  });

  it("deux appareils le même jour : celui qui a le plus de pas, jamais la somme", () => {
    const l = convertirActivites([activite("2026-11-04", { steps: 3000, deviceid: "tel" }), activite("2026-11-04", { steps: 8421 }), activite("2026-11-04", { steps: 100, deviceid: "autre" })]);
    expect(l.size).toBe(1);
    expect(l.get(local(2026, 11, 4))!.pas).toBe(8421);
  });

  it("date illisible, valeurs négatives ou FC absurde : écartées, rien d'inventé", () => {
    const l = convertirActivites([activite("04/11/2026"), activite("2026-11-05", { steps: -5, distance: -1, hr_min: 0, hr_max: 900, hr_average: 12 })]);
    expect(l.size).toBe(1);
    expect(l.get(local(2026, 11, 5))).toMatchObject({ pas: null, distanceM: null, fcMin: null, fcMax: null, fcMoy: null });
  });

  it("jour sans pas (0) : gardé, c'est une mesure ; tout absent : jour vide", () => {
    expect(convertirActivites([activite("2026-11-06", { steps: 0 })]).get(local(2026, 11, 6))!.pas).toBe(0);
    expect(convertirActivites([{ date: "2026-11-07" }]).get(local(2026, 11, 7))).toMatchObject({ pas: null, distanceM: null });
  });
});

describe("Withings plus : conversion du sommeil", () => {
  it("une nuit : durées en minutes, au lit, réveils, FC de nuit, respiration, score", () => {
    const j = convertirNuits([nuit("2026-11-04")]).get(local(2026, 11, 4))!;
    expect(j).toMatchObject({
      sommeilMin: 420, auLitMin: 465, legerMin: 230, profondMin: 110, paradoxalMin: 80, eveilMin: 40, reveils: 3,
      fcNuitMoy: 56, fcNuitMin: 47, respiration: 14.2, scoreSommeil: 82, sommeilDebut: sec(local(2026, 11, 3, 23, 20)) * 1000, sommeilFin: sec(local(2026, 11, 4, 7, 5)) * 1000,
    });
  });

  it("sans total_sleep_time : somme léger, profond et paradoxal ; sans total_timeinbed : durée de la nuit", () => {
    const n = nuit("2026-11-04");
    delete n.data!.total_sleep_time;
    delete n.data!.total_timeinbed;
    const j = convertirNuits([n]).get(local(2026, 11, 4))!;
    expect(j.sommeilMin).toBe(Math.round(((13800 + 6600 + 4800) / 60) * 10) / 10);
    expect(j.auLitMin).toBe(465);
  });

  it("nuit et sieste le même jour de réveil : la plus longue, sans addition ; nuit vide ou à l'envers : écartée", () => {
    const sieste = nuit("2026-11-04", { startdate: sec(local(2026, 11, 4, 14)), enddate: sec(local(2026, 11, 4, 14, 40)), data: { total_sleep_time: 2100 } });
    const l = convertirNuits([sieste, nuit("2026-11-04"), nuit("2026-11-05", { enddate: sec(local(2026, 11, 4, 1)) }), nuit("2026-11-06", { data: {} })]);
    expect([...l.keys()]).toEqual([local(2026, 11, 4)]);
    expect(l.get(local(2026, 11, 4))!.sommeilMin).toBe(420);
  });

  it("fuseau : le jour est la date de Withings (fuseau de la montre), la nuit à cheval sur minuit reste à son jour de réveil", () => {
    const l = convertirNuits([nuit("2026-03-29", { timezone: "America/New_York" })]);
    expect(l.has(minuitDeDate("2026-03-29")!)).toBe(true);
    // sans `date` : le jour du réveil, dans le fuseau du téléphone
    const sans = nuit("2026-11-04");
    delete sans.date;
    expect(convertirNuits([sans]).has(local(2026, 11, 4))).toBe(true);
    expect(dateLocale(local(2026, 3, 29, 23, 59))).toBe("2026-03-29");
  });

  it("changement d'heure (30/03/2025, 24 h de 23 h) : le jour reste le bon, minuit local", () => {
    expect(new Date(minuitDeDate("2025-03-30")!).getHours()).toBe(0);
    expect(dateLocale(minuitDeDate("2025-03-31")!)).toBe("2025-03-31");
  });
});

describe("Withings plus : températures par getmeas (droit user.metrics, déjà accordé)", () => {
  it("types 71 et 73 : température du corps et de la peau en °C", () => {
    const g = { grpid: 1, attrib: 0, date: 1_762_300_000, category: 1, measures: [{ value: 3652, type: 71, unit: -2 }, { value: 3310, type: 73, unit: -2 }] };
    expect(convertirGroupe(g)).toEqual([
      { genre: "corps", type: "temp_corps", valeur: 36.52, date: 1_762_300_000_000 },
      { genre: "corps", type: "temp_peau", valeur: 33.1, date: 1_762_300_000_000 },
    ]);
  });
});

describe("Withings plus : client", () => {
  const fetchSimule = (reponses: ({ status: number; json: unknown } | "panne")[]) => {
    const appels: { url: string; corps: URLSearchParams }[] = [];
    const f = async (url: string, init?: { body?: string }) => {
      appels.push({ url, corps: new URLSearchParams(init?.body) });
      const r = reponses.shift();
      if (!r || r === "panne") throw new TypeError("Network request failed");
      return { status: r.status, json: async () => r.json };
    };
    return { f, appels };
  };
  const deps = (f: unknown) => ({ acces: async () => "AT1", fetch: f as never, attendre: async () => {} });
  const ok = (body: unknown) => ({ status: 200, json: { status: 0, body } });

  it("getactivity : POST /v2/measure, plage de jours, champs demandés, offset", async () => {
    const { f, appels } = fetchSimule([ok({ activities: [activite("2026-11-04")], more: 0 }), ok({ activities: [] })]);
    const api = creerApi(deps(f));
    expect((await api.activite({ debut: "2026-10-01", fin: "2026-11-04" })).activities).toHaveLength(1);
    await api.activite({ depuis: 1_762_300_000.9 }, 50);
    expect(appels[0]!.url).toBe("https://wbsapi.withings.net/v2/measure");
    expect(Object.fromEntries(appels[0]!.corps)).toMatchObject({ action: "getactivity", startdateymd: "2026-10-01", enddateymd: "2026-11-04" });
    expect(appels[0]!.corps.get("data_fields")).toContain("steps");
    expect(Object.fromEntries(appels[1]!.corps)).toMatchObject({ action: "getactivity", lastupdate: "1762300000", offset: "50" });
    expect(appels[1]!.corps.has("startdateymd")).toBe(false);
  });

  it("getsummary : POST /v2/sleep ; corps sans activities ni series : listes vides", async () => {
    const { f, appels } = fetchSimule([ok({ series: [nuit("2026-11-04")] }), ok({})]);
    const api = creerApi(deps(f));
    expect((await api.sommeil({ debut: "2026-11-01", fin: "2026-11-04" })).series).toHaveLength(1);
    expect((await api.sommeil({ depuis: 1 })).series).toEqual([]);
    expect(appels[0]!.url).toBe("https://wbsapi.withings.net/v2/sleep");
    expect(appels[0]!.corps.get("action")).toBe("getsummary");
    expect(appels[0]!.corps.get("data_fields")).toContain("deepsleepduration");
  });
});

/** API simulée : garde les plages demandées ; `panne` : la n-ième demande d'activité échoue. */
function apiPlus(o: { activites?: (p: PlageWithings) => ActiviteBrute[]; nuits?: (p: PlageWithings) => SerieSommeilBrute[]; panneActivite?: number } = {}) {
  const plages: PlageWithings[] = [];
  let n = 0;
  const api: ApiWithings = {
    mesures: async () => ({ updatetime: 0, measuregrps: [] }),
    activite: async (p, offset): Promise<PageActivite> => {
      plages.push(p);
      if (++n === o.panneActivite) throw new ErreurWhoop("reseau");
      return { activities: offset ? [] : (o.activites?.(p) ?? []) };
    },
    sommeil: async (p, offset): Promise<PageSommeil> => ({ series: offset ? [] : (o.nuits?.(p) ?? []) }),
    intraday: async () => ({ series: {} }),
  };
  return { api, plages };
}

describe("Withings plus : synchro", () => {
  const SCOPE = "user.info,user.metrics,user.activity";
  const maintenant = local(2026, 11, 5, 9);

  it("le droit : lu dans le scope des jetons", () => {
    expect(aLeDroitActivite(SCOPE)).toBe(true);
    expect(aLeDroitActivite("user.info user.metrics user.activity")).toBe(true);
    expect(aLeDroitActivite("user.info,user.metrics")).toBe(false);
    expect(aLeDroitActivite(undefined)).toBe(false);
    expect(aLeDroitActivite("user.activityx")).toBe(false);
  });

  it("connexion d'avant (sans user.activity) : aucune demande, reconnexion demandée, pesées intactes", async () => {
    const { db } = await baseDeTest();
    const { api, plages } = apiPlus();
    const b = await synchroniserPlus(db, api, "user.info,user.metrics", maintenant);
    expect(b.autorise).toBe(false);
    expect(plages).toHaveLength(0);
    expect(await lireReglage(db, REGLAGE.reconnexion)).toBe("1");
    expect(await lireReglage(db, REGLAGE.plusCurseur)).toBe(null);
    // reconnecté : le drapeau tombe
    await synchroniserPlus(db, api, SCOPE, maintenant);
    expect(await lireReglage(db, REGLAGE.reconnexion)).toBe("");
  });

  it("première lecture : 365 jours par tranches de 90 jours, jusqu'à aujourd'hui, puis le curseur", async () => {
    const { db } = await baseDeTest();
    const { api, plages } = apiPlus({
      activites: (p) => ("debut" in p && p.fin === "2026-11-05" ? [activite("2026-11-05", { steps: 1200 })] : []),
      nuits: (p) => ("debut" in p && p.fin === "2026-11-05" ? [nuit("2026-11-05")] : []),
    });
    const b = await synchroniserPlus(db, api, SCOPE, maintenant);
    expect(b).toMatchObject({ autorise: true, tranches: 5 });
    expect(plages).toHaveLength(5);
    const p = plages as { debut: string; fin: string }[];
    expect(p[0]!.debut).toBe(dateLocale(local(2026, 11, 5) - 365 * JOUR_MS));
    expect(p[4]!.fin).toBe("2026-11-05");
    // tranches jointives, sans trou ni chevauchement
    for (let i = 1; i < 5; i++) expect(p[i]!.debut).toBe(dateLocale(new Date(minuitDeDate(p[i - 1]!.fin)! + 36 * 3_600_000).setHours(0, 0, 0, 0)));
    expect(JOURS_TRANCHE).toBe(90);
    expect(await pasWithingsJours(db, [local(2026, 11, 5)])).toEqual(new Map([[local(2026, 11, 5), 1200]]));
    expect((await nuitsWithings(db, 0, maintenant)).map((n) => n.minutes)).toEqual([420]);
    expect(Number(await lireReglage(db, REGLAGE.plusCurseur))).toBe(sec(maintenant));
  });

  it("reprise après échec : la tranche en panne est relue, pas les précédentes ; le curseur n'avance pas", async () => {
    const { db } = await baseDeTest();
    const premiere = apiPlus({ panneActivite: 3 });
    await expect(synchroniserPlus(db, premiere.api, SCOPE, maintenant)).rejects.toThrow();
    expect(premiere.plages).toHaveLength(3);
    expect(await lireReglage(db, REGLAGE.plusCurseur)).toBe(null);
    const jusqua = Number(await lireReglage(db, REGLAGE.plusJusqua));
    expect(dateLocale(jusqua)).toBe((premiere.plages[1] as { fin: string }).fin);
    const reprise = apiPlus();
    const b = await synchroniserPlus(db, reprise.api, SCOPE, maintenant);
    expect(b.tranches).toBe(3);
    expect((reprise.plages[0] as { debut: string }).debut).toBe((premiere.plages[2] as { debut: string }).debut);
    expect(await lireReglage(db, REGLAGE.plusCurseur)).toBe(String(sec(maintenant)));
  });

  it("ensuite : une seule demande par sorte, depuis le curseur moins une heure ; rejouée, aucun doublon", async () => {
    const { db } = await baseDeTest();
    await synchroniserPlus(db, apiPlus().api, SCOPE, maintenant);
    const plus = apiPlus({ activites: () => [activite("2026-11-05", { steps: 4000 })], nuits: () => [nuit("2026-11-05")] });
    const b = await synchroniserPlus(db, plus.api, SCOPE, maintenant + 3 * 3_600_000);
    expect(plus.plages).toEqual([{ depuis: sec(maintenant) - 3600 }]);
    expect(b).toMatchObject({ tranches: 1, jours: 1 });
    const encore = await synchroniserPlus(db, plus.api, SCOPE, maintenant + 4 * 3_600_000);
    expect(encore.jours).toBe(0);
    expect((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM withings_jour", []))!.n).toBe(1);
    // le pas monte dans la journée : mis à jour, la nuit gardée
    const monte = apiPlus({ activites: () => [activite("2026-11-05", { steps: 6100 })] });
    await synchroniserPlus(db, monte.api, SCOPE, maintenant + 6 * 3_600_000);
    expect((await pasWithingsJours(db, [local(2026, 11, 5)])).get(local(2026, 11, 5))).toBe(6100);
    expect((await nuitsWithings(db, 0, maintenant + JOUR_MS)).length).toBe(1);
  });

  it("une nuit et une activité du même jour : une seule ligne avec les deux", async () => {
    const { db } = await baseDeTest();
    await enregistrerJoursWithings(db, [...convertirNuits([nuit("2026-11-04")]).values(), ...convertirActivites([activite("2026-11-04")]).values()]);
    const l = await db.getAllAsync<{ pas: number; sommeil_min: number }>("SELECT pas, sommeil_min FROM withings_jour", []);
    expect(l).toEqual([{ pas: 8421, sommeil_min: 420 }]);
  });

  it("déconnexion : les jours Withings sont effacés, les réglages aussi", async () => {
    const { db } = await baseDeTest();
    await synchroniserPlus(db, apiPlus({ activites: () => [activite("2026-11-05")] }).api, SCOPE, maintenant);
    await purgerWithings(db);
    expect((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM withings_jour", []))!.n).toBe(0);
    expect(await lireReglage(db, REGLAGE.plusCurseur)).toBe(null);
  });
});

describe("Withings plus : jetons", () => {
  it("renouvellement sans scope dans la réponse : le scope gardé reste (une ancienne connexion n'est pas prise pour une nouvelle)", async () => {
    const { creerJetons } = await import("../src/whoop/jetons.ts");
    const mem = new Map<string, string>([["k", JSON.stringify({ access_token: "A", refresh_token: "R", expire: 0, scope: "user.info,user.metrics" })]]);
    const coffre = { lire: async (c: string) => mem.get(c) ?? null, ecrire: async (c: string, v: string) => void mem.set(c, v), effacer: async (c: string) => void mem.delete(c) };
    const j = creerJetons(coffre, "k", async () => ({ access_token: "A2", refresh_token: "R2", expires_in: 10800 }));
    await j.accesValable();
    expect((await j.lire())!.scope).toBe("user.info,user.metrics");
    expect(aLeDroitActivite((await j.lire())!.scope)).toBe(false);
  });
});

describe("Withings plus : priorité des sources", () => {
  const sc = (fin: number, minutes: number) => ({ debut: fin - minutes * 60_000, fin, minutes, phases: null, origine: "com.samsung.shealth" });
  const wi = (fin: number, minutes: number) => ({ debut: fin - minutes * 60_000, fin, minutes, phases: null, origine: "withings" });

  it("nuits : Withings remplace Santé Connect le même jour de réveil, sans doublon", () => {
    const l = fusionnerNuitsWithings([sc(local(2026, 11, 3, 7), 400), sc(local(2026, 11, 4, 7), 380)], [wi(local(2026, 11, 4, 7, 5), 420)]);
    expect(l.map((n) => [n.origine, n.minutes])).toEqual([["com.samsung.shealth", 400], ["withings", 420]]);
  });

  it("pas : Whoop, puis Withings, puis Santé Connect ; la valeur la plus haute (la plus récente) l'emporte sur Santé Connect", () => {
    const base = { whoopActif: false, whoop: null, withingsActif: true, santeAutorise: true } as const;
    expect(choisirPas({ ...base, withings: 5000, sante: 4000 })).toEqual({ etat: "valeur", pas: 5000, source: "withings" });
    expect(choisirPas({ ...base, withings: 5000, sante: 6000 })).toEqual({ etat: "valeur", pas: 6000, source: "sante" });
    expect(choisirPas({ ...base, withings: 5000, sante: 5000 })).toEqual({ etat: "valeur", pas: 5000, source: "withings" });
    expect(choisirPas({ ...base, whoopActif: true, whoop: 100, withings: 5000, sante: null })).toEqual({ etat: "valeur", pas: 100, source: "whoop" });
    expect(choisirPas({ ...base, withings: null, sante: 3000 })).toEqual({ etat: "valeur", pas: 3000, source: "sante" });
    expect(choisirPas({ whoopActif: false, whoop: null, withingsActif: true, withings: null, santeAutorise: false, sante: null })).toEqual({ etat: "vide", source: "withings" });
    expect(choisirPas({ whoopActif: false, whoop: null, santeAutorise: false, sante: null })).toEqual({ etat: "a-connecter" });
  });
});
