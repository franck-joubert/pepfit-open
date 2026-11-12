// iPhone : correspondance Santé Connect → HealthKit (healthkit.ts) et la même API Sante branchée sur un faux module Swift.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import {
  CORRESPONDANCE,
  HK,
  natifDepuisHealthKit,
  reglesHk,
  sessionsSommeilHk,
  SPORT_HK,
  typeSeance,
  type EchantillonHk,
  type NatifHealthKit,
  type SeanceHk,
} from "../src/natif/sante/healthkit.ts";
import { fabriquerSante, minuit, PERMISSIONS, PERMISSIONS_DEMANDE_SANTE } from "../src/natif/sante/logique.ts";
import { SPORT_SANTE } from "../src/ecrans/kcal-seance.ts";
import { SANTE_RECUP } from "../src/ecrans/recuperer.ts";

const H = 3_600_000;
const J = 86_400_000;
const MAINTENANT = new Date(2026, 10, 4, 9, 30).getTime(); // mer. 4 nov. 2026, 9 h 30
const MONTRE = "com.apple.health.5D1C2B8E";
const IPHONE = "com.apple.health.9A7F0C11";
const ID_SEANCE = "HKWorkoutTypeIdentifier";
const ech = (valeur: number, debut: number, fin: number, origine = MONTRE, id = `${debut}-${valeur}`, debutCycle?: boolean): EchantillonHk => ({
  valeur, debut, fin, origine, id, ...(debutCycle == null ? {} : { debutCycle }),
});

/** Faux module Swift : HealthKit présent ; `demandes` = types déjà demandés ; journal des appels. */
function fauxHk(o: { disponible?: boolean; ecriture?: number; demandes?: string[]; erreur?: Error } = {}) {
  const appels: string[] = [];
  const demandes = new Set(o.demandes ?? []);
  const ecrits = new Set<string>();
  const marques = new Set<string>();
  const demandesFaites: { lecture: string[]; ecriture: string[]; marques: string[] }[] = [];
  const nuit = minuit(MAINTENANT) - 1.5 * H; // 22 h 30 la veille
  const quantites: Record<string, EchantillonHk[]> = {
    [HK.poids]: [ech(81.234, MAINTENANT - 2 * H, MAINTENANT - 2 * H, "com.withings.wiscale2"), ech(0, MAINTENANT - H, MAINTENANT - H)],
    [HK.gras]: [ech(0.182, MAINTENANT - 5 * H, MAINTENANT - 5 * H, "com.withings.wiscale2")],
    [HK.vfc]: [ech(48, MAINTENANT - 4 * H, MAINTENANT - 4 * H)],
    [HK.fcRepos]: [ech(52, MAINTENANT - 5 * H, MAINTENANT - 5 * H)],
    [HK.fc]: [ech(120, MAINTENANT - H, MAINTENANT - H), ech(95, MAINTENANT - 2 * H, MAINTENANT - 2 * H), ech(80, MAINTENANT - 30 * H, MAINTENANT - 30 * H)],
  };
  const hk: NatifHealthKit = {
    disponible: () => o.disponible ?? true,
    statutsLecture: async (ids) => ids.map((id) => (demandes.has(id) ? 2 : 1)),
    statutsEcriture: async (ids) => ids.map((id) => (ecrits.has(id) ? (o.ecriture ?? 2) : 0)),
    marquees: async () => [...marques],
    demander: async (lecture, ecriture, m) => {
      demandesFaites.push({ lecture, ecriture, marques: m });
      for (const id of lecture) demandes.add(id);
      for (const id of ecriture) ecrits.add(id);
      for (const x of m) marques.add(x);
    },
    quantites: async (id, debut, fin) => {
      appels.push(`quantites:${id}`);
      if (o.erreur) throw o.erreur;
      return (quantites[id] ?? []).filter((e) => e.debut >= debut && e.debut <= fin);
    },
    categories: async (id, debut) => {
      appels.push(`categories:${id}:${debut}`);
      if (id === HK.sommeil)
        return [
          ech(0, nuit - 0.5 * H, nuit + 8.5 * H, IPHONE), // au lit (iPhone), sans sommeil : écarté
          ech(3, nuit, nuit + 2 * H), // core
          ech(4, nuit + 2 * H, nuit + 3 * H), // profond
          ech(2, nuit + 3 * H, nuit + 3.25 * H), // éveil
          ech(5, nuit + 3.25 * H, nuit + 4.25 * H), // paradoxal
          ech(3, nuit + 4.25 * H, nuit + 8 * H), // core
        ];
      return [];
    },
    sommes: async (id, bornes) => (appels.push(`sommes:${id}`), bornes.slice(1).map((_, i) => (i === 1 ? -1 : 1000 * (i + 1)))),
    sommesGroupees: async (id, debut, fin, pas) => {
      appels.push(`groupes:${id}:${pas}`);
      if (pas === "jour") {
        // trois jours entiers puis le jour en cours
        const l: [number, number, number][] = [];
        for (let d = debut; d < fin; d = minuit(d, 1)) l.push([d, minuit(d, 1), d === minuit(MAINTENANT) ? 600 : 1650]);
        return l;
      }
      const l: [number, number, number][] = [];
      for (let t = debut; t < fin; t += H) if (new Date(t).getHours() === 10) l.push([t, t + H, 500]);
      return l;
    },
    sources: async () => [MONTRE, "fit.pep"],
    seances: async () => [
      { debut: MAINTENANT - 3 * H, fin: MAINTENANT - 2 * H, activite: 48, origine: "com.strava" },
      { debut: MAINTENANT - 8 * H, fin: MAINTENANT - 7 * H, activite: 37, interieur: true, origine: MONTRE },
      { debut: MAINTENANT - 6 * H, fin: MAINTENANT - 5 * H, activite: 50, titre: "Push", origine: "fit.pep" },
    ],
    exporter: async (debut, fin, titre, id) => void appels.push(`exporter:${debut}:${fin}:${titre}:${id}`),
    ouvrirSante: async () => void appels.push("ouvrirSante"),
  };
  return { hk, appels, demandesFaites };
}

