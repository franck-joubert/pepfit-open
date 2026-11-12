// Suivi GPS, lot 2 (planches/suivi-gps) : ce que montrent départ et direct, migration 32 et enregistrement de la fin.
import assert from "node:assert/strict";
import { test } from "node:test";
import { enregistrerSuivi, lireEcranAllume, ecrireEcranAllume, ecrireFcDirecte, lireFcDirecte, lireFcMax, lireSuiviLance, ecrireSuiviLance } from "../src/db/depots/suivi-gps.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { MIGRATIONS, migrer, temoinPresent } from "../src/db/migrations.ts";
import { genreSport } from "../src/ecrans/lanceur-sports.ts";
import {
  alerteGps, allureDuMoment, ligneFc, allureTexte, bornesZones, chronoTexte, distanceTexte, garder, GPS_RETROUVE_MS, indicesTours, mesureDe,
  morceauxParZone, positionRepere, precisionTexte, projeter, tourEnCours, dernierTourFini, vitesseDuMoment, zoneDe, zonesDesPoints,
} from "../src/ecrans/suivi-direct-vue.ts";
import { adapter, baseDeTest } from "./aide.ts";
import { ecrireModeFcMax } from "../src/db/depots/zones-fc.ts";
import { DatabaseSync } from "node:sqlite";

test("zones : bornes de la planche pour une FC max de 181, zone et repère", () => {
  assert.deepEqual(bornesZones(181), [91, 109, 127, 145, 163]);
  assert.equal(zoneDe(158, 181), 4);
  assert.equal(zoneDe(163, 181), 5);
  assert.equal(zoneDe(162, 181), 4);
  assert.equal(zoneDe(90, 181), 0);
  assert.equal(zoneDe(91, 181), 1);
  assert.ok(Math.abs(positionRepere(158, 181) - (158 - 91) / (181 - 91)) < 1e-9);
  assert.equal(positionRepere(60, 181), 0);
  assert.equal(positionRepere(200, 181), 1);
});

test("textes : chrono, distance tronquée, allure, précision", () => {
  assert.equal(chronoTexte(1961_000), "32:41");
  assert.equal(chronoTexte(3723_400), "1:02:03");
  assert.equal(chronoTexte(-5), "0:00");
  assert.equal(distanceTexte(6268), "6,26");
  assert.equal(distanceTexte(6200), "6,20");
  assert.equal(distanceTexte(0), "0,00");
  assert.equal(allureTexte(308), "5'08\"");
  assert.equal(allureTexte(null), "—");
  assert.equal(allureTexte(7200), "—");
  assert.equal(precisionTexte(3.6), "±4 m");
  assert.equal(precisionTexte(null), null);
});

test("vélo en vitesse, le reste en allure ; Dehors des sports GPS", () => {
  assert.equal(mesureDe("cat:bicycling"), "vitesse");
  assert.equal(mesureDe("cat:course"), "allure");
  assert.equal(mesureDe("cat:randonnee"), "allure");
  for (const s of ["cat:course", "cat:bicycling", "cat:randonnee", "cat:padel"]) assert.equal(genreSport(s), "suivi");
});

test("allure du moment : fenêtre de 30 s, rien sans distance ni durée", () => {
  let h: { s: number; d: number }[] = [];
  for (let i = 0; i <= 60; i++) h = garder(h, { s: i * 1000, d: i * 3.2 });
  assert.ok(h[0]!.s <= 30_000 && h.length <= 32, `fenêtre ${h[0]!.s}`);
  assert.equal(Math.round(allureDuMoment(h)!), Math.round(1000 / 3.2));
  assert.ok(Math.abs(vitesseDuMoment(h)! - 3.2 * 3.6) < 1e-6);
  // même temps de séance (pause) : l'échantillon remplace le précédent
  const p = garder(h, { s: 60_000, d: 192 });
  assert.equal(p.length, h.length);
  assert.equal(allureDuMoment([{ s: 0, d: 0 }, { s: 3000, d: 10 }]), null);
  assert.equal(allureDuMoment([{ s: 0, d: 0 }, { s: 30_000, d: 5 }]), null);
});

