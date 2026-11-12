// Applis qui écrivent dans Santé Connect (carte Capteurs de la page Effort) : noms lisibles, une seule lecture gardée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FENETRE_APPLIS_MS, lireApplisSante, nomsApplis, oublierApplisSante, VIE_APPLIS_MS } from "../src/ecrans/applis-sante.ts";
import { fabriquerSante, PERMISSIONS, type NatifSante } from "../src/natif/sante/logique.ts";

const T = 1_800_000_000_000;

test("noms lisibles : Whoop en tête, sans doublon, sans pepfit ni Fonte, marque tirée du paquet pour une appli inconnue", () => {
  assert.deepEqual(
    nomsApplis(["com.withings.wiscale2", "fit.pep", "com.whoop.android", "com.sec.android.app.shealth", "com.google.android.apps.fitness", "us.lug.fonte", "com.whoop.android"]),
    ["Whoop", "Withings", "Samsung Health", "Fit"],
  );
  assert.deepEqual(nomsApplis(["com.nouvelle.appli", ""]), ["Nouvelle"]);
  assert.deepEqual(nomsApplis([]), []);
});

test("une seule lecture pour toutes les ouvertures de la page dans les 10 min, relue ensuite", async () => {
  oublierApplisSante();
  let n = 0;
  const sante = { originesDonnees: async (d: number, f: number) => (n++, assert.equal(f - d, FENETRE_APPLIS_MS), ["com.whoop.android", "com.withings.wiscale2"]) };
  const [a, b] = await Promise.all([lireApplisSante(sante, T), lireApplisSante(sante, T + 1000)]);
  assert.deepEqual([a, b], [["Whoop", "Withings"], ["Whoop", "Withings"]]);
  await lireApplisSante(sante, T + VIE_APPLIS_MS - 1);
  assert.equal(n, 1);
  await lireApplisSante(sante, T + VIE_APPLIS_MS + 1);
  assert.equal(n, 2);
});

test("lecture en échec : aucune appli, et l'échec n'est pas gardé", async () => {
  oublierApplisSante();
  let n = 0;
  const sante = { originesDonnees: async () => (n++ === 0 ? Promise.reject(new Error("délai")) : ["com.whoop.android"]) };
  assert.deepEqual(await lireApplisSante(sante, T), []);
  assert.deepEqual(await lireApplisSante(sante, T + 1), ["Whoop"]);
  oublierApplisSante();
  assert.deepEqual(await lireApplisSante({}, T), []);
});

/** Natif simulé : seules les lectures dont l'autorisation est accordée doivent être demandées, en UN appel. */
function simule(accordees: string[], avecOrigines = true) {
  const appels: string[][] = [];
  const natif: NatifSante = {
    statut: async () => 3,
    autorisees: async () => accordees,
    demander: async () => accordees,
    poids: async () => [], pas: async () => [], sommeil: async () => [], frequenceRepos: async () => [], exporter: async () => {},
    mesures: async () => [], seancesSport: async () => [], kcalActives: async () => [], installees: async () => [], ouvrir: async () => {},
    originesPas: async () => ["com.withings.wiscale2"],
    ...(avecOrigines ? { origines: async (_d: number, _f: number, types: string[]) => (appels.push(types), ["com.whoop.android"]) } : {}),
  };
  return { appels, sante: fabriquerSante(natif, () => T) };
}

test("originesDonnees : une lecture, seulement les types autorisés ; aucune autorisation : null", async () => {
  const { appels, sante } = simule([PERMISSIONS.pas, PERMISSIONS.sommeil, PERMISSIONS["fc-montre"]]);
  assert.deepEqual(await sante.originesDonnees!(T - 1000, T), ["com.whoop.android"]);
  assert.deepEqual(appels, [["pas", "fc", "sommeil"]]);
  const sans = simule([PERMISSIONS.poids]);
  assert.equal(await sans.sante.originesDonnees!(T - 1000, T), null);
  assert.deepEqual(sans.appels, []);
  assert.equal(await fabriquerSante(null).originesDonnees!(T - 1000, T), null);
});

test("originesDonnees : un module natif ancien ne rend que les applis des pas", async () => {
  const { sante } = simule([PERMISSIONS.pas, PERMISSIONS.sommeil], false);
  assert.deepEqual(await sante.originesDonnees!(T - 1000, T), ["com.withings.wiscale2"]);
  const sansPas = simule([PERMISSIONS.sommeil], false);
  assert.deepEqual(await sansPas.sante.originesDonnees!(T - 1000, T), []);
});
