import { primitifs, type ModeCouleur } from "./jetons";

// Effets de la refonte du 26/10 que les jetons à plat ne savent pas dire : dégradés, voiles, translucides, ombres.
// Même règle que les jetons : les composants ne lisent jamais une couleur en dur, ils passent par ici.

export type Arret = { offset: number; couleur: string; opacite?: number };

/** Les parties de l'appli : chacune a son dégradé du geste principal (27/10, demande d'Alex) ; le Fil depuis le 31/10. */
export type Partie = "accueil" | "entrainement" | "nutrition" | "sante" | "fil";

export type Degrade = { arrets: Arret[]; sur: string; ombre: string; reflet: Arret[] };

/** Reflet blanc qui traverse (105°, 28 % au centre), le même sur les quatre dégradés. */
const reflet: Arret[] = [
  { offset: 0.3, couleur: "#ffffff", opacite: 0 },
  { offset: 0.5, couleur: "#ffffff", opacite: 0.28 },
  { offset: 0.7, couleur: "#ffffff", opacite: 0 },
];

/** Clair en haut à gauche, foncé en bas à droite (135°), texte blanc, ombre douce teintée de l'arrêt foncé. */
function famille(clair: string, milieu: string, fonce: string, ombre: string): Degrade {
  return {
    arrets: [
      { offset: 0, couleur: clair },
      { offset: 0.48, couleur: milieu },
      { offset: 1, couleur: fonce },
    ],
    sur: "#ffffff",
    ombre: `0px 6px 18px -8px rgba(${ombre},0.55)`,
    reflet,
  };
}

/**
 * Geste principal par partie, même dégradé jour et nuit. Contraste du libellé blanc (arrêt clair · milieu · foncé) :
 * bleu 3,31 · 5,17 · 8,19 ; orange 2,36 · 3,23 · 4,40 ; turquoise 1,81 · 3,19 · 4,99 ; rose 3,07 · 4,35 · 5,96 ;
 * prune vers cerise 2,84 · 5,75 · 8,21.
 * Nutrition est turquoise depuis la v2.2.17 (« Lagon vif et profond », planche teintes-parties) : le vert est réservé à ce
 * qui est validé. Le Fil (planche fil, P1, puis « Prune/cerise, non ? » de le 31/10) : deux teintes, comme Santé, de la
 * prune (clair, milieu) vers une cerise profonde (foncé), qui fait aussi la nappe foncée de son aura.
 */
export const degrades: Record<Partie, Degrade> = {
  accueil: famille("#3d8bff", "#2563eb", "#1e3fc4", "30,63,196"),
  entrainement: famille("#ff8a1f", "#f2610f", "#e0391a", "224,57,26"),
  nutrition: famille("#1bd8bb", "#0ca291", "#007c82", "0,124,130"),
  sante: famille("#ff4f9a", "#e5178b", "#8a2be2", "138,43,226"),
  fil: famille("#c77ddb", "#9440b4", "#9b1144", "155,17,68"),
};

/**
 * Avatar par défaut (retour du 05/11 : « sur fond gris, avec un dégradé équivalent, peu importe l'onglet actif ») :
 * le même dégradé que les parties (clair en haut à gauche, foncé en bas à droite), en gris ardoise, jour comme nuit. Blanc
 * dessus : 3,0 · 5,0 · 8,8 (arrêt clair · milieu · foncé).
 */
export const degradeAvatar: Degrade = famille("#8f95a1", "#6a707c", "#464b56", "70,75,86");

