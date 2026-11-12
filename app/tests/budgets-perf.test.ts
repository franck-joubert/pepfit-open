// Garde-fou de performance (audit M17 ; Perf B, docs/PERF-B.md ; Perf D, docs/PERF-D.md). Les budgets sont dans
// tests/budgets.ts, avec la façon de les ajuster (on les baisse ; on ne les monte pas sans raison écrite là-bas).
// La base de volume de l'audit (tests/semis-volume.ts, même graine : 1 561 jours de journal, 532 séances, 40 routines…) et
// un Santé Connect simulé qui compte ses appels. Chaque test refait les lectures d'un écran à son arrivée et échoue au-delà
// du budget. Avant Perf B : Nutrition 573 à 604 requêtes par changement de jour, Sport 5 090 requêtes et 868 lectures Santé
// Connect à la première visite, Routines 495. Séance (Perf D) : la coche, et la touche du clavier de séance.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { before, test } from "node:test";
import { adapter, catalogue, facade } from "./aide.ts";
import { semerVolume } from "./semis-volume.ts";
import { BUDGETS } from "./budgets.ts";
import type { Executeur } from "../src/db/executeur.ts";

await import("./resolveur-ecrans.mjs");
const { migrer } = await import("../src/db/migrations.ts");
const { chargerCatalogue } = await import("../src/db/catalogue.ts");
const { sante } = await import("../src/natif/sante/index.ts");
const { fabriquerSante, PERMISSIONS } = await import("../src/natif/sante/logique.ts");
const H = 3_600_000;

// ---- Santé Connect simulé : une marche chaque midi, des pas l'après-midi ; chaque appel natif compté
const natifs = new Map<string, number>();
const n = (m: string) => natifs.set(m, (natifs.get(m) ?? 0) + 1);
const pasHeure = (t: number) => (new Date(t).getHours() >= 8 && new Date(t).getHours() < 21 ? 500 : 0);
const pasEntre = (d: number, f: number) => {
  let s = 0;
  for (let t = Math.floor(d / H) * H; t < f; t += H) s += (pasHeure(t) * (Math.min(f, t + H) - Math.max(d, t))) / H;
  return Math.round(s);
};
Object.assign(
  sante,
  fabriquerSante({
    statut: async () => (n("statut"), 3),
    autorisees: async () => (n("autorisees"), Object.values(PERMISSIONS)),
    demander: async () => [],
    poids: async () => (n("poids"), []),
    pas: async (b) => (n("pas"), b.slice(1).map((f, i) => pasEntre(b[i]!, f))),
    pasHeures: async (d, f) => {
      n("pasHeures");
      const l: [number, number][] = [];
      for (let t = Math.floor(d / H) * H; t < f; t += H) if (pasHeure(t)) l.push([t, pasHeure(t)]);
      return l;
    },
    sommeil: async () => (n("sommeil"), []),
    frequenceRepos: async () => (n("frequenceRepos"), []),
    exporter: async () => {},
    mesures: async () => (n("mesures"), []),
    seancesSport: async (d, f) => {
      n("seancesSport");
      const l = [];
      for (const x = new Date(new Date(d).setHours(0, 0, 0, 0)); x.getTime() < f; x.setDate(x.getDate() + 1)) {
        const debut = x.getTime() + 12 * H;
        if (debut >= d && debut < f) l.push({ debut, fin: debut + 40 * 60_000, type: 79, titre: null, origine: "com.sec.android.app.shealth" });
      }
      return l;
    },
    kcalActives: async (b) => (n("kcalActives"), b.slice(1).map((f, i) => ((f - b[i]!) / 60_000) * 5)),
    distance: async (b) => (n("distance"), b.slice(1).map((f, i) => pasEntre(b[i]!, f) * 0.75)),
    fc: async () => (n("fc"), []),
    installees: async () => [],
    ouvrir: async () => {},
  }),
);

