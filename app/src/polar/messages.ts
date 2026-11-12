// Message d'une connexion Polar ratée, comme pour Withings (withings/messages.ts) : seul un refus de l'utilisateur sur la page
// de Polar (« error=access_denied ») est un refus ; le reste vient de notre côté et propose Réessayer. Pur.
import { ErreurWhoop } from "../whoop/types";

export type CleMessageConnexion = "connexion.verifierIdentifiants" | "polar.connexion.refusee" | "polar.connexion.indisponible" | "whoop.erreur.limite";

export { codeRetour } from "../whoop/messages";

export function messageConnexion(e: unknown): { cle: CleMessageConnexion; reessayer: boolean } {
  const code = e instanceof ErreurWhoop ? e.code : null;
  if (code === "acces-refuse") return { cle: "polar.connexion.refusee", reessayer: false };
  // identifiants absents ou refusés à l'échange du code : ceux de la personne sont à revoir (identifiants/)
  if (code === "refuse" || code === "non-connecte") return { cle: "connexion.verifierIdentifiants", reessayer: false };
  if (code === "limite") return { cle: "whoop.erreur.limite", reessayer: true };
  return { cle: "polar.connexion.indisponible", reessayer: true };
}

/** Clé i18n de l'erreur gardée pour la ligne Polar de Connexions (codes d'ErreurWhoop). « refuse » : Polar a répondu 403,
 *  le plus souvent des consentements à accepter dans Polar Flow. */
export const cleErreur = (code: string) =>
  (["reseau", "expire", "non-connecte", "refuse"].includes(code) ? `polar.erreur.${code}` : code === "limite" ? "whoop.erreur.limite" : "whoop.erreur.serveur") as
    | "polar.erreur.reseau"
    | "polar.erreur.expire"
    | "polar.erreur.non-connecte"
    | "polar.erreur.refuse"
    | "whoop.erreur.limite"
    | "whoop.erreur.serveur";
