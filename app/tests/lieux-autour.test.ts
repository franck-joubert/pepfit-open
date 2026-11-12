// « Autour de moi » (retours du 28/10, b) : le serveur Overpass principal répondait 502 « at capacity » ; repli sur les
// suivants, cause de l'échec, cache périmé en secours. 09/11 : position arrondie pour tout tiers.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  arrondirPosition, cleSports, depuisCache, ErreurLieux, lireOverpass, MARGE_ARRONDI_M, MAX_AUTOUR, reponseOverpassValide, requeteOverpass, SERVEURS_OVERPASS, sportDuTag, sportsOSM,
  distanceM, type CacheAutour,
} from "../src/salles/osm.ts";
import { chercherSalles, DELAI_AUTOUR_MS, DELAI_OVERPASS_MS, sallesAutour } from "../src/salles/reseau.ts";

const CENTRE_VILLE = { lat: 48.8606, lon: 5.8327 };
const REPONSE = { elements: [{ type: "node", id: 1, lat: 48.861, lon: 5.8337, tags: { name: "Les Cercles de la Forme Valmont", leisure: "fitness_centre" } }] };

type Rep = { status: number; corps?: unknown; apresMs?: number } | "reseau" | "muet";
/** Faux fetch : réponse par URL ; « muet » ne répond jamais (seul l'abandon le libère), `apresMs` : réponse lente. */
function fauxFetch(reponses: Record<string, Rep>, appels: string[], abandons: string[] = []): typeof fetch {
  return ((url: string, init?: RequestInit) => {
    appels.push(url);
    const r = reponses[url] ?? "reseau";
    return new Promise<Response>((ok, ko) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () => {
        abandons.push(url);
        ko(new DOMException("Aborted", "AbortError"));
      });
      if (r === "muet") return;
      if (r === "reseau") return ko(new TypeError("Network request failed"));
      setTimeout(
        () => ok({ ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => (r.corps === undefined ? JSON.parse("<html>") : r.corps) } as Response),
        r.apresMs ?? 0,
      );
    });
  }) as typeof fetch;
}
/** Délais courts pour les tests : 300 ms en tout, relais à 50 ms. */
const VITE = { total: 300, relais: 50 };

test("serveurs de repli : dresel, le principal, puis kumi ; overpass.openstreetmap.fr (liste blanche, 403) est retiré", () => {
  assert.equal(SERVEURS_OVERPASS[0], "https://ovp.dresel.systems/api/interpreter");
  assert.equal(SERVEURS_OVERPASS[1], "https://overpass-api.de/api/interpreter");
  assert.equal(SERVEURS_OVERPASS.length, 3);
  assert.ok(!SERVEURS_OVERPASS.some((u) => u.includes("overpass.openstreetmap.fr")));
});

test("premier saturé (502) : le second répond, de vraies salles", async () => {
  const appels: string[] = [];
  const [a, b] = SERVEURS_OVERPASS;
  const l = await sallesAutour(CENTRE_VILLE, {}, fauxFetch({ [a]: { status: 502 }, [b]: { status: 200, corps: REPONSE } }, appels), SERVEURS_OVERPASS, VITE);
  assert.deepEqual(appels, [a, b]);
  assert.equal(l[0]!.nom, "Les Cercles de la Forme Valmont");
  assert.ok(l[0]!.distanceM! < 200);
});

test("200 avec une remarque d'erreur ou une page HTML : serveur suivant", async () => {
  const appels: string[] = [];
  const [a, b, c] = SERVEURS_OVERPASS;
  const l = await sallesAutour(
    CENTRE_VILLE,
    {},
    fauxFetch({ [a]: { status: 200, corps: { elements: [], remark: "runtime error: Query timed out" } }, [b]: { status: 200 }, [c]: { status: 200, corps: REPONSE } }, appels),
    SERVEURS_OVERPASS,
    VITE,
  );
  assert.equal(appels.length, 3);
  assert.equal(l.length, 1);
  assert.ok(reponseOverpassValide({ elements: [] }), "vide sans remarque : une vraie réponse (aucune salle)");
});

