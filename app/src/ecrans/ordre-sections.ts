/** Appui long qui prend une section ou une carte, et ce que le doigt peut bouger avant : au-delà, ce n'est plus un appui long
 *  (un balayage vers la gauche, qui démarre plus loin, prend alors la main pour supprimer). */
export const APPUI_LONG_MS = 350;
export const TOLERANCE_PX = 8;

// Calculs du glisser des sections : pendant le glisser, toutes les sections sont repliées, chacune prend la même hauteur.

/** Hauteur d'une section repliée : 12 d'écart + l'en-tête de 44. */
export const HAUTEUR_SECTION = 56;
/** Du haut d'une section repliée au milieu de son en-tête : c'est là que se cale le doigt. */
export const MILIEU_ENTETE = 34;

/** Rang visé quand le doigt est à `y` du haut de la liste (n sections). */
export function rangVise(y: number, n: number): number {
  return Math.max(0, Math.min(n - 1, Math.round((y - MILIEU_ENTETE) / HAUTEUR_SECTION)));
}

/** Décalage de la section de rang `k` quand celle du rang `a` est tenue au-dessus du rang `vers`. */
export function decalageSection(k: number, a: number, vers: number): number {
  if (k > a && k <= vers) return -HAUTEUR_SECTION;
  if (k < a && k >= vers) return HAUTEUR_SECTION;
  return 0;
}

// Glisser d'une routine : la liste à plat (en-têtes, cartes, cadres « section vide »), chaque rangée avec sa hauteur mesurée.

export type Rangee =
  | { genre: "tete"; sectionId: string; ouverte: boolean; h: number }
  | { genre: "carte"; id: string; sectionId: string; h: number }
  | { genre: "vide"; sectionId: string; h: number };

/** Où poser la carte : rang dans la section ; `ecart` : les voisines s'écartent pour lui faire la place (sinon on vise l'en-tête
 *  d'une section repliée ou le cadre d'une section vide, la carte va alors en fin de section). */
export type CibleRoutine = { sectionId: string; rang: number; ecart: boolean };

export type Candidat = { cible: CibleRoutine; p: number; milieu: number };

/** Les places possibles pour la carte tenue (rang `a`), avec le milieu qu'elle aurait en y (même repère que les rangées). */
export function ciblesRoutine(rangees: Rangee[], a: number): Candidat[] {
  const hT = rangees[a]!.h;
  const autres = rangees.filter((_, i) => i !== a);
  const nb = new Map<string, number>();
  for (const r of autres) if (r.genre === "carte") nb.set(r.sectionId, (nb.get(r.sectionId) ?? 0) + 1);
  const out: Candidat[] = [];
  let haut = 0;
  const vus = new Map<string, number>();
  autres.forEach((r, j) => {
    const bas = haut + r.h;
    if (r.genre === "tete") {
      if (!r.ouverte) out.push({ cible: { sectionId: r.sectionId, rang: nb.get(r.sectionId) ?? 0, ecart: false }, p: j + 1, milieu: haut + r.h / 2 });
      else if (autres[j + 1]?.genre !== "vide") out.push({ cible: { sectionId: r.sectionId, rang: 0, ecart: true }, p: j + 1, milieu: bas + hT / 2 });
    } else if (r.genre === "vide") {
      out.push({ cible: { sectionId: r.sectionId, rang: 0, ecart: false }, p: j + 1, milieu: haut + r.h / 2 });
    } else {
      const k = (vus.get(r.sectionId) ?? 0) + 1;
      vus.set(r.sectionId, k);
      out.push({ cible: { sectionId: r.sectionId, rang: k, ecart: true }, p: j + 1, milieu: bas + hT / 2 });
    }
    haut = bas;
  });
  return out;
}

/** La place la plus proche du milieu de la carte tenue. */
export function ciblePlusProche(candidats: Candidat[], milieu: number): Candidat | undefined {
  let m: Candidat | undefined;
  for (const c of candidats) if (!m || Math.abs(c.milieu - milieu) < Math.abs(m.milieu - milieu)) m = c;
  return m;
}

/** Haut de chaque rangée (somme des hauteurs qui la précèdent). */
export function hauts(rangees: Rangee[]): number[] {
  let y = 0;
  return rangees.map((r) => {
    const h = y;
    y += r.h;
    return h;
  });
}

/** Décalage de chaque rangée (repère `rangees`, la tenue à 0) pour la place `c` : la carte quitte le rang `a`, l'écart s'ouvre en `c.p`. */
export function decalagesRoutine(rangees: Rangee[], a: number, c: Candidat): number[] {
  const hT = rangees[a]!.h;
  return rangees.map((_, i) => {
    if (i === a) return 0;
    const j = i < a ? i : i - 1;
    return hT * ((c.cible.ecart && j >= c.p ? 1 : 0) - (j >= a ? 1 : 0));
  });
}

/** Clé d'une rangée (mesures et décalages). */
export function cleRangee(r: Rangee): string {
  return r.genre === "carte" ? `c:${r.id}` : `${r.genre === "tete" ? "t" : "v"}:${r.sectionId}`;
}
