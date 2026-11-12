// Phase 2, lot 2 : migration 12, horloge hybride, chiffrement de bout en bout et moteur de synchro avec un faux transport
// (deux téléphones, un serveur en mémoire).
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { chargerCatalogue } from "../src/db/catalogue.ts";
import { ajouterNote, listerNotes, supprimerNote } from "../src/db/depots/notes.ts";
import { ajouterPesee, listerPesees } from "../src/db/depots/pesees.ts";
import { ajouterSerie, cocherSerie, demarrerSeance, lireSeance, modifierSeance, supprimerSeance, terminerSeance } from "../src/db/depots/seances.ts";
import type { Executeur } from "../src/db/executeur.ts";
import { fichiersAEffacer, poserPhotoSeance, retirerPhotoSeance } from "../src/db/depots/photos.ts";
import { migrer } from "../src/db/migrations.ts";
import {
  aleatoire, changerMotDePasse, chiffrerFichier, cleFichierChiffre, creerCoffre, dechiffrerFichier, deriverConnexion, idStable, lirePhrase, lireRappel, motInconnu,
  ouvrirParMotDePasse, ouvrirParPhrase, pret,
} from "../src/sync/chiffrement.ts";
import { Horloge, lireHlc } from "../src/sync/horloge.ts";
import { synchroniser, type Changement, type Fichiers, type Lot, type Transport } from "../src/sync/moteur.ts";
import { exporterCsv, exporterJson } from "../src/sync/export.ts";
import { adapter, baseDeTest, catalogue, sensiblesChiffrees, vuEnClair } from "./aide.ts";
import { TABLES_SYNC, tableSync } from "../src/sync/schema.ts";

/** Serveur en mémoire : une ligne par (table, clé), un numéro d'ordre croissant tient lieu de curseur. */
class FauxServeur {
  lignes = new Map<string, Changement & { seq: number }>();
  fichiers = new Map<string, Uint8Array>();
  /** Fichiers supprimés, et nombre de lectures de fichiers. */
  supprimes: string[] = [];
  lectures = 0;
  /** Faux serveur qui perd les envois de fichiers (la version chiffrée ne se relit pas). */
  perdre = false;
  seq = 0;
  poussees = 0;
  /** Effacement de fichier refusé (règle pas encore en ligne). */
  refuseEffacer = false;

  transport(): Transport {
    return {
      pousser: async (lot: Changement[]) => {
        this.poussees += lot.length;
        for (const c of lot) this.lignes.set(`${c.tab}/${c.cle}`, { ...c, seq: ++this.seq });
      },
      tirer: async (curseur: string | null, limite: number): Promise<Lot> => {
        const depuis = curseur ? Number(curseur) : 0;
        const l = [...this.lignes.values()].filter((x) => x.seq > depuis).sort((a, b) => a.seq - b.seq);
        const page = l.slice(0, limite);
        return {
          changements: page.map(({ seq: _, ...c }) => c),
          curseur: page.length ? String(page[page.length - 1]!.seq) : curseur,
          encore: l.length > limite,
        };
      },
      envoyerFichier: async (cle: string, contenu: Uint8Array) => {
        if (!this.perdre && !this.fichiers.has(cle)) this.fichiers.set(cle, contenu.slice());
      },
      lireFichier: async (cle: string) => {
        this.lectures++;
        return this.fichiers.get(cle)?.slice() ?? null;
      },
      supprimerFichier: async (cle: string) => {
        if (this.refuseEffacer) throw new Error("403");
        this.supprimes.push(cle);
        this.fichiers.delete(cle);
      },
    };
  }
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function telephone(serveur: FauxServeur, cle: Uint8Array, noeud: string, fichiers?: Fichiers) {
  const { raw, db } = await baseDeTest(true);
  return { raw, db, sync: () => synchroniser({ db, transport: serveur.transport(), cle, noeud, fichiers }) };
}

async function seanceAvecSeries(db: Executeur, note: string) {
  const id = await demarrerSeance(db, null, "Push");
  for (const kg of [60, 70]) {
    const s = await ajouterSerie(db, { seanceId: id, exerciceId: "cat:couche", kg, reps: 8 });
    await cocherSerie(db, s, true);
  }
  await modifierSeance(db, id, { note });
  await terminerSeance(db, id);
  return id;
}

test("migration 12 : les exercices du catalogue prennent l'id « cat:<slug> », séries et records suivent ; le journal note les écritures", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 11);
  raw.exec(`INSERT INTO exercices (id, nom, slug, perso, cree_le, maj_le) VALUES ('x1','Développé couché','couche',0,1,1),
      ('p1','Mon exo',NULL,1,1,1);
    INSERT INTO seances (id,debut,fin,maj_le) VALUES ('s',1,2,1);
    INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES ('s','x1',0);
    INSERT INTO series (id, seance_id, exercice_id, position, kg, reps, faite) VALUES ('a','s','x1',0,60,8,1),('b','s','p1',1,10,10,1);
    INSERT INTO records (id, exercice_id, type, valeur, seance_id, atteint_le) VALUES ('r','x1','charge',60,'s',2);`);
  assert.equal(await migrer(db, 12), 12);
  const ids = raw.prepare("SELECT exercice_id AS e FROM series ORDER BY id").all().map((x) => x.e);
  assert.deepEqual(ids, ["cat:couche", "p1"]);
  assert.equal((raw.prepare("SELECT exercice_id AS e FROM records").get() as { e: string }).e, "cat:couche");
  assert.equal((raw.prepare("SELECT exercice_id AS e FROM seance_exercices").get() as { e: string }).e, "cat:couche");
  assert.equal(raw.prepare("PRAGMA foreign_key_check").all().length, 0);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM sync_journal").get()!.n, 0, "la migration elle-même n'est pas notée");

