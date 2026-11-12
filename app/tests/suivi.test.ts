// Blessures et compléments (plus de médicaments depuis le 30/10, effacés par la migration 48 le 31/10) : migration 25, dépôt, synchro chiffrée, calculs des écrans (planche sante-suivi).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MOI, ajouterAuJournal, changerStatut, corrigerDateStatut, creerBlessure, creerTraitement, lireBlessure, lireTraitement, listerBlessures,
  listerTraitements, modifierBlessure, modifierTraitement, noterPrise, prisesEntre, purgerBlessure, purgerTraitement, restaurerBlessure,
  retirerPrise, supprimerBlessure, supprimerStatut, supprimerTraitement,
} from "../src/db/depots/suivi.ts";
import { migrer, VERSION_COURANTE } from "../src/db/migrations.ts";
import { aleatoire, pret } from "../src/sync/chiffrement.ts";
import { synchroniser, type Changement, type Lot, type Transport } from "../src/sync/moteur.ts";
import { exporterJson } from "../src/sync/export.ts";
import { TABLES_SYNC, tableSync } from "../src/sync/schema.ts";
import {
  compteJour, dateCourte, depuisStatut, enCoursEtPassees, listeDuJour, lireFrequence, nomZone, partJour, prevuLe, reperesExercice, resumeTraitement,
  septJours, texteFrequence, zoneCourte, zonesAllumees, zonesExercice, ZONES,
} from "../src/ecrans/suivi-calc.ts";
import { baseDeTest, sensiblesChiffrees, vuEnClair } from "./aide.ts";
import { DatabaseSync } from "node:sqlite";
import { adapter } from "./aide.ts";

const TABLES = ["blessure", "blessure_statut", "blessure_journal", "traitement", "prise"];

test("migration 25 : les cinq tables, avec auteur, sur une base ancienne (24) ; le journal de synchro note leurs écritures", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 24);
  assert.equal((raw.prepare("SELECT name FROM sqlite_master WHERE name = 'blessure'").all() as unknown[]).length, 0);
  await migrer(db);
  for (const t of TABLES) {
    const cols = (raw.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    assert.ok(cols.includes("auteur"), `${t}.auteur`);
  }
  const id = await creerBlessure(db, { titre: "Épaule droite", zone: "deltoide", cote: "d", debut: "2026-10-21" });
  const journal = raw.prepare("SELECT tab FROM sync_journal WHERE tab IN ('blessure', 'blessure_statut') ORDER BY tab").all() as { tab: string }[];
  assert.deepEqual(journal.map((j) => j.tab), ["blessure", "blessure_statut"]);
  assert.throws(() => raw.exec(`INSERT INTO blessure_journal (id, blessure_id, date, type, douleur, texte, auteur, cree_le, maj_le) VALUES ('j', '${id}', '2026-10-21', 'douleur', 11, '', 'moi', 1, 1)`));
  assert.throws(() => raw.exec("INSERT INTO prise (id, traitement_id, date, heure, auteur, cree_le) VALUES ('p', 'absent', '2026-10-21', '08:00', 'moi', 1)"));
});

test("synchro : les tables de santé sont déclarées, parents d'abord, colonnes sensibles chiffrées", () => {
  const noms = TABLES_SYNC.map((t) => t.nom);
  for (const t of TABLES) assert.ok(noms.includes(t), t);
  assert.ok(noms.indexOf("blessure") < noms.indexOf("blessure_statut"));
  assert.ok(noms.indexOf("blessure") < noms.indexOf("traitement"));
  assert.ok(noms.indexOf("traitement") < noms.indexOf("prise"));
  const s = Object.fromEntries(TABLES_SYNC.map((t) => [t.nom, t.sensibles]));
  assert.deepEqual(s.blessure, ["titre", "zone", "cote", "notes", "type"]);
  assert.deepEqual(s.blessure_journal, ["douleur", "texte", "signes"]);
  assert.deepEqual(s.traitement, ["nom", "dose", "notes"]);
  assert.deepEqual(s.prise, ["dose"]);
});

