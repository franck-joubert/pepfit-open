// Le padel programmé du dimanche 08/11 (8:00, 1 h 30) et l'activité Whoop sans nom de 7:52 à 9:29 (retours) :
// 1. l'activité devient une ligne « Activité détectée » (marche écartée selon la FC, activité non notée gardée, journal des écartées) ;
// 2. elle reçoit le sport de la routine programmée (« Padel ? », « Prévu à 8:00 », le lieu prévu) au-dessus de l'habitude ;
// 3. confirmée (ou posée toute seule sur un recoupement net), elle remplace la séance prévue : « faite ».
import assert from "node:assert/strict";
import { test } from "node:test";
import { baseDeTest, jour } from "./aide.ts";
import {
  associerActivite, lireActiviteCatalogue, lireActivites, lirePrevuesDuJour, lireProgrammes, pourquoiProgramme, rafraichirActivites, type SanteActivites,
} from "../src/db/depots/activites.ts";
import { attendreDiagnostics, construireDiagnostic, journalActivites, sortieDiagnostic, viderJournalActivites, FICHIER_DIAGNOSTIC } from "../src/db/depots/diagnostic-activites.ts";
import { creerRoutine } from "../src/db/depots/routines.ts";
import { creerSalle } from "../src/db/depots/salles.ts";
import { ajouterProgrammation, poserLieuPrevu, poserReglagesPrevus } from "../src/db/depots/programmations.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { ecrireFcMaxSaisie, ecrireModeFcMax } from "../src/db/depots/zones-fc.ts";
import { programmeDe, type Prevue } from "../src/ecrans/activite-programmee.ts";
import { phrasePourquoi } from "../src/ecrans/activites-vue.ts";
import { instantDe, jourDe, lirePlanning } from "../src/ecrans/planif-donnees.ts";
import { seancesDesOccurrences } from "../src/ecrans/planification.ts";
import { enregistrerSeances } from "../src/whoop/depot.ts";
import { synchroniserWhoop } from "../src/whoop/synchro.ts";
import type { ApiWhoop } from "../src/whoop/api.ts";
import type { SeanceConvertie } from "../src/whoop/types.ts";

const MIN = 60_000;
const dimanche = jour(2026, 11, 8, 0, 0);
const J = "2026-11-08";
const debutPadel = jour(2026, 11, 8, 7, 52);
const finPadel = jour(2026, 11, 8, 9, 29);
const MAINTENANT = jour(2026, 11, 8, 10, 30);

const padelWhoop = (autre: Partial<SeanceConvertie> = {}): SeanceConvertie => ({
  id: "padel1", debut: debutPadel, fin: finPadel, sportId: -1, sport: "Activity", strain: 9.8, kj: 2100, fcMoy: 130, fcMax: 168, distanceM: null, zones: [3, 20, 38, 28, 8, 0], ...autre,
});
/** Santé Connect : `pas` pas sur la plage lue (null : pas de pas). */
const sante = (pas: number | null): SanteActivites => ({
  seancesSport: async () => null,
  pasIntervalles: async () => (pas == null ? null : [pas]),
  fcEntre: async () => null,
  nuits: async () => null,
});

/** Une base avec un padel programmé le 08/11 à 8:00 pendant 1 h 30 (routine padel), FC max connue. */
async function baseAvecPadelPrevu(o: { muscu?: boolean; lieu?: boolean } = {}) {
  const b = await baseDeTest(true);
  const { db } = b;
  await ecrireModeFcMax(db, "saisie");
  await ecrireFcMaxSaisie(db, 185);
  const rid = o.muscu ? await creerRoutine(db, "Gym Upper", [{ exerciceId: "cat:couche", nbSeries: 4 }]) : await creerRoutine(db, "Padel", [{ exerciceId: "cat:padel", nbSeries: 1 }]);
  const pid = await ajouterProgrammation(db, rid, "le 8 nov.", { freq: "unique", intervalle: 1, jours: [], date: J, heure: "08:00", debut: J });
  await poserReglagesPrevus(db, pid, { sport: o.muscu ? null : "cat:padel", dureeMin: 90, sansHeure: false });
  const salle = o.lieu ? await creerSalle(db, "Casa Padel") : null;
  if (salle) await poserLieuPrevu(db, pid, J, salle);
  return { ...b, rid, pid, salle };
}

// ---- 1. L'activité devient une ligne « Activité détectée » ----------------------------------------------------------------

