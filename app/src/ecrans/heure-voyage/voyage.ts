// Voyage (planche sommeil, D13, D14, écrans c3, c5b, c5c) : décalage entre chez soi et le lieu, plan de coucher, de lever,
// de lumière et de repas (CDC, Eastman & Burgess 2009, Wehrens 2017 ; NOTES § 4), arrivée vue au changement de fuseau
// du téléphone. Pur : les heures sont en minutes depuis le minuit du soir de la ligne, dans le fuseau de la ligne.
import { ajouterJ, ecartJ } from "../planification";
import type { Rythme } from "./changement-heure";
import { ecartFuseaux, instantDans, jourDans, MIN_JOUR } from "./horloge";

export interface Voyage {
  /** Fuseau du lieu (« America/New_York »). */
  destination: string;
  /** Fuseau de chez soi au moment de la saisie. */
  origine: string;
  /** Jour du départ (AAAA-MM-JJ, heure de chez soi). */
  aller: string;
  /** Jour du retour, null s'il n'est pas connu (voyage détecté). */
  retour: string | null;
  /** Préparer 2 jours avant (D13, segmenté de c3). */
  preparer: boolean;
  /** Voyage créé par le changement de fuseau du téléphone, pas saisi. */
  auto: boolean;
}

/** En dessous de 3 h de décalage, pas de plan (NOTES § 4, « seuil : 3 h », interprétation pepfit). */
export const SEUIL_MIN = 180;
/** Moins de 3 jours sur place : garder son heure (NOTES § 4). */
export const COURT_SEJOUR_JOURS = 3;
/** Préparation : 2 jours, 1 h par jour ; ½ h vers l'est pour les couche-tard (coucher à 0:30 ou après). */
export const JOURS_PREPA = 2;
export const PREPA_MIN = 60;
export const PREPA_EST_TARD_MIN = 30;
export const COUCHE_TARD = MIN_JOUR + 30;
/** Sur place : 1 h 30 par jour vers l'ouest, 1 h vers l'est (CDC). */
export const RYTHME_OUEST = 90;
export const RYTHME_EST = 60;
/** Au-delà de 8 h vers l'est : pas de lumière tôt les premiers jours (CDC). */
export const GRAND_EST_MIN = 480;
const LIGNES_MAX = 10;
/** Repas sur place, heures habituelles du lieu (Wehrens 2017 : à l'heure du lieu, dès l'avion). */
const DEJEUNER = 12 * 60 + 30;
const DINER = 19 * 60 + 30;

/** Décalage du lieu sur chez soi, en minutes, ramené entre − 12 h et + 12 h : New York depuis Paris = − 360. */
export function decalageVoyage(v: Pick<Voyage, "origine" | "destination">, ms: number): number {
  let d = ecartFuseaux(ms, v.origine, v.destination);
  while (d > 720) d -= MIN_JOUR;
  while (d <= -720) d += MIN_JOUR;
  return d;
}

export type Lieu = "chez" | "vol" | "lieu";
export type Plage = [number, number];

export interface LigneVoyage {
  /** Le jour de la ligne (le soir du coucher). */
  jour: string;
  lieu: Lieu;
  /** Fuseau des heures de la ligne. */
  fuseau: string;
  /** Coucher et lever (minutes depuis le minuit du soir : un lever à 7:30 vaut 1 890). */
  coucher: number;
  lever: number;
  /** Écart du coucher sur l'habitude, à l'heure de la ligne (+ 60 = 1 h plus tard). */
  ecart: number;
  /** Décalage qui reste à rattraper après cette nuit (minutes, ≥ 0). */
  reste: number;
  lumiere: Plage | null;
  eviter: Plage | null;
  repas: number[];
}

export interface PlanVoyage {
  decalage: number;
  ouest: boolean;
  /** Moins de 3 h : pas de plan. */
  sousSeuil: boolean;
  /** Moins de 3 jours : garder son heure. */
  court: boolean;
  /** Décalage gagné avant le départ. */
  prepa: number;
  lignes: LigneVoyage[];
}

/** Quel jour (AAAA-MM-JJ) le décalage est-il mesuré : midi du départ, heure de chez soi. */
const instantAller = (v: Voyage) => instantDans(v.aller, 12 * 60, v.origine);

