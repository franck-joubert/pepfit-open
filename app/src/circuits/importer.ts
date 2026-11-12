// Le fichier choisi pour « Importer un GPX » (planche Circuits, i2 et i3) : lu SUR LE TÉLÉPHONE, jamais envoyé avant l'aperçu (D4). Pur : le lecteur du
// texte est passé en argument. Un fichier de plus de 20 Mo est refusé sans être lu (son poids vient du sélecteur) ; un fichier qu'on n'arrive pas à
// ouvrir vaut « illisible ».
import { lireGpx, type ResultatGpx } from "./gpx";
import { GPX_OCTETS_MAX } from "./regles";

export interface FichierChoisi {
  nom: string;
  octets: number;
}

export async function lireFichierChoisi(f: FichierChoisi, lire: () => Promise<string>): Promise<ResultatGpx> {
  if (f.octets > GPX_OCTETS_MAX) return { ok: false, erreur: "trop_lourd" };
  let texte: string;
  try {
    texte = await lire();
  } catch {
    return { ok: false, erreur: "illisible" };
  }
  return lireGpx(texte, f.octets);
}
