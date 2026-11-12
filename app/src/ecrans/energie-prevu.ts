// Le prévu de la page Énergie (demande d'Alex du 04/11 : « sur le jour en cours, le réel en plein, le prévu en pointillé ») :
// ce qui reste à venir jusqu'à minuit, à côté du réel de bilanJour (energie-calc.ts), jamais dedans. Le reste du métabolisme
// de base, les séances prévues au planning pas encore faites (leurs kcal à la même formule que l'activité faite), les pas
// habituels du reste de la journée et la digestion attendue ; côté apports, les apports habituels pas encore notés. Le solde
// réel n'en dépend pas : le solde prévu à minuit s'écrit à part. Jour passé : aucun prévu. Pur (tests/energie-prevu.test.ts).
import { eatSeance, KCAL_PAR_PAS, PART_DIGESTION, type BilanJour } from "./energie-calc";
import { PAS_DEFAUT } from "./energie-precision";
import type { CorpsKcal } from "./kcal-seance";
import { habituelA } from "./mesures/pas-calc";
import { faite, isoDe, type Occurrence, type SeanceJour as SeancePlanning } from "./planification";

/** Une séance prévue du jour, pas encore faite. */
export interface SeancePrevue {
  routineId: string;
  nom: string;
  /** Heure prévue (« 18:00 »). */
  heure: string;
  /** Durée estimée de la routine ; 0 : inconnue (aucune kcal comptée, rien d'inventé). */
  minutes: number;
  /** Sport de la routine (« cat:padel ») ; null : la musculation. */
  sportId: string | null;
}

/**
 * Séances prévues du jour `date` (AAAA-MM-JJ) pas encore faites. `occ` : les occurrences du planning (une séance retirée n'y
 * est plus, une séance décalée y est à son nouveau jour) ; `seances` : l'historique du planning ; `reelles` : les séances
 * déjà comptées dans le bilan du jour (une séance d'une autre appli ou une activité détectée du même sport, sur le créneau,
 * vaut la séance prévue : jamais comptée deux fois).
 */
export function seancesPrevuesRestantes(
  occ: readonly Occurrence[],
  seances: readonly SeancePlanning[],
  date: string,
  noms: ReadonlyMap<string, string>,
  reelles: readonly { id?: string; debut?: number; minutes: number; sportId?: string | null }[] = [],
): SeancePrevue[] {
  const minutesDuJour = (ms: number) => new Date(ms).getHours() * 60 + new Date(ms).getMinutes();
  const vues = new Set(seances.map((s) => s.id));
  const bilan: SeancePlanning[] = reelles
    .filter((s) => s.debut != null && !(s.id && vues.has(s.id)) && isoDe(new Date(s.debut)) === date)
    .map((s, i) => ({ id: `bilan:${i}`, routineId: null, date, faite: true, sport: s.sportId ?? null, debutMin: minutesDuJour(s.debut!), finMin: minutesDuJour(s.debut!) + s.minutes }));
  const toutes = [...seances, ...bilan];
  const ici = occ.filter((o) => o.date === date);
  return ici
    .filter((o) => !faite(o, toutes, ici))
    .map((o) => ({ routineId: o.routineId, nom: noms.get(o.routineId) ?? "", heure: o.heure, minutes: Math.max(0, o.dureeMin ?? 0), sportId: o.sport ?? null }));
}

/** Ce qu'on sait des pas d'habitude : 24 moyennes horaires (30 jours), sinon la moyenne d'une journée. */
export interface PasHabituels {
  horaire: readonly number[] | null;
  jour: number | null;
}

/**
 * Pas hors séances qu'il reste à faire jusqu'à minuit, à `avancement` (0 à 1) de la journée. Sans capteur (pas par défaut) : le
 * reste des 5 000 supposés ; avec le rythme heure par heure : ce qui reste d'habitude après cette heure ; sinon la journée
 * moyenne au prorata des heures qui restent ; sans rien : 0.
 */
export function pasRestants(avancement: number, defaut: boolean, h: PasHabituels | null): number {
  const reste = 1 - Math.min(1, Math.max(0, avancement));
  if (defaut) return PAS_DEFAUT * reste;
  if (h?.horaire?.length) {
    const fin = h.horaire.reduce((a, b) => a + b, 0);
    return Math.max(0, fin - habituelA(h.horaire, (1 - reste) * 24));
  }
  return h?.jour != null && h.jour > 0 ? h.jour * reste : 0;
}

