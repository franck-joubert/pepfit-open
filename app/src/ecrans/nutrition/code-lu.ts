// Code-barres lu par le scanner ouvert depuis « Nouveau produit » (paramètre pour=code) : le scanner le dépose, la fiche le
// reprend en revenant au premier plan.
let lu: string | null = null;

export function deposerCodeLu(code: string): void {
  lu = code;
}

export function prendreCodeLu(): string | null {
  const c = lu;
  lu = null;
  return c;
}
