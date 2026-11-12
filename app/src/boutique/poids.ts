// Poids de départ et effort des programmes (NOTES-CHARGES.md) : calculs purs, testés par tests/poids-depart.test.ts.
// Le 1RM estimé (Epley) d'après l'historique de 3 mois, converti au nombre de répétitions et à l'effort visés (réserve, RIR),
// arrondi au matériel ; puis, séance après séance, le poids suivant (double progression ajustée par l'effort noté).
import { equipementDuCatalogue } from "../db/natures";
import { palierVoisin } from "../db/paliers";
import { ALIAS_3D } from "../ui/3d/alias";
import type { Bloc, Langue, LangueAppli, Programme, Seance } from "./modele";

/** Réserve visée quand un bloc n'en dit rien : 2 répétitions « en réserve » (Helms 2016, Refalo 2023). */
export const RIR_DEFAUT = 2;
/** Fenêtre de l'historique : 3 mois. */
export const JOURS_HISTORIQUE = 92;
/** Au-delà, l'estimation du 1RM devient trop imprécise (LeSuer 1997, Reynolds 2006) : la série n'est pas retenue. */
export const REPS_MAX_ESTIMATION = 15;
/** Un exercice très proche (même geste, même matériel, même muscle) : 90 % de son poids, pour garder de la marge. */
export const FACTEUR_PROCHE = 0.9;

/** Matériel d'un exercice à charge (équipement de db/natures, ramené à ce qui fixe le pas du poids). */
export type Materiel = "barre" | "halteres" | "kettlebell" | "machine" | "poulie" | "smith" | "autre";

/** RPE (échelle 1-10 fondée sur la réserve, Zourdos 2016) → réserve : RPE 8 = 2 répétitions en réserve. */
export const rirDeRpe = (rpe: number | null | undefined): number | null => (rpe == null || rpe < 1 || rpe > 10 ? null : Math.max(0, 10 - rpe));
/** Réserve → RPE, pour l'écrire dans la colonne `series.rpe` (celle de l'import Hevy). */
export const rpeDeRir = (rir: number): number => Math.max(1, Math.min(10, 10 - rir));

/**
 * 1RM estimé (Epley 1985) d'une série de `reps` répétitions, `rir` en réserve : les répétitions « jusqu'à l'échec » sont
 * reps + rir. Une seule répétition à l'échec : le poids lui-même. null si la série ne se prête pas à l'estimation.
 */
export function unRM(kg: number, reps: number, rir = 0): number | null {
  if (!(kg > 0) || !(reps >= 1) || reps > REPS_MAX_ESTIMATION || rir < 0) return null;
  const n = reps + rir;
  return n <= 1 ? kg : kg * (1 + n / 30);
}

/** Poids pour `reps` répétitions avec `rir` en réserve, d'après un 1RM (Epley inversé). */
export function poidsPour(rm: number, reps: number, rir: number): number {
  const n = reps + rir;
  return n <= 1 ? rm : rm / (1 + n / 30);
}

/** Pas du poids : 2,5 kg à la barre (1,25 de chaque côté), 2 kg aux haltères, 4 kg au kettlebell, 2,5 kg ailleurs sans paliers. */
export function pasDuMateriel(m: Materiel): number {
  return m === "halteres" ? 2 : m === "kettlebell" ? 4 : 2.5;
}
/** Le plus petit poids possible : la barre à vide (20 kg), sinon un pas. */
const minimum = (m: Materiel) => (m === "barre" ? 20 : pasDuMateriel(m));

/**
 * Arrondi au matériel, vers le bas (on part avec de la marge) : au palier de l'appareil s'il est connu, sinon au pas du
 * matériel, jamais sous le plus petit poids possible (barre à vide, premier palier).
 */
