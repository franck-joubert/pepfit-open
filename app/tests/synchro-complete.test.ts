// Synchro complète (migration 49, docs/SYNC-COMPLETE.md) : produits, journal, repas, objectifs, mensurations, mesures, plans
// et réglages de la personne voyagent chiffrés ; doublons d'index unique fusionnés (le plus ancien gagne) ; ligne reçue avant
// son parent mise en attente ; envoi par lots. Faux serveur en mémoire, deux téléphones et l'IA (qui écrit comme le MCP).
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { ajouterConsommation, chercherLocal, consommationsDuJour, ecrireRepetition, appliquerRepetitions, enregistrerProduit, ajouterRepas, listerRepas } from "../src/db/depots/nutrition.ts";
import { ecrireObjectif, lireObjectif } from "../src/db/depots/objectifs.ts";
import { circuitDepuisGpx, lireGpx } from "../src/circuits/gpx.ts";
import { ecrireCircuit, listerCircuits, lireCircuit, modifierCircuit, supprimerCircuit } from "../src/db/depots/circuits.ts";
import { ajouterEau, listerEau, supprimerEau } from "../src/db/depots/fibres-eau.ts";
import { ajouterMensuration, derniereMensuration, ecrireSexe, lireSexe } from "../src/db/depots/profil.ts";
import { ajouterMesures, derniereMesure } from "../src/db/depots/mesures.ts";
import { ecrireReglage, lireReglage } from "../src/db/depots/reglages.ts";
import { demarrerSeance, ajouterSerie, terminerSeance } from "../src/db/depots/seances.ts";
import { migrer } from "../src/db/migrations.ts";
import { aleatoire, chiffrerChamps, pret } from "../src/sync/chiffrement.ts";
import { hlcTexte, lireHlc } from "../src/sync/horloge.ts";
import { synchroniser, type Changement, type Lot, type Transport } from "../src/sync/moteur.ts";
import { PREFIXES_REGLAGES_SYNC, REGLAGES_SYNC, tableSync, TABLES_SYNC } from "../src/sync/schema.ts";
import { adapter, baseDeTest, dansLeClair, sensiblesChiffrees, vuEnClair } from "./aide.ts";

/** Serveur en mémoire (une ligne par table et clé, un numéro d'ordre pour curseur) ; `page` force la taille des pages tirées. */
class FauxServeur {
  lignes = new Map<string, Changement & { seq: number }>();
  seq = 0;
  page: number | null = null;
  lots: number[] = [];
  /** Le n-ième envoi échoue (limite de débit) ; null : jamais. */
  echecAuLot: number | null = null;

  transport(): Transport {
    return {
      pousser: async (lot) => {
        if (this.echecAuLot !== null && this.lots.length + 1 === this.echecAuLot) {
          this.echecAuLot = null;
          throw new Error("429 limite de débit");
        }
        this.lots.push(lot.length);
        for (const c of lot) this.lignes.set(`${c.tab}/${c.cle}`, { ...c, seq: ++this.seq });
      },
      tirer: async (curseur, limite): Promise<Lot> => {
        const n = this.page ?? limite;
        const depuis = curseur ? Number(curseur) : 0;
        const l = [...this.lignes.values()].filter((x) => x.seq > depuis).sort((a, b) => a.seq - b.seq);
        const p = l.slice(0, n);
        return { changements: p.map(({ seq: _, ...c }) => c), curseur: p.length ? String(p.at(-1)!.seq) : curseur, encore: l.length > n };
      },
      envoyerFichier: async () => {},
      lireFichier: async () => null,
      supprimerFichier: async () => {},
    };
  }

  /** Écriture de l'IA (serveur MCP) : la ligne au format de l'appli, sensibles chiffrées, nœud « ia.<connexion> ». */
  ecrireIA(cle: Uint8Array, tab: string, ligne: Record<string, unknown>, ms = Date.now()): void {
    const t = tableSync(tab)!;
    const k = t.cles.map((c) => String(ligne[c])).join("|");
    const clair: Record<string, unknown> = {};
    const secret: Record<string, unknown> = {};
    for (const [c, v] of Object.entries(ligne)) (t.sensibles.includes(c) ? secret : clair)[c] = v;
    if (t.sensibles.length) clair._s = chiffrerChamps(cle, `${tab}/${k}`, secret);
    this.lignes.set(`${tab}/${k}`, { tab, cle: k, hlc: hlcTexte({ ms, c: 0, noeud: "ia.cx1" }), supprime: false, charge: JSON.stringify(clair), seq: ++this.seq });
  }
}

