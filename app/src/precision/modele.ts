// Précision pepfit (docs/PRECISION.md, planche et P1 à P12 validée le 30/10) : ce que pepfit sait de toi pour
// calculer juste. Pur (sans base ni React Native) : tests/precision.test.ts. Réécrit le modèle de la planche
// (planches/precision/outils/modele.js) ; les poids et les formules se règlent ici, dans un seul fichier.
//
// Trois étages :
// 1. les données, chacune notée de 0 à 1 (q) selon sa présence, sa fraîcheur et sa régularité ; seule la présence compte,
//    jamais la valeur (une valeur fausse ne rapporte rien de plus qu'une vraie) ;
// 2. les calculs, chacun avec sa précision de 0 à 100 (p) ; celle de la dépense est celle d'energie-precision.ts (σ) ;
// 3. le score, moyenne pondérée des calculs qui te concernent, arrondie par défaut (84,6 s'affiche 84).
// Le gain d'une étape est le score refait avec l'action faite : le « +4 % » affiché est celui qu'on verra.

import { PRECISIONS, SEUILS_PRECISION, type Precision } from "../ecrans/energie-precision";

// ---- Les données (ce que la lecture de la base en tire, src/precision/lire.ts) ----------------------------------------

export type Naissance = "date" | "annee" | null;
/** Capteur qui a envoyé des données (jamais la connexion seule) : Whoop, Santé Connect, ou aucun. */
export type Capteur = "whoop" | "polar" | "sc" | null;
/** FC max retenue : mesurée (séance, test), saisie, d'après l'âge (Tanaka), ou aucune (valeur par défaut). */
export type SourceFcMax = "mesuree" | "saisie" | "age" | "defaut";
/** VMA retenue : test (< 182 j), courses GPS avec ou sans FC, vieux test, Uth (FC repos et FC max). */
export type SourceVma = "test" | "gpsfc" | "gps" | "vieux" | "uth" | null;
export type SourceGras = "balance" | "saisie" | null;
export type PartiePrecision = "nutrition" | "sport" | "sante";

export interface DonneesPrecision {
  naissance: Naissance;
  sexe: boolean;
  taille: boolean;
  /** Ancienneté de la dernière pesée plausible (jours), null sans pesée. */
  poidsJours: number | null;
  /** Semaines avec au moins une pesée, parmi les 4 dernières (pas une série). */
  semainesPesees: number;
  /** Ancienneté du dernier tour de taille (jours). */
  tourJours: number | null;
  /** Ancienneté du %gras estimé par les tours (méthode US Navy : taille, cou, et hanches pour une femme), null sans lui. */
  navyJours: number | null;
  grasSource: SourceGras;
  grasJours: number | null;
  capteur: Capteur;
  /** Nuits mesurées (FC de repos ou sommeil d'une montre) : les 14 derniers jours, et les 14 d'avant. */
  nuits14: number;
  nuitsAvant?: number | null;
  /** Nuits avec les heures du sommeil (Santé Connect, toute montre) : mêmes fenêtres ; la régularité s'y calcule (C8). */
  sommeil14?: number | null;
  sommeilAvant?: number | null;
  /** Jours avec des pas mesurés : mêmes fenêtres que les nuits. */
  pas14: number;
  pasAvant?: number | null;
  /** Les pas sont déjà autorisés (Santé Connect ou Whoop) : « Autorise les pas » n'a plus de sens. */
  pasAutorises?: boolean;
  /** Séances avec au moins 2 min de FC, sur 28 jours. */
  fcSeances28: number;
  fcMax: SourceFcMax;
  /** Ancienneté de la FC max mesurée (jours), null si elle n'est pas mesurée ou sans date. */
  fcMaxJours?: number | null;
  vma: SourceVma;
  /** Ancienneté de la VMA retenue (test ou courses), null sans date. */
  vmaJours?: number | null;
  /** Tu cours (une course ou un test VMA) : le test VMA est proposé. */
  court?: boolean;
  /** Semaines actives parmi les 4 dernières (une séance terminée, ou une activité détectée de 20 min). */
  semainesActives: number;
  /** Séances sur 8 semaines ; séances de muscu (null : tu ne fais pas de muscu, les 1RM ne te concernent pas). */
  seances8: number;
  muscu8: number | null;
  /** Choix appris par la reconnaissance des activités. */
  choixReco: number;
  /** Jours de repas tenus : les 30 derniers, les 30 d'avant ; et les 28 du recalage. */
  nut30: number;
  nut60: number;
  nut28: number;
  objectifPoids: boolean;
  /** Semaines de facteurs de l'Âge pepfit (le rythme en demande 26). */
  semainesHistorique: number;
  parties?: Partial<Record<PartiePrecision, boolean>>;
  /** σ relatif de la dépense d'aujourd'hui (energie-precision.ts) et σ du modèle au moment de la lecture : une étape
   * déplace le σ réel de ce qu'elle change au σ du modèle (`avecSigmaReel`). */
  sigmaReel?: number | null;
  sigmaRef?: number | null;
  /**
   * Récupération pepfit (planche recuperation) : la précision du dernier matin qui a une nuit mesurée (ses parts présentes et
   * l'âge de leur norme, recup-pepfit.ts), son ancienneté en jours (0 : ce matin) et ses parts présentes (sur 4) ; null :
   * aucune nuit cette semaine ; absente (undefined) : non lue, le calcul ne compte pas.
   */
  recup?: {
    precision: number;
    jours: number;
    parts: number;
    /** Suivi du cycle (planche cycle, § 3.4) : « ajuste » si ce matin se compare à la même phase, « attente » si le suivi est
     * allumé sans assez de cycles ou de nuits encore ; absent ou null : suivi éteint (le facteur ne se montre pas). */
    cycle?: "ajuste" | "attente" | null;
    /** Qualité des sources des nuits de la dette (planche sommeil, D17) : 1 montre, ½ téléphone ; absente : non lue. */
    qualiteSommeil?: number | null;
  } | null;
}

