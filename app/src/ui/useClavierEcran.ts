// Ce que l'écran qui héberge le clavier de pepfit doit à la séance (session.tsx, SuiviFin.tsx) : la case en saisie défile
// au-dessus du clavier, la saisie en cours part en base à la mise en arrière-plan, un toucher sur une zone vide ferme le
// clavier. Partagé par la séance, la séance passée et l'éditeur de routine (docs/CLAVIER-PARTOUT.md). L'écran ne s'abonne
// pas au clavier (audit M5) : rien ici ne le redessine, ni à l'ouverture ni à chaque chiffre.
import { useEffect } from "react";
import { AppState } from "react-native";
import { clavierSeance } from "../ecrans/clavier-seance";
import { espace } from "../theme/typo";
import type { Defilement } from "./Glisser";

export function useClavierEcran(defilement: Defilement) {
  const liste = defilement.scrollRef;
  useEffect(() => {
    clavierSeance.surAssurer((yBas) =>
      liste.current?.measureInWindow((_x, y, _l, h) => {
        const limite = y + h - espace.l;
        if (yBas > limite) liste.current?.scrollTo({ y: defilement.defil.y + (yBas - limite), animated: true });
      }),
    );
    return () => clavierSeance.surAssurer(null);
  }, [liste, defilement]);
  // Saisie en cours écrite en base dès la mise en arrière-plan (sinon BROUILLON_MS après la dernière touche).
  useEffect(() => {
    const s = AppState.addEventListener("change", (e) => e !== "active" && clavierSeance.viderBrouillon());
    return () => s.remove();
  }, []);
  // Clavier ouvert : un toucher sur une zone vide le ferme (la case s'enregistre). Les cases et les boutons répondent avant ;
  // un glissé reste au défilement. Lu au toucher, sans abonnement.
  return {
    zoneVide: { onStartShouldSetResponder: () => clavierSeance.estOuvert(), onResponderRelease: () => clavierSeance.quitter() },
  };
}