export function arrondirMateriel(kg: number, m: Materiel, paliers?: readonly number[] | null): number {
  if (paliers && paliers.length) {
    const sous = paliers.filter((p) => p <= kg + 1e-6);
    return sous.length ? sous[sous.length - 1]! : paliers[0]!;
  }
  const pas = pasDuMateriel(m);
  return Math.max(minimum(m), Math.round(Math.floor(kg / pas + 1e-6) * pas * 100) / 100);
}

/** Un cran de plus (+1) ou de moins (−1) : palier voisin de l'appareil, sinon un pas du matériel. */
export function cran(kg: number, m: Materiel, sens: 1 | -1, paliers?: readonly number[] | null): number {
  if (paliers && paliers.length) return palierVoisin(paliers, kg, sens) ?? kg;
  return Math.max(minimum(m), Math.round((kg + sens * pasDuMateriel(m)) * 100) / 100);
}

// ---------------------------------------------------------------- poids de départ

/** Une série de travail faite (hors échauffement), avec l'effort noté s'il l'a été (RPE). */
export interface SerieHisto {
  /** Slug de l'exercice. */
  exo: string;
  kg: number;
  reps: number;
  rpe: number | null;
  /** Début de la séance (ms). */
  date: number;
}

/** Ce qu'on sait d'un exercice du catalogue pour lui trouver des voisins. */
export interface InfoExo {
  /** Clé du geste (clip 3D ou picto), null si l'exercice n'a qu'un picto neutre. */
  geste: string | null;
  materiel: Materiel;
  muscle: string | null;
}

/** D'où vient un poids : la série retenue (son exercice, sa date, son poids et ses répétitions), et si c'est un exercice proche. */
export interface SourcePoids {
  exo: string;
  date: number;
  kg: number;
  reps: number;
  rpe: number | null;
  proche: boolean;
}

export interface PoidsDepart {
  /** null : pas d'historique, pas de poids inventé (l'écran donne la consigne de réserve). */
  kg: number | null;
  source: SourcePoids | null;
}

const MATERIELS: readonly Materiel[] = ["barre", "halteres", "kettlebell", "machine", "poulie", "smith"];

/**
 * Infos d'une entrée du catalogue : le geste est la clé de son picto (« couche » pour le développé couché et ses variantes
 * aux élastiques ou aux chaînes), ou de son clip par ALIAS_3D quand le picto est neutre.
 */
export function infoExo(e: { slug: string; picto: string; materiel: string | null; categorie: string | null; muscle: string | null }): InfoExo {
  const picto = /([^/]+)-512\.webp$/.exec(e.picto)?.[1] ?? null;
  const eq = equipementDuCatalogue(e);
  return {
    geste: picto && picto !== "neutre" ? picto : (ALIAS_3D[e.slug] ?? null),
    materiel: materielDe(eq),
    muscle: e.muscle,
  };
}

/** Matériel d'un exercice de la base (colonne `equipement`) : celui qui fixe le pas du poids. */
export const materielDe = (equipement: string | null | undefined): Materiel =>
  (MATERIELS as readonly string[]).includes(equipement ?? "") ? (equipement as Materiel) : "autre";

/** Deux exercices très proches : même geste (clip), même matériel, même muscle principal. */
export function sontProches(a: InfoExo | undefined, b: InfoExo | undefined): boolean {
  return !!a && !!b && a.geste != null && a.geste === b.geste && a.materiel === b.materiel && a.muscle === b.muscle;
}

/**
 * Poids de départ d'un exercice : le meilleur 1RM estimé de ses séries des 3 derniers mois (à défaut, de celles d'un
 * exercice très proche, × 0,9), converti à `reps` répétitions et `rir` en réserve, arrondi au matériel. La réserve notée
 * (RPE) compte ; sans elle, la série est prise comme menée à l'échec : l'estimation est basse, le départ prudent.
 */
