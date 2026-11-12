// Ce que montrent la ligne « Activité détectée », la feuille « Quel sport ? » et « Changer d'activité » (planche
// activite-detectee, validée le 29/10) : textes, place des lignes dans la journée, « Ce qui change ». Sans React Native
// (tests/activites-vue.test.ts).
import { t, tp } from "../i18n/index";
import type { NomIcone } from "../ui/Icone";
import { baremeSport, scoreEffort } from "./effort-pepfit";
import { texteEffort } from "./mesures/scores-calc";
import { kcalSeance } from "./kcal-seance";
import { approx, dureeCourte, heure, heureTexte, nombre } from "./format";
import type { Changement } from "./changer-activite";
import type { Pourquoi } from "./reconnaissance";

const MIN = 60_000;

/** « 18:42 · 1 h 05 · FC moy. 138 » */
export function ligneActivite(a: { debut: number; fin: number; fcMoy: number | null }): string {
  const p = { heure: heure(a.debut), duree: dureeCourte((a.fin - a.debut) / 1000) };
  return a.fcMoy != null ? t("activite.ligneFc", { ...p, fc: a.fcMoy }) : t("activite.ligne", p);
}

// fr : « mardis » et « soir » ; en : « Tuesday » et « evenings » (« Like your Tuesday evenings ») : mêmes paramètres
const jourParams = (j: number) => ({ jours: t(`activite.jours.${j}` as "activite.jours.0") });

/**
 * « Comme tes mardis soir à Casa Padel », « Comme quand Whoop dit « Tennis » », « Comme tes 3 dernières fois » ; d'après le
 * programme : « Prévu à 8:00 », « Prévu à 8:00, Casa Padel ».
 */
export function phrasePourquoi(p: Pourquoi, noms: { lieu?: string | null; brut?: string | null } = {}): string {
  let phrase: string;
  if (p.prevuA) {
    const h = heureTexte(p.prevuA);
    return p.lieuId && noms.lieu ? t("activite.prevuALieu", { heure: h, lieu: noms.lieu }) : t("activite.prevuA", { heure: h });
  }
  if (p.jour != null && p.moment) {
    const m = t(`activite.moment.${p.moment}` as "activite.moment.soir");
    phrase = t("activite.pourquoi.jourMoment", { ...jourParams(p.jour), moment: m });
  } else if (p.jour != null) phrase = t("activite.pourquoi.jour", jourParams(p.jour));
  else if (p.sportBrut && noms.brut) return t("activite.pourquoi.brut", { sport: noms.brut });
  else if (p.moment) phrase = t(`activite.pourquoi.moment.${p.moment}` as "activite.pourquoi.moment.soir");
  else phrase = tp("activite.pourquoi.n", p.n);
  return p.lieuId && noms.lieu ? t("activite.pourquoi.lieu", { phrase, lieu: noms.lieu }) : phrase;
}

/** Ligne d'un sport proche (deux sports possibles) : « 4 jeudis soir à Casa Padel », « 3 fois ». */
export function phraseAmbigu(n: number, p: Pourquoi, lieu?: string | null): string {
  let phrase: string;
  if (p.jour != null && p.moment) {
    const m = t(`activite.moment.${p.moment}` as "activite.moment.soir");
    phrase = t("activite.ambigu", { n, ...jourParams(p.jour), moment: m });
  } else if (p.jour != null) phrase = t("activite.ambiguJour", { n, ...jourParams(p.jour) });
  else phrase = tp("activite.nFois", n);
  return p.lieuId && lieu ? t("activite.pourquoi.lieu", { phrase, lieu }) : phrase;
}

/**
 * Lignes de la journée dans l'ordre : chaque activité détectée prend place parmi les séances faites, à son heure ; les
 * séances prévues restent après (D1 : la ligne est posée dans la liste des séances du jour).
 */
export function fusionnerParHeure<L, A extends { debut: number }>(lignes: readonly L[], activites: readonly A[], debutDe: (l: L) => number | null): (L | A)[] {
  const out: (L | A)[] = [];
  const reste = [...activites].sort((a, b) => a.debut - b.debut);
  for (const l of lignes) {
    const d = debutDe(l);
    while (reste.length && (d == null || reste[0]!.debut < d)) out.push(reste.shift()!);
    out.push(l);
  }
  return [...out, ...reste];
}

export interface Effet {
  icone: NomIcone;
  titre: string;
  sous: string;
  /** Valeur à droite (chiffre, flèche « ~ 8,0 → ~ 11,8 »). */
  valeur?: string;
  /** Ce qui reste : coche verte. */
  reste?: boolean;
}

const intensite = (id: string | null) => baremeSport(id);

/**
 * « Ce qui change » avant d'enregistrer : ce qui reste (séries, tracé, FC), le titre, la distance lue en vitesse ou en
 * allure, la VMA, puis la dépense et l'effort (inchangés quand ils viennent de la FC ou de Whoop, sinon de → vers).
 */
