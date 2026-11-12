// Le suivi du cycle (planche planches/cycle, validée le 31/10 avec les décisions recommandées D1 à D14). Pur (sans
// React Native ni base) : testé par tests/cycle-modele.test.ts ; recopié pour le MCP dans serveur/mcp/src/cycle.ts (le test
// tests/appli.test.ts du MCP vérifie que les deux fichiers sont identiques).
//
// 1. On stocke des jours de règles (cycle_jour, migration 58), jamais une phase, une prévision ni un score.
// 2. Tout le reste se recalcule depuis CYCLE, constante unique et versionnée : la changer recalcule tout l'historique sans
//    migration (comme RECUP, docs/CODE-RECUP.md). Les fonctions reprennent exactement planches/cycle/outils/modele.js.
// 3. Un suivi sportif et de bien-être, hors du médical : trois temps en mots simples (« Règles », « Première moitié »,
//    « Seconde moitié »), estimés d'après les dates, jamais mesurés ; une prévision toujours en fourchette.

export interface ParamsCycle {
  version: number;
  plausible: readonly [number, number];
  cycles: number;
  dureeParDefaut: number;
  secondeMoitie: number;
  fourchette: { k: number; min: number; peuDeCycles: number; cyclesMin: number };
  fourchetteMax: number;
  /** Régularité : écart type maximal (jours) de chaque mot, du plus régulier au plus variable. */
  regularite: readonly (readonly [number, MotRegularite])[];
  recup: { cycles: number; nuitsMin: number };
  poids: { fenetre: readonly [number, number]; cycles: number; peseesMin: number; poidsReduit: number; lissage: number; ecartMax: number };
  /** Règles notées sans fin : 5 jours pour la phase ; l'épisode se ferme seul au bout de 10 jours sans nouvelle marque. */
  reglesParDefaut: number;
  fermeture: number;
}

export type MotRegularite = "regulier" | "assez" | "variable";

/** Tous les paramètres (planches/cycle/outils/modele.js). Changer une valeur : changer aussi `version`. */
export const CYCLE: ParamsCycle = {
  version: 1,
  // Un cycle compté va de 15 à 60 jours ; en dehors, il est gardé mais ne compte ni dans la moyenne ni dans la prévision.
  plausible: [15, 60],
  // Les 6 derniers cycles comptés font la moyenne et la prévision (Bull 2019 : la durée varie d'un cycle à l'autre).
  cycles: 6,
  // Sans historique : 28 jours, seulement pour dessiner la frise, jamais pour une prévision.
  dureeParDefaut: 28,
  // La seconde moitié : les 13 derniers jours estimés avant les règles suivantes (Fehring 2006, Bull 2019). Une estimation
  // par le calendrier, jamais une mesure.
  secondeMoitie: 13,
  // Fourchette de la prévision : ± 1,5 écart type des durées, au moins ± 2 jours ; avec 1 ou 2 cycles, ± 4 jours.
  fourchette: { k: 1.5, min: 2, peuDeCycles: 4, cyclesMin: 3 },
  // Au-delà de ± 7 jours de fourchette, pas de date : « trop variable pour une estimation utile ».
  fourchetteMax: 7,
  // Régularité (écart type des durées, en jours) : nos seuils, choisis pour des mots simples, pas une norme.
  regularite: [[2, "regulier"], [4, "assez"], [Infinity, "variable"]],
  // La Récupération : norme de la même moitié du cycle, sur les 3 derniers cycles, dès 20 nuits ; sinon la norme habituelle.
  recup: { cycles: 3, nuitsMin: 20 },
  // Le poids : écart moyen de chaque jour autour des règles (de J−7 à J+3), appris sur les 3 derniers cycles qui ont au moins
  // 4 pesées dans cette fenêtre ; avant cela, ces pesées comptent 3 fois moins dans la moyenne lissée.
  poids: { fenetre: [-7, 3], cycles: 3, peseesMin: 4, poidsReduit: 1 / 3, lissage: 0.1, ecartMax: 1.5 },
  reglesParDefaut: 5,
  fermeture: 10,
};

// ---------------------------------------------------------------- dates (« AAAA-MM-JJ », calendrier, sans fuseau)

