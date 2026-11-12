// Calculs des onglets (ui/Onglets.tsx ; planche onglets, direction A), sans React Native : testés par tests/onglets-calc.test.ts.
// Géométrie des deux versions, rail du classeur ouvert (voile et filet dessinés en deux tracés SVG), clavier, glissement latéral.

import { onglets as T } from "../theme/onglets";
import { avecOpacite, meler, rvba } from "../theme/teintes";
import { recettePartie } from "../theme/jetons";
import { sensGlisse } from "./glisser-jour";
import { horizontal } from "./arbitrage-gestes";

export type ModeCouleur = "nuit" | "jour";

/** Trait de la version simple, icône active de la version riche : la couleur de la partie, assombrie de 25 % le jour (D2 : 3:1 sur toute l'aura). */
export function couleurActive(partie: string, mode: ModeCouleur): string {
  return mode === "jour" ? meler(partie, "#000000", T.assombrirJour) : partie;
}

// ——— Version riche ———

/** La couleur `c` à la luminosité `l` (HSL, 0 à 1), avec sa teinte et sa saturation : sombre, mais pas grise (le mélange de noir ne fait que grisonner un pastel). */
export function assombrirSature(c: string, l: number, facteurSaturation = 1): string {
  const [r, g, b] = rvba(c).slice(0, 3).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const lc = (max + min) / 2;
  const s = d === 0 ? 0 : Math.min(1, (d / (1 - Math.abs(2 * lc - 1))) * facteurSaturation);
  const h = d === 0 ? 0 : max === r ? (((g - b) / d) % 6 + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((h % 2) - 1));
  const [r1, g1, b1] = h < 1 ? [chroma, x, 0] : h < 2 ? [x, chroma, 0] : h < 3 ? [0, chroma, x] : h < 4 ? [0, x, chroma] : h < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const m = l - chroma / 2;
  return "#" + [r1, g1, b1].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
}

/**
 * Couleurs du rail : le voile est un aplat uni, sombre, saturé et très translucide (le jeton `voile` de theme/onglets.ts), jamais clair ni
 * opaque ; il monte de la barre vers l'ancre, derrière les onglets, et laisse l'actif et le panneau sur le fond de la page. Le filet est la
 * couleur de la partie à 20 % (16 % le jour). Calculées ici et non lues dans le thème : `segmentPiste` du thème de base est un gris
 * opaque (#1f1d1b, #e8ebef) qui ne devient translucide que sous `SurfacePartie` ; sans elle le voile noircirait la page et l'onglet actif.
 */
export function couleursRail(partie: string, mode: ModeCouleur): { voile: string; filet: string } {
  const v = T.voile[mode];
  return { voile: avecOpacite(assombrirSature(partie, v.luminosite, v.saturation), v.opacite), filet: avecOpacite(partie, recettePartie[mode].line) };
}

/** Opacité (0 à 1) d'une couleur « #rrggbb » ou « rgba(…) ». */
export const opaciteCouleur = (c: string): number => rvba(c)[3];

/** Ce que l'onglet actif pose sur le coin de son icône : le libellé déplié lui laisse la place. */
export type Marque = "aucune" | "pastille" | "pastilleLongue" | "point";

/** Pastille de 18 pour 1 à 99, « 99+ » au-delà (plus large), point de 8 sans chiffre ; rien à 0. */
export function marqueDe(compte: number | undefined, point: boolean | undefined): Marque {
  if (compte && compte > 0) return compte > 99 ? "pastilleLongue" : "pastille";
  return point ? "point" : "aucune";
}

/** Texte de la pastille : « 99+ » au-delà de 99. */
export const texteCompte = (n: number): string => (n > 99 ? "99+" : String(n));

/** Espace à gauche du libellé déplié : 8, ou 16 / 28 / 14 pour laisser la place à la pastille, à la pastille « 99+ » ou au point. */
export function gaucheLibelle(m: Marque): number {
  "worklet";
  return m === "pastille" ? 16 : m === "pastilleLongue" ? 28 : m === "point" ? 14 : T.ecartLibelle;
}

export interface GabaritRiche {
  /** Largeur de chaque onglet. */
  largeurs: number[];
  /** Bord gauche de chaque onglet dans la barre (marge comprise). */
  x: number[];
  /** Largeur du contenu : la barre, ou plus si la rangée défile. */
  contenu: number;
  defile: boolean;
}

/**
 * Largeurs des onglets riches : l'icône seule (48, jamais moins), l'actif y ajoute son libellé ; tant que tout tient, le reste
 * de la place se partage à parts égales ; au-delà, chacun garde sa largeur et la rangée défile (jusqu'à cinq onglets, rien ne
 * défile à 390 dp).
 * @param largeur largeur de la barre (de bord à bord)
 * @param marge marge de chaque côté de la rangée (celle du contenu : 16 à 390, 41 sur le Fold déplié)
 * @param libelles largeur naturelle du texte de chaque libellé (0 tant qu'elle n'est pas mesurée)
 */
