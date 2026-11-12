// Rattachement d'un exercice perso au catalogue (src/db/depots/liens-catalogue.ts) : suggestion jamais silencieuse, lien sans
// fusion (séries, records conservés), refus définitif, picto et 3D du catalogue une fois lié (résolution par lien).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ajouterSerie, creerExercice, demarrerSeance, modifierSerie, terminerSeance } from "../src/db/api.ts";
import { JOURS_USAGE, manquesEnCsv, manquesParUsage, usageExercices } from "../src/db/api.ts";
import { LIENS_CATALOGUE, chargerLiens, definirLiens } from "../src/db/liens-catalogue.ts";
import {
  dissocierDuCatalogue, lierAuCatalogue, refuserSuggestion, suggestionPour, suggestionsAConfirmer,
} from "../src/db/depots/liens-catalogue.ts";
import { candidats } from "../src/ui/resolution.ts";
import { normaliser } from "../src/db/normaliser.ts";
import { baseDeTest } from "./aide.ts";

const lire = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const index = lire("../src/ui/pictos-index.ts");
const bloc = (src: string, nom: string) => src.split(`export const ${nom}`)[1]!.split("};")[0]!;
const paires = (b: string) => Object.fromEntries([...b.matchAll(/"([^"]+)": "([^"]+)"/g)].map((m) => [m[1]!, m[2]!]));
const TABLES = { catalogue: paires(bloc(index, "CATALOGUE")), noms: paires(bloc(index, "NOMS")) };

const NOM = "Développé Épaules Assis (Machine)";

async function persoAvecHistorique() {
  const { raw, db } = await baseDeTest(true);
  definirLiens({});
  const id = await creerExercice(db, { nom: NOM, equipement: "machine", muscle: "epaules" });
  const s = await demarrerSeance(db, null);
  const serie = await ajouterSerie(db, { seanceId: s, exerciceId: id, kg: 40, reps: 10 });
  await modifierSerie(db, serie, { faite: true } as never);
  await terminerSeance(db, s);
  return { raw, db, id, serie };
}

test("liens : la migration 186 ajoute lie_a et lien_refuse, vides au départ", async () => {
  const { raw, id } = await persoAvecHistorique();
  const e = raw.prepare("SELECT lie_a, lien_refuse, perso FROM exercices WHERE id = ?").get(id) as { lie_a: string | null; lien_refuse: number; perso: number };
  assert.deepEqual({ ...e }, { lie_a: null, lien_refuse: 0, perso: 1 });
});

test("suggestion : le constat (Développé Épaules Assis (Machine)) propose le développé à leviers, rien n'est lié sans confirmation", async () => {
  const { raw, db, id } = await persoAvecHistorique();
  const s = await suggestionPour(db, id, { departager: (slug) => (slug === "leverage-shoulder-press" ? 1 : 0) });
  assert.equal(s?.catalogue.slug, "leverage-shoulder-press");
  assert.ok(s!.score >= 0.9);
  assert.equal((raw.prepare("SELECT lie_a FROM exercices WHERE id = ?").get(id) as { lie_a: string | null }).lie_a, null);
  assert.deepEqual(LIENS_CATALOGUE, {});
  assert.equal((await suggestionsAConfirmer(db)).filter((x) => x.exercice.id === id).length, 1);
});

test("lien : picto et 3D du catalogue, séries et records conservés, nom gardé, pas de fusion", async () => {
  const { raw, db, id, serie } = await persoAvecHistorique();
  const avant = candidats({ ...TABLES, liens: LIENS_CATALOGUE }, null, NOM);
  assert.ok(await lierAuCatalogue(db, id, "leverage-shoulder-press"));
  assert.equal(LIENS_CATALOGUE[normaliser(NOM)], "leverage-shoulder-press");
  const apres = candidats({ ...TABLES, liens: LIENS_CATALOGUE }, null, NOM);
  assert.notDeepEqual(apres, avant);
  assert.deepEqual(apres, candidats(TABLES, "leverage-shoulder-press", NOM));
  assert.deepEqual(candidats({ ...TABLES, liens: LIENS_CATALOGUE }, null, NOM, true), candidats(TABLES, "leverage-shoulder-press", NOM, true));
  // rien n'est fusionné : même exercice, même nom, mêmes séries
  const e = raw.prepare("SELECT nom, perso, lie_a FROM exercices WHERE id = ?").get(id) as { nom: string; perso: number; lie_a: string };
  assert.deepEqual({ ...e }, { nom: NOM, perso: 1, lie_a: "leverage-shoulder-press" });
  assert.equal((raw.prepare("SELECT exercice_id FROM series WHERE id = ?").get(serie) as { exercice_id: string }).exercice_id, id);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM records WHERE exercice_id = ?").get(id) as { n: number }).n > 0, true);
  // une fois lié, plus de suggestion
  assert.equal(await suggestionPour(db, id), null);
  // le lien voyage : la ligne de l'exercice est dans le journal de synchro
  assert.ok(raw.prepare("SELECT 1 FROM sync_journal WHERE tab = 'exercices' AND cle = ?").get(id));
});

