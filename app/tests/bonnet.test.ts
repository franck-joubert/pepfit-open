// Tour de dos et bonnet (planche articulations, D11, D13, D14) : la table EN 13402-3, les tailles françaises, la dernière
// saisie, le stockage dans « mensurations » (sans table nouvelle) et ce que lit le personnage (calcul B, planche morphologie D1).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BONNETS, BONNET_DD, CHOIX_BONNET, ecartBonnet, lettreBonnet, estBonnet, PAS_DE_POITRINE, soutienDe, soutienPropose, tailleDeTourDos, TAILLES_DOS, texteSoutien, tourDosDeTaille, tourDosValide, type Bonnet,
} from "../src/ecrans/mesures/bonnet-calc.ts";
import { bonnetDeValeur, corpsAffiche, CURSEURS } from "../src/ecrans/morphologie-calc.ts";
import { effacerSoutien, ecrireSoutien, historiqueMensuration, lireSoutien } from "../src/db/depots/profil.ts";
import { lireJoursSante, premierJourSante } from "../src/ecrans/sante-jours.ts";
import { tableSync } from "../src/sync/schema.ts";
import { baseDeTest, jour } from "./aide.ts";

test("D13 : écarts de la norme EN 13402-3, de AA (10 à 12) à H (26 à 28), « aucune » sous 10", () => {
  const attendu: Record<string, [number, number]> = { AA: [10, 12], A: [12, 14], B: [14, 16], C: [16, 18], D: [18, 20], E: [20, 22], F: [22, 24], G: [24, 26], H: [26, 28] };
  for (const [i, l] of BONNETS.entries()) {
    const e = ecartBonnet((i + 1) as Bonnet);
    assert.deepEqual([e.min, e.max], attendu[l], l);
    assert.equal(e.milieu, (e.min + e.max) / 2);
  }
  assert.equal(ecartBonnet(3).milieu, 15, "15 pour un B");
  assert.ok(ecartBonnet(PAS_DE_POITRINE).max <= 10);
});

test("D11 et D14 : taille française = tour de dos + 15 ; puces de 70 à 120 ; libellés « 85 B »", () => {
  assert.equal(tourDosDeTaille(85), 70);
  assert.equal(tailleDeTourDos(70), 85);
  for (const x of TAILLES_DOS) assert.equal(tailleDeTourDos(tourDosDeTaille(x)), x);
  assert.deepEqual([TAILLES_DOS[0], TAILLES_DOS.at(-1)], [70, 120]);
  assert.equal(texteSoutien({ bonnet: 3, tourDos: 70 }), "85 B");
  assert.equal(texteSoutien({ bonnet: 1, tourDos: null }), "AA");
  assert.equal(texteSoutien({ bonnet: PAS_DE_POITRINE, tourDos: 70 }), null, "l'écran dit « Très petite ou aucune »");
  assert.ok(estBonnet(0) && estBonnet(9) && estBonnet(10) && !estBonnet(11) && !estBonnet(2.5) && !estBonnet(-1) && !estBonnet(null));
  assert.ok(tourDosValide(55) && tourDosValide(105) && !tourDosValide(30) && !tourDosValide(Number.NaN));
});

test("D10 : proposé aux femmes et à « Non précisé », jamais aux hommes", () => {
  assert.equal(soutienPropose("f"), true);
  assert.equal(soutienPropose(null), true);
  assert.equal(soutienPropose("h"), false);
});

test("dernière saisie : le bonnet le plus récent, et le tour de dos de la même saisie seulement", () => {
  assert.equal(soutienDe([]), null);
  assert.equal(soutienDe([{ type: "tour_dos", date: 5, valeur: 70 }]), null, "un tour de dos seul ne fait pas une saisie");
  const l = [
    { type: "bonnet", date: 1, valeur: 3 },
    { type: "tour_dos", date: 1, valeur: 70 },
    { type: "bonnet", date: 2, valeur: 4 },
  ];
  assert.deepEqual(soutienDe(l), { bonnet: 4, tourDos: null, date: 2 }, "le tour de dos d'avant ne vaut plus");
  assert.deepEqual(soutienDe([...l, { type: "tour_dos", date: 2, valeur: 75 }]), { bonnet: 4, tourDos: 75, date: 2 });
  assert.equal(soutienDe([{ type: "bonnet", date: 1, valeur: 12 }]), null, "valeur illisible ignorée");
});

