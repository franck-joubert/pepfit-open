// API officielle Whoop v2 (developer.whoop.com). Cloudflare exige un User-Agent de navigateur (sinon 403, code 1010).
import { ErreurWhoop, type Collection, type CorpsWhoop, type PageWhoop } from "./types";
import { lireEntetes, quotas as quotasTelephone, type Compteur } from "../quotas/compteur";

export const BASE_API = "https://api.prod.whoop.com/developer/v2";
export const UA_NAVIGATEUR = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

const CHEMINS: Record<Collection, string> = { recovery: "/recovery", cycle: "/cycle", sleep: "/activity/sleep", workout: "/activity/workout" };

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{ status: number; headers: { get(n: string): string | null }; json(): Promise<unknown> }>;

export interface ApiWhoop {
  /** `finIso` : borne haute de la période (relecture de l'historique) ; absente, jusqu'à maintenant. */
  page<T>(c: Collection, depuisIso: string, nextToken?: string | null, finIso?: string): Promise<PageWhoop<T>>;
  corps(): Promise<CorpsWhoop>;
  /** Révoque l'accès chez Whoop (DELETE /v2/user/access). */
  revoquer(): Promise<void>;
}

export interface DepsApi {
  acces(force?: boolean): Promise<string>;
  fetch?: Fetch;
  /** Attente entre deux essais (ms) ; remplaçable en test. */
  attendre?: (ms: number) => Promise<void>;
  base?: string;
  /** Compteur d'appels (quotas/compteur.ts) : celui du téléphone par défaut. */
  quotas?: Compteur;
  horloge?: () => number;
}

export function creerApi(d: DepsApi): ApiWhoop {
  const f = d.fetch ?? (fetch as unknown as Fetch);
  const attendre = d.attendre ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const base = d.base ?? BASE_API;
  const quotas = d.quotas ?? quotasTelephone;
  const horloge = d.horloge ?? Date.now;

  async function appeler(chemin: string, methode = "GET", essai = 0, renouvele = false): Promise<unknown> {
    const jeton = await d.acces(renouvele);
    // Limites de Whoop par application (100 par minute, 10 000 par jour) : attendre la minute suivante plutôt que provoquer
    // des 429, ne plus appeler quand le jour est épuisé.
    const garde = quotas.attenteAvant("whoop", horloge());
    if (garde.epuise) throw new ErreurWhoop("limite", "quota du jour de Whoop épuisé");
    if (garde.attendre_ms > 0) await attendre(Math.min(garde.attendre_ms, 60_000));
    quotas.noterAppel("whoop", horloge());
    let r;
    try {
      r = await f(base + chemin, { method: methode, headers: { Authorization: `Bearer ${jeton}`, "User-Agent": UA_NAVIGATEUR, Accept: "application/json" } });
    } catch {
      throw new ErreurWhoop("reseau");
    }
    quotas.noterReponse("whoop", horloge(), lireEntetes((n) => r.headers?.get?.(n) ?? null), r.status === 429);
    if (r.status === 401 && !renouvele) return appeler(chemin, methode, essai, true);
    if (r.status === 401) throw new ErreurWhoop("expire");
    if (r.status === 429) {
      if (essai >= 3) throw new ErreurWhoop("limite");
      const apres = Number(r.headers.get("Retry-After"));
      await attendre(Math.min(Number.isFinite(apres) && apres > 0 ? apres * 1000 : 2000 * 2 ** essai, 30_000));
      return appeler(chemin, methode, essai + 1, renouvele);
    }
    if (r.status >= 500 && essai < 2) {
      await attendre(1000 * 2 ** essai);
      return appeler(chemin, methode, essai + 1, renouvele);
    }
    if (r.status === 204) return null;
    if (r.status < 200 || r.status >= 300) throw new ErreurWhoop(r.status >= 500 ? "serveur" : "refuse", `${chemin} ${r.status}`);
    return methode === "DELETE" ? null : r.json();
  }

  return {
    async page<T>(c: Collection, depuisIso: string, nextToken?: string | null, finIso?: string) {
      const q = new URLSearchParams({ limit: "25", start: depuisIso });
      if (finIso) q.set("end", finIso);
      if (nextToken) q.set("nextToken", nextToken);
      return (await appeler(`${CHEMINS[c]}?${q}`)) as PageWhoop<T>;
    },
    async corps() {
      return ((await appeler("/user/measurement/body")) ?? {}) as CorpsWhoop;
    },
    async revoquer() {
      await appeler("/user/access", "DELETE");
    },
  };
}
