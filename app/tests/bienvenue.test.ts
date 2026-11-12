// Messages de bienvenue de l'Accueil (27/10) : catalogue, conditions, tirage déterministe, longueur, sport de séance.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MESSAGES, type ContexteBienvenue } from "../src/i18n/bienvenue.ts";
import { eligibles, hasard, rendre, tirer } from "../src/ecrans/bienvenue.ts";
import { sportDeSeance, sportDominant, sportsDepuis } from "../src/db/sports.ts";
import { baseDeTest } from "./aide.ts";

const neutre: ContexteBienvenue = { heure: 14, sport: null, serie: 0, repos: 3, seanceAujourdhui: false, recordRecent: false };
const ids = (c: Partial<ContexteBienvenue>) => eligibles({ ...neutre, ...c }).map((m) => m.id);

test("catalogue : au moins 25 messages, ids uniques, fr et en, prénom jamais en tête", () => {
  assert.ok(MESSAGES.length >= 25, `${MESSAGES.length} messages`);
  assert.equal(new Set(MESSAGES.map((m) => m.id)).size, MESSAGES.length);
  for (const m of MESSAGES) {
    for (const l of [m.fr, m.en]) {
      assert.ok(l.includes("{p}"), `${m.id} : pas de {p}`);
      assert.ok(!l.startsWith("{p}"), `${m.id} : {p} en tête`);
      assert.ok(!/\p{Extended_Pictographic}/u.test(l), `${m.id} : emoji`);
    }
  }
});

test("longueur : 40 caractères au plus avec le prénom et une série à deux chiffres", () => {
  for (const m of MESSAGES) {
    for (const langue of ["fr", "en"] as const) {
      const txt = rendre(m, langue, "Alex", { serie: 40 });
      assert.ok(txt.length <= 40, `${m.id} ${langue} : « ${txt} » (${txt.length})`);
    }
  }
});

test("sans prénom : le prénom et sa virgule disparaissent proprement", () => {
  const r = (id: string, l: "fr" | "en" = "fr") => rendre(MESSAGES.find((m) => m.id === id)!, l, "  ", { serie: 40 });
  assert.equal(r("bonjour"), "Bonjour");
  assert.equal(r("debout"), "Encore debout ?");
  assert.equal(r("vamos"), "Vamos !");
  assert.equal(r("serie"), "40 semaines. On continue.");
  assert.equal(r("alors"), "Alors, on fait quoi ?");
  assert.equal(r("debout", "en"), "Still up?");
  for (const m of MESSAGES) {
    const txt = rendre(m, "fr", "", { serie: 3 });
    assert.ok(!/\{|\s{2}|^[\s,.]|\s,|,\s*[.?!]/.test(txt), `${m.id} : « ${txt} »`);
  }
  assert.equal(rendre(MESSAGES.find((m) => m.id === "repart")!, "fr", " Camille ", { serie: 0 }), "On repart, Camille");
});

test("conditions : moment de la journée", () => {
  assert.ok(ids({ heure: 9 }).includes("bonjour") && !ids({ heure: 9 }).includes("bonsoir"));
  assert.ok(ids({ heure: 20 }).includes("bonsoir") && !ids({ heure: 20 }).includes("bonjour"));
  assert.ok(ids({ heure: 23 }).includes("debout") && ids({ heure: 2 }).includes("debout"));
  assert.ok(!ids({ heure: 21 }).includes("debout") && !ids({ heure: 12 }).includes("debout"));
});

test("conditions : sport, série, pause, séance du jour, record, première fois", () => {
  assert.ok(ids({ sport: "padel" }).includes("vamos") && !ids({ sport: "muscu" }).includes("vamos"));
  assert.ok(ids({ sport: "course" }).includes("foulee") && ids({ sport: "muscu" }).includes("repart"));
  assert.ok(ids({ serie: 40 }).includes("serie") && !ids({ serie: 2 }).includes("serie"));
  assert.ok(ids({ repos: 20 }).includes("revoir") && !ids({ repos: 5 }).includes("revoir"));
  assert.ok(ids({ seanceAujourdhui: true }).includes("aujourdhui") && !ids({}).includes("aujourdhui"));
  assert.ok(ids({ recordRecent: true }).includes("record") && !ids({}).includes("record"));
  assert.ok(ids({ repos: null }).includes("bienvenue") && !ids({}).includes("bienvenue"));
  assert.ok(ids({ repos: 0 }).includes("round"));
});

test("tirage : déterministe pour une graine, jamais le même d'affilée", () => {
  const a = hasard(42);
  const b = hasard(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.equal(tirer(neutre, 1234).id, tirer(neutre, 1234).id);
  for (let g = 0; g < 500; g++) {
    const premier = tirer(neutre, g);
    assert.notEqual(tirer(neutre, g, premier.id).id, premier.id);
  }
  // Un seul message possible : il revient quand même.
  const seul = [MESSAGES[0]!];
  assert.equal(tirer(neutre, 7, seul[0]!.id, seul).id, seul[0]!.id);
});

test("tirage : une condition vraie pèse plus lourd", () => {
  const c = { ...neutre, sport: "padel" as const };
  let padel = 0;
  const n = 4000;
  for (let g = 0; g < n; g++) if (["vamos", "padel"].includes(tirer(c, g).id)) padel++;
  // À 14 h : 2 messages de padel (5) contre 6 généraux (1) et 2 moments (2), soit 10 / 20 = 50 % (20 % sans les poids).
  assert.ok(padel / n > 0.4 && padel / n < 0.6, `${padel / n}`);
});

test("sport de séance : un sport nommé l'emporte, sinon muscu, sinon autre", () => {
  assert.equal(sportDeSeance([{ slug: "etirements", categorie: "Étirement", perso: 0 }, { slug: "padel", categorie: "Sport de raquette", perso: 0 }]), "padel");
  assert.equal(sportDeSeance([{ slug: "squat", categorie: "Force", perso: 0 }]), "muscu");
  assert.equal(sportDeSeance([{ slug: null, categorie: null, perso: 1 }]), "muscu");
  assert.equal(sportDeSeance([{ slug: "yoga", categorie: "Bien-être", perso: 0 }]), "autre");
  assert.equal(sportDominant(["padel", "muscu", "padel", "autre"]), "padel");
  assert.equal(sportDominant(["padel", "muscu"]), null);
  assert.equal(sportDominant(["autre", "autre", "autre"]), null);
  assert.equal(sportDominant(["course", "muscu", "muscu", "course"]), "course");
});

test("sportsDepuis lit les séances terminées de la période, exercices du plan ou des séries", async () => {
  const { raw, db } = await baseDeTest(true);
  raw.exec(`
    INSERT INTO seances (id, debut, fin, maj_le) VALUES ('a', 1000, 2000, 1), ('b', 3000, 4000, 1), ('c', 5000, NULL, 1), ('d', 10, 20, 1);
    INSERT INTO seance_exercices (seance_id, exercice_id, position) VALUES ('a', 'cat:padel', 0), ('c', 'cat:padel', 0), ('d', 'cat:padel', 0);
  `);
  const sq = (raw.prepare("SELECT id FROM exercices WHERE slug IS NOT NULL AND categorie = 'Force' LIMIT 1").get() as { id: string }).id;
  raw.prepare("INSERT INTO series (id, seance_id, exercice_id, position, kg, reps) VALUES ('s1', 'b', ?, 0, 60, 8)").run(sq);
  assert.deepEqual(await sportsDepuis(db, 500), ["muscu", "padel"]);
});
