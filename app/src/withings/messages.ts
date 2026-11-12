// Message d'une connexion Withings ratée, comme pour Whoop (whoop/messages.ts) : seul un refus de l'utilisateur sur la page de
// Withings (« error=access_denied ») est un refus ; le reste vient de notre côté et propose Réessayer. Pur.
import { ErreurWhoop } from "../whoop/types";

export type CleMessageConnexion = "connexion.verifierIdentifiants" | "withings.connexion.refusee" | "withings.connexion.indisponible" | "whoop.erreur.limite";

export { codeRetour } from "../whoop/messages";

export function messageConnexion(e: unknown): { cle: CleMessageConnexion; reessayer: boolean } {
  const code = e instanceof ErreurWhoop ? e.code : null;
  if (code === "acces-refuse") return { cle: "withings.connexion.refusee", reessayer: false };
  // identifiants absents ou refusés à l'échange du code : ceux de la personne sont à revoir (identifiants/)
  if (code === "refuse" || code === "non-connecte") return { cle: "connexion.verifierIdentifiants", reessayer: false };
  if (code === "limite") return { cle: "whoop.erreur.limite", reessayer: true };
  return { cle: "withings.connexion.indisponible", reessayer: true };
}

/** Clé i18n de l'erreur gardée pour la ligne Withings de Connexions (codes d'ErreurWhoop). */
export const cleErreur = (code: string) =>
  (["reseau", "expire", "non-connecte", "refuse"].includes(code) ? `withings.erreur.${code}` : code === "limite" ? "whoop.erreur.limite" : "whoop.erreur.serveur") as
    | "withings.erreur.reseau"
    | "withings.erreur.expire"
    | "withings.erreur.non-connecte"
    | "withings.erreur.refuse"
    | "whoop.erreur.limite"
    | "whoop.erreur.serveur";
