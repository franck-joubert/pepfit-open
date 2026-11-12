// Message d'une connexion Whoop ratée (29/10) : un vrai refus de Whoop (« error=access_denied » au retour du navigateur)
// n'est jamais confondu avec des identifiants à revoir (client refusé, URL de retour différente) ni avec une panne (Whoop en
// 5xx, réseau, retour illisible) : celle-ci dit « réessaie dans un moment » et propose Réessayer. Pur, sans React Native (tests/whoop-messages.test.ts).
import { ErreurWhoop } from "./types";

export type CleMessageConnexion = "connexion.verifierIdentifiants" | "whoop.connexion.refusee" | "whoop.connexion.indisponible" | "whoop.erreur.limite";

const CLIENT_REFUSE = ["invalid_request", "invalid_client", "unauthorized_client", "invalid_scope", "redirect_uri_mismatch"];

/** Code d'erreur d'un retour `pepfitopen://whoop?error=…` : « access_denied » (OAuth) est un refus de l'utilisateur ; un client
 *  refusé, des identifiants à revoir. */
export const codeRetour = (erreur: string): ErreurWhoop["code"] => (erreur === "access_denied" ? "acces-refuse" : CLIENT_REFUSE.includes(erreur) ? "refuse" : "serveur");

export function messageConnexion(e: unknown): { cle: CleMessageConnexion; reessayer: boolean } {
  const code = e instanceof ErreurWhoop ? e.code : null;
  if (code === "acces-refuse") return { cle: "whoop.connexion.refusee", reessayer: false };
  // identifiants absents ou refusés à l'échange du code : ceux de la personne sont à revoir (identifiants/)
  if (code === "refuse" || code === "non-connecte") return { cle: "connexion.verifierIdentifiants", reessayer: false };
  if (code === "limite") return { cle: "whoop.erreur.limite", reessayer: true };
  // réseau, 5xx, state périmé, erreur inconnue : réessayer plus tard
  return { cle: "whoop.connexion.indisponible", reessayer: true };
}
