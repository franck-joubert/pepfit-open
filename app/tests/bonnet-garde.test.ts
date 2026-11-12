// Garde-fous du tour de dos et du bonnet : seuls le module pur, le dépôt, la page Poitrine, le parcours, la
// feuille, le lecteur du personnage (morphologie.ts, calcul B) et l'exclusion des jours de Santé y touchent ; inclus
// dans l'export (ce sont les données de la personne) ; mêmes clés en fr et en en ; ni « ~ », ni sélecteur natif.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fr } from "../src/i18n/dico-fr/bonnet.ts";
import { en } from "../src/i18n/dico-en/bonnet.ts";
import { exporterJson } from "../src/sync/export.ts";
import { ecrireSoutien } from "../src/db/depots/profil.ts";
import { baseDeTest } from "./aide.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const fichiers = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? fichiers(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
const TOUCHE = /["'](bonnet|tour_dos)["']|lireSoutien|ecrireSoutien|effacerSoutien|soutienDe\b|bonnetPourMorphologie|FeuilleBonnet|bonnet-calc/;

test("la liste fermée des fichiers qui y touchent", () => {
  const touchent = fichiers(SRC)
    .filter((p) => TOUCHE.test(readFileSync(p, "utf8")))
    .map((p) => p.slice(SRC.length))
    .sort();
  assert.deepEqual(touchent, [
    "db/depots/profil.ts",
    "ecrans/mesures/FeuilleBonnet.tsx",
    "ecrans/mesures/PageTour.tsx",
    "ecrans/mesures/Parcours.tsx",
    "ecrans/mesures/bonnet-calc.ts",
    "ecrans/morphologie-calc.ts",
    "ecrans/morphologie.ts",
    "ecrans/sante-jours.ts",
  ]);
});

test("export : la saisie en fait partie (ce sont les données de la personne)", async () => {
  const { db } = await baseDeTest();
  await ecrireSoutien(db, { bonnet: 3, tourDos: 70 });
  const x = JSON.parse(await exporterJson(db)) as { tables: Record<string, { type: string }[]> };
  assert.deepEqual(x.tables.mensurations?.map((l) => l.type).sort(), ["bonnet", "tour_dos"]);
});

test("textes : mêmes clés en fr et en en, libellés D14, jamais « ~ »", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  assert.ok(!JSON.stringify([fr, en]).includes("~"));
  assert.equal(fr["bonnet.pasDePoitrine"], "Pas de poitrine ou très petite");
  assert.equal(fr["bonnet.tresPetite"], "Très petite ou aucune");
  assert.equal(fr["bonnet.note"], "Sert seulement au dessin du personnage.");
  assert.equal(fr["bonnet.garde"], "Gardé avec tes mensurations, sur ton téléphone.");
  assert.equal(fr["bonnet.explication"], "Tailles françaises : 85 B, c'est un tour de dos de 85 et un bonnet B.");
});

test("feuille : aucun texte en dur, aucun sélecteur natif, cibles de 44 dp", () => {
  const s = readFileSync(join(SRC, "ecrans/mesures/FeuilleBonnet.tsx"), "utf8");
  assert.doesNotMatch(s, /@react-native-picker|<Picker|DateTimePicker|<Switch\b/);
  assert.ok(!/"[^"]*~[^"]*"/.test(s));
  assert.match(s, /puce: \{[^}]*minHeight: 44/);
  assert.match(readFileSync(join(SRC, "ecrans/mesures/Parcours.tsx"), "utf8"), /ligneBonnet: \{[^}]*minHeight: 44/);
});
