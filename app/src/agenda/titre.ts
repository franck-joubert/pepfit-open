// Agenda du téléphone, ajustements du 03/11 (docs/CODE-AGENDA.md § 6) : le titre de l'événement écrit (éléments cochés et
// ordonnés : emoji du sport, sport, nom, durée) et sa description. Pur (ni base, ni i18n : les mots arrivent de l'appelant) : testé par
// tests/agenda-telephone.test.ts, dont un test de couverture (chaque sport du catalogue a son emoji).
import { familleDe, type Famille } from "../ecrans/familles-table";

const slugDe = (id: string) => (id.startsWith("cat:") ? id.slice(4) : id);

/** Emoji de chaque sport du catalogue (slug). Un sport absent prend celui de sa famille (`PAR_FAMILLE`). */
export const EMOJI_SPORT: Readonly<Record<string, string>> = {
  // Force
  musculation: "🏋️‍♂️",
  "cross-training": "🏋️",
  // Endurance
  course: "🏃",
  marche: "🚶",
  randonnee: "🥾",
  "montee-marches": "🪜",
  stairmaster: "🪜",
  bicycling: "🚴",
  "bicycling-stationary": "🚴",
  "assault-bike": "🚴",
  vtt: "🚵",
  "elliptical-trainer": "🏃",
  "rowing-stationary": "🚣",
  "rope-jumping": "🪢",
  versaclimber: "🧗",
  skating: "🛼",
  "fauteuil-roulant": "🧑‍🦽",
  duathlon: "🏅",
  triathlon: "🏊",
  athletisme: "🏃",
  "course-obstacles": "🏃",
  natation: "🏊",
  // Sports et cours
  hiit: "🔥",
  "cardio-boxe": "🥊",
  "barre-fitness": "🩰",
  pilates: "🧘",
  gymnastique: "🤸",
  danse: "💃",
  parkour: "🤸",
  "arts-du-cirque": "🎪",
  football: "⚽",
  "football-americain": "🏈",
  "football-australien": "🏉",
  "football-gaelique": "⚽",
  hurling: "🏑",
  rugby: "🏉",
  basket: "🏀",
  volley: "🏐",
  handball: "🤾",
  netball: "🏀",
  baseball: "⚾",
  softball: "🥎",
  cricket: "🏏",
  "hockey-gazon": "🏑",
  "hockey-glace": "🏒",
  lacrosse: "🥍",
  ultimate: "🥏",
  "water-polo": "🤽",
  polo: "🏇",
  spikeball: "🏐",
  tennis: "🎾",
  padel: "🎾",
  squash: "🎾",
  badminton: "🏸",
  "tennis-de-table": "🏓",
  pickleball: "🏓",
  boxe: "🥊",
  kickboxing: "🥊",
  "arts-martiaux": "🥋",
  "jiu-jitsu": "🥋",
  lutte: "🤼",
  escrime: "🤺",
  voile: "⛵",
  kayak: "🛶",
  paddle: "🏄",
  surf: "🏄",
  plongee: "🤿",
  kitesurf: "🪁",
  "ski-nautique": "🌊",
  wakeboard: "🌊",
  escalade: "🧗",
  ski: "⛷️",
  "ski-de-fond": "⛷️",
  snowboard: "🏂",
  golf: "⛳",
  "disc-golf": "🥏",
  equitation: "🏇",
  skateboard: "🛹",
  "patin-a-glace": "⛸️",
  paintball: "🎯",
  motocross: "🏍️",
  "sport-auto": "🏎️",
  // Récupération
  yoga: "🧘",
  etirements: "🤸",
  meditation: "🧘",
  sauna: "🧖",
  "bain-froid": "🧊",
  massage: "💆",
};

const PAR_FAMILLE: Readonly<Record<Famille, string>> = { force: "🏋️‍♂️", dehors: "🏃", interieur: "🚴", seance: "🏅", recup: "🧘" };
/** Séance sans sport connu (routine vide). */
export const EMOJI_DEFAUT = "💪";

