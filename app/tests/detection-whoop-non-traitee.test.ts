// Le padel du lundi 09/11 (programmé à 10:30, 1 h 30) que Whoop a détecté sans que Alex l'ait encore « traité » : pour l'API
// officielle de Whoop, ce n'est pas un workout ; pepfit ne voyait rien (la détection par la FC ne tournait que Whoop déconnecté).
// 1. la cause (le même jour, la même FC : Whoop connecté, rien ; déconnecté, une activité) ;
// 2. la FC de la montre (Santé Connect) détecte l'effort même Whoop connecté, et il rejoint le padel programmé ;
// 3. Alex traite l'activité chez Whoop : une seule séance.
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest, jour } from "./aide.ts";
import { lireActivites, rafraichirActivites, type SanteActivites } from "../src/db/depots/activites.ts";
import { attendreDiagnostics, construireDiagnostic, sortieDiagnostic, sourcesDetection, viderJournalActivites, viderSourcesDetection } from "../src/db/depots/diagnostic-activites.ts";
import { creerRoutine } from "../src/db/depots/routines.ts";
import { ajouterProgrammation, poserReglagesPrevus } from "../src/db/depots/programmations.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { ecrireFcMaxSaisie, ecrireModeFcMax } from "../src/db/depots/zones-fc.ts";
import { lirePlanning } from "../src/ecrans/planif-donnees.ts";
import { seancesDesOccurrences } from "../src/ecrans/planification.ts";
import { enregistrerSeances } from "../src/whoop/depot.ts";
import type { SeanceConvertie } from "../src/whoop/types.ts";

const MIN = 60_000;
const lundi = jour(2026, 11, 9, 0, 0);
const J = "2026-11-09";
const debutEffort = jour(2026, 11, 9, 10, 28);
const finEffort = jour(2026, 11, 9, 12, 0);
const MAINTENANT = jour(2026, 11, 9, 12, 9);
type Base = Awaited<ReturnType<typeof baseDeTest>>;

/** FC d'un effort de padel : 142 bpm toutes les 30 s (la montre mesure souvent ; parfois toutes les 6 s). */
const fcEffort = (debut = debutEffort, fin = finEffort, pas = 30_000) => {
  const l: { t: number; bpm: number }[] = [];
  for (let t = debut; t <= fin; t += pas) l.push({ t, bpm: 142 });
  return l;
};
const sante = (fc: { t: number; bpm: number }[] | null = null): SanteActivites => ({
  seancesSport: async () => null, pasIntervalles: async () => null, fcEntre: async () => fc, nuits: async () => null,
});

/** Whoop connecté ; padel programmé le 09/11 à 10:30 (1 h 30) ; FC max connue. */
async function baseAvecPadelPrevu(o: { whoop?: boolean } = {}): Promise<Base> {
  const b = await baseDeTest(true);
  await ecrireModeFcMax(b.db, "saisie");
  await ecrireFcMaxSaisie(b.db, 185);
  if (o.whoop !== false) await ecrireReglage(b.db, "whoop_connecte", "1");
  const rid = await creerRoutine(b.db, "Padel", [{ exerciceId: "cat:padel", nbSeries: 1 }]);
  const pid = await ajouterProgrammation(b.db, rid, "le 9 nov.", { freq: "unique", intervalle: 1, jours: [], date: J, heure: "10:30", debut: J });
  await poserReglagesPrevus(b.db, pid, { sport: "cat:padel", dureeMin: 90, sansHeure: false });
  return b;
}

/** L'occurrence de 10:30 est-elle « faite » ? */
async function padelFait(db: Base["db"]): Promise<boolean> {
  const p = await lirePlanning(db, J, J, MAINTENANT);
  const o = p.occ.find((x) => x.date === J && x.heure === "10:30");
  assert.ok(o, "le padel de 10:30 est programmé");
  return seancesDesOccurrences(p.occ, p.jours).has(o);
}

