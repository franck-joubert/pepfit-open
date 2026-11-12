// Calculs purs de la séance (revue finale du 30/10, lot L2), testés par tests/l2-seance.test.ts : masque de saisie d'une
// durée, série que le plein écran montre à l'ouverture, textes du compteur des cartes de record.

/**
 * Masque de saisie d'une durée, au format de la case validée (m:ss), rempli de droite à gauche : « 3 » → « 0:03 »,
 * « 130 » → « 1:30 », « 13000 » → « 1:30:00 » ; vide si aucun chiffre. Un seul deux-points sous l'heure (n° 15 : l'ancien
 * masque « hh:mm:ss » laissait « :  :30 » dans la case). Les zéros de tête ne comptent pas : relu par lireTemps, le masque
 * donne la même durée que les chiffres tapés.
 */
export function masqueDuree(chiffres: string): string {
  if (!chiffres) return "";
  const c = chiffres.replace(/^0+/, "");
  if (c.length <= 2) return `0:${c.padStart(2, "0")}`;
  if (c.length <= 4) return `${c.slice(0, -2)}:${c.slice(-2)}`;
  return `${c.slice(0, -4)}:${c.slice(-4, -2)}:${c.slice(-2)}`;
}

/**
 * Plein écran ouvert pendant le compte d'une série en durée : le décalage (pour serieAffichee) qui l'amène sur cette série,
 * en marche d'abord, sinon en pause ; 0 sans chrono (la première série à faire, comme avant) (n° 35).
 */
export function decalageVersChrono<T extends { id: string; faite: number | boolean }>(
  ordre: readonly T[],
  chrono: (id: string) => { debut: number | null } | undefined,
): number {
  const enMarche = ordre.findIndex((x) => !x.faite && chrono(x.id)?.debut != null);
  const i = enMarche >= 0 ? enMarche : ordre.findIndex((x) => !x.faite && chrono(x.id) != null);
  if (i < 0) return 0;
  const active = ordre.findIndex((x) => !x.faite);
  return i - (active < 0 ? ordre.length - 1 : active);
}

/**
 * Textes du compteur d'une carte de record, de `de` à `a` : `pas` + 1 échantillons réguliers, calculés une fois en JS (nombre()
 * et t() ne tournent pas sur le fil UI). La carte choisit le texte de la progression à chaque image, sans rendu React (n° 13).
 */
export function etapesCompte(de: number, a: number, texte: (v: number) => string, pas = 60): string[] {
  return Array.from({ length: pas + 1 }, (_, i) => texte(i === pas ? a : de + ((a - de) * i) / pas));
}

/** Texte des étapes à la progression `p` (0 à 1, déjà passée par la courbe). */
export function texteEtape(etapes: readonly string[], p: number): string {
  "worklet";
  const n = etapes.length;
  return etapes[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))] ?? "";
}
