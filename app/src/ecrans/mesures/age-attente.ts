// Page Âge pepfit en attente de données (planche age-attente, validée le 31/10, D1 à D7) : les neuf facteurs avec
// leur état (prêt, en cours, à faire, facultatif), ce qu'il reste à faire et où ; la date du premier Âge si elle se calcule.
// Règles d'age-calc.ts : un facteur a une donnée avec 7 jours (nuits, pas, FC au repos), 14 jours de recul (zones de Whoop ou
// des séances mesurées à la FC, séances pepfit) ou une mesure (VO2max, masse maigre). La régularité : Whoop, ou les heures des
// nuits de Santé Connect (SRI, regularite-sommeil.ts). Date (D3) : les jours qui viennent sont simulés (nuits et pas +1
// par jour, une semaine active de plus par semaine si tu en as déjà une), la page s'ouvre quand la lecture « age » de la
// précision est ouverte et que 3 facteurs ont une donnée ; l'Âge arrive le lundi qui suit. Si le temps seul ne suffit pas :
// la date avec l'action la plus simple qui suffit (test VMA, pesée, pas autorisés), dite avec elle. Jamais « vers » ni « ~ ».
// Pur : tests/age-attente.test.ts.
import { t, tp } from "../../i18n/index";
import { formater } from "../../i18n/temps";
import { calculer, lecture, type DonneesPrecision, type IdAction } from "../../precision/modele";
import { ilYaDuree } from "../../precision/vue";
import { FACTEURS, lundiAvant, type GroupeAge, type IdFacteur } from "./age-calc";

const JOUR = 86_400_000;
/** Jours simulés au plus pour trouver la date (au-delà, pas de date : juste les actions). */
export const HORIZON = 28;
export const SEUIL_AGE = 60;
const MIN_FACTEURS = 3;

/** Recul des sources que la précision ne lit pas : premier jour Whoop (zones), première séance mesurée à la FC hors Whoop
 * (zones), première séance pepfit et séances sur 6 mois. */
export interface ReculAge {
  debutWhoop: number | null;
  debutFc?: number | null;
  debutMuscu: number | null;
  seancesMuscu: number;
}

export interface EntreeAttente {
  d: DonneesPrecision;
  /** Mémoire de la précision (cap atteint, lectures ouvertes) : la lecture se juge comme ailleurs. */
  memoire?: { cap?: number | null; lectures?: readonly string[] };
  recul: ReculAge;
  /** Date du test VMA retenu (FaitsPrecision.vmaDate). */
  vmaDate: number | null;
  maintenant: number;
}

export type EtatFacteur = "pret" | "encours" | "afaire" | "option";

export interface LigneAttente {
  id: IdFacteur;
  groupe: GroupeAge;
  etat: EtatFacteur;
  sous: string;
  /** Compte des jours ou des nuits (traits du rail), null sans compte. */
  traits: { n: number; sur: number } | null;
  /** Où le faire (precision/actions.ts, suivreEtape), et le mot du lien. */
  action: IdAction | null;
  lien: string | null;
}

export interface DateAttente {
  lundi: number;
  /** Jours de plus qu'il faut (0 : au prochain calcul). */
  jours: number;
  /** Actions dont une suffit (« ou ») ; vide : le temps suffit. */
  actions: IdAction[];
}

export type CasAttente = "naissance" | "peu" | "presque";

export interface Attente {
  cas: CasAttente;
  facteurs: LigneAttente[];
  prets: number;
  date: DateAttente | null;
  /** Précision de l'Âge (0 à 100). */
  precision: number;
  /** Signature fantôme : flou (dp) et opacité, qui se précisent avec la précision de l'Âge. */
  flou: number;
  opacite: number;
}

const GROUPE: Record<IdFacteur, GroupeAge> = {
  regularite: "sommeil", duree: "sommeil", pasJour: "effort", zones13: "effort", zones45: "effort", muscu: "effort", vo2: "forme", fcRepos: "forme", maigre: "forme",
};

