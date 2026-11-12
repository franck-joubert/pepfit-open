// Lanceur de sports de la page Entraînements (planche A · Grille v2, validée le 27/10) : grille adaptative, opérations du
// mode Modifier, sports par défaut (D4), lieu probable (D3) et feuille ouverte au toucher (D2). Pur (sans React Native) :
// testé par tests/lanceur-sports.test.ts.
import { haversineM } from "../natif/suivi/logique";
import { familleDe } from "./familles-sports";

export const MUSCULATION = "cat:musculation";
/** Au plus 6 sports par défaut (D4). */
export const MAX_DEFAUT = 6;
/** Défaut d'un nouvel utilisateur, avant les sports de son historique (D4). */
export const DEFAUT = [MUSCULATION, "cat:course", "cat:bicycling"];
/** La course a le segmenté Dehors / Tapis (D6 ; et la marche, le vélo, la natation : familles-sports, D2 du 30/10). */
export const COURSE = "cat:course";

/** Vignette d'un sport sans picto à lui : Musculation = développé couché ; CrossFit = swing kettlebell (D5 en attente). */
const PICTO: Record<string, string> = { musculation: "couche", "cross-training": "kettlebell-swing" };
export const pictoSport = (slug: string | null) => (slug ? (PICTO[slug] ?? slug) : null);

/** Feuille « Démarrer une séance » : les 9 premiers sports (3 rangées de 3 ; 6 avant le 02/11, demande d'Alex pour les plus ambitieux), dans l'ordre choisi ; les autres par « Autre sport ». */
export const MAX_FEUILLE = 9;
export const sportsDeLaFeuille = (ids: string[]) => ids.slice(0, MAX_FEUILLE);

/** Hauteur d'une tuile, écart entre tuiles (planche : 112 et 8). */
export const HAUTEUR_TUILE = 112;

/**
 * Largeur de chaque tuile, en sixièmes de la grille : 1 sport pleine largeur ; 2 et 4 en demis ; 5 : trois, puis deux demis ;
 * 3, 6 et plus : tiers (les suivants en dessous, la dernière rangée alignée à gauche).
 */
export function largeurs(n: number): (6 | 3 | 2)[] {
  if (n === 1) return [6];
  if (n === 2 || n === 4) return Array<3>(n).fill(3);
  if (n === 5) return [2, 2, 2, 3, 3];
  return Array<2>(n).fill(2);
}

export type Rect = { x: number; y: number; l: number; h: number };

/** Rectangles des `n` tuiles dans une grille de `largeur` px (`ecart` entre elles). */
export function disposerTuiles(n: number, largeur: number, ecart: number, hauteur = HAUTEUR_TUILE): Rect[] {
  const col = (largeur - 5 * ecart) / 6;
  const out: Rect[] = [];
  let x = 0;
  let y = 0;
  for (const s of largeurs(n)) {
    if (x + s > 6) {
      x = 0;
      y += hauteur + ecart;
    }
    out.push({ x: x * (col + ecart), y, l: s * col + (s - 1) * ecart, h: hauteur });
    x += s;
  }
  return out;
}

export const hauteurTuiles = (n: number, ecart: number, hauteur = HAUTEUR_TUILE) =>
  n === 0 ? 0 : disposerTuiles(n, 600, ecart, hauteur).at(-1)!.y + hauteur;

/** Ce qui vient de la base : sans doublon, seulement les sports connus. */
export function lireSports(lignes: { exercice_id: string }[], connus?: Set<string>): string[] {
  const out: string[] = [];
  for (const l of lignes) if (!out.includes(l.exercice_id) && (!connus || connus.has(l.exercice_id))) out.push(l.exercice_id);
  return out;
}

/** Déplace `id` au rang `vers`. */
export function deplacer(ids: string[], id: string, vers: number): string[] {
  const l = [...ids];
  const a = l.indexOf(id);
  if (a < 0) return l;
  l.splice(a, 1);
  l.splice(Math.max(0, Math.min(l.length, vers)), 0, id);
  return l;
}
export const monter = (ids: string[], id: string) => deplacer(ids, id, ids.indexOf(id) - 1);
export const descendre = (ids: string[], id: string) => deplacer(ids, id, ids.indexOf(id) + 1);
export const ajouter = (ids: string[], id: string) => (ids.includes(id) ? [...ids] : [...ids, id]);
export const retirer = (ids: string[], id: string) => ids.filter((x) => x !== id);

/**
 * Rang visé par la tuile tenue : celui où sa place (grille recomposée) tombe le plus près de son centre (`cx`, `cy`).
 * Toutes les tuiles se recomposent pareil quel que soit l'ordre : seule la place compte.
 */
export function rangVise(ids: string[], id: string, cx: number, cy: number, largeur: number, ecart: number): number {
  const places = disposerTuiles(ids.length, largeur, ecart);
  const a = ids.indexOf(id);
  let meilleur = a;
  let dmin = Infinity;
  places.forEach((p, r) => {
    const d = Math.hypot(p.x + p.l / 2 - cx, p.y + p.h / 2 - cy);
    if (d < dmin - 0.5 || (Math.abs(d - dmin) <= 0.5 && r === a)) {
      dmin = d;
      meilleur = r;
    }
  });
  return meilleur;
}