// ---- Base de volume, requêtes comptées sous la façade de l'appli
const MAINTENANT = new Date(new Date().setHours(14, 0, 0, 0)).getTime();
let requetes = 0;
let db!: Executeur;
let raw!: DatabaseSync;
before(async () => {
  raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const brute = adapter(raw);
  await migrer(brute);
  await chargerCatalogue(brute, catalogue());
  await semerVolume(raw, brute, MAINTENANT);
  const compteur = new Proxy(brute, {
    get(c, nom) {
      const v = Reflect.get(c, nom, c);
      if (typeof v !== "function" || !["execAsync", "runAsync", "getFirstAsync", "getAllAsync"].includes(String(nom))) return v;
      return (...a: unknown[]) => (requetes++, v.apply(c, a));
    },
  });
  db = facade(compteur);
});

/** Requêtes et lectures Santé Connect (vérifications statut et autorisees mises à part : M1) de `f`. */
async function compter(f: () => Promise<unknown>): Promise<{ sql: number; sc: number }> {
  requetes = 0;
  natifs.clear();
  await f();
  const sc = [...natifs.entries()].filter(([m]) => m !== "statut" && m !== "autorisees").reduce((a, [, x]) => a + x, 0);
  return { sql: requetes, sc };
}
const sous = (mesure: { sql: number; sc: number }, sql: number, sc = 0, quoi = "") => {
  assert.ok(mesure.sql <= sql, `${quoi} : ${mesure.sql} requêtes (budget ${sql})`);
  assert.ok(mesure.sc <= sc, `${quoi} : ${mesure.sc} lectures Santé Connect (budget ${sc})`);
};

const cle = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const decalerCle = (j: string, k: number) => {
  const [a, m, d] = j.split("-").map(Number) as [number, number, number];
  return cle(new Date(a, m - 1, d + k).getTime());
};
const lundiDe = (j: string) => {
  const [a, m, d] = j.split("-").map(Number) as [number, number, number];
  const x = new Date(a, m - 1, d);
  return cle(new Date(a, m - 1, d - ((x.getDay() + 6) % 7)).getTime());
};
const AUJ = cle(MAINTENANT);

test("Nutrition : changement de jour (le jour et le voisin qui manque) sous 35 requêtes, retour sur l'onglet sous 20", async () => {
  const { lireJournal, voisinsALire } = await import("../src/ecrans/nutrition/journal-donnees.ts");
  // comme Journal.tsx : le jour affiché, puis les voisins rendus qui ne sont pas en mémoire
  const memoire: Record<string, true> = {};
  const arriver = async (date: string) => {
    await lireJournal(db as never, date, lundiDe(date), AUJ);
    memoire[date] = true;
    for (const j of voisinsALire(date, [decalerCle(date, -1), date, decalerCle(date, 1)], memoire)) {
      await lireJournal(db as never, j, lundiDe(j), AUJ, true);
      memoire[j] = true;
    }
  };
  const b = BUDGETS.nutrition;
  sous(await compter(() => arriver(AUJ)), b.premiereVisite, 0, "1re visite");
  sous(await compter(() => arriver(decalerCle(AUJ, -1))), b.changementJour, 0, "veille");
  sous(await compter(() => arriver(decalerCle(AUJ, -2))), b.changementJour, 0, "avant-veille");
  sous(await compter(() => arriver(decalerCle(AUJ, -2))), b.retour, 0, "retour");
});

