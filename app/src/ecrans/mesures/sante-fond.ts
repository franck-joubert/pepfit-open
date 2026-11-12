// Pages de mesure faites de ce que Santé Connect range dans la base (Poids, Masse grasse, VFC, FC au repos ; M8,
// docs/PERF-A.md) : la page lit la base et s'affiche tout de suite ; l'état de Santé Connect (ligne des sources) et l'import
// tournent en fond, et la page n'est relue que si l'import a apporté du neuf. Avant, elle attendait l'import (8 types et
// les pesées, environ 28 appels natifs) : 2,4 à 2,6 s sur le Fold.
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { sante } from "../../natif/sante";
import { etatSanteConnect } from "../Composition";
import { useApp } from "../contexte";
import { autoriserSante, importerSante } from "../sante-donnees";

export type EtatSC = Awaited<ReturnType<typeof etatSanteConnect>>;

/** `sc` : null tant que l'état n'est pas lu. `relierSante` : autoriser ce qui manque, sinon ouvrir les réglages de Santé
 * Connect ; absente : les connexions de l'appli. Puis import sans attendre les 5 min, et la page relue s'il apporte du neuf. */
export function useSanteEnFond(recharger: () => Promise<void>): { sc: EtatSC | null; relierSante: () => Promise<void> } {
  const { db } = useApp();
  const [sc, setSc] = useState<EtatSC | null>(null);
  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      etatSanteConnect().then(
        (e) => vivant && setSc(e),
        () => vivant && setSc("absente"),
      );
      importerSante(db)
        .then((n) => (n > 0 && vivant ? recharger() : undefined))
        .catch(console.error);
      return () => void (vivant = false);
    }, [db, recharger]),
  );
  const relierSante = useCallback(async () => {
    if (sc === "aAutoriser") await autoriserSante();
    else if (sc === "autorisee") await sante.ouvrirReglages();
    else return void router.push("/settings/connexions");
    setSc(await etatSanteConnect().catch((): EtatSC => "absente"));
    if ((await importerSante(db, { forcer: true })) > 0) await recharger();
  }, [db, sc, recharger]);
  return { sc, relierSante };
}
