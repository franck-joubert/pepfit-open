import type { Executeur } from "../db/executeur";
import { t } from "../i18n/index";
import { ErreurImport } from "./hevy-csv";
import { estExportFitatu, importerFitatuTexte, type RapportFitatu } from "./fitatu";
import { importerHevyTexte, importerRoutinesHevyTexte, type RapportImport, type RapportRoutines } from "./importer";

export { ErreurImport } from "./hevy-csv";
export { importerHevyTexte, importerRoutinesHevyTexte, type RapportImport, type RapportRoutines } from "./importer";
export { importerFitatuTexte, type RapportFitatu } from "./fitatu";

/** Rapport d'un import : historique Hevy (CSV), routines Hevy (JSON de l'API) ou journal Fitatu (JSON exporté). */
export type RapportHevy = ({ genre: "seances" } & RapportImport) | ({ genre: "routines" } & RapportRoutines) | ({ genre: "fitatu" } & RapportFitatu);

/**
 * Genre d'un fichier choisi : export Fitatu, routines Hevy (JSON : liste ou `routines`), historique Hevy (CSV : colonnes
 * title, start_time, exercise_title) ; null pour tout autre fichier (« Fichier non reconnu »).
 */
export function genreFichier(texte: string): RapportHevy["genre"] | null {
  if (estExportFitatu(texte)) return "fitatu";
  if (/^\s*[[{]/.test(texte)) {
    try {
      const o: unknown = JSON.parse(texte);
      return Array.isArray(o) || (o && typeof o === "object" && "routines" in o) ? "routines" : null;
    } catch {
      return null;
    }
  }
  const entete = (texte.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "").toLowerCase().split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  return ["title", "start_time", "exercise_title"].every((c) => entete.includes(c)) ? "seances" : null;
}

/** Importe un fichier déjà lu, selon son genre ; ErreurImport « Fichier non reconnu » s'il n'est ni Hevy ni Fitatu. */
export async function importerTexte(cible: Executeur, texte: string): Promise<RapportHevy> {
  const genre = genreFichier(texte);
  if (genre === "fitatu") return { genre, ...(await importerFitatuTexte(cible, texte)) };
  if (genre === "routines") return { genre, ...(await importerRoutinesHevyTexte(cible, texte)) };
  if (genre === "seances") return { genre, ...(await importerHevyTexte(cible, texte)) };
  throw new ErreurImport(t("profil.importNonReconnu"));
}

/** Importe le fichier situé à `uri` : export Fitatu, routines Hevy (JSON) ou historique Hevy (CSV). Idempotent ; renvoie le rapport. */
export async function importerHevyFichier(uri: string, db?: Executeur): Promise<RapportHevy> {
  // Un fichier local se lit par expo-file-system (le fetch d'un file:// ne lit pas le stockage partagé) ; le reste par fetch.
  const texte = uri.startsWith("file://") ? await new (await import("expo-file-system")).File(uri).text() : await (await fetch(uri)).text();
  return importerTexte(db ?? (await (await import("../db")).base()), texte);
}

/** Ouvre le sélecteur de fichiers puis importe ; null si l'utilisateur annule. */
export async function choisirEtImporterHevy(db?: Executeur): Promise<RapportHevy | null> {
  const { getDocumentAsync } = await import("expo-document-picker");
  const r = await getDocumentAsync({
    type: ["text/csv", "text/comma-separated-values", "text/plain", "application/vnd.ms-excel", "application/json", "*/*"],
    copyToCacheDirectory: true,
  });
  if (r.canceled || !r.assets[0]) return null;
  return importerHevyFichier(r.assets[0].uri, db);
}

