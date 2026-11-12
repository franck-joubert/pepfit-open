// Questions fréquentes (D13) : intégrées à l'appli (contenu-fr.ts, contenu-en.ts) et mises à jour depuis le serveur
// (GET /api/aide/articles, serveur/pb_hooks/support-routes.js). Pur (testé dans tests/aide-articles.test.ts) : la fusion des
// deux, et la lecture prudente de ce que le serveur envoie.
import { estEcran, estTheme } from "./ecrans";
import { THEMES_AIDE, type ArticleAide } from "./types";

/** Un article tel que le serveur le sert : `publie: false` retire la réponse intégrée de même clé. */
export type ArticleServeur = ArticleAide & { publie: boolean; maj: string };

/** Ce que le téléphone garde du serveur, par langue : les articles changés, et l'heure de la dernière lecture. */
export type CacheArticles = { depuis: string | null; articles: Record<string, ArticleServeur> };

export const CACHE_VIDE: CacheArticles = { depuis: null, articles: {} };

const chaine = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");

/** Un article du serveur, vérifié champ par champ ; null s'il est illisible (thème ou écran inconnu de cette version). */
export function lireArticleServeur(x: unknown): ArticleServeur | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const cle = chaine(o.cle, 60);
  const titre = chaine(o.titre, 120);
  if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(cle) || !estTheme(o.theme)) return null;
  if (o.publie !== false && !titre) return null;
  // Écran inconnu (ajouté au serveur après cette version) : la réponse reste, sans bouton.
  const ecran = estEcran(o.ecran) ? o.ecran : undefined;
  return {
    cle,
    theme: o.theme,
    titre,
    intro: chaine(o.intro, 1200),
    etapes: Array.isArray(o.etapes) ? o.etapes.filter((e): e is string => typeof e === "string").slice(0, 8).map((e) => e.slice(0, 300)) : [],
    ...(ecran ? { ecran } : {}),
    mots: chaine(o.mots, 300),
    ordre: typeof o.ordre === "number" && Number.isFinite(o.ordre) ? o.ordre : 0,
    publie: o.publie !== false,
    maj: chaine(o.maj, 40),
  };
}

/** Le cache gardé (JSON), lu sans jamais casser l'aide : illisible, il repart vide. */
export function lireCache(json: string | null): CacheArticles {
  if (!json) return CACHE_VIDE;
  try {
    const o = JSON.parse(json) as { depuis?: unknown; articles?: unknown };
    const articles: Record<string, ArticleServeur> = {};
    for (const x of Object.values((o.articles ?? {}) as Record<string, unknown>)) {
      const a = lireArticleServeur(x);
      if (a) articles[a.cle] = a;
    }
    return { depuis: typeof o.depuis === "string" ? o.depuis : null, articles };
  } catch {
    return CACHE_VIDE;
  }
}

/** Ajoute une lecture du serveur au cache : un article changé remplace l'ancien de même clé. */
export function ajouterAuCache(c: CacheArticles, recus: unknown[], maintenant: string): CacheArticles {
  const articles = { ...c.articles };
  for (const x of recus) {
    const a = lireArticleServeur(x);
    if (a) articles[a.cle] = a;
  }
  return { depuis: maintenant, articles };
}

/**
 * Les réponses à montrer : les intégrées, remplacées ou retirées par celles du serveur de même clé, plus les nouvelles du
 * serveur ; rangées par thème (ordre de la planche), puis par `ordre`.
 */
export function fusionner(integres: readonly ArticleAide[], cache: CacheArticles): ArticleAide[] {
  const parCle = new Map<string, ArticleAide>(integres.map((a) => [a.cle, a]));
  for (const a of Object.values(cache.articles)) {
    if (!a.publie) parCle.delete(a.cle);
    else {
      const { publie: _p, maj: _m, ...article } = a;
      parCle.set(a.cle, article);
    }
  }
  const rang = (a: ArticleAide) => THEMES_AIDE.indexOf(a.theme);
  return [...parCle.values()].sort((a, b) => rang(a) - rang(b) || a.ordre - b.ordre);
}
