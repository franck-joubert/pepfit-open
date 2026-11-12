// FC pendant une séance de muscu (planches/suivi-gps § 6, lot 5) : fenêtres d'effort estimées, FC par série et par exercice,
// récupération, courbe, bande du bas ; repos et FC en base (migration 40).
import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  bandeFc, decimerExtremes, fcA, fcDesExercices, fcDesSeries, fcSurIntervalle, fenetres, nomCapteur, picDuRepos, recupTexte, vueFcMuscu,
  type Echantillon, type SerieCochee,
} from "../src/ecrans/fc-muscu-vue.ts";
import { ecrireFcMuscu, ecrireFcMuscuLance, finirRepos, lireFcMuscu, lireFcMuscuLance, noterRepos } from "../src/db/depots/fc-muscu.ts";
import { lireSuivi } from "../src/db/depots/suivi-gps.ts";
import { zoneDans, zonesPersonnelles } from "../src/ecrans/zones-fc.ts";
import { MIGRATIONS, migrer, temoinPresent } from "../src/db/migrations.ts";
import { adapter, baseDeTest } from "./aide.ts";

const S = 1000;
const T0 = 1_800_000_000_000;
/** FC d'une seconde à l'autre, de `de` à `a` (s depuis T0) inclus. */
const serieFc = (de: number, a: number, bpm: (s: number) => number): Echantillon[] =>
  Array.from({ length: a - de + 1 }, (_, i) => ({ t: T0 + (de + i) * S, bpm: bpm(de + i) }));
const cochee = (id: string, exerciceId: string, s: number): SerieCochee => ({ id, exerciceId, coche: T0 + s * S });

test("fenêtre d'effort : fin du repos précédent → coche, 120 s au plus ; 60 s pour la première série (D8)", () => {
  const series = [cochee("a", "x", 100), cochee("b", "x", 300), cochee("c", "x", 500), cochee("d", "y", 560), cochee("e", "y", 570)];
  const repos = [
    { debut: T0 + 100 * S, fin: T0 + 250 * S }, // 150 s après a : b commence à 250
    { debut: T0 + 300 * S, fin: T0 + 330 * S }, // « Passer » 30 s après b : 170 s avant c, plafond de 120 s
    // superset : d suit c sans repos ; e cochée 10 s après d (coche après coup)
  ];
  assert.deepEqual(fenetres(series, repos), [
    { debut: T0 + 40 * S, douteuse: false },
    { debut: T0 + 250 * S, douteuse: false },
    { debut: T0 + 380 * S, douteuse: false },
    { debut: T0 + 500 * S, douteuse: false },
    { debut: T0 + 560 * S, douteuse: true },
  ]);
  // Sans minuteur : la coche précédente, plafonnée à 120 s ; un repos fini après la coche (coche pendant le repos) ne compte pas.
  assert.deepEqual(fenetres([cochee("a", "x", 0), cochee("b", "x", 200)], [{ debut: T0, fin: T0 + 250 * S }]), [
    { debut: T0 - 60 * S, douteuse: false },
    { debut: T0 + 80 * S, douteuse: false },
  ]);
  // Un repos lancé avant la première série la borne (120 s au plus)
  assert.deepEqual(fenetres([cochee("a", "x", 100)], [{ debut: T0, fin: T0 + 70 * S }]), [{ debut: T0 + 70 * S, douteuse: false }]);
});

test("FC sur un intervalle : pondérée par le temps, trous de plus de 5 s non comblés", () => {
  const fc = [...serieFc(0, 9, () => 100), ...serieFc(30, 39, () => 160)];
  // 0-9 s à 100 (9 s), puis l'échantillon de 9 s couvre 5 s (jusqu'à 14 s, pas jusqu'à 30) ; 30-40 à 160 (10 s)
  const r = fcSurIntervalle(fc, T0, T0 + 40 * S);
  assert.equal(r.couverture, 24 / 40);
  assert.equal(Math.round(r.moy!), Math.round((100 * 14 + 160 * 10) / 24));
  assert.equal(fcA(fc, T0 + 12 * S), 100);
  assert.equal(fcA(fc, T0 + 20 * S), null);
});

