// Le sous-titre d'une ligne de lieu : UNE règle pour toutes les listes (sélecteur « Lieu de la séance », Mes lieux, séance prévue,
// recherche de l'Accueil), 08/11. Le sous-titre est l'adresse courte (rue et ville, sans code postal), ou la ville seule ;
// à défaut d'adresse, le sport (ou le type) en secours ; sinon rien. Le sport se lit aussi par l'avatar et le picto, jamais par un
// tag. Dans « Autour de moi », la distance passe devant (ligne en deux temps, voir LigneDeLieu).

/** Un code postal français (5 chiffres), avec ce qui le colle à la ville. */
const CODE_POSTAL = /\b\d{5}\b\s*/g;

/** « 12 rue des Lilas, 55300 Valmont-sur-Meuse » devient « 12 rue des Lilas, Valmont-sur-Meuse ». */
export function adresseCourte(adresse: string | null | undefined): string | null {
  const a = (adresse ?? "")
    .replace(CODE_POSTAL, "")
    .replace(/\s+,/g, ",")
    .replace(/(^|,)\s*(?=,|$)/g, "$1")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .replace(/\s{2,}/g, " ");
  return a || null;
}

const sans = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Le sous-titre d'un lieu. `adresse` : l'adresse connue (rue seule, ou rue et ville) ; `ville` : ajoutée si l'adresse ne la
 * nomme pas déjà ; `secours` : le sport ou le type, dit seulement quand il n'y a ni adresse ni ville. Rien : null.
 */
export function sousLieu(l: { adresse?: string | null; ville?: string | null; secours?: string | null }): string | null {
  const rue = adresseCourte(l.adresse);
  const ville = adresseCourte(l.ville);
  // « Lyon 7e » est déjà dit par « …, 69007 Lyon » : on compare le nom de la ville, sans son arrondissement.
  const nomVille = ville ? sans(ville).replace(/\s*\d.*$/, "") : "";
  const adresse = rue && ville && !sans(rue).includes(nomVille) ? `${rue}, ${ville}` : (rue ?? ville);
  return adresse ?? ((l.secours ?? "").trim() || null);
}
