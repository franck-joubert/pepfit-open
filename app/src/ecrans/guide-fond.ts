// Course guidée réduite en bulle (retour du 29/10) : l'écran en direct se démonte, l'avancement des étapes et les
// annonces passent à GuideFond (monté à la racine). Sans React Native (testé dans tests/guide-fond.test.ts).
import { avancer, etatDesTours, fini, type Etape } from "./etapes-course";

/** L'écran en direct est monté : c'est lui qui avance les étapes (il montre aussi le bilan de l'étape finie). */
export const ecranDirect = { ouvert: false, /** Les étapes ont changé (test VMA relancé, D3) : GuideFond les relit. */ version: 0 };

/**
 * Faut-il poser un tour d'étape maintenant ? Suivi en cours, écran en direct fermé, cible de l'étape atteinte, et pas de tour
 * déjà demandé dont le natif n'a pas encore rendu la borne (`attendu` : nombre de tours attendu après la dernière demande).
 */
export function etapeAPasser(
  etapes: readonly Etape[] | null,
  e: { statut: string; tours: readonly { s: number; d: number }[]; distanceM: number; tempsMs: number },
  attendu: number,
): boolean {
  if (!etapes?.length || ecranDirect.ouvert || e.statut !== "en_cours" || e.tours.length < attendu) return false;
  const g = etatDesTours(e.tours);
  return !fini(etapes, g) && avancer(etapes, g, e.distanceM, e.tempsMs / 1000).change;
}
