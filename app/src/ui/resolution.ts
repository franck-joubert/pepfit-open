// Résolution unique du picto et du clip 3D d'un exercice (logique pure, testée sous node) : pictos.ts et 3d/clips.ts
// l'appellent avec leurs tables. Ordre : slug (via la table du catalogue), slug d'un geste identique (ALIAS_3D), puis
// nom normalisé (exos perso importés sans slug) ; la première clé connue de l'appelant l'emporte. Pour la 3D, le clip
// propre du slug puis le geste identique passent avant le picto du catalogue : un picto sert souvent à plusieurs gestes
// voisins (pompes serrées pour toutes les pompes), un clip est fait pour un geste.
import { normaliser } from "../db/normaliser";
import { ALIAS_3D, NOMS_3D } from "./3d/alias";

export interface TablesPicto {
  /** Slug du catalogue (ou de l'index) → clé du picto. */
  catalogue: Record<string, string>;
  /** Nom normalisé → clé du picto. */
  noms: Record<string, string>;
  /** Nom normalisé d'un exercice perso confirmé comme celui d'un exercice du catalogue → slug de celui-ci (db/liens-catalogue.ts). */
  liens?: Readonly<Record<string, string>>;
}

/** Clés candidates d'un exercice, de la plus précise à la plus large ; geste : ordre de la 3D (en-tête). */
export function candidats(t: TablesPicto, slug: string | null | undefined, nom?: string | null, geste = false): string[] {
  const c: (string | undefined)[] = [];
  const n = nom ? normaliser(nom) : "";
  // Un exercice perso relié au catalogue prend la résolution du slug auquel il est relié ; un exercice du catalogue garde la sienne.
  const cible = slug || (n ? t.liens?.[n] : undefined);
  if (cible) {
    const alias = ALIAS_3D[cible];
    if (geste) c.push(cible, alias, t.catalogue[cible], alias && t.catalogue[alias]);
    else {
      c.push(t.catalogue[cible], cible);
      if (alias) c.push(t.catalogue[alias], alias);
    }
  }
  if (n) c.push(t.noms[n], NOMS_3D[n]);
  return c.filter((x): x is string => !!x);
}

/** Première clé candidate que l'appelant connaît (picto ou clip), sinon undefined. */
export function resoudreAvec(t: TablesPicto, slug: string | null | undefined, nom: string | null | undefined, connu: (cle: string) => boolean, geste = false): string | undefined {
  return candidats(t, slug, nom, geste).find(connu);
}
