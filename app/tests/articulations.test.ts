// Articulations (planche articulations, D1 à D9) : migration 65 (type et signes), dépôt, synchro chiffrée, noms affichés,
// toucher du point le plus proche, et points des 13 articulations posés sur les os des deux personnages (GLB de l'appli).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ajouterAuJournal, creerBlessure, lireBlessure, listerBlessures, modifierBlessure } from "../src/db/depots/suivi.ts";
import { migrer, VERSION_COURANTE } from "../src/db/migrations.ts";
import {
  ARTICULATIONS, ecrireSignes, IDS_ARTICULATIONS, IDS_MUSCLES, lireSignes, typeBlessure, typeDeZone, vuePour, zoneSansCote,
} from "../src/db/zones-blessure.ts";
import { aleatoire, pret } from "../src/sync/chiffrement.ts";
import { synchroniser, type Changement, type Lot, type Transport } from "../src/sync/moteur.ts";
import { tableSync } from "../src/sync/schema.ts";
import {
  articulationsAllumees, nomZone, plusProches, pointsChoisis, texteSignes, zoneCourte, zonesAllumees, ZONES_ARTICULATIONS,
} from "../src/ecrans/suivi-calc.ts";
import { definirActif } from "../src/i18n/index.ts";
import { cadrerCorps, matieresVerre, monterCorps } from "../src/ui/3d/corps-gl.ts";
import { FRAG_ZONES } from "../src/ui/3d/verre-zones.ts";
import { memoriserRepos } from "../src/ui/3d/recibler.ts";
import { poseVitruve } from "../src/ui/3d/pose.ts";
import { ancreDe, monterSquelette } from "../src/ui/3d/squelette.ts";
import { HAUTEUR_CORPS, SCENE_BAS, SCENE_HAUT, tailleCadre } from "../src/ui/3d/verre.ts";
import { adapter, baseDeTest, sensiblesChiffrees, vuEnClair } from "./aide.ts";