export type Qualites = {
  naissance: number; sexe: number; taille: number; poids: number; pesees: number; tour: number; gras: number;
  nuits: number; regularite: number; pas: number; fcSeance: number; fcMax: number; vma: number;
  semaines: number; historique: number; muscu: number | null; reco: number; nutrition: number; recalage: number;
};

/** La régularité du sommeil se mesure : Whoop (la sienne), ou 4 nuits avec leurs heures sur 14 (SRI, regularite-sommeil.ts). */
export const regulariteMesuree = (d: Pick<DonneesPrecision, "capteur" | "nuits14" | "sommeil14">): boolean =>
  (d.capteur === "whoop" && d.nuits14 >= 4) || (d.sommeil14 ?? 0) >= 4;

const borne = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lin = (x: number, x0: number, y0: number, x1: number, y1: number) => y0 + (y1 - y0) * borne((x - x0) / (x1 - x0));

/** Fraîcheur d'une mesure ponctuelle : pleine jusqu'à `plein` jours, moitié à `demi`, puis baisse jusqu'à `plancher` à un an. */
export function fraicheur(jours: number | null | undefined, plein: number, demi: number, plancher: number): number {
  if (jours == null) return 0;
  if (jours <= plein) return 1;
  if (jours <= demi) return lin(jours, plein, 1, demi, 0.5);
  return Math.max(plancher, lin(jours, demi, 0.5, 365, plancher));
}

/** Les 14 derniers jours comptent plein, les 14 d'avant à moitié (une panne de montre ne fait pas tout tomber) ; 12 = plein. */
const fenetreMontre = (recents: number, avant: number | null | undefined) => borne((recents + 0.5 * (avant ?? recents)) / 12);

export const POIDS_FC_MAX: Record<SourceFcMax, number> = { mesuree: 1, saisie: 0.8, age: 0.45, defaut: 0 };
export const POIDS_VMA: Record<Exclude<SourceVma, null>, number> = { test: 1, gpsfc: 0.75, gps: 0.55, vieux: 0.5, uth: 0.4 };

/**
 * Ancienneté des mesures datées (docs/PRECISION-AIDE.md) : pleine jusqu'à `plein` jours, moitié à `demi`, puis `plancher`.
 * Test VMA : la VMA bouge en un cycle d'entraînement (6 à 8 semaines) : plein 3 mois, moitié à 6 mois (l'ancien « vieux
 * test »), 0,1 à un an. FC max mesurée : elle ne baisse que d'environ 1 bpm par an, mais une séance à fond la retrouve :
 * pleine 6 mois, moitié à un an, jamais sous 0,5 (elle reste meilleure que la formule d'après l'âge).
 * Pesée (14 / 90 j), masse grasse (30 / 180 j), tour de taille (180 / 365 j) : dans `qualites`. La taille adulte, la date
 * de naissance et le sexe ne vieillissent pas ; les nuits, les pas et la FC au repos sont lus sur 28 jours.
 */
