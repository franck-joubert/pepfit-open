// Questions fréquentes (D13) : le contenu intégré, lisible hors réseau, dans la langue de l'appli.
import type { Langue } from "../i18n/detection";
import { ARTICLES_DE } from "./contenu-de";
import { ARTICLES_EN } from "./contenu-en";
import { ARTICLES_ES } from "./contenu-es";
import { ARTICLES_FR } from "./contenu-fr";
import { CACHE_VIDE, fusionner } from "./fusion";
import type { ArticleAide } from "./types";

const INTEGRES: Record<Langue, ArticleAide[]> = { fr: ARTICLES_FR, en: ARTICLES_EN, de: ARTICLES_DE, es: ARTICLES_ES };

/** Les réponses intégrées, rangées par thème puis par ordre. */
export const articlesIntegres = (langue: Langue): ArticleAide[] => fusionner(INTEGRES[langue], CACHE_VIDE);

/** Une réponse par sa clé. */
export const articleAide = (langue: Langue, cle: string): ArticleAide | null => articlesIntegres(langue).find((a) => a.cle === cle) ?? null;