test("padel 7:52 à 9:29 (≈ 5 000 pas, FC moyenne 130) : une activité détectée à associer, rien d'écarté", async () => {
  viderJournalActivites();
  const { db } = await baseDeTest(true);
  await ecrireModeFcMax(db, "saisie");
  await ecrireFcMaxSaisie(db, 185);
  await enregistrerSeances(db, [padelWhoop()], MAINTENANT);
  assert.deepEqual(await rafraichirActivites(db, dimanche, sante(5000), MAINTENANT), { ajoutees: 1, posees: 0 });
  const [a] = await lireActivites(db, dimanche, dimanche + 24 * 60 * MIN);
  assert.equal(a!.cle, "whoop:padel1");
  assert.equal(a!.etat, "a-associer");
  assert.equal(a!.debut, debutPadel);
  assert.equal(a!.fin, finPadel);
  assert.deepEqual(journalActivites().filter((x) => x.cle === "whoop:padel1"), []);
});

test("padel sans zones Whoop, ≈ 67 pas/min et FC 130 : la FC dit un sport, plus une marche (avant : écarté) ; FC basse : toujours une marche, avec sa raison", async () => {
  for (const [fcMoy, attendu] of [[130, true], [88, false]] as const) {
    viderJournalActivites();
    const { db } = await baseDeTest(true);
    await ecrireModeFcMax(db, "saisie");
    await ecrireFcMaxSaisie(db, 185);
    await enregistrerSeances(db, [padelWhoop({ zones: null, strain: null, kj: null, fcMoy })], MAINTENANT);
    const r = await rafraichirActivites(db, dimanche, sante(6500), MAINTENANT);
    assert.equal(r.ajoutees, attendu ? 1 : 0, `FC ${fcMoy}`);
    if (!attendu) {
      const [e] = journalActivites().filter((x) => x.cle === "whoop:padel1");
      assert.equal(e?.raison, "marche");
      assert.equal(e?.detail, "67 pas/min");
    }
  }
});

test("séance voisine : rattachée à la synchro, ou posée après (Hevy importé) qui la couvre : l'activité est écartée, avec la raison au journal", async () => {
  viderJournalActivites();
  const { db, raw } = await baseDeTest(true);
  const seance = () => raw.prepare("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES ('s1', 'Gym', ?, ?, 0)").run(debutPadel - 20 * MIN, debutPadel + 5 * MIN);
  // séance déjà là à la synchro : l'activité Whoop lui est rattachée
  seance();
  await enregistrerSeances(db, [padelWhoop()], MAINTENANT);
  assert.equal((await rafraichirActivites(db, dimanche, sante(5000), MAINTENANT)).ajoutees, 0);
  assert.equal(journalActivites().find((x) => x.cle === "whoop:padel1")?.raison, "rattachee");
  // séance arrivée après la synchro (rien de rattaché) : elle couvre l'activité
  viderJournalActivites();
  const autre = await baseDeTest(true);
  await enregistrerSeances(autre.db, [padelWhoop()], MAINTENANT);
  autre.raw.prepare("INSERT INTO seances (id, titre, debut, fin, maj_le) VALUES ('s1', 'Gym', ?, ?, 0)").run(debutPadel - 20 * MIN, debutPadel + 5 * MIN);
  assert.equal((await rafraichirActivites(autre.db, dimanche, sante(5000), MAINTENANT)).ajoutees, 0);
  assert.equal(journalActivites().find((x) => x.cle === "whoop:padel1")?.raison, "seance-couvrante");
});

/** API Whoop simulée : seule la collection « workout » donne quelque chose. */
const apiAvecActivites = (records: unknown[]): ApiWhoop => ({
  page: async (c) => ({ records: (c === "workout" ? records : []) as never[], next_token: null }),
  corps: async () => ({}),
  revoquer: async () => {},
});
const brute = (id: string, score_state: string, sport_id: number | null, sport_name: string) => ({
  id, start: new Date(debutPadel).toISOString(), end: new Date(finPadel).toISOString(), sport_name, sport_id, score_state,
  ...(score_state === "SCORED" ? { score: { strain: 9.8, average_heart_rate: 130, max_heart_rate: 168, kilojoule: 2100 } } : {}),
});