const compte = async (db: Base["db"], table: string) => (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`, []))!.n;

// ---- 1. La cause ----------------------------------------------------------------------------------------------------------------

test("cause : sans workout Whoop, la FC ne servait qu'avec Whoop déconnecté ; Whoop connecté, l'activité détectée non traitée restait invisible", async () => {
  // le même jour, la même FC de la montre : déconnecté, l'effort est trouvé ; connecté, avant ce correctif, rien (0). Le correctif lit la FC aussi connecté.
  const deconnecte = await baseAvecPadelPrevu({ whoop: false });
  assert.deepEqual(await rafraichirActivites(deconnecte.db, lundi, sante(fcEffort()), MAINTENANT), { ajoutees: 1, posees: 1 });
  const connecte = await baseAvecPadelPrevu();
  assert.deepEqual(await rafraichirActivites(connecte.db, lundi, sante(fcEffort()), MAINTENANT), { ajoutees: 1, posees: 1 });
  // et sans aucune FC (Whoop n'écrit pas de FC continue dans Santé Connect) : toujours rien, mais le diagnostic le dit
  viderSourcesDetection();
  const vide = await baseAvecPadelPrevu();
  assert.deepEqual(await rafraichirActivites(vide.db, lundi, sante(null), MAINTENANT), { ajoutees: 0, posees: 0 });
  const [s] = sourcesDetection();
  assert.equal(s?.fc_sante, null);
});

// ---- 2. Source 2 : la FC, Whoop connecté --------------------------------------------------------------------------------------------

test("cas exact : padel 10:30, Whoop connecté, détection non traitée, FC de la montre toutes les 6 s : l'activité est posée sur le padel programmé", async () => {
  viderSourcesDetection();
  const { db, raw } = await baseAvecPadelPrevu();
  assert.equal(await compte(db, "whoop_seance"), 0);
  const r = await rafraichirActivites(db, lundi, sante(fcEffort(debutEffort, finEffort, 6000)), MAINTENANT);
  assert.deepEqual(r, { ajoutees: 1, posees: 1 });
  const [a] = await lireActivites(db, lundi, lundi + 1440 * MIN);
  assert.equal(a!.cle, `pepfit:${debutEffort}`);
  assert.equal(a!.etat, "associee");
  assert.equal(await padelFait(db), true);
  const s = raw.prepare("SELECT titre, debut, fin FROM seances WHERE id = ?").get(a!.seanceId) as { titre: string; debut: number; fin: number };
  assert.equal(s.titre, "Padel");
  assert.equal(s.debut, debutEffort);
  // la FC lue est gardée avec la séance
  assert.ok((raw.prepare("SELECT COUNT(*) AS n FROM seance_fc WHERE seance_id = ?").get(a!.seanceId) as { n: number }).n > 500);
  const [t] = sourcesDetection();
  assert.equal(t?.fc_sante, fcEffort(debutEffort, finEffort, 6000).length);
  assert.equal(t?.efforts_pepfit.length, 1);
  assert.equal(t?.activites.pepfit, 1);
});

test("un effort qui court encore n'est pas posé : la séance serait coupée ; fini, il l'est", async () => {
  const { db } = await baseAvecPadelPrevu();
  const enCours = jour(2026, 11, 9, 11, 15);
  const fc = fcEffort(debutEffort, enCours);
  assert.deepEqual(await rafraichirActivites(db, lundi, sante(fc), enCours + 30_000), { ajoutees: 0, posees: 0 });
  assert.equal(sourcesDetection().find((s) => s.jour === lundi)?.efforts_pepfit[0]?.en_cours, true);
  assert.deepEqual(await rafraichirActivites(db, lundi, sante(fcEffort()), MAINTENANT), { ajoutees: 1, posees: 1 });
});

test("une activité Whoop nommée (Football, non gardée comme séance) sur la même plage : la FC n'en fait pas une seconde activité", async () => {
  const { db } = await baseAvecPadelPrevu();
  const w: SeanceConvertie = { id: "foot", debut: debutEffort, fin: finEffort, sportId: 0, sport: "Running", strain: 12, kj: 1500, fcMoy: 142, fcMax: 170, distanceM: null, zones: [3, 20, 38, 28, 8, 0] };
  await enregistrerSeances(db, [w], MAINTENANT);
  await db.runAsync("DELETE FROM seances", []);
  const r = await rafraichirActivites(db, lundi, sante(fcEffort()), MAINTENANT);
  assert.equal(r.ajoutees, 0, "l'activité nommée de Whoop ne se double pas");
});

// ---- 3. Alex traite l'activité dans Whoop -------------------------------------------------------------------------------------

const traitee = (autre: Partial<SeanceConvertie> = {}): SeanceConvertie => ({
  id: "w-padel", debut: debutEffort + 2 * MIN, fin: finEffort + 3 * MIN, sportId: 106, sport: "Padel", strain: 10.4, kj: 2200, fcMoy: 141, fcMax: 171, distanceM: null, zones: [3, 20, 38, 28, 8, 0], ...autre,
});

test("détectée par la FC puis traitée dans Whoop : Whoop l'enrichit, une seule séance, les heures détectées sont gardées, rien à proposer", async () => {
  const { db, raw } = await baseAvecPadelPrevu();
  await rafraichirActivites(db, lundi, sante(fcEffort(debutEffort, finEffort, 6000)), MAINTENANT);
  const [avant] = await lireActivites(db, lundi, lundi + 1440 * MIN);
  const seanceId = avant!.seanceId!;
  const bilan = await enregistrerSeances(db, [traitee()], MAINTENANT + 20 * MIN);
  assert.deepEqual(bilan, { enrichies: 1, creees: 0, ignorees: 0 });
  assert.equal(await compte(db, "seances"), 1);
  assert.equal((raw.prepare("SELECT seance_id FROM whoop_seance WHERE id = 'w-padel'").get() as { seance_id: string }).seance_id, seanceId);
  const s = raw.prepare("SELECT debut, fin FROM seances WHERE id = ?").get(seanceId) as { debut: number; fin: number };
  assert.deepEqual({ ...s }, { debut: debutEffort, fin: finEffort });
  // la relecture suivante : Whoop a rattaché son activité, la ligne reste associée, aucune ligne à associer, aucun doublon
  assert.deepEqual(await rafraichirActivites(db, lundi, sante(fcEffort(debutEffort, finEffort, 6000)), MAINTENANT + 25 * MIN), { ajoutees: 0, posees: 0 });
  assert.equal(await compte(db, "seances"), 1);
  assert.deepEqual((await lireActivites(db, lundi, lundi + 1440 * MIN)).map((x) => [x.etat, x.seanceId]), [["associee", seanceId]]);
  assert.equal(await padelFait(db), true);
  // traitée « sans sport » (activité de Whoop) : même séance
  const autre = await baseAvecPadelPrevu();
  await rafraichirActivites(autre.db, lundi, sante(fcEffort(debutEffort, finEffort, 6000)), MAINTENANT);
  await enregistrerSeances(autre.db, [traitee({ sportId: -1, sport: "Activity" })], MAINTENANT + 20 * MIN);
  assert.equal(await compte(autre.db, "seances"), 1);
});

test("détection non programmée : proposée « à associer » (pas posée) ; Whoop la livre ensuite, la ligne devient celle de Whoop, sans doublon", async () => {
  const b = await baseDeTest(true);
  await ecrireModeFcMax(b.db, "saisie");
  await ecrireFcMaxSaisie(b.db, 185);
  await ecrireReglage(b.db, "whoop_connecte", "1");
  const r = await rafraichirActivites(b.db, lundi, sante(fcEffort(debutEffort, finEffort, 6000)), MAINTENANT);
  assert.deepEqual(r, { ajoutees: 1, posees: 0 });
  assert.deepEqual((await lireActivites(b.db, lundi, lundi + 1440 * MIN)).map((x) => [x.cle.split(":")[0], x.etat]), [["pepfit", "a-associer"]]);
  // Whoop la livre non classée (sport -1) : la ligne de Whoop prend la place de celle de la FC
  await enregistrerSeances(b.db, [traitee({ sportId: -1, sport: "Activity" })], MAINTENANT + 20 * MIN);
  await rafraichirActivites(b.db, lundi, sante(fcEffort(debutEffort, finEffort, 6000)), MAINTENANT + 25 * MIN);
  assert.deepEqual((await lireActivites(b.db, lundi, lundi + 1440 * MIN)).map((x) => [x.cle, x.etat]), [["whoop:w-padel", "a-associer"]]);
});

// ---- 4. Le diagnostic -------------------------------------------------------------------------------------------------------------

test("diagnostic-activites.json : sources interrogées et résultat (FC lue, efforts), sans jeton ni valeur de santé", async () => {
  viderJournalActivites();
  viderSourcesDetection();
  const { db } = await baseAvecPadelPrevu();
  const ecrits: string[] = [];
  const avant = sortieDiagnostic.ecrire;
  sortieDiagnostic.ecrire = async (_n, contenu) => (ecrits.push(contenu), true);
  try {
    await rafraichirActivites(db, lundi, sante(fcEffort(debutEffort, finEffort, 6000)), MAINTENANT);
    await attendreDiagnostics();
  } finally {
    sortieDiagnostic.ecrire = avant;
  }
  const d = JSON.parse(ecrits[0]!);
  const [s] = d.sources_detection;
  assert.equal(s.jour, lundi);
  assert.equal(s.whoop_connecte, true);
  assert.equal(s.fc_sante, fcEffort(debutEffort, finEffort, 6000).length);
  assert.equal(s.efforts_pepfit.length, 1);
  assert.ok(!/token|secret|bearer|password/i.test(ecrits[0]!));
  assert.equal((await construireDiagnostic(db, { motif: "x", maintenant: MAINTENANT })).sources_detection.length, 1);
});
