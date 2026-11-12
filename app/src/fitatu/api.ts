// Client de l'API privée de l'appli web Fitatu (pas d'API publique ; protocole et sources : docs/FITATU.md). LECTURE SEULE :
// journée du planificateur, fiche produit, profil (date de création du compte). La session vient de la WebView où
// l'utilisateur s'est connecté lui-même (session.ts) ; le jeton dure une heure et se renouvelle par POST /token/refresh.
// Sans React ni natif : fetch, coffre et pause sont passés en dépendances (tests/fitatu-connexion.test.ts).

/** Session gardée dans le coffre (COFFRE_FITATU) : jamais affichée, jamais envoyée ailleurs qu'à Fitatu. */
export interface SessionFitatu {
  /** JWT (Authorization: Bearer). */
  jeton: string;
  /** Jeton de renouvellement (POST /token/refresh) ; vide s'il n'a pas été vu. */
  renouvellement: string;
  /** Identifiant du compte (claim `id` du JWT). */
  uid: string;
  /** Racine de l'API, ex. https://fr-fr.fitatu.com/api */
  base: string;
  /** En-têtes de l'appli web relevés dans la page (api-key, api-secret, app-os, app-uuid…), sans Authorization. */
  entetes: Record<string, string>;
  /** Valeur de l'en-tête API-Cluster, ex. fr-fr12345678. */
  cluster: string;
}

export type CodeFitatu = "session" | "limite" | "absent" | "reseau" | "serveur" | "format";

export class ErreurFitatu extends Error {
  readonly code: CodeFitatu;
  readonly statut?: number;
  constructor(code: CodeFitatu, message: string, statut?: number) {
    super(message);
    this.code = code;
    this.statut = statut;
  }
}

/** Attente maximale demandée par un 429 (Retry-After) avant d'abandonner : au-delà, l'import reprendra plus tard. */
export const ATTENTE_429_MAX_MS = 30_000;

export interface ReponseHttp {
  status: number;
  headers: { get(nom: string): string | null };
  text(): Promise<string>;
}

export interface DepsClient {
  fetch(url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<ReponseHttp>;
  lireSession(): Promise<SessionFitatu | null>;
  ecrireSession(s: SessionFitatu): Promise<void>;
  attendre(ms: number): Promise<void>;
}

export interface ClientFitatu {
  /** dietPlan d'une journée (AAAA-MM-JJ). */
  jour(date: string): Promise<unknown>;
  /** Fiche d'un produit (valeurs pour 100 g, mesures, code-barres). */
  produit(id: number | string): Promise<unknown>;
  /** Profil du compte (createdAt, storageLocale…). */
  utilisateur(): Promise<unknown>;
}

/** Charge utile d'un JWT (sans vérifier la signature : seul Fitatu la vérifie). */
export function chargeJwt(jeton: string): Record<string, unknown> | null {
  const p = jeton.split(".")[1];
  if (!p) return null;
  try {
    const b64 = p.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (p.length % 4)) % 4);
    const json = decodeURIComponent(
      Array.from(atob(b64))
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    const o: unknown = JSON.parse(json);
    return o && typeof o === "object" ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const enJson = (texte: string): unknown => {
  if (!texte.trim()) return null;
  try {
    return JSON.parse(texte);
  } catch {
    throw new ErreurFitatu("format", "réponse illisible");
  }
};

export function creerClientFitatu(d: DepsClient): ClientFitatu {
  const session = async (): Promise<SessionFitatu> => {
    const s = await d.lireSession();
    if (!s) throw new ErreurFitatu("session", "pas de session Fitatu");
    return s;
  };

  const envoyer = async (url: string, init: Parameters<DepsClient["fetch"]>[1]): Promise<ReponseHttp> => {
    try {
      return await d.fetch(url, init);
    } catch (e) {
      throw new ErreurFitatu("reseau", `Fitatu injoignable : ${String(e)}`);
    }
  };

  /** Nouveau jeton par le jeton de renouvellement ; faux si Fitatu le refuse (il faut se reconnecter). */
  const renouveler = async (s: SessionFitatu): Promise<SessionFitatu | null> => {
    if (!s.renouvellement) return null;
    const r = await envoyer(`${s.base}/token/refresh`, {
      method: "POST",
      headers: { ...s.entetes, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ refresh_token: s.renouvellement }),
    });
    if (r.status !== 200) return null;
    const o = enJson(await r.text()) as { token?: unknown; refresh_token?: unknown; refreshToken?: unknown } | null;
    if (typeof o?.token !== "string" || !o.token) return null;
    const rt = typeof o.refresh_token === "string" ? o.refresh_token : typeof o.refreshToken === "string" ? o.refreshToken : s.renouvellement;
    const n = { ...s, jeton: o.token, renouvellement: rt };
    await d.ecrireSession(n);
    return n;
  };

  /** GET authentifié : un 401 renouvelle le jeton une fois ; un 429 attend Retry-After (30 s au plus) une fois. */
  const lire = async (chemin: (s: SessionFitatu) => string, accept = "application/json; version=v3"): Promise<unknown> => {
    let s = await session();
    let renouvele = false;
    let patiente = false;
    for (;;) {
      const r = await envoyer(`${s.base}${chemin(s)}`, {
        method: "GET",
        headers: { ...s.entetes, accept, authorization: `Bearer ${s.jeton}`, "api-cluster": s.cluster },
      });
      if (r.status === 200) return enJson(await r.text());
      if (r.status === 401 && !renouvele) {
        renouvele = true;
        const n = await renouveler(s);
        if (!n) throw new ErreurFitatu("session", "session Fitatu expirée", 401);
        s = n;
        continue;
      }
      if (r.status === 401 || r.status === 403) throw new ErreurFitatu("session", "session Fitatu refusée", r.status);
      if (r.status === 429) {
        const sec = Number(r.headers.get("retry-after"));
        const ms = Number.isFinite(sec) && sec > 0 ? sec * 1000 : 5_000;
        if (patiente || ms > ATTENTE_429_MAX_MS) throw new ErreurFitatu("limite", "Fitatu limite les appels", 429);
        patiente = true;
        await d.attendre(ms);
        continue;
      }
      if (r.status === 404) throw new ErreurFitatu("absent", "introuvable", 404);
      throw new ErreurFitatu("serveur", `Fitatu a répondu ${r.status}`, r.status);
    }
  };

  return {
    jour: (date) => lire((s) => `/diet-and-activity-plan/${s.uid}/day/${date}`),
    produit: (id) => lire(() => `/products/${id}`, "application/json"),
    utilisateur: () => lire((s) => `/users/${s.uid}`, "application/json"),
  };
}
