// Santé : pose de Vitruve du personnage en verre (pose.ts, bras à l'horizontale) et scan (verre.ts). Sans GL : peau déformée
// par three.js comme à l'écran, projetée dans la zone du corps (largeur de la colonne × 470 dp), contre les cases (sante-vue.ts,
// dispositionMoi : le personnage y est remonté, les cases sont comptées dans la zone montrée).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Morphologie } from "../src/ecrans/morphologie.ts";
import { corpsAffiche, influencesDe } from "../src/ecrans/morphologie-calc.ts";
import { CASE, dispositionMoi, type Place } from "../src/ecrans/sante-vue.ts";
import { normalePaume, poseVitruve } from "../src/ui/3d/pose.ts";
import { hauteurScan, HAUTEUR_CORPS, prochainScan, rotationCorps, SCAN, SCENE_H, SCENE_HAUT, tailleCadre } from "../src/ui/3d/verre.ts";

const LARGEUR = 412; // écran extérieur du Fold, dp

async function corps(nom: string) {
  const o = readFileSync(new URL(`../assets/3d/${nom}.glb`, import.meta.url));
  const g = await new GLTFLoader().parseAsync(o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength) as ArrayBuffer, "");
  poseVitruve(g.scene);
  let peau!: THREE.SkinnedMesh;
  g.scene.traverse((x) => {
    if ((x as THREE.SkinnedMesh).isSkinnedMesh) peau = x as THREE.SkinnedMesh;
  });
  return { racine: g.scene, peau };
}

/** Sommets de la peau en dp (comme CorpsSante : échelle à la taille, pieds au sol, rotation y), et ceux des bras. */
function projeter(c: Awaited<ReturnType<typeof corps>>, tailleCm: number, rot: number, largeur = LARGEUR) {
  const pivot = new THREE.Group();
  pivot.add(c.racine);
  c.racine.updateMatrixWorld(true);
  const boite = new THREE.Box3().setFromObject(c.racine);
  const k = tailleCadre(tailleCm) / 100 / (boite.max.y - boite.min.y);
  poseVitruve(c.racine); // comme CorpsSante.appliquer
  pivot.scale.setScalar(k);
  pivot.position.y = -boite.min.y * k;
  pivot.rotation.y = rot;
  pivot.updateMatrixWorld(true);
  const demi = (SCENE_H * (largeur / HAUTEUR_CORPS)) / 2;
  const os = c.peau.skeleton.bones.map((b) => /^(bras|avant_bras|main|pouce|index|majeur|annulaire|auriculaire)/.test(b.name));
  const p = c.peau.geometry.attributes, v = new THREE.Vector3();
  const pts: { x: number; y: number; bras: boolean }[] = [];
  for (let i = 0; i < p.position!.count; i += 3) {
    c.peau.getVertexPosition(i, v).applyMatrix4(c.peau.matrixWorld);
    let wb = 0;
    for (let j = 0; j < 4; j++) if (os[p.skinIndex!.getComponent(i, j)]) wb += p.skinWeight!.getComponent(i, j);
    pts.push({ x: largeur / 2 + (v.x / demi) * (largeur / 2), y: ((SCENE_HAUT - v.y) / SCENE_H) * HAUTEUR_CORPS, bras: wb > 0.5 });
  }
  pivot.remove(c.racine);
  return pts;
}

