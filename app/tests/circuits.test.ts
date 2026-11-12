// Socle des circuits (planche Circuits, lot B ; docs/CODE-CIRCUITS.md) : les calculs du tracé (les six tracés de la démo, mêmes cas
// que le serveur : serveur/tests/circuits-cas.json), le codage, le type, le lecteur de GPX, le test du domicile et la table `circuit`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { construireCircuit, completerAltitudes, nomDeCircuit } from "../src/circuits/construire.ts";
import { procheDuDomicile, publiableSansDomicile } from "../src/circuits/domicile.ts";
import { bbox, densifier, ecartSegmentM, longueurM, zoneDe } from "../src/circuits/geo.ts";
import { circuitDepuisGpx, lireGpx, nomDuFichier } from "../src/circuits/gpx.ts";
import { ID_CIRCUIT, idCircuit } from "../src/circuits/id.ts";
import { decoderAltitudes, decoderTrace, encoderAltitudes, encoderTrace } from "../src/circuits/polyline.ts";
import { GPX_OCTETS_MAX, POINTS_MAX } from "../src/circuits/regles.ts";
import { typeDuTrace } from "../src/circuits/type.ts";
import type { Circuit, PointAlt } from "../src/circuits/types.ts";
import {
  ecrireCircuit, lieuxPersonnels, listerCircuits, lireCircuit, modifierCircuit, nombreDeCircuits, noterVisibilite, pointsDuCircuit, restaurerCircuit, supprimerCircuit,
} from "../src/db/depots/circuits.ts";
import { baseDeTest } from "./aide.ts";

interface Cas {
  nom: string;
  points: [number, number, number][];
  attendu: { gardes: number; trace_octets: number; denivele_plus_m: number; denivele_moins_m: number; type: string; distance_m: number };
}
const CAS = (JSON.parse(readFileSync(new URL("./fixtures/circuits-cas.json", import.meta.url), "utf8")) as { circuits: Record<string, Cas> }).circuits;
const pts = (c: Cas): PointAlt[] => c.points.map(([lat, lon, alt]) => ({ lat, lon, alt }));

const trkpt = (lat: number, lon: number, ele?: number | null, extra = "") =>
  `<trkpt lat="${lat}" lon="${lon}">${ele == null ? "" : `<ele>${ele}</ele>`}${extra}</trkpt>`;
const gpx = (corps: string) => `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">${corps}</gpx>`;
/** Une ligne droite de n points vers l'est, de 11 m environ par point. */
const droite = (n: number, lat = 48.8, lon = 5.6537) => Array.from({ length: n }, (_, i) => ({ lat, lon: lon + i * 0.00015, alt: 100 as number | null }));

// ------------------------------------------------------------------ Les six tracés de la démo (mêmes attendus que le serveur)

for (const [cle, cas] of Object.entries(CAS)) {
  test(`tracé « ${cle} » : points gardés, octets, dénivelé, type et distance comme le serveur`, () => {
    const c = construireCircuit({ nom: cas.nom, points: pts(cas), activites: ["randonnee"], source: "sortie" })!;
    assert.ok(c, cle);
    assert.equal(decoderTrace(c.trace)!.length, cas.attendu.gardes, "gardés");
    assert.equal(Buffer.byteLength(c.trace), cas.attendu.trace_octets, "octets de la trace");
    assert.equal(c.denivelePlusM, cas.attendu.denivele_plus_m, "D+");
    assert.equal(c.deniveleMoinsM, cas.attendu.denivele_moins_m, "D-");
    assert.equal(c.type, cas.attendu.type, "type");
    // La distance de la planche est celle du tracé entier ; le circuit garde celle du tracé GARDÉ (le serveur de même : tolérance de 100 m)
    assert.equal(c.distanceM, Math.round(longueurM(decoderTrace(c.trace)!)), "distance du tracé gardé");
    assert.ok(Math.abs(c.distanceM - cas.attendu.distance_m) < 100, `distance ${c.distanceM} contre ${cas.attendu.distance_m}`);
    assert.ok(decoderTrace(c.trace)!.length <= POINTS_MAX);
  });
}

