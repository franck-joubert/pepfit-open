// Glisser une séance prévue vers « Supprimer » : même règle que le menu ⋯ (cette séance / toute la série).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { LigneJour } from "../src/ecrans/planif-donnees.ts";
import { demandeChoix, retraitDe } from "../src/ecrans/retrait-ligne.ts";

const lire = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const faite = { genre: "faite", seance: { id: "s1" } } as unknown as LigneJour;
const prevue = (repetee: boolean, manquee = false, origine = "ia") =>
  ({ genre: "prevue", occ: { programmationId: "p1", routineId: "r", date: "2026-11-05", origine: "2026-11-05", heure: "21:00", repetee }, nom: "Padel 2 h", dureeS: 7200, manquee, origine, modifiePar: null, propre: false }) as unknown as LigneJour;

test("une séance faite ou manquée quitte l'historique ou le planning ; une séance à venir passe par « retirer »", () => {
  assert.equal(retraitDe(faite), "passee");
  assert.equal(retraitDe(prevue(true, true)), "passee");
  assert.equal(retraitDe(prevue(false)), "avenir");
  assert.equal(retraitDe(prevue(true)), "avenir");
});

test("le choix « Cette séance / Toute la série » n'est demandé que pour une séance à venir qui se répète", () => {
  assert.equal(demandeChoix(prevue(true)), true);
  assert.equal(demandeChoix(prevue(true, false, "coach")), true);
  assert.equal(demandeChoix(prevue(false)), false);
  assert.equal(demandeChoix(prevue(false, false, "ia")), false);
  assert.equal(demandeChoix(prevue(true, true)), false);
  assert.equal(demandeChoix(faite), false);
});

test("le glissé et le menu ⋯ retirent par la même fonction ; la ligne prévue d'une série se referme pour le choix", () => {
  const plan = lire("ecrans/usePlanif.tsx");
  assert.match(plan, /balayer: \(l: LigneJour\) => \(retraitDe\(l\) === "passee" \? supprimerPassee\(l\) : l\.genre === "prevue" && retirer\(l\)\)/);
  // le ⋯ du récap (planche ajout-seance-v2) annule par les mêmes fonctions : cette séance, ou toute la série
  const recap = lire("ecrans/recap/EcranRecap.tsx");
  assert.match(recap, /annulerSerie\(db, r\.prevue/);
  assert.match(recap, /annulerSeule\(db, r\.prevue/);
  assert.match(lire("ecrans/Planif.tsx"), /choix=\{demandeChoix\(l\)\}/);
  assert.match(lire("ui/GlisserSupprimer.tsx"), /if \(e\.choix\) \{\s*placer\(false\);\s*e\.onSupprimer\(\);\s*return;/);
});
