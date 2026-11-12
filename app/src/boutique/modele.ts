// Boutique de programmes (planche boutique-programmes, A validée le 28/10, avec la grille d'objectifs et la fiche force de B) :
// le schéma d'un programme du catalogue (assets/catalogue/programmes/*.json) et son validateur. Pur : testé par
// tests/boutique.test.ts. Les textes sont bilingues dans le fichier ({ fr, en }) ; `texte(x, langue)` choisit.
import type { TypeProgramme } from "../db/programmes";

/** Le catalogue n'est écrit qu'en français et en anglais (i18n/detection, bilingue()). */
export type Langue = "fr" | "en";
/** Langues de l'appli (i18n/detection), pour les rares consignes écrites dans les quatre. */
export type LangueAppli = Langue | "de" | "es";
export interface Texte2 {
  fr: string;
  en: string;
}
export const texte = (x: Texte2, langue: Langue): string => x[langue] || x.fr;

/** Famille : couleur du dégradé (endurance bleu, force orange, forme vert, santé rose). */
export type Famille = "endu" | "force" | "forme" | "sante";
export const FAMILLES: readonly Famille[] = ["endu", "force", "forme", "sante"];

/** Objectifs : la grille « Que veux-tu faire ? » (variante B) et la question « Objectif » des filtres. */
export type Objectif = "distance" | "muscle" | "force" | "poids" | "maison" | "mobilite" | "nager" | "sport";
export const OBJECTIFS: readonly Objectif[] = ["distance", "muscle", "force", "poids", "maison", "mobilite", "nager", "sport"];

/** Où tu t'entraînes : lieu et matériel en une seule question (D2). */
export type Lieu = "dehors" | "salle" | "maison" | "maison_halteres" | "piscine" | "padel";
export const LIEUX: readonly Lieu[] = ["dehors", "salle", "maison", "maison_halteres", "piscine", "padel"];

export type Niveau = 1 | 2 | 3;

/** Rôle d'une séance dans la semaine : on évite deux séances dures (ou une dure et la longue) de suite. */
export type Role = "facile" | "dure" | "longue";

/** Un bloc : un exercice (ou un membre de superset), avec ses séries et ses cibles. */
export interface Bloc {
  /** Slug du catalogue d'exercices, ou « perso:<clé> » d'un exercice déclaré dans `exercicesPerso`. */
  exo: string;
  series: number;
  reps?: number | null;
  /** Plage de répétitions (double progression) : `reps` … `repsMax`. */
  repsMax?: number | null;
  /** Répétitions différentes à chaque série (pyramide) ; longueur = `series`. */
  repsParSerie?: number[] | null;
  dureeS?: number | null;
  distanceM?: number | null;
  /** Zone visée (1 à 5) des blocs d'endurance. */
  zone?: number | null;
  /** Repos après chaque série (récupération entre deux efforts en endurance). */
  reposS?: number | null;
  /** Tempo « 3-1-1-0 » (descente, pause en bas, montée, pause en haut). */
  tempo?: string | null;
  /** Les blocs contigus d'un même numéro forment un superset (ou un circuit). */
  superset?: number | null;
  /** Superset : temps entre deux exercices d'un tour. */
  transitionS?: number | null;
  /** Charge ajoutée à chaque nouvelle séance avec cet exercice (5×5 : 2,5 kg ; 5 au soulevé de terre). */
  progressionKg?: number | null;
  /** Effort visé : répétitions en réserve (RIR) à la fin de chaque série, 0 (échec) à 5 ; absent : 2 (NOTES-CHARGES § 3). */
  rir?: number | null;
  note?: Texte2 | null;
}

export interface Seance {
  nom: Texte2;
  type: TypeProgramme;
  role: Role;
  /** Format d'un WOD (EMOM du kettlebell) et sa valeur en s. */
  format?: "amrap" | "emom" | "fortime" | "rounds" | null;
  formatValeur?: number | null;
  note?: Texte2 | null;
  /** Le jour de l'épreuve (course du 10 km…) : la dernière barre du volume dit « jour J ». */
  epreuve?: boolean;
  blocs: Bloc[];
}

export interface Semaine {
  n: number;
  /** Indice de la phase (base, développement, affûtage…). */
  phase: number;
  allegee: boolean;
  /** Ce qui marque la semaine : « fractionné court », « côtes »… */
  accent: Texte2 | null;
  /** Les séances de la semaine, dans l'ordre (clés de `seances`). */
  seances: string[];
}

export interface ExercicePerso {
  nom: Texte2;
  nature: "reps" | "duree" | "distance_duree" | "poids_reps";
}

