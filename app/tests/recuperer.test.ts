// « Récupérer » (planche recuperer, NOTES § 3) : la durée conseillée, l'alarme, la fusion avec la montre, le sommeil compté,
// les imports, l'effet de la sieste sur la Récupération du lendemain (version 2, jamais la nuit), « Ce qui marche pour toi »
// et ses seuils, le rappel, le souffle guidé.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACTIVITES, alarmeSieste, bilanRappel, doitRappeler, doublons, echeance, estSiesteSante, finOffice, lireEnCours, lireEtatRappel, marche, recommandation,
  recouvre, RECUPERER, SANTE_RECUP, sommeilSieste, souffle, WHOOP_RECUP, type SessionRecup,
} from "../src/ecrans/recuperer.ts";
import { decalerIso, RECUP, scoreRecup, type DonneesRecup, type NuitRecup } from "../src/ecrans/recup-pepfit.ts";

const h = (hh: number, mm = 0) => hh + mm / 60;

test("la durée conseillée (NOTES § 3.1, planche sommeil D16) : toujours 20 min, plus de cycle de 90 min, quelle que soit la dette", () => {
  const cas: [number, number, string][] = [
    [h(9, 30), 20, "matin"],
    [h(13, 30), 20, "eclair"],
    [h(14, 7), 20, "eclair"],
    [h(15, 30), 20, "eclair"],
    [h(17, 30), 20, "tard"],
  ];
  for (const [heure, min, raison] of cas) assert.deepEqual(recommandation(heure), { min, raison }, `${heure}`);
  assert.ok(!("cycle" in RECUPERER.sieste));
});

test("l'alarme : la durée choisie + 5 min d'endormissement (D6) ; « Libre » sans alarme, fermée d'office à 3 h", () => {
  assert.equal(alarmeSieste(20), 25);
  assert.equal(alarmeSieste(90), 95);
  assert.equal(alarmeSieste(null), null);
  const debut = new Date(2026, 9, 30, 14, 7).getTime();
  // la planche : démarrée à 14:07, réveil à 14:32
  assert.equal(echeance("sieste", debut, 20), new Date(2026, 9, 30, 14, 32).getTime());
  // une autre activité sonne à sa durée, sans endormissement
  assert.equal(echeance("sauna", debut, 15), debut + 15 * 60_000);
  assert.equal(echeance("sieste", debut, null), null);
  const libre = { id: "x", type: "sieste" as const, debut, choisi: null, alarme: null };
  assert.equal(finOffice(libre, debut + 179 * 60_000), null);
  assert.equal(finOffice(libre, debut + 200 * 60_000), debut + 180 * 60_000);
  assert.equal(finOffice({ ...libre, choisi: 20 }, debut + 500 * 60_000), null);
  assert.deepEqual(lireEnCours(JSON.stringify(libre)), libre);
  assert.equal(lireEnCours("{"), null);
  assert.equal(lireEnCours(JSON.stringify({ ...libre, type: "yoga" })), null);
});

const m = (hh: number, mm: number) => new Date(2026, 9, 30, hh, mm).getTime();
const sess = (o: Partial<SessionRecup> & Pick<SessionRecup, "id" | "debut" | "fin">): SessionRecup => ({
  type: "sieste", mode: "import", sommeilMin: null, fcMoy: null, sources: [], idExterne: null, ...o,
});

