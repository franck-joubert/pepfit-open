// Adresse du site public (version libre, AGPL) : fixée à la construction par une variable EXPO_PUBLIC_* (Metro l'inscrit
// dans le JavaScript de l'APK). Rien n'est en dur : sans variable, aucun lien externe n'est proposé. L'appli n'a ni compte
// ni serveur : tout reste sur le téléphone. Voir SELF-HOSTING.md à la racine du dépôt.
//
//   EXPO_PUBLIC_PEPFIT_SITE_URL    site public (politique de confidentialité), facultatif

const lire = (v: string | undefined): string => (v ?? "").trim().replace(/\/+$/, "");

// La variable est écrite en entier (process.env.EXPO_PUBLIC_…) : Metro ne remplace que les accès littéraux.
/** Site public ; "" si absent (aucun lien externe n'est alors proposé). */
export const SITE = lire(process.env.EXPO_PUBLIC_PEPFIT_SITE_URL);