const nuitsDe = (d: DonneesPrecision) => d.nuits14 + (d.nuitsAvant ?? 0);
const pasDe = (d: DonneesPrecision) => d.pas14 + (d.pasAvant ?? 0);
/** Nuits qui donnent la régularité : celles de Whoop, sinon celles qui ont leurs heures (Santé Connect). */
const nuitsRegularite = (d: DonneesPrecision) => (d.capteur === "whoop" ? nuitsDe(d) : (d.sommeil14 ?? 0) + (d.sommeilAvant ?? 0));
/** Premier jour des zones : Whoop ou une séance mesurée à la FC, le plus ancien. */
const debutZones = (r: ReculAge) => (r.debutWhoop != null && r.debutFc != null ? Math.min(r.debutWhoop, r.debutFc) : (r.debutWhoop ?? r.debutFc ?? null));
const joursDepuis = (debut: number | null, maintenant: number) => (debut == null ? null : Math.max(0, Math.floor((maintenant - debut) / JOUR)));
const vo2Mesuree = (d: DonneesPrecision) => d.vma === "test" || d.vma === "vieux" || d.vma === "gps" || d.vma === "gpsfc";
const maigreMesuree = (d: DonneesPrecision) => !!d.grasSource || d.navyJours != null;

/** Facteurs qui ont une donnée, `k` jours plus tard (d déjà avancé de `k` jours). */
function prets(d: DonneesPrecision, recul: ReculAge, maintenant: number, k: number): number {
  const w = joursDepuis(debutZones(recul), maintenant);
  const m = joursDepuis(recul.debutMuscu, maintenant);
  const nuits = nuitsDe(d) >= 7;
  return [
    nuitsRegularite(d) >= 7,
    nuits,
    pasDe(d) >= 7,
    w != null && w + k >= 14,
    w != null && w + k >= 14,
    m != null && m + k >= 14,
    vo2Mesuree(d),
    nuits,
    maigreMesuree(d),
  ].filter(Boolean).length;
}

/** Les données dans `k` jours, si tu continues comme maintenant. */
export function avancer(d: DonneesPrecision, k: number): DonneesPrecision {
  if (k <= 0) return d;
  return {
    ...d,
    nuits14: d.capteur ? Math.min(14, d.nuits14 + k) : d.nuits14,
    sommeil14: d.sommeil14 ? Math.min(14, d.sommeil14 + k) : d.sommeil14,
    pas14: d.capteur || d.pasAutorises ? Math.min(14, d.pas14 + k) : d.pas14,
    semainesActives: d.semainesActives > 0 ? Math.min(4, d.semainesActives + Math.floor(k / 7)) : d.semainesActives,
  };
}

/** Une action faite aujourd'hui (celles qui ne prennent pas de temps et qui nourrissent un facteur). */
const ACTIONS_DATE: { id: IdAction; si: (d: DonneesPrecision) => boolean; fait: (d: DonneesPrecision) => DonneesPrecision }[] = [
  { id: "vma", si: (d) => d.vma !== "test", fait: (d) => ({ ...d, vma: "test", vmaJours: 0 }) },
  { id: "gras", si: (d) => !maigreMesuree(d), fait: (d) => ({ ...d, grasSource: "balance", grasJours: 0 }) },
  { id: "pas", si: (d) => !d.capteur && !d.pasAutorises, fait: (d) => ({ ...d, pasAutorises: true }) },
];

/** Premier jour (0 à HORIZON) où la page s'ouvrirait, null au-delà. */
function premierJour(e: EntreeAttente, d: DonneesPrecision): number | null {
  for (let k = 0; k <= HORIZON; k++) {
    const dk = avancer(d, k);
    if (prets(dk, e.recul, e.maintenant, k) >= MIN_FACTEURS && lecture(calculer(dk, e.memoire), "age").ouverte) return k;
  }
  return null;
}

