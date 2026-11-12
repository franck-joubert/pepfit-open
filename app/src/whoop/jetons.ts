// Jetons Whoop sur le téléphone (expo-secure-store), jamais sur le serveur. Le refresh token TOURNE : à chaque
// renouvellement le nouveau est enregistré aussitôt, avant tout autre usage ; un seul renouvellement à la fois.
import { ErreurWhoop, type Jetons, type ReponseJeton } from "./types";

export interface Coffre {
  lire(cle: string): Promise<string | null>;
  ecrire(cle: string, valeur: string): Promise<void>;
  effacer(cle: string): Promise<void>;
}

/** Marge avant l'expiration où l'on renouvelle déjà. */
const MARGE_MS = 60_000;

export function enJetons(r: ReponseJeton, maintenant: number): Jetons {
  return { access_token: r.access_token, refresh_token: r.refresh_token, expire: maintenant + r.expires_in * 1000, scope: r.scope };
}

export function creerJetons(coffre: Coffre, cle: string, renouveler: (refresh: string) => Promise<ReponseJeton>, horloge: () => number = Date.now) {
  let envol: Promise<Jetons> | null = null;

  const lire = async (): Promise<Jetons | null> => {
    const t = await coffre.lire(cle);
    return t ? (JSON.parse(t) as Jetons) : null;
  };
  const enregistrer = (j: Jetons) => coffre.ecrire(cle, JSON.stringify(j));

  async function renouvelerMaintenant(actuels: Jetons): Promise<Jetons> {
    if (!actuels.refresh_token) throw new ErreurWhoop("expire");
    let r: ReponseJeton;
    try {
      r = await renouveler(actuels.refresh_token);
    } catch (e) {
      // refusé : le refresh est perdu (révoqué, déjà tourné) -> il faut se reconnecter ; réseau et autres : on réessaiera
      if (e instanceof ErreurWhoop && e.code === "refuse") {
        // Un autre renouvellement a pu tourner le refresh entre-temps (deux écrans au lancement, 08 et 09/11) : s'il a
        // déjà enregistré de nouveaux jetons, ce refus ne vaut rien, on garde les siens au lieu de déconnecter.
        const apres = await lire();
        if (apres && apres.refresh_token !== actuels.refresh_token) return apres;
        await coffre.effacer(cle);
        throw new ErreurWhoop("expire");
      }
      throw e;
    }
    const nouveaux = enJetons({ ...r, refresh_token: r.refresh_token ?? actuels.refresh_token, scope: r.scope ?? actuels.scope }, horloge());
    await enregistrer(nouveaux); // rotation : le nouveau refresh d'abord
    return nouveaux;
  }

  return {
    lire,
    enregistrer,
    effacer: () => coffre.effacer(cle),
    /** Jeton d'accès valable (renouvelé si besoin) ; `force` après un 401. */
    async accesValable(force = false): Promise<string> {
      const j = await lire();
      if (!j) throw new ErreurWhoop("non-connecte");
      if (!force && j.expire - MARGE_MS > horloge()) return j.access_token;
      envol ??= renouvelerMaintenant(j).finally(() => {
        envol = null;
      });
      return (await envol).access_token;
    },
  };
}
