// Photo d'une séance terminée (08/11) : toucher la photo ouvre un menu court (Voir en grand, Remplacer, Supprimer) ;
// Supprimer la retire tout de suite de l'écran, avec « Annuler » pendant 8 s ; Remplacer garde la même place. Aucun fichier
// ni copie ne reste : les deux fichiers de l'ancienne photo sont à effacer (téléphone, puis serveur à la synchro), et le Fil
// de l'Accueil, qui gardait l'adresse de la photo, la relit.
import "./rendu/hooks.mjs";
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createElement, type Context } from "react";
import { definirActif } from "../src/i18n/index.ts";
import { demarrerSeance } from "../src/db/depots/seances.ts";
import { fichiersAEffacer, lirePhotoSeance, poserPhotoSeance, retirerPhotoSeance } from "../src/db/depots/photos.ts";
import { DELAI_ANNULER_MS, SuppressionDifferee } from "../src/photos/attente.ts";
import { signalerChangementPhoto, surChangementPhoto } from "../src/photos/changement.ts";
import type { Noeud } from "./rendu/rendu.mjs";
import { baseDeTest } from "./aide.ts";

definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" } as never);
const { monter, trouver, texte } = await import("./rendu/rendu.mjs");
const { ZonePhoto } = await import("../src/ecrans/ZonePhoto.tsx");
const contexte = (await import("../src/ecrans/contexte.tsx")) as unknown as { __Contexte: Context<unknown> };
const theme = (await import("../src/theme/index.tsx")) as unknown as { __ContexteTheme: Context<unknown> };
const { modes } = await import("../src/theme/jetons.ts");

const photo = (p: string) => ({ id: p, cheminLocal: `photos/${p}.webp`, cheminVignette: `photos/${p}-v.webp`, largeur: 1600, hauteur: 1200, octets: 10 });
/** Photo déjà envoyée au serveur (clé distante) : sa suppression doit y être répercutée. */
const envoyee = (db: Awaited<ReturnType<typeof baseDeTest>>["db"], id: string) => db.runAsync("UPDATE seance_photo SET cle_distante = ? WHERE id = ?", [id, id]);

test("supprimer : la ligne part, les deux fichiers sont rendus à l'appelant et mis dans la file d'effacement du serveur", async () => {
  const { db } = await baseDeTest(true);
  const id = await demarrerSeance(db, null, "Push");
  await poserPhotoSeance(db, id, photo("p1"));
  await envoyee(db, "p1");
  const retiree = await retirerPhotoSeance(db, id, "p1");
  assert.deepEqual([retiree?.chemin_local, retiree?.chemin_vignette], ["photos/p1.webp", "photos/p1-v.webp"]);
  assert.equal(await lirePhotoSeance(db, id), null);
  assert.deepEqual(await fichiersAEffacer(db), ["p1.webp", "p1-v.webp"]);
});

test("remplacer : une seule photo, la nouvelle ; l'ancienne (fichiers et copie du serveur) part, la nouvelle reste", async () => {
  const { db } = await baseDeTest(true);
  const id = await demarrerSeance(db, null, "Push");
  await poserPhotoSeance(db, id, photo("p1"));
  await envoyee(db, "p1");
  const ancienne = await poserPhotoSeance(db, id, photo("p2"));
  assert.equal(ancienne?.id, "p1");
  assert.equal((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM seance_photo WHERE seance_id = ?", [id]))!.n, 1);
  assert.equal((await lirePhotoSeance(db, id))?.chemin_local, "photos/p2.webp");
  assert.deepEqual(await fichiersAEffacer(db), ["p1.webp", "p1-v.webp"]);
});

test("une photo jamais envoyée n'a rien à effacer au serveur", async () => {
  const { db } = await baseDeTest(true);
  const id = await demarrerSeance(db, null, "Push");
  await poserPhotoSeance(db, id, photo("p1"));
  await retirerPhotoSeance(db, id, "p1");
  assert.deepEqual(await fichiersAEffacer(db), []);
});

test("annuler : rien n'est supprimé, ni en base, ni au serveur", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { db } = await baseDeTest(true);
    const id = await demarrerSeance(db, null, "Push");
    await poserPhotoSeance(db, id, photo("p1"));
    await envoyee(db, "p1");
    const s = new SuppressionDifferee();
    s.demander("p1", () => void retirerPhotoSeance(db, id, "p1"));
    s.annuler();
    mock.timers.tick(DELAI_ANNULER_MS * 2);
    assert.equal((await lirePhotoSeance(db, id))?.id, "p1");
    assert.deepEqual(await fichiersAEffacer(db), []);
  } finally {
    mock.timers.reset();
  }
});

test("le changement d'une photo est signalé aux écrans qui la gardent (Fil de l'Accueil) ; l'écoute s'arrête", () => {
  const vus: string[] = [];
  const arreter = surChangementPhoto((id) => vus.push(id));
  signalerChangementPhoto("s1");
  arreter();
  signalerChangementPhoto("s2");
  assert.deepEqual(vus, ["s1"]);
});

// ——— le vrai composant, rendu ———

const noeuds = (racine: Noeud, f: (n: Noeud) => boolean) => trouver(racine, f);
const ouvrable = (racine: Noeud, libelle: string) => noeuds(racine, (n) => typeof n.props.onPress === "function" && texte(n).trim() === libelle)[0];

