// La page d'un circuit (planche Circuits, lot C ; docs/CODE-CIRCUITS.md) : la durée à l'affichage, le tracé et le profil à dessiner,
// le chargement sur le téléphone et la table des circuits vus (migration 188, restée vide).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { chargerGarde } from "../src/circuits/chargement.ts";
import { construireCircuit } from "../src/circuits/construire.ts";
import { dureeEstimeeMin, partiesDuree } from "../src/circuits/duree.ts";
import { activiteAffichee, cibleDuDepart, cleSource, plageProfil, segmentsDuree, SUIVRE_DISPONIBLE } from "../src/circuits/page.ts";
import type { Circuit, PointAlt } from "../src/circuits/types.ts";
import { courbeProfil, indiceALaDistance, morceauxCircuit, vueDuCircuit } from "../src/circuits/vue.ts";
import { ecrireCircuit } from "../src/db/depots/circuits.ts";
import { MIGRATIONS } from "../src/db/migrations.ts";
import { TABLES_SYNC } from "../src/sync/schema.ts";
import { baseDeTest } from "./aide.ts";

interface Cas {
  nom: string;
  points: [number, number, number][];
}
const CAS = (JSON.parse(readFileSync(new URL("./fixtures/circuits-cas.json", import.meta.url), "utf8")) as { circuits: Record<string, Cas> }).circuits;
const pts = (c: Cas): PointAlt[] => c.points.map(([lat, lon, alt]) => ({ lat, lon, alt }));
const plateau = (id = "abcdefghij12345"): Circuit => construireCircuit({ nom: CAS.plateau!.nom, points: pts(CAS.plateau!), activites: ["randonnee", "course"], source: "sortie", id, maintenant: 1000 })!;

// ------------------------------------------------------------------ La durée (D7)

test("durée : les chiffres de la planche (4,3 km +83 m à pied 1 h 05 ; 14,1 km +203 m 3 h 30 ; 19,6 km +274 m à vélo 1 h 45)", () => {
  assert.equal(dureeEstimeeMin(4300, 83, "randonnee"), 65);
  assert.equal(dureeEstimeeMin(14100, 203, "randonnee"), 210);
  assert.equal(dureeEstimeeMin(19600, 274, "bicycling"), 105);
});

test("durée : arrondie aux 5 minutes, 5 au moins, la distance seule sans dénivelé, jamais négative", () => {
  for (const a of ["randonnee", "course", "bicycling", "vtt"] as const) {
    for (const [d, p] of [[1234, 56], [9999, null], [20000, 900]] as const) assert.equal(dureeEstimeeMin(d, p, a) % 5, 0, `${a} ${d}`);
  }
  assert.equal(dureeEstimeeMin(10000, null, "randonnee"), 135, "10 km à 4,5 km/h = 2 h 13");
  assert.equal(dureeEstimeeMin(0, 0, "course"), 5);
  assert.equal(dureeEstimeeMin(-50, -20, "course"), 5);
  assert.ok(dureeEstimeeMin(14100, 203, "course") < dureeEstimeeMin(14100, 203, "randonnee"), "on court plus vite qu'on ne marche");
  assert.equal(dureeEstimeeMin(14100, 203, "vtt"), dureeEstimeeMin(14100, 203, "bicycling"), "le VTT prend la formule du vélo (la planche n'en dit rien)");
});

test("durée : heures et minutes pour l'affichage", () => {
  assert.deepEqual(partiesDuree(65), { h: 1, min: 5 });
  assert.deepEqual(partiesDuree(45), { h: 0, min: 45 });
  assert.deepEqual(partiesDuree(210), { h: 3, min: 30 });
  assert.deepEqual(partiesDuree(-3), { h: 0, min: 0 });
});

// ------------------------------------------------------------------ Le tracé et le profil

test("tracé : points, altitudes, distance cumulée ; la longueur est celle du circuit à 1 m près", () => {
  const c = plateau();
  const v = vueDuCircuit(c)!;
  assert.ok(v);
  assert.equal(v.cumul[0], 0);
  assert.equal(v.cumul.length, v.points.length);
  assert.equal(v.alts!.length, v.points.length);
  assert.ok(Math.abs(v.longueurM - c.distanceM) <= 1, `${v.longueurM} / ${c.distanceM}`);
  assert.ok(v.cumul.every((d, i) => i === 0 || d >= v.cumul[i - 1]!), "croissante");
});

