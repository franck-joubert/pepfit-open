// Santé Connect : états du connecteur, aucune lecture sans autorisation, conversion des enregistrements, pas, sommeil.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bornesJours, fabriquerSante, minuit, nuit, PERMISSIONS, plusRecentPoids, type NatifSante } from "../src/natif/sante/logique.ts";

const H = 3_600_000;
const MAINTENANT = new Date(2026, 9, 27, 9, 30).getTime(); // mar. 27 oct. 2026, 9 h 30
const WITHINGS = "com.withings.wiscale2";

/** Natif simulé : Santé Connect présent, `accordees` autorisées ; journal des appels de lecture. */
function simule(o: { statut?: number; accordees?: string[]; accordeALaDemande?: string[] } = {}) {
  const lectures: string[] = [];
  let accordees = new Set(o.accordees ?? []);
  const natif: NatifSante = {
    statut: async () => o.statut ?? 3,
    autorisees: async () => [...accordees],
    demander: async (p) => {
      accordees = new Set([...accordees, ...(o.accordeALaDemande ?? p)]);
      return [...accordees];
    },
    poids: async () => (lectures.push("poids"), [
      { kg: 81.234, date: MAINTENANT - 2 * H, origine: WITHINGS },
      { kg: 82, date: MAINTENANT - 30 * H, origine: "com.sec.android.app.shealth" },
      { kg: 0, date: MAINTENANT - H, origine: "x" },
    ]),
    pas: async (bornes) => (lectures.push("pas"), bornes.slice(1).map((_, i) => (i === 1 ? -1 : 1000 * (i + 1)))),
    sommeil: async () => (lectures.push("sommeil"), []),
    frequenceRepos: async () => (lectures.push("fc"), [{ bpm: 52, date: MAINTENANT - 5 * H, origine: "w" }, { bpm: 55, date: MAINTENANT - 50 * H, origine: "w" }]),
    exporter: async () => void lectures.push("export"),
    mesures: async (type) => (lectures.push(`mesure:${type}`), [
      { valeur: 14.2, date: MAINTENANT - 30 * H, origine: WITHINGS },
      { valeur: 14.5, date: MAINTENANT - 5 * H, origine: WITHINGS },
      { valeur: 0, date: MAINTENANT - H, origine: WITHINGS },
    ]),
    seancesSport: async () => (lectures.push("sport"), [
      { debut: MAINTENANT - 3 * H, fin: MAINTENANT - 2 * H, type: 76, titre: "Padel", origine: "com.whoop.android" },
      { debut: MAINTENANT - 6 * H, fin: MAINTENANT - 5 * H, type: 70, titre: "Push", origine: "fit.pep" },
    ]),
    kcalActives: async (b) => (lectures.push("kcal"), b.slice(1).map(() => 412)),
    installees: async (p) => p.filter((x) => x !== "com.fitbit.FitbitMobile"),
    ouvrir: async () => {},
  };
  return { natif, lectures, sante: fabriquerSante(natif, () => MAINTENANT) };
}

const PAQUETS = [WITHINGS, "com.sec.android.app.shealth", "com.fitbit.FitbitMobile"];

test("sans module natif : non-branche, rien n'est lu", async () => {
  const s = fabriquerSante(null);
  assert.equal(await s.disponible(), false);
  assert.equal((await s.etatPoids(PAQUETS)).connecteur, "non-branche");
  assert.equal(await s.dernierPoids(), null);
  assert.equal(await s.pasDuJour(), null);
  assert.equal(await s.demanderPermissions(["poids"]), false);
});

test("Santé Connect absent ou à mettre à jour : absent", async () => {
  for (const statut of [1, 2]) {
    const { sante, lectures } = simule({ statut, accordees: [PERMISSIONS.poids] });
    assert.equal((await sante.etatPoids(PAQUETS)).connecteur, "absent");
    assert.equal(await sante.dernierPoids(), null);
    assert.deepEqual(lectures, []);
  }
});