  raw.exec("UPDATE series SET kg = 62 WHERE id = 'a'; DELETE FROM series WHERE id = 'b';");
  raw.exec("INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES ('s','p1',1)");
  const j = raw.prepare("SELECT tab, cle, supprime FROM sync_journal ORDER BY tab, cle").all().map((x) => ({ ...x }));
  assert.deepEqual(j, [
    { tab: "seance_exercices", cle: "s|p1", supprime: 0 },
    { tab: "series", cle: "a", supprime: 0 },
    { tab: "series", cle: "b", supprime: 1 },
  ]);

  // Une nouvelle installation charge le catalogue directement avec ces ids.
  const neuve = await baseDeTest();
  await chargerCatalogue(neuve.db, catalogue());
  assert.ok(neuve.raw.prepare("SELECT 1 FROM exercices WHERE id = 'cat:couche'").get());
});

test("horloge hybride : monotone malgré une horloge murale qui recule, et après une estampille reçue", () => {
  const h = new Horloge("A");
  const a = h.envoyer(1000);
  const b = h.envoyer(900);
  assert.ok(b > a);
  h.recevoir(new Horloge("B").envoyer(5000));
  const c = h.envoyer(1001);
  assert.ok(c > b);
  assert.equal(lireHlc(c)!.ms, 5000);
  assert.equal(new Horloge("A", c).envoyer(0) > c, true, "l'état se recharge");
});

test("chiffrement : coffre ouvert par le mot de passe ou par la phrase (accents facultatifs) ; mauvais secret refusé", async () => {
  await pret();
  const k = deriverConnexion("  Alex@Exemple.fr ", "cheval correct agrafe");
  const k2 = deriverConnexion("alex@exemple.fr", "cheval correct agrafe");
  assert.equal(k.motDePasseServeur, k2.motDePasseServeur, "l'e-mail est normalisé");
  assert.notEqual(k.motDePasseServeur, "cheval correct agrafe");
  const { cle, phrase, coffre } = creerCoffre(k.cleMotDePasse);
  assert.equal(phrase.split(" ").length, 12);
  assert.deepEqual(ouvrirParMotDePasse(coffre, k.cleMotDePasse), cle);
  const sansAccents = phrase.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/ /g, "  ");
  assert.equal(lirePhrase(sansAccents), phrase);
  assert.deepEqual(ouvrirParPhrase(coffre, sansAccents), cle);
  assert.throws(() => ouvrirParMotDePasse(coffre, deriverConnexion("alex@exemple.fr", "autre").cleMotDePasse));
  assert.throws(() => ouvrirParPhrase(coffre, "abeille ".repeat(12)));
  assert.equal(lirePhrase("abeille abeille"), null);
  assert.equal(motInconnu(sansAccents), null);
  assert.equal(motInconnu("abeille balcn"), null, "le mot en cours de frappe n'est pas jugé");
  assert.equal(motInconnu("abeille Balcn "), "Balcn", "tel qu'il est tapé");
  assert.equal(motInconnu(`${"abeille ".repeat(11)}zzz`), "zzz", "à 12 mots, le dernier aussi");

  const nouveau = deriverConnexion("alex@exemple.fr", "nouveau mot de passe");
  const c2 = changerMotDePasse(coffre, cle, nouveau.cleMotDePasse);
  assert.deepEqual(ouvrirParMotDePasse(c2, nouveau.cleMotDePasse), cle);
  assert.deepEqual(ouvrirParPhrase(c2, phrase), cle, "la phrase reste valable");
  assert.equal(lireRappel(c2, cle), phrase, "la phrase se relit avec la clé de données");

  const id = idStable("u1", "series", "a");
  assert.match(id, /^[a-z0-9]{15}$/);
  assert.equal(id, idStable("u1", "series", "a"));
  assert.notEqual(id, idStable("u1", "series", "b"));
});

