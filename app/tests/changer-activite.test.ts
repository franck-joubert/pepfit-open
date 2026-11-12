// Changer d'activité : ce qui s'écrit (remplacer, poser, marquer), ce qui reste (exercices, séries, tracé, FC), ce qui suit
// le sport (titre, famille, effort estimé, dépense estimée, VMA, allure ou vitesse).
import assert from "node:assert/strict";
import { test } from "node:test";
import { familleSeance, planChangement, type Activite, type SeanceAChanger } from "../src/ecrans/changer-activite.ts";

const A = (slug: string, nom: string, categorie: string): Activite => ({ id: `cat:${slug}`, slug, nom, categorie });
const PADEL = A("padel", "Padel", "Sport de raquette");
const TENNIS = A("tennis", "Tennis", "Sport de raquette");
const COURSE = A("course", "Course à pied", "Cardio");
const VELO = A("bicycling", "Vélo", "Cardio");
const CROSS = A("cross-training", "Cross training", "Fitness");
const MUSCU = A("musculation", "Musculation", "Fitness");

const base: SeanceAChanger = {
  activite: null, exercices: [], titre: null, trace: false, distanceM: 0, fc: false, vmaEstimee: false,
};

test("activité détectée (aucun exercice) : l'activité est posée, le titre devient le sport, la famille suit", () => {
  const c = planChangement({ ...base, fc: true }, PADEL);
  assert.deepEqual(c.ecriture, { genre: "poser", activite: "cat:padel" });
  assert.equal(c.titre, "Padel");
  assert.equal(c.famille, "padel");
  assert.deepEqual(c.effort, { genre: "fc" });
  assert.equal(c.depense, "fc");
});

test("séance Whoop « Tennis » qui était du padel : l'activité est remplacée, effort et kcal (à la FC de Whoop) inchangés", () => {
  const c = planChangement({ ...base, activite: TENNIS, titre: "Tennis", fc: true }, PADEL);
  assert.deepEqual(c.effort, { genre: "fc" }, "l'Effort par la FC de Whoop ne dépend pas du sport");
  assert.deepEqual(c.ecriture, { genre: "remplacer", de: "cat:tennis", vers: "cat:padel" });
  assert.equal(c.titre, "Padel");
  assert.equal(c.depense, "fc");
  assert.equal(c.inchange, false);
  assert.equal(planChangement({ ...base, activite: PADEL }, PADEL).inchange, true);
});

test("séance de muscu changée en Cross training : ses exercices et séries restent, la séance porte le sport, « Push A » reste", () => {
  const s: SeanceAChanger = {
    ...base,
    titre: "Push A",
    exercices: [
      { id: "e1", slug: "developpe-couche", categorie: "Force", perso: 0, series: 4 },
      { id: "e2", slug: "dips", categorie: "Force", perso: 0, series: 3 },
    ],
  };
  assert.equal(familleSeance(s), "muscu");
  const c = planChangement(s, CROSS);
  assert.deepEqual(c.ecriture, { genre: "marquer", activite: "cat:cross-training" });
  assert.equal(c.titre, null);
  assert.deepEqual(c.garde, { exercices: 2, series: 7, trace: false, fc: false });
  // sans FC : l'effort estimé suit le barème du sport, en points par minute (2,5 en muscu → 3 en cross training)
  assert.deepEqual(c.effort, { genre: "estime", de: 2.5, vers: 3 });
  assert.equal(c.depense, "estimee");
  // revenir à Musculation retire la marque : le sport redevient celui des exercices
  assert.deepEqual(planChangement({ ...s, activite: CROSS }, MUSCU).ecriture, { genre: "marquer", activite: null });
});

test("course GPS changée en vélo : le tracé reste, l'allure devient une vitesse, la VMA estimée de cette course est retirée", () => {
  const s: SeanceAChanger = { ...base, activite: COURSE, titre: "Course à pied", trace: true, distanceM: 21_400, fc: true, vmaEstimee: true };
  const c = planChangement(s, VELO);
  assert.deepEqual(c.ecriture, { genre: "remplacer", de: "cat:course", vers: "cat:bicycling" });
  assert.equal(c.garde.trace, true);
  assert.equal(c.lecture, "vitesse");
  assert.equal(c.vma, "retirer");
  assert.equal(c.titre, "Vélo");
});

test("vélo GPS qui était une course : la VMA est calculée, la vitesse redevient une allure ; sans tracé, pas de VMA", () => {
  const s: SeanceAChanger = { ...base, activite: VELO, titre: "Sortie du dimanche", trace: true, distanceM: 9_800, fc: true };
  const c = planChangement(s, COURSE);
  assert.equal(c.vma, "calculer");
  assert.equal(c.lecture, "allure");
  assert.equal(c.titre, null);
  assert.equal(planChangement({ ...s, trace: false }, COURSE).vma, null);
});

test("séance du lanceur sans FC : l'effort estimé et la dépense suivent le sport", () => {
  const c = planChangement({ ...base, activite: TENNIS, titre: "Tennis" }, A("yoga", "Yoga", "Étirements"));
  assert.deepEqual(c.effort, { genre: "estime", de: 2.6, vers: 0.6 });
  assert.equal(c.depense, "estimee");
  assert.equal(c.famille, "autre");
});
