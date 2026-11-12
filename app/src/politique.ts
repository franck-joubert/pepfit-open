// Politique de confidentialité : celle du site (la même que sur la fiche Google Play et dans Santé Connect), dans la langue
// de l'appli (le site n'a que le français et l'anglais : l'anglais pour l'allemand et l'espagnol).
import type { Langue } from "./i18n/detection";
import { SITE } from "./config/serveur";

/** "" sans site configuré (version locale) : la ligne « Politique de confidentialité » est alors masquée. */
export const urlPolitique = (langue: Langue): string => (!SITE ? "" : langue === "fr" ? `${SITE}/confidentialite/` : `${SITE}/en/privacy/`);
