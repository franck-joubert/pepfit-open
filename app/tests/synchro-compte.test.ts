// Un compte par téléphone (planche compte-connexion, D3, 2e) : le premier passage d'un compte ne mêle jamais en silence les
// données déjà sur le téléphone (ChoixRequis), « effacer » les retire avant de tirer, « ajouter » les envoie ; l'état de
// synchro appartient au compte (un autre compte repart d'un premier passage), et le même compte reprend sans question.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ajouterPesee, listerPesees } from "../src/db/depots/pesees.ts";
import { ajouterSerie, demarrerSeance, terminerSeance } from "../src/db/depots/seances.ts";
import type { Executeur } from "../src/db/executeur.ts";
import { aleatoire, pret } from "../src/sync/chiffrement.ts";
import { ChoixRequis, choixDonneesIci, ecrireChoixDonnees, synchroniser, type Changement, type Lot, type Transport } from "../src/sync/moteur.ts";
import { baseDeTest } from "./aide.ts";

/** Serveur en mémoire d'un compte : une ligne par (table, clé), un numéro d'ordre tient lieu de curseur. */
class Serveur {
  lignes = new Map<string, Changement & { seq: number }>();
  seq = 0;
  transport(): Transport {
    return {
      pousser: async (lot: Changement[]) => {
        for (const c of lot) this.lignes.set(`${c.tab}/${c.cle}`, { ...c, seq: ++this.seq });
      },
      tirer: async (curseur: string | null, limite: number): Promise<Lot> => {
        const l = [...this.lignes.values()].filter((x) => x.seq > (curseur ? Number(curseur) : 0)).sort((a, b) => a.seq - b.seq);
        const page = l.slice(0, limite);
        return { changements: page.map(({ seq: _, ...c }) => c), curseur: page.length ? String(page.at(-1)!.seq) : curseur, encore: l.length > limite };
      },
      envoyerFichier: async () => {},
      lireFichier: async () => null,
      supprimerFichier: async () => {},
    };
  }
  nombre = (tab: string) => [...this.lignes.values()].filter((c) => c.tab === tab && !c.supprime).length;
}

async function seance(db: Executeur) {
  const id = await demarrerSeance(db, null, "Push");
  await ajouterSerie(db, { seanceId: id, exerciceId: "cat:couche", kg: 60, reps: 8 });
  await terminerSeance(db, id);
  return id;
}

const compter = async (db: Executeur, tab: string) => (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${tab}`, []))!.n;
const echec = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

/** Un téléphone utilisé sans compte (une séance, une pesée), et le compte « alex » qui a déjà les siennes. */
async function monter() {
  await pret();
  const alex = new Serveur();
  const cle = aleatoire(32);
  const autre = await baseDeTest(true);
  await seance(autre.db);
  await ajouterPesee(autre.db, 70, Date.now() - 86400000);
  await ajouterPesee(autre.db, 71, Date.now() - 2 * 86400000);
  // Compte créé sur ce téléphone-là : ses données le rejoignent sans question (account/code, mode création).
  await ecrireChoixDonnees(autre.db, "ajouter");
  await synchroniser({ db: autre.db, transport: alex.transport(), cle, noeud: "X", compte: "alex" });
  const ici = await baseDeTest(true);
  await seance(ici.db);
  await ajouterPesee(ici.db, 82, Date.now() - 3 * 86400000);
  const sync = (compte = "alex", serveur = alex) => synchroniser({ db: ici.db, transport: serveur.transport(), cle, noeud: "T", compte });
  return { alex, ici, sync, cle };
}

test("premier passage avec des données ici : ChoixRequis avec les nombres, rien n'est tiré ni envoyé", async () => {
  const { alex, ici, sync } = await monter();
  const avant = alex.seq;
  assert.deepEqual(await choixDonneesIci(ici.db, "alex"), { seances: 1, pesees: 1 });
  const e = await echec(sync());
  assert.ok(e instanceof ChoixRequis);
  assert.deepEqual(e.donnees, { seances: 1, pesees: 1 });
  assert.equal(alex.seq, avant, "rien d'envoyé");
  assert.equal((await listerPesees(ici.db)).length, 1, "rien de tiré");
});

test("« Les ajouter au compte » : elles partent avec le reste ; ensuite plus de question", async () => {
  const { alex, ici, sync } = await monter();
  await ecrireChoixDonnees(ici.db, "ajouter");
  await sync();
  assert.equal(await compter(ici.db, "seances"), 2);
  assert.equal((await listerPesees(ici.db)).length, 3);
  assert.equal(alex.nombre("seances"), 2);
  assert.equal(await choixDonneesIci(ici.db, "alex"), null);
  await sync();
});

test("« Les effacer de ce téléphone » : seules restent celles du compte, rien des anciennes n'est envoyé", async () => {
  const { alex, ici, sync } = await monter();
  await ecrireChoixDonnees(ici.db, "effacer");
  await sync();
  assert.equal(await compter(ici.db, "seances"), 1);
  assert.deepEqual((await listerPesees(ici.db)).map((p) => p.kg).sort(), [70, 71]);
  assert.equal(alex.nombre("seances"), 1);
  assert.equal(alex.nombre("pesee"), 2);
  assert.equal(await compter(ici.db, "sync_journal"), 0);
});

test("même compte qu'avant (jeton expiré, suppression annulée) : pas de question, le journal du délai part", async () => {
  const { alex, ici, sync } = await monter();
  await ecrireChoixDonnees(ici.db, "ajouter");
  await sync();
  await seance(ici.db); // séance du délai, faite sans compte
  assert.equal(await choixDonneesIci(ici.db, "alex"), null);
  await sync();
  assert.equal(alex.nombre("seances"), 3);
});

test("un autre compte sur ce téléphone : premier passage, question posée ; le journal de l'ancien compte ne part pas chez lui", async () => {
  const { ici, sync } = await monter();
  await ecrireChoixDonnees(ici.db, "ajouter");
  await sync();
  await seance(ici.db); // en attente pour alex
  const sam = new Serveur();
  assert.deepEqual(await choixDonneesIci(ici.db, "sam"), { seances: 3, pesees: 3 });
  assert.ok((await echec(sync("sam", sam))) instanceof ChoixRequis);
  assert.equal(sam.seq, 0);
  await ecrireChoixDonnees(ici.db, "effacer");
  await sync("sam", sam);
  assert.equal(await compter(ici.db, "seances"), 0);
  assert.equal(sam.nombre("seances"), 0, "rien d'alex chez sam");
});

test("état d'avant la clé « compte » (déjà synchronisé) : adopté par le compte connecté, sans question", async () => {
  const { alex, ici, cle } = await monter();
  await synchroniser({ db: ici.db, transport: alex.transport(), cle, noeud: "T" });
  assert.equal(await choixDonneesIci(ici.db, "alex"), null);
  await synchroniser({ db: ici.db, transport: alex.transport(), cle, noeud: "T", compte: "alex" });
});
