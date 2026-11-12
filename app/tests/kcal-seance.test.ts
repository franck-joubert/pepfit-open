// kcal des séances calculées chez nous (kcal-seance.ts, docs/KCAL-SEANCES.md ; décision du 31/10) : Keytel minute par
// minute à la FC, sinon les MET du sport (et le ressenti), toujours le net au-dessus du repos. Chiffres du bogue du 30/10 : padel
// 86 min à 128 bpm, muscu 31 min, homme de 78 kg ; une copie Santé Connect aux kcal « actives » de presque rien ne compte plus.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CALCUL_KCAL, fcParMinute, kcalSeance, keytelKcalMin, netMinute } from "../src/ecrans/kcal-seance.ts";
import { garderFcMinutes, lireFcMinutes, PREFIXE_FC_MINUTES } from "../src/ecrans/kcal-fc.ts";
import { JOURS_KCAL_CAPTEUR, lireComparaisonKcal, oublierKcalCapteurs } from "../src/ecrans/kcal-comparaison.ts";
import { effortsSeancesJour } from "../src/ecrans/effort-charges.ts";
import { jourEnergie, lireReglagesEnergie } from "../src/ecrans/sante-donnees.ts";
import { sousSport } from "../src/ecrans/activites-vue.ts";
import { ecrireAnneeNaissance, ecrireSexe } from "../src/db/depots/profil.ts";
import { ajouterPesee } from "../src/db/depots/pesees.ts";
import { enregistrerSeances } from "../src/whoop/depot.ts";
import { fabriquerSante, PERMISSIONS, type NatifSante } from "../src/natif/sante/logique.ts";
import { baseDeTest } from "./aide.ts";

const MIN = 60_000;
const H = 60 * MIN;
// homme, 78 kg, 45 ans, FC au repos 55, FC max 180 ; métabolisme du 30/10 (capture) 1 733 kcal
const CORPS = { sexe: "h" as const, kg: 78, age: 45, fcRepos: 55, fcMax: 180 };
const BMR = 1733;
const REPOS_MIN = BMR / 1440;
const keytelH = (fc: number) => (-55.0969 + 0.6309 * fc + 0.1988 * 78 + 0.2017 * 45) / 4.184;
const pres = (a: number, b: number, e = 0.5) => assert.ok(Math.abs(a - b) <= e, `${a} ≠ ${b}`);

test("padel 86 min à 128 bpm (FC minute par minute) : Keytel × 0,8 (raquette) → 743 kcal nettes (au lieu de 929), 847 brutes", () => {
  const k = kcalSeance({ minutes: 86, fc: new Array(86).fill(128), sportId: "cat:padel" }, CORPS, BMR);
  assert.equal(k.methode, "fc");
  assert.equal(k.famille, "raquette");
  assert.equal(k.coef, 0.8);
  pres(keytelH(128), 12.008, 0.001);
  pres(k.kcal, (keytelH(128) - REPOS_MIN) * 86 * 0.8);
  pres(k.kcal, 743.3);
  pres(k.brutes, 846.8);
  // la même séance avec sa seule FC moyenne (Whoop) : le même chiffre ; une FC qui varie autour de 128 aussi (Keytel est
  // linéaire au-dessus de la FC flex)
  pres(kcalSeance({ minutes: 86, fcMoy: 128, sportId: "cat:padel" }, CORPS, BMR).kcal, k.kcal);
  pres(kcalSeance({ minutes: 86, fc: Array.from({ length: 86 }, (_, i) => (i % 2 ? 108 : 148)), sportId: "cat:padel" }, CORPS, BMR).kcal, k.kcal);
  // sans sport (activité détectée) : Keytel seul, 929
  pres(kcalSeance({ minutes: 86, fcMoy: 128 }, CORPS, BMR).kcal, 929.2);
  // avant le correctif : 35 kcal pour ce padel et une course de 3 minutes
  assert.ok(k.kcal > 20 * 35);
});

