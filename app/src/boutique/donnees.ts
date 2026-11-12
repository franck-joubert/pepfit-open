// Boutique : du catalogue embarqué et de la base aux écrans (langue active, profil du parcours, noms d'exercices, charges
// de départ, plans en cours). Les calculs eux-mêmes sont dans calculs.ts (pur, testé).
import { catalogueEmbarque } from "../db/catalogue-assets";
import { cleRoutineBoutique, historiqueSeries, idExercice, listerPlans, seancesDuPlan, type Plan } from "../db/depots/plans";
import { paliersPour, salleParDefaut } from "../db/depots/salles";
import { natureDuCatalogue } from "../db/natures";
import { lireReglage } from "../db/depots/reglages";
import { sportsDepuis } from "../db/sports";
import type { Executeur } from "../db/executeur";
import { ajouterJ, ecartJ } from "../ecrans/planification";
import { instantDe, jourDe } from "../ecrans/planif-donnees";
import { moisDe } from "./passes";
export { moisDe, plansPasses } from "./passes";
import { formater } from "../i18n/temps";
import { bilingue, lireActif, locale, t, tp } from "../i18n/index";
import { heuresMinutes, uniteVolume, type Profil } from "./calculs";
import { PROGRAMMES_EMBARQUES, ROUTINES_EMBARQUEES } from "./catalogue-embarque";
import { exercicesACharge, infoExo, JOURS_HISTORIQUE, poidsDepart, premierEssai, type InfoExo, type SourcePoids } from "./poids";
import { texte as texteDe, type Article, type Bloc, type Langue, type Programme, type RoutineBoutique, type Texte2 } from "./modele";

export const PROGRAMMES: readonly Programme[] = PROGRAMMES_EMBARQUES;
export const programme = (id: string) => PROGRAMMES.find((p) => p.id === id) ?? null;
/** Le rayon « Routines » : à faire une fois, sans programme. */
export const ROUTINES: readonly RoutineBoutique[] = ROUTINES_EMBARQUEES;
/** Les deux rayons ensemble (liste de résultats, recherche, filtres). */
export const ARTICLES: readonly Article[] = [...PROGRAMMES, ...ROUTINES];
export const article = (id: string) => ARTICLES.find((a) => a.id === id) ?? null;

/** Langue des textes du catalogue : il n'existe qu'en français et en anglais (l'anglais pour l'allemand et l'espagnol). */
export const langue = (): Langue => bilingue(lireActif().langue);
/** Texte bilingue du catalogue dans la langue active. */
export const tx = (x: Texte2) => texteDe(x, langue());

const NOMS = new Map(catalogueEmbarque.exercices.map((e) => [e.slug, { fr: e.nom, en: e.nom_en }]));
/** Nom d'un exercice d'un programme ou d'une routine (catalogue, ou exercice propre à l'article). */
export function nomExercice(p: Article, exo: string): string {
  if (exo.startsWith("perso:")) {
    const e = p.exercicesPerso[exo.slice(6)];
    return e ? tx(e.nom) : exo;
  }
  const n = NOMS.get(exo);
  return n ? texteDe({ fr: n.fr, en: n.en || n.fr }, langue()) : exo;
}

