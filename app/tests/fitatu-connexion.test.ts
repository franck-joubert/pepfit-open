// Connexion Fitatu (API privée de l'appli web, docs/FITATU.md) : session relevée dans la page, client (en-têtes, 401 et
// renouvellement, 429 et Retry-After), conversion d'une journée, import par lots avec reprise et idempotence, et fichier
// ni Hevy ni Fitatu. Réponses d'API INVENTÉES, au format documenté ; aucune donnée réelle, aucun secret réel.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { consommationsDuJour } from "../src/db/depots/nutrition.ts";
import type { Executeur } from "../src/db/executeur.ts";
import { creerClientFitatu, ErreurFitatu, type ReponseHttp, type SessionFitatu } from "../src/fitatu/api.ts";
import { ATTENTE_LIMITE_MS, ESSAIS_429, fileAppels, importerHistorique, lots, repasDuJour, type DepsHistorique, type EtatImportFitatu } from "../src/fitatu/historique.ts";
import { connecteDans, lireCapture, premiereDate, sessionDepuisCapture } from "../src/fitatu/session.ts";
import { importerFitatu } from "../src/import/fitatu.ts";
import { genreFichier, importerTexte } from "../src/import/index.ts";
import { ErreurImport } from "../src/import/hevy-csv.ts";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (o: Record<string, unknown>) => `${b64({ alg: "RS256" })}.${b64(o)}.signature-fictive`;
const JETON = jwt({ id: 900001, createdAt: "2026-06-20 09:00:00", exp: 2_000_000_000 });
const ENTETES = { "api-key": "CLE-FICTIVE", "api-secret": "SECRET-FICTIF", "app-os": "FITATU-WEB", "app-uuid": "00000000-0000-1000-8000-000000000000" };

function session(o: Partial<SessionFitatu> = {}): SessionFitatu {
  return { jeton: JETON, renouvellement: "rt-fictif", uid: "900001", base: "https://xx-xx.fitatu.example/api", entetes: { ...ENTETES }, cluster: "xx-xx900001", ...o };
}

test("session relevée dans la page : jeton, compte, racine de l'API, en-têtes ; rien sans api-secret", () => {
  const c = lireCapture(
    JSON.stringify({
      entetes: { ...ENTETES, authorization: "Bearer autre", "api-cluster": "fr-fr900001" },
      url: "https://fr-fr.fitatu.com/api/diet-and-activity-plan/900001/day/2026-10-30",
      user: JSON.stringify({ id: 900001, token: JETON, refresh_token: "rt-fictif" }),
    }),
  )!;
  const s = sessionDepuisCapture(c)!;
  assert.equal(s.uid, "900001");
  assert.equal(s.base, "https://fr-fr.fitatu.com/api");
  assert.equal(s.cluster, "fr-fr900001");
  assert.equal(s.renouvellement, "rt-fictif");
  assert.equal(s.entetes["api-secret"], "SECRET-FICTIF");
  assert.ok(!("authorization" in s.entetes) && !("api-cluster" in s.entetes));

  // pas encore d'appel vu : racine tirée de storageLocale, API-Cluster déduit
  const sans = sessionDepuisCapture({ entetes: ENTETES, user: JSON.stringify({ token: JETON, storageLocale: "fr_FR" }) })!;
  assert.equal(sans.base, "https://fr-fr.fitatu.com/api");
  assert.equal(sans.cluster, "fr-fr900001");

  const { "api-secret": _, ...sansSecret } = ENTETES;
  assert.equal(sessionDepuisCapture({ ...c, entetes: sansSecret }), null);
  assert.equal(sessionDepuisCapture({ entetes: ENTETES, url: c.url }), null); // pas connecté
  assert.equal(lireCapture("pas du json"), null);
});

test("avant la connexion : clés user ou token sans vrai jeton → pas connecté (pas d'échec annoncé trop tôt)", () => {
  for (const c of [{ user: "null" }, { user: JSON.stringify({ locale: "fr_FR" }) }, { token: "invite" }, { user: JSON.stringify({ token: "pas-un-jwt", id: 3 }) }]) {
    assert.equal(connecteDans({ entetes: ENTETES, ...c }), false, JSON.stringify(c));
    assert.equal(sessionDepuisCapture({ entetes: ENTETES, ...c }), null);
  }
  assert.equal(connecteDans({ user: JSON.stringify({ token: JETON }) }), true);
});

