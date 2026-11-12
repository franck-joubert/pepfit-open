// Morphologie : fonctions pures (testées dans tests/morphologie.test.ts et tests/morphologie-b.test.ts), sans base ni
// React Native.
//
// Calcul B de la planche morphologie (validée le 08/11, la v6 : l'esthétique d'abord), repris de
// planches/morphologie/outils/morpho-propose.js pour les GLB v6 (assets/3d/personnage-*-morph*.glb) :
// 1. le taux de gras (mesuré, sinon la moyenne des zones du Body Scan, sinon d'après le tour de taille, RFM, sinon d'après
//    l'âge, Deurenberg, D5) sépare la masse grasse de la masse maigre. Plus sec que le corps moyen du modèle (IMC 22,2) :
//    « adiposité » ôte le gras en moins, « muscle » rend la masse maigre en plus ou en moins ; plus gras : un corps moyen
//    qui aurait cette masse grasse règle l'adiposité, « muscle » la masse en plus ou en moins de lui. Sans taux ni âge,
//    l'IMC seul règle l'adiposité ;
// 2. soutien-gorge (femme, norme EN 13402-3, bonnet-calc.ts) : le tour de dos est la cage sous le sein (curseur
//    « poitrine »), le bonnet fait le sein à l'œil (curseur « bonnet » de sa lettre, GRILLE-ESTHETIQUE.md § 3) ;
// 3. chaque tour renseigné règle son curseur pour que le modèle, à la taille de la personne, ait ce tour, dans les bornes
//    où le corps reste beau (B.esthetique : l'esthétique passe avant le centimètre) ;
// 4. le Body Scan par zone (torse, bras, jambes) règle les tours non saisis : un tour mesuré passe avant la zone (Z2).
import type { Morphologie } from "./morphologie";
import { BONNET_DD, BONNETS as LETTRES_BONNET } from "./mesures/bonnet-calc";
import { MODELE, MODELE_EPAULES, type ModeleCorps, type TourModele } from "./morphologie-modele";
import { ZONES as ZONES_BODY_SCAN, type Zone } from "../withings/convertir";

/** Corps affiché sans donnée : homme, 1,80 m, IMC 22. */
export const DEFAUT = { sexe: "h", tailleCm: 180, imc: 22 } as const;
/** Tailles plausibles : en dehors, la valeur est ignorée (donnée illisible). */
const TAILLE_MIN_CM = 100;
const TAILLE_MAX_CM = 230;

/** Curseurs des GLB v6, un morphe par bout (« nom » = +1, « nom- » = −1 ; « tenue » : +1 seul). L'homme n'a ni bonnet ni
 *  tenue (restent à 0). */
export const CURSEURS = ["adiposite", "muscle", "taille", "poitrine", "bonnet", "tenue", "bras", "cuisse", "mollet", "hanches"] as const;
export type Curseur = (typeof CURSEURS)[number];
/** Tours saisis (Mensurations ; « taille » est le tour de taille), et le curseur que chacun règle. */
export const TOURS = ["taille", "hanches", "poitrine", "bras", "cuisse", "mollet"] as const;
export type TourSaisi = (typeof TOURS)[number];
export const TOURS_MODELE: readonly TourModele[] = [...TOURS, "sousPoitrine"];
/** Ordre de réglage : le tronc d'abord (les hanches grossissent aussi les cuisses), les membres ensuite. */
const ORDRE_TOURS: readonly TourSaisi[] = ["taille", "poitrine", "hanches", "cuisse", "mollet", "bras"];
/** Passes de réglage : hanches et cuisses, cage et sein se retouchent l'un l'autre ; à 20 passes, écart < 0,1 cm (la
 *  femme musclée du 08/11, taille et cage : 0,24 cm à 10 passes). */
const PASSES = 20;
/** Zones du Body Scan (convertir.ts) et les groupes qui règlent des tours. Gauche et droite sont moyennées : les GLB sont
 *  symétriques. Le torse règle le ventre (curseur taille, rond et bas), les hanches et, chez l'homme, la poitrine (chez la
 *  femme, le tour de dos et le bonnet font la poitrine) ; les hanches, à la jonction, visent la moyenne du tronc et des
 *  jambes quand les deux sont renseignés (sinon une silhouette en poire perd ses hanches). */
export const ZONES = ZONES_BODY_SCAN;
export const GROUPES: Record<"bras" | "jambes" | "tronc", { zones: readonly Zone[]; tours: readonly TourSaisi[] }> = {
  bras: { zones: ["bras_g", "bras_d"], tours: ["bras"] },
  jambes: { zones: ["jambe_g", "jambe_d"], tours: ["cuisse", "mollet", "hanches"] },
  tronc: { zones: ["torse"], tours: ["taille", "poitrine", "hanches"] },
};
/** Bonnets du calcul : « aucun » = pas de poitrine ou très petite (bonnet −1). */
export const NOMS_BONNET = ["aucun", "AA", "A", "B", "C", "D", "DD", "E", "F", "G", "H"] as const;
export type NomBonnet = (typeof NOMS_BONNET)[number];
/** Valeur rangée (bonnet-calc.ts : 0 = pas de poitrine, 1 à 9 = AA à H, 10 = DD) → bonnet ; null si illisible. */
export function bonnetDeValeur(v: number | null | undefined): NomBonnet | null {
  if (v === BONNET_DD) return "DD";
  if (v === 0) return "aucun";
  return v != null && Number.isInteger(v) && v >= 1 && v <= 9 ? LETTRES_BONNET[v - 1]! : null;
}

type Plage = readonly [number, number];
type Bornes = Record<Curseur, Plage>;
/** Un critère de la grille esthétique (GRILLE-ESTHETIQUE.md § 2) prédit par les curseurs : un zéro et deux pentes par
 *  curseur (côté −1, côté +1). */