test("tours : tour en cours, tour qui vient de finir", () => {
  const e = { tours: [{ n: 1, s: 400_000, d: 1600 }, { n: 2, s: 900_000, d: 3400 }], tempsMs: 1_000_000, distanceM: 3700 };
  const c = tourEnCours(e);
  assert.equal(c.n, 3);
  assert.equal(c.dureeS, 100);
  assert.equal(c.distanceM, 300);
  assert.equal(dernierTourFini(e)!.n, 2);
  assert.equal(tourEnCours({ tours: [], tempsMs: 5000, distanceM: 12 }).n, 1);
  assert.equal(dernierTourFini({ tours: [], tempsMs: 5000, distanceM: 12 }), null);
});

test("GPS perdu, puis retrouvé quelques secondes, puis rien", () => {
  assert.equal(alerteGps("perdu", null, 0), "perdu");
  assert.equal(alerteGps("ok", 1000, 1000 + GPS_RETROUVE_MS - 1), "retrouve");
  assert.equal(alerteGps("ok", 1000, 1000 + GPS_RETROUVE_MS), null);
  assert.equal(alerteGps("ok", null, 5), null);
});

test("mini-tracé : nord en haut, échelle égale, marges ; zones par point ; repères des tours", () => {
  const pts = [
    { lat: 48.85, lon: 5.8037 },
    { lat: 48.851, lon: 5.8037 },
    { lat: 48.851, lon: 5.8057 },
  ];
  const xy = projeter(pts, 380, 368);
  assert.ok(xy[1]!.y < xy[0]!.y, "le nord est en haut");
  assert.ok(xy[2]!.x > xy[1]!.x);
  for (const q of xy) assert.ok(q.x >= 28 - 1e-6 && q.x <= 352 + 1e-6 && q.y >= 64 - 1e-6 && q.y <= 340 + 1e-6, JSON.stringify(q));
  assert.deepEqual(projeter([], 100, 100), []);
  // un seul point : au centre, sans division par zéro
  const un = projeter([pts[0]!], 380, 368)[0]!;
  assert.ok(Number.isFinite(un.x) && Number.isFinite(un.y));

  const zones = zonesDesPoints([{ s: 0 }, { s: 1000 }, { s: 2000 }, { s: 30_000 }], [{ s: 0, bpm: 100 }, { s: 1500, bpm: 150 }], 181);
  assert.deepEqual(zones, [1, 1, 4, 0]);
  assert.deepEqual(morceauxParZone([1, 1, 4, 4, 4, 2]), [
    { debut: 0, fin: 2, zone: 1 },
    { debut: 2, fin: 5, zone: 4 },
  ]);
  assert.deepEqual(indicesTours([{ s: 0 }, { s: 1000 }, { s: 2000 }], [{ s: 1100 }, { s: 5000 }]), [1, 2]);
});

test("migration 32 : tables du suivi, témoin, additive", async () => {
  const m = MIGRATIONS.find((x) => x.version === 32)!;
  assert.equal(m.temoin, "suivi_point");
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 31);
  assert.equal(await temoinPresent(db, "suivi_point"), false);
  await migrer(db);
  for (const t of ["suivi_point", "seance_fc", "suivi_tour", "suivi_seance"]) assert.ok(await temoinPresent(db, t), t);
});

