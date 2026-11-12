import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useVersionDonnees } from "../sync/rafraichir";
import { useFocusEffect } from "../ui/focus-prechauffe";
import { abonnerSynchro, synchroEnCours } from "../whoop/etat-synchro";
import { surRecupChangee } from "./activites-evenement";
import { useApp } from "./contexte";
import type { ElementRecup } from "./page-effort";
import { lirePageEffort } from "./page-effort-donnees";
import { useJourCourant } from "./useJourCourant";
import type { Nuit } from "./mesures/sommeil-donnees";

/** Lectures déjà faites, par jour : la ligne ne saute pas au retour sur le jour (comme les chiffres des séances). */
const nuitsLues = new Map<string, Nuit | null>();
const partsLues = new Map<string, number | null>();
const recupsLues = new Map<string, ElementRecup[]>();

export interface PageEffort {
  /** undefined : pas encore lue (ou Sommeil masqué : jamais lue ici). */
  nuit: Nuit | null | undefined;
  /** Part du besoin dormie (%) de cette nuit, celle de la page Sommeil ; null sans mesure. */
  part: number | null;
  recups: ElementRecup[];
  /** Une synchro Whoop tourne : la nuit qu'on attend peut encore arriver. */
  synchro: boolean;
  /** Aujourd'hui (AAAA-MM-JJ), tenu à jour à minuit : la page Effort ouverte avant minuit ne garde pas celui d'hier. */
  aujourdhui: string;
}

/**
 * La nuit et les récupérations d'un jour, relues au retour sur l'écran, quand une récupération change, qu'une synchro
 * commence ou finit. `actif` faux : rien n'est lu (page du mois, qui n'a pas ces lignes). `avecSommeil` faux : la nuit
 * n'est pas lue (D9 : la lecture du sommeil continue ailleurs, ici elle ne sert plus).
 */
export function usePageEffort(j: string, avecSommeil: boolean, actif: boolean): PageEffort {
  const { db } = useApp();
  const synchro = useSyncExternalStore(abonnerSynchro, synchroEnCours);
  const version = useVersionDonnees();
  // minuit passé : la nuit du jour qui vient de commencer (ou du jour qui était « à venir ») se relit
  const aujourdhui = useJourCourant();
  const [, relu] = useState(0);
  const [tour, setTour] = useState(0);
  useEffect(() => surRecupChangee(() => setTour((n) => n + 1)), []);
  useFocusEffect(useCallback(() => setTour((n) => n + 1), []));
  useEffect(() => {
    if (!actif) return;
    let vivant = true;
    lirePageEffort(db, j, avecSommeil)
      .then((r) => {
        if (r.nuit !== undefined) {
          nuitsLues.set(j, r.nuit);
          partsLues.set(j, r.part);
        }
        recupsLues.set(j, r.recups);
        if (vivant) relu((n) => n + 1);
      })
      .catch((e) => {
        console.error(e);
        // lecture ratée : la ligne reste (« Pas de donnée », elle ouvre la page Sommeil), jamais un trou
        if (avecSommeil && !nuitsLues.has(j) && vivant) {
          nuitsLues.set(j, null);
          relu((n) => n + 1);
        }
      });
    return () => {
      vivant = false;
    };
  }, [db, j, actif, avecSommeil, tour, version, synchro, aujourdhui]);
  return { nuit: avecSommeil && actif ? nuitsLues.get(j) : undefined, part: avecSommeil && actif ? (partsLues.get(j) ?? null) : null, recups: actif ? (recupsLues.get(j) ?? []) : [], synchro, aujourdhui };
}
