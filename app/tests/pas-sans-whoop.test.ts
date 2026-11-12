// Pas du jour sans Whoop (6/11) : la jauge et la page Pas montrent ceux de Santé Connect, même quand l'agrégat de Santé Connect n'en
// rend aucun (l'appli de la montre hors de ses priorités) : fusion des enregistrements bruts, montre et téléphone comptés une fois.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { fabriquerSante, fusionnerPasBruts, PERMISSIONS, type NatifSante } from "../src/natif/sante/logique.ts";
import { lirePasJour, lirePasJours, derniersJours, type SantePas } from "../src/ecrans/pas-source.ts";
import { lireDonneesPas } from "../src/ecrans/mesures/pas-donnees.ts";
import { enregistrerJours, purgerWhoop } from "../src/whoop/depot.ts";

const H = 3_600_000;
const MIN = 60_000;
// ven. 6 nov. 2026, 22 h 41 : le jour de la capture
const MAINTENANT = new Date(2026, 10, 6, 22, 41).getTime();
const MINUIT = new Date(2026, 10, 6).getTime();
const MONTRE = "com.sec.android.app.shealth";
const TEL = "com.google.android.apps.fitness";

const rec = (debut: number, fin: number, pas: number, origine: string) => ({ debut, fin, pas, origine });

test("fusion des bruts : montre et téléphone comptent les mêmes pas, la plus haute appli l'emporte ; prorata aux bornes", () => {
  const montre = [rec(MINUIT + 7 * H, MINUIT + 8 * H, 3000, MONTRE), rec(MINUIT + 12 * H, MINUIT + 13 * H, 5000, MONTRE)];
  const tel = [rec(MINUIT + 7 * H, MINUIT + 13 * H, 7000, TEL)];
  assert.equal(fusionnerPasBruts([...montre, ...tel], MINUIT, MAINTENANT), 8000, "pas 15 000 : la montre (8 000) l'emporte sur le téléphone (7 000)");
  assert.equal(fusionnerPasBruts(tel, MINUIT, MAINTENANT), 7000);
  // un enregistrement à cheval sur la borne : sa part dans la plage seulement
  assert.equal(fusionnerPasBruts([rec(MINUIT - H, MINUIT + H, 2000, MONTRE)], MINUIT, MAINTENANT), 1000);
  assert.equal(fusionnerPasBruts([], MINUIT, MAINTENANT), null);
  assert.equal(fusionnerPasBruts([rec(MINUIT - 3 * H, MINUIT - 2 * H, 900, MONTRE)], MINUIT, MAINTENANT), null, "rien dans la plage");
});

function natifSimule(o: { agregat: number; bruts: ReturnType<typeof rec>[]; sansBruts?: boolean }) {
  const appels: string[] = [];
  const natif: NatifSante = {
    statut: async () => 3,
    autorisees: async () => [PERMISSIONS.pas],
    demander: async () => [PERMISSIONS.pas],
    poids: async () => [],
    pas: async (b) => (appels.push("pas"), b.slice(1).map(() => o.agregat)),
    sommeil: async () => [],
    frequenceRepos: async () => [],
    exporter: async () => {},
    mesures: async () => [],
    seancesSport: async () => [],
    kcalActives: async (b) => b.slice(1).map(() => -1),
    installees: async () => [],
    ouvrir: async () => {},
    ...(o.sansBruts ? {} : { pasBruts: async () => (appels.push("bruts"), o.bruts) }),
  };
  return { appels, sante: fabriquerSante(natif, () => MAINTENANT) };
}

test("agrégat vide aujourd'hui : les enregistrements bruts donnent les pas, pour la jauge (un jour) et la page (plusieurs jours)", async () => {
  const bruts = [rec(MINUIT + 7 * H, MINUIT + 8 * H, 4000, MONTRE), rec(MINUIT + 9 * H, MINUIT + 10 * H, 3393, MONTRE), rec(MINUIT + 7 * H, MINUIT + 10 * H, 6000, TEL)];
  const { sante, appels } = natifSimule({ agregat: -1, bruts });
  assert.equal(await sante.pasEntre(MINUIT, MAINTENANT), 7393);
  // la page : plusieurs jours en une lecture, seul aujourd'hui est complété
  assert.deepEqual(await sante.pasIntervalles([MINUIT - 24 * H, MINUIT, MAINTENANT]), [null, 7393]);
  assert.ok(appels.includes("bruts"));
});

