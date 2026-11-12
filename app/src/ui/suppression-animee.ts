import { courbe, desintegration as D } from "../theme/mouvement";

// Logique de la suppression animée, sans React Native (testée sous Node) : grains de la désintégration, pose d'un grain
// à l'instant u (worklets, fil UI), fantômes d'une liste (l'élément supprimé reste affiché le temps de sa sortie).

/** Aléa reproductible dans [0, 1[ : les mêmes grains à chaque suppression. */
export function alea(s: number): number {
  "worklet";
  const x = Math.sin(s * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Courbe de Bézier cubique (0,0)-(x1,y1)-(x2,y2)-(1,1), par dichotomie. */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  return (t: number): number => {
    "worklet";
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const f = (s: number, a: number, b: number) => 3 * a * s * (1 - s) * (1 - s) + 3 * b * s * s * (1 - s) + s * s * s;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      const m = (lo + hi) / 2;
      if (f(m, x1, x2) < t) lo = m;
      else hi = m;
    }
    return f((lo + hi) / 2, y1, y2);
  };
}

const sortie = bezier(courbe.sortie[0], courbe.sortie[1], courbe.sortie[2], courbe.sortie[3]);

/** Champs d'un grain dans le tableau plat : x, y (coin, px), départ, dérive x, dérive y (px), vie (ms). */
export const CHAMPS = 6;

export interface Grains {
  /** Côté d'un grain (px). */
  pas: number;
  n: number;
  donnees: number[];
  /** Instant où le dernier grain s'éteint (ms). */
  fin: number;
}

/** Découpe un élément w × h en grains : départ balayé de gauche à droite, dérive vers la droite et le haut. */
export function grains(w: number, h: number, c: typeof D = D): Grains {
  const pas = Math.max(c.pas, Math.ceil(Math.sqrt((w * h) / c.grainsMax)));
  const donnees: number[] = [];
  let fin = 0;
  let i = 0;
  for (let y = 0; y < h; y += pas) {
    for (let x = 0; x < w; x += pas) {
      const depart = Math.max(0, (x / w) * c.balayage + alea(i * 7 + 3) * c.alea + Math.sin(y * 0.18) * c.onde);
      const vie = c.vie * (c.vieMin + (1 - c.vieMin) * alea(i * 11 + 2));
      donnees.push(x, y, depart, c.deriveX[0] + alea(i + 1) * c.deriveX[1], -(c.deriveY[0] + alea(i * 3 + 5) * c.deriveY[1]), vie);
      fin = Math.max(fin, depart + vie);
      i++;
    }
  }
  return { pas, n: i, donnees, fin };
}

/** Arrêt d'un dégradé de partie (src/theme/effets.ts) : position dans [0, 1], couleur « #rrggbb ». */
export type ArretTeinte = { offset: number; couleur: string };

const rvb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/**
 * Couleur de chaque grain (r, v, b dans [0, 1], à plat) : le dégradé du bouton principal de la partie, à 135° comme le
 * bouton (clair en haut à gauche, foncé en bas à droite), pris au centre du grain dans l'élément w × h.
 */
export function teintes(g: Grains, w: number, h: number, arrets: readonly ArretTeinte[]): number[] {
  const l = [...arrets].sort((a, b) => a.offset - b.offset).map((a) => ({ o: a.offset, c: rvb(a.couleur) }));
  // Axe à 135° façon CSS : la boîte entière tient entre le premier et le dernier arrêt.
  const dx = Math.SQRT1_2;
  const dy = Math.SQRT1_2;
  const demi = (w * dx + h * dy) / 2;
  const out: number[] = [];
  for (let i = 0; i < g.n; i++) {
    const x = g.donnees[i * CHAMPS]! + g.pas / 2 - w / 2;
    const y = g.donnees[i * CHAMPS + 1]! + g.pas / 2 - h / 2;
    const t = Math.min(1, Math.max(0, 0.5 + (x * dx + y * dy) / (2 * demi || 1)));
    let k = 0;
    while (k < l.length - 2 && t > l[k + 1]!.o) k++;
    const a = l[k]!;
    const b = l[Math.min(k + 1, l.length - 1)]!;
    const p = b.o > a.o ? Math.min(1, Math.max(0, (t - a.o) / (b.o - a.o))) : 0;
    for (let c = 0; c < 3; c++) out.push(a.c[c]! + (b.c[c]! - a.c[c]!) * p);
  }
  return out;
}

/**
 * Pose le grain i à l'instant u (ms) : `val.set(échelle, 0, x, y)` (RSXform de Skia). Avant son départ, le grain est à sa
 * place, entier ; ensuite il dérive (courbe `sortie`) et rétrécit ; éteint, échelle 0. `densite` : pixels de la capture par
 * point d'écran ; `haut` : décalage vertical du dessin (marge au-dessus de l'élément).
 */
export function poserGrain(g: readonly number[], i: number, u: number, densite: number, haut: number, val: { set(a: number, b: number, c: number, d: number): void }) {
  "worklet";
  const o = i * CHAMPS;
  const x = g[o]!;
  const y = g[o + 1]! + haut;
  const depart = g[o + 2]!;
  if (u < depart) {
    val.set(1 / densite, 0, x, y);
    return;
  }
  const p = (u - depart) / g[o + 5]!;
  if (p >= 1) {
    val.set(0, 0, x, y);
    return;
  }
  const e = sortie(p);
  val.set((1 - D.retrecit * p) / densite, 0, x + g[o + 3]! * e, y + g[o + 4]! * e);
}

