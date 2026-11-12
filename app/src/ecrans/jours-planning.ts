// Page du mois et listes d'un jour : les lignes de chaque jour, calculées une fois par planning. Sans base de données
// (planif-donnees.ts lit la base et réexporte ces fonctions) : testé seul (tests/jours-mois.test.ts).
import { parties } from "../i18n/temps";
import type { LigneJour, Planning } from "./planif-donnees";
import { seancesDesOccurrences, type Marque } from "./planification";

/** Contenu propre d'une séance prévue : sa routine n'est pas dans Mes routines (cachée, ou d'un programme). Comme db/depots/agenda.ts. */
const contenuPropre = (r: { visible: boolean; planId: string | null } | undefined) => !!r && (!r.visible || r.planId != null);

/** Lignes d'un jour : prévues non faites (manquées si passées), puis séances de l'historique ; par heure. */
export const lignesDuJour = (p: Planning, j: string): LigneJour[] => indexDe(p).get(j) ?? [];

/** Résumé d'un jour pour la page du mois : sa marque et le nom de la première séance (faite, ou prévue non manquée). */
export interface ResumeJour {
  m: Marque;
  nom: string;
}

export function resumeJour(p: Planning, j: string): ResumeJour {
  const lignes = lignesDuJour(p, j);
  // Même règle que marqueDuJour : une séance faite l'emporte, puis à venir ou manquée selon le jour.
  const m: Marque = lignes.some((l) => l.genre === "faite") ? "faite" : lignes.length ? (j >= p.aujourdhui ? "prevue" : "manquee") : null;
  const premiere = lignes.find((l) => l.genre === "faite" || !l.manquee);
  return { m, nom: premiere ? sansEmoji(premiere.genre === "faite" ? premiere.seance.titre : premiere.nom) : "" };
}

/** Titre sans ses emojis (titres importés de Hevy, « 🏓 Padel ») : pour l'affichage seulement, le titre stocké ne change pas. */
export const sansEmoji = (s: string) =>
  s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

// Les lignes de tous les jours, calculées une fois par planning (la page du mois en affiche des centaines) : un passage
// sur les séances prévues et faites, au lieu d'un parcours de tout le planning pour chaque jour.
const index = new WeakMap<Planning, Map<string, LigneJour[]>>();

function indexDe(p: Planning): Map<string, LigneJour[]> {
  const deja = index.get(p);
  if (deja) return deja;
  // Une séance prévue déjà faite (même routine, ou séance du même sport sur son créneau) n'a plus de ligne : la séance faite
  // reste seule, avec son effort et sa coche.
  const validees = seancesDesOccurrences(p.occ, p.jours);
  const dates = new Map(p.jours.map((s) => [s.id, s.date]));
  const parJour = new Map<string, { t: string; l: LigneJour }[]>();
  const ajouter = (j: string, x: { t: string; l: LigneJour }) => {
    const l = parJour.get(j);
    if (l) l.push(x);
    else parJour.set(j, [x]);
  };
  for (const occ of p.occ) {
    if (validees.has(occ)) continue;
    const r = p.routines.get(occ.routineId);
    const reglage = p.reglages.get(occ.programmationId);
    const voulue = reglage?.dureeMin != null && reglage.dureeMin > 0 ? reglage.dureeMin * 60 : 0;
    ajouter(occ.date, {
      t: occ.heure,
      l: { genre: "prevue", occ, nom: r?.nom ?? "", dureeS: voulue || (r?.dureeS ?? 0), dureeChoisie: voulue > 0, sansHeure: reglage?.sansHeure ?? false, sport: reglage?.sport ?? null, manquee: occ.date < p.aujourdhui, origine: r?.origine ?? "moi", modifiePar: r?.modifiePar ?? null,
        propre: contenuPropre(r),
      },
    });
  }
  for (const seance of p.seances) {
    if (seance.fin == null || !dates.has(seance.id)) continue;
    const q = parties(seance.debut);
    const t = `${String(q.h).padStart(2, "0")}:${String(q.min).padStart(2, "0")}`;
    const j = dates.get(seance.id);
    if (j) ajouter(j, { t, l: { genre: "faite", seance } });
  }
  const out = new Map<string, LigneJour[]>();
  for (const [j, l] of parJour) out.set(j, l.sort((x, y) => x.t.localeCompare(y.t)).map((x) => x.l));
  index.set(p, out);
  return out;
}