test("un circuit construit : privé, sans auteur, un profil par point gardé, bornes et zone du départ", () => {
  const cas = CAS.plateau!;
  const c = construireCircuit({ nom: cas.nom, points: pts(cas), activites: ["randonnee", "course"], source: "gpx", id: "plateau00000001", maintenant: 1000 })!;
  assert.equal(c.id, "plateau00000001");
  assert.equal(c.visibilite, "prive");
  assert.equal(c.publieLe, null);
  assert.equal(c.licence, "propre");
  assert.equal(c.altSource, "trace");
  assert.equal(c.sourceRef, null);
  const gardes = decoderTrace(c.trace)!;
  assert.equal(decoderAltitudes(c.profil!)!.length, gardes.length, "une altitude par point gardé");
  assert.deepEqual(c.bbox, bbox(gardes));
  assert.equal(c.zone, zoneDe(gardes[0]!.lat, gardes[0]!.lon));
  assert.equal(c.zone, "44_3");
  assert.ok(c.altMinM! <= c.altMaxM!);
  assert.deepEqual(Object.keys(c).filter((k) => /auteur|owner|user|proprietaire/i.test(k)), [], "jamais d'auteur");
});

test("dénivelé : un seuil de 3 m, les petites ondulations ne comptent pas", () => {
  const trace = droite(40);
  const sans = (alts: number[]) => construireCircuit({ nom: "T", points: trace.map((p, i) => ({ ...p, alt: alts[i]! })), activites: ["randonnee"], source: "gpx" })!;
  const petit = sans(trace.map((_, i) => 100 + (i % 2 ? 2 : 0)));
  assert.equal(petit.denivelePlusM, 0);
  assert.equal(petit.deniveleMoinsM, 0);
  const net = sans(trace.map((_, i) => 100 + (i % 2 ? 6 : 0)));
  assert.ok(net.denivelePlusM! >= 100, `D+ ${net.denivelePlusM}`);
  const montee = sans(trace.map((_, i) => 100 + i));
  assert.equal(montee.denivelePlusM, 39);
  assert.equal(montee.deniveleMoinsM, 0);
});

test("altitudes : un trou isolé est comblé, plus de 20 % manquantes et il n'y a plus de profil", () => {
  const dix = (a: (number | null)[]) => [...a, ...Array.from({ length: 12 - a.length }, (_, i) => 30 + i)];
  assert.deepEqual(completerAltitudes(dix([10, null, 14]))!.slice(0, 3), [10, 12, 14], "comblé entre ses deux voisines");
  assert.deepEqual(completerAltitudes(dix([null, 10, 20]))!.slice(0, 3), [10, 10, 20], "au début : la première valeur connue");
  assert.equal(completerAltitudes([10, null, 14]), null, "un tiers manquant : plus de profil");
  assert.equal(completerAltitudes([10, null, null, null, 20]), null);
  assert.equal(completerAltitudes([null, null]), null);
  assert.equal(completerAltitudes([]), null);
  assert.equal(completerAltitudes([10, 99999, 12, 13, 14, 15, 16, 17, 18, 19])![1], 11, "une altitude absurde compte pour manquante");
  const sans = construireCircuit({ nom: "T", points: droite(30).map((p) => ({ ...p, alt: null })), activites: ["randonnee"], source: "gpx" })!;
  assert.equal(sans.profil, null);
  assert.equal(sans.denivelePlusM, null);
  assert.equal(sans.altSource, null);
});

test("nom : espaces réduits, 80 caractères au plus, « Circuit » à défaut", () => {
  assert.equal(nomDeCircuit("  Tour   du  lac \n"), "Tour du lac");
  assert.equal(nomDeCircuit("x".repeat(200))!.length, 80);
  assert.equal(nomDeCircuit("   "), null);
  assert.equal(construireCircuit({ nom: "  ", points: droite(5), activites: ["randonnee"], source: "gpx" })!.nom, "Circuit");
});

test("moins de deux points : pas de circuit", () => {
  assert.equal(construireCircuit({ nom: "T", points: droite(1), activites: ["randonnee"], source: "gpx" }), null);
});

