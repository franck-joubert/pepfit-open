// iPhone, couche JS des modules natifs (docs/CODE-IOS-DIVERS.md) : mêmes réponses que sur Android, avec de faux modules Swift.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fabriquerAgendaIos, ORANGE_SPORT_ARGB, type NatifAgendaIos } from "../src/natif/agenda/ios.ts";
import { fabriquerDeverrouillage } from "../src/natif/deverrouillage/ios.ts";
import { fabriquerEndormir } from "../src/natif/endormir/ios.ts";
import { fabriquerCookies } from "../src/natif/cookies/ios.ts";
import { fabriquerNavigateur } from "../src/natif/navigateur/ios.ts";
import { ouvrirAutorisation, SCHEMA } from "../src/natif/navigateur/autorisation.ts";
import { SURCHARGES_IPHONE } from "../src/i18n/iphone.ts";
import { fr } from "../src/i18n/fr.ts";

const exiger = createRequire(import.meta.url);
const erreur = (code: string) => Object.assign(new Error(code), { code });

function fauxAgenda(o: Partial<NatifAgendaIos> = {}) {
  const appels: Record<string, unknown[][]> = {};
  const note = (nom: string, ...args: unknown[]) => (appels[nom] ??= []).push(args);
  const natif: NatifAgendaIos = {
    getCalendarPermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
    requestCalendarPermissionsAsync: async () => ({ granted: false, canAskAgain: false }),
    getCalendarsAsync: async (type) => {
      note("getCalendarsAsync", type);
      return [
        { id: "a", title: "Maison", color: "#ff0000", allowsModifications: true, source: { name: "iCloud", type: "caldav" } },
        { id: "b", title: "Perso", color: null, allowsModifications: true, source: { name: "prenom@gmail.com", type: "caldav" } },
        { id: "c", title: "Sur mon iPhone", allowsModifications: false, source: { name: "Sur mon iPhone", type: "local" } },
      ];
    },
    getDefaultCalendarAsync: async () => ({ id: "a" }),
    getSourcesAsync: async () => [{ id: "s1", name: "iCloud", type: "caldav" }, { id: "s2", name: "Sur mon iPhone", type: "local" }],
    getEventsAsync: async (de, a, ids) => {
      note("getEventsAsync", de, a, ids);
      return [
        { id: "e1", calendarId: "a", title: "Dentiste", startDate: "2026-11-03T08:00:00.000Z", endDate: "2026-11-03T09:00:00.000Z", availability: "busy" },
        { id: "e2", calendarId: "z", title: "Ailleurs", startDate: "2026-11-03T08:00:00.000Z", endDate: "2026-11-03T09:00:00.000Z" },
        { id: "e3", calendarId: "b", startDate: "2026-11-03T10:00:00.000Z", endDate: "2026-11-03T11:00:00.000Z", allDay: true, availability: "free", notes: "n" },
      ];
    },
    getEventByIdAsync: async (id) => {
      if (id === "absent") throw erreur("ERR_EVENT_NOT_FOUND");
      if (id === "panne") throw erreur("ERR_AUTRE");
      return { id, startDate: "2026-11-03T08:00:00.000Z", endDate: "2026-11-03T09:00:00.000Z" };
    },
    saveEventAsync: async (d, opt) => {
      note("saveEventAsync", d, opt);
      return "nouveau";
    },
    deleteEventAsync: async (d, opt) => void note("deleteEventAsync", d, opt),
    saveCalendarAsync: async (d) => {
      note("saveCalendarAsync", d);
      return "agenda";
    },
    ...o,
  };
  return { natif, appels };
}

test("agenda iPhone : agendas, principal par défaut, Google par CalDAV, local", async () => {
  const { natif, appels } = fauxAgenda();
  const ag = fabriquerAgendaIos(natif);
  const l = await ag.calendriers();
  assert.deepEqual(appels.getCalendarsAsync, [["event"]]);
  assert.deepEqual(l.map((c) => [c.id, c.principal, c.google, c.local, c.modifiable]), [
    ["a", true, false, false, true],
    ["b", false, true, false, true],
    ["c", false, false, true, false],
  ]);
  assert.equal(l[0]?.compte, "iCloud");
  assert.equal(l[2]?.couleur, null);
});

