// Horaires d'une activité (planche Effort v2, feuille « Horaires » : D6 et D7), logique pure. Début, fin et durée sont liés :
// le début déplace l'activité (la durée reste, la fin suit), la fin recalcule la durée (le début reste), la durée déplace la fin
// (le début reste). Bornes : fin au moins une minute après le début, rien dans le futur, 99 h 59 au plus, et l'enveloppe doit
// contenir toutes les séries d'une séance (chacune garde son heure, seule l'enveloppe bouge). Les phrases sous les roues disent
// l'effet avant « Valider » : un seul calcul à la validation, sur l'enveloppe entière.
import { t } from "../i18n/index";
import { deMurale, formater, parties } from "../i18n/temps";
import { DUREE_MAX_MIN, MINUTE } from "./edition-seance";
import { ajouterJours, debutJour, dureeCourte, heure, jourSemaineMois } from "./format";

export type Champ = "debut" | "fin" | "duree";

export interface Horaires {
  debut: number;
  fin: number;
}

/** Jours de la roue du jour : d'aujourd'hui à 90 jours en arrière (les trois raccourcis d'avant ne remontaient pas plus loin qu'avant-hier). */
export const JOURS_HORAIRES = 90;

const minute = (ms: number) => Math.round(ms / MINUTE) * MINUTE;

/** Durée en minutes entières entre le début et la fin. */
export const dureeMin = (h: Horaires): number => Math.max(0, Math.round((h.fin - h.debut) / MINUTE));

/** Lien des trois champs (D6) : `valeur` est un instant pour « debut » et « fin », des minutes pour « duree ». */
export function lier(h: Horaires, champ: Champ, valeur: number): Horaires {
  if (champ === "debut") return { debut: minute(valeur), fin: minute(valeur) + (h.fin - h.debut) };
  if (champ === "fin") return { debut: h.debut, fin: minute(valeur) };
  return { debut: h.debut, fin: h.debut + Math.max(0, Math.round(valeur)) * MINUTE };
}

export interface Bornes {
  maintenant: number;
  /** Heure de la première et de la dernière série faite d'une séance de musculation ; null : aucune. */
  premiereSerie?: number | null;
  derniereSerie?: number | null;
}

export type Refus =
  | { motif: "futur"; champ: "debut" | "fin"; maintenant: number }
  | { motif: "finAvantDebut"; champ: "fin" }
  | { motif: "tropLong"; champ: "duree" }
  | { motif: "serieDebut"; champ: "debut"; serie: number }
  | { motif: "serieFin"; champ: "fin"; serie: number };

/** Ce que la feuille refuse, ou null. La ligne en cause passe en rouge, « Valider » est grisé : rien n'est écrit à moitié. */
export function refuser(h: Horaires, b: Bornes): Refus | null {
  if (!Number.isFinite(h.debut) || !Number.isFinite(h.fin)) return { motif: "finAvantDebut", champ: "fin" };
  if (h.fin - h.debut > DUREE_MAX_MIN * MINUTE) return { motif: "tropLong", champ: "duree" };
  if (h.fin - h.debut < MINUTE) return { motif: "finAvantDebut", champ: "fin" };
  if (h.fin > b.maintenant) return { motif: "futur", champ: "fin", maintenant: b.maintenant };
  if (h.debut > b.maintenant) return { motif: "futur", champ: "debut", maintenant: b.maintenant };
  if (b.premiereSerie != null && h.debut > b.premiereSerie) return { motif: "serieDebut", champ: "debut", serie: b.premiereSerie };
  if (b.derniereSerie != null && h.fin < b.derniereSerie) return { motif: "serieFin", champ: "fin", serie: b.derniereSerie };
  return null;
}

export function phraseRefus(r: Refus): string {
  switch (r.motif) {
    case "futur":
      return t("horaires.refus.futur", { heure: heure(r.maintenant) });
    case "finAvantDebut":
      return t("horaires.refus.finAvantDebut");
    case "tropLong":
      return t("horaires.refus.tropLong");
    case "serieDebut":
      return t("horaires.refus.serieDebut", { heure: heure(r.serie) });
    case "serieFin":
      return t("horaires.refus.serieFin", { heure: heure(r.serie) });
  }
}

/** Les deux champs qui ont bougé quand on change `champ` (« La durée reste 1 h 31, la fin passe à 17:01. »). */
export function phraseLien(avant: Horaires, apres: Horaires, champ: Champ): string {
  const duree = dureeCourte(dureeMin(apres) * 60);
  if (champ === "debut") return t("horaires.lien.debut", { duree, fin: heure(apres.fin) });
  if (champ === "fin") return t("horaires.lien.fin", { debut: heure(apres.debut), duree });
  return t("horaires.lien.duree", { debut: heure(apres.debut), fin: heure(apres.fin) });
}