// ------------------------------------------------------------------ Codage, type, géométrie, identifiant

test("polyline : un tracé encodé puis décodé revient à 5 décimales, une chaîne coupée est refusée", () => {
  const trace = [{ lat: 48.80796, lon: 5.69467 }, { lat: 48.80803, lon: 5.6946 }, { lat: -33.86882, lon: 151.20929 }, { lat: 0, lon: -0.00001 }];
  assert.deepEqual(decoderTrace(encoderTrace(trace)), trace);
  assert.deepEqual(decoderTrace(encoderTrace([{ lat: 48.807963, lon: 5.694674 }])), [{ lat: 48.80796, lon: 5.69467 }], "arrondi à la 5e décimale");
  assert.equal(decoderTrace("_p~iF~ps|U_ulLnnqC_mqNvxq`@")!.length, 3, "l'exemple de la documentation de Google");
  assert.equal(decoderTrace("_p~iF~ps|U_ulL"), null, "coupée au milieu d'un point");
  assert.equal(decoderTrace("é"), null);
});

test("altitudes : codées en écarts entiers, aller et retour", () => {
  const alts = [76, 77, 75, 75, 120, -3, 0, 1234];
  assert.deepEqual(decoderAltitudes(encoderAltitudes(alts)), alts);
  assert.deepEqual(decoderAltitudes(""), []);
});

test("type : boucle, aller-retour ou linéaire", () => {
  const ligne = droite(60);
  assert.equal(typeDuTrace(ligne), "lineaire");
  assert.equal(typeDuTrace([...ligne, ...ligne.slice(0, -1).reverse()]), "aller-retour");
  // retour par un autre chemin, à 300 m du premier : l'arrivée est à moins de 150 m du départ, mais ce n'est pas le même chemin
  const parallele = ligne.map((p) => ({ lat: p.lat + 0.0027, lon: p.lon })).reverse();
  assert.equal(typeDuTrace([...ligne, ...parallele, { lat: ligne[0]!.lat + 0.0003, lon: ligne[0]!.lon }]), "boucle");
  assert.equal(typeDuTrace([...ligne, ...parallele]), "lineaire", "arrivée à 300 m du départ : pas une boucle");
  const rond = Array.from({ length: 101 }, (_, i) => ({ lat: 48.8 + 0.004 * Math.cos((i / 100) * 2 * Math.PI), lon: 5.6537 + 0.006 * Math.sin((i / 100) * 2 * Math.PI) }));
  assert.equal(typeDuTrace(rond), "boucle");
  assert.equal(typeDuTrace(ligne.slice(0, 1)), "lineaire");
});

test("géométrie : un degré de latitude vaut 111 km, l'écart d'un point à un segment, la zone d'un degré", () => {
  assert.ok(Math.abs(longueurM([{ lat: 48, lon: 2 }, { lat: 49, lon: 2 }]) - 111195) < 100);
  assert.ok(Math.abs(ecartSegmentM({ lat: 48.001, lon: 5.0005 }, { lat: 48, lon: 5 }, { lat: 48, lon: 6 }) - 111.2) < 1);
  assert.ok(ecartSegmentM({ lat: 48, lon: 1.9 }, { lat: 48, lon: 2 }, { lat: 48, lon: 3 }) > 7000, "au-delà du segment : l'écart au bout");
  assert.equal(zoneDe(48.9, 5.6537), "48_5");
  assert.equal(zoneDe(-0.5, -0.5), "-1_-1");
  const d = densifier([{ lat: 48, lon: 5 }, { lat: 48.01, lon: 5 }], 25);
  assert.ok(d.length > 40 && d.length < 50, `${d.length}`);
});

test("identifiant : 15 caractères [a-z0-9], jamais deux fois le même", () => {
  const vus = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const id = idCircuit();
    assert.match(id, ID_CIRCUIT);
    vus.add(id);
  }
  assert.equal(vus.size, 200);
  assert.match(idCircuit(() => 0.999999), ID_CIRCUIT);
});

// ------------------------------------------------------------------ Lecteur de GPX