const FR = { langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" } as const;

test("zones : 13 articulations de la tête aux pieds, sans collision avec les 20 muscles ; type déduit de la zone", () => {
  assert.equal(ARTICULATIONS.length, 13);
  assert.deepEqual(ZONES_ARTICULATIONS, IDS_ARTICULATIONS);
  assert.equal(IDS_ARTICULATIONS[0], "machoire");
  assert.equal(IDS_ARTICULATIONS[12], "pied");
  for (const a of IDS_ARTICULATIONS) assert.ok(!(IDS_MUSCLES as readonly string[]).includes(a), a);
  assert.equal(typeDeZone("deltoide"), "muscle");
  assert.equal(typeDeZone("genou"), "articulation");
  assert.equal(typeDeZone("épaule"), "autre"); // texte libre d'une IA
  assert.equal(typeDeZone(null), "autre");
  // une zone connue fait foi ; sinon le type écrit (valide), sinon « autre »
  assert.equal(typeBlessure("genou", "muscle"), "articulation");
  assert.equal(typeBlessure("dos en vrac", "articulation"), "articulation");
  assert.equal(typeBlessure("dos en vrac", "n'importe"), "autre");
  assert.equal(typeBlessure(null, null), "autre");
  // sans côté : milieu du corps
  for (const z of ["rachis_cervical", "rachis_dorsal", "rachis_lombaire", "sacrum", "cou", "abdominaux", null]) assert.ok(zoneSansCote(z), String(z));
  for (const z of ["genou", "machoire", "deltoide"]) assert.ok(!zoneSansCote(z), z);
  // signes : ordre fixe, inconnus ignorés, rien = null
  assert.deepEqual(lireSignes("gonflement|raideur|craquement"), ["raideur", "gonflement"]);
  assert.equal(ecrireSignes(["gonflement", "raideur"]), "raideur|gonflement");
  assert.equal(ecrireSignes([]), null);
  // page Zone : une articulation d'une seule vue s'ouvre dans la sienne (le bas du dos de dos), les autres gardent la vue
  for (const z of ["rachis_dorsal", "rachis_lombaire", "sacrum"]) assert.equal(vuePour(z, "face"), "dos", z);
  assert.equal(vuePour("machoire", "dos"), "face");
  assert.equal(vuePour("genou", "dos"), "dos");
  assert.equal(vuePour("genou", "face"), "face");
  assert.equal(vuePour("deltoide", "dos"), "dos");
});

test("migration 65 : l'existant est rangé d'après la zone, sans rien pousser à la synchro ; le silence est rendu", async () => {
  assert.ok(VERSION_COURANTE >= 65);
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 64);
  const cols = (t: string) => (raw.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
  assert.ok(!cols("blessure").includes("type"));
  // lignes d'avant (base en 64 : le dépôt d'aujourd'hui écrit déjà `type`)
  const ids = { m: "m", a: "a", l: "l", v: "v" };
  const ins = raw.prepare("INSERT INTO blessure (id, titre, zone, cote, debut, statut, auteur, cree_le, maj_le) VALUES (?, ?, ?, 'd', '2026-10-21', 'active', 'moi', 1, 1)");
  for (const [id, zone] of [["m", "deltoide"], ["a", "genou"], ["l", "épaule"], ["v", null]] as const) ins.run(id, id, zone);
  raw.exec("INSERT INTO blessure_journal (id, blessure_id, date, type, douleur, texte, auteur, cree_le, maj_le) VALUES ('j', 'a', '2026-10-22', 'douleur', 4, '', 'moi', 1, 1)");
  raw.exec("DELETE FROM sync_journal");
  await migrer(db);
  assert.ok(cols("blessure").includes("type"));
  assert.ok(cols("blessure_journal").includes("signes"));
  const type = (id: string) => (raw.prepare("SELECT type FROM blessure WHERE id = ?").get(id) as { type: string }).type;
  assert.deepEqual([type(ids.m), type(ids.a), type(ids.l), type(ids.v)], ["muscle", "articulation", "autre", "autre"]);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM sync_journal").get() as { n: number }).n, 0, "rien poussé");
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM sync_silence").get() as { n: number }).n, 0, "silence rendu");
  // l'entrée d'avant n'a pas de signes
  assert.deepEqual((await lireBlessure(db, ids.a))!.journal.map((e) => e.signes), [[]]);
  // le journal remarche après la migration
  await modifierBlessure(db, ids.m, { zone: "coude", cote: "g" });
  assert.ok((raw.prepare("SELECT COUNT(*) AS n FROM sync_journal WHERE tab = 'blessure'").get() as { n: number }).n > 0);
  // une seconde passe ne change rien (témoin)
  await migrer(db);
  assert.equal(type(ids.a), "articulation");
  assert.throws(() => raw.exec(`UPDATE blessure SET type = 'os' WHERE id = '${ids.m}'`), "type contrôlé");
});

test("dépôt : le type suit la zone à la création et au changement de zone ; une ligne sans type (ancienne) est déduite ; signes", async () => {
  const { db, raw } = await baseDeTest();
  const a = await creerBlessure(db, { titre: "Genou droit", zone: "genou", cote: "d", debut: "2026-11-02" });
  const m = await creerBlessure(db, { titre: "Deltoïde droit", zone: "deltoide", cote: "d", debut: "2026-11-02" });
  const l = await creerBlessure(db, { titre: "Dos", zone: "bas du dos", cote: "-", debut: "2026-11-02", type: "articulation" });
  assert.deepEqual([(await lireBlessure(db, a))!.blessure.type, (await lireBlessure(db, m))!.blessure.type, (await lireBlessure(db, l))!.blessure.type], ["articulation", "muscle", "articulation"]);
  await modifierBlessure(db, m, { zone: "cheville", cote: "g" });
  assert.equal((await lireBlessure(db, m))!.blessure.type, "articulation");
  raw.exec(`UPDATE blessure SET type = NULL WHERE id = '${a}'`);
  assert.equal((await listerBlessures(db)).find((b) => b.id === a)!.type, "articulation");
  await ajouterAuJournal(db, a, { date: "2026-11-03", type: "douleur", douleur: 3, texte: "", signes: ["gonflement", "raideur"] });
  await ajouterAuJournal(db, a, { date: "2026-11-03", type: "aide", douleur: null, texte: "glace", signes: ["raideur"] });
  const j = (await lireBlessure(db, a))!.journal;
  assert.deepEqual(j.map((e) => [e.type, e.signes]).sort(), [["aide", []], ["douleur", ["raideur", "gonflement"]]]);
  assert.equal((raw.prepare("SELECT signes FROM blessure_journal WHERE type = 'aide'").get() as { signes: string | null }).signes, null);
});

/** Serveur en mémoire minimal (comme dans suivi.test.ts). */
function faux() {
  const lignes = new Map<string, Changement & { seq: number }>();
  let seq = 0;
  const transport: Transport = {
    pousser: async (lot) => {
      for (const c of lot) lignes.set(`${c.tab}/${c.cle}`, { ...c, seq: ++seq });
    },
    tirer: async (curseur, limite): Promise<Lot> => {
      const l = [...lignes.values()].filter((x) => x.seq > (curseur ? Number(curseur) : 0)).sort((x, y) => x.seq - y.seq);
      const page = l.slice(0, limite);
      return { changements: page.map(({ seq: _, ...c }) => c), curseur: page.length ? String(page[page.length - 1]!.seq) : curseur, encore: l.length > limite };
    },
    envoyerFichier: async () => {},
    lireFichier: async () => null,
    supprimerFichier: async () => {},
  };
  return { lignes, transport };
}

test("synchro : type et signes passent sur l'autre téléphone, chiffrés (le serveur ne lit ni « articulation » ni « raideur »)", async () => {
  await pret();
  const s = faux();
  const cle = aleatoire(32);
  const A = await baseDeTest();
  const B = await baseDeTest();
  const id = await creerBlessure(A.db, { titre: "Genou droit", zone: "genou", cote: "d", debut: "2026-11-02" });
  await ajouterAuJournal(A.db, id, { date: "2026-11-03", type: "ressenti", douleur: null, texte: "escaliers", signes: ["raideur"] });
  await synchroniser({ db: A.db, transport: s.transport, cle, noeud: "A" });
  assert.ok(sensiblesChiffrees(s.lignes.values(), "blessure", tableSync("blessure")!.sensibles) > 0);
  const vu = vuEnClair(s.lignes.values());
  for (const secret of ["articulation", "raideur", "genou"]) assert.ok(!vu.includes(secret), secret);
  await synchroniser({ db: B.db, transport: s.transport, cle, noeud: "B" });
  const f = (await lireBlessure(B.db, id))!;
  assert.equal(f.blessure.type, "articulation");
  assert.deepEqual(f.journal.map((e) => e.signes), [["raideur"]]);
});

test("noms : « Genou droit », « Épaule droite », « Deux genoux », fiche « Genou, droit » ; en anglais aussi", () => {
  definirActif(FR);
  assert.equal(nomZone("genou", "d"), "Genou droit");
  assert.equal(nomZone("epaule", "d"), "Épaule droite");
  assert.equal(nomZone("main", "g"), "Main gauche");
  assert.equal(nomZone("pied", "d"), "Pied droit");
  assert.equal(nomZone("genou", "2"), "Deux genoux");
  assert.equal(nomZone("machoire", "2"), "Deux côtés de la mâchoire");
  assert.equal(nomZone("sacrum", "d"), "Sacrum et coccyx"); // sans côté : le côté est ignoré
  assert.equal(zoneCourte("genou", "d"), "Genou, droit");
  assert.equal(zoneCourte("main", "2"), "Main, les deux");
  assert.equal(zoneCourte("rachis_lombaire", "d"), "Bas du dos");
  assert.equal(texteSignes(["raideur", "gonflement"]), "Raideur, gonflement");
  definirActif({ ...FR, langue: "en" });
  try {
    assert.equal(nomZone("genou", "d"), "Knee, right");
    assert.equal(nomZone("genou", "2"), "Both knees");
    assert.equal(zoneCourte("main", "g"), "Hand, left");
    assert.equal(texteSignes(["raideur", "gonflement"]), "Stiffness, swelling");
  } finally {
    definirActif(FR);
  }
});

test("Santé : les articulations actives ont leur anneau, elles n'allument pas de muscle", () => {
  const l = [
    { id: "1", zone: "genou", cote: "d" as const, statut: "active" as const },
    { id: "2", zone: "deltoide", cote: "g" as const, statut: "active" as const },
    { id: "3", zone: "coude", cote: "g" as const, statut: "reduite" as const },
    { id: "4", zone: "sacrum", cote: "d" as const, statut: "active" as const },
  ];
  assert.deepEqual(zonesAllumees(l).map((z) => z.id), ["2"]);
  assert.deepEqual(articulationsAllumees(l), [{ id: "1", zone: "genou", cote: "d" }, { id: "4", zone: "sacrum", cote: "-" }]);
  assert.deepEqual(pointsChoisis("genou", "2"), ["genou:d", "genou:g"]);
  assert.deepEqual(pointsChoisis("sacrum", "d"), ["sacrum:-"]);
  assert.deepEqual(pointsChoisis(null, "d"), []);
});

test("toucher : le point le plus proche à 36 dp au plus ; puces pour ceux à 14 dp de plus, 3 au plus", () => {
  const p = { "a:d": { x: 100, y: 100 }, "b:d": { x: 110, y: 100 }, "c:-": { x: 100, y: 112 }, "d:-": { x: 112, y: 112 }, "e:g": { x: 300, y: 300 } };
  assert.deepEqual(plusProches(p, 101, 100), { choisi: "a:d", proches: ["a:d", "b:d", "c:-"] });
  assert.deepEqual(plusProches(p, 300, 310), { choisi: "e:g", proches: [] }, "seul : pas de puce");
  assert.equal(plusProches(p, 300, 340), null, "à 40 dp : rien");
  assert.equal(plusProches({}, 0, 0), null);
});

// ---------- Points sur le vrai personnage ----------

async function personnage(f: string) {
  const o = readFileSync(new URL(`../assets/3d/${f}`, import.meta.url));
  const g = await new GLTFLoader().parseAsync(o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength) as ArrayBuffer, "");
  memoriserRepos(g.scene);
  return g.scene;
}

