// Identifiant d'un circuit : 15 caractères [a-z0-9] (comme les identifiants de PocketBase : le serveur reprend celui du téléphone
// quand le circuit est publié, serveur/pb_hooks/circuits.js, ID). Ce n'est pas un secret : le circuit publié est public.
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export const ID_CIRCUIT = /^[a-z0-9]{15}$/;

/** `alea` : un tirage dans [0, 1[ (Math.random ; une suite fixe dans les tests). */
export function idCircuit(alea: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 15; i++) s += ALPHABET[Math.min(ALPHABET.length - 1, Math.floor(alea() * ALPHABET.length))];
  return s;
}

/** D'où vient le circuit d'une sortie : « sortie/<id de la séance> » (un circuit par sortie, `circuitDeSortie`). */
export const sourceRefSortie = (seanceId: string): string => `sortie/${seanceId}`;
