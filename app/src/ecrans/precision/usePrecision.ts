// La précision pepfit dans un écran : lue au montage et à chaque `visite` (ouverture du volet, retour sur la page), relue
// après une saisie (invaliderPrecision). Calcul sur le téléphone.
import { useEffect, useState } from "react";
import { useApp } from "../contexte";
import { abonnerPrecision, lirePrecision, type EtatPrecision } from "../../precision/service";
import type { PartiePrecision } from "../../precision/modele";

export function usePrecision(visite: unknown = 0): EtatPrecision | null {
  const { db, reglages } = useApp();
  const [e, setE] = useState<EtatPrecision | null>(null);
  const [n, setN] = useState(0);
  const p = reglages.parties;
  const parties: Record<PartiePrecision, boolean> = { nutrition: p.food !== false, sport: p.train !== false, sante: p.health !== false };
  const cle = JSON.stringify(parties);
  useEffect(() => abonnerPrecision(() => setN((x) => x + 1)), []);
  useEffect(() => {
    let vivant = true;
    lirePrecision(db, JSON.parse(cle) as Record<PartiePrecision, boolean>)
      .then((v) => vivant && setE(v))
      .catch((err) => console.error(err));
    return () => {
      vivant = false;
    };
  }, [db, cle, visite, n]);
  return e;
}
