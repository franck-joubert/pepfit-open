// Clavier de séance (planche clavier-seance, validée le 29/10) : le clavier numérique de pepfit pour les cases de série,
// à la place de celui du téléphone. Ici : la saisie au pavé (pur, testé par tests/clavier-seance.test.ts), les valeurs de
// la molette au pas de la case, et l'état partagé entre la case qui a le focus et le clavier (comme bande.ts) : le champ
// actif, les cases inscrites dans l'ordre de la séance (Valider passe à la suivante) et le défilement qui la garde visible.
import { useSyncExternalStore } from "react";
import type { ChampSerie } from "../db/natures";
import { chiffresTemps, lireNombre, lireTemps, masqueTemps, nombre, tempsTexte, type Unite } from "./format";
import type { InfoCharge } from "./charge-seance";

export type Touche = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "decimal" | "effacer";

/** Texte en saisie ; `remplacer` : la première touche remplace la valeur (comme la sélection au focus d'avant). */
export interface Saisie {
  texte: string;
  remplacer: boolean;
}

/** Séparateur décimal de la langue (« , » en français, « . » en anglais). */
export const separateur = () => nombre(1.5, 1).replace(/\d/g, "") || ".";

/** Chiffres au plus, avant et après la virgule (sans champ : l'ancienne borne de 6 chiffres). */
export interface Limite {
  entiers: number;
  decimales: number;
}

/**
 * Ce qu'une case accepte (31/10 : « limiter les reps à 3 chiffres ») : 999 répétitions, 9 999,5 kg (ou lbs),
 * 999 999 m ; le temps garde son masque de 6 chiffres (99:59:59). Au-delà, la touche est refusée.
 */
export const LIMITES: Record<ChampSerie, Limite> = {
  reps: { entiers: 3, decimales: 0 },
  kg: { entiers: 4, decimales: 1 },
  distance_m: { entiers: 6, decimales: 1 },
  duree_s: { entiers: 6, decimales: 0 },
};
const SANS_CHAMP: Limite = { entiers: 6, decimales: 6 };

/**
 * Une touche du pavé. Décimale : seulement si la case l'accepte (`decimal`) et une seule fois (« 0, » sur une case vide).
 * Temps : les chiffres remplissent le masque de droite à gauche (« 127 » → 1:27), comme la saisie au clavier d'avant.
 * Une touche refusée (limite de la case `champ` atteinte) rend la saisie telle quelle : le même objet.
 */
export function toucher(s: Saisie, touche: Touche, o: { decimal: boolean; temps: boolean; sep?: string; champ?: ChampSerie }): Saisie {
  const limite = o.champ ? LIMITES[o.champ] : SANS_CHAMP;
  const sep = o.sep ?? separateur();
  const base = s.remplacer ? "" : s.texte;
  if (o.temps) {
    const c = chiffresTemps(base);
    if (touche === "effacer") return { texte: masqueTemps(c.slice(0, -1)), remplacer: false };
    if (touche === "decimal") return s;
    if (c.length >= Math.min(limite.entiers, 6)) return s;
    return { texte: masqueTemps(chiffresTemps(c + touche)), remplacer: false };
  }
  if (touche === "effacer") return { texte: base.slice(0, -1), remplacer: false };
  if (touche === "decimal") {
    if (!o.decimal || /[.,]/.test(base)) return { ...s, remplacer: false, texte: base };
    return { texte: `${base || "0"}${sep}`, remplacer: false };
  }
  const [entiers = "", decimales] = base.split(/[.,]/);
  if (decimales != null ? decimales.length >= limite.decimales : entiers.length >= limite.entiers) return s;
  // Un 0 seul en tête est remplacé (« 07 » n'a pas de sens), pas « 0, ».
  return { texte: base === "0" ? touche : base + touche, remplacer: false };
}

/** Listes régulières de la molette, faites une fois (le clavier les redemande à chaque chiffre) ; à ne pas modifier. */
const listesMolette = new Map<string, number[]>();

