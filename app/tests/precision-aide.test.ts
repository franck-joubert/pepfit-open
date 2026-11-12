// Tiroir d'un calcul de la précision (docs/PRECISION-AIDE.md) : ce que c'est, pourquoi la note, ce qu'il faut faire, et
// l'ancienneté des mesures datées (test VMA, FC max, pesée, masse grasse, tour de taille).
import assert from "node:assert/strict";
import { test } from "node:test";
import { definirActif, en, fr } from "../src/i18n/index.ts";
import { CALCULS, calculer, qualites, toutesEtapes, type DonneesPrecision } from "../src/precision/modele.ts";
import { aideCalcul, detailEtape, facteursCalcul, texteEtape } from "../src/precision/vue.ts";

definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });

const vide: DonneesPrecision = {
  naissance: null, sexe: false, taille: false, poidsJours: null, semainesPesees: 0, tourJours: null, navyJours: null, grasSource: null, grasJours: null,
  capteur: null, nuits14: 0, pas14: 0, fcSeances28: 0, fcMax: "defaut", vma: null,
  semainesActives: 0, seances8: 0, muscu8: null, choixReco: 0, nut30: 0, nut60: 0, nut28: 0, objectifPoids: false, semainesHistorique: 0,
};
const alex: DonneesPrecision = {
  ...vide, naissance: "date", sexe: true, taille: true, poidsJours: 5, semainesPesees: 3,
  capteur: "sc", nuits14: 6, nuitsAvant: 5, pas14: 13, pasAutorises: true, fcSeances28: 1, fcMax: "age", vma: "gps", court: true,
  semainesActives: 3, seances8: 11, muscu8: 6, choixReco: 2, nut30: 12, nut60: 8, nut28: 11, objectifPoids: true, semainesHistorique: 12,
};
/** le 31/10 : tout est plein, sauf la reconnaissance (rien d'appris, 30 %). */
const sam: DonneesPrecision = {
  ...vide, naissance: "date", sexe: true, taille: true, poidsJours: 1, semainesPesees: 4, tourJours: 10, grasSource: "balance", grasJours: 2,
  capteur: "whoop", nuits14: 14, nuitsAvant: 14, pas14: 14, pasAutorises: true, fcSeances28: 6, fcMax: "mesuree", fcMaxJours: 20, vma: "uth",
  semainesActives: 4, seances8: 20, muscu8: 8, choixReco: 0, nut30: 30, nut60: 30, nut28: 28, objectifPoids: true, semainesHistorique: 30,
};
const plein: DonneesPrecision = { ...sam, choixReco: 9, vma: "test", vmaJours: 10, court: true };
const comptes = { vide, alex, sam, plein };

test("chaque calcul a son « ce que c'est » en fr et en en, et une action ou la phrase de complétude", () => {
  for (const [nom, d] of Object.entries(comptes)) {
    const r = calculer(d);
    for (const c of CALCULS) {
      const a = aideCalcul(c.id, d, r);
      const cle = `precision.aide.quoi.${c.id}` as keyof typeof fr;
      assert.ok(fr[cle] && (en as Record<string, unknown>)[cle], `${c.id} : texte fr et en`);
      assert.equal(a.quoi, fr[cle]);
      assert.ok(a.facteurs.length > 0, `${nom} ${c.id} : facteurs`);
      assert.ok(a.etapes.length > 0 || !!a.fin, `${nom} ${c.id} : une action ou la phrase de fin`);
      assert.ok(a.etapes.length <= 3);
      for (const f of a.facteurs) assert.ok(f.titre && f.valeur && !f.valeur.startsWith("precision."), `${nom} ${c.id} ${f.cle}`);
    }
  }
});

test("reconnaissance à 30 % : ce que c'est, pourquoi, et choisir le sport de tes activités", () => {
  const r = calculer(sam);
  assert.equal(r.p.reco, 30);
  const a = aideCalcul("reco", sam, r);
  assert.match(a.quoi, /apprend à reconnaître tes activités/);
  assert.deepEqual(
    a.facteurs.map((f) => [f.titre, f.valeur, f.ok]),
    [["Choix de sport appris", "0 sur 5", false], ["Séances en 8 semaines", "20 sur 12", true]],
  );
  assert.equal(a.etapes[0]?.id, "reco");
  assert.equal(Math.round(a.etapes[0]!.gain), 70);
  assert.equal(texteEtape("reco"), "Choisis le sport de tes activités détectées");
  assert.equal(a.fin, null);
});

test("au plus haut : la phrase le dit, sans action", () => {
  const a = aideCalcul("sommeil", sam);
  assert.equal(calculer(sam).p.sommeil, 100);
  assert.deepEqual(a.etapes, []);
  assert.equal(a.fin, "Rien à faire : elle est au plus haut. Garde tes habitudes.");
});

