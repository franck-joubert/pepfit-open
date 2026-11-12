// Boutique de programmes : calculs purs (sans React Native ni base), testés par tests/boutique.test.ts. Durées et volumes,
// profil des zones d'une séance, puces et filtres, « Pour toi » (D3), placement des séances sur tes jours, charges de départ
// et liste des routines à créer au démarrage.
import { ajouterJ, ecartJ, jourSem } from "../ecrans/planification";
import { normaliser } from "../db/normaliser";
import { estRoutine, texte, type Article, type Bloc, type Langue, type Lieu, type Niveau, type Objectif, type Programme, type Role, type Seance } from "./modele";

// ---------------------------------------------------------------- durées et volumes

/** Allure estimée (s/km) par zone, pour chiffrer une distance en temps (volume, durée d'une séance). */
const ALLURE_ZONE = [0, 450, 390, 345, 315, 290];
/** Allures d'autres sports : natation 2:30/100 m, marche 10 min/km, randonnée 15 min/km, vélo 25 km/h. */
const ALLURE_EXO: Record<string, number> = { natation: 1500, marche: 600, randonnee: 900, bicycling: 144 };

/** Durée d'une série d'un bloc (s), estimée : la durée visée, la distance à l'allure de la zone, ou 4 s par répétition. */
export function dureeSerie(b: Bloc): number {
  if (b.dureeS) return b.dureeS;
  if (b.distanceM) return Math.round((b.distanceM / 1000) * (ALLURE_EXO[b.exo] ?? ALLURE_ZONE[b.zone ?? 2]!));
  const reps = b.repsParSerie ? Math.max(...b.repsParSerie) : (b.reps ?? 10);
  return Math.max(20, reps * 4);
}

/** Durée estimée d'une séance (s) : séries, récupérations (endurance : entre deux efforts) et repos. */
export function dureeSeance(s: Seance): number {
  if (s.format && s.formatValeur && s.format !== "rounds") return s.formatValeur;
  let t = 0;
  for (const b of s.blocs) {
    const repos = b.reposS ?? 0;
    const endurance = b.zone != null;
    t += b.series * dureeSerie(b) + (endurance ? Math.max(0, b.series - 1) : b.series) * repos + (b.transitionS ?? 0) * b.series;
  }
  return t;
}

/** Unité du volume semaine par semaine : mètres en natation, minutes en endurance et pour la perte de poids, sinon séries. */
export type UniteVolume = "m" | "min" | "series";
export function uniteVolume(p: Programme): UniteVolume {
  if (p.type === "natation") return "m";
  return p.famille === "endu" || p.objectifs.includes("poids") ? "min" : "series";
}

function volumeSeance(s: Seance, u: UniteVolume): number {
  if (u === "m") return s.blocs.reduce((n, b) => n + (b.distanceM ?? 0) * b.series, 0);
  if (u === "min") return dureeSeance(s) / 60;
  return s.blocs.reduce((n, b) => n + b.series, 0);
}

/** Volume de chaque semaine (barres de la fiche). */
export function volumes(p: Programme): number[] {
  const u = uniteVolume(p);
  return p.calendrier.map((w) => Math.round(w.seances.reduce((n, c) => n + volumeSeance(p.seances[c]!, u), 0)));
}

/** « 2h30 », « 45 min », « 1 500 m », « 36 séries » sont formatés par l'écran ; ici, les minutes en « 2h30 ». */
export function heuresMinutes(min: number): string {
  const m = Math.round(min / 5) * 5;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}

// ---------------------------------------------------------------- profil des zones

/** Un segment du profil d'une séance d'endurance : zone (1 à 5), durée (s), récupération (hachurée). */
export interface Segment {
  zone: number;
  s: number;
  recup: boolean;
}

/** Profil de zones d'une séance (blocs d'endurance seulement) : chaque effort, puis sa récupération entre deux efforts. */
export function profil(s: Seance): Segment[] {
  const out: Segment[] = [];
  for (const b of s.blocs) {
    if (b.zone == null) continue;
    for (let i = 0; i < b.series; i++) {
      out.push({ zone: b.zone, s: dureeSerie(b), recup: false });
      if (i < b.series - 1 && (b.reposS ?? 0) > 0) out.push({ zone: 2, s: b.reposS!, recup: true });
    }
  }
  return out;
}