const santeIos = (f: ReturnType<typeof fauxHk>) => fabriquerSante(natifDepuisHealthKit(f.hk), () => MAINTENANT);

test("correspondance : chaque autorisation de Santé Connect a son entrée HealthKit", () => {
  assert.deepEqual(Object.keys(CORRESPONDANCE).sort(), Object.values(PERMISSIONS).sort());
  const sansType = Object.entries(CORRESPONDANCE).filter(([, c]) => !c.lecture.length && !c.ecriture.length).map(([p]) => p).sort();
  assert.deepEqual(sansType, [PERMISSIONS.eau, PERMISSIONS.historique, PERMISSIONS.os].sort());
  assert.deepEqual(CORRESPONDANCE[PERMISSIONS.seances], { lecture: [], ecriture: [ID_SEANCE] });
  assert.deepEqual(CORRESPONDANCE[PERMISSIONS.vfc]!.lecture, ["HKQuantityTypeIdentifierHeartRateVariabilitySDNN"]);
  for (const c of Object.values(CORRESPONDANCE))
    for (const id of [...c.lecture, ...c.ecriture]) assert.match(id, /^HK(Quantity|Category|Workout)TypeIdentifier/);
});

test("types de séance : HealthKit → Santé Connect, intérieur et eau libre compris", () => {
  assert.equal(typeSeance({ activite: 37 }), 56); // course
  assert.equal(typeSeance({ activite: 37, interieur: true }), 57); // tapis
  assert.equal(typeSeance({ activite: 13, interieur: true }), 9); // vélo d'appartement
  assert.equal(typeSeance({ activite: 35, interieur: true }), 54); // rameur
  assert.equal(typeSeance({ activite: 46, lieuNage: 1 }), 74); // piscine
  assert.equal(typeSeance({ activite: 46, lieuNage: 2 }), 73); // eau libre
  assert.equal(typeSeance({ activite: 50 }), 70); // musculation
  assert.equal(typeSeance({ activite: 62 }), 71); // souplesse → étirements (récupération)
  assert.equal(typeSeance({ activite: 3000 }), 0); // other
  // les sports que l'appli sait chiffrer (MET) gardent leur sens
  const nom: Record<number, string> = { 4: "cat:badminton", 6: "cat:basketball", 13: "cat:bicycling", 63: "cat:hiit", 24: "cat:randonnee", 66: "cat:pilates", 37: "cat:course", 50: "cat:musculation", 46: "cat:natation", 48: "cat:tennis", 52: "cat:marche", 57: "cat:yoga" };
  for (const [hk, cat] of Object.entries(nom)) assert.equal(SPORT_SANTE[SPORT_HK[Number(hk)]!], cat, `HK ${hk}`);
  assert.equal(SANTE_RECUP[SPORT_HK[62]!], "etirements");
});

