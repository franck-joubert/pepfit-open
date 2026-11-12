// Le suivi du cycle en base (planche cycle, NOTES § 2) : le réglage par défaut d'après le sexe, la saisie (début, fin ou
// « pas encore », intensité, notes), la lecture de Santé Connect (jamais par-dessus une saisie), l'effacement, et la synchro de
// deux téléphones : tout part chiffré, le jour compris ; la saisie l'emporte sur Santé Connect ; le même jour noté des deux
// côtés reste une seule ligne.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import {
  assurerCycleSante, ecrireReglageCycle, effacerCycle, importerReglesSante, lireCycle, lireJoursCycle, lireReglagesCycle, noterJour, noterRegles,
  oublierLectureCycle, retirerRegles,
} from "../src/cycle/donnees.ts";
import { garderSaisieCycle, REGLAGES_SYNC, tableSync } from "../src/sync/schema.ts";
import { aleatoire, pret } from "../src/sync/chiffrement.ts";
import { synchroniser, type Changement, type Lot, type Transport } from "../src/sync/moteur.ts";
import { fabriquerSante, PERMISSIONS } from "../src/natif/sante/logique.ts";

const MAINTENANT = new Date(2026, 9, 30, 19, 10).getTime();
const a = (j: number, h = 8) => new Date(2026, 9, j, h).getTime();

test("le réglage : allumé si le profil dit « f », éteint sinon ; un choix explicite l'emporte et ne change plus avec le sexe", async () => {
  const { db } = await baseDeTest();
  assert.equal((await lireReglagesCycle(db)).suivi, false);
  await ecrireReglage(db, "sexe", "f");
  const r = await lireReglagesCycle(db);
  assert.deepEqual([r.suivi, r.propose, r.recup, r.poids, r.prevision, r.mentionEffort, r.santeConnect], [true, true, true, true, true, true, true]);
  await ecrireReglageCycle(db, "suivi", false);
  assert.equal((await lireReglagesCycle(db)).suivi, false);
  await ecrireReglage(db, "sexe", "h");
  await ecrireReglageCycle(db, "suivi", true);
  await ecrireReglage(db, "sexe", "f");
  await ecrireReglage(db, "sexe", "h");
  const h = await lireReglagesCycle(db);
  assert.deepEqual([h.suivi, h.explicite, h.propose], [true, true, false], "activable par tous ; le sexe ne le change plus");
  await ecrireReglageCycle(db, "recup", false);
  assert.equal((await lireReglagesCycle(db)).recup, false);
  // les réglages du suivi voyagent
  for (const c of ["cycle_suivi", "cycle_sante_connect", "cycle_recup", "cycle_poids", "cycle_prevision", "cycle_mention_effort"]) assert.ok(REGLAGES_SYNC.includes(c), c);
});

test("la saisie : début et fin, « pas encore », les notes du jour, corriger et retirer un épisode", async () => {
  const { db, raw } = await baseDeTest();
  await ecrireReglage(db, "sexe", "f");
  await noterRegles(db, { debut: "2026-09-13", fin: "2026-09-17", flux: 2 }, MAINTENANT);
  // « pas encore » : du début à aujourd'hui, l'épisode reste ouvert
  await noterRegles(db, { debut: "2026-10-28", fin: null, flux: 3, notes: { energie: 1, gene: 2 } }, MAINTENANT);
  const l = raw.prepare("SELECT jour, flux, fin, energie, humeur, gene, source FROM cycle_jour ORDER BY jour").all() as Record<string, unknown>[];
  assert.deepEqual(l.map((x) => x.jour), ["2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-10-28", "2026-10-29", "2026-10-30"]);
  assert.deepEqual(l.map((x) => x.fin), [0, 0, 0, 0, 1, 0, 0, 0]);
  assert.deepEqual([l[5]!.energie, l[5]!.humeur, l[5]!.gene, l[5]!.flux, l[5]!.source], [1, null, 2, 3, "saisie"]);
  const c = await lireCycle(db, "2026-10-30", MAINTENANT);
  assert.equal(c!.etat.episodes.at(-1)!.ouvert, true);
  assert.equal(c!.etat.phase!.j, 3);
  assert.equal(c!.etat.phase!.nom, "regles");
  // une note seule, un jour sans règles
  await noterJour(db, "2026-10-20", { humeur: 3 }, MAINTENANT);
  assert.equal((raw.prepare("SELECT flux FROM cycle_jour WHERE jour = '2026-10-20'").get() as { flux: unknown }).flux, null);
  await noterJour(db, "2026-10-20", { humeur: null }, MAINTENANT);
  assert.equal(raw.prepare("SELECT 1 FROM cycle_jour WHERE jour = '2026-10-20'").get(), undefined, "plus rien : la ligne part");
  // corriger : l'épisode raccourci perd ses anciens jours
  await noterRegles(db, { debut: "2026-09-14", fin: "2026-09-16", flux: 1, remplace: { debut: "2026-09-13", fin: "2026-09-17" } }, MAINTENANT);
  assert.deepEqual((raw.prepare("SELECT jour FROM cycle_jour WHERE jour < '2026-10-01' ORDER BY jour").all() as { jour: string }[]).map((x) => x.jour), ["2026-09-14", "2026-09-15", "2026-09-16"]);
  await retirerRegles(db, "2026-09-14", "2026-09-16", MAINTENANT);
  assert.equal((await lireJoursCycle(db)).filter((x) => x.jour < "2026-10-01").length, 0);
  assert.equal(await effacerCycle(db), 3);
  assert.equal((await lireJoursCycle(db)).length, 0);
  // suivi éteint : rien n'est lu
  await ecrireReglageCycle(db, "suivi", false);
  assert.equal(await lireCycle(db, "2026-10-30", MAINTENANT), null);
});