export interface EntreePrevu {
  /** Le bilan réel du jour (bilanJour) ; null pour un jour à venir (rien de réel). */
  reel: BilanJour | null;
  /** Métabolisme de base de la journée entière. */
  bmrJour: number;
  /** Part de la journée écoulée : 1 pour un jour fini (aucun prévu), 0 pour un jour à venir. */
  avancement: number;
  seances: readonly SeancePrevue[];
  corps: CorpsKcal;
  /** Pas hors séances qui restent (pasRestants). */
  pas: number;
  kcalParPas?: number;
  partDigestion?: number;
  /** Apports habituels d'une journée (apportsHabitudes), null inconnus. */
  habitudes: number | null;
}

export interface Prevu {
  bmr: number;
  sport: number;
  neat: number;
  digestion: number;
  seances: (SeancePrevue & { kcal: number })[];
  /** Dépense encore prévue jusqu'à minuit (en plus du réel). */
  depense: number;
  /** Apports habituels pas encore notés (en plus du réel). */
  apports: number;
  /** Dépense de la journée à minuit : réel + prévu. */
  depenseMinuit: number;
  /** Apports à minuit : notés + habituels restants ; null sans journal ni habitude. */
  apportsMinuit: number | null;
  /** Solde prévu à minuit ; null sans apports à minuit. */
  soldeMinuit: number | null;
}

/** Le prévu jusqu'à minuit d'un jour en cours ou à venir ; null pour un jour fini. */
export function prevuJour(e: EntreePrevu): Prevu | null {
  const av = Math.min(1, Math.max(0, e.avancement));
  if (av >= 1) return null;
  const part = e.partDigestion ?? PART_DIGESTION;
  const kpp = e.kcalParPas ?? KCAL_PAR_PAS;
  const r = e.reel;
  // recalage par le poids : le prévu suit le même facteur que le réel (segmentsDepense)
  const formule = r ? r.depense.kcal - r.ajustement : 0;
  const k = r && formule > 0 ? r.depense.kcal / formule : 1;
  const seances = e.seances.map((s) => ({ ...s, kcal: s.minutes > 0 ? eatSeance({ nom: s.nom, minutes: s.minutes, sportId: s.sportId, origine: null, pas: null }, e.bmrJour, e.corps).kcal : 0 }));
  const bmr = e.bmrJour * (1 - av);
  const sport = seances.reduce((a, s) => a + s.kcal, 0);
  const neat = Math.max(0, e.pas) * kpp;
  const notes = r?.recharge?.source === "journal" ? (r.apports ?? 0) : 0;
  const apports = e.habitudes != null ? Math.max(0, e.habitudes - notes) : 0;
  // digestion attendue : celle des apports habituels pas encore notés ; journal vide, le réel en compte déjà la part écoulée
  // (bilanJour) ; sans habitude, la même part de la dépense que le réel
  const digestion =
    e.habitudes != null
      ? notes > 0
        ? apports * part
        : e.habitudes * part * (r ? 1 - av : 1)
      : notes > 0
        ? 0
        : ((bmr + sport + neat) * part) / (1 - part);
  const terme = (v: number) => v * k;
  const p = { bmr: terme(bmr), sport: terme(sport), neat: terme(neat), digestion: terme(digestion) };
  const depense = p.bmr + p.sport + p.neat + p.digestion;
  const depenseMinuit = (r?.depense.kcal ?? 0) + depense;
  const apportsMinuit = notes > 0 || e.habitudes != null ? notes + apports : null;
  return {
    ...p,
    seances: seances.map((s) => ({ ...s, kcal: terme(s.kcal) })),
    depense,
    apports,
    depenseMinuit,
    apportsMinuit,
    soldeMinuit: apportsMinuit != null ? apportsMinuit - depenseMinuit : null,
  };
}

/** Un jour à venir ne montre du prévu que s'il porte une séance prévue (sinon il reste vide, comme avant). */
export const prevuAffiche = (p: Prevu | null, aVenir: boolean): Prevu | null => (p && (!aVenir || p.seances.length > 0) ? p : null);
