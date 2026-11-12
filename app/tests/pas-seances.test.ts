// Pas par séance et dépense : chaque séance a les pas MESURÉS de sa plage (sinon aucun, jamais un prorata), la journée garde son total, le
// NEAT ne compte que les pas hors séances ; kcal des séances calculées chez nous (FC de Whoop) ; kcal par pas Automatique (poids, taille, distance).
import assert from "node:assert/strict";
import { test } from "node:test";
import { ajouterMensuration, ecrireSexe } from "../src/db/depots/profil.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import { kcalSeance } from "../src/ecrans/kcal-seance.ts";
import { bilanJour, choisirBmr, KCAL_PAR_PAS, kcalParPasAuto, kcalParPasRetenu, type SeanceJour } from "../src/ecrans/energie-calc.ts";
import { pasDesSeances, repartirPas } from "../src/ecrans/pas-seances.ts";
import { PERMISSION_PAS } from "../src/ecrans/journee-donnees.ts";
import { jourEnergie, REGLAGES_ENERGIE } from "../src/ecrans/sante-donnees.ts";
import { enregistrerSeances } from "../src/whoop/depot.ts";
import { baseDeTest, jour } from "./aide.ts";

const MIN = 60_000;
const H = 60 * MIN;
const bmr = choisirBmr("mifflin", { balance: null, maigre: null, profil: { sexe: "h", kg: 79, cm: 166, age: 39 } }, 0);

test("cas d'Alex : 10 000 pas dont un padel de 6 000 → journée 10 000, fiche padel 6 000, NEAT 4 000 pas + l'effort du padel", () => {
  const [padel] = repartirPas(10_000, [{ minutes: 90, mesures: 6000 }]);
  assert.deepEqual(padel, { pas: 6000 });
  const s: SeanceJour = { nom: "Padel", minutes: 90, fcMoy: 130, origine: null, pas: padel!.pas };
  const b = bilanJour({ bmr, seances: [s], pas: 10_000, apports: null, kg: 79, kcalParPas: 0.03, enCours: false });
  const sport = kcalSeance({ minutes: 90, fcMoy: 130 }, { sexe: null, kg: 79, age: null }, bmr.kcal).kcal;
  assert.equal(b.neat!.pasHorsSport, 4000);
  assert.equal(b.neat!.kcal, 4000 * 0.03);
  assert.equal(b.sport.kcal, sport);
  // la dépense = métabolisme + effort du padel + 4 000 pas + digestion : les 6 000 pas du padel ne comptent qu'une fois
  assert.ok(Math.abs(b.depense.kcal - (bmr.kcal + sport + 120 + b.digestion.kcal)) < 1e-6);
});

test("pas sans mesure : aucun prorata (cas d'Alex, 08/11 : padel de 98 min, 9 429 pas, pas « 962 ») ; jamais plus que les pas du jour", () => {
  assert.deepEqual(repartirPas(9429, [{ minutes: 98, mesures: null }]), [null]);
  assert.deepEqual(repartirPas(null, [{ minutes: 60, mesures: null }, { minutes: 30, mesures: 1200 }]), [null, { pas: 1200 }]);
  assert.deepEqual(repartirPas(5000, [{ minutes: 60, mesures: 4800 }, { minutes: 600, mesures: null }]), [{ pas: 4800 }, null]);
  assert.deepEqual(repartirPas(1000, [{ minutes: 30, mesures: 3000 }]), [{ pas: 1000 }]);
});

test("pas des séances : Santé Connect sur la plage ; pas du jour de Santé Connect et plage vide = 0 ; pas du jour Whoop : seulement le détail Whoop, jamais le téléphone", async () => {
  const plages = [{ debut: 0, fin: 90 * MIN }, { debut: 2 * H, fin: 3 * H }];
  const sc = { autorisees: async () => [PERMISSION_PAS], pasEntre: async (d: number) => (d === 0 ? 6000 : null) };
  assert.deepEqual(await pasDesSeances({ etat: "valeur", pas: 10_000, source: "sante" }, plages, sc), [{ pas: 6000 }, { pas: 0 }]);
  const rien = { autorisees: async () => [], pasEntre: async () => null };
  assert.deepEqual(await pasDesSeances({ etat: "valeur", pas: 9600, source: "whoop" }, plages, rien), [null, null]);
  // le téléphone posé pendant le jeu (223 pas, 02/11) ne vaut rien quand Whoop compte le jour
  assert.deepEqual(await pasDesSeances({ etat: "valeur", pas: 9600, source: "whoop" }, plages, sc), [null, null]);
  // le détail Whoop de la séance (fiche, ou lu en fond) sert tel quel
  assert.deepEqual(await pasDesSeances({ etat: "valeur", pas: 9600, source: "whoop" }, [{ debut: 0, fin: 90 * MIN, mesures: 6396 }, plages[1]!], sc), [{ pas: 6396 }, null]);
  // séance Santé Connect : ses pas déjà lus servent tels quels
  assert.deepEqual(await pasDesSeances({ etat: "vide", source: "sante" }, [{ debut: 0, fin: H, mesures: 321 }], rien), [{ pas: 321 }]);
});

