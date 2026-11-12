// OAuth des API santé, fait sur le téléphone avec les identifiants de chacun (identifiants/) : page d'autorisation, échange du
// code, renouvellement. Aucun serveur entre les deux : aucune des trois API n'accepte PKCE, le client_secret est donc celui de
// l'application que la personne a créée pour elle seule. Pur, sans React Native (tests/oauth-client.test.ts).
import type { Fournisseur, Identifiants } from "../identifiants/modele";
import { ErreurWhoop, type ReponseJeton } from "../whoop/types";

export type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

interface Config {
  autorisation: string;
  jeton: string;
  scopes: string;
}

export const OAUTH: Record<Fournisseur, Config> = {
  whoop: {
    autorisation: "https://api.prod.whoop.com/oauth/oauth2/auth",
    jeton: "https://api.prod.whoop.com/oauth/oauth2/token",
    scopes: "read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement offline",
  },
  // user.info et user.metrics : profil et mesures ; user.activity : activité, sommeil, FC du jour.
  withings: { autorisation: "https://account.withings.com/oauth2_user/authorize2", jeton: "https://wbsapi.withings.net/v2/oauth2", scopes: "user.info,user.metrics,user.activity" },
  // Seule portée d'AccessLink : lecture de ce que l'utilisateur partage.
  polar: { autorisation: "https://flow.polar.com/oauth2/authorization", jeton: "https://polarremote.com/v2/oauth2/token", scopes: "accesslink.read_all" },
};

const formulaire = (o: Record<string, string>) =>
  Object.entries(o)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

/** Page d'autorisation du fournisseur ; `state` (au moins 8 signes pour Whoop) revient tel quel avec le code. */
export function urlAutorisation(f: Fournisseur, i: Identifiants, state: string): string {
  const c = OAUTH[f];
  return `${c.autorisation}?${formulaire({ response_type: "code", client_id: i.clientId, redirect_uri: i.redirection, scope: c.scopes, state })}`;
}

/** Jeton reçu, quel que soit le fournisseur ; `userId` : x_user_id de Polar, userid de Withings. */
export type JetonRecu = ReponseJeton & { userId: string | null };

const base64 = (s: string): string => {
  const o = new TextEncoder().encode(s);
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let r = "";
  for (let k = 0; k < o.length; k += 3) {
    const n = (o[k]! << 16) | ((o[k + 1] ?? 0) << 8) | (o[k + 2] ?? 0);
    r += a[(n >> 18) & 63]! + a[(n >> 12) & 63]! + (k + 1 < o.length ? a[(n >> 6) & 63]! : "=") + (k + 2 < o.length ? a[n & 63]! : "=");
  }
  return r;
};

async function poster(f: Fetch, url: string, corps: Record<string, string>, entetes: Record<string, string> = {}): Promise<{ status: number; j: Record<string, unknown> }> {
  let r;
  try {
    r = await f(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", ...entetes }, body: formulaire(corps) });
  } catch {
    throw new ErreurWhoop("reseau");
  }
  const j = ((await r.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (r.status === 429) throw new ErreurWhoop("limite");
  if (r.status >= 500) throw new ErreurWhoop("serveur", `jeton ${r.status}`);
  if (r.status !== 200) throw new ErreurWhoop("refuse", `jeton ${r.status} ${String(j.error ?? "")}`);
  return { status: r.status, j };
}

const texte = (v: unknown): string | null => (v == null || v === "" ? null : String(v));

function lireJeton(j: Record<string, unknown>, expireParDefaut: number, scopeParDefaut?: string): JetonRecu {
  if (typeof j.access_token !== "string" || !j.access_token) throw new ErreurWhoop("refuse", "jeton absent");
  return {
    access_token: j.access_token,
    refresh_token: texte(j.refresh_token),
    expires_in: Number(j.expires_in) || expireParDefaut,
    scope: texte(j.scope) ?? scopeParDefaut,
    userId: texte(j.x_user_id ?? j.userid),
  };
}

/** Withings répond toujours 200 : le vrai statut est dans `status` (0 = bon ; 601 = trop de demandes). */
function corpsWithings(j: Record<string, unknown>): Record<string, unknown> {
  const s = Number(j.status);
  if (s === 0 && j.body && typeof j.body === "object") return j.body as Record<string, unknown>;
  if (s === 601) throw new ErreurWhoop("limite");
  throw new ErreurWhoop("refuse", `withings status=${String(j.status)}`);
}

/** Échange du code reçu au retour du navigateur (un seul usage ; 30 s chez Withings, 10 min chez Polar). */
export async function echangerCode(fo: Fournisseur, i: Identifiants, code: string, f: Fetch = fetch as unknown as Fetch): Promise<JetonRecu> {
  const c = OAUTH[fo];
  const commun = { grant_type: "authorization_code", code, redirect_uri: i.redirection };
  if (fo === "polar") {
    const { j } = await poster(f, c.jeton, commun, { Authorization: `Basic ${base64(`${i.clientId}:${i.clientSecret}`)}` });
    return { ...lireJeton(j, 31_535_999, c.scopes), refresh_token: null };
  }
  if (fo === "withings") {
    const { j } = await poster(f, c.jeton, { action: "requesttoken", client_id: i.clientId, client_secret: i.clientSecret, ...commun });
    return lireJeton(corpsWithings(j), 10_800, c.scopes);
  }
  const { j } = await poster(f, c.jeton, { client_id: i.clientId, client_secret: i.clientSecret, ...commun });
  return lireJeton(j, 3600, c.scopes);
}

/** Renouvellement (Whoop et Withings ; Polar n'en a pas). Le refresh token tourne : le nouveau remplace l'ancien aussitôt. */
export async function renouveler(fo: "whoop" | "withings", i: Identifiants, refresh: string, f: Fetch = fetch as unknown as Fetch): Promise<JetonRecu> {
  const c = OAUTH[fo];
  if (fo === "withings") {
    const { j } = await poster(f, c.jeton, { action: "requesttoken", grant_type: "refresh_token", client_id: i.clientId, client_secret: i.clientSecret, refresh_token: refresh });
    return lireJeton(corpsWithings(j), 10_800);
  }
  const { j } = await poster(f, c.jeton, { grant_type: "refresh_token", refresh_token: refresh, client_id: i.clientId, client_secret: i.clientSecret, scope: "offline" });
  return lireJeton(j, 3600);
}

export interface RetourAppli {
  code?: string;
  state?: string;
  erreur?: string;
}

/** Lit un lien de retour `pepfitopen://<route>?code=…&state=…` (direct ou par la page relais) ; null si ce n'est pas le nôtre. */
export function analyserRetour(url: string, route: string): RetourAppli | null {
  const m = new RegExp(`^pepfitopen://${route}(?:/)?\\?(.*)$`).exec(url);
  if (!m) return null;
  const q = new URLSearchParams(m[1]);
  return { code: q.get("code") ?? undefined, state: q.get("state") ?? undefined, erreur: q.get("error") ?? q.get("erreur") ?? undefined };
}