/** Sports par défaut (D4) : Musculation, Course à pied, Vélo, puis ceux de l'historique (le plus récent d'abord), jusqu'à 6. */
export function sportsParDefaut(connus: Set<string>, historique: string[]): string[] {
  const out: string[] = [];
  for (const id of [...DEFAUT, ...historique]) if (connus.has(id) && !out.includes(id) && out.length < MAX_DEFAUT) out.push(id);
  return out;
}

/**
 * Ce que la feuille propose, selon la famille du sport (planche familles-sports, D3 du 30/10) : Force, routines et séance
 * libre ; les quatre autres familles, le départ du suivi (dehors au GPS, les autres sans GPS : intérieur, sports et cours,
 * récupération). La séance au chrono ne reste que sans module de suivi (commencer.ts).
 */
export type GenreSport = "muscu" | "suivi";
export const genreSport = (id: string): GenreSport => (id === MUSCULATION || familleDe(id) === "force" ? "muscu" : "suivi");

/**
 * « Démarrer une séance » → un sport (retours du 28/10, b) : plus de feuille du sport, on y va tout droit. Force : une séance
 * vide ; les autres : le départ du suivi (le lieu, Dehors / Tapis, s'y choisit). Le HIIT, de type « cross » pour ses
 * programmes, est un sport et cours (D1 du 30/10) : seule la famille compte.
 */
export function lancementDirect(id: string, _type?: string | null): GenreSport {
  return genreSport(id);
}

/**
 * Lieu probable (D3) : Musculation, la salle par défaut ; sinon le dernier lieu où ce sport a été fait, puis le premier
 * lieu qui l'a dans ses activités habituelles (lieu_activite, quand elle existe).
 */
export function lieuProbable(id: string, l: { dernier: string | null; habituel: string | null; defaut: string | null }): string | null {
  if (id === MUSCULATION) return l.defaut ?? l.dernier;
  return l.dernier ?? l.habituel;
}

/** Rayon du lieu « où je suis » : la précision du GPS en salle et le point OSM au milieu du bâtiment (≈ 100 m chacun). */
export const RAYON_ICI_M = 300;

/** Lieu enregistré avec sa position : `sportLe`, dernière séance de ce sport à ce lieu ; `vuLe`, dernière séance tout court. */
export type LieuSitue = { id: string; lat: number; lon: number; perso: boolean; sportLe: number | null; vuLe: number | null };

/**
 * Lieu où je suis (retour du 29/10), parmi ceux à moins de 300 m : mes lieux créés d'abord, puis les lieux
 * « Autour de moi » déjà visités (gardés dans Mes lieux) ; dans chaque groupe, le dernier utilisé pour ce sport, puis le
 * dernier utilisé, puis le plus proche. Aucun : null (la règle sans GPS, lieuProbable, s'applique).
 */
export function lieuIci(lieux: readonly LieuSitue[], ici: { lat: number; lon: number }): string | null {
  const proches = lieux
    .filter((l) => l.perso || l.vuLe != null)
    .map((l) => ({ l, d: haversineM(ici, l) }))
    .filter((x) => x.d <= RAYON_ICI_M);
  const recent = (a: number | null, b: number | null) => (b ?? -1) - (a ?? -1);
  proches.sort((a, b) => Number(b.l.perso) - Number(a.l.perso) || recent(a.l.sportLe, b.l.sportLe) || recent(a.l.vuLe, b.l.vuLe) || a.d - b.d);
  return proches[0]?.l.id ?? null;
}

/** Routines de la feuille Musculation : celle prévue aujourd'hui, puis par prochaine date, puis les autres ; au plus `n`. */
export function routinesFeuille<R extends { id: string }>(routines: R[], prochaines: Map<string, { date: string }>, n = 3): R[] {
  const date = (r: R) => prochaines.get(r.id)?.date ?? "9999";
  return [...routines]
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (date(a.r) < date(b.r) ? -1 : date(a.r) > date(b.r) ? 1 : a.i - b.i))
    .slice(0, n)
    .map((x) => x.r);
}

type Tuile = { id: string };

/** La grille adaptative, au format du glisser-déposer commun (ui/GlisserAccueil, option `disposition`). */
export const DISPOSITION_SPORTS = {
  disposer: (blocs: Tuile[], _h: unknown, largeur: number, ecart: number) => {
    const r = disposerTuiles(blocs.length, largeur, ecart);
    return new Map(blocs.map((b, i) => [b.id, r[i]!]));
  },
  deplacer: (blocs: Tuile[], id: string, vers: number) => deplacer(blocs.map((b) => b.id), id, vers).map((x) => blocs.find((b) => b.id === x)!),
  rangVise: (blocs: Tuile[], id: string, cx: number, cy: number, _h: unknown, largeur: number, ecart: number) =>
    rangVise(blocs.map((b) => b.id), id, cx, cy, largeur, ecart),
};
