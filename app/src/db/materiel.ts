// Matériel d'un lieu (planche materiel, validée le 03/11 ; docs/CODE-MATERIEL.md) : ce que les poids libres, les barres, les
// disques et les machines permettent, calculé, jamais stocké. Repris de planches/materiel/outils/calcul.mjs (mêmes cas en
// tests/materiel-calcul.test.ts). Sans base : les feuilles, la séance et l'inventaire l'appellent.
import { nombre } from "../ecrans/format";
import { t, tp } from "../i18n/index";

const EPS = 0.001;
export const net = (n: number): number => Math.round(n * 100) / 100;
/** Liste triée, sans doublon ni valeur négative ou illisible. */
export const trier = (l: readonly number[]): number[] => [...new Set(l.filter((x) => Number.isFinite(x) && x >= 0).map(net))].sort((a, b) => a - b);

export interface Disque {
  kg: number;
  /** Une paire = un disque de chaque côté (D3). */
  paires: number;
}

/** Liste dépliée de `de` à `a` par `par` (la « plage » de la saisie rapide). Vide si incohérent. */
export function plage(de: number, a: number, par: number): number[] {
  if (!(par > 0) || !(de >= 0) || a < de) return [];
  const out: number[] = [];
  for (let i = 0; out.length <= 400; i++) {
    const v = net(de + i * par);
    if (v > a + EPS) break;
    out.push(v);
  }
  return out;
}

/**
 * Sommes possibles d'un côté d'une barre : chaque poids pris au plus `paires` fois, au plus `maxParCote` disques. Calcul en
 * centièmes, sans doublon ; on garde le plus petit nombre de disques par somme.
 */
export function sommesCote(disques: readonly Disque[], maxParCote = Infinity): number[] {
  let etats = new Map<number, number>([[0, 0]]);
  for (const { kg, paires } of disques) {
    const c = Math.round(kg * 100);
    if (!(c > 0)) continue;
    const suite = new Map(etats);
    for (const [s, n] of etats)
      for (let k = 1; k <= paires; k++) {
        if (n + k > maxParCote) break;
        const s2 = s + k * c;
        if (!suite.has(s2) || suite.get(s2)! > n + k) suite.set(s2, n + k);
      }
    etats = suite;
    if (etats.size > 20000) break; // garde-fou : un jeu absurde ne fige pas l'écran
  }
  return [...etats.keys()].sort((a, b) => a - b).map((x) => x / 100);
}

/** Barre à charger : son poids propre plus deux fois chaque somme d'un côté, jusqu'à sa charge maximale s'il y en a une. */
export const barreChargee = (poidsPropre: number, disques: readonly Disque[], maxParCote = Infinity, plafond = Infinity): number[] =>
  trier(sommesCote(disques, maxParCote).map((s) => poidsPropre + 2 * s)).filter((c) => c <= plafond + EPS);

/** Disques d'un côté pour une charge, les plus lourds d'abord (ce que la séance affiche). Null si impossible. */
export function chargement(charge: number, poidsPropre: number, disques: readonly Disque[], maxParCote = Infinity): number[] | null {
  const reste = Math.round(((charge - poidsPropre) / 2) * 100);
  if (reste < 0) return null;
  const tries = [...disques].filter((d) => d.kg > 0 && d.paires > 0).sort((a, b) => b.kg - a.kg);
  const out: number[] = [];
  // Recherche en profondeur, plus lourds d'abord : la première solution trouvée est la plus naturelle à monter.
  const chercher = (i: number, r: number, n: number): boolean => {
    if (r === 0) return true;
    if (i >= tries.length || n >= maxParCote) return false;
    const c = Math.round(tries[i]!.kg * 100);
    for (let k = Math.min(tries[i]!.paires, Math.floor(r / c), maxParCote - n); k >= 0; k--) {
      for (let j = 0; j < k; j++) out.push(tries[i]!.kg);
      if (chercher(i + 1, r - k * c, n + k)) return true;
      out.splice(out.length - k, k);
    }
    return false;
  };
  return chercher(0, reste, 0) ? out : null;
}

/**
 * Haltères réglables (D7) : deux haltères chargés pareil (chacun prend au plus la moitié des paires de chaque poids), ou un
 * seul haltère (toutes les paires), pour les exercices à un bras.
 */
