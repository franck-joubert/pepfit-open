// Doublures des modules natifs pour le test de rendu (tests/rendu-lieu.test.ts) : rien n'est dessiné, rien n'est appelé.
import React from "react";

/** Un composant d'écran doublé : un élément « hôte » du même nom, que le test lit dans l'arbre. */
export const hote = (nom) => {
  const C = (p) => React.createElement(nom, p);
  C.displayName = nom;
  return C;
};
export const rien = () => undefined;
export const vide = async () => undefined;
export const abonnement = () => ({ remove() {} });

/** Un objet qui accepte tout accès et tout appel (un module natif dont l'écran ne dépend pas). */
export function neutre() {
  const f = () => neutre();
  return new Proxy(f, {
    get: (_, k) => (k === "then" ? undefined : k === Symbol.toPrimitive ? () => "" : neutre()),
    apply: () => neutre(),
    construct: () => neutre(),
  });
}
