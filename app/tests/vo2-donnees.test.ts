// VO2max et VMA lues en base (planche vma-vo2max, D1, D6) : test VMA, estimation d'une course GPS mise en cache, VO2max
// d'Uth sans VMA, catégorie pour l'âge et le sexe.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { ajouterMesures } from "../src/db/depots/mesures.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { enregistrerSuivi } from "../src/db/depots/suivi-gps.ts";
import { enregistrerTestVma, corrigerTestVma, TYPE_VMA_COURSE } from "../src/db/depots/vma.ts";
import { lireVo2 } from "../src/ecrans/mesures/vo2-donnees.ts";

const JOUR = 86_400_000;
const T0 = new Date(2026, 9, 29, 18).getTime();
const M_PAR_DEGRE = (6_371_008.8 * Math.PI) / 180;

/** Course vers le nord, un point par seconde : [durée (s), km/h]. */
function points(morceaux: [number, number][], depart: number) {
  const l: { t: number; s: number; lat: number; lon: number; altBaro: null; altGps: null; precision: number; vitesse: number }[] = [];
  let t = depart, m = 0;
  for (const [d, kmh] of morceaux) for (let k = 0; k < d; k++) {
    t += 1000;
    m += kmh / 3.6;
    l.push({ t, s: t - depart, lat: 48.85 + m / M_PAR_DEGRE, lon: 5.8037, altBaro: null, altGps: null, precision: 5, vitesse: kmh / 3.6 });
  }
  return l;
}

async function course(db: Awaited<ReturnType<typeof baseDeTest>>["db"], debut: number, morceaux: [number, number][]) {
  const p = points(morceaux, debut);
  return enregistrerSuivi(db, {
    exerciceId: "cat:course", titre: "Course", salleId: null, mode: "course", debut, fin: p.at(-1)!.t, dureeS: p.length,
    distanceM: 0, denivelePlusM: null, deniveleMoinsM: null, barometre: false, points: p, fc: [], tours: [],
  });
}

test("rien : pas de VO2max ; FC au repos seule : Uth, « estimée » ; une course : VMA estimée ; un test : la VMA du test", async () => {
  const { db } = await baseDeTest(true);
  await ecrireReglage(db, "naissance", "1987-05-14");
  await ecrireReglage(db, "sexe", "h");
  let d = await lireVo2(db, { maintenant: T0 });
  assert.equal(d.vo2, null);

  // FC au repos (Whoop) : Uth, 15,3 × 181 ÷ 46
  for (let k = 1; k <= 5; k++) await ajouterMesures(db, "fc", [{ valeur: 46, date: T0 - k * JOUR }], "whoop");
  d = await lireVo2(db, { maintenant: T0 });
  assert.equal(d.vo2?.methode, "uth");
  assert.equal(Math.round(d.vo2!.valeur * 10) / 10, Math.round(((15.3 * 181) / 46) * 10) / 10);

  // une course : 10 min à 14,5 km/h → VMA ≈ 15,0, estimée ; mise en cache (une seule ligne)
  const c = await course(db, T0 - 5 * JOUR, [[600, 9], [600, 14.5], [300, 9]]);
  d = await lireVo2(db, { maintenant: T0, detail: true });
  assert.equal(d.vma?.source, "estimee");
  assert.ok(Math.abs(d.vma!.vma - 15) < 0.1, `${d.vma!.vma}`);
  assert.equal(d.estimee?.seanceId, c);
  assert.equal(d.estimee?.portion?.dureeS, 600);
  assert.equal(d.vo2?.methode, "vma-estimee");
  assert.equal(d.courses, 1);
  await lireVo2(db, { maintenant: T0 });
  assert.equal((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM mesure_corps WHERE type = ?", [TYPE_VMA_COURSE]))!.n, 1);

  // un test VMA : 1 512 m → 15,1 km/h, VO2max 52,9, « très bonne » pour un homme de 39 ans
  const s = await course(db, T0 - JOUR, [[780, 9], [360, 15.12], [600, 8]]);
  await enregistrerTestVma(db, s, T0 - JOUR, 1512);
  d = await lireVo2(db, { maintenant: T0 });
  assert.deepEqual([d.vma?.source, d.vma?.vma, d.vo2?.methode], ["test", 15.12, "vma-test"]);
  assert.equal(Math.round(d.vo2!.valeur * 10) / 10, 52.9);
  assert.equal(d.categorie, "tresBonne");
  assert.ok(d.historique.some((p) => p.src === "test") && d.historique.some((p) => p.src === "course"));
  // corriger la distance (piste : 3 tours et 312 m)
  await corrigerTestVma(db, s, 3 * 400 + 312);
  assert.equal((await lireVo2(db, { maintenant: T0 })).vma?.vma, 15.12);
  await corrigerTestVma(db, s, 1480);
  assert.equal((await lireVo2(db, { maintenant: T0 })).vma?.vma, 14.8);
});
