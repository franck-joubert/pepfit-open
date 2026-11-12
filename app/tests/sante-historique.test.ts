// Historique de Santé Connect au-delà de 30 jours (READ_HEALTH_DATA_HISTORY) : permission facultative demandée avec les autres,
// reprise par tranches sans rafale et sur interruption.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  etatHistorique, FENETRE_IMPORT_MS, lireReprise, PAUSE_TRANCHES_MS, PROFONDEUR_MS, reprendreHistoriqueSante, TRANCHE_MS, TRANCHES_PAR_PASSAGE,
} from "../src/ecrans/sante-historique.ts";
import { fabriquerSante, PERMISSIONS, PERMISSIONS_DEMANDE_SANTE, PERMISSIONS_PAGE_SANTE, type NatifSante } from "../src/natif/sante/logique.ts";
import { baseDeTest, jour } from "./aide.ts";

const JOUR = 86_400_000;
const MAINTENANT = jour(2026, 11, 3, 12);
const HISTORIQUE = PERMISSIONS.historique;
const TOUT = [...PERMISSIONS_PAGE_SANTE.map((p) => PERMISSIONS[p]), HISTORIQUE];

/** Natif simulé : Santé Connect présent ; `pesees` et `mesures` sur une plage ; journal des demandes et des lectures. */
function simule(o: { accordees?: string[]; refuse?: string[]; possible?: boolean | null; pesees?: { kg: number; date: number }[]; echec?: (debut: number) => boolean } = {}) {
  let accordees = new Set(o.accordees ?? []);
  const demandes: string[][] = [];
  const lectures: [string, number, number][] = [];
  const lire = (type: string, debut: number, fin: number) => {
    lectures.push([type, debut, fin]);
    if (o.echec?.(debut)) throw new Error("Santé Connect : délai");
  };
  const natif: NatifSante = {
    statut: async () => 3,
    autorisees: async () => [...accordees],
    demander: async (p) => {
      demandes.push(p);
      accordees = new Set([...accordees, ...p.filter((x) => !o.refuse?.includes(x))]);
      return [...accordees];
    },
    ...(o.possible === null ? {} : { historiquePossible: async () => o.possible ?? true }),
    poids: async (debut, fin) => (lire("poids", debut, fin), (o.pesees ?? []).filter((p) => p.date >= debut && p.date < fin).map((p) => ({ ...p, origine: "com.withings.wiscale2" }))),
    pas: async (b) => b.slice(1).map(() => -1),
    sommeil: async () => [],
    frequenceRepos: async (debut, fin) => (lire("fc", debut, fin), []),
    exporter: async () => {},
    mesures: async (type, debut, fin) => (lire(type, debut, fin), type === "gras" ? [{ valeur: 15, date: fin - JOUR, origine: "com.withings.wiscale2" }] : []),
    seancesSport: async () => [],
    kcalActives: async (b) => b.slice(1).map(() => -1),
    installees: async () => [],
    ouvrir: async () => {},
  };
  return { natif, demandes, lectures, accordees: () => accordees };
}

test("historique : demandé avec la page Santé quand Santé Connect sait le donner ; un refus ne fait pas échouer la demande", async () => {
  const sim = simule({ refuse: [HISTORIQUE] });
  const s = fabriquerSante(sim.natif, () => MAINTENANT);
  assert.equal(await s.demanderPermissions(PERMISSIONS_DEMANDE_SANTE), true, "la page est accordée : la demande réussit");
  assert.ok(sim.demandes[0]!.includes(HISTORIQUE), "historique demandé dans la même fenêtre");
  assert.ok(!(await s.autorisees()).includes("historique"));
  // demandée seule, elle compte
  assert.equal(await s.demanderPermissions(["historique"]), false);
});

test("historique : jamais demandé à un Santé Connect trop ancien ni avec un module natif sans historiquePossible", async () => {
  for (const possible of [false, null]) {
    const sim = simule({ possible });
    const s = fabriquerSante(sim.natif, () => MAINTENANT);
    assert.equal(await s.historiquePossible!(), false);
    assert.equal(await s.demanderPermissions(PERMISSIONS_DEMANDE_SANTE), true);
    assert.ok(!sim.demandes[0]!.includes(HISTORIQUE), `possible=${possible} : pas demandé`);
    assert.equal(await s.demanderPermissions(["historique"]), false, "seule et impossible : rien n'est demandé");
    assert.equal(sim.demandes.length, 1);
  }
  // « autorisée » (ligne des sources) ne dépend pas de l'historique : il n'est pas dans la page
  assert.ok(!PERMISSIONS_PAGE_SANTE.includes("historique"));
});

test("lectures par plage : mesuresEntre et peseesEntre lisent exactement la plage demandée", async () => {
  const sim = simule({ accordees: TOUT, pesees: [{ kg: 80.123, date: MAINTENANT - 100 * JOUR }] });
  const s = fabriquerSante(sim.natif, () => MAINTENANT);
  const [a, b] = [MAINTENANT - 120 * JOUR, MAINTENANT - 90 * JOUR];
  assert.deepEqual(await s.peseesEntre!(a, b), [{ kg: 80.12, date: MAINTENANT - 100 * JOUR, origine: "com.withings.wiscale2" }]);
  assert.deepEqual(sim.lectures.at(-1), ["poids", a, b]);
  assert.equal((await s.mesuresEntre!("gras", a, b))!.length, 1);
  assert.deepEqual(sim.lectures.at(-1), ["gras", a, b]);
  await s.mesuresEntre!("fc", a, b);
  assert.deepEqual(sim.lectures.at(-1), ["fc", a, b], "la FC au repos passe par frequenceRepos");
  // pesees(jours) passe par la même lecture
  await s.pesees(30);
  assert.deepEqual(sim.lectures.at(-1), ["poids", MAINTENANT - 30 * JOUR, MAINTENANT]);
});