export interface RegleEsthetique {
  critere: string;
  max?: number;
  min?: number;
  marge?: number;
  poids?: number;
  leviers: readonly Curseur[];
  zero: number;
  pentes: Partial<Record<Curseur, Plage>>;
}
/** Constantes de B (morpho-propose.js), réglées sur la planche. */
export const B = {
  /** IMC d'un corps moyen dessiné par l'adiposité 0. */
  imcNeutre: 22.2,
  /** Points d'IMC par unité d'adiposité, [côté −1, côté +1] : la masse que le bout ôte ou ajoute, en kg réels, sur la taille
   *  au carré. Au-delà de ±1, le corps reste au bout (bornes) : poussé à 1,4, le ventre et la poitrine font des plis. */
  imcParCurseur: { h: [2.46, 6.57], f: [1.78, 7.29] } as Record<"h" | "f", Plage>,
  /** Sans donnée : homme 1,80 m, femme 1,65 m, IMC 22. */
  defauts: { tailleCm: { h: 180, f: 165 }, imc: 22 },
  /** Taux de gras d'un corps moyen pour son IMC (Deurenberg 1991) : % = 1,2 × IMC + 0,23 × âge − 10,8 × homme − 5,4. Le
   *  modèle est réglé à 35 ans ; l'âge du profil ne sert qu'au taux d'une personne sans mesure (D5). */
  deurenberg: { imc: 1.2, age: 0.23, homme: -10.8, constante: -5.4, ageRetenu: 35 },
  /** Taux de gras d'après le tour de taille (RFM, Woolcott et Bergman 2018) : % = 64 − 20 × taille / tour + 12 × femme. */
  rfm: { base: 64, rapport: 20, femme: 12 },
  /** Masse maigre (kg/m²) par unité de muscle, [côté −1, côté +1] : la masse du bout, de même (la femme : ses bouts muscle
   *  dessinent plus qu'ils ne pèsent, le curseur atteint vite ses bornes). */
  ffmiParCurseur: { h: [1.27, 3.62], f: [0.05, 0.6] } as Record<"h" | "f", Plage>,
  /** Soutien-gorge, à l'œil : le curseur bonnet de chaque lettre, réglé sur la saillie du sein de profil (aucun 2,6 cm, la
   *  cage lisse, jamais creusée ; A 4,2, le modèle ; B 5,6 ; DD 9,6 ; H 14,1) : chaque lettre se voit, un DD bien plus qu'un
   *  B. Le DD entre le D et le E. defaut : sans bonnet ni tours. ecartCm : l'écart poitrine − dos de la norme, au milieu de
   *  sa plage : indicatif, le sein ne le suit plus. */
  bonnet: {
    ecartCm: { AA: 11, A: 13, B: 15, C: 17, D: 19, DD: 21.3, E: 21, F: 23, G: 25, H: 27 } as Record<Exclude<NomBonnet, "aucun">, number>,
    curseur: { aucun: -1, AA: -0.5, A: 0, B: 0.14, C: 0.27, D: 0.41, DD: 0.54, E: 0.62, F: 0.74, G: 0.86, H: 1 } as Record<NomBonnet, number>,
    defaut: "B" as NomBonnet,
  },
  /** Plage de chaque curseur : celle des GLB (deux bouts sculptés ; la tenue, un seul), où chaque corps passe la grille
   *  esthétique, seul ou avec les autres. */
  bornes: { adiposite: [-1, 1], muscle: [-1, 1], taille: [-1, 1], poitrine: [-1, 1], bonnet: [-1, 1], tenue: [0, 1], bras: [-1, 1], cuisse: [-1, 1], mollet: [-1, 1], hanches: [-1, 1] } as Bornes,
  /** Esthétique (GRILLE-ESTHETIQUE.md § 4). cuisseGras : au-delà de cet adiposité, la cuisse ne descend plus jusqu'à −1 (son
   *  plancher monte d'autant, −0,4 à +1 : un corps gras aux cuisses très fines fait un bourrelet à la ceinture). regles :
   *  les critères de la grille prédits par les curseurs (écart type 0,004 à 0,017) ; au-delà de la limite, les leviers, dans
   *  l'ordre, prennent un plancher ou un plafond (bornesEsthetiques) : la hanche d'abord (le bassin jamais plus large que
   *  les deux cuisses côte à côte), puis le mollet, la silhouette de la femme, enfin le ballon de la cuisse (en charnière).
   *  Les curseurs réglés par un tour gardent leurs bornes : les règles pèsent dans l'accord des tours (penalite, en cm par
   *  unité de critère au-delà de la limite : 0,01 de trop à la hanche pèse comme 30 cm d'écart à un tour ; les règles
   *  suivantes, 0,3 fois ; le ballon, 1 mm comme 0,01 de trop à la hanche). marge : de la règle à la grille (0,01 sinon ; la
   *  silhouette de la femme 0,03 ; le ballon, 0,5 mm). */
  esthetique: {
    cuisseGras: 0.4,
    penalite: 3000,
    regles: {
      f: [
        { critere: "hanche_cuisses", max: 1.02, leviers: ["cuisse", "hanches", "taille"], zero: 0.9935, pentes: { adiposite: [-0.0265, -0.003], cuisse: [-0.0186, -0.0247], hanches: [-0.0247, -0.0136], muscle: [-0.0225, -0.0287], poitrine: [0.0028, -0.0024], taille: [0, 0.0438] } },
        { critere: "mollet_genou", min: 1.08, leviers: ["mollet"], zero: 1.108, pentes: { adiposite: [0.0218, 0.0018], cuisse: [-0.0378, -0.0115], hanches: [-0.0164, -0.0185], mollet: [0, 0.0909], muscle: [0.0009, -0.0148] } },
        { critere: "taille_hanches", max: 0.77, marge: 0.03, leviers: ["taille"], zero: 0.625, pentes: { adiposite: [0.0151, 0.1041], bonnet: [0.0032, 0.0003], bras: [-0.0061, 0.0064], cuisse: [-0.0282, -0.0115], hanches: [-0.013, -0.0093], mollet: [-0.0031, 0.0029], muscle: [-0.0308, -0.0024], poitrine: [0.0388, 0.0849], taille: [0.0192, 0.0581] } },
        { critere: "cuisse_monte_mm", max: 2.5, marge: 0.5, poids: 0.01, leviers: ["cuisse"], zero: -0.21, pentes: { adiposite: [-0.69, 1.66], bras: [0.03, -0.04], cuisse: [0.04, 2.08], hanches: [0.22, 0.5], mollet: [0.19, -0.1], muscle: [0.76, 0.83], poitrine: [0.1, -0.26], taille: [-0.03, -0.12] } },
      ],
      h: [
        { critere: "hanche_cuisses", max: 1.02, leviers: ["cuisse", "hanches", "taille"], zero: 1.0051, pentes: { adiposite: [-0.0143, -0.0042], bras: [0.0027, 0.0005], cuisse: [0, -0.0433], hanches: [0, -0.03], muscle: [-0.0015, -0.054], taille: [0.0061, 0.0322] } },
        { critere: "mollet_genou", min: 1.06, leviers: ["mollet"], zero: 1.2219, pentes: { adiposite: [-0.0044, -0.031], cuisse: [-0.0274, -0.013], hanches: [-0.0035, -0.0211], mollet: [0.0979, 0.1143], muscle: [0.0142, 0.0225], taille: [0.0008, -0.0053] } },
        { critere: "cuisse_monte_mm", max: 4, marge: 0.5, poids: 0.01, leviers: ["cuisse"], zero: -0.71, pentes: { adiposite: [1.33, 3.52], bras: [0.05, 0.01], cuisse: [0.18, 2.2], hanches: [0, 1.26], mollet: [-0.04, -0.17], muscle: [0.18, -0.46], poitrine: [0.06, 0.06], taille: [0.14, -0.01] } },
      ],
    } as Record<"h" | "f", readonly RegleEsthetique[]>,
  },
  /** Un curseur qui change son tour de moins de 0,3 % de la taille par unité ne sait pas le régler. */
  penteMin: 0.003,
  /** Saisies plausibles (en dehors : ignorées, comme une donnée illisible ; tour de dos : bonnet-calc.ts). */
  plages: { tailleCm: [100, 230], poidsKg: [20, 500], grasPct: [3, 70], tourCm: [10, 250], dosCm: [50, 120], age: [15, 100] } as Record<string, Plage>,
  /** Butées des tours, en fraction de la taille et par sexe : une saisie hors plage y est ramenée. */
  plagesTours: {
    h: { taille: [0.278, 0.833], hanches: [0.389, 0.889], poitrine: [0.361, 0.889], bras: [0.1, 0.306], cuisse: [0.194, 0.472], mollet: [0.139, 0.306] },
    f: { taille: [0.303, 0.909], hanches: [0.424, 0.97], poitrine: [0.394, 0.97], dos: [0.333, 0.727], bras: [0.139, 0.333], cuisse: [0.212, 0.515], mollet: [0.152, 0.333] },
  } as Record<"h" | "f", Partial<Record<TourSaisi | "dos", Plage>>>,
  /** Femme, bras : jamais sous 23 cm (en dessous, le bout bras−1 se déforme). */
  brasMinFemmeCm: 23,
  /** Propagation douce : un tour saisi tire ses voisins non saisis d'une part de son curseur (hanches et cuisses, taille et
   *  cage), pour éviter les marches entre segments. */
  voisins: { hanches: { cuisse: 0.35 }, cuisse: { hanches: 0.3 }, taille: { poitrine: 0.3, hanches: 0.15 }, poitrine: { taille: 0.2 } } as Partial<Record<Curseur, Partial<Record<Curseur, number>>>>,
  zones: {
    /** Muscle de la zone (kg) par kg de masse maigre du corps, gauche = droite. Pris dans l'exemple Body Scan des tests de
     *  l'appli (tests/fixtures/withings-body-scan.json : reconstitué, pas une vraie pesée) : à recaler sur de vraies pesées
     *  (Z3 de la note Body Scan, outils/recaler-zones.mjs). Sert aussi de poids pour moyenner le % de gras des zones. */
    muscle: { torse: 0.42, bras_g: 0.053, bras_d: 0.053, jambe_g: 0.173, jambe_d: 0.173 } as Record<Zone, number>,
    plages: { grasPct: [3, 70], muscleKg: [0.3, 80] } as Record<string, Plage>,
  },
};