/** « 5 × 5 », « 3 × 8-10 », « 2 × 45 s », « 6 × 3 min », « 15 min », « 8 km ». */
export function cibleBloc(b: Bloc): string {
  const fois = b.series > 1 ? `${b.series} × ` : "";
  if (b.repsParSerie) return b.repsParSerie.join(", ");
  if (b.reps) return `${b.series} × ${b.reps}${b.repsMax ? `-${b.repsMax}` : ""}`;
  if (b.distanceM) return `${fois}${b.distanceM >= 1000 ? `${String(b.distanceM / 1000).replace(".", lireActif().langue === "en" ? "." : ",")} km` : `${b.distanceM} m`}`;
  const s = b.dureeS ?? 0;
  const d = s % 60 ? (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60}`) : `${s / 60} min`;
  return `${fois}${d}`;
}

/** Valeur affichée d'un volume (barres de la fiche). */
export function texteVolume(p: Programme, v: number): string {
  const u = uniteVolume(p);
  if (u === "min") return heuresMinutes(v);
  if (u === "m") return `${v.toLocaleString(locale())} m`;
  return tp("boutique.fiche.series", v);
}
export const sousVolume = (p: Programme) =>
  t(p.type === "course" ? "boutique.fiche.volume.course" : (`boutique.fiche.volume.${uniteVolume(p)}` as "boutique.fiche.volume.min"));

/** Réponses du parcours (réglages écrits par le parcours de première utilisation) et sports des 30 derniers jours. */
export async function lireProfil(db: Executeur): Promise<Profil> {
  const liste = (v: string | null): string[] => {
    try {
      const x: unknown = JSON.parse(v ?? "[]");
      return Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : [];
    } catch {
      return [];
    }
  };
  const n = await lireReglage(db, "niveau_sport");
  let historique: string[] = [];
  try {
    historique = [...new Set(await sportsDepuis(db, Date.now() - 30 * 86_400_000))].filter((s) => s !== "autre");
  } catch {
    historique = [];
  }
  return {
    objectifs: liste(await lireReglage(db, "parcours_objectifs")),
    sports: liste(await lireReglage(db, "parcours_sports")),
    niveau: n != null && /^[0-3]$/.test(n) ? Number(n) : null,
    historique,
  };
}

const INFOS: ReadonlyMap<string, InfoExo> = new Map(catalogueEmbarque.exercices.map((e) => [e.slug, infoExo(e)]));
const A_CHARGE = new Set(catalogueEmbarque.exercices.filter((e) => natureDuCatalogue(e) === "poids_reps").map((e) => e.slug));

/** Poids de départ d'un exercice à charge du programme (NOTES-CHARGES § 2) : null sans historique, avec sa source sinon. */
export interface PoidsPropose {
  exo: string;
  nom: string;
  reps: number;
  rir: number;
  kg: number | null;
  source: SourcePoids | null;
  progressionKg: number | null;
}
/**
 * Poids de départ de tous les exercices à charge d'un programme : meilleur 1RM estimé sur 3 mois (l'exercice ou un très
 * proche), converti aux répétitions et à l'effort visés, arrondi au matériel (paliers de l'appareil de ta salle).
 */
export async function poidsDeDepart(db: Executeur, p: Programme, maintenant = Date.now()): Promise<PoidsPropose[]> {
  const historique = await historiqueSeries(db, maintenant - JOURS_HISTORIQUE * 86_400_000);
  const salle = await salleParDefaut(db);
  const out: PoidsPropose[] = [];
  for (const x of exercicesACharge(p, (exo) => A_CHARGE.has(exo))) {
    const m = INFOS.get(x.exo)?.materiel;
    const paliers = m === "machine" || m === "poulie" || m === "smith" ? await paliersPour(db, idExercice(x.exo), salle) : null;
    const d = poidsDepart(x.exo, x, historique, INFOS, maintenant, paliers);
    out.push({ ...x, nom: nomExercice(p, x.exo), kg: d.kg, source: d.source });
  }
  return out;
}

/**
 * Poids de départ écrits dans les routines du plan, par exercice (slug) : ceux de `poidsDeDepart` ; sans historique, rien
 * (la première séance cherche le poids), sauf le 5×5 qui part de la barre à vide et monte d'un pas fixe.
 */
export async function chargesDuPlan(db: Executeur, p: Programme, maintenant = Date.now()): Promise<Record<string, number | null>> {
  const l = await poidsDeDepart(db, p, maintenant);
  return Object.fromEntries(l.map((x) => [x.exo, x.kg ?? (x.progressionKg && INFOS.get(x.exo)?.materiel === "barre" ? premierEssai("barre") : null)]));
}

/** Un plan suivi, avec où il en est (semaine, prochaine séance) ; arrêté (`arreteLe`) ou fini : un programme passé. */
export interface PlanEnCours extends Plan {
  programme: Programme | null;
  /** Semaine en cours ; arrêté : celle de l'arrêt. */
  semaine: number;
  semaines: number;
  prochaine: { date: string; nom: string; routineId: string } | null;
  commence: boolean;
  fini: boolean;
  /** Séances du plan faites. */
  faites: number;
  /** Jour de la dernière séance faite (« Terminé en mars »), null s'il n'y en a pas. */
  derniere: string | null;
}

/** Tous les plans suivis, le plus récent d'abord : en cours, finis et arrêtés (migration 42). */
export async function plansSuivis(db: Executeur, maintenant = Date.now()): Promise<PlanEnCours[]> {
  const auj = jourDe(maintenant);
  const out: PlanEnCours[] = [];
  for (const pl of await listerPlans(db)) {
    const p = programme(pl.catalogueId);
    const seances = await seancesDuPlan(db, pl.id);
    const lues = await db.getAllAsync<{ routine_id: string; debut: number }>(
      "SELECT routine_id, debut FROM seances WHERE fin IS NOT NULL AND routine_id IN (SELECT id FROM routines WHERE plan_id = ?) ORDER BY debut",
      [pl.id],
    );
    const faites = new Set(lues.map((s) => `${s.routine_id}|${jourDe(s.debut)}`));
    const prochaine = pl.arreteLe == null ? (seances.find((s) => s.date >= auj && !faites.has(`${s.routineId}|${s.date}`)) ?? null) : null;
    const semaines = p?.semaines ?? Math.ceil((ecartJ(pl.debut, pl.fin) + 1) / 7);
    const repere = pl.arreteLe != null ? jourDe(pl.arreteLe) : auj;
    out.push({
      ...pl,
      programme: p,
      semaine: Math.min(semaines, Math.max(1, Math.floor(ecartJ(pl.debut, repere) / 7) + 1)),
      semaines,
      prochaine: prochaine ? { date: prochaine.date, nom: prochaine.nom, routineId: prochaine.routineId } : null,
      commence: auj >= pl.debut,
      fini: pl.arreteLe == null && auj > ajouterJ(pl.fin, 0) && !prochaine,
      faites: lues.length,
      derniere: lues.length ? jourDe(lues[lues.length - 1]!.debut) : null,
    });
  }
  return out;
}

/** Les plans en cours (non arrêtés ; un plan fini reste ici jusqu'à son passage dans les passés de la page Programmes). */
export async function plansEnCours(db: Executeur, maintenant = Date.now()): Promise<PlanEnCours[]> {
  return (await plansSuivis(db, maintenant)).filter((p) => p.arreteLe == null);
}



/**
 * « Fait en mars » des articles de la boutique (planche sport-programmes-routines v2, C3 et retour 9, validés le 29/10) : un
 * programme fini (le dernier suivi fini), une routine faite (« Fait 23 fois · dernière le 22 oct. ») ; rien pour un programme
 * seulement arrêté. Clé : identifiant du catalogue.
 */
export async function faitsBoutique(db: Executeur, maintenant = Date.now()): Promise<Map<string, string>> {
  const auj = jourDe(maintenant);
  const m = new Map<string, string>();
  const finis = new Map<string, string>();
  for (const p of await plansSuivis(db, maintenant)) {
    if (!p.fini || !p.derniere) continue;
    const d = finis.get(p.catalogueId);
    if (!d || p.derniere > d) finis.set(p.catalogueId, p.derniere);
  }
  for (const [id, j] of finis) m.set(id, t("boutique.faitEn", { mois: moisDe(j, auj) }));
  for (const r of ROUTINES) {
    const id = await lireReglage(db, cleRoutineBoutique(r.id));
    if (!id) continue;
    const l = await db.getFirstAsync<{ n: number; d: number | null }>("SELECT COUNT(*) AS n, MAX(debut) AS d FROM seances WHERE fin IS NOT NULL AND routine_id = ?", [id]);
    if (!l?.n || l.d == null) continue;
    const j = jourDe(l.d);
    m.set(
      r.id,
      l.n === 1
        ? t("boutique.faitEn", { mois: moisDe(j, auj) })
        : j === auj
          ? t("boutique.faitFoisAuj", { fois: l.n })
          : t("boutique.faitFois", { fois: l.n, date: formater(instantDe(j, "12:00"), { day: "numeric", month: "short" }) }),
    );
  }
  return m;
}