test("reprise : rien sans la permission historique, aucun état écrit", async () => {
  const { db } = await baseDeTest();
  const sim = simule({ accordees: TOUT.filter((p) => p !== HISTORIQUE) });
  const s = fabriquerSante(sim.natif, () => MAINTENANT);
  assert.equal(await reprendreHistoriqueSante(db, { s, maintenant: MAINTENANT, pause: async () => {} }), 0);
  assert.equal(await lireReprise(db), null);
  assert.equal(sim.lectures.length, 0);
  assert.deepEqual(etatHistorique(false, null), { etat: "a-autoriser" });
});

test("reprise : par tranches, l'une après l'autre avec une pause, reprend où elle s'est arrêtée, sans doublon, puis s'arrête", async () => {
  const { db, raw } = await baseDeTest();
  const vieille = MAINTENANT - 200 * JOUR;
  let coupe = true;
  const sim = simule({ accordees: TOUT, pesees: [{ kg: 82, date: vieille }], echec: (debut) => coupe && debut < MAINTENANT - FENETRE_IMPORT_MS - TRANCHE_MS });
  const s = fabriquerSante(sim.natif, () => MAINTENANT);
  const pauses: number[] = [];
  const pause = async (ms: number) => void pauses.push(ms);

  // 1er passage : la 2e tranche échoue ; seule la 1re est acquise
  await assert.rejects(reprendreHistoriqueSante(db, { s, maintenant: MAINTENANT, pause }));
  const e1 = (await lireReprise(db))!;
  assert.equal(e1.jusqua, MAINTENANT - FENETRE_IMPORT_MS - TRANCHE_MS);
  assert.equal(e1.plancher, MAINTENANT - PROFONDEUR_MS);
  assert.equal(e1.finiLe, null);
  assert.deepEqual(etatHistorique(true, e1), { etat: "en-cours", jusqua: e1.jusqua });
  // une tranche = les huit mesures puis les pesées, jamais en même temps
  const premiere = sim.lectures.filter(([, d]) => d === MAINTENANT - FENETRE_IMPORT_MS - TRANCHE_MS);
  assert.deepEqual(premiere.map(([t]) => t), ["gras", "maigre", "os", "eau", "bmr", "vfc", "fc", "taille", "poids"]);
  assert.deepEqual(pauses, [PAUSE_TRANCHES_MS]);

  // 2e passage : repart de la tranche coupée
  coupe = false;
  pauses.length = 0;
  sim.lectures.length = 0;
  const n2 = await reprendreHistoriqueSante(db, { s, maintenant: MAINTENANT + 300_000, pause });
  assert.ok(n2 > 0);
  assert.equal(sim.lectures[0]![2], e1.jusqua, "relue à partir du point atteint");
  assert.equal(pauses.length, TRANCHES_PAR_PASSAGE - 1);
  assert.equal((await lireReprise(db))!.jusqua, e1.jusqua - TRANCHES_PAR_PASSAGE * TRANCHE_MS);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM pesee WHERE date = ?").get(vieille) as { n: number }).n, 1, "la pesée de 200 jours est rangée");

  // jusqu'au plancher (10 ans), puis plus rien ; aucune mesure en double
  for (let i = 0; i < 20 && (await lireReprise(db))!.finiLe == null; i++) await reprendreHistoriqueSante(db, { s, maintenant: MAINTENANT + 600_000, pause });
  const fin = (await lireReprise(db))!;
  assert.equal(fin.jusqua, fin.plancher);
  assert.equal(fin.finiLe, MAINTENANT + 600_000);
  assert.deepEqual(etatHistorique(true, fin), { etat: "fini" });
  sim.lectures.length = 0;
  assert.equal(await reprendreHistoriqueSante(db, { s, maintenant: MAINTENANT + 900_000, pause }), 0);
  assert.equal(sim.lectures.length, 0);
  const doubles = raw.prepare("SELECT COUNT(*) AS n FROM (SELECT type, date, source FROM mesure_corps GROUP BY 1, 2, 3 HAVING COUNT(*) > 1)").get() as { n: number };
  assert.equal(doubles.n, 0);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM pesee").get() as { n: number }).n, 1);
});

test("reprise : l'interrupteur « sante_poids » coupé, les pesées anciennes ne sont pas lues", async () => {
  const { db, raw } = await baseDeTest();
  raw.exec("INSERT INTO reglages (cle, valeur) VALUES ('sante_poids', '0')");
  const sim = simule({ accordees: TOUT, pesees: [{ kg: 82, date: MAINTENANT - 60 * JOUR }] });
  await reprendreHistoriqueSante(db, { s: fabriquerSante(sim.natif, () => MAINTENANT), maintenant: MAINTENANT, pause: async () => {}, tranches: 1 });
  assert.ok(!sim.lectures.some(([t]) => t === "poids"));
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM pesee").get() as { n: number }).n, 0);
});