export const VETUSTE = {
  vma: { plein: 90, demi: 182, plancher: 0.1 },
  fcMax: { plein: 182, demi: 364, plancher: 0.5 },
  poids: { plein: 14, demi: 90, plancher: 0.2 },
  gras: { plein: 30, demi: 180, plancher: 0.3 },
  tour: { plein: 180, demi: 365, plancher: 0.25 },
} as const;
export type MesureDatee = keyof typeof VETUSTE;
const frais = (jours: number | null | undefined, m: MesureDatee) => fraicheur(jours, VETUSTE[m].plein, VETUSTE[m].demi, VETUSTE[m].plancher);
/** Une mesure datée a perdu de sa valeur (au-delà de sa durée pleine) : le tiroir propose de la refaire. */
export const vieille = (jours: number | null | undefined, m: MesureDatee) => jours != null && jours > VETUSTE[m].plein;

export function qualites(d: DonneesPrecision): Qualites {
  const naissance = d.naissance === "date" ? 1 : d.naissance === "annee" ? 0.85 : 0;
  // %gras : balance ou saisie pleine ; estimé par les tours (US Navy) à 0,6 ; frais 30 jours, moitié à 6 mois
  const gras = d.grasSource
    ? frais(d.grasJours, "gras")
    : d.navyJours != null
      ? 0.6 * frais(d.navyJours, "gras")
      : 0;
  let fcMax = POIDS_FC_MAX[d.fcMax];
  if (d.fcMax === "age" && !naissance) fcMax = 0;
  if (d.fcMax === "mesuree" && d.fcMaxJours != null) fcMax = frais(d.fcMaxJours, "fcMax");
  let vma = d.vma ? POIDS_VMA[d.vma] : 0;
  // un test VMA vieillit avec sa date (le « vieux test » de plus de 6 mois n'est plus un palier fixe)
  if ((d.vma === "test" || d.vma === "vieux") && d.vmaJours != null) vma = frais(d.vmaJours, "vma");
  if (d.vma === "uth" && !(d.nuits14 >= 7 && d.fcMax === "mesuree")) vma = 0;
  return {
    naissance,
    sexe: d.sexe ? 1 : 0,
    taille: d.taille ? 1 : 0,
    poids: frais(d.poidsJours, "poids"),
    pesees: borne(d.semainesPesees / 4),
    tour: frais(d.tourJours, "tour"),
    gras,
    nuits: fenetreMontre(d.nuits14, d.nuitsAvant),
    regularite: regulariteMesuree(d) ? 1 : 0,
    pas: fenetreMontre(d.pas14, d.pasAvant),
    fcSeance: borne(d.fcSeances28 / 4),
    fcMax,
    vma,
    semaines: borne(d.semainesActives / 4),
    historique: borne(d.seances8 / 12),
    muscu: d.muscu8 == null ? null : borne(d.muscu8 / 6),
    reco: borne(d.choixReco / 5),
    // le mois d'avant compte aux trois quarts ; 30 jours pondérés = plein
    nutrition: borne((d.nut30 + 0.75 * d.nut60) / 30),
    // recalage de la dépense sur le poids : mêmes conditions d'entrée qu'energie-precision.ts (14 jours de repas, pesées)
    recalage: d.nut28 >= 14 && d.semainesPesees >= 3 ? borne(lin(d.nut28, 14, 0.7, 24, 1)) : 0,
  };
}

// ---- Les calculs ------------------------------------------------------------------------------------------------------

/** σ relatif de la dépense → précision : σ 4 % → 100, 6 % → 85, 10 % → 65, 14 % → 40, 20 % → 0 (seuils des mots de l'Énergie). */
export function depuisSigma(s: number): number {
  const pts: [number, number][] = [[0.04, 100], [SEUILS_PRECISION.elevee, 85], [SEUILS_PRECISION.bonne, 65], [SEUILS_PRECISION.moyenne, 40], [0.2, 0]];
  if (s <= pts[0]![0]) return 100;
  for (let i = 1; i < pts.length; i++) if (s <= pts[i]![0]) return lin(s, pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1]);
  return 0;
}

