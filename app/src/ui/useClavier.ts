import { useEffect, useState } from "react";
import { Dimensions, Keyboard } from "react-native";

/**
 * Hauteur du clavier ouvert (0 fermé), mesurée depuis le haut du clavier jusqu'au bas de l'écran (la hauteur annoncée
 * oublie la barre de navigation). Bord à bord, la fenêtre ne se redimensionne plus : ce qui doit rester visible (une
 * feuille, un panneau posé en bas) monte d'autant.
 */
export function useClavier(actif = true): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (!actif) return;
    const a = Keyboard.addListener("keyboardDidShow", (e) => setH(Math.max(e.endCoordinates.height, Dimensions.get("screen").height - e.endCoordinates.screenY)));
    const b = Keyboard.addListener("keyboardDidHide", () => setH(0));
    return () => {
      a.remove();
      b.remove();
      setH(0);
    };
  }, [actif]);
  return h;
}
