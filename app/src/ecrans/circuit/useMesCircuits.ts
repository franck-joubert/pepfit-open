import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import type { Circuit } from "../../circuits/types";
import { listerCircuits } from "../../db/depots/circuits";
import { useApp } from "../contexte";

/** Les circuits de la personne (faits d'une sortie ou importés, privés ou publiés), du plus récent au plus ancien ; null tant que le téléphone n'a pas répondu. Relus à chaque retour sur l'écran. */
export function useMesCircuits(): Circuit[] | null {
  const { db } = useApp();
  const [circuits, setCircuits] = useState<Circuit[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      let actif = true;
      listerCircuits(db)
        .then((l) => actif && setCircuits(l))
        .catch(() => actif && setCircuits((avant) => avant ?? []));
      return () => {
        actif = false;
      };
    }, [db]),
  );
  return circuits;
}
