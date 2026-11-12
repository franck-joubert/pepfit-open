// Tapis et intérieur (décisions D2 et D3 d'Alex du 29/10) : suivi en direct sans GPS avec ou sans FC (service « health »),
// étapes à la distance passées au temps à la vitesse visée, distance finale saisie sur le résumé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { demarrerPlan } from "../src/db/depots/plans.ts";
import { listerRoutines, lireRoutine } from "../src/db/depots/routines.ts";
import { lireSeance, modifierSerie } from "../src/db/depots/seances.ts";
import { enregistrerSuivi, lireSuivi, remplacerSuivi, type SuiviAEnregistrer } from "../src/db/depots/suivi-gps.ts";
import { chargerEffort } from "../src/ecrans/effort-donnees.ts";
import { avecDistanceSaisie } from "../src/ecrans/effort-vue.ts";
import {
  annonceEtape, avancer, cibleEtape, dureePrevueS, ETAT_INITIAL, etapesAuTemps, etapesDeRoutine, lignesCourse, passer, resteEtape, vitesseTapisKmH,
  type Etape,
} from "../src/ecrans/etapes-course.ts";
import { etapesDuSuivi } from "../src/ecrans/etapes-suivi.ts";
import { departSansGps } from "../src/ecrans/suivi-direct-vue.ts";
import { metresSaisis } from "../src/ecrans/unites.ts";
import { baseDeTest } from "./aide.ts";

const effort = (distanceM: number | null, dureeS: number | null, zone: number | null, rang: string | null = null): Etape => ({
  genre: "effort", rang, nom: "Course", distanceM, dureeS, zone, ligne: 1,
});
const recup: Etape = { genre: "recup", rang: null, nom: null, distanceM: null, dureeS: 120, zone: 1, ligne: 1 };

test("D2 : sans GPS, le suivi en direct part toujours (avec ou sans FC) ; la séance au chrono seulement sans module", () => {
  assert.equal(departSansGps(true), "fc");
  assert.equal(departSansGps(false), "chrono", "iOS, APK sans module de suivi");
});

test("D3 : vitesse visée par zone, part de la VMA, au dixième ; sans VMA, l'allure de référence (6'00\" = 10 km/h)", () => {
  assert.equal(vitesseTapisKmH(5, 12), 12, "Z5 : la VMA");
  assert.equal(vitesseTapisKmH(4, 16), 14, "Z4 : seuil, 87,5 %");
  assert.equal(vitesseTapisKmH(3, 15), 12, "Z3 : marathon, 80 %");
  assert.equal(vitesseTapisKmH(2, 15), 9.8, "Z2 : footing, 65 % (9,75 → 9,8)");
  assert.equal(vitesseTapisKmH(1, 15), 9);
  assert.equal(vitesseTapisKmH(null, 15), 9.8, "sans zone : comme un footing");
  assert.equal(vitesseTapisKmH(4, null), 10);
});

test("D3 : 1 km à 12 km/h (5'00\" au km) devient 5 min ; les étapes au temps ne changent pas", () => {
  const e = etapesAuTemps([effort(null, 900, 2), effort(1000, null, 5, "1/6"), recup, effort(400, null, 5, "2/6")], 12);
  assert.deepEqual(e[0], effort(null, 900, 2), "échauffement au temps : intact");
  assert.equal(e[2], recup);
  assert.deepEqual({ d: e[1]!.distanceM, s: e[1]!.dureeS, v: e[1]!.vitesseKmH }, { d: null, s: 300, v: 12 });
  assert.equal(e[3]!.dureeS, 120, "400 m à 12 km/h : 2 min");
  assert.equal(dureePrevueS(e[1]!), 300, "bande et fin prévue : la durée convertie");
  // sans VMA : 10 km/h, 1 km = 6 min
  assert.equal(etapesAuTemps([effort(1000, null, 4)], null)[0]!.dureeS, 360);
});

test("D3 : sur tapis, l'étape avance au temps, sans distance ; « Étape » passe toujours à la suivante", () => {
  const e = etapesAuTemps([effort(1000, null, 5, "1/2"), recup, effort(1000, null, 5, "2/2")], 12);
  // distance 0 (pas de GPS) : à 299 s, encore la 1re ; à 300 s, la récup
  assert.equal(avancer(e, ETAT_INITIAL, 0, 299).change, false);
  const a = avancer(e, ETAT_INITIAL, 0, 300);
  assert.deepEqual(a, { etat: { i: 1, debutM: 0, debutS: 300 }, change: true });
  assert.deepEqual(resteEtape(e, ETAT_INITIAL, 0, 60), { reste: 240, unite: "s", part: 0.8 });
  // « Étape » pendant la récup (à 330 s) : le 2e effort commence là
  const p = passer(a.etat, 0, 330);
  assert.deepEqual(p, { i: 2, debutM: 0, debutS: 330 });
  assert.equal(avancer(e, p, 0, 629).change, false);
  assert.equal(avancer(e, p, 0, 630).etat.i, 3, "fini : 300 s après le passage à la main");
});

