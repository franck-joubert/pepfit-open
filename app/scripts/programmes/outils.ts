// Outils du générateur du catalogue de programmes (scripts/programmes/construire.ts) : textes bilingues, blocs d'endurance et
// de musculation, séances nommées, programme assemblé semaine par semaine. Le JSON écrit est la source livrée (assets).
import type { Bloc, ExercicePerso, Famille, Lieu, Niveau, Objectif, Programme, Role, Seance, Texte2 } from "../../src/boutique/modele.ts";
import type { TypeProgramme } from "../../src/db/programmes.ts";

export const T = (fr: string, en: string): Texte2 => ({ fr, en });

/** Une séance avec sa clé (unique dans son programme : deux séances identiques partagent la clé). */
export type SeanceCle = Seance & { cle: string };

// ---------------------------------------------------------------- durées

/** « 40 min », « 1 h 10 » / « 40 min », « 1h10 ». */
export function duree(min: number): Texte2 {
  if (min < 60) return T(`${min} min`, `${min} min`);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return T(m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`, m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`);
}
/** « 45 s », « 3 min », « 1 min 30 ». */
export function sec(s: number): Texte2 {
  if (s < 60) return T(`${s} s`, `${s} s`);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return T(r ? `${m} min ${r}` : `${m} min`, r ? `${m} min ${r}` : `${m} min`);
}
const km = (m: number) => {
  const v = m / 1000;
  return T(`${String(v).replace(".", ",")} km`, `${v} km`);
};
const cat = (...l: Texte2[]) => T(l.map((x) => x.fr).join(""), l.map((x) => x.en).join(""));

// ---------------------------------------------------------------- blocs d'endurance

/** Un effort continu en minutes, à une zone, sur un exercice d'endurance (course par défaut). */
export const continu = (min: number, zone: number, note: Texte2 | null = null, exo = "course"): Bloc => ({ exo, series: 1, dureeS: min * 60, zone, note });
export const distance = (m: number, zone: number, note: Texte2 | null = null, exo = "course"): Bloc => ({ exo, series: 1, distanceM: m, zone, note });
/** n efforts de `s` secondes, récupération `recup` entre deux. */
export const repetitions = (n: number, s: number, zone: number, recup: number, note: Texte2 | null = null, exo = "course"): Bloc => ({
  exo, series: n, dureeS: s, zone, reposS: recup, note,
});
export const repetitionsM = (n: number, m: number, zone: number, recup: number, note: Texte2 | null = null, exo = "course"): Bloc => ({
  exo, series: n, distanceM: m, zone, reposS: recup, note,
});

const ECHAUFFEMENT = T("échauffement", "warm-up");
const RETOUR = T("retour au calme", "cool-down");
const TROT = T("récupération en trottinant", "jog recovery");
const LIGNES = T("lignes droites : accélère progressivement sur 80 m", "strides: build up over 80 m");

// ---------------------------------------------------------------- séances de course

export const footing = (min: number, lignes = false): SeanceCle => ({
  cle: `footing-${min}${lignes ? "-ld" : ""}`,
  nom: lignes ? cat(T("Footing ", "Easy run "), duree(min), T(" et lignes droites", " and strides")) : cat(T("Footing ", "Easy run "), duree(min)),
  type: "course",
  role: "facile",
  blocs: lignes ? [continu(min, 2), repetitions(4, 20, 5, 60, LIGNES)] : [continu(min, 2)],
});

export const longue = (min: number, note: Texte2 | null = null): SeanceCle => ({
  cle: `longue-${min}`,
  nom: cat(T("Sortie longue ", "Long run "), duree(min)),
  type: "course",
  role: "longue",
  blocs: [continu(min, 2, note)],
});

/** Sortie longue en kilomètres, avec un bloc à allure spécifique (semi : Z3-Z4, marathon : Z3). */
export const longueKm = (total: number, bloc: { n: number; m: number; zone: number; quoi: Texte2 } | null = null): SeanceCle => {
  const facile = bloc ? total * 1000 - bloc.n * bloc.m : total * 1000;
  return {
    cle: `longue-${total}k${bloc ? `-${bloc.n}x${bloc.m}` : ""}`,
    nom: bloc
      ? cat(T("Sortie longue ", "Long run "), km(total * 1000), T(" dont ", " with "), bloc.n > 1 ? T(`${bloc.n} × `, `${bloc.n} × `) : T("", ""), km(bloc.m), T(" ", " "), bloc.quoi)
      : cat(T("Sortie longue ", "Long run "), km(total * 1000)),
    type: "course",
    role: "longue",
    blocs: bloc
      ? [distance(Math.round(facile / 2), 2), repetitionsM(bloc.n, bloc.m, bloc.zone, bloc.n > 1 ? 180 : 0, bloc.quoi), distance(Math.round(facile / 2), 2)]
      : [distance(total * 1000, 2)],
  };
};