/** Opacité du grain i à l'instant u : 1 avant son départ, puis (1 − p)^attenuation, 0 une fois éteint. */
export function opaciteGrain(g: readonly number[], i: number, u: number): number {
  "worklet";
  const o = i * CHAMPS;
  const p = (u - g[o + 2]!) / g[o + 5]!;
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  return Math.pow(1 - p, D.attenuation);
}

// ---------- Fantômes ----------

/** « vu » : affiché ; « sort » : supprimé, encore à l'écran le temps de sa sortie ; « entre » : revient (Annuler). */
export type EtatEntree = "vu" | "sort" | "entre";

export interface Entree<T> {
  cle: string;
  item: T;
  etat: EtatEntree;
  /** Sortie : attente avant de se désintégrer (ms), le temps qu'une feuille se ferme. */
  delai?: number;
}

/** Une marque vaut pour une suppression faite il y a moins de 15 s (le temps de revenir d'un écran de détail). */
export const DUREE_MARQUE = 15000;
const marques = new Map<string, { t: number; delai: number }>();

/**
 * À appeler au geste de suppression, avant que la liste ne perde l'élément : sa disparition sera animée. `delai` (ms) :
 * depuis une feuille, la désintégration attend qu'elle soit descendue ; la donnée, elle, n'attend pas.
 */
export function marquerSuppression(cles: string | readonly string[], delai = 0) {
  const t = Date.now();
  for (const c of typeof cles === "string" ? [cles] : cles) marques.set(c, { t, delai });
}

/** Délai de sortie si l'élément a été marqué récemment, sinon null ; la marque est consommée. */
export function prendreMarque(cle: string, maintenant = Date.now()): number | null {
  const m = marques.get(cle);
  if (m == null) return null;
  marques.delete(cle);
  return maintenant - m.t < DUREE_MARQUE ? m.delai : null;
}

/**
 * Nouvelle liste affichée : les éléments de `apres`, dans leur ordre, plus les fantômes des éléments disparus qui sortent
 * (marqués, ou déjà en sortie), chacun après son ancien prédécesseur. Un élément disparu sans marque part sans animation.
 * `parties` : clés sorties en désintégration ; si l'une revient (Annuler), elle entre (« entre ») et quitte l'ensemble.
 * `nouveaux` : un élément ajouté entre aussi, si la liste s'allonge (un remplacement, même longueur, change sur place).
 */
export function fusionner<T>(
  avant: readonly Entree<T>[],
  apres: readonly T[],
  cleDe: (x: T) => string,
  marquee: (cle: string) => number | null,
  parties: Set<string>,
  nouveaux = false,
): Entree<T>[] {
  const connues = new Set(avant.map((e) => e.cle));
  const allonge = nouveaux && avant.length > 0 && apres.length > avant.filter((e) => e.etat !== "sort").length;
  const res: Entree<T>[] = apres.map((item) => {
    const cle = cleDe(item);
    const revient = parties.delete(cle) || (allonge && !connues.has(cle));
    return { cle, item, etat: revient ? "entre" : "vu" };
  });
  const presentes = new Set(res.map((e) => e.cle));
  let ancre: string | null = null;
  for (const e of avant) {
    if (presentes.has(e.cle)) {
      ancre = e.cle;
      continue;
    }
    const delai = e.etat === "sort" ? (e.delai ?? 0) : marquee(e.cle);
    if (delai == null) continue;
    parties.add(e.cle);
    const fantome: Entree<T> = { cle: e.cle, item: e.item, etat: "sort", delai };
    const a = ancre;
    const i = a == null ? -1 : res.findIndex((x) => x.cle === a);
    res.splice(i + 1, 0, fantome);
    presentes.add(e.cle);
    ancre = e.cle;
  }
  return res;
}

/** Le fantôme `cle` a fini sa sortie : il quitte la liste affichée. */
export function retirerFantome<T>(entrees: readonly Entree<T>[], cle: string): Entree<T>[] {
  return entrees.filter((e) => !(e.cle === cle && e.etat === "sort"));
}

/**
 * Clés stables d'une liste indexée par rang (séries d'une routine) : `prec`, les clés connues ; `n`, la nouvelle longueur ;
 * `retire`, le rang supprimé à l'instant (sa clé part, les suivantes gardent la leur). Sinon, ajouts et retraits en fin.
 */
export function clesParRang(prec: readonly string[], n: number, retire: number | null, neuve: () => string): string[] {
  const l = retire != null && n < prec.length && retire < prec.length ? prec.filter((_, i) => i !== retire) : [...prec];
  while (l.length < n) l.push(neuve());
  return l.slice(0, n);
}

/** Hauteur jusqu'où un élément qui entre s'ouvre : sa mesure, ou (mesurée à 0 car écrasée par sa place fermée) celle de ses voisins. */
export function hauteurOuverture(mesure: number, estimee: number): number {
  return mesure > 0 ? mesure : Math.max(0, estimee);
}