const J = 86_400_000;
export const jourUtc = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
export const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
/** Jours de `a` à `b` (b − a). */
export const ecartJ = (a: string, b: string) => Math.round((jourUtc(b) - jourUtc(a)) / J);
export const plus = (s: string, n: number) => iso(jourUtc(s) + n * J);
const moyenne = (l: readonly number[]) => l.reduce((s, x) => s + x, 0) / l.length;
const ecartType = (l: readonly number[]) => {
  const m = moyenne(l);
  return Math.sqrt(l.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, l.length - 1));
};

// ---------------------------------------------------------------- les jours et les épisodes

/** Intensité : les valeurs de MenstruationFlowRecord (0 inconnue, 1 légères, 2 moyennes, 3 abondantes). */
export type Flux = 0 | 1 | 2 | 3;
export type SourceCycle = "saisie" | "sante_connect";

/** Une ligne de cycle_jour : un jour de règles (flux non nul) ou un jour avec ses notes seules (flux null). */
export interface JourCycle {
  jour: string;
  /** null : pas de règles ce jour-là (notes seules). */
  flux: Flux | null;
  /** Le dernier jour d'un épisode, noté comme tel (« Fin ») : l'épisode est fermé. */
  fin: boolean;
  energie: 1 | 2 | 3 | null;
  humeur: 1 | 2 | 3 | null;
  gene: 0 | 1 | 2 | null;
  source: SourceCycle;
}

/** Un épisode de règles, déduit des jours (rien n'est stocké d'autre). */
export interface Episode {
  debut: string;
  /** Le dernier jour noté. */
  fin: string;
  /** Jours notés du début au dernier jour (fin comprise). */
  jours: number;
  /** Fin « pas encore » : ni jour marqué comme fin, ni 10 jours sans nouvelle marque. */
  ouvert: boolean;
  /** D'où viennent ses jours : la saisie l'emporte s'il y en a une. */
  source: SourceCycle;
}

/**
 * Les épisodes à partir des jours : des jours de règles consécutifs, un jour sans marque au plus entre deux, font un épisode.
 * Une fin « pas encore » est un épisode ouvert ; au bout de 10 jours sans nouvelle marque, il se ferme sur le dernier jour noté.
 */
export function episodes(jours: readonly Pick<JourCycle, "jour" | "flux" | "fin" | "source">[], aujourdhui: string, p: ParamsCycle = CYCLE): Episode[] {
  const r = jours.filter((x) => x.flux != null).sort((a, b) => (a.jour < b.jour ? -1 : a.jour > b.jour ? 1 : 0));
  const out: (Episode & { ferme: boolean })[] = [];
  for (const x of r) {
    const e = out[out.length - 1];
    if (e && !e.ferme && ecartJ(e.fin, x.jour) <= 2) {
      e.fin = x.jour;
      e.jours = ecartJ(e.debut, x.jour) + 1;
      if (x.source === "saisie") e.source = "saisie";
      if (x.fin) e.ferme = true;
    } else out.push({ debut: x.jour, fin: x.jour, jours: 1, ouvert: false, source: x.source, ferme: x.fin });
  }
  return out.map(({ ferme, ...e }) => ({ ...e, ouvert: !ferme && ecartJ(e.fin, aujourdhui) < p.fermeture }));
}

// ---------------------------------------------------------------- les cycles et leurs statistiques

export interface Cycle {
  debut: string;
  /** Dernier jour de règles noté. */
  fin: string;
  /** Durée des règles (jours), null si l'épisode est encore ouvert. */
  regles: number | null;
  /** Jours de règles notés jusqu'ici (même ouvert). */
  notes: number;
  /** Jours jusqu'au début suivant, null pour le cycle en cours. */
  duree: number | null;
  /** De 15 à 60 jours : il compte dans la moyenne et la prévision. */
  compte: boolean;
  enCours: boolean;
  source: SourceCycle;
}

/**
 * Les cycles à partir des épisodes : un cycle va d'un début au début suivant ; le dernier est en cours. On ne garde que les
 * mesures : rien n'est stocké d'autre.
 */
export function cycles(regles: readonly Episode[], p: ParamsCycle = CYCLE): Cycle[] {
  const r = [...regles].sort((a, b) => jourUtc(a.debut) - jourUtc(b.debut));
  return r.map((e, i) => {
    const suivant = r[i + 1];
    const duree = suivant ? ecartJ(e.debut, suivant.debut) : null;
    const compte = duree != null && duree >= p.plausible[0] && duree <= p.plausible[1];
    return { debut: e.debut, fin: e.fin, regles: e.ouvert ? null : e.jours, notes: e.jours, duree, compte, enCours: !suivant, source: e.source };
  });
}