test("sommeil : une session par source, phases converties, temps au lit de l'iPhone écarté", () => {
  const n = minuit(MAINTENANT) - 1.5 * H;
  const s = sessionsSommeilHk([
    ech(0, n - 0.5 * H, n + 8.5 * H, IPHONE),
    ech(3, n, n + 2 * H),
    ech(4, n + 2 * H, n + 3 * H),
    ech(2, n + 3 * H, n + 3.25 * H),
    ech(5, n + 3.25 * H, n + 4.25 * H),
    ech(3, n + 4.25 * H, n + 8 * H),
    ech(1, n + 15 * H, n + 16 * H), // sieste, sans phases : autre session
  ]);
  assert.equal(s.length, 2);
  const [nuit, sieste] = [...s].sort((a, b) => a.debut - b.debut);
  assert.deepEqual([nuit!.debut, nuit!.fin, nuit!.origine], [n, n + 8 * H, MONTRE]);
  assert.deepEqual(nuit!.etapes.map((e) => e.type), [4, 5, 1, 6, 4]);
  assert.deepEqual(sieste!.etapes, []);
  // le seul temps au lit, sans autre source : gardé tel quel
  assert.equal(sessionsSommeilHk([ech(0, n, n + 7 * H, IPHONE)]).length, 1);
  // plus d'une heure entre deux échantillons : deux sessions
  assert.equal(sessionsSommeilHk([ech(1, n, n + H), ech(1, n + 2.5 * H, n + 3 * H)]).length, 2);
});

test("règles : des jours qui se suivent font une période, coupée par un premier jour ou deux jours vides", () => {
  const j0 = minuit(MAINTENANT, -40);
  const jour = (k: number, flux: number, premier?: boolean) => ech(flux, minuit(j0, k), minuit(j0, k + 1), "com.apple.Health", `j${k}`, premier);
  const r = reglesHk([jour(0, 3, true), jour(1, 4), jour(3, 2), jour(4, 5), jour(10, 1), jour(28, 2, true), jour(29, 2, true)], minuit(j0, -1), MAINTENANT);
  // j0..j3 (un jour vide au milieu ne coupe pas) ; j10 seul (6 jours vides) ; j28 ; j29 (premier jour marqué)
  assert.deepEqual(r.periodes.map((p) => [p.debut, p.fin, p.id]), [
    [j0, minuit(j0, 4), "j0"],
    [minuit(j0, 10), minuit(j0, 11), "j10"],
    [minuit(j0, 28), minuit(j0, 29), "j28"],
    [minuit(j0, 29), minuit(j0, 30), "j29"],
  ]);
  // « pas de flux » (5) n'est pas un jour de règles ; intensités en FLOW_* de Santé Connect
  assert.deepEqual(r.flux.map((f) => f.flux), [2, 3, 1, 0, 1, 1]);
});

test("HealthKit absent : même état que sans Santé Connect", async () => {
  const s = santeIos(fauxHk({ disponible: false }));
  assert.equal(await s.disponible(), false);
  assert.equal((await s.etatPoids(["com.withings.wiscale2"])).connecteur, "absent");
  assert.equal(await s.demanderPermissions(["poids"]), false);
});

test("autorisations : rien de lu avant la demande ; la demande porte les types HealthKit et retient ceux sans type", async () => {
  const f = fauxHk();
  const s = santeIos(f);
  assert.deepEqual(await s.autorisees(), []);
  assert.equal(await s.dernierPoids(), null);
  assert.deepEqual(f.appels, []);
  assert.equal((await s.etatPoids(["com.withings.wiscale2"])).connecteur, "a-autoriser");
  assert.equal(await s.historiquePossible!(), true);

  assert.equal(await s.demanderPermissions(PERMISSIONS_DEMANDE_SANTE), true);
  const d = f.demandesFaites[0]!;
  assert.equal(d.lecture.length, new Set(d.lecture).size);
  assert.ok(d.lecture.includes(HK.poids) && d.lecture.includes(HK.fc) && d.lecture.includes(ID_SEANCE));
  assert.deepEqual(d.ecriture, []);
  assert.deepEqual([...d.marques].sort(), [PERMISSIONS.eau, PERMISSIONS.historique, PERMISSIONS.os].sort());
  const a = await s.autorisees();
  for (const p of PERMISSIONS_DEMANDE_SANTE) assert.ok(a.includes(p), p);
  assert.ok(!a.includes("seances"));
  assert.ok(!a.includes("regles"));
});