test("aucun serveur joint : cause « reseau » ; au moins un joint mais en panne : « serveurs »", async () => {
  await assert.rejects(sallesAutour(CENTRE_VILLE, {}, fauxFetch({}, []), SERVEURS_OVERPASS, VITE), (e) => e instanceof ErreurLieux && e.cause === "reseau");
  const [a] = SERVEURS_OVERPASS;
  await assert.rejects(sallesAutour(CENTRE_VILLE, {}, fauxFetch({ [a]: { status: 504 } }, []), SERVEURS_OVERPASS, VITE), (e) => e instanceof ErreurLieux && e.cause === "serveurs");
});

test("cache : vide jamais servi ; périmé servi seulement en secours", () => {
  const jour = 24 * 3600 * 1000;
  const cache: CacheAutour = { le: 0, position: CENTRE_VILLE, salles: [{ sourceId: "node/1", nom: "A", adresse: null, adresseComplete: null, lat: 48.861, lon: 5.8337, distanceM: null }] };
  assert.equal(depuisCache(cache, CENTRE_VILLE, 30 * jour), null);
  assert.equal(depuisCache(cache, CENTRE_VILLE, 30 * jour, true)?.length, 1);
  assert.equal(depuisCache({ ...cache, salles: [] }, CENTRE_VILLE, jour), null, "une liste vide redemande");
  assert.equal(depuisCache(cache, { lat: 48.9, lon: 5.7537 }, jour, true), null, "ailleurs : pas ces salles");
});

test("pas de limite côté serveur : les 60 plus proches gardées ici, pas les 60 premiers identifiants", () => {
  assert.ok(!/out center tags \d/.test(requeteOverpass(CENTRE_VILLE)));
  const loin = Array.from({ length: 80 }, (_, i) => ({ type: "node", id: i + 1, lat: 48.88 + i * 1e-4, lon: 5.8327, tags: { name: `Loin ${i}` } }));
  const pres = { type: "node", id: 999, lat: 48.8607, lon: 5.8327, tags: { name: "Coach du coin" } };
  const l = lireOverpass({ elements: [...loin, pres] }, CENTRE_VILLE);
  assert.equal(l.length, MAX_AUTOUR);
  assert.equal(l[0]!.nom, "Coach du coin");
});

// au padel, 30/10 à 16h32 : « Recherche des salles autour… » sans fin, et que des salles de sport cherchées.
const PADEL_PROCHE = { lat: 48.87405, lon: 5.84245 };
const REPONSE_PADEL = {
  elements: [
    { type: "node", id: 10, lat: 48.8745, lon: 5.8432, tags: { name: "Neoness Valmont", leisure: "fitness_centre" } },
    { type: "way", id: 1388796285, center: { lat: 48.87405, lon: 5.84245 }, tags: { name: "Lac Padel", leisure: "sports_centre", sport: "padel" } },
    // deux courts sans nom dans le club : le club suffit
    { type: "way", id: 21, center: { lat: 48.8741, lon: 5.8425 }, tags: { leisure: "pitch", sport: "padel" } },
    { type: "way", id: 22, center: { lat: 48.8742, lon: 5.8426 }, tags: { leisure: "pitch", sport: "padel" } },
    // quatre courts sans nom ailleurs (Montreuil), rien de nommé autour : un seul lieu « Padel (sans nom) »
    { type: "way", id: 31, center: { lat: 48.85302, lon: 5.8689 }, tags: { leisure: "pitch", sport: "padel" } },
    { type: "way", id: 32, center: { lat: 48.8532, lon: 5.86885 }, tags: { leisure: "pitch", sport: "padel" } },
    { type: "way", id: 33, center: { lat: 48.85336, lon: 5.86879 }, tags: { leisure: "pitch", sport: "padel" } },
    { type: "way", id: 34, center: { lat: 48.85351, lon: 5.86864 }, tags: { leisure: "pitch", sport: "padel" } },
    { type: "way", id: 40, center: { lat: 48.88, lon: 5.8437 }, tags: { name: "Tennis Club", leisure: "sports_centre", sport: "tennis;padel" } },
    { type: "node", id: 50, lat: 48.874, lon: 5.8417, tags: { leisure: "pitch", sport: "basketball" } },
    // « Padel 15 » : le centre (sans adresse) et un de ses courts (avec adresse), même nom, à 15 m : un seul lieu
    { type: "node", id: 60, lat: 48.82974, lon: 5.75848, tags: { name: "Padel 15", leisure: "sports_centre", sport: "padel" } },
    { type: "node", id: 61, lat: 48.82975, lon: 5.75868, tags: { name: "Padel 15", leisure: "pitch", sport: "padel", "addr:housenumber": "115", "addr:street": "Rue des Tanneurs" } },
    // du padel dans un centre aquatique : un terrain pour une séance de padel, pas une piscine
    { type: "way", id: 70, center: { lat: 48.92359, lon: 5.80909 }, tags: { name: "Centre Aquatique Olympique", leisure: "sports_centre", sport: "swimming;climbing;padel;fitness" } },
  ],
};

