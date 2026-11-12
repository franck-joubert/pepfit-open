// Jetons de mouvement : durées (ms), courbes (cubic-bezier) et ressorts, partagés par src/ui/mouvement.tsx.
// Les courbes sont celles du glisser-déposer (src/ui/Glisser.tsx) : une seule famille dans toute l'appli.

export const courbe = {
  /** Entrées, sorties, retours d'appui : part vite, se pose doucement. */
  sortie: [0.23, 1, 0.32, 1],
  /** Déplacement d'un élément déjà à l'écran (liste qui se réordonne). */
  deplacement: [0.77, 0, 0.175, 1],
  /** Feuille du bas (courbe de tiroir d'iOS). */
  feuille: [0.32, 0.72, 0, 1],
  /** Écran qui s'en va (la séance qui redescend) : démarre tout de suite, accélère jusqu'au bord. */
  fermeture: [0.3, 0, 1, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export const duree = {
  /** Enfoncement d'un bouton. */
  appui: 100,
  /** Retour d'un bouton relâché. */
  relache: 160,
  /** Pop de la coche de série. */
  coche: 220,
  /** Ligne ou exercice qui entre ; voisins qui se décalent. */
  entree: 200,
  /** Ligne ou exercice qui sort. */
  sortie: 150,
  /** Feuille qui monte. */
  feuille: 280,
  /** Feuille qui descend (bouton, voile ou retour). */
  feuilleSortie: 220,
  /** Écran de la séance qui monte du bas (courbe feuille). */
  seance: 300,
  /** Écran de la séance qui redescend (courbe fermeture). */
  seanceSortie: 220,
  /** Barre de repos qui monte ou descend. */
  barre: 240,
  /** Saut de la barre de progression (+15 / −15). */
  saut: 250,
  /** Bloc des records, à la fin de la séance. */
  record: 300,
  /** Message de bienvenue de l'Accueil, à l'ouverture de l'appli. */
  bienvenue: 300,
  /** Passage d'un onglet à l'autre : glissé court et fondu (courbe sortie). */
  onglet: 220,
  /** Passage d'un onglet à l'autre, variante fondu seul. */
  ongletFondu: 180,
  /** Bulle de séance qui paraît ou s'efface. */
  bulle: 180,
  /** Élément posé qui change de place (bulle de séance, aura qui suit le défilement) : courbe déplacement. */
  deplacement: 220,
  /** Élément glissé-déposé qui rejoint sa place ; voisins qui s'écartent. */
  depot: 200,
  /** Semaine qui part puis arrive au balayage (chaque moitié). */
  balayage: 120,
  /** Chiffre qui change en place (série, minuteur du plein écran, pas du parcours) : fondu ou glissé très court. */
  chiffre: 120,
  /** Étape du parcours (première utilisation, création de compte) qui entre. */
  pas: 220,
  /** Filet de focus d'un champ qui paraît ou s'efface (fondu seul). */
  focus: 150,
  /** Pastille de l'interrupteur qui glisse, piste qui change de couleur. */
  bascule: 160,
  /** Écran poussé qui arrive : monte de 8 % en fondu ; page du mois : poussée depuis la droite (ressources Android :
   *  plugins/duree-pages.js, qui remplace les 350 ms natifs de react-native-screens). */
  page: 260,
  /** Écran poussé qui repart (retour). */
  pageRetour: 220,
} as const;

/**
 * Vol de l'âme (planches/age-coeur, validée le 29/10) : l'Âge pepfit quitte la poitrine du personnage de Santé et
 * devient la grande signature de la page Âge. Une transition de vue que l'œil suit (≈ 120 dp, ×5,5), d'où plus de 300 ms ;
 * retour plus court ; la page Santé couverte en 150 ms ; entrées de 200 ms, 40 ms d'écart ; le chiffre quand la pupille
 * s'ouvre. Sans vol (autre arrivée, mouvement réduit) : fondu de 200 ms. Courbes : `deplacement` (vol), `sortie` (fondus).
 */
export const ame = {
  vol: 420,
  retour: 300,
  couvre: 150,
  entree: 200,
  ecart: 40,
  debutEntrees: 100,
  chiffre: 240,
  /** Passage âme → signature pendant le vol (100 à 400 ms), et retour (0 à 220 ms). */
  morphoseDebut: 100,
  morphose: 300,
  morphoseRetour: 220,
  /** Retour : le contenu part en 120 ms, le fond de 60 à 260 ms. */
  sortieContenu: 120,
  sortieFondDebut: 60,
  fondu: 200,
} as const;

/**
 * Arrivée sur Santé (30/10) : le corps paraît en fondu par-dessus sa silhouette, puis chaque trait se trace du corps
 * vers sa vignette, et la vignette se pose au bout, en léger décalé, de haut en bas ; moins de 400 ms en tout, courbe
 * `sortie`. Une fois : au premier affichage, puis quand les valeurs montrées changent (ecrans/sante-entree.tsx).
 */
export const santeEntree = {
  /** Fondu du corps (et de sa silhouette), à sa première image. */
  corps: 200,
  /** Premier trait, et durée de chacun. */
  debutTraits: 40,
  trait: 140,
  /** Première vignette, et durée de chacune. */
  debutCases: 120,
  case: 120,
  /** Écart entre deux vignettes (et deux traits). */
  ecart: 25,
  /** La vignette sort du bout de son trait (dp). */
  glisse: 6,
  /** Premier affichage : attente maximale du corps et des données (ms) avant de poser les vignettes. */
  attente: 1200,
} as const;

/** Glissés lâchés (feuille, volet, jours, semaine) : au-delà de cette vitesse (px/ms), le geste est un lancer et
 *  aboutit, quelle que soit la distance parcourue. Une seule valeur pour que tous les panneaux répondent pareil. */
export const geste = { vitesse: 0.5 } as const;

/** Halo qui repère aujourd'hui (« Aujourd'hui », bande et page du mois) : un repère qu'on suit des yeux, pas une
 *  transition d'interface, d'où une durée hors de la règle des 300 ms (700 ms demandés le 27/10). */
export const halo = {
  /** Chaque anneau. */
  duree: 700,
  /** Le second anneau part un peu après le premier. */
  decalage: 140,
  /** L'anneau part de la pastille et finit à cette échelle. */
  fin: 2.1,
} as const;

/** Pile de vignettes de la boutique (sport-programmes-routines D12, validé le 29/10) : les vignettes empilées s'écartent à
 *  leur place, chacune en `duree`, `ecart` entre deux, `delai` après l'arrivée de la page, une fois, courbe `sortie`. Le seul
 *  mouvement de la page, que l'œil suit : d'où une durée hors de la règle des 300 ms. */
export const pile = { duree: 520, ecart: 40, delai: 120 } as const;

/** Calendrier de « Explorer les programmes » (planche boutiques, variante A, validée le 30/10) : les séances se posent case
 *  après case, chacune en `duree`, `ecart` entre deux, `delai` après l'arrivée de la page, une fois, courbe `sortie`. Seul
 *  mouvement de la page Programmes, comme la pile pour les routines. */
export const calendrier = { duree: 460, ecart: 45, delai: 120 } as const;

/** Échelles : jamais 0, un élément n'apparaît pas de rien. */
export const echelle = {
  appui: 0.97,
  /** Bouton principal en dégradé : grand, il bouge moins. */
  appuiPrincipal: 0.98,
  /** Petites cibles (case de série) : un peu plus marqué pour se voir sous le doigt. */
  appuiPetit: 0.94,
  /** La coche part de là et se pose à 1. */
  cocheDepart: 0.6,
  recordDepart: 0.8,
} as const;

/** Ressorts sobres (Reanimated : masse 1). Pas de rebond, sauf la coche et la médaille, à peine. */
export const ressort = {
  coche: { damping: 22, stiffness: 420, mass: 1 },
  record: { damping: 18, stiffness: 220, mass: 1 },
  /** Retour en place après un glissé lâché sous le seuil (feuille, ligne à supprimer, semaine) : garde la vitesse du
   *  doigt, sans rebond visible (amortissement 0,92). Mêmes noms de champs pour Animated (React Native) et Reanimated. */
  retour: { damping: 32, stiffness: 300, mass: 1 },
} as const;

/** Décalage vertical des entrées (px) : court, la liste ne doit pas « voler ». */
export const glissement = { barre: 24, record: 8, bienvenue: 6 } as const;

/** Reflets (ms) : passage unique sur le bouton principal, passage périodique sur la médaille. */
export const reflet = {
  /** À l'apparition du bouton principal : attend un peu que l'écran soit posé, puis passe une fois. */
  apparitionDelai: 500,
  apparition: 1100,
  courbeApparition: [0.2, 0.7, 0.2, 1],
  /** À l'appui : plus court, le doigt est déjà là. */
  appui: 600,
  courbeAppui: [0, 0, 0.58, 1],
  /** Médaille : un passage toutes les `medaillePeriode` ms, tant qu'elle est à l'écran ; premier après `medailleDelai`. */
  medaillePeriode: 6000,
  medaille: 900,
  medailleDelai: 1000,
  courbeMedaille: [0.2, 0.7, 0.2, 1],
  /** Le reflet part et arrive hors champ : décalage en largeurs de l'élément, de −course à +course. */
  course: 1.2,
  /** Médaille : la bande (30 à 70 % du disque) sort tout juste du disque à ±1. */
  courseMedaille: 1,
} as const satisfies Record<string, number | readonly [number, number, number, number]>;

/** Comète de la bulle de séance : un tour en `tour` ms ; au repos (6 s sans geste, comme l'aura), un tour toutes les
 *  `periodeRepos` ms ; après 14 s, trait fixe, qui paraît ou s'efface en `fondu` ms (D1, validé le 28/10). */
export const comete = { tour: 1000, periodeRepos: 4000, fondu: 300 } as const;

/** Menu flottant des onglets : s'élargit sur l'onglet actif (il ne se cache plus au défilement, 27/10). */
export const menuFlottant = {
  /** Changement d'onglet : la pilule et les ronds glissent à leur nouvelle largeur. */
  elargir: 200,
  courbeElargir: courbe.sortie,
  /** Libellé de l'onglet actif : fondu d'entrée. */
  libelle: 200,
  courbeLibelle: courbe.sortie,
  /** Entrer ou sortir d'un onglet : fondu du menu. */
  cacher: 200,
  courbeCacher: courbe.sortie,
} as const;

/**
 * Suppression (planche suppression-animee, variante A « poussière ») : la capture de l'élément part en grains, balayés de
 * gauche à droite ; sa place se replie pendant ce temps et les voisins remontent en continu. Durées en ms, distances en px.
 */
export const desintegration = {
  /** Côté d'un grain ; grossit sur un grand élément pour rester sous `grainsMax`. */
  pas: 3,
  grainsMax: 4000,
  /** Le front traverse l'élément en `balayage`, chaque grain part avec jusqu'à `alea` de retard, plus une ondulation verticale. */
  balayage: 280,
  alea: 60,
  onde: 14,
  /** Vie d'un grain : de `vie × vieMin` à `vie`, courbe `sortie`. */
  vie: 360,
  vieMin: 0.7,
  /** Dérive : de `deriveX[0]` à `deriveX[0] + deriveX[1]` vers la droite, idem vers le haut. */
  deriveX: [18, 46],
  deriveY: [6, 30],
  /** Le grain rétrécit jusqu'à la moitié ; opacité (1 − p)^attenuation. */
  retrecit: 0.5,
  attenuation: 1.4,
  /** Place de l'élément : se replie de `resserreA` à `resserreA + resserre` (courbe `deplacement`). */
  resserreA: 300,
  resserre: 260,
  /** Marge du dessin autour de l'élément : les grains dérivent vers le haut et la droite. */
  margeHaut: 40,
  margeDroite: 72,
  /** Supprimé depuis un écran de détail : la liste attend la fin du retour (glissement de l'écran) avant de désintégrer ;
   *  une image de plus pour que l'écran soit bien parti. */
  apresRetour: duree.pageRetour + 16,
} as const;

/** « Réduire les animations », ou capture impossible : fondu sobre (variante C), la place se replie aussi. */
export const fonduSuppression = { duree: 180, echelle: 0.96, resserreA: 120, resserre: 220 } as const;

/** Retour d'un élément (« Annuler ») : sa place s'ouvre, les voisins s'écartent en continu, puis il apparaît en fondu. */
export const retourElement = { ouvre: 240, fondu: 200, fonduA: 80 } as const;

/** Boucle du reflet de la médaille : attente avant le premier passage, passage, pause jusqu'au suivant (ms). */
export function boucleMedaille(r: { medailleDelai: number; medaille: number; medaillePeriode: number } = reflet) {
  return { delai: r.medailleDelai, passage: r.medaille, pause: Math.max(0, r.medaillePeriode - r.medaille) };
}