// ---------------------------------------------------------------- puces, filtres, recherche

/** Puces de lieu, en un toucher (variante A). */
export type Puce = "tout" | "course" | "salle" | "maison" | "piscine" | "padel";
export const PUCES: readonly Puce[] = ["tout", "course", "salle", "maison", "piscine", "padel"];

export function dansPuce(p: Article, c: Puce): boolean {
  switch (c) {
    case "tout":
      return true;
    case "course":
      return p.type === "course";
    case "maison":
      return p.lieux.includes("maison") || p.lieux.includes("maison_halteres");
    default:
      return p.lieux.includes(c);
  }
}

export type SeancesFiltre = 2 | 3 | 4 | 5;
export type DureeFiltre = "court" | "moyen" | "long";
/** Explorer les programmes ou Explorer les routines (planche boutiques, validée le 30/10) : deux espaces, plus un filtre. */
export type Genre = "programme" | "routine";
export interface Filtres {
  niveau: Niveau | null;
  objectif: Objectif | null;
  lieu: Lieu | null;
  seances: SeancesFiltre | null;
  duree: DureeFiltre | null;
}
export const SANS_FILTRE: Filtres = { niveau: null, objectif: null, lieu: null, seances: null, duree: null };
export const CRITERES = ["niveau", "objectif", "lieu", "seances", "duree"] as const;
export type Critere = (typeof CRITERES)[number];

export const nbFiltres = (f: Filtres) => CRITERES.filter((c) => f[c] != null).length;

/** « ≤ 6 sem. », « 8 à 10 sem. » (de 7 à 10), « 12 sem. et + » (11 et plus). */
export const dansDuree = (semaines: number, d: DureeFiltre) => (d === "court" ? semaines <= 6 : d === "moyen" ? semaines >= 7 && semaines <= 10 : semaines >= 11);

/** Séances par semaine et durée en semaines ne parlent que des programmes : une routine n'y répond pas. */
export function critereOk(p: Article, f: Filtres, c: Critere): boolean {
  switch (c) {
    case "niveau":
      return f.niveau == null || p.niveau === f.niveau;
    case "objectif":
      return f.objectif == null || p.objectifs.includes(f.objectif);
    case "lieu":
      return f.lieu == null || p.lieux.includes(f.lieu);
    case "seances":
      if (f.seances == null) return true;
      if (estRoutine(p)) return false;
      return f.seances === 5 ? p.seancesParSemaine >= 5 : p.seancesParSemaine === f.seances;
    case "duree":
      if (f.duree == null) return true;
      return !estRoutine(p) && dansDuree(p.semaines, f.duree);
  }
}

export const filtrer = <A extends Article>(l: readonly A[], f: Filtres, puce: Puce = "tout"): A[] =>
  l.filter((p) => dansPuce(p, puce) && CRITERES.every((c) => critereOk(p, f, c)));

/**
 * « Proches de tes filtres » : jamais une page vide. Les programmes qui manquent un seul critère (puis deux), l'objectif
 * gardé quand il est choisi ; `relache` dit lequel (« Un autre niveau, même objectif »).
 */
export function proches<A extends Article>(l: readonly A[], f: Filtres, puce: Puce = "tout", max = 4): { programmes: A[]; relache: Critere | null } {
  // Chaque espace cherche dans ses articles seulement : `l` est déjà celle des programmes ou celle des routines.
  const actifs = CRITERES.filter((c) => f[c] != null);
  if (!actifs.length) return { programmes: [], relache: null };
  const deja = new Set(filtrer(l, f, puce).map((p) => p.id));
  const reste = l.filter((p) => !deja.has(p.id) && dansPuce(p, puce));
  for (const manques of [1, 2]) {
    const ok = reste.filter((p) => {
      const rates = actifs.filter((c) => !critereOk(p, f, c));
      return rates.length === manques && !(f.objectif != null && rates.includes("objectif") && actifs.length > 1);
    });
    if (ok.length) {
      const rates = new Set(ok.flatMap((p) => actifs.filter((c) => !critereOk(p, f, c))));
      return { programmes: ok.slice(0, max), relache: rates.size === 1 ? [...rates][0]! : null };
    }
  }
  return { programmes: [], relache: null };
}

