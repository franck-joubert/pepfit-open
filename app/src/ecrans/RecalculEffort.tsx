// Recalcul de fond de l'Effort pepfit (planche effort-pepfit, NOTES § 4) : au lancement, l'appli posée (file des travaux de
// fond, fond.ts), puis à chaque retour au premier plan (10 min d'écart au moins), toutes les séances passées repassent par
// effort-charges.ts, sans bloquer (une passe à la fois, une pause toutes les 20 séances). Santé Connect apporte la FC des
// séances qui n'en ont pas en base, s'il est autorisé à la lire. Puis l'activité de chaque journée hors séances
// (effort-activite-donnees.ts) : la veille et le jour sont relus à chaque passe (les pas arrivent tard), les journées plus
// anciennes quand ce qui a servi change. Enfin les nuits de la Récupération (recup-donnees.ts) : les jauges de Sport sont
// relues si une nuit est arrivée. Puis la calibration personnelle des kcal apprend des séances qui ont des kcal de Whoop
// (kcal-calibration.ts), avant qu'elles ne soient oubliées (4 semaines).
import { useEffect } from "react";
import { AppState } from "react-native";
import { sante } from "../natif/sante";
import { useApp } from "./contexte";
import { depsActiviteAppareil } from "./effort-activite-appareil";
import { recalculerActivite } from "./effort-activite-donnees";
import { recalculerCharges } from "./effort-charges";
import { garderFcSeancesSante } from "./kcal-fc";
import { assurerNuitsRecup } from "./recup-donnees";
import { depsNuitsAppareil, depsRecupAppareil } from "./recup-appareil";
import { assurerImportsRecup } from "./recuperer-donnees";
import { memoireStats } from "./stats-jour";
import { PERMISSION_FC } from "./seance-sources";
import { enFond } from "./fond";
import { apprendreCalibrationKcal } from "./kcal-calibration";

const ECART_MS = 10 * 60_000;

export function RecalculEffort() {
  const { db } = useApp();
  useEffect(() => {
    let derniere = 0;
    const passer = () => {
      if (Date.now() - derniere < ECART_MS) return;
      derniere = Date.now();
      enFond("effort", () =>
        sante
          .autorisees()
          .catch(() => [])
          .then(async (a) => {
            const fc = (a as string[]).includes(PERMISSION_FC);
            await recalculerCharges(db, { fcSante: fc ? (d, f) => sante.fcEntre(d, f) : null });
            // les séances des autres applis : leur FC gardée pour leurs kcal (C11)
            if (fc && (await garderFcSeancesSante(db, sante)) > 0) memoireStats.oublier();
          })
          .catch((e) => console.error(e))
          .then(() => depsActiviteAppareil())
          .then((deps) => recalculerActivite(db, deps))
          .catch((e) => console.error(e))
          .then(() => depsRecupAppareil())
          .then((deps) => assurerImportsRecup(db, deps))
          .catch((e) => console.error(e))
          .then(() => depsNuitsAppareil())
          .then((deps) => assurerNuitsRecup(db, deps, true))
          .then((n) => {
            if (n > 0) memoireStats.oublier();
          })
          .catch((e) => console.error(e))
          .then(() => apprendreCalibrationKcal(db))
          .then((n) => {
            if (n > 0) memoireStats.oublier();
          })
          .catch((e) => console.error(e)),
      );
    };
    passer();
    const abo = AppState.addEventListener("change", (s) => {
      if (s === "active") passer();
    });
    return () => abo.remove();
  }, [db]);
  return null;
}
