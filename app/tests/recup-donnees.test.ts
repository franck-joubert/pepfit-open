// La Récupération en base (planche recuperation, NOTES § 4 et 5) : les nuits brutes dans recup_nuit (Whoop d'abord, puis les
// mesures et Santé Connect ; montre ou téléphone), jamais le score ; le score relu à l'affichage, recalculé sur l'historique ;
// la cible d'Effort réglée par la Récupération ; la synchro de deux téléphones (une nuit mieux mesurée n'est jamais
// écrasée) ; le labo, seul à lire le score de Whoop.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest } from "./aide.ts";
import { ajouterMesures } from "../src/db/depots/mesures.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import {
  assurerNuitsRecup, ecrireNuitsRecup, isoJour, lireComparaisonRecup, lireComparaisonSommeil, qualiteSources, lireRecupJour, lireRecupJours, milieuNuit, oublierPasseNuits, rangNuit,
} from "../src/ecrans/recup-donnees.ts";
import { lireCible } from "../src/ecrans/sport-stats-donnees.ts";
import { garderNuitMieuxMesuree, tableSync } from "../src/sync/schema.ts";
import { aleatoire, pret } from "../src/sync/chiffrement.ts";
import { synchroniser, type Changement, type Lot, type Transport } from "../src/sync/moteur.ts";
import type { SommeilNuit } from "../src/natif/sante/types.ts";

const MIN = 60_000;
const MAINTENANT = new Date(2026, 9, 30, 19, 10).getTime();
const jour = (n: number) => new Date(2026, 9, 30 + n).getTime();
const a = (h: number, m: number, n = 0) => jour(n) + (h * 60 + m) * MIN;

/** 50 nuits Whoop jusqu'à ce matin : VFC autour de 56 ms, FC 53, 7 h 30 de 23:30 à 7:00 ; le score de Whoop à 33. */
async function semer({ vfcCeMatin = 62, fcCeMatin = 51 } = {}) {
  const { db, raw } = await baseDeTest();
  const ins = raw.prepare(
    "INSERT INTO whoop_jour (jour, recup, vfc, fc_repos, sommeil_debut, sommeil_fin, sommeil_min, besoin_base_min, sommeil_dette_min, maj_le) VALUES (?,?,?,?,?,?,?,?,?,?)",
  );
  for (let n = -49; n <= 0; n++) {
    const vfc = n === 0 ? vfcCeMatin : [52, 56, 60, 54, 58][(n + 50) % 5]!;
    const fc = n === 0 ? fcCeMatin : [52, 54, 53, 51, 55][(n + 50) % 5]!;
    ins.run(jour(n), 33, vfc, fc, a(23, 30, n - 1), a(7, 0, n), 450, 450, 10, MAINTENANT);
  }
  return { db, raw };
}

test("les nuits : Whoop d'abord (ses mesures, jamais son score), milieu de nuit sans fuseau, rang", async () => {
  const { db, raw } = await semer();
  const n = await ecrireNuitsRecup(db, jour(-49), jour(0), { maintenant: MAINTENANT });
  assert.equal(n, 50);
  const l = raw.prepare("SELECT * FROM recup_nuit WHERE jour = ?").get("2026-10-30") as Record<string, unknown>;
  assert.deepEqual([l.rmssd, l.fc_repos, l.sommeil_min, l.besoin_min, l.source_vfc, l.source_sommeil, l.rang], [62, 51, 450, 460, "whoop", "montre", 8]);
  assert.equal(l.milieu_min, milieuNuit(a(23, 30, -1), a(7, 0)));
  assert.equal(milieuNuit(a(23, 0, -1), a(7, 0)), 900, "3 h du matin");
  assert.equal(Object.keys(l).some((k) => /score|recup|strain/.test(k)), false, "jamais de score dans la ligne");
  // relu sans changement : rien de réécrit
  assert.equal(await ecrireNuitsRecup(db, jour(-49), jour(0), { maintenant: MAINTENANT }), 0);
  assert.equal(rangNuit({ rmssd: null, fcRepos: null, sommeilMin: 400, sourceSommeil: "telephone" }), 1);
});

