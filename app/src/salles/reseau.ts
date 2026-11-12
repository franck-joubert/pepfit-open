import {
  ErreurLieux, lireOverpass, lirePhoton, RAYON_AUTOUR_M, RAYON_SPORT_M, reponseOverpassValide, requeteOverpass, SERVEURS_OVERPASS, urlPhoton,
  variantesRecherche, type Limites, type Position, type SalleOSM,
} from "./osm";

// Appels à Overpass (« Autour de moi ») et à Photon (recherche par nom) : une requête courte, un User-Agent propre, un délai
// (les serveurs publics sont limités). La position est arrondie à 0,01° pour tout tiers (osm.ts). Un seul délai de 8 s pour
// toute la recherche ; le serveur suivant part dès que le précédent échoue ou après 2,5 s sans réponse, la première réponse
// gagne et coupe les autres. Sans aucune réponse, l'erreur dit pourquoi (pas de réseau ou serveurs saturés).

const ENTETES = { "User-Agent": "pepfit/0.1 (fit.pep.open ; appli de musculation)", Accept: "application/json" };
/** Recherche par nom (Photon) : au-delà, « Recherche indisponible ». */
const DELAI_MS = 8000;
/** Toute la recherche « Autour de moi », tous serveurs compris. */
export const DELAI_OVERPASS_MS = 8000;
/** Sans réponse d'un serveur Overpass après ce temps, le suivant part aussi (OpenStreetMap France répond en 2 à 4 s). */
export const RELAIS_OVERPASS_MS = 2500;
/** Toute la recherche « Autour de moi » (la garde de l'écran en tient compte). */
export const DELAI_AUTOUR_MS = DELAI_OVERPASS_MS;

type Chercher = typeof fetch;

async function demander(url: string, init: RequestInit = {}, delai = DELAI_MS, f: Chercher = fetch, arret = new AbortController()): Promise<unknown> {
  const minuteur = setTimeout(() => arret.abort(), delai);
  try {
    const r = await f(url, { ...init, headers: { ...ENTETES, ...(init.headers ?? {}) }, signal: arret.signal });
    if (!r.ok) throw new ErreurLieux("serveurs", `HTTP ${r.status}`);
    try {
      return await r.json();
    } catch {
      throw new ErreurLieux("serveurs", "réponse illisible");
    }
  } catch (e) {
    if (e instanceof ErreurLieux) throw e;
    // fetch d'Android : « Network request failed » sans réseau ; AbortError au délai dépassé (serveur trop lent)
    throw new ErreurLieux(arret.signal.aborted ? "serveurs" : "reseau", String(e));
  } finally {
    clearTimeout(minuteur);
  }
}

/** Ce qu'on cherche autour : les sports d'OSM de la séance (sportsOSM) et le nom donné à leurs terrains sans nom. */
export interface DemandeAutour {
  sports?: readonly string[];
  sansNom?: string;
}

/** Les rayons d'« Autour de moi » (mêmes valeurs qu'avant le 09/11) : la lecture ne garde que les lieux qui y sont. */
const LIMITES: Limites = { salles: RAYON_AUTOUR_M, sport: RAYON_SPORT_M };

export interface Delais {
  /** Toute la recherche Overpass (tous serveurs). */
  total: number;
  /** Attente avant d'essayer le serveur Overpass suivant. */
  relais: number;
}

/**
 * Lieux autour de `p` par les serveurs Overpass publics : la première réponse valide, en `delais.total` au plus. La
 * requête porte la position arrondie ; la lecture garde les lieux dans le rayon exact autour de la vraie position.
 */
export function sallesAutour(
  p: Position,
  demande: DemandeAutour = {},
  f: Chercher = fetch,
  serveurs: readonly string[] = SERVEURS_OVERPASS,
  delais: Delais = { total: DELAI_OVERPASS_MS, relais: RELAIS_OVERPASS_MS },
): Promise<SalleOSM[]> {
  const sports = demande.sports ?? [];
  const corps = `data=${encodeURIComponent(requeteOverpass(p, sports))}`;
  const init: RequestInit = { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: corps };
  return new Promise((ok, ko) => {
    const arrets: AbortController[] = [];
    let fini = false;
    let suivant = 0;
    let enCours = 0;
    let joint = false;
    let derniere = new ErreurLieux("serveurs", "aucun serveur");
    let relais: ReturnType<typeof setTimeout> | undefined;
    // `gagnant` : la requête qui a répondu, pas coupée ; les autres le sont
    const finir = (fin: () => void, gagnant?: AbortController) => {
      if (fini) return;
      fini = true;
      clearTimeout(limite);
      clearTimeout(relais);
      for (const a of arrets) if (a !== gagnant) a.abort();
      fin();
    };
    const limite = setTimeout(() => finir(() => ko(new ErreurLieux(joint ? "serveurs" : derniere.cause, `aucune réponse en ${delais.total} ms`))), delais.total);
    const lancer = () => {
      clearTimeout(relais);
      if (fini || suivant >= serveurs.length) return;
      const url = serveurs[suivant++]!;
      if (suivant < serveurs.length) relais = setTimeout(lancer, delais.relais);
      const arret = new AbortController();
      arrets.push(arret);
      enCours++;
      demander(url, init, delais.total, f, arret)
        .then((json) => {
          if (!reponseOverpassValide(json)) throw new ErreurLieux("serveurs", `${url} : remarque d'erreur`);
          finir(() => ok(lireOverpass(json, p, sports, demande.sansNom, LIMITES)), arret);
        })
        .catch((e) => {
          enCours--;
          if (fini) return;
          derniere = e instanceof ErreurLieux ? e : new ErreurLieux("serveurs", String(e));
          console.warn("overpass", url, derniere.message);
          if (derniere.cause !== "reseau") joint = true;
          if (suivant < serveurs.length) lancer();
          else if (enCours === 0) finir(() => ko(joint ? new ErreurLieux("serveurs", derniere.message) : derniere));
        });
    };
    lancer();
  });
}

/** Recherche par nom (Photon). */
export async function chercherSalles(q: string, p: Position | null, f: Chercher = fetch): Promise<SalleOSM[]> {
  // Saisie entière d'abord ; sans résultat, la saisie privée de ses derniers mots (« 4padel boulog » → « 4padel »), le filtre
  // sur les lieux de sport se fait alors à la lecture (lirePhoton), les proches en tête grâce à la position.
  const essais = variantesRecherche(q);
  let derniere: unknown = null;
  for (let i = 0; i < essais.length; i++) {
    try {
      const salles = lirePhoton(await demander(urlPhoton(essais[i]!, p, 20, i === 0), {}, DELAI_MS, f), p);
      if (salles.length) return salles;
    } catch (e) {
      derniere = e;
      if (i === essais.length - 1) throw e;
    }
  }
  if (derniere) throw derniere;
  return [];
}
