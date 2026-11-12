import { File } from "expo-file-system";
import { nomDuFichier } from "../../circuits/gpx";
import { lireFichierChoisi, type FichierChoisi } from "../../circuits/importer";
import type { ResultatGpx } from "../../circuits/gpx";

/** Ce que la personne a choisi : le fichier (nom, poids) et ce qu'on y a lu. */
export interface GpxChoisi {
  fichier: FichierChoisi;
  resultat: ResultatGpx;
}

/**
 * Ouvre le sélecteur de fichiers, lit le GPX choisi (la copie du sélecteur, dans le cache, est supprimée après lecture) ; null si la personne
 * annule. Le fichier reste sur le téléphone : seul un aperçu en sort.
 */
export async function choisirGpx(): Promise<GpxChoisi | null> {
  const { getDocumentAsync } = await import("expo-document-picker");
  const r = await getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
  const a = r.canceled ? null : r.assets[0];
  if (!a) return null;
  const copie = new File(a.uri);
  const fichier: FichierChoisi = { nom: a.name || nomDuFichier(a.uri) || "", octets: a.size ?? copie.size ?? 0 };
  try {
    return { fichier, resultat: await lireFichierChoisi(fichier, () => copie.text()) };
  } finally {
    try {
      copie.delete();
    } catch {
      // La copie du cache est purgée par le système ; ne pas la supprimer ne change rien pour la personne.
    }
  }
}