test("sans doublon (§ 3.3) : pepfit 14:07 – 14:32 et Galaxy Watch 14:11 – 14:31, une seule sieste, 19 min de la montre", () => {
  const pepfit = sess({ id: "p", debut: m(14, 7), fin: m(14, 32), mode: "minuteur", sources: ["pepfit"] });
  const montre = sess({ id: "w", debut: m(14, 11), fin: m(14, 31), sommeilMin: 19, fcMoy: 56, sources: ["com.sec.android.app.shealth"], idExterne: "sante:hc-sleep-8812" });
  assert.equal(recouvre(pepfit, montre), 1);
  assert.deepEqual(doublons([pepfit, montre]), [
    { genre: "absorber", garde: "p", perd: "w", mesure: { sommeilMin: 19, fcMoy: 56, source: "com.sec.android.app.shealth", idExterne: "sante:hc-sleep-8812" } },
  ]);
  // moins de 50 % de la plus courte, ou un autre type : deux sessions
  assert.deepEqual(doublons([pepfit, { ...montre, debut: m(14, 25), fin: m(14, 50) }]), []);
  assert.deepEqual(doublons([pepfit, { ...montre, type: "respiration" }]), []);
  // deux appareils : Whoop prime (comme pour la nuit), l'autre est retiré
  const whoop = sess({ id: "z", debut: m(14, 10), fin: m(14, 30), sommeilMin: 18, sources: ["whoop"], idExterne: "whoop:1" });
  assert.deepEqual(doublons([montre, whoop]), [{ genre: "retirer", garde: "z", perd: "w" }]);
  // une session pepfit absorbe la mesure du meilleur appareil (Whoop) ; l'autre appareil de la même sieste est retiré
  const d = doublons([pepfit, montre, whoop]);
  assert.deepEqual(d.map((x) => [x.genre, x.garde, x.perd]), [["absorber", "p", "z"], ["retirer", "p", "w"]]);
});

test("le sommeil compté d'une sieste : la mesure, sinon au minuteur 5 min de moins, sinon la durée entière", () => {
  assert.equal(sommeilSieste({ debut: m(14, 7), fin: m(14, 32), mode: "minuteur", sommeilMin: 19 }), 19);
  assert.equal(sommeilSieste({ debut: m(14, 7), fin: m(14, 32), mode: "minuteur", sommeilMin: null }), 20);
  assert.equal(sommeilSieste({ debut: m(14, 7), fin: m(14, 32), mode: "libre", sommeilMin: null }), 25);
  assert.equal(sommeilSieste({ debut: m(14, 7), fin: m(14, 32), mode: "apres-coup", sommeilMin: null }), 25);
});

test("les imports (§ 3.4) : une sieste de Santé Connect commence entre 10 h et 20 h et dure moins de 3 h (D4) ; Whoop et Santé Connect", () => {
  assert.ok(estSiesteSante(m(14, 11), m(14, 31)));
  assert.ok(!estSiesteSante(m(9, 50), m(10, 20)));
  assert.ok(!estSiesteSante(m(20, 0), m(20, 40)));
  assert.ok(!estSiesteSante(m(13, 0), m(16, 0)));
  assert.ok(!estSiesteSante(m(23, 41), m(23, 41) + 7 * 3600_000));
  assert.deepEqual(Object.values(WHOOP_RECUP).sort(), ["bain-froid", "etirements", "massage", "respiration", "rouleau", "sauna"]);
  assert.equal(WHOOP_RECUP[236], undefined);
  assert.deepEqual(SANTE_RECUP, { 71: "etirements", 33: "respiration" });
  // la marche (79) et le yoga (83) restent du sport
  assert.equal(SANTE_RECUP[79], undefined);
  assert.equal(SANTE_RECUP[83], undefined);
});

test("le catalogue de la feuille : la sieste puis neuf activités, avec leur durée proposée", () => {
  assert.deepEqual(ACTIVITES.map((a) => [a.type, a.duree]), [
    ["sieste", 20], ["respiration", 5], ["sauna", 15], ["bain-froid", 3], ["massage", 30], ["rouleau", 10], ["etirements", 10], ["mobilite", 15], ["marche", 20], ["active", 20],
  ]);
  // seuls le sauna et le bain froid ont des kcal (aux MET)
  assert.deepEqual(ACTIVITES.filter((a) => a.sportKcal).map((a) => a.type), ["sauna", "bain-froid"]);
});

