// Recherche de l'aide (e6, D13) : sur le téléphone, dans les réponses et dans les réglages, sans réseau. Pur (testé dans
// tests/aide-recherche.test.ts). Chaque mot tapé compte, sans accents ni majuscules, au début d'un mot du texte :
// « pas whoop » trouve « Mes pas Whoop ne remontent plus », pas « dépasser ».
import type { ArticleAide } from "./types";

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Les mots d'une recherche : sans accents, en minuscules, sans doublon ; une lettre seule ne compte pas. */
export function motsDe(q: string): string[] {
  return [...new Set(sansAccents(q).split(/[^a-z0-9]+/).filter((m) => m.length >= 2))];
}

/** Débuts de mots du texte, pour savoir si un mot tapé y est (« whoop » dans « Whoop, »). */
function debuts(texte: string): string[] {
  return sansAccents(texte).split(/[^a-z0-9]+/).filter(Boolean);
}
const trouve = (mot: string, mots: string[]) => mots.some((m) => m.startsWith(mot));

/**
 * Réponses où tous les mots sont, dans le titre, l'intro, les étapes ou les mots cachés. Celles dont le titre en a le plus
 * passent devant ; à égalité, l'ordre du contenu.
 */
export function chercherArticles(q: string, articles: readonly ArticleAide[]): ArticleAide[] {
  const mots = motsDe(q);
  if (!mots.length) return [];
  return articles
    .map((a, i) => {
      const titre = debuts(a.titre);
      const tout = [...titre, ...debuts(a.intro), ...a.etapes.flatMap(debuts), ...debuts(a.mots ?? "")];
      if (!mots.every((m) => trouve(m, tout))) return null;
      return { a, i, n: mots.filter((m) => trouve(m, titre)).length };
    })
    .filter((x): x is { a: ArticleAide; i: number; n: number } => x !== null)
    .sort((x, y) => y.n - x.n || x.i - y.i)
    .map((x) => x.a);
}

/**
 * Réglages trouvés mot par mot (la recherche des Réglages, `chercher`, prend la phrase entière) : ceux qui répondent au plus
 * grand nombre de mots, dans l'ordre de `chercher` pour le premier mot qui les trouve.
 */
export function chercherParMots<E extends { id: string }>(q: string, chercher: (mot: string) => E[], max = 4): E[] {
  const mots = motsDe(q);
  const vus = new Map<string, { e: E; n: number; i: number }>();
  let i = 0;
  for (const m of mots)
    for (const e of chercher(m)) {
      const v = vus.get(e.id);
      if (v) v.n++;
      else vus.set(e.id, { e, n: 1, i: i++ });
    }
  const l = [...vus.values()];
  const meilleur = Math.max(0, ...l.map((v) => v.n));
  return l
    .filter((v) => v.n === meilleur)
    .sort((a, b) => a.i - b.i)
    .slice(0, max)
    .map((v) => v.e);
}

/** Le texte en morceaux, ceux qui commencent par un mot cherché en gras (« Mes **pas** **Whoop** ne remontent plus »). */
export function morceaux(texte: string, q: string): { t: string; fort: boolean }[] {
  const mots = motsDe(q);
  // Découpe en mots et séparateurs, en gardant le texte tel quel ; la comparaison se fait sans accents.
  const parties = texte.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu) ?? [];
  const l: { t: string; fort: boolean }[] = [];
  for (const p of parties) {
    const plat = sansAccents(p);
    const m = /[a-z0-9]/.test(plat) ? mots.find((x) => plat.startsWith(x)) : undefined;
    // seul le début qui correspond est en gras : « pas » dans « passer » ; même longueur après normalisation (NFD retiré)
    const coupe = m ? m.length : 0;
    if (coupe) l.push({ t: p.slice(0, coupe), fort: true });
    const reste = p.slice(coupe);
    if (!reste) continue;
    const dernier = l[l.length - 1];
    if (dernier && !dernier.fort) dernier.t += reste;
    else l.push({ t: reste, fort: false });
  }
  return l;
}