test("le personnage lit la saisie (calcul B) : valeur rangée → bonnet, DD = 10 ; le bonnet fait le sein de la femme, rien chez l'homme", () => {
  assert.deepEqual([0, 1, 3, 5, 6, 9, BONNET_DD].map(bonnetDeValeur), ["aucun", "AA", "B", "D", "E", "H", "DD"]);
  assert.equal(bonnetDeValeur(42), null, "valeur illisible = absente");
  assert.equal(bonnetDeValeur(null), null);
  const sein = (bonnet: number | null, sexe: "h" | "f" = "f") =>
    corpsAffiche({ sexe, tailleCm: 165, poidsKg: 60, bonnet, tourDosCm: 75 }).curseurs[CURSEURS.indexOf("bonnet")]!;
  // chaque bonnet de AA à H grossit le sein
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((b) => sein(b));
  assert.ok(v.every((x, i) => i === 0 || x > v[i - 1]!), v.join(" "));
  assert.equal(sein(0), -1, "pas de poitrine : le bout plat");
  assert.equal(sein(3, "h"), 0, "l'homme n'a pas de bonnet");
  // DD (v6) : son propre sein, entre le D et le E, sans tenue (la tenue reste à 0, GRILLE-ESTHETIQUE § 3)
  const dd = corpsAffiche({ sexe: "f", tailleCm: 165, poidsKg: 60, bonnet: BONNET_DD, tourDosCm: 75 }).curseurs;
  assert.ok(sein(5) < dd[CURSEURS.indexOf("bonnet")]! && dd[CURSEURS.indexOf("bonnet")]! < sein(6));
  assert.equal(dd[CURSEURS.indexOf("tenue")], 0);
});

test("stockage : deux types de plus dans « mensurations » (aucune table nouvelle), chiffrés à la synchro, effaçables", async () => {
  const { raw, db } = await baseDeTest();
  assert.equal(await lireSoutien(db), null);
  await ecrireSoutien(db, { bonnet: 3, tourDos: 70 }, jour(2026, 10, 27, 9));
  await ecrireSoutien(db, { bonnet: PAS_DE_POITRINE, tourDos: null }, jour(2026, 11, 3, 9));
  assert.deepEqual(await lireSoutien(db), { bonnet: 0, tourDos: null, date: jour(2026, 11, 3, 9) });
  const lignes = raw.prepare("SELECT type, valeur FROM mensurations ORDER BY date, type").all();
  assert.deepEqual(lignes.map((l) => [l.type, l.valeur]), [["bonnet", 3], ["tour_dos", 70], ["bonnet", 0]]);
  await assert.rejects(ecrireSoutien(db, { bonnet: 11 as Bonnet, tourDos: null }));
  await assert.rejects(ecrireSoutien(db, { bonnet: 3, tourDos: 300 }));
  // la valeur part chiffrée, avec les mensurations
  assert.deepEqual(tableSync("mensurations")?.sensibles, ["valeur"]);
  // ni tour, ni jour de mesure dans Santé
  assert.deepEqual(await historiqueMensuration(db, "poitrine"), []);
  assert.equal((await lireJoursSante(db, "2026-10-01", "2026-11-30")).size, 0);
  assert.equal(await premierJourSante(db), null);
  await effacerSoutien(db);
  assert.equal(await lireSoutien(db), null);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM mensurations").get()!.n, 0);
  // « Effacer » part aussi aux autres appareils (journal de synchro : suppressions)
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM sync_journal WHERE tab = 'mensurations' AND supprime = 1").get()!.n, 3);
});

test("DD (03/11) : entre D et E à l'affichage, l'écart d'un E, rien de renuméroté", () => {
  assert.deepEqual(CHOIX_BONNET.map((c) => c.lettre), ["AA", "A", "B", "C", "D", "DD", "E", "F", "G", "H"]);
  assert.equal(CHOIX_BONNET.find((c) => c.lettre === "E")!.v, 6);
  assert.equal(lettreBonnet(BONNET_DD), "DD");
  assert.equal(true, true);
  assert.deepEqual(ecartBonnet(BONNET_DD), ecartBonnet(6));
  assert.equal(texteSoutien({ bonnet: BONNET_DD, tourDos: 80 }), "95 DD");
});