export function gabaritRiche({ largeur, marge, libelles, marques, actif }: { largeur: number; marge: number; libelles: readonly number[]; marques: readonly Marque[]; actif: number }): GabaritRiche {
  return gabaritOuvert({ largeur, marge, libelles, marques, ouvertures: libelles.map((_, i) => (i === actif ? 1 : 0)) });
}

/**
 * Le même gabarit à un instant de la transition : `ouvertures[i]` (0 fermé, 1 ouvert) est la part du libellé de l'onglet i qui est
 * dépliée. Au repos c'est un 1 sous l'actif et des 0 ailleurs (`gabaritRiche`) ; en route, les largeurs passent continûment d'un repos à
 * l'autre. Fonction pure, écrite pour le fil UI (worklet) : chaque image de la transition la recalcule (ui/Onglets.tsx).
 */
export function gabaritOuvert({ largeur, marge, libelles, marques, ouvertures }: { largeur: number; marge: number; libelles: readonly number[]; marques: readonly Marque[]; ouvertures: readonly number[] }): GabaritRiche {
  "worklet";
  const n = libelles.length;
  const base = Math.max(T.largeurMin, 2 * T.margeIcone + T.icone);
  const bases: number[] = [];
  let somme = 0;
  for (let i = 0; i < n; i++) {
    const b = base + (ouvertures[i] ?? 0) * (gaucheLibelle(marques[i] ?? "aucune") + (libelles[i] ?? 0));
    bases.push(b);
    somme += b;
  }
  const naturel = somme + T.ecart * Math.max(0, n - 1);
  const dispo = largeur - 2 * marge;
  const defile = largeur > 0 && naturel > dispo + 0.5;
  const part = !defile && n > 0 && largeur > 0 ? (dispo - naturel) / n : 0;
  const largeurs: number[] = [];
  const x: number[] = [];
  let c = marge;
  for (let i = 0; i < n; i++) {
    const w = bases[i]! + part;
    largeurs.push(w);
    x.push(c);
    c += w + T.ecart;
  }
  return { largeurs, x, contenu: defile ? naturel + 2 * marge : largeur, defile };
}

/**
 * Le rail du classeur ouvert, en deux tracés (`d` de react-native-svg), repère : x de 0 à `largeur`, y de `−montee` (haut du
 * voile) à `hauteur` (bas de la barre).
 * - `voile` : le voile translucide, bord à bord, coins extérieurs droits ; il monte de `montee` au-dessus de la barre (D6,
 *   variante unie) ; sous l'onglet actif il est ouvert (encoche de rayon 10, marge haute de 6) : l'actif n'a aucun fond propre.
 * - `filet` : 1 dp, il longe le bas de la barre, remonte autour de l'encoche et redescend : l'actif est rattaché au contenu.
 * `x0`, `x1` : bords de l'onglet actif ; null : pas d'encoche (barre pas encore mesurée). `debord` : le voile et le filet dépassent de
 * chaque côté (la colonne de contenu du Fold déplié est plus étroite que l'écran).
 */
export function cheminsRail({ largeur: W, hauteur: b, montee, x0, x1, debord = 0 }: { largeur: number; hauteur: number; montee: number; x0: number | null; x1: number | null; debord?: number }): { voile: string; filet: string } {
  "worklet";
  const h = T.margeHaute;
  const r = T.encocheRayon;
  const n = (v: number) => String(Math.round(v * 100) / 100);
  const g = -debord;
  const d = W + debord;
  const haut = `M${n(g)} ${n(b)}V${n(-montee)}H${n(d)}V${n(b)}`;
  if (x0 == null || x1 == null) return { voile: `${haut}Z`, filet: `M${n(g)} ${n(b - 0.5)}H${n(d)}` };
  const a = Math.max(0, x0);
  const z = Math.min(W, x1);
  const rf = r - 0.5;
  return {
    voile: `${haut}H${n(z)}V${n(h + r)}A${r} ${r} 0 0 0 ${n(z - r)} ${h}H${n(a + r)}A${r} ${r} 0 0 0 ${n(a)} ${n(h + r)}V${n(b)}Z`,
    filet: `M${n(g)} ${n(b - 0.5)}H${n(a + 0.5)}V${n(h + r)}A${rf} ${rf} 0 0 1 ${n(a + r)} ${n(h + 0.5)}H${n(z - r)}A${rf} ${rf} 0 0 1 ${n(z - 0.5)} ${n(h + r)}V${n(b - 0.5)}H${n(d)}`,
  };
}

/** Hauteur du voile au-dessus de la barre : du haut de la barre au bord bas de l'en-tête de la page (`ancre`), dans le même repère. */
export function monteeVoile(yBarre: number, ancre: number | null | undefined): number {
  if (ancre == null || !Number.isFinite(ancre)) return 0;
  return Math.max(0, Math.round((yBarre - ancre) * 100) / 100);
}

