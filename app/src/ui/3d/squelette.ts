// Squelette du personnage de Santé sous le verre (planche articulations, D1, variante A) et points des 13 articulations,
// construits à partir des os du GLB dans la pose de Vitruve : rien à modéliser ni à charger (0 Ko), il suit le sexe et la pose.
// Repris de planches/articulations/outils/squelette.js. Repère : celui de la racine du personnage, de face vers +z, son côté
// droit en x < 0 (verre-zones.ts). Les marques (anneaux) des articulations : ZoneBlessure (SVG) et Santé (GL, plus bas).
import * as THREE from "three";
import type { ModeCouleur } from "../../theme/jetons";
import type { VueCorps } from "../../db/zones-blessure";

/** Positions des os (repère de la racine), par nom. */
export type Os = Record<string, THREE.Vector3>;
/** Points des articulations : « id:c » (c = g, d ou -) → position (repère de la racine), par vue. */
export type Ancres = Record<VueCorps, Record<string, THREE.Vector3>>;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Hauteur du personnage de la planche (m) : `k` = hBase / HAUTEUR_REF, l'échelle des mesures du squelette. */
export const HAUTEUR_REF = 1.827;

/** Opacité du verre en mode Articulation : le squelette se voit à travers (planche, FONDU_A). */
export const FONDU_ARTICULATIONS: Record<ModeCouleur, number> = { nuit: 0.34, jour: 0.42 };

/** Couleurs de l'os (rvb 0..1), par mode : ivoire, ombre, bord (planche, rendu.js). */
export const COULEURS_OS: Record<ModeCouleur, { os: [number, number, number]; ombre: [number, number, number]; bord: [number, number, number] }> = {
  nuit: { os: [0.97, 0.94, 0.88], ombre: [0.45, 0.4, 0.4], bord: [1, 0.95, 0.98] },
  jour: { os: [0.9, 0.85, 0.78], ombre: [0.38, 0.32, 0.33], bord: [0.3, 0.1, 0.4] },
};

/** Position des os (repère de la racine), pose déjà jouée. */
export function lireOs(racine: THREE.Object3D): Os {
  racine.updateMatrixWorld(true);
  const inv = racine.matrixWorld.clone().invert();
  const os: Os = {};
  racine.traverse((o) => {
    if ((o as THREE.Bone).isBone) os[o.name] = o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  });
  return os;
}

/** Points des articulations (repère de la racine), par vue. `haut` : sommet de la tête, `k` : échelle (hBase / HAUTEUR_REF). */
export function ancres(os: Os, haut: number, k: number): Ancres {
  const a: Ancres = { face: {}, dos: {} };
  const poser = (id: string, c: string, p: THREE.Vector3, vues: VueCorps[] = ["face", "dos"]) => vues.forEach((v) => (a[v][`${id}:${c}`] = p.clone()));
  const C = os.cou!, Th = os.thorax!, R = os.racine!;
  const tete = crane(os, haut, k);
  for (const [c, X] of [["d", "R"], ["g", "L"]] as const) {
    const s = X === "L" ? 1 : -1;
    poser("machoire", c, V(s * 0.058 * k, tete.c.y - 0.03 * k, tete.c.z + 0.01), ["face"]);
    poser("epaule", c, os[`bras${X}`]!);
    poser("coude", c, os[`avant_bras${X}`]!);
    poser("poignet", c, os[`main${X}`]!);
    poser("main", c, os[`majeur1${X}`]!.clone().lerp(os[`index1${X}`]!, 0.3));
    poser("hanche", c, os[`cuisse${X}`]!.clone().add(V(-s * 0.008 * k, -0.025 * k, 0)));
    poser("genou", c, os[`jambe${X}`]!.clone().add(V(0, 0.01 * k, 0)));
    poser("cheville", c, os[`pied${X}`]!.clone().add(V(0, 0.012 * k, 0)));
    poser("pied", c, os[`pied${X}`]!.clone().add(V(s * 0.012 * k, -0.05 * k, 0.06 * k)));
  }
  poser("rachis_cervical", "-", V(0, C.y + 0.012 * k, C.z), ["face"]);
  poser("rachis_cervical", "-", V(0, C.y + 0.05 * k, C.z - 0.03 * k), ["dos"]);
  poser("rachis_dorsal", "-", V(0, (Th.y + C.y) / 2 - 0.01 * k, Th.z - 0.07 * k), ["dos"]);
  poser("rachis_lombaire", "-", V(0, (R.y + Th.y) / 2 + 0.015 * k, os.dos!.z - 0.06 * k), ["dos"]);
  poser("sacrum", "-", V(0, R.y - 0.075 * k, R.z - 0.08 * k), ["dos"]);
  return a;
}

