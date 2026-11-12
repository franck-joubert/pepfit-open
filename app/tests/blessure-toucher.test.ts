// Blessures : toucher un muscle du personnage le choisit (docs/BLESSURE-TOUCHER.md). Régression du 31/10 (Fold) : depuis la
// perf C, Santé reste monté ; la page zone montait le personnage en cache et prenait pour peau la prépasse de Santé, la passe
// d'identifiants se posait sur ce maillage-là, sous le verre : toucher ne trouvait plus de muscle. Chaque contexte a désormais
// sa copie (corps-gl.ts). Sans GL : un lancer de rayon sur la copie remplace la passe d'identifiants (même maillage posé, même
// caméra que CorpsSante, même lecture du masque que FRAG_PICK), puis `lirePixel` donne le muscle et le côté.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { test } from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { cadrerCorps, matieresVerre, monterCorps, surfaceCorps } from "../src/ui/3d/corps-gl.ts";
import { FRAG_ZONES, lirePixel } from "../src/ui/3d/verre-zones.ts";
import { memoriserRepos } from "../src/ui/3d/recibler.ts";
import { poseVitruve, preparerCorps } from "../src/ui/3d/pose.ts";
import { HAUTEUR_CORPS, SCENE_BAS, SCENE_HAUT, tailleCadre } from "../src/ui/3d/verre.ts";

const asset = (f: string) => new URL(`../assets/3d/${f}`, import.meta.url);

/** Personnage de Santé comme chargerCorps : table des muscles du masque dans userData, repos des os. L'homme aux épaules
 *  naturelles (planche morphologie, D11 : celui de Santé par défaut). */
async function personnage() {
  const o = readFileSync(asset("personnage-morph-epaules.glb"));
  const g = await new GLTFLoader().parseAsync(o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength) as ArrayBuffer, "");
  const x = g.userData as { muscles?: Record<string, number>; pas_id?: number };
  Object.assign(g.scene.userData, { muscles: x.muscles ?? {}, pas: x.pas_id ?? 8 });
  memoriserRepos(g.scene);
  return g.scene;
}

/** masque.png (RVB 8 bits, sans entrelacement) décodé à la main : pas de dépendance d'image dans l'appli. */
function lireMasque() {
  const b = readFileSync(asset("masque.png"));
  let l = 0, h = 0;
  const idat: Buffer[] = [];
  for (let i = 8; i < b.length; ) {
    const n = b.readUInt32BE(i), type = b.toString("latin1", i + 4, i + 8), d = b.subarray(i + 8, i + 8 + n);
    if (type === "IHDR") {
      l = d.readUInt32BE(0);
      h = d.readUInt32BE(4);
      assert.equal(d[8], 8, "8 bits");
      assert.equal(d[9], 2, "RVB");
    } else if (type === "IDAT") idat.push(d);
    i += 12 + n;
  }
  const brut = inflateSync(Buffer.concat(idat)), px = new Uint8Array(l * h * 3), ligne = l * 3;
  for (let y = 0; y < h; y++) {
    const f = brut[y * (ligne + 1)]!, src = y * (ligne + 1) + 1;
    for (let x = 0; x < ligne; x++) {
      const a = x >= 3 ? px[y * ligne + x - 3]! : 0, hh = y ? px[(y - 1) * ligne + x]! : 0, c = x >= 3 && y ? px[(y - 1) * ligne + x - 3]! : 0;
      const p = a + hh - c, pa = Math.abs(p - a), pb = Math.abs(p - hh), pc = Math.abs(p - c);
      const pred = [0, a, hh, (a + hh) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? hh : c][f]!;
      px[y * ligne + x] = (brut[src + x]! + pred) & 255;
    }
  }
  return { l, h, px };
}

type Masque = ReturnType<typeof lireMasque>;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Zone du corps de 412 × 470 dp, comme CorpsSante : caméra orthographique, pivot à l'échelle de la taille, pose de Vitruve. */
function monter(cache: THREE.Object3D, dos: boolean, l = 412, h = HAUTEUR_CORPS) {
  const m = matieresVerre({}, FRAG_ZONES, true);
  const c = monterCorps(cache, m.verre, m.profondeur);
  const pivot = new THREE.Group();
  pivot.add(c.racine);
  const scene = new THREE.Scene();
  scene.add(pivot);
  poseVitruve(c.racine);
  const k = tailleCadre(175) / 100 / c.hBase;
  pivot.scale.setScalar(k);
  pivot.position.y = -c.pied * k;
  pivot.rotation.y = dos ? Math.PI + 0.16 : -0.16; // `fixe` (page zone)
  scene.updateMatrixWorld(true);
  c.mesh.computeBoundingSphere(); // la sphère d'un maillage skinné suit la pose : refaite après elle
  const cam = new THREE.OrthographicCamera(-1, 1, SCENE_HAUT, SCENE_BAS, 0.1, 20);
  cam.position.z = 6;
  cadrerCorps(cam, l, h);
  cam.updateMatrixWorld(true);
  return { ...c, scene, cam, l, h, muscles: (c.racine.userData as { muscles: Record<string, number> }).muscles, pas: (c.racine.userData as { pas: number }).pas };
}

