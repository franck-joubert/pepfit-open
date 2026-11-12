// Changement d'heure (planche sommeil, D12, écrans c1, c2, c5a) : la date vient du fuseau lui-même (Intl), jamais d'une
// table ; le plan décale le coucher de 20 min par soir (AASM 2019, INSV ; NOTES § 4). Pur.
import type { NuitStat } from "../mesures/sommeil-stats";
import { ajouterJ, ecartJ } from "../planification";
import { arrondi5, instantDans, jourDans, minutesDans, MIN_JOUR } from "./horloge";
import { decalageMin } from "../../i18n/temps";

const JOUR_MS = 86_400_000;
const MINUTE = 60_000;
/** Pas du plan : 20 min par soir (AASM, INSV). */
export const PAS_MIN = 20;
/** Le bandeau paraît le jeudi d'avant un changement du dimanche : 3 jours avant. */
export const JOURS_AVANT = 3;

export interface Changement {
  /** Premier instant à la nouvelle heure. */
  instant: number;
  /** Décalage UTC avant et après (minutes). */
  avant: number;
  apres: number;
  /** + 60 au printemps (heure d'été : une heure de moins), − 60 à l'automne. */
  delta: number;
  ete: boolean;
  /** Jour local du changement (AAAA-MM-JJ). */
  jour: string;
  /** L'heure qui saute : « à 2 h (heureAvant), il sera 3 h (heureApres) ». Minutes depuis minuit. */
  heureAvant: number;
  heureApres: number;
}

/** Prochain changement de décalage du fuseau `z` après `depuis`, dans les `horizon` jours ; null sans changement. */
export function prochainChangement(depuis: number, z: string, horizon = 60): Changement | null {
  depuis = Math.floor(depuis / MINUTE) * MINUTE;
  const d0 = decalageMin(depuis, z);
  for (let i = 1; i <= horizon; i++) {
    const t = depuis + i * JOUR_MS;
    if (decalageMin(t, z) === d0) continue;
    // Le changement est dans ce jour : à la minute près, par dichotomie.
    let bas = t - JOUR_MS;
    let haut = t;
    while (haut - bas > MINUTE) {
      const mi = bas + Math.floor((haut - bas) / 2 / MINUTE) * MINUTE;
      if (decalageMin(mi, z) === d0) bas = mi;
      else haut = mi;
    }
    const apres = decalageMin(haut, z);
    const avant = d0;
    return {
      instant: haut,
      avant,
      apres,
      delta: apres - avant,
      ete: apres > avant,
      jour: jourDans(haut, z),
      heureAvant: minutesDans(haut - MINUTE, z) + 1,
      heureApres: minutesDans(haut, z),
    };
  }
  return null;
}

/** Le changement à montrer aujourd'hui (du jeudi au dimanche pour un changement du dimanche), sinon null. */
export function changementProche(maintenant: number, z: string): Changement | null {
  const auj = jourDans(maintenant, z);
  const c = prochainChangement(instantDans(auj, 0, z), z, JOURS_AVANT + 2);
  if (!c) return null;
  const e = ecartJ(auj, c.jour);
  return e >= 0 && e <= JOURS_AVANT ? c : null;
}

/** Rythme habituel : coucher en minutes depuis le minuit du soir (1 425 = 23:45, 1 470 = 0:30), lever depuis le minuit du matin. */
export interface Rythme {
  coucher: number;
  lever: number;
}

/** Moyenne des 7 dernières nuits mesurées, aux 5 min ; null sous 3 nuits. */
export function rythmeHabituel(nuits: readonly NuitStat[]): Rythme | null {
  const l = [...nuits].sort((a, b) => b.jour - a.jour).slice(0, 7);
  if (l.length < 3) return null;
  const moy = (f: (n: NuitStat) => number) => l.reduce((s, n) => s + f(n), 0) / l.length;
  return { coucher: arrondi5(moy((n) => n.coucher) + MIN_JOUR), lever: arrondi5(moy((n) => n.lever)) };
}

export interface LigneChangement {
  /** Le soir de la ligne. */
  jour: string;
  /** Décalage du coucher par rapport à l'habitude (− 20 = 20 min plus tôt) ; 0 pour le soir du changement. */
  decalage: number;
  /** Coucher conseillé (minutes depuis le minuit du soir), null sans rythme connu. */
  coucher: number | null;
  /** Lever du lendemain, à l'heure de l'horloge de ce matin-là. */
  lever: number | null;
  /** Le lever du lendemain est déjà à la nouvelle heure. */
  nouvelle: boolean;
  /** Le soir du changement : on reprend son heure, à la nouvelle heure. */
  fin: boolean;
}

/**
 * Plan du jeudi au dimanche : 20 min par soir. Heure d'été : 20, 40, 60 min plus tôt ; heure d'hiver : 20 et 40 min plus
 * tard jeudi et vendredi, puis on garde 40 samedi (NOTES § 4 : « 20 min plus tard jeudi et vendredi »).
 */
export function planChangement(c: Changement, rythme: Rythme | null): LigneChangement[] {
  const amp = Math.abs(c.delta);
  const sens = c.ete ? -1 : 1;
  const pas = Math.ceil(amp / PAS_MIN);
  const n = c.ete ? pas : Math.min(2, pas);
  const lignes: LigneChangement[] = [];
  for (let k = 0; k <= JOURS_AVANT; k++) {
    const jour = ajouterJ(c.jour, k - JOURS_AVANT);
    const fin = k === JOURS_AVANT;
    const decalage = fin ? 0 : sens * Math.min(amp, PAS_MIN * Math.min(k + 1, n));
    // Le lendemain matin est-il après le changement ? Alors l'horloge a bougé de delta.
    const nouvelle = !fin && ecartJ(ajouterJ(jour, 1), c.jour) <= 0;
    lignes.push({
      jour,
      decalage,
      fin,
      nouvelle,
      coucher: rythme ? rythme.coucher + decalage : null,
      lever: rythme ? rythme.lever + (fin ? 0 : decalage + (nouvelle ? c.delta : 0)) : null,
    });
  }
  return lignes;
}

/** La ligne du plan pour ce soir (null si aujourd'hui n'est pas dans le plan). */
export const ligneDuJour = (plan: readonly LigneChangement[], jour: string): LigneChangement | null =>
  plan.find((l) => l.jour === jour) ?? null;