test("padel : la requête cherche les lieux de padel (10 km) en plus des salles de sport (3 km)", () => {
  assert.deepEqual(sportsOSM("cat:padel"), ["padel"]);
  assert.deepEqual(sportsOSM("cat:musculation"), [], "musculation : salles de sport seulement");
  assert.deepEqual(sportsOSM(null), []);
  const q = requeteOverpass(PADEL_PROCHE, sportsOSM("cat:padel"));
  assert.match(q, /nwr\["sport"~"\(\^\|;\)\(padel\)\(;\|\$\)"\]\[!"shop"\]\(around:10900,48\.87,5\.84\)/);
  assert.match(q, /"leisure"="fitness_centre"\]\(around:3900,/);
  assert.match(q, /\[timeout:10\]/);
  assert.ok(!requeteOverpass(PADEL_PROCHE).includes("padel"), "sans sport : pas de padel");
});

test("padel : le club d'abord (0 km, type terrain), courts sans nom regroupés, puis les salles de sport", () => {
  const l = lireOverpass(REPONSE_PADEL, PADEL_PROCHE, ["padel"], "Padel (sans nom)");
  assert.deepEqual(
    l.map((s) => s.nom),
    ["Lac Padel", "Tennis Club", "Padel (sans nom)", "Centre Aquatique Olympique", "Padel 15", "Neoness Valmont"],
  );
  assert.equal(l.find((s) => s.nom === "Padel 15")!.adresse, "115 rue des Tanneurs", "le doublon gardé est celui qui a une adresse");
  assert.equal(l.find((s) => s.nom === "Centre Aquatique Olympique")!.type, "terrain");
  assert.equal(lireOverpass(REPONSE_PADEL, PADEL_PROCHE, ["swimming"]).find((s) => s.nom === "Centre Aquatique Olympique")!.type, "piscine");
  assert.equal(l[0]!.type, "terrain");
  assert.ok(l[0]!.distanceM! < 1);
  assert.equal(l[2]!.sourceId, "way/34", "le court le plus proche représente le groupe");
  assert.equal(l[5]!.type, "salle");
  assert.equal(l[5]!.duSport, false);
  // le tag sport=* d'OSM devient le sport du lieu (image par défaut du padel pour « Padel 15 », sans séance de padel)
  assert.equal(l.find((s) => s.nom === "Padel 15")!.sport, "padel");
  assert.equal(l.find((s) => s.nom === "Tennis Club")!.sport, "tennis");
  assert.equal(l.find((s) => s.nom === "Neoness Valmont")!.sport, undefined);
  assert.equal(lireOverpass(REPONSE_PADEL, PADEL_PROCHE).find((s) => s.nom === "Padel 15")!.sport, "padel");
  assert.equal(sportDuTag("fitness;padel"), "padel");
  assert.equal(sportDuTag("curling"), undefined);
  assert.equal(sportDuTag(undefined), undefined);
  // sans sport demandé : seulement les lieux nommés, au plus près
  assert.deepEqual(lireOverpass(REPONSE_PADEL, PADEL_PROCHE).map((s) => s.nom), ["Lac Padel", "Neoness Valmont", "Tennis Club", "Centre Aquatique Olympique", "Padel 15"]);
});

test("cache : une liste padel ne sert pas pour une séance de musculation", () => {
  const salles = lireOverpass(REPONSE_PADEL, PADEL_PROCHE, ["padel"], "Padel (sans nom)");
  const cache: CacheAutour = { le: 0, position: PADEL_PROCHE, salles, sports: cleSports(["padel"]) };
  assert.equal(depuisCache(cache, PADEL_PROCHE, 1000, false, ["padel"])?.[0]!.nom, "Lac Padel");
  assert.equal(depuisCache(cache, PADEL_PROCHE, 1000, false, []), null);
  assert.equal(depuisCache({ ...cache, sports: undefined }, PADEL_PROCHE, 1000, false, []) !== null, true, "ancien cache sans sport : salles de sport");
});