test("présent sans autorisation : à-autoriser, aucune lecture", async () => {
  const { sante, lectures } = simule();
  const e = await sante.etatPoids(PAQUETS);
  assert.equal(e.connecteur, "a-autoriser");
  assert.deepEqual(e.applis.map((a) => [a.installee, a.partage]), [[true, false], [true, false], [false, false]]);
  assert.equal(await sante.dernierPoids(), null);
  assert.equal(await sante.pasDuJour(), null);
  assert.equal(await sante.pasSurJours(), null);
  assert.equal(await sante.sommeilDeLaNuit(), null);
  assert.equal(await sante.frequenceRepos(), null);
  assert.equal(await sante.exporterSeance({ debut: 0, fin: 1, titre: "Push" }), false);
  assert.deepEqual(lectures, []);
});

test("autorisation du poids : prête, origine des pesées, seulement le poids est lu", async () => {
  const { sante, lectures } = simule({ accordees: [PERMISSIONS.poids] });
  const e = await sante.etatPoids(PAQUETS);
  assert.equal(e.connecteur, "pret");
  assert.deepEqual(e.applis, [
    { paquet: WITHINGS, installee: true, partage: true },
    { paquet: "com.sec.android.app.shealth", installee: true, partage: true },
    { paquet: "com.fitbit.FitbitMobile", installee: false, partage: false },
  ]);
  assert.deepEqual(await sante.dernierPoids(), { kg: 81.23, date: MAINTENANT - 2 * H, origine: WITHINGS });
  assert.equal(await sante.pasDuJour(), null);
  assert.deepEqual([...new Set(lectures)], ["poids"]);
});

test("demanderPermissions : vrai seulement si tout est accordé", async () => {
  assert.equal(await simule().sante.demanderPermissions(["poids", "pas"]), true);
  assert.equal(await simule({ accordeALaDemande: [PERMISSIONS.poids] }).sante.demanderPermissions(["poids", "pas"]), false);
  assert.deepEqual(await simule({ accordees: [PERMISSIONS.pas, PERMISSIONS.seances] }).sante.autorisees(), ["pas", "seances"]);
});

test("conversion du poids : la plus récente, valeurs aberrantes ignorées", () => {
  assert.equal(plusRecentPoids([]), null);
  assert.deepEqual(plusRecentPoids([{ kg: 600, date: 5, origine: "" }, { kg: 79.996, date: 1, origine: "" }]), { kg: 80, date: 1, origine: null });
});

test("pas : bornes à minuit, -1 = jour sans donnée, aujourd'hui jusqu'à maintenant", async () => {
  const b = bornesJours(MAINTENANT, 7);
  assert.equal(b.length, 8);
  assert.equal(b[0], new Date(2026, 9, 21).getTime());
  assert.equal(b[6], minuit(MAINTENANT));
  assert.equal(b[7], MAINTENANT);

  const { sante } = simule({ accordees: [PERMISSIONS.pas] });
  const semaine = (await sante.pasSurJours())!;
  assert.equal(semaine.length, 7);
  assert.deepEqual(semaine.slice(0, 3), [
    { jour: b[0], pas: 1000 },
    { jour: b[1], pas: null },
    { jour: b[2], pas: 3000 },
  ]);
  assert.equal(await sante.pasDuJour(), 1000);
});

test("pas : passage à l'heure d'hiver (25 oct. 2026), chaque borne reste un minuit local", () => {
  const b = bornesJours(MAINTENANT, 4);
  for (const x of b.slice(0, -1)) assert.equal(new Date(x).getHours(), 0);
});

