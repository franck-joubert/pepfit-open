// Ce que lit l'écran « Aider à s'endormir » : la dette du soir et le coucher conseillé (le calcul de la page Sommeil,
// lireSommeilDuJour), les couchers des 30 dernières nuits, la dernière séance finie aujourd'hui.
import type { Executeur } from "../../db/executeur";
import { arrondiDette } from "../recup-pepfit";
import { decaler, minuit } from "../mesures/periodes";
import { coucherMoyen, type SommeilDuJour } from "../mesures/sommeil-dette";
import { lireSommeil, lireSommeilDuJour, type Nuit } from "../mesures/sommeil-donnees";
import { versStat } from "../mesures/sommeil-stats";
import { ENDORMIR, type JourneeSoir } from "./endormir";

export interface Soir {
  calcul: SommeilDuJour | null;
  journee: JourneeSoir;
}

/** Les couchers (minutes autour du minuit du réveil), de la nuit la plus récente à la plus ancienne. */
export function couchersDe(nuits: ReadonlyMap<number, Nuit>): number[] {
  return [...nuits.values()].sort((a, b) => b.jour - a.jour).map((n) => versStat(n).coucher);
}

/** Les levers (minutes depuis le minuit du réveil) des `n` nuits les plus récentes. */
export function leversDe(nuits: ReadonlyMap<number, Nuit>, n = 7): number[] {
  return [...nuits.values()].sort((a, b) => b.jour - a.jour).slice(0, n).map((x) => versStat(x).lever);
}

export async function lireSoir(db: Executeur, maintenant = Date.now()): Promise<Soir> {
  const jour = minuit(maintenant);
  const { nuits } = await lireSommeil(db, decaler(jour, -(ENDORMIR.regularite.nuits - 1)), maintenant);
  const [calcul, seance] = await Promise.all([
    lireSommeilDuJour(db, jour, nuits, maintenant).catch(() => null),
    db
      .getFirstAsync<{ fin: number; titre: string | null }>(
        "SELECT s.fin AS fin, COALESCE(s.titre, r.nom) AS titre FROM seances s LEFT JOIN routines r ON r.id = s.routine_id WHERE s.fin >= ? AND s.fin <= ? ORDER BY s.fin DESC LIMIT 1",
        [jour, maintenant],
      )
      .catch(() => null),
  ]);
  const couchers = couchersDe(nuits);
  // le coucher des conseils : celui conseillé ce soir, sinon le coucher moyen des 7 nuits
  const moyen = coucherMoyen(couchers.slice(0, 7));
  const coucher = calcul?.coucher ?? (moyen != null ? ((arrondiDette(moyen) % 1440) + 1440) % 1440 : null);
  return { calcul, journee: { couchers, seance: seance ?? null, coucher } };
}