/** σ du modèle (ordres de grandeur de NOTES-ENERGIE.md § 3 : rien 16 %, poids 14, profil 12, pas 9,7, recalage < 6). */
export function sigmaModele(q: Qualites): number {
  const profil = (q.naissance + q.sexe + q.taille) / 3;
  const s = 0.16 - 0.02 * q.poids - 0.02 * profil - 0.023 * q.pas - 0.008 * q.gras;
  return s - (s - 0.055) * q.recalage;
}

/** σ de la dépense : le réel (energie-precision.ts) déplacé de ce qu'une étape change au modèle ; sinon le modèle. */
export function sigmaDepense(d: DonneesPrecision, q: Qualites): number {
  const m = sigmaModele(q);
  if (d.sigmaReel == null || d.sigmaRef == null) return m;
  return Math.max(0, d.sigmaReel + m - d.sigmaRef);
}

/** Les données lues, avec le σ réel de la dépense d'aujourd'hui (σ ÷ dépense). */
export function avecSigmaReel(d: DonneesPrecision, sigmaRel: number | null): DonneesPrecision {
  return sigmaRel == null || !Number.isFinite(sigmaRel) ? { ...d, sigmaReel: null, sigmaRef: null } : { ...d, sigmaReel: sigmaRel, sigmaRef: sigmaModele(qualites(d)) };
}

export type IdCalcul = "depense" | "objectifs" | "bilan" | "zones" | "effort" | "vo2" | "age" | "composition" | "sommeil" | "recup" | "rm" | "reco";

/** L'âge du dernier matin de la Récupération : plein ce matin, puis un quart de moins par jour (rien au bout de 4 jours). */
export const fraicheurRecup = (jours: number): number => Math.max(0, 1 - 0.25 * Math.max(0, jours));

export interface DefCalcul {
  id: IdCalcul;
  partie: PartiePrecision;
  poids: number;
  p: (q: Qualites, d: DonneesPrecision) => number | null;
}

export const CALCULS: readonly DefCalcul[] = [
  { id: "depense", partie: "sante", poids: 18, p: (q, d) => depuisSigma(sigmaDepense(d, q)) },
  // % de gras connu (et frais) : Katch-McArdle et protéines sur la masse maigre (docs/OBJECTIF-GRAS.md)
  { id: "objectifs", partie: "nutrition", poids: 8, p: (q) => 100 * ((0.5 * (q.naissance + q.sexe + q.taille + q.poids)) / 4 + 0.1 * q.gras + 0.4 * q.recalage) },
  { id: "bilan", partie: "nutrition", poids: 12, p: (q) => 100 * (0.6 * q.nutrition + 0.4 * q.pesees) },
  { id: "zones", partie: "sport", poids: 8, p: (q) => 100 * (0.55 * q.fcMax + 0.45 * q.nuits) },
  { id: "effort", partie: "sport", poids: 8, p: (q) => 100 * (0.5 * q.fcSeance + 0.2 * q.nuits + 0.15 * q.poids + 0.15 * q.sexe) },
  { id: "vo2", partie: "sport", poids: 8, p: (q) => 100 * (0.75 * q.vma + 0.15 * q.naissance + 0.1 * q.sexe) },
  {
    id: "age",
    partie: "sante",
    poids: 14,
    // facteurs d'age-calc.ts pondérés par leur poids dans l'âge (FC repos 22, durée du sommeil 12, régularité 6, pas 15,
    // temps en zones 13, muscu 10, VO2max 15, masse maigre 7) ; sans date de naissance, rien
    p: (q) =>
      100 * q.naissance * (0.22 * q.nuits + 0.12 * q.nuits + 0.06 * q.regularite + 0.15 * q.pas + 0.13 * q.fcSeance * q.semaines + 0.1 * q.semaines + 0.15 * q.vma + 0.07 * q.gras),
  },
  { id: "composition", partie: "sante", poids: 8, p: (q) => 100 * (0.3 * q.poids + 0.2 * q.pesees + 0.3 * q.gras + 0.2 * q.tour) },
  // le sommeil (planche sommeil, D17) : les nuits comptées à la qualité de leur source (une nuit du téléphone vaut ½)
  { id: "sommeil", partie: "sante", poids: 7, p: (q, d) => 100 * (0.75 * q.nuits * (d.recup?.qualiteSommeil ?? 1) + 0.25 * q.regularite) },
  // la Récupération : les données de son dernier matin (poids présents × qualité de leur norme) et leur âge
  { id: "recup", partie: "sante", poids: 7, p: (_q, d) => (d.recup === undefined ? null : d.recup ? d.recup.precision * fraicheurRecup(d.recup.jours) : 0) },
  { id: "rm", partie: "sport", poids: 5, p: (q) => (q.muscu == null ? null : 100 * q.muscu) },
  { id: "reco", partie: "sport", poids: 4, p: (q) => 100 * (0.7 * q.reco + 0.3 * q.historique) },
];