export interface Programme {
  id: string;
  version: number;
  nom: Texte2;
  resume: Texte2;
  description: Texte2;
  famille: Famille;
  type: TypeProgramme;
  objectifs: Objectif[];
  lieux: Lieu[];
  niveau: Niveau;
  semaines: number;
  seancesParSemaine: number;
  /** Picto 3D de la vignette (clé des pictos de l'appli). */
  picto: string;
  /** Le chiffre qui parle : « 10 km », « 5×5 ». */
  gros: { valeur: string; unite: string | null };
  /** Pastille de la fiche : « Course · dehors ». */
  lieuCourt: Texte2;
  materiel: Texte2;
  /** Programmes de santé (reprise, après 60 ans) : avertissement médical à l'entrée (D5). */
  avertissement: Texte2 | null;
  /** Carte « + 2,5 kg à chaque séance réussie » (fiche force). */
  progression: Texte2 | null;
  /** Feuille de démarrage : charges de départ reprises de l'historique (90 % de la dernière série). */
  chargesDepart: boolean;
  principes: Texte2;
  /** Indices des sources (NOTES § 4, `SOURCES`). */
  sources: number[];
  phases: { nom: Texte2; de: number; a: number }[];
  seances: Record<string, Seance>;
  calendrier: Semaine[];
  /** Séance montrée dans la fiche (« Séance type ») ; en force, toutes les séances différentes de la première semaine. */
  seanceType: string;
  exercicesPerso: Record<string, ExercicePerso>;
}

/**
 * Routine de la boutique (ajout d'Alex du 28/10, hors planche ; lexique du 29/10) : à faire une fois, sans suivre de
 * programme. Même vitrine, mêmes filtres et même vignette qu'un programme ; une seule séance au lieu d'un calendrier.
 * Elle s'ajoute à « mes routines », se démarre tout de suite ou se planifie.
 */
export interface RoutineBoutique {
  id: string;
  version: number;
  nom: Texte2;
  resume: Texte2;
  description: Texte2;
  famille: Famille;
  type: TypeProgramme;
  objectifs: Objectif[];
  lieux: Lieu[];
  niveau: Niveau;
  picto: string;
  gros: { valeur: string; unite: string | null };
  lieuCourt: Texte2;
  materiel: Texte2;
  avertissement: Texte2 | null;
  seance: Seance;
  exercicesPerso: Record<string, ExercicePerso>;
}

/** Les deux rayons de la boutique : un programme (calendrier de plusieurs semaines) ou une routine (à faire une fois). */
export type Article = Programme | RoutineBoutique;
export const estRoutine = (a: Article): a is RoutineBoutique => "seance" in a;

/** Sources libres et reconnues (NOTES § 4). */
export const SOURCES: readonly string[] = [
  "Seiler S., What is best practice for training intensity and duration distribution in endurance athletes?, IJSPP, 2010",
  "Mujika I., Padilla S., Scientific bases for precompetition tapering strategies, Med Sci Sports Exerc, 2003",
  "Buist I. et al., GRONORUN, Am J Sports Med, 2008",
  "ACSM, Progression models in resistance training for healthy adults, Med Sci Sports Exerc, 2009 ; Schoenfeld B. et al., Sports Med 2016, J Sports Sci 2017",
  "Tabata I. et al., Med Sci Sports Exerc, 1996 ; Gibala M. et al., J Physiol, 2012",
  "Donnelly J. et al., ACSM, Med Sci Sports Exerc, 2009 ; OMS, lignes directrices sur l'activité physique, 2020",
  "Garber C. et al., ACSM, Med Sci Sports Exerc, 2011 ; Behm D. et al., Appl Physiol Nutr Metab, 2016",
  "McGill S., Low Back Disorders, Human Kinetics",
  "Silbernagel K. G. et al., Am J Sports Med, 2007",
  "Sherrington C. et al., Exercise for preventing falls in older people living in the community, Cochrane, 2019",
];

const TYPES_OK = ["muscu", "cross", "course", "velo", "natation", "mobilite", "autre"];
const ROLES: readonly string[] = ["facile", "dure", "longue"];
const estTexte = (x: unknown): x is Texte2 =>
  !!x && typeof x === "object" && typeof (x as Texte2).fr === "string" && typeof (x as Texte2).en === "string" && !!(x as Texte2).fr.trim() && !!(x as Texte2).en.trim();
const entier = (x: unknown, min: number, max = Infinity) => typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;
const nul = (x: unknown) => x === undefined || x === null;

/**
 * Erreurs d'un programme du catalogue (vide = valide). `slugs` : slugs connus du catalogue d'exercices (absent : non
 * vérifié). Vérifie la forme, les textes fr et en, le calendrier (semaines 1 à n, `seancesParSemaine` séances, clés
 * connues), les phases (couvrent toutes les semaines) et chaque bloc.
 */