test("écriture des séances : seulement si Santé l'autorise, même id gardé", async () => {
  const refusee = fauxHk({ ecriture: 1 });
  const s1 = santeIos(refusee);
  assert.equal(await s1.demanderPermissions(["seances"]), false);
  assert.equal(await s1.exporterSeance({ debut: 1, fin: 2, titre: "Push" }), false);

  const f = fauxHk();
  const s = santeIos(f);
  assert.equal(await s.demanderPermissions(["seances"]), true);
  assert.deepEqual(f.demandesFaites[0], { lecture: [], ecriture: [ID_SEANCE], marques: [] });
  assert.equal(await s.exporterSeance({ debut: 1000, fin: 2000, titre: "Push", id: "s-42" }), true);
  assert.equal(await s.exporterSeance({ debut: 3000, fin: 4000, titre: "Pull" }), true);
  assert.deepEqual(f.appels.filter((x) => x.startsWith("exporter")), ["exporter:1000:2000:Push:s-42", "exporter:3000:4000:Pull:pepfit-seance-3000"]);
});

test("lectures : mêmes valeurs et mêmes unités qu'avec Santé Connect", async () => {
  const f = fauxHk({ demandes: Object.values(CORRESPONDANCE).flatMap((c) => c.lecture) });
  const s = santeIos(f);
  assert.deepEqual(await s.dernierPoids(), { kg: 81.23, date: MAINTENANT - 2 * H, origine: "com.withings.wiscale2" });
  assert.deepEqual((await s.etatPoids(["com.withings.wiscale2"])).applis, [{ paquet: "com.withings.wiscale2", installee: false, partage: true }]);
  // gras : fraction HealthKit → pourcentage
  assert.deepEqual(await s.mesures("gras", 7), [{ valeur: 18.2, date: MAINTENANT - 5 * H, origine: "com.withings.wiscale2" }]);
  assert.deepEqual(await s.mesures("vfc", 7), [{ valeur: 48, date: MAINTENANT - 4 * H, origine: MONTRE }]);
  assert.deepEqual(await s.mesures("fc", 7), [{ valeur: 52, date: MAINTENANT - 5 * H, origine: MONTRE }]);
  assert.deepEqual(await s.frequenceRepos(), { bpm: 52, date: MAINTENANT - 5 * H, origine: MONTRE });
  // os et eau : pas de type HealthKit, aucune donnée (sans appel natif)
  const avant = f.appels.length;
  assert.equal(await s.mesures("os", 30), null); // non autorisée tant qu'elle n'est pas demandée
  assert.equal(await s.demanderPermissions(["os", "eau"]), true);
  assert.deepEqual(await s.mesures("os", 30), []);
  assert.deepEqual(await s.mesures("eau", 30), []);
  assert.equal(f.appels.length, avant);
  // métabolisme de base : une valeur par jour entier (kcal/j), datée de midi (dans la plage) ; le jour en cours n'en est pas une
  const bmr = await s.mesures("bmr", 3);
  assert.deepEqual(bmr!.map((m) => [m.valeur, m.date]), [
    [1650, minuit(MAINTENANT, -1) + 12 * H],
    [1650, minuit(MAINTENANT, -2) + 12 * H],
    [1650, minuit(MAINTENANT, -3) + 12 * H],
  ]);
  assert.deepEqual((await s.mesures("bmr", 2.5))!.length, 2); // le 1er à midi tombe avant la plage
  // FC de la montre : de la plus ancienne à la plus récente, dans la plage
  assert.deepEqual(await s.fcEntre(MAINTENANT - 3 * H, MAINTENANT), [{ t: MAINTENANT - 2 * H, bpm: 95 }, { t: MAINTENANT - H, bpm: 120 }]);
  assert.deepEqual(await s.originesPas!(MAINTENANT - J, MAINTENANT), [MONTRE, "fit.pep"]);
});

test("pas, kcal et distance : sommes par intervalle et lecture groupée par heure", async () => {
  const f = fauxHk({ demandes: Object.values(CORRESPONDANCE).flatMap((c) => c.lecture) });
  const s = santeIos(f);
  assert.equal(await s.pasDuJour(), 1000);
  assert.equal(await s.distanceEntre(MAINTENANT - H, MAINTENANT), 1000);
  // trois jours : bornes à minuit, lecture groupée par heure (500 pas à 10 h chaque jour sauf aujourd'hui, pas encore 10 h)
  assert.deepEqual(await s.pasSurJours(3), [
    { jour: minuit(MAINTENANT, -2), pas: 500 },
    { jour: minuit(MAINTENANT, -1), pas: 500 },
    { jour: minuit(MAINTENANT), pas: null },
  ]);
  assert.ok(f.appels.includes(`groupes:${HK.pas}:heure`));
});

