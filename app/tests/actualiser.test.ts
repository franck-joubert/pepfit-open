// Tirer pour actualiser : règles du tirage, ordonnanceur (sources ensemble, attente plafonnée, délais par source, jamais deux
// actualisations à la fois) et relecture sans pastille « Synchronisé ».
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ATTENTE_SOURCES_MS,
  COURSE_MAX,
  creerActualiseur,
  DELAI_SOURCE_MS,
  decalageTirage,
  estHorsLigne,
  progressionTirage,
  REPOS_TIRAGE,
  SEUIL_TIRAGE,
  seuilFranchi,
  ZONE_MORTE,
  type Source,
} from "../src/actualiser/noyau";
import { relecture, synchroRecue } from "../src/sync/rafraichir";

test("progression : rien dans la zone morte, croissante, pleine au seuil", () => {
  assert.equal(progressionTirage(0), 0);
  assert.equal(progressionTirage(ZONE_MORTE), 0);
  assert.equal(progressionTirage(-40), 0);
  assert.equal(progressionTirage(SEUIL_TIRAGE), 1);
  assert.equal(progressionTirage(SEUIL_TIRAGE + 200), 1);
  let avant = 0;
  for (let dy = ZONE_MORTE + 1; dy <= SEUIL_TIRAGE; dy += 3) {
    const p = progressionTirage(dy);
    assert.ok(p > avant, `croissante à ${dy}`);
    assert.ok(p <= 1);
    avant = p;
  }
});

test("décalage de la page : suit le doigt dès la zone morte, au repos au seuil, jamais au-delà de la course max", () => {
  assert.equal(decalageTirage(0), 0);
  assert.equal(decalageTirage(ZONE_MORTE), 0);
  assert.equal(decalageTirage(-30), 0);
  assert.ok(Math.abs(decalageTirage(SEUIL_TIRAGE) - REPOS_TIRAGE) < 1e-9, "au seuil, la page est à sa place de repos");
  let avant = 0;
  for (let dy = ZONE_MORTE + 1; dy <= 600; dy += 7) {
    const d = decalageTirage(dy);
    assert.ok(d > avant, `croissant à ${dy}`);
    assert.ok(d < COURSE_MAX, `borné à ${dy}`);
    avant = d;
  }
  // elle suit le doigt avant le seuil (pas de retard visible), puis résiste : la pente baisse
  const pente = (a: number, b: number) => (decalageTirage(b) - decalageTirage(a)) / (b - a);
  assert.ok(pente(20, 30) > 0.8);
  assert.ok(pente(SEUIL_TIRAGE + 10, SEUIL_TIRAGE + 20) < 0.5);
  // le décalage va de pair avec la progression de l'indicateur : pleine au seuil
  assert.equal(progressionTirage(SEUIL_TIRAGE), 1);
});

test("seuil : franchi à partir du seuil seulement", () => {
  assert.equal(seuilFranchi(SEUIL_TIRAGE - 1), false);
  assert.equal(seuilFranchi(SEUIL_TIRAGE), true);
});

test("hors ligne : une erreur de réseau, pas une réponse du serveur", () => {
  assert.equal(estHorsLigne(new Error("Network request failed")), true);
  assert.equal(estHorsLigne(new Error("timeout of 8000ms exceeded")), true);
  assert.equal(estHorsLigne(Object.assign(new Error("network error"), { statut: 429 })), false);
  assert.equal(estHorsLigne(new Error("boom")), false);
  assert.equal(estHorsLigne(null), false);
});