test("muscu 31 min : sans FC, 5 MET → 164 kcal nettes (202 brutes) ; ressenti « Dur » 205 ; à 105 bpm, Keytel × 0,75 → 171", () => {
  const sans = kcalSeance({ minutes: 31, sportId: "cat:musculation" }, CORPS, BMR);
  assert.equal(sans.methode, "met");
  pres(sans.kcal, 5 * 78 * (31 / 60) - REPOS_MIN * 31);
  pres(sans.kcal, 164.2);
  pres(sans.brutes, 201.5);
  pres(kcalSeance({ minutes: 31, sportId: "cat:musculation", ressenti: "dur" }, CORPS, BMR).kcal, 6 * 78 * (31 / 60) - REPOS_MIN * 31);
  pres(kcalSeance({ minutes: 31, sportId: "cat:musculation", ressenti: "facile" }, CORPS, BMR).kcal, 3.5 * 78 * (31 / 60) - REPOS_MIN * 31);
  const fc = kcalSeance({ minutes: 31, fc: new Array(31).fill(105), sportId: "cat:musculation", ressenti: "facile" }, CORPS, BMR);
  assert.equal(fc.methode, "fc", "la FC passe devant le ressenti");
  assert.equal(fc.famille, "force");
  pres(fc.kcal, (keytelH(105) - REPOS_MIN) * 31 * 0.75);
  pres(fc.kcal, 170.6);
  // aux MET, ni coefficient ni facteur
  assert.equal(sans.coef, 1);
  // avant le correctif : 56 kcal
  assert.ok(sans.kcal > 2.5 * 56);
});

test("séance sans FC : padel 86 min aux MET (6) → 567 kcal nettes ; sport inconnu 5 MET ; sans poids, l'adulte de référence", () => {
  const k = kcalSeance({ minutes: 86, sportId: "cat:padel" }, CORPS, BMR);
  assert.equal(k.methode, "met");
  pres(k.kcal, 6 * 78 * (86 / 60) - REPOS_MIN * 86);
  pres(k.kcal, 567.3);
  pres(kcalSeance({ minutes: 60, sportId: "cat:inconnu" }, CORPS, 1440).kcal, 5 * 78 - 60);
  pres(kcalSeance({ minutes: 60, sportId: null }, { sexe: "f", kg: null, age: null }, 1440).kcal, 5 * 64 - 60);
  assert.deepEqual(kcalSeance({ minutes: 0, sportId: "cat:padel" }, CORPS, BMR), { kcal: 0, brutes: 0, methode: "met", famille: "raquette", coef: 1, facteur: 1 });
});

test("domaine de Keytel : au-dessus de la FC max, ramené à la FC max ; sous la FC flex, en ligne droite jusqu'au repos", () => {
  const flex = 55 + CALCUL_KCAL.flex * (180 - 55);
  pres(flex, 92.5, 1e-9);
  pres(netMinute(230, CORPS, BMR), netMinute(180, CORPS, BMR), 1e-9);
  assert.equal(netMinute(55, CORPS, BMR), 0);
  assert.equal(netMinute(40, CORPS, BMR), 0);
  pres(netMinute(flex, CORPS, BMR), keytelH(flex) - REPOS_MIN, 1e-9);
  pres(netMinute((55 + flex) / 2, CORPS, BMR), (keytelH(flex) - REPOS_MIN) / 2, 1e-9);
  // sexe inconnu : la moyenne des deux équations
  const f = (-20.4022 + 0.4472 * 128 - 0.1263 * 78 + 0.074 * 45) / 4.184;
  pres(keytelKcalMin(128, { sexe: null, kg: 78, age: 45 }), (keytelH(128) + f) / 2, 1e-9);
});

test("FC minute par minute : moyenne de chaque minute, FC impossible ignorée ; trop peu de FC → sa FC moyenne, sinon les MET", () => {
  const t0 = 1_000_000;
  assert.deepEqual(fcParMinute([{ t: t0, bpm: 100 }, { t: t0 + 30_000, bpm: 110 }, { t: t0 + 60_000, bpm: 0 }, { t: t0 + 150_000, bpm: 140 }], t0, t0 + 3 * MIN), [105, 0, 140]);
  // 10 minutes de FC sur 86 : moins de la moitié, la FC moyenne de Whoop sert ; sans elle, les MET
  const peu = [...new Array(10).fill(150), ...new Array(76).fill(0)];
  pres(kcalSeance({ minutes: 86, fc: peu, fcMoy: 128 }, CORPS, BMR).kcal, kcalSeance({ minutes: 86, fcMoy: 128 }, CORPS, BMR).kcal);
  assert.equal(kcalSeance({ minutes: 86, fc: peu, sportId: "cat:padel" }, CORPS, BMR).methode, "met");
  // 60 minutes sur 86 : les trous comptent à la moyenne des minutes mesurées
  const trous = [...new Array(60).fill(128), ...new Array(26).fill(0)];
  pres(kcalSeance({ minutes: 86, fc: trous }, CORPS, BMR).kcal, kcalSeance({ minutes: 86, fcMoy: 128 }, CORPS, BMR).kcal);
});