test("synchro : un second téléphone reçoit séance, séries, note et pesée ; le serveur ne voit ni la note ni le poids", async () => {
  await pret();
  const serveur = new FauxServeur();
  const cle = aleatoire(32);
  const A = await telephone(serveur, cle, "A");
  const B = await telephone(serveur, cle, "B");

  const id = await seanceAvecSeries(A.db, "douleur zqxw");
  await ajouterPesee(A.db, 81.4, Date.now() - 86400000);
  const bilanA = await A.sync();
  assert.ok(bilanA.envoyes > 400, "premier envoi : tout, catalogue compris");
  const vu = vuEnClair(serveur.lignes.values());
  assert.ok(!vu.includes("douleur zqxw"), "note chiffrée");
  assert.ok(!vu.includes("81.4"), "poids chiffré");
  const series = [...serveur.lignes.values()].filter((c) => c.tab === "series").map((c) => JSON.parse(c.charge!));
  assert.ok(series.some((x) => x.reps === 8), "les séries restent en clair (chiffrées au repos côté serveur)");

  const bilanB = await B.sync();
  assert.ok(bilanB.appliques > 0);
  const s = await lireSeance(B.db, id);
  assert.equal(s?.seance.note, "douleur zqxw");
  assert.deepEqual(s?.exercices[0]?.series.map((x) => x.kg), [60, 70]);
  assert.deepEqual((await listerPesees(B.db)).map((p) => p.kg), [81.4]);
  assert.ok(Number(B.raw.prepare("SELECT COUNT(*) AS n FROM records WHERE seance_id = ?").get(id)?.n) > 0, "records recalculés sur B");
  assert.equal(B.raw.prepare("PRAGMA foreign_key_check").all().length, 0);

  // Rien de neuf : une nouvelle synchro n'envoie que ce que B a recalculé, puis plus rien.
  await A.sync();
  await B.sync();
  const avant = serveur.poussees;
  await A.sync();
  await B.sync();
  assert.equal(serveur.poussees, avant, "plus rien à envoyer");
});

test("synchro : le dernier qui écrit gagne ; une suppression emporte les séries ; une série ajoutée à une séance supprimée part avec elle", async () => {
  await pret();
  const serveur = new FauxServeur();
  const cle = aleatoire(32);
  const A = await telephone(serveur, cle, "A");
  const B = await telephone(serveur, cle, "B");
  const id = await seanceAvecSeries(A.db, "v0");
  const autre = await seanceAvecSeries(A.db, "autre");
  await A.sync();
  await B.sync();

  // Hors ligne, chacun modifie la note ; B écrit le dernier.
  await modifierSeance(A.db, id, { note: "A" });
  await attendre(5);
  await modifierSeance(B.db, id, { note: "B" });
  await A.sync();
  await B.sync();
  await A.sync();
  assert.equal((await lireSeance(A.db, id))?.seance.note, "B");
  assert.equal((await lireSeance(B.db, id))?.seance.note, "B");

  // A supprime une séance pendant que B y ajoute une série.
  await supprimerSeance(A.db, autre);
  await ajouterSerie(B.db, { seanceId: autre, exerciceId: "cat:couche", kg: 80, reps: 5 });
  await A.sync();
  await B.sync();
  await A.sync();
  for (const T of [A, B]) {
    assert.equal(await lireSeance(T.db, autre), null);
    assert.equal(T.raw.prepare("SELECT COUNT(*) AS n FROM series WHERE seance_id = ?").get(autre)!.n, 0);
    assert.equal(T.raw.prepare("PRAGMA foreign_key_check").all().length, 0);
  }
});

