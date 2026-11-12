// Personnage de Santé en « verre teinté » (planche fond-anime, style 2), sans rien de React Native : shader, couleurs,
// cadence et points d'ancrage des valeurs sur le corps. Un seul passage de rendu : une peau, un matériau.
import type { ModeCouleur } from "../../theme/jetons";
import { cadenceAura, type Cadence } from "../aura-calc";

export const VERT = `
#include <common>
#include <skinning_pars_vertex>
#include <morphtarget_pars_vertex>
varying vec3 vN; varying vec3 vV; varying float vY; varying vec2 vUv; varying vec3 vP;
void main() {
  vUv = uv;
  #include <beginnormal_vertex>
  #include <morphinstance_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vN = normalize(transformedNormal); vV = normalize(-mvPosition.xyz); vP = mvPosition.xyz; vY = transformed.y;
}`;

/** Fragment du verre. uLisse : contour lissé (expo-gl n'a pas de MSAA sur Android) ; sur la silhouette, la normale du
 * maillage devient rasante et l'opacité y tombe à zéro sur ~1,5 pixel (fwidth), au lieu d'un bord en escalier. */
export const FRAG = `
uniform vec3 uTop; uniform vec3 uBot; uniform vec3 uRim; uniform float uH; uniform float uFade;
uniform float uScan; uniform vec3 uScanCol;
uniform sampler2D uRelief; uniform sampler2D uCavite; uniform float uForce; uniform float uCav; uniform float uLisse;
varying vec3 vN; varying vec3 vV; varying float vY; varying vec2 vUv; varying vec3 vP;
// Relief (planche homme-v2, B, D13) : carte de normales en espace tangent, repère tiré des dérivées (perturbNormal2Arb)
vec3 relief(vec3 N) {
  vec3 q0 = dFdx(vP), q1 = dFdy(vP); vec2 s0 = dFdx(vUv), s1 = dFdy(vUv);
  vec3 q1p = cross(q1, N), q0p = cross(N, q0);
  vec3 T = q1p * s0.x + q0p * s1.x, B = q1p * s0.y + q0p * s1.y;
  float det = max(dot(T, T), dot(B, B)), k = det == 0.0 ? 0.0 : inversesqrt(det);
  vec3 m = texture2D(uRelief, vUv).xyz * 2.0 - 1.0; m.xy *= uForce;
  return normalize(T * (m.x * k) + B * (m.y * k) + N * m.z);
}
void main() {
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  if (uForce > 0.0) N = relief(N);
  vec3 V = normalize(vV);
  float h = clamp(vY / uH, 0.0, 1.0);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.2);
  vec3 grad = mix(uBot, uTop, smoothstep(0.05, 0.95, h));
  vec3 L = normalize(vec3(-0.45, 0.65, 0.6));
  float dif = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
  float spec = pow(clamp(dot(reflect(-L, N), V), 0.0, 1.0), 22.0);
  vec3 col = grad * (0.55 + 0.6 * dif) + uRim * fres * 0.7 + vec3(spec * 0.55);
  // cavité : le fond des sillons s'assombrit (uCav = noirceur du fond, 1 = rien)
  if (uForce > 0.0) col *= mix(uCav, 1.0, texture2D(uCavite, vUv).r);
  float a = mix(0.46, 0.92, fres) + spec * 0.2;
  if (uLisse > 0.5) {
    float g = abs(dot(normalize(vN), V));
    a *= smoothstep(0.0, 1.5 * fwidth(g) + 1e-4, g);
  }
  // scan : bande de lumière à la hauteur uScan (fraction de la taille), bord doux ; uScan < -1 : pas de scan
  float bande = exp(-pow((h - uScan) / 0.035, 2.0));
  col = mix(col, uScanCol, bande * 0.75);
  a = max(a, bande * 0.95);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), clamp(a, 0.0, 1.0) * uFade);
}`;

/** Relief (D13) : force de la carte de normales et noirceur du fond des sillons. L'homme à 0,5 (planche morphologie, D14 :
 *  rendu moins « sportif », moins d'abdos sur les corps gras) ; les vues 3D gardent leur force (charger.ts). */