// ---- l'effet de la sieste (§ 3.5) : la planche de la Récupération (planches/recuperation), même nuit, même VFC, même charge
function serie() {
  let graine = 20261030;
  const alea = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648;
  const gauss = () => {
    let x = 0;
    for (let i = 0; i < 6; i++) x += alea();
    return (x - 3) / Math.sqrt(0.5);
  };
  const N = 84;
  const vfc: number[] = [];
  const fc: number[] = [];
  for (let i = 0; i < N; i++) {
    const creux = i >= N - 19 && i <= N - 16 ? -0.22 + 0.05 * (i - (N - 19)) : 0;
    vfc.push(Math.round(56 * Math.exp(0.1 * gauss() + creux)));
    fc.push(Math.round(53 + 1.8 * gauss() - creux * 12));
  }
  vfc[N - 1] = 62;
  fc[N - 1] = 51;
  return { N, vfc, fc };
}
const VENDREDI = "2026-10-30";
function planche(siestes: [string, number][] = []): DonneesRecup {
  const { N, vfc, fc } = serie();
  const nuits = new Map<string, NuitRecup>();
  for (let i = 0; i < N; i++) nuits.set(decalerIso(VENDREDI, i - (N - 1)), { rmssd: vfc[i]!, fcRepos: fc[i]!, sommeilMin: null, milieuMin: null, besoinMin: null, sourceSommeil: null });
  const k = Math.sqrt((24 * 24 * 6) / 28);
  const milieux = [-3, -2, -1, 0, 1, 2, 3].map((x) => 720 + x * k);
  const manques = [14, 14, 14, 14, 13, 13, 28];
  for (let i = 0; i < 7; i++) {
    const j = decalerIso(VENDREDI, i - 6);
    nuits.set(j, { ...nuits.get(j)!, sommeilMin: 460 - manques[i]!, milieuMin: milieux[i]!, besoinMin: 460, sourceSommeil: "montre" });
  }
  const charges = new Map<string, number>([[decalerIso(VENDREDI, -1), 236]]);
  for (let i = 3; i <= 28; i++) charges.set(decalerIso(VENDREDI, -i), (3600 - 236) / 26);
  return { nuits, charges, objectifSommeil: 460, siestes: new Map(siestes) };
}

test("la sieste compte un peu le lendemain (§ 3.5, D7 ; RECUP version 4) : 86,4 sans, 87,7 avec 19 min, 91,9 avec 84 min ; la nuit ne change pas", () => {
  assert.equal(RECUP.version, 4); // 2 : les siestes ; 3 : sans VFC (docs/SANS-WHOOP.md C6) ; 4 : « à rattraper » (planche sommeil)
  assert.equal(RECUP.sieste.poidsDuree, 0.5);
  const jeudi = decalerIso(VENDREDI, -1);
  const sans = scoreRecup(VENDREDI, planche());
  const eclair = scoreRecup(VENDREDI, planche([[jeudi, 19]]));
  const cycle = scoreRecup(VENDREDI, planche([[jeudi, 84]]));
  // version 4 : le besoin est celui de pepfit (7 h 40 + 45 min de rattrapage + 20 min d'effort récent = 8 h 45), et non plus celui de
  // Whoop (7 h 40) : la part Sommeil baisse sans sieste (89,5 → 86,4)
  assert.equal(sans.detail.sommeil.besoin, 525);
  assert.deepEqual([sans.brut, eclair.brut, cycle.brut].map((x) => Math.round(x * 10) / 10), [86.4, 87.7, 91.9]);
  assert.deepEqual([sans.score, eclair.score, cycle.score], [86, 88, 92]);
  assert.deepEqual([sans.apports.sommeil.valeur, eclair.apports.sommeil.valeur, cycle.apports.sommeil.valeur].map((x) => Math.round(x * 10) / 10), [73.8, 78.9, 95.8]);
  // à rattraper : 1 h 08 (le manque pondéré ; 1 h 50 de cumul brut) → 49 min → rien ; la sieste de la veille compte minute pour minute
  assert.deepEqual([sans.detail.sommeil.dette, eclair.detail.sommeil.dette, cycle.detail.sommeil.dette], [68, 49, 0]);
  assert.equal(sans.detail.sommeil.calcul.dette.cumul, 110);
  // la nuit elle-même : sa durée reste 7 h 12, la sieste est comptée à part
  assert.deepEqual([sans.detail.sommeil.dormi, eclair.detail.sommeil.dormi], [432, 432]);
  assert.equal(eclair.detail.sommeil.sieste, 19);
  // une sieste du jour même ne compte pas ce matin-là (elle est venue après), seulement demain
  assert.equal(scoreRecup(VENDREDI, planche([[VENDREDI, 84]])).brut, sans.brut);
  // jamais au-delà du besoin : une sieste énorme ne fait pas dépasser 100 à la durée
  const enorme = scoreRecup(VENDREDI, planche([[jeudi, 600]]));
  assert.equal(enorme.detail.sommeil.sous!.duree, 100);
  assert.equal(enorme.detail.sommeil.dette, 0);
});

