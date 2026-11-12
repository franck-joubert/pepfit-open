// Séance en cours : réordonner exercices et séries par appui long (demande d'Alex du 31/10), même geste que l'éditeur
// de routine. Numéros, séries cochées, supersets, persistance, aperçu affiché au lâcher, séries de routine.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { creerExercice } from "../src/db/depots/exercices.ts";
import { creerRoutine, definirCibleSerie, definirTypeSerie, lireExercicesDeRoutine, lireRoutine, ordonnerSeriesRoutine } from "../src/db/depots/routines.ts";
import { cocherSerie, demarrerSeanceDepuisRoutine, disposerSeance, lireSeance, modifierSerie, ordonnerSeriesSeance, type SeanceDetail } from "../src/db/depots/seances.ts";
import { deplacerBloc, deplacerExercice, depotDe, fentes, hauteursGlisser, poserAvant, rangeesDe, rangeesSeries, type LigneDispo } from "../src/ecrans/glisser.ts";
import { avecDisposition, avecOrdreSeries, numerosSeries, ordreExecution } from "../src/ecrans/ordre-seance.ts";
import { baseDeTest } from "./aide.ts";

const noms = (s: SeanceDetail) => s.exercices.map((e) => e.exercice.nom).join(" ");
const dispo = (s: SeanceDetail): LigneDispo[] => s.exercices.map((e) => ({ id: e.exercice.id, groupe: e.groupeSuperset, repos: e.reposS }));
const lire = (s: string) => readFileSync(new URL(`../src/${s}`, import.meta.url), "utf8");

/** Séance démarrée d'une routine : Squat seul (3 séries, la 1re en échauffement), Superset (Curl, Dips), Presse seule. */
async function seance() {
  const { db } = await baseDeTest();
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
  const [l] = await lireExercicesDeRoutine(db, r);
  await definirTypeSerie(db, l!.id, 0, "echauffement");
  const id = await demarrerSeanceDepuisRoutine(db, r, false);
  return { db, id, squat, curl, dips, presse };
}

test("numéros : ils suivent le nouvel ordre, les séries à lettre (échauffement…) gardent la leur", () => {
  assert.deepEqual(numerosSeries(["echauffement", "normale", "normale", "rate", "normale"]), ["W", "1", "2", "F", "3"]);
  // La 3e série de travail remonte en tête : elle devient « 1 », l'échauffement reste « W » où qu'il soit.
  assert.deepEqual(numerosSeries(["normale", "echauffement", "normale", "normale"]), ["1", "W", "2", "3"]);
});

test("séries : une liste à plat, toute place permise, le dépôt dit avant quelle série poser ; elles gardent leur hauteur", () => {
  const rs = rangeesSeries(["a", "b", "c", "d"]);
  const autres = rs.filter((r) => r.id !== "d");
  assert.equal(fentes(autres, "exercice").length, 4);
  assert.deepEqual(depotDe(rs, 3, 3, "exercice", { index: 0, groupe: null }), { mode: "exercice", id: "d", avant: "a", groupe: null });
  assert.deepEqual(depotDe(rs, 0, 0, "exercice", { index: 3, groupe: null }), { mode: "exercice", id: "a", avant: null, groupe: null });
  // Une série avec la question d'effort dessous (120) ne se replie pas comme une carte d'exercice (73).
  assert.deepEqual(hauteursGlisser(rs, [48, 120, 48, 48], 0, 0), [48, 120, 48, 48]);
  assert.deepEqual(poserAvant(["a", "b", "c", "d"], "d", "a"), ["d", "a", "b", "c"]);
  assert.deepEqual(poserAvant(["a", "b", "c", "d"], "a", null), ["b", "c", "d", "a"]);
  assert.deepEqual(poserAvant(["a", "b"], "z", "a"), ["a", "b"]);
});