export function poidsDepart(
  exo: string,
  cible: { reps: number; rir: number },
  historique: readonly SerieHisto[],
  infos: ReadonlyMap<string, InfoExo>,
  maintenant: number,
  paliers?: readonly number[] | null,
): PoidsDepart {
  const depuis = maintenant - JOURS_HISTORIQUE * 86_400_000;
  const info = infos.get(exo);
  const meilleure = (garder: (s: SerieHisto) => boolean) => {
    let best: { rm: number; s: SerieHisto } | null = null;
    for (const s of historique) {
      if (s.date < depuis || s.date > maintenant || !garder(s)) continue;
      const rm = unRM(s.kg, s.reps, rirDeRpe(s.rpe) ?? 0);
      if (rm != null && (!best || rm > best.rm || (rm === best.rm && s.date > best.s.date))) best = { rm, s };
    }
    return best;
  };
  let best = meilleure((s) => s.exo === exo);
  let proche = false;
  if (!best) {
    best = meilleure((s) => s.exo !== exo && sontProches(info, infos.get(s.exo)));
    proche = best != null;
  }
  if (!best) return { kg: null, source: null };
  const brut = poidsPour(best.rm * (proche ? FACTEUR_PROCHE : 1), cible.reps, cible.rir);
  const s = best.s;
  return { kg: arrondirMateriel(brut, info?.materiel ?? "autre", paliers), source: { exo: s.exo, date: s.date, kg: s.kg, reps: s.reps, rpe: s.rpe, proche } };
}

/** Répétitions visées d'un bloc pour le poids : le bas de la plage, la première série d'une pyramide ; null sans répétitions. */
export const repsCible = (b: Bloc): number | null => b.reps ?? b.repsParSerie?.[0] ?? null;
/** Réserve visée d'un bloc. */
export const rirCible = (b: Bloc): number => b.rir ?? RIR_DEFAUT;

/** Un exercice à charge du programme, avec la cible de sa première apparition (celle qui fixe le poids de départ). */
export interface ExerciceACharge {
  exo: string;
  reps: number;
  rir: number;
  /** Le 5×5 : son poids monte d'un pas fixe à chaque séance. */
  progressionKg: number | null;
}

/** Les exercices à charge d'un programme (`aCharge` : nature « poids et répétitions »), dans l'ordre de première apparition. */
export function exercicesACharge(p: Programme, aCharge: (exo: string) => boolean): ExerciceACharge[] {
  const out: ExerciceACharge[] = [];
  for (const w of p.calendrier) for (const c of w.seances) for (const b of p.seances[c]!.blocs) {
    const reps = repsCible(b);
    if (reps == null || !aCharge(b.exo) || out.some((x) => x.exo === b.exo)) continue;
    out.push({ exo: b.exo, reps, rir: rirCible(b), progressionKg: b.progressionKg ?? null });
  }
  return out;
}

// ---------------------------------------------------------------- poids suivant

/** Une série de la dernière séance de l'exercice : poids, répétitions, réserve notée (colonne Effort) ou null. */
export interface SerieFaite {
  kg: number;
  reps: number;
  rir: number | null;
}

export interface PoidsSuivant {
  kg: number;
  /** Poids de travail de la dernière fois. */
  avant: number;
  /** +1 : on monte d'un cran ; 0 : même poids (vise plus de répétitions) ; −1 : on redescend. */
  sens: 1 | 0 | -1;
  raison: "haut" | "facile" | "dur" | "rate" | "garde";
}

/**
 * Poids de la prochaine séance (double progression, ajustée par l'effort noté) :
 * - la moitié des séries ou plus sous le bas de la plage : un cran de moins (« raté ») ;
 * - toutes les séries au haut de la plage : un cran de plus, sauf si la réserve notée est passée sous la cible − 1 (« dur ») ;
 * - réserve notée ≥ cible + 2 à toutes les séries : un cran de plus même sous le haut de la plage (« facile ») ;
 * - sinon le même poids : on gagne des répétitions.
 * Les séries prises en compte sont celles au poids de travail (le plus lourd de la séance).
 */
