// Connexion Fitatu par WebView, sans React : l'utilisateur se connecte LUI-MÊME sur le site officiel (pepfit ne voit ni ne
// lit jamais son mot de passe, ni le corps d'aucune requête). Un script injecté relève ensuite, dans la page :
// 1. les en-têtes que l'appli web envoie à son API (api-key, api-secret, app-os, app-uuid…) et l'adresse de cette API :
//    aucune valeur de l'appli Fitatu n'est écrite dans le code de pepfit, elles sont reprises de la page à chaque connexion ;
// 2. la session gardée par l'appli web dans son stockage local (clé `user` : token, refresh_token, id).
// Tout est passé à l'appli par postMessage, puis gardé dans le coffre du téléphone. Testé par tests/fitatu-connexion.test.ts.
import { chargeJwt, type SessionFitatu } from "./api";

/** Page de connexion de l'appli web Fitatu (à vérifier sur le compte d'Alex : app.fitatu.com ou www.fitatu.com/app). */
export const URL_CONNEXION_FITATU = "https://www.fitatu.com/app/";

/** En-têtes repris de la page (noms en minuscules). Ni Authorization ni cookie : le jeton vient du stockage local. */
export const ENTETES_RELEVES = ["api-key", "api-secret", "app-os", "app-version", "app-uuid", "app-locale", "app-storagelocale", "app-searchlocale", "app-timezone", "api-cluster"] as const;

/** Message envoyé par la page. */
export interface CaptureFitatu {
  entetes?: Record<string, string>;
  /** Adresse d'un appel à l'API vu dans la page. */
  url?: string;
  /** localStorage.user (JSON), localStorage.token, localStorage.refresh_token. */
  user?: string | null;
  token?: string | null;
  refresh?: string | null;
}

/**
 * Script injecté avant le chargement de la page (et repris après, sans double branchement) : branche XMLHttpRequest et fetch
 * pour noter les en-têtes ENTETES_RELEVES des appels à *.fitatu.com/api, puis envoie toutes les 1,5 s ce qui a été vu.
 */
export const SCRIPT_RELEVE = `(function(){
if (window.__pepfitFitatu) return true;
var W = ${JSON.stringify(ENTETES_RELEVES)};
var r = window.__pepfitFitatu = { entetes: {}, url: null };
function noter(url, nom, val){
  try {
    if (!/^https:\\/\\/[a-z0-9-]+\\.fitatu\\.com\\/api\\//i.test(String(url))) return;
    r.url = String(url);
    var n = String(nom).toLowerCase();
    if (W.indexOf(n) >= 0 && val) r.entetes[n] = String(val);
  } catch (e) {}
}
var o = XMLHttpRequest.prototype.open, h = XMLHttpRequest.prototype.setRequestHeader;
XMLHttpRequest.prototype.open = function(m, u){ this.__pfUrl = u; return o.apply(this, arguments); };
XMLHttpRequest.prototype.setRequestHeader = function(n, v){ noter(this.__pfUrl, n, v); return h.apply(this, arguments); };
if (window.fetch) {
  var f = window.fetch;
  window.fetch = function(i, init){
    try {
      var u = typeof i === 'string' ? i : (i && i.url);
      var hs = (init && init.headers) || (i && i.headers);
      if (hs && typeof hs.forEach === 'function') hs.forEach(function(v, n){ noter(u, n, v); });
      else if (hs) Object.keys(hs).forEach(function(n){ noter(u, n, hs[n]); });
    } catch (e) {}
    return f.apply(this, arguments);
  };
}
function lire(k){ try { return window.localStorage.getItem(k); } catch (e) { return null; } }
setInterval(function(){
  if (!window.ReactNativeWebView) return;
  window.ReactNativeWebView.postMessage(JSON.stringify({ entetes: r.entetes, url: r.url, user: lire('user'), token: lire('token'), refresh: lire('refresh_token') }));
}, 1500);
true;
})();`;

