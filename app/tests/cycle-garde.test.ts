// Garde-fous du suivi du cycle : seuls le modèle, ses données, la migration et la synchro touchent cycle_jour ; inclus dans
// l'export et la sauvegarde ; aucun mot de soin, de fertilité ou de diagnostic, jamais « ~ » ; mêmes clés en fr et en en ;
// la Précision pepfit montre le facteur « Cycle » de la Récupération seulement si le suivi est allumé.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fr } from "../src/i18n/dico-fr/cycle.ts";
import { en } from "../src/i18n/dico-en/cycle.ts";
import { TABLES_SYNC } from "../src/sync/schema.ts";
import { baseDeTest } from "./aide.ts";
import { exporterJson } from "../src/sync/export.ts";
import type { DonneesPrecision } from "../src/precision/modele.ts";
import { noterRegles } from "../src/cycle/donnees.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const fichiers = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? fichiers(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

test("seuls le modèle, ses données, la migration, la synchro et le vidage du téléphone (TABLES_PERSONNELLES) touchent cycle_jour", () => {
  const lisent = fichiers(SRC)
    .filter((p) => readFileSync(p, "utf8").includes("cycle_jour"))
    .map((p) => p.slice(SRC.length))
    .sort();
  assert.deepEqual(lisent, ["cycle/donnees.ts", "cycle/modele.ts", "db/migrations.ts", "sync/moteur.ts", "sync/schema.ts"]);
});

test("export et sauvegarde : les jours du cycle en font partie (ce sont les données de la personne)", async () => {
  const { db } = await baseDeTest();
  await ecrireReglage(db, "sexe", "f");
  await noterRegles(db, { debut: "2026-10-12", fin: "2026-10-13", flux: 2 }, new Date(2026, 9, 30).getTime());
  const x = JSON.parse(await exporterJson(db)) as { tables: Record<string, unknown[]> };
  assert.equal(x.tables.cycle_jour?.length, 2);
  assert.ok(TABLES_SYNC.some((t) => t.nom === "cycle_jour"));
});

test("textes : mêmes clés en fr et en en, aucun mot de soin, de fertilité ou de diagnostic, jamais « ~ »", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  const tout = JSON.stringify([fr, en]);
  assert.ok(!tout.includes("~"));
  assert.doesNotMatch(
    tout,
    /m[ée]dic|maladie|ovulation|fertil|contracep|grossesse|enceinte|sympt[oô]me|diagnost|syndrome|anormal|irr[ée]gulier|retard|pregnan|fertility|symptom|medical|irregular|late period/i,
  );
  // « estimation » accompagne toujours la date des prochaines règles
  assert.match(fr["cycle.legende.estimation"], /estimation/);
  assert.match(fr["cycle.tiroir.3"], /Une estimation, pas une méthode/);
  assert.equal(fr["cycle.phase.premiere"], "Première moitié du cycle");
  assert.equal(fr["cycle.phase.seconde"], "Seconde moitié du cycle");
});

test("écrans du cycle : aucun texte en dur, aucun sélecteur natif, pas de « ~ »", () => {
  for (const p of fichiers(join(SRC, "ecrans/cycle")).concat([join(SRC, "app/settings/cycle.tsx")])) {
    const s = readFileSync(p, "utf8");
    assert.doesNotMatch(s, /@react-native-picker|<Picker|DateTimePicker|<Switch\b/, `${p} : pas de sélecteur natif`);
    assert.ok(!/"[^"]*~[^"]*"/.test(s), `${p} : pas de « ~ »`);
  }
});

test("Précision pepfit : le facteur « Cycle » de la Récupération, seulement si le suivi est allumé", async () => {
  const { facteursCalcul } = await import("../src/precision/vue.ts");
  const vide: DonneesPrecision = {
    naissance: null, sexe: false, taille: false, poidsJours: null, semainesPesees: 0, tourJours: null, navyJours: null, grasSource: null, grasJours: null,
    capteur: null, nuits14: 0, pas14: 0, fcSeances28: 0, fcMax: "defaut", vma: null,
    semainesActives: 0, seances8: 0, muscu8: null, choixReco: 0, nut30: 0, nut60: 0, nut28: 0, objectifPoids: false, semainesHistorique: 0,
  };
  const avecCycle = (cycle: "ajuste" | "attente" | null): DonneesPrecision => ({ ...vide, recup: { precision: 80, jours: 0, parts: 3, cycle } });
  assert.ok(!facteursCalcul("recup", avecCycle(null)).some((f) => f.cle === "cycle"));
  const f = facteursCalcul("recup", avecCycle("ajuste")).at(-1)!;
  assert.deepEqual([f.cle, f.ok, f.valeur], ["cycle", true, "comparée à la même phase"]);
  assert.equal(facteursCalcul("recup", avecCycle("attente")).at(-1)!.ok, false);
  assert.ok(!facteursCalcul("sommeil", avecCycle("ajuste")).some((x) => x.cle === "cycle"));
});
