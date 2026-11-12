// Lectures de la liste du jour de l'onglet Effort (planche Effort v2.2) : la nuit qui finit ce jour-là et les récupérations
// qui y commencent, avec leurs kcal. La nuit vient de la page Sommeil (Whoop, Santé Connect, horaires modifiés déjà appliqués) :
// une seule lecture, donc une seule vérité partout.
import type { Executeur } from "../db/executeur";
import { elementRecup, type ElementRecup } from "./page-effort";
import { lireSommeil, lireSommeilDuJour, type Nuit } from "./mesures/sommeil-donnees";
import { partBesoin } from "./mesures/sommeil-dette";
import { lireRecupEntre } from "./recuperer-donnees";
import { kcalRecup, minutesDe } from "./recuperer-vues/briques-donnees";

/** Minuit local d'un jour « AAAA-MM-JJ », et celui du lendemain. */
export function bornesDuJour(j: string): { debut: number; fin: number } {
  const [a = 1970, m = 1, d = 1] = j.split("-").map(Number);
  return { debut: new Date(a, m - 1, d).getTime(), fin: new Date(a, m - 1, d + 1).getTime() };
}

/** La nuit qui finit entre minuit et minuit : celle rangée à ce jour, sinon celle dont la fin tombe ce jour-là (clé de jour décalée). */
export function nuitDuJour(nuits: ReadonlyMap<number, Nuit>, debut: number, fin: number): Nuit | null {
  const rangee = nuits.get(debut);
  if (rangee) return rangee;
  let trouvee: Nuit | null = null;
  for (const n of nuits.values()) if (n.fin >= debut && n.fin < fin && (!trouvee || n.fin > trouvee.fin)) trouvee = n;
  return trouvee;
}

export interface PageEffortLue {
  /** La nuit qui finit ce jour ; null sans nuit lue, undefined si elle n'a pas été demandée (Sommeil masqué : aucune lecture). */
  nuit: Nuit | null | undefined;
  /** Part du besoin dormie (%), la même que celle de la page Sommeil (partBesoin) ; null sans nuit ou sans besoin chiffré (précision trop basse). */
  part: number | null;
  recups: ElementRecup[];
}

/** `avecSommeil` faux (réglage « Afficher le sommeil » éteint) : la nuit n'est pas lue pour cette liste ; la page Sommeil, elle, la lit. */
export async function lirePageEffort(db: Executeur, j: string, avecSommeil: boolean, maintenant = Date.now()): Promise<PageEffortLue> {
  const { debut, fin } = bornesDuJour(j);
  const [lues, nuit] = await Promise.all([
    lireRecupEntre(db, debut, fin),
    avecSommeil && debut <= maintenant ? lireSommeil(db, debut, maintenant).then((d) => nuitDuJour(d.nuits, debut, fin)).catch(() => null) : Promise.resolve(undefined),
  ]);
  const part = nuit ? await lireSommeilDuJour(db, nuit.jour, undefined, maintenant).then((s) => partBesoin(nuit.sommeilMin, s.matin)).catch(() => null) : null;
  const kcal = await Promise.all(lues.map((a) => kcalRecup(db, a.type, minutesDe(a), a.debut).catch(() => null)));
  return { nuit, part, recups: lues.map((a, i) => elementRecup(a, kcal[i] ?? null)) };
}