/** Mot d'une précision de 0 à 100 : ceux de l'Énergie ; faible sous 40, moyenne de 40 à 64, bonne de 65 à 84, élevée dès 85. */
export const SEUILS_MOTS: Record<Precision, number> = { faible: 0, moyenne: 40, bonne: 65, elevee: 85 };
export function niveau(p: number): Precision {
  for (let i = PRECISIONS.length - 1; i >= 0; i--) if (p >= SEUILS_MOTS[PRECISIONS[i]!]) return PRECISIONS[i]!;
  return "faible";
}
/** Le mot suivant et son seuil, null au plus haut. */
export function niveauSuivant(p: number): { niveau: Precision; min: number } | null {
  const n = PRECISIONS.find((x) => SEUILS_MOTS[x] > p);
  return n ? { niveau: n, min: SEUILS_MOTS[n] } : null;
}

// ---- Les caps et les lectures qu'ils ouvrent --------------------------------------------------------------------------

export type IdCap = "esquisse" | "contour" | "portrait" | "relief" | "surMesure";
export interface Cap {
  n: 1 | 2 | 3 | 4 | 5;
  id: IdCap;
  min: number;
}
export const CAPS: readonly Cap[] = [
  { n: 1, id: "esquisse", min: 0 },
  { n: 2, id: "contour", min: 20 },
  { n: 3, id: "portrait", min: 40 },
  { n: 4, id: "relief", min: 65 },
  { n: 5, id: "surMesure", min: 85 },
];
/** Un cap atteint se garde tant que le score ne descend pas 5 points sous son seuil. */
export const MARGE_CAP = 5;
/** Une lecture ouverte reste ouverte tant que son calcul ne perd pas plus de 10 points sous son seuil. */
export const MARGE_LECTURE = 10;

export const capDe = (score: number): Cap => [...CAPS].reverse().find((c) => score >= c.min) ?? CAPS[0]!;
export const capN = (n: number): Cap => CAPS[Math.max(0, Math.min(4, n - 1))]!;

/** Cap retenu : celui du score, ou le cap déjà atteint tant que le score reste à moins de 5 points sous son seuil. */
export function capRetenu(score: number, capAvant: number | null | undefined): Cap {
  const c = capDe(score);
  if (capAvant == null || capAvant <= c.n) return c;
  for (let n = capAvant; n > c.n; n--) if (score >= capN(n).min - MARGE_CAP) return capN(n);
  return c;
}

export type IdLecture = "objectifsPerso" | "zonesReserve" | "age" | "vo2" | "rythme" | "masses" | "arrivee" | "liens";

export interface DefLecture {
  id: IdLecture;
  cap: Cap["n"];
  /** Seuil de son propre calcul (Âge ≥ 60, VO2max ≥ 50), avec la marge de 10 points une fois ouverte. */
  seuil?: { calcul: IdCalcul; min: number };
  /** Les autres conditions de ses données. */
  ok: (q: Qualites, p: Partial<Record<IdCalcul, number | null>>, d: DonneesPrecision) => boolean;
}

const nuits28 = (d: DonneesPrecision) => d.nuits14 + (d.nuitsAvant ?? d.nuits14);

