// API officielle de Withings : Measure - Getmeas (developer.withings.com). POST formulaire, jeton en « Authorization: Bearer ».
// Withings répond en HTTP 200 avec un « status » : 0 bon ; 100-102, 200, 401 jeton refusé ; 601 trop de demandes.
import { ErreurWhoop } from "../whoop/types";
import type { PageActivite, PageIntraday, PageMesures, PageSommeil } from "./types";
import { quotas as quotasTelephone, type Compteur } from "../quotas/compteur";

export const BASE_API = "https://wbsapi.withings.net";

/** status de Withings : jeton invalide ou expiré (on renouvelle une fois), trop de demandes (on attend). */
const STATUS_JETON = new Set([100, 101, 102, 200, 401]);
const STATUS_LIMITE = 601;

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

export interface ApiWithings {
  /** Une page de groupes de mesures réelles (category=1) modifiés depuis `depuis` (s ; 0 : tout l'historique, sans date).
   *  Sans filtre de types (meastypes) : il cache les types 168 à 227 (constat du 29/08) ; convertir.ts trie. */
  mesures(depuis: number, offset?: number): Promise<PageMesures>;
  /** Activité par jour (Measure v2 getactivity, scope user.activity) : soit une plage de jours AAAA-MM-JJ, soit ce qui a changé
   *  depuis `lastupdate` (s). */
  activite(plage: PlageWithings, offset?: number): Promise<PageActivite>;
  /** Nuits (Sleep v2 getsummary, scope user.activity), mêmes plages. */
  sommeil(plage: PlageWithings, offset?: number): Promise<PageSommeil>;
  /** FC à la minute entre deux instants (s) : Measure v2 getintradayactivity, scope user.activity, 24 h au plus par demande,
   *  montres et bracelets compatibles seulement (sinon une série vide ou un status d'erreur). */
  intraday(debut: number, fin: number): Promise<PageIntraday>;
}

export type PlageWithings = { debut: string; fin: string } | { depuis: number };

/** Champs demandés : sans data_fields, getactivity rend tout mais getsummary presque rien. */
export const CHAMPS_ACTIVITE = "steps,distance,calories,totalcalories,hr_average,hr_min,hr_max";
export const CHAMPS_SOMMEIL = "total_sleep_time,total_timeinbed,lightsleepduration,deepsleepduration,remsleepduration,wakeupduration,wakeupcount,hr_average,hr_min,hr_max,rr_average,sleep_score";

export const CHAMPS_INTRADAY = "heart_rate";

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

const champsPlage = (p: PlageWithings): Record<string, string> => ("depuis" in p ? { lastupdate: String(Math.floor(p.depuis)) } : { startdateymd: p.debut, enddateymd: p.fin });

export function creerApi(d: DepsApi): ApiWithings {
  const f = d.fetch ?? (fetch as unknown as Fetch);
  const attendre = d.attendre ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const base = d.base ?? BASE_API;
  const quotas = d.quotas ?? quotasTelephone;
  const horloge = d.horloge ?? Date.now;

  async function appeler(chemin: string, champs: Record<string, string>, essai = 0, renouvele = false): Promise<unknown> {
    const jeton = await d.acces(renouvele);
    // Withings n'envoie pas d'en-têtes de limite : seul le compte de ce téléphone garde la minute (120 par application).
    const garde = quotas.attenteAvant("withings", horloge());
    if (garde.attendre_ms > 0) await attendre(Math.min(garde.attendre_ms, 60_000));
    quotas.noterAppel("withings", horloge());
    let r;
    try {
      r = await f(base + chemin, {
        method: "POST",
        headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams(champs).toString(),
      });
    } catch {
      throw new ErreurWhoop("reseau");
    }
    if (r.status >= 500 && essai < 2) {
      await attendre(1000 * 2 ** essai);
      return appeler(chemin, champs, essai + 1, renouvele);
    }
    if (r.status !== 200) throw new ErreurWhoop(r.status >= 500 ? "serveur" : "refuse", `${chemin} ${r.status}`);
    const j = (await r.json().catch(() => null)) as { status?: number; body?: unknown; error?: string } | null;
    const status = Number(j?.status);
    if (status === 0 && j?.body) return j.body;
    if (STATUS_JETON.has(status)) {
      if (!renouvele) return appeler(chemin, champs, essai, true);
      throw new ErreurWhoop("expire");
    }
    if (status === STATUS_LIMITE) {
      quotas.noterReponse("withings", horloge(), null, true);
      if (essai >= 3) throw new ErreurWhoop("limite");
      await attendre(Math.min(2000 * 2 ** essai, 30_000));
      return appeler(chemin, champs, essai + 1, renouvele);
    }
    throw new ErreurWhoop("serveur", `${chemin} status ${Number.isFinite(status) ? status : "illisible"}`);
  }

  return {
    async mesures(depuis, offset) {
      const champs: Record<string, string> = { action: "getmeas", category: "1" };
      if (depuis > 0) champs.lastupdate = String(Math.floor(depuis));
      if (offset) champs.offset = String(offset);
      const b = (await appeler("/measure", champs)) as PageMesures;
      return { ...b, measuregrps: Array.isArray(b.measuregrps) ? b.measuregrps : [] };
    },
    async activite(plage, offset) {
      const champs: Record<string, string> = { action: "getactivity", data_fields: CHAMPS_ACTIVITE, ...champsPlage(plage) };
      if (offset) champs.offset = String(offset);
      const b = ((await appeler("/v2/measure", champs)) ?? {}) as PageActivite;
      return { ...b, activities: Array.isArray(b.activities) ? b.activities : [] };
    },
    async sommeil(plage, offset) {
      const champs: Record<string, string> = { action: "getsummary", data_fields: CHAMPS_SOMMEIL, ...champsPlage(plage) };
      if (offset) champs.offset = String(offset);
      const b = ((await appeler("/v2/sleep", champs)) ?? {}) as PageSommeil;
      return { ...b, series: Array.isArray(b.series) ? b.series : [] };
    },
    async intraday(debut, fin) {
      const champs = { action: "getintradayactivity", data_fields: CHAMPS_INTRADAY, startdate: String(Math.floor(debut)), enddate: String(Math.floor(fin)) };
      const b = ((await appeler("/v2/measure", champs)) ?? {}) as Partial<PageIntraday>;
      return { series: b.series && typeof b.series === "object" && !Array.isArray(b.series) ? b.series : {} };
    },
  };
}
