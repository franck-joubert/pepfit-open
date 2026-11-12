// Revue finale du 30/10, lot L1 (course, fins du suivi, historique) : tracé sans FC, même format à la fin et dans
// l'historique, distance de la machine au clavier de séance, « Abandonner », « Étapes », erreurs signalées.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { definirActif } from "../src/i18n/index.ts";
import { fr as gpsFr } from "../src/i18n/dico-fr/gps.ts";
import { en as gpsEn } from "../src/i18n/dico-en/gps.ts";
import { modeAffiche, modesEffort, modesTrace } from "../src/ecrans/effort-modes.ts";
import { morceauxParZone } from "../src/ecrans/suivi-direct-vue.ts";
import { vueEffort } from "../src/ecrans/effort-vue.ts";
import { chiffresSuivi, estCourseGuidee, estSuiviPepfit, PALIERS_DISTANCE, texteDistance } from "../src/ecrans/fin-suivi.ts";
import { texteMolette, toucher, valeursMolette } from "../src/ecrans/clavier-seance.ts";
import { metresSaisis } from "../src/ecrans/unites.ts";
import type { Unite } from "../src/ecrans/format.ts";

definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });

const SRC = new URL("../src/", import.meta.url).pathname;
const lire = (f: string) => readFileSync(join(SRC, f), "utf8");

/** Course de l'émulateur : 44 points en ligne droite, ni FC ni altitude (ou une altitude plate à 0 m). */
function courseSansFc(alt: number | null) {
  const points = Array.from({ length: 44 }, (_, i) => ({ t: 1_793_381_400_000 + i * 1000, s: i * 1000, lat: 48.8606, lon: 5.8327 + i * 0.00005, altGps: alt, altBaro: null, precision: 5, vitesse: 4 }));
  return vueEffort({ points, fc: [], bornes: [], barometre: false, denivelePlusM: null }, 46, 190, "km");
}

test("n° 1 : une course sans FC a son tracé (sans altitude ou altitude plate), en un trait neutre", () => {
  for (const alt of [null, 0]) {
    const vue = courseSansFc(alt);
    assert.ok(vue.trace.length >= 2, "tracé présent");
    const modes = modesEffort(vue.zonesS != null, vue.altitude != null && vue.serieAlt.length >= 2);
    assert.deepEqual(modes, [], "ni zones ni profil à montrer");
    // L'écran partait sur « altitude » (pas de FC) : le mode affiché doit être un mode du tracé.
    const tracables = modesTrace(modes);
    const mode = modeAffiche("altitude", tracables);
    assert.equal(mode, "zones");
    assert.ok(tracables.includes(mode), "le fondu du mode affiché est visible");
    // « zones » sans FC : un seul morceau, zone 0 (couleur t3), du premier au dernier point.
    const morceaux = morceauxParZone(vue.trace.map((p) => p.zone));
    assert.deepEqual(morceaux, [{ debut: 0, fin: vue.trace.length - 1, zone: 0 }]);
  }
});

test("n° 1 : avec FC ou profil, le mode choisi est gardé ; un mode absent retombe sur le premier", () => {
  assert.deepEqual(modesEffort(true, true), ["zones", "altitude"]);
  assert.equal(modeAffiche("altitude", modesTrace(modesEffort(true, true))), "altitude");
  assert.equal(modeAffiche("zones", modesTrace(modesEffort(false, true))), "altitude");
  assert.equal(modeAffiche("altitude", modesTrace(modesEffort(true, false))), "zones");
});

test("n° 25 : la séance passée d'un suivi dit la durée et la distance comme sa fin", () => {
  assert.deepEqual(chiffresSuivi({ dureeS: 46, distanceM: 167 }), { duree: "0:46", distance: "0,16 km" });
  assert.deepEqual(chiffresSuivi({ dureeS: 3723, distanceM: 0 }), { duree: "1:02:03", distance: null });
  const h = lire("app/history/[id].tsx");
  assert.match(h, /estSuiviPepfit\(effort\) \? chiffresSuivi\(effort\.vue\)/);
  // la ligne de la série aussi (« 0,16 km · 0:46 », plus « 167 m · 0:46 »)
  assert.match(lire("ecrans/activite/ExerciceLu.tsx"), /suivi \? texteSerieSuivi\(x\) : serieNatureTexte/);
  // une séance vue seulement par Whoop (sans tracé ni série du suivi) garde « 1 h 05 »
  assert.equal(estSuiviPepfit({ vue: { trace: [] } as never, saisie: undefined }), false);
  assert.equal(estSuiviPepfit({ vue: { trace: [] } as never, saisie: { serieId: "s", distanceM: null } }), true);
  assert.equal(estSuiviPepfit({ vue: courseSansFc(null) }), true);
});