export const estCourt = (v: Voyage): boolean => v.retour != null && ecartJ(v.aller, v.retour) < COURT_SEJOUR_JOURS;

/** Le plan du voyage, de la préparation jusqu'à la nuit où le décalage est rattrapé (10 lignes au plus). */
export function planVoyage(v: Voyage, rythme: Rythme): PlanVoyage {
  const decalage = decalageVoyage(v, instantAller(v));
  const ouest = decalage < 0;
  const amp = Math.abs(decalage);
  const sousSeuil = amp < SEUIL_MIN;
  const court = estCourt(v);
  const base = { decalage, ouest, sousSeuil, court };
  if (sousSeuil || court) return { ...base, prepa: 0, lignes: [] };

  // Le sens du corps : vers l'ouest, il faut se coucher plus tard (à l'heure de chez soi) ; vers l'est, plus tôt.
  const s = ouest ? 1 : -1;
  const lignes: LigneVoyage[] = [];
  const parJour = !v.preparer ? 0 : ouest || rythme.coucher < COUCHE_TARD ? PREPA_MIN : PREPA_EST_TARD_MIN;
  const jours = v.preparer ? JOURS_PREPA : 0;
  for (let k = 0; k < jours; k++) {
    const p = Math.min(amp, parJour * (k + 1));
    const coucher = rythme.coucher + s * p;
    const lever = rythme.lever + MIN_JOUR + s * p;
    lignes.push({
      jour: ajouterJ(v.aller, k - jours),
      lieu: "chez",
      fuseau: v.origine,
      coucher,
      lever,
      ecart: s * p,
      reste: amp - p,
      ...lumiereEtEviter(ouest, coucher, lever, amp, false),
      // Les repas suivent le coucher décalé : déjeuner 4 h 30 après le lever, dîner 3 h 45 avant le coucher.
      repas: [lever - MIN_JOUR + 270, coucher - 225, lever + 30],
    });
  }

  const prepa = jours ? Math.min(amp, parJour * jours) : 0;
  const rythmeLieu = ouest ? RYTHME_OUEST : RYTHME_EST;
  let reste = amp - prepa;
  for (let i = 0; lignes.length < LIGNES_MAX; i++) {
    const jour = ajouterJ(v.aller, i);
    if (v.retour && ecartJ(jour, v.retour) <= 0) break;
    reste = Math.max(0, amp - prepa - rythmeLieu * (i + 1));
    // À l'heure du lieu, le corps est encore en avance (ouest : sommeil plus tôt) ou en retard (est : plus tard).
    const ecart = -s * reste;
    const coucher = rythme.coucher + ecart;
    const lever = rythme.lever + MIN_JOUR + ecart;
    const vol = i === 0;
    lignes.push({
      jour,
      lieu: vol ? "vol" : "lieu",
      fuseau: v.destination,
      coucher,
      lever,
      ecart,
      reste,
      ...(reste > 0 || vol ? lumiereEtEviter(ouest, coucher, lever, amp, i < 2) : { lumiere: null, eviter: null }),
      repas: vol ? [DINER, lever + 30] : [DEJEUNER, DINER, lever + 30],
    });
    if (reste === 0) break;
  }
  return { ...base, prepa, lignes };
}

/**
 * Lumière (choix pepfit d'après le CDC et Eastman & Burgess 2009). Ouest : vive le soir jusqu'à 2 h 45 avant le coucher,
 * peu de lumière 2 h après le lever. Est : vive les 4 h après le lever, peu les 3 h avant le coucher ; au-delà de 8 h,
 * les deux premiers jours sur place, pas de lumière tôt (3 h après le lever), vive ensuite.
 */
function lumiereEtEviter(ouest: boolean, coucher: number, lever: number, amp: number, debut: boolean): { lumiere: Plage; eviter: Plage } {
  if (ouest) return { lumiere: [coucher - 405, coucher - 165], eviter: [lever, lever + 120] };
  if (amp > GRAND_EST_MIN && debut) return { lumiere: [lever + 180, lever + 420], eviter: [lever, lever + 180] };
  return { lumiere: [lever, lever + 240], eviter: [coucher - 180, coucher] };
}