test("sans nuit mesurée, une sieste ne crée pas de part Sommeil", () => {
  const d = planche([[decalerIso(VENDREDI, -1), 30]]);
  const n = d.nuits as Map<string, NuitRecup>;
  n.set(VENDREDI, { ...n.get(VENDREDI)!, sommeilMin: null });
  const r = scoreRecup(VENDREDI, d);
  assert.equal(r.apports.sommeil.absente, true);
  assert.equal(r.detail.sommeil.sieste, 0);
});

// ---- ce qui marche pour toi (§ 3.7) : le générateur à graine fixe de planches/recuperer/outils/donnees-recuperer.js
function huitSemaines(g: number) {
  let graine = g;
  const alea = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648;
  const gauss = () => {
    let s = 0;
    for (let i = 0; i < 6; i++) s += alea();
    return (s - 3) / Math.sqrt(0.5);
  };
  const jours = Array.from({ length: 56 }, (_, i) => i);
  const tirer = (n: number) => {
    const l = [...jours];
    for (let i = l.length - 1; i > 0; i--) {
      const k = Math.floor(alea() * (i + 1));
      [l[i], l[k]] = [l[k]!, l[i]!];
    }
    return new Set(l.slice(0, n));
  };
  const JOURS: Record<string, Set<number>> = { sauna: tirer(12), sieste: tirer(14), massage: tirer(9), "bain-froid": tirer(5) };
  const EFFET: Record<string, number> = { sauna: 0.065, sieste: 0.02, massage: 0.005, "bain-froid": 0.03 };
  const rel = jours.map((i) => 0.07 * gauss() + Object.entries(JOURS).reduce((a, [k, s]) => a + (s.has(i) ? EFFET[k]! : 0), 0));
  return Object.fromEntries(Object.entries(JOURS).map(([k, s]) => [k, marche(rel.filter((_, i) => s.has(i)), rel.filter((_, i) => !s.has(i)))]));
}

test("ce qui marche (§ 3.7, D12) : sauna net + 6,2 % (t 2,4), sieste et massage flous, bain froid « encore 3 »", () => {
  const r = huitSemaines(20261101);
  const sauna = r.sauna!;
  assert.equal(sauna.etat, "net");
  if (sauna.etat === "net") {
    assert.equal(Math.round(sauna.ecart * 1000) / 10, 6.2);
    assert.equal(Math.round(sauna.t * 10) / 10, 2.4);
    assert.equal(sauna.n, 12);
  }
  assert.equal(r.sieste!.etat, "flou");
  assert.equal(r.massage!.etat, "flou");
  assert.deepEqual(r["bain-froid"], { etat: "attente", n: 5, manque: 3 });
  // une autre graine : le même effet réel donne un écart flou, le double seuil n'affiche pas un hasard
  const autre = huitSemaines(20261102).sauna!;
  assert.equal(autre.etat, "flou");
  // 8 avec mais moins de 8 sans : on attend encore
  assert.equal(marche([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1], [0, 0]).etat, "attente");
  // un écart négatif net s'affiche aussi
  const bas = marche([-0.1, -0.12, -0.09, -0.11, -0.1, -0.13, -0.08, -0.1], [0, 0.01, -0.01, 0.02, -0.02, 0, 0.01, -0.01]);
  assert.ok(bas.etat === "net" && bas.ecart < 0);
});

