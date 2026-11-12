// Revue finale du 30/10, lot L2 (séance Force, clavier, fin) : masque de saisie d'une durée (n° 15), molette qui suit la
// valeur tapée, plein écran ouvert sur la série dont le chrono tourne (n° 35), textes du compteur des records (n° 13).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { toucher, valeursMolette, type Saisie } from "../src/ecrans/clavier-seance.ts";
import { chiffresTemps, lireTemps, masqueTemps } from "../src/ecrans/format.ts";
import { serieAffichee } from "../src/ecrans/ordre-seance.ts";
import { decalageVersChrono, etapesCompte, masqueDuree, texteEtape } from "../src/ecrans/saisie-seance.ts";

const temps = { decimal: false, temps: true };
const taper = (touches: string[], depart: Saisie = { texte: "1:00", remplacer: true }) =>
  touches.reduce((s, t) => toucher(s, t as Parameters<typeof toucher>[1], temps), depart);

test("n° 15 : masque m:ss, un seul deux-points sous l'heure, rempli de droite à gauche", () => {
  assert.equal(masqueDuree(""), "");
  assert.equal(masqueDuree("0"), "0:00");
  assert.equal(masqueDuree("3"), "0:03");
  assert.equal(masqueDuree("30"), "0:30");
  assert.equal(masqueDuree("130"), "1:30");
  assert.equal(masqueDuree("1300"), "13:00");
  assert.equal(masqueDuree("13000"), "1:30:00");
  assert.equal(masqueDuree("123456"), "12:34:56");
  // Zéros de tête (molette « 0:35 », puis une touche) : sans effet sur le masque ni sur la durée relue.
  assert.equal(masqueDuree("0351"), "3:51");
  for (const c of ["3", "30", "130", "0130", "13000", "75"]) assert.equal(lireTemps(chiffresTemps(masqueDuree(c))), lireTemps(c));
  // Avant : « 3 », « 0 » au pavé donnait « ␣␣:␣␣:30 », deux deux-points dans la case.
  const avant = taper(["3", "0"]).texte;
  assert.equal(avant.split(":").length - 1, 2);
  assert.equal(masqueDuree(chiffresTemps(avant)), "0:30");
});

test("n° 15 : la molette suit la valeur tapée (l'ancien masque se lisait comme vide, la molette restait sur 1:00)", () => {
  const saisie = taper(["3", "0"]).texte;
  assert.equal(lireTemps(saisie), null);
  const v = lireTemps(chiffresTemps(saisie));
  assert.equal(v, 30);
  const m = valeursMolette("duree_s", v);
  assert.equal(m.valeurs[m.indice], 30);
  // La valeur de la case, avant toute touche, reste celle de la molette.
  assert.equal(lireTemps(chiffresTemps("1:00")), 60);
  assert.equal(lireTemps(chiffresTemps(masqueTemps("130"))), 90);
});

test("n° 35 : le plein écran s'ouvre sur la série dont le compte à rebours tourne", () => {
  const ordre = [
    { id: "dc1", faite: 1 },
    { id: "dc2", faite: 0 },
    { id: "dc3", faite: 0 },
    { id: "gainage1", faite: 0 },
    { id: "gainage2", faite: 0 },
  ];
  const sans = () => undefined;
  assert.equal(decalageVersChrono(ordre, sans), 0);
  assert.equal(serieAffichee(ordre, decalageVersChrono(ordre, sans))!.id, "dc2");
  const enMarche = (id: string) => (id === "gainage1" ? { debut: 1000 } : undefined);
  assert.equal(serieAffichee(ordre, decalageVersChrono(ordre, enMarche))!.id, "gainage1");
  // En pause seulement : la série en pause ; en marche ailleurs : celle en marche d'abord.
  const enPause = (id: string) => (id === "gainage2" ? { debut: null } : undefined);
  assert.equal(serieAffichee(ordre, decalageVersChrono(ordre, enPause))!.id, "gainage2");
  const deux = (id: string) => (id === "dc3" ? { debut: null } : id === "gainage2" ? { debut: 5 } : undefined);
  assert.equal(serieAffichee(ordre, decalageVersChrono(ordre, deux))!.id, "gainage2");
  // Une série faite ne compte pas (son chrono est arrêté à la coche).
  const fait = (id: string) => (id === "dc1" ? { debut: 5 } : undefined);
  assert.equal(decalageVersChrono(ordre, fait), 0);
});

test("n° 13 : compteur des records, textes calculés une fois et choisis à la progression", () => {
  const etapes = etapesCompte(100, 105, (v) => String(Math.round(v)), 10);
  assert.equal(etapes.length, 11);
  assert.equal(etapes[0], "100");
  assert.equal(etapes[10], "105");
  assert.equal(texteEtape(etapes, 0), "100");
  assert.equal(texteEtape(etapes, 1), "105");
  assert.equal(texteEtape(etapes, 0.5), "103");
  assert.equal(texteEtape(etapes, -0.2), "100");
  assert.equal(texteEtape(etapes, 1.3), "105");
  // La dernière étape est la valeur exacte (pas d'arrondi de la division).
  assert.equal(etapesCompte(0.1, 0.3, (v) => String(v), 3).at(-1), "0.3");
});

test("fin de séance : plus de requestAnimationFrame ni de reflet en boucle ; compteur sur le fil UI", () => {
  const fin = readFileSync(new URL("../src/app/done.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(fin, /requestAnimationFrame/);
  assert.doesNotMatch(fin, /withRepeat/);
  assert.doesNotMatch(fin, /useReducedMotion/);
  assert.match(fin, /useDerivedValue/);
  assert.match(fin, /useIsFocused/);
});

test("séance : réduire lu en direct, clavier sans vibration, durées et courbes des jetons", () => {
  const lire = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  assert.doesNotMatch(lire("ecrans/PleinEcran.tsx"), /useReducedMotion/);
  assert.doesNotMatch(lire("ecrans/PleinEcran.tsx"), /FadeIn\.duration\(120\)/);
  // Aucune vibration aux touches, sauf la touche refusée d'une case pleine (31/10 : 3 chiffres en répétitions).
  const clavier = lire("ui/ClavierSeance.tsx");
  assert.deepEqual(clavier.match(/haptique\.\w+/g), ["haptique.refus"]);
  assert.match(clavier, /if \(!clavierSeance\.toucher\(k\)\) haptique\.refus\(\);/);
  // Fondus de la ligne de série : courbe de sortie, plus la courbe par défaut de Reanimated.
  for (const m of lire("ui/LigneSerie.tsx").matchAll(/withTiming\([^;]*?\{ duration: ([^}]*)\}/g)) {
    if (m[1]!.trim() !== "0") assert.match(m[1]!, /easing:/, m[0]);
  }
  // Glisser-déposer de séance : le dépôt (ty) au pilote natif, la hauteur (p) reste au pilote JS.
  const glisser = lire("ui/Glisser.tsx");
  assert.match(glisser, /Animated\.timing\(ty, \{[^}]*useNativeDriver: true/);
  assert.doesNotMatch(glisser, /Animated\.timing\(ty, \{[^}]*useNativeDriver: false/);
});
