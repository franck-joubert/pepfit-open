// Page Sommeil (planche pas, NOTES § 1 ter) : fusion Whoop / Santé Connect par jour de réveil, chronologie de Santé Connect
// gardée sous une nuit Whoop (D15), statistiques (moyennes sur les nuits avec donnée, nuits à l'objectif, régularité,
// moyennes par mois), résumé des cartes, formats.
import { describe, expect, it } from "./attendu.ts";
import { baseDeTest } from "./aide.ts";
import { enregistrerJours } from "../src/whoop/depot.ts";
import { joursWhoop } from "../src/whoop/lecture.ts";
import { chronologie, fusionner, lireResumeSommeil, lireSommeilDuJour } from "../src/ecrans/mesures/sommeil-donnees.ts";
import { isoJour } from "../src/ecrans/recup-donnees.ts";
import { arrondiDette } from "../src/ecrans/recup-pepfit.ts";
import { besoinTotal, ecartType, hm, hmCourt, periodeSommeil, statsNuits, versStat, type NuitStat } from "../src/ecrans/mesures/sommeil-stats.ts";
import { decaler, minuit } from "../src/ecrans/mesures/periodes.ts";

const M = 60_000;
const MAINTENANT = new Date(2026, 9, 28, 16, 42).getTime();
const AUJ = minuit(MAINTENANT);
const COUCHER = AUJ - 12 * M; // 23:48 la veille
const LEVER = AUJ + 418 * M; // 06:58

function etapesSante() {
  const t: [number, number][] = [[1, 6], [4, 22], [5, 34], [6, 10], [1, 3], [4, 25], [5, 26], [6, 18], [1, 12], [4, 250]];
  let x = COUCHER;
  return t.map(([type, m]) => {
    const e = { debut: x, fin: x + m * M, type };
    x += m * M;
    return e;
  });
}

describe("données", () => {
  it("chronologie : seulement si l'appli écrit des phases détaillées", () => {
    expect(chronologie(etapesSante())!.length).toBe(10);
    expect(chronologie([{ debut: 0, fin: 10, type: 2 }])).toBeNull();
    expect(chronologie([{ debut: 0, fin: 10, type: 1 }])).toBeNull();
    expect(chronologie(undefined)).toBeNull();
  });

  it("Whoop prime pour la nuit et garde la chronologie de Santé Connect du même réveil (D15)", async () => {
    const { db } = await baseDeTest();
    await enregistrerJours(db, [
      {
        jour: AUJ, sommeilDebut: COUCHER, sommeilFin: LEVER, sommeilMin: 382, sommeilPerf: 59, sommeilDetteMin: 65, legerMin: 213, profondMin: 78, paradoxalMin: 91, eveilMin: 48,
        respiration: 13.1, sommeilEfficacite: 89, sommeilRegularite: 81, sommeilReveils: 3, auLitMin: 430, besoinBaseMin: 451, besoinEffortMin: 22, besoinSiesteMin: 0,
      },
    ], MAINTENANT);
    const w = await joursWhoop(db, decaler(AUJ, -3), AUJ);
    const sc = { debut: COUCHER + 2 * M, fin: LEVER - 3 * M, minutes: 380, phases: null, origine: "com.samsung.health", etapes: etapesSante() };
    const autre = { debut: decaler(AUJ, -1) - 30 * M, fin: decaler(AUJ, -1) + 400 * M, minutes: 400, phases: null, origine: "x", etapes: [] };
    const n = fusionner([sc, autre], w);
    const auj = n.get(AUJ)!;
    expect(auj.source).toBe("whoop");
    expect(auj.sommeilMin).toBe(382);
    expect(auj.etapes!.length).toBe(10);
    expect(auj.perf).toBe(59);
    expect(besoinTotal(auj.besoin!)).toBe(451 + 65 + 22);
    expect(auj.efficacite).toBe(89);
    expect(auj.efficaciteCalculee).toBe(false);
    expect(auj.respiration).toBe(13.1);
    // la veille : Santé Connect seul, sans performance ni besoin (rien d'inventé), efficacité calculée
    const hier = n.get(decaler(AUJ, -1))!;
    expect(hier.source).toBe("sante");
    expect(hier.perf).toBeNull();
    expect(hier.besoin).toBeNull();
    expect(hier.efficaciteCalculee).toBe(true);
    expect(hier.efficacite).toBe(Math.round((400 / 430) * 100));
  });

  it("résumé des cartes : rien sans nuit", async () => {
    const { db } = await baseDeTest();
    expect(await lireResumeSommeil(db, MAINTENANT)).toBeNull();
    await enregistrerJours(db, [{ jour: AUJ, sommeilDebut: COUCHER, sommeilFin: LEVER, sommeilMin: 382, sommeilPerf: 59, sommeilDetteMin: 65, besoinBaseMin: 451, besoinEffortMin: 22 }], MAINTENANT);
    const r = (await lireResumeSommeil(db, MAINTENANT))!;
    expect(r.nuit.sommeilMin).toBe(382);
    // sans nuits de la Récupération, pepfit est sous son seuil de précision : ni besoin, ni dette, ni part (jamais ceux de Whoop)
    expect(r.besoinMin).toBeNull();
    expect(r.detteMin).toBeNull();
    expect(r.part).toBeNull();
    expect(r.sept.length).toBe(7);
    expect(r.sept[6]).toBe(382);
    expect(r.moyenneSept).toBe(382);
  });

  it("résumé des cartes : besoin, dette et part du besoin calculés par pepfit, pas par Whoop (538 min, dette 65)", async () => {
    const { db, raw } = await baseDeTest();
    await enregistrerJours(db, [{ jour: AUJ, sommeilDebut: COUCHER, sommeilFin: LEVER, sommeilMin: 382, sommeilPerf: 59, sommeilDetteMin: 65, besoinBaseMin: 451, besoinEffortMin: 22 }], MAINTENANT);
    // les 8 nuits de la Récupération (recup_nuit) : 382 min cette nuit, 420 les 7 d'avant ; le besoin de Whoop (999) est ignoré
    const ins = raw.prepare("INSERT INTO recup_nuit (jour, sommeil_min, besoin_min, source_sommeil, rang, maj_le) VALUES (?, ?, 999, 'montre', 4, 1)");
    for (let i = 0; i < 8; i++) ins.run(isoJour(decaler(AUJ, -i)), i === 0 ? 382 : 420);
    const r = (await lireResumeSommeil(db, MAINTENANT))!;
    const s = await lireSommeilDuJour(db, AUJ, undefined, MAINTENANT);
    expect(s.matin.besoin.chiffre).toBe(true);
    // objectif 7 h 30 + 45 min de rattrapage (la veille au soir), pas d'effort
    expect(r.besoinMin).toBe(s.matin.besoin.total);
    expect(r.besoinMin).toBe(495);
    expect(r.detteMin).toBe(arrondiDette(s.dette.aRattraper));
    expect(r.detteMin).toBe(160);
    expect(r.part).toBe(Math.round((382 / 495) * 100));
  });
});

