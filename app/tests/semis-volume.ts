// Jeu de données SYNTHÉTIQUE volumineux de l'audit de performance (docs/AUDIT-PERF.md), même graine : 1 561 jours de journal
// Nutrition (320 produits), 532 séances dont 268 Whoop, 10 331 séries, 40 routines dont 8 programmées, 686 jours Whoop,
// 1 145 pesées, 2 273 mesures du corps. Jamais app/donnees-perso. Sert aux budgets de requêtes (tests/budgets-perf.test.ts),
// au banc de docs/PERF-B.md et à la base de l'émulateur (docs/audit-perf/seed-volume.ts). La base doit avoir le catalogue.
import type { DatabaseSync } from "node:sqlite";
import type { Executeur } from "../src/db/executeur.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { ajouterMensuration } from "../src/db/depots/profil.ts";
import { ajouterMesures } from "../src/db/depots/mesures.ts";
import { enregistrerJours, enregistrerSeances, mesuresDesJours } from "../src/whoop/depot.ts";
import { recalculerTout } from "../src/db/depots/recalcul.ts";

/** Sème le jeu dans `raw` (connexion brute) et `db` (son exécuteur, sans façade) ; `MAINTENANT` fixe les dates. */
export async function semerVolume(raw: DatabaseSync, db: Executeur, MAINTENANT: number): Promise<void> {
  const J = 86_400_000, H = 3_600_000, M = 60_000;
  const jourDe = (i: number) => { const d = new Date(MAINTENANT); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - i).getTime(); };
  const alea = (i: number, s = 1) => { const x = Math.sin(i * 127.1 * s + 311.7) * 43758.5453; return x - Math.floor(x); };
  const cle = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const id = (p: string, i: number | string) => `perf-${p}-${i}`;

  // Profil : homme, 1,83 m, né en 1980 ; Whoop relié (sans compte : la synchro échoue tout de suite sur l'émulateur).
  for (const [k, v] of [["sexe", "h"], ["annee_naissance", "1980"], ["naissance", "1980-05-14"], ["nutri_poids_cible", "78"], ["nutri_rythme", "-0.25"],
    ["parcours_fait", "1"], ["langue", "fr"], ["unite", "kg"], ["unite_distance", "km"], ["whoop_connecte", "1"], ["whoop_pas_actif", "1"],
    ["whoop_derniere_synchro", String(MAINTENANT - 5 * M)]] as const) await ecrireReglage(db, k, v);
  if (!raw.prepare("SELECT 1 FROM mensurations WHERE type = 'taille'").get()) await ajouterMensuration(db, "taille", 183, jourDe(1500));

  raw.exec("BEGIN");
  // ---- Whoop : 700 jours, et les mesures du corps qu'en tire la synchro (VFC, FC au repos)
  const jours = [];
  for (let i = 0; i < 700; i++) {
    const j = jourDe(i), d = new Date(j);
    if (alea(i, 99) < 0.02) continue; // bracelet non porté
    const sommeil = Math.round(400 + (alea(i, 7) - 0.4) * 90), eveil = Math.round(sommeil * 0.12), auLit = sommeil + eveil;
    const coucher = j - (10 + Math.round((alea(i, 3) - 0.5) * 50)) * M;
    const recup = Math.round(Math.min(97, Math.max(12, 58 + (alea(i, 31) - 0.5) * 70)));
    const strain = Math.round((d.getDay() === 1 || d.getDay() === 4 ? 13 + alea(i, 41) * 3 : 6 + alea(i, 43) * 6) * 10) / 10;
    const profond = Math.round(sommeil * 0.2), paradoxal = Math.round(sommeil * 0.24);
    jours.push({ jour: j, pas: Math.round((5500 + alea(i) * 7000) / 10) * 10, recup, vfc: Math.round(70 + recup * 0.25 + (alea(i, 32) - 0.5) * 10),
      fcRepos: Math.round(48 - recup * 0.06 + (alea(i, 33) - 0.5) * 4), respiration: Math.round((12.6 + alea(i, 34) * 0.6) * 10) / 10,
      sommeilDebut: coucher, sommeilFin: coucher + auLit * M, sommeilMin: sommeil, sommeilPerf: Math.round(Math.min(100, (sommeil / 520) * 100)),
      sommeilDetteMin: Math.round(30 + alea(i, 8) * 60), profondMin: profond, paradoxalMin: paradoxal, legerMin: sommeil - profond - paradoxal,
      eveilMin: eveil, auLitMin: auLit, sommeilEfficacite: Math.round((sommeil / auLit) * 100), sommeilRegularite: Math.round(70 + alea(i, 9) * 20),
      sommeilReveils: Math.round(1 + alea(i, 10) * 4), sommeilCycles: Math.round(sommeil / 90), besoinBaseMin: 451, besoinEffortMin: Math.round(alea(i, 11) * 30),
      besoinSiesteMin: 0, strain, kj: Math.round((2000 + strain * 30) * 4.184) });
  }
  raw.exec("COMMIT");
  await enregistrerJours(db, jours, MAINTENANT);
  await mesuresDesJours(db, jours, MAINTENANT);

  // ---- Séances Whoop : padel ou course, 300 sur 700 jours
  const ws = [];
  for (let i = 1; i < 700 && ws.length < 300; i++) {
    const d = new Date(jourDe(i));
    if (!(d.getDay() === 1 || d.getDay() === 4 || (d.getDay() === 6 && alea(i, 50) < 0.5))) continue;
    const debut = jourDe(i) + 18.5 * H, duree = Math.round(45 + alea(i, 12) * 40);
    const course = d.getDay() === 6;
    ws.push({ id: id("w", i), debut, fin: debut + duree * M, sportId: course ? 0 : 235, sport: course ? "Running" : "Padel",
      strain: Math.round((10 + alea(i, 13) * 4) * 10) / 10, kj: Math.round((400 + alea(i, 14) * 200) * 4.184), fcMoy: 138, fcMax: 172,
      distanceM: course ? Math.round(8000 + alea(i, 15) * 4000) : null, zones: [2, 8, 22, 28, 3, 0].map((z) => Math.round((z * duree) / 63)) });
  }
  await enregistrerSeances(db, ws, MAINTENANT);

  raw.exec("BEGIN");
  // ---- Musculation pepfit : 40 routines, 460 séances sur 1 600 jours
  const exos = (raw.prepare("SELECT id FROM exercices WHERE categorie = 'Force' AND slug IS NOT NULL ORDER BY nom").all() as { id: string }[]).map((e) => e.id);
  if (exos.length < 60) throw new Error(`catalogue absent (${exos.length} exercices de force) : lancer l'appli une fois avant de semer`);
  const insRoutine = raw.prepare("INSERT OR REPLACE INTO routines (id, nom, ordre, cree_le, maj_le, type) VALUES (?,?,?,?,?,'muscu')");
  const insRE = raw.prepare("INSERT OR REPLACE INTO routine_exercices (id, routine_id, exercice_id, position, nb_series, repos_s, plage_reps) VALUES (?,?,?,?,?,?,?)");
  const insRS = raw.prepare("INSERT OR REPLACE INTO routine_series (ligne_id, rang, kg, reps, type) VALUES (?,?,?,?,'normale')");
  const insProg = raw.prepare("INSERT OR REPLACE INTO programmations (id, routine_id, texte, regle, actif, rappel_min, ordre, cree_le, maj_le) VALUES (?,?,?,?,1,NULL,?,?,?)");
  const NOMS = ["Push", "Pull", "Legs", "Haut", "Bas", "Full body", "Bras", "Épaules", "Dos", "Pecs"];
  const routines: { id: string; exos: string[] }[] = [];
  for (let r = 0; r < 40; r++) {
    const rid = id("r", r), n = 5 + (r % 2), liste: string[] = [];
    insRoutine.run(rid, `${NOMS[r % NOMS.length]} ${String.fromCharCode(65 + Math.floor(r / NOMS.length))}`, r, MAINTENANT - 900 * J, MAINTENANT - r * J);
    for (let k = 0; k < n; k++) {
      const e = exos[(r * 7 + k * 13) % exos.length]!, lid = id(`re${r}`, k);
      liste.push(e);
      insRE.run(lid, rid, e, k, 4, 120, "8-12");
      for (let s = 0; s < 4; s++) insRS.run(lid, s, 40 + 5 * k, 10);
    }
    routines.push({ id: rid, exos: liste });
    // 8 routines programmées chaque semaine (planning de la semaine, rappels)
    if (r < 8) insProg.run(id("prog", r), rid, "Chaque semaine", JSON.stringify({ freq: "semaine", intervalle: 1, jours: [r % 7], heure: "18:00", debut: cle(jourDe(400)) }), r, MAINTENANT, MAINTENANT);
  }
  const insSeance = raw.prepare("INSERT OR REPLACE INTO seances (id, titre, debut, fin, maj_le, routine_id) VALUES (?,?,?,?,?,?)");
  const insSE = raw.prepare("INSERT OR REPLACE INTO seance_exercices (seance_id, exercice_id, position, repos_s) VALUES (?,?,?,120)");
  const insSerie = raw.prepare("INSERT OR REPLACE INTO series (id, seance_id, exercice_id, position, type, kg, reps, faite, fait_le) VALUES (?,?,?,?,'normale',?,?,1,?)");
  const insFc = raw.prepare("INSERT OR REPLACE INTO seance_fc (seance_id, t, s, bpm) VALUES (?,?,?,?)");
  let nbSeances = 0, nbSeries = 0;
  for (let i = 1; i < 1600; i++) {
    const d = new Date(jourDe(i));
    if (!(d.getDay() === 2 || d.getDay() === 5 || (d.getDay() === 0 && alea(i, 60) < 0.2))) continue;
    if (alea(i, 61) < 0.08) continue; // séance sautée
    const r = routines[(i * 3) % routines.length]!, sid = id("s", i), debut = jourDe(i) + 12 * H + Math.round(alea(i, 62) * 6) * H;
    const duree = Math.round(50 + alea(i, 63) * 30);
    insSeance.run(sid, `Séance ${nbSeances}`, debut, debut + duree * M, MAINTENANT, r.id);
    const progres = (1600 - i) / 1600; // charges qui montent avec le temps
    r.exos.forEach((e, k) => {
      insSE.run(sid, e, k);
      const n = 3 + Math.floor(alea(i * 10 + k, 64) * 3);
      for (let s = 0; s < n; s++) {
        insSerie.run(id(`x${i}`, `${k}-${s}`), sid, e, s, Math.round((30 + 5 * k + 25 * progres + alea(i + s, 65) * 5) * 2) / 2, 8 + Math.floor(alea(i + k + s, 66) * 5), debut + (k * 8 + s * 2) * M);
        nbSeries++;
      }
    });
    if (nbSeances < 40) for (let k = 0; k < duree * 60; k += 5) insFc.run(sid, debut + k * 1000, k * 1000, Math.round(110 + 20 * Math.sin(k / 90)));
    nbSeances++;
  }

  // ---- Pesées (1 200) et %gras (900) depuis plus de 4 ans, tours de taille (150)
  const gras: { valeur: number; date: number; origine: string }[] = [];
  const insPesee = raw.prepare("INSERT OR REPLACE INTO pesee (id, date, kg, source, origine) VALUES (?,?,?,?,?)");
  let nbPesees = 0;
  for (let i = 1; i < 1600 && nbPesees < 1200; i++) {
    if (alea(i, 16) < 0.25) continue;
    const date = jourDe(i) + (7 * 60 + Math.round(alea(i, 17) * 30)) * M, kg = Math.round((80 + Math.sin(i / 200) * 3 + (alea(i, 18) - 0.5) * 1.2) * 100) / 100;
    const manuel = i % 37 === 0;
    insPesee.run(id("p", i), date, kg, manuel ? "manuel" : "sante_connect", manuel ? null : "com.withings.wiscale2");
    if (!manuel && gras.length < 900) gras.push({ valeur: Math.round((15 + Math.sin(i / 150) * 2 + (alea(i, 19) - 0.5) * 1.4) * 10) / 10, date, origine: "com.withings.wiscale2" });
    nbPesees++;
  }
  const insMens = raw.prepare("INSERT OR REPLACE INTO mensurations (id, type, date, valeur) VALUES (?,?,?,?)");
  for (let k = 0; k < 150; k++) insMens.run(id("tour", k), "tour_taille", jourDe(k * 10 + 1), Math.round((86 + Math.sin(k / 9) * 3) * 10) / 10);

  // ---- Nutrition : 320 produits (120 perso), 1 600 jours, 4 repas de 2 à 4 aliments
  const insProduit = raw.prepare("INSERT OR REPLACE INTO produits (id, code_barres, nom, marque, categorie, base, nutriments, portions, source, cree_le, vu_le, favori) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  const produits: string[] = [];
  for (let p = 0; p < 320; p++) {
    const kcal = Math.round(50 + alea(p, 70) * 450), perso = p < 120;
    const nutr = { energie_kcal: kcal, proteines: Math.round(alea(p, 71) * 30 * 10) / 10, glucides: Math.round(alea(p, 72) * 60 * 10) / 10, lipides: Math.round(alea(p, 73) * 25 * 10) / 10,
      fibres: Math.round(alea(p, 74) * 8 * 10) / 10, sucres: Math.round(alea(p, 75) * 20 * 10) / 10, sel: Math.round(alea(p, 76) * 2 * 100) / 100 };
    insProduit.run(id("prod", p), perso ? null : String(3000000000000 + p), `${perso ? "Plat maison" : "Produit"} ${p}`, perso ? null : "Marque", null, "100g",
      JSON.stringify(nutr), JSON.stringify([{ nom: "portion", g: 100 + (p % 5) * 25 }]), perso ? "perso" : "off", MAINTENANT - 1600 * J, MAINTENANT - (p % 300) * J, p % 23 === 0 ? 1 : 0);
    produits.push(id("prod", p));
  }
  const insConso = raw.prepare("INSERT OR REPLACE INTO consommations (id, date, repas_id, produit_id, quantite_g, unite, nb_unites, repete, ordre, cree_le, ajuste) VALUES (?,?,?,?,?,'g',1,0,?,?,0)");
  const REPAS = ["repas:petit_dej", "repas:dejeuner", "repas:collation", "repas:diner"];
  let nbConso = 0;
  for (let i = 0; i < 1600; i++) {
    const j = jourDe(i), date = cle(j);
    if (i > 0 && alea(i, 80) < 0.03) continue; // jour sans journal
    REPAS.forEach((r, k) => {
      if (i === 0 && k > 1) return; // aujourd'hui : petit déjeuner et déjeuner
      const n = 2 + Math.floor(alea(i * 4 + k, 81) * 3);
      for (let a = 0; a < n; a++) {
        // les habitudes : une poignée de produits revient souvent, le reste de temps en temps
        const p = alea(i * 16 + k * 4 + a, 82) < 0.6 ? (k * 20 + a * 3 + (i % 5)) % 80 : Math.floor(alea(i * 16 + k * 4 + a, 83) * 320);
        insConso.run(id(`c${i}`, `${k}-${a}`), date, r, produits[p]!, Math.round(40 + alea(i + a, 84) * 200), a, j + (7 + k * 4) * H);
        nbConso++;
      }
    });
  }
  raw.exec("COMMIT");
  await ajouterMesures(db, "gras", gras, "sante_connect", MAINTENANT);
  await ajouterMesures(db, "bmr", [{ valeur: 1900, date: jourDe(2) + 7 * H, origine: "com.withings.wiscale2" }], "sante_connect", MAINTENANT);
  // volumes, e1RM, records et précédents, comme après un import
  await recalculerTout(db);

}