/** Plage [min, max] (cm) d'un tour (« dos » : le tour de dos) pour ce modèle et cette taille. */
export function plageTour(tour: TourSaisi | "dos", m: "h" | "f", tailleCm: number): Plage {
  const [a, b] = B.plagesTours[m][tour] ?? [0, Infinity];
  const min = m === "f" && tour === "bras" ? Math.max(B.brasMinFemmeCm, a * tailleCm) : a * tailleCm;
  return [min, b * tailleCm];
}

const borne = (v: number, [a, b]: Plage) => Math.min(b, Math.max(a, v));
const dans = (v: number | null | undefined, [a, b]: Plage) => (v != null && Number.isFinite(v) && v >= a && v <= b ? v : null);

/** Un critère de la grille esthétique prédit par les curseurs (B.esthetique.regles : zéro + Σ x × pente du côté de x). */
export function critere(r: RegleEsthetique, curseurs: readonly number[]): number {
  return CURSEURS.reduce((s, c, i) => s + curseurs[i]! * (r.pentes[c]?.[curseurs[i]! < 0 ? 0 : 1] ?? 0), r.zero);
}

/** Poids d'une règle de la grille dans l'accord des tours (B.esthetique.penalite) : la sienne, sinon 1 pour la hanche (la
 *  première), 0,3 pour les suivantes. */
export const poidsRegle = (r: RegleEsthetique, n: number) => r.poids ?? (n ? 0.3 : 1);
/** Excès du corps x sur une règle de la grille, au-delà de ce que ses leviers rattrapent dans leurs bornes : une règle que
 *  ses leviers, à leur borne, ne tiennent pas ne pousse pas les autres curseurs (comme bornesEsthetiques). */
export function excesRegle(g: RegleEsthetique, x: readonly number[], bornes: Bornes): number {
  const sens = g.max != null ? 1 : -1, mieux = x.slice();
  for (const l of g.leviers) {
    const p = g.pentes[l] ?? [0, 0];
    mieux[CURSEURS.indexOf(l)] = bornes[l][sens * (p[0] + p[1]) < 0 ? 1 : 0];
  }
  return Math.max(0, sens * critere(g, x) - Math.max(sens * (g.max ?? g.min!), sens * critere(g, mieux)));
}

/** B.bornes, la cuisse d'un corps gras sur son plancher (B.esthetique.cuisseGras). */
const bornesGras = (curseurs: readonly number[]): Bornes => ({ ...B.bornes,
  cuisse: [-1 + Math.max(0, curseurs[CURSEURS.indexOf("adiposite")]! - B.esthetique.cuisseGras), B.bornes.cuisse[1]] });

/** Bornes de chaque curseur où le corps passe la grille (B.esthetique.regles) : pour chaque règle dont le critère prédit
 *  passe sa limite, ses leviers, l'un après l'autre, prennent le plancher (ou le plafond) qui l'y ramène ; un levier qui
 *  n'y suffit pas reste à sa borne et passe la main au suivant. Les autres curseurs, tels quels. */
export function bornesEsthetiques(m: "h" | "f", curseurs: readonly number[], bornes: Bornes = B.bornes): Bornes {
  const out: Bornes = { ...bornes };
  for (const r of B.esthetique.regles[m]) {
    // le corps dans les bornes des règles d'avant (une cuisse qui monte pour la hanche grossit le genou, que voit le mollet)
    const x = curseurs.map((v, i) => borne(v, out[CURSEURS[i]!])), sens = r.max != null ? 1 : -1, limite = (r.max ?? r.min)!;
    const exces = () => sens * (critere(r, x) - limite);
    for (const l of r.leviers) {
      // le côté où le critère revient : là où ses pentes l'emmènent (le critère est monotone en chaque curseur) ; la borne
      // ne dépend pas de la valeur du levier
      const i = CURSEURS.indexOf(l), [lo, hi] = out[l];
      const p = r.pentes[l] ?? [0, 0], monte = sens * (p[0] + p[1]) < 0;
      x[i] = monte ? lo : hi;
      if (exces() <= 0) break; // partout bon
      x[i] = monte ? hi : lo;
      if (exces() > 0) {
        out[l] = [x[i]!, x[i]!]; // n'y suffit pas : à sa borne, le levier suivant
        continue;
      }
      let [a, b] = [lo, hi];
      for (let k = 0; k < 30; k++) {
        x[i] = (a + b) / 2;
        if ((exces() > 0) === monte) a = x[i]!;
        else b = x[i]!;
      }
      out[l] = monte ? [b, hi] : [lo, a];
      break;
    }
  }
  return out;
}
/** Écart rapporté à l'unité du curseur, [côté −1, côté +1]. */
const parUnite = (ecart: number, [moins, plus]: Plage) => (ecart >= 0 ? ecart / plus : ecart / moins);
/** Modèle dessiné : la femme pour « f », l'homme sinon (sexe non précisé : l'homme, D6). */
export const modeleDe = (sexe: "h" | "f" | null | undefined): "h" | "f" => (sexe === "f" ? "f" : "h");

