// Arrivée d'une page poussée (revue finale n° 64) : la pile de vignettes part `pile.delai` après l'arrivée de la page, et
// non après son montage (les 120 ms passaient sous l'entrée native de la page). La fin d'entrée est l'évènement
// `transitionEnd` de la pile de navigation.
// Le montage précède l'entrée native, parfois de beaucoup : mesuré sur l'émulateur, `transitionStart` arrive 330 à 1 090 ms
// après le montage de la pile (logcat `[transition] pile`). D'où deux secours, si `transitionEnd` se perd :
// - l'entrée a commencé (`transitionStart`) : une image après `duree.page`, elle ne dure pas plus (plugins/duree-pages.js) ;
// - aucune transition (page déjà entrée quand la pile se monte, page ouverte sans animation) : `SECOURS.montage`.
import { duree } from "../theme/mouvement";

type Evenement = { data?: { closing?: boolean } };
/** `navigation.addListener(type, f)` : renvoie de quoi se désabonner. */
export type Abonner = (type: "transitionStart" | "transitionEnd", f: (e: Evenement) => void) => () => void;
export type Arrivee = "transitionEnd" | "secours";

export const SECOURS = { entree: duree.page + 16, montage: 1200 } as const;

/** Appelle `arrivee` une seule fois, à la fin de l'entrée de la page ou au secours. Renvoie de quoi tout défaire. */
export function quandPageArrivee(abonner: Abonner, arrivee: (par: Arrivee) => void, secours: { entree: number; montage: number } = SECOURS): () => void {
  let fini = false;
  let minuterie = setTimeout(() => une("secours"), secours.montage);
  // Une page qui part (une autre poussée par-dessus) ne compte pas.
  const desabonner = [
    abonner("transitionStart", (e) => {
      if (fini || e.data?.closing) return;
      clearTimeout(minuterie);
      minuterie = setTimeout(() => une("secours"), secours.entree);
    }),
    abonner("transitionEnd", (e) => {
      if (!e.data?.closing) une("transitionEnd");
    }),
  ];
  function defaire() {
    fini = true;
    desabonner.forEach((f) => f());
    clearTimeout(minuterie);
  }
  function une(par: Arrivee) {
    if (fini) return;
    defaire();
    arrivee(par);
  }
  return defaire;
}
