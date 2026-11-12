// Tiroir de lancement, avancement du programme et carte de fin (planche seance-tiroirs v2, docs/CODE-TIROIRS.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ajouterJ } from "../src/ecrans/planification.ts";
import {
  arrondi5, avancement, dureePrevue, ecartColonnes, formeAvancement, genreTiroir, meilleurGain,
  pourcentage, rappelTiroir, rattacher, reposTypique, type SeanceFaite, type SeanceProg,
} from "../src/ecrans/tiroir-seance-calc.ts";

/** Force 5×5 : 12 semaines × 3 séances (lundi, mercredi, vendredi), routines A et B en alternance. */
function force(debut = "2026-10-19"): SeanceProg[] {
  const l: SeanceProg[] = [];
  for (let s = 0; s < 12; s++) for (const [k, j] of [0, 2, 4].entries()) l.push({ date: ajouterJ(debut, s * 7 + j), routineId: (s * 3 + k) % 2 ? "B" : "A" });
  return l;
}

test("pourcentage : séances faites sur le total (D6), arrondi, borné", () => {
  assert.equal(pourcentage(8, 36), 22);
  assert.equal(pourcentage(7, 36), 19);
  assert.equal(pourcentage(34, 36), 94);
  assert.equal(pourcentage(0, 0), 0);
  assert.equal(pourcentage(40, 36), 100);
});

test("forme : une ligne jusqu'à 20 séances, la grille au-delà (D5) ; écart des colonnes 8, 6, 4", () => {
  assert.equal(formeAvancement(3), "ligne");
  assert.equal(formeAvancement(20), "ligne");
  assert.equal(formeAvancement(21), "grille");
  assert.equal(formeAvancement(36), "grille");
  assert.deepEqual([8, 12, 13, 16, 17, 24].map(ecartColonnes), [8, 8, 6, 6, 4, 4]);
});

test("rattacher : même jour d'abord, sinon la plus ancienne séance libre de la routine", () => {
  const s: SeanceProg[] = [
    { date: "2026-11-02", routineId: "A" },
    { date: "2026-11-04", routineId: "B" },
    { date: "2026-11-06", routineId: "A" },
  ];
  assert.deepEqual(rattacher(s, [{ routineId: "A", jour: "2026-11-06" }]), [false, false, true]);
  assert.deepEqual(rattacher(s, [{ routineId: "A", jour: "2026-11-03" }]), [true, false, false]);
  assert.deepEqual(rattacher(s, [{ routineId: "C", jour: "2026-11-02" }]), [false, false, false]);
});

test("avancement du tiroir : semaine 3 sur 12, séance 8 sur 36 (D4), anneau sur la case du jour", () => {
  const seances = force();
  // 7 faites (semaines 1 et 2 sauf une, plus le lundi de la semaine 3) ; aujourd'hui : mercredi de la semaine 3.
  const auj = "2026-11-04";
  const faites: SeanceFaite[] = seances.slice(0, 7).map((s) => ({ routineId: s.routineId, jour: s.date }));
  const a = avancement({ debut: "2026-10-19", semaines: 12, seances, faites, routineId: seances[7]!.routineId, auj });
  assert.equal(a.total, 36);
  assert.equal(a.semaine, 3);
  assert.equal(a.semaines, 12);
  assert.equal(a.rang, 8);
  assert.equal(a.faites, 7);
  assert.equal(a.pourcent, 19);
  assert.equal(a.forme, "grille");
  assert.equal(a.colonnes.length, 12);
  assert.deepEqual(a.colonnes[2], ["faite", "ici", "avenir"]);
  assert.equal(a.derniere, false);
});

test("avancement de fin de séance : la case du jour compte, 19 → 22 %, prochaine séance", () => {
  const seances = force();
  const faites: SeanceFaite[] = seances.slice(0, 7).map((s) => ({ routineId: s.routineId, jour: s.date }));
  const a = avancement({ debut: "2026-10-19", semaines: 12, seances, faites, routineId: seances[7]!.routineId, auj: "2026-11-04", fin: true });
  assert.equal(a.faitesAvant, 7);
  assert.equal(a.faites, 8);
  assert.equal(a.pourcentAvant, 19);
  assert.equal(a.pourcent, 22);
  assert.equal(a.prochaine, "2026-11-06");
});

test("séance manquée : contour ; une séance faite un autre jour compte quand même", () => {
  const seances = force();
  // Lundi de la semaine 1 manqué ; mercredi fait le jeudi.
  const faites: SeanceFaite[] = [{ routineId: seances[1]!.routineId, jour: "2026-10-22" }];
  const a = avancement({ debut: "2026-10-19", semaines: 12, seances, faites, routineId: seances[2]!.routineId, auj: "2026-10-23" });
  assert.deepEqual(a.colonnes[0], ["manquee", "faite", "ici"]);
});