/** Crâne : centre et demi-axes, sous le sommet de la tête. */
function crane(os: Os, haut: number, k: number) {
  const r = V(0.07 * k, 0.086 * k, 0.092 * k);
  return { c: V(0, haut - 0.014 * k - r.y, os.tete!.z - 0.008), r };
}

// ---------- Géométrie ----------

const HAUT = V(0, 1, 0);

/** Os long : tronc de cône de a (rayon ra) à b (rayon rb). */
function fut(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, seg = 10): THREE.BufferGeometry {
  const d = b.clone().sub(a), l = d.length();
  const g = new THREE.CylinderGeometry(rb, ra, l, seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(HAUT, d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/** Boule ou ellipsoïde (demi-axes r), tournée de `rot` (Euler). */
function boule(p: THREE.Vector3, r: THREE.Vector3, rot: THREE.Euler | null = null, seg = 14): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg - 4));
  g.scale(r.x, r.y, r.z);
  if (rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(rot));
  g.translate(p.x, p.y, p.z);
  return g;
}

/** Tube lisse passant par des points (côtes, mâchoire, bassin). */
function tube(points: THREE.Vector3[], r: number, ferme = false, n = 40): THREE.BufferGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, ferme, "centripetal"), n, r, 7, ferme);
}

/** Nappe courbe entre deux lignes de points (aile iliaque), vue des deux côtés. */
function nappe(bas: THREE.Vector3[], haut: THREE.Vector3[], n: number, m: number): THREE.BufferGeometry {
  const cb = new THREE.CatmullRomCurve3(bas, false, "centripetal"), ch = new THREE.CatmullRomCurve3(haut, false, "centripetal");
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = cb.getPointAt(i / n), b = ch.getPointAt(i / n);
    for (let j = 0; j <= m; j++) {
      const t = j / m, p = a.clone().lerp(b, t);
      p.z -= Math.sin(Math.PI * t) * 0.012; // creux de la fosse iliaque
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const a = i * (m + 1) + j, b = a + m + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Os long à têtes arrondies : fût plus deux boules aux bouts. */
function osLong(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, ta = 1.5, tb = 1.5): THREE.BufferGeometry[] {
  return [fut(a, b, ra, rb), boule(a, V(ra * ta, ra * ta, ra * ta), null, 10), boule(b, V(rb * tb, rb * tb, rb * tb), null, 10)];
}

/** Le squelette entier, une seule géométrie (repère de la racine). `haut` : sommet de la tête, `k` : échelle (taille / 1,83 m). */
export function geometrieSquelette(os: Os, haut: number, k: number): THREE.BufferGeometry {
  const g: THREE.BufferGeometry[] = [];
  const T = os.tete!, C = os.cou!, Th = os.thorax!, D = os.dos!, R = os.racine!;

  // tête : crâne lisse (sans orbites), massif de la face, mandibule
  const cr = crane(os, haut, k);
  g.push(boule(cr.c, cr.r, null, 24));
  g.push(boule(cr.c.clone().add(V(0, -0.058 * k, 0.04 * k)), V(0.05 * k, 0.04 * k, 0.05 * k), null, 16));
  const m = (x: number, y: number, z: number) => cr.c.clone().add(V(x * k, y * k, z * k));
  g.push(tube([m(0.058, -0.035, 0.0), m(0.05, -0.085, 0.01), m(0.03, -0.112, 0.068), m(0, -0.12, 0.082), m(-0.03, -0.112, 0.068), m(-0.05, -0.085, 0.01), m(-0.058, -0.035, 0.0)], 0.0075 * k, false, 48));

  // rachis : 24 vertèbres le long d'une courbe (lordose lombaire, cyphose dorsale, lordose cervicale), apophyses vers l'arrière
  const rachis = new THREE.CatmullRomCurve3([
    V(0, R.y - 0.03 * k, R.z - 0.07 * k), V(0, (R.y + Th.y) / 2, D.z - 0.045 * k), V(0, Th.y + 0.13 * k, Th.z - 0.08 * k),
    V(0, C.y, C.z - 0.045 * k), V(0, T.y - 0.005, T.z - 0.03 * k),
  ], false, "centripetal");
  const N = 24;
  for (let i = 0; i < N; i++) {
    const t = 0.03 + (i / (N - 1)) * 0.95;
    const p = rachis.getPointAt(t), tg = rachis.getTangentAt(t);
    const r = (0.024 - 0.013 * t) * k, h = (0.6 / N) * 0.55 * (0.62 / 0.6) * k;
    g.push(fut(p.clone().addScaledVector(tg, -h / 2), p.clone().addScaledVector(tg, h / 2), r, r, 10));
    g.push(boule(p.clone().addScaledVector(tg, h / 2), V(r, r * 0.25, r), null, 10));
    g.push(fut(p.clone().add(V(0, 0, -r * 0.8)), p.clone().add(V(0, -0.012 * k, -r - 0.022 * k)), r * 0.28, r * 0.18, 6));
  }

  // cage : dix paires de côtes (ellipses ouvertes devant, plus bas devant que derrière), sternum
  const yH = C.y - 0.075 * k, yB = Th.y + 0.03 * k, cz = Th.z + 0.022 * k;
  const A = [0.07, 0.098, 0.116, 0.128, 0.137, 0.142, 0.143, 0.14, 0.133, 0.122];
  const B = [0.062, 0.075, 0.084, 0.09, 0.094, 0.097, 0.098, 0.097, 0.094, 0.09];
  for (let i = 0; i < 10; i++) {
    const y = yH + ((yB - yH) * i) / 9, a = A[i]! * k, b = B[i]! * k;
    const ouvert = 0.32 + i * 0.075; // angle laissé ouvert devant (rad), plus grand en bas : le rebord costal
    for (const s of [1, -1]) {
      const pts = [];
      for (let j = 0; j <= 14; j++) {
        const th = ouvert + ((Math.PI - ouvert) * j) / 14; // de l'avant (0) vers l'arrière (π)
        const devant = (1 + Math.cos(th)) / 2;
        pts.push(V(s * a * Math.sin(th), y - 0.05 * k * devant, cz + b * Math.cos(th)));
      }
      g.push(tube(pts, 0.0052 * k, false, 28));
    }
  }
  g.push(boule(V(0, (yH + Th.y + 0.1 * k) / 2 - 0.03 * k, cz + 0.088 * k), V(0.014 * k, 0.085 * k, 0.008 * k), new THREE.Euler(0.18, 0, 0), 14));

  // ceinture scapulaire et membres supérieurs
  for (const [X, s] of [["L", 1], ["R", -1]] as const) {
    const S = os[`bras${X}`]!, E = os[`avant_bras${X}`]!, W = os[`main${X}`]!;
    const dir = E.clone().sub(S).normalize();
    // clavicule (en S léger) de l'épaule au sternum
    g.push(tube([V(s * 0.016 * k, yH + 0.012 * k, cz + 0.075 * k), V(s * 0.08 * k, yH + 0.03 * k, cz + 0.07 * k), V(s * (Math.abs(S.x) - 0.02 * k), S.y + 0.026 * k, S.z + 0.005)], 0.0072 * k, false, 20));
    // omoplate : triangle plat dans le dos, épine jusqu'à l'acromion
    const zo = Th.z - 0.085 * k;
    const forme = new THREE.Shape();
    const coins = [[0.065, C.y - 0.085 * k], [Math.abs(S.x) - 0.055 * k, S.y - 0.04 * k], [0.09, C.y - 0.235 * k]] as const;
    forme.moveTo(coins[0][0] * k, coins[0][1]);
    forme.quadraticCurveTo((coins[0][0] * k + coins[1][0]) / 2, coins[0][1] + 0.01 * k, coins[1][0], coins[1][1]);
    forme.quadraticCurveTo(coins[1][0] - 0.025 * k, (coins[1][1] + coins[2][1]) / 2, coins[2][0] * k, coins[2][1]);
    forme.quadraticCurveTo(coins[0][0] * k - 0.012 * k, (coins[0][1] + coins[2][1]) / 2, coins[0][0] * k, coins[0][1]);
    const omo = new THREE.ExtrudeGeometry(forme, { depth: 0.004 * k, bevelEnabled: true, bevelThickness: 0.003 * k, bevelSize: 0.004 * k, bevelSegments: 2, curveSegments: 10 });
    if (s < 0) omo.scale(-1, 1, 1);
    omo.translate(0, 0, zo);
    g.push(omo);
    g.push(tube([V(s * 0.07 * k, C.y - 0.115 * k, zo - 0.006 * k), V(s * (Math.abs(S.x) - 0.05 * k), S.y - 0.005 * k, zo + 0.02 * k), V(s * (Math.abs(S.x) - 0.018 * k), S.y + 0.024 * k, S.z - 0.01)], 0.0055 * k, false, 16));
    // humérus : tête, diaphyse, palette (épicondyles écartés en hauteur, bras à l'horizontale paume devant)
    g.push(boule(S.clone().addScaledVector(dir, -0.004), V(0.024 * k, 0.024 * k, 0.024 * k), null, 14));
    g.push(fut(S.clone().addScaledVector(dir, 0.02 * k), E.clone().addScaledVector(dir, -0.02 * k), 0.014 * k, 0.012 * k));
    g.push(boule(E.clone().addScaledVector(dir, -0.008 * k), V(0.017 * k, 0.03 * k, 0.017 * k), null, 12));
    // radius (côté du pouce, en haut) et cubitus
    const ra = V(0, 0.011 * k, 0), cu = V(0, -0.011 * k, -0.002);
    g.push(...osLong(E.clone().add(ra).addScaledVector(dir, 0.012 * k), W.clone().add(ra).addScaledVector(dir, -0.006 * k), 0.0075 * k, 0.0105 * k, 1.2, 1.25));
    g.push(...osLong(E.clone().add(cu).addScaledVector(dir, 0.004 * k), W.clone().add(cu).addScaledVector(dir, -0.008 * k), 0.0105 * k, 0.006 * k, 1.35, 1.4));
    // main : carpe, métacarpiens, phalanges (os des doigts du GLB), bout du doigt prolongé
    const carpe = W.clone().addScaledVector(dir, 0.022 * k);
    g.push(boule(carpe, V(0.018 * k, 0.026 * k, 0.011 * k), null, 12));
    for (const d of ["index", "majeur", "annulaire", "auriculaire", "pouce"]) {
      const p1 = os[`${d}1${X}`], p2 = os[`${d}2${X}`], p3 = os[`${d}3${X}`];
      if (!p1 || !p2 || !p3) continue;
      const bout = p3.clone().add(p3.clone().sub(p2).multiplyScalar(0.8));
      const base = d === "pouce" ? carpe.clone().add(V(0, 0.012 * k, 0)) : carpe.clone().lerp(p1, 0.25);
      const r = (d === "pouce" ? 0.0052 : 0.0042) * k;
      g.push(...osLong(base, p1, r * 0.9, r, 1.2, 1.35));
      g.push(...osLong(p1, p2, r * 0.9, r * 0.82, 1.2, 1.25));
      g.push(...osLong(p2, p3, r * 0.8, r * 0.72, 1.2, 1.2));
      g.push(...osLong(p3, bout, r * 0.7, r * 0.6, 1.15, 1.2));
    }
  }

  // bassin : ailes iliaques (nappe courbe entre le bas de l'aile et la crête, crête arrondie), anneaux du pubis et de l'ischion, sacrum
  for (const [X, s] of [["L", 1], ["R", -1]] as const) {
    const J = os[`cuisse${X}`]!.clone().add(V(-s * 0.008 * k, -0.025 * k, 0));
    const lx = Math.abs(J.x);
    const crete = [V(s * 0.035 * k, J.y + 0.08 * k, R.z - 0.072 * k), V(s * 0.085 * k, J.y + 0.118 * k, R.z - 0.058 * k), V(s * (lx + 0.04 * k), J.y + 0.112 * k, R.z - 0.012 * k), V(s * (lx + 0.032 * k), J.y + 0.06 * k, R.z + 0.038 * k)];
    const bas = [V(s * 0.04 * k, J.y + 0.03 * k, R.z - 0.062 * k), V(s * 0.065 * k, J.y + 0.018 * k, R.z - 0.038 * k), V(s * lx * 0.96, J.y + 0.026 * k, R.z - 0.004 * k), V(s * (lx + 0.012 * k), J.y + 0.036 * k, R.z + 0.032 * k)];
    g.push(nappe(bas, crete, 24, 6));
    g.push(tube(crete, 0.0062 * k, false, 30));
    g.push(tube([J, V(s * (lx - 0.03 * k), J.y - 0.11 * k, R.z - 0.025 * k), V(s * 0.018 * k, J.y - 0.095 * k, R.z + 0.05 * k), V(s * 0.016 * k, J.y - 0.05 * k, R.z + 0.062 * k), V(s * (lx - 0.03 * k), J.y - 0.012 * k, R.z + 0.035 * k)], 0.0075 * k, true, 30));
  }
  g.push(boule(V(0, R.y - 0.05 * k, R.z - 0.078 * k), V(0.04 * k, 0.062 * k, 0.016 * k), new THREE.Euler(-0.35, 0, 0), 14));

  // membres inférieurs : fémur (tête, col, diaphyse, condyles), rotule, tibia, péroné, pied
  for (const [X, s] of [["L", 1], ["R", -1]] as const) {
    const H = os[`cuisse${X}`]!.clone().add(V(-s * 0.008 * k, -0.025 * k, 0)), K = os[`jambe${X}`]!, A = os[`pied${X}`]!;
    const dir = K.clone().sub(H).normalize();
    g.push(boule(H, V(0.023 * k, 0.023 * k, 0.023 * k), null, 14));
    const G = H.clone().add(V(s * 0.05 * k, -0.035 * k, 0));
    g.push(fut(H, G, 0.013 * k, 0.017 * k));
    g.push(boule(G, V(0.019 * k, 0.022 * k, 0.019 * k), null, 12));
    g.push(fut(G.clone().add(V(-s * 0.006 * k, -0.015 * k, 0)), K.clone().addScaledVector(dir, -0.03 * k), 0.016 * k, 0.017 * k));
    g.push(boule(K.clone().addScaledVector(dir, -0.018 * k), V(0.034 * k, 0.024 * k, 0.03 * k), null, 14));
    g.push(boule(K.clone().add(V(0, 0.004 * k, 0.04 * k)), V(0.02 * k, 0.025 * k, 0.01 * k), null, 12));
    const dj = A.clone().sub(K).normalize();
    g.push(boule(K.clone().addScaledVector(dj, 0.022 * k), V(0.032 * k, 0.014 * k, 0.028 * k), null, 14));
    g.push(fut(K.clone().addScaledVector(dj, 0.03 * k), A.clone().addScaledVector(dj, -0.02 * k), 0.018 * k, 0.013 * k));
    g.push(boule(A.clone().add(V(-s * 0.018 * k, 0.004 * k, 0)), V(0.012 * k, 0.014 * k, 0.012 * k), null, 10));
    g.push(...osLong(K.clone().add(V(s * 0.028 * k, -0.035 * k, -0.012 * k)), A.clone().add(V(s * 0.03 * k, 0.0, -0.006 * k)), 0.007 * k, 0.0065 * k, 1.5, 1.7));
    // pied : astragale, calcanéum, cinq métatarsiens en éventail, orteils
    g.push(boule(A.clone().add(V(0, -0.012 * k, 0.01 * k)), V(0.02 * k, 0.016 * k, 0.024 * k), null, 12));
    g.push(boule(A.clone().add(V(0, -0.038 * k, -0.03 * k)), V(0.019 * k, 0.02 * k, 0.034 * k), new THREE.Euler(0.3, 0, 0), 12));
    for (let j = 0; j < 5; j++) {
      const x0 = s * (-0.022 + j * 0.011) * k, x1 = s * (-0.03 + j * 0.016) * k;
      const b0 = A.clone().add(V(x0, -0.03 * k, 0.04 * k)), b1 = A.clone().add(V(x1, -0.058 * k, 0.12 * k - j * 0.006 * k));
      const r = (j === 0 ? 0.0065 : 0.0045) * k;
      g.push(...osLong(b0, b1, r, r * 0.9, 1.2, 1.4));
      g.push(...osLong(b1, b1.clone().add(V(x1 * 0.08, -0.008 * k, (j === 0 ? 0.042 : 0.032 - j * 0.003) * k)), r * 0.8, r * 0.7, 1.1, 1.2));
    }
  }

  // une seule géométrie : attributs position et normale (les tubes et les formes ont aussi des uv : ignorés)
  const parts = g.map((x) => {
    const y = x.index ? x.toNonIndexed() : x;
    const z = new THREE.BufferGeometry();
    z.setAttribute("position", y.getAttribute("position"));
    z.setAttribute("normal", y.getAttribute("normal"));
    if (y !== x) x.dispose();
    return z;
  });
  let n = 0;
  for (const p of parts) n += p.getAttribute("position").count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.getAttribute("position").array as Float32Array, o * 3);
    nor.set(p.getAttribute("normal").array as Float32Array, o * 3);
    o += p.getAttribute("position").count;
  }
  const tout = new THREE.BufferGeometry();
  tout.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  tout.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return tout;
}

