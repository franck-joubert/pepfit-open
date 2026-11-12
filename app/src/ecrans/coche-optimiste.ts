import type { ExerciceDeSeance, PatchSaisie, SeanceDetail, SerieDetail } from "../db/api";
import type { Executeur } from "../db/executeur";
import { cocherSerie, reposApresDans } from "../db/depots/seances";
import { minuteur } from "../natif/minuteur";
import { garderReposEnCours, rangDeSerie } from "./rang-repos";
import { demarrerRepos, poserRangRepos, rangReposEnCours } from "./repos";
import { avecPatch } from "./saisie-en-cours";

// Coche d'une série en séance (audit M6, docs/PERF-D.md) : la case passe au vert dans la même image, le repos part tout de
// suite ; l'écriture et le recalcul (limité à la séance) suivent, sans relire toute la séance.

/** Coche posée à l'écran, en attente de la base : l'état voulu, l'heure du geste, et la valeur en saisie écrite avec elle. */
export interface Coche {
  faite: boolean;
  le: number;
  saisie?: PatchSaisie | null;
}

/**
 * La séance affichée avec les coches en attente. Les exercices sans coche restent les mêmes objets : seules leurs cartes se
 * redessinent (CarteExercice est mémoïsée).
 */
export function avecCoches(s: SeanceDetail, coches: ReadonlyMap<string, Coche>): SeanceDetail {
  if (!coches.size) return s;
  const faits = new Map<ExerciceDeSeance, ExerciceDeSeance>();
  const cocher = (e: ExerciceDeSeance): ExerciceDeSeance => {
    const deja = faits.get(e);
    if (deja) return deja;
    let change = false;
    const series = e.series.map((x) => {
      const c = coches.get(x.id);
      if (!c) return x;
      const v = avecPatch(x, c.saisie);
      if (v === x && !!x.faite === c.faite) return x;
      change = true;
      return { ...v, faite: c.faite ? 1 : 0, fait_le: c.faite ? (x.fait_le ?? c.le) : null };
    });
    const n = change ? { ...e, series } : e;
    faits.set(e, n);
    return n;
  };
  const exercices = s.exercices.map(cocher);
  if (exercices.every((e, i) => e === s.exercices[i])) return s;
  return {
    ...s,
    exercices,
    blocs: s.blocs.map((b) => {
      const l = b.exercices.map(cocher);
      return l.every((e, i) => e === b.exercices[i]) ? b : { ...b, exercices: l };
    }),
  };
}

/** Les coches que la séance relue de la base ne confirme pas encore (série absente : oubliée). */
export function cochesEnAttente(s: SeanceDetail, coches: ReadonlyMap<string, Coche>): ReadonlyMap<string, Coche> {
  if (!coches.size) return coches;
  const faite = new Map(s.exercices.flatMap((e) => e.series.map((x) => [x.id, !!x.faite] as const)));
  const reste = new Map([...coches].filter(([id, c]) => faite.has(id) && faite.get(id) !== c.faite));
  return reste.size === coches.size ? coches : reste;
}

/** Après l'image qui montre la coche : rien ne passe par la base avant (audit M17, tests/budgets-perf.test.ts). */
export function apresImage(f: () => void): void {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => setTimeout(f, 0));
  else setTimeout(f, 0);
}

/**
 * Le geste de la coche, hors de React (testé sous Node) : la coche est posée (`poser`) et le repos lancé depuis la séance
 * affichée, sans aucune requête ; après l'image suivante, l'écriture de la série (recalcul limité à la séance) puis celle du
 * repos, dans la file des écritures de l'écran (`file` : l'une après l'autre, dans l'ordre des gestes). Échec : la coche est
 * retirée (`retirer`), le repos qu'elle a lancé arrêté, et `erreur` le dit. La promesse rendue ne rejette jamais.
 */
export function cocherOptimiste(o: {
  db: Executeur;
  seance: SeanceDetail;
  serie: Pick<SerieDetail, "id">;
  faite: boolean;
  /** La valeur encore dans la case en saisie (saisie-en-cours.ts) : affichée avec la coche et écrite avec elle. */
  saisie?: PatchSaisie | null;
  poser: (c: Coche) => void;
  retirer: (c: Coche) => void;
  erreur: (e: unknown) => void;
  file: { current: Promise<unknown> };
  apres?: (f: () => void) => void;
}): Promise<void> {
  const { db, serie, faite } = o;
  const coche: Coche = { faite, le: Date.now(), saisie: o.saisie ?? null };
  o.poser(coche);
  const r = faite ? reposApresDans(o.seance, serie.id) : null;
  // Superset coché en arrière (2 puis 1) : le repos de la série la plus avancée continue tel quel (rang-repos.ts).
  const rang = r ? rangDeSerie(o.seance, serie.id) : null;
  const rangAvant = rangReposEnCours();
  const ecrireRepos = r && !garderReposEnCours(rangAvant, rang) ? demarrerRepos(db, r.s, r.suivant ? { suivant: r.suivant.nom } : null, rang) : null;
  const echeance = ecrireRepos ? minuteur.echeance() : null;
  const precedente = o.file.current;
  const ecrire = new Promise<void>((ok, ko) =>
    (o.apres ?? apresImage)(() => {
      precedente
        .then(async () => {
          await cocherSerie(db, serie.id, faite, o.saisie);
          // Le repos en base ne compte pas pour la coche : son échec est journalisé, la coche reste.
          await ecrireRepos?.().catch((e) => console.error(e));
        })
        .then(ok, ko);
    }),
  );
  o.file.current = ecrire.catch(() => undefined);
  return ecrire.catch((e) => {
    o.retirer(coche);
    if (echeance !== null && minuteur.echeance() === echeance) {
      minuteur.passer();
      poserRangRepos(rangAvant);
    }
    o.erreur(e);
  });
}