export const LECTURES: readonly DefLecture[] = [
  { id: "objectifsPerso", cap: 2, ok: (q) => !!(q.naissance && q.sexe && q.taille && q.poids > 0) },
  { id: "zonesReserve", cap: 3, ok: (q, _p, d) => nuits28(d) >= 7 && q.fcMax >= 0.45 },
  { id: "age", cap: 3, seuil: { calcul: "age", min: 60 }, ok: () => true },
  { id: "vo2", cap: 3, seuil: { calcul: "vo2", min: 50 }, ok: () => true },
  { id: "rythme", cap: 4, seuil: { calcul: "age", min: 60 }, ok: (_q, _p, d) => d.semainesHistorique >= 26 },
  { id: "masses", cap: 4, ok: (q) => q.gras >= 0.5 && q.pesees >= 0.5 },
  { id: "arrivee", cap: 4, ok: (q, _p, d) => d.objectifPoids && q.pesees >= 0.75 },
  { id: "liens", cap: 5, ok: (q) => q.nutrition >= 0.6 && q.nuits >= 0.7 && q.semaines >= 0.75 },
];

// ---- Le score ---------------------------------------------------------------------------------------------------------

export interface CalculEvalue {
  id: IdCalcul;
  partie: PartiePrecision;
  poids: number;
  /** Précision arrondie (0 à 100), null : ne te concerne pas (pas de muscu). */
  valeur: number | null;
  brut: number | null;
  /** Compté dans le score (sa partie est allumée et il te concerne). */
  actif: boolean;
}

export interface EtatLecture {
  id: IdLecture;
  cap: Cap["n"];
  capAtteint: boolean;
  donneesOk: boolean;
  ouverte: boolean;
}

export interface Resultat {
  q: Qualites;
  p: Record<IdCalcul, number | null>;
  calculs: CalculEvalue[];
  brut: number;
  /** Arrondi par défaut. */
  score: number;
  cap: Cap;
  suivant: Cap | null;
  lectures: EtatLecture[];
}

export function calculer(d: DonneesPrecision, memoire?: { cap?: number | null; lectures?: readonly string[] }): Resultat {
  const q = qualites(d);
  const parties = { nutrition: true, sport: true, sante: true, ...d.parties };
  const p = {} as Record<IdCalcul, number | null>;
  const calculs: CalculEvalue[] = [];
  let somme = 0;
  let poids = 0;
  for (const c of CALCULS) {
    const v = c.p(q, d);
    const actif = v != null && parties[c.partie] !== false;
    p[c.id] = v == null ? null : Math.round(v);
    if (actif) {
      somme += c.poids * v;
      poids += c.poids;
    }
    calculs.push({ id: c.id, partie: c.partie, poids: c.poids, valeur: p[c.id], brut: v, actif });
  }
  const brut = poids ? somme / poids : 0;
  const score = Math.floor(brut + 1e-9);
  const cap = capRetenu(score, memoire?.cap);
  const avant = new Set(memoire?.lectures ?? []);
  const lectures = LECTURES.map((l) => {
    const capAtteint = cap.n >= l.cap;
    const v = l.seuil ? (p[l.seuil.calcul] ?? 0) : 0;
    const seuilOk = !l.seuil || v >= l.seuil.min || (avant.has(l.id) && v >= l.seuil.min - MARGE_LECTURE);
    const donneesOk = seuilOk && l.ok(q, p, d);
    return { id: l.id, cap: l.cap, capAtteint, donneesOk, ouverte: capAtteint && donneesOk };
  });
  return { q, p, calculs, brut, score, cap, suivant: CAPS.find((c) => c.min > score) ?? null, lectures };
}

export const lecture = (r: Resultat, id: IdLecture): EtatLecture => r.lectures.find((l) => l.id === id)!;

// ---- Les étapes : le gain se calcule en refaisant le score avec l'action faite --------------------------------------

export type IdAction =
  | "profil" | "naissance" | "sexe" | "taille" | "pesee" | "tour" | "capteur" | "nuits" | "pas" | "fcseance" | "semaines" | "repas" | "pesees" | "vma" | "gras"
  | "fcmax" | "reco" | "muscu";