test("blessure : statut en trois boutons, historique daté, le plus récent fait foi ; date corrigée ; dernier changement gardé", async () => {
  const { db } = await baseDeTest();
  const id = await creerBlessure(db, { titre: " Épaule droite ", zone: "deltoide", cote: "d", debut: "2026-10-21" }, MOI, 1000);
  await changerStatut(db, id, "reduite", "2026-10-25", "ia:claude", 2000);
  await changerStatut(db, id, "reduite", "2026-10-25", MOI, 2500); // même statut : rien
  await changerStatut(db, id, "active", "2026-10-26", MOI, 3000);
  let f = (await lireBlessure(db, id))!;
  assert.equal(f.blessure.titre, "Épaule droite");
  assert.equal(f.blessure.statut, "active");
  assert.deepEqual(f.statuts.map((s) => [s.statut, s.date, s.auteur]), [
    ["active", "2026-10-26", MOI], ["reduite", "2026-10-25", "ia:claude"], ["active", "2026-10-21", MOI],
  ]);
  // La réduite passe après l'active : c'est elle qui fait foi.
  await corrigerDateStatut(db, f.statuts[1]!.id, "2026-10-27", 4000);
  f = (await lireBlessure(db, id))!;
  assert.equal(f.blessure.statut, "reduite");
  assert.equal((await listerBlessures(db))[0]!.depuis, "2026-10-27");
  for (const s of f.statuts) await supprimerStatut(db, s.id);
  assert.equal((await lireBlessure(db, id))!.statuts.length, 1, "une blessure garde toujours un statut");
});

test("blessure : notes signées, journal (douleur bornée à 10, rien hors douleur), suppression douce, Annuler, purge", async () => {
  const { db, raw } = await baseDeTest();
  const id = await creerBlessure(db, { titre: "Bas du dos", zone: "lombaires", cote: "2", debut: "2026-10-20" });
  await modifierBlessure(db, id, { notes: "  Raideur au réveil. " }, "ia:claude", 5000);
  await ajouterAuJournal(db, id, { date: "2026-10-21", type: "douleur", douleur: 14, texte: " Pointe " }, MOI, 10);
  await ajouterAuJournal(db, id, { date: "2026-10-23", type: "aide", douleur: 6, texte: "Étirements" }, "ia:claude", 20);
  const f = (await lireBlessure(db, id))!;
  assert.deepEqual([f.blessure.notes, f.blessure.notes_auteur, f.blessure.notes_maj], ["Raideur au réveil.", "ia:claude", 5000]);
  assert.deepEqual(f.journal.map((e) => [e.date, e.type, e.douleur, e.texte, e.auteur]), [
    ["2026-10-23", "aide", null, "Étirements", "ia:claude"], ["2026-10-21", "douleur", 10, "Pointe", MOI],
  ]);
  await supprimerBlessure(db, id);
  assert.equal((await listerBlessures(db)).length, 0);
  assert.equal(await lireBlessure(db, id), null);
  await restaurerBlessure(db, id);
  assert.equal((await listerBlessures(db)).length, 1);
  await purgerBlessure(db, id);
  assert.equal((await listerBlessures(db)).length, 1, "pas de purge sans suppression");
  await supprimerBlessure(db, id);
  await purgerBlessure(db, id);
  assert.equal(Number((raw.prepare("SELECT COUNT(*) AS n FROM blessure_journal").get() as { n: number }).n), 0);
});

test("compléments : créer, modifier (notes signées), prises cochées puis décochées, suppression douce et purge", async () => {
  const { db, raw } = await baseDeTest();
  const a = await creerTraitement(db, { nom: "Créatine", dose: "5 g", moment: "matin", debut: "2026-09-01" });
  const b = await creerTraitement(db, { nom: "Caféine", dose: "200 mg", frequence: "besoin", max_jour: 3, moment: "soir", debut: "2026-10-21", fin: "2026-10-30" }, "ia:claude");
  await modifierTraitement(db, b, { notes: "Avant la séance.", dose: " 100 mg " }, "ia:claude", 77);
  const tb = (await lireTraitement(db, b))!;
  assert.deepEqual([tb.dose, tb.notes, tb.notes_auteur, tb.auteur, tb.rappel], ["100 mg", "Avant la séance.", "ia:claude", "ia:claude", null]);
  await noterPrise(db, a, "2026-10-27", "08:12");
  await noterPrise(db, b, "2026-10-27", "13:00");
  await noterPrise(db, b, "2026-10-27", "21:30");
  await retirerPrise(db, b, "2026-10-27");
  assert.deepEqual((await prisesEntre(db, "2026-10-27", "2026-10-27")).map((p) => [p.traitement_id === a ? "a" : "b", p.heure]), [["a", "08:12"], ["b", "13:00"]]);
  await supprimerTraitement(db, a);
  assert.deepEqual((await listerTraitements(db)).map((x) => x.nom), ["Caféine"]);
  assert.equal((await prisesEntre(db, "2026-10-27", "2026-10-27")).length, 1, "les prises d'un complément supprimé disparaissent avec lui");
  await purgerTraitement(db, a);
  assert.equal(Number((raw.prepare("SELECT COUNT(*) AS n FROM prise WHERE traitement_id = ?").get(a) as { n: number }).n), 0);
});