test("D3 : annonce et cible d'une étape convertie : la durée et la vitesse à régler sur la machine", () => {
  const [et] = etapesAuTemps([effort(1000, null, 5, "3/6")], 12);
  assert.equal(annonceEtape(et), "3 sur 6, 5 minutes à 12 kilomètres heure en zone 5.");
  assert.equal(cibleEtape(et!), "5:00, 12,0 km/h");
  const [demi] = etapesAuTemps([effort(1000, null, 4, "1/4")], 15);
  assert.equal(demi!.vitesseKmH, 13.1);
  assert.equal(annonceEtape(demi), "1 sur 4, 4 minutes 35 à 13,1 kilomètres heure en zone 4.");
  // dehors, rien ne change
  assert.equal(annonceEtape(effort(1000, null, 4, "1/4")), "1 sur 4, 1 kilomètre en zone 4.");
});

const DOSSIER = new URL("../assets/catalogue/programmes/", import.meta.url);
const P = (id: string) => readdirSync(DOSSIER).map((f) => JSON.parse(readFileSync(new URL(f, DOSSIER), "utf8"))).find((p) => p.id === id);

test("D3 : le suivi lancé sur tapis relit les étapes au temps, à la VMA du départ (même suite partout)", async () => {
  const { db } = await baseDeTest(true);
  await demarrerPlan(db, P("c10"), { jours: [1, 3, 4, 6], longue: 6, debut: "2026-11-02", heure: "18:30" }, {}, "fr");
  let routineId: string | null = null;
  for (const r of await listerRoutines(db)) {
    const lue = await lireRoutine(db, r.id);
    if (lue && etapesDeRoutine(lignesCourse(lue)).some((x) => x.distanceM)) routineId = r.id;
  }
  assert.ok(routineId, "c10 a une routine à la distance");
  const base = { suiviId: "s1", exerciceId: "cat:course", titre: "Fractionné", salleId: null, routineId };
  const dehors = (await etapesDuSuivi(db, base))!;
  const tapis = (await etapesDuSuivi(db, { ...base, tapis: { vma: 15 } }))!;
  assert.equal(tapis.length, dehors.length);
  assert.ok(tapis.every((x) => !x.distanceM && x.dureeS), "plus aucune étape à la distance");
  dehors.forEach((d, i) => {
    if (d.distanceM) assert.equal(tapis[i]!.dureeS, Math.round((d.distanceM / 1000 / vitesseTapisKmH(d.zone, 15)) * 3600));
    else assert.deepEqual(tapis[i], d);
  });
});

const tapisSansFc: SuiviAEnregistrer = {
  exerciceId: "cat:course", titre: "Course à pied", salleId: null, mode: "fc", debut: 1_000_000, fin: 2_800_000, dureeS: 1800,
  distanceM: 0, denivelePlusM: null, deniveleMoinsM: null, barometre: false, points: [], fc: [], tours: [{ s: 600_000, d: 0 }],
};

test("tapis sans FC : le résumé garde son bloc ; la distance saisie devient celle de la séance et reste après une reprise", async () => {
  const { db, raw } = await baseDeTest(true);
  const id = await enregistrerSuivi(db, tapisSansFc);
  const sv = await lireSuivi(db, id);
  assert.ok(sv, "ni tracé ni FC, mais un suivi de tapis");
  assert.equal(sv!.mode, "fc");
  let ef = (await chargerEffort(db, (await lireSeance(db, id))!))!;
  assert.ok(ef.saisie, "la distance se saisit");
  assert.equal(ef.saisie!.distanceM, null);
  assert.equal(ef.vue.distanceM, 0);
  await modifierSerie(db, ef.saisie!.serieId, { distanceM: metresSaisis("6,2", "km") });
  ef = (await chargerEffort(db, (await lireSeance(db, id))!))!;
  assert.equal(ef.vue.distanceM, 6200);
  assert.equal(Math.round(ef.vue.allure!), Math.round(1800 / 6.2), "allure moyenne : 4'50\" au km");
  // « Reprendre » puis nouvelle fin : la distance tapée n'est pas effacée par celle du suivi (0)
  await remplacerSuivi(db, id, { ...tapisSansFc, fin: 3_000_000, dureeS: 2000 });
  const serie = raw.prepare("SELECT duree_s, distance_m FROM series WHERE seance_id = ?").get(id) as Record<string, number>;
  assert.deepEqual({ ...serie }, { duree_s: 2000, distance_m: 6200 });
});

test("une course dehors garde sa distance GPS, sans champ de saisie", async () => {
  const { db } = await baseDeTest(true);
  const points = Array.from({ length: 5 }, (_, i) => ({
    t: 1_000_000 + i * 1000, s: i * 1000, lat: 48.85 + i * 0.00003, lon: 5.8037, altBaro: null, altGps: null, precision: 5, vitesse: 3.3,
  }));
  const id = await enregistrerSuivi(db, { ...tapisSansFc, mode: "course", points, distanceM: 13, dureeS: 4 });
  const ef = (await chargerEffort(db, (await lireSeance(db, id))!))!;
  assert.equal(ef.saisie, undefined);
  assert.ok(ef.vue.distanceM > 10 && ef.vue.distanceM < 15);
  assert.equal(avecDistanceSaisie(ef.vue, 5000).distanceM, ef.vue.distanceM, "un tracé garde sa distance");
});

test("distance saisie : virgule ou point, km ou mi ; vide, zéro ou illisible : rien", () => {
  assert.equal(metresSaisis("8,5", "km"), 8500);
  assert.equal(metresSaisis("8.25", "km"), 8250);
  assert.equal(metresSaisis("3", "mi"), 4828);
  assert.equal(metresSaisis("", "km"), null);
  assert.equal(metresSaisis("0", "km"), null);
  assert.equal(metresSaisis(".", "km"), null);
});