test("GPX : le tracé, ses altitudes et son nom ; ni horodatages ni fréquence cardiaque ne sont gardés", () => {
  const texte = gpx(
    `<metadata><name>Nom du fichier</name><time>2026-11-01T08:00:00Z</time></metadata>
     <wpt lat="48.9" lon="5.9537"><name>Point d'intérêt</name></wpt>
     <trk><name>Tour de l'étang &amp; des bois</name><trkseg>
       ${trkpt(48.8, 5.6537, 100.4, "<time>2026-11-01T08:00:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>141</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>")}
       ${trkpt(48.8005, 5.6542, 103.9)}
       <trkpt lat='48.801' lon='5.6547'><ele>105</ele></trkpt>
     </trkseg></trk>`,
  );
  const r = lireGpx(texte);
  assert.ok(r.ok);
  assert.equal(r.gpx.nom, "Tour de l'étang & des bois");
  assert.equal(r.gpx.nPoints, 3);
  assert.deepEqual(r.gpx.points, [{ lat: 48.8, lon: 5.6537, alt: 100.4 }, { lat: 48.8005, lon: 5.6542, alt: 103.9 }, { lat: 48.801, lon: 5.6547, alt: 105 }]);
  assert.ok(r.gpx.avecAltitudes);
  const garde = JSON.stringify(circuitDepuisGpx(r.gpx, { id: "gpx000000000001", maintenant: 1_700_000_000_000 }));
  for (const trace of ["2026-11-01", "141", "hr", "Point d'intérêt"]) assert.ok(!garde.includes(trace), `« ${trace} » gardé`);
});

test("GPX : le nom vient de la trace, sinon de metadata, sinon de la route ; CDATA et entités décodées", () => {
  const deux = `${trkpt(48.8, 5.6537, 1)}${trkpt(48.801, 5.6547, 2)}`;
  const nom = (corps: string) => {
    const r = lireGpx(gpx(corps));
    assert.ok(r.ok);
    return r.gpx.nom;
  };
  assert.equal(nom(`<trk><name><![CDATA[Crêtes <nord> & sud]]></name><trkseg>${deux}</trkseg></trk>`), "Crêtes <nord> & sud");
  assert.equal(nom(`<metadata><name>Du fichier</name></metadata><trk><trkseg>${deux}</trkseg></trk>`), "Du fichier");
  assert.equal(nom(`<trk><trkseg>${deux}</trkseg></trk>`), null);
  assert.equal(nom(`<trk><name>Caf&#233; &#x2615; &inconnue;</name><trkseg>${deux}</trkseg></trk>`), "Café ☕ &inconnue;");
  assert.equal(nom(`<rte><name>Route de test</name><rtept lat="48.8" lon="5.6537"/><rtept lat="48.801" lon="5.6547"/></rte>`), "Route de test");
  assert.equal(nomDuFichier("/sdcard/Download/Boucle%20du%20lac.gpx"), "Boucle du lac");
  assert.equal(nomDuFichier(".gpx"), null);
});

test("GPX : plusieurs segments mis bout à bout, la route en repli, jamais les points d'intérêt", () => {
  const seg = (a: number) => `<trkseg>${trkpt(48.8 + a, 5.6537, 1)}${trkpt(48.801 + a, 5.6537, 2)}</trkseg>`;
  const deux = lireGpx(gpx(`<trk>${seg(0)}${seg(0.01)}</trk>`));
  assert.ok(deux.ok);
  assert.equal(deux.gpx.nPoints, 4);
  const route = lireGpx(gpx(`<wpt lat="1" lon="1"/><wpt lat="2" lon="2"/><rte><rtept lat="48.8" lon="5.6537"/><rtept lat="48.9" lon="5.7537"></rtept></rte>`));
  assert.ok(route.ok);
  assert.equal(route.gpx.nPoints, 2);
  const seulsLesPoints = lireGpx(gpx(`<wpt lat="48.8" lon="5.6537"><name>A</name></wpt><wpt lat="48.9" lon="5.7537"><name>B</name></wpt>`));
  assert.deepEqual(seulsLesPoints, { ok: false, erreur: "sans_trace" });
});

