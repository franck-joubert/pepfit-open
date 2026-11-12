// Les textes du suivi du cycle (planche cycle) : dates courtes, fourchette des prochaines règles, mots des phases, et la
// géométrie de la frise. Pur (sans React Native) : tests/cycle-vue.test.ts.
import { t } from "../../i18n/index";
import { formater } from "../../i18n/temps";
import { CYCLE, ecartJ, plus, type EtatCycle, type NomPhase, type Prevision } from "../../cycle/modele";

/** Midi local d'un « AAAA-MM-JJ » (pas de bascule de jour avec l'heure d'été). */
export const midiIso = (s: string) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), 12).getTime();

/** « 8 nov. » */
export const dateCourte = (s: string) => formater(midiIso(s), { day: "numeric", month: "short" });
/** « 8 » */
const jourSeul = (s: string) => formater(midiIso(s), { day: "numeric" });

/** « 8 – 12 nov. » (même mois) ou « 30 oct. – 3 nov. ». */
export function fourchetteCourte(pv: Extract<Prevision, { possible: true }>): string {
  return pv.du.slice(0, 7) === pv.au.slice(0, 7) ? `${jourSeul(pv.du)} – ${dateCourte(pv.au)}` : `${dateCourte(pv.du)} – ${dateCourte(pv.au)}`;
}

/** « entre le 8 et le 12 nov. » */
export function fourchetteLongue(pv: Extract<Prevision, { possible: true }>): string {
  return t("cycle.entre", { du: pv.du.slice(0, 7) === pv.au.slice(0, 7) ? jourSeul(pv.du) : dateCourte(pv.du), au: dateCourte(pv.au) });
}

/** Le mot d'une phase (D1) ; « inconnue » : rien (« Jour 19 » seul). */
export const motPhase = (nom: NomPhase | null | undefined): string => (nom && nom !== "inconnue" ? t(`cycle.phase.${nom}` as "cycle.phase.regles") : "");

/** Ce que lit le lecteur d'écran pour la prévision : « , prochaines règles estimées entre le 8 nov. et le 12 nov. » ou rien. */
export const luPrevision = (pv: Prevision) => (pv.possible ? t("cycle.luPrevision", { du: dateCourte(pv.du), au: dateCourte(pv.au) }) : "");

// ---------------------------------------------------------------- la frise

export interface Segment {
  /** Premier et dernier jour du cycle couverts (1 = premier jour des règles). */
  de: number;
  a: number;
  /** « regles » plein, « premiere » pâle (0,32), « seconde » plus soutenue (0,62), « avenir » piste neutre. */
  sorte: "regles" | "premiere" | "seconde" | "avenir";
}

export interface GeometrieFrise {
  /** Jours dessinés (une case chacun). */
  n: number;
  /** Jour du cycle aujourd'hui. */
  j: number;
  segments: Segment[];
  /** Fourchette des prochaines règles (jours du cycle), null sans prévision. */
  fourchette: { de: number; a: number } | null;
  /** Début de la seconde moitié estimée, null si la phase n'est pas devinée. */
  seconde: number | null;
  /** Dates écrites dessous : début du cycle, début de la seconde moitié. */
  debut: string;
  dateSeconde: string | null;
}

/**
 * La frise du cycle en cours : un jour par case. Les règles en plein, la première moitié pâle, la seconde moitié plus soutenue
 * jusqu'à aujourd'hui ; après aujourd'hui, la piste neutre (rien n'est affirmé) ; la fourchette des prochaines règles, un
 * crochet en tirets. Sans prévision : la durée par défaut, sans fourchette ni seconde moitié. null sans cycle connu.
 */
export function geometrieFrise(e: EtatCycle): GeometrieFrise | null {
  const ph = e.phase;
  if (!ph) return null;
  const c = ph.cycle;
  const pv = e.prevision;
  const j = ph.j;
  const r0 = c.regles ?? Math.max(CYCLE.reglesParDefaut, c.notes);
  const fourchette = pv.possible && c.enCours ? { de: ecartJ(c.debut, pv.du) + 1, a: ecartJ(c.debut, pv.au) + 1 } : null;
  const n = Math.max(fourchette ? fourchette.a : ph.duree, j + 1);
  const seconde = ph.certaine ? ph.debutSeconde : null;
  const finAvenir = fourchette ? fourchette.de - 1 : n;
  const segs: Segment[] = [];
  const pousser = (de: number, a: number, sorte: Segment["sorte"]) => {
    if (a >= de) segs.push({ de, a, sorte });
  };
  // le passé, phase par phase, jusqu'à aujourd'hui
  pousser(1, Math.min(r0, j), "regles");
  if (seconde != null) {
    pousser(r0 + 1, Math.min(seconde - 1, j), "premiere");
    pousser(Math.max(seconde, r0 + 1), j, "seconde");
  } else pousser(r0 + 1, j, "premiere");
  // l'avenir : la piste neutre jusqu'à la fourchette
  pousser(j + 1, finAvenir, "avenir");
  return { n, j, segments: segs, fourchette, seconde, debut: c.debut, dateSeconde: seconde != null && seconde <= n ? plus(c.debut, seconde - 1) : null };
}
