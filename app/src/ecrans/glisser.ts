// Calculs purs du glisser-déposer de l'éditeur de routine (direction C : carte soulevée, cartes repliées).
// La liste est « à plat » : exercice seul, en-tête de superset, membres, pied (repos après chaque tour).
// Un exercice (seul ou membre) se prend seul ; l'en-tête prend le superset entier.

/** Hauteur d'une carte d'exercice repliée (poignée, photo, nom, résumé, chevron). */
export const HAUTEUR_REPLIEE = 73;
export const ZONE_DEFILEMENT = 64;
export const VITESSE_MAX = 14;

/** « serie » : série d'un exercice (liste à plat, sans superset) ; elle garde sa hauteur pendant le glisser. */
export type TypeRangee = "seul" | "tete" | "membre" | "pied" | "serie";
export type Rangee = { id: string; type: TypeRangee; groupe: number | null };
export type Mode = "exercice" | "bloc";
/** Emplacement de dépôt : `index` = rang d'insertion dans la liste sans les rangées tenues ; `groupe` = superset visé (null : hors superset). */
export type Fente = { index: number; groupe: number | null };
export type Depot = { mode: "bloc"; de: number; vers: number } | { mode: "exercice"; id: string; avant: string | null; groupe: number | null };
/** Ce qui est écrit en base pour chaque ligne : ordre, superset, repos. */
export type LigneDispo = { id: string; groupe: number | null; repos: number };

export const idTete = (groupe: number) => `t${groupe}`;
export const idPied = (groupe: number) => `p${groupe}`;

/** Les rangées affichées : un superset (lignes contiguës d'un même groupe) devient en-tête, membres, pied. */
export function rangeesDe(lignes: { id: string; groupe: number | null }[]): Rangee[] {
  const out: Rangee[] = [];
  lignes.forEach((l, k) => {
    if (l.groupe == null) {
      out.push({ id: l.id, type: "seul", groupe: null });
      return;
    }
    if (lignes[k - 1]?.groupe !== l.groupe) out.push({ id: idTete(l.groupe), type: "tete", groupe: l.groupe });
    out.push({ id: l.id, type: "membre", groupe: l.groupe });
    if (lignes[k + 1]?.groupe !== l.groupe) out.push({ id: idPied(l.groupe), type: "pied", groupe: l.groupe });
  });
  return out;
}

/** Rangées prises par un geste : un exercice seul ou membre se prend seul, l'en-tête prend tout le superset ; le pied ne se prend pas. */
export function uniteTenue(rangees: Rangee[], id: string): { a: number; b: number; mode: Mode } | null {
  const a = rangees.findIndex((x) => x.id === id);
  const r = rangees[a];
  if (!r || r.type === "pied") return null;
  if (r.type !== "tete") return { a, b: a, mode: "exercice" };
  let b = a;
  while (rangees[b + 1] && rangees[b + 1]!.groupe === r.groupe) b++;
  return { a, b, mode: "bloc" };
}

/** Hauteur pendant le glisser : une carte d'exercice dépliée se replie, le reste garde sa hauteur. */
export function hauteurReduite(r: Rangee, pleine: number): number {
  return r.type === "seul" || r.type === "membre" ? Math.min(pleine, HAUTEUR_REPLIEE) : pleine;
}

/** Hauteurs de la liste pendant le glisser : les rangées tenues gardent leur hauteur, les autres passent en replié. */
export function hauteursGlisser(rangees: Rangee[], pleines: number[], a: number, b: number): number[] {
  return rangees.map((r, k) => (k >= a && k <= b ? pleines[k]! : hauteurReduite(r, pleines[k]!)));
}

/**
 * Emplacements permis dans la liste sans les rangées tenues. Entre l'en-tête (ou un membre) et un membre (ou le pied)
 * d'un même superset : dedans. Ailleurs : dehors. Un superset entier ne se pose que dehors.
 */
export function fentes(autres: Rangee[], mode: Mode): Fente[] {
  const out: Fente[] = [];
  for (let i = 0; i <= autres.length; i++) {
    const avant = autres[i - 1];
    const apres = autres[i];
    const dedans =
      avant && apres && avant.groupe != null && avant.groupe === apres.groupe && (avant.type === "tete" || avant.type === "membre") && (apres.type === "membre" || apres.type === "pied");
    if (dedans && mode === "exercice") out.push({ index: i, groupe: avant.groupe });
    else if (!dedans) out.push({ index: i, groupe: null });
  }
  return out;
}

/** Haut de l'emplacement `index` dans la liste sans les rangées tenues. */
export function hautDeLaPlace(autres: number[], index: number): number {
  return autres.slice(0, index).reduce((t, h) => t + h, 0);
}

/**
 * Emplacement visé : celui dont le haut est le plus proche du haut de la carte tenue (`haut`, repère de la liste où la place
 * de la carte tenue reste réservée). À égalité, on reste du côté du départ. Revient à : vers le bas, la carte dépasse une
 * voisine quand son bord bas passe le milieu de celle-ci ; vers le haut, quand son bord haut passe ce milieu.
 */
export function cibleGlisser(autres: number[], permises: Fente[], haut: number, depart: number): Fente {
  let meilleure = permises[0]!;
  let ecart = Infinity;
  for (const f of permises) {
    const e = Math.abs(haut - hautDeLaPlace(autres, f.index));
    if (e < ecart || (e === ecart && Math.abs(f.index - depart) < Math.abs(meilleure.index - depart))) {
      meilleure = f;
      ecart = e;
    }
  }
  return meilleure;
}

