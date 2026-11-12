import { useEffect, useState } from "react";
import { chrono } from "../ecrans/format";
import { dureeSeanceS, type Chrono } from "../ecrans/duree-seance";

/** Durée écoulée de la séance, pauses exclues : seule à se redessiner chaque seconde (pas la liste des séries). Figée en pause. */
export function ChronoSeance({ c }: { c: Chrono }) {
  const [maintenant, setMaintenant] = useState(Date.now());
  const enPause = c.pauseDebut !== null;
  useEffect(() => {
    setMaintenant(Date.now());
    if (enPause) return;
    const t = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(t);
  }, [enPause]);
  return <>{chrono(dureeSeanceS(c, maintenant))}</>;
}