/** Zone 412 × 470 de la page Zone (`fixe`), comme CorpsSante : les points des articulations d'une vue, en dp. */
function points(cache: THREE.Object3D, tailleCm: number, dos: boolean) {
  const m = matieresVerre({}, FRAG_ZONES, true);
  const c = monterCorps(cache, m.verre, m.profondeur);
  const pivot = new THREE.Group();
  pivot.add(c.racine);
  poseVitruve(c.racine);
  const sq = monterSquelette(c.racine, c.hBase, c.pied);
  const k = tailleCadre(tailleCm) / 100 / c.hBase;
  pivot.scale.setScalar(k);
  pivot.position.y = -c.pied * k;
  pivot.rotation.y = dos ? Math.PI + 0.16 : -0.16;
  pivot.updateMatrixWorld(true);
  const cam = new THREE.OrthographicCamera(-1, 1, SCENE_HAUT, SCENE_BAS, 0.1, 20);
  cam.position.z = 6;
  cadrerCorps(cam, 412, HAUTEUR_CORPS);
  cam.updateMatrixWorld(true);
  const ecran = (p: THREE.Vector3) => {
    const w = c.racine.localToWorld(p.clone()).project(cam);
    return { x: ((w.x + 1) / 2) * 412, y: ((1 - w.y) / 2) * HAUTEUR_CORPS };
  };
  const vue = dos ? "dos" : "face";
  return { pts: Object.fromEntries(Object.entries(sq.ancres[vue]).map(([cle, p]) => [cle, ecran(p)])), sq };
}

