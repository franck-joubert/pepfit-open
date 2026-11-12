// Saisie en cours (docs/ALERTE-REPS.md) : la case qui a le focus montre une valeur que la série en mémoire n'a pas encore
// (l'écriture en base est différée, la relecture plus encore). Tout ce qui lit la série juste après une saisie (coche,
// valeur inhabituelle, record, instantané de l'IA, fin de séance) passe par ici pour lire la valeur affichée. Pure : testée
// sous Node (tests/alerte-reps.test.ts).
import type { PatchSaisie, SerieDetail } from "../db/api";
import type { ChampSerie } from "../db/natures";
import { chiffresTemps, depuisUnite, lireNombre, lireTemps, type Unite } from "./format";

/** Ce qu'une case tapée écrit dans la série : la charge en kg (depuis l'unité affichée), les répétitions, la distance, le temps. */
export function patchSaisie(champ: ChampSerie, v: string, u: Unite): PatchSaisie {
  const n = lireNombre(v);
  switch (champ) {
    case "kg":
      return { kg: n == null ? null : Math.round(depuisUnite(n, u) * 1000) / 1000 };
    case "reps":
      return { reps: n == null ? null : Math.round(n) };
    case "distance_m":
      return { distanceM: n == null ? null : Math.round(n) };
    case "duree_s":
      return { dureeS: lireTemps(v) };
  }
}

const CHAMPS: readonly ChampSerie[] = ["kg", "reps", "duree_s", "distance_m"];

/** La case du clavier de séance, telle que la lit ce module (clé `${serieId}-${champ}`, texte affiché). */
export interface CaseLue {
  cle: string;
  temps: boolean;
  saisie: { texte: string };
}

/** La série et le champ d'une case (« abc-reps » → abc, reps) ; null si la clé n'est pas celle d'une case de série. */
export function serieDeCase(cle: string): { serieId: string; champ: ChampSerie } | null {
  for (const champ of CHAMPS) if (cle.endsWith(`-${champ}`)) return { serieId: cle.slice(0, -champ.length - 1), champ };
  return null;
}

/** Le patch de la case active pour la série `serieId` (null : la case active est ailleurs, ou aucune). */
export function saisieDe(serieId: string, active: CaseLue | null, u: Unite): PatchSaisie | null {
  const c = active ? serieDeCase(active.cle) : null;
  if (!active || !c || c.serieId !== serieId) return null;
  // Durée : la case montre le masque (« ␣␣:␣1:27 »), relu par ses chiffres comme l'écriture différée.
  return patchSaisie(c.champ, active.temps ? chiffresTemps(active.saisie.texte) : active.saisie.texte, u);
}

/** Les valeurs d'un patch, appliquées à une série (même objet si rien ne change). */
export function avecPatch<S extends Pick<SerieDetail, "kg" | "reps" | "duree_s" | "distance_m">>(x: S, p: PatchSaisie | null | undefined): S {
  if (!p) return x;
  const n = {
    kg: p.kg === undefined ? x.kg : p.kg,
    reps: p.reps === undefined ? x.reps : p.reps,
    duree_s: p.dureeS === undefined ? x.duree_s : p.dureeS,
    distance_m: p.distanceM === undefined ? x.distance_m : p.distanceM,
  };
  return n.kg === x.kg && n.reps === x.reps && n.duree_s === x.duree_s && n.distance_m === x.distance_m ? x : { ...x, ...n };
}

/** La série telle que l'écran la montre : la valeur de la case en saisie l'emporte sur celle en mémoire. */
export function serieAffichee<S extends Pick<SerieDetail, "id" | "kg" | "reps" | "duree_s" | "distance_m">>(x: S, active: CaseLue | null, u: Unite): S {
  return avecPatch(x, saisieDe(x.id, active, u));
}
