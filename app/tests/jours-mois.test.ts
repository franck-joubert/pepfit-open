// Page du mois : index des séances par jour (calculé une fois par planning) et titres sans emoji à l'affichage.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SeanceResume } from "../src/db/index.ts";
import { lignesDuJour, resumeJour, sansEmoji } from "../src/ecrans/jours-planning.ts";
import type { LigneJour, Planning } from "../src/ecrans/planif-donnees.ts";
import { ajouterJ, faite, iso, laPlusProche, marqueDuJour, occurrences, prochaines, type Programmation } from "../src/ecrans/planification.ts";
import { deMurale, parties } from "../src/i18n/temps.ts";

// Comme planif-donnees.ts (qui lit la base, donc pas importable ici).
const jourDe = (ms: number) => {
  const q = parties(ms);
  return iso(q.an, q.mois + 1, q.jour);
};
const instantDe = (j: string, h: string) => {
  const [a, m, d] = j.split("-").map(Number) as [number, number, number];
  const [hh, mn] = h.split(":").map(Number) as [number, number];
  return deMurale(new Date(a, m - 1, d, hh, mn));
};
const marque = (p: Planning, j: string) => marqueDuJour(j, p.occ, p.jours, p.aujourdhui);

const AUJ = "2026-10-27";

function planning(): Planning {
  const progs: Programmation[] = [
    { id: "a", routineId: "pull", texte: "", regle: { freq: "semaine", intervalle: 1, jours: [1, 4], heure: null, debut: "2026-09-01" }, actif: true, rappelMin: null, ordre: 0 },
    { id: "b", routineId: "push", texte: "", regle: { freq: "semaine", intervalle: 1, jours: [1], heure: "07:00", debut: "2026-09-01" }, actif: true, rappelMin: null, ordre: 1 },
  ];
  const seance = (id: string, j: string, h: string, titre: string, routineId: string | null, finie = true): SeanceResume => {
    const debut = instantDe(j, h);
    return { id, titre, routineId, debut, fin: finie ? debut + 3600_000 : null, dureeMin: 60, volumeKg: 0, nbSeries: 0, nbExercices: 0, nbRecords: 0 };
  };
  const seances = [
    seance("s1", "2026-10-06", "19:00", "Pull", "pull"),
    seance("s2", "2026-10-06", "08:00", "🏓 Padel", null),
    seance("s3", "2026-10-11", "10:00", "Course", null),
    seance("s4", "2026-10-27", "06:30", "Push", "push", false),
  ];
  const jours = seances.map((s) => ({ id: s.id, routineId: s.routineId, date: jourDe(s.debut), faite: s.fin != null }));
  const occ = occurrences(progs, [], "2026-10-01", "2026-11-30", "18:00");
  const pr = prochaines(progs, [], jours, AUJ, "18:00");
  return {
    aujourdhui: AUJ, heureDefaut: "18:00", rappelDefautMin: 0, progs, exceptions: [],
    routines: new Map([["pull", { nom: "Pull", dureeS: 3600, planId: null, visible: true, origine: "moi" as const, modifiePar: null }], ["push", { nom: "Push", dureeS: 3000, planId: null, visible: true, origine: "moi" as const, modifiePar: null }]]),
    reglages: new Map(), de: "2026-10-01", a: "2026-11-30", occ, seances, jours, prochaines: pr, plusProche: laPlusProche(pr),
  };
}

/** L'ancienne lecture, jour par jour (tout le planning parcouru pour chaque jour) : la référence. */
function lignesReference(p: Planning, j: string): LigneJour[] {
  const prevues = p.occ
    .filter((o) => o.date === j && !faite(o, p.jours))
    .map((occ) => {
      const r = p.routines.get(occ.routineId);
      return { t: occ.heure, l: { genre: "prevue", occ, nom: r?.nom ?? "", dureeS: r?.dureeS ?? 0, dureeChoisie: false, sansHeure: false, sport: null, manquee: j < p.aujourdhui, origine: "moi", modifiePar: null, propre: false } as LigneJour };
    });
  const faites = p.seances
    .filter((s) => s.fin != null && jourDe(s.debut) === j)
    .map((seance) => {
      const q = parties(seance.debut);
      return { t: `${String(q.h).padStart(2, "0")}:${String(q.min).padStart(2, "0")}`, l: { genre: "faite", seance } as LigneJour };
    });
  return [...prevues, ...faites].sort((x, y) => x.t.localeCompare(y.t)).map((x) => x.l);
}

test("index par jour : mêmes lignes et même marque que la lecture jour par jour, sur deux mois", () => {
  const p = planning();
  for (let j = p.de; j <= p.a; j = ajouterJ(j, 1)) {
    assert.deepEqual(lignesDuJour(p, j), lignesReference(p, j), j);
    assert.equal(resumeJour(p, j).m, marque(p, j), j);
  }
});

