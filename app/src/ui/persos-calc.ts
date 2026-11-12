// Petits persos (planche exercices-perso, D5) : quels muscles du personnage s'allument, et dans quel rôle.
// Les ids viennent de MUSCLES_DU_CATALOGUE (la table des blessures). Le principal l'emporte sur un secondaire qui
// allume le même muscle du personnage (« Grand dorsal » et « Milieu du dos » partagent le grand rond).
import { MUSCLES_DU_CATALOGUE } from "../db/zones";

export type RolePerso = "p" | "s";

/** Muscles du personnage allumés, avec leur rôle (p : principal, s : secondaire). */
export function allumage(principal: string | null | undefined, secondaires: readonly string[] = []): Map<string, RolePerso> {
  const r = new Map<string, RolePerso>();
  for (const m of secondaires) {
    if (m === principal) continue;
    for (const id of MUSCLES_DU_CATALOGUE[m] ?? []) r.set(id, "s");
  }
  for (const id of (principal && MUSCLES_DU_CATALOGUE[principal]) || []) r.set(id, "p");
  return r;
}

/** Noms des muscles du catalogue allumés, principal en tête, sans doublon (libellé du lecteur d'écran). */
export function musclesAllumes(principal: string | null | undefined, secondaires: readonly string[] = []): string[] {
  const noms = [principal, ...secondaires].filter((m): m is string => !!m);
  return [...new Set(noms)];
}

/** Rôle que donne le prochain toucher d'une puce de la feuille Muscles (D5). */
export type RoleMuscle = "principal" | "secondaires";

/** Toucher d'une puce : le rôle choisi dit ce qu'il fait. Un muscle n'est jamais principal et secondaire à la fois. */
export function toucherMuscle(
  m: string,
  role: RoleMuscle,
  principal: string | null,
  secondaires: readonly string[],
): { principal: string | null; secondaires: string[] } {
  const sans = secondaires.filter((s) => s !== m);
  if (role === "principal") return m === principal ? { principal: null, secondaires: sans } : { principal: m, secondaires: sans };
  if (m === principal) return { principal: null, secondaires: [...sans, m] };
  return { principal, secondaires: secondaires.includes(m) ? sans : [...secondaires, m] };
}
