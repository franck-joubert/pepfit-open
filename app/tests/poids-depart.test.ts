// Poids de départ et effort des programmes (NOTES-CHARGES.md) : 1RM estimé (Epley), conversion aux répétitions et à la
// réserve visées (RIR), arrondi au matériel, historique de 3 mois (l'exercice ou un très proche), poids suivant, cibles
// d'effort du catalogue et poids de départ posés à la première séance seulement.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { calendrierPlan, routinesDuPlan } from "../src/boutique/calculs.ts";
import { validerProgramme, type Programme } from "../src/boutique/modele.ts";
import {
  arrondirMateriel, cran, essaiSuivant, exercicesACharge, FACTEUR_PROCHE, infoExo, noteDecouverte, noteEffort, poidsDepart, poidsPour, poidsSuivant, POURQUOI_LEGER, premierEssai,
  motDeRir, MOTS_EFFORT, rirDeMot, rirDeRpe, rpeDeRir, sontProches, unRM,
  type InfoExo, type SerieHisto,
} from "../src/boutique/poids.ts";
import { historiqueSeries } from "../src/db/depots/plans.ts";
import { natureDuCatalogue } from "../src/db/natures.ts";
import { baseDeTest, catalogue } from "./aide.ts";

const DOSSIER = new URL("../assets/catalogue/programmes/", import.meta.url);
const lus: Programme[] = readdirSync(DOSSIER).map((f) => JSON.parse(readFileSync(new URL(f, DOSSIER), "utf8")) as Programme);
const P = (id: string) => lus.find((p) => p.id === id)!;
const CAT = catalogue().exercices;
const INFOS: ReadonlyMap<string, InfoExo> = new Map(CAT.map((e) => [e.slug, infoExo(e)]));
const A_CHARGE = new Set(CAT.filter((e) => natureDuCatalogue(e) === "poids_reps").map((e) => e.slug));
const proche = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

const JOUR = 86_400_000;
const MAINTENANT = Date.UTC(2026, 9, 29);

test("1RM estimé (Epley) : les répétitions en réserve comptent, au-delà de 15 répétitions rien", () => {
  proche(unRM(100, 5)!, 116.67, 0.01);
  proche(unRM(100, 5, 2)!, 123.33, 0.01);
  assert.equal(unRM(140, 1), 140);
  assert.equal(unRM(50, 16), null);
  assert.equal(unRM(0, 5), null);
  // À 10 répétitions, Epley et Brzycki (36 / (37 − r)) donnent le même 1RM.
  proche(unRM(60, 10)!, (60 * 36) / 27, 0.01);
});

test("poids visé : Epley inversé, proche de la table RPE de Helms et Zourdos (% du 1RM)", () => {
  // Table RTS / Helms 2016 : 1 @ RPE 10 = 100 %, 5 @ RPE 8 = 81 %, 8 @ RPE 8 = 74 %, 3 @ RPE 9 = 89 %, 10 @ RPE 10 = 74 %.
  assert.equal(poidsPour(100, 1, 0), 100);
  proche(poidsPour(100, 5, 2), 81, 1.5);
  proche(poidsPour(100, 8, 2), 74, 2);
  proche(poidsPour(100, 3, 1), 89, 2);
  proche(poidsPour(100, 10, 0), 74, 1.5);
  // Aller-retour : le 1RM d'une série de 8 redonne son poids.
  proche(poidsPour(unRM(80, 8)!, 8, 0), 80, 1e-9);
  assert.equal(rirDeRpe(8), 2);
  assert.equal(rirDeRpe(10), 0);
  assert.equal(rirDeRpe(null), null);
  assert.equal(rpeDeRir(2), 8);
});