test("première date : création du compte (profil, sinon jeton), sinon le repli", () => {
  assert.equal(premiereDate({ createdAt: "2025-03-04T10:00:00+01:00" }, JETON, "2024-01-01"), "2025-03-04");
  assert.equal(premiereDate(null, JETON, "2024-01-01"), "2026-06-20");
  assert.equal(premiereDate({}, jwt({ id: 1 }), "2024-01-01"), "2024-01-01");
});

/** Réponse HTTP simulée. */
const rep = (status: number, corps: unknown = {}, entetes: Record<string, string> = {}): ReponseHttp => ({
  status,
  headers: { get: (n) => entetes[n.toLowerCase()] ?? null },
  text: async () => (typeof corps === "string" ? corps : JSON.stringify(corps)),
});

function clientSimule(reponses: ((url: string, init: { method: string; headers: Record<string, string>; body?: string }) => ReponseHttp)[], s = session()) {
  let courante: SessionFitatu | null = s;
  const appels: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const attentes: number[] = [];
  const c = creerClientFitatu({
    fetch: async (url, init) => {
      appels.push({ url, ...init });
      const r = reponses.shift();
      if (!r) throw new Error("hors ligne");
      return r(url, init);
    },
    lireSession: async () => courante,
    ecrireSession: async (n) => void (courante = n),
    attendre: async (ms) => void attentes.push(ms),
  });
  return { c, appels, attentes, session: () => courante };
}

test("client : en-têtes de l'appli web, jeton et API-Cluster ; lecture seule (GET)", async () => {
  const { c, appels } = clientSimule([() => rep(200, { dietPlan: {} })]);
  await c.jour("2026-10-01");
  assert.equal(appels[0]!.url, "https://xx-xx.fitatu.example/api/diet-and-activity-plan/900001/day/2026-10-01");
  assert.equal(appels[0]!.method, "GET");
  assert.equal(appels[0]!.headers["authorization"], `Bearer ${JETON}`);
  assert.equal(appels[0]!.headers["api-cluster"], "xx-xx900001");
  assert.equal(appels[0]!.headers["api-key"], "CLE-FICTIVE");
});

test("client : 401 → jeton renouvelé (POST /token/refresh), gardé, appel rejoué ; refus → erreur de session", async () => {
  const nouveau = jwt({ id: 900001, n: 2 });
  const ok = clientSimule([() => rep(401), () => rep(200, { token: nouveau, refresh_token: "rt-2" }), () => rep(200, { dietPlan: {} })]);
  await ok.c.jour("2026-10-01");
  assert.equal(ok.appels[1]!.url, "https://xx-xx.fitatu.example/api/token/refresh");
  assert.deepEqual(JSON.parse(ok.appels[1]!.body!), { refresh_token: "rt-fictif" });
  assert.equal(ok.appels[2]!.headers["authorization"], `Bearer ${nouveau}`);
  assert.equal(ok.session()!.jeton, nouveau);
  assert.equal(ok.session()!.renouvellement, "rt-2");

  const refuse = clientSimule([() => rep(401), () => rep(401, { message: "Missing JWT Refresh Token" })]);
  const e = await refuse.c.jour("2026-10-01").catch((x: unknown) => x);
  assert.ok(e instanceof ErreurFitatu && e.code === "session");

  const encore = clientSimule([() => rep(401), () => rep(200, { token: nouveau }), () => rep(401)]);
  const e2 = await encore.c.jour("2026-10-01").catch((x: unknown) => x);
  assert.ok(e2 instanceof ErreurFitatu && e2.code === "session");
});

test("client : 429 → attend Retry-After (30 s au plus) une fois ; sinon « limite » ; 404, réseau, réponse illisible", async () => {
  const patient = clientSimule([() => rep(429, {}, { "retry-after": "2" }), () => rep(200, { dietPlan: {} })]);
  await patient.c.jour("2026-10-01");
  assert.deepEqual(patient.attentes, [2000]);

  const deux = clientSimule([() => rep(429, {}, { "retry-after": "2" }), () => rep(429, {}, { "retry-after": "2" })]);
  const e = await deux.c.jour("2026-10-01").catch((x: unknown) => x);
  assert.ok(e instanceof ErreurFitatu && e.code === "limite");

  const long = clientSimule([() => rep(429, {}, { "retry-after": "600" })]);
  const e2 = await long.c.jour("2026-10-01").catch((x: unknown) => x);
  assert.ok(e2 instanceof ErreurFitatu && e2.code === "limite");
  assert.deepEqual(long.attentes, []);

  const absent = await clientSimule([() => rep(404)]).c.produit(5).catch((x: unknown) => x);
  assert.ok(absent instanceof ErreurFitatu && absent.code === "absent");
  const reseau = await clientSimule([]).c.jour("2026-10-01").catch((x: unknown) => x);
  assert.ok(reseau instanceof ErreurFitatu && reseau.code === "reseau");
  const illisible = await clientSimule([() => rep(200, "<html>")]).c.jour("2026-10-01").catch((x: unknown) => x);
  assert.ok(illisible instanceof ErreurFitatu && illisible.code === "format");
});

