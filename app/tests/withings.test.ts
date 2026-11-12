// Connexion Withings (balance) : conversion des unités (value × 10^unit), types rangés, groupes écartés ; client getmeas
// (pagination more/offset, lastupdate, jeton renouvelé, trop de demandes, erreurs) ; synchro sur une base SQLite réelle
// (historique complet puis incrémental, dédoublonnage avec Santé Connect et Whoop, correction, purge).
// Réponses inventées au format de la documentation de Withings (developer.withings.com, « Measure - Getmeas ») :
// { status: 0, body: { updatetime, timezone, measuregrps: [{ grpid, attrib, date, created, modified, category, deviceid,
// hash_deviceid, measures: [{ value, type, unit, algo, fm }], modelid, model, comment }], more, offset } }. Types de mesure :
// table « meastype » de la même page, recoupée avec la bibliothèque aiowithings (MeasurementType).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./attendu.ts";
import { baseDeTest, jour } from "./aide.ts";
import { ErreurWhoop } from "../src/whoop/types.ts";
import { creerApi, type ApiWithings } from "../src/withings/api.ts";
import { convertirGroupe, diagnostiquer, valeurReelle } from "../src/withings/convertir.ts";
import { ecartes, lireDiagnostic, typesRecus } from "../src/withings/diagnostic.ts";
import { enregistrerMesures, purgerWithings } from "../src/withings/depot.ts";
import { synchroniserWithings, RECOUVREMENT_S } from "../src/withings/synchro.ts";
import { ORIGINE_WITHINGS, REGLAGE } from "../src/withings/constantes.ts";
import { scansParZone, typeZone } from "../src/withings/zones.ts";
import type { GroupeWithings, PageMesures } from "../src/withings/types.ts";
import { ajouterMesures, derniereMesure, historiqueMesure } from "../src/db/depots/mesures.ts";
import { importerPeseesSante, listerPesees } from "../src/db/depots/pesees.ts";
import { lireReglage } from "../src/db/depots/reglages.ts";

const H = 3_600_000;
const s = (ms: number) => Math.floor(ms / 1000);
const matin = jour(2026, 10, 28, 7, 12);

/** Une pesée complète d'une Body Comp, comme getmeas la renvoie. */
const groupe = (o: Partial<GroupeWithings> & { date: number }): GroupeWithings => ({
  grpid: o.date,
  attrib: 0,
  created: o.date + 30,
  modified: o.date + 30,
  category: 1,
  deviceid: "a1b2c3",
  hash_deviceid: "a1b2c3",
  modelid: 13,
  model: "Body Comp",
  comment: null,
  measures: [
    { value: 78350, type: 1, unit: -3, algo: 3, fm: 3 }, // 78,35 kg
    { value: 1752, type: 6, unit: -2 }, // 17,52 %
    { value: 13727, type: 8, unit: -3 }, // 13,727 kg de gras
    { value: 64623, type: 5, unit: -3 }, // 64,623 kg de masse maigre
    { value: 6142, type: 76, unit: -2 }, // 61,42 kg de muscle
    { value: 4515, type: 77, unit: -2 }, // 45,15 kg d'eau
    { value: 321, type: 88, unit: -2 }, // 3,21 kg d'os
    { value: 64, type: 11, unit: 0 }, // 64 bpm debout
    { value: 742, type: 91, unit: -2 }, // 7,42 m/s
    { value: 75, type: 167, unit: 0 }, // score nerveux
    { value: 18, type: 168, unit: 0 }, // 18 kg d'eau extracellulaire
    { value: 272, type: 169, unit: -1 }, // 27,2 kg d'eau intracellulaire
    { value: 7, type: 170, unit: 0 }, // indice viscéral 7
    { value: 1745, type: 226, unit: 0 }, // 1 745 kcal
    { value: 38, type: 227, unit: 0 }, // âge métabolique
    { value: 2, type: 174, unit: 0, position: 12 }, // segmentaire (tronc) : rangé dans sa zone
    { value: 5, type: 11, unit: 0, position: 13 }, // à une position que pepfit ne range pas : laissé
    { value: 99, type: 999, unit: 0 }, // type inconnu : laissé
  ],
  ...o,
});

