// Travaux de fond du lancement (ecrans/demarrage.ts, docs/AUDIT-PERF.md M11) : rien avant le premier écran, un à la fois,
// hors des gestes, plafond d'attente, secours sans Accueil.
import assert from "node:assert/strict";
import { test } from "node:test";
import { APRES_ECRAN_MS, ATTENTE_MAX_MS, CALME_MS, creerFileDemarrage, PLAFOND_MS, SECOURS_MS, type Horloge } from "../src/ecrans/demarrage.ts";

/** Horloge simulée : le temps n'avance que par avancer(). */
function horloge(geste = -Infinity) {
  let t = 0;
  let dernierGeste = geste;
  const attentes: { fin: number; ok: () => void }[] = [];
  const h: Horloge = {
    maintenant: () => t,
    attendre: (ms) => new Promise((ok) => attentes.push({ fin: t + ms, ok })),
    libre: () => Promise.resolve(),
    inactivite: () => t - dernierGeste,
  };
  const vider = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  return {
    h,
    geste: () => void (dernierGeste = t),
    async avancer(ms: number) {
      const cible = t + ms;
      await vider();
      for (;;) {
        attentes.sort((a, b) => a.fin - b.fin);
        const a = attentes[0];
        if (!a || a.fin > cible) break;
        attentes.shift();
        t = a.fin;
        a.ok();
        await vider();
      }
      t = cible;
      await vider();
    },
  };
}

test("rien ne part avant le premier écran ; ensuite, un à la fois, dans l'ordre", async () => {
  const c = horloge();
  const f = creerFileDemarrage(c.h);
  const parties: string[] = [];
  let finirSynchro!: () => void;
  f.enFond("synchro", () => {
    parties.push("synchro");
    return new Promise<void>((ok) => (finirSynchro = ok));
  });
  f.enFond("cartes", () => void parties.push("cartes"));
  await c.avancer(1000);
  assert.deepEqual(parties, []);
  f.signalerPremierEcran();
  // le premier toucher passe seul
  await c.avancer(APRES_ECRAN_MS - 1);
  assert.deepEqual(parties, []);
  await c.avancer(1);
  assert.deepEqual(parties, ["synchro"]);
  // la synchro n'est pas finie : les cartes attendent
  await c.avancer(PLAFOND_MS / 2);
  assert.deepEqual(parties, ["synchro"]);
  finirSynchro();
  await c.avancer(0);
  assert.deepEqual(parties, ["synchro", "cartes"]);
});

test("une tâche qui ne finit pas ne retient la suite que PLAFOND_MS", async () => {
  const c = horloge();
  const f = creerFileDemarrage(c.h);
  const parties: string[] = [];
  f.enFond("réseau", () => (parties.push("réseau"), new Promise(() => {})));
  f.enFond("corps", () => void parties.push("corps"));
  f.signalerPremierEcran();
  await c.avancer(APRES_ECRAN_MS + PLAFOND_MS - 1);
  assert.deepEqual(parties, ["réseau"]);
  await c.avancer(1);
  assert.deepEqual(parties, ["réseau", "corps"]);
});

test("un geste récent repousse la tâche suivante de CALME_MS (le toucher passe d'abord)", async () => {
  const c = horloge();
  const f = creerFileDemarrage(c.h);
  const parties: string[] = [];
  f.signalerPremierEcran();
  f.enFond("synchro", () => void parties.push("synchro"));
  await c.avancer(APRES_ECRAN_MS - 100);
  c.geste();
  await c.avancer(100 + CALME_MS - 100 - 1);
  assert.deepEqual(parties, []);
  await c.avancer(1);
  assert.deepEqual(parties, ["synchro"]);
});

test("des gestes sans fin ne bloquent pas la file au-delà de ATTENTE_MAX_MS", async () => {
  const c = horloge();
  const f = creerFileDemarrage(c.h);
  const parties: string[] = [];
  f.signalerPremierEcran();
  f.enFond("synchro", () => void parties.push("synchro"));
  // un geste toutes les 100 ms, de juste avant la fin du délai d'après l'écran jusqu'au bout de ATTENTE_MAX_MS
  await c.avancer(APRES_ECRAN_MS - 50);
  for (let i = 0; i < ATTENTE_MAX_MS / 100; i++) {
    c.geste();
    await c.avancer(100);
  }
  assert.deepEqual(parties, []);
  c.geste();
  await c.avancer(100);
  assert.deepEqual(parties, ["synchro"]);
});

test("sans Accueil (lien direct, parcours d'accueil), la file part au bout de SECOURS_MS", async () => {
  const c = horloge();
  const f = creerFileDemarrage(c.h);
  const parties: string[] = [];
  f.enFond("synchro", () => void parties.push("synchro"));
  await c.avancer(SECOURS_MS + APRES_ECRAN_MS - 1);
  assert.deepEqual(parties, []);
  await c.avancer(1);
  assert.deepEqual(parties, ["synchro"]);
});

test("un échec va au journal et n'arrête pas la file ; une tâche ajoutée plus tard (premier plan) passe aussi", async () => {
  const c = horloge();
  const erreurs: string[] = [];
  const f = creerFileDemarrage(c.h, (nom) => erreurs.push(nom));
  const parties: string[] = [];
  f.signalerPremierEcran();
  f.enFond("profil", () => Promise.reject(new Error("hors ligne")));
  f.enFond("lève", () => {
    throw new Error("tout de suite");
  });
  f.enFond("cartes", () => void parties.push("cartes"));
  await c.avancer(APRES_ECRAN_MS);
  await f.vide();
  assert.deepEqual(erreurs, ["profil", "lève"]);
  assert.deepEqual(parties, ["cartes"]);
  f.enFond("synchro", () => void parties.push("synchro"));
  await c.avancer(0);
  assert.deepEqual(parties, ["cartes", "synchro"]);
});