export function validerProgramme(p: unknown, slugs?: ReadonlySet<string>): string[] {
  const e: string[] = [];
  const x = p as Programme;
  if (!x || typeof x !== "object") return ["pas un objet"];
  const ou = (c: string) => `${x.id ?? "?"} : ${c}`;
  const perso = validerCommun(x, e, ou);
  if (!estTexte(x.principes)) e.push(ou("principes"));
  if (!nul(x.progression) && !estTexte(x.progression)) e.push(ou("progression"));
  if (!entier(x.semaines, 1, 30)) e.push(ou("semaines"));
  if (!entier(x.seancesParSemaine, 1, 7)) e.push(ou("seancesParSemaine"));
  if (typeof x.chargesDepart !== "boolean") e.push(ou("chargesDepart"));
  if (!Array.isArray(x.sources) || x.sources.some((s) => !entier(s, 0, SOURCES.length - 1))) e.push(ou("sources"));
  // Phases : contiguës, de la semaine 1 à la dernière.
  if (!Array.isArray(x.phases) || !x.phases.length) e.push(ou("phases"));
  else {
    let suivante = 1;
    for (const [i, ph] of x.phases.entries()) {
      if (!estTexte(ph.nom) || ph.de !== suivante || !entier(ph.a, ph.de)) e.push(ou(`phases[${i}]`));
      suivante = ph.a + 1;
    }
    if (suivante !== x.semaines + 1) e.push(ou("phases : ne couvrent pas toutes les semaines"));
  }
  const seances = x.seances && typeof x.seances === "object" ? x.seances : {};
  if (!Object.keys(seances).length) e.push(ou("seances"));
  for (const [k, s] of Object.entries(seances)) e.push(...validerSeance(s, `${x.id}.${k}`, slugs, perso ?? {}));
  if (!(x.seanceType in seances)) e.push(ou("seanceType"));
  if (!Array.isArray(x.calendrier) || x.calendrier.length !== x.semaines) e.push(ou("calendrier : une entrée par semaine"));
  else {
    for (const [i, s] of x.calendrier.entries()) {
      if (s.n !== i + 1) e.push(ou(`calendrier[${i}].n`));
      if (!entier(s.phase, 0, (x.phases?.length ?? 1) - 1)) e.push(ou(`calendrier[${i}].phase`));
      else if (x.phases[s.phase] && (s.n < x.phases[s.phase]!.de || s.n > x.phases[s.phase]!.a)) e.push(ou(`calendrier[${i}] hors de sa phase`));
      if (typeof s.allegee !== "boolean") e.push(ou(`calendrier[${i}].allegee`));
      if (!nul(s.accent) && !estTexte(s.accent)) e.push(ou(`calendrier[${i}].accent`));
      if (!Array.isArray(s.seances) || s.seances.length !== x.seancesParSemaine) e.push(ou(`calendrier[${i}] : ${x.seancesParSemaine} séances attendues`));
      for (const c of s.seances ?? []) if (!(c in seances)) e.push(ou(`calendrier[${i}] : séance inconnue ${c}`));
    }
  }
  return e;
}

/** Ce qu'un programme et une routine ont en commun (identité, textes, vitrine, exercices propres). */
function validerCommun(x: Article, e: string[], ou: (c: string) => string): Record<string, ExercicePerso> | null {
  if (typeof x.id !== "string" || !/^[a-z0-9-]+$/.test(x.id)) e.push(ou("id"));
  if (!entier(x.version, 1)) e.push(ou("version"));
  for (const k of ["nom", "resume", "description", "lieuCourt", "materiel"] as const) if (!estTexte(x[k])) e.push(ou(k));
  if (!nul(x.avertissement) && !estTexte(x.avertissement)) e.push(ou("avertissement"));
  if (!FAMILLES.includes(x.famille)) e.push(ou("famille"));
  if (!TYPES_OK.includes(x.type)) e.push(ou("type"));
  if (!Array.isArray(x.objectifs) || !x.objectifs.length || x.objectifs.some((o) => !OBJECTIFS.includes(o))) e.push(ou("objectifs"));
  if (!Array.isArray(x.lieux) || !x.lieux.length || x.lieux.some((l) => !LIEUX.includes(l))) e.push(ou("lieux"));
  if (![1, 2, 3].includes(x.niveau)) e.push(ou("niveau"));
  if (typeof x.picto !== "string" || !x.picto) e.push(ou("picto"));
  if (!x.gros || typeof x.gros.valeur !== "string" || !(x.gros.unite === null || typeof x.gros.unite === "string")) e.push(ou("gros"));
  const perso = x.exercicesPerso && typeof x.exercicesPerso === "object" ? x.exercicesPerso : null;
  if (!perso) e.push(ou("exercicesPerso"));
  for (const [k, v] of Object.entries(perso ?? {})) {
    if (!estTexte(v.nom) || !["reps", "duree", "distance_duree", "poids_reps"].includes(v.nature)) e.push(ou(`exercicesPerso.${k}`));
  }
  return perso;
}

