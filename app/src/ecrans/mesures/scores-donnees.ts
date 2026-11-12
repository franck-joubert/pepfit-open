// Résumés de la Récupération pepfit (planche recuperation : son score à nous, recup-donnees.ts) et de l'Effort pepfit (planche
// effort-pepfit) pour l'Accueil et Santé ; les pages lisent recup-donnees.ts et sport-stats-donnees.ts. Jamais un score Whoop.
import type { Executeur } from "../../db/executeur";
import { lireSexe } from "../../db/depots/profil";
import { lireReglage } from "../../db/depots/reglages";
import { REGLAGE } from "../../whoop/constantes";
import { effortsSeancesJour } from "../effort-charges";
import { scoreSemaine, type Cible } from "../effort-pepfit";
import { isoJour, lireRecupJour } from "../recup-donnees";
import { RECUP, type NiveauRecup } from "../recup-pepfit";
import { chargesJournees, lireCible, lireEffortJour } from "../sport-stats-donnees";
import { decaler, minuit } from "./periodes";

export async function whoopConnecte(db: Executeur): Promise<boolean> {
  return (await lireReglage(db, REGLAGE.connecte).catch(() => null)) === "1";
}

// ---- Récupération ------------------------------------------------------------------------------------------------------

/** Résumé de la Récupération pepfit (planche recuperation) pour la carte d'Accueil et la case de Santé : jamais celle de Whoop. */
export interface ResumeRecup {
  /** Le score du matin (0 à 100), null sous 25 % de précision (rien de la nuit). */
  score: number | null;
  niveau: NiveauRecup | null;
  precision: number;
  /** Sous 40 % : la phrase prudente. */
  prudent: boolean;
  /** Profil au féminin : les mots s'accordent. */
  feminin: boolean;
  jour: number;
}

/** Le matin de `maintenant` ; null sans aucune nuit connue (ni score ni mesure de la nuit). */
export async function lireResumeRecup(db: Executeur, maintenant = Date.now()): Promise<ResumeRecup | null> {
  const jour = minuit(maintenant);
  const [r, sexe] = await Promise.all([lireRecupJour(db, jour), lireSexe(db).catch(() => null)]);
  if (r.score == null && !r.nuit) {
    const avant = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM recup_nuit WHERE jour >= ?", [isoJour(decaler(jour, -RECUP.norme.nuits))]).catch(() => null);
    if (!avant?.n) return null;
  }
  return { score: r.score, niveau: r.niveau, precision: r.precision, prudent: r.prudent, feminin: sexe === "f", jour };
}

// ---- Effort ------------------------------------------------------------------------------------------------------------

/** Résumé de l'Effort pepfit (planche effort-pepfit) pour la carte d'Accueil et la page Santé : jamais le score de Whoop. */
export interface ResumeEffort {
  /** Effort du jour (non arrondi : séances et activité de la journée), null sans rien de mesuré. */
  score: number | null;
  /** Au moins une séance estimée (« ~ »). */
  estime: boolean;
  /** La cible du jour (l'anneau la suit), null sans cible. */
  cible: Cible | null;
  /** La séance la plus chargée du jour. */
  activite: { nom: string; minutes: number } | null;
  /** Effort des 7 derniers jours (la courbe de la semaine, activité comprise), null sans rien de mesuré. */
  semaine: number | null;
}

export async function lireResumeEffort(db: Executeur, maintenant = Date.now()): Promise<ResumeEffort> {
  const auj = minuit(maintenant);
  const [jour, cible, efforts, charges] = await Promise.all([
    lireEffortJour(db, auj),
    lireCible(db, auj, maintenant).catch(() => null),
    effortsSeancesJour(db, auj),
    chargesJournees(db, decaler(auj, -6), decaler(auj, 1)).then((c) => c.totales),
  ]);
  const plus = [...efforts.values()].filter((e) => e != null).sort((a, b) => b.charge - a.charge)[0];
  const nom = plus
    ? await db
        .getFirstAsync<{ nom: string | null }>("SELECT COALESCE(s.titre, r.nom) AS nom FROM seances s LEFT JOIN routines r ON r.id = s.routine_id WHERE s.id = ?", [plus.seanceId])
        .catch(() => null)
    : null;
  const c7 = [...charges.values()].reduce((a, b) => a + b, 0);
  return {
    score: jour?.score ?? null,
    estime: jour?.estime ?? false,
    cible,
    activite: plus && nom?.nom ? { nom: nom.nom, minutes: Math.round(plus.minutes) } : null,
    semaine: c7 > 0 ? scoreSemaine(c7) : null,
  };
}
