// Scène three.js de la vue 3D, sans rien de React Native : la même sert à l'appli (expo-gl) et à la vérification dans
// un navigateur. Reprend picto-3d/v4/visionneuse.html : lumières, caméra, et muscles allumés par le masque de
// l'écorché (texture de données, id du muscle dans R, présence dans G), une quinzaine de lignes injectées dans le
// matériau standard. Le personnage et le clip arrivent chargés ; la scène ne les libère pas (ils restent en cache).
// La femme a son propre squelette : le clip de l'homme lui est reciblé à chaque image (recibler.ts).
import * as THREE from "three";
import { etendueDe, position, type Etendue, type Orbite } from "./orbite";
import { recibler, type Recalage } from "./recibler";
import { reperesDepuisHauteurs, type ReperesClip } from "../../ecrans/tempo-horloge";

export interface Textures3D {
  masque: THREE.Texture;
  relief: THREE.Texture;
  cavite: THREE.Texture;
}

/** Ce qu'apporte un exercice : son animation, son agrès, ses muscles. */
export interface Clip3D {
  /** Scène du clip : ses os (ceux de l'homme) servent de fantôme au reciblage. */
  racine: THREE.Object3D;
  animation: THREE.AnimationClip;
  agres: THREE.Object3D[];
  principaux: string[];
  secondaires: string[];
}

/** Le personnage commun : la scène glTF et la table des muscles (id dans le masque, pas entre deux ids). */
export interface Personnage3D {
  racine: THREE.Object3D;
  muscles: Record<string, number>;
  pas: number;
  /** Autres proportions que l'homme des clips : clip reciblé. */
  reciblee: boolean;
  /** Force du relief et fond des sillons (cavité). */
  relief: number;
  cavite: number;
}

/** Fond, corps et muscles : fond et muscles viennent des jetons du thème (s2, muscle, muscle-2). */
export interface Couleurs3D {
  fond: string;
  corps: string;
  principal: string;
  secondaire: string;
}

export const CORPS = "#938b89"; // gris du corps, le même nuit et jour (picto-3d v4)

export interface Scene3D {
  rendre(renderer: THREE.WebGLRenderer): void;
  avancer(dtS: number): void;
  orbite(o: Orbite): void;
  taille(largeur: number, hauteur: number): void;
  couleurs(c: Couleurs3D): void;
  lecture(oui: boolean): void;
  /** Muscle mis en avant (null : aucun) et force du voile sur le reste, de 0 à 1 (voir focus.ts). */
  isoler(muscle: string | null, voile: number): void;
  /** Étendue du corps sur tout le clip et des agrès, pour le cadrage (mesurée à la création). */
  etendue(): Etendue;
  /** Pose le clip à `s` secondes (personnage au tempo : l'horloge du plein écran remplace `avancer`). */
  temps(s: number): void;
  /** Point haut, point bas et départ du clip (D6), mesurés une fois ; null si le clip ne s'y prête pas (boucle libre). */
  reperes(): ReperesClip | null;
  liberer(): void;
}

const INSTANTS = 8; // poses du clip mesurées pour le cadrage
const PAS_PEAU = 5; // un sommet sur 5 suffit

/** Mesure l'étendue du groupe sur toute la boucle (peau déformée par les os, agrès), puis remet le clip où il était. */
function mesurer(groupe: THREE.Group, action: THREE.AnimationAction, poser: () => void): Etendue {
  const tout = new THREE.Box3();
  const v = new THREE.Vector3();
  const boite = new THREE.Box3();
  const temps = action.time;
  const duree = action.getClip().duration;
  for (let k = 0; k < INSTANTS; k++) {
    action.time = (k / INSTANTS) * duree;
    poser();
    groupe.updateMatrixWorld(true);
    groupe.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
        const n = m.geometry.attributes.position!.count;
        for (let i = 0; i < n; i += PAS_PEAU) tout.expandByPoint(m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld));
      } else tout.union(boite.setFromObject(m));
    });
  }
  action.time = temps;
  poser();
  return etendueDe(tout.min, tout.max);
}

const PAS_REPERES = 36; // comme recibler.ts

/**
 * Hauteurs, sur la boucle, de la piste qui monte et descend le plus (os du personnage ou agrès : barre, mains, bassin),
 * puis remet le clip où il était. L'amplitude est rapportée à la taille du corps.
 */