test("arrondi au matériel, vers le bas : barre 2,5 kg (20 à vide), haltères 2 kg, kettlebell 4 kg, paliers de l'appareil", () => {
  assert.equal(arrondirMateriel(92.4, "barre"), 90);
  assert.equal(arrondirMateriel(92.5, "barre"), 92.5);
  assert.equal(arrondirMateriel(12, "barre"), 20);
  assert.equal(arrondirMateriel(23.9, "halteres"), 22);
  assert.equal(arrondirMateriel(15, "kettlebell"), 12);
  assert.equal(arrondirMateriel(37, "machine"), 35);
  const paliers = [4.5, 9, 13.5, 18, 22.5, 27, 31.5];
  assert.equal(arrondirMateriel(30, "machine", paliers), 27);
  assert.equal(arrondirMateriel(2, "poulie", paliers), 4.5);
  assert.equal(cran(60, "barre", 1), 62.5);
  assert.equal(cran(20, "barre", -1), 20);
  assert.equal(cran(12, "halteres", 1), 14);
  assert.equal(cran(27, "machine", 1, paliers), 31.5);
});

test("exercices très proches : même geste, même matériel, même muscle", () => {
  assert.ok(sontProches(INFOS.get("couche"), INFOS.get("wide-grip-barbell-bench-press")));
  // Même geste, mais classé triceps (version force athlétique, prise serrée) : pas retenu.
  assert.ok(!sontProches(INFOS.get("couche"), INFOS.get("bench-press-powerlifting")));
  assert.ok(sontProches(INFOS.get("squat"), INFOS.get("barbell-full-squat")));
  // Même picto, mais les épaules et pas les pectoraux.
  assert.ok(!sontProches(INFOS.get("incline-dumbbell-press"), INFOS.get("dumbbell-incline-shoulder-raise")));
  assert.equal(INFOS.get("couche")!.materiel, "barre");
  assert.equal(INFOS.get("incline-dumbbell-press")!.materiel, "halteres");
  assert.equal(INFOS.get("leg-press")!.materiel, "machine");
});

const serie = (exo: string, kg: number, reps: number, jours: number, rpe: number | null = null): SerieHisto => ({ exo, kg, reps, rpe, date: MAINTENANT - jours * JOUR });

test("poids de départ : le meilleur 1RM estimé des 3 derniers mois, converti aux répétitions et à l'effort visés", () => {
  const h = [
    serie("couche", 75, 8, 12), // 1RM 95
    serie("couche", 85, 5, 40), // 1RM 99,2 : la meilleure
    serie("couche", 110, 3, 120), // trop vieille
    serie("couche", 60, 20, 5), // trop de répétitions pour estimer
  ];
  const d = poidsDepart("couche", { reps: 6, rir: 2 }, h, INFOS, MAINTENANT);
  // 99,17 / (1 + 8/30) = 78,3 → 77,5 kg à la barre.
  assert.equal(d.kg, 77.5);
  assert.deepEqual(d.source, { exo: "couche", date: MAINTENANT - 40 * JOUR, kg: 85, reps: 5, rpe: null, proche: false });
  // L'effort noté relève l'estimation : 85 × 5 à RPE 8, c'est 7 répétitions possibles.
  assert.equal(poidsDepart("couche", { reps: 6, rir: 2 }, [serie("couche", 85, 5, 40, 8)], INFOS, MAINTENANT).kg, 82.5);
  // Haltères : 26 × 10 à l'échec, 10 répétitions à 2 en réserve : 34,7 / 1,4 = 24,8 → 24 (pas de 2 kg).
  assert.equal(poidsDepart("incline-dumbbell-press", { reps: 10, rir: 2 }, [serie("incline-dumbbell-press", 26, 10, 3)], INFOS, MAINTENANT).kg, 24);
});

test("poids de départ : à défaut, un exercice très proche (× 0,9) ; sans historique, aucun poids inventé", () => {
  const d = poidsDepart("couche", { reps: 6, rir: 2 }, [serie("wide-grip-barbell-bench-press", 100, 5, 10), serie("incline-dumbbell-press", 40, 8, 2)], INFOS, MAINTENANT);
  // 116,67 × 0,9 / (1 + 8/30) = 82,9 → 82,5.
  assert.equal(FACTEUR_PROCHE, 0.9);
  assert.equal(d.kg, 82.5);
  assert.equal(d.source!.exo, "wide-grip-barbell-bench-press");
  assert.equal(d.source!.proche, true);
  assert.deepEqual(poidsDepart("couche", { reps: 6, rir: 2 }, [serie("squat", 120, 5, 3)], INFOS, MAINTENANT), { kg: null, source: null });
  assert.deepEqual(poidsDepart("squat", { reps: 6, rir: 2 }, [], INFOS, MAINTENANT), { kg: null, source: null });
});

