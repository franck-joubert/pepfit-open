// Vue 3D au doigt (D19), chargée paresseusement par l'écran « Voir en 3D » : c'est seulement ici que naissent le
// contexte GL (expo-gl) et la scène three.js. Un doigt fait tourner, deux doigts zooment ; le lancer garde un peu
// d'élan, sauf en mouvement réduit. Le cadrage montre le corps entier et l'agrès, recalculé à chaque taille de vue.
// On ne redessine que si quelque chose bouge (animation, élan, geste, couleurs).
import { useEffect, useRef } from "react";
import { PanResponder, PixelRatio, StyleSheet, View, type GestureResponderEvent } from "react-native";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { useIsFocused } from "expo-router";
import * as THREE from "three";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { charger3D, etape3D } from "./charger";
import { focusFini, voile, type Focus } from "./focus";
import { amortir, ORBITE_DOS, rayonCadrage, rayonCadrageAngle, tourner, zoomer, type Orbite } from "./orbite";
import { creerScene, type Couleurs3D, type Scene3D } from "./scene";
import type { Personnage } from "../../ecrans/donnees";
import type { ReperesClip } from "../../ecrans/tempo-horloge";

export interface PropsVue3D {
  cle: string;
  couleurs: Couleurs3D;
  lecture: boolean;
  /** Incrémenter pour revenir au cadrage initial (vue de dos ou de face, distance du cadrage). */
  dos: number;
  elan: boolean;
  libelle: string;
  onPret(muscles: { principaux: string[]; secondaires: string[] }): void;
  onErreur(message: string): void;
  /** Vue de face au lieu de dos (au changement, et à chaque `dos`). */
  face?: boolean;
  /**
   * Dans une page qui défile : seuls les glissés horizontaux font tourner (autour du personnage) ; les glissés
   * verticaux restent à la page. Deux doigts zooment toujours.
   */
  horizontal?: boolean;
  /** Toucher bref, sans glisser ni pincer. */
  onTap?(): void;
  /** Muscle mis en avant (le reste s'estompe), horloge performance.now(). */
  focus?: Focus | null;
  /** Personnage choisi dans le profil (lu à l'ouverture de la vue). */
  personnage?: Personnage;
  /**
   * Personnage au tempo (plein écran de la séance) : à chaque image, le temps du clip vient de l'horloge du tempo au
   * lieu d'avancer seul ; null : boucle libre. Lu à chaque image (une référence, pas un rendu React).
   */
  pilote?: { current: (() => number | null) | null };
  /** Repères du clip (point haut, point bas, départ), mesurés une fois la scène prête ; null : pas de tempo possible. */
  onReperes?(r: ReperesClip | null): void;
  /** Images par seconde au plus (30 en plein écran : le tempo se compte en secondes, la batterie en profite). */
  ips?: number;
  /** Incrémenter pour redessiner une image à l'arrêt (le pilote a changé : nouvelle série, retour au départ). */
  redessiner?: number;
  /** Distance de la caméra rapportée au cadrage (1 : corps entier et agrès ; moins de 1 : plus serré). */
  serre?: number;
  /**
   * Angle de départ en radians, ajouté à la vue de dos ou de face (positif : la caméra tourne vers la gauche du
   * personnage). Donné, le cadrage est calculé pour cet angle seul (plus serré que pour tous les angles).
   */
  azimut?: number;
}

/** Au-delà de ce déplacement (px), le toucher est un glissé, pas un tap. */
const SEUIL_TAP = 10;
/** Zoom arrière permis au-delà du cadrage. */
const RECUL = 1.5;

const QUART = Math.PI / 4;

/**
 * expo-gl 58 fait hériter WebGL2RenderingContext de WebGLRenderingContext (pas les navigateurs) : three.js (r163+)
 * prend alors le contexte WebGL 2 pour du WebGL 1 et le refuse. On masque le test le temps de la construction.
 */
export function creerRenderer(gl: ExpoWebGLRenderingContext, canvas: HTMLCanvasElement, alpha = false) {
  if (!(gl as { supportsWebGL2?: boolean }).supportsWebGL2) throw new Error(t("exercices.vue3d.webgl"));
  const g = globalThis as { WebGLRenderingContext?: unknown };
  const avant = g.WebGLRenderingContext;
  g.WebGLRenderingContext = undefined;
  try {
    return new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGL2RenderingContext, alpha });
  } finally {
    g.WebGLRenderingContext = avant;
  }
}
const DELAI = 15_000;

/** Vue de départ : de dos (ou de face), à la distance du cadrage. */
function initiale(e: { face: boolean; cadre: number | null; azimut: number }): Orbite {
  return { theta: ORBITE_DOS.theta + (e.face ? Math.PI : 0) + e.azimut, phi: ORBITE_DOS.phi, rayon: e.cadre ?? ORBITE_DOS.rayon };
}

