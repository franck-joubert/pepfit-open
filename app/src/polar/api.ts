// API AccessLink v3 de Polar (https://www.polar.com/accesslink-api/), appelée par le téléphone avec le jeton de l'utilisateur
// (« Authorization: Bearer ») : les données de santé ne passent jamais par le serveur pepfit. Statuts : 200 bon ; 204 et 404
// rien pour ce jour ; 401 jeton refusé (révoqué : il faut se reconnecter) ; 403 consentements non acceptés chez Polar ;
// 429 trop de demandes (on attend) ; 5xx (on réessaie deux fois).
import { ErreurWhoop } from "../whoop/types";
import { BASE_API } from "./constantes";
import type { ActivitePolar, FcContinuePolar, NuitPolar, RechargePolar, SeancePolar } from "./types";

type Reponse = { status: number; json(): Promise<unknown> };
type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<Reponse>;

export interface ApiPolar {
  /** Inscrit l'utilisateur auprès de notre client (POST /v3/users) ; déjà inscrit (409) : bon aussi. */
  inscrire(membre: string): Promise<void>;
  /** Désinscrit l'utilisateur : Polar révoque alors le jeton (DELETE /v3/users/{id}). Déjà parti (404) : bon aussi. */
  desinscrire(userId: string): Promise<void>;
  /** Séances des 30 derniers jours, sans détail. */
  seances(): Promise<SeancePolar[]>;
  /** Une séance avec ses échantillons, ses zones et son tracé. */
  seance(id: string): Promise<SeancePolar | null>;
  /** FC continue d'un jour (AAAA-MM-JJ) ; null sans donnée. */
  fcJour(jour: string): Promise<FcContinuePolar | null>;
  /** Nuits des 28 derniers jours. */
  nuits(): Promise<NuitPolar[]>;
  /** Nightly Recharge des 28 derniers jours. */
  recharges(): Promise<RechargePolar[]>;
  /** Activité de chaque jour de [de, a] (28 jours au plus, 365 jours en arrière au plus). */
  activites(de: string, a: string): Promise<ActivitePolar[]>;
}

export interface DepsApi {
  acces(): Promise<string>;
  fetch?: Fetch;
  /** Attente entre deux essais (ms) ; remplaçable en test. */
  attendre?: (ms: number) => Promise<void>;
  base?: string;
}

export function creerApi(d: DepsApi): ApiPolar {
  const f = d.fetch ?? (fetch as unknown as Fetch);
  const attendre = d.attendre ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const base = d.base ?? BASE_API;

  /** Appel brut : la réponse si 2xx, 404 ou 409 ; lève sinon. */
  async function appeler(methode: string, chemin: string, corps?: object, essai = 0): Promise<Reponse> {
    const jeton = await d.acces();
    let r: Reponse;
    try {
      r = await f(base + chemin, {
        method: methode,
        headers: { Authorization: `Bearer ${jeton}`, Accept: "application/json", ...(corps ? { "Content-Type": "application/json" } : {}) },
        ...(corps ? { body: JSON.stringify(corps) } : {}),
      });
    } catch {
      throw new ErreurWhoop("reseau");
    }
    if (r.status >= 500 && essai < 2) {
      await attendre(1000 * 2 ** essai);
      return appeler(methode, chemin, corps, essai + 1);
    }
    if (r.status === 429) {
      if (essai >= 3) throw new ErreurWhoop("limite");
      await attendre(Math.min(5000 * 2 ** essai, 60_000));
      return appeler(methode, chemin, corps, essai + 1);
    }
    if (r.status === 401) throw new ErreurWhoop("expire", chemin);
    if ((r.status >= 200 && r.status < 300) || r.status === 404 || r.status === 409) return r;
    throw new ErreurWhoop(r.status >= 500 ? "serveur" : "refuse", `${chemin} ${r.status}`);
  }

  /** GET JSON : null pour « rien » (204, 404). */
  async function lire<T>(chemin: string): Promise<T | null> {
    const r = await appeler("GET", chemin);
    if (r.status === 204 || r.status === 404) return null;
    return (await r.json().catch(() => null)) as T | null;
  }

  return {
    async inscrire(membre) {
      await appeler("POST", "/v3/users", { "member-id": membre });
    },
    async desinscrire(userId) {
      await appeler("DELETE", `/v3/users/${encodeURIComponent(userId)}`);
    },
    async seances() {
      const l = await lire<SeancePolar[]>("/v3/exercises");
      return Array.isArray(l) ? l : [];
    },
    seance: (id) => lire<SeancePolar>(`/v3/exercises/${encodeURIComponent(id)}?samples=true&zones=true&route=true`),
    fcJour: (jour) => lire<FcContinuePolar>(`/v3/users/continuous-heart-rate/${jour}`),
    async nuits() {
      const r = await lire<{ nights?: NuitPolar[] }>("/v3/users/sleep");
      return Array.isArray(r?.nights) ? r.nights : [];
    },
    async recharges() {
      const r = await lire<{ recharges?: RechargePolar[] }>("/v3/users/nightly-recharge");
      return Array.isArray(r?.recharges) ? r.recharges : [];
    },
    async activites(de, a) {
      const l = await lire<ActivitePolar[]>(`/v3/users/activities?from=${de}&to=${a}`);
      return Array.isArray(l) ? l : [];
    },
  };
}
