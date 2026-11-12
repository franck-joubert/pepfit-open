// Pas des séances d'un jour pour le bilan d'énergie : ceux MESURÉS sur leur plage (Whoop, Santé Connect), jamais un prorata. Une
// séance sans pas mesurés n'a pas de pas (null) : le hors séances du jour est alors inconnu (08/11 : un padel de 98 min
// compté 962 pas au prorata de la journée éveillée faisait « 8 467 pas hors séances » sur 9 429 ; il en avait fait plus de 6 000
// pendant la partie). Règle du 31/10 : jamais d'estimation sans mesure (docs/EFFORT-ACTIVITE.md).
import { sante as santeConnect } from "../natif/sante/index";
import { PERMISSION_PAS } from "./journee-donnees";
import { valeurPas, type ChoixPas, type SantePas } from "./pas-source";

export interface PasSeance {
  /** Pas mesurés sur la plage de la séance. */
  pas: number;
}

/**
 * Répartit les pas : mesurés, tels quels, sans jamais dépasser les pas du jour. Une séance sans mesure est null (pas de prorata).
 */
export function repartirPas(pasJour: number | null, l: readonly { minutes: number; mesures: number | null }[]): (PasSeance | null)[] {
  let reste = pasJour ?? Infinity;
  return l.map((s) => {
    if (s.mesures == null) return null;
    const pas = Math.max(0, Math.min(Math.round(s.mesures), reste));
    reste -= pas;
    return { pas };
  });
}

/**
 * Pas des séances d'un jour. `mesures` déjà connues (séances Santé Connect, détail Whoop) ; sinon lues sur la plage dans Santé
 * Connect, sauf quand le jour est compté par Whoop : le téléphone posé pendant le jeu ne vaut rien (seance-sources.ts), la séance
 * attend le détail de Whoop. Pas du jour venus de Santé Connect : une plage sans enregistrement est une plage sans pas (0, mesuré).
 */
export async function pasDesSeances(
  choix: ChoixPas,
  plages: readonly { debut: number; fin: number; mesures?: number | null }[],
  s: SantePas = santeConnect,
): Promise<(PasSeance | null)[]> {
  if (!plages.length) return [];
  const whoop = choix.etat === "valeur" && choix.source === "whoop";
  const autorise = !whoop && (await s.autorisees().catch((): string[] => [])).includes(PERMISSION_PAS);
  const sc = choix.etat === "valeur" && choix.source === "sante";
  const mesures = await Promise.all(
    plages.map(async (p) => {
      if (p.mesures != null) return p.mesures;
      const v = autorise ? await s.pasEntre(p.debut, p.fin).catch(() => null) : null;
      return v ?? (sc ? 0 : null);
    }),
  );
  return repartirPas(
    valeurPas(choix),
    plages.map((p, i) => ({ minutes: (p.fin - p.debut) / 60_000, mesures: mesures[i]! })),
  );
}