/** Date du premier Âge (D3) ; sans date de naissance, celle d'une date saisie aujourd'hui. */
export function dateAttente(e: EntreeAttente): DateAttente | null {
  const d = e.d.naissance ? e.d : { ...e.d, naissance: "date" as const };
  const vers = (k: number, actions: IdAction[]): DateAttente => ({ lundi: lundiAvant(e.maintenant + k * JOUR, -1), jours: k, actions });
  const k = premierJour(e, d);
  if (k != null) return vers(k, []);
  let mieux: { k: number; ids: IdAction[] } | null = null;
  for (const a of ACTIONS_DATE) {
    if (!a.si(d)) continue;
    const ka = premierJour(e, a.fait(d));
    if (ka == null) continue;
    const lundi = lundiAvant(e.maintenant + ka * JOUR, -1);
    const lundiMieux = mieux ? lundiAvant(e.maintenant + mieux.k * JOUR, -1) : Infinity;
    if (lundi < lundiMieux) mieux = { k: ka, ids: [a.id] };
    else if (mieux && lundi === lundiMieux && mieux.ids.length < 2) mieux.ids.push(a.id);
  }
  return mieux ? vers(mieux.k, mieux.ids) : null;
}

const jourMoisLong = (ms: number) => formater(ms, { day: "numeric", month: "long" });

function lignes(e: EntreeAttente, date: DateAttente | null): LigneAttente[] {
  const { d, recul, maintenant } = e;
  const source = d.capteur === "whoop" ? "Whoop" : t("sante.santeConnect");
  const nuits = nuitsDe(d);
  const pas = pasDe(d);
  const w = joursDepuis(debutZones(recul), maintenant);
  const m = joursDepuis(recul.debutMuscu, maintenant);
  const reg = nuitsRegularite(d);
  // l'action de la date : « il suffit pour le 9 novembre », puis « suffit aussi »
  const suffit = (id: IdAction) => {
    const i = date && e.d.naissance ? date.actions.indexOf(id) : -1;
    return i < 0 ? "" : i === 0 ? t("age.attente.suffit", { date: jourMoisLong(date!.lundi) }) : t("age.attente.suffitAussi");
  };
  const ligne = (id: IdFacteur, etat: EtatFacteur, sous: string, traits: LigneAttente["traits"] = null, action: IdAction | null = null, lien: string | null = null): LigneAttente => ({
    id, groupe: GROUPE[id], etat, sous, traits, action, lien,
  });
  const montre = (id: "duree" | "fcRepos"): LigneAttente => {
    if (nuits >= 7) return ligne(id, "pret", t("age.attente.preteNuits", { n: nuits, source }));
    if (d.capteur) return ligne(id, "encours", t(`age.attente.encours.${id}`, { n: nuits }), { n: nuits, sur: 7 });
    return ligne(id, "afaire", t("age.attente.sansMontre"), null, "capteur", t("age.attente.lien.relier"));
  };
  const zones = (id: "zones13" | "zones45"): LigneAttente => {
    if (w == null) return ligne(id, "option", t(`age.attente.option.${id}`));
    if (w >= 14) return ligne(id, "pret", t(recul.debutWhoop != null ? "age.attente.pretesWhoop" : "age.attente.pretesFc"));
    const reste = 14 - w;
    return ligne(id, "encours", reste === 1 ? t("age.attente.zonesDemain", { n: w }) : tp("age.attente.zonesDans", reste, { j: w }), { n: w, sur: 14 });
  };
  const muscu = (): LigneAttente => {
    if (m == null) return ligne("muscu", "option", t("age.attente.option.muscu"), null, "muscu", t("age.attente.lien.seance"));
    if (m >= 14) return ligne("muscu", "pret", tp("age.attente.preteSeances", recul.seancesMuscu));
    return ligne("muscu", "encours", tp("age.attente.encours.muscu", recul.seancesMuscu, { date: jourMoisLong(recul.debutMuscu! + 14 * JOUR) }), { n: m, sur: 14 });
  };
  const vo2 = (): LigneAttente => {
    if (vo2Mesuree(d))
      return ligne("vo2", "pret", e.vmaDate != null ? t("age.attente.preteVma", { date: jourMoisLong(e.vmaDate) }) : t("age.attente.preteCourses"));
    const sous = d.capteur === "whoop" ? t("age.attente.vo2Whoop") : t("age.attente.vo2");
    return ligne("vo2", "afaire", sous + suffit("vma"), null, "vma", t("age.attente.lien.test"));
  };
  const maigre = (): LigneAttente => {
    if (maigreMesuree(d)) {
      const j = d.grasSource ? d.grasJours : d.navyJours;
      const de = t(`age.attente.maigreDe.${d.grasSource ?? "tours"}`);
      return ligne("maigre", "pret", j == null ? t("age.attente.preteMaigre", { de }) : t("age.attente.preteMaigreQuand", { de, quand: ilYaDuree(j) }));
    }
    return ligne("maigre", "afaire", t("age.attente.maigre") + suffit("gras"), null, "gras", t("age.attente.lien.saisir"));
  };
  const parId: Record<IdFacteur, () => LigneAttente> = {
    regularite: () =>
      reg >= 7
        ? ligne("regularite", "pret", t("age.attente.preteNuits", { n: reg, source }))
        : d.capteur === "whoop" || reg > 0
          ? ligne("regularite", "encours", t("age.attente.encours.duree", { n: reg }), { n: reg, sur: 7 })
          : ligne("regularite", "option", t("age.attente.option.regularite"), null, "capteur", t("age.attente.lien.relier")),
    duree: () => montre("duree"),
    pasJour: () => {
      if (pas >= 7) return ligne("pasJour", "pret", t("age.attente.pretsJours", { n: pas, source: d.capteur ? source : t("sante.santeConnect") }));
      if (d.capteur || d.pasAutorises) return ligne("pasJour", "encours", t("age.attente.encours.pasJour", { n: pas }), { n: pas, sur: 7 });
      return ligne("pasJour", "afaire", t("age.attente.pasAutoriser") + suffit("pas"), null, "pas", t("age.attente.lien.autoriser"));
    },
    zones13: () => zones("zones13"),
    zones45: () => zones("zones45"),
    muscu,
    vo2,
    fcRepos: () => montre("fcRepos"),
    maigre,
  };
  return FACTEURS.map((id) => parId[id]());
}