test("serveurs muets (lenteur) : erreur au délai, jamais d'attente sans fin, requêtes coupées", async () => {
  const abandons: string[] = [];
  const appels: string[] = [];
  const muets = Object.fromEntries(SERVEURS_OVERPASS.map((u) => [u, "muet" as const]));
  const debut = Date.now();
  await assert.rejects(sallesAutour(PADEL_PROCHE, {}, fauxFetch(muets, appels, abandons), SERVEURS_OVERPASS, VITE), (e) => e instanceof ErreurLieux && e.cause === "serveurs");
  const duree = Date.now() - debut;
  assert.ok(duree >= 290 && duree < 600, `délai tenu (${duree} ms)`);
  assert.deepEqual(appels, [...SERVEURS_OVERPASS], "relais : chaque serveur a été essayé dans le délai");
  assert.equal(abandons.length, 3, "toutes les requêtes coupées");
  assert.equal(DELAI_OVERPASS_MS, 8000, "8 s au plus dans l'appli");
});

test("premier serveur lent : le suivant part au relais et sa réponse gagne", async () => {
  const appels: string[] = [];
  const abandons: string[] = [];
  const [a, b] = SERVEURS_OVERPASS;
  const l = await sallesAutour(
    PADEL_PROCHE,
    { sports: ["padel"], sansNom: "Padel (sans nom)" },
    fauxFetch({ [a]: "muet", [b]: { status: 200, corps: REPONSE_PADEL, apresMs: 20 } }, appels, abandons),
    SERVEURS_OVERPASS,
    VITE,
  );
  assert.equal(l[0]!.nom, "Lac Padel");
  assert.deepEqual(appels, [a, b]);
  assert.deepEqual(abandons, [a], "le lent est coupé");
});

test("429 partout : « serveurs » tout de suite, sans attendre le délai", async () => {
  const trop = Object.fromEntries(SERVEURS_OVERPASS.map((u) => [u, { status: 429 }]));
  const debut = Date.now();
  await assert.rejects(sallesAutour(PADEL_PROCHE, {}, fauxFetch(trop, []), SERVEURS_OVERPASS, VITE), (e) => e instanceof ErreurLieux && e.cause === "serveurs" && /429/.test(e.message));
  assert.ok(Date.now() - debut < 200);
});

test("429 puis réponse vide : liste vide (« Aucun lieu trouvé autour »), pas une erreur", async () => {
  const [a, b] = SERVEURS_OVERPASS;
  const l = await sallesAutour(PADEL_PROCHE, { sports: ["padel"] }, fauxFetch({ [a]: { status: 429 }, [b]: { status: 200, corps: { elements: [] } } }, []), SERVEURS_OVERPASS, VITE);
  assert.deepEqual(l, []);
});

test("recherche par nom (Photon) : tous les lieux de loisir, padel gardé, parc écarté", async () => {
  const appels: string[] = [];
  const photon = {
    features: [
      { geometry: { coordinates: [5.84245, 48.87405] }, properties: { osm_type: "W", osm_id: 1388796285, name: "Lac Padel", osm_key: "leisure", osm_value: "sports_centre", street: "Rue des Vignes", city: "Valmont-sur-Meuse" } },
      { geometry: { coordinates: [5.8437, 48.875] }, properties: { osm_type: "W", osm_id: 5, name: "Parc des Padels", osm_key: "leisure", osm_value: "park" } },
    ],
  };
  const f = ((url: string) => {
    appels.push(url);
    return Promise.resolve({ ok: true, status: 200, json: async () => photon } as Response);
  }) as typeof fetch;
  const l = await chercherSalles("lac padel", PADEL_PROCHE, f);
  assert.match(appels[0]!, /osm_tag=leisure&/);
  assert.deepEqual(l.map((s) => s.nom), ["Lac Padel"]);
  assert.equal(l[0]!.type, "terrain");
});