test("poids de départ d'une machine : au palier de l'appareil", () => {
  const paliers = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 110, 120];
  // 120 × 10 : 1RM 160 ; 10 répétitions à 2 en réserve : 160 / 1,4 = 114,3 → 110.
  assert.equal(poidsDepart("leg-press", { reps: 10, rir: 2 }, [serie("leg-press", 120, 10, 7)], INFOS, MAINTENANT, paliers).kg, 110);
});

test("haut et bas : tous les exercices à charge ont un poids de départ possible, avec la cible de leur première séance", () => {
  const l = exercicesACharge(P("hb"), (exo) => A_CHARGE.has(exo));
  const exos = l.map((x) => x.exo);
  assert.ok(!exos.includes("pullups") && !exos.includes("plank"));
  for (const e of ["couche", "squat", "bent-over-barbell-row", "leg-press", "incline-dumbbell-press", "triceps-pushdown", "side-lateral-raise"]) assert.ok(exos.includes(e), e);
  assert.deepEqual(l.find((x) => x.exo === "couche"), { exo: "couche", reps: 6, rir: 2, progressionKg: null });
  assert.deepEqual(l.find((x) => x.exo === "side-lateral-raise"), { exo: "side-lateral-raise", reps: 12, rir: 1, progressionKg: null });
  assert.equal(exercicesACharge(P("f5"), (exo) => A_CHARGE.has(exo)).find((x) => x.exo === "sdt")!.progressionKg, 5);
});

test("catalogue : chaque bloc à répétitions des programmes de muscu porte une cible d'effort (0 à 5 en réserve)", () => {
  for (const id of ["fb", "f5", "ppl", "hb", "hal", "padel"]) {
    for (const [k, s] of Object.entries(P(id).seances)) for (const b of s.blocs) if (b.reps != null || b.repsParSerie) assert.ok(b.rir != null && b.rir >= 0 && b.rir <= 5, `${id}.${k}.${b.exo}`);
  }
  // Semaine allégée : plus de marge ; isolation : plus près de l'échec.
  assert.equal(P("hb").seances["hb-haut-lourd-3"]!.blocs[0]!.rir, 3);
  assert.equal(P("ppl").seances["ppl-push-3"]!.blocs.find((b) => b.exo === "side-lateral-raise")!.rir, 1);
  assert.equal(P("kb").seances["kb-test"]!.blocs[0]!.rir, null);
  // Le validateur refuse une réserve hors de 0 à 5, ou sur un bloc sans répétitions.
  const p = structuredClone(P("hb"));
  p.seances["hb-haut-lourd-4"]!.blocs[0]!.rir = 6;
  p.seances["hb-bas-volume-3"]!.blocs[3]!.rir = 1;
  assert.deepEqual(validerProgramme(p).filter((e) => e.endsWith("rir")).length, 2);
});

test("poids suivant : double progression ajustée par l'effort noté", () => {
  const c = { reps: 10, repsMax: 12, rir: 2 };
  const s = (kg: number, reps: number, rir: number | null = null) => ({ kg, reps, rir });
  // Haut de la plage partout : + 2,5 kg.
  assert.deepEqual(poidsSuivant([s(60, 12), s(60, 12), s(60, 12)], c, "barre"), { kg: 62.5, avant: 60, sens: 1, raison: "haut" });
  // Haut de la plage, mais à l'échec alors qu'on visait 2 en réserve : on garde.
  assert.deepEqual(poidsSuivant([s(60, 12, 2), s(60, 12, 1), s(60, 12, 0)], c, "barre"), { kg: 60, avant: 60, sens: 0, raison: "dur" });
  // Dans la plage : même poids, on gagne des répétitions.
  assert.deepEqual(poidsSuivant([s(60, 11), s(60, 10), s(60, 10)], c, "barre"), { kg: 60, avant: 60, sens: 0, raison: "garde" });
  // Beaucoup trop facile (4 en réserve partout) : on monte avant le haut de la plage.
  assert.deepEqual(poidsSuivant([s(20, 10, 4), s(20, 10, 4), s(20, 10, 5)], c, "halteres"), { kg: 22, avant: 20, sens: 1, raison: "facile" });
  // La moitié des séries sous le bas de la plage : un cran de moins.
  assert.deepEqual(poidsSuivant([s(60, 10), s(60, 8), s(60, 7)], c, "barre"), { kg: 57.5, avant: 60, sens: -1, raison: "rate" });
  // Seules les séries au poids de travail comptent (la plus légère est une série de retour au calme).
  assert.deepEqual(poidsSuivant([s(60, 12), s(60, 12), s(40, 6)], c, "barre")!.sens, 1);
  assert.equal(poidsSuivant([], c, "barre"), null);
});