/** Erreurs d'une routine de la boutique (vide = valide) : les champs communs, puis sa séance (mêmes règles qu'une séance de programme). */
export function validerRoutine(u: unknown, slugs?: ReadonlySet<string>): string[] {
  const e: string[] = [];
  const x = u as RoutineBoutique;
  if (!x || typeof x !== "object") return ["pas un objet"];
  const ou = (c: string) => `${x.id ?? "?"} : ${c}`;
  const perso = validerCommun(x, e, ou);
  if ("calendrier" in x) e.push(ou("une routine n'a pas de calendrier"));
  if (!x.seance || typeof x.seance !== "object") return [...e, ou("seance")];
  e.push(...validerSeance(x.seance, `${x.id}.seance`, slugs, perso ?? {}));
  return e;
}

function validerSeance(s: Seance, ou: string, slugs: ReadonlySet<string> | undefined, perso: Record<string, ExercicePerso>): string[] {
  const e: string[] = [];
  if (!estTexte(s.nom)) e.push(`${ou} : nom`);
  if (!TYPES_OK.includes(s.type)) e.push(`${ou} : type`);
  if (!ROLES.includes(s.role)) e.push(`${ou} : role`);
  if (!nul(s.note) && !estTexte(s.note)) e.push(`${ou} : note`);
  if (!nul(s.epreuve) && typeof s.epreuve !== "boolean") e.push(`${ou} : epreuve`);
  if (!nul(s.format) && !["amrap", "emom", "fortime", "rounds"].includes(s.format!)) e.push(`${ou} : format`);
  if (!Array.isArray(s.blocs) || !s.blocs.length) return [...e, `${ou} : blocs`];
  for (const [i, b] of s.blocs.entries()) {
    const o = `${ou}.blocs[${i}]`;
    if (typeof b.exo !== "string" || !b.exo) e.push(`${o} : exo`);
    else if (b.exo.startsWith("perso:")) {
      if (!(b.exo.slice(6) in perso)) e.push(`${o} : exercice perso inconnu ${b.exo}`);
    } else if (slugs && !slugs.has(b.exo)) e.push(`${o} : slug inconnu ${b.exo}`);
    if (!entier(b.series, 1, 50)) e.push(`${o} : series`);
    const cible = !nul(b.reps) || !nul(b.dureeS) || !nul(b.distanceM) || !nul(b.repsParSerie);
    if (!cible) e.push(`${o} : aucune cible (reps, durée ou distance)`);
    if (!nul(b.reps) && !entier(b.reps, 1, 500)) e.push(`${o} : reps`);
    if (!nul(b.repsMax) && (!entier(b.repsMax, 1, 500) || (b.reps ?? 0) >= b.repsMax!)) e.push(`${o} : repsMax`);
    if (!nul(b.repsParSerie) && (!Array.isArray(b.repsParSerie) || b.repsParSerie.length !== b.series || b.repsParSerie.some((r) => !entier(r, 1, 500)))) e.push(`${o} : repsParSerie`);
    if (!nul(b.dureeS) && !entier(b.dureeS, 5, 6 * 3600)) e.push(`${o} : dureeS`);
    if (!nul(b.distanceM) && !entier(b.distanceM, 10, 60000)) e.push(`${o} : distanceM`);
    if (!nul(b.zone) && !entier(b.zone, 1, 5)) e.push(`${o} : zone`);
    if (!nul(b.reposS) && !entier(b.reposS, 0, 900)) e.push(`${o} : reposS`);
    if (!nul(b.tempo) && !/^\d-\d-\d-\d$/.test(b.tempo!)) e.push(`${o} : tempo`);
    if (!nul(b.superset) && !entier(b.superset, 1, 20)) e.push(`${o} : superset`);
    if (!nul(b.transitionS) && !entier(b.transitionS, 0, 300)) e.push(`${o} : transitionS`);
    if (!nul(b.progressionKg) && !(typeof b.progressionKg === "number" && b.progressionKg > 0 && b.progressionKg <= 10)) e.push(`${o} : progressionKg`);
    if (!nul(b.rir) && (!entier(b.rir, 0, 5) || nul(b.reps) && nul(b.repsParSerie))) e.push(`${o} : rir`);
    if (!nul(b.note) && !estTexte(b.note)) e.push(`${o} : note`);
  }
  // Un superset : au moins deux blocs contigus.
  const groupes = new Map<number, number[]>();
  s.blocs.forEach((b, i) => b.superset != null && groupes.set(b.superset, [...(groupes.get(b.superset) ?? []), i]));
  for (const [g, l] of groupes) if (l.length < 2 || l[l.length - 1]! - l[0]! !== l.length - 1) e.push(`${ou} : superset ${g} (≥ 2 blocs contigus)`);
  return e;
}