export interface DefAction {
  id: IdAction;
  /** Deux actions d'un même groupe nourrissent la même donnée : seule la meilleure est proposée. */
  groupe?: "gras";
  /** Jours qu'il faut pour en voir le gain (0 : tout de suite). */
  delai: number;
  /** Peine relative (rang = gain ÷ peine). */
  effort?: number;
  /** Proposée seulement dans le tiroir d'un calcul, pas dans les prochaines étapes de la page (docs/PRECISION-AIDE.md). */
  tiroir?: true;
  si: (d: DonneesPrecision) => boolean;
  fait: (d: DonneesPrecision) => DonneesPrecision;
}

const manquesProfil = (d: DonneesPrecision) =>
  [d.naissance !== "date", !d.sexe, !d.taille, d.poidsJours == null || d.poidsJours > 14].filter(Boolean).length;
const navyApres = (d: DonneesPrecision) => (d.sexe && d.taille ? 0 : d.navyJours);

export const ACTIONS: readonly DefAction[] = [
  {
    id: "profil", delai: 0, si: (d) => manquesProfil(d) >= 2,
    fait: (d) => ({ ...d, naissance: "date", sexe: true, taille: true, poidsJours: 0, semainesPesees: Math.max(d.semainesPesees, 1) }),
  },
  { id: "naissance", delai: 0, si: (d) => manquesProfil(d) < 2 && d.naissance !== "date", fait: (d) => ({ ...d, naissance: "date" }) },
  { id: "sexe", delai: 0, si: (d) => manquesProfil(d) < 2 && !d.sexe, fait: (d) => ({ ...d, sexe: true }) },
  { id: "taille", delai: 0, si: (d) => manquesProfil(d) < 2 && !d.taille, fait: (d) => ({ ...d, taille: true }) },
  {
    id: "pesee", delai: 0, si: (d) => manquesProfil(d) < 2 && (d.poidsJours == null || d.poidsJours > 14),
    fait: (d) => ({ ...d, poidsJours: 0, semainesPesees: Math.max(d.semainesPesees, 1) }),
  },
  {
    id: "tour", groupe: "gras", delai: 0, effort: 1.5, si: (d) => d.tourJours == null || d.tourJours > 180,
    fait: (d) => ({ ...d, tourJours: 0, navyJours: navyApres(d) }),
  },
  {
    id: "capteur", delai: 14, si: (d) => !d.capteur,
    fait: (d) => ({
      ...d, capteur: "sc", nuits14: 12, pas14: 14, pasAutorises: true, fcSeances28: Math.min(4, d.seances8 / 2),
      fcMax: d.fcMax === "defaut" || d.fcMax === "age" ? "mesuree" : d.fcMax,
    }),
  },
  { id: "nuits", delai: 14, si: (d) => !!d.capteur && d.nuits14 < 10, fait: (d) => ({ ...d, nuits14: 14 }) },
  { id: "pas", delai: 0, si: (d) => !d.pasAutorises && d.pas14 < 7, fait: (d) => ({ ...d, pas14: 14, pasAutorises: true }) },
  {
    id: "fcseance", delai: 28, si: (d) => !!d.capteur && d.fcSeances28 < 4,
    fait: (d) => ({ ...d, fcSeances28: 4, fcMax: d.fcMax === "saisie" ? "saisie" : "mesuree" }),
  },
  { id: "semaines", delai: 28, si: (d) => d.semainesActives < 4, fait: (d) => ({ ...d, semainesActives: 4, seances8: Math.max(d.seances8, 8) }) },
  {
    id: "repas", delai: 30, si: (d) => d.parties?.nutrition !== false && d.nut30 + 0.75 * d.nut60 < 27,
    fait: (d) => ({ ...d, nut30: 30, nut28: 28 }),
  },
  { id: "pesees", delai: 28, si: (d) => d.semainesPesees < 4, fait: (d) => ({ ...d, semainesPesees: 4, poidsJours: 0 }) },
  {
    id: "vma", delai: 0, effort: 3, si: (d) => !!d.court && (d.vma !== "test" || vieille(d.vmaJours, "vma")),
    fait: (d) => ({ ...d, vma: "test", vmaJours: 0 }),
  },
  {
    id: "gras", groupe: "gras", delai: 0, effort: 2, si: (d) => !d.grasSource || (d.grasJours ?? 0) > 30,
    fait: (d) => ({ ...d, grasSource: "saisie", grasJours: 0 }),
  },
  // FC max d'après l'âge, par défaut, ou mesurée il y a longtemps : la saisir (ta valeur d'un test d'effort) dans les zones
  {
    id: "fcmax", delai: 0, effort: 2, tiroir: true, si: (d) => d.fcMax === "age" || d.fcMax === "defaut" || (d.fcMax === "mesuree" && vieille(d.fcMaxJours, "fcMax")),
    fait: (d) => (d.fcMax === "mesuree" ? { ...d, fcMaxJours: 0 } : { ...d, fcMax: "saisie", fcMaxJours: null }),
  },
  // choisir le sport de tes activités détectées : 5 choix appris donnent le plein
  { id: "reco", delai: 14, tiroir: true, si: (d) => d.choixReco < 5, fait: (d) => ({ ...d, choixReco: 5 }) },
  { id: "muscu", delai: 28, tiroir: true, si: (d) => d.muscu8 != null && d.muscu8 < 6, fait: (d) => ({ ...d, muscu8: 6 }) },
];

