// Boutique de programmes (planche boutique-programmes, A validée le 28/10) : catalogue (22 programmes, schéma, générateur à
// jour, pictos), calculs purs (durées, volumes, profil, filtres, Pour toi, placement sur tes jours, charges) et démarrage d'un
// programme dans la base (migration 34, routines, programmations, plan arrêté).
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  aUneLongue, calendrierPlan, chargeDepart, conseil, dansPuce, dureeSeance, exercicesAProgression, filtrer, joursParDefaut, nbFiltres, placerSemaine,
  CRITERES, pourToi, prochainLundi, proches, profil, rechercher, routinesDuPlan, SANS_FILTRE, volumes, type Filtres,
} from "../src/boutique/calculs.ts";
import { estRoutine, validerProgramme, validerRoutine, type Programme, type RoutineBoutique } from "../src/boutique/modele.ts";
import { ajouterRoutineBoutique, arreterPlan, demarrerPlan, derniereCharge, listerPlans, seancesDuPlan, supprimerPlan } from "../src/db/depots/plans.ts";
import { listerProgrammations } from "../src/db/depots/programmations.ts";
import { listerRoutines, lireRoutine, supprimerRoutine } from "../src/db/depots/routines.ts";
import { listerNotes } from "../src/db/depots/notes.ts";
import { MIGRATIONS, migrer, VERSION_COURANTE } from "../src/db/migrations.ts";
import { ecartJ, jourSem } from "../src/ecrans/planification.ts";
import { fichiers, PROGRAMMES } from "../scripts/programmes/construire.ts";
import { ROUTINES } from "../scripts/programmes/routines.ts";
import { adapter, baseDeTest, catalogue } from "./aide.ts";

const DOSSIER = new URL("../assets/catalogue/programmes/", import.meta.url);
const lus: Programme[] = readdirSync(DOSSIER).map((f) => JSON.parse(readFileSync(new URL(f, DOSSIER), "utf8")) as Programme);
const P = (id: string) => lus.find((p) => p.id === id)!;
const SLUGS = new Set(catalogue().exercices.map((e) => e.slug));

// ---------------------------------------------------------------- catalogue

test("catalogue : les 22 programmes de NOTES § 3, chacun valide (schéma, textes fr et en, slugs connus)", () => {
  assert.equal(lus.length, 22);
  assert.deepEqual(
    lus.map((p) => p.id).sort(),
    ["c10", "c10a", "c5", "dos", "equi", "f5", "fb", "gen", "hal", "hb", "hiit", "kb", "mara", "mob", "nage", "padel", "pp", "ppl", "rando", "rf", "semi", "velo"],
  );
  for (const p of lus) assert.deepEqual(validerProgramme(p, SLUGS), [], p.id);
});

test("catalogue : les fichiers livrés sont ceux du générateur (npm run programmes)", () => {
  for (const [u, contenu] of fichiers()) assert.equal(readFileSync(u, "utf8"), contenu, u.pathname);
  assert.deepEqual(PROGRAMMES.map((p) => p.id).length, 22);
});

test("catalogue : durée, séances par semaine et niveau de NOTES § 3", () => {
  const attendu: Record<string, [number, number, number]> = {
    c5: [9, 3, 1], c10a: [10, 3, 1], c10: [8, 4, 2], semi: [12, 4, 2], mara: [16, 5, 3], nage: [8, 3, 1], velo: [8, 3, 2], rando: [8, 3, 1],
    fb: [8, 3, 1], f5: [12, 3, 2], ppl: [10, 6, 2], hb: [10, 4, 2], hal: [8, 3, 1], padel: [6, 2, 2],
    pp: [12, 4, 1], hiit: [6, 3, 2], rf: [8, 3, 1], kb: [8, 3, 2], mob: [4, 5, 1], dos: [6, 4, 1], gen: [8, 3, 1], equi: [8, 2, 1],
  };
  for (const p of lus) assert.deepEqual([p.semaines, p.seancesParSemaine, p.niveau], attendu[p.id], p.id);
});