test("sans Whoop : la VFC et la FC des mesures, le sommeil de Santé Connect (phases : montre ; sans : téléphone)", async () => {
  const { db, raw } = await baseDeTest();
  await ajouterMesures(db, "vfc", [{ valeur: 48, date: a(6, 30) }, { valeur: 50, date: a(6, 30, -1) }], "sante_connect", MAINTENANT);
  await ajouterMesures(db, "fc", [{ valeur: 55, date: a(6, 30) }], "sante_connect", MAINTENANT);
  const nuits: SommeilNuit[] = [
    { debut: a(23, 0, -1), fin: a(6, 40), minutes: 440, phases: { leger: 200, profond: 90, paradoxal: 100, eveil: 50 }, origine: "com.sec.android.app.shealth" },
    { debut: a(0, 10, -1), fin: a(6, 50, -1), minutes: 380, phases: null, origine: "com.google.android.apps.fitness" },
    { debut: a(13, 0, -1), fin: a(13, 30, -1), minutes: 30, phases: null, origine: null },
  ];
  await ecrireNuitsRecup(db, jour(-2), jour(0), { nuitsSante: async () => nuits, maintenant: MAINTENANT });
  const l = raw.prepare("SELECT jour, rmssd, fc_repos, sommeil_min, source_vfc, source_sommeil, besoin_min, rang FROM recup_nuit ORDER BY jour").all();
  assert.deepEqual(
    l.map((x) => ({ ...(x as object) })),
    [
      { jour: "2026-10-29", rmssd: 50, fc_repos: null, sommeil_min: 380, source_vfc: "sante_connect", source_sommeil: "telephone", besoin_min: null, rang: 5 },
      { jour: "2026-10-30", rmssd: 48, fc_repos: 55, sommeil_min: 440, source_vfc: "sante_connect", source_sommeil: "montre", besoin_min: null, rang: 8 },
    ],
  );
});

test("une nuit mieux mesurée n'est jamais réécrite par une moins complète (un téléphone sans montre)", async () => {
  const { db, raw } = await semer();
  await ecrireNuitsRecup(db, jour(0), jour(0), { maintenant: MAINTENANT });
  raw.prepare("DELETE FROM whoop_jour").run();
  const tel: SommeilNuit[] = [{ debut: a(23, 50, -1), fin: a(6, 50), minutes: 400, phases: null, origine: null }];
  await ecrireNuitsRecup(db, jour(0), jour(0), { nuitsSante: async () => tel, maintenant: MAINTENANT + MIN });
  const l = raw.prepare("SELECT rmssd, sommeil_min, rang FROM recup_nuit WHERE jour = '2026-10-30'").get() as Record<string, unknown>;
  assert.deepEqual([l.rmssd, l.sommeil_min, l.rang], [62, 450, 8]);
  assert.equal(garderNuitMieuxMesuree({ rang: 8 }, { rang: 1 }), true);
  // fusion : le sommeil du téléphone, puis la FC des mesures ; la nuit garde les deux
  const { db: b, raw: r } = await baseDeTest();
  await ecrireNuitsRecup(b, jour(0), jour(0), { nuitsSante: async () => tel, maintenant: MAINTENANT });
  await ajouterMesures(b, "fc", [{ valeur: 54, date: a(6, 30) }], "sante_connect", MAINTENANT);
  await ecrireNuitsRecup(b, jour(0), jour(0), { maintenant: MAINTENANT + MIN });
  const f = r.prepare("SELECT fc_repos, sommeil_min, source_sommeil, rang FROM recup_nuit").get() as Record<string, unknown>;
  assert.deepEqual([f.fc_repos, f.sommeil_min, f.source_sommeil, f.rang], [54, 400, "telephone", 3]);
  assert.equal(garderNuitMieuxMesuree({ rang: 5 }, { rang: 5 }), false, "égalité : la plus récente gagne");
});

