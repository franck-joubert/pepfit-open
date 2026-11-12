// Sauvegarde dans un fichier (planches/idees-etudes/SAUVEGARDE.md) : aller-retour complet (toutes les tables, photos
// comprises), chiffrée par la phrase ou lisible, mauvaise phrase, fichier tronqué, fusion, schéma trop récent.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ajouterNote } from "../src/db/depots/notes.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { poserPhotoSeance } from "../src/db/depots/photos.ts";
import { ajouterMensuration } from "../src/db/depots/profil.ts";
import { ajouterRepas } from "../src/db/depots/nutrition.ts";
import { ajouterSerie, cocherSerie, demarrerSeance, modifierSeance, terminerSeance } from "../src/db/depots/seances.ts";
import type { Executeur } from "../src/db/executeur.ts";
import { creerCoffre, deriverConnexion, nouvellePhrase, ouvrirParPhrase, pret } from "../src/sync/chiffrement.ts";
import type { Fichiers } from "../src/sync/moteur.ts";
import {
  appliquerSauvegarde, ErreurSauvegarde, lireEntete, lireSauvegarde, phraseOuvre, sauvegarder, type Entree, type Sortie,
} from "../src/sauvegarde/archive.ts";
import { baseDeTest } from "./aide.ts";

class Memoire implements Fichiers {
  m = new Map<string, Uint8Array>();
  existe = (c: string) => this.m.has(c);
  lire = async (c: string) => this.m.get(c)!.slice();
  ecrire = async (c: string, o: Uint8Array) => void this.m.set(c, o.slice());
}

function sortie(): Sortie & { tout(): Uint8Array } {
  const l: Uint8Array[] = [];
  return {
    ecrire: async (o) => void l.push(o.slice()),
    tout: () => {
      const r = new Uint8Array(l.reduce((s, x) => s + x.length, 0));
      let k = 0;
      for (const x of l) (r.set(x, k), (k += x.length));
      return r;
    },
  };
}

/** Lit par morceaux irréguliers, comme un fournisseur de documents. */
function entree(o: Uint8Array): Entree {
  let k = 0;
  return {
    lire: async (n) => {
      const m = Math.min(n, 7000 + (k % 13), o.length - k);
      const r = o.slice(k, k + m);
      k += m;
      return r;
    },
  };
}

const SECRET = "genou gauche fragile";

/** Une base vécue : séance avec séries, note, photo, pesée, mensuration, repas, réglages. */
async function peupler(db: Executeur, f: Memoire, titre = "Push") {
  const id = await demarrerSeance(db, null, titre);
  for (const kg of [60, 70]) await cocherSerie(db, await ajouterSerie(db, { seanceId: id, exerciceId: "cat:couche", kg, reps: 8 }), true);
  await modifierSeance(db, id, { note: SECRET });
  await terminerSeance(db, id);
  await ajouterNote(db, { exerciceId: "cat:couche" }, "exercice", "siège cran 4");
  await ajouterPesee(db, 81.4);
  await ajouterMensuration(db, "bras", 38);
  await ajouterRepas(db, "Collation", 16 * 60);
  const pid = `p${titre}`;
  // Une grande photo (plusieurs blocs de 64 Kio) et sa vignette.
  const photo = new Uint8Array(300_000).map((_, i) => (i * 31 + titre.length) % 251);
  f.m.set(`photos/${pid}.webp`, photo);
  f.m.set(`photos/${pid}-v.webp`, photo.slice(0, 5000));
  await poserPhotoSeance(db, id, { id: pid, cheminLocal: `photos/${pid}.webp`, cheminVignette: `photos/${pid}-v.webp`, largeur: 1600, hauteur: 1200, octets: 305_000 });
  await db.runAsync("INSERT INTO reglages (cle, valeur) VALUES ('unite', 'kg') ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur", []);
  return id;
}