/** Constante de Deurenberg (tout sauf 1,2 × IMC), à l'âge du modèle par défaut. */
const cDeurenberg = (m: "h" | "f", age: number = B.deurenberg.ageRetenu) => B.deurenberg.age * age + (m === "h" ? B.deurenberg.homme : 0) + B.deurenberg.constante;
/** Taux de gras (%) d'un corps moyen de cet IMC (et de cet âge). */
export const tauxAttendu = (imc: number, m: "h" | "f", age?: number) => B.deurenberg.imc * imc + cDeurenberg(m, age);
/** Masse grasse (kg/m²) d'un corps moyen de cet IMC. */
const fmiAttendu = (imc: number, m: "h" | "f") => (imc * tauxAttendu(imc, m)) / 100;
/** IMC d'un corps moyen qui aurait cette masse grasse (kg/m²) : inverse de fmiAttendu (racine positive). */
export function imcDeGras(fmi: number, m: "h" | "f"): number {
  const a = B.deurenberg.imc, c = cDeurenberg(m);
  return (-c + Math.sqrt(c * c + 4 * a * 100 * Math.max(0, fmi))) / (2 * a);
}
/** Adiposité (non bornée) d'un corps de cette masse grasse (kg/m²), et la masse maigre (kg/m²) de son muscle 0 : le corps
 *  du modèle s'il est plus sec que lui, sinon le corps moyen qui aurait cette masse grasse (comme l'étape 2 de calculerB). */
function corpsDeGras(fmi: number, m: "h" | "f"): { adiposite: number; ffmi0: number } {
  const fmi0 = fmiAttendu(B.imcNeutre, m);
  if (fmi <= fmi0) return { adiposite: (fmi - fmi0) / B.imcParCurseur[m][0], ffmi0: B.imcNeutre - fmi0 };
  const imcGras = imcDeGras(fmi, m);
  return { adiposite: (imcGras - B.imcNeutre) / B.imcParCurseur[m][1], ffmi0: imcGras - fmi };
}
const moyenne = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
/** Moyenne pondérée par le poids de chaque zone (B.zones.muscle). */
const moyenneZones = (zs: readonly Zone[], f: (z: Zone) => number) => zs.reduce((s, z) => s + B.zones.muscle[z] * f(z), 0) / zs.reduce((s, z) => s + B.zones.muscle[z], 0);
/** Taux de gras (%) d'après le tour de taille (RFM). */
const tauxRfm = (tailleCm: number, tourTailleCm: number, m: "h" | "f") => B.rfm.base - (B.rfm.rapport * tailleCm) / tourTailleCm + (m === "f" ? B.rfm.femme : 0);

/** Effet d'un curseur sur un tour, en fraction de la taille : ses abscisses, ordonnées et la ligne brisée qui les joint. */
interface Courbe {
  xs: readonly number[];
  ys: readonly number[];
  f: (k: number) => number;
}
const DROITE = [-1, 0, 1] as const;

/** Effet d'un curseur sur un tour (paliers, ou la droite de ses pentes) ; « ecart » = poitrine − sous-poitrine. `corps` : le
 *  corps du moment (ordre de CURSEURS), pour les paliers mesurés sur plusieurs corps (le bonnet). */
function effet(modele: ModeleCorps, curseur: Curseur, tour: TourModele | "ecart", corps: readonly number[] | null = null): Courbe {
  if (tour === "ecart") {
    const a = effet(modele, curseur, "poitrine", corps), b = effet(modele, curseur, "sousPoitrine", corps);
    if (a.xs !== b.xs) return { xs: DROITE, ys: DROITE.map((k) => a.f(k) - b.f(k)), f: (k) => a.f(k) - b.f(k) };
    const ys = a.ys.map((y, i) => y - b.ys[i]!);
    return { xs: a.xs, ys, f: (k) => entre(k, a.xs, ys) };
  }
  const q = curseur === "bonnet" ? modele.paliers?.bonnet : undefined;
  if (q && (tour === "poitrine" || tour === "sousPoitrine")) {
    const ys = q.corps && corps ? melange(q.corps, tour, corps) : q[tour];
    return { xs: q.k, ys, f: (k) => entre(k, q.k, ys) };
  }
  const p = modele.pentes[curseur]?.[tour] ?? [0, 0];
  return { xs: DROITE, ys: [-p[0], 0, p[1]], f: (k) => (k >= 0 ? k * p[1] : k * p[0]) };
}
/** Poids de chaque nœud d'une grille croissante pour x (ligne brisée, bornée aux extrémités). */
function poidsGrille(x: number, g: readonly number[]): number[] {
  const w = g.map(() => 0);
  if (x <= g[0]!) return (w[0] = 1), w;
  if (x >= g[g.length - 1]!) return (w[g.length - 1] = 1), w;
  let i = 1;
  while (x > g[i]!) i++;
  const t = (x - g[i - 1]!) / (g[i]! - g[i - 1]!);
  return (w[i - 1] = 1 - t), (w[i] = t), w;
}
type Grille = NonNullable<NonNullable<NonNullable<ModeleCorps["paliers"]>["bonnet"]>["corps"]>;
/** Paliers d'un tour mélangés entre les corps mesurés (adiposité × cage), selon les curseurs du moment. */
function melange(c: Grille, tour: "poitrine" | "sousPoitrine", curseurs: readonly number[]): number[] {
  const wa = poidsGrille(curseurs[CURSEURS.indexOf("adiposite")] ?? 0, c.adiposite);
  const wc = poidsGrille(curseurs[CURSEURS.indexOf("poitrine")] ?? 0, c.cage);
  const ys = c[tour][0]![0]!.map(() => 0);
  wa.forEach((a, i) => wc.forEach((b, j) => {
    if (a * b) c[tour][i]![j]!.forEach((y, k) => (ys[k]! += a * b * y));
  }));
  return ys;
}
/** Ligne brisée (xs, ys) en x, prolongée par ses segments extrêmes. */
function entre(x: number, xs: readonly number[], ys: readonly number[]): number {
  let i = 1;
  while (i < xs.length - 1 && x > xs[i]!) i++;
  return ys[i - 1]! + ((x - xs[i - 1]!) * (ys[i]! - ys[i - 1]!)) / (xs[i]! - xs[i - 1]!);
}
/** Inverse d'une ligne brisée croissante : x tel que entre(x) = y. */
function inverse(y: number, xs: readonly number[], ys: readonly number[]): number {
  let i = 1;
  while (i < xs.length - 1 && y > ys[i]!) i++;
  return xs[i - 1]! + ((y - ys[i - 1]!) * (xs[i]! - xs[i - 1]!)) / (ys[i]! - ys[i - 1]!);
}

/** x tel que A x = y (Gauss-Jordan, pivot partiel) ; null si A est singulière. */
function resoudre(A: readonly (readonly number[])[], y: readonly number[]): number[] | null {
  const n = y.length, M = A.map((l, i) => [...l, y[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i]![c]!) > Math.abs(M[p]![c]!)) p = i;
    if (Math.abs(M[p]![c]!) < 1e-12) return null;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let i = 0; i < n; i++) {
      if (i === c) continue;
      const k = M[i]![c]! / M[c]![c]!;
      for (let j = c; j <= n; j++) M[i]![j]! -= k * M[c]![j]!;
    }
  }
  return M.map((l, i) => l[n]! / l[i]!);
}

type Tours = Partial<Record<TourModele | "ecart", number>>;
/** Tours (cm) que montre le modèle pour ces curseurs, à cette taille, écart poitrine − dos compris. `corps` : les curseurs
 *  qui choisissent les paliers du bonnet (adiposité et cage), ceux-ci par défaut. */
