// Coche d'une série optimiste (audit M6, docs/PERF-D.md) : la case passe au vert et le repos part dans la même image, sans
// aucune requête ; l'écriture suit après l'image ; un échec retire la coche, arrête le repos et le dit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { creerExercice } from "../src/db/depots/exercices.ts";
import { creerRoutine } from "../src/db/depots/routines.ts";
import { demarrerSeanceDepuisRoutine, lireSeance, reposApresDans, reposApresSerie } from "../src/db/depots/seances.ts";
import type { Executeur } from "../src/db/executeur.ts";
import { avecCoches, cocherOptimiste, cochesEnAttente, type Coche } from "../src/ecrans/coche-optimiste.ts";
import { minuteur } from "../src/natif/minuteur/index.ts";
import { baseDeTest, facade } from "./aide.ts";

/** Séance d'une routine : Squat seul (repos 120), superset Curl → Dips (20 s entre les deux, 90 après le tour), Presse. */
async function seance() {
  const { db, brute } = await baseDeTest();
  const squat = await creerExercice(db, { nom: "Squat" });
  const curl = await creerExercice(db, { nom: "Curl" });
  const dips = await creerExercice(db, { nom: "Dips" });
  const presse = await creerExercice(db, { nom: "Presse" });
  const r = await creerRoutine(db, "Jambes", [
    { exerciceId: squat, nbSeries: 3, reposS: 120 },
    { exerciceId: curl, nbSeries: 2, reposS: 0, groupeSuperset: 1 },
    { exerciceId: dips, nbSeries: 2, reposS: 90, groupeSuperset: 1 },
    { exerciceId: presse, nbSeries: 2, reposS: 60 },
  ]);
  const id = await demarrerSeanceDepuisRoutine(db, r, false);
  await db.runAsync("UPDATE seance_exercices SET repos_transition_s = 20 WHERE seance_id = ? AND groupe_superset = 1", [id]);
  return { db, brute, id, s: (await lireSeance(db, id))! };
}

/** La façade de l'appli sur la connexion `brute`, qui compte les requêtes. */
function compteur(brute: Executeur) {
  const n = { requetes: 0 };
  const c = new Proxy(brute, {
    get(cible, nom) {
      const v = Reflect.get(cible, nom, cible);
      if (typeof v !== "function" || !["execAsync", "runAsync", "getFirstAsync", "getAllAsync"].includes(String(nom))) return v;
      return (...a: unknown[]) => (n.requetes++, v.apply(cible, a));
    },
  });
  return { db: facade(c), n };
}

test("repos d'après une série : le calcul sur la séance affichée = celui de la base, pour chaque série", async () => {
  const { db, s } = await seance();
  for (const e of s.exercices) for (const x of e.series) assert.deepEqual(reposApresDans(s, x.id), await reposApresSerie(db, x.id), `${e.exercice.nom} ${x.position}`);
});

test("séance affichée avec les coches : seules les cartes touchées changent d'objet ; coches oubliées quand la base les confirme", async () => {
  const { s } = await seance();
  const x = s.exercices[0]!.series[1]!;
  const coches = new Map<string, Coche>([[x.id, { faite: true, le: 42 }]]);
  const v = avecCoches(s, coches);
  assert.equal(v.exercices[0]!.series[1]!.faite, 1);
  assert.equal(v.exercices[0]!.series[1]!.fait_le, 42);
  assert.notEqual(v.exercices[0], s.exercices[0]);
  assert.equal(v.blocs[0]!.exercices[0], v.exercices[0], "bloc et liste : le même objet");
  for (let i = 1; i < s.exercices.length; i++) assert.equal(v.exercices[i], s.exercices[i], "carte non touchée : même objet");
  assert.equal(avecCoches(s, new Map()), s);
  // la séance relue ne dit pas encore la même chose : la coche reste ; elle le dit : oubliée
  assert.equal(cochesEnAttente(s, coches), coches);
  assert.equal(cochesEnAttente(v, coches).size, 0);
});

test("coche : posée et repos lancé sans aucune requête ; écriture après l'image, dans l'ordre des gestes", async () => {
  const { db: base, brute, id, s } = await seance();
  const { db, n } = compteur(brute);
  const images: (() => void)[] = [];
  const poses: Coche[] = [];
  const file = { current: Promise.resolve() as Promise<unknown> };
  minuteur.passer();
  const [a, b] = s.exercices[1]!.series; // Curl : dans le superset, avant Dips
  const o = { db, seance: s, file, apres: (f: () => void) => void images.push(f), poser: (c: Coche) => void poses.push(c), retirer: () => {}, erreur: (e: unknown) => assert.fail(String((e as Error)?.stack ?? e)) };
  const p1 = cocherOptimiste({ ...o, serie: a!, faite: true });
  const p2 = cocherOptimiste({ ...o, serie: b!, faite: true });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(n.requetes, 0, "aucune requête avant l'image suivante");
  assert.equal(poses.length, 2);
  assert.equal(minuteur.etat().actif, true, "le repos est lancé");
  assert.equal(minuteur.etat().totalS, 20, "temps entre les exercices du superset");
  images.forEach((f) => f());
  await Promise.all([p1, p2]);
  assert.ok(n.requetes > 0);
  const relue = (await lireSeance(base, id))!;
  assert.deepEqual(relue.exercices[1]!.series.map((x) => x.faite), [1, 1]);
  assert.ok(Number(await base.getFirstAsync<{ valeur: string }>("SELECT valeur FROM reglages WHERE cle = 'repos_fin'", []).then((r) => r?.valeur)) > 0, "échéance du repos écrite");
  minuteur.passer();
});

test("coche : l'écriture échoue → la coche est retirée, le repos arrêté, l'erreur dite", async () => {
  const { brute, s } = await seance();
  // La connexion refuse l'écriture de la série (disque plein), sous la façade de l'appli.
  const casse = facade(
    new Proxy(brute, {
      get(cible, nom) {
        const v = Reflect.get(cible, nom, cible);
        if (nom === "runAsync") return (sql: string, p: unknown[]) => (sql.startsWith("UPDATE series SET kg") ? Promise.reject(new Error("disque plein")) : v.call(cible, sql, p));
        return typeof v === "function" ? v.bind(cible) : v;
      },
    }),
  );
  minuteur.passer();
  const retires: Coche[] = [];
  const erreurs: unknown[] = [];
  let posee: Coche | null = null;
  await cocherOptimiste({
    db: casse,
    seance: s,
    serie: s.exercices[0]!.series[0]!,
    faite: true,
    file: { current: Promise.resolve() },
    apres: (f) => f(),
    poser: (c) => void (posee = c),
    retirer: (c) => void retires.push(c),
    erreur: (e) => void erreurs.push(e),
  });
  assert.ok(posee);
  assert.deepEqual(retires, [posee]);
  assert.equal(erreurs.length, 1);
  assert.match(String(erreurs[0]), /disque plein/);
  assert.equal(minuteur.etat().actif, false, "le repos lancé par la coche est arrêté");
});

test("écran : la coche passe par cocherOptimiste, sans relire la séance", async () => {
  const { readFileSync } = await import("node:fs");
  const lire = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  const actions = lire("ecrans/actions-seance.tsx");
  assert.match(actions, /cocherOptimiste\(\{/);
  assert.doesNotMatch(actions, /cocherSerie|reposApresSerie/);
  assert.doesNotMatch(actions, /void cocher\(x, !x\.faite\)\)?\.then\(recharger/);
});