test("squelette : construit des os du GLB (homme et femme) ; points dans la zone, côtés à leur place, ordre de la tête aux pieds", async () => {
  for (const [f, taille] of [["personnage-morph.glb", 178], ["personnage-femme-morph.glb", 165]] as const) {
    const cache = await personnage(f);
    for (const dos of [false, true]) {
      const { pts, sq } = points(cache, taille, dos);
      assert.ok((sq.mesh.geometry.getAttribute("position") as THREE.BufferAttribute).count > 10_000, "un squelette entier");
      const attendus = ARTICULATIONS.filter((a) => a.vues.includes(dos ? "dos" : "face")).flatMap((a) => (a.cote ? [`${a.id}:d`, `${a.id}:g`] : [`${a.id}:-`]));
      assert.deepEqual(Object.keys(pts).sort(), attendus.sort(), `${f} ${dos ? "dos" : "face"}`);
      for (const [cle, p] of Object.entries(pts)) {
        assert.ok(p.x > 0 && p.x < 412 && p.y > 0 && p.y < HAUTEUR_CORPS, `${f} ${cle} ${p.x},${p.y}`);
      }
      // de face, la droite du personnage est à gauche de l'écran ; de dos, l'inverse
      const s = dos ? -1 : 1;
      for (const id of ["epaule", "coude", "genou", "pied"]) assert.ok(s * (pts[`${id}:g`]!.x - pts[`${id}:d`]!.x) > 0, `${f} ${id} ${dos}`);
      // de la tête aux pieds
      const y = (k: string) => pts[k]!.y;
      assert.ok(y("epaule:d") < y("hanche:d") && y("hanche:d") < y("genou:d") && y("genou:d") < y("cheville:d") && y("cheville:d") < y("pied:d") + 12);
      if (dos) assert.ok(y("rachis_dorsal:-") < y("rachis_lombaire:-") && y("rachis_lombaire:-") < y("sacrum:-"));
      // anneaux de Santé : une articulation d'une seule vue n'a pas de point dans l'autre (le sacrum ne tombe plus sur le pubis)
      const vue = dos ? "dos" : "face";
      for (const cle of ["rachis_dorsal:-", "rachis_lombaire:-", "sacrum:-"]) assert.equal(!!ancreDe(sq.ancres, vue, cle), dos, `${f} ${cle} ${vue}`);
      assert.equal(!!ancreDe(sq.ancres, vue, "machoire:d"), !dos);
      assert.ok(ancreDe(sq.ancres, vue, "genou:d") && ancreDe(sq.ancres, vue, "rachis_cervical:-"));
    }
  }
});