// Roue du jour : écart en jours (≤ 0) avec aujourd'hui.

export const valeursJoursHoraires = (): number[] => Array.from({ length: JOURS_HORAIRES }, (_, i) => i - (JOURS_HORAIRES - 1));

/** Écart en jours entre le jour de `ms` et celui de `maintenant`, ramené dans la roue (au plus 0, au moins -89). */
export function ecartJourRoue(ms: number, maintenant: number): number {
  const a = parties(debutJour(maintenant).getTime() + 43_200_000);
  const b = parties(debutJour(ms).getTime() + 43_200_000);
  const e = Math.round((Date.UTC(b.an, b.mois, b.jour) - Date.UTC(a.an, a.mois, a.jour)) / 86_400_000);
  return Math.max(-(JOURS_HORAIRES - 1), Math.min(0, e));
}

/** Instant du jour (écart avec aujourd'hui) à l'heure et la minute données. */
export function instantRoues(ecart: number, heures: number, minutes: number, maintenant: number): number {
  const auj = parties(maintenant);
  return deMurale(new Date(auj.an, auj.mois, auj.jour + ecart, heures, minutes));
}

export function libelleJourHoraires(ecart: number, maintenant: number): string {
  if (ecart === 0) return t("communs.aujourdhui");
  if (ecart === -1) return t("communs.hier");
  if (ecart === -2) return t("communs.avantHier");
  return jourSemaineMois(ajouterJours(maintenant, ecart));
}

/** « mar. 3 nov., 15:30 » ou « Aujourd'hui, 15:30 » : un instant avec son jour. */
export function instantAvecJour(ms: number, maintenant: number): string {
  return t("communs.dateHeure", { jour: libelleJourHoraires(ecartJourRoue(ms, maintenant), maintenant), heure: heure(ms) });
}

// Effets d'un changement de jour : point du jour, série, nuit.

export type GenreHoraires = "seance" | "recup" | "nuit";

export interface Effet {
  genre: GenreHoraires;
  /** Jour (minuit) avant et après : le jour du début, et pour une nuit le jour du réveil (la fin). */
  jourAvant: number;
  jourApres: number;
  /** Séance : c'était la seule activité d'effort de son jour (le point la suit). */
  seulAvant: boolean;
  /** Série en semaines avant et après (la série est recalculée en entier, jamais incrémentée). */
  serieAvant: number;
  serieApres: number;
}

/** « vendredi 6 » : le jour de la semaine et le quantième. */
export const jourEtNumero = (ms: number): string => `${formater(ms, { weekday: "long" })} ${parties(ms).jour}`;

const memeJour = (a: number, b: number) => debutJour(a).getTime() === debutJour(b).getTime();

/** La phrase d'un changement de jour sous les roues ; null quand le jour ne change pas. */
export function phraseEffet(e: Effet, maintenant: number): string | null {
  if (memeJour(e.jourAvant, e.jourApres)) return null;
  if (e.genre === "recup") return t("horaires.effet.recup");
  if (e.genre === "nuit") {
    return memeJour(e.jourApres, maintenant)
      ? t("horaires.effet.nuitAujourdhui")
      : t("horaires.effet.nuitJour", { jour: jourEtNumero(e.jourApres) });
  }
  const point = e.seulAvant
    ? t("horaires.effet.pointPasse", { avant: jourEtNumero(e.jourAvant), apres: jourEtNumero(e.jourApres) })
    : t("horaires.effet.pointAllume", { apres: jourEtNumero(e.jourApres) });
  const serie =
    e.serieAvant !== e.serieApres
      ? t("horaires.effet.seriePasse", { avant: e.serieAvant, apres: e.serieApres })
      : e.serieAvant > 1
        ? t("horaires.effet.serieReste", { n: e.serieAvant })
        : e.serieAvant === 1
          ? t("horaires.effet.serieResteUne")
          : null;
  return serie ? `${point} ${serie}` : point;
}

/** Séance de sport ou GPS : une seule série, de durée ; la série est la séance (elle suit l'enveloppe, « Modifier » ouvre la feuille Horaires). */
export const estSerieUnique = (series: readonly { duree_s: number | null }[]): boolean => series.length === 1 && series[0]!.duree_s != null;

/** Les horaires diffèrent-ils de l'original (ligne « modifié », bouton « Rétablir ») ? */
export const modifie = (actuel: Horaires, original: Horaires | null): boolean =>
  original != null && (actuel.debut !== original.debut || actuel.fin !== original.fin);
