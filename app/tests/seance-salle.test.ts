// Phase 2, lot 1 : migration 11 (salles OSM, photo de séance), salles OpenStreetMap, photo unique, « Enregistrer comme routine ».
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { creerExercice } from "../src/db/depots/exercices.ts";
import { lirePhotoSeance, poserPhotoSeance, retirerPhotoSeance, cheminsPhotosConnus } from "../src/db/depots/photos.ts";
import { creerRoutineDepuisSeance, lireRoutine } from "../src/db/depots/routines.ts";
import { adopterSalleOSM, creerSalle, ecrireCacheAutour, lireCacheAutour, listerSalles } from "../src/db/depots/salles.ts";
import { ajouterSerie, cocherSerie, demarrerSeance, supprimerSeance, terminerSeance } from "../src/db/depots/seances.ts";
import { migrer } from "../src/db/migrations.ts";
import { cheminsPhoto, dimensionsCible, PHOTO, VIGNETTE } from "../src/photos/reglage.ts";
import {
  depuisCache, distanceKm, distanceM, lireOverpass, lirePhoton, rechercheValide, requeteOverpass, rueCourte, sansMesSalles, urlPhoton, variantesRecherche,
  type SalleOSM,
} from "../src/salles/osm.ts";
import { adapter, baseDeTest } from "./aide.ts";

const CENTRE = { lat: 48.8353, lon: 5.6947 };

const salleOSM = (sourceId: string, nom = "Basic-Fit Valmont"): SalleOSM => ({
  sourceId, nom, adresse: "251 bd Jean Jaurès", adresseComplete: "251 bd Jean Jaurès, 55300 Valmont-sur-Meuse", lat: 48.836, lon: 5.6927, distanceM: 400,
});

test("migration 11 : base v10 avec une salle et une séance ; colonnes OSM vides, table seance_photo", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 10);
  raw.exec(`INSERT INTO salle (id,nom,defaut,equipements,cree_le,maj_le) VALUES ('s','Maison',1,'halteres',1,1);
    INSERT INTO seances (id,debut,fin,maj_le,volume_kg,nb_series) VALUES ('a',1,2,1,0,0);`);
  assert.equal(await migrer(db, 11), 11);
  const s = raw.prepare("SELECT nom, adresse, lat, lon, source_id FROM salle").get();
  assert.deepEqual({ ...s }, { nom: "Maison", adresse: null, lat: null, lon: null, source_id: null });
  const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((x) => x.name);
  assert.ok(tables.includes("seance_photo"));
});

test("salle OSM : adoptée une seule fois, ni perso ni défaut si une autre existe ; « Perso » pour une salle créée à la main", async () => {
  const { db } = await baseDeTest();
  const maison = await creerSalle(db, "Maison");
  const a = await adopterSalleOSM(db, salleOSM("node/42"));
  const b = await adopterSalleOSM(db, salleOSM("node/42", "Autre nom"));
  assert.equal(a, b);
  const l = await listerSalles(db);
  assert.equal(l.length, 2);
  const osm = l.find((x) => x.id === a)!;
  assert.equal(osm.perso, false);
  assert.equal(osm.defaut, false);
  assert.equal(osm.sourceId, "node/42");
  assert.equal(osm.adresse, "251 bd Jean Jaurès, 55300 Valmont-sur-Meuse");
  assert.ok(osm.equipements.length > 5, "une salle publique a tout l'équipement");
  assert.equal(l.find((x) => x.id === maison)!.perso, true);
});

test("club de padel adopté (30/10) : un terrain, sans équipements de salle, le padel en activité habituelle", async () => {
  const { db } = await baseDeTest();
  await db.runAsync("INSERT OR IGNORE INTO exercices (id, nom, nom_norm, slug, perso, cree_le, maj_le) VALUES ('cat:padel', 'Padel', 'padel', 'padel', 0, 1, 1)", []);
  const id = await adopterSalleOSM(db, { ...salleOSM("way/1388796285", "Lac Padel"), type: "terrain", duSport: true }, "cat:padel");
  const l = await listerSalles(db);
  const club = l.find((x) => x.id === id)!;
  assert.equal(club.type, "terrain");
  assert.deepEqual(club.equipements, []);
  assert.deepEqual(club.activites.map((a) => a.id), ["cat:padel"]);
  // sport inconnu de la base : pas d'activité, pas d'erreur
  const autre = await adopterSalleOSM(db, { ...salleOSM("way/2", "Club X"), type: "terrain" }, "cat:inconnu");
  assert.deepEqual(l.find((x) => x.id === autre)?.activites ?? [], []);
});

test("cache d'Overpass dans les réglages : relu tel quel", async () => {
  const { db } = await baseDeTest();
  assert.equal(await lireCacheAutour(db), null);
  const c = { le: 1000, position: CENTRE, salles: [salleOSM("way/7")] };
  await ecrireCacheAutour(db, c);
  assert.deepEqual(await lireCacheAutour(db), c);
});

