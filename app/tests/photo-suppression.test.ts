// Photo de la séance : suppression différée (Annuler pendant 8 s), suppression d'une photo précise, file des fichiers à
// effacer du serveur (seulement pour une photo déjà envoyée).
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { demarrerSeance } from "../src/db/depots/seances.ts";
import { fichiersAEffacer, lirePhotoSeance, poserPhotoSeance, retirerPhotoSeance } from "../src/db/depots/photos.ts";
import { DELAI_ANNULER_MS, SuppressionDifferee } from "../src/photos/attente.ts";
import { baseDeTest } from "./aide.ts";

const photo = (p: string) => ({ id: p, cheminLocal: `photos/${p}.webp`, cheminVignette: `photos/${p}-v.webp`, largeur: 1600, hauteur: 1200, octets: 10 });

test("suppression différée : faite au bout du délai, pas avant ; Annuler l'empêche", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const etats: (string | null)[] = [];
    const s = new SuppressionDifferee((id) => etats.push(id));
    let faites = 0;
    s.demander("p1", () => faites++);
    assert.equal(s.enAttente, "p1");
    mock.timers.tick(DELAI_ANNULER_MS - 1);
    assert.equal(faites, 0);
    mock.timers.tick(1);
    assert.equal(faites, 1);
    assert.equal(s.enAttente, null);

    s.demander("p2", () => faites++);
    s.annuler();
    mock.timers.tick(DELAI_ANNULER_MS * 2);
    assert.equal(faites, 1);
    assert.deepEqual(etats, ["p1", null, "p2", null]);
  } finally {
    mock.timers.reset();
  }
});

test("suppression différée : quitter l'écran (valider) la fait tout de suite, une seule fois ; une nouvelle demande fait la précédente", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const faites: string[] = [];
    const s = new SuppressionDifferee();
    s.demander("p1", () => faites.push("p1"));
    s.demander("p2", () => faites.push("p2"));
    assert.deepEqual(faites, ["p1"]);
    s.valider();
    mock.timers.tick(DELAI_ANNULER_MS);
    s.valider();
    assert.deepEqual(faites, ["p1", "p2"]);
  } finally {
    mock.timers.reset();
  }
});

test("retirer une photo précise : une photo posée entre-temps (remplacement) n'est pas retirée", async () => {
  const { db } = await baseDeTest(true);
  const id = await demarrerSeance(db, null, "Push");
  await poserPhotoSeance(db, id, photo("p1"));
  await poserPhotoSeance(db, id, photo("p2"));
  assert.equal(await retirerPhotoSeance(db, id, "p1"), null);
  assert.equal((await lirePhotoSeance(db, id))?.id, "p2");
  assert.equal((await retirerPhotoSeance(db, id, "p2"))?.chemin_local, "photos/p2.webp");
  assert.equal(await lirePhotoSeance(db, id), null);
});

test("fichiers à effacer du serveur : seulement ceux d'une photo déjà envoyée, sans doublon", async () => {
  const { db, raw } = await baseDeTest(true);
  const id = await demarrerSeance(db, null, "Push");
  await poserPhotoSeance(db, id, photo("p1"));
  await retirerPhotoSeance(db, id);
  assert.deepEqual(await fichiersAEffacer(db), []);

  await poserPhotoSeance(db, id, photo("p2"));
  raw.prepare("UPDATE seance_photo SET cle_distante = id").run();
  await poserPhotoSeance(db, id, photo("p3"));
  assert.deepEqual(await fichiersAEffacer(db), ["p2.webp", "p2-v.webp"]);
  raw.prepare("UPDATE seance_photo SET cle_distante = id").run();
  await retirerPhotoSeance(db, id, "p3");
  assert.deepEqual(await fichiersAEffacer(db), ["p2.webp", "p2-v.webp", "p3.webp", "p3-v.webp"]);
});
