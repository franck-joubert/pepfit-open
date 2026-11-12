// Âme de l'Âge pepfit au cœur du personnage de Santé (planches/age-coeur, validée le 29/10). La signature « Souffle » en
// version légère (ame-glsl.ts, `#define LEGER`) sur un carré face à la caméra, dans la poitrine, sur l'axe de rotation : le
// corps tourne autour d'elle sans la déplacer. Elle est dessinée avant le verre, qui la teinte, et le verre reçoit sa lumière
// (GLSL_VERRE_AME). Ses horloges n'avancent que quand le corps se redessine : même cadence que lui (30 i/s, 15 au repos,
// rien après 14 s ni hors écran), image fixe en mouvement réduit. Sans rien de React Native.
import * as THREE from "three";
import { allureRythme, teintesAge, type Rvb } from "../signature-age/couleur";
import { battementLarge } from "../signature-age/battement";
import { GLSL_AME, GLSL_VERRE_AME } from "./ame-glsl";
import { AME } from "./verre";
import type { HorlogesAme } from "./vol-ame";

export { AME };
const PERIODE_SOUFFLE = 5.5;

export interface DonneesAme {
  /** Âge pepfit − âge réel (années). */
  ecart: number;
  /** Rythme de vieillissement (−1…3, 1 = normal). */
  rythme: number;
  /** FC de repos (null : inconnue, pas de battement inventé). */
  fc: number | null;
}

const VERT = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// coordonnées du shader : centre 0, rayon 1, y vers le bas (comme le canevas Skia de la signature)
// uVu : part visible, le corps détourné la cache (faceAme) ; sortie prémultipliée, tout se multiplie
const FRAG = `#define LEGER\n${GLSL_AME}\nuniform float uVu;\nvarying vec2 vUv;\nvoid main() { gl_FragColor = rendu(vec2(vUv.x - 0.5, 0.5 - vUv.y) * 2.0) * uVu; }`;
/** Shaders de l'âme (tests : compilation hors appareil). */
export const SHADERS_AME = { VERT, FRAG } as const;

/** Le fragment du verre, avec la lumière de l'âme (avant le scan : la bande passe dessus ; les zones blessées restent au-dessus).
 * Le sillon (cavité) est gardé dans une variable : la lumière le reprend sans relire la texture. */
export function verreAvecAme(frag: string): string {
  return frag
    .replace("void main() {", "uniform vec4 uAme; uniform vec3 uAmeVifF; uniform vec3 uAmeVifC; uniform vec3 uAmeProfF; uniform vec3 uAmeProfC;\nuniform float uAmeChaud; uniform float uAmePouls; uniform float uAmeJour;\nvoid main() {")
    .replace("  if (uForce > 0.0) col *= mix(uCav, 1.0, texture2D(uCavite, vUv).r);", "  float sillon = uForce > 0.0 ? mix(uCav, 1.0, texture2D(uCavite, vUv).r) : 1.0;\n  col *= sillon;")
    .replace("  // scan :", `${GLSL_VERRE_AME}\n  // scan :`);
}

/** Uniformes du verre pour l'âme (à fusionner avec ceux du verre). */
export function uniformesVerreAme() {
  return {
    uAme: { value: new THREE.Vector4(0, 0, 1, 0) },
    uAmeVifF: { value: new THREE.Vector3() },
    uAmeVifC: { value: new THREE.Vector3() },
    uAmeProfF: { value: new THREE.Vector3() },
    uAmeProfC: { value: new THREE.Vector3() },
    uAmeChaud: { value: 0 },
    uAmePouls: { value: 0 },
    /** 1 le jour : l'âme teinte le verre comme une encre ; la nuit, comme une lumière. */
    uAmeJour: { value: 0 },
  };
}


export interface Ame {
  mesh: THREE.Mesh;
  /** Ses horloges à cet instant (la signature qui vole reprend au même point). */
  horloges(): HorlogesAme;
  /** Avance les horloges de `dt` s (rien en mouvement réduit) et pose les uniformes de l'âme et du verre. */
  avancer(dt: number, d: DonneesAme, reduit: boolean): void;
  /** Part visible (0 à 1) : le corps détourné la cache (faceAme). */
  voiler(part: number): void;
  /** Place l'âme dans la poitrine d'un corps de `tailleM` m, et calcule sa place à l'écran (tampon de `l` × `h` px). */
  placer(tailleM: number, cam: THREE.OrthographicCamera, l: number, h: number): void;
  dispose(): void;
}