test("dissocier : l'exercice redevient perso seul, le picto neutre revient et la suggestion n'est plus redemandée", async () => {
  const { raw, db, id } = await persoAvecHistorique();
  await lierAuCatalogue(db, id, "leverage-shoulder-press");
  await dissocierDuCatalogue(db, id);
  assert.deepEqual(LIENS_CATALOGUE, {});
  assert.deepEqual(candidats({ ...TABLES, liens: LIENS_CATALOGUE }, null, NOM), candidats(TABLES, null, NOM));
  const e = raw.prepare("SELECT lie_a, lien_refuse FROM exercices WHERE id = ?").get(id) as { lie_a: string | null; lien_refuse: number };
  assert.deepEqual({ ...e }, { lie_a: null, lien_refuse: 1 });
  assert.equal(await suggestionPour(db, id), null);
  assert.equal((await suggestionsAConfirmer(db)).length, 0);
  // il peut toujours être relié à la main, et ce lien lève le refus
  assert.ok(await lierAuCatalogue(db, id, "machine-shoulder-military-press"));
  assert.equal((raw.prepare("SELECT lien_refuse FROM exercices WHERE id = ?").get(id) as { lien_refuse: number }).lien_refuse, 0);
});

test("refus : « Non » garde l'exercice perso et ne redemande plus", async () => {
  const { db, id } = await persoAvecHistorique();
  await refuserSuggestion(db, id);
  assert.equal(await suggestionPour(db, id), null);
  assert.equal((await suggestionsAConfirmer(db)).length, 0);
  assert.deepEqual(LIENS_CATALOGUE, {});
});

test("lien : seuls un exercice perso et un exercice du catalogue se relient", async () => {
  const { raw, db, id } = await persoAvecHistorique();
  assert.equal(await lierAuCatalogue(db, id, "slug-qui-n-existe-pas"), false);
  await lierAuCatalogue(db, "id-inconnu", "leverage-shoulder-press"); // aucune ligne perso touchée
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM exercices WHERE lie_a IS NOT NULL").get() as { n: number }).n, 0);
  const cat = raw.prepare("SELECT id FROM exercices WHERE slug = 'leverage-shoulder-press'").get() as { id: string };
  assert.equal(await suggestionPour(db, cat.id), null); // un exercice du catalogue n'est jamais « à relier »
  await lierAuCatalogue(db, cat.id, "machine-shoulder-military-press");
  assert.equal((raw.prepare("SELECT lie_a FROM exercices WHERE id = ?").get(cat.id) as { lie_a: string | null }).lie_a, null);
});

test("lien : rechargé depuis la base (lancement, après une synchro), en français et en anglais", async () => {
  const { raw, db, id } = await persoAvecHistorique();
  await lierAuCatalogue(db, id, "leverage-shoulder-press");
  raw.prepare("UPDATE exercices SET nom_en_norm = ? WHERE id = ?").run("seated shoulder press machine", id);
  definirLiens({});
  await chargerLiens(db);
  assert.equal(LIENS_CATALOGUE[normaliser(NOM)], "leverage-shoulder-press");
  assert.equal(LIENS_CATALOGUE["seated shoulder press machine"], "leverage-shoulder-press");
});

test("suggestions : une seule ligne par exercice perso proche, les inconnus ne proposent rien", async () => {
  const { db } = await baseDeTest(true);
  definirLiens({});
  const a = await creerExercice(db, { nom: "Shoulder Press (Machine)", equipement: "machine" });
  const b = await creerExercice(db, { nom: "Mon truc à moi" });
  const l = await suggestionsAConfirmer(db);
  assert.deepEqual(l.map((x) => x.exercice.id), [a]);
  assert.ok(!l.some((x) => x.exercice.id === b));
});

test("manques : les exercices les plus utilisés sans picto ni 3D, sur 90 jours, perso ou catalogue", async () => {
  const { raw, db, id } = await persoAvecHistorique();
  const pompes = raw.prepare("SELECT id FROM exercices WHERE slug = 'pushups'").get() as { id: string };
  const s = await demarrerSeance(db, null);
  for (let i = 0; i < 3; i++) {
    const serie = await ajouterSerie(db, { seanceId: s, exerciceId: pompes.id, reps: 10 });
    await modifierSerie(db, serie, { faite: true } as never);
  }
  await terminerSeance(db, s);
  const usage = await usageExercices(db, Date.now() - JOURS_USAGE * 86_400_000);
  assert.deepEqual(usage.map((u) => [u.id, u.series, u.seances]), [[pompes.id, 3, 1], [id, 1, 1]]);
  // le perso n'a rien, les pompes ont un picto mais pas de 3D
  const l = manquesParUsage(usage, (slug) => slug === "pushups", () => false);
  assert.deepEqual(l.map((m) => [m.nom, m.sansPicto, m.sans3D]), [["Pompes", false, true], [NOM, true, true]]);
  assert.equal(manquesParUsage(usage, () => true, () => true).length, 0);
  assert.equal(manquesParUsage(usage, () => false, () => false, 1).length, 1);
  // hors fenêtre : rien
  assert.equal((await usageExercices(db, Date.now() + 86_400_000)).length, 0);
  const csv = manquesEnCsv(l);
  assert.equal(csv.split("\n")[0], "nom,origine,series,seances,sans_picto,sans_3d");
  assert.ok(csv.includes('"Développé Épaules Assis (Machine)"') === false); // pas de virgule : pas de guillemets
  assert.ok(csv.includes(`${NOM},perso,1,1,oui,oui`));
});