/** Toutes les tables (hors état de synchro), lignes triées, réglages propres au téléphone à part. */
async function cliche(db: Executeur): Promise<Record<string, string[]>> {
  const tables = await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sync_%' AND name NOT LIKE 'sqlite_%'", []);
  const r: Record<string, string[]> = {};
  for (const { name } of tables) {
    const l = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM "${name}"`, []);
    r[name] = l.filter((x) => !(name === "reglages" && /^(sauvegarde|cache)_/.test(String(x.cle)))).map((x) => JSON.stringify(x)).sort();
  }
  return r;
}

test("aller-retour chiffré : remplacer redonne toutes les tables et les photos à l'identique ; rien de lisible dans le fichier", async () => {
  await pret();
  const phrase = nouvellePhrase();
  const a = await baseDeTest(true);
  const fa = new Memoire();
  await peupler(a.db, fa);
  // un calcul gardé (âge pepfit) : refait sur le téléphone, jamais sauvegardé
  await a.db.runAsync("INSERT INTO reglages (cle, valeur) VALUES ('cache_age_pepfit', '{\"v\":1}')", []);
  const s = sortie();
  const bilan = await sauvegarder(a.db, fa, s, phrase, 1_000);
  const octets = s.tout();
  assert.equal(bilan.octets, octets.length);
  assert.equal(bilan.seances, 1);
  assert.equal(bilan.photos, 2);
  const texte = Buffer.from(octets).toString("latin1");
  for (const secret of [SECRET, "siège", "Collation", "cat:couche"]) assert.ok(!texte.includes(secret), secret);

  const e = await lireEntete(entree(octets));
  assert.deepEqual([e.chiffre, e.seances, e.photos, e.cree_le], [true, 1, 2, 1_000]);
  assert.ok(phraseOuvre(e, phrase));

  // Un autre téléphone, avec ses propres données et son propre dossier de sauvegarde.
  const b = await baseDeTest(true);
  const fb = new Memoire();
  await peupler(b.db, fb, "Autre");
  await b.db.runAsync("INSERT INTO reglages (cle, valeur) VALUES ('sauvegarde_dossier', 'content://b')", []);
  await b.db.runAsync("INSERT INTO reglages (cle, valeur) VALUES ('cache_age_pepfit', 'ancien')", []);
  const schema = (await b.db.getFirstAsync<{ user_version: number }>("PRAGMA user_version", []))!.user_version;
  const c = await lireSauvegarde(entree(octets), ["mauvaise", phrase.toUpperCase()], fb, schema);
  await appliquerSauvegarde(b.db, c, "remplacer");

  assert.deepEqual(await cliche(b.db), await cliche(a.db));
  for (const [chemin, o] of fa.m) assert.deepEqual(fb.m.get(chemin), o, chemin);
  assert.equal((await b.db.getFirstAsync<{ valeur: string }>("SELECT valeur FROM reglages WHERE cle = 'sauvegarde_dossier'", []))?.valeur, "content://b");
  // l'âge gardé de b (sur ses anciennes données) est effacé, celui de a n'est pas repris : il se recalculera
  assert.equal((await b.db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM reglages WHERE cle LIKE 'cache\\_%' ESCAPE '\\'", []))?.n, 0);
  // Le journal est vidé : un compte repartirait d'un premier échange complet.
  assert.equal((await b.db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM sync_journal", []))?.n, 0);
});

test("sauvegarde lisible : même aller-retour, sans phrase", async () => {
  await pret();
  const a = await baseDeTest(true);
  const fa = new Memoire();
  await peupler(a.db, fa);
  const s = sortie();
  await sauvegarder(a.db, fa, s, null);
  const octets = s.tout();
  assert.ok(Buffer.from(octets).toString("utf8").includes(SECRET));
  const e = await lireEntete(entree(octets));
  assert.equal(e.chiffre, false);
  const b = await baseDeTest(true);
  const fb = new Memoire();
  await appliquerSauvegarde(b.db, await lireSauvegarde(entree(octets), [], fb, 999), "remplacer");
  assert.deepEqual(await cliche(b.db), await cliche(a.db));
  assert.equal(fb.m.size, 2);
});

test("mauvaise phrase : refus net, base et fichiers intacts", async () => {
  await pret();
  const a = await baseDeTest(true);
  const fa = new Memoire();
  await peupler(a.db, fa);
  const s = sortie();
  await sauvegarder(a.db, fa, s, nouvellePhrase());
  const autre = nouvellePhrase();
  assert.equal(phraseOuvre(await lireEntete(entree(s.tout())), autre), false);
  const b = await baseDeTest(true);
  const fb = new Memoire();
  const avant = await cliche(b.db);
  await assert.rejects(lireSauvegarde(entree(s.tout()), [autre, "pas une phrase"], fb, 999), (e) => e instanceof ErreurSauvegarde && e.raison === "phrase");
  await assert.rejects(lireSauvegarde(entree(s.tout()), [], fb, 999), (e) => e instanceof ErreurSauvegarde && e.raison === "phrase");
  assert.deepEqual(await cliche(b.db), avant);
  assert.equal(fb.m.size, 0);
});

test("fichier tronqué ou abîmé : refusé, la base reste telle quelle", async () => {
  await pret();
  const phrase = nouvellePhrase();
  const a = await baseDeTest(true);
  const fa = new Memoire();
  await peupler(a.db, fa);
  for (const p of [phrase, null]) {
    const s = sortie();
    await sauvegarder(a.db, fa, s, p);
    const o = s.tout();
    // En-tête coupé, puis coupures dans les blocs, jusqu'au dernier octet ; et un octet ajouté, un octet modifié.
    const coupes = [3, 20, 200, 70_000, Math.floor(o.length / 2), o.length - 70_000, o.length - 17, o.length - 1];
    const b = await baseDeTest(true);
    const avant = await cliche(b.db);
    for (const n of coupes) {
      await assert.rejects(
        lireSauvegarde(entree(o.slice(0, n)), [phrase], new Memoire(), 999),
        (e) => e instanceof ErreurSauvegarde && ["tronque", "format"].includes(e.raison),
        `coupé à ${n} (${p ? "chiffré" : "lisible"})`,
      );
    }
    const plus = new Uint8Array(o.length + 1);
    plus.set(o);
    await assert.rejects(lireSauvegarde(entree(plus), [phrase], new Memoire(), 999), (e) => e instanceof ErreurSauvegarde);
    if (p) {
      const abime = o.slice();
      abime[o.length - 100]! ^= 1;
      await assert.rejects(lireSauvegarde(entree(abime), [phrase], new Memoire(), 999), (e) => e instanceof ErreurSauvegarde && e.raison === "format");
    }
    assert.deepEqual(await cliche(b.db), avant);
  }
  await assert.rejects(lireEntete(entree(new TextEncoder().encode("PK\u0003\u0004 un zip"))), (e) => e instanceof ErreurSauvegarde && e.raison === "format");
});

test("fusionner : ajoute ce qui manque, garde l'existant, recalcule les records", async () => {
  await pret();
  const a = await baseDeTest(true);
  const fa = new Memoire();
  await peupler(a.db, fa);
  const s = sortie();
  await sauvegarder(a.db, fa, s, null);
  const b = await baseDeTest(true);
  const fb = new Memoire();
  await peupler(b.db, fb, "Autre");
  await appliquerSauvegarde(b.db, await lireSauvegarde(entree(s.tout()), [], fb, 999), "fusionner");
  const titres = (await b.db.getAllAsync<{ titre: string }>("SELECT titre FROM seances ORDER BY titre", [])).map((x) => x.titre);
  assert.deepEqual(titres, ["Autre", "Push"]);
  assert.equal((await b.db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM seance_photo", []))?.n, 2);
  assert.equal((await b.db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM pesee", []))?.n, 2);
  assert.ok((await b.db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM records", []))!.n > 0);
  assert.equal(fb.m.size, 4);
  // Les lignes ajoutées partiront à la synchro.
  assert.ok((await b.db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM sync_journal WHERE tab = 'seances'", []))!.n >= 2);
});

test("base plus récente que l'appli : refusée", async () => {
  await pret();
  const a = await baseDeTest(false);
  const s = sortie();
  await sauvegarder(a.db, new Memoire(), s, null);
  await assert.rejects(lireSauvegarde(entree(s.tout()), [], new Memoire(), 1), (e) => e instanceof ErreurSauvegarde && e.raison === "version");
});

test("la phrase créée par une sauvegarde devient celle du compte", async () => {
  await pret();
  const phrase = nouvellePhrase();
  const k = deriverConnexion("a@b.fr", "motdepasse-long");
  const { cle, phrase: p, coffre } = creerCoffre(k.cleMotDePasse, phrase);
  assert.equal(p, phrase);
  assert.deepEqual(ouvrirParPhrase(coffre, phrase), cle);
});

test("renommage pepfit : une sauvegarde chiffrée faite par l'ancienne Fonte (fixture) se restaure dans pepfit", async () => {
  await pret();
  const { phrase, base64 } = JSON.parse(readFileSync(new URL("./fixtures/sauvegarde-fonte.json", import.meta.url), "utf8")) as { phrase: string; base64: string };
  const octets = new Uint8Array(Buffer.from(base64, "base64"));
  const e = await lireEntete(entree(octets));
  assert.equal(e.chiffre, true);
  assert.ok(phraseOuvre(e, phrase));
  const b = await baseDeTest(true);
  const fb = new Memoire();
  const schema = (await b.db.getFirstAsync<{ user_version: number }>("PRAGMA user_version", []))!.user_version;
  await appliquerSauvegarde(b.db, await lireSauvegarde(entree(octets), [phrase], fb, schema), "remplacer");
  const s = await b.db.getFirstAsync<{ titre: string; note: string }>("SELECT titre, note FROM seances WHERE titre LIKE '%ancienne Fonte%'", []);
  assert.equal(s?.note, "note écrite sous Fonte");
  const p = await b.db.getFirstAsync<{ kg: number }>("SELECT kg FROM pesee", []);
  assert.equal(p?.kg, 80.2);
});