const page = (measuregrps: GroupeWithings[], o: Partial<PageMesures> = {}): PageMesures => ({ updatetime: s(matin) + 3600, timezone: "Europe/Paris", measuregrps, ...o });

describe("Withings : conversion", () => {
  it("value × 10^unit, sans bruit de virgule flottante", () => {
    expect(valeurReelle({ value: 72345, unit: -3 })).toBe(72.345);
    expect(valeurReelle({ value: 1752, unit: -2 })).toBe(17.52);
    expect(valeurReelle({ value: 7, unit: 0 })).toBe(7);
    expect(valeurReelle({ value: 12, unit: 2 })).toBe(1200);
    expect(valeurReelle({ value: 175, unit: -2 })).toBe(1.75);
  });

  it("une pesée complète : poids en pesée, le reste dans les types de pepfit, à la date du groupe (ms)", () => {
    const l = convertirGroupe(groupe({ date: s(matin) }));
    const par = Object.fromEntries(l.map((m) => [m.genre === "pesee" ? "poids" : m.type, m.genre === "pesee" ? m.kg : m.valeur]));
    expect(par).toEqual({
      poids: 78.35, gras: 17.52, gras_kg: 13.727, maigre: 64.623, muscle: 61.42, eau: 45.15, os: 3.21, fc_debout: 64, vop: 7.42,
      score_nerveux: 75, eau_extra: 18, eau_intra: 27.2, visceral: 7, bmr: 1745, age_metabolique: 38, gras_zone_torse: 2,
    });
    expect(l.every((m) => m.date === s(matin) * 1000)).toBe(true);
  });

  it("taille en m -> cm ; âge vasculaire", () => {
    const l = convertirGroupe({ grpid: 1, attrib: 2, date: s(matin), category: 1, measures: [{ value: 182, type: 4, unit: -2 }, { value: 41, type: 155, unit: 0 }] });
    expect(l).toEqual([
      { genre: "corps", type: "taille", valeur: 182, date: s(matin) * 1000 },
      { genre: "corps", type: "age_vasculaire", valeur: 41, date: s(matin) * 1000 },
    ]);
  });

  it("écartés : objectif (category 2), pesée ambiguë (attrib 1, peut-être un autre membre du foyer), valeurs nulles ou aberrantes", () => {
    expect(convertirGroupe(groupe({ date: s(matin), category: 2 }))).toEqual([]);
    expect(convertirGroupe(groupe({ date: s(matin), attrib: 1 }))).toEqual([]);
    expect(convertirGroupe({ grpid: 1, attrib: 0, date: s(matin), category: 1, measures: [{ value: 0, type: 1, unit: -3 }, { value: 600, type: 1, unit: 0 }, { value: -5, type: 6, unit: 0 }] })).toEqual([]);
  });
});

/** fetch simulé : chaque appel reçoit la réponse suivante de `reponses` ; les corps envoyés sont gardés. */
function fetchSimule(reponses: ({ status: number; json: unknown } | "panne")[]) {
  const appels: { url: string; corps: URLSearchParams; jeton: string }[] = [];
  const f = async (url: string, init?: { headers?: Record<string, string>; body?: string }) => {
    appels.push({ url, corps: new URLSearchParams(init?.body), jeton: init?.headers?.Authorization ?? "" });
    const r = reponses.shift();
    if (!r || r === "panne") throw new TypeError("Network request failed");
    return { status: r.status, json: async () => r.json };
  };
  return { f, appels };
}

const okW = (body: unknown) => ({ status: 200, json: { status: 0, body } });

