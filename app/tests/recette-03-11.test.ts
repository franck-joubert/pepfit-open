// Retouches de la recette à l'écran du 03/11 (docs/RECETTE-03-11.md, § 4) : non-régression sur les sources.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./attendu.ts";

const lire = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

describe("bandeau « Exercice modifié » (planche exercices-perso seance-3)", () => {
  it("coche verte devant le texte", () => {
    expect(/<BandeauAnnuler coche texte=\{t\("exercices\.formulaire\.modifie"\)\}/.test(lire("ecrans/actions-seance.tsx"))).toBe(true);
    expect(/coche \? <Icone nom="check" couleur=\{couleurs\.valide\}/.test(lire("ui/BandeauAnnuler.tsx"))).toBe(true);
  });
  it("posé au-dessus de la bande du bas (Pause), mesurée à l'écran", () => {
    const s = lire("app/session.tsx");
    expect(/hauteurBande \? hauteurBande \+ espace\.s : basEcran \+ espace\.l/.test(s)).toBe(true);
    expect(/<SousLeClavier>\s*<View onLayout=\{\(e\) => setHauteurBande\(/.test(s)).toBe(true);
  });
});

describe("formulaire d'exercice perso (planche creer-4)", () => {
  const f = lire("ecrans/FormulaireExercice.tsx");
  it("« En séance : KG, RÉPS » : les colonnes en majuscules par le style d'en-tête", () => {
    expect(/\{t\("exercices\.formulaire\.enSeance"\)\}\{" "\}\s*\{\/\*[^*]*\*\/\}\s*<Texte variante="meta" couleur="t2" style=\{\{ textTransform: typo\.entete\.textTransform \}\}>/.test(f)).toBe(true);
  });
  it("«, par défaut » allégé (suite de la ligne, 13 t2)", () => {
    expect(/suite=\{tempoPropre \? undefined : t\("exercices\.formulaire\.tempoParDefaut"\)\}/.test(f)).toBe(true);
  });
});

describe("feuille du bas, clavier ouvert", () => {
  it("sa hauteur est bornée sous la barre d'état (zone sûre du haut)", () => {
    const f = lire("ui/Feuille.tsx");
    expect(/const \{ bottom: bas, top: haut \} = useSafeAreaInsets\(\);/.test(f)).toBe(true);
    expect(/const borne = clavier && cadre \? \{ maxHeight: Math\.min\(cadre \* 0\.86, cadre - clavier - haut - espace\.s\) \} : null;/.test(f)).toBe(true);
    expect(/onLayout=\{\(e\) => setCadre\(e\.nativeEvent\.layout\.height\)\}/.test(f)).toBe(true);
    expect(/transform: \[\{ translateY: ty \}\] \},\s*borne,/.test(f)).toBe(true);
  });
});