/** Décalage de chaque autre rangée : celles que la carte tenue a dépassées s'écartent de sa hauteur. */
export function decalagesVoisins(n: number, depart: number, vers: number, hauteurTenue: number): number[] {
  return Array.from({ length: n }, (_, k) => {
    if (vers > depart && k >= depart && k < vers) return -hauteurTenue;
    if (vers < depart && k >= vers && k < depart) return hauteurTenue;
    return 0;
  });
}

/** Ce que veut dire le lâcher : un bloc change de rang, ou un exercice se pose avant une ligne, dans un superset ou dehors. */
export function depotDe(rangees: Rangee[], a: number, b: number, mode: Mode, cible: Fente): Depot {
  const autres = [...rangees.slice(0, a), ...rangees.slice(b + 1)];
  const debutBloc = (r: Rangee) => r.type === "seul" || r.type === "tete";
  if (mode === "bloc")
    return { mode, de: rangees.slice(0, a).filter(debutBloc).length, vers: autres.slice(0, cible.index).filter(debutBloc).length };
  const suivante = autres.slice(cible.index).find((r) => r.type === "seul" || r.type === "membre" || r.type === "serie");
  return { mode, id: rangees[a]!.id, avant: suivante?.id ?? null, groupe: cible.groupe };
}

/** Rangées des séries d'un exercice. */
export const rangeesSeries = (ids: readonly string[]): Rangee[] => ids.map((id) => ({ id, type: "serie", groupe: null }));

/** Séries d'un exercice (liste sans superset) : `id` posé avant `avant` (null : à la fin). Renvoie les ids dans le nouvel ordre. */
export function poserAvant(ids: readonly string[], id: string, avant: string | null): string[] {
  if (!ids.includes(id)) return [...ids];
  const reste = ids.filter((x) => x !== id);
  const k = avant == null ? -1 : reste.indexOf(avant);
  reste.splice(k < 0 ? reste.length : k, 0, id);
  return reste;
}

export function reordonner<T>(liste: T[], de: number, vers: number): T[] {
  const copie = [...liste];
  const [x] = copie.splice(de, 1);
  copie.splice(vers, 0, x!);
  return copie;
}

/** Les blocs (exercice seul ou superset) d'une suite de lignes. */
function blocs<T extends { groupe: number | null }>(lignes: T[]): T[][] {
  const out: T[][] = [];
  for (const l of lignes) {
    const d = out[out.length - 1];
    if (l.groupe != null && d && d[0]!.groupe === l.groupe) d.push(l);
    else out.push([l]);
  }
  return out;
}

/** Déplace le bloc `de` au rang `vers` ; supersets et repos inchangés. */
export function deplacerBloc(lignes: LigneDispo[], de: number, vers: number): LigneDispo[] {
  return reordonner(blocs(lignes), de, vers).flat();
}

/**
 * Pose l'exercice `id` avant la ligne `avant` (null : à la fin), dans le superset `groupe` ou dehors. Repos d'un superset :
 * porté par sa dernière ligne (« après chaque tour »), les autres à 0 (enchaînées sans repos). Donc :
 * - qui entre prend cette règle (0, ou le repos du tour s'il devient dernier) ;
 * - qui sort d'un superset reprend `reposDefaut` ;
 * - un superset réduit à un exercice est dissous : celui qui reste garde le repos du tour.
 */
export function deplacerExercice(lignes: LigneDispo[], id: string, avant: string | null, groupe: number | null, reposDefaut: number): LigneDispo[] {
  const tenue = lignes.find((l) => l.id === id);
  if (!tenue) return lignes;
  const tour = new Map<number, number>();
  for (const l of lignes) if (l.groupe != null) tour.set(l.groupe, l.repos);
  const reste = lignes.filter((l) => l.id !== id);
  const k = avant == null ? reste.length : reste.findIndex((l) => l.id === avant);
  const posee = { ...tenue, groupe, repos: groupe == null && tenue.groupe != null ? reposDefaut : tenue.repos };
  reste.splice(k < 0 ? reste.length : k, 0, posee);
  const taille = new Map<number, number>();
  for (const l of reste) if (l.groupe != null) taille.set(l.groupe, (taille.get(l.groupe) ?? 0) + 1);
  return reste.map((l, i) => {
    if (l.groupe == null) return l;
    if (taille.get(l.groupe)! < 2) return { ...l, groupe: null, repos: tour.get(l.groupe)! };
    return { ...l, repos: reste[i + 1]?.groupe === l.groupe ? 0 : tour.get(l.groupe)! };
  });
}

/** Pixels à défiler par image : 0 hors des bords, jusqu'à ±VITESSE_MAX au contact du bord.
 *  `y` = position du doigt dans la zone visible, `hauteurVisible` = hauteur utilisable (hors barre du bas). */
export function vitesseDefilement(y: number, hauteurVisible: number, zone = ZONE_DEFILEMENT, max = VITESSE_MAX): number {
  if (y < zone) return -max * Math.min(1, (zone - y) / zone);
  if (y > hauteurVisible - zone) return max * Math.min(1, (y - (hauteurVisible - zone)) / zone);
  return 0;
}