test("synchro : au premier passage, un téléphone neuf ne réécrase pas la note d'un exercice du catalogue posée ailleurs", async () => {
  await pret();
  const serveur = new FauxServeur();
  const cle = aleatoire(32);
  const A = await telephone(serveur, cle, "A");
  await ajouterNote(A.db, { exerciceId: "cat:couche" }, "exercice", "prise serrée");
  await A.sync();
  await attendre(5);
  const B = await telephone(serveur, cle, "B");
  await B.sync();
  assert.deepEqual((await listerNotes(B.db, { exerciceId: "cat:couche" }, "exercice")).map((n) => n.texte), ["prise serrée"]);
  await A.sync();
  assert.deepEqual((await listerNotes(A.db, { exerciceId: "cat:couche" }, "exercice")).map((n) => n.texte), ["prise serrée"]);
});

test("synchro : plusieurs notes d'une séance voyagent chiffrées, une suppression aussi", async () => {
  await pret();
  const serveur = new FauxServeur();
  const cle = aleatoire(32);
  const A = await telephone(serveur, cle, "A");
  const B = await telephone(serveur, cle, "B");
  const id = await seanceAvecSeries(A.db, "x");
  const exerciceId = (await lireSeance(A.db, id))!.exercices[0]!.exercice.id;
  const lieu = { exerciceId, seanceId: id };
  const n1 = (await ajouterNote(A.db, lieu, "seance", "plombage qvbn"))!;
  await ajouterNote(A.db, lieu, "seance", "épaule wxcv");
  await A.sync();
  // dans ce que le serveur lit en clair seulement : le chiffré (base64) peut contenir « qvbn » par hasard (~0,9 %)
  const vu = vuEnClair(serveur.lignes.values());
  assert.ok(!vu.includes("qvbn") && !vu.includes("wxcv"), "texte des notes chiffré");
  assert.equal(sensiblesChiffrees(serveur.lignes.values(), "notes", tableSync("notes")!.sensibles), 2, "deux notes, texte dans le bloc chiffré");
  await B.sync();
  assert.deepEqual((await lireSeance(B.db, id))!.exercices[0]!.notes.map((n) => n.texte), ["plombage qvbn", "épaule wxcv"]);
  await attendre(5);
  await supprimerNote(B.db, n1);
  await B.sync();
  await A.sync();
  assert.deepEqual((await lireSeance(A.db, id))!.exercices[0]!.notes.map((n) => n.texte), ["épaule wxcv"]);
  assert.equal(A.raw.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("synchro : une mauvaise clé ne lit pas les colonnes chiffrées (erreur, rien d'appliqué)", async () => {
  await pret();
  const serveur = new FauxServeur();
  const A = await telephone(serveur, aleatoire(32), "A");
  await ajouterPesee(A.db, 80);
  await A.sync();
  const B = await telephone(serveur, aleatoire(32), "B");
  await assert.rejects(B.sync());
  assert.equal((await listerPesees(B.db)).length, 0);
});

/** Une fausse photo WebP : en-tête « RIFF….WEBP » puis des octets au hasard (reconnaissables s'ils fuient). */
function fausseWebp(n: number): Uint8Array {
  const o = aleatoire(n);
  o.set(new TextEncoder().encode("RIFF"), 0);
  o.set(new TextEncoder().encode("WEBP"), 8);
  return o;
}

/** Vrai si un morceau de 8 octets de `aiguille` (hors en-tête WebP) se retrouve dans `botte`. */
function fuite(aiguille: Uint8Array, botte: Uint8Array): boolean {
  const vus = new Set<string>();
  for (let i = 16; i + 8 <= aiguille.length; i += 8) vus.add(aiguille.subarray(i, i + 8).join(","));
  for (let i = 0; i + 8 <= botte.length; i++) if (vus.has(botte.subarray(i, i + 8).join(","))) return true;
  return false;
}

const telephoneAFichiers = () => {
  const disque = new Map<string, Uint8Array>();
  const fichiers: Fichiers = {
    existe: (c) => disque.has(c),
    lire: async (c) => disque.get(c)!.slice(),
    ecrire: async (c, contenu) => void disque.set(c, contenu.slice()),
  };
  return { disque, fichiers };
};

async function poserPhoto(raw: DatabaseSync, seance: string, cleDistante: string | null = null) {
  const t = Date.now();
  raw
    .prepare(
      "INSERT INTO seance_photo (id, seance_id, chemin_local, chemin_vignette, largeur, hauteur, octets, cle_distante, cree_le, maj_le) VALUES ('ph', ?, 'photos/ph.webp', 'photos/ph-v.webp', 1600, 1200, 1000, ?, ?, ?)",
    )
    .run(seance, cleDistante, t, t);
}

test("fichiers chiffrés : aller-retour, ancien format en clair, mauvaise clé, nom échangé ou version inconnue = erreur, clé distante opaque", async () => {
  await pret();
  const cle = aleatoire(32);
  const photo = fausseWebp(3000);
  const c = chiffrerFichier(cle, "ph.webp", photo);
  assert.deepEqual([...c.subarray(0, 5)], [0x46, 0x4e, 0x54, 0x46, 1]);
  assert.equal(c.length, photo.length + 5 + 24 + 16);
  assert.ok(!fuite(photo, c));
  assert.deepEqual(dechiffrerFichier(cle, "ph.webp", c), photo);
  // Deux envois de la même photo ne se ressemblent pas (nonce au hasard).
  assert.notDeepEqual(chiffrerFichier(cle, "ph.webp", photo), c);
  assert.throws(() => dechiffrerFichier(aleatoire(32), "ph.webp", c));
  assert.throws(() => dechiffrerFichier(cle, "ph-v.webp", c));
  const v2 = c.slice();
  v2[4] = 2;
  assert.throws(() => dechiffrerFichier(cle, "ph.webp", v2), /version 2/);
  const abime = c.slice();
  abime[abime.length - 1]! ^= 1;
  assert.throws(() => dechiffrerFichier(cle, "ph.webp", abime));
  // Ancien format : une WebP en clair, acceptée seulement sous l'ancienne clé.
  assert.deepEqual(dechiffrerFichier(cle, "ph.webp", photo, true), photo);
  assert.throws(() => dechiffrerFichier(cle, "ph.webp", photo), /format inconnu/);
  assert.throws(() => dechiffrerFichier(cle, "ph.webp", new TextEncoder().encode("<html>"), true), /format inconnu/);
  const k = cleFichierChiffre(cle, "ph.webp");
  assert.match(k, /^[0-9a-f]{32}$/);
  assert.equal(cleFichierChiffre(cle, "ph.webp"), k);
  assert.notEqual(cleFichierChiffre(cle, "ph-v.webp"), k);
  assert.notEqual(cleFichierChiffre(aleatoire(32), "ph.webp"), k);
});

test("synchro : photo envoyée chiffrée sous un nom opaque (aucun octet de l'image côté serveur), puis déchiffrée sur l'autre téléphone", async () => {
  await pret();
  const serveur = new FauxServeur();
  const cle = aleatoire(32);
  const a = telephoneAFichiers();
  const b = telephoneAFichiers();
  const A = await telephone(serveur, cle, "A", a.fichiers);
  const B = await telephone(serveur, cle, "B", b.fichiers);
  const id = await seanceAvecSeries(A.db, "");
  await poserPhoto(A.raw, id);
  const photo = fausseWebp(4000);
  const vignette = fausseWebp(900);
  a.disque.set("photos/ph.webp", photo).set("photos/ph-v.webp", vignette);
  const ba = await A.sync();
  assert.equal(ba.photosEnvoyees, 1);
  assert.equal(ba.photosMigrees, 0);
  assert.deepEqual([...serveur.fichiers.keys()].sort(), [cleFichierChiffre(cle, "ph-v.webp"), cleFichierChiffre(cle, "ph.webp")].sort());
  for (const [k, contenu] of serveur.fichiers) {
    assert.ok(!k.includes("ph") && !k.includes("webp"));
    assert.ok(!fuite(photo, contenu) && !fuite(vignette, contenu));
    assert.ok(!new TextDecoder().decode(contenu).includes("WEBP"));
  }
  // Nouvelle photo : rien à migrer, rien à supprimer, même aux synchros suivantes.
  serveur.lectures = 0;
  assert.equal((await A.sync()).photosMigrees, 0);
  assert.equal(serveur.lectures, 0);
  assert.deepEqual(serveur.supprimes, []);

  const bb = await B.sync();
  assert.equal(bb.photosRecues, 1);
  assert.deepEqual(b.disque.get("photos/ph.webp"), photo);
  assert.deepEqual(b.disque.get("photos/ph-v.webp"), vignette);
  assert.equal(B.raw.prepare("SELECT cle_distante AS c FROM seance_photo").get()!.c, "ph");
});

test("synchro : migration des photos envoyées en clair (relue chiffrée avant de supprimer le clair, une seule fois, idempotente)", async () => {
  await pret();
  const serveur = new FauxServeur();
  const cle = aleatoire(32);
  const a = telephoneAFichiers();
  const b = telephoneAFichiers();
  const A = await telephone(serveur, cle, "A", a.fichiers);
  const B = await telephone(serveur, cle, "B", b.fichiers);
  const id = await seanceAvecSeries(A.db, "");
  // Ancienne version de l'appli : photo envoyée en clair, sous son nom.
  await poserPhoto(A.raw, id, "ph");
  const photo = fausseWebp(4000);
  const vignette = fausseWebp(900);
  a.disque.set("photos/ph.webp", photo).set("photos/ph-v.webp", vignette);
  serveur.fichiers.set("ph.webp", photo.slice()).set("ph-v.webp", vignette.slice());

  // Serveur qui perd les envois chiffrés : la version chiffrée ne se relit pas, la copie en clair n'est pas supprimée.
  serveur.perdre = true;
  assert.equal((await A.sync()).photosMigrees, 0);
  // B, à jour, lit encore l'ancien format.
  assert.equal((await B.sync()).photosRecues, 1);
  assert.deepEqual(b.disque.get("photos/ph.webp"), photo);
  assert.deepEqual(serveur.supprimes, []);
  assert.ok(serveur.fichiers.has("ph.webp") && serveur.fichiers.has("ph-v.webp"));

  serveur.perdre = false;
  assert.equal((await A.sync()).photosMigrees, 1);
  assert.deepEqual(serveur.supprimes.sort(), ["ph-v.webp", "ph.webp"]);
  assert.deepEqual([...serveur.fichiers.keys()].sort(), [cleFichierChiffre(cle, "ph-v.webp"), cleFichierChiffre(cle, "ph.webp")].sort());
  for (const contenu of serveur.fichiers.values()) assert.ok(!fuite(photo, contenu) && !fuite(vignette, contenu));

  // Une seule fois : plus aucune lecture ni suppression ensuite.
  serveur.lectures = 0;
  serveur.supprimes = [];
  assert.equal((await A.sync()).photosMigrees, 0);
  assert.equal(serveur.lectures, 0);

  // B relit la version chiffrée d'A (pas de nouvel envoi), vérifie, puis marque à son tour ; le clair est déjà parti.
  const avant = new Map(serveur.fichiers);
  assert.equal((await B.sync()).photosMigrees, 1);
  assert.deepEqual(serveur.fichiers, avant);
  serveur.lectures = 0;
  assert.equal((await B.sync()).photosMigrees, 0);
  assert.equal(serveur.lectures, 0);

  // Un troisième téléphone, neuf, reçoit la version chiffrée.
  const c = telephoneAFichiers();
  const C = await telephone(serveur, cle, "C", c.fichiers);
  assert.equal((await C.sync()).photosRecues, 1);
  assert.deepEqual(c.disque.get("photos/ph-v.webp"), vignette);
});

test("synchro : une photo illisible (mauvaise clé) ne bloque pas la synchro et n'est pas écrite", async () => {
  await pret();
  const serveur = new FauxServeur();
  const cle = aleatoire(32);
  const a = telephoneAFichiers();
  const b = telephoneAFichiers();
  const A = await telephone(serveur, cle, "A", a.fichiers);
  const B = await telephone(serveur, cle, "B", b.fichiers);
  const id = await seanceAvecSeries(A.db, "");
  await poserPhoto(A.raw, id);
  a.disque.set("photos/ph.webp", fausseWebp(500)).set("photos/ph-v.webp", fausseWebp(200));
  await A.sync();
  // Le serveur remplace la photo par une autre, chiffrée avec une autre clé.
  serveur.fichiers.set(cleFichierChiffre(cle, "ph.webp"), chiffrerFichier(aleatoire(32), "ph.webp", fausseWebp(500)));
  const bb = await B.sync();
  assert.equal(bb.photosRecues, 1);
  assert.ok(!b.disque.has("photos/ph.webp") && b.disque.has("photos/ph-v.webp"));
  assert.equal(bb.photosMigrees, 0);
});

test("synchro : photo remplacée puis supprimée, ses fichiers chiffrés (et l'ancien nom en clair) quittent le serveur ; un refus reste en file", async () => {
  await pret();
  const serveur = new FauxServeur();
  const cle = aleatoire(32);
  const a = telephoneAFichiers();
  const A = await telephone(serveur, cle, "A", a.fichiers);
  const id = await seanceAvecSeries(A.db, "");
  const poser = async (p: string) => {
    a.disque.set(`photos/${p}.webp`, fausseWebp(600)).set(`photos/${p}-v.webp`, fausseWebp(200));
    await poserPhotoSeance(A.db, id, { id: p, cheminLocal: `photos/${p}.webp`, cheminVignette: `photos/${p}-v.webp`, largeur: 1, hauteur: 1, octets: 1 });
  };
  const chiffres = (p: string) => [cleFichierChiffre(cle, `${p}-v.webp`), cleFichierChiffre(cle, `${p}.webp`)].sort();
  await poser("p1");
  await A.sync();
  assert.deepEqual([...serveur.fichiers.keys()].sort(), chiffres("p1"));

  // Remplacée : l'ancienne part du serveur, la nouvelle arrive.
  await poser("p2");
  assert.deepEqual(await fichiersAEffacer(A.db), ["p1.webp", "p1-v.webp"]);
  await A.sync();
  assert.deepEqual([...serveur.fichiers.keys()].sort(), chiffres("p2"));
  assert.ok(serveur.supprimes.includes("p1.webp") && serveur.supprimes.includes(cleFichierChiffre(cle, "p1.webp")));
  assert.deepEqual(await fichiersAEffacer(A.db), []);

  // Supprimée, serveur qui refuse : rien n'est perdu, la synchro suivante efface.
  serveur.refuseEffacer = true;
  assert.equal((await retirerPhotoSeance(A.db, id, "p2"))?.id, "p2");
  await A.sync();
  assert.deepEqual(await fichiersAEffacer(A.db), ["p2.webp", "p2-v.webp"]);
  assert.equal(serveur.fichiers.size, 2);
  serveur.refuseEffacer = false;
  await A.sync();
  assert.equal(serveur.fichiers.size, 0);
  assert.deepEqual(await fichiersAEffacer(A.db), []);
  // La suppression de la ligne voyage aussi.
  assert.equal(serveur.lignes.get("seance_photo/p2")?.supprime, true);
});

test("export : JSON complet (note et poids lisibles), CSV d'une ligne par série, champs avec virgule entre guillemets", async () => {
  const { db } = await baseDeTest(true);
  await seanceAvecSeries(db, "épaule, « gauche »");
  await ajouterPesee(db, 81.4, Date.now());
  const j = JSON.parse(await exporterJson(db, 0));
  assert.equal(j.exporte_le, "1970-01-01T00:00:00.000Z");
  assert.equal(j.tables.seances[0].note, "épaule, « gauche »");
  assert.equal(j.tables.pesee[0].kg, 81.4);
  assert.ok(j.tables.series.length === 2 && Array.isArray(j.tables.records));
  const csv = (await exporterCsv(db)).trim().split("\n");
  assert.equal(csv.length, 3);
  assert.match(csv[0]!, /^titre,debut,fin,salle,exercice,serie,type,kg,reps/);
  assert.match(csv[1]!, /,Développé couché \(Barre\),1,normale,60,8,/);
  assert.ok(csv[1]!.endsWith(',"épaule, « gauche »"'));
});

test("synchro : chaque colonne sensible déclarée existe dans la base migrée (une colonne renommée partirait en clair)", async () => {
  const { raw } = await baseDeTest();
  for (const t of TABLES_SYNC) {
    const colonnes = new Set(raw.prepare(`PRAGMA table_info(${t.nom})`).all().map((c) => String(c.name)));
    assert.ok(colonnes.size > 0, `table ${t.nom} absente`);
    for (const s of t.sensibles) assert.ok(colonnes.has(s), `${t.nom}.${s} n'existe pas`);
  }
});
