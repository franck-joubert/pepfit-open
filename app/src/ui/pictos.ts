// Pictos d'exercice : tables écrites par `npm run pictos` (scripts/brancher-pictos.ts) depuis pictos/exercices/index.json
// et picto-3d/v8 (pictos rendus depuis les clips 3D). Un exercice sans picto (hors salle, ou absent de l'index) a le
// picto neutre.
import { CATALOGUE, FICHIERS, GRANDS, NOMS } from "./pictos-index";
import { LIENS_CATALOGUE } from "../db/liens-catalogue";
import { resoudreAvec } from "./resolution";

const TABLES = { catalogue: CATALOGUE, noms: NOMS, liens: LIENS_CATALOGUE };

/** Résolution commune au picto et à la 3D (resolution.ts), limitée aux clés que `connu` accepte ; geste : ordre de la 3D. */
export function resoudre(slug: string | null | undefined, nom: string | null | undefined, connu: (cle: string) => boolean, geste = false): string | undefined {
  return resoudreAvec(TABLES, slug, nom, connu, geste);
}

/** Clé du picto d'un exercice : par slug (catalogue, index ou picto), alias d'un geste identique, sinon par nom ;
 * undefined → picto neutre. */
export function clePicto(slug: string | null | undefined, nom?: string | null): string | undefined {
  return resoudre(slug, nom, (c) => FICHIERS[c] != null);
}

/** Fichier du picto d'un exercice, en 512 au-delà de 128 px ; undefined → picto neutre. */
export function fichierPicto(slug: string | null | undefined, nom?: string | null, taille = 0): number | undefined {
  const c = clePicto(slug, nom);
  if (!c) return undefined;
  return (taille > 128 ? GRANDS[c] : undefined) ?? FICHIERS[c];
}