test("photo de séance : une seule, la nouvelle remplace l'ancienne (rendue pour effacer ses fichiers), retrait, cascade", async () => {
  const { db } = await baseDeTest();
  const id = await demarrerSeance(db, null, "Pull");
  const p1 = { cheminLocal: "photos/a.webp", cheminVignette: "photos/a-v.webp", largeur: 1600, hauteur: 1200, octets: 250000 };
  assert.equal(await poserPhotoSeance(db, id, p1), null);
  const p2 = { cheminLocal: "photos/b.webp", cheminVignette: "photos/b-v.webp", largeur: 1200, hauteur: 1600, octets: 240000 };
  const ancienne = await poserPhotoSeance(db, id, p2);
  assert.equal(ancienne?.chemin_local, "photos/a.webp");
  assert.equal((await lirePhotoSeance(db, id))?.chemin_local, "photos/b.webp");
  assert.deepEqual([...(await cheminsPhotosConnus(db))].sort(), ["photos/b-v.webp", "photos/b.webp"]);
  assert.equal((await retirerPhotoSeance(db, id))?.chemin_vignette, "photos/b-v.webp");
  assert.equal(await lirePhotoSeance(db, id), null);
  assert.equal(await retirerPhotoSeance(db, id), null);
  await poserPhotoSeance(db, id, p1);
  await supprimerSeance(db, id);
  assert.equal(await lirePhotoSeance(db, id), null, "la photo part avec la séance");
});

test("Enregistrer comme routine : séries validées comme cibles, ordre, repos ; exercice sans série validée laissé de côté", async () => {
  const { db } = await baseDeTest();
  const tirage = await creerExercice(db, { nom: "Tirage vertical" });
  const rowing = await creerExercice(db, { nom: "Rowing" });
  const curl = await creerExercice(db, { nom: "Curl" });
  const id = await demarrerSeance(db, null, "Pull A");
  const series: [string, number, number, "normale" | "echauffement", boolean][] = [
    [tirage, 40, 12, "echauffement", true],
    [tirage, 60, 10, "normale", true],
    [tirage, 65, 8, "normale", false],
    [rowing, 70, 10, "normale", true],
    [curl, 20, 12, "normale", false],
  ];
  for (const [e, kg, reps, type, faite] of series) {
    const s = await ajouterSerie(db, { seanceId: id, exerciceId: e, kg, reps, type });
    if (faite) await cocherSerie(db, s, true);
  }
  await terminerSeance(db, id);
  const r = await creerRoutineDepuisSeance(db, id);
  assert.ok(r);
  const d = (await lireRoutine(db, r!))!;
  assert.equal(d.nom, "Pull A");
  const lignes = d.blocs.flatMap((b) => b.lignes);
  assert.deepEqual(lignes.map((l) => l.exercice.nom), ["Tirage vertical", "Rowing"]);
  assert.deepEqual(lignes[0]!.cibles.map((c) => [c.kg, c.reps, c.type]), [[40, 12, "echauffement"], [60, 10, "normale"]]);
  assert.equal(lignes[0]!.nb_series, 2);
  assert.deepEqual(lignes[1]!.cibles.map((c) => [c.kg, c.reps]), [[70, 10]]);
  assert.equal(await creerRoutineDepuisSeance(db, "inconnue"), null);
});

test("photo : grand côté ramené à 1 600 px (vignette 320), jamais agrandi, proportions gardées", () => {
  assert.deepEqual(dimensionsCible(4000, 3000, PHOTO.cote), { width: 1600, height: 1200 });
  assert.deepEqual(dimensionsCible(3024, 4032, PHOTO.cote), { width: 1200, height: 1600 });
  assert.deepEqual(dimensionsCible(4000, 3000, VIGNETTE.cote), { width: 320, height: 240 });
  assert.deepEqual(dimensionsCible(800, 600, PHOTO.cote), { width: 800, height: 600 });
  assert.deepEqual(cheminsPhoto("x"), { photo: "photos/x.webp", vignette: "photos/x-v.webp" });
  assert.equal(PHOTO.qualite, 0.72);
});

test("Overpass : requête autour d'un point, salles nommées triées par distance, centre des « way », sans doublon", () => {
  const q = requeteOverpass(CENTRE);
  // position arrondie à 0,01° et rayon élargi de la marge de l'arrondi (900 m) : la vraie position ne part pas chez Overpass
  assert.match(q, /"leisure"="fitness_centre"\]\(around:3900,48\.84,5\.69\)/);
  assert.ok(!q.includes("48.8353") && !q.includes("5.6947"));
  assert.match(q, /"sport"~"fitness"/);
  const json = {
    elements: [
      { type: "way", id: 2, center: { lat: 48.8400, lon: 5.6947 }, tags: { name: "Neoness Valmont", "addr:housenumber": "38", "addr:street": "Quai de la Meuse" } },
      { type: "node", id: 1, lat: 48.8360, lon: 5.6947, tags: { name: "Basic-Fit Valmont Jean Jaurès", "addr:housenumber": "251", "addr:street": "Boulevard Jean Jaurès", "addr:postcode": "55300", "addr:city": "Valmont-sur-Meuse" } },
      { type: "node", id: 3, lat: 48.83, lon: 5.6937, tags: { leisure: "fitness_centre" } },
      { type: "node", id: 1, lat: 48.8360, lon: 5.6947, tags: { name: "Basic-Fit Valmont Jean Jaurès" } },
    ],
  };
  const l = lireOverpass(json, CENTRE);
  assert.deepEqual(l.map((s) => s.sourceId), ["node/1", "way/2"]);
  assert.equal(l[0]!.adresse, "251 bd Jean Jaurès");
  assert.equal(l[0]!.adresseComplete, "251 bd Jean Jaurès, 55300 Valmont-sur-Meuse");
  assert.equal(l[1]!.adresse, "38 quai de la Meuse");
  assert.equal(distanceKm(l[0]!.distanceM!), "0,1 km");
  assert.deepEqual(lireOverpass(null, null), []);
});

