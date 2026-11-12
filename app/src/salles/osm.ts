// Salles d'OpenStreetMap (D26) : « Autour de moi » par Overpass et recherche par nom par Photon. Logique pure
// (requêtes, lecture des réponses, distances, cache) ; l'appel réseau est dans reseau.ts. Depuis le 30/10 (au padel,
// « Autour de moi » vide) : les lieux du sport de la séance (terrains et centres de padel, courts de tennis, piscines…) en tête,
// les salles de sport ensuite. Depuis le 09/11 : toute position qui part vers un tiers (Overpass, Photon) est arrondie à 0,01°.
import { M_PAR_MI, nombre } from "../ecrans/format";
import { lireActif } from "../i18n/index";

export interface Position {
  lat: number;
  lon: number;
}

/** Une salle trouvée sur OSM, pas encore dans « Mes salles ». */
export interface SalleOSM {
  /** « node/123 », « way/456 » ou « relation/789 » : clé unique de la salle, reprise dans salle.source_id. */
  sourceId: string;
  nom: string;
  /** « 251 bd Jean Jaurès », ou null si OSM n'a pas de rue. */
  adresse: string | null;
  /** « 12 rue des Lilas, 55300 Valmont-sur-Meuse » (fiche de la salle). */
  adresseComplete: string | null;
  lat: number;
  lon: number;
  /** Distance à la position, en mètres ; null sans position. */
  distanceM: number | null;
  /** Type du lieu créé à l'adoption (db/lieux.ts) : « salle », « terrain » ou « piscine » ; absent (ancien cache) : salle. */
  type?: string;
  /** Lieu du sport de la séance (pas une simple salle de sport) : en tête de « Autour de moi ». */
  duSport?: boolean;
  /** Sport du catalogue (`padel`) lu dans le tag sport=* d'OSM, pour l'image par défaut du lieu ; absent : tag absent ou inconnu. */
  sport?: string;
}

export const RAYON_AUTOUR_M = 3000;
/** Les lieux d'un sport sont plus rares que les salles : cherchés plus loin. */
export const RAYON_SPORT_M = 10000;
/** Salles gardées (les plus proches) d'une réponse d'Overpass. */
export const MAX_AUTOUR = 60;
export const OVERPASS = "https://overpass-api.de/api/interpreter";
/**
 * Serveurs Overpass, essayés dans l'ordre. Au 09/11, overpass.openstreetmap.fr
 * (liste blanche : 403 pour tout le monde) est retiré et « Autour de moi » ne répondait plus du tout ; ovp.dresel.systems répond
 * et passe devant. overpass-api.de répond « 502, at
 * capacity » aux heures chargées ; kumi.systems en dernier (lent).
 */
export const SERVEURS_OVERPASS = ["https://ovp.dresel.systems/api/interpreter", OVERPASS, "https://overpass.kumi.systems/api/interpreter"] as const;
export const PHOTON = "https://photon.komoot.io/api/";
/** Résultat d'Overpass gardé 7 jours, tant qu'on n'a pas bougé de plus de 500 m (le serveur public est limité). */
export const CACHE_MS = 7 * 24 * 3600 * 1000;
export const CACHE_RAYON_M = 500;

/**
 * Valeurs de sport=* d'OSM pour chaque sport du catalogue (slug de `cat:<slug>`). Un sport absent (musculation, cross
 * training, HIIT, sport inconnu) : les salles de sport seulement.
 */