test("le score se lit depuis les nuits en base ; l'historique est recalculé, rien n'est stocké en score", async () => {
  const { db, raw } = await semer();
  oublierPasseNuits();
  await assurerNuitsRecup(db, { maintenant: MAINTENANT });
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM recup_nuit").get() as { n: number }).n, 50);
  const r = await lireRecupJour(db, jour(0));
  assert.equal(r.jour, isoJour(jour(0)));
  assert.ok(r.score != null && r.score >= 67, `${r.score}`);
  assert.equal(r.niveau, "pret");
  assert.equal(r.apports.charge.absente, true, "aucune séance : la charge compte pour 70");
  assert.equal(r.precision, 90);
  const h = await lireRecupJours(db, jour(-6), jour(2), MAINTENANT);
  assert.equal(h.size, 7, "rien d'après aujourd'hui");
  assert.ok([...h.values()].every((x) => x.score != null));
  // le score de Whoop (33) n'y est pour rien : le changer ne change pas le nôtre
  raw.prepare("UPDATE whoop_jour SET recup = 99").run();
  assert.equal((await lireRecupJour(db, jour(0))).score, r.score);
});

test("la cible d'Effort suit la Récupération : bien récupéré, elle monte ; fatigué, elle baisse", async () => {
  const preparer = async (vfcCeMatin: number, fcCeMatin: number) => {
    const { db, raw } = await semer({ vfcCeMatin, fcCeMatin });
    raw.prepare("INSERT INTO routines (id, nom, ordre, cree_le, maj_le, type) VALUES ('r-f', 'Footing', 0, 0, 0, 'course')").run();
    await ecrireReglage(db, "fc_max_mode", "saisie");
    await ecrireReglage(db, "fc_max", "190");
    await ecrireReglage(db, "zones_methode", "fcmax");
    const fc = raw.prepare("INSERT INTO seance_fc (seance_id, t, s, bpm) VALUES (?,?,?,?)");
    for (let n = -34; n <= -2; n += 2) {
      raw.prepare("INSERT INTO seances (id, titre, debut, fin, maj_le, routine_id, activite_id) VALUES (?,?,?,?,?,?,?)").run(`f${n}`, "Footing", a(18, 0, n), a(18, 40, n), 0, null, "cat:course");
      for (let k = 0; k < 40 * 60; k += 5) fc.run(`f${n}`, a(18, 0, n) + k * 1000, k * 1000, 145);
    }
    await ecrireNuitsRecup(db, jour(-49), jour(0), { maintenant: MAINTENANT });
    return db;
  };
  const bien = await preparer(70, 49);
  const fatigue = await preparer(38, 62);
  const cb = (await lireCible(bien, jour(0), MAINTENANT))!;
  const cf = (await lireCible(fatigue, jour(0), MAINTENANT))!;
  const rb = await lireRecupJour(bien, jour(0));
  const rf = await lireRecupJour(fatigue, jour(0));
  assert.ok(cb.m > 1 && cf.m < 1, `${cb.m} ${cf.m}`);
  assert.equal(cb.m, rb.forme);
  assert.equal(cf.m, rf.forme);
  assert.ok(cb.haut > cf.haut);
  assert.equal(rf.niveau === "pret", false);
});

test("labo : notre score face à celui de Whoop, matin par matin, corrélation et écart par bande", async () => {
  const { db } = await semer();
  await ecrireNuitsRecup(db, jour(-49), jour(0), { maintenant: MAINTENANT });
  const c = await lireComparaisonRecup(db, MAINTENANT);
  assert.equal(c.lignes.length, 28);
  assert.equal(c.lignes[0]!.jour, jour(0), "le plus récent d'abord");
  assert.equal(c.lignes[0]!.whoop, 33);
  // Whoop dit 33 (« Fatigué ») chaque matin : tout tombe dans sa bande, et notre score est plus haut
  assert.equal(c.ecartParBande.fatigue.n, 28);
  assert.ok(c.ecartParBande.fatigue.ecart! > 0);
  assert.equal(c.ecartParBande.pret.n, 0);
  assert.equal(c.correlation, null, "Whoop ne bouge pas : pas de corrélation");
});

test("labo du sommeil : notre « à rattraper » face à la dette de Whoop, et les deux besoins (D19)", async () => {
  const { db } = await semer();
  await ecrireNuitsRecup(db, jour(-49), jour(0), { maintenant: MAINTENANT });
  await ecrireReglage(db, "sommeil_objectif_min", "480");
  const c = await lireComparaisonSommeil(db, MAINTENANT);
  assert.equal(c.lignes.length, 28);
  const l = c.lignes[0]!;
  assert.equal(l.jour, jour(0), "le plus récent d'abord");
  // 7 h 30 chaque nuit pour 8 h d'objectif : 30 min × (7 + 6 + … + 1) / 7 = 120 min à rattraper ; Whoop dit 10
  assert.deepEqual([l.aRattraper, l.precision, l.whoop, l.ecart], [120, 100, 10, 110]);
  // notre besoin : 8 h + 45 min de rattrapage ; celui de Whoop : 450 + 10
  assert.deepEqual([l.besoin, l.besoinWhoop], [525, 460]);
  assert.deepEqual([c.n, c.ecartMoyen], [28, 110]);
  assert.equal(c.correlation, null, "rien ne bouge : pas de corrélation");
});