export function poidsSuivant(
  derniere: readonly SerieFaite[],
  cible: { reps: number; repsMax?: number | null; rir?: number | null },
  m: Materiel,
  paliers?: readonly number[] | null,
): PoidsSuivant | null {
  const valides = derniere.filter((s) => s.kg > 0 && s.reps >= 0);
  if (!valides.length) return null;
  const kg = Math.max(...valides.map((s) => s.kg));
  const travail = valides.filter((s) => s.kg === kg);
  const haut = cible.repsMax ?? cible.reps;
  const rir = cible.rir ?? RIR_DEFAUT;
  const notes = travail.map((s) => s.rir).filter((x): x is number => x != null);
  const ratees = travail.filter((s) => s.reps < cible.reps).length;
  if (ratees * 2 >= travail.length) return { kg: cran(kg, m, -1, paliers), avant: kg, sens: -1, raison: "rate" };
  if (travail.every((s) => s.reps >= haut)) {
    if (notes.length && Math.min(...notes) < rir - 1) return { kg, avant: kg, sens: 0, raison: "dur" };
    return { kg: cran(kg, m, 1, paliers), avant: kg, sens: 1, raison: "haut" };
  }
  if (notes.length === travail.length && Math.min(...notes) >= rir + 2) return { kg: cran(kg, m, 1, paliers), avant: kg, sens: 1, raison: "facile" };
  return { kg, avant: kg, sens: 0, raison: "garde" };
}

// ---------------------------------------------------------------- première séance sans historique : trouver son poids

/** Une montée ne grimpe pas de plus de 25 % d'une série à l'autre : on monte progressivement (NOTES-CHARGES § 4 bis). */
export const MONTEE_MAX = 1.25;

/** Premier essai sans historique : la barre à vide ; ailleurs, pas de chiffre (« un poids léger »). */
export const premierEssai = (m: Materiel): number | null => (m === "barre" ? 20 : null);

/** Une série d'essai : poids, répétitions faites, réserve dite (null : pas répondu) ; `auMoins` : « 3 ou plus ». */
export interface Essai {
  kg: number;
  reps: number;
  rir: number | null;
  auMoins?: boolean;
}

export interface EssaiSuivant {
  kg: number;
  /** « monte » : encore trop facile ; « trouve » : c'est ton poids, garde-le ; « baisse » : trop lourd. */
  etat: "monte" | "trouve" | "baisse";
}

/**
 * Première séance d'un exercice sans historique : on part léger et on monte à chaque série jusqu'à faire `reps` répétitions
 * en pouvant encore en faire `rir`. Après chaque essai, le poids de la série suivante : le poids visé estimé (Epley, avec la
 * réserve dite), sans dépasser + 25 % ni monter de moins d'un cran ; trouvé quand le poids visé est à moins d'un cran.
 * Réserve « 3 ou plus » : c'est un minimum, on monte. Pas de réponse : on prend la réserve visée.
 */
export function essaiSuivant(e: Essai, cible: { reps: number; rir: number }, m: Materiel, paliers?: readonly number[] | null): EssaiSuivant {
  const rm = unRM(e.kg, Math.min(e.reps, REPS_MAX_ESTIMATION), e.rir ?? cible.rir) ?? e.kg;
  const brut = poidsPour(rm, cible.reps, cible.rir);
  const bas = cran(e.kg, m, -1, paliers);
  const haut = cran(e.kg, m, 1, paliers);
  if (e.reps < cible.reps || (!e.auMoins && brut < bas - 1e-6)) {
    return { kg: Math.min(arrondirMateriel(brut, m, paliers), bas), etat: "baisse" };
  }
  if (!e.auMoins && brut < haut - 1e-6) return { kg: e.kg, etat: "trouve" };
  // « 3 ou plus » : la réserve est un minimum, le poids visé une borne basse : on monte du pas de la montée.
  const plafond = arrondirMateriel(e.kg * MONTEE_MAX, m, paliers);
  return { kg: Math.max(haut, e.auMoins ? plafond : Math.min(arrondirMateriel(brut, m, paliers), plafond)), etat: "monte" };
}

