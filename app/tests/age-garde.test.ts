// Âge pepfit gardé (31/10 : « l'âge est calculé une fois par semaine ») : le résultat est gardé dans la base et
// montré au lancement sans relire l'historique ; il n'est refait qu'à une nouvelle semaine, après une saisie qui le touche,
// ou quand une synchro apporte du neuf sur des semaines déjà comptées. Réglage local : ni sauvegardé, ni exporté.
import { test } from "node:test";
import assert from "node:assert/strict";
import { baseDeTest, jour } from "./aide";
import type { Executeur } from "../src/db/executeur";
import { ecrireReglage, lireReglage } from "../src/db/depots/reglages";
import { ageAJour, CLE_AGE_GARDE, lireAgeGarde, lireAgeVite } from "../src/ecrans/mesures/age-donnees";
import { exporterJson } from "../src/sync/export";

const J = 86_400_000;
// mercredi 28 octobre 2026 ; lundi de la semaine : le 26
const MAINTENANT = jour(2026, 10, 28, 12);

/** Base avec un profil et 200 jours Whoop ; `lectures` compte les relectures de l'historique (le calcul lourd). */
async function base() {
  const { db, raw } = await baseDeTest();
  await ecrireReglage(db, "naissance", "1987-04-12");
  await ecrireReglage(db, "sexe", "h");
  const ins = raw.prepare("INSERT INTO whoop_jour (jour, fc_repos, sommeil_min, sommeil_regularite, pas, maj_le) VALUES (?,?,?,?,?,?)");
  for (let i = 1; i <= 200; i++) {
    const d = new Date(MAINTENANT - i * J);
    ins.run(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), 48 + (i % 5), 420 + (i % 30), 80, 8000 + 37 * i, MAINTENANT);
  }
  const compte = { lectures: 0 };
  const espion: Executeur = {
    ...db,
    getAllAsync: <T>(sql: string, p: (string | number | null)[]) => {
      if (/^SELECT \* FROM whoop_jour WHERE jour >= \?/.test(sql)) compte.lectures++;
      return db.getAllAsync<T>(sql, p);
    },
  };
  return { db: espion, raw, compte };
}

test("lancement à froid : l'âge gardé est montré sans recalcul", async () => {
  const { db, compte } = await base();
  const premier = await ageAJour(db, MAINTENANT);
  assert.equal(premier.recalcule, true, "premier lancement : calculé");
  assert.ok(premier.d?.courante.age != null, "un âge pepfit");
  assert.equal(compte.lectures, 1);
  const garde = await lireAgeGarde(db);
  assert.equal(garde?.lundi, new Date(2026, 9, 26).getTime(), "semaine du calcul gardée");

  // appli relancée le lendemain (même semaine, rien de neuf) : le gardé tout de suite, et pas de recalcul ensuite
  let ensuite = 0;
  const vu = await lireAgeVite(db, () => ensuite++, MAINTENANT + J);
  assert.deepEqual(vu, premier.d, "l'âge gardé, tel quel");
  await new Promise((ok) => setTimeout(ok, 10));
  assert.equal(compte.lectures, 1, "l'historique n'est pas relu");
  assert.equal(ensuite, 0, "rien à reposer");
  assert.equal((await lireAgeGarde(db))?.calcule, MAINTENANT, "le gardé n'est pas réécrit");
});

test("nouvelle semaine : recalculé en fond, le gardé montré d'abord", async () => {
  const { db, compte } = await base();
  const premier = await ageAJour(db, MAINTENANT);
  const lundiSuivant = jour(2026, 11, 2, 8);
  let nouveau: unknown = null;
  const vu = await lireAgeVite(db, (d) => (nouveau = d), lundiSuivant);
  assert.deepEqual(vu, premier.d, "d'abord l'âge de la semaine d'avant");
  await new Promise((ok) => setTimeout(ok, 20));
  assert.equal(compte.lectures, 2, "recalculé");
  assert.ok(nouveau, "le nouvel âge est reposé");
  assert.equal((await lireAgeGarde(db))?.lundi, new Date(2026, 10, 2).getTime(), "gardé pour la nouvelle semaine");
});

test("une saisie qui touche l'âge (pesée, tour, %gras, profil) le fait recalculer", async () => {
  const { db, raw, compte } = await base();
  await ageAJour(db, MAINTENANT);
  const saisies: [string, () => void][] = [
    ["pesée", () => raw.prepare("INSERT INTO pesee (id, date, kg, source) VALUES ('p1', ?, 78, 'manuel')").run(MAINTENANT)],
    ["tour", () => raw.prepare("INSERT INTO mensurations (id, type, date, valeur) VALUES ('m1', 'tour_taille', ?, 82)").run(MAINTENANT)],
    ["%gras", () => raw.prepare("INSERT INTO mesure_corps (id, type, date, valeur, source, cree_le) VALUES ('g1', 'gras', ?, 14.2, 'saisie', ?)").run(MAINTENANT, MAINTENANT)],
    ["profil", () => raw.prepare("UPDATE reglages SET valeur = '1987-05-12' WHERE cle = 'naissance'").run()],
  ];
  for (const [nom, saisir] of saisies) {
    const avant = compte.lectures;
    saisir();
    assert.equal((await ageAJour(db, MAINTENANT)).recalcule, true, `${nom} : recalculé`);
    assert.equal(compte.lectures, avant + 1);
    assert.equal((await ageAJour(db, MAINTENANT)).recalcule, false, `${nom} : une seule fois`);
  }
});

test("synchro : recalcul seulement pour du neuf sur des semaines déjà comptées", async () => {
  const { db, raw } = await base();
  await ageAJour(db, MAINTENANT);
  const ce = new Date(2026, 9, 28).getTime();
  // la nuit et les pas d'aujourd'hui (semaine en cours) : comptés au lundi suivant
  raw.prepare("UPDATE whoop_jour SET sommeil_min = 300 WHERE jour = ?").run(ce - J);
  raw.prepare("INSERT INTO whoop_jour (jour, fc_repos, sommeil_min, pas, maj_le) VALUES (?, 47, 410, 9000, ?)").run(ce, MAINTENANT);
  assert.equal((await ageAJour(db, MAINTENANT)).recalcule, false, "semaine en cours : pas de recalcul");
  // une nuit d'il y a trois semaines corrigée par Whoop
  raw.prepare("UPDATE whoop_jour SET sommeil_min = 380 WHERE jour = ?").run(new Date(2026, 9, 7).getTime());
  assert.equal((await ageAJour(db, MAINTENANT)).recalcule, true, "semaine déjà comptée : recalcul");
});

test("l'âge gardé est un réglage local : pas dans l'export", async () => {
  const { db } = await base();
  await ageAJour(db, MAINTENANT);
  assert.ok(await lireReglage(db, CLE_AGE_GARDE), "gardé dans la base");
  const json = JSON.parse(await exporterJson(db, MAINTENANT)) as { tables: { reglages: { cle: string }[] } };
  assert.ok(json.tables.reglages.some((r) => r.cle === "naissance"));
  assert.ok(!json.tables.reglages.some((r) => r.cle === CLE_AGE_GARDE), "pas exporté");
});