test("sommeil : la plus longue session, éveils retirés, phases en minutes", () => {
  const coucher = new Date(2026, 9, 26, 23, 0).getTime();
  const sieste = { debut: coucher - 8 * H, fin: coucher - 7 * H, origine: "a", etapes: [] };
  const n = nuit([
    sieste,
    {
      debut: coucher,
      fin: coucher + 8 * H,
      origine: "com.sec.android.app.shealth",
      etapes: [
        { debut: coucher, fin: coucher + 3 * H, type: 4 },
        { debut: coucher + 3 * H, fin: coucher + 5 * H, type: 5 },
        { debut: coucher + 5 * H, fin: coucher + 5.5 * H, type: 1 },
        { debut: coucher + 5.5 * H, fin: coucher + 8 * H, type: 6 },
      ],
    },
  ])!;
  assert.equal(n.minutes, 450);
  assert.deepEqual(n.phases, { leger: 180, profond: 120, paradoxal: 150, eveil: 30 });
  assert.equal(n.origine, "com.sec.android.app.shealth");
  assert.deepEqual(nuit([sieste]), { debut: sieste.debut, fin: sieste.fin, minutes: 60, phases: null, origine: "a", etapes: [] });
  assert.equal(n.etapes!.length, 4, "les tranches restent (Sommeil : réveils)");
  assert.equal(nuit([]), null);
});

test("sommeil de la nuit : fenêtre depuis 18 h la veille, sessions pas encore finies exclues", async () => {
  const { natif } = simule({ accordees: [PERMISSIONS.sommeil] });
  let fenetre: number[] = [];
  natif.sommeil = async (d, f) => ((fenetre = [d, f]), [
    { debut: MAINTENANT - 10 * H, fin: MAINTENANT - 2 * H, origine: "o", etapes: [] },
    { debut: MAINTENANT - H, fin: MAINTENANT + 9 * H, origine: "o", etapes: [] },
  ]);
  const n = await fabriquerSante(natif, () => MAINTENANT).sommeilDeLaNuit();
  assert.deepEqual(fenetre, [new Date(2026, 9, 26, 18).getTime(), MAINTENANT]);
  assert.equal(n?.minutes, 480);
});

test("fréquence au repos : la plus récente", async () => {
  const { sante } = simule({ accordees: [PERMISSIONS["frequence-cardiaque"]] });
  assert.deepEqual(await sante.frequenceRepos(), { bpm: 52, date: MAINTENANT - 5 * H, origine: "w" });
});

test("export de séance : identifiant stable, seulement avec l'autorisation d'écrire", async () => {
  const { natif, sante } = simule({ accordees: [PERMISSIONS.seances] });
  let recu: unknown[] = [];
  natif.exporter = async (...a) => void (recu = a);
  assert.equal(await sante.exporterSeance({ debut: 10, fin: 20, titre: "Jambes", id: "s1" }), true);
  assert.deepEqual(recu, [10, 20, "Jambes", "s1"]);
  await sante.exporterSeance({ debut: 10, fin: 20, titre: "Jambes" });
  assert.equal(recu[3], "pepfit-seance-10");
});

test("page Santé : mesures triées sans les nulles, FC au repos par son propre accès, séances des autres applis avec kcal et pas", async () => {
  const { sante, lectures } = simule({ accordees: [PERMISSIONS.gras, PERMISSIONS["frequence-cardiaque"], PERMISSIONS.sport, PERMISSIONS["kcal-actives"], PERMISSIONS.pas] });
  const g = await sante.mesures("gras", 30);
  assert.deepEqual(g!.map((x) => x.valeur), [14.5, 14.2]);
  assert.equal(g![0]!.origine, WITHINGS);
  assert.deepEqual((await sante.mesures("fc", 30))!.map((x) => x.valeur), [52, 55]);
  // sans autorisation : rien n'est lu
  assert.equal(await sante.mesures("vfc", 30), null);
  assert.ok(!lectures.includes("mesure:vfc"));
  const s = await sante.seancesSport(MAINTENANT - 12 * H, MAINTENANT);
  // la séance écrite par pepfit elle-même n'est pas reprise
  assert.equal(s!.length, 1);
  assert.deepEqual({ titre: s![0]!.titre, kcal: s![0]!.kcal, pas: s![0]!.pas }, { titre: "Padel", kcal: 412, pas: 1000 });
});

test("séances sans l'autorisation des kcal : kcal null (estimées ensuite), pas lus quand même", async () => {
  const { sante } = simule({ accordees: [PERMISSIONS.sport, PERMISSIONS.pas] });
  const s = await sante.seancesSport(MAINTENANT - 12 * H, MAINTENANT);
  assert.equal(s![0]!.kcal, null);
  assert.equal(s![0]!.pas, 1000);
  assert.equal(await simule().sante.seancesSport(0, MAINTENANT), null);
});

