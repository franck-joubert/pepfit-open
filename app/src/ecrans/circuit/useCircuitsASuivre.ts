import { useEffect, useMemo, useState } from "react";
import { activitesDuSport, circuitsASuivre, type CircuitASuivre } from "../../circuits/suivre";
import { listerCircuits } from "../../db/depots/circuits";
import type { Circuit } from "../../circuits/types";
import { useApp } from "../contexte";

// Les circuits que la feuille « Suivre un circuit » propose (planche Circuits, lot F) : les siens (importés compris), ceux qui vont à
// l'activité du départ. Rien ne part du téléphone.

/** Une feuille n'est pas une page sans fin : les 30 premiers. */
const LIGNES_MAX = 30;

export interface CircuitsASuivre {
  liste: CircuitASuivre[];
  /** Rien n'est encore lu : la feuille n'écrit pas « Aucun circuit » avant. */
  attente: boolean;
}

export function useCircuitsASuivre(sportId: string, ouverte: boolean): CircuitsASuivre {
  const { db } = useApp();
  const activites = activitesDuSport(sportId);
  const [mes, setMes] = useState<Circuit[] | null>(null);
  // Ses propres circuits sont relus à chaque ouverture : un import ou une création faits entre-temps y sont.
  useEffect(() => {
    if (!ouverte) return;
    let actif = true;
    listerCircuits(db)
      .then((l) => actif && setMes(l))
      .catch(() => actif && setMes((avant) => avant ?? []));
    return () => {
      actif = false;
    };
  }, [db, ouverte]);
  const liste = useMemo(() => (activites && mes ? circuitsASuivre(mes, [], activites, null).slice(0, LIGNES_MAX) : []), [activites, mes]);
  return { liste, attente: mes == null };
}