test("catalogue : vignettes et exercices de force avec les pictos 3D de l'appli", () => {
  const index = readFileSync(new URL("../src/ui/pictos-index.ts", import.meta.url), "utf8");
  const fichiersPicto = new Set([...index.match(/export const FICHIERS[^{]*\{([\s\S]*?)\n\};/)![1]!.matchAll(/"([^"]+)":/g)].map((m) => m[1]!));
  const corresp = Object.fromEntries([...index.match(/export const CATALOGUE[^{]*\{([\s\S]*?)\n\};/)![1]!.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1]!, m[2]!]));
  for (const p of lus) assert.ok(fichiersPicto.has(p.picto), `${p.id} : picto ${p.picto}`);
  // Force et muscle : chaque exercice a son picto (la fiche force montre les pictos des exercices).
  for (const p of lus.filter((x) => x.famille === "force" && x.id !== "padel")) {
    for (const s of Object.values(p.seances)) for (const b of s.blocs) assert.ok(fichiersPicto.has(corresp[b.exo] ?? b.exo), `${p.id} : ${b.exo} sans picto`);
  }
});

test("catalogue : santé (D5) avec avertissement médical ; marquage force avec charges de départ", () => {
  for (const id of ["gen", "equi"]) assert.ok(P(id).avertissement?.fr && P(id).avertissement?.en, id);
  assert.equal(P("f5").chargesDepart, true);
  assert.deepEqual(exercicesAProgression(P("f5")).map((x) => [x.exo, x.progressionKg]), [["squat", 2.5], ["couche", 2.5], ["bent-over-barbell-row", 2.5], ["standing-military-press", 2.5], ["sdt", 5]]);
});

test("validateur : refuse un texte sans anglais, une semaine incomplète, un slug inconnu, un superset coupé", () => {
  const p = structuredClone(P("c5"));
  p.nom = { fr: "x", en: "" };
  p.calendrier[0]!.seances.pop();
  const s = Object.values(p.seances)[0]!;
  s.blocs[0]!.exo = "inexistant";
  s.blocs[0]!.superset = 1;
  const e = validerProgramme(p, SLUGS).join("\n");
  assert.match(e, /nom/);
  assert.match(e, /3 séances attendues/);
  assert.match(e, /slug inconnu inexistant/);
  assert.match(e, /superset 1/);
});

// ---------------------------------------------------------------- calculs

test("séance type de « 10 km plus vite » : 15 min, 6 × 3 min en Z4 avec 2 min de récup, retour au calme ; ~ 50 min", () => {
  const s = P("c10").seances[P("c10").seanceType]!;
  const pr = profil(s);
  assert.equal(pr.filter((x) => x.zone === 4 && !x.recup).length, 6);
  assert.equal(pr.filter((x) => x.recup).length, 5);
  assert.equal(Math.round(dureeSeance(s) / 60), 51);
});

test("volume semaine par semaine : une barre par semaine, l'affûtage plus bas que le pic", () => {
  const v = volumes(P("c10"));
  assert.equal(v.length, 8);
  assert.ok(v[7]! < Math.max(...v) && v[6]! < Math.max(...v));
  assert.ok(Math.abs(v[0]! - 150) <= 15, `S1 ≈ 2h30 (${v[0]})`);
});

test("puces et filtres : « Intermédiaire, Courir, Dehors » donne 10 km plus vite et Semi ; proches : un autre niveau", () => {
  const f: Filtres = { ...SANS_FILTRE, niveau: 2, objectif: "distance", lieu: "dehors" };
  assert.equal(nbFiltres(f), 3);
  assert.deepEqual(filtrer(lus, f).map((p) => p.id).sort(), ["c10", "semi"]);
  const pr = proches(lus, f);
  assert.equal(pr.relache, "niveau");
  assert.deepEqual(pr.programmes.map((p) => p.id).sort(), ["c10a", "c5", "mara"]);
  assert.ok(dansPuce(P("hal"), "maison") && dansPuce(P("nage"), "piscine") && dansPuce(P("padel"), "padel") && !dansPuce(P("fb"), "maison"));
  assert.deepEqual(filtrer(lus, { ...SANS_FILTRE, seances: 5 }).map((p) => p.id).sort(), ["mara", "mob", "ppl"]);
  assert.deepEqual(filtrer(lus, { ...SANS_FILTRE, duree: "long" }).map((p) => p.id).sort(), ["f5", "mara", "pp", "semi"]);
  // Aucun filtre : rien de « proche ».
  assert.deepEqual(proches(lus, SANS_FILTRE).programmes, []);
});

test("recherche sans accent ni casse, en français et en anglais", () => {
  assert.deepEqual(rechercher(lus, "marathon").map((p) => p.id).sort(), ["mara", "semi"]);
  assert.deepEqual(rechercher(lus, "HALTERES").map((p) => p.id), ["hal"]);
  assert.deepEqual(rechercher(lus, "kettlebell").map((p) => p.id), ["kb"]);
  assert.equal(rechercher(lus, " ").length, 22);
});

test("Pour toi (D3) : trois programmes d'après le parcours ; repli sur l'historique, puis un trio de départ", () => {
  const r = pourToi(lus, { objectifs: ["sport"], sports: ["course", "musculation"], niveau: 1, historique: [] });
  assert.equal(r.source, "parcours");
  assert.equal(r.ids.length, 3);
  assert.deepEqual(r.raisons, ["course", "muscu"]);
  assert.ok(r.ids.includes("c10") && r.ids.some((id) => P(id).famille === "force"), r.ids.join());
  // Au plus deux d'une même famille.
  assert.ok(r.ids.filter((id) => P(id).famille === "endu").length <= 2);
  const h = pourToi(lus, { objectifs: [], sports: [], niveau: null, historique: ["natation"] });
  assert.equal(h.source, "historique");
  assert.equal(h.ids[0], "nage");
  assert.deepEqual(pourToi(lus, { objectifs: [], sports: [], niveau: null, historique: [] }), { ids: ["c5", "fb", "mob"], raisons: [], source: "defaut" });
  // D5 : reprise et après 60 ans proposés seulement si le parcours parle de santé.
  const s = pourToi(lus, { objectifs: ["sante"], sports: ["yoga"], niveau: 0, historique: [] });
  assert.ok(!pourToi(lus, { objectifs: [], sports: ["yoga"], niveau: 0, historique: [] }).ids.some((id) => id === "gen" || id === "equi"));
  assert.equal(s.ids.length, 3);
});

test("placement : jamais deux séances dures de suite quand c'est possible ; la longue au jour choisi", () => {
  // Mardi, jeudi, vendredi, dimanche (planche a9) : fractionné, footing, seuil, longue.
  const r = placerSemaine(["dure", "facile", "dure", "longue"], [1, 3, 4, 6], 6);
  assert.ok(r.penalite < 10);
  assert.deepEqual(r.ordre, [0, 1, 2, 3]);
  // Trois dures sur quatre jours dont deux qui se suivent : impossible, signalé.
  assert.ok(placerSemaine(["dure", "dure", "dure", "longue"], [0, 1, 3, 5], 5).penalite >= 10);
  assert.deepEqual(joursParDefaut(4), [1, 3, 4, 6]);
  assert.deepEqual(joursParDefaut(3), [0, 2, 4]);
});

test("calendrier du plan : 32 séances pour 10 km plus vite, une semaine = 7 jours depuis le début, la longue le dimanche", () => {
  const p = P("c10");
  const o = { jours: [1, 3, 4, 6], longue: 6, debut: "2026-11-02", heure: "18:30" };
  const { poses } = calendrierPlan(p, o);
  assert.equal(poses.length, 32);
  assert.equal(poses[0]!.date, "2026-11-03");
  assert.equal(poses[poses.length - 1]!.date, "2026-12-27");
  for (const x of poses) {
    assert.ok([1, 3, 4, 6].includes(jourSem(x.date)));
    assert.equal(Math.floor(ecartJ(o.debut, x.date) / 7) + 1, x.semaine);
    if (p.seances[x.cle]!.role === "longue") assert.equal(jourSem(x.date), 6);
  }
  assert.deepEqual(conseil(p, o), { genre: "ok" });
  assert.deepEqual(conseil(p, { ...o, jours: [1, 3, 4] }), { genre: "manque", n: 3, voulu: 4 });
  // Trop peu de jours : les séances faciles sautent d'abord.
  const trois = calendrierPlan(p, { ...o, jours: [1, 3, 6] }).poses.filter((x) => x.semaine === 1);
  assert.deepEqual(trois.map((x) => p.seances[x.cle]!.role).sort(), ["dure", "facile", "longue"]);
  // Début un jeudi : la semaine 1 va du jeudi au mercredi.
  const jeudi = calendrierPlan(p, { ...o, debut: "2026-11-05" }).poses;
  assert.equal(jeudi[0]!.date, "2026-11-05");
  assert.ok(jeudi.filter((x) => x.semaine === 1).every((x) => x.date >= "2026-11-05" && x.date <= "2026-11-11"));
  assert.equal(aUneLongue(p), true);
  assert.equal(aUneLongue(P("f5")), false);
  assert.equal(prochainLundi("2026-10-28"), "2026-11-02");
  assert.equal(prochainLundi("2026-11-02"), "2026-11-02");
});

test("charges de départ : 90 % de la dernière série, au 2,5 kg le plus proche ; progression du 5×5 séance après séance", () => {
  assert.equal(chargeDepart(85), 77.5);
  assert.equal(chargeDepart(67.5), 60);
  assert.equal(chargeDepart(null), null);
  const p = P("f5");
  const { poses } = calendrierPlan(p, { jours: [0, 2, 4], longue: null, debut: "2026-11-02", heure: "18:00" });
  const { routines, dates } = routinesDuPlan(p, poses, { squat: 80, couche: 60, "bent-over-barbell-row": 60, "standing-military-press": 40, sdt: 100 });
  assert.equal(dates.length, 36);
  // Squat à chaque séance : 80, 82,5, 85…
  const squats = dates.map((d) => routines.find((r) => r.cle === d.cle)!.kg[0]);
  assert.deepEqual(squats.slice(0, 4), [80, 82.5, 85, 87.5]);
  assert.equal(new Set(routines.map((r) => r.cle)).size, 36);
  // Le soulevé de terre (séance B, 3e bloc) monte de 5 kg.
  const sdt = dates.map((d) => routines.find((r) => r.cle === d.cle)!).filter((r) => r.seance === "f5-b").map((r) => r.kg[2]);
  assert.deepEqual(sdt.slice(0, 3), [100, 105, 110]);
  // Sans charges : une routine par séance différente.
  assert.equal(routinesDuPlan(p, poses, {}).routines.length, 2);
});

// ---------------------------------------------------------------- base

test("migration 34 : témoin plans ; les routines existantes restent ordinaires (plan_id nul)", async () => {
  const m = MIGRATIONS.find((x) => x.version === 34)!;
  assert.equal(m.temoin, "plans");
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 33);
  raw.exec("INSERT INTO routines (id,nom,ordre,cree_le,maj_le) VALUES ('r1','Push',0,1,1)");
  await migrer(db);
  assert.equal((raw.prepare("SELECT plan_id FROM routines WHERE id = 'r1'").get() as { plan_id: string | null }).plan_id, null);
  assert.equal((await listerRoutines(db))[0]!.planId, null);
  await migrer(db);
  assert.equal((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, VERSION_COURANTE);
});

test("démarrer 10 km plus vite : un plan, ses routines de course typées (zones en note), 32 séances programmées", async () => {
  const { db } = await baseDeTest(true);
  const p = P("c10");
  const id = await demarrerPlan(db, p, { jours: [1, 3, 4, 6], longue: 6, debut: "2026-11-02", heure: "18:30" }, {}, "fr");
  const [plan] = await listerPlans(db);
  assert.equal(plan!.id, id);
  assert.deepEqual([plan!.nom, plan!.debut, plan!.fin, plan!.nbSeances, plan!.heure], ["10 km plus vite", "2026-11-02", "2026-12-27", 32, "18:30"]);
  const routines = await listerRoutines(db);
  assert.equal(routines.length, Object.keys(p.seances).length);
  assert.ok(routines.every((r) => r.planId === id && r.type === "course"));
  const progs = await listerProgrammations(db);
  assert.equal(progs.length, 32);
  assert.ok(progs.every((x) => x.regle.freq === "unique" && x.regle.heure === "18:30" && x.actif));
  // La séance type : 15 min, 6 × 3 min avec 2 min de récupération, 8 min.
  const fract = routines.find((r) => r.nom === "Fractionné 6 × 3 min")!;
  const d = (await lireRoutine(db, fract.id))!;
  const lignes = d.blocs.flatMap((b) => b.lignes);
  assert.deepEqual(lignes.map((l) => [l.exercice.slug, l.nb_series, l.repos_s, l.cibles[0]!.duree_s]), [["course", 1, 0, 900], ["course", 6, 120, 180], ["course", 1, 0, 480]]);
  const notes = await listerNotes(db, { exerciceId: "cat:course", ligneId: lignes[1]!.id }, "routine");
  assert.match(notes[0]!.texte, /^Z4, seuil, allure 10 km, récupération en trottinant$/);
  const seances = await seancesDuPlan(db, id);
  assert.equal(seances.length, 32);
  assert.equal(seances[0]!.date, "2026-11-03");
  await arreterPlan(db, id, 1_800_000_000_000);
  // Arrêté (migration 41) : le plan et ses routines restent pour l'historique, plus rien de prévu
  assert.equal((await listerPlans(db))[0]!.arreteLe, 1_800_000_000_000);
  assert.equal((await listerProgrammations(db)).filter((x) => x.actif).length, 0);
  assert.equal((await seancesDuPlan(db, id)).length, 0);
  assert.equal((await seancesDuPlan(db, id, true)).length, 32);
  // Supprimé (glisser sur un passé) : plan, routines et programmations effacés
  await supprimerPlan(db, id);
  assert.equal((await listerRoutines(db)).length, 0);
  assert.equal((await listerProgrammations(db)).length, 0);
  assert.equal((await listerPlans(db)).length, 0);
});

test("démarrer Push Pull Legs, Force 5×5 et HIIT : supersets, plages, charges, tempos, exercices propres créés", async () => {
  const { db, raw } = await baseDeTest(true);
  await demarrerPlan(db, P("ppl"), { jours: [0, 1, 2, 3, 4, 5], longue: null, debut: "2026-11-02", heure: "07:00" }, {}, "en");
  const push = (await listerRoutines(db)).find((r) => r.nom === "Push")!;
  const d = (await lireRoutine(db, push.id))!;
  const sup = d.blocs.find((b) => b.groupeSuperset != null)!;
  assert.equal(sup.lignes.length, 2);
  assert.deepEqual(sup.lignes.map((l) => [l.repos_s, l.repos_transition_s]), [[0, 15], [90, 15]]);
  assert.deepEqual([d.blocs[0]!.lignes[0]!.plage_reps, d.blocs[0]!.lignes[0]!.cibles[0]!.reps, d.blocs[0]!.lignes[0]!.cibles[0]!.reps_max], [1, 6, 10]);

  await demarrerPlan(db, P("f5"), { jours: [0, 2, 4], longue: null, debut: "2026-11-02", heure: "18:00" }, { squat: 80, couche: 62.5 }, "fr");
  const f5 = (await listerRoutines(db)).filter((r) => r.nom.startsWith("5×5"));
  assert.equal(f5.length, 36);
  const premiere = (await lireRoutine(db, f5[0]!.id))!;
  assert.equal(premiere.blocs[0]!.lignes[0]!.cibles[0]!.kg, 80);
  // Sans charge de départ : rien d'écrit, la séance reprendra la dernière fois.
  assert.equal(premiere.blocs[2]!.lignes[0]!.cibles[0]!.kg, null);

  await demarrerPlan(db, P("hiit"), { jours: [0, 2, 4], longue: null, debut: "2026-11-02", heure: "18:00" }, {}, "fr");
  const perso = raw.prepare("SELECT id, nom, nom_en, nature FROM exercices WHERE id LIKE 'bq:%' ORDER BY id").all().map((r) => ({ ...r }));
  assert.deepEqual(perso, [
    { id: "bq:burpee", nom: "Burpees", nom_en: "Burpees", nature: "duree" },
    { id: "bq:jumping-jack", nom: "Jumping jacks", nom_en: "Jumping jacks", nature: "duree" },
  ]);
  assert.equal((await listerPlans(db)).length, 3);

  await demarrerPlan(db, P("fb"), { jours: [0, 2, 4], longue: null, debut: "2026-11-02", heure: "18:00" }, {}, "fr");
  const appr = (await listerRoutines(db)).find((r) => r.nom === "Full body, apprentissage")!;
  assert.equal((await lireRoutine(db, appr.id))!.blocs[0]!.lignes[0]!.tempo, "3-1-1-0");
});

test("dernière charge : la plus lourde série de travail de la dernière séance de l'exercice", async () => {
  const { db, raw } = await baseDeTest(true);
  assert.equal(await derniereCharge(db, "cat:squat"), null);
  raw.exec(`INSERT INTO seances (id, debut, fin, maj_le) VALUES ('s1', 1000, 2000, 1), ('s2', 5000, 6000, 1);
    INSERT INTO series (id, seance_id, exercice_id, position, type, kg, reps, faite, volume) VALUES
      ('a', 's1', 'cat:squat', 0, 'normale', 100, 5, 1, 0),
      ('b', 's2', 'cat:squat', 0, 'echauffement', 120, 5, 1, 0),
      ('c', 's2', 'cat:squat', 1, 'normale', 85, 5, 1, 0),
      ('d', 's2', 'cat:squat', 2, 'normale', 80, 6, 1, 0);`);
  assert.deepEqual(await derniereCharge(db, "cat:squat"), { kg: 85, reps: 5 });
});

// ---------------------------------------------------------------- rayon « Routines » (lexique du 29/10)

const DOSSIER_R = new URL("../assets/catalogue/routines/", import.meta.url);
const routinesLues: RoutineBoutique[] = readdirSync(DOSSIER_R).map((f) => JSON.parse(readFileSync(new URL(f, DOSSIER_R), "utf8")) as RoutineBoutique);

test("routines du catalogue : valides, sans calendrier, ids distincts des programmes ; Fractionné 6 × 1 km et Push A", () => {
  assert.equal(routinesLues.length, ROUTINES.length);
  for (const r of routinesLues) {
    assert.deepEqual(validerRoutine(r, SLUGS), [], r.id);
    assert.ok(estRoutine(r) && !lus.some((p) => p.id === r.id), r.id);
  }
  assert.ok(lus.every((p) => !estRoutine(p)));
  const noms = routinesLues.map((r) => r.nom.fr);
  assert.ok(noms.includes("Fractionné 6 × 1 km") && noms.includes("Push A"));
  assert.deepEqual(validerRoutine({ ...routinesLues[0]!, calendrier: [] }, SLUGS).at(-1), `${routinesLues[0]!.id} : une routine n'a pas de calendrier`);
});

test("deux espaces (planche boutiques, 30/10) : plus de filtre programme/routine ; chaque espace filtre, cherche et propose ses articles", () => {
  assert.deepEqual([...CRITERES], ["niveau", "objectif", "lieu", "seances", "duree"]);
  assert.ok(!("genre" in SANS_FILTRE));
  // Séances par semaine et durée ne parlent que des programmes.
  assert.equal(filtrer(routinesLues, { ...SANS_FILTRE, seances: 3 }).length, 0);
  assert.equal(filtrer(routinesLues, { ...SANS_FILTRE, duree: "court" }).length, 0);
  assert.ok(filtrer(routinesLues, { ...SANS_FILTRE, objectif: "distance" }, "course").every((r) => r.type === "course"));
  assert.deepEqual(rechercher(routinesLues, "fractionne").map((r) => r.id), ["r-fract-6x1k"]);
  // « Proches de tes filtres » reste dans l'espace : qui cherche une routine ne se voit pas proposer de programme.
  const pr = proches(routinesLues, { ...SANS_FILTRE, niveau: 3, objectif: "muscle" });
  assert.ok(pr.programmes.length > 0 && pr.programmes.every(estRoutine));
  // « Pour toi » des routines : d'après les mêmes sports, au plus deux par famille (muscu puis course : Push A, Full body,
  // Fractionné 6 × 1 km, comme la planche).
  const r = pourToi(routinesLues, { objectifs: [], sports: [], niveau: 1, historique: ["muscu", "course"] });
  assert.equal(r.source, "historique");
  assert.deepEqual(new Set(r.ids), new Set(["r-fract-6x1k", "r-push-a", "r-full-body"]));
  assert.ok(!pourToi(routinesLues, { objectifs: [], sports: ["course"], niveau: 1, historique: [] }).ids.includes("r-test-vma"), "un test n'est pas une recommandation");
  assert.deepEqual(pourToi(routinesLues, { objectifs: [], sports: [], niveau: null, historique: [] }).ids, ["r-full-body", "r-fract-6x1k", "r-hanches"]);
  // Les programmes ne voient pas les routines des tables partagées.
  assert.ok(pourToi(lus, { objectifs: [], sports: ["course", "musculation"], niveau: 1, historique: [] }).ids.every((id) => !id.startsWith("r-")));
});

test("routine de la boutique : ajoutée à mes routines (sans plan, typée, superset), une seule fois ; supprimée, elle revient", async () => {
  const { db } = await baseDeTest(true);
  const push = routinesLues.find((r) => r.id === "r-push-a")!;
  const id = await ajouterRoutineBoutique(db, push, "fr");
  assert.equal(await ajouterRoutineBoutique(db, push, "fr"), id);
  const mes = (await listerRoutines(db)).filter((r) => r.nom === "Push A");
  assert.equal(mes.length, 1);
  const d = (await lireRoutine(db, id))!;
  assert.equal(d.type, "muscu");
  assert.equal(d.blocs.find((b) => b.groupeSuperset != null)!.lignes.length, 2);
  assert.equal(d.blocs[0]!.lignes[0]!.cibles[0]!.kg, null);
  assert.equal((await listerPlans(db)).length, 0);
  await supprimerRoutine(db, id);
  assert.notEqual(await ajouterRoutineBoutique(db, push, "fr"), id);
  // Exercices propres (HIIT) créés, nom anglais compris.
  const hiit = await ajouterRoutineBoutique(db, routinesLues.find((r) => r.id === "r-hiit-20")!, "en");
  assert.equal((await lireRoutine(db, hiit))!.nom, "HIIT 20 min");
});