export function lireCapture(message: string): CaptureFitatu | null {
  try {
    const o: unknown = JSON.parse(message);
    return o && typeof o === "object" && !Array.isArray(o) ? (o as CaptureFitatu) : null;
  } catch {
    return null;
  }
}

const chaine = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/** Racine de l'API : celle des appels vus, sinon celle du stockage du compte (fr_FR → https://fr-fr.fitatu.com/api). */
function baseDe(c: CaptureFitatu, user: Record<string, unknown>): string | null {
  const m = /^(https:\/\/[a-z0-9-]+\.fitatu\.com\/api)\//i.exec(c.url ?? "");
  if (m) return m[1]!;
  const loc = chaine(user["storageLocale"]);
  return loc && /^[a-z]{2}_[A-Z]{2}$/.test(loc) ? `https://${loc.toLowerCase().replace("_", "-")}.fitatu.com/api` : null;
}

/** Compte connecté dans la page : un vrai JWT (et l'identifiant du compte). Avant la connexion, l'appli web garde déjà des
 *  clés `user` ou `token` sans jeton valable (vu sur l'émulateur le 30/10) : elles ne comptent pas. */
function compteVu(c: CaptureFitatu): { user: Record<string, unknown>; jeton: string; uid: string } | null {
  let user: Record<string, unknown> = {};
  try {
    const u: unknown = c.user ? JSON.parse(c.user) : null;
    if (u && typeof u === "object") user = u as Record<string, unknown>;
  } catch {
    // stockage illisible : on garde les clés séparées
  }
  const jeton = chaine(user["token"]) ?? chaine(c.token);
  const charge = jeton ? chargeJwt(jeton) : null;
  if (!jeton || !charge) return null;
  const uid = chaine(charge["id"]) ?? chaine(user["id"]);
  return uid && /^\d+$/.test(uid) ? { user, jeton, uid } : null;
}

/** Vrai dès que l'utilisateur est connecté dans la page (même si la session n'est pas encore complète). */
export const connecteDans = (c: CaptureFitatu) => compteVu(c) != null;

/**
 * Session utilisable à partir de ce que la page a relevé, ou null s'il manque quelque chose : jeton (JWT) et identifiant du
 * compte, racine de l'API, et les deux en-têtes sans lesquels Fitatu répond 403 (api-key, api-secret).
 */
export function sessionDepuisCapture(c: CaptureFitatu): SessionFitatu | null {
  const vu = compteVu(c);
  if (!vu) return null;
  const { user, jeton, uid } = vu;
  const entetes: Record<string, string> = {};
  for (const n of ENTETES_RELEVES) {
    const v = chaine(c.entetes?.[n]);
    if (v && n !== "api-cluster") entetes[n] = v;
  }
  if (!entetes["api-key"] || !entetes["api-secret"]) return null;
  const base = baseDe(c, user);
  if (!base) return null;
  // API-Cluster : celui de la page s'il est vu, sinon <cluster de l'hôte><id> (ex. fr-fr12345678)
  const cluster = chaine(c.entetes?.["api-cluster"]) ?? `${/^https:\/\/([a-z0-9-]+)\./i.exec(base)![1]!.toLowerCase()}${uid}`;
  const renouvellement = chaine(user["refresh_token"]) ?? chaine(user["refreshToken"]) ?? chaine(c.refresh) ?? "";
  return { jeton, renouvellement, uid, base, entetes, cluster };
}

/** Première date de l'historique : création du compte (profil, sinon claim createdAt du jeton), sinon `repli`. */
export function premiereDate(profil: unknown, jeton: string, repli: string): string {
  const lire = (v: unknown): string | null => {
    if (typeof v === "number" && v > 0) return new Date(v < 1e12 ? v * 1000 : v).toISOString().slice(0, 10);
    const s = chaine(v);
    return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
  };
  const p = profil && typeof profil === "object" ? (profil as Record<string, unknown>) : {};
  return lire(p["createdAt"]) ?? lire(chargeJwt(jeton)?.["createdAt"]) ?? repli;
}