// ——— 09/11 : position arrondie, rayons exacts ———

test("position arrondie : la requête ne porte jamais la vraie position, et l'arrondi ne dépasse jamais la marge de 900 m", () => {
  const q = requeteOverpass(PADEL_PROCHE, ["padel"]);
  assert.ok(!q.includes("48.87405") && !q.includes("5.84245"));
  assert.deepEqual(arrondirPosition(PADEL_PROCHE), { lat: 48.87, lon: 5.84 });
  let pire = 0;
  // la France (métropole et un peu plus) sur une grille fine
  for (let lat = 41; lat <= 51.5; lat += 0.0137) for (let lon = -5.5; lon <= 10; lon += 0.0191) pire = Math.max(pire, distanceM({ lat, lon }, arrondirPosition({ lat, lon })));
  assert.ok(pire < MARGE_ARRONDI_M, `arrondi au pire à ${Math.round(pire)} m`);
});

test("rayons exacts : un lieu dans la marge mais hors du rayon est écarté, un grand terrain compte par son bord", () => {
  const P = { lat: 48.8606, lon: 5.8327 };
  const nord = (m: number) => P.lat + m / 111195;
  const json = {
    elements: [
      { type: "node", id: 1, lat: nord(2900), lon: P.lon, tags: { name: "Salle 2,9 km", leisure: "fitness_centre" } },
      { type: "node", id: 2, lat: nord(3400), lon: P.lon, tags: { name: "Salle 3,4 km (dans la marge)", leisure: "fitness_centre" } },
      { type: "node", id: 3, lat: nord(9500), lon: P.lon, tags: { name: "Padel 9,5 km", leisure: "sports_centre", sport: "padel" } },
      { type: "node", id: 4, lat: nord(10500), lon: P.lon, tags: { name: "Padel 10,5 km (dans la marge)", leisure: "sports_centre", sport: "padel" } },
      // centre à 3,6 km, bord à 2,8 km : « around » d'Overpass l'aurait rendu
      { type: "way", id: 5, center: { lat: nord(3600), lon: P.lon }, bounds: { minlat: nord(2800), maxlat: nord(4400), minlon: P.lon - 0.01, maxlon: P.lon + 0.01 }, tags: { name: "Grand centre", leisure: "fitness_centre" } },
    ],
  };
  const limites = { salles: 3000, sport: 10000 };
  assert.deepEqual(lireOverpass(json, P, ["padel"], undefined, limites).map((s) => s.nom), ["Padel 9,5 km", "Salle 2,9 km", "Grand centre"]);
  assert.equal(lireOverpass(json, P, ["padel"]).length, 5, "sans limites : tout ce que le serveur rend");
  const sansNom = { elements: [{ type: "node", id: 9, lat: nord(10400), lon: P.lon, tags: { leisure: "pitch", sport: "padel" } }] };
  assert.deepEqual(lireOverpass(sansNom, P, ["padel"], "Padel (sans nom)", limites), [], "terrain sans nom hors rayon : pas de lieu « sans nom »");
});

test("Overpass : la requête porte la position arrondie, la lecture garde le rayon exact", async () => {
  const corps: string[] = [];
  const f = ((url: string, init?: RequestInit) => {
    corps.push(decodeURIComponent(String(init?.body)));
    const loin = { type: "node", id: 2, lat: CENTRE_VILLE.lat + 3300 / 111195, lon: CENTRE_VILLE.lon, tags: { name: "Dans la marge", leisure: "fitness_centre" } };
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ elements: [...REPONSE.elements, loin] }) } as Response);
  }) as typeof fetch;
  const l = await sallesAutour(CENTRE_VILLE, {}, f, SERVEURS_OVERPASS, VITE);
  assert.equal(corps.length, 1);
  assert.match(corps[0]!, /around:3900,48\.86,5\.83/);
  assert.ok(!corps[0]!.includes("48.8606") && !corps[0]!.includes("5.8327"));
  assert.deepEqual(l.map((s) => s.nom), ["Les Cercles de la Forme Valmont"], "le lieu à 3,3 km est hors du rayon de 3 km");
});

test("délais : Overpass 8 s, la garde de l'écran en tient compte", () => {
  assert.equal(DELAI_AUTOUR_MS, DELAI_OVERPASS_MS);
});