test("dernière séance (D11) : 34 faites sur 36, deux manquées, programme terminé", () => {
  const seances = force();
  const auj = seances[35]!.date;
  const faites: SeanceFaite[] = seances.slice(0, 35).filter((_, i) => i !== 12 && i !== 22).map((s) => ({ routineId: s.routineId, jour: s.date }));
  const a = avancement({ debut: "2026-10-19", semaines: 12, seances, faites, routineId: seances[35]!.routineId, auj, fin: true });
  assert.equal(a.derniere, true);
  assert.equal(a.faites, 34);
  assert.equal(a.pourcent, 94);
  assert.equal(a.prochaine, null);
  assert.equal(a.colonnes.flat().filter((e) => e === "manquee").length, 2);
});

test("programme court : 2 semaines × 3, une ligne de 6 cases groupées par semaine", () => {
  const seances = force().slice(0, 6);
  const a = avancement({ debut: "2026-10-19", semaines: 2, seances, faites: [], routineId: "A", auj: "2026-10-19" });
  assert.equal(a.forme, "ligne");
  assert.deepEqual(a.colonnes.map((c) => c.length), [3, 3]);
  assert.equal(a.rang, 1);
});

test("routine sans séance à faire dans le plan : pas de case du jour", () => {
  const seances = force().slice(0, 3);
  const a = avancement({ debut: "2026-10-19", seances, faites: [], routineId: "Z", auj: "2026-10-19" });
  assert.equal(a.rang, null);
  assert.equal(a.derniere, false);
});

test("genre du tiroir (D1, D9)", () => {
  assert.equal(genreTiroir("p1", null), "programme");
  assert.equal(genreTiroir("p1", "p2"), "programme");
  assert.equal(genreTiroir(null, "p2"), "horsProgramme");
  assert.equal(genreTiroir(null, null), "routine");
});

test("rappel (D7) : accent de la semaine, sinon note ; routine : la dernière fois", () => {
  assert.deepEqual(rappelTiroir({ genre: "programme", accent: "Départ à 90 %", note: "x", derniere: null }), { genre: "texte", texte: "Départ à 90 %" });
  assert.deepEqual(rappelTiroir({ genre: "programme", accent: " ", note: "Trois échecs", derniere: null }), { genre: "texte", texte: "Trois échecs" });
  assert.equal(rappelTiroir({ genre: "programme", accent: null, note: null, derniere: null }), null);
  const d = { jour: 1, series: 12, minutes: 52 };
  assert.deepEqual(rappelTiroir({ genre: "routine", accent: null, note: "n", derniere: d }), { genre: "derniere", ...d });
  assert.deepEqual(rappelTiroir({ genre: "horsProgramme", accent: null, note: "n", derniere: null }), { genre: "texte", texte: "n" });
});

test("durée prévue (D8) : estimation pour un programme, moyenne des 3 dernières pour une routine", () => {
  assert.deepEqual(dureePrevue("programme", 44 * 60, [60, 60]), { minutes: 45, source: "estimation", n: 0 });
  assert.deepEqual(dureePrevue("routine", 44 * 60, [52, 48, 50, 90]), { minutes: 50, source: "moyenne", n: 3 });
  assert.deepEqual(dureePrevue("routine", 30 * 60, []), { minutes: 30, source: "estimation", n: 0 });
  assert.equal(dureePrevue("routine", 0, []), null);
  assert.equal(arrondi5(1), 5);
  assert.equal(reposTypique([180, 180, 90, 0]), 180);
  assert.equal(reposTypique([]), null);
});

test("meilleur gain : dernière moins première séance, le plus grand gain positif", () => {
  const j = (n: number) => n * 86_400_000;
  assert.deepEqual(
    meilleurGain([
      { exo: "squat", nom: "Squat", debut: j(1), kg: 60 },
      { exo: "squat", nom: "Squat", debut: j(1), kg: 62.5 },
      { exo: "squat", nom: "Squat", debut: j(80), kg: 85 },
      { exo: "dc", nom: "Développé couché", debut: j(2), kg: 50 },
      { exo: "dc", nom: "Développé couché", debut: j(81), kg: 60 },
    ]),
    { nom: "Squat", kg: 22.5 },
  );
  assert.equal(meilleurGain([{ exo: "x", nom: "X", debut: 1, kg: 40 }]), null);
  assert.equal(meilleurGain([]), null);
});