test("GPX : trois refus, illisible, trop lourd et sans trace", () => {
  assert.deepEqual(lireGpx("Bonjour, ceci n'est pas un GPX"), { ok: false, erreur: "illisible" });
  assert.deepEqual(lireGpx(""), { ok: false, erreur: "illisible" });
  assert.deepEqual(lireGpx(`<gpx><trk><trkseg>${trkpt(48.8, 5.6537)}${trkpt(48.9, 5.7537)}`), { ok: false, erreur: "illisible" }, "coupé : pas de </gpx>");
  assert.deepEqual(lireGpx(`<gpx><trk><trkseg><trkpt lat="48.8" lon="5.6537"><ele>1</ele></trkseg></trk></gpx>`), { ok: false, erreur: "illisible" }, "coupé au milieu d'un point");
  assert.deepEqual(lireGpx(gpx(`<trk><trkseg>${trkpt(48.8, 5.6537)}</trkseg></trk>`)), { ok: false, erreur: "sans_trace" }, "un seul point");
  assert.deepEqual(lireGpx(gpx(`<trk><trkseg></trkseg></trk>`)), { ok: false, erreur: "sans_trace" });
  assert.deepEqual(lireGpx(gpx(`<trk><trkseg>${trkpt(91, 5.6537)}${trkpt(48.9, 181)}${trkpt(48.9, 5.7537)}</trkseg></trk>`)), { ok: false, erreur: "sans_trace" }, "points hors du globe écartés");
  const bon = gpx(`<trk><trkseg>${trkpt(48.8, 5.6537)}${trkpt(48.9, 5.7537)}</trkseg></trk>`);
  assert.deepEqual(lireGpx(bon, GPX_OCTETS_MAX + 1), { ok: false, erreur: "trop_lourd" }, "refusé avant de lire, d'après le poids du fichier");
  assert.ok(lireGpx(bon, GPX_OCTETS_MAX).ok, "20 Mo pile : lu");
  assert.deepEqual(lireGpx("x".repeat(GPX_OCTETS_MAX + 1)), { ok: false, erreur: "trop_lourd" });
});

test("GPX : sans altitude, il est lu quand même (pas de dénivelé) ; une altitude absurde est ignorée", () => {
  const r = lireGpx(gpx(`<trk><trkseg>${Array.from({ length: 20 }, (_, i) => trkpt(48.8 + i * 0.0005, 5.6537)).join("")}</trkseg></trk>`));
  assert.ok(r.ok);
  assert.equal(r.gpx.avecAltitudes, false);
  const c = circuitDepuisGpx(r.gpx)!;
  assert.equal(c.profil, null);
  assert.equal(c.denivelePlusM, null);
  assert.ok(c.distanceM > 900);
  const folle = lireGpx(gpx(`<trk><trkseg>${trkpt(48.8, 5.6537, -99999)}${trkpt(48.9, 5.7537, 99999)}${trkpt(48.95, 5.8037, "abc" as unknown as number)}</trkseg></trk>`));
  assert.ok(folle.ok);
  assert.deepEqual(folle.gpx.points.map((p) => p.alt), [null, null, null]);
});

test("GPX : un fichier de 5 000 points donne un circuit de 400 points au plus, privé, source « gpx »", () => {
  const zigzag = Array.from({ length: 5000 }, (_, i) => trkpt(48.8 + i * 0.00002, 5.6537 + (i % 2 ? 0.0005 : 0) + Math.sin(i / 40) * 0.01, 100 + Math.round(30 * Math.sin(i / 200)))).join("");
  const r = lireGpx(gpx(`<trk><name>Long</name><trkseg>${zigzag}</trkseg></trk>`));
  assert.ok(r.ok);
  assert.equal(r.gpx.nPoints, 5000);
  const c = circuitDepuisGpx(r.gpx)!;
  assert.ok(decoderTrace(c.trace)!.length <= POINTS_MAX, `${decoderTrace(c.trace)!.length}`);
  assert.equal(c.source, "gpx");
  assert.equal(c.visibilite, "prive");
  assert.equal(c.departLieu, null);
  assert.equal(c.commune, null);
  assert.equal(c.nom, "Long");
});

