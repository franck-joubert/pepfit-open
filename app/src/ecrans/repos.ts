// Repos persistant : l'échéance est écrite en base pour reprendre le décompte si Android tue l'appli.
// La notification de fin (alarme exacte) est déjà programmée côté système, elle sonne quoi qu'il arrive.
// Chaque repos de la séance garde aussi sa fin réelle (seance_repos) : elle borne la fenêtre d'effort de la série suivante
// (FC de la muscu, planches/suivi-gps § 6).
import type { Executeur } from "../db/executeur";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import { finirRepos, noterRepos } from "../db/depots/fc-muscu";
import { minuteur } from "../natif/minuteur";
import type { RangRepos } from "./rang-repos";

/** Repos court entre deux exercices d'un superset : « Machine suivante · Leg curl » sous le décompte, ±5 s au lieu de ±15. */
export interface Transition {
  suivant: string;
}

let transition: Transition | null = null;
const abonnes = new Set<(t: Transition | null) => void>();

function poserTransition(t: Transition | null) {
  transition = t;
  for (const f of abonnes) f(t);
}

export const transitionEnCours = () => transition;

/** Écoute la transition du repos en cours (null : repos ordinaire) ; renvoie de quoi se désabonner. */
export function ecouterTransition(f: (t: Transition | null) => void): () => void {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

/** Rang du dernier repos lancé par un cochage de superset (null : repos ordinaire ou manuel) ; en mémoire, comme la transition. */
let rang: RangRepos | null = null;

export const rangReposEnCours = () => rang;

/** Remet un rang (annulation d'une coche dont l'écriture a échoué, tests) ; null l'oublie. */
export function poserRangRepos(r: RangRepos | null) {
  rang = r;
}

async function memoriser(db: Executeur) {
  await ecrireReglage(db, "repos_fin", String(minuteur.echeance()));
  await ecrireReglage(db, "repos_total", String(minuteur.etat().totalS));
  await ecrireReglage(db, "repos_suivant", transition?.suivant ?? "");
}

/**
 * Lance le décompte tout de suite, sans lire ni écrire la base (coche d'une série : il part dans la même image, audit M6) ;
 * renvoie l'écriture en base (échéance, repos de la séance), à faire ensuite. Null si rien n'est lancé.
 */
export function demarrerRepos(db: Executeur, dureeS: number, t: Transition | null = null, r: RangRepos | null = null): (() => Promise<void>) | null {
  if (dureeS <= 0) return null;
  rang = r;
  poserTransition(t);
  minuteur.demarrer(dureeS);
  const debut = Date.now();
  const fin = minuteur.echeance();
  return async () => {
    await memoriser(db);
    await noterRepos(db, debut, fin);
  };
}

export async function lancerRepos(db: Executeur, dureeS: number, t: Transition | null = null) {
  await demarrerRepos(db, dureeS, t)?.();
}

export async function ajusterRepos(db: Executeur, deltaS: number) {
  minuteur.ajuster(deltaS);
  await memoriser(db);
  const maintenant = Date.now();
  await finirRepos(db, minuteur.echeance() || maintenant, maintenant);
}

export async function passerRepos(db: Executeur) {
  minuteur.passer();
  await memoriser(db);
  const maintenant = Date.now();
  await finirRepos(db, maintenant, maintenant);
}

export async function reprendreRepos(db: Executeur) {
  const fin = Number((await lireReglage(db, "repos_fin")) ?? 0);
  const total = Number((await lireReglage(db, "repos_total")) ?? 0);
  if (fin > Date.now() && !minuteur.etat().actif) {
    const suivant = await lireReglage(db, "repos_suivant");
    poserTransition(suivant ? { suivant } : null);
    minuteur.reprendre(fin, total);
  }
}
