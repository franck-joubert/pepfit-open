// La file des travaux de fond de l'appli (demarrage.ts) : horloge réelle, fil JS libre par requestIdleCallback, gestes lus
// sur l'aura (tout toucher de l'appli la réveille, app/_layout).
import { inactiviteAura } from "../ui/aura-etat";
import { creerFileDemarrage } from "./demarrage";

const file = creerFileDemarrage(
  {
    maintenant: () => Date.now(),
    attendre: (ms) => new Promise((ok) => setTimeout(ok, ms)),
    libre: (max) =>
      new Promise((ok) => {
        const ric = (globalThis as { requestIdleCallback?: (f: () => void, o: { timeout: number }) => unknown }).requestIdleCallback;
        if (ric) ric(() => ok(), { timeout: max });
        else setTimeout(ok, 0);
      }),
    inactivite: inactiviteAura,
  },
  (nom, e) => console.error(`[fond] ${nom}`, e),
);

/** L'Accueil a sa première valeur : les travaux de fond peuvent partir. */
export const signalerPremierEcran = file.signalerPremierEcran;

/** Un travail de fond (synchro, import, préchargement), lancé après le premier écran, un à la fois, hors des gestes. */
export function enFond(nom: string, faire: () => unknown): void {
  file.enFond(nom, () => {
    console.log(`[fond] ${nom}`);
    return faire();
  });
}