test("par série : FC moyenne de la fenêtre, max jusqu'à 15 s après la coche, récupération = pic − FC 60 s après", () => {
  // série de 100 à 130 s : FC monte de 100 à 160 et culmine 10 s après la coche (140 s, 170), puis redescend de 1 bpm/s
  const bpm = (s: number) => (s < 100 ? 100 : s <= 140 ? 100 + (s - 100) * 1.75 : Math.max(90, 170 - (s - 140)));
  const fc = serieFc(0, 400, (s) => Math.round(bpm(s)));
  const series = [cochee("a", "x", 130), cochee("b", "x", 330)];
  const repos = [{ debut: T0 + 130 * S, fin: T0 + 300 * S }];
  const [a, b] = fcDesSeries(fc, series, repos, 181);
  // fenêtre 70 → 130 (première série) ; moyenne pondérée des 60 s
  const attendue = fc.filter((f) => f.t >= T0 + 70 * S && f.t < T0 + 130 * S).reduce((x, f) => x + f.bpm, 0) / 60;
  assert.equal(a!.moy, Math.round(attendue));
  assert.equal(a!.max, 170); // pic 10 s après la coche
  assert.equal(a!.recup, 170 - 110); // 60 s après le pic (200 s) : 170 − 60
  assert.equal(a!.zone, 5);
  // la série b a sa fenêtre de 300 à 330 s ; la FC est retombée à 90 : récupération 0 (« −0 »)
  assert.equal(b!.debut, T0 + 300 * S);
  assert.equal(b!.moy, 90);
  assert.equal(b!.recup, 0);
});

test("récupération « — » si une série a commencé avant la mesure (repos de moins de 60 s)", () => {
  const fc = serieFc(0, 300, (s) => (s >= 90 && s <= 100 ? 150 : 110));
  const series = [cochee("a", "x", 100), cochee("b", "x", 180)];
  const repos = [{ debut: T0 + 100 * S, fin: T0 + 145 * S }]; // repos de 45 s : b commence à 145 < pic (90) + 60
  const [a, b] = fcDesSeries(fc, series, repos, 181);
  assert.equal(a!.max, 150);
  assert.equal(a!.recup, null);
  assert.ok(b!.recup != null); // dernière série : mesure faite, aucune série après
  assert.equal(recupTexte(52), "−52");
  assert.equal(recupTexte(-3), "+3");
  assert.equal(recupTexte(null), "—");
  // source du bloc : « Whoop · en direct »
  assert.equal(nomCapteur("WHOOP 4A0123"), "Whoop");
  assert.equal(nomCapteur("Polar H10 ABC"), "Polar H10 ABC");
  assert.equal(nomCapteur(null), "Capteur");
});

test("série « — » : coche à moins de 15 s de la précédente, ou moins de 50 % de la fenêtre couverte", () => {
  const fc = [...serieFc(0, 100, () => 120), ...serieFc(170, 400, () => 120)];
  const series = [cochee("a", "x", 100), cochee("b", "x", 110), cochee("c", "x", 220)];
  const [a, b, c] = fcDesSeries(fc, series, [], 181);
  assert.equal(a!.moy, 120);
  assert.deepEqual([b!.douteuse, b!.moy, b!.max, b!.recup, b!.zone], [true, null, null, null, 0]);
  // fenêtre de c : 110 → 220 ; couverte de 110 à 105+5 (rien), puis 170 → 220 : 50 / 110 < 50 %
  assert.equal(c!.douteuse, false);
  assert.deepEqual([c!.moy, c!.max, c!.recup], [null, null, null]);
});

test("par exercice : moyenne des FC moyennes, maximum des FC max, moyenne des récupérations ; ordre de la séance", () => {
  const s = (id: string, exerciceId: string, moy: number | null, max: number | null, recup: number | null) =>
    ({ id, exerciceId, debut: 0, coche: 0, douteuse: false, moy, max, recup, zone: 0 });
  const l = fcDesExercices([s("1", "x", 116, 153, 49), s("2", "x", 132, 155, null), s("3", "x", 123, 162, 55), s("4", "y", null, null, null)], ["y", "x", "z"]);
  assert.deepEqual(l.map((e) => [e.exerciceId, e.moy, e.max, e.recup, e.series.length]), [
    ["y", null, null, null, 1],
    ["x", 124, 162, 52, 3],
  ]);
});

test("courbe : deux points par tranche, les pics restent", () => {
  const l = Array.from({ length: 3600 }, (_, i) => ({ t: i, bpm: i === 1234 ? 190 : i === 2000 ? 60 : 100 + (i % 7) }));
  const d = decimerExtremes(l, 600);
  assert.ok(d.length <= 600);
  assert.ok(d.some((x) => x.bpm === 190) && d.some((x) => x.bpm === 60));
  assert.ok(d.every((x, i) => i === 0 || x.t > d[i - 1]!.t));
});