test("agrégat présent : il est gardé tel quel, les enregistrements bruts ne sont pas lus", async () => {
  const { sante, appels } = natifSimule({ agregat: 13_393, bruts: [rec(MINUIT, MINUIT + H, 50, MONTRE)] });
  assert.equal(await sante.pasEntre(MINUIT, MAINTENANT), 13_393);
  assert.deepEqual(await sante.pasIntervalles([MINUIT - 24 * H, MINUIT, MAINTENANT]), [13_393, 13_393]);
  assert.deepEqual(appels.filter((a) => a === "bruts"), []);
});

test("module natif ancien (sans pasBruts) : comme avant, rien d'inventé", async () => {
  const { sante } = natifSimule({ agregat: -1, bruts: [], sansBruts: true });
  assert.equal(await sante.pasEntre(MINUIT, MAINTENANT), null);
});

test("pas Whoop du jour gardés dans le journal, puis purgés : la jauge du jour et la page Pas lisent Santé Connect, pas « — »", async () => {
  const { db } = await baseDeTest();
  // journal relu d'une autre installation : des pas Whoop d'aujourd'hui et d'hier
  await enregistrerJours(db, [{ jour: MINUIT, sommeilMin: null, vfc: null, fcRepos: null, pas: 13_393 }, { jour: MINUIT - 24 * H, sommeilMin: null, vfc: null, fcRepos: null, pas: 9000 }] as never, MAINTENANT);
  const bruts = [rec(MINUIT + 7 * H, MINUIT + 10 * H, 11_000, MONTRE)];
  const { sante } = natifSimule({ agregat: -1, bruts });
  // le jour en cours, que plus rien ne met à jour, ne vaut rien face à Santé Connect
  assert.deepEqual(await lirePasJour(db, MINUIT, MAINTENANT, sante), { etat: "valeur", pas: 11_000, source: "sante" });
  // purge de Whoop, comme deconnecter(db, true)
  await purgerWhoop(db);
  assert.deepEqual(await lirePasJour(db, MINUIT, MAINTENANT, sante), { etat: "valeur", pas: 11_000, source: "sante" });
  const page = await lireDonneesPas(db, MAINTENANT, sante, 2000);
  assert.deepEqual(page.aujourdhui, { etat: "valeur", pas: 11_000, source: "sante" });
});

test("une lecture ratée (délai, limite de débit) garde le dernier nombre lu du jour ; « rien » reste « rien »", async () => {
  const { db } = await baseDeTest();
  const jour = new Date(2026, 10, 5).getTime();
  const maintenant = jour + 20 * H;
  let etat: "ok" | "panne" | "rien" = "ok";
  const s: SantePas = {
    autorisees: async () => ["pas"],
    pasEntre: async () => {
      if (etat === "panne") throw new Error("délai dépassé");
      return etat === "ok" ? 8400 : null;
    },
  };
  assert.deepEqual(await lirePasJour(db, jour, maintenant, s), { etat: "valeur", pas: 8400, source: "sante" });
  etat = "panne";
  assert.deepEqual(await lirePasJour(db, jour, maintenant, s), { etat: "valeur", pas: 8400, source: "sante" });
  etat = "rien";
  assert.deepEqual(await lirePasJour(db, jour, maintenant, s), { etat: "vide", source: "sante" });
  // un autre jour jamais lu, en panne : vide (rien d'inventé)
  etat = "panne";
  assert.deepEqual(await lirePasJour(db, jour - 24 * H, maintenant, s), { etat: "vide", source: "sante" });
  assert.deepEqual(derniersJours(1, MAINTENANT), [MINUIT]);
  assert.equal((await lirePasJours(db, [], MAINTENANT, s)).length, 0);
});