test("conversion d'une journée : repas gardés avec leurs lignes, lignes supprimées (deletedAt) et repas vides écartés", () => {
  const r = repasDuJour({
    planDayRevisions: [],
    dietPlan: {
      breakfast: { mealName: "Petit déjeuner", items: [{ planDayDietItemId: "x1", productId: 1 }, { planDayDietItemId: "x2", productId: 2, deletedAt: "2026-10-01 10:00:00" }] },
      lunch: { mealName: "Déjeuner", items: [] },
      supper: { mealName: "Dîner" },
    },
  });
  assert.deepEqual(Object.keys(r), ["breakfast"]);
  assert.deepEqual(r["breakfast"]!.items.map((i) => i.planDayDietItemId), ["x1"]);
  assert.equal(r["breakfast"]!.mealName, "Petit déjeuner");
  assert.deepEqual(repasDuJour(null), {});
});

test("lots de 7 jours, du plus ancien au plus récent, dernier lot raccourci", () => {
  const l = lots("2026-10-01", "2026-10-16", 7);
  assert.equal(l.length, 3);
  assert.deepEqual(l[0], ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"]);
  assert.deepEqual(l[2], ["2026-10-15", "2026-10-16"]);
});

// ---- Import par lots, sur une base de test et un « Fitatu » simulé ------------------------------------------------------

const ligne = (id: string, o: Record<string, unknown>) => ({ planDayDietItemId: id, foodType: "PRODUCT", measureId: 1, measureName: "g", ...o });

/** Journal fictif : 10 jours, du 2026-10-01 au 2026-10-10, dont des jours vides. */
const JOURNAL: Record<string, unknown> = {
  "2026-10-01": { dietPlan: { breakfast: { mealName: "Petit déjeuner", items: [ligne("i1", { productId: 10, name: "Flocons fictifs", weight: 60, measureQuantity: 60, energy: 222 })] } } },
  "2026-10-03": {
    dietPlan: {
      lunch: { items: [ligne("i2", { productId: 11, name: "Fromage perso fictif", weight: 30, measureQuantity: 30, energy: 110 })] },
      supper: { items: [ligne("i3", { foodType: "CUSTOM_ITEM", name: "Repas libre fictif", measureId: 39, measureQuantity: 1, energy: 650, protein: 40, fat: 20, carbohydrate: 70 })] },
    },
  },
  "2026-10-08": { dietPlan: { breakfast: { items: [ligne("i4", { productId: 10, name: "Flocons fictifs", weight: 80, measureQuantity: 80, energy: 296 })] } } },
  "2026-10-10": { dietPlan: { second_breakfast: { items: [ligne("i5", { productId: 12, name: "Produit retiré fictif", weight: 100, measureQuantity: 100, energy: 50 })] } } },
};
const PRODUITS: Record<string, unknown> = {
  "10": { id: 10, name: "Flocons fictifs", brand: "Moulin fictif", barcode: "3000000000999", energy: 370, protein: 13, fat: 7, carbohydrate: 59, measures: [{ id: 1, name: "g", weightPerUnit: 1 }] },
  "11": { id: 11, name: "Fromage perso fictif", energy: 360, protein: 25, fat: 28, carbohydrate: 1, userId: 900001, private: true },
};

interface Simu {
  d: DepsHistorique;
  appels: string[];
  pauses: number;
  etat: () => EtatImportFitatu | null;
  panne: { sur?: string; erreur?: () => unknown };
  aujourdhui: string;
  actif: boolean;
}

function simulation(db: Executeur): Simu {
  let brut: string | null = null;
  const s: Simu = {
    appels: [],
    pauses: 0,
    etat: () => (brut ? (JSON.parse(brut) as EtatImportFitatu) : null),
    panne: {},
    aujourdhui: "2026-10-10",
    actif: true,
    d: null as unknown as DepsHistorique,
  };
  // les réponses passent par le vrai client (en-têtes, codes HTTP), devant un serveur simulé
  let courante: SessionFitatu | null = session();
  const c = creerClientFitatu({
    fetch: async (url) => {
      const chemin = url.replace(courante!.base, "");
      s.appels.push(chemin);
      if (s.panne.sur && chemin.includes(s.panne.sur) && s.panne.erreur) {
        const e = s.panne.erreur();
        if (e instanceof Error) throw e;
        return e as ReponseHttp;
      }
      const j = /\/day\/(\d{4}-\d{2}-\d{2})$/.exec(chemin);
      if (j) return rep(200, JOURNAL[j[1]!] ?? { dietPlan: {} });
      const p = /^\/products\/(\d+)$/.exec(chemin);
      if (p) return PRODUITS[p[1]!] ? rep(200, PRODUITS[p[1]!]) : rep(404);
      if (chemin === "/users/900001") return rep(200, { createdAt: "2026-10-01 08:00:00", storageLocale: "fr_FR" });
      return rep(500);
    },
    lireSession: async () => courante,
    ecrireSession: async (n) => void (courante = n),
    attendre: async () => {},
  });
  s.d = {
    jour: (d) => c.jour(d),
    produit: (id) => c.produit(id),
    produitConnu: async (id) => {
      const r = await db.getFirstAsync<{ import_cle: string }>("SELECT import_cle FROM produits WHERE import_cle IN (?, ?)", [`fitatu:produit:${id}`, `fitatu:perso:${id}`]);
      return r ? (r.import_cle.startsWith("fitatu:perso:") ? "perso" : "produit") : null;
    },
    importer: (e, joursRelus) => importerFitatu(db, e, Date.now(), { joursRelus }), // importerFitatu ouvre lui-même sa transaction exclusive (db/exclusif.ts)
    lireEtat: async () => brut,
    ecrireEtat: async (e) => void (brut = e),
    attendre: async () => void s.pauses++,
    aujourdhui: () => s.aujourdhui,
    premiereDate: async () => premiereDate(await c.utilisateur(), JETON, "2020-01-01"),
    actif: async () => s.actif,
  };
  return s;
}

/** Lots de 7 jours : le journal fictif de 10 jours en fait deux. */
const LOT7 = { lot: 7 };

const compter = async (db: Executeur) => (await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM consommations", []))!.n;

test("import : de la création du compte à aujourd'hui, par lots, produits lus une fois, pauses entre les appels", async () => {
  const { db } = await baseDeTest();
  const s = simulation(db);
  const vus: number[] = [];
  s.d.progres = (p) => vus.push(p.jours);
  assert.equal(await importerHistorique(s.d, LOT7), "fini");

  const jours = s.appels.filter((a) => a.includes("/day/"));
  assert.equal(jours.length, 10);
  assert.equal(jours[0], "/diet-and-activity-plan/900001/day/2026-10-01");
  // produit 10 lu une seule fois (vu les 1er et 8) ; 12 absent (404) : l'aliment garde ses valeurs du journal
  assert.deepEqual(s.appels.filter((a) => a.startsWith("/products/")), ["/products/10", "/products/11", "/products/12"]);
  // une pause entre deux appels à Fitatu (le profil compris)
  assert.equal(s.pauses, s.appels.length - 2);
  // un pas par jour lu, puis la fin de chaque lot
  assert.deepEqual(vus, [0, 1, 2, 3, 4, 5, 6, 7, 7, 8, 9, 10, 10]);

  assert.equal(await compter(db), 5);
  const e = s.etat()!;
  assert.equal(e.fini, true);
  assert.equal(e.debut, "2026-10-01");
  assert.equal(e.alimentsImportes, 5);
  assert.equal(e.joursAvecRepas, 4);
  const perso = await db.getFirstAsync<{ nom: string }>("SELECT nom FROM produits WHERE import_cle = 'fitatu:perso:11'", []);
  assert.equal(perso?.nom, "Fromage perso fictif");
  const [c8] = await consommationsDuJour(db, "2026-10-08");
  assert.equal(c8!.quantite_g, 80);
  assert.equal(c8!.repas_id, "repas:petit_dej");
});

test("reprise après coupure : réseau perdu au 2e lot → l'avancement reste au 1er ; la reprise ne relit pas le 1er lot", async () => {
  const { db } = await baseDeTest();
  const s = simulation(db);
  s.panne = { sur: "/day/2026-10-09", erreur: () => new Error("hors ligne") };
  assert.equal(await importerHistorique(s.d, LOT7), "reseau");
  assert.equal(s.etat()!.fait, "2026-10-07");
  assert.equal(s.etat()!.fini, undefined);
  assert.equal(await compter(db), 3); // lot 1 importé, lot 2 non

  s.panne = {};
  s.appels.length = 0;
  assert.equal(await importerHistorique(s.d, LOT7), "fini");
  const relus = s.appels.filter((a) => a.includes("/day/")).map((a) => a.slice(-10));
  assert.deepEqual(relus, ["2026-10-08", "2026-10-09", "2026-10-10"]);
  // le produit 10, importé au 1er lot, n'est pas relu
  assert.ok(!s.appels.includes("/products/10"));
  assert.equal(await compter(db), 5);
  assert.equal(s.etat()!.alimentsImportes, 5);
});

test("401 sans renouvellement possible → « session » ; 429 répété → « limite » : l'avancement reste", async () => {
  const { db } = await baseDeTest();
  const s = simulation(db);
  // 401 sur un jour, et /token/refresh refusé par le serveur simulé : il faut se reconnecter
  s.panne = { sur: "/day/2026-10-03", erreur: () => rep(401) };
  assert.equal(await importerHistorique(s.d, LOT7), "session");
  assert.equal(s.etat()!.fait, null);
  assert.equal(await compter(db), 0);

  s.panne = { sur: "/day/2026-10-09", erreur: () => rep(429, {}, { "retry-after": "1" }) };
  assert.equal(await importerHistorique(s.d, LOT7), "limite");
  assert.equal(s.etat()!.fait, "2026-10-07");
  s.panne = {};
  assert.equal(await importerHistorique(s.d, LOT7), "fini");
  assert.equal(await compter(db), 5);
});

test("idempotence : « Mettre à jour » relit les derniers jours jusqu'à aujourd'hui sans rien doubler, le perso est réutilisé", async () => {
  const { db } = await baseDeTest();
  const s = simulation(db);
  assert.equal(await importerHistorique(s.d, LOT7), "fini");
  // déjà fini : sans « Mettre à jour », rien n'est relu
  s.appels.length = 0;
  assert.equal(await importerHistorique(s.d, LOT7), "fini");
  assert.equal(s.appels.length, 0);

  s.aujourdhui = "2026-10-12";
  JOURNAL["2026-10-12"] = { dietPlan: { lunch: { items: [ligne("i6", { productId: 11, name: "Fromage perso fictif", weight: 20, measureQuantity: 20, energy: 72 })] } } };
  try {
    assert.equal(await importerHistorique(s.d, { ...LOT7, mettreAJour: true }), "fini");
    const e = s.etat()!;
    assert.equal(e.debut, "2026-10-03"); // fin précédente − 7 jours
    assert.equal(e.fin, "2026-10-12");
    assert.equal(e.alimentsImportes, 1);
    assert.equal(e.alimentsDejaPresents, 4);
    assert.equal(await compter(db), 6);
    // produits déjà importés : ni relus chez Fitatu, ni recréés
    assert.ok(!s.appels.some((a) => a.startsWith("/products/1")));
    assert.equal((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM produits WHERE import_cle LIKE 'fitatu:perso:11'", []))!.n, 1);
    assert.equal((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM produits WHERE import_cle LIKE 'fitatu:%:11'", []))!.n, 1);
  } finally {
    delete JOURNAL["2026-10-12"];
  }
});

test("déconnecté pendant l'import : arrêt sans rien écrire de plus", async () => {
  const { db } = await baseDeTest();
  const s = simulation(db);
  s.actif = false;
  assert.equal(await importerHistorique(s.d, LOT7), "coupe");
  assert.equal(await compter(db), 0);
});

test("fichier ni Hevy ni Fitatu : « Fichier non reconnu »", async () => {
  assert.equal(genreFichier('{"jours": {}, "aliments": {}}'), "fitatu");
  assert.equal(genreFichier('[{"title": "Push", "exercises": []}]'), "routines");
  assert.equal(genreFichier('"title","start_time","end_time","exercise_title"\n'), "seances");
  assert.equal(genreFichier('{"diary": []}'), null);
  assert.equal(genreFichier("date,calories\n2026-10-01,2100\n"), null);
  const { db } = await baseDeTest();
  const e = await importerTexte(db, "date,calories\n2026-10-01,2100\n").catch((x: unknown) => x);
  assert.ok(e instanceof ErreurImport);
  assert.equal(e.message, "Fichier non reconnu : ni un export Hevy, ni un export Fitatu.");
});