// ——— La séance simulée de la planche (index.html, « Muscu : séance simulée »), rejouée seconde par seconde ———

const EXOS = [
  { id: "couche", reps: [8, 8, 7, 6], repos: 150, cible: [150, 155, 159, 162] },
  { id: "incline", reps: [10, 9, 8], repos: 120, cible: [146, 150, 153] },
  { id: "ecarte", reps: [12, 12, 11], repos: 90, cible: [134, 137, 139] },
  { id: "elevations", reps: [15, 14, 12], repos: 75, cible: [124, 127, 129] },
  { id: "triceps", reps: [12, 12, 10], repos: 45, cible: [127, 130, 133] },
];
const RETARD = [0, 6, 18, 4, 9, 2, 25, 5, 3, 12, 7, 4, 15, 3, 8, 6];

function seancePlanche() {
  const series: { e: number; i: number; debutReel: number; coche: number; finRepos: number; cible: number }[] = [];
  let t = 150;
  let k = 0;
  let finRepos: number | null = null;
  EXOS.forEach((ex, e) =>
    ex.reps.forEach((r, i) => {
      const debut = (finRepos ?? t) + RETARD[k]! + (i === 0 && e > 0 ? 70 : 0);
      const coche = debut + Math.round(r * 3.2 + 8);
      series.push({ e, i, debutReel: debut, coche, finRepos: coche + ex.repos, cible: ex.cible[i]! });
      finRepos = coche + ex.repos;
      k++;
    }),
  );
  const tFin = series.at(-1)!.finRepos + 40;
  const fc = new Float32Array(tFin + 1);
  let h = 88;
  for (t = 0; t <= tFin; t++) {
    const base = 92 + (t / tFin) * 12;
    const s = series.find((x) => t >= x.debutReel && t <= x.coche + 8);
    if (s) h += ((t <= s.coche ? s.cible : s.cible + 4) - h) / 11;
    else h += (base - h) / 36;
    fc[t] = Math.round(h + 1.6 * Math.sin(t / 7) + 1.1 * Math.sin(t / 2.3));
  }
  return { series, fc: Array.from(fc, (bpm, s) => ({ t: T0 + s * S, bpm })), tFin };
}

test("la séance de la planche : FC par série et par exercice comme la planche (Développé couché ~126, 163, −52)", () => {
  const p = seancePlanche();
  const series = p.series.map((x, k) => cochee(String(k), EXOS[x.e]!.id, x.coche));
  const repos = p.series.map((x) => ({ debut: T0 + x.coche * S, fin: T0 + x.finRepos * S }));
  const v = vueFcMuscu({ fc: p.fc, repos, debut: T0 }, series, EXOS.map((e) => e.id), 181);
  const couche = v.exercices[0]!;
  // planche : séries ~116 153 −49, ~132 155 −48, ~123 162 −55, ~134 163 −56 ; exercice ~126 163 −52
  // (la planche fait la moyenne des secondes de la fenêtre coche comprise, l'appli pondère par le temps jusqu'à la coche : ±1)
  const moys = couche.series.map((s) => s.moy!);
  [116, 132, 123, 134].forEach((m, i) => assert.ok(Math.abs(moys[i]! - m) <= 1, `moy ${i + 1} : ${moys[i]} pour ${m}`));
  assert.deepEqual(couche.series.map((s) => s.max), [153, 155, 162, 163]);
  assert.deepEqual(couche.series.map((s) => s.recup), [49, 48, 55, 56]);
  assert.ok(Math.abs(couche.moy! - 126) <= 1);
  assert.deepEqual([couche.max, couche.recup], [163, 52]);
  // les autres exercices : FC max et récupération de la planche (Triceps corde : voir le test suivant)
  assert.deepEqual(v.exercices.slice(1).map((e) => [e.max, e.recup]), [[154, 44], [141, 27], [132, 23], [134, 22]]);
  // séance : FC max 163 ; 16 coches, 16 bandes, 5 numéros d'exercice au début de la fenêtre de leur première série
  assert.equal(v.fcMax, 163);
  assert.equal(v.coches.length, 16);
  assert.equal(v.bandes.length, 16);
  assert.deepEqual(v.numeros.map((n) => n.n), [1, 2, 3, 4, 5]);
  assert.equal(v.numeros[0]!.s, p.series[0]!.coche - 60);
  // zones : tout le temps compté, une seconde par échantillon
  assert.equal(Math.round(v.zonesS.reduce((a, x) => a + x, 0)), p.tFin + 1);
  // points de séries : la zone du point est celle de la FC max (Z4 ambre, Z5 rouge)
  assert.deepEqual(couche.series.map((s) => s.zone), [4, 4, 4, 5]);
});

