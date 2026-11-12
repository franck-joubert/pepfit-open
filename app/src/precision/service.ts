// La précision pepfit pour les écrans : lue une fois (lire.ts), gardée deux minutes en mémoire (le volet s'ouvre souvent),
// relue après une saisie ; la mémoire du téléphone (cap atteint, lectures ouvertes, dernier cap montré, dernier score) est
// écrite par la façade de la base (le `db` de l'appli passe par db/exclusif.ts). Rien ne part au serveur.
import type { Executeur } from "../db/executeur";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import { lireDonneesPrecision, type FaitsPrecision } from "./lire";
import { CLE_MEMOIRE, lireMemoire, type MemoirePrecision } from "./memoire";
import { calculer, type DonneesPrecision, type PartiePrecision, type Resultat } from "./modele";

export interface EtatPrecision {
  d: DonneesPrecision;
  faits: FaitsPrecision;
  r: Resultat;
  /** Mémoire telle qu'elle était avant cette lecture (null : jamais calculée sur ce téléphone). */
  avant: MemoirePrecision | null;
  memoire: MemoirePrecision;
  /** Recette (labo/precision-demo.ts) : un compte inventé, rien n'est écrit. */
  demo?: boolean;
}

let demo: EtatPrecision | null = null;
/** Recette : montre un compte inventé partout (carte, page, minis) jusqu'à `null` ; rien n'est écrit. */
export function definirDemo(e: EtatPrecision | null): void {
  demo = e;
  cache = null;
  // appelée pendant un rendu (lien de recette) : les écrans ouverts se relisent juste après
  setTimeout(() => {
    for (const f of ecouteurs) f();
  }, 0);
}

const VALIDITE_MS = 2 * 60_000;
let cache: { cle: string; t: number; v: Promise<EtatPrecision> } | null = null;
const ecouteurs = new Set<() => void>();

/** Une saisie (pesée, tour, profil, montre…) : la précision se relit à la prochaine demande, et les écrans ouverts se relisent. */
export function invaliderPrecision(): void {
  cache = null;
  for (const f of ecouteurs) f();
}
export function abonnerPrecision(f: () => void): () => void {
  ecouteurs.add(f);
  return () => {
    ecouteurs.delete(f);
  };
}

export function lirePrecision(db: Executeur, parties: Partial<Record<PartiePrecision, boolean>>, maintenant = Date.now()): Promise<EtatPrecision> {
  if (demo) return Promise.resolve(demo);
  const cle = JSON.stringify(parties);
  if (cache && cache.cle === cle && maintenant - cache.t < VALIDITE_MS) return cache.v;
  const v = calculerEtGarder(db, parties, maintenant);
  cache = { cle, t: maintenant, v };
  v.catch(() => {
    if (cache?.v === v) cache = null;
  });
  return v;
}

async function calculerEtGarder(db: Executeur, parties: Partial<Record<PartiePrecision, boolean>>, maintenant: number): Promise<EtatPrecision> {
  const [{ d, faits }, avant] = await Promise.all([lireDonneesPrecision(db, parties, maintenant), lireReglage(db, CLE_MEMOIRE).then(lireMemoire)]);
  const r = calculer(d, avant ?? undefined);
  // première fois sur ce téléphone : le cap d'aujourd'hui est déjà « vu » (pas d'animation pour ce qu'on avait déjà)
  const ouvertes = r.lectures.filter((l) => l.ouverte).map((l) => l.id);
  const memoire: MemoirePrecision = {
    cap: r.cap.n,
    vu: avant ? avant.vu : r.cap.n,
    lectures: ouvertes,
    score: r.score,
    affiche: avant ? avant.affiche : r.score,
    lecturesVues: avant ? avant.lecturesVues : ouvertes,
  };
  if (!avant || JSON.stringify(avant) !== JSON.stringify(memoire)) await ecrire(db, memoire);
  return { d, faits, r, avant, memoire };
}

async function ecrire(db: Executeur, m: MemoirePrecision): Promise<void> {
  await ecrireReglage(db, CLE_MEMOIRE, JSON.stringify(m));
}

/** La carte ou la page a montré le score (et le passage du cap atteint, une seule animation par cap) : le prochain passage
 * partira de là. */
export async function marquerVu(db: Executeur, e: EtatPrecision): Promise<void> {
  if (e.demo) return;
  const m: MemoirePrecision = {
    ...e.memoire,
    vu: Math.max(e.memoire.vu, e.r.cap.n),
    affiche: e.r.score,
    lecturesVues: e.r.lectures.filter((l) => l.ouverte).map((l) => l.id),
  };
  if (JSON.stringify(m) === JSON.stringify(e.memoire)) return;
  e.memoire = m;
  await ecrire(db, m);
}

/**
 * Après une saisie : la précision relue, et le gain depuis le dernier score calculé (« +4 % de précision », bandeau
 * habituel) ; null sans gain. Le score d'après devient la référence (calculerEtGarder l'écrit).
 */
export async function gainApresSaisie(db: Executeur, parties: Partial<Record<PartiePrecision, boolean>>): Promise<{ gain: number; etat: EtatPrecision } | null> {
  invaliderPrecision();
  const e = await lirePrecision(db, parties);
  if (e.demo) return null;
  const avant = e.avant?.score ?? null;
  return avant != null && e.r.score > avant ? { gain: e.r.score - avant, etat: e } : null;
}

// ---- Après une saisie : le bandeau habituel « +4 % de précision · Voir » ----------------------------------------------

const saisies = new Set<() => void>();
/** Une saisie vient d'être enregistrée (pesée, tour, %gras, profil) : la précision se relit, le bandeau dit le gain. */
export function signalerSaisie(): void {
  invaliderPrecision();
  for (const f of saisies) f();
}
export function abonnerSaisies(f: () => void): () => void {
  saisies.add(f);
  return () => {
    saisies.delete(f);
  };
}