test("hors du médical (31/10, D1 et D3) : la migration 48 efface les médicaments et leurs prises, et délie les compléments", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 47);
  // Lignes d'avant le 31/10, écrites comme le faisait l'ancien dépôt.
  raw.exec(`INSERT INTO blessure (id, titre, debut, cree_le, maj_le) VALUES ('b', 'Genou', '2026-10-01', 1, 1);
            INSERT INTO traitement (id, nom, type, frequence, debut, blessure_id, auteur, cree_le, maj_le) VALUES
              ('ibu', 'Ibuprofène', 'medicament', 'jour', '2026-10-01', 'b', 'moi', 1, 1),
              ('cre', 'Créatine', 'complement', 'jour', '2026-10-01', 'b', 'moi', 2, 2);
            INSERT INTO prise (id, traitement_id, date, heure, auteur, cree_le) VALUES
              ('p-ibu', 'ibu', '2026-10-27', '21:00', 'moi', 3), ('p-cre', 'cre', '2026-10-27', '08:00', 'moi', 4);
            DELETE FROM sync_journal;`);
  await migrer(db);
  const ids = (sql: string) => (raw.prepare(sql).all() as { id: string }[]).map((x) => x.id);
  assert.deepEqual(ids("SELECT id FROM traitement"), ["cre"]);
  assert.deepEqual(ids("SELECT id FROM prise"), ["p-cre"], "les prises des compléments restent");
  assert.equal((raw.prepare("SELECT blessure_id FROM traitement WHERE id = 'cre'").get() as { blessure_id: string | null }).blessure_id, null);
  assert.deepEqual(ids("SELECT id FROM blessure"), ["b"], "le module Blessures reste");
  // La synchro propage les suppressions au serveur ; l'export ne les a plus.
  const journal = raw.prepare("SELECT tab, cle, supprime FROM sync_journal WHERE supprime = 1 ORDER BY tab, cle").all() as { tab: string; cle: string }[];
  assert.deepEqual(journal.map((j) => `${j.tab} ${j.cle}`), ["prise p-ibu", "traitement ibu"]);
  const json = JSON.parse(await exporterJson(db)) as { tables: Record<string, { id: string }[]> };
  assert.deepEqual([json.tables.traitement!.map((x) => x.id), json.tables.prise!.map((x) => x.id)], [["cre"], ["p-cre"]]);
  await migrer(db);
  assert.deepEqual(ids("SELECT id FROM traitement"), ["cre"], "une seule fois");
});

/** Serveur en mémoire minimal (comme dans synchro.test.ts). */
function faux() {
  const lignes = new Map<string, Changement & { seq: number }>();
  let seq = 0;
  const transport: Transport = {
    pousser: async (lot) => {
      for (const c of lot) lignes.set(`${c.tab}/${c.cle}`, { ...c, seq: ++seq });
    },
    tirer: async (curseur, limite): Promise<Lot> => {
      const l = [...lignes.values()].filter((x) => x.seq > (curseur ? Number(curseur) : 0)).sort((x, y) => x.seq - y.seq);
      const page = l.slice(0, limite);
      return { changements: page.map(({ seq: _, ...c }) => c), curseur: page.length ? String(page[page.length - 1]!.seq) : curseur, encore: l.length > limite };
    },
    envoyerFichier: async () => {},
    lireFichier: async () => null,
    supprimerFichier: async () => {},
  };
  return { lignes, transport };
}