export function halteresReglables({ poignee, poignees, disques }: { poignee: number; poignees: number; disques: readonly Disque[] }): { deux: number[]; un: number[] } {
  if (!(poignee > 0) || !(poignees >= 1)) return { deux: [], un: [] };
  const moitie = disques.map((d) => ({ kg: d.kg, paires: Math.floor(d.paires / 2) })).filter((d) => d.paires > 0);
  return { deux: poignees >= 2 ? barreChargee(poignee, moitie) : [], un: barreChargee(poignee, disques) };
}

/** Machine à pile : première charge, pas, maximum ; les petites masses d'appoint s'ajoutent une fois chacune (D10). */
export function pile({ premiere, pas, max, appoint = [] }: { premiere: number; pas: number; max: number; appoint?: readonly number[] }): number[] {
  const base = plage(premiere, max, pas);
  const extras = sommesCote(appoint.map((kg) => ({ kg, paires: 1 })));
  return trier(base.flatMap((p) => extras.map((e) => p + e)));
}

export interface Proche {
  kg: number;
  existe: boolean;
  egalite: boolean;
  plusLourd: boolean;
  plusLeger: boolean;
}

/** Charge réalisable la plus proche ; à égalité, la plus légère (D4). */
export function plusProche(charges: readonly number[], voulu: number): Proche | null {
  if (!charges.length) return null;
  let meilleur = charges[0]!;
  for (const c of charges) if (Math.abs(c - voulu) < Math.abs(meilleur - voulu) - EPS) meilleur = c;
  const egalite = charges.some((c) => c !== meilleur && Math.abs(Math.abs(c - voulu) - Math.abs(meilleur - voulu)) < EPS);
  return {
    kg: meilleur,
    existe: Math.abs(meilleur - voulu) < EPS,
    egalite,
    plusLourd: meilleur === charges[charges.length - 1] && voulu > meilleur,
    plusLeger: meilleur === charges[0] && voulu < meilleur,
  };
}

/** Voisins pour la molette : la charge, et `n` charges réalisables de chaque côté. */
export function molette(charges: readonly number[], kg: number, n = 1): { avant: number[]; ici: number; apres: number[] } | null {
  const i = charges.findIndex((c) => Math.abs(c - kg) < EPS);
  if (i < 0) return null;
  return { avant: charges.slice(Math.max(0, i - n), i), ici: charges[i]!, apres: charges.slice(i + 1, i + 1 + n) };
}

export const paires = (disques: readonly Disque[]): number => disques.reduce((s, d) => s + d.paires, 0);

// ---------------------------------------------------------------- écriture des listes

const nb = (n: number): string => nombre(net(n), 2);

/** « 4, 8, 20 et 30 » */
export function enumerer(l: readonly number[]): string {
  const v = l.map(nb);
  return v.length < 2 ? v.join("") : t("materiel.et", { avant: v.slice(0, -1).join(", "), dernier: v[v.length - 1]! });
}

/**
 * Résumé d'une liste : suites régulières d'au moins 4 valeurs écrites « de à par », le reste énuméré.
 * [1..10 par 1, 12..40 par 2] → « 1 à 10 par 1, 12 à 40 par 2 kg ». [4, 8, 20, 30] → « 4, 8, 20 et 30 kg ».
 */
export function resumer(l: readonly number[], unite = "kg"): string {
  const v = trier(l);
  if (!v.length) return "";
  type Morceau = { suite: true; de: number; a: number; pas: number } | { suite: false; v: number };
  const morceaux: Morceau[] = [];
  let i = 0;
  while (i < v.length) {
    let j = i + 1;
    if (j < v.length) {
      const pas = net(v[j]! - v[i]!);
      while (j + 1 < v.length && Math.abs(net(v[j + 1]! - v[j]!) - pas) < EPS) j++;
      if (j - i + 1 >= 4) {
        morceaux.push({ suite: true, de: v[i]!, a: v[j]!, pas });
        i = j + 1;
        continue;
      }
    }
    morceaux.push({ suite: false, v: v[i]! });
    i++;
  }
  if (morceaux.every((m) => !m.suite)) return `${enumerer(v)} ${unite}`;
  const out: string[] = [];
  let seuls: number[] = [];
  const vider = () => {
    if (seuls.length) out.push(seuls.map(nb).join(", "));
    seuls = [];
  };
  for (const m of morceaux) {
    if (m.suite) {
      vider();
      out.push(t("materiel.suite", { de: nb(m.de), a: nb(m.a), pas: nb(m.pas) }));
    } else seuls.push(m.v);
  }
  vider();
  return `${out.join(", ")} ${unite}`;
}