describe("statistiques", () => {
  const nuit = (j: number, dort: number, coucher: number, perf: number | null = null): NuitStat =>
    versStat({ jour: decaler(AUJ, -j), debut: decaler(AUJ, -j) + coucher * M, fin: decaler(AUJ, -j) + (coucher + dort + 40) * M, sommeilMin: dort, auLitMin: dort + 40, phases: { eveil: 40, leger: dort / 2, profond: dort / 4, paradoxal: dort / 4 }, perf });

  it("moyennes sur les nuits avec donnée, nuits à l'objectif, régularité", () => {
    const l = [nuit(0, 382, -12, 59), null, nuit(2, 465, -30, 80), nuit(3, 450, 6)];
    const s = statsNuits(l, 450);
    expect(s.n).toBe(3);
    expect(s.sommeil).toBe((382 + 465 + 450) / 3);
    expect(s.aObjectif).toBe(2);
    expect(s.meilleure!.sommeilMin).toBe(465);
    expect(s.perf).toBe((59 + 80) / 2);
    expect(Math.round(s.coucher!)).toBe(-12);
    expect(s.ecCoucher!.toFixed(1)).toBe(ecartType([-12, -30, 6])!.toFixed(1));
    expect(s.phases!.eveil).toBe(40);
  });

  it("périodes : la nuit sans donnée reste vide ; l'année moyenne par mois", () => {
    const m = new Map<number, NuitStat>([[AUJ, nuit(0, 382, -12)], [decaler(AUJ, -2), nuit(2, 420, -20)]]);
    const p = periodeSommeil("semaine", 0, MAINTENANT, m, 450);
    expect(p.barres.length).toBe(7);
    // mercredi : 3e barre de la semaine du lundi au dimanche ; les nuits à venir sont vides
    expect(p.barres[2]!.v).toBe(382);
    expect(p.barres[1]!.v).toBeNull();
    expect(p.barres[6]!.aVenir).toBe(true);
    expect(p.stats.n).toBe(2);
    const a = periodeSommeil("annee", 0, MAINTENANT, m, 450);
    expect(a.barres[11]!.v).toBe(401);
    expect(a.barres[11]!.moyenne).toBe(true);
  });

  it("formats", () => {
    expect(hm(382)).toBe("6 h 22");
    expect(hm(48)).toBe("48 min");
    expect(hmCourt(382)).toBe("6h22");
    expect(ecartType([1])).toBeNull();
  });
});
