// Carte « Semaine » de l'Accueil (30/10) : un jour devenu « fait » après coup s'affichait dans un carré. La
// bordure du rond ne doit jamais apparaître ni disparaître (Android la dessinait sans arrondi) : seule sa couleur change.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./attendu.ts";

const src = readFileSync(new URL("../src/ecrans/BlocsAccueil.tsx", import.meta.url), "utf8");

describe("rond des jours de la semaine", () => {
  it("bordure toujours posée dans le style du rond, couleur seule selon le jour", () => {
    const rond = src.match(/\n  rond: \{([^}]*)\}/)?.[1] ?? "";
    expect(rond.includes("borderRadius: 18")).toBe(true);
    expect(rond.includes("borderWidth: 1.5")).toBe(true);
    const jours = src.slice(src.indexOf("function Jours"), src.indexOf("const ELARGIR_JOUR"));
    expect(jours.includes('borderColor: j.fait ? couleurs.valide : "transparent"')).toBe(true);
    expect(/j\.fait && \{ borderWidth/.test(jours)).toBe(false);
  });
});