test("GPX : un gros fichier de 200 000 points se lit d'une traite", () => {
  const corps = Array.from({ length: 200000 }, (_, i) => `<trkpt lat="${(48 + i * 0.000001).toFixed(6)}" lon="5.6537"><ele>${100 + (i % 50)}</ele><time>2026-11-01T08:00:00Z</time></trkpt>`).join("\n");
  const texte = gpx(`<trk><trkseg>${corps}</trkseg></trk>`);
  assert.ok(texte.length > 15_000_000 && texte.length < GPX_OCTETS_MAX, `${texte.length} octets`);
  const t0 = Date.now();
  const r = lireGpx(texte);
  assert.ok(r.ok);
  assert.equal(r.gpx.nPoints, 200000);
  assert.ok(Date.now() - t0 < 5000, `${Date.now() - t0} ms`);
});

// ------------------------------------------------------------------ Domicile (D5)

test("domicile : un circuit qui passe à 150 m ou moins d'un lieu personnel n'est pas publiable", () => {
  const trace = droite(100, 48.8, 5.6537); // de 5,6537 à 5,66855 (1,1 km)
  const surLeTrace = { lat: 48.8, lon: 5.6607 };
  const a100m = { lat: 48.8 + 100 / 111195, lon: 5.6607 };
  const a149m = { lat: 48.8 + 149 / 111195, lon: 5.6607 };
  const a151m = { lat: 48.8 + 151 / 111195, lon: 5.6607 };
  const loin = { lat: 48.81, lon: 5.6607 };
  assert.ok(procheDuDomicile(trace, [surLeTrace]));
  assert.ok(procheDuDomicile(trace, [a100m]));
  assert.ok(procheDuDomicile(trace, [a149m]));
  assert.equal(procheDuDomicile(trace, [a151m]), null);
  assert.equal(procheDuDomicile(trace, [loin]), null);
  assert.equal(procheDuDomicile(trace, []), null);
  assert.equal(publiableSansDomicile(trace, [loin, a151m]), true);
  assert.equal(publiableSansDomicile(trace, [loin, a100m]), false);
  // le plus proche est rendu, avec sa distance
  const p = procheDuDomicile(trace, [{ ...a149m, id: "loin" }, { ...a100m, id: "près" }])!;
  assert.equal(p.lieu.id, "près");
  assert.ok(Math.abs(p.distanceM - 100) < 2, `${p.distanceM}`);
  // le domicile croisé au MILIEU du parcours, pas seulement au départ ou à l'arrivée
  assert.ok(procheDuDomicile([...droite(30, 48.8, 5.6537), ...droite(30, 48.8, 5.7537)], [{ lat: 48.8, lon: 5.6537 + 0.0015 * 15 }]) !== null);
  assert.equal(procheDuDomicile(trace, [{ lat: Number.NaN, lon: 5.6537 }]), null);
});

test("lieux personnels : le domicile et les salles perso comptent, pas une salle de l'annuaire ni un lieu sans position", async () => {
  const { raw, db } = await baseDeTest();
  raw.exec(`INSERT INTO salle (id, nom, defaut, ordre, source_id, type, lat, lon, cree_le, maj_le) VALUES
    ('dom', 'Chez moi', 0, 0, NULL, 'domicile', 48.80, 5.6537, 1, 1),
    ('perso', 'Salle du bureau', 0, 1, '', 'salle', 48.81, 5.6637, 1, 1),
    ('osm', 'Salle publique', 0, 2, 'node/42', 'salle', 48.82, 5.6737, 1, 1),
    ('dom_osm', 'Domicile avec fiche', 0, 3, 'node/43', 'domicile', 48.83, 5.6837, 1, 1),
    ('sans', 'Sans position', 0, 4, NULL, 'salle', NULL, NULL, 1, 1),
    ('zero', 'Zéro zéro', 0, 5, NULL, 'salle', 0, 0, 1, 1)`);
  const l = await lieuxPersonnels(db);
  assert.deepEqual(l.map((x) => x.id).sort(), ["dom", "dom_osm", "perso"]);
});