const SPORTS_OSM: Record<string, readonly string[]> = {
  padel: ["padel"], tennis: ["tennis"], squash: ["squash"], badminton: ["badminton"], "tennis-de-table": ["table_tennis"],
  pickleball: ["pickleball"], football: ["soccer"], "football-americain": ["american_football"],
  rugby: ["rugby_union", "rugby_league", "rugby"], basket: ["basketball"], volley: ["volleyball", "beachvolleyball"],
  handball: ["handball"], baseball: ["baseball"], softball: ["softball"], cricket: ["cricket"], "hockey-gazon": ["field_hockey"],
  "hockey-glace": ["ice_hockey"], ultimate: ["ultimate"], "water-polo": ["water_polo", "swimming"], natation: ["swimming"],
  boxe: ["boxing"], kickboxing: ["kickboxing", "boxing"], "cardio-boxe": ["boxing"],
  "arts-martiaux": ["martial_arts", "judo", "karate", "taekwondo", "aikido"], "jiu-jitsu": ["jiu-jitsu", "brazilian_jiu-jitsu", "martial_arts"],
  lutte: ["wrestling"], escrime: ["fencing"], escalade: ["climbing"], danse: ["dance"], yoga: ["yoga"], pilates: ["pilates"],
  gymnastique: ["gymnastics"], athletisme: ["athletics"], golf: ["golf"], equitation: ["equestrian"],
  "patin-a-glace": ["ice_skating"], skateboard: ["skateboard"],
};

/** Valeurs de sport=* cherchées pour un sport (`cat:padel` ou `padel`) ; [] : salles de sport seulement. */
export function sportsOSM(sportId: string | null | undefined): readonly string[] {
  if (!sportId) return [];
  return SPORTS_OSM[sportId.startsWith("cat:") ? sportId.slice(4) : sportId] ?? [];
}

/**
 * Confidentialité : une position qui part chez un tiers est arrondie à 0,01° (≈ 1 km), comme le reste de pepfit ; la requête
 * ajoute alors MARGE_ARRONDI_M à chaque rayon (l'arrondi déplace le point d'au plus 800 m en France) et la lecture filtre au
 * rayon exact autour de la vraie position (lireOverpass, `limites`).
 */
export const MARGE_ARRONDI_M = 900;
const arrondi = (x: number) => Math.round(x * 100) / 100;
export const arrondirPosition = (p: Position): Position => ({ lat: arrondi(p.lat), lon: arrondi(p.lon) });
const decimales = (x: number) => arrondi(x).toFixed(2);

/**
 * Salles de sport autour d'un point : leisure=fitness_centre, plus les centres sportifs marqués sport=fitness ; avec un sport,
 * tout lieu marqué de ce sport (terrain, centre, club ; pas un magasin) dans un rayon plus large. Sans limite côté serveur
 * (retours du 28/10, b) : « out … 60 » coupe dans l'ordre des identifiants, pas des distances (Paris 11e : 144 salles, la plus
 * proche à 227 m manquait) ; les plus proches sont gardées par lireOverpass. Position arrondie, rayons élargis de la marge.
 */
export function requeteOverpass(p: Position, sports: readonly string[] = [], rayonM = RAYON_AUTOUR_M, rayonSportM = RAYON_SPORT_M): string {
  const autour = (r: number) => `(around:${Math.round(r + MARGE_ARRONDI_M)},${decimales(p.lat)},${decimales(p.lon)})`;
  const salles = `nwr["leisure"="fitness_centre"]${autour(rayonM)};nwr["leisure"="sports_centre"]["sport"~"fitness"]${autour(rayonM)};`;
  const sport = sports.length ? `nwr["sport"~"(^|;)(${sports.join("|")})(;|$)"][!"shop"]${autour(rayonSportM)};` : "";
  return `[out:json][timeout:10];(${salles}${sport});out center tags;`;
}

/** Lieux de sport gardés d'une recherche par nom (Photon, clé leisure) : pas de parc, de jardin ni d'aire de jeux. */
const LEISURE_SPORT = new Set(["fitness_centre", "sports_centre", "sports_hall", "pitch", "swimming_pool", "stadium", "ice_rink", "track", "golf_course", "dance", "horse_riding", "water_park"]);

/** URL de Photon pour une recherche par nom, limitée aux lieux de loisir (triés ensuite) et favorisant les proches. */
export function urlPhoton(q: string, p: Position | null, limite = 20, seulementLoisirs = true): string {
  const params = [`q=${encodeURIComponent(q.trim())}`, ...(seulementLoisirs ? ["osm_tag=leisure"] : []), `limit=${limite}`, "lang=fr"];
  if (p) params.push(`lat=${decimales(p.lat)}`, `lon=${decimales(p.lon)}`);
  return `${PHOTON}?${params.join("&")}`;
}