export const fractionne = (n: number, s: number, zone: number, recup: number, ech = 15): SeanceCle => ({
  cle: `fract-${n}x${s}-z${zone}`,
  nom: cat(T("Fractionné ", "Intervals "), T(`${n} × `, `${n} × `), sec(s)),
  type: "course",
  role: "dure",
  blocs: [continu(ech, 2, ECHAUFFEMENT), repetitions(n, s, zone, recup, TROT), continu(8, 2, RETOUR)],
});

export const fractionneM = (n: number, m: number, zone: number, recup: number, quoi: Texte2): SeanceCle => ({
  cle: `fractm-${n}x${m}-z${zone}`,
  nom: cat(T("Fractionné ", "Intervals "), T(`${n} × `, `${n} × `), m >= 1000 ? km(m) : T(`${m} m`, `${m} m`)),
  type: "course",
  role: "dure",
  blocs: [continu(15, 2, ECHAUFFEMENT), repetitionsM(n, m, zone, recup, quoi), continu(10, 2, RETOUR)],
});

export const cotes = (n: number, s: number): SeanceCle => ({
  cle: `cotes-${n}x${s}`,
  nom: cat(T("Côtes ", "Hills "), T(`${n} × `, `${n} × `), sec(s)),
  type: "course",
  role: "dure",
  blocs: [
    continu(15, 2, ECHAUFFEMENT),
    repetitions(n, s, 5, 90, T("en montée, pente moyenne ; redescends en trottinant", "uphill, moderate slope; jog back down")),
    continu(10, 2, RETOUR),
  ],
});

export const seuil = (n: number, min: number, recup = 180): SeanceCle => ({
  cle: `seuil-${n}x${min}`,
  nom: cat(T("Seuil ", "Threshold "), n > 1 ? T(`${n} × `, `${n} × `) : T("", ""), duree(min)),
  type: "course",
  role: "dure",
  blocs: [continu(15, 2, ECHAUFFEMENT), repetitions(n, min * 60, 4, recup, T("dur mais tenable : quelques mots seulement", "hard but sustainable: a few words only")), continu(10, 2, RETOUR)],
});

export const courseJour = (m: number): SeanceCle => ({
  cle: `course-${m}`,
  nom: cat(T("Course : ", "Race: "), km(m)),
  type: "course",
  role: "dure",
  epreuve: true,
  note: T("Le jour J : pars prudemment, accélère sur la fin.", "Race day: start easy, push at the end."),
  blocs: [continu(10, 1, ECHAUFFEMENT), distance(m, 4, T("ton allure de course", "your race pace"))],
});

// ---------------------------------------------------------------- musculation

export interface OptionsEx {
  repsMax?: number;
  repos?: number;
  tempo?: string;
  superset?: number;
  transition?: number;
  progression?: number;
  /** Effort visé : répétitions en réserve. */
  rir?: number;
  note?: Texte2;
  repsParSerie?: number[];
}
/** Un exercice : `series` × `reps` (plage avec `repsMax`), repos 2 min par défaut. */
export const ex = (exo: string, series: number, reps: number, o: OptionsEx = {}): Bloc => ({
  exo,
  series,
  reps: o.repsParSerie ? null : reps,
  repsMax: o.repsMax ?? null,
  repsParSerie: o.repsParSerie ?? null,
  reposS: o.repos ?? 120,
  tempo: o.tempo ?? null,
  superset: o.superset ?? null,
  transitionS: o.transition ?? null,
  progressionKg: o.progression ?? null,
  rir: o.rir ?? null,
  note: o.note ?? null,
});
/** Un exercice tenu ou chronométré : `series` × `s` secondes. */
export const tenu = (exo: string, series: number, s: number, o: OptionsEx = {}): Bloc => ({
  exo,
  series,
  dureeS: s,
  reposS: o.repos ?? 45,
  superset: o.superset ?? null,
  transitionS: o.transition ?? null,
  note: o.note ?? null,
});