/** « 20 à 127,5 kg par 2,5 » quand le pas est régulier, sinon le résumé. */
export function etendue(l: readonly number[], unite = "kg"): string {
  const v = trier(l);
  if (v.length < 2) return v.length ? `${nb(v[0]!)} ${unite}` : "";
  const pas = net(v[1]! - v[0]!);
  const regulier = v.every((x, i) => i === 0 || Math.abs(net(x - v[i - 1]!) - pas) < EPS);
  return regulier ? t("materiel.etendue", { de: nb(v[0]!), a: nb(v[v.length - 1]!), unite, pas: nb(pas) }) : resumer(v, unite);
}

/** Ce qu'on écrit sous un élément : l'étendue si elle se lit d'un coup, sinon « 2,6 à 32,6 kg, 16 charges ». */
export function apercu(l: readonly number[], unite = "kg"): string {
  const v = trier(l);
  const r = etendue(v, unite);
  return r.split(", ").length <= 3 ? r : tp("materiel.apercu", v.length, { de: nb(v[0]!), a: nb(v[v.length - 1]!), unite });
}

// ---------------------------------------------------------------- catalogue (planche materiel, donnees.mjs)

export type Unite = "kg" | "lbs";
export type GenreMateriel = "halteres" | "kettlebell" | "leste" | "reglables" | "barre" | "disques";
export const GENRES: readonly GenreMateriel[] = ["halteres", "reglables", "kettlebell", "barre", "disques", "leste"];
export type Trou = "50" | "28" | "lesmills";
export const TROUS: readonly Trou[] = ["50", "28", "lesmills"];
export type FormeBarre = "droite" | "ez" | "hexagonale" | "courte" | "lesmills" | "autre";
export type FormeLeste = "medecine_ball" | "wall_ball" | "gilet" | "sac";
export const FORMES_LESTE: readonly FormeLeste[] = ["medecine_ball", "wall_ball", "gilet", "sac"];

/**
 * Types de barre (D5) : poids propre par défaut, sourcé (NOTES § Sources), toujours modifiable ; trou des disques qu'elle prend.
 * Les Mills : 2,6 kg et 3 disques par côté (fiche SMARTBAR) ; à peser sur une barre de Lofting (D15). En lbs, la barre droite
 * fait 45 lbs ; les autres, leur poids en kg converti au dixième.
 */
export const BARRES: readonly { forme: FormeBarre; kg: number; lbs: number; trou: Trou; maxParCote?: number }[] = [
  { forme: "droite", kg: 20, lbs: 45, trou: "50" },
  { forme: "ez", kg: 10, lbs: 22, trou: "50" },
  { forme: "hexagonale", kg: 25, lbs: 55, trou: "50" },
  { forme: "courte", kg: 6, lbs: 13.2, trou: "28" },
  { forme: "lesmills", kg: 2.6, lbs: 5.7, trou: "lesmills", maxParCote: 3 },
  { forme: "autre", kg: 10, lbs: 22, trou: "50" },
];
export const barreDe = (forme: string | null | undefined) => BARRES.find((b) => b.forme === forme) ?? BARRES[0]!;

/** Poids courants d'un jeu de disques, proposés en un toucher (D6, D13). */
export const COURANTS: Record<Trou, Record<Unite, readonly number[]>> = {
  "50": { kg: [25, 20, 15, 10, 5, 2.5, 2, 1.5, 1.25, 1, 0.5], lbs: [45, 35, 25, 10, 5, 2.5] },
  "28": { kg: [20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5], lbs: [25, 10, 5, 2.5] },
  lesmills: { kg: [7.5, 5, 2.5, 1], lbs: [16.5, 11, 5.5, 2.2] },
};

/** Grilles de la saisie rapide (D2, D13) : les poids qu'on touche. Un poids hors grille s'y insère, à sa place. */
export const GRILLES: Record<"halteres" | "kettlebell" | "leste", Record<Unite, readonly number[]>> = {
  halteres: { kg: [...plage(1, 10, 1), ...plage(12, 50, 2)], lbs: plage(5, 120, 5) },
  kettlebell: { kg: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 44, 48], lbs: [10, 15, 20, 25, 30, 35, 40, 45, 50, 53, 60, 70, 80, 90, 100] },
  leste: { kg: [...plage(1, 10, 1), 12, 14, 16, 18, 20], lbs: plage(2, 30, 2) },
};

/** La grille montrée : la grille de l'unité, plus les poids possédés hors grille, chacun à sa place. */
export const grilleAvec = (genre: "halteres" | "kettlebell" | "leste", unite: Unite, poids: readonly number[]): number[] => trier([...GRILLES[genre][unite], ...poids]);