/** Points de départ et d'arrivée (fractions de la boîte) d'un dégradé linéaire à `deg` degrés, façon CSS. */
export function axeDegrade(deg: number, largeur: number, hauteur: number) {
  const a = (deg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  // Demi-longueur de la ligne de dégradé CSS : la boîte entière tient entre les deux arrêts extrêmes.
  const demi = (Math.abs(largeur * dx) + Math.abs(hauteur * dy)) / 2;
  const x = (dx * demi) / largeur;
  const y = (dy * demi) / hauteur;
  return { x1: 0.5 - x, y1: 0.5 - y, x2: 0.5 + x, y2: 0.5 + y };
}

/**
 * Champ de saisie et bande des molettes posés sur l'aura (parcours de bienvenue, création de compte ; retours du
 * 30/10 : « le champ devrait être transparent un peu ») : blanc translucide la nuit, noir translucide le jour, jamais de
 * gris opaque, l'aura se voit au travers. Saisie (t1) et indication (t3) à 4,5:1 au pire point de l'aura ; `focus` : filet
 * du champ qui a le focus, à 3:1 sur le champ et sur l'aura (tests/champ-translucide.test.ts). `appui` : le champ factice
 * (« Ajouter un commentaire », qui ouvre le tiroir) quand on le touche.
 */
export const champVerre: Record<ModeCouleur, { fond: string; focus: string; appui: string }> = {
  nuit: { fond: primitifs["blanc-10"], focus: primitifs["blanc-70"], appui: primitifs["blanc-21"] },
  jour: { fond: primitifs["noir-09"], focus: primitifs["noir-58"], appui: primitifs["noir-18"] },
};

/** Voile sous une feuille du bas. */
export const voile: Record<ModeCouleur, string> = { nuit: "rgba(0,0,0,0.72)", jour: "rgba(17,20,24,0.32)" };

/** Ombre très douce vers le haut des feuilles du bas, en jour. */
export const ombreFeuille: Record<ModeCouleur, string | null> = {
  nuit: null,
  jour: "0px -12px 32px 0px rgba(17,20,24,0.06)",
};

/** Ombre très douce vers la droite du volet du profil, en jour. */
export const ombreVolet: Record<ModeCouleur, string | null> = {
  nuit: null,
  jour: "12px 0px 32px 0px rgba(17,20,24,0.06)",
};

/**
 * Menu flottant des onglets (27/10) : pilule de verre dépoli teintée du dégradé de la section (celui de son geste principal),
 * le même jour et nuit ; rond blanc de l'onglet actif, libellé noir, icône au dégradé du geste principal de sa partie
 * (`icone` : voile noir pour 3:1 sur le blanc : bleu 3,31 · orange 3,24 · turquoise 3,03 · rose 3,07, arrêt le plus clair) ;
 * icônes inactives blanches. Derrière, un
 * dégradé couleur du fond (`fondu` : noir la nuit, blanc le jour).
 *
 * Couches, de bas en haut : flou expo-blur et sa teinte noire (`verre` : opacité `0,75 × intensite` = 0,30, rayon
 * `intensite / reduction` = 20 px ; sans flou, `sansFlou`, même opacité), puis le dégradé de la section assombri d'un voile
 * noir (`assombrir`), le tout à `opacite` : 0,5, pour que la page se devine floutée dessous (retour du 27/10 ;
 * 0,85 la masquait). Icônes blanches au pire (blanc derrière le verre), arrêt le plus clair, 3:1 d'un élément graphique :
 * bleu 3,36 · orange 3,40 · vert 3,36 · rose 3,45.
 */
const verreMenu = {
  verre: { teinte: "systemChromeMaterialDark", intensite: 40, reduction: 2 },
  sansFlou: "rgba(0,0,0,0.3)",
  opacite: 0.5,
  assombrir: { accueil: 0.25, entrainement: 0.38, nutrition: 0.38, sante: 0.26, fil: 0.26 } as Record<Partie, number>,
  icone: { accueil: 0, entrainement: 0.15, nutrition: 0.23, sante: 0, fil: 0.15 } as Record<Partie, number>,
  actifFond: "#ffffff",
  actifTexte: "#141312",
  inactif: "#ffffff",
} as const;
// Filet du contour : noir léger en nuit, blanc léger en jour (retour du 27/10 : le blanc en nuit faisait bordure).
export const menu: Record<ModeCouleur, typeof verreMenu & { filet: string; ombre: string; fondu: string }> = {
  nuit: { ...verreMenu, filet: "rgba(0,0,0,0.2)", ombre: "0px 12px 32px -10px rgba(0,0,0,0.7)", fondu: "#000000" },
  jour: { ...verreMenu, filet: "rgba(255,255,255,0.2)", ombre: "0px 12px 32px -12px rgba(17,20,24,0.3)", fondu: "#ffffff" },
};

/** Dégradé de l'icône de l'onglet actif : celui du geste principal de la partie, assombri de `icone`. */
export function arretsIconeActive(p: Partie): Arret[] {
  const k = 1 - verreMenu.icone[p];
  const canal = (h: string, i: number) => Math.round(parseInt(h.slice(i, i + 2), 16) * k).toString(16).padStart(2, "0");
  return degrades[p].arrets.map((a) => ({ offset: a.offset, couleur: "#" + canal(a.couleur, 1) + canal(a.couleur, 3) + canal(a.couleur, 5) }));
}

/** Opacité réelle de la teinte noire posée par expo-blur sur Android (même calcul que son code natif, arrondi à l'octet). */
export function opaciteVerre(v: typeof verreMenu.verre): number {
  return Math.trunc(255 * (v.intensite / 100) * 0.75) / 255;
}

/**
 * Carte blanche du jour (v2.2.17, règle d'Alex du 29/10 : fond teinté, cartes blanches) : ombre très douce teintée de
 * l'arrêt foncé de la partie, pour qu'elle se détache encore là où l'aura s'efface ; la nuit, aucune (une ombre Android se
 * verrait au travers d'une carte translucide).
 */
export function ombreCarte(p: Partie, mode: ModeCouleur): string | null {
  if (mode === "nuit") return null;
  const f = degrades[p].arrets[2]!.couleur;
  const rvb = [1, 3, 5].map((i) => parseInt(f.slice(i, i + 2), 16)).join(",");
  return `0px 1px 2px 0px rgba(${rvb},0.06), 0px 8px 20px -12px rgba(${rvb},0.22)`;
}

/**
 * En-tête collé (semainier et ligne des macros, ui/ZoneSemainier.tsx ; retour du 30/10 : « pas nécessaire de mettre
 * un fond […] l'ombre suffit ») : sans fond, l'aura passe derrière ; seule cette ombre, sous son bord, le sépare de la page
 * coupée dessous. Arrêts du haut vers le bas, vite estompée (arrêt du milieu) ; le jour, teintée comme celle des cartes.
 */
export function ombreColle(p: Partie, mode: ModeCouleur): Arret[] {
  const [couleur, fort] = mode === "nuit" ? ["#000000", 0.3] : [degrades[p].arrets[2]!.couleur, 0.12];
  return [
    { offset: 0, couleur, opacite: fort },
    { offset: 0.35, couleur, opacite: fort * 0.4 },
    { offset: 1, couleur, opacite: 0 },
  ];
}

/** Barre « séance en cours » flottante : ombre portée sous la carte. */
export const ombreBandeau: Record<ModeCouleur, string> = {
  nuit: "0px 12px 28px -8px rgba(0,0,0,0.85)",
  jour: "0px 12px 28px -8px rgba(17,20,24,0.38)",
};

/** Médaille de record : disque or, rubans or, étoile claire, reflet. */
export const or = {
  disque: [
    { offset: 0, couleur: "#fff0b8" },
    { offset: 0.45, couleur: "#eec25a" },
    { offset: 1, couleur: "#b98621" },
  ] as Arret[],
  ruban: [
    { offset: 0, couleur: "#d9a63a" },
    { offset: 1, couleur: "#9c6d14" },
  ] as Arret[],
  lisere: "#fff6d6",
  etoile: "#fff8e1",
  reflet: [
    { offset: 0.3, couleur: "#ffffff", opacite: 0 },
    { offset: 0.5, couleur: "#ffffff", opacite: 0.85 },
    { offset: 0.7, couleur: "#ffffff", opacite: 0 },
  ] as Arret[],
  ombre: "#785000",
} as const;

/** Carte de record de la fin de séance : fond or chaud (dégradé depuis le coin haut gauche), filet or, reflet périodique. */
export const carteOr: Record<ModeCouleur, { fond: string; arrets: Arret[]; filet: string; ombre: string; reflet: Arret[] }> = {
  nuit: {
    fond: "#1a1610",
    arrets: [
      { offset: 0, couleur: "#eec25a", opacite: 0.3 },
      { offset: 0.55, couleur: "#eec25a", opacite: 0.08 },
      { offset: 0.8, couleur: "#eec25a", opacite: 0 },
    ],
    filet: "rgba(238,194,90,0.38)",
    ombre: "0px 10px 24px -14px rgba(185,134,33,0.6)",
    reflet: [
      { offset: 0.35, couleur: "#fff0be", opacite: 0 },
      { offset: 0.5, couleur: "#fff0be", opacite: 0.22 },
      { offset: 0.65, couleur: "#fff0be", opacite: 0 },
    ],
  },
  jour: {
    fond: "#fdf7e8",
    arrets: [
      { offset: 0, couleur: "#f6dd9a" },
      { offset: 0.5, couleur: "#fbefcc" },
      { offset: 0.85, couleur: "#fdf7e8" },
    ],
    filet: "rgba(185,134,33,0.38)",
    ombre: "0px 10px 24px -14px rgba(156,109,20,0.45)",
    reflet: [
      { offset: 0.35, couleur: "#ffffff", opacite: 0 },
      { offset: 0.5, couleur: "#ffffff", opacite: 0.7 },
      { offset: 0.65, couleur: "#ffffff", opacite: 0 },
    ],
  },
};

/** Trait de liaison des valeurs de l'écran Santé, de la teinte rose (les cartes sont en verre : jetons verre-carte, verre-filet). */
export const carteSante: Record<ModeCouleur, { trait: string }> = {
  nuit: { trait: "rgba(255,130,190,0.6)" },
  jour: { trait: "rgba(138,43,226,0.5)" },
};

/** Page Santé, bilan et sommeil (planche sante-energie, D2 et D18) : termes de la dépense en nuances d'orange Sport (du
 * métabolisme, orange sanguine, jamais un rouge d’erreur, à la digestion, le plus clair ; demande d'Alex du 28/10), apports au turquoise de Nutrition ;
 * stades de sommeil en violet/rose Santé ; courbe de la masse grasse. */
export const couleursSante: Record<
  ModeCouleur,
  { bmr: string; sport: string; neat: string; digestion: string; apports: string; gras: string; eveil: string; leger: string; profond: string; paradoxal: string }
> = {
  nuit: { bmr: "#e2441c", sport: "#f2610f", neat: "#ff8a1f", digestion: "#ffc48a", apports: "#1bd8bb", gras: "#ff4f9a", eveil: "#948d86", leger: "#ffb0cc", profond: "#9d6bff", paradoxal: "#ff4f9a" },
  jour: { bmr: "#c23a17", sport: "#d4520b", neat: "#e8760f", digestion: "#f5a35c", apports: "#0ca291", gras: "#e5178b", eveil: "#636b74", leger: "#d15fae", profond: "#7a2fd0", paradoxal: "#e5178b" },
};
