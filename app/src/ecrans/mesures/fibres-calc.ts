// Page Fibres (planche fibres-page validée, NOTES D2 à D13) : calculs purs, sans React Native (tests/fibres-page.test.ts).
// Les fibres se déduisent des repas (rien n'est stocké) : un jour vaut la somme de ses lignes (valeur pour 100 g × quantité).
// Un jour sans repas, ou dont aucun aliment n'a de fibres connues, n'a pas de donnée : ni compté, ni zéro (D12). Les moyennes ne
// prennent que les jours finis, jamais aujourd'hui (D2) ; celle de l'année est la moyenne de tous ces jours, pas des douze
// moyennes de mois (D13).
import { normaliser } from "../../db/normaliser";
import type { Nutriments } from "../../nutrition/calculs";
import { fibresDeLigne, type FibresDuJour } from "../../nutrition/fibres-eau";
import { minuit, periode, statsJours, type Periode, type StatsJours, type TypePeriode } from "./periodes";

/** Ce qu'il faut d'une ligne du journal (une `Consommation` convient). */
export interface LigneListe {
  id: string;
  repas_id: string;
  produit_id: string;
  quantite_g: number;
  produit: { nom: string; nutriments: Nutriments };
}

// ------------------------------------------------------------------ Valeur d'un jour

/** Grammes d'un jour, ou null s'il n'a pas de donnée : aucun repas, ou aucun aliment aux fibres connues (un zéro serait faux). */
export function fibresConnues(j: FibresDuJour | null | undefined): number | null {
  if (j == null || (j.g === 0 && j.partiel)) return null;
  return j.g;
}

// ------------------------------------------------------------------ D'où viennent tes fibres (D3, D4, D11)

export interface AlimentListe {
  id: string;
  nom: string;
  quantiteG: number;
  repasId: string;
  /** Grammes de fibres de la ligne ; null : pas de fibres renseignées pour cet aliment (un tiret). */
  g: number | null;
  /** Part du total du jour, en % entier ; null avec `g`. */
  part: number | null;
}

export interface ListeDuJour {
  /** Classés par apport décroissant, puis ceux aux fibres inconnues. Les aliments connus à zéro (viande, huile) n'en sont pas. */
  aliments: AlimentListe[];
  /** Nombre d'aliments aux fibres inconnues. */
  sansFibres: number;
  total: number;
}

export function alimentsDuJour(lignes: readonly LigneListe[]): ListeDuJour {
  const connus: AlimentListe[] = [];
  const inconnus: AlimentListe[] = [];
  let total = 0;
  for (const l of lignes) {
    const f = fibresDeLigne(l);
    const base = { id: l.id, nom: l.produit.nom, quantiteG: l.quantite_g, repasId: l.repas_id };
    if (f.inconnu) inconnus.push({ ...base, g: null, part: null });
    else if (f.g > 0) {
      total += f.g;
      connus.push({ ...base, g: f.g, part: 0 });
    }
  }
  connus.sort((a, b) => b.g! - a.g!);
  for (const a of connus) a.part = total > 0 ? Math.round((a.g! / total) * 100) : 0;
  return { aliments: [...connus, ...inconnus], sansFibres: inconnus.length, total };
}

/** Lignes montrées d'emblée (D4), puis « Voir les n autres ». */
export const VISIBLES = 5;

/** Cinq lignes puis « Voir les n autres » ; à six ou moins, tout est visible et il n'y a pas de bouton (`autres` = 0). */
export function lignesVisibles<T>(l: readonly T[], ouvert: boolean): { montrees: readonly T[]; autres: number } {
  if (l.length <= VISIBLES + 1) return { montrees: l, autres: 0 };
  return { montrees: ouvert ? l : l.slice(0, VISIBLES), autres: l.length - VISIBLES };
}

// ------------------------------------------------------------------ Les plus riches (D9)

export interface Riche {
  nom: string;
  /** Nombre de fois où il a été mangé (une ligne du journal = une fois). */
  fois: number;
  /** Grammes de fibres cumulés sur la période. */
  g: number;
  /** Part du total de la période, en % entier. */
  part: number;
}

/** Les aliments qui ont apporté le plus de fibres sur `lignes` (les repas de la période), regroupés par produit. */
export function plusRiches(lignes: readonly LigneListe[], n = 5): Riche[] {
  const parProduit = new Map<string, Riche>();
  let total = 0;
  for (const l of lignes) {
    const f = fibresDeLigne(l);
    if (f.inconnu || f.g <= 0) continue;
    total += f.g;
    const cle = l.produit_id || normaliser(l.produit.nom);
    const r = parProduit.get(cle);
    if (r) {
      r.fois++;
      r.g += f.g;
    } else parProduit.set(cle, { nom: l.produit.nom, fois: 1, g: f.g, part: 0 });
  }
  const l = [...parProduit.values()].sort((a, b) => b.g - a.g).slice(0, n);
  for (const r of l) r.part = total > 0 ? Math.round((r.g / total) * 100) : 0;
  return l;
}

// ------------------------------------------------------------------ Statistiques (D2, D12, D13)

/**
 * La période `k` de `type` avec les fibres de chaque jour : un jour sans donnée (fibresConnues) reste vide. Semaine et mois montrent
 * la barre d'aujourd'hui (qui n'entre pas dans les moyennes, voir statsFinis) ; dans l'année, la barre d'un mois est la moyenne de
 * ses jours finis, aujourd'hui n'y est pas.
 */
export function periodeFibres(type: TypePeriode, k: number, maintenant: number, lire: (jour: number) => FibresDuJour | null | undefined): Periode<FibresDuJour> {
  const auj = minuit(maintenant);
  return periode(
    type,
    k,
    maintenant,
    (jour) => (type === "annee" && jour >= auj ? null : fibresConnues(lire(jour)) == null ? null : lire(jour)),
    (d) => d.g,
  );
}

/**
 * Statistiques des jours finis d'une période : `jours` en vient (`Periode.jours`), `aujourdhui` est le minuit d'aujourd'hui, qu'on
 * ne compte jamais. `objectif` : null quand les objectifs sont masqués (aucun jour « atteint »). Un jour atteint l'objectif quand
 * il l'atteint une fois arrondi au gramme, comme la barre du Journal.
 */
export function statsFinis(jours: readonly { jour: number; v: number | null }[], aujourdhui: number, objectif: number | null): StatsJours {
  return statsJours(
    jours.filter((j) => j.jour < aujourdhui),
    objectif == null ? Number.POSITIVE_INFINITY : objectif - 0.5,
  );
}

/** Le jour atteint-il l'objectif (une fois arrondi au gramme) ? */
export const atteint = (g: number, objectif: number) => Math.round(g) >= objectif;