/** Distance à vol d'oiseau (haversine), en mètres. */
export function distanceM(a: Position, b: Position): number {
  const r = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** « 0,4 km », « 12 km » (« 0.4 mi » en miles) ; sous 100 m, « 0,1 km ». */
export function distanceKm(m: number): string {
  const mi = lireActif().distance === "mi";
  const d = Math.max(0.1, mi ? m / M_PAR_MI : m / 1000);
  return `${nombre(d, d < 10 ? 1 : 0)} ${mi ? "mi" : "km"}`;
}

const ABREVIATIONS: [RegExp, string][] = [
  [/^boulevard\b/i, "bd"],
  [/^avenue\b/i, "av."],
  [/^place\b/i, "pl."],
  [/^Rue\b/, "rue"],
  [/^Quai\b/, "quai"],
  [/^Chemin\b/, "chemin"],
  [/^Allée\b/, "allée"],
  [/^Impasse\b/, "impasse"],
];

/** Rue abrégée comme sur une enveloppe : « Boulevard Jean Jaurès » devient « bd Jean Jaurès ». */
export function rueCourte(rue: string): string {
  let r = rue.trim();
  for (const [motif, abr] of ABREVIATIONS) r = r.replace(motif, abr);
  return r;
}

interface Adresse {
  numero?: string;
  rue?: string;
  codePostal?: string;
  ville?: string;
}

function adresses(a: Adresse): { courte: string | null; complete: string | null } {
  const rue = a.rue ? [a.numero, rueCourte(a.rue)].filter(Boolean).join(" ") : null;
  const ville = [a.codePostal, a.ville].filter(Boolean).join(" ") || null;
  return { courte: rue, complete: [rue, ville].filter(Boolean).join(", ") || null };
}

interface ElementOverpass {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  /** Cadre d'un chemin ou d'une relation, s'il est rendu. */
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  tags?: Record<string, string>;
}

/** Les rayons exacts d'« Autour de moi » : salles de sport et lieux du sport de la séance. */
export interface Limites {
  salles: number;
  sport: number;
}

/** Distance de `p` à l'élément : au cadre quand il en a un (un grand terrain compte par son bord, comme `around`), sinon au point. */
function distanceElementM(p: Position, e: ElementOverpass, lat: number, lon: number): number {
  const b = e.bounds;
  if (!b) return distanceM(p, { lat, lon });
  return distanceM(p, { lat: Math.min(Math.max(p.lat, b.minlat), b.maxlat), lon: Math.min(Math.max(p.lon, b.minlon), b.maxlon) });
}

/** Des terrains sans nom à moins de 200 m d'un lieu nommé du même sport, ou les uns des autres, sont ce même lieu. */
export const GROUPE_SANS_NOM_M = 200;

/**
 * Type de lieu d'un élément d'OSM : une salle de sport ; pour un lieu du sport, la piscine si l'on nage (pas pour le padel du
 * Centre Aquatique), sinon un terrain (court, centre, club).
 */
function typeDe(t: Record<string, string>, duSport: boolean, sports: readonly string[]): string {
  if (!duSport || t.leisure === "fitness_centre") return "salle";
  return sports.includes("swimming") ? "piscine" : "terrain";
}

/** Sport du catalogue d'après sport=* d'OSM (« fitness;padel » : padel) ; le premier qui se reconnaît, undefined sinon. */
export function sportDuTag(tag: string | undefined): string | undefined {
  for (const v of (tag ?? "").split(";")) {
    const x = v.trim();
    const slug = x ? Object.keys(SPORTS_OSM).find((k) => SPORTS_OSM[k]!.includes(x)) : undefined;
    if (slug) return slug;
  }
  return undefined;
}

const nomCle = (nom: string) => nom.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

/**
 * Réponse d'Overpass : lieux nommés, ceux du sport (`sports`) d'abord, puis les plus proches, sans doublon. Les terrains du
 * sport sans nom (courts de padel : OSM nomme souvent le club, pas chaque court, ou rien) ne sont pas perdus : regroupés en un
 * lieu « `sansNom` » quand aucun lieu nommé du sport n'est à côté. Avec `limites` (et une position), seuls restent les lieux
 * dans le rayon exact : la requête était élargie de la marge de l'arrondi de la position.
 */
export function lireOverpass(json: unknown, p: Position | null, sports: readonly string[] = [], sansNom?: string, limites?: Limites): SalleOSM[] {
  const elements = (json as { elements?: ElementOverpass[] } | null)?.elements ?? [];
  const salles: SalleOSM[] = [];
  const anonymes: SalleOSM[] = [];
  for (const e of elements) {
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null) continue;
    const duSport = (t.sport ?? "").split(";").some((x) => sports.includes(x.trim()));
    if (limites && p && distanceElementM(p, e, lat, lon) > (duSport ? limites.sport : limites.salles)) continue;
    const nom = (t.name ?? t.brand ?? "").trim();
    if (!nom && !(duSport && sansNom)) continue;
    const { courte, complete } = adresses({ numero: t["addr:housenumber"], rue: t["addr:street"], codePostal: t["addr:postcode"], ville: t["addr:city"] });
    const sport = sportDuTag(t.sport);
    const s: SalleOSM = { sourceId: `${e.type}/${e.id}`, nom: nom || sansNom!, adresse: courte, adresseComplete: complete, lat, lon, distanceM: p ? distanceM(p, { lat, lon }) : null, type: typeDe(t, duSport, sports), duSport, ...(sport ? { sport } : {}) };
    (nom ? salles : anonymes).push(s);
  }
  // le centre et un de ses courts portent souvent le même nom (« Padel 15 » deux fois à 15 m) : un seul, celui qui a une adresse
  const avecAdresse = [...salles].sort((a, b) => Number(!a.adresse) - Number(!b.adresse));
  const gardes: SalleOSM[] = [];
  for (const s of avecAdresse) {
    if (gardes.some((g) => nomCle(g.nom) === nomCle(s.nom) && distanceM(g, s) < GROUPE_SANS_NOM_M)) continue;
    gardes.push(s);
  }
  salles.splice(0, salles.length, ...gardes);
  const nommes = salles.filter((s) => s.duSport);
  for (const a of trier(anonymes)) {
    if ([...nommes].some((n) => distanceM(n, a) < GROUPE_SANS_NOM_M)) continue;
    nommes.push(a);
    salles.push(a);
  }
  return trier(salles).slice(0, MAX_AUTOUR);
}

