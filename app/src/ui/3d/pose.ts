// Pose de repos du personnage de Santé, sans rien de React Native (testée sous Node avec le GLB de l'appli).
import * as THREE from "three";

/** Angles de la pose de Vitruve : bras à l'horizontale (correction d'Alex, 27/10), jambes écartées (degrés). */
export const POSE_VITRUVE = { bras: 0, jambes: 9 };

/** Tourne un os d'un angle (rad) autour d'un axe du monde ; ses enfants suivent. */
function tourner(os: THREE.Object3D, axe: THREE.Vector3, angle: number) {
  const rot = new THREE.Quaternion().setFromAxisAngle(axe.clone().normalize(), angle);
  const p = new THREE.Quaternion(), w = new THREE.Quaternion();
  os.parent!.getWorldQuaternion(p);
  os.getWorldQuaternion(w);
  os.quaternion.copy(p.invert().multiply(w.premultiply(rot)));
  os.updateMatrixWorld(true);
}

const monde = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

/** Normale de la paume (monde) : travers de la main (index → auriculaire) × axe (poignet → majeur), comme rendre.py. */
export function normalePaume(os: Record<string, THREE.Object3D>, c: "L" | "R"): THREE.Vector3 {
  const axe = monde(os[`majeur1${c}`]!).sub(monde(os[`main${c}`]!)).normalize();
  const travers = monde(os[`auriculaire1${c}`]!).sub(monde(os[`index1${c}`]!));
  return (c === "L" ? travers.cross(axe) : axe.cross(travers)).normalize();
}

/** Oriente un os (repère monde) pour que sa direction tête → enfant aille vers `vers`, les autres os suivent. */
function orienter(os: THREE.Object3D, enfant: THREE.Object3D, vers: THREE.Vector3) {
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  os.getWorldPosition(a);
  enfant.getWorldPosition(b);
  const rot = new THREE.Quaternion().setFromUnitVectors(b.sub(a).normalize(), vers.clone().normalize());
  const p = new THREE.Quaternion(), w = new THREE.Quaternion();
  os.parent!.getWorldQuaternion(p);
  os.getWorldQuaternion(w);
  os.quaternion.copy(p.invert().multiply(w.premultiply(rot)));
  os.updateMatrixWorld(true);
}

/** Le modèle est en A : pose « homme de Vitruve » (dans l'appli, un clip pose les exercices ; ici, repos). Bras et
 * avant-bras alignés, à l'horizontale ; cuisses écartées, jambes dans leur axe. Comptée dans le repère du personnage :
 * Santé la rejoue à chaque nouveau rendu de l'écran, le corps tourné dans son pivot ; comptée dans le repère du monde,
 * elle visait les côtés de l'écran et, corps de profil, pliait les deux bras vers l'avant (Fold, 30/10). Le pivot est
 * donc écarté le temps du calcul. */
export function poseVitruve(racine: THREE.Object3D, brasDeg: number = POSE_VITRUVE.bras) {
  const pivot = racine.parent;
  racine.parent = null;
  try {
    poser(racine, brasDeg);
  } finally {
    racine.parent = pivot;
    racine.updateMatrixWorld(true);
  }
}

function poser(racine: THREE.Object3D, brasDeg: number) {
  racine.updateMatrixWorld(true);
  const os: Record<string, THREE.Object3D> = {};
  racine.traverse((o) => {
    if ((o as THREE.Bone).isBone) os[o.name] = o;
  });
  const r = THREE.MathUtils.degToRad;
  for (const c of ["L", "R"] as const) {
    const s = os[`bras${c}`] && os[`avant_bras${c}`] ? 1 : 0;
    if (!s) continue;
    const x = new THREE.Vector3();
    os[`bras${c}`]!.getWorldPosition(x);
    const cote = Math.sign(x.x) || (c === "L" ? 1 : -1);
    const bras = new THREE.Vector3(cote * Math.cos(r(brasDeg)), Math.sin(r(brasDeg)), 0);
    orienter(os[`bras${c}`]!, os[`avant_bras${c}`]!, bras);
    if (os[`main${c}`]) orienter(os[`avant_bras${c}`]!, os[`main${c}`]!, bras);
    const jambe = new THREE.Vector3(cote * Math.sin(r(POSE_VITRUVE.jambes)), -Math.cos(r(POSE_VITRUVE.jambes)), 0);
    if (os[`cuisse${c}`] && os[`jambe${c}`]) orienter(os[`cuisse${c}`]!, os[`jambe${c}`]!, jambe);
    if (os[`jambe${c}`] && os[`pied${c}`]) orienter(os[`jambe${c}`]!, os[`pied${c}`]!, jambe);
    if (os[`main${c}`] && os[`majeur1${c}`] && os[`index1${c}`] && os[`auriculaire1${c}`]) paumeDevant(os, c, bras);
  }
  racine.updateMatrixWorld(true);
}


