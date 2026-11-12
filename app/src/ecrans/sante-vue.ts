// Valeurs de l'écran Santé reliées au corps : une case n'existe que si la donnée existe (rien d'inventé). Sans React Native.
import { locale, t } from "../i18n/index";
import { POLICE_MAX } from "../theme/typo";
import { ANCRES, LARGEUR_ANCRES, lisiereAme, yCorps } from "../ui/3d/verre";
import { fixe } from "./composition-vue";
import { nombre, versUnite, type Unite } from "./format";
import { imcDe } from "./morphologie-calc";
import type { Morphologie } from "./morphologie";
import type { NiveauPoint } from "./mesures/niveau-point";

/** Ce que Santé Connect donne (null : pas d'autorisation, pas de donnée). */
export interface DonneesSante {
  sommeilMin: number | null;
  /** Performance de la nuit (sommeil ÷ besoin, %) : seulement si une source donne le besoin. */
  performance?: number | null;
  /** VFC (RMSSD, ms), la plus récente. */
  vfc?: number | null;
  fcRepos: number | null;
  pas: number | null;
  /** % de masse grasse, le plus récent. */
  gras?: number | null;
  /** Point de couleur de la nuit (sommeil, VFC, FC au repos). */
  points?: Partial<Record<"sommeil" | "vfc" | "fc", NiveauPoint>>;
}

export type IdCase = "sommeil" | "age" | "poids" | "pas" | "vfc" | "fc" | "gras";

export interface Place {
  cote: "g" | "d";
  /** Haut de la case dans la zone du corps (dp). */
  y: number;
  largeur: number;
  /** Point du corps relié : fraction de la taille et décalage horizontal (part de 412 dp, depuis l'axe). */
  ancre: { f: number; dx: number };
  /** Le trait part du bas de la case (à 20 dp de son bord intérieur) au lieu de son bord : la case de l'Âge pepfit, dont le
   * trait frôlerait sinon la tête. */
  depart?: "bas";
  /** Hauteur (dp) : 62, ou 50 pour chaque moitié d'un bloc de deux cases (× l'échelle de police, jusqu'à 1,3). */
  hauteur: number;
  /** Moitié d'un bloc de deux cases collées (Poids · Masse grasse, VFC · FC repos) : « haut » porte le trait, « bas » se colle dessous. */
  double?: "haut" | "bas";
}

export interface CaseSante extends Place {
  id: IdCase;
  libelle: string;
  valeur: string;
  unite: string | null;
  /** Texte plus petit après la valeur (réservé : plus utilisé depuis Social v4, la durée du sommeil est à côté du libellé). */
  suite: string | null;
  /** Texte à côté du libellé, en gras : la durée du sommeil (« Sommeil 7 h 12 ») quand la case montre sa performance. */
  aCote?: string;
  /** Ouvre un écran (chevron). */
  ouvre: boolean;
  /** Vignette sans donnée (Sommeil d'un jour sans nuit lue) : « Pas de donnée » en petit, elle ouvre quand même la page. */
  vide?: boolean;
  /** Point de couleur après le libellé (sommeil, VFC, FC au repos). */
  point?: NiveauPoint;
  /** Âge pepfit : écart à l'âge réel (années, négatif = plus jeune), écrit signé dans la couleur du sens. */
  ecart?: number;
}

export const CASE = { largeur: 112, large: 150, hauteur: 62, marge: 16, ecart: 12, demi: 50 } as const;

/** Haut des bras (fraction de la taille) : les épaules et les bras en pose de Vitruve commencent là, au-dessus il n'y a que
 * la tête et le cou (mesuré sur le maillage, tests/sante-pose.test.ts). */
export const HAUT_DES_BRAS = 0.87;

/** Bas des bras (fraction de la taille) : en pose de Vitruve, bras à l'horizontale, les mains et les deltoïdes descendent
 * jusque-là ; les cases du bas commencent dessous (mesuré sur l'homme B et la femme, tests/sante-pose.test.ts). */
export const SOUS_LES_BRAS = 0.74;

/** Demi-largeur (dp) de la tête et du cou, balancement compris, et du corps sous les bras : les cases restent à côté. */
const DEMI_TETE = 22;
const DEMI_CORPS = 46;
/** Haut des cases du haut dans la zone ; vide entre elles et les bras (ou le corps), et sous les pieds. */
const HAUT = 10;
const AIR = 8;
const SOUS_LES_PIEDS = 4;

export type IdPlace = Exclude<IdCase, "pas">;