/** Recherche sans accent ni casse, tous les mots, dans le nom et le résumé (les deux langues). */
export function rechercher<A extends Article>(l: readonly A[], q: string): A[] {
  const mots = normaliser(q).split(" ").filter(Boolean);
  if (!mots.length) return [...l];
  return l.filter((p) => {
    const tout = normaliser([p.nom.fr, p.nom.en, p.resume.fr, p.resume.en, p.gros.valeur].join(" "));
    return mots.every((m) => tout.includes(m));
  });
}

// ---------------------------------------------------------------- Pour toi (D3)

/** Réponses du parcours de première utilisation (réglages `parcours_objectifs`, `parcours_sports`, `niveau_sport`). */
export interface Profil {
  objectifs: string[];
  /** Clés du parcours (« course », « musculation »…) ou ids du lanceur (« cat:course »). */
  sports: string[];
  /** 0 Débutant, 1 Intermédiaire, 2 Avancé, 3 Pro ; null = passé. */
  niveau: number | null;
  /** Repli : sports des séances de ces 30 derniers jours (« course », « muscu », « natation »…, db/sports.ts). */
  historique: string[];
}

/** Ce qu'on retient d'un sport : son libellé court (« course », « muscu ») et les programmes et routines qu'il appelle. */
const SPORTS: Record<string, { cle: string; ids: string[] }> = {
  course: { cle: "course", ids: ["c5", "c10a", "c10", "semi", "mara", "r-fract-6x1k", "r-seuil-3x10"] },
  musculation: { cle: "muscu", ids: ["fb", "f5", "ppl", "hb", "hal", "r-push-a", "r-full-body", "r-halteres"] },
  muscu: { cle: "muscu", ids: ["fb", "f5", "ppl", "hb", "hal", "r-push-a", "r-full-body", "r-halteres"] },
  raquette: { cle: "padel", ids: ["padel"] },
  velo: { cle: "velo", ids: ["velo"] },
  bicycling: { cle: "velo", ids: ["velo"] },
  natation: { cle: "natation", ids: ["nage", "r-crawl"] },
  randonnee: { cle: "rando", ids: ["rando"] },
  marche: { cle: "marche", ids: ["pp", "rando"] },
  yoga: { cle: "mobilite", ids: ["mob", "dos", "r-hanches", "r-dos"] },
  pilates: { cle: "mobilite", ids: ["mob", "dos", "r-hanches", "r-dos"] },
  crossTraining: { cle: "cross", ids: ["kb", "hiit", "r-kb-emom", "r-hiit-20"] },
  "cross-training": { cle: "cross", ids: ["kb", "hiit", "r-kb-emom", "r-hiit-20"] },
  hiit: { cle: "cross", ids: ["hiit", "kb", "r-hiit-20", "r-kb-emom"] },
  cardio: { cle: "cardio", ids: ["hiit", "rf", "r-hiit-20"] },
  padel: { cle: "padel", ids: ["padel"] },
  tennis: { cle: "padel", ids: ["padel"] },
};
const OBJECTIFS_PARCOURS: Record<string, string[]> = {
  evenement: ["c10a", "semi", "mara", "rando"],
  poids: ["pp", "hiit", "rf", "r-hiit-20"],
  sante: ["mob", "dos", "rf", "r-dos", "r-hanches"],
  santeGenerale: ["rf", "mob", "pp", "r-hanches"],
  sport: [],
  alimentation: [],
};
/** Programmes de santé (D5) : visibles par tous, mais proposés seulement si le parcours parle de santé. */
const SANTE_SEULEMENT = new Set(["gen", "equi"]);
// Les ids d'une liste qui ne sont pas dans `l` ne comptent pas : programmes et routines partagent ces tables.
const DEFAUT = ["c5", "fb", "mob", "r-full-body", "r-fract-6x1k", "r-hanches"];

const sportDe = (s: string) => SPORTS[s.startsWith("cat:") ? s.slice(4) : s];

/**
 * Trois programmes (ou trois routines) pour toi (D3), d'après les sports, les objectifs et le niveau du parcours ; repli sur l'historique, puis
 * sur un trio de départ (course, muscu, mobilité). Au plus deux d'une même famille. `raisons` : les sports retenus.
 */
