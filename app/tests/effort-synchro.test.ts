// La charge de l'Effort voyage (migration 51, décision du 31/10, D2) : une charge calculée avec la FC de la séance n'est
// jamais remplacée par une charge calculée sans (un téléphone sans FC ne l'écrase pas, ni en recalculant ni par la synchro) ;
// à égalité, la plus récente gagne. L'empreinte, propre à chaque téléphone, ne voyage pas seule. Faux serveur en mémoire.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { rpeDeRir } from "../src/boutique/poids.ts";
import { effortSeance, recalculerCharges } from "../src/ecrans/effort-charges.ts";
import { aleatoire, pret } from "../src/sync/chiffrement.ts";
import { synchroniser, type Changement, type Lot, type Transport } from "../src/sync/moteur.ts";
import { garderChargeAvecFc, tableSync } from "../src/sync/schema.ts";
import { baseDeTest } from "./aide.ts";

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
  /** La charge de la séance telle que le serveur l'a. */
  charge(id: string): Record<string, unknown> | null {
    const l = this.lignes.get(`seance_charge/${id}`);
    return l && !l.supprime ? (JSON.parse(l.charge!) as Record<string, unknown>) : null;
  }
}

async function telephone(serveur: FauxServeur, cle: Uint8Array, noeud: string) {
  const { raw, db } = await baseDeTest();
  return { raw, db, sync: () => synchroniser({ db, transport: serveur.transport(), cle, noeud }) };
}
const MIN = 60_000;
const DEBUT = new Date(2026, 9, 29, 18, 0).getTime();
const journal = (raw: DatabaseSync, id: string) => raw.prepare("SELECT COUNT(*) AS n FROM sync_journal WHERE tab = 'seance_charge' AND cle = ?").get(id) as { n: number };
const ligne = (raw: DatabaseSync, id: string) => raw.prepare("SELECT * FROM seance_charge WHERE seance_id = ?").get(id) as Record<string, unknown> | undefined;

/** Sur A : une course de 40 min avec sa FC (150 bpm, Z3 de la FC max 190 : 120 points), une muscu sans FC au ressenti « Bien ». */
function semer(raw: DatabaseSync) {
  raw.prepare("INSERT INTO seances (id, titre, debut, fin, maj_le, activite_id) VALUES ('course', 'Course', ?, ?, 0, 'cat:course')").run(DEBUT, DEBUT + 40 * MIN);
  const fc = raw.prepare("INSERT INTO seance_fc (seance_id, t, s, bpm) VALUES ('course', ?, ?, 150)");
  for (let k = 0; k <= 40 * 60; k += 5) fc.run(DEBUT + k * 1000, k * 1000);
  raw.prepare("INSERT INTO exercices (id, nom, cree_le, maj_le) VALUES ('dc', 'Développé couché', 0, 0)").run();
  raw.prepare("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES ('push', 'Push A', ?, ?, 0)").run(DEBUT - 5 * 3_600_000, DEBUT - 5 * 3_600_000 + 50 * MIN);
  const s = raw.prepare("INSERT INTO series (id, seance_id, exercice_id, position, type, kg, reps, faite, rpe) VALUES (?, 'push', 'dc', ?, 'normale', 70, 8, 1, ?)");
  for (let i = 0; i < 4; i++) s.run(`s${i}`, i, rpeDeRir(2));
}

test("règle de fusion : la ligne locale calculée avec la FC reste face à une ligne reçue calculée sans", () => {
  assert.equal(tableSync("seance_charge")!.garderLocale, garderChargeAvecFc);
  assert.equal(garderChargeAvecFc({ avec_fc: 1 }, { avec_fc: 0 }), true);
  assert.equal(garderChargeAvecFc({ avec_fc: 0 }, { avec_fc: 1 }), false);
  assert.equal(garderChargeAvecFc({ avec_fc: 1 }, { avec_fc: 1 }), false, "à égalité, la plus récente gagne");
  assert.equal(garderChargeAvecFc({ avec_fc: 0 }, { avec_fc: 0 }), false);
});