// ---------------------------------------------------------------- consignes (notes de routine)

const T = (fr: string, en: string, de: string, es: string): Record<LangueAppli, string> => ({ fr, en, de, es });
// La consigne d'effort d'une séance vit dans demarrage.ts (partagé avec le serveur MCP) ; reprise ici pour ses appelants.
export { noteEffort } from "./demarrage";

/** Pourquoi commencer léger (note de séance, une fois, s'il y a un exercice à découvrir). */
export const POURQUOI_LEGER = T(
  "Pas encore de poids pour certains exercices : commence léger et monte à chaque série. Trop léger ne coûte rien, tu trouves ton poids en 2 ou 3 séries ; trop lourd, la technique lâche, et c'est là qu'on se blesse.",
  "No weight yet for some exercises: start light and go up each set. Too light costs nothing, you'll find your weight in 2 or 3 sets; too heavy, your form breaks down, and that's how injuries happen.",
  "Für einige Übungen gibt es noch kein Gewicht: Starte leicht und steigere dich mit jedem Satz. Zu leicht kostet nichts, du findest dein Gewicht in 2 oder 3 Sätzen; zu schwer, und die Technik bricht ein – genau dann passieren Verletzungen.",
  "Aún no hay peso para algunos ejercicios: empieza ligero y sube en cada serie. Ir demasiado ligero no cuesta nada, encontrarás tu peso en 2 o 3 series; demasiado pesado, la técnica se rompe, y ahí es cuando llegan las lesiones.",
);

/** Note d'un exercice sans historique, à sa première séance : partir léger, monter jusqu'à la cible. */
export function noteDecouverte(reps: number, rir: number, m: Materiel, langue: LangueAppli): string {
  const depart = premierEssai(m);
  return T(
    `Première fois : commence ${depart ? `à la barre à vide (${depart} kg)` : "léger"}, puis monte à chaque série jusqu'à faire ${reps} répétitions en pouvant encore en faire ${rir}.`,
    `First time: start ${depart ? `with the empty bar (${depart} kg)` : "light"}, then go up each set until you do ${reps} reps and could still do ${rir} more.`,
    `Erstes Mal: Starte ${depart ? `mit der leeren Stange (${depart} kg)` : "leicht"} und steigere dich mit jedem Satz, bis du ${reps} Wiederholungen schaffst und noch ${rir} mehr könntest.`,
    `Primera vez: empieza ${depart ? `con la barra vacía (${depart} kg)` : "ligero"} y sube en cada serie hasta hacer ${reps} repeticiones pudiendo hacer aún ${rir} más.`,
  )[langue];
}

// ---------------------------------------------------------------- effort dit en mots (variante B, validée le 29/10)

/** Les quatre mots de la question « C'était comment ? », du plus dur au plus facile. */
export type MotEffort = "max" | "dur" | "bien" | "facile";
export const MOTS_EFFORT: readonly MotEffort[] = ["max", "dur", "bien", "facile"];

/** Mot → réserve : Max = plus rien (0), Dur = encore 1, Bien = encore 2, Facile = 3 ou plus (un minimum). */
export function rirDeMot(m: MotEffort): { rir: number; auMoins: boolean } {
  return { rir: MOTS_EFFORT.indexOf(m), auMoins: m === "facile" };
}

/** Réserve enregistrée (`series.rpe` relu) → mot affiché sous les répétitions ; 3 et plus : « facile ». */
export function motDeRir(rir: number | null): MotEffort | null {
  if (rir == null || rir < 0) return null;
  return MOTS_EFFORT[Math.min(3, Math.round(rir))]!;
}
