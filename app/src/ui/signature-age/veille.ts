// Veille de la signature de l'Âge pepfit (SignatureAge.tsx). Alex, 30/10 : « l'animation est jolie mais elle s'arrête
// parfois au bout d'un certain temps ». Deux causes, vues à l'émulateur : l'image se figeait exprès 60 s après l'ouverture
// (repos de la planche age-pepfit), et les minuteurs couraient appli en arrière-plan ou écran éteint : au retour, la forme
// se figeait aussitôt. Désormais elle ne se fige plus tant que la page est à l'écran : au bout de 20 s sans changement de
// score, elle se calme (courant ralenti, souffle et battement à 35 % d'amplitude, fréquences vraies) et le reste. Arrière-plan
// ou écran éteint : plus aucune image ni aucun compte ; au retour, elle se réveille en pleine amplitude et le compte repart.
// Pur (sans React Native) : testé par tests/signature-veille.test.ts.

export const VEILLE = {
  /** Calme au bout de ce délai sans changement de score, sans geste du système (ms). */
  calmeApresMs: 20_000,
  /** Amplitude et vitesse du courant au calme (1 : pleines). */
  elanCalme: 0.35,
  /** Passage au calme (ms). */
  calmeMs: 2_000,
  /** Réveil : retour à l'amplitude pleine (ms). */
  reveilMs: 400,
} as const;

type Horloge = { setTimeout: (f: () => void, ms: number) => unknown; clearTimeout: (id: never) => void };

/**
 * `elan(vers, ms)` : amplitude visée et durée du fondu ; `images(oui)` : l'horloge des images tourne ou non. `demarrer` à
 * l'ouverture (ou à un nouveau score), `etatAppli` à chaque changement d'AppState, `arreter` en quittant la page.
 */
export function veilleSignature(
  rappels: { elan: (vers: number, ms: number) => void; images: (oui: boolean) => void },
  horloge: Horloge = globalThis as unknown as Horloge,
) {
  let id: unknown = null;
  const annuler = () => {
    if (id != null) horloge.clearTimeout(id as never);
    id = null;
  };
  const reveiller = () => {
    annuler();
    rappels.elan(1, VEILLE.reveilMs);
    rappels.images(true);
    id = horloge.setTimeout(() => {
      id = null;
      rappels.elan(VEILLE.elanCalme, VEILLE.calmeMs);
    }, VEILLE.calmeApresMs);
  };
  const enPause = () => {
    annuler();
    rappels.images(false);
  };
  return {
    demarrer: (appliActive: boolean) => (appliActive ? reveiller() : enPause()),
    etatAppli: (etat: string) => (etat === "active" ? reveiller() : enPause()),
    arreter: enPause,
  };
}
