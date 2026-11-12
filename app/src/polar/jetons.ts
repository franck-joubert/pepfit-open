// Jeton Polar sur le téléphone : ni renouvellement (le jeton v3 vaut environ un an, sans refresh), ni serveur.
import type { JetonRecu } from "../oauth/client";
import type { Coffre } from "../whoop/jetons";
import { ErreurWhoop } from "../whoop/types";
import type { JetonsPolar } from "./types";

export const enJetons = (r: JetonRecu, maintenant: number): JetonsPolar => ({
  access_token: r.access_token,
  expire: maintenant + (Number(r.expires_in) || 31535999) * 1000,
  user_id: r.userId,
});

/** Jetons Polar dans le coffre du téléphone. Expiré (au bout d'environ un an) : il faut se reconnecter. */
export function creerJetons(coffre: Coffre, cle: string, horloge: () => number = Date.now) {
  const lire = async (): Promise<JetonsPolar | null> => {
    const t = await coffre.lire(cle);
    return t ? (JSON.parse(t) as JetonsPolar) : null;
  };
  return {
    lire,
    enregistrer: (j: JetonsPolar) => coffre.ecrire(cle, JSON.stringify(j)),
    effacer: () => coffre.effacer(cle),
    async accesValable(): Promise<string> {
      const j = await lire();
      if (!j) throw new ErreurWhoop("non-connecte");
      if (j.expire <= horloge()) throw new ErreurWhoop("expire");
      return j.access_token;
    },
  };
}
