// Codes-barres : un même article peut se lire sous plusieurs formes (EAN-13, UPC-A à 12 chiffres, GTIN-14 avec un zéro de tête,
// espaces ou tirets saisis à la main). Sans React Native (testé sous Node). La copie locale, le catalogue commun et le MCP
// comparent ces formes équivalentes, jamais la chaîne brute.

/** Les chiffres seuls du code (espaces, tirets et points retirés). */
export const chiffresDuCode = (code: string) => code.replace(/\D/g, "");

/** Formes équivalentes d'un code (la forme lue d'abord) : même numéro, complété de zéros à 8, 12, 13 ou 14 chiffres. [] si ce n'est pas un code. */
export function variantesCode(code: string): string[] {
  const c = chiffresDuCode(code);
  if (c.length < 6 || c.length > 14) return [];
  const nu = c.replace(/^0+/, "");
  const formes = [c];
  for (const n of [8, 12, 13, 14]) {
    if (nu.length > n) continue;
    const v = nu.padStart(n, "0");
    if (!formes.includes(v)) formes.push(v);
  }
  return formes;
}

/** Forme gardée au catalogue commun : EAN-13 (un UPC-A à 12 chiffres et un GTIN-14 à zéro de tête y ramènent), EAN-8 tel quel. "" si ce n'est pas un code. */
export function codeCanonique(code: string): string {
  const c = chiffresDuCode(code);
  if (c.length < 6 || c.length > 14) return "";
  if (c.length === 12) return `0${c}`;
  if (c.length === 14 && c.startsWith("0")) return c.slice(1);
  return c;
}

/** Clé de contrôle GS1 d'un code de 8, 12, 13 ou 14 chiffres : un code mal lu ou mal saisi ne devient pas une fiche pour tout le monde. */
export function cleControleValide(chiffres: string): boolean {
  if (!/^\d{8,14}$/.test(chiffres)) return false;
  let somme = 0;
  for (let i = chiffres.length - 2, poids = 3; i >= 0; i--, poids = poids === 3 ? 1 : 3) somme += Number(chiffres[i]) * poids;
  return (10 - (somme % 10)) % 10 === Number(chiffres[chiffres.length - 1]);
}

/** Le code tel que le catalogue commun le garde, ou "" s'il n'est pas partageable (trop court, clé de contrôle fausse). */
export function codePartageable(code: string | null | undefined): string {
  const c = codeCanonique(code ?? "");
  return c.length >= 8 && cleControleValide(c) ? c : "";
}