test("ligne Sport : « calculé à la FC » ou « estimé », jamais « ~ »", () => {
  assert.equal(sousSport([{ nom: "Padel", minutes: 86, methode: "fc" }]), "Padel, 86 min, calculé à la FC");
  assert.equal(sousSport([{ nom: "Push A", minutes: 31, methode: "met" }]), "Push A, 31 min, estimé");
  assert.equal(sousSport([{ nom: "Padel", minutes: 86, methode: "fc" }, { nom: "Course", minutes: 3, methode: "met" }]), "2 séances, estimé");
  assert.equal(sousSport([]), "Aucune séance");
});

// ---- dans la base : page Énergie, Whoop, Santé Connect ---------------------------------------------------------------

const JOUR30 = new Date(2026, 9, 30).getTime();
const PADEL = JOUR30 + 18 * H;
const MAINTENANT = JOUR30 + 30 * H;

/** Santé Connect : une copie du padel (Samsung Health) aux kcal « actives » de 20 sur sa plage, téléphone au sac. */
function santeAvecCopie() {
  const natif: NatifSante = {
    statut: async () => 3,
    autorisees: async () => Object.values(PERMISSIONS),
    demander: async () => [],
    poids: async () => [],
    // le jour : 9 458 pas ; la plage du padel : 600 (téléphone au sac)
    pas: async (b) => b.slice(1).map((f, i) => (f - b[i]! > 12 * H ? 9_458 : b[i]! <= PADEL && f >= PADEL + 85 * MIN ? 600 : 0)),
    pasHeures: async () => [],
    sommeil: async () => [],
    frequenceRepos: async () => [],
    exporter: async () => {},
    mesures: async () => [],
    seancesSport: async (d, f) => (PADEL >= d && PADEL < f ? [{ debut: PADEL + MIN, fin: PADEL + 85 * MIN, type: 0, titre: "", origine: "com.sec.android.app.shealth" }] : []),
    kcalActives: async (b) => b.slice(1).map(() => 20),
    distance: async (b) => b.slice(1).map(() => -1),
    installees: async () => [],
    ouvrir: async () => {},
  };
  return fabriquerSante(natif, () => MAINTENANT);
}

async function profil() {
  const b = await baseDeTest(true);
  await ecrireSexe(b.db, "h");
  await ecrireAnneeNaissance(b.db, 1981);
  await ajouterPesee(b.db, 78, JOUR30 - 24 * H, "manuel");
  return b;
}

test("le bogue du 30/10 : une séance pepfit passe devant sa copie Santé Connect (20 kcal « actives ») ; avec sa FC, Keytel", async () => {
  const { db } = await profil();
  await db.runAsync("INSERT INTO seances (id, titre, debut, fin, activite_id, maj_le) VALUES ('padel', 'Padel', ?, ?, 'cat:padel', 1)", [PADEL, PADEL + 86 * MIN]);
  const r = await lireReglagesEnergie(db);
  const sans = (await jourEnergie(db, JOUR30, MAINTENANT, r, santeAvecCopie())).bilan.sport;
  assert.equal(sans.seances.length, 1, "la copie Santé Connect ne compte pas en plus");
  assert.equal(sans.seances[0]!.nom, "Padel");
  assert.equal(sans.seances[0]!.methode, "met");
  assert.ok(sans.kcal > 500, `aux MET du padel : ${sans.kcal}`);
  // sa FC (capteur, 1 point toutes les 5 s à 128) : gardée minute par minute par l'Effort, puis Keytel
  const fc = Array.from({ length: (86 * 60) / 5 }, (_, i) => [PADEL + i * 5000, 128] as const);
  for (const [t, bpm] of fc) await db.runAsync("INSERT INTO seance_fc (seance_id, t, s, bpm) VALUES ('padel', ?, ?, ?)", [t, t - PADEL, bpm]);
  await effortsSeancesJour(db, JOUR30, undefined, { maintenant: MAINTENANT });
  const garde = await db.getFirstAsync<{ valeur: string }>("SELECT valeur FROM reglages WHERE cle = ?", [`${PREFIXE_FC_MINUTES}padel`]);
  assert.equal(lireFcMinutes(garde?.valeur)?.length, 86);
  const e = await jourEnergie(db, JOUR30, MAINTENANT, r, santeAvecCopie());
  const s = e.bilan.sport.seances[0]!;
  assert.equal(s.methode, "fc");
  assert.equal(e.bilan.sport.estime, false);
  pres(s.kcal, kcalSeance({ minutes: 86, fcMoy: 128, sportId: "cat:padel" }, { sexe: "h", kg: 78, age: 45 }, e.bmr.kcal).kcal, 1e-6);
  assert.ok(s.kcal > 700 && s.kcal < 800, String(s.kcal));
  // les pas de la séance (sa plage) ne comptent qu'une fois : hors sport = pas du jour − pas du padel
  assert.equal(e.bilan.neat!.pasHorsSport, 9_458 - s.pas!);
});