export function pourToi(l: readonly Article[], pr: Profil, n = 3): { ids: string[]; raisons: string[]; source: "parcours" | "historique" | "defaut" } {
  const depuisParcours = pr.sports.length > 0 || pr.objectifs.some((o) => (OBJECTIFS_PARCOURS[o] ?? []).length > 0);
  const sports = pr.sports.length ? pr.sports : pr.historique;
  const source = depuisParcours ? "parcours" : sports.length ? "historique" : "defaut";
  if (source === "defaut") return { ids: DEFAUT.filter((id) => l.some((p) => p.id === id)).slice(0, n), raisons: [], source };
  const niv: Niveau = pr.niveau == null ? 1 : pr.niveau >= 2 ? 3 : pr.niveau === 1 ? 2 : 1;
  const score = new Map<string, number>();
  const raisons: string[] = [];
  const ajouter = (id: string, x: number) => score.set(id, (score.get(id) ?? 0) + x);
  // Le premier sport choisi compte un peu plus (il est en tête du lanceur).
  sports.forEach((s, i) => {
    const sp = sportDe(s);
    if (!sp) return;
    if (!raisons.includes(sp.cle)) raisons.push(sp.cle);
    for (const id of sp.ids) ajouter(id, 4 - Math.min(i, 2) * 0.5);
  });
  const sante = pr.objectifs.includes("sante") || pr.objectifs.includes("santeGenerale");
  for (const o of pr.objectifs) for (const id of OBJECTIFS_PARCOURS[o] ?? []) ajouter(id, 2);
  const notes = l
    .filter((p) => (score.get(p.id) ?? 0) > 0 && (sante || !SANTE_SEULEMENT.has(p.id)))
    .map((p) => ({ p, s: (score.get(p.id) ?? 0) + (p.niveau === niv ? 2.5 : Math.abs(p.niveau - niv) === 1 ? 0 : -4) }))
    .sort((a, b) => b.s - a.s || (estRoutine(a.p) ? 0 : a.p.semaines) - (estRoutine(b.p) ? 0 : b.p.semaines));
  const ids: string[] = [];
  const parFamille = new Map<string, number>();
  for (const { p } of notes) {
    if (ids.length >= n) break;
    if ((parFamille.get(p.famille) ?? 0) >= 2) continue;
    ids.push(p.id);
    parFamille.set(p.famille, (parFamille.get(p.famille) ?? 0) + 1);
  }
  for (const id of DEFAUT) if (ids.length < n && !ids.includes(id) && l.some((p) => p.id === id)) ids.push(id);
  return { ids, raisons, source };
}

// ---------------------------------------------------------------- placement sur tes jours

const dure = (r: Role) => r !== "facile";

/** Jours par défaut : les séances de la semaine réparties sur la semaine, un jour de repos entre deux quand c'est possible. */
export function joursParDefaut(n: number): number[] {
  const t: Record<number, number[]> = { 1: [5], 2: [1, 4], 3: [0, 2, 4], 4: [1, 3, 4, 6], 5: [0, 1, 3, 4, 6], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };
  return t[Math.max(1, Math.min(7, n))]!;
}

function* permutations<T>(l: T[]): Generator<T[]> {
  if (l.length <= 1) {
    yield [...l];
    return;
  }
  for (let i = 0; i < l.length; i++) for (const r of permutations([...l.slice(0, i), ...l.slice(i + 1)])) yield [l[i]!, ...r];
}

/**
 * Pose les séances d'une semaine sur des jours (décalages en jours depuis le début de la fenêtre de 7 jours, croissants).
 * La longue va au jour choisi (`longue`, un décalage) ; les autres cherchent l'ordre qui évite deux séances dures à la suite
 * (dans la semaine et avec la semaine suivante), en restant au plus près de l'ordre du programme. `penalite` ≥ 10 : deux
 * séances dures se suivent malgré tout.
 */