/** Part de l'ombre sur les os du fond (profondeur, 0 à 1) : de face le sternum devant, de dos la colonne et les omoplates. */
const OMBRE_FOND = 0.9;

/** Matière de l'os : ivoire éclairé comme le verre (même lumière), bord doux ; opaque, dessinée avant la peau. Les os du côté
 * éloigné de la caméra s'estompent (profondeur vue depuis la caméra : elle suit la rotation du corps, de face comme de dos). */
export function matiereOs(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOs: { value: new THREE.Color() }, uOmbre: { value: new THREE.Color() }, uBord: { value: new THREE.Color() },
      uCentre: { value: new THREE.Vector3() }, uDemi: { value: 0.1 },
    },
    vertexShader: `uniform vec3 uCentre; uniform float uDemi; varying vec3 vN; varying float vFond;
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec4 c = modelViewMatrix * vec4(uCentre, 1.0);
  float u = length((modelViewMatrix * vec4(uCentre + vec3(0.0, 0.0, uDemi), 1.0) - c).xyz);
  vFond = clamp(0.5 + 0.5 * (c.z - mv.z) / u, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `precision mediump float; uniform vec3 uOs; uniform vec3 uOmbre; uniform vec3 uBord; varying vec3 vN; varying float vFond;
void main() {
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 L = normalize(vec3(-0.45, 0.65, 0.6)), V = vec3(0.0, 0.0, 1.0);
  float dif = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
  float spec = pow(clamp(dot(reflect(-L, N), V), 0.0, 1.0), 18.0);
  float bord = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);
  vec3 c = mix(uOmbre, uOs, dif) + uBord * bord * 0.35 + vec3(spec * 0.18);
  gl_FragColor = vec4(mix(c, uOmbre, vFond * ${OMBRE_FOND.toFixed(2)}), 1.0);
}`,
    side: THREE.DoubleSide,
  });
}

export function teinterOs(m: THREE.ShaderMaterial, mode: ModeCouleur) {
  const c = COULEURS_OS[mode];
  (m.uniforms.uOs!.value as THREE.Color).setRGB(...c.os);
  (m.uniforms.uOmbre!.value as THREE.Color).setRGB(...c.ombre);
  (m.uniforms.uBord!.value as THREE.Color).setRGB(...c.bord);
}

/** Le squelette monté sur la racine (pose de Vitruve déjà jouée) et les points des articulations. */
export function monterSquelette(racine: THREE.Object3D, hBase: number, pied: number): { mesh: THREE.Mesh; matiere: THREE.ShaderMaterial; ancres: Ancres } {
  const os = lireOs(racine);
  const k = hBase / HAUTEUR_REF;
  const haut = pied + hBase;
  const matiere = matiereOs();
  (matiere.uniforms.uCentre!.value as THREE.Vector3).set(0, (os.racine!.y + os.thorax!.y) / 2, os.thorax!.z);
  matiere.uniforms.uDemi!.value = 0.085 * k;
  const mesh = new THREE.Mesh(geometrieSquelette(os, haut, k), matiere);
  mesh.renderOrder = -1; // opaque, avant la prépasse et le verre : le verre fondu le laisse voir
  mesh.frustumCulled = false;
  return { mesh, matiere, ancres: ancres(os, haut, k) };
}

/** Point d'une articulation dans cette vue, aucun si elle ne s'y voit pas (D3). Sur Santé (corps qui tourne), l'anneau du
 * haut du dos, du bas du dos ou du sacrum ne paraît que de dos : de face, sans profondeur, il tombait sur le sternum, le
 * ventre ou le pubis (recette du 04/11) ; la carte Blessures le nomme toujours. */
export function ancreDe(a: Ancres, vue: VueCorps, cle: string): THREE.Vector3 | undefined {
  return a[vue][cle];
}

// ---------- Marques des articulations (planche, D7) ----------

/** Anneaux en dp : neutre (fin), choisi ou actif (ambre, point au centre), réduit (ambre en tirets, sans point). */
export const MARQUE = {
  neutre: { r: 6.5, lis: 4, trait: 1.6 },
  ambre: { r: 8.5, lis: 5.2, trait: 2.6, point: 2.6 },
  tirets: [3.4, 2.6] as const,
} as const;

/** Couleurs des marques : ambre (base v2.2), liseré (noir la nuit, blanc le jour), anneau neutre. */
export const COULEURS_MARQUE: Record<ModeCouleur, { ambre: string; lis: string; neutre: string; trait: string }> = {
  nuit: { ambre: "#f5b014", lis: "rgba(0,0,0,0.72)", neutre: "rgba(255,255,255,0.85)", trait: "rgba(255,130,190,0.6)" },
  jour: { ambre: "#a36100", lis: "#ffffff", neutre: "rgba(0,0,0,0.62)", trait: "rgba(138,43,226,0.5)" },
};

/** Côté d'un carré de marque GL (dp) : l'anneau ambre et son liseré (8,5 + 2,6) avec une marge. */
export const COTE_MARQUE = 26;

/** Anneau ambre actif dessiné dans la scène (Santé) : un carré face à la caméra, sans profondeur, par-dessus le verre. */
export function matiereMarque(mode: ModeCouleur): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: { uAmbre: { value: new THREE.Color() }, uLis: { value: new THREE.Vector4() }, uCote: { value: COTE_MARQUE } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `precision mediump float; uniform vec3 uAmbre; uniform vec4 uLis; uniform float uCote; varying vec2 vUv;
float bande(float d, float r, float l) { return 1.0 - smoothstep(l * 0.5 - 0.5, l * 0.5 + 0.5, abs(d - r)); }
void main() {
  float d = length(vUv - 0.5) * uCote;
  float lis = bande(d, ${MARQUE.ambre.r.toFixed(1)}, ${MARQUE.ambre.lis.toFixed(1)}) * uLis.a;
  float amb = max(bande(d, ${MARQUE.ambre.r.toFixed(1)}, ${MARQUE.ambre.trait.toFixed(1)}), 1.0 - smoothstep(${MARQUE.ambre.point.toFixed(1)} - 0.5, ${MARQUE.ambre.point.toFixed(1)} + 0.5, d));
  float a = amb + lis * (1.0 - amb);
  if (a < 0.01) discard;
  gl_FragColor = vec4(mix(uLis.rgb, uAmbre, amb / max(a, 0.001)), a);
}`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  teinterMarque(m, mode);
  return m;
}

export function teinterMarque(m: THREE.ShaderMaterial, mode: ModeCouleur) {
  (m.uniforms.uAmbre!.value as THREE.Color).set(COULEURS_MARQUE[mode].ambre);
  const l = m.uniforms.uLis!.value as THREE.Vector4;
  if (mode === "nuit") l.set(0, 0, 0, 0.72);
  else l.set(1, 1, 1, 1);
}