function mesurerReperes(groupe: THREE.Group, action: THREE.AnimationAction, poser: () => void, taille: number): ReperesClip | null {
  const pistes: THREE.Object3D[] = [];
  groupe.traverse((o) => {
    if ((o as THREE.Bone).isBone || ((o as THREE.Mesh).isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh)) pistes.push(o);
  });
  if (!pistes.length) return null;
  const temps = action.time;
  const duree = action.getClip().duration;
  const y: number[][] = pistes.map(() => []);
  const v = new THREE.Vector3();
  for (let k = 0; k < PAS_REPERES; k++) {
    action.time = (k / PAS_REPERES) * duree;
    poser();
    groupe.updateMatrixWorld(true);
    pistes.forEach((o, i) => y[i]!.push(o.getWorldPosition(v).y / Math.max(1e-6, taille)));
  }
  action.time = temps;
  poser();
  const ecart = (h: number[]) => Math.max(...h) - Math.min(...h);
  const meilleure = y.reduce((a, b) => (ecart(b) > ecart(a) ? b : a));
  return reperesDepuisHauteurs(meilleure, duree);
}

const FRAGMENT = `#include <color_fragment>
  // même canal UV que la normal map. Les ids ne se mélangent pas : on lit les 4 texels voisins et on filtre
  // « allumé en principal » et « allumé en secondaire », pas l'id lui-même
  ivec2 taille = textureSize(uMasque, 0);
  vec2 t = vNormalMapUv * vec2(taille) - 0.5;
  ivec2 i0 = ivec2(floor(t));
  vec2 f = fract(t);
  float wp = 0.0, ws = 0.0, wi = 0.0;
  for (int k = 0; k < 4; k++) {
    ivec2 o = ivec2(k & 1, k >> 1);
    int id = int(floor(texelFetch(uMasque, clamp(i0 + o, ivec2(0), taille - 1), 0).r * 255.0 / uPas + 0.5));
    float r = (id > 0 && id < 32) ? uRole[id] : 0.0;
    float w = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y);
    wp += w * step(0.5, r) * step(r, 1.5);
    ws += w * step(1.5, r);
    wi += w * float(id == int(uIsole + 0.5));
  }
  float dans = smoothstep(0.45, 0.62, texture2D(uMasque, vNormalMapUv).g);
  diffuseColor.rgb = mix(diffuseColor.rgb, uP, dans * wp);
  diffuseColor.rgb = mix(diffuseColor.rgb, uS, dans * ws);
  float isole = dans * wi; // muscle mis en avant : épargné par le voile
  #ifdef USE_AOMAP
    diffuseColor.rgb *= mix(uCav, 1.0, texture2D(aoMap, vAoMapUv).r); // sillons sombres, comme le rendu Blender
  #endif`;

/** Voile (muscle mis en avant) : la couleur finale tend vers le fond, une fausse transparence sans tri des faces. */
const VOILE = `uniform float uVoile;
uniform vec3 uFond;`;
const OPACITE_VOILEE = 0.25;
const voiler = (epargne: string) => `gl_FragColor.rgb = mix(gl_FragColor.rgb, uFond, ${(1 - OPACITE_VOILEE).toFixed(2)} * uVoile * (1.0 - ${epargne}));
#include <tonemapping_fragment>`;