export function toursModele(modele: ModeleCorps, tailleCm: number, curseurs: readonly number[], corps: readonly number[] = curseurs): Tours {
  const r: Tours = {};
  for (const t of TOURS_MODELE) {
    const z = modele.zero[t];
    if (z == null) continue;
    let f = z;
    CURSEURS.forEach((c, i) => {
      if (curseurs[i]) f += effet(modele, c, t, corps).f(curseurs[i]!);
    });
    r[t] = f * tailleCm;
  }
  if (r.sousPoitrine != null) r.ecart = r.poitrine! - r.sousPoitrine;
  return r;
}

/** Bonnet que porte un écart poitrine − dos (cm), d'après les plages de la norme : moins de 10, « aucun » ; puis AA à H
 *  de 2 en 2 (au-delà de 28 : H). Le DD ne se devine pas (c'est une tenue, pas un écart). */
export function bonnetDeEcart(ecartCm: number | undefined): NomBonnet {
  if (!(ecartCm! >= 10)) return "aucun";
  return (["AA", "A", "B", "C", "D", "E", "F", "G", "H"] as const)[Math.min(8, Math.floor((ecartCm! - 10) / 2))]!;
}

export interface EntreeB {
  sexe: "h" | "f" | null;
  tailleCm: number | null;
  poidsKg: number | null;
  grasPct?: number | null;
  /** Âge (ans) : le taux de gras d'une personne sans mesure (D5). */
  age?: number | null;
  bonnet?: NomBonnet | null;
  /** Tour de dos (cm, sous la poitrine). */
  tourDos?: number | null;
  tours?: Partial<Record<TourSaisi, number | null>>;
  /** Body Scan, par zone (les zones peuvent manquer) : % de gras, et muscle en kg. */
  zonesGras?: Partial<Record<Zone, number | null>>;
  zonesMuscle?: Partial<Record<Zone, number | null>>;
}

interface Reglage {
  curseur: Curseur;
  tour: TourModele;
  cible: number;
  saisie: TourSaisi | "tourDos";
  /** D'où vient la cible : le ruban (tour saisi), ou l'estimation d'une zone du Body Scan (pèse 0,1 dans l'accord). */
  source?: "tour" | "zone";
}

/** Ce que vise un groupe de zones du Body Scan (GROUPES) : son gras et son muscle, en curseurs. */
interface ZoneVisee {
  grasPct: number | null;
  adipositeBrut: number | null;
  adiposite: number;
  muscleBrut: number | null;
  muscle: number;
  tours: readonly TourSaisi[];
  /** Tous ses tours sont saisis : la zone ne règle rien (Z2). */
  sansEffet: boolean;
}

export interface ResultatB {
  modele: "h" | "f";
  tailleCm: number;
  imc: number;
  /** Les 10 curseurs, dans l'ordre de CURSEURS. */
  curseurs: number[];
  /** Les bornes du corps final (B.bornes, le plancher de la cuisse et les règles esthétiques). */
  bornes: Bornes;
  taux: { valeur: number; source: "mesure" | "zones" | "tour" | "age" | "imc" };
  /** Masse grasse et maigre (kg/m²) du taux, la maigre attendue d'un corps moyen de cet IMC, et la masse maigre (kg). */
  fmi: number | null;
  ffmi: number | null;
  ffmiAttendu: number | null;
  masseMaigreKg: number | null;
  brut: Partial<Record<Curseur, number>>;
  regles: Partial<Record<Reglage["saisie"], Reglage & { possible: boolean; butee?: boolean; accord?: boolean }>>;
  muscleSource: "taux" | "zones" | "aucune";
  zones: Partial<Record<keyof typeof GROUPES, ZoneVisee>>;
  /** Ce que le Body Scan donnerait pour ce corps s'il était partout pareil : % de gras et muscle (kg) de chaque zone. */
  zonesAttendues: Record<Zone, { grasPct: number; muscleKg: number }>;
  /** porte : la lettre dessinée ; ecartCm : l'écart du modèle au ruban (indicatif : le sein se règle à l'œil). */
  bonnet: { saisi: NomBonnet | null; tourDos: number | null; ecartCm: number; porte: NomBonnet; source: "saisi" | "tours" | "defaut" | "poitrine" } | null;
  /** Chaque tour (et l'écart poitrine − dos) : saisi, visé par une zone du Body Scan (cible), et montré par le modèle (cm). */
  tours: Record<TourModele | "ecart", { saisi: number | null; cible: number | null; modele: number | undefined }>;
}

/**
 * Les 10 curseurs de B pour ce que l'appli sait. `epaules` : l'homme aux épaules naturelles (D11, son propre modèle) ;
 * sans effet pour la femme. `lettre` : le bonnet quand il n'est ni saisi ni tiré des tours (celui du calcul, plus bas).
 */