/** Ligne du plan d'un soir donné (le jour s'entend à l'heure du lieu de la ligne). */
export const ligneVoyage = (p: PlanVoyage, jour: string): LigneVoyage | null => p.lignes.find((l) => l.jour === jour) ?? null;

export type MomentVoyage = "avant" | "prepa" | "surPlace" | "fini";

/** Où en est le voyage aujourd'hui (jour de chez soi avant le départ, du lieu ensuite). */
export function momentVoyage(v: Voyage, p: PlanVoyage, maintenant: number): MomentVoyage {
  const chez = jourDans(maintenant, v.origine);
  const debut = ajouterJ(v.aller, v.preparer && !p.court ? -JOURS_PREPA : -1);
  if (ecartJ(chez, debut) > 0) return "avant";
  if (ecartJ(chez, v.aller) > 0) return "prepa";
  const ici = jourDans(maintenant, v.destination);
  if (v.retour && ecartJ(ici, v.retour) <= 0) return "fini";
  const derniere = p.lignes[p.lignes.length - 1];
  if (!p.court && (!derniere || ecartJ(ici, derniere.jour) < 0)) return "fini";
  return "surPlace";
}

/** Le voyage est en cours (parti, pas rentré) : pour l'heure des séances (D14). */
export function enVoyage(v: Voyage | null, maintenant: number): boolean {
  if (!v) return false;
  if (ecartJ(v.aller, jourDans(maintenant, v.origine)) < 0) return false;
  return !v.retour || ecartJ(jourDans(maintenant, v.destination), v.retour) > 0;
}

/** Fuseau où tombent les séances planifiées (D14) : celui du lieu par défaut, celui de chez soi au choix pendant un voyage. */
export function fuseauDesSeances(choix: "lieu" | "maison", v: Voyage | null, maison: string | null, actif: string, maintenant: number): string {
  return choix === "maison" && maison && enVoyage(v, maintenant) ? maison : actif;
}

export interface EtatFuseau {
  maison: string | null;
  voyage: Voyage | null;
}

/** Un voyage détecté devient « chez soi » après 30 jours. */
export const INSTALLE_JOURS = 30;

/**
 * Le fuseau du téléphone a pu changer (ouverture, retour au premier plan) : arrivée d'un voyage (D13, c5c), retour à la
 * maison, ou déménagement. Renvoie l'état à garder.
 */
export function surFuseauAppareil(e: EtatFuseau, appareil: string, maintenant: number): EtatFuseau {
  if (!e.maison) return { maison: appareil, voyage: e.voyage };
  const ici = jourDans(maintenant, appareil);
  const ecartMaison = Math.abs(decalageVoyage({ origine: e.maison, destination: appareil }, maintenant));
  let { voyage } = e;
  if (voyage) {
    const fini = voyage.retour != null && ecartJ(jourDans(maintenant, voyage.destination), voyage.retour) < 0;
    const revenu = voyage.auto && ecartMaison === 0;
    if (fini || revenu) voyage = null;
  }
  if (voyage?.auto && ecartJ(voyage.aller, ici) > INSTALLE_JOURS) return { maison: appareil, voyage: null };
  if (ecartMaison >= SEUIL_MIN) {
    const memeLieu = voyage && decalageVoyage({ origine: voyage.destination, destination: appareil }, maintenant) === 0;
    if (!memeLieu) voyage = { destination: appareil, origine: e.maison, aller: ici, retour: null, preparer: false, auto: true };
  }
  return { maison: e.maison, voyage };
}

/** Le téléphone est à l'heure du lieu du voyage. */
export const aLHeureDuLieu = (v: Voyage, appareil: string, maintenant: number): boolean =>
  decalageVoyage({ origine: v.destination, destination: appareil }, maintenant) === 0;

const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Le voyage gardé en réglage (JSON) ; null s'il est absent ou illisible. */
export function lireVoyageTexte(s: string | null): Voyage | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s) as Partial<Voyage>;
    if (typeof v.destination !== "string" || typeof v.origine !== "string" || typeof v.aller !== "string" || !JOUR_RE.test(v.aller)) return null;
    const retour = typeof v.retour === "string" && JOUR_RE.test(v.retour) ? v.retour : null;
    return { destination: v.destination, origine: v.origine, aller: v.aller, retour, preparer: v.preparer !== false, auto: v.auto === true };
  } catch {
    return null;
  }
}
