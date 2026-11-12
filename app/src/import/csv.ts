/** Lit un CSV (RFC 4180 : guillemets, guillemets doublés, retours à la ligne dans un champ, BOM). */
export function lireCsv(texte: string): string[][] {
  const lignes: string[][] = [];
  let champ = "";
  let ligne: string[] = [];
  let guillemets = false;
  const s = texte.charCodeAt(0) === 0xfeff ? texte.slice(1) : texte;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (guillemets) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          champ += '"';
          i++;
        } else guillemets = false;
      } else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ",") {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      ligne.push(champ);
      champ = "";
      if (ligne.length > 1 || ligne[0] !== "") lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  if (champ !== "" || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return lignes;
}