/** Le pas de la molette d'une case : 2,5 kg (5 lbs) ou les paliers du lieu (dans l'unité de la case), 1 répétition, 5 s, 100 m. */
export function valeursMolette(
  champ: ChampSerie,
  valeur: number | null,
  o: { unite?: Unite; paliers?: readonly number[] | null } = {},
): { valeurs: number[]; indice: number } {
  const regulier = (pas: number, max: number) => {
    const cle = `${pas}-${max}`;
    let l = listesMolette.get(cle);
    if (!l) listesMolette.set(cle, (l = Array.from({ length: Math.round(max / pas) + 1 }, (_, i) => Math.round(i * pas * 100) / 100)));
    return l;
  };
  // Deux étendues seulement : la courante, ou la grande dès que la valeur la dépasse ; au-delà de la grande, la molette reste
  // sur sa dernière ligne (la case garde la valeur). Avant le 31/10, elle s'allongeait jusqu'à la valeur tapée : chaque
  // chiffre au-delà de 100 répétitions refaisait la liste (jusqu'à 1 001 lignes), ses crans et ses interpolations, et la
  // molette laguait. Une liste par étendue, gardée : la même d'un chiffre à l'autre (docs/ALERTE-REPS.md).
  const jusqua = (defaut: number, plafond: number) => ((valeur ?? 0) > defaut ? plafond : defaut);
  let valeurs: number[];
  if (champ === "kg") {
    valeurs = o.paliers && o.paliers.length ? [...o.paliers] : regulier(o.unite === "lbs" ? 5 : 2.5, o.unite === "lbs" ? jusqua(1100, 2200) : jusqua(500, 1000));
  } else if (champ === "reps") valeurs = regulier(1, jusqua(100, 999));
  else if (champ === "duree_s") valeurs = regulier(5, jusqua(3600, 4 * 3600));
  else valeurs = regulier(100, jusqua(50_000, 200_000));
  // Indice : la valeur, sinon la plus proche ; sans valeur, un départ parlant (20 kg, 8 répétitions, 1:00, 1 km).
  const depart = valeur ?? (champ === "kg" ? (o.unite === "lbs" ? 45 : 20) : champ === "reps" ? 8 : champ === "duree_s" ? 60 : 1000);
  let indice = 0;
  for (let i = 1; i < valeurs.length; i++) if (Math.abs(valeurs[i]! - depart) < Math.abs(valeurs[indice]! - depart)) indice = i;
  return { valeurs, indice };
}

/** Texte d'une valeur de molette dans la case : « 62,5 », « 10 », « 1:30 », « 800 ». */
export function texteMolette(champ: ChampSerie, v: number): string {
  if (champ === "duree_s") return tempsTexte(v);
  return champ === "kg" ? nombre(v, 1) : String(Math.round(v));
}

/**
 * Case suivante : la plus petite position d'ordre après celle de la case active (poids → répétitions → série suivante,
 * supersets compris : l'ordre suit les positions des séries de la séance) ; null à la dernière.
 */
export function caseSuivante(cases: ReadonlyMap<string, { ordre: number }>, cle: string): string | null {
  const ici = cases.get(cle)?.ordre;
  if (ici == null) return null;
  let meilleure: { cle: string; ordre: number } | null = null;
  for (const [c, { ordre }] of cases) if (ordre > ici && (!meilleure || ordre < meilleure.ordre)) meilleure = { cle: c, ordre };
  return meilleure?.cle ?? null;
}

/**
 * La molette du clavier pour la case active (audit M5) : `cle` ne change qu'avec le champ (ses 101 à 721 lignes ne sont pas
 * recréées à chaque chiffre ni d'une case à l'autre), `saut` à chaque touche et à chaque case (elle s'y pose sans animation).
 */
export function moletteDe(c: Pick<CaseActive, "cle" | "champ" | "unite" | "paliers" | "temps" | "saisie" | "frappes">) {
  const valeur = c.temps ? lireTemps(chiffresTemps(c.saisie.texte)) : lireNombre(c.saisie.texte);
  return { cle: `${c.champ}-${c.unite}-${c.paliers?.join(",") ?? ""}`, saut: `${c.cle}-${c.frappes ?? 0}`, champ: c.champ, unite: c.unite, paliers: c.paliers, valeur };
}

/** Ordre d'une case dans la séance : la position de la série (toute la séance), puis la colonne. */
export const ordreCase = (position: number, colonne: number) => position * 10 + colonne;

// ---------------------------------------------------------------- état partagé

/** La case qui a le focus : sa nature, sa saisie, et de quoi lui rendre le texte. */
export interface CaseActive {
  cle: string;
  champ: ChampSerie;
  decimal: boolean;
  temps: boolean;
  unite: Unite;
  paliers: readonly number[] | null;
  /** Matériel du lieu : avis de la charge la plus proche, chargement de la barre (bande au-dessus du pavé). */
  charge?: InfoCharge | null;
  /** La case s'est ouverte sur une charge que le lieu ne fait pas : la voulue et celle mise à sa place. */
  rapproche?: { voulu: number; kg: number } | null;
  saisie: Saisie;
  /** Touches du pavé tapées : la molette se repose (sans animation) sur la valeur tapée, sans rien renvoyer. */
  frappes?: number;
  /** Écrit le texte dans la case (pas encore enregistré : la case l'enregistre en perdant le focus). */
  ecrire: (texte: string) => void;
  /** Saisie en cours écrite en base, en différé (BROUILLON_MS après la dernière touche) : rien n'est perdu si l'appli est tuée. */
  brouillon?: (texte: string) => void;
}

/** Délai de l'écriture en base d'une saisie en cours : une écriture pour toute une rafale de touches, jamais pendant la frappe. */
export const BROUILLON_MS = 500;

interface CaseInscrite {
  ordre: number;
  focus: () => void;
  blur: () => void;
}

/**
 * Chrono du clavier (docs/SEANCE-ORDRE.md), lu dans logcat (`adb logcat -s ReactNativeJS | grep clavier`) : de l'appui sur
 * une touche au rendu de la case. Éteint par défaut ; `pepfitopen://session?mesure=1` l'allume.
 */