test("Santé Connect : périodes et flux deviennent des jours ; une saisie n'est jamais réécrite ; relu sans changement, rien n'est écrit", async () => {
  const { db, raw } = await baseDeTest();
  await ecrireReglage(db, "sexe", "f");
  await noterRegles(db, { debut: "2026-10-13", fin: "2026-10-13", flux: 1 }, MAINTENANT);
  const sc = {
    periodes: [{ debut: a(12, 0), fin: a(17, 0), id: "p1" }],
    flux: [{ date: a(12), flux: 3, id: "f1" }, { date: a(13), flux: 2, id: "f2" }, { date: a(14), flux: 9, id: "f3" }],
  };
  assert.equal(await importerReglesSante(db, sc, MAINTENANT), 4);
  const l = raw.prepare("SELECT jour, flux, fin, source, hc_id FROM cycle_jour ORDER BY jour").all() as Record<string, unknown>[];
  assert.deepEqual(l.map((x) => [x.jour, x.flux, x.fin, x.source]), [
    ["2026-10-12", 3, 0, "sante_connect"],
    ["2026-10-13", 1, 1, "saisie"],
    ["2026-10-14", 0, 0, "sante_connect"],
    ["2026-10-15", 0, 0, "sante_connect"],
    ["2026-10-16", 0, 1, "sante_connect"],
  ]);
  assert.equal(await importerReglesSante(db, sc, MAINTENANT + 1000), 0);
  // la lecture par le module (autorisation READ_MENSTRUATION seule), une fois par heure, seulement si la source est allumée
  const accordees = [PERMISSIONS.regles];
  let lectures = 0;
  const sante = fabriquerSante(
    {
      statut: async () => 3,
      autorisees: async () => accordees,
      regles: async () => (lectures++, sc),
    } as never,
    () => MAINTENANT,
  );
  oublierLectureCycle();
  await assurerCycleSante(db, (d, f) => sante.regles(d, f), MAINTENANT);
  await assurerCycleSante(db, (d, f) => sante.regles(d, f), MAINTENANT + 60_000);
  assert.equal(lectures, 1);
  await ecrireReglageCycle(db, "santeConnect", false);
  oublierLectureCycle();
  await assurerCycleSante(db, (d, f) => sante.regles(d, f), MAINTENANT);
  assert.equal(lectures, 1, "source coupée : rien n'est lu");
  assert.equal(PERMISSIONS.regles, "android.permission.health.READ_MENSTRUATION");
});

// ---------------------------------------------------------------- la synchro

class FauxServeur {
  lignes = new Map<string, Changement & { seq: number }>();
  seq = 0;
  transport(): Transport {
    return {
      pousser: async (lot) => {
        for (const c of lot) this.lignes.set(`${c.tab}/${c.cle}`, { ...c, seq: ++this.seq });
      },
      tirer: async (curseur, limite): Promise<Lot> => {
        const depuis = curseur ? Number(curseur) : 0;
        const l = [...this.lignes.values()].filter((x) => x.seq > depuis).sort((a, b) => a.seq - b.seq);
        const p = l.slice(0, limite);
        return { changements: p.map(({ seq: _, ...c }) => c), curseur: p.length ? String(p.at(-1)!.seq) : curseur, encore: l.length > limite };
      },
      envoyerFichier: async () => {},
      lireFichier: async () => null,
      supprimerFichier: async () => {},
    };
  }
}

