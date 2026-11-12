import { useSyncExternalStore } from "react";
import { abonner, lireActif, t, tp } from "./index";

/** Se réabonne au changement de langue, de fuseau ou d'unités : l'écran se redessine. */
export function useLangue() {
  const actif = useSyncExternalStore(abonner, lireActif);
  return { ...actif, t, tp };
}