test("bilan : une séance sans pas mesurés, les pas du jour sont dits tels (seancesSansPas), jamais un « hors séances » inventé", () => {
  const s: SeanceJour = { nom: "Padel", minutes: 98, fcMoy: 130, origine: null, pas: null };
  const b = bilanJour({ bmr, seances: [s], pas: 9_429, apports: null, kg: 79, kcalParPas: 0.03, enCours: false });
  assert.equal(b.neat!.pasHorsSport, 9_429);
  assert.equal(b.neat!.seancesSansPas, true);
  const mesure = bilanJour({ bmr, seances: [{ ...s, pas: 6_396 }], pas: 9_429, apports: null, kg: 79, kcalParPas: 0.03, enCours: false });
  assert.equal(mesure.neat!.pasHorsSport, 3_033);
  assert.equal(mesure.neat!.seancesSansPas, undefined);
  assert.equal(bilanJour({ bmr, seances: [], pas: 9_429, apports: null, kg: 79, kcalParPas: 0.03, enCours: false }).neat!.seancesSansPas, undefined, "un jour sans séance");
});

test("kcal par pas Automatique : 79 kg / 166 cm ≈ 0,027 ; sans profil 0,035 ; distance prioritaire ; Manuel tel quel", () => {
  const p = kcalParPasAuto({ kg: 79, cm: 166, sexe: "h" });
  assert.equal(p.source, "profil");
  assert.ok(Math.abs(p.kcal - 0.027) < 0.0005, String(p.kcal));
  assert.ok(Math.abs(kcalParPasAuto({ kg: 79, cm: 166, sexe: null }).kcal - 0.5 * 79 * 1.66 * 0.414 / 1000) < 1e-12);
  assert.ok(kcalParPasAuto({ kg: 60, cm: 166, sexe: "f" }).kcal < kcalParPasAuto({ kg: 60, cm: 166, sexe: "h" }).kcal);
  assert.deepEqual(kcalParPasAuto({ kg: null, cm: null, sexe: null }), { kcal: KCAL_PAR_PAS, source: "defaut", manque: "poids" });
  assert.deepEqual(kcalParPasAuto({ kg: 79, cm: null, sexe: "h" }), { kcal: KCAL_PAR_PAS, source: "defaut", manque: "taille" });
  // 8 km pour 10 000 pas : 0,8 m le pas, 0,5 × 79 × 8 ÷ 10 000
  const d = kcalParPasAuto({ kg: 79, cm: 166, sexe: "h" }, { km: 8, pas: 10_000 });
  assert.equal(d.source, "distance");
  assert.ok(Math.abs(d.kcal - 0.0316) < 1e-9);
  // sans taille, la distance suffit
  assert.equal(kcalParPasAuto({ kg: 79, cm: null, sexe: null }, { km: 8, pas: 10_000 }).source, "distance");
  // distance invraisemblable (vélo compté dedans) : ignorée
  assert.equal(kcalParPasAuto({ kg: 79, cm: 166, sexe: "h" }, { km: 40, pas: 10_000 }).source, "profil");
  assert.deepEqual(kcalParPasRetenu("manuel", 0.04, { kg: 79, cm: 166, sexe: "h" }), { kcal: 0.04, source: "manuel", manque: null });
});

test("jour réel : séance Whoop seule calculée à sa FC (jamais ses kJ), pas sans prorata, marche de tous les jours hors Sport, kcal par pas d'après le profil", async () => {
  const { db } = await baseDeTest(true);
  const minuit = new Date(2026, 9, 22).getTime();
  await ecrireSexe(db, "h");
  await ajouterPesee(db, 79, minuit - 24 * H, "manuel");
  await ajouterMensuration(db, "taille", 166, minuit - 24 * H);
  await db.runAsync("INSERT INTO whoop_jour (jour, pas, maj_le) VALUES (?, 9600, 1)", [minuit]);
  const debut = jour(2026, 10, 22, 19, 0);
  await enregistrerSeances(db, [
    { id: "p", debut, fin: debut + 90 * MIN, sportId: 249, sport: "Padel", strain: 14, kj: 2510.4, fcMoy: 140, fcMax: 175, distanceM: null, zones: null },
    { id: "m", debut: debut - 3 * H, fin: debut - 2.5 * H, sportId: 63, sport: "Walking", strain: 3, kj: 400, fcMoy: 95, fcMax: 110, distanceM: null, zones: null },
  ]);
  const e = await jourEnergie(db, minuit, minuit + 30 * H);
  assert.equal(e.bilan.sport.seances.length, 1);
  const s = e.bilan.sport.seances[0]!;
  assert.equal(s.nom, "Padel");
  assert.equal(s.estime, false);
  assert.equal(s.methode, "fc");
  // homme de 79 kg, âge inconnu (adulte de référence, 40 ans), FC moyenne de Whoop 140
  assert.ok(Math.abs(s.kcal - kcalSeance({ minutes: 90, fcMoy: 140, sportId: "cat:padel" }, { sexe: "h", kg: 79, age: null }, e.bmr.kcal).kcal) < 1e-9);
  // aucun pas mesuré sur la plage (Whoop n'écrit qu'un total) : pas de prorata, le hors séances est inconnu
  assert.equal(s.pas, null);
  assert.equal(e.bilan.neat!.pasHorsSport, 9600);
  assert.equal(e.bilan.neat!.seancesSansPas, true);
  assert.equal(e.kcalPas.source, "profil");
  assert.ok(Math.abs(e.bilan.neat!.kcal - 9600 * e.kcalPas.kcal) < 1e-9);
  // Manuel : la valeur réglée
  await ecrireReglage(db, REGLAGES_ENERGIE.modeKcalPas, "manuel");
  await ecrireReglage(db, REGLAGES_ENERGIE.kcalParPas, "0.04");
  const m = await jourEnergie(db, minuit, minuit + 30 * H);
  assert.deepEqual([m.kcalPas.source, m.kcalPas.kcal], ["manuel", 0.04]);
  assert.ok(Math.abs(m.bilan.neat!.kcal - 9600 * 0.04) < 1e-9);
});
