// La table des familles de sports (extraite de familles-sports.ts le 01/11 pour que le serveur MCP l'importe sans l'i18n : kcal-seance.ts).
// Pur : aucune dépendance. Le reste (noms affichés, lieux, mesures) reste dans familles-sports.ts, qui la réexporte.

export const FAMILLES = ["force", "dehors", "interieur", "seance", "recup"] as const;
export type Famille = (typeof FAMILLES)[number];

/** Famille de chaque sport du catalogue, par slug (`cat:<slug>`). */
const FAMILLE: Record<string, Famille> = {
  // Force
  musculation: "force", "cross-training": "force",
  // Endurance dehors
  course: "dehors", bicycling: "dehors", vtt: "dehors", marche: "dehors", randonnee: "dehors", "ski-de-fond": "dehors",
  skating: "dehors", "fauteuil-roulant": "dehors", duathlon: "dehors", triathlon: "dehors", "course-obstacles": "dehors",
  kayak: "dehors", paddle: "dehors",
  // Endurance en intérieur
  "bicycling-stationary": "interieur", "elliptical-trainer": "interieur", "rowing-stationary": "interieur",
  stairmaster: "interieur", "assault-bike": "interieur", versaclimber: "interieur", "montee-marches": "interieur",
  "rope-jumping": "interieur", natation: "interieur",
  // Sports et cours : raquette
  tennis: "seance", padel: "seance", squash: "seance", badminton: "seance", "tennis-de-table": "seance", pickleball: "seance",
  // collectifs
  football: "seance", "football-americain": "seance", "football-australien": "seance", "football-gaelique": "seance",
  hurling: "seance", rugby: "seance", basket: "seance", volley: "seance", handball: "seance", netball: "seance",
  baseball: "seance", softball: "seance", cricket: "seance", "hockey-gazon": "seance", "hockey-glace": "seance",
  lacrosse: "seance", ultimate: "seance", "water-polo": "seance", polo: "seance", spikeball: "seance",
  // combat
  boxe: "seance", kickboxing: "seance", "arts-martiaux": "seance", "jiu-jitsu": "seance", lutte: "seance", escrime: "seance",
  // cours, danse, agrès (HIIT : un cours, D1 du 30/10)
  hiit: "seance", "cardio-boxe": "seance", "barre-fitness": "seance", pilates: "seance", gymnastique: "seance", danse: "seance",
  parkour: "seance", "arts-du-cirque": "seance", athletisme: "seance",
  // glisse, montagne, eau
  escalade: "seance", ski: "seance", snowboard: "seance", voile: "seance", surf: "seance", plongee: "seance",
  kitesurf: "seance", "ski-nautique": "seance", wakeboard: "seance",
  // loisirs
  golf: "seance", "disc-golf": "seance", equitation: "seance", skateboard: "seance", "patin-a-glace": "seance",
  paintball: "seance", motocross: "seance", "sport-auto": "seance",
  // Récupération et bien-être
  yoga: "recup", etirements: "recup", meditation: "recup", sauna: "recup", "bain-froid": "recup", massage: "recup",
};

/** Sport inconnu du catalogue (activité perso, sport retiré) : sports et cours, le plus général (chrono, FC, effort ; D8). */
export const FAMILLE_PAR_DEFAUT: Famille = "seance";

const slugDe = (id: string) => (id.startsWith("cat:") ? id.slice(4) : id);

/** Famille d'un sport (`cat:<slug>` ou slug). */
export const familleDe = (id: string): Famille => FAMILLE[slugDe(id)] ?? FAMILLE_PAR_DEFAUT;

/** Le sport est-il rangé par le catalogue (sinon familleDe donne la famille par défaut) ? */
export const aUneFamille = (id: string): boolean => slugDe(id) in FAMILLE;

/** Slugs rangés, pour le test de couverture et le tableau de la planche. */
export const SPORTS_RANGES: readonly string[] = Object.keys(FAMILLE);