export interface Etape {
  id: IdAction;
  delai: number;
  /** Gain brut (points de score, ou de précision du calcul pour `etapesCalcul`). */
  gain: number;
  /** Gain affiché : différence des scores affichés (jamais arrondi à la hausse). */
  affiche: number;
}

const seulMeilleurDuGroupe = <T extends { id: IdAction }>(l: T[]) =>
  l.filter((a, i) => {
    const g = ACTIONS.find((x) => x.id === a.id)?.groupe;
    return !g || l.findIndex((b) => ACTIONS.find((x) => x.id === b.id)?.groupe === g) === i;
  });

/** Toutes les étapes qui rapportent au moins un point, de la meilleure (gain ÷ peine) à la moins bonne. */
export function toutesEtapes(d: DonneesPrecision): Etape[] {
  const base = calculer(d);
  const l = ACTIONS.filter((a) => !a.tiroir && a.si(d))
    .map((a) => {
      const apres = calculer(a.fait(d));
      const gain = apres.brut - base.brut;
      return { id: a.id, delai: a.delai, gain, affiche: apres.score - base.score, rang: gain / (a.effort ?? (a.delai ? 3 : 1)) };
    })
    .filter((a) => a.gain >= 1)
    .sort((a, b) => b.rang - a.rang);
  return seulMeilleurDuGroupe(l).map(({ rang: _r, ...e }) => e);
}

/** Les prochaines étapes de la page : les immédiates d'abord, puis celles qui prennent des semaines. */
export function etapes(d: DonneesPrecision, n = 3): Etape[] {
  const e = toutesEtapes(d).slice(0, 6);
  return [...e.filter((a) => !a.delai), ...e.filter((a) => a.delai)].slice(0, n);
}

/** Le gain le plus rapide (carte du volet) : la meilleure étape immédiate, sinon la meilleure. */
export function etapeRapide(d: DonneesPrecision): Etape | null {
  const e = toutesEtapes(d).slice(0, 6);
  return e.find((a) => !a.delai) ?? e[0] ?? null;
}

/** Seuil pour qu'une étape figure dans la feuille d'un calcul (au-dessous, elle ne change pas le mot). */
export const GAIN_MIN_CALCUL = 2;

/** Étapes d'un seul calcul (feuille de l'indicateur mini) : gain du calcul, au moins 2 points, les immédiates d'abord. */
export function etapesCalcul(d: DonneesPrecision, id: IdCalcul, n = 3): Etape[] {
  const base = calculer(d).p[id] ?? 0;
  const l = ACTIONS.filter((a) => a.si(d))
    .map((a) => {
      const apres = calculer(a.fait(d)).p[id] ?? 0;
      return { id: a.id, delai: a.delai, gain: apres - base, affiche: apres - base };
    })
    .filter((a) => a.gain >= GAIN_MIN_CALCUL)
    .sort((a, b) => b.gain - a.gain);
  const e = seulMeilleurDuGroupe(l);
  return [...e.filter((a) => !a.delai), ...e.filter((a) => a.delai)].slice(0, n);
}

/** La meilleure étape qui améliore la dépense : le conseil de l'Énergie (une seule source pour la page et la feuille). */
export const conseilDepense = (d: DonneesPrecision): IdAction | null => etapesCalcul(d, "depense", 1)[0]?.id ?? null;