describe("Withings : client getmeas", () => {
  const deps = (f: unknown, renouvellements: boolean[] = []) => ({
    acces: async (force = false) => (renouvellements.push(force), force ? "AT2" : "AT1"),
    fetch: f as never,
    attendre: async () => {},
  });

  it("POST /measure, getmeas, category 1, sans filtre de types ; tout l'historique : aucune date ; puis lastupdate et offset", async () => {
    const { f, appels } = fetchSimule([okW(page([])), okW(page([]))]);
    const api = creerApi(deps(f));
    await api.mesures(0);
    await api.mesures(1_700_000_000, 50);
    expect(appels[0]!.url).toBe("https://wbsapi.withings.net/measure");
    expect(appels[0]!.jeton).toBe("Bearer AT1");
    expect([appels[0]!.corps.get("action"), appels[0]!.corps.get("category"), appels[0]!.corps.get("meastypes"), appels[0]!.corps.get("lastupdate")]).toEqual(["getmeas", "1", null, null]);
    expect([appels[1]!.corps.get("lastupdate"), appels[1]!.corps.get("offset")]).toEqual(["1700000000", "50"]);
  });

  it("jeton refusé (status 401) : renouvelé une fois puis rejoué ; refusé encore : « expire »", async () => {
    const r: boolean[] = [];
    const { f, appels } = fetchSimule([{ status: 200, json: { status: 401, error: "invalid_token" } }, okW(page([]))]);
    await creerApi(deps(f, r)).mesures(0);
    expect(r).toEqual([false, true]);
    expect(appels[1]!.jeton).toBe("Bearer AT2");
    const g = fetchSimule([{ status: 200, json: { status: 401 } }, { status: 200, json: { status: 401 } }]);
    const e = await creerApi(deps(g.f)).mesures(0).catch((x: unknown) => x);
    expect(e instanceof ErreurWhoop && e.code).toBe("expire");
  });

  it("trop de demandes (601) : attend et rejoue, puis « limite » ; panne réseau : « reseau » ; status inconnu : « serveur »", async () => {
    const attentes: number[] = [];
    const { f } = fetchSimule([{ status: 200, json: { status: 601 } }, okW(page([]))]);
    await creerApi({ ...deps(f), attendre: async (ms: number) => void attentes.push(ms) }).mesures(0);
    expect(attentes).toEqual([2000]);
    const trop = fetchSimule(Array.from({ length: 5 }, () => ({ status: 200, json: { status: 601 } })));
    expect(((await creerApi(deps(trop.f)).mesures(0).catch((x: unknown) => x)) as ErreurWhoop).code).toBe("limite");
    expect(((await creerApi(deps(fetchSimule(["panne"]).f)).mesures(0).catch((x: unknown) => x)) as ErreurWhoop).code).toBe("reseau");
    expect(((await creerApi(deps(fetchSimule([{ status: 200, json: { status: 2554, error: "Unknown action" } }]).f)).mesures(0).catch((x: unknown) => x)) as ErreurWhoop).code).toBe("serveur");
    expect(((await creerApi(deps(fetchSimule([{ status: 200, json: "<html>" }]).f)).mesures(0).catch((x: unknown) => x)) as ErreurWhoop).code).toBe("serveur");
  });

  it("HTTP 5xx : deux nouveaux essais, puis « serveur »", async () => {
    const { f, appels } = fetchSimule([{ status: 502, json: null }, { status: 503, json: null }, { status: 502, json: null }]);
    expect(((await creerApi(deps(f)).mesures(0).catch((x: unknown) => x)) as ErreurWhoop).code).toBe("serveur");
    expect(appels).toHaveLength(3);
  });
});

/** API simulée par pages ; garde (depuis, offset) de chaque appel. */
function apiSimulee(pages: PageMesures[]) {
  const appels: [number, number | undefined][] = [];
  const api: ApiWithings = {
    async mesures(depuis, offset) {
      appels.push([depuis, offset]);
      return pages[offset ? offset / 100 : 0] ?? page([]);
    },
    activite: async () => ({ activities: [] }),
    sommeil: async () => ({ series: [] }),
    intraday: async () => ({ series: {} }),
  };
  return { api, appels };
}