test("planche « Triceps corde −20 », appli −22 : la planche connaît le vrai début de la série suivante, l'appli la fin du repos", () => {
  // 1re série : pic 10 s avant la coche, mesure 50 s après la coche ; le repos (45 s) finit avant, la série suivante a
  // vraiment commencé 8 s après (planche : −18). L'appli ne connaît que la fin du repos : « — » (règle de la NOTES). Seule la
  // dernière série a sa récupération : −22 au lieu de la moyenne (18 + 22) / 2 de la planche.
  const p = seancePlanche();
  const series = p.series.map((x, k) => cochee(String(k), EXOS[x.e]!.id, x.coche));
  const repos = p.series.map((x) => ({ debut: T0 + x.coche * S, fin: T0 + x.finRepos * S }));
  const v = vueFcMuscu({ fc: p.fc, repos, debut: T0 }, series, EXOS.map((e) => e.id), 181);
  assert.deepEqual(v.exercices[4]!.series.map((s) => s.recup), [null, null, 22]);
  assert.equal(v.exercices[4]!.recup, 22);
});

test("bande du bas : FC et zone, baisse depuis le pic pendant un repos, recherche, diffusion coupée, sans Whoop", () => {
  const base = { active: true, appareils: true, etat: "connecte" as const, bpm: 121, vue: true, depuisMs: 60_000, fcMax: 181, pic: 153 };
  assert.deepEqual(bandeFc(base), { genre: "fc", bpm: 121, zone: 2, baisse: 32 });
  assert.deepEqual(bandeFc({ ...base, bpm: 148, pic: null }), { genre: "fc", bpm: 148, zone: 4, baisse: null });
  assert.deepEqual(bandeFc({ ...base, active: false }), { genre: "rien" });
  assert.deepEqual(bandeFc({ ...base, appareils: false }), { genre: "coupee", action: "autoriser" });
  assert.deepEqual(bandeFc({ ...base, etat: "perdu", bpm: null }), { genre: "perdue" });
  assert.deepEqual(bandeFc({ ...base, etat: "recherche", bpm: null, vue: false, depuisMs: 5000 }), { genre: "recherche" });
  assert.deepEqual(bandeFc({ ...base, etat: "recherche", bpm: null, vue: false, depuisMs: 30_000 }), { genre: "coupee", action: "activer" });
  assert.deepEqual(bandeFc({ ...base, etat: "perdu", bpm: null, vue: false }), { genre: "coupee", action: "activer" });
  // pic du repos : de 60 s avant la coche à 15 s après
  const fc = serieFc(0, 200, (s) => (s === 110 ? 170 : s === 130 ? 190 : 120));
  assert.equal(picDuRepos(fc, T0 + 100 * S, T0 + 150 * S), 170);
  assert.equal(picDuRepos(fc, T0 + 100 * S, T0 + 105 * S), 120);
  assert.equal(picDuRepos(fc, null, T0), null);
});

test("migration 40 : repos de la séance et capteur, témoin, additive", async () => {
  const m = MIGRATIONS.find((x) => x.temoin === "seance_repos")!;
  assert.equal(m.nom, "fc-muscu");
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, m.version - 1);
  assert.equal(await temoinPresent(db, "seance_repos"), false);
  await migrer(db);
  assert.ok(await temoinPresent(db, "seance_repos"));
  assert.ok(await temoinPresent(db, "suivi_seance.capteur"));
});