test("agenda iPhone : sans agenda par défaut, aucun principal", async () => {
  const { natif } = fauxAgenda({ getDefaultCalendarAsync: async () => Promise.reject(erreur("ERR")) });
  const l = await fabriquerAgendaIos(natif).calendriers();
  assert.ok(l.every((c) => !c.principal));
});

test("agenda iPhone : accès (iOS ne redemande pas après un refus)", async () => {
  const { natif } = fauxAgenda();
  const ag = fabriquerAgendaIos(natif);
  assert.equal(await ag.lireAcces(), "aDemander");
  assert.equal(await ag.demanderAcces(), "refuse");
  const vide = fabriquerAgendaIos(null);
  assert.equal(vide.disponible(), false);
  assert.equal(await vide.lireAcces(), "indisponible");
  assert.deepEqual(await vide.calendriers(), []);
});

test("agenda iPhone : événements des seuls agendas demandés, dates ISO", async () => {
  const { natif, appels } = fauxAgenda();
  const ag = fabriquerAgendaIos(natif);
  const de = Date.UTC(2026, 10, 3);
  const l = await ag.evenements(["a", "b"], de, de + 86_400_000);
  assert.deepEqual(appels.getEventsAsync?.[0], ["2026-11-03T00:00:00.000Z", "2026-11-04T00:00:00.000Z", ["a", "b"]]);
  assert.deepEqual(l.map((e) => e.id), ["e1", "e3"]);
  assert.deepEqual(l[1], { id: "e3", calendrierId: "b", titre: "", debut: Date.UTC(2026, 10, 3, 10), fin: Date.UTC(2026, 10, 3, 11), journee: true, libre: true, notes: "n" });
  assert.deepEqual(await ag.evenements([], de, de + 1), []);
});

test("agenda iPhone : un événement supprimé rend null, une autre panne remonte", async () => {
  const { natif } = fauxAgenda();
  const ag = fabriquerAgendaIos(natif);
  assert.deepEqual(await ag.evenement("e1"), { debut: Date.UTC(2026, 10, 3, 8), fin: Date.UTC(2026, 10, 3, 9) });
  assert.equal(await ag.evenement("absent"), null);
  await assert.rejects(ag.evenement("panne"));
});

test("agenda iPhone : écrire, modifier, supprimer, créer l'agenda local", async () => {
  const { natif, appels } = fauxAgenda();
  const ag = fabriquerAgendaIos(natif);
  const d = { titre: "Footing", notes: "lien", lieu: null, debut: Date.UTC(2026, 10, 3, 18), fin: Date.UTC(2026, 10, 3, 19) };
  assert.equal(await ag.creerEvenement("a", d), "nouveau");
  await ag.modifierEvenement("e1", { ...d, lieu: "Parc" });
  await ag.supprimerEvenement("e1");
  const [cree, modif] = appels.saveEventAsync ?? [];
  assert.deepEqual(cree?.[0], {
    title: "Footing", notes: "lien", location: "", startDate: "2026-11-03T18:00:00.000Z", endDate: "2026-11-03T19:00:00.000Z", allDay: false,
    availability: "busy", calendarId: "a",
  });
  assert.equal((modif?.[0] as { id: string }).id, "e1");
  assert.equal((modif?.[0] as { location: string }).location, "Parc");
  assert.deepEqual(modif?.[1], { futureEvents: false });
  assert.deepEqual(appels.deleteEventAsync, [[{ id: "e1" }, { futureEvents: false }]]);

  assert.equal(await ag.creerAgendaLocal("pepfit"), "agenda");
  assert.deepEqual(appels.saveCalendarAsync?.[0], [{ title: "pepfit", color: ORANGE_SPORT_ARGB, entityType: "event", sourceId: "s2" }]);
  assert.equal(ORANGE_SPORT_ARGB.toString(16), "fff97316");
});