test("séries en séance : cochées et valeurs restent, numéro et précédent suivent le rang, enregistré tout de suite", async () => {
  const { db, id, squat } = await seance();
  let s = (await lireSeance(db, id))!;
  const [w, s1, s2] = s.exercices[0]!.series;
  await modifierSerie(db, s1!.id, { kg: 100, reps: 5 });
  await cocherSerie(db, s1!.id, true);
  const coche = (await lireSeance(db, id))!.exercices[0]!.series[1]!.fait_le;
  await modifierSerie(db, s2!.id, { kg: 110, reps: 3 });
  // La 3e série (110 kg) passe en tête.
  await ordonnerSeriesSeance(db, id, squat, [s2!.id, w!.id, s1!.id]);
  s = (await lireSeance(db, id))!;
  const series = s.exercices[0]!.series;
  assert.deepEqual(series.map((x) => x.id), [s2!.id, w!.id, s1!.id]);
  assert.deepEqual(numerosSeries(series.map((x) => x.type)), ["1", "W", "2"]);
  const deplacee = series[2]!;
  assert.equal(deplacee.faite, 1);
  assert.equal(deplacee.fait_le, coche);
  assert.equal(deplacee.kg, 100);
  assert.equal(series[0]!.kg, 110);
  assert.equal(series[0]!.faite, 0);
  // Les séries reprennent les places de l'exercice : les autres exercices ne bougent pas.
  assert.deepEqual(
    series.map((x) => x.position),
    [w!.position, s1!.position, s2!.position],
  );
  // Ordre faux (série d'un autre exercice, série en moins) : rien n'est écrit.
  await ordonnerSeriesSeance(db, id, squat, [s2!.id, w!.id]);
  assert.deepEqual((await lireSeance(db, id))!.exercices[0]!.series.map((x) => x.id), [s2!.id, w!.id, s1!.id]);
});

test("séries : l'aperçu affiché au lâcher est déjà l'ordre que la base relit", async () => {
  const { db, id, squat } = await seance();
  const avant = (await lireSeance(db, id))!;
  const ids = avant.exercices[0]!.series.map((x) => x.id).reverse();
  const apercu = avecOrdreSeries(avant, squat, ids);
  await ordonnerSeriesSeance(db, id, squat, ids);
  const relue = (await lireSeance(db, id))!;
  const vu = (s: SeanceDetail) => s.exercices[0]!.series.map((x) => `${x.id}@${x.position}`);
  assert.deepEqual(vu(apercu), vu(relue));
  assert.deepEqual(ordreExecution(apercu).map((x) => x.id), ordreExecution(relue).map((x) => x.id));
});

test("exercices : un superset bouge en bloc, l'ordre d'exécution et les positions des séries suivent", async () => {
  const { db, id } = await seance();
  const avant = (await lireSeance(db, id))!;
  await cocherSerie(db, avant.exercices[1]!.series[0]!.id, true);
  // Le superset (bloc 1) passe en tête.
  const lignes = deplacerBloc(dispo(avant), 1, 0);
  await disposerSeance(db, id, lignes);
  const s = (await lireSeance(db, id))!;
  assert.equal(noms(s), "Curl Dips Squat Presse");
  assert.deepEqual(s.blocs.map((b) => b.exercices.length), [2, 1, 1]);
  assert.equal(s.blocs[0]!.reposS, 90);
  assert.equal(s.exercices[0]!.series[0]!.faite, 1);
  // Positions : tour par tour dans le superset, puis exercice par exercice (clavier de séance : case suivante).
  const ordre = ordreExecution(s);
  assert.deepEqual(ordre.map((x) => x.position), ordre.map((_, i) => i));
  assert.deepEqual(ordre.slice(0, 4).map((x) => x.exercice_id), [s.exercices[0]!.exercice.id, s.exercices[1]!.exercice.id, s.exercices[0]!.exercice.id, s.exercices[1]!.exercice.id]);
});

test("exercices : entrer dans un superset (repos 0, temps entre exercices du superset), en sortir (repos par défaut)", async () => {
  const { db, id, presse, curl } = await seance();
  let s = (await lireSeance(db, id))!;
  // Temps entre exercices du superset : 20 s, sur chaque membre.
  await db.runAsync("UPDATE seance_exercices SET repos_transition_s = 20 WHERE seance_id = ? AND groupe_superset = 1", [id]);
  s = (await lireSeance(db, id))!;
  // La Presse entre dans le superset, entre Curl et Dips.
  const dips = s.exercices[2]!.exercice.id;
  let lignes = deplacerExercice(dispo(s), presse, dips, 1, 120);
  const apercu = avecDisposition(s, lignes);
  await disposerSeance(db, id, lignes);
  s = (await lireSeance(db, id))!;
  assert.equal(noms(s), "Squat Curl Presse Dips");
  assert.equal(noms(apercu), noms(s));
  const p = s.exercices[2]!;
  assert.equal(p.groupeSuperset, 1);
  assert.equal(p.reposS, 0);
  assert.equal(p.reposTransitionS, 20);
  assert.ok(p.series.every((x) => x.groupe_superset === 1));
  assert.equal(s.blocs[1]!.exercices.length, 3);
  assert.deepEqual(apercu.blocs.map((b) => b.exercices.length), s.blocs.map((b) => b.exercices.length));
  // Le Curl sort : il reprend le repos par défaut ; le superset garde Presse et Dips.
  lignes = deplacerExercice(dispo(s), curl, null, null, 120);
  await disposerSeance(db, id, lignes);
  s = (await lireSeance(db, id))!;
  assert.equal(noms(s), "Squat Presse Dips Curl");
  assert.equal(s.exercices[3]!.groupeSuperset, null);
  assert.equal(s.exercices[3]!.reposS, 120);
  assert.ok(s.exercices[3]!.series.every((x) => x.groupe_superset === null));
});