describe("Withings : synchro", () => {
  it("premier branchement : tout l'historique (sans date), pages suivies par more/offset ; puis incrémental depuis updatetime moins 1 h", async () => {
    const { db } = await baseDeTest();
    const g1 = groupe({ date: s(matin - 48 * H) });
    const g2 = groupe({ date: s(matin - 24 * H), measures: [{ value: 7810, type: 1, unit: -2 }] });
    const g3 = groupe({ date: s(matin), measures: [{ value: 7790, type: 1, unit: -2 }, { value: 1730, type: 6, unit: -2 }] });
    const { api, appels } = apiSimulee([page([g1, g2], { more: 1, offset: 100 }), page([g3], { more: 0 })]);
    const b = await synchroniserWithings(db, api, matin + H);
    expect(appels).toEqual([[0, undefined], [0, 100]]);
    expect(b).toMatchObject({ historique: true, groupes: 3, pesees: 3, pages: 2 });
    expect((await listerPesees(db)).map((p) => [p.kg, p.origine])).toEqual([[77.9, "withings"], [78.1, "withings"], [78.35, "withings"]]);
    expect((await derniereMesure(db, "gras"))?.valeur).toBe(17.3);
    expect((await derniereMesure(db, "visceral"))?.valeur).toBe(7);
    const curseur = Number(await lireReglage(db, REGLAGE.curseur));
    expect(curseur).toBe(s(matin) + 3600);

    // incrémental : rien de neuf, rien d'ajouté ; même groupe relu (recouvrement) : pas de doublon
    const suite = apiSimulee([page([g3], { updatetime: curseur + 7200 })]);
    const b2 = await synchroniserWithings(db, suite.api, matin + 3 * H);
    expect(suite.appels).toEqual([[curseur - RECOUVREMENT_S, undefined]]);
    expect(b2).toMatchObject({ historique: false, pesees: 0, mesures: 0 });
    expect(await listerPesees(db)).toHaveLength(3);
    expect(Number(await lireReglage(db, REGLAGE.curseur))).toBe(curseur + 7200);
  });

  it("une erreur en cours de lecture n'avance pas le curseur (la reprise relit tout)", async () => {
    const { db } = await baseDeTest();
    const api: ApiWithings = {
      mesures: async (_d, offset) => (offset ? Promise.reject(new ErreurWhoop("reseau")) : page([groupe({ date: s(matin) })], { more: 1, offset: 100 })),
      activite: async () => ({ activities: [] }),
      sommeil: async () => ({ series: [] }),
      intraday: async () => ({ series: {} }),
    };
    expect(((await synchroniserWithings(db, api).catch((x: unknown) => x)) as ErreurWhoop).code).toBe("reseau");
    expect(await lireReglage(db, REGLAGE.curseur)).toBe(null);
    expect(await listerPesees(db)).toHaveLength(0);
  });

  it("pesée corrigée dans Withings (même date, autre poids) : la pesée suit ; mesure corrigée : la valeur suit", async () => {
    const { db } = await baseDeTest();
    await enregistrerMesures(db, [{ genre: "pesee", kg: 80, date: matin }, { genre: "corps", type: "gras", valeur: 18, date: matin }]);
    const b = await enregistrerMesures(db, [{ genre: "pesee", kg: 79.2, date: matin }, { genre: "corps", type: "gras", valeur: 17.6, date: matin }]);
    expect(b).toEqual({ pesees: 1, mesures: 1 });
    expect((await listerPesees(db)).map((p) => p.kg)).toEqual([79.2]);
    expect((await historiqueMesure(db, "gras")).map((m) => m.valeur)).toEqual([17.6]);
    expect(await enregistrerMesures(db, [{ genre: "pesee", kg: 79.2, date: matin }, { genre: "corps", type: "gras", valeur: 17.6, date: matin }])).toEqual({ pesees: 0, mesures: 0 });
  });

  it("dédoublonnage des pesées avec Santé Connect, dans les deux sens (même poids à moins de 12 h)", async () => {
    // l'appli Withings a déjà déposé la pesée dans Santé Connect : la lecture directe ne la double pas
    const a = await baseDeTest();
    await importerPeseesSante(a.db, { pesees: async () => [{ kg: 78.35, date: matin + 20_000, origine: "com.withings.wiscale2" }] });
    await synchroniserWithings(a.db, apiSimulee([page([groupe({ date: s(matin) })])]).api);
    expect((await listerPesees(a.db)).map((p) => p.origine)).toEqual(["com.withings.wiscale2"]);
    // lue d'abord chez Withings : Santé Connect ne la double pas
    const b = await baseDeTest();
    await synchroniserWithings(b.db, apiSimulee([page([groupe({ date: s(matin) })])]).api);
    expect(await importerPeseesSante(b.db, { pesees: async () => [{ kg: 78.35, date: matin + 20_000, origine: "com.withings.wiscale2" }] })).toBe(0);
    expect((await listerPesees(b.db)).map((p) => p.origine)).toEqual([ORIGINE_WITHINGS]);
    // une autre pesée (autre poids, ou plus de 12 h après) reste
    expect(await importerPeseesSante(b.db, { pesees: async () => [{ kg: 77.1, date: matin + 13 * H, origine: "com.sec.android.app.shealth" }] })).toBe(1);
  });

  it("mesures : Withings prime sur Santé Connect (à moins de 12 h), Whoop sur Withings ; une saisie n'est pas cachée", async () => {
    const { db } = await baseDeTest();
    await ajouterMesures(db, "gras", [{ valeur: 17.5, date: matin + 60_000, origine: "com.withings.wiscale2" }]);
    await ajouterMesures(db, "gras", [{ valeur: 19, date: matin - 2 * 24 * H, origine: "com.withings.wiscale2" }]);
    await ajouterMesures(db, "taille", [{ valeur: 181, date: matin + H, origine: "com.whoop.android" }], "whoop");
    await ajouterMesures(db, "gras", [{ valeur: 16, date: matin + 2 * H, origine: null }], "manuel");
    await synchroniserWithings(db, apiSimulee([page([groupe({ date: s(matin), measures: [{ value: 1752, type: 6, unit: -2 }, { value: 182, type: 4, unit: -2 }] })])]).api);
    // la même pesée de gras passée par Santé Connect est cachée ; l'ancienne (2 jours avant) reste ; la saisie aussi
    expect((await historiqueMesure(db, "gras")).map((m) => [m.valeur, m.source])).toEqual([[16, "manuel"], [17.52, "withings"], [19, "sante_connect"]]);
    // taille : Whoop prime
    expect((await historiqueMesure(db, "taille")).map((m) => m.source)).toEqual(["whoop"]);
  });

  it("purge à la déconnexion : seulement ce qui vient de Withings directement ; Santé Connect et saisies restent", async () => {
    const { db } = await baseDeTest();
    await synchroniserWithings(db, apiSimulee([page([groupe({ date: s(matin) })])]).api);
    await importerPeseesSante(db, { pesees: async () => [{ kg: 80.4, date: matin - 5 * 24 * H, origine: "com.withings.wiscale2" }] });
    await ajouterMesures(db, "gras", [{ valeur: 19, date: matin - 5 * 24 * H, origine: "com.withings.wiscale2" }]);
    await purgerWithings(db);
    expect((await listerPesees(db)).map((p) => p.origine)).toEqual(["com.withings.wiscale2"]);
    expect((await historiqueMesure(db, "gras")).map((m) => m.source)).toEqual(["sante_connect"]);
    expect(await historiqueMesure(db, "muscle")).toEqual([]);
    expect(await lireReglage(db, REGLAGE.curseur)).toBe(null);
  });
});

