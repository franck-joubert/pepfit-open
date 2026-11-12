// Choix d'exercices (retour du 30/10) : ouvert depuis une routine ou une séance libre d'un sport, il est filtré
// sur les exercices de ce sport s'il y en a ; « Créer un exercice » est toujours actif.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { groupeParDefaut } from "../src/db/programmes.ts";
import { retenirSportSeance, sportSeanceLibre } from "../src/ecrans/selection.ts";
import { baseDeTest } from "./aide.ts";

test("filtre par défaut : le groupe du sport s'il a des exercices dans la liste, sinon aucun", async () => {
  const { db } = await baseDeTest(true);
  const tous = await db.getAllAsync<{ slug: string | null; categorie: string | null; equipement: string | null; perso: number }>(
    "SELECT slug, categorie, equipement, perso FROM exercices",
    [],
  );
  assert.equal(groupeParDefaut("muscu", tous), "muscu");
  assert.equal(groupeParDefaut("cross", tous), "cross");
  assert.equal(groupeParDefaut("course", tous), "cardio");
  // aucun exercice du sport dans la liste lue (lieu filtré, par exemple) : pas de filtre qui viderait tout
  assert.equal(groupeParDefaut("muscu", tous.filter((e) => e.categorie === "Cardio")), null);
  // « autre » n'a pas de groupe ; sans sport, rien
  assert.equal(groupeParDefaut("autre", tous), null);
  assert.equal(groupeParDefaut(null, tous), null);
});

test("séance libre : le sport retenu au départ suit la séance", () => {
  retenirSportSeance("s1", "cross");
  assert.equal(sportSeanceLibre("s1"), "cross");
  assert.equal(sportSeanceLibre("s2"), null);
});

test("le choix pose le filtre du sport, se retire par « Tout », et la séance libre passe son sport", () => {
  const pick = readFileSync(new URL("../src/app/pick.tsx", import.meta.url), "utf8");
  assert.match(pick, /useState<GroupeCatalogue \| null>\(typeSport \? GROUPE_DU_TYPE\[typeSport\] : null\)/);
  assert.match(pick, /onPress=\{\(\) => setGroupe\(g\)\}/);
  const session = readFileSync(new URL("../src/app/session.tsx", import.meta.url), "utf8");
  assert.match(session, /sportSeanceLibre\(seance\.seance\.id\)/);
  // Le départ d'une séance libre passe par le récap commun (planche ajout-seance-v2) : le sport y suit.
  const recap = readFileSync(new URL("../src/ecrans/recap/gestes-recap.ts", import.meta.url), "utf8");
  assert.match(recap, /commencer\(db, r\.routineId, salleId, typeDeSport\(sport\.id\) \?\? "muscu", 1\)/);
});

test("« Créer un exercice » : toujours actif, bouton plein, libellé complet", () => {
  const pick = readFileSync(new URL("../src/app/pick.tsx", import.meta.url), "utf8");
  const bloc = pick.slice(pick.indexOf("<BarreHaut"), pick.indexOf("</BarreHaut>"));
  assert.match(bloc, /<BoutonPrincipal[\s\S]*libelle=\{t\("exercices\.choix\.creer"\)\}/);
  assert.doesNotMatch(bloc, /disabled=|desactive/);
  for (const [l, attendu] of [["fr", "Créer un exercice"], ["en", "Create an exercise"]]) {
    const dico = readFileSync(new URL(`../src/i18n/dico-${l}/exercices.ts`, import.meta.url), "utf8");
    assert.ok(dico.includes(`"exercices.choix.creer": "${attendu}"`), l);
  }
});