export function attente(e: EntreeAttente): Attente {
  const date = dateAttente(e);
  const facteurs = lignes(e, date);
  const precision = calculer(e.d, e.memoire).p.age ?? 0;
  const cas: CasAttente = !e.d.naissance ? "naissance" : precision >= 50 ? "presque" : "peu";
  const fantome = { naissance: { flou: 15, opacite: 0.5 }, peu: { flou: 8, opacite: 0.6 }, presque: { flou: 3.5, opacite: 0.86 } }[cas];
  return { cas, facteurs, prets: facteurs.filter((f) => f.etat === "pret").length, date, precision, ...fantome };
}

// ---- Textes du centre et des liens -------------------------------------------------------------------------------------

/** « 9 nov. » : la date du premier Âge, au centre. */
export const dateCourte = (lundi: number) => formater(lundi, { day: "numeric", month: "short" });
/** « lundi 9 novembre ». */
export const dateLongue = (lundi: number) => formater(lundi, { weekday: "long", day: "numeric", month: "long" });

const avecActions = (ids: IdAction[]) => ids.map((id) => t(`age.attente.avec.${id as "vma"}`)).join(t("age.attente.ou"));

/** Ligne rose sous la date : la condition (« lundi, avec un test VMA ou une pesée », « lundi, après une nuit de plus »). */
export function texteQuand(date: DateAttente, capteur: boolean): string {
  if (date.actions.length) return t("age.attente.quandAvec", { avec: avecActions(date.actions) });
  if (date.jours <= 0) return t("age.attente.quandCalcul");
  return tp(capteur ? "age.attente.quandNuits" : "age.attente.quandJours", date.jours);
}

/** Sans date de naissance, sous le bouton : la date si tu la saisis aujourd'hui. */
export function texteApres(date: DateAttente | null): string | null {
  if (!date) return null;
  const jour = dateLongue(date.lundi);
  return date.actions.length ? t("age.attente.apresAvec", { jour, avec: avecActions(date.actions) }) : t("age.attente.apres", { jour });
}

/** Sous « Précision pepfit » : « 19 sur 60 pour ouvrir l'Âge ». */
export function textePrecision(a: Attente, capteur: boolean): string {
  const p = Math.max(0, Math.floor(a.precision));
  if (a.cas === "naissance") return t("age.attente.precisionNaissance", { p });
  if (a.date && !a.date.actions.length && a.date.jours > 0 && capteur) return tp("age.attente.precisionNuits", a.date.jours, { p });
  return t("age.attente.precision", { p });
}