test("tracé : illisible ou d'un seul point → null ; profil de mauvaise longueur → sans altitudes", () => {
  const c = plateau();
  assert.equal(vueDuCircuit({ trace: "\u0000", profil: null }), null);
  assert.equal(vueDuCircuit({ trace: "", profil: null }), null);
  assert.equal(vueDuCircuit({ trace: c.trace, profil: "??" })!.alts, null);
  assert.equal(vueDuCircuit({ trace: c.trace, profil: null })!.alts, null);
});

test("morceaux : le trait est continu, la rampe va du bas au haut, une couleur sans altitudes", () => {
  const n = 20;
  const alts = Array.from({ length: n }, (_, i) => 100 + i * 10);
  const m = morceauxCircuit(alts, n, "#000000", "#ffffff", "#808080");
  assert.equal(m[0]!.a, 0);
  assert.equal(m.at(-1)!.b, n - 1);
  for (let i = 1; i < m.length; i++) assert.equal(m[i]!.a, m[i - 1]!.b, "les morceaux se touchent");
  assert.equal(m[0]!.couleur, "#000000", "le point le plus bas");
  assert.ok(m.at(-1)!.couleur > m[0]!.couleur, "plus clair en haut");
  const neutre = morceauxCircuit(null, n, "#000000", "#ffffff", "#808080");
  assert.ok(neutre.every((x) => x.couleur === "#808080"));
  assert.deepEqual(morceauxCircuit(alts, 1, "#000000", "#ffffff", "#808080"), []);
  const plat = morceauxCircuit(Array(n).fill(120), n, "#000000", "#ffffff", "#808080");
  assert.ok(plat.every((x) => x.couleur === plat[0]!.couleur), "un circuit plat : une seule couleur, au milieu de la rampe");
});

test("profil : la distance en abscisse de 0 à la largeur, le haut en haut, tout dans le cadre ; rien sans altitudes", () => {
  const v = vueDuCircuit(plateau())!;
  const cadre = { l: 300, h: 100, haut: 8, bas: 4 };
  const p = courbeProfil(v, cadre)!;
  assert.equal(p.xy.length, v.points.length);
  assert.equal(p.xy[0]!.x, 0);
  assert.ok(Math.abs(p.xy.at(-1)!.x - 300) < 1e-6);
  assert.ok(p.xy.every((q) => q.y >= cadre.haut - 1e-6 && q.y <= cadre.h - cadre.bas + 1e-6), "dans le cadre");
  const iMin = v.alts!.indexOf(Math.min(...v.alts!));
  const iMax = v.alts!.indexOf(Math.max(...v.alts!));
  assert.ok(p.xy[iMax]!.y < p.xy[iMin]!.y, "le sommet est plus haut que le fond");
  assert.ok(p.lo < Math.min(...v.alts!) && p.hi > Math.max(...v.alts!), "une marge autour des extrêmes");
  assert.equal(courbeProfil({ ...v, alts: null }, cadre), null);
  assert.equal(courbeProfil(v, { l: 0, h: 100, haut: 8, bas: 4 }), null);
  assert.equal(courbeProfil(v, { l: 300, h: 10, haut: 8, bas: 4 }), null);
});

test("indice à la distance : le point le plus proche, aux bornes aussi", () => {
  const cumul = [0, 100, 250, 400];
  assert.equal(indiceALaDistance(cumul, -10), 0);
  assert.equal(indiceALaDistance(cumul, 0), 0);
  assert.equal(indiceALaDistance(cumul, 40), 0);
  assert.equal(indiceALaDistance(cumul, 60), 1);
  assert.equal(indiceALaDistance(cumul, 250), 2);
  assert.equal(indiceALaDistance(cumul, 999), 3);
});

// ------------------------------------------------------------------ Le chargement

const ID = "abcdefghij12345";

