// « Batterie non restreinte » au bon moment : objet connecté, première séance avec GPS ou FC, coupure du journal ; une fois
// par moment, refus mémorisé, jamais si pepfit est déjà exempté ; étapes Samsung, liste Android ou fiche de repli.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  apresFeuille,
  casBatterie,
  coupureDerniereSeance,
  ETAPES_BATTERIE,
  lireMoments,
  noterVu,
  proposerBatterie,
  type EtatMoments,
} from "../src/ecrans/batterie.ts";
import { t } from "../src/i18n/index.ts";

const b = { optimisee: true, dejaProposee: false, samsung: true };
const neuf: EtatMoments = { vus: [], refus: false };

test("proposée à chaque moment, une fois : objet, séance, coupure", () => {
  for (const m of ["objet", "seance", "coupure"] as const) {
    assert.equal(proposerBatterie(b, neuf, m), true, m);
    assert.equal(proposerBatterie(b, noterVu(neuf, m), m), false, m);
  }
  // un moment vu n'empêche pas les autres
  assert.equal(proposerBatterie(b, noterVu(neuf, "objet"), "seance"), true);
  // noterVu ne double pas
  assert.deepEqual(noterVu(noterVu(neuf, "objet"), "objet").vus, ["objet"]);
});

test("jamais si pepfit est exempté, sans module (iPhone, ancien APK), après un refus, ni deux fois au même lancement", () => {
  assert.equal(proposerBatterie({ ...b, optimisee: false }, neuf, "objet"), false);
  assert.equal(proposerBatterie(null, neuf, "objet"), false);
  assert.equal(proposerBatterie(b, { vus: [], refus: true }, "coupure"), false);
  assert.equal(proposerBatterie(b, neuf, "objet", true), false);
});

test("refus : fermée sans ouvrir les réglages ; ouverte ou réglée, ce n'en est pas un", () => {
  assert.equal(apresFeuille(neuf, { ouverte: false, reglee: false }).refus, true);
  assert.equal(apresFeuille(neuf, { ouverte: true, reglee: false }).refus, false);
  assert.equal(apresFeuille(neuf, { ouverte: false, reglee: true }).refus, false);
});

test("état relu : JSON du réglage, illisible = neuf, ancienne proposition du 30/10 = moment « seance »", () => {
  assert.deepEqual(lireMoments(null), neuf);
  assert.deepEqual(lireMoments("pas du json"), neuf);
  assert.deepEqual(lireMoments(JSON.stringify({ vus: ["objet", "autre"], refus: true })), { vus: ["objet"], refus: true });
  assert.deepEqual(lireMoments(null, true), { vus: ["seance"], refus: false });
  assert.deepEqual(lireMoments(JSON.stringify({ vus: ["seance"], refus: false }), true).vus, ["seance"]);
});

test("coupure : dans la dernière séance du journal, avant sa fin", () => {
  const l = (evenement: string, t = 0) => ({ t, evenement, detail: "" });
  assert.equal(coupureDerniereSeance([]), false);
  assert.equal(coupureDerniereSeance([l("debut"), l("mesures"), l("ecran"), l("fin"), l("deconnexion")]), false);
  assert.equal(coupureDerniereSeance([l("debut"), l("mesures"), l("silence"), l("reprise"), l("fin")]), true);
  assert.equal(coupureDerniereSeance([l("debut"), l("relance_systeme")]), true);
  // la coupure d'une séance plus ancienne ne compte plus
  assert.equal(coupureDerniereSeance([l("debut"), l("deconnexion"), l("fin"), l("debut"), l("mesures"), l("fin")]), false);
  // aucun capteur trouvé : pas une coupure
  assert.equal(coupureDerniereSeance([l("debut"), l("recherche_vaine"), l("fin")]), false);
});

test("étapes : Samsung jusqu'aux listes de veille, liste Android, fiche de repli ; textes du lexique", () => {
  assert.equal(casBatterie(b), "samsung");
  assert.equal(casBatterie({ ...b, samsung: false }), "liste");
  assert.equal(casBatterie({ ...b, samsung: false }, "fiche"), "fiche");
  assert.equal(casBatterie(null), "liste");
  assert.deepEqual(ETAPES_BATTERIE.samsung.map((e) => t(e.titre)), ["Batterie", "Non restreinte", "Applications en veille"]);
  for (const e of Object.values(ETAPES_BATTERIE).flat()) {
    assert.ok(t(e.titre) !== e.titre, e.titre);
    assert.ok(e.sous && t(e.sous) !== e.sous, e.titre);
  }
});