// ---------------------------------------------------------------- la synchro

class FauxServeur {
  lignes = new Map<string, Changement & { seq: number }>();
  seq = 0;
  transport(): Transport {
    return {
      pousser: async (lot) => {
        for (const c of lot) this.lignes.set(`${c.tab}/${c.cle}`, { ...c, seq: ++this.seq });
      },
      tirer: async (curseur, limite): Promise<Lot> => {
        const depuis = curseur ? Number(curseur) : 0;
        const l = [...this.lignes.values()].filter((x) => x.seq > depuis).sort((a, b) => a.seq - b.seq);
        const p = l.slice(0, limite);
        return { changements: p.map(({ seq: _, ...c }) => c), curseur: p.length ? String(p.at(-1)!.seq) : curseur, encore: l.length > limite };
      },
      envoyerFichier: async () => {},
      lireFichier: async () => null,
      supprimerFichier: async () => {},
    };
  }
}

test("deux téléphones : la nuit de la montre voyage ; celui qui n'a que le téléphone ne l'écrase jamais ; même score des deux côtés", async () => {
  await pret();
  assert.equal(tableSync("recup_nuit")!.garderLocale, garderNuitMieuxMesuree);
  assert.deepEqual(tableSync("recup_nuit")!.sensibles, ["rmssd", "fc_repos", "sommeil_min", "milieu_min", "besoin_min"]);
  const cle = aleatoire(32);
  const serveur = new FauxServeur();
  const A = await semer();
  const B = await baseDeTest();
  const sync = (t: { db: typeof A.db }, noeud: string) => synchroniser({ db: t.db, transport: serveur.transport(), cle, noeud });
  await ecrireNuitsRecup(A.db, jour(-49), jour(0), { maintenant: MAINTENANT });
  await sync(A, "A");
  const surServeur = serveur.lignes.get("recup_nuit/2026-10-30")!;
  assert.ok(surServeur && !surServeur.supprime);
  assert.equal(/"rmssd":62/.test(surServeur.charge ?? ""), false, "la VFC voyage chiffrée");
  await sync(B, "B");
  // B : le téléphone seul cette nuit (rang 1) ; il garde la nuit de A
  const tel: SommeilNuit[] = [{ debut: a(23, 50, -1), fin: a(6, 50), minutes: 400, phases: null, origine: null }];
  await ecrireNuitsRecup(B.db, jour(0), jour(0), { nuitsSante: async () => tel, maintenant: MAINTENANT + MIN });
  await sync(B, "B");
  const lB = B.raw.prepare("SELECT rmssd, rang FROM recup_nuit WHERE jour = '2026-10-30'").get() as Record<string, unknown>;
  assert.deepEqual([lB.rmssd, lB.rang], [62, 8]);
  assert.equal((await lireRecupJour(B.db, jour(0))).score, (await lireRecupJour(A.db, jour(0))).score);
});

test("la qualité des sources de la dette : 1 pour la montre, ½ pour le téléphone, pondérée comme la précision", async () => {
  const { calculerDette } = await import("../src/ecrans/recup-pepfit.ts");
  const n = (source: "montre" | "telephone") => ({ sommeil: 420, siestes: 0, source });
  // à l'arrondi de la précision près (un entier en %)
  const proche = (x: number | null, y: number) => assert.ok(x != null && Math.abs(x - y) < 0.02, `${x} ≈ ${y}`);
  proche(qualiteSources(calculerDette([n("montre"), n("montre"), null], 450)), 1);
  proche(qualiteSources(calculerDette([n("telephone"), null, n("telephone")], 450)), 0.5);
  assert.equal(qualiteSources(calculerDette([null, null], 450)), null);
});