export function placerSemaine(roles: Role[], decalages: number[], longue: number | null): { ordre: number[]; penalite: number } {
  const n = Math.min(roles.length, decalages.length);
  const jours = decalages.slice(0, n);
  const idx = Array.from({ length: n }, (_, i) => i);
  const iLongue = roles.indexOf("longue");
  const jLongue = longue != null && iLongue >= 0 && iLongue < n ? jours.indexOf(longue) : -1;
  let meilleur: { ordre: number[]; penalite: number } = { ordre: idx, penalite: Infinity };
  const autres = jLongue >= 0 ? idx.filter((i) => i !== iLongue) : idx;
  for (const p of permutations(autres)) {
    const ordre = jLongue >= 0 ? [...p.slice(0, jLongue), iLongue, ...p.slice(jLongue)] : p;
    let pen = 0;
    for (let k = 0; k < n; k++) {
      const a = ordre[k]!;
      const b = ordre[(k + 1) % n]!;
      const ecart = k + 1 < n ? jours[k + 1]! - jours[k]! : jours[0]! + 7 - jours[k]!;
      if (n > 1 && ecart === 1 && dure(roles[a]!) && dure(roles[b]!)) pen += 10;
    }
    for (let k = 0; k < n; k++) for (let m = k + 1; m < n; m++) if (ordre[k]! > ordre[m]!) pen += 1;
    if (pen < meilleur.penalite) meilleur = { ordre, penalite: pen };
  }
  return meilleur;
}

export interface OptionsDemarrage {
  /** Jours choisis : 0 = lundi … 6 = dimanche. */
  jours: number[];
  /** Jour de la sortie longue (0 à 6), s'il y en a une. */
  longue: number | null;
  /** Premier jour possible, « AAAA-MM-JJ ». */
  debut: string;
  heure: string;
}

/** Décalage (0 à 6) d'un jour de la semaine depuis le premier jour de la fenêtre. */
const decalage = (debut: string, jour: number) => (jour - jourSem(debut) + 7) % 7;

/** Une séance posée dans le calendrier. */
export interface Pose {
  semaine: number;
  date: string;
  cle: string;
}

/**
 * Le calendrier du programme : la semaine n couvre les 7 jours à partir de `debut` + 7 (n − 1) ; chaque jour choisi y tombe
 * une fois. Moins de jours que de séances : les dernières séances de la semaine (les plus faciles d'abord) sautent.
 */
export function calendrierPlan(p: Programme, o: OptionsDemarrage): { poses: Pose[]; penalite: number } {
  const decs = [...new Set(o.jours)].map((j) => decalage(o.debut, j)).sort((a, b) => a - b);
  const longue = o.longue != null ? decalage(o.debut, o.longue) : null;
  const poses: Pose[] = [];
  let penalite = 0;
  for (const w of p.calendrier) {
    let cles = [...w.seances];
    // Trop peu de jours : on garde les dures et la longue d'abord.
    while (cles.length > decs.length) {
      const i = cles.map((c) => p.seances[c]!.role).lastIndexOf("facile");
      cles.splice(i >= 0 ? i : cles.length - 1, 1);
    }
    const { ordre, penalite: pen } = placerSemaine(cles.map((c) => p.seances[c]!.role), decs, longue);
    penalite = Math.max(penalite, pen);
    ordre.forEach((iSeance, k) => poses.push({ semaine: w.n, date: ajouterJ(o.debut, (w.n - 1) * 7 + decs[k]!), cle: cles[iSeance]! }));
  }
  return { poses: poses.sort((a, b) => a.date.localeCompare(b.date)), penalite };
}

/** Le programme a-t-il une sortie longue (jour à choisir) ? */
export const aUneLongue = (p: Programme) => Object.values(p.seances).some((s) => s.role === "longue");

/** Conseil sous les jours : nombre de jours, deux séances dures de suite. */
export type Conseil = { genre: "ok" } | { genre: "manque"; n: number; voulu: number } | { genre: "trop"; n: number; voulu: number } | { genre: "suite" };
export function conseil(p: Programme, o: OptionsDemarrage): Conseil {
  const n = new Set(o.jours).size;
  if (n < p.seancesParSemaine) return { genre: "manque", n, voulu: p.seancesParSemaine };
  if (n > p.seancesParSemaine) return { genre: "trop", n, voulu: p.seancesParSemaine };
  return calendrierPlan(p, o).penalite >= 10 ? { genre: "suite" } : { genre: "ok" };
}