/** Où va chaque case de l'écran Moi, comptée depuis le haut de la zone montrée (le personnage y est remonté de `decalage`). */
export interface Disposition {
  /** dp dont le personnage est remonté : le haut de sa zone (vide au-dessus de la tête) est rogné. */
  decalage: number;
  /** Hauteur de la zone montrée : du haut des cartes du haut à 4 dp sous les pieds. L'Énergie vient juste dessous. */
  hauteur: number;
  /** Chaque case seule (une moitié de bloc manque, ou sa donnée). */
  seules: Record<IdPlace, Place>;
  /** Blocs de deux moitiés collées, miroirs l'un de l'autre : Poids · Masse grasse à gauche, VFC · FC repos à droite. */
  blocs: { gauche: { haut: Place; bas: Place }; droite: { haut: Place; bas: Place } };
}

/**
 * Disposition de l'écran Moi (planche Moi v4, décision du 4/11, corrigée le 5/11) : tout est calculé depuis la
 * hauteur du personnage, rien n'est figé. Sa taille à l'écran ne change pas : c'est la zone qui est rognée au-dessus de la tête.
 * - Sommeil à gauche et l'Âge pepfit à droite, en haut, de part et d'autre de la tête ; le personnage est remonté jusqu'à ce que
 *   le haut de ses bras tienne à `AIR` sous elles, jamais dessous. Plus la police est grande (cases plus hautes), moins il monte.
 * - Sous les bras, de part et d'autre du torse et des hanches, deux blocs de même hauteur et de même niveau, haut contre haut :
 *   à gauche Poids puis Masse grasse collés, à droite VFC puis FC repos collés (une case seule garde sa hauteur).
 * - La zone s'arrête sous les pieds : l'Énergie suit avec la marge régulière de l'appli.
 * `largeur` : celle de la colonne (dp) ; les cases se resserrent quand l'écran est étroit, jamais sur la tête ni sur le corps.
 * `echelleTexte` : échelle de police du système (plafonnée comme Texte).
 */
export function dispositionMoi(tailleCm: number, largeur: number = LARGEUR_ANCRES, echelleTexte = 1): Disposition {
  const ec = Math.min(POLICE_MAX, Math.max(1, echelleTexte));
  const hCase = Math.ceil(CASE.hauteur * ec);
  const hDemi = Math.ceil(CASE.demi * ec);
  const decalage = Math.max(0, Math.round(yCorps(HAUT_DES_BRAS, tailleCm) - (HAUT + hCase + AIR)));
  const demi = Math.floor(largeur / 2);
  const haute = Math.max(104, Math.min(CASE.large, demi - CASE.marge - DEMI_TETE - AIR));
  const basse = Math.max(96, Math.min(CASE.largeur, demi - DEMI_CORPS - AIR - CASE.marge));
  // les lignes du bas commencent sous les bras, et sous les cases du haut quand le personnage est tout en haut
  const r0 = Math.ceil(yCorps(SOUS_LES_BRAS, tailleCm)) + 6 - decalage;
  const p = (cote: "g" | "d", y: number, ancre: Place["ancre"], largeur: number, hauteur: number, double?: Place["double"]): Place => ({
    cote,
    y: Math.round(y),
    largeur,
    ancre,
    hauteur,
    ...(double ? { double } : {}),
  });
  // les ancres des blocs : leur jonction regarde la taille et les hanches (gauche), le cœur (droite)
  const ancreGauche = { f: 0.55, dx: -0.07 };
  const ancreDroite = { f: 0.69, dx: 0.065 };
  return {
    decalage,
    hauteur: Math.ceil(yCorps(0, tailleCm)) + SOUS_LES_PIEDS - decalage,
    seules: {
      sommeil: p("g", HAUT, { f: ANCRES.tete, dx: -0.03 }, haute, hCase),
      age: { ...p("d", HAUT, { ...lisiereAme(tailleCm) }, haute, hCase), depart: "bas" },
      poids: p("g", r0, { f: ANCRES.hanches, dx: -0.07 }, basse, hCase),
      gras: p("g", r0, { f: ANCRES.taille, dx: -0.05 }, basse, hCase),
      vfc: p("d", r0, { f: ANCRES.torse, dx: 0.075 }, basse, hCase),
      fc: p("d", r0, { f: 0.665, dx: 0.055 }, basse, hCase),
    },
    blocs: {
      gauche: { haut: p("g", r0, ancreGauche, basse, hDemi, "haut"), bas: p("g", r0 + hDemi, ancreGauche, basse, hDemi, "bas") },
      droite: { haut: p("d", r0, ancreDroite, basse, hDemi, "haut"), bas: p("d", r0 + hDemi, ancreDroite, basse, hDemi, "bas") },
    },
  };
}

/** 432 min → « 7 h 12 » (minutes sur deux chiffres). */
export function dureeSommeil(minutes: number): string {
  const m = Math.round(minutes);
  return t("sante.duree", { h: Math.floor(m / 60), m: String(m % 60).padStart(2, "0") });
}