type Monte = ReturnType<typeof monter>;

/** Le doigt en (x, y) dp : rayon sur la copie, texel du masque à l'UV touchée (au plus proche, comme uMasque), pixel de FRAG_PICK. */
function toucher(c: Monte, masque: Masque, x: number, y: number) {
  const r = new THREE.Raycaster();
  r.setFromCamera(new THREE.Vector2((x / c.l) * 2 - 1, 1 - (y / c.h) * 2), c.cam);
  const hit = r.intersectObject(c.mesh, false)[0]; // faces avant seulement (matière FrontSide), comme la passe
  if (!hit) return { objet: null, muscle: lirePixel([0, 0, 0, 0], c.muscles) };
  const u = Math.min(masque.l - 1, Math.floor(hit.uv!.x * masque.l)), v = Math.min(masque.h - 1, Math.floor(hit.uv!.y * masque.h));
  const i = (v * masque.l + u) * 3;
  const rouge = masque.px[i]! / 255, vert = masque.px[i + 1]! / 255;
  const id = smooth(0.45, 0.62, vert) > 0.5 ? Math.floor((rouge * 255) / c.pas + 0.5) : 0;
  // vX : x de repos (attribut position) au point touché
  const pos = c.mesh.geometry.getAttribute("position");
  const b = hit.barycoord!;
  const vX = pos.getX(hit.face!.a) * b.x + pos.getX(hit.face!.b) * b.y + pos.getX(hit.face!.c) * b.z;
  return { objet: hit.object, muscle: lirePixel([id, vX < 0 ? 255 : 0, 0, 255], c.muscles) };
}

/** Point à l'écran (dp) entre deux os (fraction `f` de l'un à l'autre). */
function entre(c: Monte, a: string, b: string, f = 0.5) {
  const os = (n: string) => {
    let o: THREE.Object3D | undefined;
    c.racine.traverse((x) => {
      if (x.name === n) o = x;
    });
    assert.ok(o, `os ${n}`);
    return o!.getWorldPosition(new THREE.Vector3());
  };
  const p = os(a).lerp(os(b), f).project(c.cam);
  return { x: ((p.x + 1) / 2) * c.l, y: ((1 - p.y) / 2) * c.h };
}

test("toucher : le lancer de rayon sur la copie du personnage choisit le muscle et le côté (face)", async () => {
  const cache = await personnage();
  const masque = lireMasque();
  const c = monter(cache, false);
  assert.ok(c.racine !== cache);
  assert.deepEqual(c.muscles, (cache.userData as { muscles: Record<string, number> }).muscles, "la copie garde la table des muscles");
  const sous = (a: string, b: string, f = 0.5) => {
    const p = entre(c, a, b, f);
    const t = toucher(c, masque, p.x, p.y);
    assert.ok(t.objet === c.mesh, "le rayon touche la copie, pas le personnage en cache");
    return t.muscle;
  };
  // côté du personnage : sa gauche (os en L) est à droite de l'écran
  assert.deepEqual(sous("cuisseL", "jambeL"), { zone: "quadriceps", cote: "g" });
  assert.deepEqual(sous("cuisseR", "jambeR"), { zone: "quadriceps", cote: "d" });
  assert.deepEqual(sous("brasL", "avant_brasL"), { zone: "biceps", cote: "g" });
  assert.deepEqual(sous("brasR", "avant_brasR"), { zone: "biceps", cote: "d" });
  assert.deepEqual(sous("avant_brasR", "mainR"), { zone: "avant_bras", cote: "d" });
  // hors du corps (coin de la zone) : rien
  assert.equal(toucher(c, masque, 8, 8).muscle, null);
});

test("toucher : de dos, le muscle de derrière, côté du personnage", async () => {
  const cache = await personnage();
  const masque = lireMasque();
  const c = monter(cache, true);
  const sous = (a: string, b: string, f = 0.5) => {
    const p = entre(c, a, b, f);
    return toucher(c, masque, p.x, p.y).muscle;
  };
  assert.deepEqual(sous("cuisseL", "jambeL"), { zone: "ischios", cote: "g" });
  assert.deepEqual(sous("jambeR", "piedR", 0.3), { zone: "mollets", cote: "d" });
  // milieu du triceps : le bras v5, plus fin que celui d'avant (31,6 cm au lieu de 41 à 1,80 m), n'a plus de triceps aux 65 %
  assert.deepEqual(sous("brasL", "avant_brasL", 0.5), { zone: "triceps", cote: "g" });
});

