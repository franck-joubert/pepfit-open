import { nouvelId } from "../db/id";
import type { Fichiers } from "../sync/moteur";
import { cheminsPhoto } from "./reglage";

// Photo d'un plat copié (Dupliquer) : la copie a ses fichiers à elle, jamais ceux de l'original (supprimer l'un effacerait la
// photo de l'autre). Sans React Native (testé sous Node) : les fichiers passent par `Fichiers` (sync/compte.ts sur le
// téléphone). Nouveaux chemins, sans clé distante : la synchro les envoie chiffrés comme toute photo de plat.

export interface FichiersPhoto {
  photo: string;
  vignette: string;
}

/** Copie la photo et sa vignette sous de nouveaux noms ; null si l'une manque sur ce téléphone (pas encore reçue). */
export async function copierPhotoPlat(f: Fichiers, p: FichiersPhoto, id: string = nouvelId()): Promise<FichiersPhoto | null> {
  if (!f.existe(p.photo) || !f.existe(p.vignette)) return null;
  const c = cheminsPhoto(id);
  await f.ecrire(c.photo, await f.lire(p.photo));
  await f.ecrire(c.vignette, await f.lire(p.vignette));
  return { photo: c.photo, vignette: c.vignette };
}