test("planning (40 routines) en 10 requêtes au plus, quelle que soit la fenêtre ; résumés des routines en 6", async () => {
  const { lirePlanning } = await import("../src/ecrans/planif-donnees.ts");
  const { resumesRoutines } = await import("../src/ecrans/donnees.ts");
  const b = BUDGETS.planning;
  sous(await compter(() => lirePlanning(db, lundiDe(AUJ), decalerCle(lundiDe(AUJ), 6), MAINTENANT)), b.semaine, 0, "semaine");
  sous(await compter(() => lirePlanning(db, lundiDe(AUJ), decalerCle(lundiDe(AUJ), 41), MAINTENANT)), b.mois, 0, "mois");
  sous(await compter(() => resumesRoutines(db)), b.resumesRoutines, 0, "résumés");
  const p = await lirePlanning(db, AUJ, decalerCle(AUJ, 13), MAINTENANT);
  assert.equal(p.routines.size, 40);
  assert.ok([...p.routines.values()].every((r) => r.dureeS > 0), "chaque routine a sa durée estimée");
});

test("Sport : 1re visite sous 350 requêtes ; relance (mémoire vide, base gardée) sous 120 requêtes et 30 lectures Santé Connect ; retour sous 100", async () => {
  const { lireSport } = await import("../src/ecrans/sport-donnees.ts");
  const { lirePlanning } = await import("../src/ecrans/planif-donnees.ts");
  const { chargerStatsJour, memoireStats } = await import("../src/ecrans/stats-jour.ts");
  const { oublierEnergie } = await import("../src/ecrans/mesures/energie-donnees.ts");
  const { oublierFormules } = await import("../src/ecrans/sante-donnees.ts");
  const sport = () =>
    Promise.all([
      lireSport(db),
      lirePlanning(db, AUJ, decalerCle(AUJ, 14), MAINTENANT), // rafraichirRappels d'Android
      lirePlanning(db, lundiDe(AUJ), decalerCle(lundiDe(AUJ), 6), MAINTENANT),
      chargerStatsJour(db, AUJ),
    ]);
  const relance = () => {
    oublierEnergie();
    oublierFormules();
    memoireStats.oublier();
  };
  relance();
  // la toute première fois, l'Effort pepfit calcule la charge de chaque séance (45 ici) et le bilan lit Santé Connect sur deux mois
  const b = BUDGETS.sport;
  sous(await compter(sport), b.premiere.sql, b.premiere.sc, "1re visite");
  relance();
  sous(await compter(sport), b.relance.sql, b.relance.sc, "relance");
  sous(await compter(sport), b.retour.sql, b.retour.sc, "retour");
});

test("Énergie : bilan d'aujourd'hui sous 40 requêtes ; 30 jours (habitude de Sport) sous 40 requêtes et 15 lectures une fois les jours finis gardés", async () => {
  const { jourEnergie, oublierFormules } = await import("../src/ecrans/sante-donnees.ts");
  const { lireJoursEnergie, oublierEnergie } = await import("../src/ecrans/mesures/energie-donnees.ts");
  const minuit = new Date(new Date(MAINTENANT).setHours(0, 0, 0, 0)).getTime();
  oublierFormules();
  sous(await compter(() => jourEnergie(db, minuit, MAINTENANT)), BUDGETS.energie.aujourdhui.sql, BUDGETS.energie.aujourdhui.sc, "aujourd'hui");
  oublierFormules();
  oublierEnergie();
  const jours = Array.from({ length: 30 }, (_, i) => new Date(new Date(minuit).setDate(new Date(minuit).getDate() - 30 + i)).getTime());
  // les jours finis gardés : une première lecture les range (Sport la faisait avant que la Récupération y remplace la dépense)
  await lireJoursEnergie(db, jours, MAINTENANT);
  oublierFormules();
  oublierEnergie();
  sous(await compter(() => lireJoursEnergie(db, jours, MAINTENANT)), BUDGETS.energie.trenteJours.sql, BUDGETS.energie.trenteJours.sc, "30 jours");
});

