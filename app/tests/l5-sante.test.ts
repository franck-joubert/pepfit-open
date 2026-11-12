// Lot L5 de la revue finale (30/10) : pages de mesure de Santé, Âge pepfit, Énergie ; plus la feuille d'une pesée (virgule et
// unité) et l'agenda qui relit ses mois après une pesée corrigée.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { definirActif } from "../src/i18n/index.ts";
import { fr as ageFr } from "../src/i18n/dico-fr/mesures-age.ts";
import { en as ageEn } from "../src/i18n/dico-en/mesures-age.ts";
import { en as effortEn } from "../src/i18n/dico-en/mesures-effort.ts";
import { en as santeEn } from "../src/i18n/dico-en/sante.ts";
import { activitesChangees } from "../src/ecrans/activites-evenement.ts";
import { kgSaisi, saisieLocale, saisiePoids } from "../src/ecrans/poids.ts";
import { lignesChangees, noterVu } from "../src/ecrans/mesures/energie-surligne.ts";
import { JETON_POINT } from "../src/ecrans/mesures/niveau-point.ts";
import { avance, POUSSE } from "../src/ecrans/mesures/pousse.ts";
import type { JourEnergie } from "../src/ecrans/sante-donnees.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const lire = (f: string) => readFileSync(join(SRC, f), "utf8");
const MESURES = readdirSync(join(SRC, "ecrans/mesures")).filter((n) => n.endsWith(".tsx")).map((n) => `ecrans/mesures/${n}`);
const fr = () => definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });
const en = () => definirActif({ langue: "en", fuseau: "Europe/Paris", poids: "kg", distance: "km" });

test("n° 6 : plus de gris opaque dans les pages de mesure (groupe s1, grille et filets line, besoin du sommeil en rose)", () => {
  const gris = /#262321|#e1e5ea|#e6e9ed|#f4f5f7|#141312|#3a3633|#675f58|#948d86|#ccd2d9|#636b74|rgba\(17,20,24/;
  for (const f of ["ecrans/mesures/gabarit.tsx", "ecrans/mesures/Cartes.tsx", "ecrans/mesures/GraphesSommeil.tsx"]) assert.doesNotMatch(lire(f), gris, f);
  assert.match(lire("ecrans/mesures/gabarit.tsx"), /groupe: couleurs\.s1, grille: couleurs\.line, sep: couleurs\.line/);
  assert.match(lire("ecrans/mesures/GraphesSommeil.tsx"), /base: avecOpacite\(m\.fort, [\d.]+\), dette: avecOpacite\(m\.fort, [\d.]+\), effort: avecOpacite\(m\.fort, [\d.]+\)/);
});

test("n° 7 (D6) : le bouton plein des pages de mesure est le dégradé de la partie, plus l'encre", () => {
  const g = lire("ecrans/mesures/gabarit.tsx");
  assert.match(g, /export function BoutonPlein[\s\S]{0,200}<BoutonPrincipal /);
  // l'ancien bouton : fond t1, libellé couleur du fond
  assert.doesNotMatch(g, /color: couleurs\.bg/);
});

test("n° 12 : graphes poussés en 300 ms, cascade comprise ; écart = min(18, 100 / n)", () => {
  assert.equal(POUSSE, 300);
  for (const nb of [1, 7, 12, 30, 52, 90]) {
    const ecart = Math.min(18, 100 / nb);
    assert.equal(avance(0, 0, nb), 0);
    // la dernière colonne part au plus 100 ms après la première, et finit à 300 ms
    assert.ok(ecart * (nb - 1) <= 100 + 1e-9, String(nb));
    assert.equal(avance((ecart * (nb - 1)) / POUSSE, nb - 1, nb), 0);
    assert.equal(avance(1, nb - 1, nb), 1);
    assert.ok(avance(0.5, 0, nb) > 0.5, "courbe de sortie : rapide au départ");
  }
  const g = lire("ecrans/mesures/graphes.tsx");
  assert.match(g, /easing: Easing\.linear/);
  assert.match(g, /joue\.current/);
  for (const f of ["ecrans/mesures/graphes.tsx", "ecrans/mesures/GraphesEnergie.tsx", "ecrans/mesures/GraphesSommeil.tsx", "ecrans/mesures/AgePepfit.tsx"])
    assert.doesNotMatch(lire(f), /240 \+ 18|useApparition\([^)]*, \d{3}\)/, f);
});

test("n° 18 et 19 : « −1 365 » garde son espace ; signe moins collé et « × » pour le rythme de l'Âge", () => {
  for (const d of [ageFr, ageEn]) {
    assert.equal(d["age.x"], "{v}×");
    assert.ok(Object.values(d).every((v) => typeof v !== "string" || !/\dx\b/.test(v)));
  }
  assert.match(lire("ecrans/mesures/AgePepfit.tsx"), /const dec1 = [\s\S]{0,120}"−"/);
  // n° 18 : en chiffres proportionnels, Inter rend l'espace fine de « −1 365 » à largeur nulle (vu à l'émulateur) ; le solde
  // de Santé et les étiquettes des graphes passent en chiffres tabulaires
  assert.match(lire("ecrans/corps/CartesCorps.tsx"), /valeurForte: \{[^}]*fontVariant: \["tabular-nums"\]/);
  assert.equal((lire("ecrans/corps/CartesCorps.tsx").match(/style=\{styles\.valeurForte\}/g) ?? []).length, 2);
  assert.equal((lire("ecrans/mesures/graphes.tsx").match(/fontFeatureSettings/g) ?? []).length, 2);
});