export function creerAme(verre: ReturnType<typeof uniformesVerreAme>): Ame {
  const u = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uPx: { value: 0.02 },
    uT: { value: 3 },
    uAgit: { value: 0 },
    uSouffle: { value: 0 },
    uBat: { value: 0 },
    uOnde: { value: 1 },
    uOndeAmp: { value: 0 },
    uChaud: { value: 0 },
    uEclat: { value: 1 },
    uFond: { value: new THREE.Vector3() },
    uFP: { value: new THREE.Vector3() },
    uFV: { value: new THREE.Vector3() },
    uCP: { value: new THREE.Vector3() },
    uCV: { value: new THREE.Vector3() },
    uLeger: { value: 1 },
    uVu: { value: 1 },
  };
  // sortie prémultipliée : « par-dessus » en (1, 1 − alpha)
  const matiere = new THREE.ShaderMaterial({
    uniforms: u, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const geo = new THREE.PlaneGeometry(2 * AME.rayon, 2 * AME.rayon);
  const mesh = new THREE.Mesh(geo, matiere);
  mesh.renderOrder = -1; // avant la prépasse et le verre
  mesh.frustumCulled = false;
  const horloge = { forme: 3, reel: 0, phase: 0, rythme: 1 };
  const v3 = (v: THREE.Vector3, c: Rvb) => v.set(c[0], c[1], c[2]);
  return {
    mesh,
    horloges: () => ({ forme: horloge.forme, reel: horloge.reel, phase: horloge.phase }),
    avancer(dt, d, reduit) {
      if (!reduit) {
        // rythme lissé : un changement accélère la forme sans la faire sauter
        horloge.rythme += (d.rythme - horloge.rythme) * (1 - Math.exp(-dt * 3));
        horloge.forme += dt * allureRythme(horloge.rythme).vitesse;
        horloge.reel += dt;
        horloge.phase += (dt * (d.fc ?? 0)) / 60;
      }
      const te = teintesAge(d.ecart);
      const souffle = reduit ? 0 : Math.sin((horloge.reel * 2 * Math.PI) / PERIODE_SOUFFLE);
      const bat = reduit || d.fc == null ? 0 : battementLarge(horloge.phase);
      u.uT.value = horloge.forme;
      u.uAgit.value = reduit ? 0 : allureRythme(horloge.rythme).agitation;
      u.uSouffle.value = souffle;
      u.uBat.value = bat;
      u.uChaud.value = te.chaud;
      u.uEclat.value = te.eclat;
      v3(u.uFP.value, te.froidProfond);
      v3(u.uFV.value, te.froidVif);
      v3(u.uCP.value, te.chaudProfond);
      v3(u.uCV.value, te.chaudVif);
      v3(verre.uAmeVifF.value, te.froidVif);
      v3(verre.uAmeVifC.value, te.chaudVif);
      v3(verre.uAmeProfF.value, te.froidProfond);
      v3(verre.uAmeProfC.value, te.chaudProfond);
      verre.uAmeChaud.value = te.chaud;
      verre.uAmePouls.value = 0.5 + 0.5 * souffle + 0.5 * bat;
    },
    voiler(part) {
      u.uVu.value = part;
    },
    placer(tailleM, cam, l, h) {
      mesh.position.set(0, AME.f * tailleM, 0);
      const pxParM = h / (cam.top - cam.bottom);
      u.uPx.value = 2 / (2 * AME.rayon * pxParM); // anticrénelage : un pixel en unités du carré
      const c = mesh.position.clone().project(cam);
      verre.uAme.value.set(((c.x + 1) / 2) * l, ((c.y + 1) / 2) * h, AME.membrane * AME.rayon * pxParM, 1);
    },
    dispose() {
      geo.dispose();
      matiere.dispose();
    },
  };
}
