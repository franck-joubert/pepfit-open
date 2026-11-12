// Santé : le verre du corps reste translucide (docs/CORPS-TRANSPARENCE.md). Régression du 31/10 (Fold, 21 h 32) : corps rose
// opaque et brillant, âme presque cachée. Le personnage en cache (charger.ts) était monté tel quel dans chaque contexte GL :
// depuis la perf C, le corps de Santé reste monté, et un second CorpsSante (choix de la zone d'une blessure) prenait pour peau
// la copie de prépasse du premier ; l'ancienne peau gardait son verre : deux couches de verre, deux fois plus claires.
// Sans GL : le GLB de l'appli, les matières et le montage de corps-gl.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { matieresVerre, monterCorps } from "../src/ui/3d/corps-gl.ts";
import { creerAme, uniformesVerreAme, verreAvecAme } from "../src/ui/3d/ame.ts";
import { FRAG_ZONES } from "../src/ui/3d/verre-zones.ts";
import { memoriserRepos } from "../src/ui/3d/recibler.ts";
import { poseVitruve, preparerCorps } from "../src/ui/3d/pose.ts";

async function personnage() {
  const o = readFileSync(new URL("../assets/3d/personnage-morph.glb", import.meta.url));
  const g = await new GLTFLoader().parseAsync(o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength) as ArrayBuffer, "");
  memoriserRepos(g.scene); // comme chargerCorps
  return g.scene;
}

const peaux = (o: THREE.Object3D) => {
  const l: THREE.SkinnedMesh[] = [];
  o.traverse((x) => {
    if ((x as THREE.SkinnedMesh).isSkinnedMesh) l.push(x as THREE.SkinnedMesh);
  });
  return l;
};
const avec = (o: THREE.Object3D, m: THREE.Material) => peaux(o).filter((p) => p.material === m).length;

test("verre : matières figées (translucide, mélange normal non prémultiplié, prépasse de profondeur, âme par-dessus en prémultiplié)", () => {
  const m = matieresVerre({}, verreAvecAme(FRAG_ZONES), true);
  assert.equal(m.verre.transparent, true);
  assert.equal(m.verre.opacity, 1); // la translucidité vient du shader (alpha 0,46 à 0,92), pas de l'opacité de la matière
  assert.equal(m.verre.blending, THREE.NormalBlending);
  assert.equal(m.verre.premultipliedAlpha, false); // sortie du shader non prémultipliée : SRC_ALPHA, ONE_MINUS_SRC_ALPHA
  assert.equal(m.verre.depthWrite, false);
  assert.equal(m.verre.depthTest, true);
  assert.equal(m.verre.depthFunc, THREE.LessEqualDepth);
  assert.equal(m.verre.side, THREE.FrontSide);
  assert.ok(m.verre.fragmentShader.includes("clamp(a, 0.0, 1.0) * uFade"), "alpha du verre écrit par le shader");
  assert.ok(/float a = mix\(0\.46, 0\.92, fres\)/.test(m.verre.fragmentShader), "alpha du verre : 0,46 de face, 0,92 au bord");
  // prépasse : profondeur seule, sans couleur ni mélange
  assert.equal(m.profondeur.colorWrite, false);
  assert.equal(m.profondeur.transparent, false);
  assert.equal(m.profondeur.depthWrite, true);
  // passe d'identifiants : jamais mélangée
  assert.equal(m.identifiants.blending, THREE.NoBlending);
  // sans prépasse, le verre écrit sa profondeur
  assert.equal(matieresVerre({}, FRAG_ZONES, false).verre.depthWrite, true);
  // âme : avant le verre, « par-dessus » prémultiplié (1, 1 − alpha), sans profondeur
  const ame = creerAme(uniformesVerreAme());
  const a = ame.mesh.material as THREE.ShaderMaterial;
  assert.equal(a.blending, THREE.CustomBlending);
  assert.equal(a.blendSrc, THREE.OneFactor);
  assert.equal(a.blendDst, THREE.OneMinusSrcAlphaFactor);
  assert.equal(a.depthTest, false);
  assert.ok(ame.mesh.renderOrder < 0, "l'âme avant la prépasse et le verre");
  ame.dispose();
});

