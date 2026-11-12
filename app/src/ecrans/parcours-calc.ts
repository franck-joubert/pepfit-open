// Parcours de première utilisation : règles de planches/parcours/NOTES.md (§ 1, 1 bis,
// 1 ter, 2, 3). Pur, sans React Native : testé par tests/premiere-utilisation.test.ts.
import { kcalObjectif, objectifDetail, versObjectif, type Objectif, type ProfilCalcul, type StatutNutrition } from "../nutrition/calculs";
import { niveauDepuisSport } from "../nutrition/objectifs-calc";
import type { Declarations } from "../nutrition/regle";
import { OPACITES } from "./roue";
import type { PartiesActives } from "../ui/menu-flottant";

// ---------------------------------------------------------------- âge

/** Date de naissance : jour, mois (1 à 12), année. */
export interface Naissance {
  j: number;
  m: number;
  a: number;
}

/** Molettes bornées à 125 ans. */
export const AGE_MAX = 125;
/** Départ des molettes sans date connue (planche : en t3 jusqu'au premier geste). */
export const NAISSANCE_DEPART: Naissance = { j: 1, m: 1, a: 1990 };

export const joursDuMois = (m: number, a: number) => new Date(a, m, 0).getDate();

/** Années proposées par la molette : de 125 ans à cette année. */
export function anneesNaissance(auj: Date): number[] {
  const a = auj.getFullYear();
  return Array.from({ length: AGE_MAX + 1 }, (_, i) => a - AGE_MAX + i);
}

/** Jour ramené dans le mois (31 avril → 30 avril, 29 février d'une année non bissextile → 28). */
export const jourValide = (n: Naissance): Naissance => ({ ...n, j: Math.min(n.j, joursDuMois(n.m, n.a)) });

export function ageDe(n: Naissance, auj: Date): number {
  const v = jourValide(n);
  const m = auj.getMonth() + 1;
  return auj.getFullYear() - v.a - (v.m > m || (v.m === m && v.j > auj.getDate()) ? 1 : 0);
}

/** « 1987-05-14 » (réglage « naissance », sur le téléphone seulement). */
export const naissanceIso = (n: Naissance) => `${n.a}-${String(n.m).padStart(2, "0")}-${String(n.j).padStart(2, "0")}`;

export function lireNaissance(s: string | null | undefined): Naissance | null {
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!r) return null;
  const n = { a: Number(r[1]), m: Number(r[2]), j: Number(r[3]) };
  return n.m >= 1 && n.m <= 12 && n.j >= 1 && n.j <= joursDuMois(n.m, n.a) ? n : null;
}

// ---------------------------------------------------------------- molettes

export const LIGNE_MOLETTE = 44;
/** Poids de 30 à 250 kg par 0,5 ; taille de 120 à 220 cm. */
export const POIDS_MOLETTE = Array.from({ length: 441 }, (_, i) => 30 + i / 2);
export const TAILLES_MOLETTE = Array.from({ length: 101 }, (_, i) => 120 + i);
/** Départ sans valeur connue (planche) : 70 kg, 170 cm. */
export const POIDS_DEPART = 70;
export const TAILLE_DEPART = 170;

/** Indice de la valeur la plus proche de `v` dans `valeurs` (croissantes). */
export function indiceProche(valeurs: readonly number[], v: number): number {
  let k = 0;
  for (let i = 1; i < valeurs.length; i++) if (Math.abs(valeurs[i]! - v) < Math.abs(valeurs[k]! - v)) k = i;
  return k;
}

/**
 * Opacité des lignes selon la distance au centre : celle de la roue de repos (roue.ts) multipliée par le masque de la
 * planche (transparent aux bords, plein de 36 % à 64 % de la hauteur), pris au centre de chaque ligne. Le masque ne se
 * peint pas : sur l'aura, un fondu peint ferait un rectangle.
 */
export function opacitesMolette(visibles: number): number[] {
  const n = (visibles - 1) / 2;
  const hauteur = visibles * LIGNE_MOLETTE;
  const masque = (y: number) => Math.min(1, Math.min(y, hauteur - y) / (0.36 * hauteur));
  return Array.from({ length: n + 2 }, (_, d) => {
    if (d > n) return 0;
    const base = OPACITES[Math.min(d, OPACITES.length - 1)]!;
    return Math.round(base * masque(hauteur / 2 - d * LIGNE_MOLETTE) * 1000) / 1000;
  });
}

/** Haptique au cran : au plus une toutes les 40 ms sous inertie rapide. */
export const ECART_HAPTIQUE_MS = 40;

// ---------------------------------------------------------------- réponses

export type SexeDeclare = "h" | "f" | "nb" | "np";
export const SEXES: readonly SexeDeclare[] = ["h", "f", "nb", "np"];

export type ObjectifParcours = "evenement" | "sport" | "sante" | "santeGenerale" | "alimentation" | "poids";
export const OBJECTIFS_PARCOURS: readonly ObjectifParcours[] = ["evenement", "sport", "sante", "santeGenerale", "alimentation", "poids"];

