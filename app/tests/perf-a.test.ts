// Perf A (docs/PERF-A.md : M1, M8, M9, M12) : Santé Connect hors du chemin d'affichage. Un natif simulé compte ses appels
// (et peut ne jamais répondre) ; il est branché dans le `sante` de l'appli le temps d'un test.
process.env.TZ = "Europe/Paris";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { BUDGETS } from "./budgets.ts";
import { sante } from "../src/natif/sante/index.ts";
import { fabriquerSante, PERMISSIONS, type NatifSante } from "../src/natif/sante/logique.ts";
import type { Sante } from "../src/natif/sante/types.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { ajouterMesures } from "../src/db/depots/mesures.ts";
import { importerSante, oublierImportSante } from "../src/ecrans/sante-donnees.ts";
import { lireDonneesCorps } from "../src/ecrans/mesures/corps-donnees.ts";
import { lireDonneesCoeur } from "../src/ecrans/mesures/coeur-donnees.ts";
import { cleCharge, dansMemoireCharges, memoireCharge, oublierCharges, retenirCharge } from "../src/ecrans/memoire-charges.ts";
import { compteurEcritures } from "../src/db/exclusif.ts";
import { chargerAccueil, lireAccueilBase } from "../src/ecrans/accueil-donnees.ts";

const H = 3_600_000;
const MAINTENANT = new Date(2026, 9, 31, 9, 0).getTime();
const jamais = new Promise<never>(() => {});
/** Appels Santé Connect de l'Accueil complet, cartes comprises, sur une base neuve (règle commune de l'audit : 10 par écran).
 * Mesuré : 4 (statut, autorisees, pas des 7 jours, habitude heure par heure). L'énergie d'une vraie journée en ajoute (M2). */
// Budgets : tests/budgets.ts (garde-fou, M17), avec la façon de les ajuster.
const BUDGET_ACCUEIL_SC = BUDGETS.natif.accueil;

/** Natif simulé, toutes autorisations accordées (l'historique, facultatif, seulement avec `historique` : sans lui, l'import
 * ne fait pas de reprise) ; `bloque` : aucun appel ne répond jamais ; `appels` : par méthode. */
export function natifCompte(o: { bloque?: boolean; latenceMs?: number; historique?: boolean } = {}) {
  const appels: Record<string, number> = {};
  const accordees = Object.values(PERMISSIONS).filter((p) => o.historique || p !== PERMISSIONS.historique);
  const total = () => Object.values(appels).reduce((a, b) => a + b, 0);
  const rep = <T>(nom: string, v: () => T): Promise<T> => {
    appels[nom] = (appels[nom] ?? 0) + 1;
    if (o.bloque) return jamais;
    return new Promise((ok) => setTimeout(() => ok(v()), o.latenceMs ?? 0));
  };
  const n: NatifSante = {
    statut: () => rep("statut", () => 3),
    autorisees: () => rep("autorisees", () => accordees),
    demander: () => rep("demander", () => accordees),
    poids: () => rep("poids", () => [{ kg: 80.4, date: MAINTENANT - 2 * H, origine: "com.withings.wiscale2" }]),
    pas: (b) => rep("pas", () => b.slice(1).map(() => 500)),
    pasHeures: (a, b) => rep("pasHeures", () => {
      const l: [number, number][] = [];
      for (let t = Math.ceil(a / H) * H; t < b; t += H) l.push([t, 400]);
      return l;
    }),
    sommeil: () => rep("sommeil", () => []),
    frequenceRepos: () => rep("frequenceRepos", () => [{ bpm: 51, date: MAINTENANT - 5 * H, origine: "w" }]),
    exporter: () => rep("exporter", () => undefined),
    mesures: (type) => rep("mesures", () => [{ valeur: type === "vfc" ? 62 : 15, date: MAINTENANT - 4 * H, origine: "com.withings.wiscale2" }]),
    seancesSport: () => rep("seancesSport", () => []),
    kcalActives: (b) => rep("kcalActives", () => b.slice(1).map(() => -1)),
    distance: (b) => rep("distance", () => b.slice(1).map(() => -1)),
    fc: () => rep("fc", () => []),
    installees: (p) => rep("installees", () => p),
    ouvrir: () => rep("ouvrir", () => undefined),
  };
  return { n, appels, total };
}

