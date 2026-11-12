// Personnage de Santé dans un contexte GL : ses matières et son montage, sans rien de React Native (testés sous Node,
// tests/corps-transparence.test.ts).
// Le personnage en cache (charger.ts) n'est jamais monté tel quel : chaque contexte a sa copie (os compris), où il pose sa
// matière et sa prépasse. Monté tel quel, deux contextes vivants en même temps (Santé gardé monté, docs/PERF-C.md, M7 ; la zone
// d'une blessure par-dessus) se le prenaient : le second retenait la prépasse du premier pour peau, l'ancienne peau gardait son
// verre, et le corps doublait de couches (rose opaque, deux fois plus clair, âme cachée : docs/CORPS-TRANSPARENCE.md).
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { preparerCorps } from "./pose";
import { FRAG_PICK, VERT_ZONES } from "./verre-zones";
import { SCENE_H } from "./verre";

/**
 * Verre : sans précaution, les faces internes du corps (bouche, orbites, plis) se voient à travers la peau et le tri dans un
 * même maillage dessine des taches au visage. Prépasse de profondeur (même peau, couleur coupée), puis le verre sur la seule
 * surface la plus proche (LessEqual, sans écrire la profondeur), faces avant seulement. Translucide par son shader (alpha 0,46
 * de face à 0,92 au bord), mélange normal non prémultiplié. `identifiants` : passe du toucher, jamais montrée ni mélangée.
 */
export function matieresVerre(uniformes: Record<string, THREE.IUniform>, fragVerre: string, prepasse: boolean) {
  const verre = new THREE.ShaderMaterial({ uniforms: uniformes, vertexShader: VERT_ZONES, fragmentShader: fragVerre,
    transparent: true, depthWrite: !prepasse, depthFunc: THREE.LessEqualDepth, side: THREE.FrontSide });
  const identifiants = new THREE.ShaderMaterial({ uniforms: uniformes, vertexShader: VERT_ZONES, fragmentShader: FRAG_PICK, blending: THREE.NoBlending,
    depthFunc: THREE.LessEqualDepth, side: THREE.FrontSide });
  const profondeur = new THREE.ShaderMaterial({ uniforms: uniformes, vertexShader: VERT_ZONES, fragmentShader: "void main() { gl_FragColor = vec4(0.0); }",
    colorWrite: false, side: THREE.FrontSide });
  return { verre, identifiants, profondeur };
}

/**
 * Copie du personnage en cache pour un contexte, sa peau en `verre`, et sa prépasse (`profondeur`, même géométrie, mêmes os)
 * si elle est demandée. La copie part avec son contexte ; le cache reste intact pour le suivant.
 */
export function monterCorps(cache: THREE.Object3D, verre: THREE.Material, profondeur: THREE.Material | null) {
  const racine = clone(cache);
  const { mesh, hBase, pied } = preparerCorps(racine);
  mesh.material = verre;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  let ombre: THREE.SkinnedMesh | null = null;
  if (profondeur) {
    ombre = mesh.clone(); // même géométrie, même squelette
    ombre.material = profondeur;
    ombre.renderOrder = 0;
    mesh.parent!.add(ombre);
  }
  return { racine, mesh, ombre, hBase, pied };
}

/**
 * Surface du corps (px) d'après sa mise en page (dp) : expo-gl garde drawingBufferWidth/Height de la création du contexte, et
 * le contexte gardé (perf C) survit au pliage, au dépliage et à la rotation ; seule la mise en page dit la nouvelle taille
 * (comme Vue3D). null tant qu'elle n'est pas connue.
 */
export function surfaceCorps(taille: { l: number; h: number }, pxParDp: (dp: number) => number): { l: number; h: number } | null {
  if (taille.l <= 1 || taille.h <= 1) return null;
  return { l: pxParDp(taille.l), h: pxParDp(taille.h) };
}

/** Caméra du corps cadrée sur la hauteur de la scène pour une surface de l × h px : le corps reste au milieu, à la même taille. */
export function cadrerCorps(cam: THREE.OrthographicCamera, l: number, h: number) {
  const demi = (SCENE_H * (l / Math.max(1, h))) / 2;
  cam.left = -demi;
  cam.right = demi;
  cam.updateProjectionMatrix();
}
