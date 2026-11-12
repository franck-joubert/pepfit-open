// Bouton « Jour de repos / Jour d'entraînement » du journal (retour du 28/10) : un jour sans séance ni choix est un
// jour de repos (sans point) ; toucher bascule. Passer en repos un jour qui a déjà au moins une séance enregistrée demande
// confirmation, la première fois seulement pour ce jour. Pur : testé par tests/retours-28-10.test.ts.

/** La bascule doit-elle d'abord demander confirmation ? */
export function confirmerRepos(o: { entrainement: boolean; seancesFaites: number; dejaConfirme: boolean }): boolean {
  return o.entrainement && o.seancesFaites > 0 && !o.dejaConfirme;
}
