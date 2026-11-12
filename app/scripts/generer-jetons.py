#!/usr/bin/env python3
"""Génère src/theme/jetons.ts depuis scripts/jetons.py (source unique des jetons du design système).
Usage : python3 scripts/generer-jetons.py [--verifier]  (--verifier échoue si le fichier diffère)"""
import sys
from pathlib import Path

ICI = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ICI / "scripts"))
import jetons as j  # noqa: E402

SORTIE = ICI / "src" / "theme" / "jetons.ts"


def camel(nom: str) -> str:
    morceaux = nom.split("-")
    return morceaux[0] + "".join(m.capitalize() for m in morceaux[1:])


def mode(i: int) -> str:
    lignes = []
    for role, couple in j.SEMANTIQUE.items():
        lignes.append(f'    {camel(role)}: "{j.PRIMITIFS[couple[i]]}",')
    for comp, role in j.COMPOSANTS.items():
        if i == 1:
            role = j.FEUILLE_JOUR.get(comp, role)
        lignes.append(f'    {camel(comp)}: "{j.valeur(role, i)}",')
    return "\n".join(lignes)


def dans_feuille() -> str:
    return "\n".join(f'    {camel(c)}: "{j.valeur(r, 1)}",' for c, r in j.DANS_FEUILLE_JOUR.items())


def recette() -> str:
    """Teinte par partie (v2.2.17) : parts de la couleur de la partie, par mode et par rôle (theme/teintes.ts)."""
    def val(v):
        return f"[{v[0]}, {v[1]}]" if isinstance(v, tuple) else str(v)
    return "\n".join(
        f"  {m}: {{ " + ", ".join(f"{camel(k)}: {val(v)}" for k, v in roles.items()) + " },"
        for m, roles in j.RECETTE_PARTIE.items()
    )


def contenu() -> str:
    prim = "\n".join(f'  "{k}": "{v}",' for k, v in j.PRIMITIFS.items())
    return f"""// GÉNÉRÉ par scripts/generer-jetons.py depuis scripts/jetons.py : ne pas modifier à la main.
export const primitifs = {{
{prim}
}} as const;

export const nuit = {{
{mode(0)}
}} as const;

export const jour = {{
{mode(1)}
}} as const;

export type Jetons = {{ [K in keyof typeof nuit]: string }};
export type ModeCouleur = "nuit" | "jour";
export const modes: Record<ModeCouleur, Jetons> = {{ nuit, jour }};

/** Teinte par partie (v2.2.17) : part de la couleur de la partie dans chaque rôle ; `verreCarte` de nuit : [part dans le noir, opacité]. */
export const recettePartie = {{
{recette()}
}} as const;

/** Ce qui change dans une feuille du bas (jour : fond blanc, éléments en s1 ; nuit : rien). */
export const dansFeuille: Record<ModeCouleur, Partial<Jetons>> = {{
  nuit: {{}},
  jour: {{
{dans_feuille()}
  }},
}};
"""


if __name__ == "__main__":
    texte = contenu()
    if "--verifier" in sys.argv:
        sys.exit(0 if SORTIE.exists() and SORTIE.read_text() == texte else 1)
    SORTIE.write_text(texte)
    print(f"écrit {SORTIE.relative_to(ICI)}")