export function calculerB(e: EntreeB, epaules = false, lettre: NomBonnet = B.bonnet.defaut): ResultatB {
  const m = modeleDe(e.sexe);
  const modele = m === "f" ? MODELE.f : epaules ? MODELE_EPAULES : MODELE.h;
  const taille = dans(e.tailleCm, B.plages.tailleCm!);
  const tailleCm = taille ?? B.defauts.tailleCm[m];
  const poids = dans(e.poidsKg, B.plages.poidsKg!);
  const imc = poids != null ? poids / (tailleCm / 100) ** 2 : B.defauts.imc;
  const tours = Object.fromEntries(TOURS.map((t) => {
    const v = dans(e.tours?.[t], B.plages.tourCm!);
    return [t, v == null ? null : borne(v, plageTour(t, m, tailleCm))];
  })) as Record<TourSaisi, number | null>;
  const ix = (c: Curseur) => CURSEURS.indexOf(c);
  const zg = Object.fromEntries(ZONES.map((z) => [z, dans(e.zonesGras?.[z], B.zones.plages.grasPct!)])) as Record<Zone, number | null>;
  const zm = Object.fromEntries(ZONES.map((z) => [z, dans(e.zonesMuscle?.[z], B.zones.plages.muscleKg!)])) as Record<Zone, number | null>;
  const avecGras = ZONES.filter((z) => zg[z] != null), avecMuscle = ZONES.filter((z) => zm[z] != null);

  // 1. Taux de gras : mesuré, sinon la moyenne des zones du Body Scan, sinon d'après le tour de taille (RFM), sinon d'après
  //    l'âge (Deurenberg, D5), sinon aucun (repli sur l'IMC)
  let taux = dans(e.grasPct, B.plages.grasPct!);
  let source: ResultatB["taux"]["source"] = taux != null ? "mesure" : "imc";
  if (taux == null && avecGras.length) {
    taux = moyenneZones(avecGras, (z) => zg[z]!);
    source = "zones";
  } else if (taux == null && tours.taille != null) {
    taux = borne(tauxRfm(tailleCm, tours.taille, m), B.plages.grasPct!);
    source = "tour";
  }
  const age = dans(e.age, B.plages.age!);
  if (taux == null && age != null) {
    taux = borne(tauxAttendu(imc, m, age), B.plages.grasPct!);
    source = "age";
  }

  // 2. Adiposité et muscle. Masse grasse (fmi) et maigre (ffmi) en kg/m², comparées au corps du modèle (IMC 22,2, taux de
  //    Deurenberg à 35 ans). Moins de gras que lui : l'adiposité ôte ce gras (son côté −1 n'ôte que du gras), le muscle
  //    rend l'écart de masse maigre. Plus : on suit un corps moyen qui aurait cette masse grasse (son IMC, imcGras), le
  //    muscle rend la masse en plus ou en moins de lui. Les deux se rejoignent au corps du modèle.
  const curseurs: number[] = CURSEURS.map(() => 0);
  const brut: ResultatB["brut"] = {};
  let fmi: number | null = null, ffmi: number | null = null;
  if (taux != null) {
    fmi = (imc * taux) / 100;
    ffmi = imc - fmi;
    const fmi0 = fmiAttendu(B.imcNeutre, m);
    if (fmi <= fmi0) {
      brut.adiposite = (fmi - fmi0) / B.imcParCurseur[m][0];
      brut.muscle = parUnite(ffmi - (B.imcNeutre - fmi0), B.ffmiParCurseur[m]);
    } else {
      const imcGras = imcDeGras(fmi, m);
      brut.adiposite = (imcGras - B.imcNeutre) / B.imcParCurseur[m][1];
      brut.muscle = parUnite(imc - imcGras, B.ffmiParCurseur[m]);
    }
    curseurs[ix("muscle")] = borne(brut.muscle, B.bornes.muscle);
  } else brut.adiposite = parUnite(imc - B.imcNeutre, B.imcParCurseur[m]);
  curseurs[ix("adiposite")] = borne(brut.adiposite, B.bornes.adiposite);

  // Body Scan. Le muscle d'une zone : la masse maigre qu'aurait le corps s'il était partout comme elle (muscle ÷ sa part),
  // comparée à celle du muscle 0 ; renseigné, il remplace le muscle du taux. Puis chaque groupe de zones vise, pour ses
  // tours non saisis (Z2 : un tour mesuré au ruban passe avant son estimation par la zone), ceux du modèle dont tout le
  // corps aurait son gras et son muscle.
  const t2 = (tailleCm / 100) ** 2;
  const ffmi0 = fmi != null ? corpsDeGras(fmi, m).ffmi0 : imc - fmiAttendu(imc, m);
  // moyennes en masse maigre (kg/m²), puis en curseur (ses deux côtés n'ont pas la même unité)
  const ffmiDeZone = (z: Zone) => zm[z]! / B.zones.muscle[z] / t2;
  const muscleDe = (ffmiZone: number) => parUnite(ffmiZone - ffmi0, B.ffmiParCurseur[m]);
  let muscleSource: ResultatB["muscleSource"] = taux != null ? "taux" : "aucune";
  if (avecMuscle.length) {
    brut.muscle = muscleDe(moyenneZones(avecMuscle, ffmiDeZone));
    curseurs[ix("muscle")] = borne(brut.muscle, B.bornes.muscle);
    muscleSource = "zones";
  }
  // le sein (femme) : la lettre du bonnet, à l'œil (B.bonnet) : la saisie, sinon celle de l'écart du tour de poitrine au
  // tour de dos, sinon le B (ou la lettre qui rend le tour de poitrine, plus bas) ; posé avant les zones (le tronc qu'elles
  // visent a ce sein)
  const f = m === "f";
  const bonnetSaisi = f && e.bonnet != null && (NOMS_BONNET as readonly string[]).includes(e.bonnet) ? e.bonnet : null;
  const dosSaisi = f ? dans(e.tourDos, B.plages.dosCm!) : null;
  const dos = dosSaisi == null ? null : borne(dosSaisi, plageTour("dos", m, tailleCm));
  const deDeux = dos != null && tours.poitrine != null;
  const bonnet: NomBonnet | null = !f ? null : bonnetSaisi ?? (deDeux ? bonnetDeEcart(tours.poitrine! - dos!) : lettre);
  const bonnetSource: NonNullable<ResultatB["bonnet"]>["source"] | null = !f ? null : bonnetSaisi ? "saisi" : deDeux ? "tours" : lettre === B.bonnet.defaut ? "defaut" : "poitrine";
  if (f) curseurs[ix("bonnet")] = B.bonnet.curseur[bonnet!];
  const objectifs: Partial<Record<TourSaisi, number | null>> = { ...tours };
  const origine: Partial<Record<TourSaisi, "zone">> = {};
  const zones: ResultatB["zones"] = {};
  const vises: Partial<Record<TourSaisi, number[]>> = {};
  for (const [nom, g] of Object.entries(GROUPES) as [keyof typeof GROUPES, (typeof GROUPES)[keyof typeof GROUPES]][]) {
    const pcts = g.zones.filter((z) => zg[z] != null).map((z) => zg[z]!);
    const mus = g.zones.filter((z) => zm[z] != null).map(ffmiDeZone);
    if (!pcts.length && !mus.length) continue;
    const grasPct = pcts.length ? moyenne(pcts) : null;
    const adipositeBrut = grasPct != null ? corpsDeGras((imc * grasPct) / 100, m).adiposite : null;
    const muscleBrut = mus.length ? muscleDe(moyenne(mus)) : null;
    const cs = CURSEURS.map(() => 0);
    cs[ix("adiposite")] = adipositeBrut != null ? borne(adipositeBrut, B.bornes.adiposite) : curseurs[ix("adiposite")]!;
    cs[ix("muscle")] = muscleBrut != null ? borne(muscleBrut, B.bornes.muscle) : curseurs[ix("muscle")]!;
    cs[ix("bonnet")] = curseurs[ix("bonnet")]!;
    const bz = bornesEsthetiques(m, cs, bornesGras(cs)); // le corps que B dessinerait (ses planchers et plafonds)
    cs.forEach((v, i) => (cs[i] = borne(v, bz[CURSEURS[i]!])));
    const vise = toursModele(modele, tailleCm, cs);
    const sesTours = g.tours.filter((t) => !(t === "poitrine" && m === "f"));
    for (const t of sesTours) (vises[t] ??= []).push(vise[t]!);
    zones[nom] = { grasPct, adipositeBrut, adiposite: cs[ix("adiposite")]!, muscleBrut, muscle: cs[ix("muscle")]!, tours: sesTours,
      sansEffet: sesTours.every((t) => tours[t] != null) };
  }
  for (const [t, vs] of Object.entries(vises) as [TourSaisi, number[]][]) {
    if (tours[t] != null) continue;
    objectifs[t] = borne(moyenne(vs), plageTour(t, m, tailleCm));
    origine[t] = "zone";
  }

  // 3. Soutien-gorge (femme) : la cage suit le tour de dos s'il est connu (sinon le tour de poitrine), plus bas
  //    esthétique (B.esthetique) : la cuisse d'un corps gras ne descend pas jusqu'à −1 ; les règles de la grille, plus bas
  let bornes = bornesGras(curseurs);
  const reglages: Reglage[] = [];
  for (const t of ORDRE_TOURS) {
    if (t !== "poitrine" || !f) {
      if (objectifs[t] != null) reglages.push({ curseur: t, tour: t, cible: objectifs[t]!, saisie: t, source: origine[t] ?? "tour" });
      continue;
    }
    if (dos != null) reglages.push({ curseur: "poitrine", tour: "sousPoitrine", cible: dos, saisie: "tourDos" });
    else if (tours.poitrine != null) reglages.push({ curseur: "poitrine", tour: "poitrine", cible: tours.poitrine, saisie: "poitrine" });
  }

  // 4. Chaque réglage : son curseur tel que le modèle ait ce tour (à cette corpulence, les autres curseurs fixés), puis
  //    tous ensemble (5). Deux fois : sans les règles de la grille, puis dans les bornes qu'elles posent sur ce corps
  //    (posées une fois : reprises à chaque passe, la cuisse et les hanches se renvoyaient la balle)
  const regles: ResultatB["regles"] = {};
  const reglesCurseurs = new Set<Curseur>(reglages.map((r) => r.curseur));
  // propagation douce (B.voisins) : les curseurs voisins non réglés suivent une part des curseurs réglés
  const voisins = (x: number[]) => {
    for (const cibles of Object.values(B.voisins)) for (const n of Object.keys(cibles!) as Curseur[]) if (!reglesCurseurs.has(n)) x[ix(n)] = 0;
    for (const [src, cibles] of Object.entries(B.voisins) as [Curseur, Partial<Record<Curseur, number>>][]) {
      if (!reglesCurseurs.has(src)) continue;
      for (const [n, k] of Object.entries(cibles) as [Curseur, number][]) if (!reglesCurseurs.has(n)) x[ix(n)] = borne(x[ix(n)]! + k * x[ix(src)]!, bornes[n]);
    }
    CURSEURS.forEach((c, i) => { if (!reglesCurseurs.has(c)) x[i] = borne(x[i]!, bornes[c]); });
    return x;
  };
  // 5. Les réglages ensemble. La cuisse et les hanches se règlent l'une l'autre (le bout cuisse− amincit plus les hanches
  //    que la cuisse) : réglées chacune à son tour, des mesures qui ne vont pas ensemble partaient en butée. Ici le corps le
  //    plus près de tous les tours saisis à la fois : moindres carrés en cm, chaque curseur dans ses bornes ; un tour
  //    estimé par sa zone pèse 0,1 (Z2 : le ruban passe avant) ; les règles de la grille y pèsent (B.esthetique.penalite).
  //    Un tour qui n'est pas rendu est en butée (son curseur à sa borne) ou en accord (au plus près des autres tours et des
  //    règles).
  const accorder = () => {
    const rs = reglages.filter((r) => regles[r.saisie]?.possible);
    if (!rs.length) return;
    const is = [...new Set(rs.map((r) => ix(r.curseur)))];
    const poidsTour = rs.map((r) => (r.source === "zone" ? 0.1 : 1));
    const ecarts = (x: number[]) => {
      const y = voisins(x.slice()), t = toursModele(modele, tailleCm, y);
      return [...rs.map((r, q) => poidsTour[q]! * (r.cible - t[r.tour]!)),
        ...B.esthetique.regles[m].map((g, n) => B.esthetique.penalite * poidsRegle(g, n) * excesRegle(g, y, bornes))];
    };
    const somme = (v: readonly number[]) => v.reduce((a, x) => a + x * x, 0);
    let lambda = 1e-3;
    for (let k = 0; k < 100; k++) {
      const ec = ecarts(curseurs), s0 = somme(ec);
      if (s0 < 1e-12) break;
      // chaque pente du côté où l'écart baisse (le modèle est une ligne brisée par curseur : exacte hors du coude) ; un
      // curseur à un minimum sur son axe (sa borne, ou le coude de la cuisse à 0) reste en place pour ce pas
      const J = ec.map(() => is.map(() => 0)), cote = is.map(() => 0), coude = is.map(() => false);
      is.forEach((i, j) => {
        const [lo, hi] = bornes[CURSEURS[i]!], [a, b] = [curseurs.slice(), curseurs.slice()];
        a[i] = Math.min(hi, a[i]! + 1e-4), b[i] = Math.max(lo, b[i]! - 1e-4);
        const [ea, eb] = [ecarts(a), ecarts(b)], [sa, sb] = [somme(ea), somme(eb)];
        if (sa >= s0 - 1e-12 && sb >= s0 - 1e-12) return;
        const pente = (x: number[], ex: number[]) => ec.map((v, q) => (v - ex[q]!) / (x[i]! - curseurs[i]!));
        const [pa, pb] = [a[i]! > curseurs[i]! ? pente(a, ea) : null, b[i]! < curseurs[i]! ? pente(b, eb) : null];
        cote[j] = sa < sb ? 1 : -1;
        (cote[j]! > 0 ? pa : pb)?.forEach((v, q) => (J[q]![j] = v));
        coude[j] = !!(pa && pb && pa.some((v, q) => Math.abs(v - pb[q]!) > 1e-6));
      });
      const g = is.map((_, u) => ec.reduce((a, v, q) => a + J[q]![u]! * v, 0));
      const libres = is.map((_, u) => u).filter((u) => cote[u] !== 0);
      if (!libres.length) break;
      // Levenberg-Marquardt : la cuisse et les hanches sont presque colinéaires (cosinus 0,998 d'un côté du coude) ; un
      // pas de Gauss-Newton y partait trop loin. Un curseur sur un coude ne le repasse pas à contresens dans ce pas.
      let mieux: { y: number[]; s1: number } | null = null;
      for (let essai = 0; essai < 40 && !mieux; essai++) {
        const A = libres.map((u) => libres.map((v) => {
          const a = J.reduce((x, l) => x + l[u]! * l[v]!, 0);
          return u === v ? a * (1 + lambda) + 1e-9 : a;
        }));
        const d = resoudre(A, libres.map((u) => g[u]!));
        const y = curseurs.slice();
        if (d) libres.forEach((u, n) => (y[is[u]!] = borne(y[is[u]!]! + (coude[u]! && d[n]! * cote[u]! < 0 ? 0 : d[n]!), bornes[CURSEURS[is[u]!]!])));
        const s1 = d ? somme(ecarts(y)) : Infinity;
        if (s1 < s0 - 1e-12) mieux = { y, s1 };
        else lambda *= 4;
      }
      if (!mieux) break;
      const retenu: { y: number[]; s1: number } = mieux;
      lambda = Math.max(1e-7, lambda / 3);
      retenu.y.forEach((v, i) => (curseurs[i] = v));
      if (s0 - retenu.s1 < 1e-10 * (1 + s0)) break;
    }
    voisins(curseurs);
    const t = toursModele(modele, tailleCm, curseurs);
    for (const r of rs) {
      const v = curseurs[ix(r.curseur)]!, [lo, hi] = bornes[r.curseur], rendu = Math.abs(t[r.tour]! - r.cible) < 0.05;
      regles[r.saisie] = { ...regles[r.saisie]!, butee: !rendu && (v === lo || v === hi), accord: !rendu && v !== lo && v !== hi };
    }
  };
  for (const grille of [false, true]) {
    if (grille) {
      const be = bornesEsthetiques(m, curseurs, bornes); // les curseurs réglés : les règles pèsent dans l'accord (5)
      bornes = Object.fromEntries(CURSEURS.map((c) => [c, reglesCurseurs.has(c) ? bornes[c] : be[c]])) as Bornes;
    }
    for (let passe = 0; passe < PASSES; passe++) {
      voisins(curseurs);
      for (const r of reglages) {
        const i = ix(r.curseur);
        const corps = curseurs.slice(); // les paliers du bonnet restent ceux du corps de la passe (la cage les choisit aussi)
        curseurs[i] = 0;
        const reference = toursModele(modele, tailleCm, curseurs, corps)[r.tour]! / tailleCm; // le modèle sans ce curseur
        const ecart = r.cible / tailleCm - reference;
        const fx = effet(modele, r.curseur, r.tour, corps);
        const cle = r.saisie; // une saisie ne règle qu'un curseur
        if (!((ecart >= 0 ? fx.f(1) : -fx.f(-1)) >= B.penteMin)) {
          regles[cle] = { ...r, possible: false }; // ce curseur ne règle pas ce tour : il reste à 0
          continue;
        }
        brut[r.curseur] = inverse(ecart, fx.xs, fx.ys);
        curseurs[i] = borne(brut[r.curseur]!, bornes[r.curseur]);
        regles[cle] = { ...r, possible: true, butee: curseurs[i] !== brut[r.curseur] };
      }
    }
    accorder();
  }
  // ni lettre ni tour de dos, et le tour de poitrine hors de portée de la cage (à sa borne) : la lettre voisine, du B vers
  // « aucun » ou vers le H, la première que la cage rend (chaque sein de l'échelle est beau)
  if (bonnetSource === "defaut" && regles.poitrine?.butee) {
    const suite: readonly NomBonnet[] = curseurs[ix("poitrine")]! < 0 ? ["A", "AA", "aucun"] : NOMS_BONNET.slice(NOMS_BONNET.indexOf("C"));
    for (const l of suite) {
      const r = calculerB(e, epaules, l);
      if (!r.regles.poitrine?.butee || l === suite[suite.length - 1]) return r;
    }
  }
  const montres = toursModele(modele, tailleCm, curseurs);
  return {
    modele: m, tailleCm, imc, curseurs, bornes,
    taux: { valeur: taux ?? tauxAttendu(imc, m), source }, // source « imc » : valeur seulement indicative
    fmi, ffmi, ffmiAttendu: ffmi != null ? imc - fmiAttendu(imc, m) : null, masseMaigreKg: ffmi != null ? ffmi * t2 : null,
    brut, regles, muscleSource, zones,
    zonesAttendues: Object.fromEntries(ZONES.map((z) => [z, { grasPct: taux ?? tauxAttendu(imc, m),
      muscleKg: B.zones.muscle[z] * t2 * (ffmi0 + (curseurs[ix("muscle")]! >= 0 ? curseurs[ix("muscle")]! * B.ffmiParCurseur[m][1] : curseurs[ix("muscle")]! * B.ffmiParCurseur[m][0])) }])) as ResultatB["zonesAttendues"],
    bonnet: f ? { saisi: bonnetSaisi, tourDos: dos, ecartCm: montres.ecart!, porte: bonnet!, source: bonnetSource! } : null,
    tours: Object.fromEntries([...TOURS_MODELE, "ecart" as const].map((t) => [t, {
      saisi: t === "sousPoitrine" ? dos : t === "ecart" ? null : tours[t as TourSaisi],
      cible: t !== "sousPoitrine" && t !== "ecart" && origine[t as TourSaisi] === "zone" ? objectifs[t as TourSaisi]! : null, modele: montres[t] }])) as ResultatB["tours"],
  };
}

