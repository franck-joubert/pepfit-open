// Exercices perso reliés au catalogue, tenus en mémoire pour la résolution du picto et de la 3D (ui/resolution.ts) : nom
// normalisé (français et anglais) de l'exercice perso → slug de l'exercice du catalogue. Rempli depuis la base au lancement,
// après une synchro qui touche aux exercices, et à chaque lien posé ou défait (depots/liens-catalogue.ts). Les écrans qui
// montrent un picto s'abonnent (ui/useLiens.ts) : le lien vaut partout, sans que chaque écran le sache.
import type { Executeur } from "./executeur";

const liens: Record<string, string> = {};
const abonnes = new Set<() => void>();
let version = 0;

/** La table vivante (nom normalisé → slug) : lue à chaque résolution, jamais copiée. */
export const LIENS_CATALOGUE: Readonly<Record<string, string>> = liens;

/** Remplace tous les liens ; n'avertit les écrans que si la table a changé. */
export function definirLiens(table: Readonly<Record<string, string>>): void {
  const avant = Object.keys(liens);
  const pareil = avant.length === Object.keys(table).length && avant.every((k) => liens[k] === table[k]);
  if (pareil) return;
  for (const k of avant) delete liens[k];
  Object.assign(liens, table);
  version++;
  abonnes.forEach((f) => f());
}

export function versionLiens(): number {
  return version;
}

export function abonnerLiens(f: () => void): () => void {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
}

/** Recharge en mémoire les liens (nom normalisé, français et anglais → slug) : à appeler après tout changement de lien. */
export async function chargerLiens(db: Executeur): Promise<void> {
  const l = await db.getAllAsync<{ nom_norm: string | null; nom_en_norm: string | null; lie_a: string }>(
    "SELECT nom_norm, nom_en_norm, lie_a FROM exercices WHERE perso = 1 AND lie_a IS NOT NULL",
    [],
  );
  const table: Record<string, string> = {};
  for (const e of l) for (const n of [e.nom_norm, e.nom_en_norm]) if (n) table[n] = e.lie_a;
  definirLiens(table);
}