/** Débutant, Intermédiaire, Avancé, Pro. */
export type Niveau = 0 | 1 | 2 | 3;
export const NIVEAUX: readonly Niveau[] = [0, 1, 2, 3];

/**
 * Les 18 sports de l'écran 6, par popularité en France. `id` : activité du catalogue (lanceur d'Entraînements), null
 * pour Cardio (pas d'activité « Cardio » au catalogue : il allume Entraînements sans rien ajouter au lanceur).
 * `picto` : vignette de l'appli (les 7 derniers rendus depuis la 3D, picto-3d/v8) ; null = icône générique.
 */
/** Clé de l'écran d'une activité du catalogue, si elle y a sa tuile. */
export const cleDeSport = (id: string) => SPORTS_PARCOURS.find((s) => s.id === id)?.cle ?? null;

export const SPORTS_PARCOURS: readonly { cle: string; id: string | null; picto: string | null }[] = [
  { cle: "musculation", id: "cat:musculation", picto: "couche" },
  { cle: "course", id: "cat:course", picto: "course" },
  { cle: "velo", id: "cat:bicycling", picto: "bicycling" },
  { cle: "marche", id: "cat:marche", picto: "marche" },
  { cle: "natation", id: "cat:natation", picto: "natation" },
  { cle: "randonnee", id: "cat:randonnee", picto: "randonnee" },
  { cle: "yoga", id: "cat:yoga", picto: "yoga" },
  { cle: "pilates", id: "cat:pilates", picto: "pilates" },
  { cle: "crossTraining", id: "cat:cross-training", picto: "kettlebell-swing" },
  { cle: "hiit", id: "cat:hiit", picto: "hiit" },
  { cle: "cardio", id: null, picto: "cardio" },
  { cle: "boxe", id: "cat:boxe", picto: "boxe" },
  { cle: "padel", id: "cat:padel", picto: "padel" },
  { cle: "tennis", id: "cat:tennis", picto: "tennis" },
  { cle: "football", id: "cat:football", picto: "football" },
  { cle: "basket", id: "cat:basket", picto: "basket" },
  { cle: "danse", id: "cat:danse", picto: "danse" },
  { cle: "escalade", id: "cat:escalade", picto: "escalade" },
];

/**
 * Onglets allumés : alimentation, poids ou la case de poids → Nutrition ; sport, événement ou un sport → Entraînements ;
 * santé ou santé générale → Santé. Rien de choisi : les trois (comme aujourd'hui).
 */
export function partiesDepuis(objectifs: readonly ObjectifParcours[], nbSports: number, changerPoids: boolean): PartiesActives {
  const o = new Set(objectifs);
  const p: PartiesActives = {
    food: o.has("alimentation") || o.has("poids") || changerPoids,
    train: o.has("sport") || o.has("evenement") || nbSports > 0,
    health: o.has("sante") || o.has("santeGenerale"),
  };
  return p.food || p.train || p.health ? p : { food: true, train: true, health: true };
}

/**
 * Sports choisis (clés de l'écran, ou activités du catalogue « cat:… » prises par « Autre sport ») → lanceur : ceux de
 * l'écran dans son ordre, puis les autres, puis ceux déjà là (rien n'est perdu).
 */
export function lanceurDepuis(choisis: readonly string[], existants: readonly string[]): string[] {
  const ids = [...SPORTS_PARCOURS.filter((s) => s.id && choisis.includes(s.cle)).map((s) => s.id!), ...choisis.filter((c) => c.startsWith("cat:"))];
  return ids.length ? [...ids, ...existants.filter((x) => !ids.includes(x))] : [...existants];
}

// ---------------------------------------------------------------- étapes

export type Etape = "prenom" | "age" | "sexe" | "gardeFous" | "mensurations" | "cible" | "objectifs" | "sports" | "niveau" | "objets" | "bravo";
export type Theme = "accueil" | "sante" | "entrainement";

/** Rang dans la barre (9 étapes avec les garde-fous, D19 ; l'objectif de poids partage le cran des mensurations ; « Connecte
 * tes objets » est plein). */
export const RANG: Record<Etape, number> = { prenom: 1, age: 2, sexe: 3, gardeFous: 4, mensurations: 5, cible: 5, objectifs: 6, sports: 7, niveau: 8, objets: 9, bravo: 9 };
export const NB_ETAPES = 9;
export const THEME: Record<Etape, Theme> = {
  prenom: "accueil",
  age: "accueil",
  sexe: "sante",
  gardeFous: "sante",
  mensurations: "sante",
  cible: "sante",
  objectifs: "sante",
  sports: "entrainement",
  niveau: "accueil",
  objets: "accueil",
  bravo: "accueil",
};

/** Suite des étapes : les garde-fous après le sexe (D19) ; l'objectif de poids seulement si la case est cochée, et jamais après
 * une grossesse ou un trouble alimentaire déclarés (`cibleSautee`) (D1 : pas d'écran de bienvenue ; D7 : objets). */
export function etapes(changerPoids: boolean, sauterCible = false): Etape[] {
  return [
    "prenom",
    "age",
    "sexe",
    "gardeFous",
    "mensurations",
    ...(changerPoids && !sauterCible ? (["cible"] as const) : []),
    "objectifs",
    "sports",
    "niveau",
    "objets",
    "bravo",
  ];
}