test("sommeil de la nuit et séances des autres applis", async () => {
  const f = fauxHk({ demandes: Object.values(CORRESPONDANCE).flatMap((c) => c.lecture) });
  const s = santeIos(f);
  const n = await s.sommeilDeLaNuit();
  assert.ok(n);
  assert.equal(n.origine, MONTRE);
  assert.deepEqual(n.phases, { leger: 345, profond: 60, paradoxal: 60, eveil: 15 });
  assert.equal(n.minutes, 8 * 60 - 15);
  // la lecture du sommeil part 12 h plus tôt (une nuit commencée avant garde son début)
  assert.ok(f.appels.includes(`categories:${HK.sommeil}:${minuit(MAINTENANT) - 6 * H - 12 * H}`));

  const seances = await s.seancesSport(MAINTENANT - J, MAINTENANT);
  // celle de pepfit (fit.pep) n'est pas comptée deux fois ; tapis de course (57) ; tennis (76)
  assert.deepEqual(seances!.map((x) => [x.type, x.origine, x.titre, x.kcal, x.pas]), [
    [57, MONTRE, null, 1000, 1000],
    [76, "com.strava", null, 1000, 1000],
  ]);
});

test("règles et réglages par la même API", async () => {
  const f = fauxHk({ demandes: [HK.regles] });
  const s = santeIos(f);
  assert.deepEqual(await s.regles(MAINTENANT - 30 * J, MAINTENANT), { periodes: [], flux: [] });
  assert.ok(f.appels.includes(`categories:${HK.regles}:${MAINTENANT - 45 * J}`));
  await s.ouvrirReglages("com.withings.wiscale2");
  assert.ok(f.appels.includes("ouvrirSante"));
});

test("accès refusé par HealthKit : même erreur qu'Android, les autorisations sont relues", async () => {
  let relues = 0;
  const f = fauxHk({ demandes: [HK.poids], erreur: new Error("SecurityException: HealthKit refuse l'accès (Not authorized)") });
  const lire = f.hk.statutsLecture;
  f.hk.statutsLecture = async (ids) => (relues++, lire(ids));
  const s = santeIos(f);
  await assert.rejects(s.dernierPoids(), /SecurityException/);
  await assert.rejects(s.dernierPoids(), /SecurityException/);
  assert.equal(relues, 2);
});

test("le module Swift expose tout le contrat NatifHealthKit, et connaît chaque type demandé", () => {
  const dossier = new URL("../modules/pepfit-sante/", import.meta.url);
  const swift = readFileSync(new URL("ios/PepfitSanteModule.swift", dossier), "utf8");
  const fonctions = ["disponible", "statutsLecture", "statutsEcriture", "marquees", "demander", "quantites", "categories", "sommes", "sommesGroupees", "sources", "seances", "exporter", "ouvrirSante"] satisfies (keyof NatifHealthKit)[];
  for (const nom of fonctions) assert.match(swift, new RegExp(`Function\\("${nom}"\\)`), nom);
  assert.match(swift, /Name\("PepfitSante"\)/);
  const types = readFileSync(new URL("ios/Types.swift", dossier), "utf8");
  for (const id of new Set(Object.values(CORRESPONDANCE).flatMap((c) => [...c.lecture, ...c.ecriture]))) {
    if (id === ID_SEANCE) continue;
    const nom = id.replace(/^HK(Quantity|Category)TypeIdentifier/, "");
    assert.match(types, new RegExp(`\\.${nom[0]!.toLowerCase()}${nom.slice(1)}\\b`), id);
  }
  const config = JSON.parse(readFileSync(new URL("expo-module.config.json", dossier), "utf8"));
  assert.deepEqual(config.platforms, ["android", "apple"]);
  assert.deepEqual(config.apple.modules, ["PepfitSanteModule"]);
  assert.deepEqual(config.android.modules, ["fit.pep.sante.PepfitSanteModule"]);
});

test("plugin iPhone : droit HealthKit et textes des demandes, branché dans app.json", () => {
  const require = createRequire(import.meta.url);
  const plugin = require("../plugins/ios-sante.js");
  assert.match(plugin.LECTURE, /Santé/);
  assert.match(plugin.ECRITURE, /séances/);
  const app = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8"));
  assert.ok(app.expo.plugins.includes("./plugins/ios-sante.js"));
  for (const l of ["fr", "en"]) {
    const ios = JSON.parse(readFileSync(new URL(`../locales/${l}.json`, import.meta.url), "utf8")).ios;
    assert.ok(ios.NSHealthShareUsageDescription && ios.NSHealthUpdateUsageDescription, l);
  }
});