export default function Vue3D({ cle, couleurs, lecture, dos, elan, libelle, onPret, onErreur, face = false, horizontal = false, onTap, focus = null, personnage = "homme", pilote, onReperes, ips, redessiner = 0, serre = 1, azimut }: PropsVue3D) {
  useLangue();
  const e = useRef({
    scene: null as Scene3D | null,
    orbite: ORBITE_DOS as Orbite,
    vitesse: 0,
    sale: true,
    lecture,
    couleurs,
    elan,
    hauteur: 1,
    /** Taille de la vue en pixels, d'après onLayout (0 avant la première mise en page). */
    px: { largeur: 0, hauteur: 0 },
    /** Distance du cadrage pour la taille courante (null tant que la scène n'est pas là). */
    cadre: null as number | null,
    face,
    azimut: azimut ?? 0,
    onTap,
    focus,
    vu: false,
    fini: false,
    fin: () => {},
    /** Écran au premier plan ; sinon la boucle s'arrête (`reprendre` la relance au retour du focus). */
    actif: true,
    reprendre: () => {},
  }).current;
  const actif = useIsFocused();
  e.actif = actif;
  useEffect(() => {
    if (!actif) return;
    e.sale = true;
    e.reprendre();
  }, [e, actif]);

  useEffect(() => {
    e.lecture = lecture;
    e.scene?.lecture(lecture);
    e.sale = true;
  }, [e, lecture]);
  useEffect(() => {
    e.couleurs = couleurs;
    e.scene?.couleurs(couleurs);
    e.sale = true;
  }, [e, couleurs]);
  useEffect(() => {
    e.elan = elan;
    if (!elan) e.vitesse = 0;
  }, [e, elan]);
  e.onTap = onTap;
  useEffect(() => {
    e.sale = true;
  }, [e, redessiner]);
  useEffect(() => {
    e.focus = focus;
    e.sale = true;
  }, [e, focus]);
  useEffect(() => {
    e.face = face;
    e.orbite = initiale(e);
    e.vitesse = 0;
    e.sale = true;
  }, [e, dos, face]);
  useEffect(() => {
    // sans contexte GL ni erreur, la vue resterait un rectangle vide : on le dit
    etape3D.nom = t("exercices.vue3d.etapeContexte");
    const delai = setTimeout(() => e.vu || e.fini || onErreur(t("exercices.vue3d.bloque", { etape: etape3D.nom })), DELAI);
    return () => {
      clearTimeout(delai);
      e.fin();
    };
  }, [e]);

  const surContexte = async (gl: ExpoWebGLRenderingContext) => {
    etape3D.nom = "three.js";
    // three.js attend un canvas : celui-ci ne sert qu'à porter la taille
    const toile = { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, style: {}, addEventListener() {}, removeEventListener() {} };
    let renderer: THREE.WebGLRenderer | null = null;
    let vivant = true;
    let image = 0;
    e.fin = () => {
      vivant = false;
      cancelAnimationFrame(image);
      e.scene?.liberer();
      e.scene = null;
      renderer?.dispose();
    };
    try {
      // dans le try : une erreur ici (contexte refusé par three.js) doit s'afficher, pas se perdre dans la promesse
      renderer = creerRenderer(gl, toile as unknown as HTMLCanvasElement);
      etape3D.nom = t("exercices.vue3d.etapeChargement");
      const { perso, textures, clip, recalage } = await charger3D(cle, personnage);
      if (!vivant) return;
      etape3D.nom = t("exercices.vue3d.etapeScene");
      const s = creerScene(perso, clip, textures, recalage);
      etape3D.nom = t("exercices.vue3d.etapeImage");
      s.couleurs(e.couleurs);
      s.lecture(e.lecture);
      e.scene = s;
      onPret({ principaux: clip.principaux, secondaires: clip.secondaires });
      if (onReperes) onReperes(s.reperes());
    } catch (err) {
      e.fini = true;
      if (vivant) onErreur(err instanceof Error ? err.message : String(err));
      return;
    }
    const r = renderer;
    let avant = performance.now();
    let derniere = 0;
    let largeur = 0;
    let hauteur = 0;
    const boucle = (t: number) => {
      if (!vivant || !e.actif) return;
      image = requestAnimationFrame(boucle);
      if (ips && t - derniere < 1000 / ips - 2) return;
      derniere = t;
      const dt = Math.min(100, t - avant);
      avant = t;
      // la scène peut être retirée entre deux images (changement d'onglet) : plantage « isoler of null » du 27/10
      const s = e.scene;
      if (!s) return;
      // expo-gl garde drawingBufferWidth/Height de la création : quand la vue change de taille, seul onLayout le dit
      const l = e.px.largeur || gl.drawingBufferWidth;
      const h = e.px.hauteur || gl.drawingBufferHeight;
      if (l !== largeur || h !== hauteur) {
        largeur = l;
        hauteur = h;
        r.setSize(largeur, hauteur, false);
        s.taille(largeur, hauteur);
        // nouvelle taille (vue agrandie ou réduite) : même angle, distance du cadrage
        const aspect = largeur / Math.max(1, hauteur);
        e.cadre = (azimut === undefined ? rayonCadrage(s.etendue(), aspect) : rayonCadrageAngle(s.etendue(), aspect, initiale(e).theta)) * serre;
        e.orbite = { ...e.orbite, rayon: e.cadre };
        e.sale = true;
      }
      if (e.vitesse) {
        e.orbite = tourner(e.orbite, e.vitesse * dt, 0, e.hauteur);
        e.vitesse = amortir(e.vitesse, dt);
      }
      // mise en avant : on redessine jusqu'un peu après la fin du fondu, pour finir sur un voile nul
      const maintenant = performance.now();
      const enFocus = !focusFini(e.focus, maintenant - 100);
      if (!e.lecture && !e.vitesse && !e.sale && !enFocus) return;
      s.isoler(enFocus ? e.focus!.muscle : null, voile(e.focus, maintenant));
      const tc = pilote?.current?.() ?? null;
      if (tc != null) s.temps(tc);
      else s.avancer(dt / 1000);
      s.orbite(e.orbite);
      s.rendre(r);
      gl.endFrameEXP();
      e.vu = true;
      e.sale = false;
    };
    e.reprendre = () => {
      if (!vivant) return;
      cancelAnimationFrame(image);
      avant = performance.now();
      image = requestAnimationFrame(boucle);
    };
    image = requestAnimationFrame(boucle);
  };

  // Geste : un doigt tourne, deux doigts pincent ; à chaque changement du nombre de doigts on repart des positions
  const g = useRef({ x: 0, y: 0, ecart: 0, doigts: 0 }).current;
  const ecart = (ev: GestureResponderEvent) => {
    const [a, b] = ev.nativeEvent.touches;
    return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0;
  };
  const deuxDoigts = (ev: GestureResponderEvent) => ev.nativeEvent.touches.length >= 2;
  const geste = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (ev) => !horizontal || deuxDoigts(ev),
      onMoveShouldSetPanResponder: (ev, s) => !horizontal || deuxDoigts(ev) || (Math.abs(s.dx) > 8 && Math.abs(s.dx) > Math.abs(s.dy) * 1.5),
      onMoveShouldSetPanResponderCapture: (ev) => horizontal && deuxDoigts(ev),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        e.vitesse = 0;
        g.doigts = 0;
      },
      onPanResponderMove: (ev, s) => {
        const doigts = ev.nativeEvent.touches.length;
        if (doigts !== g.doigts) {
          Object.assign(g, { x: s.dx, y: s.dy, ecart: ecart(ev), doigts });
          return;
        }
        if (doigts >= 2) {
          const d = ecart(ev);
          if (g.ecart > 0 && d > 0) e.orbite = zoomer(e.orbite, d / g.ecart, (e.cadre ?? ORBITE_DOS.rayon) * RECUL);
          g.ecart = d;
        } else {
          e.orbite = tourner(e.orbite, s.dx - g.x, horizontal ? 0 : s.dy - g.y, e.hauteur);
          Object.assign(g, { x: s.dx, y: s.dy });
        }
        e.sale = true;
      },
      onPanResponderRelease: (_, s) => {
        if (e.elan && g.doigts === 1) e.vitesse = s.vx;
      },
    }),
  ).current;

  // Tap : un seul doigt, levé sans avoir bougé de plus de SEUIL_TAP ; ni fin de glissé ni de pincement
  const tap = useRef({ x: 0, y: 0, ok: false }).current;
  const toucher = {
    onTouchStart: (ev: GestureResponderEvent) => {
      const t = ev.nativeEvent;
      Object.assign(tap, { x: t.pageX, y: t.pageY, ok: t.touches.length === 1 });
    },
    onTouchMove: (ev: GestureResponderEvent) => {
      const t = ev.nativeEvent;
      if (t.touches.length > 1 || Math.hypot(t.pageX - tap.x, t.pageY - tap.y) > SEUIL_TAP) tap.ok = false;
    },
    onTouchEnd: (ev: GestureResponderEvent) => {
      if (tap.ok && ev.nativeEvent.touches.length === 0) e.onTap?.();
      tap.ok = false;
    },
    onTouchCancel: () => {
      tap.ok = false;
    },
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(ev) => {
        const { width, height } = ev.nativeEvent.layout;
        e.hauteur = height;
        e.px = { largeur: PixelRatio.getPixelSizeForLayoutSize(width), hauteur: PixelRatio.getPixelSizeForLayoutSize(height) };
      }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={libelle}
      accessibilityHint={t("exercices.vue3d.indice")}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }, ...(onTap ? [{ name: "activate" }] : [])]}
      onAccessibilityAction={(ev) => {
        if (ev.nativeEvent.actionName === "activate") return onTap?.();
        e.orbite = { ...e.orbite, theta: e.orbite.theta + (ev.nativeEvent.actionName === "increment" ? QUART : -QUART) };
        e.sale = true;
      }}
      {...geste.panHandlers}
      {...(onTap ? toucher : null)}
    >
      <GLView style={StyleSheet.absoluteFill} onContextCreate={surContexte} />
    </View>
  );
}