export const mesureClavier = {
  actif: false,
  depuis: 0,
  appui() {
    if (this.actif) this.depuis = Date.now();
  },
  affiche() {
    if (!this.actif || !this.depuis) return;
    console.log(`[clavier] touche-case ${Date.now() - this.depuis} ms`);
    this.depuis = 0;
  },
};

let active: CaseActive | null = null;
let ouvert = false;
// Écriture différée de la saisie en cours : la dernière valeur tapée, et sa minuterie.
let brouillon: { cle: string; ecrire: (texte: string) => void; texte: string; minuterie: ReturnType<typeof setTimeout> } | null = null;
const cases = new Map<string, CaseInscrite>();
let assurer: ((yBas: number) => void) | null = null;
const abonnes = new Set<() => void>();
const emettre = () => {
  ouvert = active != null;
  abonnes.forEach((f) => f());
};

function planifierBrouillon(c: CaseActive) {
  if (!c.brouillon) return;
  if (brouillon) clearTimeout(brouillon.minuterie);
  const b = { cle: c.cle, ecrire: c.brouillon, texte: c.saisie.texte, minuterie: setTimeout(() => ecrireBrouillon(), BROUILLON_MS) };
  brouillon = b;
}

function ecrireBrouillon() {
  const b = brouillon;
  brouillon = null;
  if (!b) return;
  clearTimeout(b.minuterie);
  b.ecrire(b.texte);
}

/** La case se ferme : elle enregistre elle-même sa valeur (onFin), l'écriture différée n'a plus lieu d'être. */
function oublierBrouillon(cle: string) {
  if (brouillon?.cle !== cle) return;
  clearTimeout(brouillon.minuterie);
  brouillon = null;
}

export const clavierSeance = {
  inscrire(cle: string, c: CaseInscrite) {
    cases.set(cle, c);
  },
  desinscrire(cle: string) {
    cases.delete(cle);
  },
  ouvrir(c: CaseActive) {
    active = c;
    emettre();
  },
  fermer(cle: string) {
    oublierBrouillon(cle);
    if (active?.cle === cle) {
      active = null;
      emettre();
    }
  },
  /** Une touche du pavé ; false si la case la refuse (limite atteinte : le clavier le fait sentir). */
  toucher(touche: Touche): boolean {
    if (!active) return false;
    const saisie = toucher(active.saisie, touche, { decimal: active.decimal, temps: active.temps, champ: active.champ });
    if (saisie === active.saisie && touche !== "effacer" && touche !== "decimal") return false;
    active = { ...active, saisie, frappes: (active.frappes ?? 0) + 1 };
    active.ecrire(saisie.texte);
    planifierBrouillon(active);
    emettre();
    return true;
  },
  /** La molette a tourné : la valeur s'écrit dans la case. */
  molette(v: number) {
    if (!active) return;
    const saisie = { texte: texteMolette(active.champ, v), remplacer: false };
    active = { ...active, saisie };
    active.ecrire(saisie.texte);
    planifierBrouillon(active);
    emettre();
  },
  /** Valider : la case suivante prend le focus (la case quittée s'enregistre) ; à la dernière, le clavier se ferme. */
  valider() {
    if (!active) return;
    const suivante = caseSuivante(cases, active.cle);
    if (suivante) cases.get(suivante)!.focus();
    else cases.get(active.cle)?.blur();
  },
  /** Retour Android, ou toucher ailleurs : la case perd le focus (elle s'enregistre) et le clavier se ferme. */
  quitter() {
    if (active) cases.get(active.cle)?.blur();
  },
  /** La case active, lue sans abonnement (tests, garde-fou). */
  caseActive(): CaseActive | null {
    return active;
  },
  /** Le clavier est-il ouvert ? Lu au moment voulu (un toucher), sans abonnement : rien ne se redessine. */
  estOuvert() {
    return ouvert;
  },
  /** L'appli passe en arrière-plan : la saisie en cours part en base tout de suite (Android peut tuer l'appli ensuite). */
  viderBrouillon() {
    ecrireBrouillon();
  },
  /** La séance garde la case visible au-dessus du clavier (`yBas` : bas de la case dans la fenêtre). */
  surAssurer(f: ((yBas: number) => void) | null) {
    assurer = f;
  },
  assurer(yBas: number) {
    assurer?.(yBas);
  },
};

const abonner = (f: () => void) => {
  abonnes.add(f);
  return () => abonnes.delete(f);
};

/**
 * Le clavier est-il ouvert ? Un booléen, stable d'une touche à l'autre : l'écran de séance ne se redessine qu'à l'ouverture
 * et à la fermeture, pas à chaque chiffre (avant le 31/10, il suivait la case active et redessinait toute la séance).
 */
export function useClavierOuvert(): boolean {
  return useSyncExternalStore(abonner, () => ouvert);
}

export function useCaseActive(): CaseActive | null {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => active,
  );
}
