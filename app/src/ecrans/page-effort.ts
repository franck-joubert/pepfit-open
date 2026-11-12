// Page du jour de l'onglet Effort (planche Effort v2.2) : la ligne Sommeil en tête, les récupérations parmi les séances, en
// rose Corps (D10). Logique pure, sans React Native (tests/page-effort.test.ts) : l'état du Sommeil, ses textes, les gestes
// que propose chaque « … ».
//
// Une récupération n'allume ni le point du jour ni la série (D4, D5).
import { t } from "../i18n/index";
import type { NomIcone } from "../ui/Icone";
import { dureeCourte, heure } from "./format";
import type { Nuit } from "./mesures/sommeil-donnees";
import type { TypeRecup } from "./recuperer";
import type { ActiviteFaite } from "./recuperer-donnees";

export type EtatSommeil = "lue" | "pasDeDonnee" | "synchro" | "aucune";

/**
 * Ce que montre la ligne Sommeil d'un jour. `nuit` : la nuit qui finit ce jour, null si la lecture n'a rien rendu, undefined
 * tant qu'elle n'est pas faite (rien ne s'affiche : pas de « Pas de donnée » qui clignote). Un jour à venir n'a pas de nuit ;
 * « Synchro en cours » ne vaut que pour aujourd'hui, la nuit qu'on attend.
 */
export function etatSommeil(c: { jour: string; aujourdhui: string; nuit: unknown | null | undefined; synchro: boolean }): EtatSommeil {
  if (c.jour > c.aujourdhui || c.nuit === undefined) return "aucune";
  if (c.nuit) return "lue";
  return c.synchro && c.jour === c.aujourdhui ? "synchro" : "pasDeDonnee";
}

/** La ligne est-elle dans la liste ? Masquée par le réglage : jamais, quel que soit l'état (la lecture, elle, continue, D9). */
export const sommeilMontre = (affiche: boolean, etat: EtatSommeil): boolean => affiche && etat !== "aucune";

/** « 23:10 → 06:55 » : début et fin de la nuit, dans le format de l'heure de l'appli. */
export const horairesNuit = (n: { debut: number; fin: number }): string => `${heure(n.debut)} → ${heure(n.fin)}`;

/** Sous-ligne du Sommeil : la durée dormie seule (« 8 h 32 »), avec « modifié » quand la personne a retouché les horaires (l'original est gardé). Les horaires sont dans la page Sommeil et sa feuille. */
export const sousLigneSommeil = (n: { sommeilMin: number; original?: { debut: number; fin: number } | null }): string =>
  n.original ? `${dureeNuit(n)}, ${t("horaires.modifie")}` : dureeNuit(n);

/** « 7 h 45 » : la durée dormie, recalée sur les horaires quand la personne les a modifiés (sommeil-horaires). */
export const dureeNuit = (n: { sommeilMin: number }): string => dureeCourte(n.sommeilMin * 60);

/** Le texte lu pour la ligne Sommeil d'une nuit lue : la durée (celle qu'on voit) ; avec `pct` (part du besoin dormie), il le dit ensuite. */
export const libelleSommeil = (n: { sommeilMin: number }, pct?: number | null): string => {
  const lu = t("effortJour.sommeilLu", { duree: dureeNuit(n) });
  return pct != null ? `${lu}, ${t("mesuresSommeil.partBesoin", { n: String(pct) })}` : lu;
};

/** Ce que la liste du jour (ListeJour) demande à son écran pour montrer le Sommeil et les récupérations : seule la page Effort le donne. */
export interface ActionsEffortListe {
  /** Réglage d'appareil « Afficher le sommeil » (D9). */
  sommeilAffiche: boolean;
  /** Toucher la ligne Sommeil : la page Sommeil de ce jour. */
  onOuvrirSommeil: (jour: string) => void;
  onMenuSommeil: (nuit: Nuit) => void;
  onMenuRecup: (e: ElementRecup) => void;
  /** Ligne de récupération glissée vers « Supprimer ». */
  onSupprimerRecup: (e: ElementRecup) => void;
}

/** Gestes du « … » de la ligne Sommeil (D5, D8) : Modifier et Masquer, jamais Partager. Pas de « … » sans nuit lue. */
export const ACTIONS_SOMMEIL = ["modifier", "masquer"] as const;
export const actionsSommeil = (etat: EtatSommeil): readonly (typeof ACTIONS_SOMMEIL)[number][] => (etat === "lue" ? ACTIONS_SOMMEIL : []);

/** Gestes du « … » d'une récupération (D4, D5) : Modifier, Supprimer de l'historique. */
export const ACTIONS_RECUP = ["modifier", "supprimer"] as const;

/** Pictogramme au trait de chaque activité de récupération (D10 : le sauna perd sa vignette photo ; la Sieste prend la lune). */
const ICONE_RECUP: Record<TypeRecup, NomIcone> = {
  sieste: "lune",
  sauna: "sauna",
  respiration: "souffle",
  "bain-froid": "goutte",
  massage: "main",
  rouleau: "corps",
  etirements: "corps",
  mobilite: "corps",
  marche: "pas",
  active: "course",
};
export const iconeRecup = (type: TypeRecup): NomIcone => ICONE_RECUP[type];

/** Horaires modifiés par la personne : l'original est gardé (migration 182). */
export const recupModifiee = (a: Pick<ActiviteFaite, "debutOrig" | "finOrig">): boolean => a.debutOrig != null || a.finOrig != null;

/** Sous-ligne d'une récupération, avec « modifié » quand la personne a retouché ses horaires. */
export const sousLigneModifiee = (sous: string, a: Pick<ActiviteFaite, "debutOrig" | "finOrig">): string =>
  recupModifiee(a) ? `${sous}, ${t("horaires.modifie")}` : sous;

/** Une récupération dans la liste du jour : à son heure parmi les séances (fusionnerParHeure). */
export interface ElementRecup {
  recupId: string;
  debut: number;
  a: ActiviteFaite;
  kcal: number | null;
}

export const elementRecup = (a: ActiviteFaite, kcal: number | null): ElementRecup => ({ recupId: a.id, debut: a.debut, a, kcal });