test("deux téléphones : la charge faite avec la FC arrive chez B, qui n'a pas la FC, et B ne l'écrase jamais", async () => {
  await pret();
  const cle = aleatoire(32);
  const serveur = new FauxServeur();
  const A = await telephone(serveur, cle, "A");
  semer(A.raw);
  const a = (await effortSeance(A.db, "course"))!;
  assert.deepEqual([a.methode, a.sourceFc], ["fc", "capteur"]);
  assert.equal(ligne(A.raw, "course")!.avec_fc, 1);
  assert.ok(Math.abs(a.charge - 120) < 0.5);
  const push = (await effortSeance(A.db, "push"))!.charge;
  await A.sync();
  assert.equal(serveur.charge("course")!.avec_fc, 1, "la charge voyage, sans score");
  assert.equal(Object.keys(serveur.charge("course")!).some((k) => /score|strain/.test(k)), false);

  const B = await telephone(serveur, cle, "B");
  await B.sync();
  // B n'a pas la FC (seance_fc ne voyage pas) : le barème lui donnerait 128 points, il garde ceux de A
  let santeLue = 0;
  const b = (await effortSeance(B.db, "course"))!;
  await recalculerCharges(B.db, { fcSante: async () => (santeLue++, null) });
  assert.deepEqual([b.methode, b.charge], ["fc", a.charge]);
  assert.equal((await effortSeance(B.db, "course"))!.charge, a.charge);
  assert.equal(journal(B.raw, "course").n, 0, "B n'a rien réécrit");
  // Santé Connect n'est demandé que pour la muscu reçue sans FC (une fois), jamais pour la course faite avec la FC
  assert.ok(santeLue <= 1, String(santeLue));
  // la muscu : calculée à ses séries et au ressenti des deux côtés (séries synchronisées), même charge
  assert.equal((await effortSeance(B.db, "push"))!.charge, push);
  assert.ok(Math.abs(push - (4 * 8 * Math.pow(0.8, 0.5) + 125) / 2) < 1e-6, "moitié séries (4 × 70 kg × 8, 2 en réserve), moitié « Bien » × 50 min");
});

test("une ligne sans FC plus récente ne remplace pas, par la synchro, la ligne faite avec la FC ; l'autre téléphone la reprend", async () => {
  await pret();
  const cle = aleatoire(32);
  const serveur = new FauxServeur();
  const A = await telephone(serveur, cle, "A");
  semer(A.raw);
  const a = (await effortSeance(A.db, "course"))!;
  await A.sync();
  const B = await telephone(serveur, cle, "B");
  await B.sync();
  // un B d'avant la règle (ou une IA) écrit une charge au barème, sans FC, plus récente
  B.raw.prepare("UPDATE seance_charge SET charge = 128, methode = 'bareme', estime = 1, zones = NULL, source_fc = NULL, avec_fc = 0 WHERE seance_id = 'course'").run();
  await B.sync();
  assert.equal(serveur.charge("course")!.avec_fc, 0);
  await A.sync();
  assert.equal(ligne(A.raw, "course")!.charge, a.charge, "A garde la sienne");
  assert.equal(serveur.charge("course")!.avec_fc, 1, "et la renvoie au serveur");
  await B.sync();
  assert.equal(ligne(B.raw, "course")!.charge, a.charge, "B reprend celle faite avec la FC");
});

test("à égalité (sans FC des deux côtés), la plus récente gagne ; l'empreinte seule ne voyage pas", async () => {
  await pret();
  const cle = aleatoire(32);
  const serveur = new FauxServeur();
  const A = await telephone(serveur, cle, "A");
  semer(A.raw);
  await effortSeance(A.db, "push");
  await A.sync();
  const B = await telephone(serveur, cle, "B");
  await B.sync();
  // le ressenti change sur B (séries) : B recalcule, sa charge part, A la prend
  B.raw.prepare("UPDATE series SET rpe = ? WHERE seance_id = 'push'").run(rpeDeRir(1));
  const dur = (await effortSeance(B.db, "push"))!.charge;
  assert.ok(Math.abs(dur - (4 * 8 * 1.1 * Math.pow(0.8, 0.5) + 50 * 3.5) / 2) < 1e-6, "séries à 1 en réserve, « Dur » × 50 min");
  await B.sync();
  await A.sync();
  assert.equal(ligne(A.raw, "push")!.charge, dur);
  assert.equal(ligne(A.raw, "push")!.series, 4, "le nombre de séries voyage avec la ligne");
  // A recalcule (son empreinte diffère de celle reçue de B) : même mesure, rien ne repart
  A.raw.exec("DELETE FROM sync_journal");
  await effortSeance(A.db, "push");
  assert.equal(journal(A.raw, "push").n, 0);
  A.raw.prepare("UPDATE seance_charge SET empreinte = 'autre', maj_le = 1 WHERE seance_id = 'push'").run();
  assert.equal(journal(A.raw, "push").n, 0, "l'empreinte et l'heure seules ne sont pas notées");
});
