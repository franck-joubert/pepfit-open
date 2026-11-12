// « Ma journée » de la page Entraînements (planche entrainements-capteurs, variante A, retenue le 28/10) : effort du jour,
// FC au repos, Whoop. Lectures en base seulement (testé par tests/effort-jour.test.ts) ; la dépense (Santé Connect) et les
// pas sont lus par l'écran.
import type { Executeur } from "../db/executeur";
import { derniereMesure } from "../db/depots/mesures";
import { lireReglage } from "../db/depots/reglages";
import { REGLAGE } from "../whoop/constantes";
import type { PermissionSante } from "../natif/sante/types";
import { lireEffortJour, type EffortJour } from "./sport-stats-donnees";

const JOUR_MS = 86_400_000;
/** Permission Santé Connect des pas (et nom de l'icône de la ligne « Montre ») : identifiants, pas du texte. */
export const PERMISSION_PAS: PermissionSante = "pas";
export const ICONE_MONTRE = "pas" as const;
/** FC au repos d'une mesure (Santé Connect) : valable 7 jours, comme la case de Santé. */
const VALIDITE_FC_REPOS_MS = 7 * JOUR_MS;

export interface Journee {
  /** Effort pepfit du jour (sport-stats-donnees.ts), null sans séance notée. */
  effort: EffortJour | null;
  fcRepos: { bpm: number; source: "whoop" | "mesure" } | null;
  /** Le score de Récupération de Whoop n'est plus lu (planche recuperation : celui de pepfit, recup-donnees.ts). */
  whoop: { connecte: boolean; derniereSynchro: number | null };
}

export async function lireJournee(db: Executeur, jour: number): Promise<Journee> {
  const [connecte, synchro, w, effort] = await Promise.all([
    lireReglage(db, REGLAGE.connecte),
    lireReglage(db, REGLAGE.derniereSynchro),
    db.getFirstAsync<{ fc_repos: number | null }>("SELECT fc_repos FROM whoop_jour WHERE jour = ?", [jour]),
    lireEffortJour(db, jour),
  ]);
  const whoopConnecte = connecte === "1";
  const finJour = jour + JOUR_MS - 1;
  const mesure = w?.fc_repos == null ? await derniereMesure(db, "fc", finJour) : null;
  const fcRepos =
    w?.fc_repos != null
      ? { bpm: Math.round(w.fc_repos), source: "whoop" as const }
      : mesure && finJour - mesure.date <= VALIDITE_FC_REPOS_MS
        ? { bpm: Math.round(mesure.valeur), source: "mesure" as const }
        : null;
  return {
    effort,
    fcRepos,
    whoop: { connecte: whoopConnecte, derniereSynchro: synchro ? Number(synchro) : null },
  };
}

