// Détection et résolution des préférences de région (pur : testable sous Node, sans expo-localization).
/** Langues de l'appli, dans l'ordre du réglage. */
export const LANGUES = ["fr", "en", "de", "es"] as const;
export type Langue = (typeof LANGUES)[number];
/** Langues des contenus qui n'existent qu'en français et en anglais (catalogue, programmes, actualités) : repli sur l'anglais. */
export type LangueBi = "fr" | "en";

export const estLangue = (x: unknown): x is Langue => typeof x === "string" && (LANGUES as readonly string[]).includes(x);
/** fr → fr ; toute autre langue → en (contenu bilingue seulement). */
export const bilingue = (l: Langue): LangueBi => (l === "fr" ? "fr" : "en");
export type UnitePoids = "kg" | "lbs";
export type UniteDistance = "km" | "mi";

export interface Preferences {
  langue: "auto" | Langue;
  fuseau: "auto" | string;
  poids: "auto" | UnitePoids;
  distance: "auto" | UniteDistance;
}

export interface Detecte {
  langue: Langue;
  fuseau: string;
  poids: UnitePoids;
  distance: UniteDistance;
}

export type Actif = Detecte;

export const PREFERENCES_AUTO: Preferences = { langue: "auto", fuseau: "auto", poids: "auto", distance: "auto" };

export interface EntreeDetection {
  /** Code de langue de l'appareil : « fr », « en »… (ou étiquette complète « fr-FR »). */
  codeLangue?: string | null;
  /** Région de l'appareil : « FR », « US »… */
  region?: string | null;
  /** « metric » | « us » | « uk » (expo-localization) ; null si inconnu. */
  systeme?: string | null;
  fuseau?: string | null;
}

const REGIONS_US = new Set(["US", "LR", "MM"]);

export function fuseauSysteme(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Langue d'une étiquette (« de », « de-AT », « es_MX ») : une des langues de l'appli, sinon l'anglais. */
export function langueDuCode(code: string | null | undefined): Langue {
  const base = (code ?? "").toLowerCase().split(/[-_]/)[0] ?? "";
  return estLangue(base) ? base : "en";
}

/** fr*, de*, es* → leur langue, sinon en ; métrique → kg et km, US → lbs et mi, UK → kg et mi. */
export function detecter(e: EntreeDetection): Detecte {
  const langue = langueDuCode(e.codeLangue);
  const systeme = e.systeme ?? (e.region && REGIONS_US.has(e.region.toUpperCase()) ? "us" : "metric");
  return {
    langue,
    fuseau: e.fuseau || fuseauSysteme(),
    poids: systeme === "us" ? "lbs" : "kg",
    distance: systeme === "us" || systeme === "uk" ? "mi" : "km",
  };
}

export function resoudre(p: Preferences, d: Detecte): Actif {
  return {
    langue: p.langue === "auto" ? d.langue : p.langue,
    fuseau: p.fuseau === "auto" ? d.fuseau : p.fuseau,
    poids: p.poids === "auto" ? d.poids : p.poids,
    distance: p.distance === "auto" ? d.distance : p.distance,
  };
}

export function fuseauValide(z: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: z });
    return true;
  } catch {
    return false;
  }
}
