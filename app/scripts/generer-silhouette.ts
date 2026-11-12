// Silhouettes du personnage de Santé (homme, femme) montrées pendant le chargement du corps 3D (30/10 : une forme
// simple en opacité, sans GL). Le vrai modèle, en pose de Vitruve et rotation de repos, projeté comme à l'écran, rastérisé,
// contour extérieur suivi puis simplifié (Douglas-Peucker, ~1 dp). Écrit src/ui/3d/silhouette.ts.
// Lancer : node --experimental-strip-types --import ./tests/resolveur.mjs scripts/generer-silhouette.ts
import { readFileSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { poseVitruve } from "../src/ui/3d/pose.ts";
import { ROTATION_REPOS } from "../src/ui/3d/verre.ts";

const LIGNES = 520; // pas de la grille : 1/500 de la taille (≈ 0,65 dp)
const FERMETURE = 2; // cases : doigts et fentes fermés
const EPSILON = 0.003; // simplification, en part de la taille (≈ 1 dp)

type Pt = [number, number];

async function silhouette(fichier: string): Promise<Pt[]> {
  const o = readFileSync(new URL(`../assets/3d/${fichier}.glb`, import.meta.url));
  const g = await new GLTFLoader().parseAsync(o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength) as ArrayBuffer, "");
  poseVitruve(g.scene);
  let peau!: THREE.SkinnedMesh;
  g.scene.traverse((x) => {
    if ((x as THREE.SkinnedMesh).isSkinnedMesh) peau = x as THREE.SkinnedMesh;
  });
  g.scene.updateMatrixWorld(true);
  // sommets déformés, tournés comme au repos (pivot.rotation.y), vus de face (x écran, y haut)
  const n = peau.geometry.attributes.position!.count;
  const v = new THREE.Vector3();
  const [c, s] = [Math.cos(ROTATION_REPOS), Math.sin(ROTATION_REPOS)];
  const xy = new Float64Array(2 * n);
  let bas = Infinity, haut = -Infinity;
  for (let i = 0; i < n; i++) {
    peau.getVertexPosition(i, v).applyMatrix4(peau.matrixWorld);
    xy[2 * i] = v.x * c + v.z * s;
    xy[2 * i + 1] = v.y;
    bas = Math.min(bas, v.y);
    haut = Math.max(haut, v.y);
  }
  // en part de la taille : u (0 sur l'axe de rotation), v (0 aux pieds, 1 au sommet)
  const H = haut - bas;
  for (let i = 0; i < n; i++) {
    xy[2 * i] = xy[2 * i]! / H;
    xy[2 * i + 1] = (xy[2 * i + 1]! - bas) / H;
  }
  // grille : ligne 0 en haut (v = 1,02), colonne 0 à gauche (u = −0,65)
  const pas = 1.04 / LIGNES, u0 = -0.65, v0 = 1.02;
  const COL = Math.ceil(1.3 / pas);
  const plein = new Uint8Array(LIGNES * COL);
  const idx = peau.geometry.index!;
  for (let t = 0; t < idx.count; t += 3) {
    const [a, b, d] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
    const P = [a, b, d].map((k) => [(xy[2 * k]! - u0) / pas, (v0 - xy[2 * k + 1]!) / pas] as Pt);
    const [x0, x1] = [Math.floor(Math.min(...P.map((p) => p[0]))), Math.ceil(Math.max(...P.map((p) => p[0])))];
    const [y0, y1] = [Math.floor(Math.min(...P.map((p) => p[1]))), Math.ceil(Math.max(...P.map((p) => p[1])))];
    const bord = (p: Pt, q: Pt, x: number, y: number) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    for (let y = Math.max(0, y0); y <= Math.min(LIGNES - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(COL - 1, x1); x++) {
        const e0 = bord(P[0]!, P[1]!, x + 0.5, y + 0.5), e1 = bord(P[1]!, P[2]!, x + 0.5, y + 0.5), e2 = bord(P[2]!, P[0]!, x + 0.5, y + 0.5);
        if ((e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0)) plein[y * COL + x] = 1;
      }
  }
  const fermee = eroder(dilater(plein, COL, FERMETURE), COL, FERMETURE);
  return simplifier(contour(fermee, COL).map(([y, x]) => [u0 + (x + 0.5) * pas, v0 - (y + 0.5) * pas] as Pt), EPSILON);
}

function dilater(g: Uint8Array, col: number, r: number): Uint8Array {
  const lignes = g.length / col, s = new Uint8Array(g.length);
  for (let y = 0; y < lignes; y++)
    for (let x = 0; x < col; x++) {
      let v = 0;
      for (let dy = -r; dy <= r && !v; dy++)
        for (let dx = -r; dx <= r && !v; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < lignes && xx >= 0 && xx < col && dx * dx + dy * dy <= r * r) v = g[yy * col + xx]!;
        }
      s[y * col + x] = v;
    }
  return s;
}