test("séance Whoop avec ses kcal : jamais lues ; calculée à sa FC moyenne, mêmes kcal quels que soient ses kJ", async () => {
  const kcalAvec = async (kj: number) => {
    const { db } = await profil();
    await enregistrerSeances(db, [{ id: "w", debut: PADEL, fin: PADEL + 86 * MIN, sportId: 249, sport: "Padel", strain: 14, kj, fcMoy: 128, fcMax: 170, distanceM: null, zones: null }], MAINTENANT);
    return (await jourEnergie(db, JOUR30, MAINTENANT)).bilan;
  };
  const a = await kcalAvec(2700);
  const b = await kcalAvec(146);
  assert.equal(a.sport.seances.length, 1);
  assert.equal(a.sport.seances[0]!.methode, "fc");
  assert.equal(a.sport.kcal, b.sport.kcal);
  pres(a.sport.kcal, kcalSeance({ minutes: 86, fcMoy: 128, sportId: "cat:padel" }, { sexe: "h", kg: 78, age: 45 }, a.bmr.kcal).kcal, 1e-6);
});

test("kcal de Whoop : gardées 4 semaines pour le labo, puis oubliées ; le labo les met face aux nôtres", async () => {
  const { db } = await profil();
  const vieille = MAINTENANT - (JOURS_KCAL_CAPTEUR + 2) * 24 * H;
  await enregistrerSeances(db, [
    { id: "r", debut: PADEL, fin: PADEL + 86 * MIN, sportId: 249, sport: "Padel", strain: 14, kj: 2700, fcMoy: 128, fcMax: 170, distanceM: null, zones: null },
    { id: "v", debut: vieille, fin: vieille + H, sportId: 249, sport: "Padel", strain: 12, kj: 2000, fcMoy: 120, fcMax: 160, distanceM: null, zones: null },
  ], MAINTENANT);
  const kj = async (id: string) => (await db.getFirstAsync<{ kj: number | null }>("SELECT kj FROM whoop_seance WHERE id = ?", [id]))!.kj;
  assert.equal(await kj("r"), 2700);
  assert.equal(await kj("v"), null, "une séance de plus de 4 semaines n'est pas gardée avec ses kcal");
  const l = await lireComparaisonKcal(db, CORPS, BMR, MAINTENANT);
  assert.equal(l.length, 1);
  assert.equal(l[0]!.whoop, Math.round(2700 / 4.184));
  assert.equal(l[0]!.nous, Math.round(kcalSeance({ minutes: 86, fcMoy: 128, sportId: "cat:padel" }, CORPS, BMR).brutes));
  assert.equal(l[0]!.famille, "raquette");
  await oublierKcalCapteurs(db, MAINTENANT + (JOURS_KCAL_CAPTEUR + 1) * 24 * H);
  assert.equal(await kj("r"), null);
});

test("FC gardée : une séance sans FC est notée (pour ne pas la chercher à chaque fois), une FC illisible ne sert pas", async () => {
  const { db } = await baseDeTest();
  await garderFcMinutes(db, "x", null);
  const v = await db.getFirstAsync<{ valeur: string }>("SELECT valeur FROM reglages WHERE cle = ?", [`${PREFIXE_FC_MINUTES}x`]);
  assert.ok(v);
  assert.equal(lireFcMinutes(v.valeur), null);
  assert.equal(lireFcMinutes("{"), null);
  assert.equal(lireFcMinutes(JSON.stringify({ v: 99, fc: [1] })), null);
});