test("Accueil sous 50 requêtes ; Routines sous 30 ; vue d'une routine sous 10 ; séance passée sous 15 ; Mes aliments sous 6", async () => {
  const { chargerAccueil, lireAccueilBase } = await import("../src/ecrans/accueil-donnees.ts");
  const { resumesRoutines, unitesExercices } = await import("../src/ecrans/donnees.ts");
  const { lirePlanning } = await import("../src/ecrans/planif-donnees.ts");
  const api = await import("../src/db/api.ts");
  const { lireReglage } = await import("../src/db/depots/reglages.ts");
  // Accueil complet : la base, puis les cartes (M9, docs/PERF-A.md) ; la base seule, chemin d'affichage, sans Santé Connect
  sous(await compter(() => chargerAccueil(db as never, () => {}, () => {}, MAINTENANT)), BUDGETS.accueil.complet.sql, BUDGETS.accueil.complet.sc, "Accueil");
  sous(await compter(() => lireAccueilBase(db as never, MAINTENANT)), BUDGETS.accueil.base.sql, BUDGETS.accueil.base.sc, "Accueil, blocs de la base");
  sous(
    await compter(() =>
      Promise.all([
        lireReglage(db, "routines_ordre").then(() => lireReglage(db, "routines_replies")).then(() => resumesRoutines(db)),
        lirePlanning(db, AUJ, decalerCle(AUJ, 14), MAINTENANT),
        lirePlanning(db, lundiDe(AUJ), decalerCle(lundiDe(AUJ), 6), MAINTENANT),
      ]),
    ),
    BUDGETS.routines,
    0,
    "Routines",
  );
  const id = (raw.prepare("SELECT id FROM routines ORDER BY ordre LIMIT 1").get() as { id: string }).id;
  sous(
    await compter(async () => {
      const r = await api.lireRoutine(db, id);
      const ids = [...new Set(r!.blocs.flatMap((b) => b.lignes.map((l) => l.exercice_id)))];
      await Promise.all([api.lirePrecedents(db, ids), api.progressionRoutine(db, id, "volume"), api.nbSeancesRoutine(db, id), unitesExercices(db, ids, "kg")]);
    }),
    BUDGETS.vueRoutine,
    0,
    "vue d'une routine",
  );
  sous(
    await compter(async () => {
      const s = await api.lireSeance(db, (await api.seanceTermineeAuRang(db, 0))!);
      await unitesExercices(db, s!.exercices.map((e) => e.exercice.id), "kg", s!.salle?.id ?? null);
    }),
    BUDGETS.seancePassee,
    0,
    "séance passée",
  );
  sous(await compter(() => api.mesAliments(db, "mois", "fois", decalerCle(AUJ, -30))), BUDGETS.mesAliments, 0, "Mes aliments");
});

test("mêmes résultats sur la base de volume : précédents groupés, routines groupées, consommations jointes", async () => {
  const api = await import("../src/db/api.ts");
  // précédents : une lecture = les lectures exercice par exercice
  const ids = (raw.prepare("SELECT DISTINCT exercice_id FROM routine_exercices LIMIT 30").all() as { exercice_id: string }[]).map((x) => x.exercice_id);
  const groupes = await api.lirePrecedents(db, ids, MAINTENANT);
  for (const e of ids) assert.deepEqual(groupes[e], await api.lirePrecedent(db, e, MAINTENANT), e);
  // routines : toutes d'un coup = une par une
  const toutes = await api.lireRoutines(db);
  assert.equal(toutes.size, 40);
  for (const id of [...toutes.keys()].slice(0, 5)) assert.deepEqual(toutes.get(id), await api.lireRoutine(db, id));
  // consommations d'un jour : la jointure rend chaque produit tel que produitParId
  for (const k of [0, 3, 400]) {
    const l = await api.consommationsDuJour(db, decalerCle(AUJ, -k));
    assert.ok(l.length > 0);
    for (const c of l.slice(0, 4)) assert.deepEqual(c.produit, await api.produitParId(db, c.produit_id));
  }
});

