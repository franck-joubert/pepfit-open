// Journal de la dernière synchro Withings (Réglages › Connexions) : relecture de ce que synchro.ts a gardé, et mise en mots
// neutres (numéros de type de Withings, comptes) pour la ligne de l'écran. Pur : aucune valeur de santé n'y passe.
import type { DiagnosticWithings, Ecartes } from "./types";

/** Le diagnostic gardé dans les réglages, ou null s'il manque ou s'il est illisible. */
export function lireDiagnostic(brut: string | null): DiagnosticWithings | null {
  if (!brut) return null;
  try {
    const d = JSON.parse(brut) as Partial<DiagnosticWithings> | null;
    if (!d || typeof d.groupes !== "number" || !Array.isArray(d.types) || !d.ecartes) return null;
    return d as DiagnosticWithings;
  } catch {
    return null;
  }
}

/** Les types reçus, en numéros de meastype : « 1, 5, 6, 8 » ; « aucun » est dit par l'écran. */
export const typesRecus = (d: DiagnosticWithings): string => d.types.join(", ");

/** Ce qui a été écarté, compact : « 2 objectifs, 1 ambigu, 11@13 (type@position), ?999 (type inconnu), 3 nuls » ; vide si rien. */
export function ecartes(e: Ecartes): string {
  const l: string[] = [];
  if (e.objectifs) l.push(`${e.objectifs} obj.`);
  if (e.ambigus) l.push(`${e.ambigus} amb.`);
  l.push(...e.positions);
  l.push(...e.inconnus.map((t) => `?${t}`));
  if (e.nuls) l.push(`${e.nuls} nul${e.nuls > 1 ? "s" : ""}`);
  return l.join(", ");
}