test("synchro : blessure, statut, journal, traitement et prise passent sur l'autre téléphone ; le serveur ne lit ni notes ni doses", async () => {
  await pret();
  const s = faux();
  const cle = aleatoire(32);
  const A = await baseDeTest();
  const B = await baseDeTest();
  const id = await creerBlessure(A.db, { titre: "Épaule zqxw", zone: "deltoide", cote: "d", debut: "2026-10-21", notes: "kiné vbnq" });
  await changerStatut(A.db, id, "reduite", "2026-10-25", "ia:claude");
  await ajouterAuJournal(A.db, id, { date: "2026-10-26", type: "douleur", douleur: 5, texte: "padel wxcv" });
  const t = await creerTraitement(A.db, { nom: "Créatine plmo", dose: "400 mg", debut: "2026-10-21" });
  await noterPrise(A.db, t, "2026-10-26", "21:30", MOI, Date.now(), "200 mg");
  await synchroniser({ db: A.db, transport: s.transport, cle, noeud: "A" });
  const vu = vuEnClair(s.lignes.values());
  for (const t of ["blessure", "blessure_journal", "traitement", "prise"]) assert.ok(sensiblesChiffrees(s.lignes.values(), t, tableSync(t)!.sensibles) > 0, t);
  for (const secret of ["zqxw", "vbnq", "wxcv", "plmo", "400 mg", "200 mg", "deltoide"]) assert.ok(!vu.includes(secret), secret);
  await synchroniser({ db: B.db, transport: s.transport, cle, noeud: "B" });
  const f = (await lireBlessure(B.db, id))!;
  assert.deepEqual([f.blessure.titre, f.blessure.zone, f.blessure.statut, f.blessure.notes], ["Épaule zqxw", "deltoide", "reduite", "kiné vbnq"]);
  assert.deepEqual(f.statuts.map((x) => x.auteur), ["ia:claude", MOI]);
  assert.deepEqual(f.journal.map((e) => [e.douleur, e.texte]), [[5, "padel wxcv"]]);
  assert.equal((await lireTraitement(B.db, t))!.nom, "Créatine plmo");
  assert.deepEqual((await prisesEntre(B.db, "2026-10-26", "2026-10-26")).map((p) => p.dose), ["200 mg"]);
  assert.equal(B.raw.prepare("PRAGMA foreign_key_check").all().length, 0);
});

test("zones : 20 au choix ; noms avec côté ; repère en séance sur muscle principal ou secondaire (actives et réduites)", () => {
  assert.equal(ZONES.length, 20);
  assert.equal(nomZone("deltoide", "d"), "Deltoïde droit");
  // accordés (recette du 27/10 : « Pectoraux gauche »)
  assert.equal(nomZone("pectoraux", "g"), "Pectoraux gauches");
  assert.equal(nomZone("lombaires", "d"), "Lombaires droites");
  assert.equal(nomZone("coiffe", "d"), "Coiffe des rotateurs droite");
  assert.equal(nomZone("lombaires", "2"), "Lombaires des deux côtés");
  assert.equal(zoneCourte("deltoide", "d"), "Deltoïde, droit");
  assert.equal(nomZone("cou", "g"), "Cou", "le cou n'a pas de côté");
  assert.deepEqual([...zonesExercice("Pectoraux", "Triceps|Épaules")].sort(), ["coiffe", "deltoide", "pectoraux", "triceps"]);
  const bl = [
    { id: "1", titre: "Épaule droite", zone: "deltoide", cote: "d" as const, statut: "active" as const },
    { id: "2", titre: "Bas du dos", zone: "lombaires", cote: "2" as const, statut: "reduite" as const },
    { id: "3", titre: "Mollet", zone: "mollets", cote: "g" as const, statut: "disparue" as const },
  ];
  assert.deepEqual(reperesExercice("Épaules", "Triceps", bl).map((b) => b.id), ["1"]);
  assert.deepEqual(reperesExercice("Quadriceps", "Fessiers|Lombaires|Mollets", bl).map((b) => b.id), ["2"], "disparue : pas de repère");
  assert.deepEqual(reperesExercice("Biceps", "", bl), []);
  assert.deepEqual(zonesAllumees(bl), [{ id: "1", zone: "deltoide", cote: "d" }], "D2 : seules les actives s'allument");
  const { enCours, passees } = enCoursEtPassees(bl);
  assert.deepEqual([enCours.map((b) => b.id), passees.map((b) => b.id)], [["1", "2"], ["3"]]);
  assert.equal(dateCourte("2026-10-26"), "26/10");
  assert.equal(depuisStatut("active", "2026-10-26", "2026-10-28"), "Active depuis le 26/10, 2 jours");
});