test("les actions des tiroirs ne changent pas les prochaines étapes de la page", () => {
  const ids = aideCalcul("zones", alex).etapes.map((e) => e.id);
  assert.ok(ids.includes("fcmax"), "Indique ta FC max dans les zones");
  assert.ok(!toutesEtapes(alex).some((e) => e.id === "fcmax" || e.id === "reco" || e.id === "muscu"));
  assert.equal(texteEtape("fcmax", alex), "Indique ta FC max");
  assert.equal(detailEtape("fcmax", alex), "ta valeur, mesurée lors d'un test d'effort");
});

// ---- Ancienneté des mesures -------------------------------------------------------------------------------------------

const coureur: DonneesPrecision = { ...sam, court: true, vma: "test", vmaJours: 30 };

test("test VMA : récent, il garde sa note ; vieux de 5 ans, elle baisse, le tiroir le dit et propose de le refaire", () => {
  assert.equal(qualites(coureur).vma, 1);
  assert.equal(qualites({ ...coureur, vmaJours: 90 }).vma, 1);
  const vieux: DonneesPrecision = { ...coureur, vma: "vieux", vmaJours: 5 * 365 };
  assert.ok(Math.abs(qualites({ ...coureur, vma: "vieux", vmaJours: 182 }).vma - 0.5) < 1e-9, "moitié à 6 mois");
  assert.ok(qualites(vieux).vma < qualites({ ...coureur, vma: "vieux", vmaJours: 200 }).vma, "progressif");
  assert.equal(qualites(vieux).vma, 0.1);
  assert.ok(calculer(vieux).p.vo2! < calculer(coureur).p.vo2!);

  const a = aideCalcul("vo2", vieux);
  assert.equal(a.facteurs[0]!.valeur, "test, il y a 5 ans");
  assert.equal(a.vieux, "Ton test VMA a 5 ans : refais-le pour retrouver une bonne précision.");
  assert.equal(a.etapes[0]?.id, "vma");
  assert.equal(texteEtape("vma", vieux), "Refais ton test VMA");
  assert.equal(detailEtape("vma", vieux), "ton test a 5 ans, 6 minutes à fond");
  // récent : pas d'alerte, pas de « refais »
  const b = aideCalcul("vo2", coureur);
  assert.equal(b.vieux, null);
  assert.ok(!b.etapes.some((e) => e.id === "vma"));
});

test("FC max mesurée : pleine 6 mois, puis baisse jusqu'à la moitié à un an ; « Mets ta FC max à jour »", () => {
  assert.equal(qualites(sam).fcMax, 1);
  const vieille: DonneesPrecision = { ...sam, fcMaxJours: 330 };
  assert.ok(qualites(vieille).fcMax < 1 && qualites(vieille).fcMax > 0.5);
  assert.ok(calculer(vieille).p.zones! < calculer(sam).p.zones!);
  const a = aideCalcul("zones", vieille);
  assert.equal(a.facteurs[0]!.valeur, "mesurée, il y a 11 mois");
  assert.equal(a.vieux, "Ta FC max mesurée a 11 mois : mets-la à jour pour retrouver une bonne précision.");
  assert.equal(a.etapes[0]?.id, "fcmax");
  assert.equal(texteEtape("fcmax", vieille), "Mets ta FC max à jour");
  assert.equal(aideCalcul("zones", sam).vieux, null);
});

test("pesée et masse grasse : l'ancienneté est dans la ligne du facteur et fait baisser la composition", () => {
  const vieux: DonneesPrecision = { ...sam, poidsJours: 75, semainesPesees: 0, grasJours: 400 };
  assert.ok(calculer(vieux).p.composition! < calculer(sam).p.composition!);
  const f = facteursCalcul("composition", vieux);
  assert.equal(f.find((x) => x.cle === "poids")!.valeur, "il y a 2 mois");
  assert.equal(f.find((x) => x.cle === "gras")!.valeur, "balance, il y a 1 an");
  assert.equal(aideCalcul("composition", vieux).vieux, "Ta masse grasse a 1 an : mesure-la à nouveau pour retrouver une bonne précision.");
  assert.ok(aideCalcul("composition", vieux).etapes.some((e) => e.id === "gras" || e.id === "pesees"));
  assert.equal(facteursCalcul("composition", sam).find((x) => x.cle === "poids")!.valeur, "il y a 1 jour");
});

test("en anglais aussi", () => {
  definirActif({ langue: "en", fuseau: "Europe/Paris", poids: "kg", distance: "km" });
  try {
    const a = aideCalcul("vo2", { ...coureur, vma: "vieux", vmaJours: 5 * 365 });
    assert.equal(a.vieux, "Your MAS test is 5 years old: take it again to get good precision back.");
    assert.equal(a.facteurs[0]!.valeur, "test, 5 years ago");
  } finally {
    definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });
  }
});
