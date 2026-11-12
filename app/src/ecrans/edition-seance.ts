// Logique pure de l'édition d'une séance (titre, jour et heure de début, durée), partagée par la fin de séance et la séance passée.
import { t } from "../i18n/index";
import { deMurale, parties } from "../i18n/temps";
import { ajouterJours, debutJour } from "./format";

export const MINUTE = 60_000;
export const DUREE_MAX_MIN = 99 * 60 + 59;

export interface Raccourci {
  libelle: string;
  jour: number;
}

/** Aujourd'hui, hier, avant-hier : minuit local de chacun. */
export function raccourcisJour(maintenant: number): Raccourci[] {
  return [
    { libelle: t("communs.aujourdhui"), jour: debutJour(maintenant).getTime() },
    { libelle: t("communs.hier"), jour: ajouterJours(maintenant, -1).getTime() },
    { libelle: t("communs.avantHier"), jour: ajouterJours(maintenant, -2).getTime() },
  ];
}

/** Change le jour de `debut` en gardant l'heure et les minutes. */
export function avecJour(debut: number, jour: number): number {
  const d = parties(debut);
  const j = parties(jour);
  return deMurale(new Date(j.an, j.mois, j.jour, d.h, d.min));
}

/** Change l'heure et les minutes de `debut` en gardant le jour. */
export function avecHeureMinute(debut: number, heures: number, minutes: number): number {
  const d = parties(debut);
  return deMurale(new Date(d.an, d.mois, d.jour, borner(heures, 0, 23), borner(minutes, 0, 59)));
}

export function borner(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Minutes + 1 ou − 1 par pas de 5 : 17 → 20 en montant, 15 en descendant ; 20 → 25 / 15. */
export function pasDeCinq(valeur: number, sens: 1 | -1): number {
  return sens === 1 ? (Math.floor(valeur / 5) + 1) * 5 : (Math.ceil(valeur / 5) - 1) * 5;
}

export function debutDansLeFutur(debut: number, maintenant: number): boolean {
  return debut > maintenant;
}

export type ValidationDebut = { ok: true; debut: number } | { ok: false; raison: string };

export function validerDebut(debut: number, maintenant: number): ValidationDebut {
  if (!Number.isFinite(debut)) return { ok: false, raison: t("seance.edition.dateInvalide") };
  if (debutDansLeFutur(debut, maintenant)) return { ok: false, raison: t("seance.edition.futur") };
  return { ok: true, debut };
}

/** Durée en minutes entières (≥ 0) entre deux instants. */
export function minutesEntre(debut: number, fin: number): number {
  return Math.max(0, Math.round((fin - debut) / MINUTE));
}

/** Durée affichée : la valeur réglée si elle l'est, sinon « maintenant − début ». */
export function dureeAffichee(debut: number, figeeMin: number | null, maintenant: number): number {
  return figeeMin ?? minutesEntre(debut, maintenant);
}

/** Fin = début + durée, sans dépasser l'instant présent. */
export function finDepuisDuree(debut: number, dureeMin: number, maintenant: number): number {
  return Math.min(debut + borner(dureeMin, 0, DUREE_MAX_MIN) * MINUTE, Math.max(maintenant, debut));
}

/** Titre saisi → valeur à écrire : vide ou espaces = null (retour au nom de la routine). */
export function titreFinal(saisie: string): string | null {
  const net = saisie.trim().replace(/\s+/g, " ");
  return titreValable(net);
}

/**
 * Titre affichable : au moins une lettre ou un chiffre. Un titre vide ou fait de signes (« - », « – ») retombe sur le nom
 * par défaut (titre « - » vu sur la fin de course d'Alex, 29/10).
 */
export function titreValable(titre: string | null | undefined): string | null {
  return titre && /[\p{L}\p{N}]/u.test(titre) ? titre : null;
}

export function heuresMinutes(totalMin: number): { h: number; m: number } {
  const total = borner(totalMin, 0, DUREE_MAX_MIN);
  return { h: Math.floor(total / 60), m: total % 60 };
}
