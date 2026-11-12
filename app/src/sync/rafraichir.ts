import { useSyncExternalStore } from "react";

// « Du nouveau est arrivé par la synchro » : un compteur auquel les lectures d'écran (useCharge) s'abonnent.
// Monté quand une source (Whoop, Withings…) a apporté du nouveau, jamais sans rien de nouveau.

let version = 0;
let dernier = 0;
const abonnes = new Set<() => void>();

export const synchroRecue = {
  version: () => version,
  /** Instant de la dernière arrivée, 0 s'il n'y en a pas eu. */
  dernier: () => dernier,
  annoncer(maintenant = Date.now()) {
    version++;
    dernier = maintenant;
    abonnes.forEach((f) => f());
  },
  abonner(f: () => void) {
    abonnes.add(f);
    return () => abonnes.delete(f);
  },
};

// « Relis tes données » : le geste « tirer pour actualiser » (actualiser/) demande aux écrans qui lisent la base de se relire.
// Un compteur à part de `synchroRecue` : un geste de l'utilisateur n'est pas une arrivée.
let relectures = 0;
const abonnesRelecture = new Set<() => void>();
export const relecture = {
  version: () => relectures,
  demander() {
    relectures++;
    abonnesRelecture.forEach((f) => f());
  },
  abonner(f: () => void) {
    abonnesRelecture.add(f);
    return () => abonnesRelecture.delete(f);
  },
};

const abonnerDonnees = (f: () => void) => {
  const a = synchroRecue.abonner(f);
  const b = relecture.abonner(f);
  return () => {
    a();
    b();
  };
};
const versionDonnees = () => synchroRecue.version() + relectures;

export function useVersionSynchro(): number {
  return useSyncExternalStore(synchroRecue.abonner, synchroRecue.version);
}

/** Change quand une arrivée de la synchro OU un tirage pour actualiser demande de relire : les lectures d'écran (useCharge) la suivent. */
export function useVersionDonnees(): number {
  return useSyncExternalStore(abonnerDonnees, versionDonnees);
}
