// Badges de la page Réglages et de sa porte dans le volet (planche menu, règle 4 et D11) : un point rouge n'apparaît que pour
// une panne qu'on peut réparer soi-même (reconnecter Whoop ou Withings) ; une panne passagère (réseau, serveur, limite) se dit
// sur sa ligne, sans badge. Pur (testé dans tests/menu-inventaire.test.ts).

/** Codes d'erreur gardés par Whoop et Withings (ErreurWhoop) qui se règlent en reconnectant le service. */
const A_RECONNECTER = new Set(["expire", "refuse", "acces-refuse", "non-connecte"]);

export const aReconnecter = (erreur: string | null | undefined) => !!erreur && A_RECONNECTER.has(erreur);

type Service = { connecte: boolean; erreur: string | null } | null;

/** Le service à reconnecter, s'il y en a un (Whoop d'abord) : il remonte jusqu'à la porte Réglages du volet. */
export function serviceAReconnecter(whoop: Service, withings: Service): "whoop" | "withings" | null {
  if (whoop && aReconnecter(whoop.erreur)) return "whoop";
  if (withings && aReconnecter(withings.erreur)) return "withings";
  return null;
}