test("toucher : deux copies vivantes (Santé gardé monté, page zone) choisissent chacune sur leur corps", async () => {
  const cache = await personnage();
  preparerCorps(cache); // préchargement de Santé : la pose faite sur le cache
  const masque = lireMasque();
  const sante = monter(cache, false);
  const zone = monter(cache, true);
  assert.ok(sante.mesh !== zone.mesh && sante.mesh !== zone.ombre && zone.mesh !== sante.ombre, "chacune sa peau");
  const p = entre(sante, "cuisseR", "jambeR");
  const a = toucher(sante, masque, p.x, p.y);
  assert.ok(a.objet === sante.mesh);
  assert.deepEqual(a.muscle, { zone: "quadriceps", cote: "d" });
  const q = entre(zone, "cuisseR", "jambeR");
  const b = toucher(zone, masque, q.x, q.y);
  assert.ok(b.objet === zone.mesh);
  assert.deepEqual(b.muscle, { zone: "ischios", cote: "d" });
  // la page zone fermée, Santé choisit toujours sur sa copie (le corps reste dans sa scène)
  zone.racine.removeFromParent();
  assert.ok(sante.racine.parent?.parent === sante.scene);
  assert.deepEqual(toucher(sante, masque, p.x, p.y).muscle, { zone: "quadriceps", cote: "d" });
});

test("changement de taille (Fold déplié, rotation) : surface lue sur la mise en page, corps recadré au milieu, touchers justes", async () => {
  // la surface suit la mise en page (dp → px), pas drawingBufferWidth figé à la création
  assert.equal(surfaceCorps({ l: 1, h: 1 }, (dp) => dp * 2), null, "mise en page pas encore connue");
  assert.deepEqual(surfaceCorps({ l: 412, h: 470 }, (dp) => Math.round(dp * 2.19)), { l: 902, h: 1029 });
  const cache = await personnage();
  const masque = lireMasque();
  const c = monter(cache, false); // plié : 412 dp
  const avant = entre(c, "cuisseL", "jambeL");
  assert.deepEqual(toucher(c, masque, avant.x, avant.y).muscle, { zone: "quadriceps", cote: "g" });
  // déplié : la zone passe à 826 dp, le même contexte (la même caméra) est recadré
  const deplie = { ...c, l: 826 };
  cadrerCorps(c.cam, deplie.l, deplie.h);
  c.cam.updateMatrixWorld(true);
  const m = new THREE.Vector3(0, 1, 0).project(c.cam);
  assert.ok(Math.abs(((m.x + 1) / 2) * deplie.l - deplie.l / 2) < 1, "recadré : toujours au milieu");
  const apres = entre(deplie, "cuisseL", "jambeL");
  assert.ok(Math.abs(apres.x - deplie.l / 2 - (avant.x - 412 / 2)) < 1, "même écart au milieu, en dp : le corps garde sa taille");
  assert.ok(Math.abs(apres.y - avant.y) < 1e-6);
  for (const [a, b, f, attendu] of [
    ["cuisseL", "jambeL", 0.5, { zone: "quadriceps", cote: "g" }],
    ["brasR", "avant_brasR", 0.5, { zone: "biceps", cote: "d" }],
    ["avant_brasL", "mainL", 0.5, { zone: "avant_bras", cote: "g" }],
  ] as const) {
    const p = entre(deplie, a, b, f);
    assert.deepEqual(toucher(deplie, masque, p.x, p.y).muscle, attendu, `${a} déplié`);
  }
  // l'ancien cadre sur la nouvelle zone (le défaut du Fold) : le quadriceps n'est plus sous le doigt
  const vieux = new THREE.OrthographicCamera(-1, 1, SCENE_HAUT, SCENE_BAS, 0.1, 20);
  vieux.position.z = 6;
  cadrerCorps(vieux, 412, HAUTEUR_CORPS);
  vieux.updateMatrixWorld(true);
  assert.notDeepEqual(toucher({ ...deplie, cam: vieux }, masque, apres.x, apres.y).muscle, { zone: "quadriceps", cote: "g" });
  // replié : retour au cadre de départ
  cadrerCorps(c.cam, 412, HAUTEUR_CORPS);
  c.cam.updateMatrixWorld(true);
  assert.deepEqual(toucher(c, masque, avant.x, avant.y).muscle, { zone: "quadriceps", cote: "g" });
});