interface EntitePhoton {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_type?: "N" | "W" | "R";
    osm_id?: number;
    name?: string;
    housenumber?: string;
    street?: string;
    postcode?: string;
    city?: string;
    osm_key?: string;
    osm_value?: string;
  };
}

const TYPES_PHOTON = { N: "node", W: "way", R: "relation" } as const;

/** Réponse de Photon : seulement des lieux de sport (salle, centre, terrain, piscine ; pas d'hôtel ni de parc), les plus proches d'abord. */
export function lirePhoton(json: unknown, p: Position | null): SalleOSM[] {
  const entites = (json as { features?: EntitePhoton[] } | null)?.features ?? [];
  const salles: SalleOSM[] = [];
  for (const f of entites) {
    const pr = f.properties ?? {};
    const c = f.geometry?.coordinates;
    if (!pr.osm_type || pr.osm_id == null || !pr.name || !c) continue;
    // Les clubs de sport (osm_key club, valeur sport : « 4padel Paris XX ») comptent aussi, avec les lieux de loisir.
    if (pr.osm_key && !((pr.osm_key === "leisure" && LEISURE_SPORT.has(pr.osm_value ?? "")) || (pr.osm_key === "club" && pr.osm_value === "sport"))) continue;
    const [lon, lat] = c;
    const { courte, complete } = adresses({ numero: pr.housenumber, rue: pr.street, codePostal: pr.postcode, ville: pr.city });
    salles.push({
      sourceId: `${TYPES_PHOTON[pr.osm_type]}/${pr.osm_id}`,
      nom: pr.name.trim(),
      adresse: courte,
      adresseComplete: complete,
      lat,
      lon,
      distanceM: p ? distanceM(p, { lat, lon }) : null,
      type: typeRecherche(pr.osm_value),
    });
  }
  return trier(salles);
}