/** Emoji d'un sport (« cat:padel » ou « padel ») ; sport inconnu (routine vide) : 💪. */
export function emojiSport(sport: string | null | undefined): string {
  if (!sport) return EMOJI_DEFAUT;
  const slug = slugDe(sport);
  return EMOJI_SPORT[slug] ?? PAR_FAMILLE[familleDe(slug)] ?? EMOJI_DEFAUT;
}

/**
 * Titre composé (03/11, deuxième version) : des éléments cochés, dans l'ordre choisi. Le nom est toujours coché (un titre
 * n'est jamais vide). Le lieu n'en fait pas partie : il est déjà écrit dans le champ « lieu » de l'événement.
 */
export const ELEMENTS_TITRE = ["emoji", "sport", "nom", "duree"] as const;
export type ElementTitre = (typeof ELEMENTS_TITRE)[number];
export interface TitreCompose {
  /** Les quatre éléments, dans l'ordre du titre. */
  ordre: ElementTitre[];
  /** Ceux qui y figurent (le nom toujours). */
  coches: ElementTitre[];
}
export const TITRE_DEFAUT: TitreCompose = { ordre: [...ELEMENTS_TITRE], coches: ["nom"] };

const estElement = (x: unknown): x is ElementTitre => (ELEMENTS_TITRE as readonly unknown[]).includes(x);

/** Remet d'aplomb un titre lu ou modifié : chaque élément une fois (les absents à la fin, dans l'ordre par défaut), le nom coché. */
export function normaliserTitre(t: { ordre?: unknown; coches?: unknown }): TitreCompose {
  const ordre = [...new Set(Array.isArray(t.ordre) ? t.ordre.filter(estElement) : [])];
  for (const e of ELEMENTS_TITRE) if (!ordre.includes(e)) ordre.push(e);
  const coches = new Set(Array.isArray(t.coches) ? t.coches.filter(estElement) : []);
  coches.add("nom");
  return { ordre, coches: ordre.filter((e) => coches.has(e)) };
}

/** Titre écrit en réglage (JSON) ; illisible : le titre par défaut. */
export function lireTitre(v: string | null | undefined): TitreCompose {
  if (!v) return TITRE_DEFAUT;
  try {
    const x = JSON.parse(v) as unknown;
    return x && typeof x === "object" ? normaliserTitre(x) : TITRE_DEFAUT;
  } catch {
    return TITRE_DEFAUT;
  }
}

/** Modèles de la première version (radios), gardés pour la migration du réglage. */
export const FORMATS_ANCIENS = ["nom", "sportNom", "nomDuree", "sportNomDuree"] as const;
export type FormatAncien = (typeof FORMATS_ANCIENS)[number];

/** Migration : l'ancien modèle et l'interrupteur d'emoji donnent le même titre, cochés dans l'ordre par défaut. */
export function titreDepuisAncien(format: string | null | undefined, emoji: boolean): TitreCompose {
  const f = (FORMATS_ANCIENS as readonly string[]).includes(format ?? "") ? (format as FormatAncien) : "nom";
  const coches: ElementTitre[] = ["nom"];
  if (emoji) coches.push("emoji");
  if (f === "sportNom" || f === "sportNomDuree") coches.push("sport");
  if (f === "nomDuree" || f === "sportNomDuree") coches.push("duree");
  return normaliserTitre({ ordre: ELEMENTS_TITRE, coches });
}

/** Un élément monté ou descendu d'un cran (boutons de la feuille, lecteur d'écran) ; au bord, rien ne change. */
export function deplacerElement(t: TitreCompose, e: ElementTitre, sens: -1 | 1): TitreCompose {
  const i = t.ordre.indexOf(e);
  return placerElement(t, e, i + sens);
}