/** Natif simulé qui compte chacun de ses appels (statut, autorisees, lectures). */
function compte(o: { accordees?: string[] } = {}) {
  const appels: Record<string, number> = {};
  const c = (k: string) => (appels[k] = (appels[k] ?? 0) + 1);
  let accordees = new Set(o.accordees ?? []);
  const { natif } = simule();
  const n: NatifSante = {
    ...natif,
    statut: async () => (c("statut"), 3),
    autorisees: async () => (c("autorisees"), [...accordees]),
    demander: async (p) => (c("demander"), (accordees = new Set([...accordees, ...p])), [...accordees]),
    pas: async (b) => (c("pas"), b.slice(1).map(() => 100)),
  };
  return { n, appels, retirer: () => (accordees = new Set()) };
}

test("M1 : 10 lectures de suite = 1 statut + 1 autorisees + 10 lectures ; relus après 30 s", async () => {
  let t = MAINTENANT;
  const { n, appels } = compte({ accordees: [PERMISSIONS.pas] });
  const s = fabriquerSante(n, () => t);
  // en même temps aussi : la vérification en cours est partagée
  await Promise.all([s.pasDuJour(), s.pasDuJour(), s.pasDuJour()]);
  for (let i = 0; i < 7; i++) await s.pasDuJour();
  assert.deepEqual(appels, { statut: 1, autorisees: 1, pas: 10 });
  assert.equal(await s.disponible(), true);
  assert.deepEqual(await s.autorisees(), ["pas"]);
  assert.deepEqual(appels, { statut: 1, autorisees: 1, pas: 10 });
  t += 30_000;
  await s.pasDuJour();
  assert.deepEqual(appels, { statut: 2, autorisees: 2, pas: 11 });
});

test("M1 : après une demande d'autorisation, un passage dans les réglages ou un retour au premier plan, tout est relu", async () => {
  const { n, appels, retirer } = compte();
  const s = fabriquerSante(n, () => MAINTENANT);
  assert.equal(await s.pasDuJour(), null);
  assert.equal(await s.demanderPermissions(["pas"]), true);
  assert.equal(await s.pasDuJour(), 100);
  assert.deepEqual(appels, { statut: 1, autorisees: 2, demander: 1, pas: 1 });
  // retirée dans Santé Connect : relue à l'ouverture de ses réglages, ou au retour au premier plan
  retirer();
  await s.ouvrirReglages();
  assert.equal(await s.pasDuJour(), null);
  assert.equal(appels.statut, 2);
  await s.demanderPermissions(["pas"]);
  s.oublierAutorisations();
  assert.equal(await s.pasDuJour(), 100);
  assert.equal(appels.autorisees, 5);
});

test("M1 : une lecture refusée (SecurityException) fait relire les autorisations ; un statut en échec n'est pas gardé", async () => {
  const { n, appels } = compte({ accordees: [PERMISSIONS.pas] });
  let refus = true;
  n.pas = async (b) => {
    if (refus) throw new Error("java.lang.SecurityException: Caller doesn't have permission");
    return b.slice(1).map(() => 7);
  };
  const s = fabriquerSante(n, () => MAINTENANT);
  await assert.rejects(s.pasDuJour());
  refus = false;
  assert.equal(await s.pasDuJour(), 7);
  assert.equal(appels.autorisees, 2);
  let echec = true;
  const { n: m, appels: a2 } = compte({ accordees: [PERMISSIONS.pas] });
  m.statut = async () => {
    a2.statut = (a2.statut ?? 0) + 1;
    if (echec) throw new Error("hors service");
    return 3;
  };
  const s2 = fabriquerSante(m, () => MAINTENANT);
  await assert.rejects(s2.pasDuJour());
  echec = false;
  assert.equal(await s2.pasDuJour(), 100);
  assert.equal(a2.statut, 2);
});