export const RELIEF = { homme: { force: 0.5, cavite: 0.5 }, femme: { force: 0.3, cavite: 0.88 } } as const;

/** Rose en haut, violet en bas, bord lumineux (planche : STYLE_COUL). */
export const COULEURS_VERRE: Record<ModeCouleur, { top: [number, number, number]; bot: [number, number, number]; rim: [number, number, number] }> = {
  nuit: { top: [1.0, 0.45, 0.72], bot: [0.62, 0.32, 1.0], rim: [1.0, 0.82, 0.93] },
  jour: { top: [0.9, 0.09, 0.55], bot: [0.42, 0.12, 0.8], rim: [0.36, 0.1, 0.62] },
};

/** Cadrage (orthographique) : haut de scène à 2,30 m, bas à −0,30 m. Plus large que la planche (2,0 / −0,12) : bras à
 * l'horizontale (pose de Vitruve), les mains d'un homme de 1,82 m restent à 16 dp au moins des bords de 412 dp, même
 * tourné (recette du 27/10 : à 2,12 / −0,22, elles touchaient les bords). */
export const SCENE_HAUT = 2.3;
export const SCENE_BAS = -0.3;
export const SCENE_H = SCENE_HAUT - SCENE_BAS;
/** Hauteur de la zone du corps (dp) : la planche montre 470 sur 412 de large. */
export const HAUTEUR_CORPS = 470;
/** Rotation de repos (trois quarts) et balancement. */
export const ROTATION_REPOS = -0.1;
export const ROTATION_REDUIT = -0.16;
export const AMPLITUDE_BALANCE = 0.24;

export interface PlanCorps {
  /** Image minimale entre deux rendus (ms), 0 = à chaque image ; null = plus de rendu. */
  intervalleMs: number | null;
  /** Part de l'amplitude du balancement. */
  amplitude: number;
}

/** 30 i/s au plus pendant le balancement, 15 i/s et amplitude moitié au repos, plus rien ensuite ; fixe en mouvement réduit. */
export function planCorps(inactifMs: number, reduit: boolean): PlanCorps {
  if (reduit) return { intervalleMs: null, amplitude: 0 };
  const c: Cadence = cadenceAura(inactifMs);
  if (c === "arret") return { intervalleMs: null, amplitude: 0.5 };
  return c === "repos" ? { intervalleMs: 1000 / 15, amplitude: 0.5 } : { intervalleMs: 1000 / 30, amplitude: 1 };
}

/** Image du scan : 30 i/s au plus. */
export const INTERVALLE_SCAN_MS = 1000 / 30;

/**
 * Rien à dessiner : combien de temps (ms) la boucle du corps peut dormir avant la prochaine image possible (cadence du plan,
 * scan en cours, prochain scan), plutôt que de guetter chaque image (docs/AUDIT-PERF.md, M15). null : endormie jusqu'au
 * prochain geste (aucune image prévue).
 */
export function attenteCorps(plan: PlanCorps, depuisRenduMs: number, scanEnCours: boolean, avantScanMs: number): number | null {
  if (scanEnCours) return Math.max(0, INTERVALLE_SCAN_MS - 2 - depuisRenduMs);
  if (plan.intervalleMs == null) return null;
  return Math.max(0, Math.min(plan.intervalleMs - 2 - depuisRenduMs, avantScanMs));
}

/** Rotation du corps (rad) à l'instant `t` (s). */
export function rotationCorps(t: number, amplitude: number, reduit: boolean): number {
  return reduit ? ROTATION_REDUIT : Math.sin(t * 0.45) * AMPLITUDE_BALANCE * amplitude + ROTATION_REPOS;
}

/** Le corps est dessiné entre 1,65 et 1,82 m (la valeur affichée reste la vraie taille) : au-delà, l'envergure en pose
 * de Vitruve ne tient plus dans 412 dp ; en deçà, les épaules descendent au niveau des étiquettes du torse. */
export const TAILLE_CADRE_CM = { min: 165, max: 182 } as const;
export function tailleCadre(tailleCm: number): number {
  return Math.min(TAILLE_CADRE_CM.max, Math.max(TAILLE_CADRE_CM.min, tailleCm));
}