export const seance = (cle: string, nom: Texte2, blocs: Bloc[], o: { type?: TypeProgramme; role?: Role; note?: Texte2; format?: Seance["format"]; formatValeur?: number } = {}): SeanceCle => ({
  cle,
  nom,
  type: o.type ?? "muscu",
  role: o.role ?? "facile",
  note: o.note ?? null,
  format: o.format ?? null,
  formatValeur: o.formatValeur ?? null,
  blocs,
});

/**
 * Effort visé de chaque bloc à répétitions (NOTES-CHARGES § 3) : `rir(cle, bloc)` donne les répétitions en réserve d'après la
 * séance (phase, semaine allégée, test) et l'exercice ; null : pas de cible (test, circuit). Un `rir` déjà posé est gardé.
 */
export function avecEffort(p: Programme, rir: (cle: string, b: Bloc) => number | null): Programme {
  const seances = Object.fromEntries(
    Object.entries(p.seances).map(([cle, s]) => [
      cle,
      { ...s, blocs: s.blocs.map((b) => (b.rir == null && (b.reps != null || b.repsParSerie != null) ? { ...b, rir: rir(cle, b) } : b)) },
    ]),
  );
  return { ...p, seances };
}

// ---------------------------------------------------------------- programme

export interface SemaineDef {
  allegee?: boolean;
  accent?: Texte2;
  seances: SeanceCle[];
}

export interface MetaProgramme {
  id: string;
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
  avertissement?: Texte2;
  progression?: Texte2;
  chargesDepart?: boolean;
  principes: Texte2;
  sources: number[];
  phases: { nom: Texte2; semaines: number }[];
  /** Clé de la séance montrée dans la fiche. */
  seanceType: string;
  exercicesPerso?: Record<string, ExercicePerso>;
}

export function programme(m: MetaProgramme, semaines: SemaineDef[]): Programme {
  const seances: Record<string, Seance> = {};
  for (const w of semaines) {
    for (const { cle, ...s } of w.seances) {
      const deja = seances[cle];
      if (deja && JSON.stringify(deja) !== JSON.stringify(s)) throw new Error(`${m.id} : deux séances différentes sous la clé ${cle}`);
      seances[cle] = s;
    }
  }
  let de = 1;
  const phases = m.phases.map((p) => {
    const x = { nom: p.nom, de, a: de + p.semaines - 1 };
    de += p.semaines;
    return x;
  });
  const sps = semaines[0]!.seances.length;
  const phaseDe = (n: number) => phases.findIndex((p) => n >= p.de && n <= p.a);
  if (de - 1 !== semaines.length) throw new Error(`${m.id} : les phases couvrent ${de - 1} semaines sur ${semaines.length}`);
  return {
    id: m.id,
    version: 1,
    nom: m.nom,
    resume: m.resume,
    description: m.description,
    famille: m.famille,
    type: m.type,
    objectifs: m.objectifs,
    lieux: m.lieux,
    niveau: m.niveau,
    semaines: semaines.length,
    seancesParSemaine: sps,
    picto: m.picto,
    gros: m.gros,
    lieuCourt: m.lieuCourt,
    materiel: m.materiel,
    avertissement: m.avertissement ?? null,
    progression: m.progression ?? null,
    chargesDepart: m.chargesDepart ?? false,
    principes: m.principes,
    sources: m.sources,
    phases,
    seances,
    calendrier: semaines.map((w, i) => ({ n: i + 1, phase: phaseDe(i + 1), allegee: w.allegee ?? false, accent: w.accent ?? null, seances: w.seances.map((s) => s.cle) })),
    seanceType: m.seanceType,
    exercicesPerso: m.exercicesPerso ?? {},
  };
}

/** Répète une semaine `n` fois (mêmes séances). */
export const fois = (n: number, w: SemaineDef): SemaineDef[] => Array.from({ length: n }, () => w);

/** Phases usuelles. */
export const PH = {
  base: T("Base", "Base"),
  dev: T("Développement", "Build"),
  spe: T("Spécifique", "Specific"),
  pic: T("Pic", "Peak"),
  aff: T("Affûtage", "Taper"),
  appr: T("Apprentissage", "Learning"),
  prog: T("Progression", "Progression"),
  bilan: T("Bilan", "Review"),
  vol: T("Volume", "Volume"),
  allege: T("Semaine allégée", "Deload week"),
  tech: T("Technique", "Technique"),
  charge: T("Poids et vitesse", "Weight and speed"),
};