const origine: Sante = { ...sante };
/** Branche le natif simulé dans le `sante` de l'appli (le même objet que celui des écrans). */
export function brancher(n: NatifSante, delaiMs = 10_000): void {
  Object.assign(sante, fabriquerSante(n, () => MAINTENANT, delaiMs));
}
afterEach(() => {
  Object.assign(sante, origine);
  oublierImportSante();
});

/** `p` résolue en moins de `ms`, sinon échec. */
async function avant<T>(p: Promise<T>, ms: number): Promise<T> {
  let m!: ReturnType<typeof setTimeout>;
  const r = await Promise.race([p, new Promise<never>((_, ko) => (m = setTimeout(() => ko(new Error(`pas de valeur en ${ms} ms`)), ms)))]);
  clearTimeout(m);
  return r;
}

async function baseCorps() {
  const { db } = await baseDeTest();
  for (let i = 0; i < 40; i++) await ajouterPesee(db, 80 + (i % 5) / 10, MAINTENANT - i * 24 * H);
  await ajouterMesures(db, "gras", [{ valeur: 15.2, date: MAINTENANT - 30 * H }]);
  await ajouterMesures(db, "vfc", [{ valeur: 60, date: MAINTENANT - 30 * H }]);
  await ajouterMesures(db, "fc", [{ valeur: 52, date: MAINTENANT - 30 * H }]);
  return db;
}

test("M8 : Santé Connect qui ne répond jamais, Poids, Masse grasse, VFC et FC ont leur valeur en moins de 100 ms, sans appel natif", async () => {
  const db = await baseCorps();
  const { n, total } = natifCompte({ bloque: true });
  brancher(n);
  const corps = await avant(lireDonneesCorps(db, true), 100);
  assert.equal(corps.kg.length, 40);
  assert.equal(corps.gras.length, 1);
  const coeur = await avant(lireDonneesCoeur(db, MAINTENANT), 100);
  assert.deepEqual([coeur.vfc.length, coeur.fc.length], [1, 1]);
  assert.ok(total() <= BUDGETS.natif.avantPremiereValeur, "aucun appel à Santé Connect avant la première valeur");
});

test("M8 : un seul import pour deux pages ouvertes en même temps, rien pendant 5 min, sauf forcé (après une autorisation)", async () => {
  const db = await baseCorps();
  const { n, appels } = natifCompte();
  brancher(n);
  const [a, b] = await Promise.all([importerSante(db, { maintenant: MAINTENANT }), importerSante(db, { maintenant: MAINTENANT })]);
  assert.equal(a, b);
  assert.ok(a > 0, "l'import a apporté du neuf (la page se relit)");
  // 8 types lus une fois (la FC au repos par son propre accès), les pesées une fois ; statut et autorisations une fois (M1) ;
  // les nuits une fois, pour la FC au repos déduite de la FC de nuit (C5, docs/SANS-WHOOP.md)
  assert.deepEqual({ ...appels }, { statut: 1, autorisees: 1, mesures: 7, frequenceRepos: 1, poids: 1, sommeil: 1 });
  assert.equal(await importerSante(db, { maintenant: MAINTENANT + 4 * 60_000 }), 0);
  assert.equal(appels.mesures, 7, "pas de nouvel import avant 5 min");
  await importerSante(db, { maintenant: MAINTENANT + 4 * 60_000, forcer: true });
  assert.equal(appels.mesures, 14);
  await importerSante(db, { maintenant: MAINTENANT + 10 * 60_000 });
  assert.equal(appels.mesures, 21);
});

test("historique accordé : chaque import fait un passage de la reprise (4 tranches), rien de plus pendant 5 min", async () => {
  const db = await baseCorps();
  const { n, appels } = natifCompte({ historique: true });
  brancher(n);
  await importerSante(db, { maintenant: MAINTENANT });
  // import ordinaire (7 + 1 + 1) puis 4 tranches de 9 lectures (7 mesures, FC au repos, pesées)
  assert.deepEqual([appels.mesures, appels.frequenceRepos, appels.poids], [7 + 4 * 7, 1 + 4, 1 + 4]);
  assert.equal(await importerSante(db, { maintenant: MAINTENANT + 4 * 60_000 }), 0);
  assert.equal(appels.mesures, 35, "pas de nouveau passage avant 5 min");
});