test("montage : une seule couche de verre et une prépasse, sur une copie ; le personnage en cache n'est pas touché", async () => {
  const cache = await personnage();
  const avant = peaux(cache).map((p) => p.material);
  const m = matieresVerre({}, FRAG_ZONES, true);
  const c = monterCorps(cache, m.verre, m.profondeur);
  assert.ok(c.racine !== cache, "une copie par contexte");
  assert.equal(avec(c.racine, m.verre), 1, "une seule peau en verre");
  assert.equal(avec(c.racine, m.profondeur), 1, "une prépasse");
  assert.ok(c.mesh.material === m.verre);
  assert.ok(c.ombre!.material === m.profondeur);
  assert.ok(c.ombre!.skeleton === c.mesh.skeleton, "la prépasse suit les os de la peau");
  assert.ok(c.mesh.renderOrder > c.ombre!.renderOrder, "prépasse avant le verre");
  assert.ok(c.hBase > 1.5 && c.hBase < 2.2, `hauteur ${c.hBase}`);
  assert.ok(peaux(cache).every((p, i) => p.material === avant[i]), "matières du cache inchangées");
  assert.equal(peaux(cache).length, avant.length, "pas de prépasse ajoutée au cache");
  // la copie a ses propres os : poser l'une ne pose pas l'autre
  assert.ok(c.mesh.skeleton.bones.every((b, i) => b !== peaux(cache)[0]!.skeleton.bones[i]), "os copiés");
});

test("montage : la copie d'un personnage déjà posé (préchargement de Santé) garde ses doigts", async () => {
  const cache = await personnage();
  preparerCorps(cache); // prechargerCorpsSante : la pose est faite sur le cache, avec le repos de chaque doigt
  poseVitruve(cache); // et rejouée (CorpsSante.appliquer)
  const m = matieresVerre({}, FRAG_ZONES, true);
  const c = monterCorps(cache, m.verre, m.profondeur);
  poseVitruve(c.racine); // comme appliquer, sur la copie
  const os = (o: THREE.Object3D) => {
    const r: Record<string, THREE.Vector3> = {};
    o.updateMatrixWorld(true);
    const inv = o.matrixWorld.clone().invert();
    o.traverse((x) => {
      if ((x as THREE.Bone).isBone) r[x.name] = x.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    });
    return r;
  };
  const a = os(cache), b = os(c.racine);
  const doigts = Object.keys(a).filter((n) => /^(index|majeur|annulaire|auriculaire|pouce)/.test(n));
  assert.ok(doigts.length >= 20, `${doigts.length} os de doigts`);
  for (const n of Object.keys(a)) {
    assert.ok([b[n]!.x, b[n]!.y, b[n]!.z].every(Number.isFinite), `${n} : position finie`);
    assert.ok(a[n]!.distanceTo(b[n]!) < 1e-4, `${n} : même pose que le cache (écart ${a[n]!.distanceTo(b[n]!)})`);
  }
});

test("montage : deux contextes en même temps (Santé gardé monté, zone d'une blessure) ne se volent ni la peau ni le verre", async () => {
  const cache = await personnage();
  const sante = matieresVerre({}, FRAG_ZONES, true);
  const zone = matieresVerre({}, FRAG_ZONES, true);
  const pivotSante = new THREE.Group();
  const pivotZone = new THREE.Group();
  const a = monterCorps(cache, sante.verre, sante.profondeur);
  pivotSante.add(a.racine);
  const b = monterCorps(cache, zone.verre, zone.profondeur);
  pivotZone.add(b.racine);
  // avant le correctif : la zone prenait la prépasse de Santé pour peau, et le corps quittait la scène de Santé
  assert.ok(a.racine.parent === pivotSante, "le corps de Santé reste dans sa scène");
  assert.ok(b.mesh !== a.ombre, "la zone ne prend pas la prépasse de Santé pour peau");
  for (const [pivot, mat] of [[pivotSante, sante], [pivotZone, zone]] as const) {
    assert.equal(avec(pivot, mat.verre), 1, "une couche de verre");
    assert.equal(avec(pivot, mat.profondeur), 1, "une prépasse");
    assert.equal(peaux(pivot).length, 2, "rien d'autre");
  }
  // la zone fermée puis Santé refait (5 min en arrière-plan) : toujours une seule couche
  pivotZone.remove(b.racine);
  const c = monterCorps(cache, sante.verre, sante.profondeur);
  assert.equal(avec(c.racine, sante.verre), 1);
  assert.equal(peaux(c.racine).length, 2);
});