async function telephone(serveur: FauxServeur, cle: Uint8Array, noeud: string) {
  const { raw, db } = await baseDeTest();
  return { raw, db, sync: () => synchroniser({ db, transport: serveur.transport(), cle, noeud }) };
}

const n = (raw: DatabaseSync, sql: string, ...p: (string | number)[]) => Number((raw.prepare(sql).get(...p) as { n: number }).n);

const produitIA = (id: string, nom: string, code: string | null, creeLe: number) => ({
  id, code_barres: code, nom, marque: "Zoé", categorie: null, base: "100g", nutriments: JSON.stringify({ energie_kcal: 400, proteines: 20, glucides: 50, lipides: 10 }),
  portions: "[]", nutriscore: null, nova: null, ingredients: null, source: "perso", licence: null, off_maj: null, cree_le: creeLe, vu_le: creeLe, favori: 0,
  import_cle: null, masque_le: null,
});
const consoIA = (id: string, produitId: string, date: string, creeLe: number) => ({
  id, date, repas_id: "repas:dejeuner", produit_id: produitId, quantite_g: 150, unite: "g", nb_unites: 150, repete: 0, ordre: 0, cree_le: creeLe,
  import_cle: null, plat_id: null, composition: null, ajuste: 0,
});

test("migration 49 : déclencheurs posés, l'existant noté au journal à l'heure 0 (réglages de la personne seulement), curseur remis à zéro", async () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const db = adapter(raw);
  await migrer(db, 48);
  raw.exec(`INSERT INTO produits (id, nom, cree_le, vu_le) VALUES ('p1', 'Pain', 1, 1), ('p2', 'Beurre', 1, 1);
    INSERT INTO consommations (id, date, repas_id, produit_id, quantite_g, nb_unites, cree_le) VALUES ('c1', '2026-10-30', 'repas:diner', 'p1', 80, 80, 2);
    INSERT INTO reglages (cle, valeur) VALUES ('sexe', 'h'), ('precision_memoire', '{}'), ('whoop_curseur_sleep', '9'), ('nutri_entrainement:2026-10-30', '1');
    INSERT INTO sync_etat (cle, valeur) VALUES ('curseur', '2026|x'), ('initial', '1');
    INSERT INTO sync_version (tab, cle, hlc) VALUES ('produits', 'p2', '000000000000001-00000-A');`);
  assert.equal(await migrer(db, 49), 49);
  const j = raw.prepare("SELECT tab, cle, ms FROM sync_journal ORDER BY tab, cle").all().map((x) => `${x.tab}/${x.cle}@${x.ms}`);
  assert.ok(j.includes("produits/p1@0") && j.includes("consommations/c1@0") && j.includes("reglages/sexe@0") && j.includes("reglages/nutri_entrainement:2026-10-30@0"), j.join(" "));
  assert.ok(j.includes("repas/repas:diner@0"), "les repas d'origine partent aussi");
  assert.ok(!j.some((x) => x.startsWith("produits/p2")), "déjà connu du serveur : pas renvoyé");
  assert.ok(!j.some((x) => x.includes("precision_memoire") || x.includes("whoop_curseur")), "réglages locaux : jamais au journal");
  assert.equal(raw.prepare("SELECT 1 FROM sync_etat WHERE cle = 'curseur'").get(), undefined);

  raw.exec("DELETE FROM sync_journal");
  await ecrireReglage(db, "cache_age_pepfit", "1");
  await ecrireReglage(db, "whoop_derniere_synchro", "1");
  await ecrireReglage(db, "unite:cat:couche", "lbs");
  await ecrireObjectif(db, "repos", { proteines: 150, glucides: 200, lipides: 70, sucres: 50 });
  raw.exec("UPDATE consommations SET quantite_g = 90 WHERE id = 'c1'; DELETE FROM mensurations;");
  const apres = raw.prepare("SELECT tab, cle FROM sync_journal ORDER BY tab, cle").all().map((x) => `${x.tab}/${x.cle}`);
  assert.deepEqual(apres, ["consommations/c1", "objectifs/repos", "reglages/unite:cat:couche"]);
});

