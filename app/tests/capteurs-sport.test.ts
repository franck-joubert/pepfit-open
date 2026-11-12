import { test } from "node:test";
import assert from "node:assert/strict";
import { etatBle, MUET_MS, rondsCapteurs, type EntreeCapteurs } from "../src/ecrans/capteurs-sport";

const T = 1_800_000_000_000;
const base: EntreeCapteurs = { whoop: { connecte: false, derniereSynchro: null }, sante: { disponible: false, autorise: false }, fc: null, maintenant: T };

test("aucun capteur relié : aucun rond (pas de carte)", () => {
  assert.deepEqual(rondsCapteurs(base), []);
  // Santé Connect présent mais pas autorisé : pas relié
  assert.deepEqual(rondsCapteurs({ ...base, sante: { disponible: true, autorise: false } }), []);
});

test("Whoop reliée, synchro récente : rond vert avec l'heure de synchro", () => {
  const r = rondsCapteurs({ ...base, whoop: { connecte: true, derniereSynchro: T - 60_000 } });
  assert.deepEqual(r, [{ id: "whoop", nom: "Whoop", etat: "relie", bpm: null, synchro: T - 60_000, applis: [] }]);
});

test("Whoop muette (plus de 24 h) ou déliée après une synchro : à reconnecter ; jamais synchronisée et déliée : rien", () => {
  assert.equal(rondsCapteurs({ ...base, whoop: { connecte: true, derniereSynchro: T - MUET_MS - 1 } })[0]!.etat, "revoir");
  assert.equal(rondsCapteurs({ ...base, whoop: { connecte: false, derniereSynchro: T - 3600_000 } })[0]!.etat, "revoir");
  assert.deepEqual(rondsCapteurs({ ...base, whoop: { connecte: false, derniereSynchro: null } }), []);
  // Reliée sans synchro encore : reliée
  assert.equal(rondsCapteurs({ ...base, whoop: { connecte: true, derniereSynchro: null } })[0]!.etat, "relie");
});

test("FC en direct : la Whoop qui diffuse va dans son rond, une ceinture a le sien", () => {
  const w = rondsCapteurs({ ...base, whoop: { connecte: true, derniereSynchro: T }, fc: { etat: "connecte", bpm: 64, appareil: "WHOOP 4A1B2C" } });
  assert.deepEqual(w.map((x) => [x.id, x.etat, x.bpm]), [["whoop", "direct", 64]]);
  const c = rondsCapteurs({ ...base, whoop: { connecte: true, derniereSynchro: T }, sante: { disponible: true, autorise: true }, fc: { etat: "connecte", bpm: 128, appareil: "Polar H10 7A" } });
  assert.deepEqual(c.map((x) => [x.id, x.etat, x.bpm, x.nom]), [["whoop", "relie", null, "Whoop"], ["sante", "relie", null, null], ["fc", "direct", 128, "Polar H10 7A"]]);
  // Capteur en recherche ou perdu : pas de rond en direct
  assert.deepEqual(rondsCapteurs({ ...base, fc: { etat: "perdu", bpm: 120, appareil: "Polar H10" } }), []);
});

test("Santé Connect : ses applis sont sur la ligne, aucune appli : liste vide (« Aucune donnée »)", () => {
  const r = rondsCapteurs({ ...base, sante: { disponible: true, autorise: true, applis: ["Whoop", "Withings"] } });
  assert.deepEqual(r.map((x) => [x.id, x.nom, x.applis]), [["sante", null, ["Whoop", "Withings"]]]);
  assert.deepEqual(rondsCapteurs({ ...base, sante: { disponible: true, autorise: true } })[0]!.applis, []);
});

test("capteur cardiaque Bluetooth : trouvé, en recherche, aucun ; absent (null) : pas de ligne", () => {
  const sante = { disponible: true, autorise: true, applis: [] };
  const l = (ble: EntreeCapteurs["ble"]) => rondsCapteurs({ ...base, sante, ble }).filter((x) => x.id === "ble").map((x) => [x.nom, x.etat]);
  assert.deepEqual(l({ etat: "trouve", nom: "Polar H10" }), [["Polar H10", "diffuse"]]);
  assert.deepEqual(l({ etat: "cherche" }), [[null, "cherche"]]);
  assert.deepEqual(l({ etat: "aucun" }), [[null, "aucun"]]);
  assert.deepEqual(l(null), []);
  assert.deepEqual(l(undefined), []);
});

test("capteur cardiaque Bluetooth : pas de ligne pendant la FC en direct d'une séance (le capteur y est connecté)", () => {
  const r = rondsCapteurs({ ...base, fc: { etat: "connecte", bpm: 128, appareil: "Polar H10" }, ble: { etat: "trouve", nom: "Polar H10" } });
  assert.deepEqual(r.map((x) => x.id), ["fc"]);
});

test("etatBle : écoute en cours, trouvé, aucun, mémoire de la dernière écoute, rien pendant une séance", () => {
  assert.deepEqual(etatBle("cours", "absente", null, undefined), { etat: "cherche" });
  assert.deepEqual(etatBle("fini", "trouvee", "Whoop", undefined), { etat: "trouve", nom: "Whoop" });
  assert.deepEqual(etatBle("fini", "absente", null, "Whoop"), { etat: "aucun" });
  assert.deepEqual(etatBle("fini", "refus", null, undefined), { etat: "aucun" });
  // un essai du tuto (retour dans pepfit) relance la recherche : « Recherche… »
  assert.deepEqual(etatBle("fini", "recherche", null, null), { etat: "cherche" });
  // carte remontée : la dernière écoute (trouvé, rien) ; jamais écoutée : « Recherche… »
  assert.deepEqual(etatBle("avant", "absente", null, "Polar H10"), { etat: "trouve", nom: "Polar H10" });
  assert.deepEqual(etatBle("avant", "absente", null, null), { etat: "aucun" });
  assert.deepEqual(etatBle("avant", "absente", null, undefined), { etat: "cherche" });
  assert.equal(etatBle("seance", "trouvee", "Whoop", "Whoop"), null);
});