export function effetsChangement(
  plan: Changement,
  s: { titre: string | null; debut: number; fin: number | null; distanceM: number; de: string | null; vers: string },
  corps: { kg: number | null; bmrKcal: number | null },
): Effet[] {
  const l: Effet[] = [];
  const g = plan.garde;
  const min = s.fin ? (s.fin - s.debut) / MIN : 0;
  if (g.exercices > 0) {
    l.push({
      icone: "check",
      titre: t("activite.garde.exercices", { exercices: tp("activite.nExercices", g.exercices), series: tp("communs.serie", g.series) }),
      sous: t("activite.garde.exercicesSous"),
      reste: true,
    });
  } else {
    const titre = g.trace ? t("activite.garde.trace") : g.fc ? t("activite.garde.duree") : t("activite.garde.dureeSeule");
    l.push({ icone: "check", titre, sous: t(g.trace || g.fc ? "activite.garde.restent" : "activite.garde.reste"), reste: true });
  }
  if (plan.titre == null && s.titre) l.push({ icone: "crayon", titre: t("activite.titre"), sous: t("activite.titreReste", { titre: s.titre }) });
  if (plan.lecture && s.distanceM > 0 && min > 0) {
    const km = `${nombre(s.distanceM / 1000, 1)} km`;
    const valeur =
      plan.lecture === "vitesse"
        ? `${nombre(s.distanceM / 1000 / (min / 60), 1)} km/h`
        : (() => {
            const sec = Math.round((min * 60) / (s.distanceM / 1000));
            return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} /km`;
          })();
    l.push({ icone: "distance", titre: t("activite.distance"), sous: t(plan.lecture === "vitesse" ? "activite.distanceVitesse" : "activite.distanceAllure", { km }), valeur });
  }
  if (plan.vma) l.push({ icone: "chart", titre: t("activite.vma"), sous: t(plan.vma === "retirer" ? "activite.vmaRetiree" : "activite.vmaCalculee") });
  if (plan.depense !== "estimee") {
    l.push({ icone: "flamme", titre: t("activite.depenseEffort"), sous: t("activite.selonFc") });
  } else if (min > 0) {
    // intensités du plan : une séance de muscu sans marque part de celle de la muscu
    const [de, vers] = plan.effort.genre === "estime" ? [plan.effort.de, plan.effort.vers] : [intensite(s.de), intensite(s.vers)];
    const e = (i: number) => texteEffort(scoreEffort(min * i));
    l.push({ icone: "eclair", titre: t("activite.effort"), sous: t("activite.effortEstime"), valeur: t("activite.de", { de: e(de), vers: e(vers) }) });
    if (corps.kg) {
      // la même fonction que la page Énergie (kcal-seance.ts), aux MET du sport faute de FC
      const k = (id: string | null) => approx(nombre(kcalSeance({ minutes: min, sportId: id }, { sexe: null, kg: corps.kg, age: null }, corps.bmrKcal ?? 0).kcal, 0));
      l.push({ icone: "flamme", titre: t("activite.depense"), sous: t("activite.depenseEstimee"), valeur: t("activite.de", { de: k(s.de), vers: k(s.vers) }) });
    }
  }
  return l;
}

/** Sous-ligne « Sport » de l'énergie : « 3 séances, dont 2 activités détectées ». */
export function sousSeances(seances: readonly { detectee?: boolean }[]): string {
  const n = seances.filter((s) => s.detectee).length;
  const base = tp("sante.seancesN", seances.length);
  return n ? `${base}, ${tp("sante.dontDetectees", n)}` : base;
}

/**
 * Sous-ligne « Sport » de l'énergie, avec d'où viennent ses kcal (calculées chez nous, kcal-seance.ts), sans « ~ » :
 * « Padel · 86 min · calculé à la FC », « 2 séances · estimé » (une séance au moins sans FC). Aucune séance : « Aucune séance ».
 */
export function sousSport(seances: readonly { nom: string; minutes: number; detectee?: boolean; methode: "fc" | "met" }[]): string {
  if (!seances.length) return t("sante.sansSport");
  const source = t(seances.every((s) => s.methode === "fc") ? "sante.sportFc" : "sante.sportEstime");
  if (seances.length > 1) return `${sousSeances(seances)}, ${source}`;
  const s = seances[0]!;
  return t("sante.seanceDetail", { nom: s.nom, min: s.minutes, source });
}

/** Sous-ligne « Pas » de l'énergie : « 8 890 pas hors sport · 1 activité ignorée ». */
export function sousPas(texte: string, ignorees: number | undefined): string {
  return ignorees ? `${texte}, ${tp("sante.activitesIgnorees", ignorees)}` : texte;
}