test("n° 17 : la distance de la machine au clavier de séance, en dixièmes de km à la molette", () => {
  const u = "km" as Unite;
  const m = valeursMolette("kg", 8.42, { unite: u, paliers: PALIERS_DISTANCE });
  assert.equal(m.valeurs[m.indice], 8.4);
  assert.equal(texteMolette("kg", 8.4), "8,4");
  assert.equal(metresSaisis("8,4"), 8400);
  // le pavé : « 8 , 4 2 » donne « 8,42 », relu en 8 420 m
  let s = { texte: "", remplacer: true };
  for (const k of ["8", "decimal", "4", "2"] as const) s = toucher(s, k, { decimal: true, temps: false, sep: "," });
  assert.equal(s.texte, "8,42");
  assert.equal(metresSaisis(s.texte), 8420);
  assert.equal(texteDistance(8.42), "8,42");
  assert.equal(texteDistance(null), "");
  const f = lire("ecrans/SuiviFin.tsx");
  assert.match(f, /<ClavierSeance \/>/);
  assert.match(f, /showSoftInputOnFocus=\{false\}/);
  assert.doesNotMatch(f, /keyboardType="decimal-pad"/, "plus de clavier du téléphone pour la distance");
});

test("n° 20 : le direct garde le nom du départ et de la fin (« Course à pied »), pas le titre court, sauf sur un circuit (planche s2 : « Course » et le nom du circuit)", () => {
  const d = lire("ecrans/SuiviDirect.tsx");
  assert.equal((d.match(/titreCourt\(/g) ?? []).length, 1);
  assert.match(d, /circuitLance && vueCircuit \? titreCourt\(/);
  assert.match(d, /const titre = lance\?\.titre \?\? ""/);
});

test("n° 21 : « Abandonner la séance » et l'alerte de la fin Force sur les fins du suivi (D12)", () => {
  const f = lire("ecrans/SuiviFin.tsx");
  assert.match(f, /t\("seance\.fin\.abandonner"\)/);
  assert.match(f, /<DialogueAbandon/);
  assert.doesNotMatch(f, /effort\.supprimer/);
});

test("n° 22 : une course guidée a des « Étapes » à sa fin et dans l'historique", () => {
  assert.equal(estCourseGuidee({ routine_id: "r1" }), true);
  assert.equal(estCourseGuidee({ routine_id: null }), false);
  assert.equal(gpsFr["gps.guide.etapes"], "Étapes");
  assert.equal(gpsEn["gps.guide.etapes"], "Steps");
  assert.equal(gpsFr["gps.guide.etapeN"], "Étape {n}");
  for (const f of ["ecrans/SuiviFin.tsx", "app/history/[id].tsx"]) assert.match(lire(f), /etapes=\{estCourseGuidee\(seance\.seance\)\}/, f);
  assert.match(lire("ecrans/ToursKm.tsx"), /t\(etapes \? "gps\.guide\.etapes" : "effort\.tours"\)/);
});

test("n° 23 : le départ d'une course guidée dit la durée de sa carte (même calcul, même format)", () => {
  const d = lire("ecrans/SuiviDepart.tsx");
  assert.match(d, /dureeS: dureeEstimee\(r\)/);
  assert.match(d, /approx\(dureeCourte\(routine\.dureeS\)\)/);
  assert.match(lire("ecrans/Planif.tsx"), /approx\(dureeCourte\(l\.dureeS\)\)/);
  assert.match(lire("ecrans/planif-donnees.ts"), /dureeEstimee\(d\)/);
});

test("n° 8 : l'historique se supprime en glissant, avec la désintégration et « Annuler »", () => {
  const h = lire("app/history/index.tsx");
  assert.match(h, /<Desintegrable[\s\S]*<GlisserSupprimer[\s\S]*onSupprimer/);
  assert.match(h, /<BandeauAnnuler/);
  assert.match(h, /useAnnuler\(/);
});

test("n° 36, 42, 53, 61, 62 : carte pleine hauteur, « ~ » par approx(), annonce en fondu, jetons du mouvement", () => {
  const d = lire("ecrans/SuiviDirect.tsx");
  // plus de vide sous la carte de la course libre
  assert.doesNotMatch(d, /<View style=\{\{ flex: 1 \}\} \/>/);
  assert.match(d, /carte: \{ flex: 1, minHeight: 140/);
  // aucun tilde tapé à la main (règle du constat 24, que ce fichier n'avait pas encore suivie)
  d.split("\n").forEach((l, i) => assert.doesNotMatch(l, /["`]~ ?["$`{]|"~ \{|: "~\{/, `SuiviDirect.tsx:${i + 1}`));
  // Maintenir : scaleX (pilote natif), pas la largeur ; retour en courbe de sortie
  assert.doesNotMatch(d, /width: `\$\{p\.value \* 100\}%`/);
  assert.match(d, /scaleX: p\.value/);
  assert.match(d, /withTiming\(0, \{ duration: duree\.sortie, easing: courbes\.sortie \}\)/);
  const g = lire("ecrans/GuidageDirect.tsx");
  assert.equal((g.match(/entering=\{fondu\.entering\} exiting=\{fondu\.exiting\}/g) ?? []).length, 2, "Ensuite et l'annonce");
  assert.match(lire("ecrans/BlocEffort.tsx"), /duration: duree\.entree, easing: easings\.sortie/);
});

test("n° 44 : les champs de la fin ont le plafond de police", () => {
  const f = lire("ecrans/SuiviFin.tsx");
  // chaque balise, de « <TextInput » à son « /> »
  const champs = f.split(/<TextInput\s/).slice(1).map((x) => x.slice(0, x.indexOf("/>")));
  // la note est devenue le message d'activité : ChampMessage (D2), qui porte le plafond lui-même
  assert.equal(champs.length, 2, "champ de distance, score");
  for (const c of champs) assert.match(c, /maxFontSizeMultiplier=\{POLICE_MAX\}/);
  assert.match(f, /<ChampMessage /);
  assert.match(lire("ecrans/ChampMessage.tsx"), /maxFontSizeMultiplier=\{POLICE_MAX\}/);
});

test("n° 16 : plus d'erreur avalée dans les fichiers du lot, les écritures sont signalées", () => {
  for (const f of ["ecrans/BlocEffort.tsx", "ecrans/SuiviDirect.tsx", "ecrans/SuiviFin.tsx", "ecrans/SuiviDepart.tsx", "ecrans/GuidageDirect.tsx", "app/history/[id].tsx", "app/history/index.tsx"]) {
    assert.doesNotMatch(lire(f), /\.catch\(\(\) => \{\}\)/, f);
  }
  const ecritures: [string, RegExp][] = [
    ["ecrans/SuiviFin.tsx", /enregistrer\(\)\.catch\(signalerErreur\(\)\)/],
    ["ecrans/SuiviFin.tsx", /\.catch\(signalerErreur\("supprimer"\)\)/],
    ["ecrans/SuiviDirect.tsx", /toucherTour\(\)\.catch\(signalerErreur\(\)\)/],
    ["ecrans/SuiviDirect.tsx", /suivi\.pause\(\)\.then\(setEtat\)\.catch\(signalerErreur\(\)\)/],
    ["ecrans/SuiviDepart.tsx", /ecrireAnnonces\(db, v\)\.catch\(signalerErreur\(\)\)/],
    ["app/history/[id].tsx", /\.catch\(signalerErreur\("supprimer"\)\)/],
    ["app/history/index.tsx", /\.catch\(signalerErreur\("supprimer"\)\)/],
  ];
  for (const [f, r] of ecritures) assert.match(lire(f), r, f);
});