test("deux téléphones : tout voyage chiffré (le jour compris) ; la saisie l'emporte sur Santé Connect ; le même jour reste une ligne", async () => {
  await pret();
  const t = tableSync("cycle_jour")!;
  assert.equal(t.garderLocale, garderSaisieCycle);
  assert.deepEqual(t.cles, ["id"]);
  const cle = aleatoire(32);
  const serveur = new FauxServeur();
  const A = await baseDeTest();
  const B = await baseDeTest();
  const sync = (x: { db: typeof A.db }, noeud: string) => synchroniser({ db: x.db, transport: serveur.transport(), cle, noeud });
  await ecrireReglage(A.db, "sexe", "f");
  await noterRegles(A.db, { debut: "2026-10-12", fin: "2026-10-16", flux: 2, notes: { humeur: 1 } }, MAINTENANT);
  await sync(A, "A");
  const lignes = [...serveur.lignes.values()].filter((c) => c.tab === "cycle_jour");
  assert.equal(lignes.length, 5);
  for (const c of lignes) {
    assert.doesNotMatch(c.cle, /2026/, "la clé ne dit pas le jour");
    assert.doesNotMatch(c.charge ?? "", /2026-10|"flux"|"humeur"|saisie|sante_connect/, "rien en clair");
    assert.deepEqual(Object.keys(JSON.parse(c.charge!)).sort(), ["_s", "id", "maj_le"]);
  }
  // le réglage voyage, chiffré
  await ecrireReglageCycle(A.db, "poids", false);
  await sync(A, "A");
  assert.doesNotMatch(serveur.lignes.get("reglages/cycle_poids")!.charge ?? "", /non/);
  await sync(B, "B");
  assert.deepEqual((await lireJoursCycle(B.db)).map((x) => [x.jour, x.flux, x.humeur]), (await lireJoursCycle(A.db)).map((x) => [x.jour, x.flux, x.humeur]));
  await ecrireReglage(B.db, "sexe", "f");
  assert.equal((await lireReglagesCycle(B.db)).poids, false);

  // B lit Santé Connect pour un jour que A a saisi : la saisie reste, partout
  await importerReglesSante(B.db, { periodes: [], flux: [{ date: a(12), flux: 3, id: "f9" }] }, MAINTENANT + 5000);
  assert.equal((await lireJoursCycle(B.db)).find((x) => x.jour === "2026-10-12")!.flux, 2, "la saisie n'est pas réécrite");
  // A corrige la ligne en Santé Connect sur B (ligne forcée) : à la synchro, la saisie de A gagne
  B.raw.prepare("UPDATE cycle_jour SET source = 'sante_connect', flux = 3, maj_le = ? WHERE jour = '2026-10-13'").run(MAINTENANT + 9000);
  await sync(B, "B");
  await sync(A, "A");
  assert.equal((await lireJoursCycle(A.db)).find((x) => x.jour === "2026-10-13")!.flux, 2, "garderSaisieCycle");

  // le même jour créé sur les deux téléphones avant la synchro : une seule ligne, la saisie avant Santé Connect
  await importerReglesSante(A.db, { periodes: [], flux: [{ date: a(20), flux: 1, id: "f20" }] }, MAINTENANT + 10_000);
  await noterRegles(B.db, { debut: "2026-10-20", fin: "2026-10-20", flux: 3 }, MAINTENANT + 20_000);
  await sync(A, "A");
  await sync(B, "B");
  await sync(A, "A");
  for (const x of [A, B]) {
    const l = x.raw.prepare("SELECT flux, source FROM cycle_jour WHERE jour = '2026-10-20'").all() as Record<string, unknown>[];
    assert.deepEqual(l.map((r) => [r.flux, r.source]), [[3, "saisie"]]);
  }
  // effacer l'historique sur A : B le perd aussi
  await effacerCycle(A.db);
  await sync(A, "A");
  await sync(B, "B");
  assert.equal((await lireJoursCycle(B.db)).length, 0);
});
