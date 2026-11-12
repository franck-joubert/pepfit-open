// Arrivée sur Santé : quand jouer l'entrée, dans quel ordre, sur quelle durée (sans rien de React Native ; l'animation est
// dans sante-entree.tsx).
import { santeEntree as E } from "../theme/mouvement";

/** Fin de l'horloge (ms) : la dernière vignette posée. */
export const FIN_ENTREE = E.debutCases + 6 * E.ecart + E.case;

/** Signature des valeurs montrées : l'entrée se rejoue quand elle change. */
export function signatureCases(cases: readonly { id: string; valeur: string; suite?: string | null; ecart?: number | null; point?: string | null }[]): string {
  return cases.map((k) => `${k.id}=${k.valeur}|${k.suite ?? ""}|${k.ecart ?? ""}|${k.point ?? ""}`).join(";");
}

/** Rang de chaque vignette dans l'entrée : de haut en bas, la gauche avant la droite à hauteur égale. */
export function rangs(cases: readonly { id: string; y: number; cote: "g" | "d" }[]): Record<string, number> {
  const tri = [...cases].sort((a, b) => a.y - b.y || (a.cote === b.cote ? 0 : a.cote === "g" ? -1 : 1));
  return Object.fromEntries(tri.map((k, i) => [k.id, Math.min(i, 6)]));
}

/** Valeurs lues après une entrée jouée sans elles (attente écoulée). */
const ATTENTE = "…";

export interface EtatEntree {
  /** Le corps a sa première image. */
  pret: boolean;
  /** Les données de la page sont lues. */
  charge: boolean;
  /** L'attente maximale du premier affichage est écoulée. */
  attendu: boolean;
  signature: string;
}

/**
 * Faut-il jouer l'entrée ? `montre` : valeurs déjà montrées dans la session (null : Santé jamais affiché). Première fois : dès
 * que le corps est dessiné et les données lues, avant la fin de l'attente ; l'attente écoulée, l'entrée est déjà partie d'elle-même
 * sur le fil UI (useEntreeSante) : on retient seulement ce qui est montré. Ensuite, quand les valeurs changent (jour choisi,
 * nouvelle mesure), pas au retour d'onglet ; des valeurs arrivées après une entrée jouée sans elles se posent en place.
 */
export function decisionEntree(montre: string | null, e: EtatEntree): { jouer: boolean; montre: string | null } {
  if (montre == null) {
    if (e.attendu) return { jouer: false, montre: e.charge ? e.signature : ATTENTE };
    if (e.pret && e.charge) return { jouer: true, montre: e.signature };
    return { jouer: false, montre };
  }
  if (e.signature === montre || !e.charge) return { jouer: false, montre };
  return { jouer: montre !== ATTENTE, montre: e.signature };
}
