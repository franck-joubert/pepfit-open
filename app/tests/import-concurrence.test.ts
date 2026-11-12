// Réimport Hevy en échec « FOREIGN KEY constraint failed » (Fold, 30/10) : premier import partiel, compte créé, séances Whoop,
// exercice à vérifier confirmé et exercice fusionné, puis réimport complet pendant que la synchro du compte tourne (elle
// repart au retour du sélecteur de fichiers). Données inventées.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fusionnerExercices } from "../src/db/depots/doublons.ts";
import { modifierExercice } from "../src/db/depots/exercices.ts";
import type { Executeur } from "../src/db/executeur.ts";
import { ErreurImport } from "../src/import/hevy-csv.ts";
import { importerHevyTexte } from "../src/import/importer.ts";
import { aleatoire, pret } from "../src/sync/chiffrement.ts";
import { synchroniser, type Changement, type Transport } from "../src/sync/moteur.ts";
import { enregistrerSeances } from "../src/whoop/depot.ts";
import type { SeanceConvertie } from "../src/whoop/types.ts";
import { baseDeTest, facade, jour } from "./aide.ts";

const EN_TETE = '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"';
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const date = (m: number, j: number, h: number) => `${j} ${MOIS[m - 1]} 2026, ${String(h).padStart(2, "0")}:00`;

/** Une séance de l'export : un exercice du catalogue et des exercices maison (poids et réps : à vérifier). */
function seance(m: number, j: number, exercices: string[], note = ""): string[] {
  return exercices.flatMap((ex, i) =>
    [0, 1].map((k) => `"Séance ${j}/${m}","${date(m, j, 18)}","${date(m, j, 19)}","","${ex}","","${i === 0 && k === 0 ? note : ""}","${k}","normal","${40 + k * 5}","10","","",""`),
  );
}
const MARS = [
  ...seance(3, 3, ["Développé Couché (Barre)", "Tirage Maison", "Rameur Maison"], "Bonne séance"),
  ...seance(3, 10, ["Développé Couché (Barre)", "Tirage Maison"]),
];
const APRES = [
  ...seance(4, 7, ["Développé Couché (Barre)", "Rameur Maison", "Presse Maison"]),
  ...seance(10, 20, ["Développé Couché (Barre)", "Presse Maison", "Tirage Maison"], "Note du jour"),
];
const csv = (lignes: string[]) => [EN_TETE, ...lignes].join("\n");

const whoop = (id: string, d: number, f: number): SeanceConvertie => ({
  id, debut: d, fin: f, sportId: 45, sport: "Weightlifting msk", strain: 12, kj: 2500, fcMoy: 130, fcMax: 170, distanceM: null, zones: [0, 5, 20, 30, 10, 0],
});

/** Serveur de synchro en mémoire ; `pousser` attend `reseau` (la réponse du serveur arrive pendant l'import). */
function serveur(reseau: () => Promise<void> = async () => {}): Transport & { lignes: Map<string, Changement> } {
  const lignes = new Map<string, Changement>();
  return {
    lignes,
    pousser: async (lot) => {
      await reseau();
      for (const c of lot) lignes.set(`${c.tab}/${c.cle}`, c);
    },
    tirer: async (curseur) => ({ changements: [], curseur, encore: false }),
    envoyerFichier: async () => {},
    lireFichier: async () => null,
    supprimerFichier: async () => {},
  };
}

/** Exécuteur qui signale la première série écrite. */
function espion(db: Executeur, signal: () => void): Executeur {
  return {
    ...db,
    runAsync: (sql, p) => {
      if (sql.includes("INSERT INTO series")) signal();
      return db.runAsync(sql, p);
    },
  };
}

async function etatFold() {
  await pret();
  const { raw, brute } = await baseDeTest(true);
  let signal = () => {};
  /** Promesse tenue à la prochaine série écrite. */
  const prochaineSerie = () => new Promise<void>((r) => (signal = r));
  const db = facade(espion(brute, () => signal()));
  const n = (sql: string) => (raw.prepare(`SELECT COUNT(*) AS n FROM ${sql}`).get() as { n: number }).n;

  // Whoop connecté : une séance de muscu le 3 mars (créée seule, l'import la fond) et une le 20 octobre (rangée seule)
  await enregistrerSeances(db, [
    whoop("w-mars", jour(2026, 3, 3, 18, 2), jour(2026, 3, 3, 19, 1)),
    whoop("w-oct", jour(2026, 10, 20, 18, 3), jour(2026, 10, 20, 18, 58)),
  ]);
  assert.equal(n("seances WHERE source_ref LIKE 'whoop:%'"), 2);

  // premier import, ancienne version : mars seulement
  const r1 = await importerHevyTexte(db, csv(MARS));
  assert.equal(r1.seancesImportees, 2);
  assert.deepEqual(r1.exercicesAVerifier.sort(), ["Rameur Maison", "Tirage Maison"]);
  assert.equal(n("seances WHERE source_ref LIKE 'whoop:%'"), 1, "la séance Whoop de mars s'est fondue dans la séance Hevy");

  // compte créé : premier envoi
  let attendreReseau = async () => {};
  const transport = serveur(() => attendreReseau());
  const sync = () => synchroniser({ db, transport, cle: aleatoire(32), noeud: "fold" });
  await sync();

  // l'exercice à vérifier est confirmé, l'autre fusionné dans le catalogue (journal de synchro non vide)
  const id = (nom: string) => (raw.prepare("SELECT id FROM exercices WHERE nom = ?").get(nom) as { id: string }).id;
  await modifierExercice(db, id("Tirage Maison"), { aVerifier: false });
  await fusionnerExercices(db, id("Rameur Maison"), "cat:couche");
  assert.ok(n("sync_journal") > 0);

  return { raw, db, n, transport, sync, prochaineSerie, reseau: (f: () => Promise<void>) => (attendreReseau = f) };
}

