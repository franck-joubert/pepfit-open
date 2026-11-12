import type { Partie } from "./effets";
import { modes, recettePartie, type Jetons, type ModeCouleur } from "./jetons";
import { COULEUR_PARTIE, FOND_PARTIE } from "../ui/partie";

// Teinte par partie (v2.2.17, planche teintes-parties, retour du 29/10 : « le gris a l'air malade »), sans React
// Native (testée dans tests/teintes-parties.test.ts). Dans un écran, les surfaces et les filets prennent la couleur de sa
// partie ; plus aucun gris opaque. Le jour : fond de page à la couleur de la partie presque blanche (`fond-*`), cartes et
// surfaces levées blanches, éléments mêlés de quelques pour cent de la partie. La nuit : les gris mêlés de la partie, carte
// à 20 % de la partie dans le noir posée à 72 % (un cran plus claire que le fond, et assez sombre sur l'aura pour t3).
// Filets, anneaux et pistes : la partie translucide, qui marche sur tous les fonds. Les parts viennent du design system
// (`RECETTE_PARTIE` de scripts/jetons.py).
//
// Restent opaques, et c'est voulu : tout ce qui recouvre du contenu (feuilles, volet, barre de repos, carte tenue) ; les
// mélanges ci-dessous sont donc opaques, seuls les filets, les anneaux et les pistes sont translucides.

/** [r, v, b] (0-255) et opacité d'un « #rrggbb » ou d'un « rgba(r,v,b,a) ». */
export function rvba(c: string): [number, number, number, number] {
  if (c.startsWith("#")) return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 1];
  const v = c.slice(c.indexOf("(") + 1, -1).split(",").map(Number);
  return [v[0]!, v[1]!, v[2]!, v[3] ?? 1];
}

const hex = (r: number, v: number, b: number) => "#" + [r, v, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");

/** La couleur `c` (hexadécimale ou rgba) à son opacité multipliée par `a` : remplace les suffixes `${c}80`, faux sur un rgba. */
export function avecOpacite(c: string, a: number): string {
  const [r, v, b, o] = rvba(c);
  return `rgba(${r},${v},${b},${+(o * a).toFixed(3)})`;
}

/** Mélange opaque : `part` de `teinte` dans `base` (deux « #rrggbb »). */
export function meler(base: string, teinte: string, part: number): string {
  const [r, v, b] = rvba(base);
  const [r2, v2, b2] = rvba(teinte);
  return hex(r + (r2 - r) * part, v + (v2 - v) * part, b + (b2 - b) * part);
}

/** Jetons d'un mode, teintés de la couleur d'une partie. Toujours depuis les jetons de base : jamais deux fois. */
/** Le violet des surfaces du Fil la nuit (06/11) : saturé, plus profond que l'accent lilas. */
export const TEINTE_SURFACE_FIL_NUIT = "#9a35d4";

export function teinterJetons(base: Jetons, partie: Partie, mode: ModeCouleur): Jetons {
  const p = base[COULEUR_PARTIE[partie]];
  const commun = {
    line: avecOpacite(p, recettePartie[mode].line),
    line2: avecOpacite(p, recettePartie[mode].line2),
    verreFilet: avecOpacite(p, recettePartie[mode].verreFilet),
    anneauLibre: avecOpacite(p, recettePartie[mode].anneauLibre),
    segmentPiste: avecOpacite(p, recettePartie[mode].segmentPiste),
  };
  if (mode === "jour") {
    const R = recettePartie.jour;
    const bg = base[FOND_PARTIE[partie]];
    const s1 = "#ffffff";
    const s2 = meler(s1, p, R.s2);
    const s3 = meler(s1, p, R.s3);
    return {
      ...base,
      ...commun,
      bg,
      s1,
      s2,
      s3,
      verreCarte: s1,
      carteOpaque: s1,
      btnTonalFond: s2,
      serieActiveFond: s1,
      serieActiveChamp: s2,
      reposFond: s1,
      reposPiste: s3,
      navActifPastille: s3,
      // Interrupteur éteint : piste de la partie (le liseré noir à 45 % de D8 garde ses 3:1)
      inter: meler(s1, p, R.inter),
      interrupteurPisteEteint: meler(s1, p, R.inter),
      // Une feuille est une page : fond de la partie, groupes blancs.
      feuilleFond: bg,
      feuilleGroupe: s1,
      feuillePoignee: s3,
    };
  }
  const R = recettePartie.nuit;
  // Alex, 06/11 : « sur toutes les sections les boutons sont colorés, dans le réseau ils sont juste gris ». L'accent du Fil
  // est un lilas pastel (#d199f0) : mêlé au gris il ne se voit pas. Les surfaces de la nuit du Fil se mêlent donc d'un violet
  // plus profond et saturé, l'accent (icônes, liens, filets) ne change pas.
  const pSurface = partie === "fil" ? TEINTE_SURFACE_FIL_NUIT : p;
  const s1 = meler(base.s1, pSurface, R.s1);
  const s2 = meler(base.s2, pSurface, R.s2);
  const s3 = meler(base.s3, pSurface, R.s3);
  return {
    ...base,
    ...commun,
    s1,
    s2,
    s3,
    verreCarte: avecOpacite(meler("#000000", pSurface, R.verreCarte[0]), R.verreCarte[1]),
    // la même carte posée sur le noir, opaque : contenu d'une ligne qu'on glisse (le rouge de « Supprimer » ne doit pas transparaître)
    carteOpaque: meler("#000000", meler("#000000", pSurface, R.verreCarte[0]), R.verreCarte[1]),
    segmentChoisi: avecOpacite(p, R.segmentChoisi),
    btnTonalFond: s2,
    serieActiveFond: s1,
    serieActiveChamp: s2,
    reposFond: s1,
    reposPiste: s3,
    navActifPastille: s3,
    inter: s3,
    interrupteurPisteEteint: s3,
    feuilleFond: s1,
    feuilleGroupe: s2,
    feuillePoignee: s3,
  };
}

const cache = new Map<string, Jetons>();

/** Jetons teintés d'une partie et d'un mode, calculés une seule fois (jamais par ligne d'une liste). */
export function jetonsDePartie(partie: Partie, mode: ModeCouleur): Jetons {
  const cle = partie + mode;
  let j = cache.get(cle);
  if (!j) cache.set(cle, (j = teinterJetons(modes[mode], partie, mode)));
  return j;
}

/** Rôles qui changent dans une feuille du bas, le jour : ce qui se pose en s2 passe en s1 (blanc sur le fond de la feuille). */
export const DANS_FEUILLE_JOUR = ["s2", "btnTonalFond", "serieActiveChamp"] as const satisfies readonly (keyof Jetons)[];