test("le rappel (§ 3.8, D10) : éteint par défaut, dette d'au moins 2 h, aucune sieste ni séance, avant 13:30 ; pause de 7 jours après deux ignorés", () => {
  const base = { actif: true, minuteDuJour: 10 * 60, heure: RECUPERER.rappel.heure, dette: 160, siesteFaite: false, seanceEnCours: false, aujourdhui: "2026-10-30", etat: lireEtatRappel(null) };
  assert.ok(doitRappeler(base));
  assert.ok(!doitRappeler({ ...base, actif: false }));
  assert.ok(!doitRappeler({ ...base, dette: 110 }));
  assert.ok(!doitRappeler({ ...base, siesteFaite: true }));
  assert.ok(!doitRappeler({ ...base, seanceEnCours: true }));
  assert.ok(!doitRappeler({ ...base, minuteDuJour: 13 * 60 + 30 }));
  assert.ok(!doitRappeler({ ...base, etat: { dernier: null, ignores: 0, pauseJusqua: "2026-11-02" } }));
  // deux rappels ignorés de suite : pause de 7 jours
  const jamais = () => false;
  const e1 = bilanRappel({ dernier: "2026-10-28", ignores: 0, pauseJusqua: null }, "2026-10-29", jamais, decalerIso);
  assert.deepEqual(e1, { dernier: null, ignores: 1, pauseJusqua: null });
  const e2 = bilanRappel({ ...e1, dernier: "2026-10-29" }, "2026-10-30", jamais, decalerIso);
  assert.deepEqual(e2, { dernier: null, ignores: 0, pauseJusqua: "2026-11-06" });
  // un rappel suivi d'une sieste remet à zéro
  assert.deepEqual(bilanRappel({ dernier: "2026-10-29", ignores: 1, pauseJusqua: null }, "2026-10-30", () => true, decalerIso), { dernier: null, ignores: 0, pauseJusqua: null });
  assert.deepEqual(lireEtatRappel("pas du json"), { dernier: null, ignores: 0, pauseJusqua: null });
});

test("le souffle guidé : 5 s pour inspirer, 5 s pour expirer, 6 par minute", () => {
  assert.deepEqual(souffle(0), { phase: "inspire", reste: 5, echelle: 0 });
  assert.deepEqual(souffle(2), { phase: "inspire", reste: 3, echelle: 0.4 });
  assert.deepEqual(souffle(5), { phase: "expire", reste: 5, echelle: 1 });
  assert.equal(souffle(10).phase, "inspire");
  assert.equal(60 / (RECUPERER.respiration.inspire + RECUPERER.respiration.expire), 6);
});

test("les textes de « Récupérer » : rien de médical, aucun « ~ », mêmes clés en français et en anglais", async () => {
  const { fr } = await import("../src/i18n/dico-fr/recuperer.ts");
  const { en } = await import("../src/i18n/dico-en/recuperer.ts");
  const textes = (d: Record<string, unknown>) => Object.values(d).flatMap((v) => (typeof v === "string" ? [v] : Object.values(v as Record<string, string>)));
  for (const s of [...textes(fr), ...textes(en)]) {
    assert.doesNotMatch(s, /[~≈]/, s);
    assert.doesNotMatch(s, /médic|maladi|malade|soign|traitement|medical|illness|treatment/i, s);
  }
  assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
  // chaque type a son nom, sa phrase « Après… » et ses pluriels
  for (const a of ACTIVITES) for (const k of ["type", "nom", "apres", "lendemains", "dernier", "fois", "encore"]) assert.ok(`recuperer.${k}.${a.type}` in fr, `${k}.${a.type}`);
});