test("résumé d'un jour : séance faite d'abord (par heure), prévue sinon, rien pour un jour manqué", () => {
  const p = planning();
  // Mardi 6 octobre : Padel à 8 h puis Pull à 19 h, faits (le Push prévu ce jour-là est manqué) ; vendredi 9 : Pull manqué.
  assert.deepEqual(resumeJour(p, "2026-10-06"), { m: "faite", nom: "Padel" });
  assert.deepEqual(resumeJour(p, "2026-10-09"), { m: "manquee", nom: "" });
  assert.deepEqual(resumeJour(p, "2026-10-11"), { m: "faite", nom: "Course" });
  // Aujourd'hui : séance en cours (pas finie), le Push et le Pull sont encore à venir.
  assert.deepEqual(resumeJour(p, AUJ), { m: "prevue", nom: "Push" });
  assert.deepEqual(resumeJour(p, "2026-10-28"), { m: null, nom: "" });
});

test("index : calculé une fois par planning", () => {
  const p = planning();
  assert.equal(lignesDuJour(p, "2026-10-06"), lignesDuJour(p, "2026-10-06"));
});

test("titres sans emoji à l'affichage", () => {
  assert.equal(sansEmoji("🏓 Padel"), "Padel");
  assert.equal(sansEmoji("Padel 🏓🎾"), "Padel");
  assert.equal(sansEmoji("🏋️‍♂️ Haut du corps"), "Haut du corps");
  assert.equal(sansEmoji("Pull 2 — dos"), "Pull 2 — dos");
  assert.equal(sansEmoji("Séance d'été"), "Séance d'été");
});

test("onglet re-touché : seules les pages abonnées à cet onglet sont prévenues, jusqu'au désabonnement", async () => {
  const { abonnerRetouche, retoucher } = await import("../src/ui/onglet-retouche.ts");
  const vus: string[] = [];
  const fin = abonnerRetouche("/train", () => vus.push("train"));
  abonnerRetouche("/food", () => vus.push("food"));
  retoucher("/train");
  fin();
  retoucher("/train");
  assert.deepEqual(vus, ["train"]);
});

test("fenêtre d'une semaine : son mois et ses voisins, la même pour toutes les semaines du mois", async () => {
  const { fenetreSemaine } = await import("../src/ecrans/planification.ts");
  assert.deepEqual(fenetreSemaine("2026-10-26"), { de: "2026-09-01", a: "2026-11-30" });
  assert.deepEqual(fenetreSemaine("2026-10-05"), fenetreSemaine("2026-10-26"));
  // Semaine à cheval sur deux mois : couverte jusqu'au bout.
  assert.ok(fenetreSemaine("2026-12-28").a >= "2027-01-03");
});

test("séance prévue faite par une séance détectée : une seule ligne (la séance faite), la 14:00 reste prévue", () => {
  const LUN = "2026-11-02";
  const unique = (id: string, routineId: string, heure: string): Programmation => ({
    id, routineId, texte: "", regle: { freq: "unique", intervalle: 1, jours: [], date: LUN, heure, debut: "2026-10-01" }, actif: true, rappelMin: null, ordre: 0,
  });
  const progs = [unique("a", "padel", "11:00"), unique("b", "padel2", "14:00")];
  const infos = new Map([["padel", { sport: "cat:padel", dureeMin: 90 }], ["padel2", { sport: "cat:padel", dureeMin: 90 }]]);
  const debut = instantDe(LUN, "11:02");
  const w: SeanceResume = { id: "w", titre: "Padel", routineId: null, debut, fin: debut + 99 * 60_000, dureeMin: 99, volumeKg: 0, nbSeries: 0, nbExercices: 0, nbRecords: 0 };
  const q = parties(debut);
  const jours = [{ id: "w", routineId: null, date: LUN, faite: true, sport: "cat:padel", debutMin: q.h * 60 + q.min, finMin: q.h * 60 + q.min + 99 }];
  const occ = occurrences(progs, [], LUN, LUN, "18:00", infos);
  const pr = prochaines(progs, [], jours, LUN, "18:00", infos);
  const p: Planning = {
    aujourdhui: "2026-11-03", heureDefaut: "18:00", rappelDefautMin: 0, progs, exceptions: [],
    routines: new Map([["padel", { nom: "Padel", dureeS: 5400, planId: null, visible: true, origine: "moi" as const, modifiePar: null }], ["padel2", { nom: "Padel", dureeS: 5400, planId: null, visible: true, origine: "moi" as const, modifiePar: null }]]),
    reglages: new Map(), de: LUN, a: LUN, occ, seances: [w], jours, prochaines: pr, plusProche: laPlusProche(pr),
  };
  const lignes = lignesDuJour(p, LUN);
  assert.deepEqual(lignes.map((l) => (l.genre === "faite" ? `faite ${l.seance.id}` : `prevue ${l.occ.heure} manquee=${l.manquee}`)), ["faite w", "prevue 14:00 manquee=true"]);
  assert.equal(resumeJour(p, LUN).m, "faite");
});