test("repos de la séance en cours : lancé, remplacé, ajusté, passé ; FC enregistrée à la fin, partie avec la séance", async () => {
  const { raw, db } = await baseDeTest();
  // sans séance en cours : rien
  await noterRepos(db, T0, T0 + 90 * S);
  raw.prepare("INSERT INTO seances (id, titre, debut, maj_le) VALUES ('s1', 'Push A', ?, ?)").run(T0, T0);
  await noterRepos(db, T0 + 100 * S, T0 + 250 * S);
  await finirRepos(db, T0 + 265 * S, T0 + 200 * S); // +15
  await noterRepos(db, T0 + 400 * S, T0 + 550 * S);
  await noterRepos(db, T0 + 450 * S, T0 + 480 * S); // nouveau repos avant la fin du précédent : celui-ci se ferme à 450
  await finirRepos(db, T0 + 470 * S, T0 + 470 * S); // Passer
  await finirRepos(db, T0 + 500 * S, T0 + 500 * S); // déjà fini : rien
  const repos = raw.prepare("SELECT debut, fin FROM seance_repos WHERE seance_id = 's1' ORDER BY debut").all().map((r) => ({ ...r }));
  assert.deepEqual(repos, [
    { debut: T0 + 100 * S, fin: T0 + 265 * S },
    { debut: T0 + 400 * S, fin: T0 + 450 * S },
    { debut: T0 + 450 * S, fin: T0 + 470 * S },
  ]);
  // pas encore de FC : pas de bloc ; puis la fin de séance l'écrit (s compté depuis le début, pause comprise)
  assert.equal(await lireFcMuscu(db, "s1"), null);
  raw.prepare("UPDATE seances SET fin = ? WHERE id = 's1'").run(T0 + 600 * S);
  await ecrireFcMuscu(db, "s1", T0, serieFc(10, 12, () => 120), "WHOOP 4A0");
  const lu = await lireFcMuscu(db, "s1");
  assert.deepEqual(lu!.fc.map((f) => f.bpm), [120, 120, 120]);
  assert.equal(lu!.repos.length, 3);
  assert.equal(lu!.capteur, "WHOOP 4A0");
  assert.deepEqual(raw.prepare("SELECT s FROM seance_fc WHERE seance_id = 's1' ORDER BY t").all().map((r) => (r as { s: number }).s), [10_000, 11_000, 12_000]);
  // le bloc de course ne la prend pas pour une course
  assert.equal(await lireSuivi(db, "s1"), null);
  // une nouvelle écriture remplace
  await ecrireFcMuscu(db, "s1", T0, serieFc(10, 11, () => 130), null);
  assert.equal((await lireFcMuscu(db, "s1"))!.fc.length, 2);
  raw.prepare("DELETE FROM seances WHERE id = 's1'").run();
  for (const t of ["seance_fc", "seance_repos", "suivi_seance"]) assert.equal((raw.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n, 0, t);
});

test("suivi natif de la FC de la séance : retenu, puis effacé", async () => {
  const { db } = await baseDeTest();
  assert.equal(await lireFcMuscuLance(db), null);
  await ecrireFcMuscuLance(db, { suiviId: "x1", seanceId: "s1" });
  assert.deepEqual(await lireFcMuscuLance(db), { suiviId: "x1", seanceId: "s1" });
  await ecrireFcMuscuLance(db, null);
  assert.equal(await lireFcMuscuLance(db), null);
});

test("zones personnelles (Karvonen) : bornes, zone des séries et de la bande d'après la FC de réserve, source gardée", () => {
  const z = zonesPersonnelles({ bpm: 181, source: "mesuree", date: T0, vue: 181 }, { bpm: 50, source: "whoop", n: 20 });
  assert.equal(z.methode, "karvonen");
  const p = seancePlanche();
  const series = p.series.map((x, k) => cochee(String(k), EXOS[x.e]!.id, x.coche));
  const repos = p.series.map((x) => ({ debut: T0 + x.coche * S, fin: T0 + x.finRepos * S }));
  const v = vueFcMuscu({ fc: p.fc, repos, debut: T0 }, series, EXOS.map((e) => e.id), z);
  assert.deepEqual(v.bornes, z.bornes);
  assert.equal(v.fcMaxProfil, 181);
  assert.equal(v.zonesFc, z);
  assert.deepEqual(v.series.map((s) => s.zone), v.series.map((s) => (s.max == null ? 0 : Math.max(1, zoneDans(s.max, z.bornes)))));
  // FC max 153 · 155 · 162 · 163 : Z4 Z4 Z4 Z5 en tranches de 181, Z3 Z4 Z4 Z4 en Karvonen (bornes 116 · 129 · 142 · 155 · 168)
  assert.deepEqual(z.bornes, [116, 129, 142, 155, 168]);
  assert.deepEqual(v.exercices[0]!.series.map((s) => s.zone), [3, 4, 4, 4]);
  // une FC max seule : pas de source de zones
  assert.equal(vueFcMuscu({ fc: p.fc, repos, debut: T0 }, series, EXOS.map((e) => e.id), 181).zonesFc, null);
  const base = { active: true, appareils: true, etat: "connecte" as const, bpm: 121, vue: true, depuisMs: 60_000, fcMax: z, pic: null };
  assert.deepEqual(bandeFc(base), { genre: "fc", bpm: 121, zone: 1, baisse: null });
});