test("agenda iPhone : source « Sur mon iPhone » cachée (iCloud allumé), l'agenda va à la source par défaut", async () => {
  const { natif, appels } = fauxAgenda({ getSourcesAsync: async () => [{ id: "s1", name: "iCloud", type: "caldav" }] });
  await fabriquerAgendaIos(natif).creerAgendaLocal("pepfit");
  assert.equal("sourceId" in (appels.saveCalendarAsync?.[0]?.[0] as object), false);
});

test("déverrouillage iPhone : réponse du module, refus en « annule », fenêtre en cours le temps du retour", async () => {
  const relances: (() => void)[] = [];
  const dv = fabriquerDeverrouillage({ deverrouiller: async () => "ok", estProtege: () => true, masquerApercu: async () => true }, (f) => relances.push(f));
  assert.equal(await dv.deverrouiller("t", "s"), "ok");
  assert.equal(dv.deverrouillageEnCours(), true);
  relances.forEach((f) => f());
  assert.equal(dv.deverrouillageEnCours(), false);
  assert.equal(dv.estProtege(), true);
  assert.equal(await dv.masquerApercu(true), true);

  const panne = fabriquerDeverrouillage({ deverrouiller: async () => Promise.reject(new Error()), estProtege: () => { throw new Error(); } }, () => {});
  assert.equal(await panne.deverrouiller("t", "s"), "annule");
  assert.equal(panne.estProtege(), null);
  assert.equal(await panne.masquerApercu(true), false);

  const absent = fabriquerDeverrouillage(null);
  assert.equal(await absent.deverrouiller("t", "s"), "indisponible");
  assert.equal(absent.deverrouillageEnCours(), false);
  assert.equal(absent.estProtege(), null);
});

test("endormir iPhone : null rend la luminosité (-1), pannes avalées", async () => {
  const appels: unknown[][] = [];
  const e = fabriquerEndormir({
    luminosite: async (v) => void appels.push(["l", v]),
    tonalite: async (...a) => Promise.reject(new Error(String(a))),
    silence: async () => void appels.push(["s"]),
  });
  assert.equal(e.disponible, true);
  await e.luminosite(0.1);
  await e.luminosite(null);
  await e.tonalite(220, 900, 0.2);
  await e.silence();
  assert.deepEqual(appels, [["l", 0.1], ["l", -1], ["s"]]);
  assert.equal(fabriquerEndormir(null).disponible, false);
  await fabriquerEndormir(null).luminosite(null);
});

test("cookies iPhone : lecture du module, chaîne vide sans lui", async () => {
  let efface = false;
  const c = fabriquerCookies({ lire: async (u) => `a=${u}`, effacer: async () => void (efface = true) });
  assert.equal(await c.lire("https://x"), "a=https://x");
  await c.effacer();
  assert.equal(efface, true);
  assert.equal(await fabriquerCookies(null).lire("https://x"), "");
  await fabriquerCookies({ lire: async () => "" }).effacer();
});

test("navigateur iPhone : ouvrir, jamais derrière, connexion fermée = null", async () => {
  const n = fabriquerNavigateur({ ouvrir: () => true, passerDerriere: () => false, authentifier: async () => Promise.reject(new Error()) });
  assert.equal(n.ouvrir("https://example.org/aide"), true);
  assert.equal(n.passerDerriere(), false);
  assert.equal(await n.authentifier("https://x", "pepfit"), null);
  const vide = fabriquerNavigateur(null);
  assert.equal(vide.ouvrir("https://x"), false);
  assert.equal(await vide.authentifier("https://x", "pepfit"), null);
});