/** Un élément posé à une place (glisser-déposer) ; les autres gardent leur ordre. */
export function placerElement(t: TitreCompose, e: ElementTitre, place: number): TitreCompose {
  const i = t.ordre.indexOf(e);
  if (i < 0 || place < 0 || place >= t.ordre.length || place === i) return t;
  const ordre = t.ordre.filter((x) => x !== e);
  ordre.splice(place, 0, e);
  return normaliserTitre({ ordre, coches: t.coches });
}

/** Coche ou décoche un élément ; le nom reste coché. */
export function basculerElement(t: TitreCompose, e: ElementTitre): TitreCompose {
  return normaliserTitre({ ordre: t.ordre, coches: t.coches.includes(e) ? t.coches.filter((x) => x !== e) : [...t.coches, e] });
}

const meme = (a: string, b: string) => a.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase() === b.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();

/**
 * Titre de l'événement : « 🏋️‍♂️ Musculation · Gym Upper · 45 min », dans l'ordre choisi, séparé par « · » (l'emoji, lui,
 * par une espace). Le sport n'est pas répété quand la séance porte son nom (« Course à pied ») ; une séance sans nom prend
 * celui du sport.
 */
export function titreEvenement(s: { nom: string; sport: string | null; nomSport: string | null; duree: string }, titre: TitreCompose): string {
  const nom = s.nom.trim() || s.nomSport || "";
  const parts: { emoji: boolean; texte: string }[] = [];
  for (const e of titre.ordre) {
    if (!titre.coches.includes(e) && e !== "nom") continue;
    if (e === "emoji") parts.push({ emoji: true, texte: emojiSport(s.sport) });
    else if (e === "sport" && s.nomSport && !meme(s.nomSport, nom)) parts.push({ emoji: false, texte: s.nomSport });
    else if (e === "nom" && nom) parts.push({ emoji: false, texte: nom });
    else if (e === "duree" && s.duree) parts.push({ emoji: false, texte: s.duree });
  }
  return parts.map((p, i) => (i === 0 ? "" : p.emoji || parts[i - 1]!.emoji ? " " : ", ") + p.texte).join("");
}

/**
 * Description de l'événement : une ligne par exercice (« Squat · 4 séries »), la durée estimée, puis « Planifiée dans pepfit »
 * et le lien qui ouvre la séance (marque reconnue par calcul.ts, estDePepfit).
 */
export function descriptionEvenement(o: { exercices: readonly string[]; duree: string; note: string; lien: string }): string {
  return [...o.exercices, o.duree, "", o.note, o.lien].join("\n").replace(/^\n+/, "");
}

/** Lieu écrit dans l'événement : l'adresse du lieu si elle est connue, sinon son nom (« Maison »). */
export function lieuEvenement(l: { nom: string; adresse: string | null } | null | undefined): string | null {
  if (!l) return null;
  return l.adresse?.trim() || l.nom.trim() || null;
}

export interface LigneDetail {
  nom: string;
  nbSeries: number;
  /** Distance visée de chaque série (m), si elle en a une. */
  distances: (number | null)[];
}

/**
 * « Squat, 4 séries », « Footing, 5 km », « Fractionné, 6 × 400 m » ; ni charges, ni répétitions, ni notes. Les mises en
 * forme viennent de l'appelant (langue et unités actives).
 */
export function ligneDetail(l: LigneDetail, f: { series: (n: number) => string; distance: (m: number) => string }): string {
  const d = l.distances.filter((x): x is number => x != null && x > 0);
  if (d.length && d.length === l.distances.length) {
    const egales = d.every((x) => x === d[0]);
    return `${l.nom}, ${d.length > 1 && egales ? `${d.length} × ${f.distance(d[0]!)}` : f.distance(d.reduce((a, b) => a + b, 0))}`;
  }
  return l.nbSeries > 0 ? `${l.nom}, ${f.series(l.nbSeries)}` : l.nom;
}