// ------------------------------------------------------------------ Table `circuit`

const exemple = (id = "exemple00000001"): Circuit => {
  const cas = CAS.lac!;
  return construireCircuit({ nom: cas.nom, points: pts(cas), activites: ["randonnee", "course"], source: "gpx", id, maintenant: 1_000 })!;
};

test("table circuit : écrire, lire, lister, renommer, publier, retirer, supprimer, annuler", async () => {
  const { db } = await baseDeTest();
  const a = exemple("aaaaaaaaaaaaaaa");
  const b = { ...exemple("bbbbbbbbbbbbbbb"), creeLe: 2_000, majLe: 2_000, nom: "Plus récent" };
  await ecrireCircuit(db, a);
  await ecrireCircuit(db, b);
  assert.deepEqual(await lireCircuit(db, a.id), a, "relu à l'identique, activités et boîte comprises");
  assert.equal(await lireCircuit(db, "zzzzzzzzzzzzzzz"), null);
  assert.deepEqual((await listerCircuits(db)).map((c) => c.id), [b.id, a.id], "le plus récent d'abord");
  assert.equal(await nombreDeCircuits(db), 2);

  await modifierCircuit(db, a.id, { nom: "Étang", activites: ["bicycling"] }, 5_000);
  const m = (await lireCircuit(db, a.id))!;
  assert.deepEqual([m.nom, m.activites, m.majLe, m.trace], ["Étang", ["bicycling"], 5_000, a.trace]);

  await noterVisibilite(db, a.id, "public", 6_000);
  assert.deepEqual([(await lireCircuit(db, a.id))!.visibilite, (await lireCircuit(db, a.id))!.publieLe], ["public", 6_000]);
  await noterVisibilite(db, a.id, "prive", 7_000);
  assert.deepEqual([(await lireCircuit(db, a.id))!.visibilite, (await lireCircuit(db, a.id))!.publieLe], ["prive", null]);

  await supprimerCircuit(db, a.id);
  assert.equal(await lireCircuit(db, a.id), null);
  await restaurerCircuit(db, a);
  assert.deepEqual(await lireCircuit(db, a.id), a, "« Annuler » remet le circuit tel qu'il était");
  assert.equal(pointsDuCircuit(a)!.length, decoderTrace(a.trace)!.length);
});

test("table circuit : les valeurs hors des listes sont refusées, une ligne reçue abîmée se lit quand même", async () => {
  const { raw, db } = await baseDeTest();
  await assert.rejects(ecrireCircuit(db, { ...exemple(), type: "spirale" as Circuit["type"] }));
  await assert.rejects(ecrireCircuit(db, { ...exemple(), source: "strava" as Circuit["source"] }));
  await assert.rejects(ecrireCircuit(db, { ...exemple(), visibilite: "amis" as Circuit["visibilite"] }));
  await assert.rejects(ecrireCircuit(db, { ...exemple(), distanceM: -1 }));
  await ecrireCircuit(db, exemple("abimee000000001"));
  raw.exec("UPDATE circuit SET activites = 'pas du json', bbox = '[1,2]', type = 'boucle' WHERE id = 'abimee000000001'");
  const c = (await lireCircuit(db, "abimee000000001"))!;
  assert.deepEqual(c.activites, []);
  assert.deepEqual(c.bbox, [0, 0, 0, 0]);
});

test("table circuit : chaque écriture, modification et suppression part au journal de synchro", async () => {
  const { raw, db } = await baseDeTest();
  raw.exec("DELETE FROM sync_journal");
  const c = exemple("journal00000001");
  await ecrireCircuit(db, c);
  const lignes = () => raw.prepare("SELECT tab, cle, supprime FROM sync_journal WHERE tab = 'circuit'").all().map((x) => `${x.cle}:${x.supprime}`);
  assert.deepEqual(lignes(), ["journal00000001:0"]);
  await modifierCircuit(db, c.id, { nom: "Autre", activites: ["vtt"] });
  assert.deepEqual(lignes(), ["journal00000001:0"]);
  await supprimerCircuit(db, c.id);
  assert.deepEqual(lignes(), ["journal00000001:1"]);
});