test("plan : le poids de départ d'un exercice sans progression fixe ne va qu'à sa première séance", () => {
  const p = P("hb");
  const { poses } = calendrierPlan(p, { jours: [0, 1, 3, 4], longue: null, debut: "2026-11-02", heure: "18:00" });
  const { routines, dates } = routinesDuPlan(p, poses, { couche: 77.5, squat: 100 });
  const kgCouche = dates
    .map((d) => routines.find((r) => r.cle === d.cle)!)
    .filter((r) => p.seances[r.seance]!.blocs[0]!.exo === "couche")
    .map((r) => r.kg[0]);
  assert.equal(kgCouche[0], 77.5);
  assert.ok(kgCouche.slice(1).every((k) => k == null));
  // Deux routines « Haut lourd » de 4 séries : la première avec ses poids, les suivantes reprennent la séance précédente.
  assert.equal(routines.filter((r) => r.seance === "hb-haut-lourd-4").length, 2);
});

test("historique des séries : 3 mois, séries de travail faites, slug et effort noté", async () => {
  const { db, raw } = await baseDeTest(true);
  raw.exec(`INSERT INTO seances (id, debut, fin, maj_le) VALUES ('s1', 1000, 2000, 1), ('s2', 50000, 60000, 1);
    INSERT INTO series (id, seance_id, exercice_id, position, type, kg, reps, faite, rpe, volume) VALUES
      ('a', 's1', 'cat:squat', 0, 'normale', 100, 5, 1, NULL, 0),
      ('b', 's2', 'cat:squat', 0, 'echauffement', 60, 5, 1, NULL, 0),
      ('c', 's2', 'cat:squat', 1, 'normale', 110, 5, 1, 8, 0),
      ('d', 's2', 'cat:squat', 2, 'normale', 110, 5, 0, NULL, 0),
      ('e', 's2', 'cat:couche', 3, 'normale', 80, NULL, 1, NULL, 0);`);
  assert.deepEqual((await historiqueSeries(db, 10000)).map((x) => ({ ...x })), [{ exo: "squat", kg: 110, reps: 5, rpe: 8, date: 50000 }]);
});

test("première séance sans historique : on part léger et on monte à chaque série jusqu'au poids visé", () => {
  const c = { reps: 6, rir: 2 };
  assert.equal(premierEssai("barre"), 20);
  assert.equal(premierEssai("halteres"), null);
  // Barre à vide, « 3 ou plus » en réserve : on monte, au plus de 25 % (20 → 25).
  assert.deepEqual(essaiSuivant({ kg: 20, reps: 6, rir: 3, auMoins: true }, c, "barre"), { kg: 25, etat: "monte" });
  // 50 kg × 6, 3 en réserve au lieu de 2 : visé 51,3, à moins d'un cran : c'est trouvé.
  assert.deepEqual(essaiSuivant({ kg: 50, reps: 6, rir: 3 }, c, "barre"), { kg: 50, etat: "trouve" });
  // 40 kg × 10 (on en a fait plus que prévu), 3 en réserve : 1RM 57,3, visé 45,3 → 45.
  assert.deepEqual(essaiSuivant({ kg: 40, reps: 10, rir: 3 }, c, "barre"), { kg: 45, etat: "monte" });
  // 60 × 6, 2 en réserve : c'est le poids visé.
  assert.deepEqual(essaiSuivant({ kg: 60, reps: 6, rir: 2 }, c, "barre"), { kg: 60, etat: "trouve" });
  // 60 × 6, 1 en réserve : à moins d'un cran du visé (58,4), on garde.
  assert.deepEqual(essaiSuivant({ kg: 60, reps: 6, rir: 1 }, c, "barre"), { kg: 60, etat: "trouve" });
  // 60 × 6 à fond : 1RM 72, visé 56,8 → on redescend à 55.
  assert.deepEqual(essaiSuivant({ kg: 60, reps: 6, rir: 0 }, c, "barre"), { kg: 55, etat: "baisse" });
  // Moins de répétitions que la cible : on baisse d'au moins un cran.
  assert.equal(essaiSuivant({ kg: 60, reps: 4, rir: 0 }, c, "barre").etat, "baisse");
  // Haltères : 8 kg × 10, « 3 ou plus » : + 2 kg au moins (8 × 1,25 = 10).
  assert.deepEqual(essaiSuivant({ kg: 8, reps: 10, rir: 3, auMoins: true }, { reps: 10, rir: 2 }, "halteres"), { kg: 10, etat: "monte" });
  // Machine : au palier voisin.
  assert.deepEqual(essaiSuivant({ kg: 20, reps: 10, rir: 3, auMoins: true }, { reps: 10, rir: 2 }, "machine", [10, 20, 30, 40]), { kg: 30, etat: "monte" });
});