export interface StatsCycle {
  n: number;
  moyenne: number | null;
  sd: number | null;
  mot: MotRegularite | null;
  min: number | null;
  max: number | null;
  regles: number | null;
  faits: Cycle[];
}

/** Les statistiques des n derniers cycles comptés : durée moyenne, écart type, régularité, durée des règles. */
export function stats(cs: readonly Cycle[], n: number = CYCLE.cycles, p: ParamsCycle = CYCLE): StatsCycle {
  const faits = cs.filter((c) => c.compte).slice(-n);
  if (!faits.length) return { n: 0, moyenne: null, sd: null, mot: null, min: null, max: null, regles: null, faits: [] };
  const d = faits.map((c) => c.duree!);
  const sd = faits.length > 1 ? ecartType(d) : null;
  const mot = sd == null ? null : p.regularite.find(([s]) => sd <= s)![1];
  const rg = faits.map((c) => c.regles).filter((x): x is number => x != null);
  return { n: faits.length, moyenne: moyenne(d), sd, mot, min: Math.min(...d), max: Math.max(...d), regles: rg.length ? moyenne(rg) : null, faits };
}

export type Prevision =
  | { possible: true; centre: string; du: string; au: string; fourchette: number; n: number; duree: number }
  | { possible: false; raison: "aucun" | "variable"; fourchette?: number };

/** La prévision du prochain début : une date centrale et une fourchette, ou rien (pas de cycle, ou trop variable). */
export function prevision(cs: readonly Cycle[], p: ParamsCycle = CYCLE): Prevision {
  const enCours = cs.find((c) => c.enCours);
  const s = stats(cs, p.cycles, p);
  if (!enCours || !s.n) return { possible: false, raison: "aucun" };
  const f = s.n < p.fourchette.cyclesMin ? p.fourchette.peuDeCycles : Math.max(p.fourchette.min, Math.ceil(p.fourchette.k * s.sd!));
  if (f > p.fourchetteMax) return { possible: false, raison: "variable", fourchette: f };
  const centre = Math.round(s.moyenne!);
  return { possible: true, centre: plus(enCours.debut, centre), du: plus(enCours.debut, centre - f), au: plus(enCours.debut, centre + f), fourchette: f, n: s.n, duree: centre };
}

// ---------------------------------------------------------------- les phases

export type NomPhase = "regles" | "premiere" | "seconde" | "inconnue";

export interface Phase {
  /** Jour du cycle (1 = premier jour des règles). */
  j: number;
  nom: NomPhase;
  debutSeconde: number;
  duree: number;
  /** Faux pour le cycle en cours sans prévision possible (la durée par défaut ne sert qu'au dessin). */
  certaine: boolean;
  cycle: Cycle;
}

/** Durée des règles retenue pour la phase : la durée notée, sinon (épisode ouvert) 5 jours au moins. */
const finReglesDe = (c: Cycle, p: ParamsCycle) => c.regles ?? Math.max(p.reglesParDefaut, c.notes);

/**
 * La phase d'un jour, en mots simples. « regles » pendant les règles notées (ou J1 à J5 si la fin manque), puis « premiere »
 * jusqu'à la seconde moitié estimée, puis « seconde ». Un cycle terminé se relit avec son vrai début suivant ; le cycle en
 * cours, avec la date centrale de la prévision (sans prévision : la phase n'est pas devinée après les règles, « inconnue »).
 * `pv` : la prévision déjà calculée (évite de la refaire pour chaque jour).
 */
export function phase(date: string, cs: readonly Cycle[], p: ParamsCycle = CYCLE, pv: Prevision | null = null): Phase | null {
  let c: Cycle | undefined;
  for (let i = cs.length - 1; i >= 0; i--)
    if (jourUtc(cs[i]!.debut) <= jourUtc(date)) {
      c = cs[i];
      break;
    }
  if (!c) return null;
  const j = ecartJ(c.debut, date) + 1;
  const prev = c.enCours ? (pv ?? prevision(cs, p)) : null;
  const duree = c.duree ?? (prev && prev.possible ? prev.duree : p.dureeParDefaut);
  const certaine = !c.enCours || !!(prev && prev.possible);
  const debutSeconde = duree - p.secondeMoitie + 1;
  const nom: NomPhase = j <= finReglesDe(c, p) ? "regles" : !certaine ? "inconnue" : j >= debutSeconde ? "seconde" : "premiere";
  return { j, nom, debutSeconde, duree, certaine, cycle: c };
}