/** Premier lundi après `aujourdhui` (le jour même si c'est un lundi). */
export const prochainLundi = (aujourdhui: string) => ajouterJ(aujourdhui, (7 - jourSem(aujourdhui)) % 7);

// ---------------------------------------------------------------- charges de départ et routines

/** 90 % de la dernière série, arrondi au 2,5 kg le plus proche ; rien d'historique : null. */
export function chargeDepart(derniereKg: number | null): number | null {
  if (derniereKg == null || derniereKg <= 0) return null;
  return Math.round((derniereKg * 0.9) / 2.5) * 2.5;
}

/** Exercices à charge de départ (ceux qui progressent), dans l'ordre de première apparition. */
export function exercicesAProgression(p: Programme): { exo: string; progressionKg: number }[] {
  const out: { exo: string; progressionKg: number }[] = [];
  for (const w of p.calendrier) for (const c of w.seances) for (const b of p.seances[c]!.blocs) {
    if (b.progressionKg && !out.some((x) => x.exo === b.exo)) out.push({ exo: b.exo, progressionKg: b.progressionKg });
  }
  return out;
}

/** Une routine à créer : la séance, ses charges par bloc (null : reprises de la dernière séance), son nom. */
export interface RoutineAPoser {
  cle: string;
  seance: string;
  kg: (number | null)[];
  semaine: number;
}

/**
 * Les routines du plan et leurs dates. Une routine par séance différente ; une séance dont les charges progressent (5×5)
 * en donne une par charge : la k-ième fois qu'un exercice revient, charge de départ + k × progression. Un exercice sans
 * progression fixe ne porte son poids de départ qu'à sa première séance : ensuite, la séance reprend la précédente.
 */
export function routinesDuPlan(p: Programme, poses: Pose[], charges: Record<string, number | null>): { routines: RoutineAPoser[]; dates: { date: string; cle: string }[] } {
  const fois = new Map<string, number>();
  const vus = new Set<string>();
  const routines = new Map<string, RoutineAPoser>();
  const dates: { date: string; cle: string }[] = [];
  for (const po of poses) {
    const s = p.seances[po.cle]!;
    const kg = s.blocs.map((b) => {
      const depart = charges[b.exo];
      if (depart == null) return null;
      if (!b.progressionKg) {
        const premiere = !vus.has(b.exo);
        vus.add(b.exo);
        return premiere ? depart : null;
      }
      const k = fois.get(b.exo) ?? 0;
      fois.set(b.exo, k + 1);
      return Math.round((depart + k * b.progressionKg) * 10) / 10;
    });
    const cle = kg.some((x) => x != null) ? `${po.cle}@${kg.map((x) => x ?? "").join(",")}` : po.cle;
    if (!routines.has(cle)) routines.set(cle, { cle, seance: po.cle, kg, semaine: po.semaine });
    dates.push({ date: po.date, cle });
  }
  return { routines: [...routines.values()], dates };
}

/** Texte de la zone d'un bloc (« Z2 · facile, tu peux parler »), écrit en note de routine : on le lit pendant la séance. */
export const ZONES: Record<number, { fr: string; en: string }> = {
  1: { fr: "Z1, très facile", en: "Z1, very easy" },
  2: { fr: "Z2, facile, tu peux parler", en: "Z2, easy, you can talk" },
  3: { fr: "Z3, soutenu, allure marathon", en: "Z3, steady, marathon pace" },
  4: { fr: "Z4, seuil, allure 10 km", en: "Z4, threshold, 10 km pace" },
  5: { fr: "Z5, très dur, allure 5 km", en: "Z5, very hard, 5 km pace" },
};

/** Note d'une ligne de routine : la zone puis la note du bloc. */
export function noteBloc(b: Bloc, langue: Langue): string | null {
  const l = [b.zone ? ZONES[b.zone]![langue] : null, b.note ? texte(b.note, langue) : null].filter(Boolean);
  return l.length ? l.join(", ") : null;
}

/** Nombre de semaines entre deux dates (semaine en cours d'un plan, 1 = la première). */
export const semaineDuPlan = (debut: string, aujourdhui: string) => Math.max(1, Math.floor(ecartJ(debut, aujourdhui) / 7) + 1);
