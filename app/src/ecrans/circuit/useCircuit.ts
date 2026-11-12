import { useCallback, useEffect, useState } from "react";
import { chargerGarde, type Chargement } from "../../circuits/chargement";
import { useApp } from "../contexte";

/**
 * Le circuit d'une page (docs/CODE-CIRCUITS.md), lu sur le téléphone. `etat` est null tant que la lecture n'est pas finie : la page
 * montre ses formes d'attente.
 */
export function useCircuit(id: string): { etat: Chargement | null; relire: () => Promise<void> } {
  const { db } = useApp();
  const [etat, setEtat] = useState<Chargement | null>(null);

  useEffect(() => {
    let actif = true;
    setEtat(null);
    chargerGarde(db, id)
      .then((garde) => actif && setEtat(garde ?? { etat: "retire" }))
      .catch((e) => {
        console.warn(e);
        if (actif) setEtat({ etat: "retire" });
      });
    return () => {
      actif = false;
    };
  }, [db, id]);

  // Après un geste du menu (nom, activités) : relit le téléphone.
  const relire = useCallback(async () => {
    const garde = await chargerGarde(db, id);
    setEtat(garde ?? { etat: "retire" });
  }, [db, id]);

  return { etat, relire };
}
