import { Directory, File, Paths } from "expo-file-system";
import { nouvelId } from "../db/id";
import type { FichiersPhoto } from "./copie-plat";
import { choisir, reencoder, type Source } from "./index";
import { cheminsPhoto, DOSSIER_PHOTOS, PHOTO, VIGNETTE } from "./reglage";

// Photo d'un plat (planche plats, P10) : mêmes gestes et même traitement que la photo de séance (WebP réencodé, sans EXIF,
// photo et vignette dans documents/photos). Prise en modification seulement : le fichier existe avant le plat ; il est relié
// au plat à l'enregistrement, et le ménage des photos (menagePhotos) efface celles d'une modification abandonnée.

export type { FichiersPhoto } from "./copie-plat";

/** Prend ou importe une photo ; null si l'utilisateur a annulé. Erreur « permission » si l'appareil photo est refusé. */
export async function prendrePhotoPlat(source: Source): Promise<FichiersPhoto | null> {
  const a = await choisir(source);
  if (!a) return null;
  const dossier = new Directory(Paths.document, DOSSIER_PHOTOS);
  if (!dossier.exists) dossier.create({ intermediates: true, idempotent: true });
  const c = cheminsPhoto(nouvelId());
  await reencoder(a.uri, a.width, a.height, PHOTO.cote, PHOTO.qualite, new File(Paths.document, c.photo));
  await reencoder(a.uri, a.width, a.height, VIGNETTE.cote, VIGNETTE.qualite, new File(Paths.document, c.vignette));
  return { photo: c.photo, vignette: c.vignette };
}

/** Efface les fichiers d'une photo de plat qui n'est plus à lui (changée, retirée, plat supprimé). */
export function effacerPhotoPlat(p: FichiersPhoto | null): void {
  if (!p) return;
  for (const c of [p.photo, p.vignette]) {
    try {
      const f = new File(Paths.document, c);
      if (f.exists) f.delete();
    } catch (e) {
      console.warn("photo de plat non effacée", c, e);
    }
  }
}