test("consignes : effort en haut de la séance, départ léger d'un exercice sans historique", () => {
  const hb = P("hb");
  assert.equal(noteEffort(hb.seances["hb-haut-lourd-4"]!, "fr"), "Effort : arrête chaque série quand tu pourrais encore en faire 2.");
  assert.equal(noteEffort(hb.seances["hb-haut-volume-3"]!, "fr"), "Effort : arrête chaque série quand tu pourrais encore en faire 1 ou 2.");
  assert.equal(noteEffort(hb.seances["hb-haut-volume-3"]!, "en"), "Effort: stop each set when you could still do 1 or 2 more.");
  assert.equal(noteEffort(P("hiit").seances[Object.keys(P("hiit").seances)[0]!]!, "fr"), null);
  assert.equal(noteDecouverte(6, 2, "barre", "fr"), "Première fois : commence à la barre à vide (20 kg), puis monte à chaque série jusqu'à faire 6 répétitions en pouvant encore en faire 2.");
  assert.match(noteDecouverte(10, 1, "halteres", "en"), /^First time: start light, then go up each set until you do 10 reps and could still do 1 more\.$/);
  assert.match(POURQUOI_LEGER.fr, /trop lourd, la technique lâche/);
  // Le vocabulaire : jamais « charge ».
  for (const s of [POURQUOI_LEGER.fr, noteDecouverte(6, 2, "barre", "fr"), noteEffort(hb.seances["hb-haut-lourd-4"]!, "fr")!]) assert.doesNotMatch(s, /\bcharges?\b/i);
});

test("effort en mots (variante B) : Max 0, Dur 1, Bien 2, Facile 3 ou plus, aller et retour par series.rpe", () => {
  assert.deepEqual(MOTS_EFFORT.map((m) => rirDeMot(m)), [
    { rir: 0, auMoins: false }, { rir: 1, auMoins: false }, { rir: 2, auMoins: false }, { rir: 3, auMoins: true },
  ]);
  for (const m of MOTS_EFFORT) assert.equal(motDeRir(rirDeRpe(rpeDeRir(rirDeMot(m).rir))), m);
  // Une réserve importée de Hevy (RPE 6 = 4 en réserve, RPE 8,5 = 1,5) se lit en mots.
  assert.equal(motDeRir(rirDeRpe(6)), "facile");
  assert.equal(motDeRir(rirDeRpe(8.5)), "bien");
  assert.equal(motDeRir(null), null);
  // « Facile » pendant les essais d'une première séance : on monte.
  assert.equal(essaiSuivant({ kg: 20, reps: 8, ...rirDeMot("facile") }, { reps: 8, rir: 2 }, "barre").etat, "monte");
  assert.equal(essaiSuivant({ kg: 30, reps: 8, ...rirDeMot("bien") }, { reps: 8, rir: 2 }, "barre").etat, "trouve");
});