/** Règles et première moitié vont ensemble (la norme de la Récupération) ; la seconde moitié à part. */
export type Moitie = "premiere" | "seconde";
const moitieDe = (nom: NomPhase): Moitie => (nom === "seconde" ? "seconde" : "premiere");

/**
 * Les jours de la même moitié que `date` (règles et première moitié ensemble, ou seconde moitié) dans les 3 derniers cycles
 * terminés avant le sien : les nuits candidates de la norme de la Récupération ajustée à la phase. null : phase inconnue (cycle
 * en cours sans prévision, avant le premier cycle connu). La Récupération ne s'en sert que dès 20 nuits mesurées.
 */
export function joursMemeMoitie(date: string, cs: readonly Cycle[], p: ParamsCycle = CYCLE, pv: Prevision | null = null): { moitie: Moitie; jours: Set<string> } | null {
  const ph = phase(date, cs, p, pv);
  if (!ph || !ph.certaine || ph.nom === "inconnue") return null;
  const m = moitieDe(ph.nom);
  const termines = cs.filter((c) => c.compte && jourUtc(c.debut) < jourUtc(ph.cycle.debut)).slice(-p.recup.cycles);
  const jours = new Set<string>();
  for (const c of termines) {
    const debutSeconde = c.duree! - p.secondeMoitie + 1;
    const fr = finReglesDe(c, p);
    for (let j = 1; j <= c.duree!; j++) {
      const nom: NomPhase = j <= fr ? "regles" : j >= debutSeconde ? "seconde" : "premiere";
      if (moitieDe(nom) === m) jours.add(plus(c.debut, j - 1));
    }
  }
  return { moitie: m, jours };
}

// ---------------------------------------------------------------- le poids

export interface PeseeAjustee {
  jour: string;
  kg: number;
  /** Moyenne lissée habituelle (sans ajustement). */
  brut: number;
  /** Moyenne lissée ajustée au cycle. */
  ajuste: number;
  /** Jour relatif au début de règles le plus proche (de −7 à 3), null hors fenêtre. */
  k: number | null;
  /** Écart appris pour ce jour (kg), null avant l'apprentissage (la pesée compte alors 3 fois moins). */
  ecart: number | null;
}

/**
 * Le poids lissé ajusté au cycle. Chaque pesée de la fenêtre J−7 à J+3 (autour d'un début de règles) est corrigée de l'écart
 * moyen appris pour ce jour sur les 3 derniers cycles qui ont assez de pesées ; sans cet apprentissage, elle compte 3 fois
 * moins. La moyenne lissée reste celle de l'appli (10 % par pesée).
 * `pesees` : [{ jour, kg }] triées, une par jour ; `debuts` : les débuts de règles connus (et la date centrale de la prévision).
 */
