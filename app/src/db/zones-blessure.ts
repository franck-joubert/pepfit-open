// Zones d'une blessure (planche articulations, D3 et D5) : les muscles du personnage, les 13 articulations, et le type d'une
// blessure (muscle, articulation, autre). Sans rien de React Native ni d'i18n : le serveur MCP l'importe tel quel
// (serveur/mcp/appli.liste), la migration 65 en tire son classement. Aucun diagnostic : une zone, un côté, des signes notés.

/** Muscles du personnage (ids du masque, picto-3d/v4/sorties/muscles.json). */
export const IDS_MUSCLES = [
  "grand_dorsal", "biceps", "trapeze", "deltoide", "triceps", "fessiers", "ischios", "quadriceps", "pectoraux", "avant_bras",
  "abdominaux", "obliques", "mollets", "lombaires", "coiffe", "grand_rond", "adducteurs", "cou", "tibial", "brachial",
] as const;

export type VueCorps = "face" | "dos";

export interface Articulation {
  id: string;
  /** Un côté à choisir (gauche, droit, les deux) ; sinon au milieu du corps. */
  cote: boolean;
  /** Vues où son point se montre (la mâchoire de face, le rachis bas de dos). */
  vues: readonly VueCorps[];
}

/** Les 13 articulations, de la tête aux pieds (D3) : pas de doigt un par un ni de vertèbre précise. */
export const ARTICULATIONS: readonly Articulation[] = [
  { id: "machoire", cote: true, vues: ["face"] },
  { id: "rachis_cervical", cote: false, vues: ["face", "dos"] },
  { id: "epaule", cote: true, vues: ["face", "dos"] },
  { id: "coude", cote: true, vues: ["face", "dos"] },
  { id: "poignet", cote: true, vues: ["face", "dos"] },
  { id: "main", cote: true, vues: ["face", "dos"] },
  { id: "rachis_dorsal", cote: false, vues: ["dos"] },
  { id: "rachis_lombaire", cote: false, vues: ["dos"] },
  { id: "sacrum", cote: false, vues: ["dos"] },
  { id: "hanche", cote: true, vues: ["face", "dos"] },
  { id: "genou", cote: true, vues: ["face", "dos"] },
  { id: "cheville", cote: true, vues: ["face", "dos"] },
  { id: "pied", cote: true, vues: ["face", "dos"] },
];

export const IDS_ARTICULATIONS: readonly string[] = ARTICULATIONS.map((a) => a.id);

/** Vue où montrer une zone : `vue` si son point s'y voit (ou si ce n'est pas une articulation), sinon la sienne. De face, le
 * bas du dos n'avait ni anneau ni trait (recette du 04/11). */
export function vuePour(zone: string | null | undefined, vue: VueCorps): VueCorps {
  const a = ARTICULATIONS.find((x) => x.id === zone);
  return !a || a.vues.includes(vue) ? vue : a.vues[0]!;
}

/** Type d'une blessure (colonne `blessure.type`, migration 65). */
export const TYPES_BLESSURE = ["muscle", "articulation", "autre"] as const;
export type TypeBlessure = (typeof TYPES_BLESSURE)[number];

const MUSCLES = new Set<string>(IDS_MUSCLES);
const JOINTS = new Set<string>(IDS_ARTICULATIONS);

export const estArticulation = (zone: string | null | undefined): boolean => zone != null && JOINTS.has(zone);
export const estMuscle = (zone: string | null | undefined): boolean => zone != null && MUSCLES.has(zone);

/** Type déduit de la zone seule : un muscle connu, une articulation connue, ou « autre » (texte libre, zone vide). */
export function typeDeZone(zone: string | null | undefined): TypeBlessure {
  return estMuscle(zone) ? "muscle" : estArticulation(zone) ? "articulation" : "autre";
}

/**
 * Type lu d'une blessure : une zone connue fait foi ; sinon le type écrit (une IA peut dire « articulation » d'une zone en
 * texte libre) ; sans type écrit (ligne d'une appli ou d'un MCP d'avant la migration 65), « autre ».
 */
export function typeBlessure(zone: string | null | undefined, type: string | null | undefined): TypeBlessure {
  if (estMuscle(zone) || estArticulation(zone)) return typeDeZone(zone);
  return (TYPES_BLESSURE as readonly string[]).includes(type ?? "") ? (type as TypeBlessure) : "autre";
}

/** Signes notés dans le journal (D6) : constatés soi-même, jamais un diagnostic. */
export const SIGNES = ["raideur", "gonflement"] as const;
export type Signe = (typeof SIGNES)[number];

/** Colonne `blessure_journal.signes` (« raideur|gonflement ») → liste, dans l'ordre de SIGNES, inconnus ignorés. */
export function lireSignes(v: string | null | undefined): Signe[] {
  const l = new Set((v ?? "").split("|"));
  return SIGNES.filter((s) => l.has(s));
}

/** Liste → colonne ; null sans signe. */
export function ecrireSignes(l: readonly string[] | null | undefined): string | null {
  const s = lireSignes((l ?? []).join("|"));
  return s.length ? s.join("|") : null;
}

/** Côté d'une zone : « - » sans zone ou au milieu du corps (muscles cou et abdominaux, articulations sans côté). */
const SANS_COTE_MUSCLE = new Set(["cou", "abdominaux"]);
export function zoneSansCote(zone: string | null | undefined): boolean {
  if (!zone) return true;
  if (SANS_COTE_MUSCLE.has(zone)) return true;
  const a = ARTICULATIONS.find((x) => x.id === zone);
  return a != null && !a.cote;
}
