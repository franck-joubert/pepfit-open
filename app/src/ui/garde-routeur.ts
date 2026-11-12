// Garde du routeur global d'expo-router (audit du 28/10, n° 1). Quand Android recrée l'activité (police, langue, thème
// système, « Ne pas conserver les activités »), la nouvelle racine React se monte avant que l'ancienne soit démontée. En se
// démontant, l'ancienne remet le `router` global (partagé) à « indisponible » : le premier router.navigate ou router.push
// lève alors « The imperative router is unavailable before the first render has finished » et ferme l'appli.
// La garde : chaque racine montée déclare ses actions (useRouter, liées à son propre conteneur) ; tant qu'une racine vit,
// le `router` global répond par les actions de la plus récente, quoi qu'y écrive une racine mourante.

type Actions = Record<string, unknown>;

const vivantes: Actions[] = [];
const gardes = new WeakSet<object>();

/** Passe les méthodes de `global` par la garde (une seule fois) : ce qu'on y écrit ne sert que sans racine vivante. */
function installer(global: Actions) {
  if (gardes.has(global)) return;
  gardes.add(global);
  for (const cle of Object.keys(global)) {
    let ecrit = global[cle];
    Object.defineProperty(global, cle, {
      configurable: true,
      enumerable: true,
      get: () => {
        const vive = vivantes[vivantes.length - 1];
        return vive && typeof vive[cle] === "function" ? vive[cle] : ecrit;
      },
      set: (v: unknown) => {
        ecrit = v;
      },
    });
  }
}

/**
 * Déclare une racine vivante et ses actions de routeur ; renvoie de quoi la retirer (démontage). Deux racines vivantes en
 * même temps = activité recréée : c'est le cas que la garde couvre.
 */
export function garderRouteur(global: Actions, actions: Actions): () => void {
  installer(global);
  vivantes.push(actions);
  if (vivantes.length > 1) console.warn(`router: ${vivantes.length} live roots (activity recreated), the newest keeps the router`);
  return () => {
    const i = vivantes.lastIndexOf(actions);
    if (i >= 0) vivantes.splice(i, 1);
  };
}