test("squelette : sous la même racine que le personnage, il se retourne avec lui (de dos, colonne et omoplates devant, sternum au fond)", async () => {
  const cache = await personnage("personnage-morph.glb");
  const m = matieresVerre({}, FRAG_ZONES, true);
  const c = monterCorps(cache, m.verre, m.profondeur);
  const pivot = new THREE.Group();
  pivot.add(c.racine);
  poseVitruve(c.racine);
  const sq = monterSquelette(c.racine, c.hBase, c.pied);
  c.racine.add(sq.mesh);
  const pos = sq.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  // points les plus en arrière (colonne, omoplates) et les plus en avant (sternum, clavicules) du squelette, repère de la racine
  let arriere = 0, avant = 0;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) < pos.getZ(arriere)) arriere = i;
    if (pos.getZ(i) > pos.getZ(avant)) avant = i;
  }
  for (const dos of [false, true]) {
    pivot.rotation.y = dos ? Math.PI + 0.16 : -0.16;
    pivot.updateMatrixWorld(true);
    // la caméra regarde vers -z : le plus proche a le z du monde le plus grand
    const zMonde = (i: number) => sq.mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(pos, i)).z;
    assert.equal(zMonde(arriere) > zMonde(avant), dos, dos ? "de dos, l'arrière du squelette est devant" : "de face, il est derrière");
    assert.ok(sq.mesh.matrixWorld.equals(c.racine.matrixWorld), "même matrice que le personnage");
  }
  assert.ok((sq.matiere.uniforms.uDemi!.value as number) > 0.04, "la profondeur des os se lit depuis la caméra, pas depuis l'avant du corps");
});

test("toucher sur le personnage : le genou pris au doigt ; pire cas (femme de dos, bassin) : 3 puces au plus", async () => {
  const homme = points(await personnage("personnage-morph.glb"), 178, false).pts;
  const g = homme["genou:d"]!;
  assert.equal(plusProches(homme, g.x + 6, g.y + 4)?.choisi, "genou:d");
  const femme = points(await personnage("personnage-femme-morph.glb"), 165, true).pts;
  const bassin = ["rachis_lombaire:-", "sacrum:-", "hanche:d", "hanche:g"].map((k) => femme[k]!);
  const centre = { x: bassin.reduce((s, p) => s + p.x, 0) / 4, y: bassin.reduce((s, p) => s + p.y, 0) / 4 };
  const r = plusProches(femme, centre.x, centre.y);
  assert.ok(r, "un point pris au milieu du bassin");
  assert.ok(r.proches.length >= 2 && r.proches.length <= 3, `puces ${r.proches.join(", ")}`);
  assert.ok(r.proches.includes(r.choisi));
});
