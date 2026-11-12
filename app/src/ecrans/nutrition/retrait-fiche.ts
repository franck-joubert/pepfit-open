// Aliment retiré depuis sa fiche (⋯ → Retirer du repas) : la fiche le dépose, le journal le retire en revenant au premier plan,
// comme au glisser (désintégration, « … retiré · Annuler »).
let retire: string | null = null;

export function deposerRetraitFiche(consoId: string): void {
  retire = consoId;
}

export function prendreRetraitFiche(): string | null {
  const c = retire;
  retire = null;
  return c;
}