test("synchro Whoop : le padel 7:52 à 9:29 sans nom, pas encore noté (PENDING_SCORE ou UNSCORABLE), devient une activité détectée ; noté ensuite, ses mesures arrivent", async () => {
  for (const etat of ["PENDING_SCORE", "UNSCORABLE"]) {
    viderJournalActivites();
    const { db } = await baseDeTest(true);
    await ecrireReglage(db, "whoop_connecte", "1");
    await synchroniserWhoop(db, apiAvecActivites([brute("padel1", etat, -1, "activity")]), MAINTENANT);
    const ligne = await db.getFirstAsync<{ debut: number; fin: number; kj: number | null }>("SELECT debut, fin, kj FROM whoop_seance WHERE id = 'padel1'", []);
    assert.deepEqual({ ...ligne }, { debut: debutPadel, fin: finPadel, kj: null }, etat);
    assert.equal((await rafraichirActivites(db, dimanche, sante(5000), MAINTENANT)).ajoutees, 1, etat);
    // Whoop la note à la synchro suivante : la même ligne reçoit ses mesures, l'activité ne change pas
    await synchroniserWhoop(db, apiAvecActivites([brute("padel1", "SCORED", -1, "activity")]), MAINTENANT + 10 * MIN);
    const notee = await db.getFirstAsync<{ kj: number | null; n: number }>("SELECT kj, (SELECT COUNT(*) FROM whoop_seance) AS n FROM whoop_seance WHERE id = 'padel1'", []);
    assert.deepEqual({ ...notee }, { kj: 2100, n: 1 }, etat);
    assert.equal((await rafraichirActivites(db, dimanche, sante(5000), MAINTENANT)).ajoutees, 0, etat);
  }
});

