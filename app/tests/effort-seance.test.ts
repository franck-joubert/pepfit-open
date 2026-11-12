// Effort en séance (planche programmes-charges, variante B validée le 29/10) : poids de départ dans les cases, note d'effort
// en haut, exercice à découvrir (barre à vide, puis essais), poids proposé à la séance suivante, mots de l'effort.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Programme } from "../src/boutique/modele.ts";
import { rpeDeRir } from "../src/boutique/poids.ts";
import { demarrerPlan } from "../src/db/depots/plans.ts";
import { demarrerSeanceDepuisRoutine, lireSeance } from "../src/db/depots/seances.ts";
import type { EffortExercice } from "../src/db/depots/effort.ts";
import { choixEffort, ligneEssai, ligneProposition, motSousReps } from "../src/ecrans/effort-seance.ts";
import { definirActif } from "../src/i18n/index.ts";
import { baseDeTest } from "./aide.ts";

const HB = JSON.parse(readFileSync(new URL("../assets/catalogue/programmes/hb.json", import.meta.url), "utf8")) as Programme;
definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });

const cible = { reps: 10, repsMax: 12, rir: 2 };
const ef = (p: Partial<EffortExercice>): EffortExercice => ({ cible, decouverte: false, proposition: null, ...p });
const nbsp = (s: string | undefined) => s?.replace(/[  ]/g, " ");

test("ligne du poids proposé : la raison, tant qu'aucune série n'est cochée", () => {
  const haut = ef({ proposition: { kg: 62.5, avant: 60, sens: 1, raison: "haut" } });
  assert.deepEqual({ ...ligneProposition(haut, [{ faite: 0, kg: 62.5 }], "kg"), texte: nbsp(ligneProposition(haut, [{ faite: 0, kg: 62.5 }], "kg")!.texte) }, {
    icone: "hautFleche",
    texte: "+ 2,5 kg : 12 répétitions à toutes les séries la dernière fois.",
  });
  assert.equal(ligneProposition(haut, [{ faite: 1, kg: 62.5 }], "kg"), null);
  assert.equal(nbsp(ligneProposition(ef({ proposition: { kg: 57.5, avant: 60, sens: -1, raison: "rate" } }), [], "kg")!.texte), "− 2,5 kg : moins de 10 répétitions la dernière fois.");
  assert.equal(ligneProposition(ef({ proposition: { kg: 60, avant: 60, sens: 0, raison: "dur" } }), [], "kg")!.texte, "Même poids : c'était dur la dernière fois.");
  assert.equal(ligneProposition(ef({ proposition: { kg: 60, avant: 60, sens: 0, raison: "garde" } }), [], "kg")!.texte, "Même poids : vise 12 répétitions à toutes les séries.");
  assert.equal(ligneProposition(ef({}), [], "kg"), null);
});

test("ligne d'essai d'un exercice à découvrir : sous la dernière série cochée dont l'effort est dit", () => {
  const d = ef({ decouverte: true, cible: { reps: 8, repsMax: null, rir: 2 } });
  const s = (id: string, kg: number, rir: number | null, faite = 1) => ({ id, faite, kg, reps: 8, rpe: rir == null ? null : rpeDeRir(rir), type: "normale" as const });
  // « Facile » à 20 kg : on monte de 25 %.
  const l = ligneEssai(d, [s("a", 20, 3), s("b", 20, null, 0)], "barre", "kg")!;
  assert.deepEqual({ ...l, texte: nbsp(l.texte) }, { apres: "a", icone: "hautFleche", texte: "Encore facile : essaie 25 kg." });
  // « Bien » au poids visé : trouvé.
  const t2 = ligneEssai(d, [s("a", 20, 3), s("b", 30, 2)], "barre", "kg")!;
  assert.equal(t2.apres, "b");
  assert.equal(t2.ok, true);
  assert.equal(nbsp(t2.texte), "C'est ton poids : 30 kg. La séance suivante part de là.");
  // Pas d'effort dit, ou exercice déjà connu : pas de ligne.
  assert.equal(ligneEssai(d, [s("a", 20, null)], "barre", "kg"), null);
  assert.equal(ligneEssai(ef({}), [s("a", 20, 3)], "barre", "kg"), null);
});