test("M12 : la dernière valeur d'un écran est gardée ; fraîche 30 s, tant que la base n'est pas écrite", async () => {
  oublierCharges();
  const { db } = await baseDeTest();
  const t = 1_000_000;
  const cle = cleCharge("sante/pas", ["fr", "Europe/Paris", "kg", "km"], db)!;
  assert.equal(memoireCharge(cle), null, "jamais lue : squelette (le seul de la vie de l'appli)");
  retenirCharge(cle, { pas: 4200 }, compteurEcritures(), t);
  assert.deepEqual(memoireCharge(cle, t + 29_000), { v: { pas: 4200 }, frais: true });
  // 2ᵉ ouverture après 30 s : la valeur tout de suite, relue en fond
  assert.deepEqual(memoireCharge(cle, t + 30_000), { v: { pas: 4200 }, frais: false });
  // une écriture dans la base (par la façade) : relue au retour, même 2 s après
  retenirCharge(cle, { pas: 4300 }, compteurEcritures(), t);
  await db.runAsync("INSERT INTO reglages (cle, valeur) VALUES ('x', '1')", []);
  assert.deepEqual(memoireCharge(cle, t + 2_000), { v: { pas: 4300 }, frais: false });
  // une écriture pendant la lecture : la valeur est déjà vieille (compteur relevé au début de la lecture)
  const avantLecture = compteurEcritures();
  await db.runAsync("UPDATE reglages SET valeur = '2' WHERE cle = 'x'", []);
  retenirCharge(cle, { pas: 4400 }, avantLecture, t);
  assert.equal(memoireCharge(cle, t + 1)!.frais, false);
  assert.deepEqual(dansMemoireCharges(cle), { pas: 4400 });
});

test("M12 : clé de mémoire, nom et dépendances simples ; db ignorée ; un objet coupe la mémoire", async () => {
  const db = {};
  assert.equal(cleCharge(undefined, [1], db), null, "sans nom : pas de mémoire (comme avant)");
  assert.equal(cleCharge("sport", [db], db), "sport");
  assert.equal(cleCharge("sante/sommeil", ["fr", 1793400000000], db), "sante/sommeil|fr|1793400000000");
  assert.equal(cleCharge("x", [{ jour: 1 }], db), null);
  assert.notEqual(cleCharge("sante/poids", [], db), cleCharge("sante/gras", [], db));
});

test("M9 : Santé Connect qui ne répond jamais, les blocs de la base de l'Accueil sont posés sans attendre, sans appel natif", async () => {
  const { db } = await baseDeTest(true);
  const { n, total } = natifCompte({ bloque: true });
  brancher(n, 200);
  let base: Awaited<ReturnType<typeof lireAccueilBase>> | null = null;
  let appelsAvantBase = -1;
  const t0 = Date.now();
  const fini = chargerAccueil(db as never, (b) => ((base = b), (appelsAvantBase = total())), () => {});
  while (!base && Date.now() - t0 < 2000) await new Promise((r) => setTimeout(r, 5));
  assert.ok(base, "blocs de la base posés");
  assert.ok(Date.now() - t0 < 1000, `blocs posés en ${Date.now() - t0} ms`);
  assert.ok(appelsAvantBase <= BUDGETS.natif.avantPremiereValeur, "aucun appel à Santé Connect avant les blocs de la base");
  assert.ok(base!.cartesVoulues.length > 0, "l'Accueil par défaut a des cartes de mesure");
  // les cartes, elles, finissent par rendre la main (délai des lectures natives) : jamais toute la page
  await fini;
});

test("M9 + M1 : l'Accueil complet fait au plus 2 vérifications (statut, autorisees) et un budget borné d'appels Santé Connect", async () => {
  const { db } = await baseDeTest(true);
  const { n, appels, total } = natifCompte();
  brancher(n);
  const poses: string[] = [];
  await chargerAccueil(db as never, () => poses.push("base"), (k) => poses.push(String(k)));
  assert.equal(poses[0], "base", "la base d'abord");
  assert.ok(poses.includes("pas") && poses.indexOf("pas") !== poses.lastIndexOf("pas"), "la carte Pas posée deux fois : sans puis avec l'habitude");
  assert.ok((appels.statut ?? 0) <= BUDGETS.natif.verifications && (appels.autorisees ?? 0) <= BUDGETS.natif.verifications, `vérifications : ${JSON.stringify(appels)}`);
  assert.ok(total() <= BUDGET_ACCUEIL_SC, `${total()} appels Santé Connect (budget ${BUDGET_ACCUEIL_SC}) : ${JSON.stringify(appels)}`);
});