test("autorisation OAuth : Android ouvre le navigateur, l'iPhone la feuille d'Apple puis le lien de retour", async () => {
  const ouverts: string[] = [];
  const ouvrirLien = async (u: string) => void ouverts.push(u);
  const demandes: string[][] = [];
  const authentifier = async (url: string, schema: string) => (demandes.push([url, schema]), "pepfitopen://whoop?code=1&state=2");

  await ouvrirAutorisation("https://whoop/auth", { ios: false, authentifier, ouvrirLien });
  assert.deepEqual(ouverts, ["https://whoop/auth"]);
  assert.deepEqual(demandes, []);

  await ouvrirAutorisation("https://whoop/auth", { ios: true, authentifier, ouvrirLien });
  assert.deepEqual(demandes, [["https://whoop/auth", SCHEMA]]);
  assert.deepEqual(ouverts, ["https://whoop/auth", "pepfitopen://whoop?code=1&state=2"]);

  // fermée, ou une adresse d'un autre schéma : rien
  await ouvrirAutorisation("https://whoop/auth", { ios: true, authentifier: async () => null, ouvrirLien });
  await ouvrirAutorisation("https://whoop/auth", { ios: true, authentifier: async () => "https://ailleurs", ouvrirLien });
  assert.equal(ouverts.length, 2);
  assert.equal(SCHEMA, exiger("../app.json").expo.scheme);
});

test("textes iPhone : clés existantes, mêmes clés en anglais, plus un mot d'Android", () => {
  const cles = Object.keys(SURCHARGES_IPHONE.fr).sort();
  assert.ok(cles.length > 10);
  assert.deepEqual(Object.keys(SURCHARGES_IPHONE.en).sort(), cles);
  for (const c of cles) assert.equal(typeof (fr as Record<string, unknown>)[c], "string", c);
  for (const langue of ["fr", "en"] as const) {
    for (const [c, v] of Object.entries(SURCHARGES_IPHONE[langue])) {
      assert.doesNotMatch(v ?? "", /android/i, `${langue} ${c}`);
      assert.ok(v?.trim(), `${langue} ${c}`);
    }
  }
});

test("plugins iPhone : textes d'autorisation en français, branchés dans app.json", () => {
  const dv = exiger("../plugins/ios-deverrouillage.js");
  const ag = exiger("../plugins/ios-agenda.js");
  assert.deepEqual(Object.keys(dv.CLES), ["NSFaceIDUsageDescription"]);
  assert.deepEqual(Object.keys(ag.CLES).sort(), [
    "NSCalendarsFullAccessUsageDescription", "NSCalendarsUsageDescription", "NSRemindersFullAccessUsageDescription", "NSRemindersUsageDescription",
  ]);
  for (const v of [...Object.values(dv.CLES), ...Object.values(ag.CLES)] as string[]) assert.match(v, /^pepfit .*\.$/);
  const plugins = exiger("../app.json").expo.plugins as unknown[];
  assert.ok(plugins.includes("./plugins/ios-deverrouillage.js"));
  assert.ok(plugins.includes("./plugins/ios-agenda.js"));
});

test("modules natifs : Android et iPhone déclarés, un fichier Swift par module", async () => {
  const { existsSync, readFileSync } = await import("node:fs");
  const noms: Record<string, string> = {
    "pepfit-deverrouillage": "PepfitDeverrouillage", "pepfit-endormir": "PepfitEndormir",
    "pepfit-cookies": "PepfitCookies", "pepfit-navigateur": "PepfitNavigateur",
  };
  for (const [dossier, nom] of Object.entries(noms)) {
    const racine = new URL(`../modules/${dossier}/`, import.meta.url);
    const conf = JSON.parse(readFileSync(new URL("expo-module.config.json", racine), "utf8"));
    assert.deepEqual(conf.platforms, ["android", "apple"], dossier);
    assert.deepEqual(conf.apple.modules, [`${nom}Module`], dossier);
    assert.ok(existsSync(new URL(`ios/${nom}.podspec`, racine)), dossier);
    const swift = readFileSync(new URL(`ios/${nom}Module.swift`, racine), "utf8");
    assert.match(swift, new RegExp(`Name\\("${nom}"\\)`), dossier);
  }
});