function banc() {
  const appels: string[] = [];
  let t = 1_000_000;
  const source = (id: string, f?: () => Promise<unknown>): Source => ({
    id,
    executer: async () => {
      appels.push(id);
      await f?.();
    },
  });
  return { appels, source, avancer: (ms: number) => (t += ms), maintenant: () => t };
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("ordonnanceur : toutes les sources partent ensemble, la page attend leur retour", async () => {
  const b = banc();
  const journal: string[] = [];
  const lent = (id: string, ms: number) =>
    b.source(id, async () => {
      journal.push(`${id}:debut`);
      await pause(ms);
      journal.push(`${id}:fin`);
    });
  const a = creerActualiseur({ sources: [lent("serveur", 20), lent("whoop", 10), lent("withings", 5)], maintenant: b.maintenant, attente: 500 });
  assert.equal(await a.lancer(async () => void journal.push("page")), "fait");
  assert.deepEqual(journal.slice(0, 3), ["serveur:debut", "whoop:debut", "withings:debut"], "aucune n'attend l'autre");
  assert.equal(journal[journal.length - 1], "page", "la page se recalcule après les sources");
  assert.equal(journal.filter((x) => x === "page").length, 1, "toutes rentrées à temps : un seul recalcul");
});

test("ordonnanceur : une source lente n'est pas attendue au-delà du plafond, la page se refait quand elle arrive", async () => {
  const b = banc();
  const journal: string[] = [];
  let finir = () => {};
  const lente = new Promise<void>((r) => (finir = r));
  const a = creerActualiseur({
    sources: [b.source("serveur"), b.source("sante-connect", () => lente)],
    maintenant: b.maintenant,
    attente: 20,
  });
  const issue = await a.lancer(async () => void journal.push("page"));
  assert.equal(issue, "fait");
  assert.equal(a.enCours(), false, "l'indicateur peut s'arrêter : la source lente continue en fond");
  assert.deepEqual(journal, ["page"]);
  finir();
  await pause(5);
  assert.deepEqual(journal, ["page", "page"], "la lente a fini : la page se relit sans bruit");
});

test("ordonnanceur : le plafond est celui du noyau, sans durée minimale visible", async () => {
  assert.ok(ATTENTE_SOURCES_MS <= 400);
  const b = banc();
  const a = creerActualiseur({ sources: [b.source("serveur")], maintenant: b.maintenant });
  const t = Date.now();
  await a.lancer(async () => {});
  assert.ok(Date.now() - t < 100, "rien n'est retenu quand tout est déjà à jour");
});

test("ordonnanceur : une source n'est pas rappelée avant 15 s, chacune a son délai", async () => {
  const b = banc();
  const a = creerActualiseur({ sources: [b.source("serveur"), b.source("whoop")], maintenant: b.maintenant });
  await a.lancer();
  assert.deepEqual(b.appels, ["serveur", "whoop"]);
  b.avancer(DELAI_SOURCE_MS - 1);
  await a.lancer();
  assert.deepEqual(b.appels, ["serveur", "whoop"], "trop tôt : aucune source ne repart");
  b.avancer(1);
  await a.lancer();
  assert.deepEqual(b.appels, ["serveur", "whoop", "serveur", "whoop"], "15 s : elles repartent");
});

test("ordonnanceur : le recalcul de la page a lieu à chaque tirage, même quand les sources attendent", async () => {
  const b = banc();
  let recalculs = 0;
  const a = creerActualiseur({ sources: [b.source("serveur")], maintenant: b.maintenant });
  await a.lancer(async () => void recalculs++);
  await a.lancer(async () => void recalculs++);
  assert.equal(b.appels.length, 1);
  assert.equal(recalculs, 2);
});

test("ordonnanceur : jamais deux actualisations en parallèle", async () => {
  const b = banc();
  let ouvrir = () => {};
  const bloque = new Promise<void>((r) => (ouvrir = r));
  const a = creerActualiseur({ sources: [b.source("serveur", () => bloque)], maintenant: b.maintenant, attente: 5_000 });
  const premiere = a.lancer();
  assert.equal(a.enCours(), true);
  assert.equal(await a.lancer(), "occupe");
  ouvrir();
  assert.equal(await premiere, "fait");
  assert.equal(a.enCours(), false);
  assert.equal(b.appels.length, 1);
});

test("ordonnanceur : une source qui échoue n'arrête ni les autres ni le recalcul, et se signale", async () => {
  const b = banc();
  const echecs: string[] = [];
  let recalcule = false;
  const a = creerActualiseur({
    sources: [b.source("serveur", () => Promise.reject(new Error("Network request failed"))), b.source("whoop")],
    maintenant: b.maintenant,
    surEchec: (id) => echecs.push(id),
  });
  assert.equal(
    await a.lancer(async () => {
      recalcule = true;
      throw new Error("page");
    }),
    "fait",
  );
  assert.deepEqual(b.appels, ["serveur", "whoop"]);
  assert.deepEqual(echecs, ["serveur", "page"]);
  assert.equal(recalcule, true);
  assert.equal(a.enCours(), false);
});

test("ordonnanceur : les abonnés sont prévenus au départ et à la fin", async () => {
  const b = banc();
  const a = creerActualiseur({ sources: [b.source("serveur")], maintenant: b.maintenant });
  const vus: boolean[] = [];
  const off = a.abonner(() => vus.push(a.enCours()));
  await a.lancer();
  off();
  assert.deepEqual(vus, [true, false]);
});

test("relecture : prévient les écrans sans annoncer une arrivée de la synchro (pas de pastille)", () => {
  let n = 0;
  const off = relecture.abonner(() => n++);
  const v = relecture.version();
  const recue = synchroRecue.version();
  const dernier = synchroRecue.dernier();
  relecture.demander();
  off();
  assert.equal(n, 1);
  assert.equal(relecture.version(), v + 1);
  assert.equal(synchroRecue.version(), recue);
  assert.equal(synchroRecue.dernier(), dernier);
});