for (const nom of ["personnage-morph", "personnage-morph-epaules", "personnage-femme-morph"]) {
  test(`Santé (${nom}) : bras à l'horizontale, corps entier dans 412 × 470 dp`, async () => {
    const c = await corps(nom);
    // morphologie : maigre et forte (curseurs de corpsAffiche, comme CorpsSante)
    for (const poids of [60, 130]) for (const [tailleCm, rot] of [[180, rotationCorps(0, 0, false)], [180, -0.34], [180, 0.14], [182, -0.34], [182, 0.14], [170, -0.1], [165, -0.34], [165, 0.14], [230, -0.1], [150, -0.1]] as const) {
      const ca = corpsAffiche({ sexe: nom.includes("femme") ? "f" : "h", tailleCm, poidsKg: poids, epaules: nom.includes("epaules") } as Morphologie);
      const inf = c.peau.morphTargetInfluences!;
      influencesDe(c.peau.morphTargetDictionary ?? {}, inf.length, ca.curseurs).forEach((w, j) => (inf[j] = w));
      const pts = projeter(c, tailleCm, rot);
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
      // les mains restent à 16 dp des bords (recette du 27/10 : elles les touchaient)
      assert.ok(Math.min(...xs) >= 16 && Math.max(...xs) <= LARGEUR - 16, `${tailleCm} cm, ${rot} : x ${Math.min(...xs).toFixed(0)} à ${Math.max(...xs).toFixed(0)}`);
      assert.ok(Math.min(...ys) >= 0 && Math.max(...ys) <= HAUTEUR_CORPS, `${tailleCm} cm : y ${Math.min(...ys).toFixed(0)} à ${Math.max(...ys).toFixed(0)}`);
      // les bras sont bien à l'horizontale : les mains à hauteur d'épaule, loin du corps
      const bras = pts.filter((q) => q.bras && Math.abs(q.x - LARGEUR / 2) > 120);
      assert.ok(bras.length > 0 && Math.max(...bras.map((q) => q.y)) - Math.min(...bras.map((q) => q.y)) < 50, `${tailleCm} cm : bras pas à l'horizontale`);
    }
  });

  test(`Santé (${nom}) : cartes du haut sur la tête seulement, blocs du bas à côté du corps, à 320, 360, 390, 412 et 430 dp, police normale et agrandie`, async () => {
    const c = await corps(nom);
    const femme = nom.includes("femme");
    for (const poids of [60, 130]) for (const largeur of [320, 360, 390, 412, 430]) for (const echelle of [1, 1.3]) for (const tailleCm of [165, 172, 182]) {
      const ca = corpsAffiche({ sexe: femme ? "f" : "h", tailleCm, poidsKg: poids, epaules: nom.includes("epaules") } as Morphologie);
      const inf = c.peau.morphTargetInfluences!;
      influencesDe(c.peau.morphTargetDictionary ?? {}, inf.length, ca.curseurs).forEach((w, j) => (inf[j] = w));
      const d = dispositionMoi(tailleCm, largeur, echelle);
      const quand = `${nom}, ${poids} kg, ${largeur} dp, police ${echelle}, ${tailleCm} cm`;
      const x0 = (k: Place) => (k.cote === "g" ? CASE.marge : largeur - CASE.marge - k.largeur);
      // les trois extrêmes du balancement (±0,34 rad) et le repos
      for (const rot of [rotationCorps(0, 0, false), -0.34, 0.14]) {
        // zone montrée : le corps remonté de d.decalage
        const pts = projeter(c, tailleCm, rot, largeur).map((q) => ({ ...q, y: q.y - d.decalage }));
        const cartes: [string, Place][] = [["sommeil", d.seules.sommeil], ["age", d.seules.age], ["poids", d.blocs.gauche.haut], ["gras", d.blocs.gauche.bas], ["vfc", d.blocs.droite.haut], ["fc", d.blocs.droite.bas]];
        for (const [id, k] of cartes) {
          // aucune partie du corps (bras et mains compris) sous une carte : 6 dp d'air en haut, en bas et sur les côtés ; à 320 dp,
          // un corps de 130 kg frôle les blocs du bas (2,5 dp au plus près, mesuré) : 2 dp seulement
          const air = largeur < 360 ? 2 : 6;
          const dedans = pts.filter((q) => q.x > x0(k) - air && q.x < x0(k) + k.largeur + air && q.y > k.y - 6 && q.y < k.y + k.hauteur + 6);
          assert.equal(dedans.length, 0, `${quand}, rot ${rot.toFixed(2)} : ${dedans.length} sommets sous ${id} (${dedans[0]?.bras ? "bras" : "corps"})`);
          assert.ok(k.y >= 0 && k.y + k.hauteur <= d.hauteur, `${quand} : ${id} hors de la zone`);
        }
        // les bras (et les mains) sont tous sous les cartes du haut, jamais à leur hauteur ni dessous
        const basHaut = d.seules.sommeil.y + d.seules.sommeil.hauteur;
        const bras = pts.filter((q) => q.bras);
        assert.ok(Math.min(...bras.map((q) => q.y)) >= basHaut + 4, `${quand} : bras à ${Math.min(...bras.map((q) => q.y)).toFixed(1)} sous les cartes du haut (${basHaut})`);
        // le haut de la tête est à hauteur des cartes du haut, entre elles
        const tete = Math.min(...pts.map((q) => q.y));
        assert.ok(tete >= 0 && tete < basHaut, `${quand} : tête à ${tete.toFixed(1)}, cartes du haut ${d.seules.sommeil.y} à ${basHaut}`);
        // le corps tient dans la zone, pieds à moins de 4 dp de son bas
        const bas = Math.max(...pts.map((q) => q.y));
        assert.ok(bas <= d.hauteur && bas >= d.hauteur - 8, `${quand} : pieds à ${bas.toFixed(1)}, zone ${d.hauteur}`);
      }
      // blocs miroirs : même niveau, même hauteur, haut contre haut
      assert.deepEqual([d.blocs.gauche.haut.y, d.blocs.gauche.haut.hauteur], [d.blocs.droite.haut.y, d.blocs.droite.haut.hauteur], quand);
      // le trait arrive sur le corps (un sommet à moins de 8 dp du point d'ancrage), au repos
      const pts0 = projeter(c, tailleCm, rotationCorps(0, 0, false), largeur).map((q) => ({ ...q, y: q.y - d.decalage }));
      for (const [id, k] of [["sommeil", d.seules.sommeil], ["age", d.seules.age], ["bloc gauche", d.blocs.gauche.haut], ["bloc droit", d.blocs.droite.haut], ["poids", d.seules.poids], ["gras", d.seules.gras], ["vfc", d.seules.vfc], ["fc", d.seules.fc]] as const) {
        const a = { x: largeur / 2 + k.ancre.dx * LARGEUR, y: ((SCENE_HAUT - (tailleCadre(tailleCm) / 100) * k.ancre.f) / SCENE_H) * HAUTEUR_CORPS - d.decalage };
        assert.ok(pts0.some((q) => Math.hypot(q.x - a.x, q.y - a.y) < 8), `${quand} : trait de ${id} dans le vide`);
      }
    }
  });
}