/** Ce que l'appli sait : personnage du profil (« homme » / « femme ») et dernière pesée. Null s'il n'y a rien. */
export function morphologieDe(personnage: string | null, poidsKg: number | null, tailleCm: number | null = null): Morphologie | null {
  const sexe = personnage === "homme" ? "h" : personnage === "femme" ? "f" : null;
  const poids = poidsKg != null && poidsKg > 0 && poidsKg <= 500 ? poidsKg : null;
  const taille = tailleCm != null && tailleCm >= TAILLE_MIN_CM && tailleCm <= TAILLE_MAX_CM ? tailleCm : null;
  if (sexe == null && poids == null && taille == null) return null;
  return { sexe, tailleCm: taille, poidsKg: poids };
}

export interface CorpsAffiche {
  sexe: "h" | "f";
  tailleCm: number;
  /** IMC servant à la silhouette (22 par défaut). */
  imc: number;
  /** Échelle uniforme du modèle (taille / taille du modèle). */
  echelle: (hModele: number) => number;
  /** Les 10 curseurs du calcul B, dans l'ordre de CURSEURS (bonnet de −1 à 1,25, tenue de 0 à 1, les autres de −1 à 1). */
  curseurs: number[];
  /** Homme aux épaules naturelles (D11) plutôt que sur le squelette de l'appli ; toujours faux pour la femme. */
  epaules: boolean;
}