test("réimport complet pendant une synchro du compte : rien n'échoue, tout est importé, la synchro attend l'import", async () => {
  const f = await etatFold();
  // retour du sélecteur de fichiers : la synchro part (AppState « active ») et attend le serveur pendant que l'import
  // commence ; la réponse arrive pendant l'écriture des séries
  const serie = f.prochaineSerie();
  let auReseau = () => {};
  const attendServeur = new Promise<void>((r) => (auReseau = r));
  f.reseau(() => {
    auReseau();
    return serie;
  });
  const enCours = f.sync();
  await attendServeur;
  const r = await importerHevyTexte(f.db, csv([...MARS, ...APRES]));
  await enCours;

  assert.equal(r.seancesImportees, 2);
  assert.equal(r.seancesDejaPresentes, 2);
  assert.deepEqual(r.exercicesNonReconnus, ["Presse Maison"]);
  assert.equal(f.n("seances WHERE source_ref LIKE 'hevy:%'"), 4);
  assert.equal(f.n("seances WHERE source_ref LIKE 'whoop:%'"), 0, "la séance Whoop d'octobre s'est fondue aussi");
  assert.equal(f.n("whoop_seance WHERE seance_id IS NULL"), 0);
  assert.equal(f.raw.prepare("PRAGMA foreign_key_check").all().length, 0);
  // les séances importées partent à la prochaine synchro (le journal n'a pas été coupé pendant l'import)
  assert.ok(f.n("sync_journal WHERE tab = 'seances'") >= 2);
  f.reseau(async () => {});
  await f.sync();
  assert.equal([...f.transport.lignes.values()].filter((c) => c.tab === "seances" && !c.supprime).length, 4);
});

test("échec lisible et tout ou rien : l'étape et la table visée, sans donnée ; aucune séance à moitié écrite", async () => {
  const f = await etatFold();
  const avant = f.n("seances");
  // une écriture parasite pendant les séances : un record orphelin (clé étrangère records → exercices)
  f.raw.exec(`CREATE TEMP TRIGGER parasite AFTER INSERT ON series BEGIN
    INSERT INTO records (id, exercice_id, type, valeur, seance_id, atteint_le) VALUES (NEW.id, 'disparu', 'reps', 1, NEW.seance_id, 0);
  END;`);
  await assert.rejects(importerHevyTexte(f.db, csv([...MARS, ...APRES])), (e: Error) => {
    assert.ok(e instanceof ErreurImport);
    assert.match(e.message, /séances/);
    assert.match(e.message, /records → exercices/);
    assert.doesNotMatch(e.message, /Presse|Maison|Note du jour|disparu/);
    return true;
  });
  assert.equal(f.n("seances"), avant);
  assert.equal(f.n("exercices WHERE nom = 'Presse Maison'"), 0);
  f.raw.exec("DROP TRIGGER parasite");

  // étape Whoop en échec : les séances déjà écrites par cet import repartent aussi
  f.raw.exec("CREATE TEMP TRIGGER parasite BEFORE UPDATE ON whoop_seance BEGIN SELECT RAISE(ABORT, 'refus'); END;");
  await assert.rejects(importerHevyTexte(f.db, csv([...MARS, ...APRES])), (e: Error) => {
    assert.ok(e instanceof ErreurImport);
    assert.match(e.message, /Whoop/);
    return true;
  });
  assert.equal(f.n("seances"), avant);
  assert.equal(f.n("seances WHERE source_ref = 'whoop:w-oct'"), 1);
  f.raw.exec("DROP TRIGGER parasite");

  const r = await importerHevyTexte(f.db, csv([...MARS, ...APRES]));
  assert.equal(r.seancesImportees, 2);
  assert.equal(f.raw.prepare("PRAGMA foreign_key_check").all().length, 0);
});