test("chargement : un circuit à soi s'ouvre sur le téléphone ; absent → null", async () => {
  const { db } = await baseDeTest();
  assert.equal(await chargerGarde(db, ID), null);
  const c = plateau(ID);
  await ecrireCircuit(db, c);
  const garde = await chargerGarde(db, ID);
  assert.ok(garde && garde.etat === "pret" && garde.circuit.id === ID);
});

// ------------------------------------------------------------------ La table des circuits vus (migration 188)

test("migration 188 : une table locale, jamais synchronisée, sans déclencheur de synchro", async () => {
  const m = MIGRATIONS.find((x) => x.version === 188)!;
  assert.equal(m.temoin, "circuit_vu");
  const { raw } = await baseDeTest();
  assert.ok(raw.prepare("SELECT 1 FROM sqlite_master WHERE name = 'circuit_vu'").get());
  assert.equal(TABLES_SYNC.some((t) => t.nom === "circuit_vu"), false);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'circuit_vu'").get() as { n: number }).n, 0);
});

// ------------------------------------------------------------------ Ce que la page décide

test("page : l'activité du Segmenté est celle touchée si le circuit la porte, sinon la première ; jamais vide", () => {
  assert.equal(activiteAffichee(["randonnee", "course"], null), "randonnee");
  assert.equal(activiteAffichee(["randonnee", "course"], "course"), "course");
  assert.equal(activiteAffichee(["bicycling"], "course"), "bicycling", "une activité que le circuit n'a pas est ignorée");
  assert.equal(activiteAffichee([], null), "randonnee");
});

test("page : la ligne de source dit d'où vient le tracé ; les altitudes de l'IGN s'ajoutent ; une sortie est « la tienne »", () => {
  assert.deepEqual(cleSource({ source: "osm", altSource: "ign" }), { cle: "circuit.source.osm", avecIgn: true });
  assert.deepEqual(cleSource({ source: "pdipr", altSource: null }), { cle: "circuit.source.pdipr", avecIgn: false });
  assert.deepEqual(cleSource({ source: "sortie", altSource: "trace" }), { cle: "circuit.source.mien", avecIgn: false });
  assert.deepEqual(cleSource({ source: "gpx", altSource: "trace" }), { cle: "circuit.source.gpx", avecIgn: false });
});

test("page : la plage du profil n'existe que s'il y a un profil et ses extrêmes", () => {
  assert.deepEqual(plageProfil({ altMinM: 76, altMaxM: 178, profil: "abc" }), { bas: 76, haut: 178 });
  assert.equal(plageProfil({ altMinM: 76, altMaxM: 178, profil: null }), null);
  assert.equal(plageProfil({ altMinM: null, altMaxM: null, profil: "abc" }), null);
});

test("page : « Suivre ce circuit » et « Mon temps » sont montrés (lot F)", () => {
  assert.equal(SUIVRE_DISPONIBLE, true);
});

test("départ : la salle déjà sur le téléphone ; sinon rien", async () => {
  const { db, raw } = await baseDeTest();
  raw.prepare("INSERT INTO salle (id,nom,defaut,equipements,source_id,cree_le,maj_le) VALUES ('salle1','Gare du plateau',0,'','node/123',1,1)").run();
  assert.equal(await cibleDuDepart(db, "node/123"), "salle1");
  assert.equal(await cibleDuDepart(db, "node/404"), null);
  assert.equal(await cibleDuDepart(db, null), null);
});

test("durée en gros chiffres : « 3 h 30 », « 3 h » pile, « 1 h 05 », « 45 min », jamais négative", () => {
  assert.deepEqual(segmentsDuree(210), [{ v: "3", u: "h" }, { v: "30", u: null }]);
  assert.deepEqual(segmentsDuree(180), [{ v: "3", u: "h" }]);
  assert.deepEqual(segmentsDuree(65), [{ v: "1", u: "h" }, { v: "05", u: null }]);
  assert.deepEqual(segmentsDuree(45), [{ v: "45", u: "min" }]);
  assert.deepEqual(segmentsDuree(-5), [{ v: "0", u: "min" }]);
});