/** IMC d'après un poids et une taille (cm), arrondi au dixième ; null s'il manque l'un des deux. */
export function imcDe(poidsKg: number | null, tailleCm: number | null): number | null {
  if (poidsKg == null || tailleCm == null) return null;
  const m = tailleCm / 100;
  return Math.round((poidsKg / (m * m)) * 10) / 10;
}

/**
 * Corps à dessiner : le calcul B sur ce que l'appli sait, sinon le défaut (homme 1,80 m IMC 22 ; femme 1,65 m). Sexe non
 * précisé : l'homme (D6). L'homme a les épaules naturelles sauf si le réglage rend le squelette de l'appli (D11).
 */
export function corpsAffiche(m: Morphologie | null): CorpsAffiche {
  const sexe = m?.sexe ?? DEFAUT.sexe;
  const epaules = sexe === "h" && m?.epaules !== false;
  const b = calculerB({ sexe, tailleCm: m?.tailleCm ?? null, poidsKg: m?.poidsKg ?? null, grasPct: m?.grasPct, age: m?.age,
    bonnet: bonnetDeValeur(m?.bonnet), tourDos: m?.tourDosCm, tours: m?.tours, zonesGras: m?.zonesGras, zonesMuscle: m?.zonesMuscle }, epaules);
  const tailleCm = b.tailleCm;
  const imc = imcDe(m?.poidsKg ?? null, tailleCm) ?? DEFAUT.imc;
  return { sexe, tailleCm, imc, echelle: (hModele) => tailleCm / 100 / hModele, curseurs: b.curseurs, epaules };
}

/**
 * Influences des cibles d'un maillage pour ces curseurs (comme `poser` de la planche) : un morphe par bout, « nom- » pour
 * une valeur négative quand il existe, « nom » sinon ; toutes les autres à 0.
 */
export function influencesDe(dico: Readonly<Record<string, number>>, n: number, curseurs: readonly number[]): number[] {
  const inf = new Array<number>(n).fill(0);
  CURSEURS.forEach((nom, i) => {
    const v = curseurs[i] ?? 0;
    const moins = dico[`${nom}-`];
    const [j, w] = v < 0 && moins != null ? [moins, -v] : [dico[nom], v];
    if (j != null && j < n) inf[j] = w;
  });
  return inf;
}