test("Séance, coche : aucune requête avant l'image, écriture sous budget, deux cartes redessinées au plus", async (t) => {
  const api = await import("../src/db/api.ts");
  const { transaction } = await import("../src/db/exclusif.ts");
  const { avecCoches, cocherOptimiste } = await import("../src/ecrans/coche-optimiste.ts");
  const { ordreExecution } = await import("../src/ecrans/ordre-seance.ts");
  const { activeDeCarte, memeCarte } = await import("../src/ecrans/seance-rendu.ts");
  const { minuteur } = await import("../src/natif/minuteur/index.ts");
  const b = BUDGETS.seance.coche;
  // Séance de la routine la plus fournie, démarrée avec les valeurs du précédent (exercices qui ont un historique).
  const routine = raw.prepare("SELECT routine_id AS id FROM routine_exercices GROUP BY routine_id ORDER BY COUNT(*) DESC LIMIT 1").get() as { id: string };
  const id = await api.demarrerSeanceDepuisRoutine(db, routine.id, true);
  try {
    const vue = (await api.lireSeance(db, id))!;
    const x = ordreExecution(vue).find((s) => !s.faite)!;
    const images: (() => void)[] = [];
    let posee: { faite: boolean; le: number } | null = null;
    requetes = 0;
    const t0 = performance.now();
    const ecrite = cocherOptimiste({
      db,
      seance: vue,
      serie: x,
      faite: true,
      file: { current: Promise.resolve() },
      apres: (f) => void images.push(f),
      poser: (c) => void (posee = c),
      retirer: () => assert.fail("pas d'échec"),
      erreur: (e) => assert.fail(String(e)),
    });
    const immediat = performance.now() - t0;
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(posee, "coche posée tout de suite");
    assert.ok(minuteur.etat().actif, "repos lancé tout de suite");
    assert.ok(requetes <= b.sqlAvantImage, `coche : ${requetes} requêtes avant l'image (budget ${b.sqlAvantImage})`);
    assert.ok(immediat <= b.msImmediat, `coche : partie immédiate en ${immediat.toFixed(1)} ms (budget ${b.msImmediat})`);
    const t1 = performance.now();
    images.forEach((f) => f());
    await ecrite;
    const ecriture = performance.now() - t1;
    const sql = requetes;
    assert.ok(sql <= b.sql, `coche : écriture en ${sql} requêtes (budget ${b.sql})`);
    assert.ok(ecriture <= b.msEcriture, `coche : écriture en ${ecriture.toFixed(1)} ms (budget ${b.msEcriture})`);
    assert.equal((await api.lireSeance(db, id))!.exercices.flatMap((e) => e.series).find((s) => s.id === x.id)!.faite, 1);
    // Pour mémoire (docs/PERF-D.md) : l'ancien chemin recalculait tout l'historique de l'exercice.
    requetes = 0;
    await transaction(db, (tx) => api.recalculerExercice(tx, x.exercice_id));
    t.diagnostic(`coche : ${sql} requêtes, ${ecriture.toFixed(1)} ms ; recalcul complet de l'exercice seul : ${requetes} requêtes`);

    // Cartes redessinées : mêmes props sauf pour la carte de la série cochée et celle où passe la série active.
    const actions = {};
    const props = (v: typeof vue) => {
      const active = ordreExecution(v).find((s) => !s.faite)?.id ?? null;
      return v.blocs.flatMap((bl) => bl.exercices).map((e) => ({
        e, dansSuperset: false, unite: "kg", activeId: activeDeCarte(e.series, active), actions, enCours: true, replie: false, ordonnable: true, margeBas: 0, appui: {}, blessures: null,
      }));
    };
    const avant = props(vue);
    const apres = props(avecCoches(vue, new Map([[x.id, posee!]])));
    const redessinees = apres.filter((p, i) => !memeCarte(avant[i]!, p)).length;
    assert.ok(avant.length >= 4, `${avant.length} exercices dans la séance`);
    assert.ok(redessinees <= b.cartes, `coche : ${redessinees} cartes redessinées sur ${avant.length} (budget ${b.cartes})`);
  } finally {
    minuteur.passer();
    await api.supprimerSeance(db, id);
  }
});

