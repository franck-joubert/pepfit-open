// Paliers de charge d'un appareil (D14, D15). Une liste de kg triée ; le « pas régulier » n'est qu'une façon de la produire.

const EPS = 1e-6;
export const PAS_SANS_PALIER = 2.5;

function net(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Liste dépliée du premier au dernier palier, par pas fixe ; vide si les bornes ou le pas sont incohérents. */
export function paliersReguliers(premier: number, pas: number, dernier: number): number[] {
  if (!(pas > 0) || !(premier >= 0) || dernier < premier) return [];
  const out: number[] = [];
  for (let i = 0; ; i++) {
    const v = net(premier + i * pas);
    if (v > dernier + EPS) break;
    out.push(v);
    if (out.length > 1000) break;
  }
  return out;
}

/** Paliers triés, sans doublon ni valeur négative ou illisible. */
export function normaliserPaliers(p: readonly number[]): number[] {
  return [...new Set(p.filter((x) => Number.isFinite(x) && x >= 0).map(net))].sort((a, b) => a - b);
}

/** Les paliers forment-ils un pas régulier (liste d'au moins 3 valeurs) ? Renvoie le pas, sinon null. */
export function pasRegulier(p: readonly number[]): number | null {
  if (p.length < 3) return null;
  const pas = net(p[1]! - p[0]!);
  for (let i = 2; i < p.length; i++) if (Math.abs(p[i]! - p[i - 1]! - pas) > 0.011) return null;
  return pas > 0 ? pas : null;
}

/** Valeur absente de la liste (saisie au clavier hors palier : gardée telle quelle, seule trace discrète). */
export function estHorsPalier(paliers: readonly number[] | null, kg: number | null): boolean {
  if (!paliers || paliers.length === 0 || kg === null) return false;
  return !paliers.some((p) => Math.abs(p - kg) < EPS);
}

/** Charge après un « + » (sens 1) ou un « − » (sens −1) : le palier voisin ; sans palier, ± 2,5 kg. Null si on ne peut pas aller plus loin. */
export function palierVoisin(paliers: readonly number[] | null, kg: number | null, sens: 1 | -1): number | null {
  if (!paliers || paliers.length === 0) {
    const v = net((kg ?? 0) + sens * PAS_SANS_PALIER);
    return v < 0 ? null : v;
  }
  const liste = [...paliers].sort((a, b) => a - b);
  if (kg === null) return sens === 1 ? liste[0]! : null;
  if (sens === 1) return liste.find((p) => p > kg + EPS) ?? null;
  for (let i = liste.length - 1; i >= 0; i--) if (liste[i]! < kg - EPS) return liste[i]!;
  return null;
}