// ——— Version simple ———

export interface GabaritSimple {
  largeurs: number[];
  x: number[];
  contenu: number;
  defile: boolean;
}

/**
 * Largeurs de la version simple : parts égales tant que le libellé (réservé en 600, compteur compris) de chacun y tient ; sinon
 * chaque onglet prend sa largeur (marges de 16 comprises) et la rangée défile.
 * @param largeur largeur de la rangée (de bord à bord)
 * @param marge marge de la rangée : celle du contenu moins les 16 de l'onglet (le premier libellé tombe sur la marge du contenu)
 * @param naturels largeur naturelle de chaque onglet, marges de 16 comprises (0 tant qu'elle n'est pas mesurée)
 */
export function gabaritSimple({ largeur, marge, naturels }: { largeur: number; marge: number; naturels: readonly number[] }): GabaritSimple {
  const n = naturels.length;
  const dispo = Math.max(0, largeur - 2 * marge);
  const part = n ? dispo / n : 0;
  const tient = naturels.every((w) => w <= part + 0.5);
  const brut = tient || !largeur ? naturels.map(() => part) : naturels.slice();
  // Les libellés ne tiennent pas en parts égales mais la somme tient dans la rangée : le reste se partage, la rangée ne défile pas.
  const reste = !tient && largeur && n ? Math.max(0, dispo - brut.reduce((s, w) => s + w, 0)) / n : 0;
  const largeurs = brut.map((w) => w + reste);
  const x: number[] = [];
  let c = marge;
  for (const w of largeurs) {
    x.push(c);
    c += w;
  }
  const somme = largeurs.reduce((s, w) => s + w, 0);
  return { largeurs, x, contenu: tient ? largeur : Math.max(largeur, somme + 2 * marge), defile: !tient && somme > dispo + 0.5 };
}

/** Défilement qui ramène un onglet au centre de la fenêtre (le premier et le dernier restent sur leur bord). */
export function centrer(x: number, w: number, fenetre: number, contenu: number): number {
  return Math.max(0, Math.min(Math.max(0, contenu - fenetre), x + w / 2 - fenetre / 2));
}

// ——— Clavier et glissement ———

/** Onglet voisin suivant (+1) ou précédent (−1) qui n'est pas désactivé, en bouclant ; l'onglet lui-même s'il n'y en a pas. */
export function voisinActif(desactives: readonly boolean[], i: number, pas: 1 | -1): number {
  const n = desactives.length;
  for (let k = 1; k <= n; k++) {
    const j = (((i + pas * k) % n) + n) % n;
    if (!desactives[j]) return j;
  }
  return i;
}

/**
 * Touche → onglet à activer : flèches (inversées en lecture de droite à gauche), Début et Fin ; null pour une autre touche.
 * Un seul onglet est dans l'ordre de tabulation : il prend le focus et s'active en même temps.
 */
export function ongletAuClavier(touche: string, desactives: readonly boolean[], courant: number, rtl = false): number | null {
  const sens = rtl ? -1 : 1;
  if (touche === "ArrowRight") return voisinActif(desactives, courant, (sens as 1 | -1));
  if (touche === "ArrowLeft") return voisinActif(desactives, courant, (-sens as 1 | -1));
  if (touche === "Home") {
    const i = desactives.findIndex((d) => !d);
    return i < 0 ? null : i;
  }
  if (touche === "End") {
    for (let i = desactives.length - 1; i >= 0; i--) if (!desactives[i]) return i;
    return null;
  }
  return null;
}

/**
 * Le geste prend-il la main ? Un glissé nettement horizontal (arbitrage-gestes), pas parti des 40 premiers dp (le volet garde le bord gauche ;
 * `departX` est le `pageX` du toucher, pas le `x0` du PanResponder, qui vaut 0 avant la prise du geste), et seulement si le panneau ne défile pas lui-même à l'horizontale.
 */
export function prendGlisseOnglets(dx: number, dy: number, departX: number, panneauHorizontal = false): boolean {
  return !panneauHorizontal && departX > T.glisseBordGauche && horizontal(dx, dy);
}

/** Panneau qu'atteindrait un glissé dans le sens `sens` (+1 : doigt vers la gauche, le suivant ; −1 : le précédent) : le premier qui n'est pas désactivé ; null au bord. */
export function voisinGlisse(desactives: readonly boolean[], courant: number, sens: 1 | -1): number | null {
  for (let j = courant + sens; j >= 0 && j < desactives.length; j += sens) if (!desactives[j]) return j;
  return null;
}

/** Panneau voisin après un glissé lâché : le doigt vers la gauche (+1) passe au suivant, vers la droite (−1) au précédent ; null au bord ou sans effet. */
export function ongletApresGlisse(desactives: readonly boolean[], courant: number, dx: number, vx: number, largeur: number): number | null {
  const sens = sensGlisse(dx, vx, largeur);
  return sens ? voisinGlisse(desactives, courant, sens) : null;
}