test("Photon : URL filtrée sur les lieux de loisir, réponse lue, autres lieux écartés", () => {
  const u = urlPhoton(" basic fit ", CENTRE);
  assert.match(u, /^https:\/\/photon\.komoot\.io\/api\/\?q=basic%20fit&osm_tag=leisure&limit=20&lang=fr&lat=48\.84&lon=5\.69$/);
  assert.ok(!urlPhoton("x", null).includes("lat="));
  const json = {
    features: [
      { geometry: { coordinates: [5.7037, 48.84] }, properties: { osm_type: "N", osm_id: 9, name: "Basic-Fit Valmont Centre", osm_key: "leisure", osm_value: "fitness_centre", street: "Avenue de Verdun", housenumber: "10", postcode: "55300", city: "Valmont-sur-Meuse" } },
      { geometry: { coordinates: [5.6937, 48.835] }, properties: { osm_type: "W", osm_id: 8, name: "Hôtel Basic", osm_key: "tourism", osm_value: "hotel" } },
      { geometry: { coordinates: [5.6948, 48.8354] }, properties: { osm_type: "R", osm_id: 7, name: "Keep Cool", osm_key: "leisure", osm_value: "fitness_centre" } },
    ],
  };
  const l = lirePhoton(json, CENTRE);
  assert.deepEqual(l.map((s) => s.sourceId), ["relation/7", "node/9"]);
  assert.equal(l[1]!.adresse, "10 av. de Verdun");
  assert.equal(l[0]!.adresse, null);
});

test("distances, rues, cache de 7 jours à 500 m près, salles déjà adoptées retirées", () => {
  assert.ok(Math.abs(distanceM({ lat: 48.8566, lon: 5.8059 }, { lat: 48.8584, lon: 5.7482 }) - 4230) < 50);
  assert.equal(distanceKm(420), "0,4 km");
  assert.equal(distanceKm(12400), "12 km");
  assert.equal(rueCourte("Boulevard Jean Jaurès"), "bd Jean Jaurès");
  assert.equal(rueCourte("Rue Gallieni"), "rue Gallieni");
  const cache = { le: 0, position: CENTRE, salles: [salleOSM("node/1")] };
  const jour = 24 * 3600 * 1000;
  assert.equal(depuisCache(cache, CENTRE, 6 * jour)?.length, 1);
  assert.equal(depuisCache(cache, CENTRE, 8 * jour), null);
  assert.equal(depuisCache(cache, { lat: 48.85, lon: 5.6937 }, jour), null, "à 1,6 km : nouvelle requête");
  assert.equal(depuisCache(null, CENTRE, 0), null);
  assert.deepEqual(sansMesSalles([salleOSM("node/1"), salleOSM("way/2")], ["node/1", null]).map((s) => s.sourceId), ["way/2"]);
  assert.equal(rechercheValide(" b "), false);
  assert.equal(rechercheValide("ba"), true);
});

test("recherche par nom : la saisie entière, puis privée de ses derniers mots (« 4padel boulog » → « 4padel ») ; un club de sport compte", () => {
  assert.deepEqual(variantesRecherche("4padel boulog"), ["4padel boulog", "4padel"]);
  assert.deepEqual(variantesRecherche(" basic fit valmont centre "), ["basic fit valmont centre", "basic fit valmont", "basic fit"]);
  assert.deepEqual(variantesRecherche("padel"), ["padel"]);
  assert.ok(!urlPhoton("4padel", null, 20, false).includes("osm_tag"));
  assert.ok(urlPhoton("4padel", null).includes("osm_tag=leisure"));
  const club = { features: [{ properties: { osm_type: "N", osm_id: 1, name: "4padel Valmont", osm_key: "club", osm_value: "sport" }, geometry: { coordinates: [5.8537, 48.86] } }] };
  assert.equal(lirePhoton(club, null).length, 1);
  const resto = { features: [{ properties: { osm_type: "N", osm_id: 2, name: "La Padella", osm_key: "amenity", osm_value: "restaurant" }, geometry: { coordinates: [5.6537, 48.84] } }] };
  assert.equal(lirePhoton(resto, null).length, 0);
});