/** Paume face à l'écran (+z), doigts un peu écartés : la rotation autour de l'axe du bras se partage entre l'avant-bras
 * (supination, 60 %) et la main (40 %), pour ne pas tordre la peau du poignet. */
function paumeDevant(os: Record<string, THREE.Object3D>, c: "L" | "R", axe: THREE.Vector3) {
  const a = axe.clone().normalize();
  const plan = (v: THREE.Vector3) => v.clone().addScaledVector(a, -v.dot(a)).normalize();
  const n = plan(normalePaume(os, c)), cible = plan(new THREE.Vector3(0, 0, 1));
  const angle = Math.atan2(a.dot(n.clone().cross(cible)), n.dot(cible));
  tourner(os[`avant_bras${c}`]!, a, angle * 0.6);
  tourner(os[`main${c}`]!, a, angle * 0.4);
  // éventail : chaque doigt tourne autour de la normale de la paume, l'index vers le pouce, l'auriculaire vers l'extérieur
  const p = normalePaume(os, c);
  const ecart: Record<string, number> = { index: 7, majeur: 0, annulaire: -6, auriculaire: -12 };
  for (const [d, deg] of Object.entries(ecart)) {
    const o = os[`${d}1${c}`];
    if (!o || !deg) continue;
    // la pose est rejouée à chaque changement de taille : l'écart part toujours du repos du doigt. Gardé en tableau : la copie
    // du personnage par contexte (corps-gl.ts) passe userData par JSON, où un Quaternion devient un tableau
    const repos = ((o.userData as { repos?: number[] }).repos ??= o.quaternion.toArray());
    o.quaternion.fromArray(repos);
    o.updateMatrixWorld(true);
    tourner(o, p, THREE.MathUtils.degToRad(deg) * (c === "L" ? -1 : 1));
  }
}

/** Épaule gauche (tête de l'os du bras) dans le repère du personnage, en m. */
export function epaule(racine: THREE.Object3D): THREE.Vector3 {
  racine.updateMatrixWorld(true);
  let o: THREE.Object3D | undefined;
  racine.traverse((x) => {
    if (x.name === "brasL") o = x;
  });
  const v = new THREE.Vector3();
  if (!o) return v;
  const inv = racine.matrixWorld.clone().invert();
  return o.getWorldPosition(v).applyMatrix4(inv);
}

/** Mesure faite une fois par personnage (le GLB est en cache) : pose de repos, hauteur et pied du modèle ; et sa peau.
 * Faite d'avance par le préchargement de Santé (CorpsSante, prechargerCorpsSante), sinon à la première image. */
export function preparerCorps(racine: THREE.Object3D): { mesh: THREE.SkinnedMesh; hBase: number; pied: number } {
  const u = racine.userData as { repos?: { hBase: number; pied: number } };
  if (!u.repos) {
    poseVitruve(racine);
    const box = new THREE.Box3().setFromObject(racine);
    u.repos = { hBase: box.max.y - box.min.y, pied: box.min.y };
  }
  let mesh: THREE.SkinnedMesh | null = null;
  racine.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh;
  });
  if (!mesh) throw new Error("no skinned mesh");
  return { mesh, ...u.repos };
}