/** Ordonnée (dp, depuis le haut de la zone du corps) d'un point à la fraction `f` de la taille (0 = pieds, 1 = sommet de la tête). */
export function yCorps(f: number, tailleCm: number, hauteurPx = HAUTEUR_CORPS): number {
  const m = (tailleCadre(tailleCm) / 100) * f;
  return ((SCENE_HAUT - m) / SCENE_H) * hauteurPx;
}

/** Teinte du scan : clair de la partie Santé (rose très clair la nuit, rose vif le jour sur fond clair). */
export const COULEUR_SCAN: Record<ModeCouleur, [number, number, number]> = {
  nuit: [1.0, 0.86, 0.94],
  jour: [1.0, 0.31, 0.6],
};

/** Scan : 1,2 s de passage, à l'arrivée puis toutes les 8 à 12 s. */
export const SCAN = { dureeMs: 1200, entreMinMs: 8000, entreMaxMs: 12000 } as const;

/**
 * Hauteur de la bande (fraction de la taille, du haut 1,05 au bas −0,05, mouvement adouci) `ms` après le début du
 * passage ; null hors passage.
 */
export function hauteurScan(ms: number): number | null {
  if (ms < 0 || ms > SCAN.dureeMs) return null;
  const x = ms / SCAN.dureeMs;
  const e = x * x * (3 - 2 * x);
  return 1.05 - 1.1 * e;
}

/** Attente avant le prochain passage (aléa de 0 à 1). */
export function prochainScan(alea: number): number {
  return SCAN.entreMinMs + alea * (SCAN.entreMaxMs - SCAN.entreMinMs);
}

/**
 * Âme (planches/age-coeur, validée le 29/10) : l'Âge pepfit dans la poitrine, centre à 0,75 de la taille sur l'axe de rotation
 * (le corps tourne autour d'elle), carré de 2 × 0,15 m ; sa membrane fait 0,62 du demi-côté (R du shader). Le trait de sa case
 * arrive sur sa lisière côté épaule (angle −0,5 rad, 0,92 du rayon de la membrane).
 */
export const AME = { f: 0.75, rayon: 0.15, membrane: 0.62, angleTrait: -0.5 } as const;

/** Rotation du corps (degrés) jusqu'à laquelle l'âme est entière, et à partir de laquelle elle est éteinte. */
export const AME_FACE = { entiere: 50, eteinte: 100 } as const;

/**
 * Part visible de l'âme (et de sa lumière dans le verre) pour une rotation du corps `rotation` (rad) : entière de face et
 * pendant tout le balancement (planche age-coeur), elle s'éteint en fondu quand le corps se détourne, plus rien de dos
 * (Fold, 30/10 : elle se voyait à travers le dos). Sur l'axe de rotation, dans le corps de face comme de dos, la
 * profondeur ne peut pas la cacher : c'est l'orientation qui décide.
 */
export function faceAme(rotation: number): number {
  const c = Math.cos(rotation);
  const [c1, c0] = [Math.cos((AME_FACE.entiere * Math.PI) / 180), Math.cos((AME_FACE.eteinte * Math.PI) / 180)];
  const x = Math.min(1, Math.max(0, (c - c0) / (c1 - c0)));
  return x * x * (3 - 2 * x);
}
/** Largeur de référence des ancres (dp) : `dx` est une part de 412, le corps ne s'élargit pas avec l'écran. */
export const LARGEUR_ANCRES = 412;

/** Centre de l'âme dans la zone du corps (dp depuis le haut ; sur l'axe en x) et côté de son carré (dp). */
export function placeAme(tailleCm: number, hauteurPx = HAUTEUR_CORPS): { y: number; cote: number } {
  return { y: yCorps(AME.f, tailleCm, hauteurPx), cote: (2 * AME.rayon * hauteurPx) / SCENE_H };
}

