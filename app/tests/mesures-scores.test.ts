// Pages de mesure (planche pas) : zones des séances, repères de l'OMS, formats ; résumés réels (base SQLite) de la
// Récupération pepfit (planche recuperation : jamais le score de Whoop) et de l'Effort pepfit.
import { describe, expect, it } from "./attendu.ts";
import { baseDeTest } from "./aide.ts";
import { duree, kcalDeKj, parSemaine, railRepere, texteEffort, zonesSeance } from "../src/ecrans/mesures/scores-calc.ts";
import { lireResumeEffort, lireResumeRecup } from "../src/ecrans/mesures/scores-donnees.ts";
import { ecrireNuitsRecup } from "../src/ecrans/recup-donnees.ts";
import { scoreEffort, scoreSemaine } from "../src/ecrans/effort-pepfit.ts";
import { decaler, minuit } from "../src/ecrans/mesures/periodes.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { enregistrerJours, mesuresDesJours } from "../src/whoop/depot.ts";
import { REGLAGE } from "../src/whoop/constantes.ts";

const MAINTENANT = new Date(2026, 9, 28, 16, 42).getTime();
const AUJ = minuit(MAINTENANT);

describe("calculs", () => {
  it("kcal des kJ, zones d'une séance", () => {
    expect(kcalDeKj(2071)).toBe(495);
    expect(zonesSeance([5, 10, 20, 28, 3, 1])).toEqual({ z13: 58, z45: 4 });
    expect(zonesSeance(null)).toBeNull();
  });
  it("par semaine, repère OMS, formats", () => {
    expect(parSemaine([60, null, 0, 30])).toBe(210);
    expect(parSemaine([null])).toBeNull();
    expect(railRepere(367, 150)).toEqual({ part: 1, trait: 150 / 367 });
    expect(railRepere(10, 75).trait).toBe(1 / 1.6);
    expect(duree(58)).toBe("58 min");
    expect(duree(367)).toBe("6 h 07");
    expect(texteEffort(4)).toBe("4,0");
    expect(texteEffort(12.63)).toBe("12,6");
  });
});

async function baseWhoop() {
  const { db } = await baseDeTest();
  await ecrireReglage(db, REGLAGE.connecte, "1");
  const jours = [
    { jour: AUJ, recup: 31, vfc: 72, fcRepos: 43, respiration: 12.8, sommeilPerf: 59, sommeilFin: AUJ + 7 * 3_600_000 + 4 * 60_000, strain: 12.6, kj: 11088 },
    ...Array.from({ length: 30 }, (_, i) => ({ jour: decaler(AUJ, -1 - i), recup: 60, vfc: 85, fcRepos: 44, respiration: 12.9, sommeilPerf: 76, strain: 11, kj: 9246 })),
  ];
  await enregistrerJours(db, jours, MAINTENANT);
  return db;
}

describe("lecture", () => {
  it("résumé de la Récupération : celle de pepfit, depuis les nuits ; jamais le score de Whoop (31 ici)", async () => {
    const db = await baseWhoop();
    await ecrireNuitsRecup(db, decaler(AUJ, -30), AUJ, { maintenant: MAINTENANT });
    const c = (await lireResumeRecup(db, MAINTENANT))!;
    expect(c.jour).toBe(AUJ);
    // VFC 72 contre 85 d'habitude, FC 43 contre 44 : sous la norme, « Correct » ; la charge et le sommeil manquent
    expect(c.score).not.toBeNull();
    expect(c.score === 31).toBe(false);
    expect(c.niveau).toBe("correct");
    expect(c.feminin).toBe(false);
  });
  it("sans aucune nuit : pas de résumé (la carte dit « pas de score »)", async () => {
    const { db: vide } = await baseDeTest();
    expect(await lireResumeRecup(vide, MAINTENANT)).toBeNull();
  });
  it("résumé de l'Effort pepfit (Accueil, Santé) : la séance la plus chargée, la semaine ; jamais le score de Whoop", async () => {
    const db = await baseWhoop();
    const deb = AUJ + 14 * 3_600_000;
    await db.runAsync("INSERT INTO seances (id, titre, debut, fin, activite_id, maj_le) VALUES ('s2', 'Padel', ?, ?, 'cat:padel', 0)", [deb, deb + 62 * 60_000]);
    await db.runAsync("INSERT INTO whoop_seance (id, debut, fin, sport, strain, kj, zones, seance_id, maj_le) VALUES ('w1', ?, ?, 'Padel', 11.9, 2071, ?, 's2', 0)", [deb, deb + 62 * 60_000, JSON.stringify([5, 10, 20, 28, 3, 1])]);
    await db.runAsync("INSERT INTO seances (id, titre, debut, fin, activite_id, maj_le) VALUES ('s1', 'Course', ?, ?, 'cat:course', 0)", [decaler(AUJ, -1) + 18 * 3_600_000, decaler(AUJ, -1) + 19 * 3_600_000]);
    const c = await lireResumeEffort(db, MAINTENANT);
    // padel : les minutes de Whoop par zone (10 + 40 + 84 + 12 + 5 = 151 points), jamais son 11,9 ni le 12,6 du jour
    expect(Math.round(c.score! * 10) / 10).toBe(Math.round(scoreEffort(151) * 10) / 10);
    expect(c.activite).toEqual({ nom: "Padel", minutes: 62 });
    expect(c.semaine).toBe(scoreSemaine(151 + 60 * 3.2));
  });
  it("sans séance : un résumé sans effort (« pas encore noté »), même sans Whoop", async () => {
    const { db } = await baseDeTest();
    const c = await lireResumeEffort(db, MAINTENANT);
    expect(c.score).toBeNull();
    expect(c.semaine).toBeNull();
  });
});