test("synchro Whoop : une activité nommée non notée reste écartée, notée au journal « pas encore notée »", async () => {
  viderJournalActivites();
  const { db } = await baseDeTest(true);
  await synchroniserWhoop(db, apiAvecActivites([brute("c1", "PENDING_SCORE", 0, "running")]), MAINTENANT);
  assert.equal((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM whoop_seance", []))!.n, 0);
  const e = journalActivites().find((x) => x.cle === "whoop:c1");
  assert.equal(e?.raison, "non-notee");
  assert.match(e?.detail ?? "", /PENDING_SCORE/);
});

// ---- 2. Le programme : séance prévue que l'activité recoupe -----------------------------------------------------------------

const prevue = (autre: Partial<Prevue> = {}): Prevue => ({
  programmationId: "p1", origine: J, heure: "08:00", debut: jour(2026, 11, 8, 8, 0), dureeMin: 90, sport: "cat:padel", lieu: null, ...autre,
});

test("programmeDe : début à ±45 min ou chevauchement d'au moins la moitié ; net sans équivoque ; rien pour la muscu ni pour une autre heure", () => {
  // 7:52 à 9:29 pour un padel prévu à 8:00 : net
  const p = programmeDe({ debut: debutPadel, fin: finPadel }, [prevue()]);
  assert.equal(p?.prevue.sport, "cat:padel");
  assert.equal(p?.net, true);
  assert.equal(p?.ecartMs, -8 * MIN);
  // commencée à 8:40 : recoupe, mais pas net (40 min de décalage)… sauf si les trois quarts se superposent
  const tard = programmeDe({ debut: jour(2026, 11, 8, 8, 40), fin: jour(2026, 11, 8, 9, 50) }, [prevue()]);
  assert.ok(tard);
  assert.equal(tard.net, false);
  // commencée à 10:00 (2 h après), fin 11:00 : rien en commun
  assert.equal(programmeDe({ debut: jour(2026, 11, 8, 10, 0), fin: jour(2026, 11, 8, 11, 0) }, [prevue()]), null);
  // une routine de muscu, ou sans sport : l'activité reste à associer
  assert.equal(programmeDe({ debut: debutPadel, fin: finPadel }, [prevue({ sport: "cat:musculation" })]), null);
  assert.equal(programmeDe({ debut: debutPadel, fin: finPadel }, [prevue({ sport: null })]), null);
  // deux séances prévues de sports différents : la plus proche gagne, mais le recoupement n'est plus net
  const deux = programmeDe({ debut: debutPadel, fin: finPadel }, [prevue(), prevue({ programmationId: "p2", heure: "08:30", debut: jour(2026, 11, 8, 8, 30), sport: "cat:tennis" })]);
  assert.equal(deux?.prevue.programmationId, "p1");
  assert.equal(deux?.net, false);
});

test("suggestion : « Padel ? » prévu à 8:00, avec le lieu prévu, d'après la séance programmée (programmation_lieux)", async () => {
  const { db, salle } = await baseAvecPadelPrevu({ lieu: true });
  await enregistrerSeances(db, [padelWhoop()], MAINTENANT);
  await ecrireReglage(db, "reco_auto", "0");
  await rafraichirActivites(db, dimanche, sante(5000), MAINTENANT);
  const [a] = await lireActivites(db, dimanche, dimanche + 24 * 60 * MIN);
  const prevues = await lirePrevuesDuJour(db, J, MAINTENANT);
  assert.equal(prevues.length, 1);
  assert.equal(prevues[0]!.sport, "cat:padel");
  assert.equal(prevues[0]!.lieu?.id, salle);
  const programmes = await lireProgrammes(db, [a!], MAINTENANT);
  const prog = programmes.get("whoop:padel1");
  assert.equal(prog?.prevue.sport, "cat:padel");
  assert.equal(prog?.prevue.heure, "08:00");
  const phrase = phrasePourquoi(pourquoiProgramme(prog!.prevue), { lieu: "Casa Padel" });
  assert.match(phrase, /^Prévu à 8[:h]00, Casa Padel$/);
  assert.equal(phrasePourquoi(pourquoiProgramme(prevue())), "Prévu à 8:00");
});

test("muscu programmée : pas de sport proposé, l'activité reste à associer", async () => {
  const { db } = await baseAvecPadelPrevu({ muscu: true });
  await enregistrerSeances(db, [padelWhoop()], MAINTENANT);
  assert.deepEqual(await rafraichirActivites(db, dimanche, sante(5000), MAINTENANT), { ajoutees: 1, posees: 0 });
  const [a] = await lireActivites(db, dimanche, dimanche + 24 * 60 * MIN);
  assert.equal((await lireProgrammes(db, [a!], MAINTENANT)).size, 0);
  assert.equal(a!.etat, "a-associer");
});

// ---- 3. La confirmation remplace la séance prévue ---------------------------------------------------------------------------

/** La séance prévue du 08/11 est-elle « faite » (une séance terminée du même sport sur son créneau) ? */
async function occurrenceFaite(db: Awaited<ReturnType<typeof baseDeTest>>["db"]): Promise<boolean> {
  const p = await lirePlanning(db, J, J, MAINTENANT);
  const o = p.occ.find((x) => x.date === J);
  assert.ok(o, "l'occurrence du 08/11 existe");
  return seancesDesOccurrences(p.occ, p.jours).has(o);
}

test("confirmer « Padel » prévu à 8:00 : la séance prend le lieu prévu et la séance programmée passe en « faite »", async () => {
  const { db, raw, salle } = await baseAvecPadelPrevu({ lieu: true });
  await enregistrerSeances(db, [padelWhoop()], MAINTENANT);
  await ecrireReglage(db, "reco_auto", "0");
  await rafraichirActivites(db, dimanche, sante(5000), MAINTENANT);
  assert.equal(await occurrenceFaite(db), false);
  const [a] = await lireActivites(db, dimanche, dimanche + 24 * 60 * MIN);
  const prog = (await lireProgrammes(db, [a!], MAINTENANT)).get(a!.cle)!;
  const padel = (await lireActiviteCatalogue(db, prog.prevue.sport!))!;
  const id = await associerActivite(db, a!, padel, { reconnu: pourquoiProgramme(prog.prevue), programme: prog.prevue, profil: { fcRepos: 55, fcMax: 185 }, maintenant: MAINTENANT });
  assert.equal((raw.prepare("SELECT salle_id FROM seances WHERE id = ?").get(id) as { salle_id: string | null }).salle_id, salle);
  assert.equal(await occurrenceFaite(db), true);
  // la séance prévue n'est plus proposée à une autre activité
  assert.deepEqual(await lirePrevuesDuJour(db, J, MAINTENANT), []);
  assert.equal((await lireActivites(db, dimanche, dimanche + 24 * 60 * MIN))[0]!.etat, "associee");
});

test("réglage « Le poser tout seul » : un recoupement net remplace la séance prévue sans rien demander ; coupé, l'activité reste à confirmer", async () => {
  for (const auto of [true, false]) {
    const { db, raw } = await baseAvecPadelPrevu({ lieu: true });
    if (!auto) await ecrireReglage(db, "reco_auto", "0");
    await enregistrerSeances(db, [padelWhoop()], MAINTENANT);
    const r = await rafraichirActivites(db, dimanche, sante(5000), MAINTENANT);
    assert.deepEqual(r, { ajoutees: 1, posees: auto ? 1 : 0 });
    assert.equal(await occurrenceFaite(db), auto);
    if (auto) {
      const s = raw.prepare("SELECT titre, reconnu FROM seances WHERE source_ref = 'whoop:padel1'").get() as { titre: string; reconnu: string };
      assert.equal(s.titre, "Padel");
      assert.equal(JSON.parse(s.reconnu).pourquoi.prevuA, "08:00");
    }
  }
});

test("recoupement douteux (commencée à 8:40) : proposée, jamais posée toute seule", async () => {
  const { db } = await baseAvecPadelPrevu();
  await enregistrerSeances(db, [padelWhoop({ debut: jour(2026, 11, 8, 8, 40), fin: jour(2026, 11, 8, 10, 10) })], MAINTENANT);
  const r = await rafraichirActivites(db, dimanche, sante(5000), MAINTENANT);
  assert.equal(r.posees, 0);
  assert.equal(await occurrenceFaite(db), false);
});

// ---- 4. Le fichier de diagnostic ----------------------------------------------------------------------------------------------

test("diagnostic-activites.json : écrit à chaque relecture, les 3 derniers jours, sans secret ni titre", async () => {
  viderJournalActivites();
  const { db } = await baseAvecPadelPrevu();
  await ecrireReglage(db, "whoop_connecte", "1");
  await ecrireReglage(db, "reco_auto", "0");
  await enregistrerSeances(db, [padelWhoop(), padelWhoop({ id: "vieux", debut: jour(2026, 11, 1, 7, 0), fin: jour(2026, 11, 1, 8, 0) })], MAINTENANT);
  const ecrits: { nom: string; contenu: string }[] = [];
  const avant = sortieDiagnostic.ecrire;
  sortieDiagnostic.ecrire = async (nom, contenu) => (ecrits.push({ nom, contenu }), true);
  try {
    await rafraichirActivites(db, dimanche, sante(5000), MAINTENANT);
    await attendreDiagnostics();
  } finally {
    sortieDiagnostic.ecrire = avant;
  }
  assert.equal(ecrits.length, 1);
  assert.equal(ecrits[0]!.nom, FICHIER_DIAGNOSTIC);
  const d = JSON.parse(ecrits[0]!.contenu);
  assert.equal(d.version, 1);
  assert.equal(d.motif, "relecture-jour");
  assert.deepEqual(d.whoop_seance.map((x: { id: string }) => x.id), ["padel1"]);
  assert.equal(d.whoop_seance[0].debut, debutPadel);
  assert.equal(d.activite_detectee.length, 1);
  assert.equal(d.activite_detectee[0].etat, "a-associer");
  assert.deepEqual(d.occurrences.map((o: { date: string; heure: string; sport: string; faite: boolean }) => [o.date, o.heure, o.sport, o.faite]), [[J, "08:00", "cat:padel", false]]);
  assert.equal(d.whoop.connecte, true);
  assert.ok(!/token|secret|mdp|password/i.test(ecrits[0]!.contenu));
  assert.ok(!/Padel"/.test(JSON.stringify(d.seances_pepfit)));
});

test("diagnostic : le journal des écartées, la dernière synchro et le curseur passent dans le fichier ; une écriture qui échoue ne gêne rien", async () => {
  viderJournalActivites();
  const { db } = await baseDeTest(true);
  await ecrireReglage(db, "whoop_connecte", "1");
  await synchroniserWhoop(db, apiAvecActivites([brute("c1", "PENDING_SCORE", 0, "running"), brute("padel1", "PENDING_SCORE", -1, "activity")]), MAINTENANT);
  const d = await construireDiagnostic(db, { motif: "synchro-whoop", maintenant: MAINTENANT });
  assert.equal(d.journal.find((x) => x.cle === "whoop:c1")?.raison, "non-notee");
  assert.ok(d.whoop.derniere_synchro != null);
  assert.ok(d.whoop.curseur_workout != null);
  assert.equal(d.sante_sport, null);
  assert.equal(d.decalage_min, -new Date(MAINTENANT).getTimezoneOffset());
  // un fichier qui ne s'écrit pas (ancien APK, dossier plein) : la relecture continue
  const avant = sortieDiagnostic.ecrire;
  sortieDiagnostic.ecrire = async () => {
    throw new Error("disque plein");
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(await rafraichirActivites(db, dimanche, sante(null), MAINTENANT), { ajoutees: 1, posees: 0 });
    await attendreDiagnostics();
  } finally {
    sortieDiagnostic.ecrire = avant;
    console.warn = warn;
  }
});

test("textes : « Prévu à » et les raisons du journal, en fr et en en", async () => {
  const { fr } = await import("../src/i18n/fr.ts");
  const { en } = await import("../src/i18n/en.ts");
  for (const k of ["activite.prevuA", "activite.prevuALieu", "whoop.diag.ligne", "whoop.diag.marche", "whoop.diag.non-notee", "whoop.diag.seance-couvrante"] as const) {
    assert.ok(fr[k] && en[k], k);
    assert.doesNotMatch(fr[k] + en[k], /·/);
  }
  assert.equal(fr["activite.prevuA"], "Prévu à {heure}");
  assert.equal(jourDe(instantDe(J, "08:00")), J);
});