function eroder(g: Uint8Array, col: number, r: number): Uint8Array {
  const inv = g.map((v) => 1 - v);
  return dilater(inv, col, r).map((v) => 1 - v);
}

/** Contour extérieur (voisinage de Moore, sens horaire) de la forme qui contient le premier point plein, en [ligne, colonne]. */
function contour(g: Uint8Array, col: number): Pt[] {
  const lignes = g.length / col;
  const plein = (y: number, x: number) => y >= 0 && y < lignes && x >= 0 && x < col && g[y * col + x] === 1;
  let depart: Pt | null = null;
  for (let y = 0; y < lignes && !depart; y++)
    for (let x = 0; x < col; x++)
      if (plein(y, x)) {
        depart = [y, x];
        break;
      }
  if (!depart) throw new Error("silhouette vide");
  // voisins dans le sens horaire, à partir de l'ouest
  const D: Pt[] = [[0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1]];
  const pts: Pt[] = [depart];
  let p = depart, retour = 0; // retour : direction (dans D) de la case vide d'où l'on vient
  for (let pasMax = 0; pasMax < 200000; pasMax++) {
    let trouve = -1;
    for (let k = 1; k <= 8; k++) {
      const i = (retour + k) % 8;
      if (plein(p[0] + D[i]![0], p[1] + D[i]![1])) {
        trouve = i;
        break;
      }
    }
    if (trouve < 0) break; // point isolé
    const q: Pt = [p[0] + D[trouve]![0], p[1] + D[trouve]![1]];
    // la case vide précédente, vue depuis q
    const prec = (trouve + 7) % 8;
    const vide: Pt = [p[0] + D[prec]![0], p[1] + D[prec]![1]];
    retour = D.findIndex((d) => d[0] === vide[0] - q[0] && d[1] === vide[1] - q[1]);
    p = q;
    if (p[0] === depart[0] && p[1] === depart[1]) break;
    pts.push(p);
  }
  return pts;
}

/** Douglas-Peucker sur un contour fermé (coupé en deux au point le plus loin du départ). */
function simplifier(pts: Pt[], eps: number): Pt[] {
  const dp = (a: Pt[]): Pt[] => {
    if (a.length < 3) return a;
    const [p, q] = [a[0]!, a[a.length - 1]!];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1e-9;
    let iMax = 0, dMax = 0;
    for (let i = 1; i < a.length - 1; i++) {
      const d = Math.abs((q[0] - p[0]) * (p[1] - a[i]![1]) - (p[0] - a[i]![0]) * (q[1] - p[1])) / l;
      if (d > dMax) [dMax, iMax] = [d, i];
    }
    if (dMax <= eps) return [p, q];
    return [...dp(a.slice(0, iMax + 1)).slice(0, -1), ...dp(a.slice(iMax))];
  };
  let loin = 0;
  pts.forEach((q, i) => {
    if (Math.hypot(q[0] - pts[0]![0], q[1] - pts[0]![1]) > Math.hypot(pts[loin]![0] - pts[0]![0], pts[loin]![1] - pts[0]![1])) loin = i;
  });
  return [...dp(pts.slice(0, loin + 1)).slice(0, -1), ...dp([...pts.slice(loin), pts[0]!]).slice(0, -1)];
}

const chemin = (pts: Pt[]) => "M" + pts.map(([u, v]) => `${u.toFixed(4)} ${v.toFixed(4)}`).join("L") + "Z";

const homme = await silhouette("personnage-morph");
const femme = await silhouette("personnage-femme-morph");
writeFileSync(
  new URL("../src/ui/3d/silhouette.ts", import.meta.url),
  `// Généré par scripts/generer-silhouette.ts : ne pas modifier à la main.
// Silhouette du personnage de Santé (pose de Vitruve, rotation de repos) en part de sa taille : x depuis l'axe de rotation,
// y depuis les pieds (0) jusqu'au sommet de la tête (1), y vers le haut. ${homme.length} et ${femme.length} points.
export const SILHOUETTE = {
  homme: "${chemin(homme)}",
  femme: "${chemin(femme)}",
} as const;
`,
);
console.log(`silhouettes : homme ${homme.length} points, femme ${femme.length} points`);
