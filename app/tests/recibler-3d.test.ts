// Femme de la vue 3D : clips de l'homme reciblés (recibler.ts) dans la scène de l'appli, sans GL (pas de rendu).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { recibler, type Recalage } from "../src/ui/3d/recibler";
import { creerScene, type Clip3D, type Personnage3D } from "../src/ui/3d/scene";

const lire = (nom: string) => {
  const o = readFileSync(new URL(`../assets/3d/${nom}.glb`, import.meta.url));
  return new GLTFLoader().parseAsync(o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength) as ArrayBuffer, "");
};
const recalages = JSON.parse(readFileSync(new URL("../assets/3d/recalage-femme.json", import.meta.url), "utf8")) as Record<string, Recalage>;

async function clip(cle: string): Promise<Clip3D> {
  const g = await lire(cle);
  const agres: THREE.Object3D[] = [];
  g.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) agres.push(o);
  });
  return { racine: g.scene, animation: g.animations[0]!, agres, principaux: [], secondaires: [] };
}
async function personnage(nom: string, reciblee: boolean): Promise<Personnage3D> {
  const g = await lire(nom);
  const x = g.userData as { muscles: Record<string, number>; pas_id: number };
  return { racine: g.scene, muscles: x.muscles, pas: x.pas_id, reciblee, relief: 1, cavite: 0.5 };
}
const tex = { masque: new THREE.Texture(), relief: new THREE.Texture(), cavite: new THREE.Texture() };

test("Femme 3D : plus petite que l'homme, mains et pieds sur les prises du développé couché", async () => {
  const femme = await personnage("personnage-femme", true);
  const c = await clip("couche");
  const r = recibler(THREE, { perso: femme.racine, clip: { scene: c.racine, animations: [c.animation] }, agres: c.agres as THREE.Mesh[], recalage: recalages.couche });
  assert.ok(r.k > 0.8 && r.k < 0.9, `k = ${r.k}`);
  const melangeur = new THREE.AnimationMixer(r.conteneur);
  const action = melangeur.clipAction(r.animation).play();
  for (let i = 0; i < 6; i++) {
    action.time = (i / 6) * r.animation.duration;
    melangeur.update(0);
    r.apres(action.time);
    assert.ok(r.ecart < 0.005, `instant ${i} : poignet ou cheville à ${(r.ecart * 1000).toFixed(1)} mm de sa cible`);
  }
  assert.equal(r.prises?.mains.L, "porte");
  r.liberer();
  assert.equal(c.racine.scale.x, 1);
});

test("Femme 3D : la scène recible, l'étendue suit sa taille, et la libération rend clip et agrès intacts", async () => {
  const homme = await personnage("personnage", false);
  const femme = await personnage("personnage-femme", true);
  const c = await clip("squat");
  const avant = c.agres.map((a) => a.position.clone());
  const sh = creerScene(homme, c, tex);
  const hauteurHomme = 2 * sh.etendue().demiHauteur;
  sh.liberer();
  const sf = creerScene(femme, c, tex, recalages.squat ?? {});
  const hauteurFemme = 2 * sf.etendue().demiHauteur;
  sf.avancer(0.4);
  sf.avancer(0.4);
  sf.liberer();
  assert.ok(hauteurFemme < hauteurHomme * 0.95, `femme ${hauteurFemme.toFixed(3)} m, homme ${hauteurHomme.toFixed(3)} m`);
  assert.equal(c.racine.scale.x, 1);
  // l'homme retrouve ensuite le clip tel quel
  const sh2 = creerScene(homme, c, tex);
  sh2.liberer();
  c.agres.forEach((a, i) => assert.ok(a.position.distanceTo(avant[i]!) < 1e-9 || c.animation.tracks.some((t) => t.name.startsWith(a.name + ".")), a.name));
});
