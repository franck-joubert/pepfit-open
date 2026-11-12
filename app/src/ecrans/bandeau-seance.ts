import type { SeanceDetail } from "../db";
import { t } from "../i18n/index";
import { ordreExecution } from "./ordre-seance";
import type { Chrono } from "./duree-seance";
import { ARRET_APRES_MS, cadenceAura, REPOS_APRES_MS } from "../ui/aura-calc";

export interface DonneesBandeau {
  id: string;
  titre: string;
  exercice: string | null;
  chrono: Chrono;
  seriesFaites: number;
  /** Suivi GPS (ou FC seule, tapis) en cours : la bulle montre son chrono et sa distance, et rouvre l'écran en direct (29/10). */
  suivi?: { gps: boolean };
}

/** Préfixe de l'id d'une bulle de suivi : l'abandon passe alors par le suivi, pas par la séance. */
export const BULLE_SUIVI = "suivi:";

/**
 * Bulle d'un suivi en cours (retour du 29/10) : seulement s'il tourne ou est en pause sans avoir été terminé
 * (après Terminer, son résumé est ouvert). Le chrono part de l'instantané du natif ; la bulle le suit ensuite en direct.
 */
export function resumerSuivi(
  l: { suiviId: string; titre: string; seanceId?: string | null } | null,
  e: { id: string | null; statut: string; mode: string | null; tempsMs: number } | null,
  maintenant: number,
): DonneesBandeau | null {
  if (!l || l.seanceId || !e || e.statut === "arrete") return null;
  const pause = e.statut === "pause";
  return {
    id: `${BULLE_SUIVI}${e.id ?? l.suiviId}`,
    titre: l.titre,
    exercice: null,
    chrono: { debut: maintenant - e.tempsMs, pauseDebut: pause ? maintenant : null, pauseCumulS: 0 },
    seriesFaites: 0,
    suivi: { gps: e.mode !== "fc" },
  };
}

/** Ce que montre la barre flottante : le titre, l'exercice de la prochaine série à faire, le chrono. */
export function resumerSeance(s: SeanceDetail): DonneesBandeau {
  const ordre = ordreExecution(s);
  const active = ordre.find((x) => !x.faite);
  const exercice = active ? s.exercices.find((e) => e.exercice.id === active.exercice_id)?.exercice.nom ?? null : null;
  return {
    id: s.seance.id,
    titre: s.seance.titre ?? s.routineNom ?? t("seance.seance.titreDefaut"),
    exercice,
    chrono: { debut: s.seance.debut, pauseDebut: s.seance.pause_debut, pauseCumulS: s.seance.pause_cumul_s },
    seriesFaites: ordre.filter((x) => x.faite).length,
  };
}

/** Périmètre du trait centré d'un rectangle arrondi (l × h, rayon r) : sert aux pointillés de la bordure. */
export function perimetre(l: number, h: number, r: number): number {
  return 2 * (l - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
}

/** Décalage de pointillé d'une queue de comète de longueur `queue`, la tête étant à la fraction `p` (0..1) du tour. */
export function decalageComete(queue: number, p: number, total: number): number {
  "worklet";
  return queue - p * total;
}

/** Cadence de la comète : « pleine » (un tour par seconde, sans fin), « repos » (un tour de temps en temps), « fixe »
 *  (trait plein, plus aucune image). Même horloge que l'aura (temps depuis le dernier geste) ; fixe en mouvement réduit. */
export type CadenceComete = "pleine" | "repos" | "fixe";
export function cadenceComete(inactifMs: number, reduit: boolean): CadenceComete {
  if (reduit) return "fixe";
  const c = cadenceAura(inactifMs);
  return c === "arret" ? "fixe" : c;
}

/** Temps (ms) avant le prochain changement de cadence sans geste ; null une fois fixe. */
export function avantChangementComete(inactifMs: number, reduit: boolean): number | null {
  if (reduit || inactifMs >= ARRET_APRES_MS) return null;
  return (inactifMs < REPOS_APRES_MS ? REPOS_APRES_MS : ARRET_APRES_MS) - inactifMs;
}