/** Type du lieu d'un résultat de recherche : la salle de sport, la piscine, sinon un terrain (court, centre, club). */
const typeRecherche = (leisure: string | undefined) => (leisure === "fitness_centre" ? "salle" : leisure === "swimming_pool" ? "piscine" : "terrain");

/** Ceux du sport de la séance d'abord, puis les plus proches. */
function trier(salles: SalleOSM[]): SalleOSM[] {
  const vues = new Set<string>();
  return salles
    .filter((s) => !vues.has(s.sourceId) && vues.add(s.sourceId))
    .sort((a, b) => Number(!!b.duSport) - Number(!!a.duSport) || (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity) || a.nom.localeCompare(b.nom, "fr"));
}

/** Retire de « Autour de moi » les salles déjà dans « Mes salles ». */
export function sansMesSalles(salles: SalleOSM[], sourcesConnues: (string | null)[]): SalleOSM[] {
  const connues = new Set(sourcesConnues.filter((x): x is string => !!x));
  return salles.filter((s) => !connues.has(s.sourceId));
}

/** Cache d'Overpass, gardé dans les réglages. */
export interface CacheAutour {
  le: number;
  position: Position;
  salles: SalleOSM[];
  /** Sports cherchés (`cleSports`) ; absent : salles de sport seulement (cache d'avant le 30/10). */
  sports?: string;
}

/** Clé du cache pour une liste de sports d'OSM : une requête padel ne sert pas pour le tennis. */
export const cleSports = (sports: readonly string[]) => [...sports].sort().join(",");

/**
 * Le cache sert s'il a moins de 7 jours et qu'on est à moins de 500 m de l'endroit de la requête ; distances recalculées.
 * `perime` : en secours, quand aucun serveur ne répond, l'âge ne compte plus (des salles d'il y a un mois valent mieux
 * qu'une erreur).
 */
export function depuisCache(cache: CacheAutour | null, p: Position, maintenant: number, perime = false, sports: readonly string[] = []): SalleOSM[] | null {
  if (!cache || !cache.salles?.length) return null;
  if ((cache.sports ?? "") !== cleSports(sports)) return null;
  if (!perime && (maintenant - cache.le > CACHE_MS || maintenant < cache.le)) return null;
  if (distanceM(cache.position, p) > CACHE_RAYON_M) return null;
  return trier(cache.salles.map((s) => ({ ...s, distanceM: distanceM(p, s) })));
}

/** Pourquoi « Autour de moi » n'a rien : pas de réseau, serveurs saturés ou en panne, position introuvable. */
export type CauseLieux = "reseau" | "serveurs" | "position";

export class ErreurLieux extends Error {
  readonly cause: CauseLieux;
  constructor(cause: CauseLieux, detail: string) {
    super(`${cause} : ${detail}`);
    this.cause = cause;
  }
}

/** Overpass répond parfois 200 avec une erreur dans « remark » (requête trop longue, mémoire) : ce n'est pas une réponse. */
export function reponseOverpassValide(json: unknown): boolean {
  const j = json as { elements?: unknown; remark?: string } | null;
  if (!j || !Array.isArray(j.elements)) return false;
  return !(j.elements.length === 0 && /error|timed out|out of memory/i.test(j.remark ?? ""));
}

/** Recherche : au moins 2 caractères utiles. */
export const rechercheValide = (q: string) => q.trim().length >= 2;

/**
 * Les requêtes à essayer pour une recherche par nom (Photon ne comprend pas « 4padel boulog » : nom + ville coupée) : la saisie
 * entière, puis la saisie privée de son dernier mot, puis de ses deux derniers, jusqu'à un seul mot (3 essais au plus).
 */
export function variantesRecherche(q: string): string[] {
  const mots = q.trim().split(/\s+/).filter(Boolean);
  const r: string[] = [];
  for (let n = mots.length; n >= 1 && r.length < 3; n--) r.push(mots.slice(0, n).join(" "));
  return r;
}
