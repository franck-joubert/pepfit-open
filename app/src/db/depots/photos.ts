import { transaction } from "../exclusif";
import type { Executeur } from "../executeur";
import { nouvelId } from "../id";
import type { PhotoSeance } from "../types";

export function lirePhotoSeance(db: Executeur, seanceId: string): Promise<PhotoSeance | null> {
  return db.getFirstAsync<PhotoSeance>("SELECT * FROM seance_photo WHERE seance_id = ?", [seanceId]);
}

export interface NouvellePhoto {
  id?: string;
  cheminLocal: string;
  cheminVignette: string;
  largeur: number;
  hauteur: number;
  octets: number;
}

/**
 * Pose la photo de la séance (une au plus) : remplace l'ancienne. Renvoie l'ancienne, dont l'appelant efface les fichiers.
 */
export async function poserPhotoSeance(db: Executeur, seanceId: string, p: NouvellePhoto): Promise<PhotoSeance | null> {
  const ancienne = await lirePhotoSeance(db, seanceId);
  const t = Date.now();
  await transaction(db, async (db) => {
    await db.runAsync("DELETE FROM seance_photo WHERE seance_id = ?", [seanceId]);
    await db.runAsync(
      "INSERT INTO seance_photo (id, seance_id, chemin_local, chemin_vignette, largeur, hauteur, octets, cree_le, maj_le) VALUES (?,?,?,?,?,?,?,?,?)",
      [p.id ?? nouvelId(), seanceId, p.cheminLocal, p.cheminVignette, Math.round(p.largeur), Math.round(p.hauteur), Math.round(p.octets), t, t],
    );
  });
  if (ancienne) await noterFichiersDistants(db, ancienne);
  return ancienne;
}

/**
 * Retire la photo de la séance ; renvoie celle qui était posée (fichiers à effacer), ou null. Avec `id`, seulement si c'est
 * encore cette photo-là (une suppression différée ne retire pas une photo posée entre-temps).
 */
export async function retirerPhotoSeance(db: Executeur, seanceId: string, id?: string): Promise<PhotoSeance | null> {
  const ancienne = await lirePhotoSeance(db, seanceId);
  if (!ancienne || (id != null && ancienne.id !== id)) return null;
  await db.runAsync("DELETE FROM seance_photo WHERE id = ?", [ancienne.id]);
  await noterFichiersDistants(db, ancienne);
  return ancienne;
}

/** Clé, dans sync_etat, des fichiers envoyés au serveur dont la photo n'existe plus : la synchro les y efface. */
export const CLE_FICHIERS_A_EFFACER = "fichiers_a_effacer";

/** Nom du fichier sur le serveur : celui du chemin local. */
export const fichierDistant = (chemin: string) => chemin.split("/").pop()!;

export async function fichiersAEffacer(db: Executeur): Promise<string[]> {
  const r = await db.getFirstAsync<{ valeur: string }>("SELECT valeur FROM sync_etat WHERE cle = ?", [CLE_FICHIERS_A_EFFACER]);
  return r ? (JSON.parse(r.valeur) as string[]) : [];
}

export async function ecrireFichiersAEffacer(db: Executeur, l: readonly string[]): Promise<void> {
  if (l.length) {
    await db.runAsync("INSERT INTO sync_etat (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur", [CLE_FICHIERS_A_EFFACER, JSON.stringify(l)]);
  } else await db.runAsync("DELETE FROM sync_etat WHERE cle = ?", [CLE_FICHIERS_A_EFFACER]);
}

/** Une photo déjà envoyée (clé distante) part : ses deux fichiers sont à effacer du serveur à la prochaine synchro. */
async function noterFichiersDistants(db: Executeur, p: PhotoSeance): Promise<void> {
  if (!p.cle_distante) return;
  const l = await fichiersAEffacer(db);
  for (const c of [p.chemin_local, p.chemin_vignette].map(fichierDistant)) if (!l.includes(c)) l.push(c);
  await ecrireFichiersAEffacer(db, l);
}

/** Chemins de tous les fichiers de photo connus de la base, séances, plats et exercices (ménage des fichiers orphelins). */
export async function cheminsPhotosConnus(db: Executeur): Promise<Set<string>> {
  const l = await db.getAllAsync<{ chemin_local: string; chemin_vignette: string }>("SELECT chemin_local, chemin_vignette FROM seance_photo", []);
  // Photos des plats (migration 46) : même dossier.
  const plats = await db.getAllAsync<{ photo: string; photo_vignette: string }>("SELECT photo, photo_vignette FROM plats WHERE photo IS NOT NULL", []);
  // Photos des exercices (migration 70) : même dossier.
  const exercices = await db.getAllAsync<{ photo: string; photo_vignette: string }>("SELECT photo, photo_vignette FROM exercices WHERE photo IS NOT NULL", []);
  return new Set([...l.flatMap((x) => [x.chemin_local, x.chemin_vignette]), ...[...plats, ...exercices].flatMap((x) => [x.photo, x.photo_vignette])]);
}
