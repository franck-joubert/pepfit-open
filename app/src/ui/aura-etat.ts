// État partagé de l'aura : défilement de la partie visible et réveil. Les écrans le renseignent (onScroll des listes),
// le fond (ui/AuraFond) le lit sur le thread UI. Désaturation : chaque partie peut demander une aura moins colorée (Sport sur
// un jour passé) ; seule celle de la partie visible s'applique.
import { useCallback, useEffect, useRef } from "react";
import { Easing, makeMutable, useAnimatedScrollHandler, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { Partie } from "../theme/effets";
import { duree } from "../theme/mouvement";
import { courbes } from "./mouvement";
import { DUREE_DESATURATION_MS, DUREE_REDUIT_MS } from "./aura-calc";

/** Défilement (px) de la partie visible. */
export const defilementAura = makeMutable(0);

/** Désaturation (0 → 1) de l'aura de la partie visible. */
export const desaturationAura = makeMutable(0);

const memoire: Partial<Record<Partie, number>> = {};
const memoireDesat: Partial<Record<Partie, number>> = {};
let active: Partie = "accueil";
let reveil: (() => void) | null = null;
const ecouteurs = new Set<() => void>();
let dernierGeste = Date.now();

/** Temps (ms) écoulé depuis le dernier geste : l'aura et le personnage de Santé règlent leur cadence dessus. */
export function inactiviteAura(): number {
  return Date.now() - dernierGeste;
}

/** Les listes appellent ceci à chaque événement de défilement : l'aura suit, et se réveille. */
export function signalerDefilement(y: number) {
  const v = Math.max(0, y);
  memoire[active] = v;
  defilementAura.value = v;
  reveillerAura();
}

/**
 * État du halo d'une page partagée (aura-calc, etatHalo), tenu à jour à chaque image tant qu'elle est au premier plan :
 * l'onglet retrouvé en repart (il glisse de là vers sa teinte, puis l'efface), la page partagée suivante aussi tant que
 * celle-ci est `ouverte`. Page fermée : l'état reste pour l'onglet (sa reprise peut venir après la fermeture). null : aucun.
 */
export const haloPartage = makeMutable<{ etat: number[]; ouverte: boolean } | null>(null);

/** Partie de l'onglet affiché (d'où part le halo d'une page partagée). */
export function partieAura(): Partie {
  return active;
}

/** Défilement qu'une partie tient elle-même sur le thread UI (Santé : useAnimatedScrollHandler), lu au changement de partie. */
const sources: Partial<Record<Partie, SharedValue<number>>> = {};

/** Fin de page approchée : au plus un appel tous les 200 ms (le défilement est suivi à chaque image). */
const PAUSE_FIN_MS = 200;

/**
 * Défilement d'une page poussée (profil, cercle, réglages…) pour l'aura qu'elle pose derrière elle (`<AuraFond fixe
 * defilement={defilement} />`) : `surDefilement` va sur le `onScroll` d'un `Animated.ScrollView` (`scrollEventThrottle={16}`) et
 * écrit sur le thread UI, sans setState. Elle ne touche pas à `defilementAura`, celui de l'onglet affiché. `fin` : la page
 * demande la suite de sa liste à l'approche du bas (`seuil` dp avant la fin), le rappel passe par le JS au plus toutes les 200 ms.
 */
export function useDefilementAura(fin?: { seuil: number; appeler: () => void }) {
  const defilement = useSharedValue(0);
  const dernierAppel = useSharedValue(0);
  const rappel = useRef(fin?.appeler);
  rappel.current = fin?.appeler;
  const appeler = useCallback(() => rappel.current?.(), []);
  const seuil = fin ? fin.seuil : -1;
  const surDefilement = useAnimatedScrollHandler({
    onScroll: (ev) => {
      const y = Math.max(0, ev.contentOffset.y);
      defilement.value = y;
      if (seuil < 0 || ev.layoutMeasurement.height + y <= ev.contentSize.height - seuil) return;
      const maintenant = Date.now();
      if (maintenant - dernierAppel.value < PAUSE_FIN_MS) return;
      dernierAppel.value = maintenant;
      scheduleOnRN(appeler);
    },
  });
  return { defilement, surDefilement };
}

/** Une partie qui pose `defilementAura` sur le thread UI, sans passer par le JS : son défilement est lu ici (null : retiré). */
export function brancherDefilementAura(p: Partie, v: SharedValue<number> | null) {
  if (v) sources[p] = v;
  else delete sources[p];
}

/** Changement de partie : l'aura rejoint le défilement mémorisé de la nouvelle. */
export function activerPartieAura(p: Partie, animer: boolean) {
  if (p === active) return;
  active = p;
  const cible = sources[p]?.value ?? memoire[p] ?? 0;
  defilementAura.value = animer ? withTiming(cible, { duration: duree.deplacement, easing: courbes.deplacement }) : cible;
  glisserDesaturation(memoireDesat[p] ?? 0, animer);
}

function glisserDesaturation(d: number, animer: boolean) {
  desaturationAura.value = withTiming(d, { duration: animer ? DUREE_DESATURATION_MS : DUREE_REDUIT_MS, easing: Easing.inOut(Easing.quad) });
}

/** Désaturation demandée par une partie (0 = teinte pleine) ; appliquée en fondu si c'est la partie visible. */
export function desaturerAura(p: Partie, d: number, animer = true) {
  if (memoireDesat[p] === d) return;
  memoireDesat[p] = d;
  if (p === active) glisserDesaturation(d, animer);
}

/** Un écran tient l'aura de sa partie désaturée tant que `d` > 0 ; rendue pleine quand il disparaît. */
export function useDesaturationAura(p: Partie, d: number, animer = true) {
  useEffect(() => {
    desaturerAura(p, d, animer);
  }, [p, d, animer]);
  useEffect(() => () => desaturerAura(p, 0, false), [p]);
}

export function brancherReveilAura(f: (() => void) | null) {
  reveil = f;
}

/** Réveils plus rapprochés ignorés (ms) : un glissé en envoie un par mouvement du doigt (docs/AUDIT-PERF.md, M15). */
export const REVEIL_MIN_MS = 250;
let dernierReveil = -Infinity;

/** Un geste (toucher, défilement, changement de partie) : l'aura repart à pleine cadence. */
export function reveillerAura() {
  const t = Date.now();
  dernierGeste = t;
  // l'aura, la comète et le corps sont déjà à pleine cadence : ni minuteurs refaits, ni animation relancée
  if (t - dernierReveil < REVEIL_MIN_MS) return;
  dernierReveil = t;
  reveil?.();
  ecouteurs.forEach((f) => f());
}

/** Autre animation qui suit la même horloge (comète de la bulle) : appelée à chaque geste ; rend de quoi se désabonner. */
export function ecouterReveilAura(f: () => void): () => void {
  ecouteurs.add(f);
  return () => void ecouteurs.delete(f);
}