test("n° 41 et 57 : pas de vibration au balayage d'un graphe ; « réduire les animations » suivi en direct", () => {
  assert.doesNotMatch(lire("ecrans/mesures/Statistiques.tsx"), /haptique/);
  for (const f of [...MESURES, "ui/signature-age/SignatureAge.tsx"]) assert.doesNotMatch(lire(f), /useReducedMotion/, f);
});

test("n° 43 : en anglais, « Effort » partout, jamais « strain » (l'Effort pepfit remplace celui de Whoop, 31/10)", () => {
  for (const [k, v] of Object.entries({ ...effortEn, ...santeEn })) {
    if (typeof v !== "string") continue;
    assert.doesNotMatch(v, /strain/i, k);
  }
});

test("n° 46 et 47 : point neutre en anneau vide ; squelette au filet, deux pulsations, arrêté hors de l'écran", () => {
  assert.equal(JETON_POINT.neutre, null);
  const g = lire("ecrans/mesures/gabarit.tsx");
  assert.match(g, /borderColor: couleurs\.t3/);
  assert.match(g, /withRepeat\(withTiming\(0\.55, \{ duration: PULSATION_OS, easing: courbes\.sortie \}\), 4, true\)/);
  assert.match(g, /useIsFocused\(\)/);
  assert.match(g, /backgroundColor: couleurs\.line \}, style, s\]/);
  assert.doesNotMatch(g, /marginHorizontal: 32/);
});

test("n° 37 (D11) : Énergie dit que le sport compte en plus du repos", () => {
  for (const f of ["ecrans/mesures/Energie.tsx", "ecrans/FeuilleEnergie.tsx"]) assert.match(lire(f), /sousValeur=\{b\.sport\.kcal > 0 \? t\("sante\.enPlusDuRepos"\)/, f);
});

const jourE = (sport: number, seances: number, neat: number, ignorees = 0) =>
  ({ jour: 0, bilan: { sport: { kcal: sport, seances: Array.from({ length: seances }, () => ({})) }, neat: { kcal: neat, ignorees } } }) as unknown as JourEnergie;

test("n° 50 : Sport et Pas surlignés quand une activité les a changés depuis la dernière vue du jour", () => {
  const J = 1_000;
  const t0 = Date.now() - 60_000;
  // jamais vu : pas d'« avant », rien ne se surligne
  assert.deepEqual(lignesChangees(J, jourE(305, 1, 177), t0), []);
  // des valeurs qui bougent sans activité changée (repas, pas) : rien
  assert.deepEqual(lignesChangees(J, jourE(305, 1, 190), t0 + 1), []);
  activitesChangees();
  // l'activité ignorée quitte le Sport et revient aux Pas
  assert.deepEqual(lignesChangees(J, jourE(0, 0, 330, 1)), ["sport", "neat"]);
  // revu ensuite : plus rien
  assert.deepEqual(lignesChangees(J, jourE(0, 0, 330, 1)), []);

  // le bilan de Santé note ce qu'il montre, et garde la vue d'avant un changement
  const K = 2_000;
  noterVu(K, jourE(0, 0, 200), t0);
  activitesChangees();
  noterVu(K, jourE(359, 1, 200));
  assert.deepEqual(lignesChangees(K, jourE(359, 1, 200)), ["sport"]);
});

test("feuille d'une pesée : virgule en français, point en anglais, unité des réglages", () => {
  fr();
  assert.equal(saisiePoids(77.4, "kg"), "77,4");
  assert.equal(saisiePoids(78, "kg"), "78,0");
  assert.equal(saisiePoids(77.4, "lbs"), "170,6");
  assert.equal(saisiePoids(500, "lbs"), "1102,3", "sans espace des milliers dans un champ");
  assert.equal(saisieLocale("77.4"), "77,4");
  assert.equal(saisieLocale("77,,4"), "77,4");
  assert.ok(Math.abs(kgSaisi("170,6", "lbs")! - 77.38) < 0.01);
  en();
  assert.equal(saisiePoids(77.4, "kg"), "77.4");
  assert.equal(saisieLocale("77,4"), "77.4");
  fr();
  const f = lire("ecrans/FeuillePesee.tsx");
  assert.doesNotMatch(f, />\s*kg\s*</, "plus de « kg » en dur");
  assert.match(f, /kgSaisi\(texte, u\)/);
  assert.match(f, /texte === depart \? p\.kg/, "poids inchangé : pas d'aller-retour kg / lbs");
  // la feuille d'ajout tape aussi à la virgule de la langue
  assert.match(lire("ecrans/FeuillePoids.tsx"), /setTexte\(saisieLocale\(t\)\)/);
  // et le % de masse grasse de la page Poids
  assert.match(lire("ecrans/mesures/Corps.tsx"), /setTexte\(saisieLocale\(s\)\)/);
});

test("liste des pesées : l'agenda relit ses mois après une pesée corrigée", () => {
  const a = lire("ecrans/mesures/AgendaPage.tsx");
  assert.match(a, /surAgendaChange\(vider\)/);
  const l = lire("ecrans/mesures/ListeAgenda.tsx");
  assert.match(l, /cache\.current\.clear\(\)/);
  assert.match(l, /\}, \[version\]\);/);
  assert.match(a, /\[fenetre\?\.de, fenetre\?\.a, version\]/);
  assert.match(lire("ecrans/mesures/Corps.tsx"), /if \(surAgenda\.current\) agendaChange\(\);/);
});
