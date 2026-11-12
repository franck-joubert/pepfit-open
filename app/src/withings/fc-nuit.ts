// FC au repos des nuits Withings, à partir de la FC à la minute (getintradayactivity, scope user.activity). Même méthode que
// celle de Santé Connect (ecrans/fc-repos-nuit.ts) : la plus basse moyenne sur 30 minutes de la nuit, et non le minimum brut
// de getsummary (hr_min), plus bas de plusieurs battements. Rangée dans withings_jour.fc_repos et comme mesure « fc »
// (source « withings ») : Whoop prime, Withings prime sur Santé Connect et sur la valeur déduite par pepfit (mesures.ts).
import type { Executeur } from "../db/executeur";
import { ajouterMesures } from "../db/depots/mesures";
import { ecrireReglage } from "../db/depots/reglages";
import { ErreurWhoop } from "../whoop/types";
import { fcReposDeNuit } from "../ecrans/fc-repos-nuit";
import type { ApiWithings } from "./api";
import { FC_NUITS_JOURS, FC_NUITS_PAR_SYNCHRO, ORIGINE_WITHINGS, REGLAGE, SOURCE_WITHINGS } from "./constantes";
import type { PageIntraday } from "./types";

const JOUR_MS = 86_400_000;
/** Une nuit récente peut encore recevoir sa FC (envoi différé de la montre) : seule une nuit de plus de 36 h est abandonnée. */
const DELAI_MS = 36 * 3_600_000;

/** Points de FC (t en ms) d'une réponse getintradayactivity ; clés illisibles et FC absurdes écartées. */
export function pointsFc(p: PageIntraday): { t: number; bpm: number }[] {
  const l: { t: number; bpm: number }[] = [];
  for (const [k, v] of Object.entries(p.series ?? {})) {
    const t = Number(k) * 1000;
    const bpm = v?.heart_rate;
    if (Number.isFinite(t) && typeof bpm === "number" && bpm >= 25 && bpm <= 250) l.push({ t, bpm });
  }
  return l.sort((a, b) => a.t - b.t);
}

/**
 * Pour les nuits des 7 derniers jours sans FC au repos : une demande de FC à la minute par nuit (3 par synchro au plus).
 * `fc_repos` vaut NULL (pas encore essayé), 0 (essayé, rien : montre sans FC continue ou nuit trop creuse) ou la valeur.
 * Rend le nombre de nuits rangées. Ne lève jamais : l'erreur est gardée dans REGLAGE.fcErreur.
 */
export async function lireFcRepos(db: Executeur, api: ApiWithings, maintenant: number = Date.now()): Promise<number> {
  let n = 0;
  try {
    const nuits = await db.getAllAsync<{ jour: number; sommeil_debut: number; sommeil_fin: number }>(
      "SELECT jour, sommeil_debut, sommeil_fin FROM withings_jour WHERE fc_repos IS NULL AND sommeil_fin IS NOT NULL AND sommeil_fin <= ? AND sommeil_fin >= ? ORDER BY sommeil_fin DESC LIMIT ?",
      [maintenant, maintenant - FC_NUITS_JOURS * JOUR_MS, FC_NUITS_PAR_SYNCHRO],
    );
    for (const nuit of nuits) {
      let fc = null as number | null;
      // une demande couvre 24 h au plus : une « nuit » plus longue (sieste enchaînée) est coupée à ses dernières 24 h
      const debut = Math.max(nuit.sommeil_debut, nuit.sommeil_fin - JOUR_MS);
      try {
        const points = pointsFc(await api.intraday(Math.floor(debut / 1000), Math.floor(nuit.sommeil_fin / 1000)));
        fc = fcReposDeNuit(points, debut, nuit.sommeil_fin);
      } catch (e) {
        const code = e instanceof ErreurWhoop ? e.code : "serveur";
        await ecrireReglage(db, REGLAGE.fcErreur, code);
        // réseau, limite, jeton : on réessaiera ; un refus de Withings (droit, appareil) n'est pas rejoué à chaque synchro
        if (code === "reseau" || code === "limite" || code === "expire") return n;
        await db.runAsync("UPDATE withings_jour SET fc_repos = 0 WHERE jour = ?", [nuit.jour]);
        return n;
      }
      if (fc != null) {
        await db.runAsync("UPDATE withings_jour SET fc_repos = ? WHERE jour = ?", [fc, nuit.jour]);
        n += await ajouterMesures(db, "fc", [{ valeur: fc, date: nuit.sommeil_fin, origine: ORIGINE_WITHINGS }], SOURCE_WITHINGS, maintenant);
      } else if (maintenant - nuit.sommeil_fin > DELAI_MS) {
        await db.runAsync("UPDATE withings_jour SET fc_repos = 0 WHERE jour = ?", [nuit.jour]);
      }
    }
    await ecrireReglage(db, REGLAGE.fcErreur, "");
  } catch (e) {
    await ecrireReglage(db, REGLAGE.fcErreur, e instanceof ErreurWhoop ? e.code : "serveur").catch(() => {});
  }
  return n;
}
