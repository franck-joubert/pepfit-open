import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { nouvelId } from "../db/id";
import { cheminsPhotosConnus, poserPhotoSeance, retirerPhotoSeance, type Executeur, type PhotoSeance } from "../db";
import { signalerChangementPhoto } from "./changement";
import { cheminsPhoto, dimensionsCible, DOSSIER_PHOTOS, PHOTO, VIGNETTE } from "./reglage";

// Photo de séance (une au plus) : appareil photo du système ou galerie, puis réencodage en WebP (1 600 px q 0,72 et vignette
// 320 px q 0,6), ce qui retire les EXIF ; copie dans documentDirectory/photos, sans dépendre de la galerie.

export type Source = "appareil" | "galerie";

/** URI d'affichage d'un chemin relatif enregistré en base. */
export const uriPhoto = (chemin: string) => new File(Paths.document, chemin).uri;

export async function choisir(source: Source): Promise<ImagePicker.ImagePickerAsset | null> {
  const permission = source === "appareil" ? await ImagePicker.requestCameraPermissionsAsync() : { granted: true };
  if (!permission.granted) throw new Error("permission");
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1, exif: false, allowsEditing: false };
  const r = source === "appareil" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  return r.canceled ? null : (r.assets[0] ?? null);
}

export async function reencoder(uri: string, largeur: number, hauteur: number, cote: number, qualite: number, dest: File) {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize(dimensionsCible(largeur, hauteur, cote));
  const image = await ctx.renderAsync();
  const r = await image.saveAsync({ format: SaveFormat.WEBP, compress: qualite });
  const f = new File(r.uri);
  await f.move(dest);
  return { largeur: r.width, hauteur: r.height, octets: dest.size ?? 0 };
}

function effacer(p: Pick<PhotoSeance, "chemin_local" | "chemin_vignette"> | null) {
  if (!p) return;
  for (const c of [p.chemin_local, p.chemin_vignette]) {
    try {
      const f = new File(Paths.document, c);
      if (f.exists) f.delete();
    } catch (e) {
      console.warn("photo non effacée", c, e);
    }
  }
}

/** Prend ou importe la photo de la séance ; false si l'utilisateur a annulé. */
export async function ajouterPhoto(db: Executeur, seanceId: string, source: Source): Promise<boolean> {
  const a = await choisir(source);
  if (!a) return false;
  const dossier = new Directory(Paths.document, DOSSIER_PHOTOS);
  if (!dossier.exists) dossier.create({ intermediates: true, idempotent: true });
  const id = nouvelId();
  const c = cheminsPhoto(id);
  const fichiers = [new File(Paths.document, c.photo), new File(Paths.document, c.vignette)];
  try {
    const photo = await reencoder(a.uri, a.width, a.height, PHOTO.cote, PHOTO.qualite, fichiers[0]!);
    const vignette = await reencoder(a.uri, a.width, a.height, VIGNETTE.cote, VIGNETTE.qualite, fichiers[1]!);
    const ancienne = await poserPhotoSeance(db, seanceId, {
      id,
      cheminLocal: c.photo,
      cheminVignette: c.vignette,
      largeur: photo.largeur,
      hauteur: photo.hauteur,
      octets: photo.octets + vignette.octets,
    });
    effacer(ancienne);
  } catch (e) {
    // échec en route (disque plein, image illisible) : aucun fichier de la nouvelle photo ne reste sans ligne en base
    effacer({ chemin_local: c.photo, chemin_vignette: c.vignette });
    throw e;
  }
  signalerChangementPhoto(seanceId);
  return true;
}

/** Supprime la photo de la séance (avec `id`, seulement si c'est encore elle) : base, fichiers, puis serveur à la synchro. */
export async function retirerPhoto(db: Executeur, seanceId: string, id?: string): Promise<void> {
  const retiree = await retirerPhotoSeance(db, seanceId, id);
  effacer(retiree);
  if (retiree) signalerChangementPhoto(seanceId);
}

/** Efface les fichiers de photo que la base ne connaît plus (séance supprimée ou abandonnée). */
export async function menagePhotos(db: Executeur): Promise<void> {
  const dossier = new Directory(Paths.document, DOSSIER_PHOTOS);
  if (!dossier.exists) return;
  const connus = await cheminsPhotosConnus(db);
  for (const f of dossier.list()) {
    if (f instanceof File && !connus.has(`${DOSSIER_PHOTOS}/${f.name}`)) f.delete();
  }
}