async function avecZone(f: (r: Awaited<ReturnType<typeof monter>>, db: Awaited<ReturnType<typeof baseDeTest>>["db"], id: string) => Promise<void>, props: Record<string, unknown> = {}) {
  const { db } = await baseDeTest(true);
  const id = await demarrerSeance(db, null, "Push");
  await poserPhotoSeance(db, id, photo("p1"));
  await envoyee(db, "p1");
  const r = await monter(
    createElement(
      theme.__ContexteTheme.Provider,
      { value: { mode: "nuit", apparence: "nuit", couleurs: modes.nuit, choisir() {} } },
      createElement(
        contexte.__Contexte.Provider,
        { value: { db, reglages: { unite: "kg" }, regler() {} } },
        createElement(ZonePhoto as never, { seanceId: id, ...props }),
      ),
    ),
  );
  try {
    await r.jusqua((x) => trouver(x, (n) => n.props.accessibilityRole === "imagebutton").length > 0, "la photo");
    await f(r, db, id);
  } finally {
    await r.demonter();
  }
}

const photoTouchable = (racine: Noeud) => trouver(racine, (n) => n.props.accessibilityRole === "imagebutton")[0]!;

test("toucher la photo : le menu court (Voir en grand, Remplacer, Supprimer), pas le plein écran", async () => {
  await avecZone(async (r) => {
    assert.equal(ouvrable(r.racine, "Supprimer la photo"), undefined, "menu fermé : pas d'options");
    await r.agir(() => photoTouchable(r.racine).props.onPress());
    await r.jusqua((x) => ouvrable(x, "Supprimer la photo") != null, "le menu");
    for (const l of ["Voir en grand", "Remplacer la photo", "Supprimer la photo"]) assert.ok(ouvrable(r.racine, l), l);
    assert.equal(ouvrable(r.racine, "Prendre une photo"), undefined, "Remplacer ne s'ouvre qu'au toucher");
  });
});

test("Remplacer : Prendre une photo ou Galerie photo, sur la même zone (la photo n'est pas retirée avant le choix)", async () => {
  await avecZone(async (r, db, id) => {
    await r.agir(() => photoTouchable(r.racine).props.onPress());
    // le menu s'ouvre au rendu suivant : l'attendre avant de toucher « Remplacer » (instable sous charge sinon)
    await r.jusqua((x) => ouvrable(x, "Remplacer la photo") != null, "le menu");
    await r.agir(() => ouvrable(r.racine, "Remplacer la photo")!.props.onPress());
    await r.jusqua((x) => ouvrable(x, "Galerie photo") != null && ouvrable(x, "Prendre une photo") != null, "les sources");
    assert.equal((await lirePhotoSeance(db, id))?.id, "p1");
    assert.equal(trouver(r.racine, (n) => n.props.accessibilityRole === "imagebutton").length, 1);
  });
});

test("Supprimer : la photo quitte l'écran, « Photo supprimée » avec Annuler ; Annuler la remet, rien n'est effacé", async () => {
  await avecZone(async (r, db, id) => {
    await r.agir(() => photoTouchable(r.racine).props.onPress());
    await r.jusqua((x) => ouvrable(x, "Supprimer la photo") != null, "le menu");
    await r.agir(() => ouvrable(r.racine, "Supprimer la photo")!.props.onPress());
    await r.jusqua((x) => texte(x).includes("Photo supprimée"), "la bulle d'annulation");
    assert.ok(ouvrable(r.racine, "Annuler"), "le geste Annuler");
    await r.agir(() => ouvrable(r.racine, "Annuler")!.props.onPress());
    await r.jusqua((x) => !texte(x).includes("Photo supprimée"), "la bulle fermée");
    assert.equal((await lirePhotoSeance(db, id))?.id, "p1");
    assert.deepEqual(await fichiersAEffacer(db), []);
  });
});

test("couverture : la bulle « Photo supprimée » n'est pas dans la page qui défile (la barre transparente la recouvrait) ; la page la pose, Annuler remet la photo", async () => {
  const vus: ((() => void) | null)[] = [];
  const surAttente = (a: (() => void) | null) => void vus.push(a);
  await avecZone(
    async (r, db, id) => {
      await r.agir(() => photoTouchable(r.racine).props.onPress());
      await r.jusqua((x) => ouvrable(x, "Supprimer la photo") != null, "le menu");
      await r.agir(() => ouvrable(r.racine, "Supprimer la photo")!.props.onPress());
      await r.jusqua(() => typeof vus.at(-1) === "function", "l'annulation passée à la page");
      assert.ok(!texte(r.racine).includes("Photo supprimée"), "pas de bulle dans la zone qui défile");
      assert.equal(ouvrable(r.racine, "Annuler"), undefined);
      await r.agir(() => vus.at(-1)!());
      await r.jusqua(() => vus.at(-1) === null, "l'annulation retirée de la page");
      await r.jusqua((x) => trouver(x, (n) => n.props.accessibilityRole === "imagebutton").length > 0, "la photo remise");
      assert.equal((await lirePhotoSeance(db, id))?.id, "p1");
      assert.deepEqual(await fichiersAEffacer(db), []);
    },
    { couverture: { haut: 100 }, surAttente },
  );
});