test("Santé : scan de haut en bas en 1,2 s, toutes les 8 à 12 s", () => {
  assert.equal(hauteurScan(-1), null);
  assert.equal(hauteurScan(SCAN.dureeMs + 1), null);
  assert.ok(hauteurScan(0)! > 1 && hauteurScan(SCAN.dureeMs)! < 0);
  assert.ok(hauteurScan(300)! > hauteurScan(600)! && hauteurScan(600)! > hauteurScan(900)!);
  assert.equal(prochainScan(0), 8000);
  assert.equal(prochainScan(1), 12000);
});

test("lien pepfitopen://…?apparence= : jour, nuit, auto, sinon rien", async () => {
  const { apparenceDuLien } = await import("../src/theme/lien.ts");
  assert.equal(apparenceDuLien("pepfitopen://health?apparence=jour"), "jour");
  assert.equal(apparenceDuLien("pepfitopen://3d/squat?x=1&apparence=nuit"), "nuit");
  assert.equal(apparenceDuLien("pepfitopen://health?apparence=auto"), "auto");
  assert.equal(apparenceDuLien("pepfitopen://health?apparence=rouge"), null);
  assert.equal(apparenceDuLien(null), null);
});

test("lien pepfitopen://…?personnage= : homme, femme, sinon rien", async () => {
  const { personnageDuLien } = await import("../src/theme/lien.ts");
  assert.equal(personnageDuLien("homme"), "homme");
  assert.equal(personnageDuLien(["femme"]), "femme");
  assert.equal(personnageDuLien("autre"), null);
  assert.equal(personnageDuLien(undefined), null);
});