export function voisine(e: Etape, changerPoids: boolean, sens: 1 | -1, sauterCible = false): Etape | null {
  const l = etapes(changerPoids, sauterCible);
  return l[l.indexOf(e) + sens] ?? null;
}

// ---------------------------------------------------------------- objectif de kcal (NOTES § 1 bis)

/** Séances par semaine selon le niveau en sport ; aucun sport et niveau passé : 0 ; des sports mais niveau passé : 2. */
export const SEANCES_NIVEAU = [2, 3, 4, 6] as const;
export const seancesParSemaine = (niveau: Niveau | null, nbSports: number) => (niveau != null ? SEANCES_NIVEAU[niveau] : nbSports > 0 ? 2 : 0);

export interface EntreesObjectif {
  sexe: SexeDeclare | null;
  age: number | null;
  tailleCm: number | null;
  poidsKg: number | null;
  /** kg par semaine, négatif pour perdre ; 0 sans objectif de poids. */
  rythme: number;
  niveauSport: Niveau | null;
  nbSports: number;
  /** Réponses de l'étape des garde-fous (D19) ; rien : aucune situation déclarée. */
  declarations?: Declarations;
}

export interface ObjectifDefaut {
  repos: Objectif;
  entrainement: Objectif;
  kcalRepos: number;
  kcalEntrainement: number;
  /** Moyenne sur la semaine (écrans 4b et 9), arrondie à 50. */
  moyenne: number;
  /** Une réponse manquait : un repli a servi (« calcul approché »). */
  approche: boolean;
  /** Statut de la règle (D12) : « non_calcule » (mineur, grossesse) laisse les valeurs par défaut ; clés de raisons (macros.raison.*). */
  statut: StatutNutrition;
  raisons: string[];
  /** D20 : ni calories ni macros à montrer (trouble alimentaire, poids bas). */
  sansChiffres: boolean;
}

const sexeCalcul = (s: SexeDeclare | null): ProfilCalcul["sexe"] => (s === "h" || s === "f" ? s : "x");
const TAILLE_REPLI = { h: 175, f: 162, x: 168 } as const;
export const AGE_REPLI = 35;
export const IMC_REPLI = 22.5;

export function objectifParDefaut(e: EntreesObjectif): ObjectifDefaut {
  const sexe = sexeCalcul(e.sexe);
  const tailleCm = e.tailleCm ?? TAILLE_REPLI[sexe];
  const poidsKg = e.poidsKg ?? Math.round(IMC_REPLI * (tailleCm / 100) ** 2 * 2) / 2;
  const p = { sexe, tailleCm, poidsKg, age: e.age ?? AGE_REPLI };
  const n = seancesParSemaine(e.niveauSport, e.nbSports);
  // la règle des macros (docs/CODE-MACROS.md) : sans journal ni mesure, la formule de repos × activité hors sport + séances
  const contexte = { niveau: niveauDepuisSport(e.niveauSport), seancesParSemaine: n, declarations: e.declarations };
  const repos = objectifDetail(p, "repos", e.rythme, "debout", undefined, contexte);
  const entrainement = objectifDetail(p, "entrainement", e.rythme, "debout", undefined, contexte);
  const objRepos = versObjectif(repos, "repos");
  const objEntrainement = versObjectif(entrainement, "entrainement");
  const kcalRepos = repos.kcal ?? Math.round(kcalObjectif(objRepos));
  const kcalEntrainement = entrainement.kcal ?? Math.round(kcalObjectif(objEntrainement));
  return {
    repos: objRepos,
    entrainement: objEntrainement,
    kcalRepos,
    kcalEntrainement,
    moyenne: Math.round((n * kcalEntrainement + (7 - n) * kcalRepos) / 7 / 50) * 50,
    approche: e.sexe == null || e.sexe === "np" || e.tailleCm == null || e.poidsKg == null || e.age == null,
    statut: repos.statut,
    raisons: repos.raisons,
    sansChiffres: repos.sansChiffres,
  };
}

/** Rythmes de l'écran 4b (kg par semaine), signés selon l'écart. */
export const RYTHMES = [0.25, 0.5, 0.75] as const;
export const rythmeSigne = (r: number, poidsKg: number, cibleKg: number) => (cibleKg < poidsKg ? -r : cibleKg > poidsKg ? r : 0);

/** Semaines pour atteindre la cible, arrondies à l'entier supérieur. */
export const semainesPour = (poidsKg: number, cibleKg: number, r: number) => (r > 0 ? Math.ceil(Math.abs(cibleKg - poidsKg) / r) : 0);

/** Macros montrées selon le niveau en nutrition (D5 : il règle l'affichage, pas le calcul). */
export function macrosVisibles(n: Niveau | null): ("kcal" | "proteines" | "glucides" | "lipides" | "sucres")[] {
  if (n === 0) return ["kcal"];
  if (n === 1) return ["kcal", "proteines"];
  return ["kcal", "proteines", "glucides", "lipides", "sucres"];
}