// Une pesée complète d'un Body Scan, au format de l'API (tests/fixtures/withings-body-scan.json) : reconstituée d'après la
// documentation et aiowithings, pas une capture réelle. Le Body Scan met une `position` sur la
// composition (7 : corps entier ; 6 : entre les jambes) et sur chaque zone (12 torse, 10 jambe gauche, 3 bras gauche, 11 jambe
// droite, 2 bras droit) ; l'ancien code écartait toute mesure avec une position, donc muscle, os, eau, viscéral, métabolisme de
// base… ne sont jamais arrivés alors que le poids (sans position) arrivait.
const bodyScan = JSON.parse(readFileSync(new URL("./fixtures/withings-body-scan.json", import.meta.url), "utf8")) as { status: number; body: PageMesures };
const t0 = bodyScan.body.measuregrps[0]!.date;

describe("Withings : pesée Body Scan complète", () => {
  it("toute la composition arrive, positions corps entier et entre les jambes comprises", () => {
    const l = convertirGroupe(bodyScan.body.measuregrps[0]!);
    const par = Object.fromEntries(l.map((m) => [m.genre === "pesee" ? "poids" : m.type, m.genre === "pesee" ? m.kg : m.valeur]));
    expect(par).toMatchObject({
      poids: 79.4, gras: 17.8, gras_kg: 14.133, maigre: 65.267, muscle: 61.05, eau: 47.32, os: 3.33, visceral: 2.1, bmr: 1931,
      age_metabolique: 36, eau_extra: 18.2, eau_intra: 29.12, fc_debout: 58, vop: 6.81, age_vasculaire: 41, score_nerveux: 82,
    });
  });

  it("zones : masse grasse, musculaire et non grasse de chaque zone, rangées par position (pas par ordre d'arrivée)", () => {
    const par = Object.fromEntries(
      convertirGroupe(bodyScan.body.measuregrps[0]!)
        .filter((m) => m.genre === "corps" && m.type.includes("_zone_"))
        .map((m) => [(m as { type: string }).type, (m as { valeur: number }).valeur]),
    );
    expect(par).toEqual({
      gras_zone_torse: 7.21, gras_zone_jambe_g: 2.63, gras_zone_bras_g: 1.01, gras_zone_jambe_d: 2.67, gras_zone_bras_d: 1.04,
      muscle_zone_torse: 27.45, muscle_zone_jambe_g: 11.25, muscle_zone_bras_g: 3.41, muscle_zone_jambe_d: 11.38, muscle_zone_bras_d: 3.52,
      maigre_zone_torse: 32.8, maigre_zone_jambe_g: 15.1, maigre_zone_bras_g: 4.3, maigre_zone_jambe_d: 15.3, maigre_zone_bras_d: 4.4,
    });
  });

  it("zones sans position : cinq mesures dans l'ordre torse, jambe g., bras g., jambe d., bras d. ; sinon écartées et comptées", () => {
    const g = (measures: GroupeWithings["measures"]): GroupeWithings => ({ grpid: 1, attrib: 0, date: s(matin), category: 1, measures });
    const cinq = [100, 200, 300, 400, 500].map((value) => ({ value, type: 175, unit: -2 }));
    const l = convertirGroupe(g(cinq)).map((m) => (m.genre === "corps" ? [m.type, m.valeur] : null));
    expect(l).toEqual([["muscle_zone_torse", 1], ["muscle_zone_jambe_g", 2], ["muscle_zone_bras_g", 3], ["muscle_zone_jambe_d", 4], ["muscle_zone_bras_d", 5]]);
    const trois = diagnostiquer([g(cinq.slice(0, 3))]);
    expect(trois.mesures).toEqual([]);
    expect(trois.diagnostic.ecartes.positions).toEqual(["175@-"]);
  });

  it("composition par zone (zones.ts, lue aussi par le MCP) : une pesée par date, la plus récente d'abord, % de gras de chaque zone", async () => {
    const { db } = await baseDeTest();
    await synchroniserWithings(db, apiSimulee([bodyScan.body]).api, t0 * 1000 + H);
    const autre = { type: "gras_zone_torse", date: t0 * 1000 - 86_400_000, valeur: 7.5 };
    const scans = scansParZone([...(await db.getAllAsync<{ type: string; date: number; valeur: number }>("SELECT type, date, valeur FROM mesure_corps", [])), autre]);
    expect(scans.map((x) => x.date)).toEqual([t0 * 1000, autre.date]);
    expect(scans[0]!.zones.torse).toEqual({ gras: 7.21, muscle: 27.45, maigre: 32.8, grasPct: 18 });
    expect(scans[0]!.zones.bras_d).toEqual({ gras: 1.04, muscle: 3.52, maigre: 4.4, grasPct: 19.1 });
    expect(scans[0]!.zones.jambe_g.grasPct).toBe(14.8);
    // la pesée d'avant n'a que le gras du torse : le reste est null, la part de gras aussi
    expect(scans[1]!.zones.torse).toEqual({ gras: 7.5, muscle: null, maigre: null, grasPct: null });
    expect(scans[1]!.zones.bras_g).toEqual({ gras: null, muscle: null, maigre: null, grasPct: null });
    expect([typeZone("muscle_zone_jambe_d"), typeZone("gras_kg"), typeZone("gras_zone_pied")]).toEqual([{ grandeur: "muscle", zone: "jambe_d" }, null, null]);
  });

  it("diagnostic : groupes, types reçus, écartés (objectif, ambigu), date du dernier groupe ; aucune valeur de santé", () => {
    const { diagnostic } = diagnostiquer(bodyScan.body.measuregrps);
    expect(diagnostic.groupes).toBe(4);
    expect(diagnostic.dernier).toBe(t0);
    expect(typesRecus(diagnostic)).toBe("1, 5, 6, 8, 11, 76, 77, 88, 91, 155, 167, 168, 169, 170, 173, 174, 175, 226, 227");
    expect(diagnostic.ecartes).toEqual({ objectifs: 1, ambigus: 1, positions: [], inconnus: [], nuls: 0 });
    expect(ecartes(diagnostic.ecartes)).toBe("1 obj., 1 amb.");
    // des comptes, des numéros de type et une date : pas une seule des valeurs mesurées
    const brut = JSON.stringify(diagnostic);
    for (const v of ["79400", "79.4", "1931", "14133", "6105", "4732"]) expect(brut.includes(v)).toBe(false);
  });

  it("synchro : tout est rangé dans mesure_corps (source withings), le journal est gardé ; une synchro vide garde la dernière livraison", async () => {
    const { db } = await baseDeTest();
    const b = await synchroniserWithings(db, apiSimulee([bodyScan.body]).api, t0 * 1000 + H);
    expect(b.groupes).toBe(4);
    expect((await derniereMesure(db, "visceral"))?.valeur).toBe(2.1);
    expect((await derniereMesure(db, "bmr"))?.valeur).toBe(1931);
    expect((await derniereMesure(db, "muscle"))?.valeur).toBe(61.05);
    expect((await derniereMesure(db, "os"))?.valeur).toBe(3.33);
    expect((await derniereMesure(db, "muscle_zone_bras_d"))?.valeur).toBe(3.52);
    expect((await derniereMesure(db, "gras_zone_torse"))?.source).toBe("withings");
    // la pesée de la veille (autre groupe) est là aussi, l'ambiguë et l'objectif non
    expect((await listerPesees(db)).map((p) => p.kg)).toEqual([79.4, 79.75]);

    const lu = lireDiagnostic(await lireReglage(db, REGLAGE.diagnostic));
    expect(lu).toMatchObject({ groupes: 4, dernier: t0, ecartes: { objectifs: 1, ambigus: 1 } });
    expect(lu?.ancien).toBeUndefined();

    // passage suivant : rien de neuf, le journal le dit mais garde types, écartés et date de la dernière livraison
    const vide = await synchroniserWithings(db, apiSimulee([page([])]).api, t0 * 1000 + 3 * H);
    expect(vide.groupes).toBe(0);
    expect(lireDiagnostic(await lireReglage(db, REGLAGE.diagnostic))).toMatchObject({ groupes: 0, ancien: true, dernier: t0, types: lu?.types });
  });

  it("journal illisible : ignoré", () => {
    expect(lireDiagnostic(null)).toBe(null);
    expect(lireDiagnostic("{pas du json")).toBe(null);
    expect(lireDiagnostic('{"groupes":1}')).toBe(null);
  });
});
