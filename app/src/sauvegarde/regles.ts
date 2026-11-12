// Règles de la sauvegarde périodique, sans accès au téléphone (testées à part).

export type Frequence = "jamais" | "jour" | "semaine";

export const FREQUENCES: readonly Frequence[] = ["jamais", "jour", "semaine"];
export const GARDES = [3, 5, 10] as const;
export const GARDE_DEFAUT = 5;

const H = 3_600_000;

/** Nom du fichier : date et heure locales, triables (`pepfit-2026-10-28-1405.pepfit`). */
/** Le pseudo en tête (alex-2026-10-31-1115.pepfit : l'extension dit déjà pepfit) ; sans pseudo, « pepfit ». */
export function nomSauvegarde(ms: number, pseudo?: string | null): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  const tete = (pseudo ?? "").toLowerCase().replace(/[^\p{L}\p{N}._-]/gu, "").slice(0, 40) || "pepfit";
  return `${tete}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.pepfit`;
}

/**
 * Rotation : les sauvegardes écrites par pepfit (leurs URI, la plus récente d'abord ; le sélecteur d'Android ne donne pas les
 * noms des fichiers d'un dossier Drive). On garde les `garder` dernières ; les autres sont à effacer. Le reste du dossier
 * n'est jamais touché.
 */
export function rotation(connues: readonly string[], nouvelle: string, garder: number): { liste: string[]; effacer: string[] } {
  const l = [nouvelle, ...connues.filter((u) => u !== nouvelle)];
  const n = Math.max(1, garder);
  return { liste: l.slice(0, n), effacer: l.slice(n) };
}

/** Une sauvegarde automatique est-elle due ? Une marge de 2 h : l'appli ouverte chaque jour vers la même heure suffit. */
export function sauvegardeDue(frequence: Frequence, derniere: number | null, maintenant: number): boolean {
  if (frequence === "jamais") return false;
  if (derniere == null || derniere > maintenant) return true;
  return maintenant - derniere >= (frequence === "jour" ? 24 : 7 * 24) * H - 2 * H;
}

/** Fournisseur d'un dossier choisi par le sélecteur d'Android, d'après l'autorité de son URI ; null si inconnu. */
export function fournisseur(uri: string): "drive" | "dropbox" | "onedrive" | "nextcloud" | "proton" | "telephone" | null {
  const a = /^content:\/\/([^/]+)/.exec(uri)?.[1]?.toLowerCase() ?? "";
  if (a.includes("google.android.apps.docs")) return "drive";
  if (a.includes("dropbox")) return "dropbox";
  if (a.includes("skydrive") || a.includes("onedrive")) return "onedrive";
  if (a.includes("nextcloud") || a.includes("owncloud")) return "nextcloud";
  if (a.includes("proton")) return "proton";
  if (a === "com.android.externalstorage.documents" || a.includes("downloads")) return "telephone";
  return null;
}

/** Écart en unités lisibles : « 0 min », « 12 min », « 2 h », « 3 j ». */
export function ecart(ms: number, maintenant: number): { n: number; unite: "min" | "h" | "j" } {
  const m = Math.max(0, Math.floor((maintenant - ms) / 60_000));
  if (m < 60) return { n: m, unite: "min" };
  if (m < 24 * 60) return { n: Math.floor(m / 60), unite: "h" };
  return { n: Math.floor(m / (24 * 60)), unite: "j" };
}