export function poidsAjuste(pesees: readonly { jour: string; kg: number }[], debuts: readonly string[], p: ParamsCycle = CYCLE): PeseeAjustee[] {
  const P = p.poids;
  // début de règles le plus proche dont la fenêtre contient ce jour, et le jour relatif ; sinon null
  const rel = (d: string) => {
    let best: { b: string; k: number } | null = null;
    for (const b of debuts) {
      const k = ecartJ(b, d);
      if (k >= P.fenetre[0] && k <= P.fenetre[1] && (!best || Math.abs(k) < Math.abs(best.k))) best = { b, k };
    }
    return best;
  };
  const rels = pesees.map((x) => rel(x.jour));
  // 1. La moyenne lissée sans la fenêtre : la référence pour apprendre l'écart de chaque jour.
  let v: number | null = null;
  const ref: number[] = [];
  pesees.forEach((x, i) => {
    if (v == null) v = x.kg;
    if (!rels[i]) v += P.lissage * (x.kg - v);
    ref.push(v);
  });
  // 2. Les écarts à cette référence, rangés par début de règles (dans l'ordre d'arrivée).
  const parDebut = new Map<string, { k: number; e: number }[]>();
  pesees.forEach((x, i) => {
    const r = rels[i];
    if (!r) return;
    if (!parDebut.has(r.b)) parDebut.set(r.b, []);
    parDebut.get(r.b)!.push({ k: r.k, e: x.kg - ref[i]! });
  });
  // L'écart appris pour le jour relatif k : les 3 derniers cycles complets (fenêtre finie avant ce jour) avec assez de
  // pesées ; à ± 1 jour près.
  const ecart = (k: number, d: string): number | null => {
    const prets = [...parDebut.entries()].filter(([b, l]) => l.length >= P.peseesMin && ecartJ(b, d) > P.fenetre[1]).slice(-P.cycles);
    if (prets.length < P.cycles) return null;
    const l = prets.flatMap(([, x]) => x).filter((x) => Math.abs(x.k - k) <= 1);
    return l.length ? Math.max(-P.ecartMax, Math.min(P.ecartMax, moyenne(l.map((x) => x.e)))) : null;
  };
  // 3. Les deux moyennes lissées : l'habituelle (sans ajustement) et l'ajustée.
  let brut: number | null = null;
  let aj: number | null = null;
  return pesees.map((x, i) => {
    const r = rels[i];
    const k = r ? r.k : null;
    const e = r ? ecart(r.k, x.jour) : null;
    brut = brut == null ? x.kg : brut + P.lissage * (x.kg - brut);
    if (aj == null) aj = x.kg;
    else if (k == null) aj += P.lissage * (x.kg - aj);
    else if (e != null) aj += P.lissage * (x.kg - e - aj);
    else aj += P.lissage * P.poidsReduit * (x.kg - aj);
    return { jour: x.jour, kg: x.kg, brut, ajuste: aj, k, ecart: e };
  });
}

/** L'écart appris autour du 1er jour des règles (de J−2 à J+1), en kg : la phrase de la page Poids ; null avant l'apprentissage. */
export function ecartAppris(l: readonly PeseeAjustee[]): number | null {
  const e = l.filter((x) => x.ecart != null && x.k != null && x.k >= -2 && x.k <= 1).map((x) => x.ecart!);
  return e.length ? moyenne(e) : null;
}

// ---------------------------------------------------------------- l'état du jour (ce que montrent les écrans)

export interface EtatCycle {
  /** Les épisodes, les cycles, les statistiques des 6 derniers et la prévision. */
  episodes: Episode[];
  cycles: Cycle[];
  stats: StatsCycle;
  prevision: Prevision;
  /** La phase du jour demandé, null avant tout cycle connu. */
  phase: Phase | null;
  /** Jours depuis le début de la phase du jour (« depuis 3 jours »), null si inconnue. */
  depuis: number | null;
}

/** Tout ce qu'il faut pour un jour : relu depuis les jours de règles, rien de stocké. */
export function etatCycle(jours: readonly Pick<JourCycle, "jour" | "flux" | "fin" | "source">[], date: string, aujourdhui: string = date, p: ParamsCycle = CYCLE): EtatCycle {
  const eps = episodes(jours, aujourdhui, p);
  const cs = cycles(eps, p);
  const pv = prevision(cs, p);
  const ph = phase(date, cs, p, pv);
  let depuis: number | null = null;
  if (ph && ph.nom !== "inconnue") {
    const debutPhase = ph.nom === "regles" ? 1 : ph.nom === "seconde" ? ph.debutSeconde : finReglesDe(ph.cycle, p) + 1;
    depuis = ph.j - debutPhase + 1;
  }
  return { episodes: eps, cycles: cs, stats: stats(cs, p.cycles, p), prevision: pv, phase: ph, depuis };
}

/** Les jours de la fourchette des prochaines règles (le calendrier, la seule date à venir montrée : D6). */
export function joursFourchette(pv: Prevision): string[] {
  if (!pv.possible) return [];
  return Array.from({ length: ecartJ(pv.du, pv.au) + 1 }, (_, i) => plus(pv.du, i));
}

/** Les jours de règles (un ensemble), épisodes ouverts compris jusqu'au dernier jour noté. */
export function joursRegles(eps: readonly Episode[]): Set<string> {
  const s = new Set<string>();
  for (const e of eps) for (let i = 0; i < e.jours; i++) s.add(plus(e.debut, i));
  return s;
}
