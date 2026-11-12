// Logique pure de la feuille « Durée » d'une séance en cours : début, pauses, valeurs des roues, libellés de date.
import { t, tp } from "../i18n/index";
import { deMurale, parties } from "../i18n/temps";
import { ajouterJours, debutJour, jourMoisAnnee } from "./format";

export const MINUTE_MS = 60_000;
export const JOUR_MAX_MIN = 600;
export const JOURS_ROUE = 7;

export interface Chrono {
  debut: number;
  pauseDebut: number | null;
  pauseCumulS: number;
}

/** Instant de référence du chrono : maintenant, ou le début de la pause (le temps est figé). */
function reference(c: Chrono, maintenant: number): number {
  return c.pauseDebut ?? maintenant;
}

/** Durée écoulée en secondes, pauses exclues, jamais négative. */
export function dureeSeanceS(c: Chrono, maintenant: number): number {
  return Math.max(0, Math.floor((reference(c, maintenant) - c.debut) / 1000) - c.pauseCumulS);
}

// Début et durée sont indépendants (26/10) : fin = début + durée, l'écart avec maintenant compte comme pause.

/** Durée réglée à `minutes` pile sans bouger le début ; le début ne recule que si la durée dépasse le temps écoulé depuis lui. */
export function avecDuree(c: Chrono, minutes: number, maintenant: number): Chrono {
  const s = Math.min(JOUR_MAX_MIN, Math.max(0, Math.round(minutes))) * 60;
  const ref = reference(c, maintenant);
  const ecouleS = Math.floor((ref - c.debut) / 1000);
  if (s <= ecouleS) return { ...c, pauseCumulS: ecouleS - s };
  return { ...c, debut: ref - s * 1000, pauseCumulS: 0 };
}

/**
 * Début déplacé sans jamais toucher à la durée (26/10), jamais après maintenant. Avancer le début peut porter la
 * fin après maintenant : le cumul de pause devient négatif, la durée continue de défiler à partir de la même valeur.
 */
export function avecDebut(c: Chrono, debut: number, maintenant: number): Chrono {
  const ref = reference(c, maintenant);
  const d = Math.min(debut, ref);
  return { ...c, debut: d, pauseCumulS: Math.floor((ref - d) / 1000) - dureeSeanceS(c, maintenant) };
}

export function enPause(c: Chrono): boolean {
  return c.pauseDebut !== null;
}

export function mettreEnPause(c: Chrono, maintenant: number): Chrono {
  return enPause(c) ? c : { ...c, pauseDebut: maintenant };
}

export function reprendre(c: Chrono, maintenant: number): Chrono {
  if (c.pauseDebut === null) return c;
  const pause = Math.max(0, Math.round((maintenant - c.pauseDebut) / 1000));
  return { ...c, pauseDebut: null, pauseCumulS: c.pauseCumulS + pause };
}

/** « Maintenant » pour l'enregistrement final : l'instant réel moins toutes les pauses, pour que fin − début exclue les pauses. */
export function finSansPauses(c: Chrono, maintenant: number): number {
  return reference(c, maintenant) - c.pauseCumulS * 1000;
}

export function valeursMinutesDuree(): number[] {
  return Array.from({ length: JOUR_MAX_MIN + 1 }, (_, i) => i);
}
export const valeursHeures = (): number[] => Array.from({ length: 24 }, (_, i) => i);
export const valeursMinutesHeure = (): number[] => Array.from({ length: 60 }, (_, i) => i);
/** Écarts en jours : −6 … 0 (aujourd'hui en bas de la roue). */
export const valeursJours = (): number[] => Array.from({ length: JOURS_ROUE }, (_, i) => i - (JOURS_ROUE - 1));

export function deuxChiffres(n: number): string {
  return String(n).padStart(2, "0");
}

/** « 1 h 05 » / « 45 min » : ligne de la roue de durée. */
export function dureeMinutesTexte(min: number): { attenue: string; plein: string } {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return { attenue: "", plein: t("communs.min", { n: m }) };
  return { attenue: "", plein: `${t("communs.h", { n: h })} ${deuxChiffres(m)}` };
}

export function dureeMinutesLue(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return tp("seance.duree.minutes", m);
  return m === 0 ? tp("seance.duree.heures", h) : `${tp("seance.duree.heures", h)} ${tp("seance.duree.minutes", m)}`;
}

/** Ligne de la roue de date : « Aujourd'hui », « Hier », sinon « 26 oct. 2026 ». `ecart` en jours (≤ 0). */
export function libelleJour(ecart: number, maintenant: number): string {
  if (ecart === 0) return t("communs.aujourdhui");
  if (ecart === -1) return t("communs.hier");
  return jourMoisAnnee(ajouterJours(maintenant, ecart));
}

/** Écart en jours (≤ 0) entre le jour de `debut` et celui de `maintenant`, borné à la roue. */
export function ecartJours(debut: number, maintenant: number): number {
  const a = parties(debutJour(maintenant).getTime() + 43_200_000);
  const b = parties(debutJour(debut).getTime() + 43_200_000);
  const e = Math.round((Date.UTC(b.an, b.mois, b.jour) - Date.UTC(a.an, a.mois, a.jour)) / 86_400_000);
  return Math.max(-(JOURS_ROUE - 1), Math.min(0, e));
}

/** Début à partir des trois roues : jour (écart), heure, minute — secondes à 0. */
export function debutDepuisRoues(ecart: number, heures: number, minutes: number, maintenant: number): number {
  const auj = parties(maintenant);
  return deMurale(new Date(auj.an, auj.mois, auj.jour + ecart, heures, minutes));
}
