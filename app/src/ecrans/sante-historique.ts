// Reprise de l'historique de Santé Connect (3/11) : sans la permission « historique » (READ_HEALTH_DATA_HISTORY), Santé Connect
// ne rend rien d'antérieur aux 30 jours d'avant la première autorisation. Accordée, l'import ordinaire (30 derniers jours,
// importerSante) est complété en remontant le temps par tranches : mesures du corps et pesées rangées dans la base comme
// l'import. Sans rafale : quelques tranches par passage, lues l'une après l'autre avec une pause, et un passage au plus toutes
// les 5 min (celui de l'import). Reprise sur interruption : le point atteint est écrit après chaque tranche ; une tranche
// coupée (appli fermée, lecture en échec) est relue au passage suivant, sans doublon (écritures idempotentes).
import { ajouterMesures, ajouterPeseesSante, importPoidsActif, lireReglage, TYPES_MESURE_CORPS, type Executeur } from "../db/api";
import { ecrireReglage } from "../db/depots/reglages";
import { sante } from "../natif/sante/index";
import type { Sante } from "../natif/sante/types";

const JOUR = 86_400_000;
/** Réglage local (jamais synchronisé : chaque téléphone a son Santé Connect) : où en est la reprise. */
export const CLE_REPRISE = "sante_historique";
/** L'import ordinaire couvre déjà les 30 derniers jours : la reprise commence avant. */
export const FENETRE_IMPORT_MS = 30 * JOUR;
/** Une tranche : 90 jours. Les mesures du corps sont rares (une ou deux par jour au plus) : bien en dessous du plafond de
 * 5 000 enregistrements par lecture du module natif. */
export const TRANCHE_MS = 90 * JOUR;
/** Un passage lit au plus 4 tranches (un an), séparées de 1,5 s : 9 lectures par tranche, jamais en même temps. */
export const TRANCHES_PAR_PASSAGE = 4;
export const PAUSE_TRANCHES_MS = 1_500;
/** On ne remonte pas au-delà de 10 ans avant le début de la reprise (Santé Connect date de 2022 ; une appli peut y avoir déposé
 * son propre historique). */
export const PROFONDEUR_MS = 10 * 365 * JOUR;

export interface EtatReprise {
  /** Tout ce qui est après ce point (ms) est lu. */
  jusqua: number;
  /** Fond de la reprise, fixé à son début. */
  plancher: number;
  /** Fin de la reprise (ms), null tant qu'elle remonte. */
  finiLe: number | null;
}

export async function lireReprise(db: Executeur): Promise<EtatReprise | null> {
  try {
    const e = JSON.parse((await lireReglage(db, CLE_REPRISE)) ?? "null") as Partial<EtatReprise> | null;
    return e && Number.isFinite(e.jusqua) && Number.isFinite(e.plancher) ? { jusqua: e.jusqua!, plancher: e.plancher!, finiLe: Number.isFinite(e.finiLe) ? e.finiLe! : null } : null;
  } catch {
    return null;
  }
}

const attendre = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/**
 * Un passage de la reprise : rien sans la permission « historique » ou une fois la reprise finie. Renvoie le nombre de valeurs
 * ajoutées. Une lecture en échec lève : la tranche en cours n'est pas comptée, le passage suivant la relit.
 */
export async function reprendreHistoriqueSante(
  db: Executeur,
  { s = sante, maintenant = Date.now(), pause = attendre, tranches = TRANCHES_PAR_PASSAGE }: { s?: Sante; maintenant?: number; pause?: (ms: number) => Promise<void>; tranches?: number } = {},
): Promise<number> {
  if (!s.mesuresEntre || !s.peseesEntre) return 0;
  let e = (await lireReprise(db)) ?? { jusqua: maintenant - FENETRE_IMPORT_MS, plancher: maintenant - PROFONDEUR_MS, finiLe: null };
  if (e.finiLe != null) return 0;
  const poids = await importPoidsActif(db);
  let n = 0;
  for (let i = 0; i < tranches && e.jusqua > e.plancher; i++) {
    if (i > 0) await pause(PAUSE_TRANCHES_MS);
    // relue à chaque tranche (gardée 30 s) : retirée en cours de route, Santé Connect rendrait des tranches vides sans erreur
    if (!(await s.autorisees()).includes("historique")) break;
    const debut = Math.max(e.plancher, e.jusqua - TRANCHE_MS);
    for (const type of TYPES_MESURE_CORPS) {
      const l = await s.mesuresEntre(type, debut, e.jusqua);
      if (l?.length) n += await ajouterMesures(db, type, l, "sante_connect", maintenant);
    }
    if (poids) {
      const l = await s.peseesEntre(debut, e.jusqua);
      if (l?.length) n += await ajouterPeseesSante(db, l);
    }
    e = { ...e, jusqua: debut, finiLe: debut <= e.plancher ? maintenant : null };
    await ecrireReglage(db, CLE_REPRISE, JSON.stringify(e));
  }
  return n;
}

/** Ligne « Historique complet » de Connexions : à autoriser, autorisé sans reprise commencée, en cours (point atteint), fini. */
export type EtatHistorique = { etat: "a-autoriser" } | { etat: "attente" } | { etat: "en-cours"; jusqua: number } | { etat: "fini" };

export function etatHistorique(autorisee: boolean, r: EtatReprise | null): EtatHistorique {
  if (!autorisee) return { etat: "a-autoriser" };
  if (!r) return { etat: "attente" };
  return r.finiLe != null ? { etat: "fini" } : { etat: "en-cours", jusqua: r.jusqua };
}