/** 180 → « 1,80 m » */
export function tailleEnMetres(cm: number): string {
  return t("sante.metres", { valeur: new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cm / 100) });
}

/** Les cases dont la donnée existe, dans l'ordre de lecture. `age` : l'Âge pepfit de la semaine (null : pas d'âge, pas de
 * case ni d'âme ; « bientot » : la lecture attend que son calcul soit sûr, précision pepfit, la case dit « Bientôt »).
 * `dispo` : la disposition de l'écran (dispositionMoi), calculée avec la taille du corps dessiné. */
export function casesSante(
  m: Morphologie | null,
  d: DonneesSante | null,
  unite: Unite,
  age: { age: number; ecart: number } | "bientot" | null = null,
  dispo: Disposition = dispositionMoi(m?.tailleCm ?? 180),
): CaseSante[] {
  // deux cases d'une même colonne se collent en un bloc ; une seule garde sa place et sa hauteur
  const bloc = (haut: IdPlace, bas: IdPlace, ok: [boolean, boolean], b: Disposition["blocs"]["gauche"]): Partial<Record<IdPlace, Place>> =>
    ok[0] && ok[1] ? { [haut]: b.haut, [bas]: b.bas } : {};
  const place: Record<IdPlace, Place> = {
    ...dispo.seules,
    ...bloc("poids", "gras", [m?.poidsKg != null, d?.gras != null], dispo.blocs.gauche),
    ...bloc("vfc", "fc", [d?.vfc != null, d?.fcRepos != null], dispo.blocs.droite),
  };
  const sortie: CaseSante[] = [];
  const ajoute = (id: IdPlace, valeur: string, u: string | null, ouvre: boolean, suite: string | null = null) =>
    sortie.push({ id, libelle: t(`sante.${id}` as "sante.sommeil"), valeur, unite: u, suite, ouvre, ...place[id], point: d?.points?.[id as "vfc"] });
  if (d?.sommeilMin != null && d.sommeilMin > 0) {
    // D14 : « 43 % » avec la durée « 4 h 37 » à côté du libellé (planche Moi v4, retour du 4/11) quand une source
    // donne la performance, sinon la durée seule en valeur
    if (d.performance != null) {
      ajoute("sommeil", `${nombre(d.performance, 0)} %`, null, true);
      sortie[sortie.length - 1]!.aCote = dureeSommeil(d.sommeilMin);
    } else ajoute("sommeil", dureeSommeil(d.sommeilMin), null, true);
  } else if (d) {
    // la lecture est faite et n'a rien rendu : la vignette reste, pour ouvrir la page Sommeil (jamais de trou) ; tant que
    // la lecture n'est pas faite (d nul), rien ne s'affiche : pas de vignette qui clignote
    ajoute("sommeil", t("mesures.pasDeDonnee"), null, true);
    sortie[sortie.length - 1]!.vide = true;
  }
  if (age === "bientot") sortie.push({ id: "age", libelle: t("age.titre"), valeur: t("precision.attente.bientot"), unite: null, suite: null, ouvre: true, ...place.age });
  else if (age) sortie.push({ id: "age", libelle: t("age.titre"), valeur: nombre(age.age, 1), unite: t("cartes.ans"), suite: null, ouvre: true, ...place.age, ecart: age.ecart });
  // poids à une décimale, comme la page Poids et l'Accueil (D2 de la revue finale : « 78,0 kg »)
  if (m?.poidsKg != null) ajoute("poids", fixe(versUnite(m.poidsKg, unite), 1), unite, true);
  // Pas : plus de case sur le corps (Social v4), la rangée Récupération · Pas · Effort sous le semainier l'ouvre
  if (d?.vfc != null) ajoute("vfc", nombre(d.vfc, 0), t("sante.ms"), true);
  if (d?.fcRepos != null) ajoute("fc", nombre(d.fcRepos, 0), t("sante.bpm"), true);
  if (d?.gras != null) ajoute("gras", fixe(d.gras, 1), "%", true);
  return sortie;
}

/** À droite de la ligne « Aujourd'hui » : taille et IMC, seulement ceux qu'on connaît (le sexe est dit par le personnage). Vide sinon. */
export function resumeSante(m: Morphologie | null): string {
  if (!m) return "";
  const parts: string[] = [];
  if (m.tailleCm != null) parts.push(tailleEnMetres(m.tailleCm));
  const imc = imcDe(m.poidsKg, m.tailleCm);
  if (imc != null) parts.push(t("sante.imcCourt", { valeur: nombre(imc, 1) }));
  return parts.join(", ");
}