test("prises du jour : « si besoin » à part (2 sur 3), certains jours, arrêtés hors liste ; 7 jours ; part de l'historique", () => {
  const T = (id: string, o: Partial<{ frequence: string; moment: "matin" | "soir" | null; debut: string; fin: string | null; max_jour: number | null }> = {}) => ({
    id, frequence: "jour", moment: "matin" as "matin" | "soir" | null, debut: "2026-09-01", fin: null as string | null, max_jour: null as number | null, ...o,
  });
  const l = [
    T("creatine"), T("d3", { fin: "2027-03-31" }), T("mg", { moment: "soir" }), T("ibu", { frequence: "besoin", moment: "soir", max_jour: 3 }),
    T("omega", { fin: "2026-09-30" }), T("lmv", { frequence: "jours:1,3,5" }),
  ];
  const j = "2026-10-27"; // mardi
  const prises = [{ traitement_id: "creatine", date: j, heure: "08:12" }, { traitement_id: "d3", date: j, heure: "08:12" }, { traitement_id: "ibu", date: j, heure: "21:30" }];
  assert.deepEqual(compteJour(l, prises, j), { prevus: 3, pris: 2 });
  assert.equal(prevuLe(l[5]!, "2026-10-26"), true, "lundi");
  assert.equal(prevuLe(l[5]!, j), false, "mardi");
  const g = listeDuJour(l, prises, j);
  assert.deepEqual(g.map((x) => [x.moment, x.lignes.map((y) => [y.t.id, y.heure])]), [
    ["matin", [["creatine", "08:12"], ["d3", "08:12"]]], ["soir", [["mg", null], ["ibu", "21:30"]]],
  ]);
  assert.deepEqual(septJours("creatine", [...prises, { traitement_id: "creatine", date: "2026-10-21", heure: "08:00" }], j).map((x) => x.pris), [true, false, false, false, false, false, true]);
  assert.equal(partJour(l, prises, j), 2 / 3);
  assert.equal(partJour([l[3]!], [], j), null, "rien de prévu : pas de barre");
  assert.deepEqual(lireFrequence("jours:5,1,x,3"), { genre: "jours", jours: [1, 3, 5] });
  assert.equal(texteFrequence({ frequence: "besoin", max_jour: 3 }), "Si besoin, 3 par jour au plus");
  assert.equal(resumeTraitement(T("x"), j), "Tous les jours, matin, depuis le 01/09");
  assert.equal(resumeTraitement(T("x", { debut: "2026-10-15", fin: "2027-03-31" }), j), "Tous les jours, matin, du 15/10 au 31/03");
  assert.equal(resumeTraitement(T("x", { frequence: "besoin", moment: "soir", debut: "2026-10-21", fin: "2026-10-30" }), j), "Si besoin, soir, jusqu’au 30/10");
});

test("3D : zones allumées (id du masque, signe du côté), pixel lu sous le doigt, shaders du verre complétés", async () => {
  const { valeursZones, lirePixel, VERT_ZONES, FRAG_ZONES, FRAG_PICK, MAX_ZONES } = await import("../src/ui/3d/verre-zones.ts");
  const muscles = { deltoide: 4, lombaires: 14 };
  assert.deepEqual(valeursZones([{ zone: "deltoide", cote: "d" }, { zone: "inconnu", cote: "g" }, { zone: "lombaires", cote: "2" }], muscles), [[4, -1], [14, 0], [0, 0], [0, 0]]);
  assert.equal(valeursZones([], muscles).length, MAX_ZONES);
  assert.deepEqual(lirePixel([4, 255, 0, 255], muscles), { zone: "deltoide", cote: "d" });
  assert.deepEqual(lirePixel([14, 0, 0, 255], muscles), { zone: "lombaires", cote: "g" });
  assert.equal(lirePixel([0, 0, 0, 255], muscles), null, "sur le corps, hors muscle");
  assert.equal(lirePixel([4, 0, 0, 0], muscles), null, "hors du corps");
  assert.ok(VERT_ZONES.includes("vUv = uv;") && VERT_ZONES.includes("vX = position.x;"));
  assert.ok(FRAG_ZONES.includes("uZones[") && FRAG_ZONES.includes("gl_FragColor = vec4(clamp(col"));
  assert.ok(FRAG_PICK.includes("gl_FragColor = vec4(id / 255.0"));
});

test("migration 25 rattrapée : une base déjà en version 25 sans les tables (numéro pris par une autre branche) les reçoit", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 24);
  raw.exec("CREATE TABLE autre_branche (id TEXT); PRAGMA user_version = 25");
  await migrer(db, 25);
  assert.ok(raw.prepare("SELECT 1 FROM sqlite_master WHERE name = 'prise'").get());
  await migrer(db); // et une seule fois ; les lieux (26, témoin salle.type absent) suivent
  assert.equal((raw.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, VERSION_COURANTE);
});