test("fin : la séance porte durée et distance, le tracé, la FC, les tours et le dénivelé ; tout part avec elle", async () => {
  const { raw, db } = await baseDeTest(true);
  const points = Array.from({ length: 5 }, (_, i) => ({
    t: 1_000_000 + i * 1000, s: i * 1000, lat: 48.85 + i * 0.00003, lon: 5.8037, altBaro: 30 + i, altGps: null, precision: 5, vitesse: 3.3,
  }));
  const id = await enregistrerSuivi(db, {
    exerciceId: "cat:course", titre: "Course à pied", salleId: null, mode: "course", debut: 1_000_000, fin: 1_010_000, dureeS: 4.4,
    distanceM: 13.3, denivelePlusM: 4, deniveleMoinsM: 0, barometre: true, points,
    fc: [{ t: 1_000_000, s: 0, bpm: 120 }, { t: 1_001_000, s: 1000, bpm: 122 }],
    tours: [{ s: 3000, d: 10 }, { s: 1000, d: 3 }],
  });
  const s = raw.prepare("SELECT debut, fin, titre FROM seances WHERE id = ?").get(id) as { debut: number; fin: number; titre: string };
  assert.deepEqual({ ...s }, { debut: 1_000_000, fin: 1_010_000, titre: "Course à pied" });
  const serie = raw.prepare("SELECT duree_s, distance_m, faite FROM series WHERE seance_id = ?").get(id) as Record<string, number>;
  assert.deepEqual({ ...serie }, { duree_s: 4, distance_m: 13, faite: 1 });
  const n = (t: string) => (raw.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE seance_id = ?`).get(id) as { n: number }).n;
  assert.equal(n("suivi_point"), 5);
  assert.equal(n("seance_fc"), 2);
  assert.deepEqual(raw.prepare("SELECT n, t, d FROM suivi_tour WHERE seance_id = ? ORDER BY n").all(id).map((r) => ({ ...r })), [
    { n: 1, t: 1000, d: 3 },
    { n: 2, t: 3000, d: 10 },
  ]);
  const sv = raw.prepare("SELECT mode, denivele_plus_m, barometre FROM suivi_seance WHERE seance_id = ?").get(id) as Record<string, unknown>;
  assert.deepEqual({ ...sv }, { mode: "course", denivele_plus_m: 4, barometre: 1 });
  raw.prepare("DELETE FROM seances WHERE id = ?").run(id);
  for (const t of ["suivi_point", "seance_fc", "suivi_tour", "suivi_seance"]) assert.equal(n(t), 0, t);
});

test("réglages du suivi : lancé, écran allumé, FC max", async () => {
  const { db } = await baseDeTest();
  assert.equal(await lireSuiviLance(db), null);
  await ecrireSuiviLance(db, { suiviId: "x1", exerciceId: "cat:course", titre: "Course à pied", salleId: null });
  assert.equal((await lireSuiviLance(db))!.suiviId, "x1");
  await ecrireSuiviLance(db, null);
  assert.equal(await lireSuiviLance(db), null);
  assert.equal(await lireEcranAllume(db), false, "éteint par défaut (retours du 28/10, b)");
  await ecrireEcranAllume(db, true);
  assert.equal(await lireEcranAllume(db), true);
  await ecrireEcranAllume(db, false);
  assert.equal(await lireEcranAllume(db), false);
  assert.equal(await lireFcMax(db), 190);
  await ecrireReglage(db, "annee_naissance", "1980");
  assert.equal(await lireFcMax(db, new Date(2026, 9, 28).getTime()), Math.round(208 - 0.7 * 46));
  await ecrireReglage(db, "fc_max", "181");
  // une seule résolution de la FC max (lot 6 de la précision) : la saisie compte quand on l'a choisie
  assert.equal(await lireFcMax(db), Math.round(208 - 0.7 * 46));
  await ecrireModeFcMax(db, "saisie");
  assert.equal(await lireFcMax(db), 181);
});

test("FC Whoop du départ : éteinte, ni recherche ni « diffusion coupée » ; messages seulement si allumée (retours du 28/10, b)", async () => {
  for (const fc of [{ etat: "recherche" }, { etat: "refus" }, { etat: "absente" }] as const) {
    assert.deepEqual(ligneFc(false, fc), { etat: "off", cle: "gps.fcEteinte", action: null });
  }
  assert.deepEqual(ligneFc(true, { etat: "recherche" }), { etat: "att", cle: "gps.recherche", action: null });
  // Lot 6 : sans diffusion, « Activer » ouvre le tuto ; « Appareils à proximité » refusés, « Autoriser ».
  assert.deepEqual(ligneFc(true, { etat: "absente" }), { etat: "info", cle: "gps.fcCoupee", action: "activer" });
  assert.deepEqual(ligneFc(true, { etat: "refus" }), { etat: "info", cle: "gps.appareilsRefuses", action: "autoriser" });
  assert.deepEqual(ligneFc(true, { etat: "trouvee", appareil: { adresse: "AA" } }), { etat: "ok", cle: "gps.fcDiffusee", action: null });

  const raw = new DatabaseSync(":memory:");
  const db = adapter(raw);
  await migrer(db);
  assert.equal(await lireFcDirecte(db), false, "Whoop pas connecté : éteinte");
  await ecrireReglage(db, "whoop_connecte", "1");
  assert.equal(await lireFcDirecte(db), true, "Whoop connecté : allumée d'office");
  await ecrireFcDirecte(db, false);
  assert.equal(await lireFcDirecte(db), false, "le choix fait l'emporte");
  await ecrireReglage(db, "whoop_connecte", "0");
  await ecrireFcDirecte(db, true);
  assert.equal(await lireFcDirecte(db), true);
});