test("mots de l'effort : sous les répétitions d'une série cochée, et les quatre choix avec celui de la cible", () => {
  assert.equal(motSousReps({ faite: 1, rpe: 9 }), "dur");
  assert.equal(motSousReps({ faite: 1, rpe: 6 }), "facile");
  assert.equal(motSousReps({ faite: 0, rpe: 9 }), undefined);
  assert.equal(motSousReps({ faite: 1, rpe: null }), undefined);
  assert.deepEqual(choixEffort(2).map((c) => [c.libelle, c.sous, c.vise]), [["Max", "plus rien", false], ["Dur", "encore 1", false], ["Bien", "encore 2", true], ["Facile", "3 ou plus", false]]);
  assert.equal(choixEffort(null).some((c) => c.vise), false);
});

test("programme démarré : poids de départ dans les cases, note d'effort en haut, barre à vide pour un exercice inconnu, poids proposé ensuite", async () => {
  const { db, raw } = await baseDeTest(true);
  // Historique : développé couché 85 × 5 il y a 20 jours (poids de départ 77,5 kg, calculé par chargesDuPlan) ; militaire jamais fait.
  const ilYa = Date.now() - 20 * 86_400_000;
  raw.exec(`INSERT INTO seances (id, debut, fin, maj_le) VALUES ('h1', ${ilYa}, ${ilYa + 3600_000}, 1);
    INSERT INTO series (id, seance_id, exercice_id, position, type, kg, reps, faite, volume) VALUES ('h1a', 'h1', 'cat:couche', 0, 'normale', 85, 5, 1, 0);`);
  await demarrerPlan(db, HB, { jours: [0, 1, 3, 4], longue: null, debut: "2026-11-02", heure: "18:00" }, { couche: 77.5 }, "fr");
  const routines = raw.prepare("SELECT r.id, r.note FROM routines r WHERE r.plan_id IS NOT NULL AND r.nom = 'Haut lourd'").all() as { id: string; note: string }[];
  const kgCouche = (id: string) => (raw.prepare("SELECT rs.kg FROM routine_series rs JOIN routine_exercices re ON re.id = rs.ligne_id WHERE re.routine_id = ? AND re.exercice_id = 'cat:couche' AND rs.rang = 0").get(id) as { kg: number | null }).kg;
  const premiere = routines.find((r) => kgCouche(r.id) === 77.5)!;
  const suivante = routines.find((r) => kgCouche(r.id) == null)!;
  assert.match(premiere.note, /Effort : arrête chaque série quand tu pourrais encore en faire 2\./);
  assert.equal((raw.prepare("SELECT rir FROM routine_exercices WHERE routine_id = ? AND exercice_id = 'cat:couche'").get(premiere.id) as { rir: number }).rir, 2);

  // Première séance : 77,5 kg dans les cases, « Précédent » 85 × 5 ; militaire : la barre à vide sur la première série.
  const s1 = await demarrerSeanceDepuisRoutine(db, premiere.id);
  const l1 = (await lireSeance(db, s1))!;
  assert.match(l1.routineNote!, /^Effort : /);
  const couche = l1.exercices.find((e) => e.exercice.id === "cat:couche")!;
  assert.deepEqual(couche.series.map((x) => x.kg), [77.5, 77.5, 77.5, 77.5]);
  assert.equal(couche.series[0]!.precedent_kg, 85);
  assert.equal(couche.effort!.decouverte, false);
  const militaire = l1.exercices.find((e) => e.exercice.id === "cat:standing-military-press")!;
  assert.equal(militaire.effort!.decouverte, true);
  assert.deepEqual(militaire.series.map((x) => x.kg), [20, null, null]);
  // Tractions (poids du corps) : une cible d'effort, mais ni poids à chercher ni poids proposé.
  const tractions = l1.exercices.find((e) => e.exercice.id === "cat:pullups")!;
  assert.deepEqual(tractions.effort, { cible: { reps: 6, repsMax: 10, rir: 2 }, decouverte: false, proposition: null });

  // On fait la séance : 4 × 6 à 77,5 kg au développé couché ; la séance se termine.
  for (const x of couche.series) raw.prepare("UPDATE series SET reps = 6, faite = 1 WHERE id = ?").run(x.id);
  raw.prepare("UPDATE seances SET debut = ?, fin = ? WHERE id = ?").run(Date.now() - 2 * 86_400_000, Date.now() - 2 * 86_400_000 + 3600_000, s1);

  // Séance suivante : + 2,5 kg proposé dans les cases, et sa raison.
  const s2 = await demarrerSeanceDepuisRoutine(db, suivante.id);
  const c2 = (await lireSeance(db, s2))!.exercices.find((e) => e.exercice.id === "cat:couche")!;
  assert.deepEqual(c2.series.map((x) => x.kg), [80, 80, 80, 80]);
  assert.deepEqual(c2.effort!.proposition, { kg: 80, avant: 77.5, sens: 1, raison: "haut" });
});
