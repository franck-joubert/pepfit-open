// Un rendu réel, sans téléphone : react-reconciler pose les composants de l'appli dans un arbre de JavaScript ordinaire
// (type, props, enfants), que les tests interrogent. Les effets, les promesses et les minuteries tournent comme sur l'appareil :
// pas de React.act, le test attend ce qu'il veut voir (jusqua).
import React from "react";
import Reconciler from "react-reconciler";
import { DefaultEventPriority, DiscreteEventPriority } from "react-reconciler/constants.js";
import { horloge } from "./natifs/reanimated.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = false;
// La photo d'un lieu ne se télécharge pas ici (pas de réseau) : l'appli le note, le test n'a pas à le répéter.
const avertir = console.warn;
console.warn = (m, ...reste) => void (typeof m === "string" && m.startsWith("photo du lieu non gardée") ? undefined : avertir(m, ...reste));
let priorite = DefaultEventPriority;
const sortir = (p, e) => void p.enfants.splice(p.enfants.indexOf(e), 1);
const avant = (p, e, av) => void p.enfants.splice(p.enfants.indexOf(av), 0, e);

/** Un nœud de l'arbre. Une liste défilante note les `scrollTo` qu'on lui demande (`defilements`), comme le ferait le vrai. */
function instance(type, props) {
  const n = { type, props, enfants: [] };
  if (type === "ScrollView" || type === "Animated.ScrollView") {
    n.defilements = [];
    n.scrollTo = (o) => void n.defilements.push(o);
  }
  return n;
}

const hote = Reconciler({
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,
  createInstance: (type, props) => instance(type, props),
  createTextInstance: (texte) => ({ type: "#texte", texte, props: {}, enfants: [] }),
  appendInitialChild: (p, e) => void p.enfants.push(e),
  appendChild: (p, e) => void p.enfants.push(e),
  appendChildToContainer: (c, e) => void c.enfants.push(e),
  insertBefore: avant,
  insertInContainerBefore: avant,
  removeChild: sortir,
  removeChildFromContainer: sortir,
  commitUpdate: (i, _type, _ancien, props) => void (i.props = props),
  commitTextUpdate: (t, _a, n) => void (t.texte = n),
  finalizeInitialChildren: () => false,
  prepareForCommit: () => null,
  resetAfterCommit() {},
  getRootHostContext: () => ({}),
  getChildHostContext: (c) => c,
  shouldSetTextContent: () => false,
  clearContainer: (c) => void (c.enfants.length = 0),
  getPublicInstance: (i) => i,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,
  preparePortalMount() {},
  detachDeletedInstance() {},
  prepareScopeUpdate() {},
  getInstanceFromNode: () => null,
  getInstanceFromScope: () => null,
  beforeActiveInstanceBlur() {},
  afterActiveInstanceBlur() {},
  setCurrentUpdatePriority: (p) => void (priorite = p),
  getCurrentUpdatePriority: () => priorite,
  // Horloge factice : toute mise à jour est synchrone (voie « discrète »), `vider` la rend tout de suite ; sinon React attend sa minuterie.
  resolveUpdatePriority: () => (horloge.vivant ? DiscreteEventPriority : priorite),
  shouldAttemptEagerTransition: () => false,
  trackSchedulerEvent() {},
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  requestPostPaintCallback() {},
  maySuspendCommit: () => false,
  preloadInstance: () => true,
  startSuspendingCommit() {},
  suspendInstance() {},
  waitForCommitToBeReady: () => null,
  NotPendingTransition: null,
  HostTransitionContext: React.createContext(null),
  resetFormInstance() {},
});

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Monte l'élément ; rend la racine de l'arbre et de quoi attendre que les lectures (effets, promesses) aient posé leurs données. */
export async function monter(element) {
  const racine = { type: "#racine", props: {}, enfants: [] };
  const erreurs = [];
  const conteneur = hote.createContainer(racine, 0, null, false, null, "", (e) => erreurs.push(e), (e) => erreurs.push(e), (e) => erreurs.push(e), null);
  hote.updateContainer(element, conteneur, null, () => {});
  return {
    racine,
    erreurs,
    /** Attend (3 s au plus) que l'écran montre ce qu'on attend de lui : la page est lue, puis la fiche de l'établissement, etc. */
    async jusqua(pred, quoi = "l'écran attendu") {
      const fin = Date.now() + 3000;
      for (;;) {
        if (horloge.vivant) vider();
        if (pred(racine)) break;
        if (Date.now() > fin) throw new Error(`jamais affiché : ${quoi}`);
        await pause(20);
      }
      await pause(20);
      if (horloge.vivant) vider();
    },
    /** Un geste de l'écran (toucher, saisie…), suivi de ce qu'il déclenche. */
    async agir(f) {
      await f();
      await pause(30);
      if (horloge.vivant) vider();
    },
    async demonter() {
      hote.updateContainer(null, conteneur, null, () => {});
      await pause(30);
    },
  };
}

/** Tous les nœuds de l'arbre (profondeur d'abord, dans l'ordre d'affichage) qui répondent au prédicat. */
export function trouver(noeud, pred, sortie = []) {
  if (pred(noeud)) sortie.push(noeud);
  for (const e of noeud.enfants) trouver(e, pred, sortie);
  return sortie;
}

/** Le texte affiché sous un nœud, bout à bout. */
export const texte = (noeud) => (noeud.type === "#texte" ? noeud.texte : noeud.enfants.map(texte).join(""));

/** Tous les textes de l'arbre, un par composant Text, dans l'ordre d'affichage. */
export const textes = (racine) => trouver(racine, (n) => n.type === "Text" || n.type === "Animated.Text").map(texte).filter(Boolean);

// ——— Horloge factice (Reanimated « vivant », tests/rendu/natifs/reanimated.mjs) ———

/** Vide tout ce qui est en attente, sans attendre de minuterie : le rendu de React, ses effets, puis le recalcul des valeurs animées, jusqu'à la stabilité. */
export function vider() {
  for (let i = 0; i < 100; i++) {
    let fait = hote.flushPassiveEffects();
    fait = hote.flushSyncWork() || fait;
    fait = horloge.propager() || fait;
    if (!fait) return;
  }
  throw new Error("vider : le rendu ne se stabilise pas");
}

/** À appeler avant de monter : Reanimated devient déterministe, l'horloge repart de 0. */
export function activerHorloge() {
  horloge.reinitialiser();
  horloge.vivant = true;
}

/** Fait passer `ms` millisecondes factices, image par image (16 ms), en vidant tout après chaque image. */
export function avancer(ms) {
  vider();
  let reste = ms;
  while (reste > 0) {
    const pas = Math.min(16, reste);
    horloge.maintenant += pas;
    horloge.avancerAnimations();
    vider();
    reste -= pas;
  }
}

/** Un geste de l'écran, suivi de tout ce qu'il déclenche (sans attente réelle). */
export function agirSec(f) {
  f();
  vider();
}