test("Séance, touche du clavier : seuls le clavier et la case se redessinent, la molette n'est jamais recréée, 1 000 touches sous budget", async (t) => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { clavierSeance, moletteDe, valeursMolette } = await import("../src/ecrans/clavier-seance.ts");
  const b = BUDGETS.seance.touche;
  // Abonnés à la case active : chacun se redessine à chaque chiffre. L'écran de séance n'en est pas (tests/clavier-vitesse).
  const src = new URL("../src/", import.meta.url);
  const abonnes = (readdirSync(src, { recursive: true }) as string[])
    .filter((f) => /\.tsx?$/.test(f) && f !== "ecrans/clavier-seance.ts")
    .filter((f) => /\buseCase(Active|Clavier)\(\)/.test(readFileSync(new URL(f, src), "utf8")))
    .sort();
  assert.deepEqual(abonnes, [...b.abonnes].sort(), `abonnés à la case active : ${abonnes.join(", ")}`);

  clavierSeance.ouvrir({ cle: "serie-kg", champ: "kg", decimal: true, temps: false, unite: "kg", paliers: null, saisie: { texte: "60", remplacer: true }, ecrire: () => {} });
  try {
    let cle = moletteDe(clavierSeance.caseActive()!).cle;
    let recreees = 0;
    const sauts = new Set<string>();
    const touches = ["1", "2", "decimal", "5", "effacer", "effacer", "7", "effacer", "effacer", "effacer"] as const;
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      clavierSeance.toucher(touches[i % touches.length]!);
      // Ce que le clavier refait à chaque chiffre : la description de la molette et ses valeurs (comparées par contenu).
      const m = moletteDe(clavierSeance.caseActive()!);
      void valeursMolette(m.champ, m.valeur, { unite: m.unite, paliers: m.paliers }).valeurs.join();
      if (m.cle !== cle) (recreees++, (cle = m.cle));
      sauts.add(m.saut);
    }
    const ms = performance.now() - t0;
    t.diagnostic(`touche : 1 000 touches en ${ms.toFixed(0)} ms, molette recréée ${recreees} fois`);
    assert.ok(recreees <= b.moletteRecreee, `touche : molette recréée ${recreees} fois (budget ${b.moletteRecreee})`);
    assert.equal(sauts.size, 1000, "chaque touche fait sauter la molette sur la valeur tapée");
    assert.ok(ms <= b.msPourMille, `touche : 1 000 touches en ${ms.toFixed(0)} ms (budget ${b.msPourMille})`);
    // Six chiffres tapés (le maximum de la case) : la molette reste bornée.
    for (const [champ, max] of [["kg", 401], ["reps", 1001], ["duree_s", 2881], ["distance_m", 2001]] as const) {
      assert.ok(valeursMolette(champ, 999_999).valeurs.length <= max, `${champ} : molette bornée à ${max} lignes`);
    }
  } finally {
    clavierSeance.fermer("serie-kg");
  }
});

test("Santé, page du mois : 13 mois de jours avec données en une requête, sans Santé Connect", async () => {
  const { lireJoursSante, premierJourSante } = await import("../src/ecrans/sante-jours.ts");
  const b = BUDGETS.santeMois;
  const t0 = performance.now();
  let jours = 0;
  sous(await compter(async () => (jours = (await lireJoursSante(db, decalerCle(AUJ, -365), AUJ)).size)), b.sql, b.sc, "fenêtre de 13 mois");
  const ms = performance.now() - t0;
  assert.ok(ms <= b.ms, `fenêtre de 13 mois : ${Math.round(ms)} ms (budget ${b.ms})`);
  assert.ok(jours > 0, "la base de volume a des jours avec données");
  sous(await compter(() => premierJourSante(db)), 1, 0, "premier jour");
});