test("réglages : la liste des déclencheurs (migrations 49 et 52) est celle de sync/schema.ts (en ajouter une demande une migration)", async () => {
  const { raw } = await baseDeTest();
  const trig = String((raw.prepare("SELECT sql FROM sqlite_master WHERE name = 'sync_i_reglages'").get() as { sql: string }).sql);
  const dansTrig = new Set([...trig.matchAll(/'([^']+)'/g)].map((m) => m[1]!).filter((x) => x !== "reglages" && x !== "now"));
  assert.deepEqual([...dansTrig].sort(), [...REGLAGES_SYNC, ...PREFIXES_REGLAGES_SYNC].sort());
});

test("chaque table synchronisée a ses trois déclencheurs, et chaque colonne sensible existe", async () => {
  const { raw } = await baseDeTest();
  for (const t of TABLES_SYNC) {
    for (const q of ["i", "u", "d"]) assert.ok(raw.prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = ?").get(`sync_${q}_${t.nom}`), `${q} ${t.nom}`);
    const cols = new Set(raw.prepare(`PRAGMA table_info(${t.nom})`).all().map((c) => String(c.name)));
    for (const s of t.sensibles) assert.ok(cols.has(s), `${t.nom}.${s}`);
  }
});

test("aller-retour entre deux téléphones : nutrition, repas, objectifs, mensurations, mesures, plan et réglages ; sensibles chiffrées", async () => {
  await pret();
  const cle = aleatoire(32);
  const serveur = new FauxServeur();
  const A = await telephone(serveur, cle, "A");
  const p = await enregistrerProduit(A.db, { code_barres: "3017620422003", nom: "Pâte à tartiner secrète", marque: "Marque X", nutriments: { energie_kcal: 539, proteines: 6 }, source: "off" });
  const gouter = await ajouterRepas(A.db, "Quatre-heures", 990);
  const c = await ajouterConsommation(A.db, { date: "2026-10-31", repasId: gouter, produitId: p.id, quantiteG: 30, unite: "g", nbUnites: 30 });
  await ecrireObjectif(A.db, "entrainement", { proteines: 180, glucides: 300, lipides: 80, sucres: 60 });
  await ajouterMensuration(A.db, "tour_taille", 83.5, Date.UTC(2026, 9, 30));
  await ajouterMesures(A.db, "gras", [{ valeur: 14.2, date: Date.UTC(2026, 9, 29) }], "manuel");
  await ecrireSexe(A.db, "h");
  await ecrireReglage(A.db, "naissance", "1984-05-12");
  await ecrireReglage(A.db, "whoop_derniere_synchro", "123");
  A.raw.exec(`INSERT INTO plans (id, catalogue_id, nom, debut, fin, jours, heure, nb_seances, cree_le, maj_le) VALUES ('pl1', 'ppl', 'PPL 12 semaines', '2026-10-01', '2026-12-24', '1,3,5', '18:00', 36, 1, 1)`);
  await A.sync();

  const clair = vuEnClair(serveur.lignes.values());
  for (const secret of ["secrète", "3017620422003", "Marque X", "Quatre-heures", "83.5", "14.2", "1984-05-12", "539"]) assert.ok(!dansLeClair(clair, secret), `${secret} en clair`);
  assert.ok(!serveur.lignes.has("reglages/whoop_derniere_synchro"), "réglage d'appareil : reste sur A");

  const B = await telephone(serveur, cle, "B");
  await B.sync();
  const jour = await consommationsDuJour(B.db, "2026-10-31");
  assert.equal(jour.length, 1);
  assert.equal(jour[0]!.produit.nom, "Pâte à tartiner secrète");
  assert.equal(jour[0]!.repas_id, gouter);
  assert.ok((await listerRepas(B.db)).some((r) => r.nom === "Quatre-heures"));
  assert.equal((await lireObjectif(B.db, "entrainement")).proteines, 180);
  assert.equal((await derniereMensuration(B.db, "tour_taille"))!.valeur, 83.5);
  assert.equal((await derniereMesure(B.db, "gras", Date.UTC(2026, 10, 1)))!.valeur, 14.2);
  assert.equal(await lireSexe(B.db), "h");
  assert.equal(await lireReglage(B.db, "naissance"), "1984-05-12");
  assert.equal(await lireReglage(B.db, "whoop_derniere_synchro"), null);
  assert.equal(n(B.raw, "SELECT COUNT(*) AS n FROM plans WHERE id = 'pl1'"), 1);

  // B corrige la quantité ; A la reçoit.
  B.raw.exec(`UPDATE consommations SET quantite_g = 45, nb_unites = 45 WHERE id = '${c}'`);
  await B.sync();
  await A.sync();
  assert.equal((await consommationsDuJour(A.db, "2026-10-31"))[0]!.quantite_g, 45);
});

test("eau bue (migration 185) : quantité, heure et libellé chiffrés, la date en clair ; l'autre téléphone reçoit les ajouts, les modifications et les suppressions", async () => {
  await pret();
  const cle = aleatoire(32);
  const serveur = new FauxServeur();
  const A = await telephone(serveur, cle, "A");
  const matin = await ajouterEau(A.db, { date: "2026-11-06", heureMin: 8 * 60 + 12, ml: 275, libelle: "gourde-secrete" });
  const midi = await ajouterEau(A.db, { date: "2026-11-06", heureMin: 12 * 60 + 10, ml: 200 });
  await ecrireReglage(A.db, "nutri_eau_objectif_ml", "2750");
  await A.sync();

  const ligneEau = serveur.lignes.get(`eau_ajout/${matin.id}`)!;
  assert.ok(ligneEau, "l'ajout est parti");
  const clair = vuEnClair(serveur.lignes.values());
  for (const secret of ["275", "gourde-secrete", "492"]) assert.ok(!dansLeClair(clair, secret), `${secret} en clair`);
  assert.equal(JSON.parse(ligneEau.charge!).date, "2026-11-06", "la date reste en clair (l'index du jour)");
  assert.equal(sensiblesChiffrees(serveur.lignes.values(), "eau_ajout", tableSync("eau_ajout")!.sensibles), 2);
  assert.ok(serveur.lignes.has("reglages/nutri_eau_objectif_ml"));

  const B = await telephone(serveur, cle, "B");
  await B.sync();
  const jourB = await listerEau(B.db, "2026-11-06");
  assert.deepEqual(jourB.map((x) => [x.heure_min, x.ml, x.libelle]), [[730, 200, null], [492, 275, "gourde-secrete"]]);
  assert.equal(await lireReglage(B.db, "nutri_eau_objectif_ml"), "2750");

  // B corrige puis supprime ; A le reçoit.
  B.raw.exec(`UPDATE eau_ajout SET ml = 300 WHERE id = '${matin.id}'`);
  await supprimerEau(B.db, midi.id);
  await B.sync();
  await A.sync();
  assert.deepEqual((await listerEau(A.db, "2026-11-06")).map((x) => x.ml), [300]);
});

test("circuit à soi (migration 187) : tout est chiffré sauf l'identifiant et les dates ; l'autre téléphone reçoit l'ajout, le renommage et la suppression", async () => {
  await pret();
  const cle = aleatoire(32);
  const serveur = new FauxServeur();
  const A = await telephone(serveur, cle, "A");
  const gpx = `<?xml version="1.0"?><gpx version="1.1"><trk><name>Sentier-secret-du-lac</name><trkseg>${Array.from({ length: 60 }, (_, i) => `<trkpt lat="${(48.8 + i * 0.0005).toFixed(6)}" lon="${(5.6537 + i * 0.0003).toFixed(6)}"><ele>${100 + (i % 7) * 4}</ele></trkpt>`).join("")}</trkseg></trk></gpx>`;
  const lu = lireGpx(gpx);
  assert.ok(lu.ok);
  const c = circuitDepuisGpx(lu.gpx, { id: "abcde0123456789", maintenant: Date.UTC(2026, 10, 7) })!;
  await ecrireCircuit(A.db, c);
  await A.sync();

  const ligne = serveur.lignes.get(`circuit/${c.id}`)!;
  assert.ok(ligne, "le circuit est parti");
  const clair = vuEnClair(serveur.lignes.values());
  for (const secret of ["Sentier-secret-du-lac", c.trace, "prive", "gpx"]) assert.ok(!clair.includes(secret), `${secret} en clair`);
  const enClair = JSON.parse(ligne.charge!) as Record<string, unknown>;
  assert.deepEqual(Object.keys(enClair).sort(), ["_s", "cree_le", "id", "maj_le"], "seuls l'identifiant et les dates restent en clair");
  assert.equal(sensiblesChiffrees(serveur.lignes.values(), "circuit", tableSync("circuit")!.sensibles), 1);

  const B = await telephone(serveur, cle, "B");
  await B.sync();
  assert.deepEqual(await lireCircuit(B.db, c.id), c, "le circuit arrive à l'identique");

  await modifierCircuit(B.db, c.id, { nom: "Autour du lac", activites: ["course"] }, Date.UTC(2026, 10, 8));
  await B.sync();
  await A.sync();
  const chezA = (await lireCircuit(A.db, c.id))!;
  assert.equal(chezA.nom, "Autour du lac");
  assert.deepEqual(chezA.activites, ["course"]);

  await supprimerCircuit(A.db, c.id);
  await A.sync();
  await B.sync();
  assert.deepEqual(await listerCircuits(B.db), []);
});

test("secret chiffré cherché dans le clair : un nombre seul, jamais un morceau d'heure ou d'identifiant (test instable du 03/11)", () => {
  // le kcal en clair est vu, quelle que soit sa place ; les millisecondes d'un hlc ou d'un cree_le ne le sont plus
  for (const vu of ['{"energie_kcal":539}', '{"nutriments":"{\\"energie_kcal\\":539,\\"proteines\\":6}"}', '"539 kcal"', '[539]']) assert.ok(dansLeClair(vu, "539"), vu);
  for (const vu of ['"hlc":"001762539000123-00000-A"', '"cree_le":1762539000000', '"id":"a539f2c0"']) assert.ok(!dansLeClair(vu, "539"), vu);
  assert.ok(dansLeClair('{"nom":"Pâte à tartiner secrète"}', "secrète"));
});

test("IA puis téléphone : le journal écrit par le MCP arrive (même avant son produit, page par page), l'auteur reste lisible", async () => {
  await pret();
  const cle = aleatoire(32);
  const serveur = new FauxServeur();
  const T = await telephone(serveur, cle, "T");
  await T.sync();
  // L'IA écrit la consommation avant son produit, et le téléphone tire une ligne par page : la consommation arrive seule.
  serveur.ecrireIA(cle, "consommations", consoIA("cIA", "pIA", "2026-10-30", 5));
  serveur.ecrireIA(cle, "produits", produitIA("pIA", "Skyr nature", "3033490004743", 4));
  serveur.page = 1;
  const b = await T.sync();
  assert.equal(b.appliques, 2);
  const jour = await consommationsDuJour(T.db, "2026-10-30");
  assert.equal(jour.length, 1, "la consommation n'est pas perdue");
  assert.equal(jour[0]!.produit.nom, "Skyr nature");
  assert.equal(Math.round(jour[0]!.macros.kcal), 600);
  assert.equal(n(T.raw, "SELECT COUNT(*) AS n FROM sync_attente"), 0);
  const v = T.raw.prepare("SELECT hlc FROM sync_version WHERE tab = 'consommations' AND cle = 'cIA'").get() as { hlc: string };
  assert.equal(lireHlc(v.hlc)!.noeud, "ia.cx1", "auteur : la connexion de l'IA (D6)");
  assert.equal(n(T.raw, "SELECT COUNT(*) AS n FROM sync_journal"), 0, "rien à renvoyer");

  // Le téléphone voit tout de suite ce que l'IA lira : sa correction part au serveur, signée du téléphone.
  T.raw.exec("UPDATE consommations SET quantite_g = 200, nb_unites = 200 WHERE id = 'cIA'");
  await T.sync();
  assert.equal(lireHlc(serveur.lignes.get("consommations/cIA")!.hlc)!.noeud, "T");
});

test("consommation reçue avant son produit et séries avant leur séance : en attente, puis appliquées ; rien n'est effacé", async () => {
  await pret();
  const cle = aleatoire(32);
  const serveur = new FauxServeur();
  const A = await telephone(serveur, cle, "A");
  const seance = await demarrerSeance(A.db, null, "Push");
  await ajouterSerie(A.db, { seanceId: seance, exerciceId: "cat:couche", kg: 60, reps: 8 }).catch(() => null);
  await terminerSeance(A.db, seance);
  await A.sync();
  // Le serveur rend les enfants avant leurs parents (la séance retouchée passe après ses séries), une ligne par page.
  for (const [k, l] of [...serveur.lignes]) if (l.tab === "seances") serveur.lignes.set(k, { ...l, seq: ++serveur.seq });
  serveur.page = 1;
  const B = await telephone(serveur, cle, "B");
  await B.sync();
  assert.equal(n(B.raw, "SELECT COUNT(*) AS n FROM seances WHERE id = ?", seance), 1);
  assert.equal(n(B.raw, "SELECT COUNT(*) AS n FROM series WHERE seance_id = ?", seance), n(A.raw, "SELECT COUNT(*) AS n FROM series WHERE seance_id = ?", seance));
  assert.equal(n(B.raw, "SELECT COUNT(*) AS n FROM sync_attente"), 0);
});

test("doublon de code-barres entre deux téléphones et l'IA : le plus ancien gagne partout, le journal suit, rien n'est perdu", async () => {
  await pret();
  const cle = aleatoire(32);
  const serveur = new FauxServeur();
  const A = await telephone(serveur, cle, "A");
  const B = await telephone(serveur, cle, "B");
  await A.sync();
  await B.sync();
  const code = "3017620422003";
  const pA = await enregistrerProduit(A.db, { code_barres: code, nom: "Nutella (A)", nutriments: { energie_kcal: 539 }, source: "off" }, 1000);
  const pB = await enregistrerProduit(B.db, { code_barres: code, nom: "Nutella (B)", nutriments: { energie_kcal: 539 }, source: "off" }, 2000);
  await ajouterConsommation(A.db, { date: "2026-10-30", repasId: "repas:petit_dej", produitId: pA.id, quantiteG: 20, unite: "g", nbUnites: 20 });
  await ajouterConsommation(B.db, { date: "2026-10-31", repasId: "repas:petit_dej", produitId: pB.id, quantiteG: 25, unite: "g", nbUnites: 25 });
  // Et l'IA crée le même, plus tard, avec sa consommation.
  serveur.ecrireIA(cle, "produits", produitIA("pIA", "Nutella (IA)", code, 3000));
  serveur.ecrireIA(cle, "consommations", consoIA("cIA", "pIA", "2026-10-31", 3001));
  // Même ligne Fitatu importée sur les deux téléphones.
  for (const [T, id, t] of [[A, "fA", 10], [B, "fB", 20]] as const) {
    T.raw.exec(`INSERT INTO consommations (id, date, repas_id, produit_id, quantite_g, nb_unites, cree_le, import_cle) VALUES ('${id}', '2026-10-29', 'repas:diner', '${T === A ? pA.id : pB.id}', 50, 50, ${t}, 'fitatu:conso:42')`);
  }

  for (let i = 0; i < 3; i++) {
    await A.sync();
    await B.sync();
  }
  for (const T of [A, B]) {
    const prod = T.raw.prepare("SELECT id, code_barres, remplace_par FROM produits WHERE id IN (?, ?, 'pIA') ORDER BY id").all(pA.id, pB.id).map((x) => ({ ...x }));
    assert.deepEqual(
      prod.sort((a, b) => String(a.id).localeCompare(String(b.id))),
      [
        { id: pA.id, code_barres: code, remplace_par: null },
        { id: pB.id, code_barres: null, remplace_par: pA.id },
        { id: "pIA", code_barres: null, remplace_par: pA.id },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
    assert.equal(n(T.raw, "SELECT COUNT(*) AS n FROM consommations WHERE produit_id <> ?", pA.id), 0, "tout le journal vise le gagnant");
    assert.equal(n(T.raw, "SELECT COUNT(*) AS n FROM consommations"), 4, "deux saisies, l'ajout de l'IA, une seule ligne Fitatu");
    assert.equal(n(T.raw, "SELECT COUNT(*) AS n FROM consommations WHERE import_cle = 'fitatu:conso:42' AND id = 'fA'"), 1, "la plus ancienne reste");
    assert.deepEqual((await chercherLocal(T.db, "nutella")).map((x) => x.id), [pA.id], "un seul produit dans les listes");
  }
  // Les deux téléphones ont la même chose, et une synchro de plus ne change plus rien.
  const etat = (T: typeof A) => JSON.stringify([
    T.raw.prepare("SELECT id, code_barres, remplace_par FROM produits ORDER BY id").all(),
    T.raw.prepare("SELECT id, produit_id, quantite_g, import_cle FROM consommations ORDER BY id").all(),
  ]);
  assert.equal(etat(A), etat(B));
  const encore = await A.sync();
  assert.equal(encore.envoyes, 0);
  assert.equal(n(A.raw, "SELECT COUNT(*) AS n FROM sync_attente"), 0);
});

test("répétition d'un repas faite sur deux téléphones avant la synchro : une seule fois au journal", async () => {
  await pret();
  const cle = aleatoire(32);
  const serveur = new FauxServeur();
  const A = await telephone(serveur, cle, "A");
  const p = await enregistrerProduit(A.db, { nom: "Flocons d'avoine", nutriments: { energie_kcal: 370 }, source: "perso" });
  await ajouterConsommation(A.db, { date: "2026-10-27", repasId: "repas:petit_dej", produitId: p.id, quantiteG: 60, unite: "g", nbUnites: 60 });
  await ecrireRepetition(A.db, "repas:petit_dej", { regle: "tous", date: "2026-10-27" });
  await A.sync();
  const B = await telephone(serveur, cle, "B");
  await B.sync();
  assert.equal(await appliquerRepetitions(A.db, "2026-10-28", false, "2026-10-31"), 1);
  assert.equal(await appliquerRepetitions(B.db, "2026-10-28", false, "2026-10-31"), 1);
  await A.sync();
  await B.sync();
  await A.sync();
  for (const T of [A, B]) assert.equal((await consommationsDuJour(T.db, "2026-10-28")).length, 1);
});

test("5 000 lignes du journal : envoyées par lots de 20 au plus, un envoi coupé reprend où il s'est arrêté, l'autre téléphone reçoit tout", async () => {
  await pret();
  const cle = aleatoire(32);
  const serveur = new FauxServeur();
  const A = await telephone(serveur, cle, "A");
  await A.sync();
  const avant = serveur.lignes.size;
  const N = 5000;
  A.raw.exec("BEGIN");
  for (let i = 0; i < 50; i++) A.raw.exec(`INSERT INTO produits (id, nom, nutriments, cree_le, vu_le) VALUES ('p${i}', 'Aliment ${i}', '{"energie_kcal":100}', ${i}, ${i})`);
  const ins = A.raw.prepare("INSERT INTO consommations (id, date, repas_id, produit_id, quantite_g, nb_unites, cree_le) VALUES (?, ?, 'repas:dejeuner', ?, 100, 100, ?)");
  for (let i = 0; i < N; i++) ins.run(`c${i}`, `2022-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`, `p${i % 50}`, i);
  A.raw.exec("COMMIT");
  assert.equal(n(A.raw, "SELECT COUNT(*) AS n FROM sync_journal"), N + 50);

  serveur.lots = [];
  serveur.echecAuLot = 101;
  await assert.rejects(A.sync(), /429/);
  assert.equal(serveur.lots.length, 100);
  assert.ok(serveur.lots.every((x) => x <= 20));
  assert.equal(n(A.raw, "SELECT COUNT(*) AS n FROM sync_journal"), N + 50 - 2000, "les 100 lots confirmés ont quitté le journal");
  await A.sync();
  assert.equal(n(A.raw, "SELECT COUNT(*) AS n FROM sync_journal"), 0);
  assert.ok(serveur.lots.every((x) => x <= 20));
  assert.equal(serveur.lignes.size, avant + N + 50, "rien en double");
  // Parents d'abord : les produits notés à la même heure partent avant les consommations.
  const premierConso = Math.min(...[...serveur.lignes.values()].filter((l) => l.tab === "consommations").map((l) => l.seq));
  assert.ok([...serveur.lignes.values()].filter((l) => l.tab === "produits").every((l) => l.seq < premierConso));

  const B = await telephone(serveur, cle, "B");
  await B.sync();
  assert.equal(n(B.raw, "SELECT COUNT(*) AS n FROM consommations"), N);
  assert.equal(n(B.raw, "SELECT COUNT(*) AS n FROM sync_attente"), 0);
});

test("réglages : seuls ceux de la personne voyagent ; une clé locale écrite ailleurs (ou par l'IA) ne s'écrit pas ici", async () => {
  await pret();
  const cle = aleatoire(32);
  const serveur = new FauxServeur();
  const A = await telephone(serveur, cle, "A");
  await ecrireReglage(A.db, "fc_max", "188");
  await ecrireReglage(A.db, "nutri_repeter:repas:diner", '{"regle":"tous","date":"2026-10-01"}');
  await ecrireReglage(A.db, "sauvegarde_dossier", "content://x");
  await A.sync();
  assert.ok(serveur.lignes.has("reglages/fc_max") && serveur.lignes.has("reglages/nutri_repeter:repas:diner"));
  assert.ok(!serveur.lignes.has("reglages/sauvegarde_dossier"));
  serveur.ecrireIA(cle, "reglages", { cle: "whoop_connecte", valeur: "1" });
  serveur.ecrireIA(cle, "reglages", { cle: "pas_objectif", valeur: "12000" });
  const B = await telephone(serveur, cle, "B");
  await B.sync();
  assert.equal(await lireReglage(B.db, "fc_max"), "188");
  assert.equal(await lireReglage(B.db, "pas_objectif"), "12000");
  assert.equal(await lireReglage(B.db, "whoop_connecte"), null);
  assert.equal(await lireReglage(B.db, "sauvegarde_dossier"), null);
});

test("doublons supprimés : salle OSM, plat Fitatu et mesure importés sur deux téléphones ; séances et journal suivent le gagnant", async () => {
  await pret();
  const cle = aleatoire(32);
  const serveur = new FauxServeur();
  const A = await telephone(serveur, cle, "A");
  const B = await telephone(serveur, cle, "B");
  await A.sync();
  await B.sync();
  const p = await enregistrerProduit(A.db, { nom: "Riz", nutriments: { energie_kcal: 350 }, source: "perso" });
  await A.sync();
  await B.sync();
  for (const [T, s, t] of [[A, "A", 100], [B, "B", 200]] as const) {
    T.raw.exec(`INSERT INTO salle (id, nom, source_id, cree_le, maj_le) VALUES ('salle${s}', 'Basic-Fit', 'node/42', ${t}, ${t});
      INSERT INTO seances (id, debut, fin, maj_le, salle_id) VALUES ('seance${s}', ${t}, ${t + 1}, ${t}, 'salle${s}');
      INSERT INTO plats (id, nom, source, import_cle, cree_le, modifie_le) VALUES ('plat${s}', 'Chili', 'fitatu', 'fitatu:recette:7', ${t}, ${t});
      INSERT INTO consommations (id, date, repas_id, produit_id, quantite_g, nb_unites, cree_le, plat_id) VALUES ('conso${s}', '2026-10-2${s === "A" ? 1 : 2}', 'repas:diner', '${p.id}', 300, 1, ${t}, 'plat${s}');`);
    await ajouterMesures(T.db, "vfc", [{ valeur: 62, date: Date.UTC(2026, 9, 30) }], "sante_connect", t);
  }
  for (let i = 0; i < 3; i++) {
    await A.sync();
    await B.sync();
  }
  for (const T of [A, B]) {
    assert.deepEqual(T.raw.prepare("SELECT id FROM salle WHERE source_id = 'node/42'").all().map((x) => x.id), ["salleA"]);
    assert.deepEqual(T.raw.prepare("SELECT id, salle_id FROM seances WHERE id LIKE 'seance%' ORDER BY id").all().map((x) => `${x.id}>${x.salle_id}`), ["seanceA>salleA", "seanceB>salleA"]);
    assert.deepEqual(T.raw.prepare("SELECT id FROM plats").all().map((x) => x.id), ["platA"]);
    assert.deepEqual(T.raw.prepare("SELECT id, plat_id FROM consommations ORDER BY id").all().map((x) => `${x.id}>${x.plat_id}`), ["consoA>platA", "consoB>platA"]);
    assert.equal(n(T.raw, "SELECT COUNT(*) AS n FROM mesure_corps WHERE type = 'vfc'"), 1);
    assert.equal(n(T.raw, "SELECT COUNT(*) AS n FROM sync_attente"), 0);
  }
  assert.equal(serveur.lignes.get("salle/salleB")!.supprime, true, "le perdant est supprimé sur le serveur aussi");
});