for (const nom of ["personnage-morph", "personnage-morph-epaules", "personnage-femme-morph"]) {
  test(`Santé (${nom}) : pose rejouée corps tourné (rotation au doigt, 400 cycles) : les bras ne se plient jamais`, async () => {
    // Fold d'un testeur, 30/10 : à force de tourner le corps, les bras repliés vers l'avant. CorpsSante rejoue la pose à chaque
    // nouveau rendu de Santé (appliquer), le corps dans son pivot, tourné de n'importe quel angle à cet instant.
    const c = await corps(nom);
    const os = c.peau.skeleton.bones;
    const repos = os.map((b) => b.quaternion.clone());
    const pivot = new THREE.Group();
    pivot.add(c.racine);
    pivot.scale.setScalar(0.93);
    pivot.position.y = 0.05;
    // glissés lents et rapides, plusieurs tours dans les deux sens, et les angles qui pliaient le plus (profils, dos)
    const angles = [Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI + 0.16, 1.4, -1.7];
    for (let i = 0; i < 400; i++) angles.push(Math.sin(i * 0.37) * 4 * Math.PI + (i % 7) * 0.11);
    let pire = 0;
    for (const a of angles) {
      pivot.rotation.y = a;
      pivot.updateMatrixWorld(true);
      poseVitruve(c.racine);
      os.forEach((b, i) => (pire = Math.max(pire, b.quaternion.angleTo(repos[i]!))));
    }
    assert.ok(pire < 1e-3, `un os a quitté la pose de ${((pire * 180) / Math.PI).toFixed(1)}°`);
    // et de retour face à l'écran : bras et avant-bras à l'horizontale, vers l'extérieur, dans le repère du personnage
    pivot.rotation.y = 0;
    pivot.updateMatrixWorld(true);
    const dans = (n: string) => c.racine.worldToLocal(c.racine.getObjectByName(n)!.getWorldPosition(new THREE.Vector3()));
    for (const [cote, s] of [["L", 1], ["R", -1]] as const)
      for (const [a, b] of [[`bras${cote}`, `avant_bras${cote}`], [`avant_bras${cote}`, `main${cote}`]]) {
        const d = dans(b!).sub(dans(a!)).normalize();
        assert.ok(d.x * s > 0.99, `${a} : ${d.toArray().map((v) => v.toFixed(2))}`);
      }
    pivot.remove(c.racine);
  });

  test(`Santé (${nom}) : paumes face à l'écran, poignets peu tordus`, async () => {
    const c = await corps(nom);
    c.racine.updateMatrixWorld(true);
    const os: Record<string, THREE.Object3D> = {};
    c.racine.traverse((o) => { if ((o as THREE.Bone).isBone) os[o.name] = o; });
    for (const cote of ["L", "R"] as const) {
      const n = normalePaume(os, cote);
      assert.ok(n.z > 0.85, `paume ${cote} : ${n.toArray().map((v) => v.toFixed(2))}`);
      // torsion du poignet : angle de la main sur l'avant-bras (repère local), sous 60°
      const q = os[`main${cote}`]!.quaternion;
      assert.ok((2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180) / Math.PI < 60, `poignet ${cote}`);
    }
    // rejouée (changement de taille) : même pose, les doigts ne s'écartent pas davantage
    const avant = os.index1L!.quaternion.clone();
    poseVitruve(c.racine, 20);
    poseVitruve(c.racine, 20);
    assert.ok(avant.angleTo(os.index1L!.quaternion) < 0.05);
  });
}
