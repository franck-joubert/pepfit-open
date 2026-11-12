// Suivi réduit en bulle (retour du 29/10) : la bulle du suivi, et les étapes qui avancent écran en direct fermé.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BULLE_SUIVI, resumerSuivi } from "../src/ecrans/bandeau-seance.ts";
import type { Etape } from "../src/ecrans/etapes-course.ts";
import { ecranDirect, etapeAPasser } from "../src/ecrans/guide-fond.ts";
import { bulleSur } from "../src/ui/bulle-seance.ts";

const lance = { suiviId: "s1", titre: "Fractionné 6 × 1 km" };

test("bulle d'un suivi en cours : chrono du natif, distance si GPS ; rien après Terminer ni sans suivi", () => {
  const b = resumerSuivi(lance, { id: "s1", statut: "en_cours", mode: "course", tempsMs: 754_000 }, 1_000_000);
  assert.deepEqual(b, {
    id: `${BULLE_SUIVI}s1`, titre: "Fractionné 6 × 1 km", exercice: null, seriesFaites: 0, suivi: { gps: true },
    chrono: { debut: 1_000_000 - 754_000, pauseDebut: null, pauseCumulS: 0 },
  });
  // en pause : le chrono est figé ; tapis : sans distance
  const p = resumerSuivi(lance, { id: "s1", statut: "pause", mode: "fc", tempsMs: 60_000 }, 5_000);
  assert.equal(p?.chrono.pauseDebut, 5_000);
  assert.deepEqual(p?.suivi, { gps: false });
  assert.equal(resumerSuivi({ ...lance, seanceId: "x" }, { id: "s1", statut: "pause", mode: "course", tempsMs: 1 }, 0), null, "Terminer : le résumé est ouvert");
  assert.equal(resumerSuivi(lance, { id: "s1", statut: "arrete", mode: "course", tempsMs: 1 }, 0), null);
  assert.equal(resumerSuivi(null, { id: "s1", statut: "en_cours", mode: "course", tempsMs: 1 }, 0), null);
  // la bulle s'affiche sur les onglets (Moi, Entraînements), pas dans l'écran en direct
  assert.ok(bulleSur("/health") && bulleSur("/train"));
  assert.equal(bulleSur("/suivi/direct"), false);
});

const etape = (x: Partial<Etape>): Etape => ({ genre: "effort", rang: null, nom: null, distanceM: null, dureeS: null, zone: null, ligne: 0, ...x });
const ETAPES = [etape({ genre: "echauffement", dureeS: 600 }), etape({ distanceM: 1000, zone: 4 }), etape({ genre: "retour", dureeS: 300 })];

test("écran en direct fermé : l'étape passe à sa cible, une seule fois ; ouvert, c'est lui qui la passe", () => {
  ecranDirect.ouvert = false;
  const e = { statut: "en_cours", tours: [] as { s: number; d: number }[], distanceM: 1500, tempsMs: 600_000 };
  assert.equal(etapeAPasser(ETAPES, e, 0), true, "échauffement de 10 min fini");
  assert.equal(etapeAPasser(ETAPES, e, 1), false, "tour demandé, pas encore rendu par le natif");
  assert.equal(etapeAPasser(ETAPES, { ...e, tempsMs: 599_000 }, 0), false, "pas encore");
  // la borne posée, l'étape suivante (1 km) part de là
  const apres = { ...e, tours: [{ s: 600_000, d: 1500 }], distanceM: 2400, tempsMs: 900_000 };
  assert.equal(etapeAPasser(ETAPES, apres, 1), false);
  assert.equal(etapeAPasser(ETAPES, { ...apres, distanceM: 2500 }, 1), true);
  assert.equal(etapeAPasser(ETAPES, { ...e, statut: "pause" }, 0), false, "en pause");
  assert.equal(etapeAPasser(null, e, 0), false, "course libre");
  ecranDirect.ouvert = true;
  assert.equal(etapeAPasser(ETAPES, e, 0), false);
  ecranDirect.ouvert = false;
});