test("persistance : l'ordre est en base dès le lâcher, une autre lecture (appli relancée) le retrouve", async () => {
  const { db, id, presse } = await seance();
  const s = (await lireSeance(db, id))!;
  await disposerSeance(db, id, deplacerExercice(dispo(s), presse, s.exercices[0]!.exercice.id, null, 120));
  const lignes = await db.getAllAsync<{ exercice_id: string; position: number }>("SELECT exercice_id, position FROM seance_exercices WHERE seance_id = ? ORDER BY position", [id]);
  assert.equal(lignes[0]!.exercice_id, presse);
  assert.equal(noms((await lireSeance(db, id))!), "Presse Squat Curl Dips");
});

test("routine : les séries se réordonnent aussi, chaque cible suit sa série", async () => {
  const { db } = await baseDeTest();
  const a = await creerExercice(db, { nom: "Presse" });
  const r = await creerRoutine(db, "Jambes", [{ exerciceId: a, nbSeries: 3 }]);
  const [l] = await lireExercicesDeRoutine(db, r);
  await definirTypeSerie(db, l!.id, 0, "echauffement");
  await definirCibleSerie(db, l!.id, 1, { kg: 60 });
  await definirCibleSerie(db, l!.id, 2, { kg: 80 });
  await ordonnerSeriesRoutine(db, l!.id, [2, 0, 1]);
  const c = (await lireRoutine(db, r))!.blocs[0]!.lignes[0]!.cibles;
  assert.deepEqual(c.map((x) => [x.type, x.kg]), [["normale", 80], ["echauffement", null], ["normale", 60]]);
  assert.deepEqual(numerosSeries(c.map((x) => x.type)), ["1", "W", "2"]);
  // Ordre faux : rien ne bouge.
  await ordonnerSeriesRoutine(db, l!.id, [0, 0, 1]);
  assert.deepEqual((await lireRoutine(db, r))!.blocs[0]!.lignes[0]!.cibles.map((x) => x.kg), [80, null, 60]);
});

test("écran : même composant que l'éditeur de routine, un seul défilement, la suppression au glissé s'efface pendant le geste", () => {
  const vue = lire("ecrans/seance-vue.tsx");
  assert.match(vue, /RangeeGlissable/);
  assert.match(vue, /useGlisser\(/);
  assert.match(vue, /CadreSuperset/);
  for (const ecran of ["app/session.tsx", "app/history/edit/[id].tsx", "app/routine/[id].tsx"]) assert.match(lire(ecran), /ContexteDefilement\.Provider/, ecran);
  assert.match(lire("ui/LigneSerie.tsx"), /GlisserSupprimer actif=\{glisseLibre/);
  assert.match(lire("app/routine/[id].tsx"), /rangeesSeries\(/);
  // Seuil et délai : ceux de l'éditeur, un seul jeu de valeurs.
  const glisser = lire("ui/Glisser.tsx");
  assert.match(glisser, /const APPUI_LONG_MS = 350;/);
  assert.match(glisser, /const TOLERANCE_PX = 8;/);
});

test("rangées de la séance : les mêmes que l'éditeur (en-tête et pied de superset)", () => {
  const rs = rangeesDe([
    { id: "S", groupe: null },
    { id: "C", groupe: 1 },
    { id: "D", groupe: 1 },
  ]);
  assert.deepEqual(rs.map((r) => r.id), ["S", "t1", "C", "D", "p1"]);
});