/** Point de la lisière où arrive le trait de la case « Âge pepfit » : fraction de la taille et décalage (part de 412 dp). */
export function lisiereAme(tailleCm: number): { f: number; dx: number } {
  const r = 0.92 * AME.membrane * AME.rayon;
  const dpParM = HAUTEUR_CORPS / SCENE_H;
  return {
    f: AME.f - (Math.sin(AME.angleTrait) * r) / (tailleCadre(tailleCm) / 100),
    dx: (Math.cos(AME.angleTrait) * r * dpParM) / LARGEUR_ANCRES,
  };
}

/** Points du corps où se relient les valeurs (fraction de la taille). */
export const ANCRES = { tete: 0.93, sommet: 0.99, torse: 0.72, taille: 0.6, hanches: 0.52, pieds: 0.03 } as const;

/**
 * Rotation au doigt (Santé, retour du 27/10) : glissé horizontal = rotation autour de l'axe vertical, un peu
 * d'inertie au lâcher, puis retour doux face à l'écran après quelques secondes sans geste.
 */
export const ROTATION_DOIGT = {
  /** Un tour pour ~1,5 largeur d'écran (412 dp). */
  radParDp: (2 * Math.PI) / 620,
  /** Glissé pris au-delà de ce déplacement horizontal (dp), plus horizontal que vertical. */
  declenche: 8,
  /** Freinage de l'inertie (1/s) et vitesse sous laquelle elle s'arrête (rad/s). */
  frein: 3.2,
  arret: 0.03,
  /** Attente sans geste avant le retour (ms), puis rappel (1/s). */
  retourApresMs: 3000,
  rappel: 2.4,
  /** Vitesse de lancer plafonnée (rad/s). */
  vitesseMax: 9,
} as const;

export interface EtatRotation {
  /** Décalage dû au doigt (rad), ajouté au balancement. */
  angle: number;
  /** Inertie (rad/s). */
  vitesse: number;
  tenu: boolean;
  /** Fin du dernier geste (ms, horloge de l'appelant). */
  lache: number;
}

export const rotationRepos = (): EtatRotation => ({ angle: 0, vitesse: 0, tenu: false, lache: 0 });

/** Le glissé fait-il tourner le personnage (horizontal, au-delà du seuil) ? */
export function prendRotation(dx: number, dy: number): boolean {
  return Math.abs(dx) > ROTATION_DOIGT.declenche && Math.abs(dx) > 1.2 * Math.abs(dy);
}

/** Au lâcher : vitesse de lancer (rad/s) depuis la vitesse du doigt (dp/ms), nulle en mouvement réduit. */
export function lancer(vxDpParMs: number, reduit: boolean): number {
  if (reduit) return 0;
  const v = vxDpParMs * 1000 * ROTATION_DOIGT.radParDp;
  return Math.max(-ROTATION_DOIGT.vitesseMax, Math.min(ROTATION_DOIGT.vitesseMax, v));
}

/** Avance l'état de `dt` secondes à l'instant `maintenant` (ms) : inertie, puis retour face à l'écran (d'un coup en
 * mouvement réduit). Rend vrai s'il faut dessiner cette image. */
export function avancerRotation(r: EtatRotation, dt: number, maintenant: number, reduit: boolean): boolean {
  if (r.tenu) return true;
  if (r.vitesse !== 0) {
    r.angle += r.vitesse * dt;
    r.vitesse *= Math.exp(-ROTATION_DOIGT.frein * dt);
    if (Math.abs(r.vitesse) < ROTATION_DOIGT.arret) r.vitesse = 0;
    r.lache = maintenant; // l'attente part de la fin de l'élan
  }
  if (r.vitesse === 0 && r.angle !== 0 && maintenant - r.lache >= ROTATION_DOIGT.retourApresMs) {
    r.angle = Math.atan2(Math.sin(r.angle), Math.cos(r.angle)); // par le plus court chemin
    r.angle = reduit ? 0 : r.angle * Math.exp(-ROTATION_DOIGT.rappel * dt);
    if (Math.abs(r.angle) < 0.002) r.angle = 0;
  }
  // pendant l'attente, rien ne bouge : pas d'image à dessiner
  return r.vitesse !== 0 || (r.angle !== 0 && maintenant - r.lache >= ROTATION_DOIGT.retourApresMs);
}