/** `recalage` : celui du clip pour un personnage reciblé (vide s'il n'y en a pas), ignoré pour l'homme. */
export function creerScene(perso: Personnage3D, clip: Clip3D, tex: Textures3D, recalage: Recalage | null = null): Scene3D {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

  // Lumières reprises du rendu Blender (clé haute à gauche, deux contre-jours), plus fortes : sans rebonds, three.js
  // rendrait le corps bien plus sombre que les pictos
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5550, 1.6));
  for (const [force, x, y, z] of [[3.2, -2.4, 4.6, -1.6], [1.3, 2.2, 3.2, 2.2], [0.8, -2.2, 2.4, 2.0]] as const) {
    const l = new THREE.DirectionalLight(0xffffff, force);
    l.position.set(x, y, z);
    scene.add(l);
  }

  const role = new Array<number>(32).fill(0);
  for (const m of clip.principaux) if (perso.muscles[m] != null) role[perso.muscles[m]] = 1;
  for (const m of clip.secondaires) if (perso.muscles[m] != null) role[perso.muscles[m]] = 2;
  const uniformes = {
    uRole: { value: role },
    uP: { value: new THREE.Color() },
    uS: { value: new THREE.Color() },
    uMasque: { value: tex.masque },
    uPas: { value: perso.pas },
    uIsole: { value: 0 },
    uVoile: { value: 0 },
    uFond: { value: new THREE.Color() },
    uCav: { value: perso.cavite },
  };
  const corps = new THREE.MeshStandardMaterial({
    roughness: 0.6,
    metalness: 0,
    normalMap: tex.relief,
    normalScale: new THREE.Vector2(perso.relief, perso.relief),
    aoMap: tex.cavite,
  });
  corps.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniformes);
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uRole[32];\nuniform vec3 uP;\nuniform vec3 uS;\nuniform sampler2D uMasque;\nuniform float uPas;\nuniform float uIsole;\nuniform float uCav;\n${VOILE}`)
      .replace("#include <color_fragment>", FRAGMENT)
      // le muscle mis en avant luit un peu, pour bien ressortir sur le corps estompé
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.35 * isole * uVoile;")
      .replace("#include <tonemapping_fragment>", voiler("isole"));
  };
  // agrès (matériaux du clip, gardés en cache d'une ouverture à l'autre) : estompés eux aussi
  for (const a of clip.agres) {
    a.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!m || Array.isArray(m)) return;
      m.onBeforeCompile = (s) => {
        Object.assign(s.uniforms, { uVoile: uniformes.uVoile, uFond: uniformes.uFond });
        s.fragmentShader = s.fragmentShader
          .replace("#include <common>", `#include <common>\n${VOILE}`)
          .replace("#include <tonemapping_fragment>", voiler("0.0"));
      };
      m.needsUpdate = true; // nouvelle scène : nouveaux uniformes
    });
  }
  perso.racine.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).material = corps;
  });
  // Personnage et agrès sous un même groupe : les pistes des pièces mobiles (barre, corde, haltères) trouvent leur cible.
  const groupe = new THREE.Group();
  const cible = perso.reciblee
    ? recibler(THREE, { perso: perso.racine, clip: { scene: clip.racine, animations: [clip.animation] }, agres: clip.agres as THREE.Mesh[], recalage: recalage ?? {} })
    : null;
  if (cible) groupe.add(cible.conteneur);
  else groupe.add(perso.racine, ...clip.agres);
  scene.add(groupe);

  const melangeur = new THREE.AnimationMixer(groupe);
  const action = melangeur.clipAction(cible?.animation ?? clip.animation).play();
  // mélangeur, puis reciblage (bassin, mains, pieds, agrès portés)
  const poser = (dt = 0) => {
    melangeur.update(dt);
    cible?.apres(action.time);
  };
  const etendue = mesurer(groupe, action, poser);
  let reperes: ReperesClip | null | undefined;

  return {
    rendre: (renderer) => renderer.render(scene, camera),
    avancer: (dt) => poser(dt),
    orbite(o) {
      const c = etendue.centre; // viser le centre du contenu, pas l'origine ni les pieds
      const p = position(o, c);
      camera.position.set(p.x, p.y, p.z);
      camera.lookAt(c.x, c.y, c.z);
    },
    taille(largeur, hauteur) {
      camera.aspect = largeur / Math.max(1, hauteur);
      camera.updateProjectionMatrix();
    },
    couleurs(c) {
      scene.background = new THREE.Color(c.fond);
      uniformes.uFond.value.set(c.fond);
      corps.color.set(c.corps);
      uniformes.uP.value.set(c.principal);
      uniformes.uS.value.set(c.secondaire);
    },
    lecture(oui) {
      action.paused = !oui;
    },
    etendue: () => etendue,
    temps(s) {
      action.time = s;
      poser();
    },
    reperes() {
      if (reperes === undefined) reperes = mesurerReperes(groupe, action, poser, 2 * etendue.demiHauteur);
      return reperes;
    },
    isoler(muscle, v) {
      uniformes.uIsole.value = (muscle && perso.muscles[muscle]) || 0;
      uniformes.uVoile.value = uniformes.uIsole.value ? v : 0;
    },
    liberer() {
      melangeur.stopAllAction();
      melangeur.uncacheRoot(groupe);
      cible?.liberer();
      groupe.clear();
      scene.remove(groupe); // personnage et agrès restent en cache pour la prochaine ouverture
      corps.dispose();
    },
  };
}
