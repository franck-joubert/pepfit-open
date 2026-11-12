// Âge au cœur du corps (planches/age-coeur, validée le 29/10) : calendrier de l'ouverture et du retour de la page Âge, état
// partagé du vol de l'âme, case « Âge pepfit » de la page Santé, SkSL de la signature (compilé par CanvasKit).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { bloc, deplacement, finOuverture, finRetour, opaciteFond, sortie, vol } from "../src/ecrans/mesures/age-entree-calc";
import { ame } from "../src/theme/mouvement";
import * as volAme from "../src/ui/3d/vol-ame";
import { AME, lisiereAme, placeAme, yCorps } from "../src/ui/3d/verre";
import { casesSante, dispositionMoi } from "../src/ecrans/sante-vue";
import { SKSL_AME } from "../src/ui/signature-age/sksl-ame";

const proche = (a: number, b: number, e = 1e-3) => Math.abs(a - b) <= e;

test("courbes : sortie et déplacement de l'appli, bornées", () => {
  assert.equal(sortie(0), 0);
  assert.equal(sortie(1), 1);
  assert.ok(sortie(0.5) > 0.9, "sortie : part vite");
  assert.ok(deplacement(0.15) < 0.05, "déplacement : part lentement");
  assert.ok(deplacement(0.85) > 0.95, "déplacement : se pose doucement");
});

test("vol : de la poitrine (p 0, âme) à la place de la signature (p 1, signature) en 420 ms", () => {
  assert.deepEqual(vol("vol", 0, 0), { p: 0, leger: 1, opacite: 1 });
  const fin = vol("vol", ame.vol, 0);
  assert.equal(fin.p, 1);
  assert.equal(fin.leger, 0);
  // la pupille s'ouvre en vol (100 à 400 ms), pas avant
  assert.equal(vol("vol", 90, 0).leger, 1);
  assert.ok(vol("vol", 250, 0).leger < 1 && vol("vol", 250, 0).leger > 0);
  // le fond couvre Santé en 150 ms ; le chiffre arrive après le reste
  assert.equal(opaciteFond("vol", 0, 0), 0);
  assert.equal(opaciteFond("vol", ame.couvre, 0), 1);
  assert.equal(bloc("vol", 230, 0, -1).opacite, 0);
  assert.ok(bloc("vol", 230, 0, 0).opacite > 0.9);
  assert.equal(bloc("vol", 99, 0, 0).opacite, 0);
  // échelonnement : 40 ms d'écart, montée de 6 dp, chiffre de 0,96 à 1
  assert.ok(bloc("vol", 150, 0, 1).opacite < bloc("vol", 150, 0, 0).opacite);
  assert.equal(bloc("vol", 100, 0, 0).y, 6);
  assert.equal(bloc("vol", finOuverture("vol"), 0, 3).y, 0);
  assert.ok(proche(bloc("vol", 240, 0, -1).echelle, 0.96));
  assert.equal(finOuverture("vol"), ame.chiffre + ame.entree);
});

test("retour : chemin inverse en 300 ms ; interrompu en plein vol, demi-tour sans saut", () => {
  const T = finOuverture("vol");
  assert.deepEqual(vol("vol", T, 0), { p: 1, leger: 0, opacite: 1 });
  assert.equal(vol("vol", T, ame.retour).p, 0);
  assert.equal(vol("vol", T, ame.retour).leger, 1);
  assert.equal(finRetour("vol"), ame.retour);
  // le contenu part en 120 ms, le fond découvre Santé
  assert.equal(bloc("vol", T, ame.sortieContenu, 2).opacite, 0);
  assert.equal(opaciteFond("vol", T, ame.sortieFondDebut + ame.fondu), 0);
  // retour à 200 ms d'ouverture : il repart de là où en était le vol (continuité), et finit dans la poitrine
  const enVol = vol("vol", 200, 0);
  const debutRetour = vol("vol", 200, 1e-6);
  assert.ok(proche(enVol.p, debutRetour.p) && proche(enVol.leger, debutRetour.leger));
  assert.equal(vol("vol", 200, ame.retour).p, 0);
  assert.equal(vol("vol", 200, ame.retour).leger, 1);
  // au retour, le fond ne remonte jamais (il part de là où il en était)
  assert.ok(opaciteFond("vol", 80, 30) <= opaciteFond("vol", 80, 0));
});

test("sans vol (autre arrivée) : fondu de 200 ms, la signature déjà pleine ; mouvement réduit : rien ne bouge", () => {
  assert.deepEqual(vol("fondu", 0, 0), { p: 1, leger: 0, opacite: 0 });
  assert.equal(vol("fondu", ame.fondu, 0).opacite, 1);
  assert.equal(opaciteFond("fondu", ame.fondu, 0), 1);
  assert.equal(vol("fondu", ame.fondu, ame.fondu).opacite, 0);
  for (const t of [0, 50, 100, 200]) {
    assert.equal(vol("reduit", t, 0).p, 1, "réduit : aucun vol");
    assert.equal(bloc("reduit", t, 0, 1).y, 0, "réduit : aucune montée");
    assert.equal(bloc("reduit", t, 0, -1).echelle, 1);
  }
  assert.equal(finOuverture("reduit"), ame.fondu);
  assert.equal(finRetour("reduit"), ame.fondu);
});

test("état du vol : départ, âme cachée, fin ; un départ trop vieux n'est plus celui de la page", () => {
  volAme.finirVol();
  assert.equal(volAme.departVol(), null);
  let n = 0;
  const stop = volAme.ecouterVol(() => n++);
  volAme.brancherHorlogesAme(() => ({ forme: 12, reel: 3, phase: 1.5 }));
  volAme.lancerVol({ x: 206, y: 420, cote: 54 }, 1000);
  assert.equal(volAme.volActif(), true);
  assert.deepEqual(volAme.departVol(1500)?.horloges, { forme: 12, reel: 3, phase: 1.5 });
  assert.equal(volAme.departVol(1000 + volAme.DEPART_VALIDE_MS + 1), null);
  assert.equal(volAme.retourVol()?.x, 206);
  volAme.cacherAme(true);
  assert.equal(volAme.ameCachee(), true);
  volAme.activerVol(false);
  assert.equal(volAme.volActif(), false);
  volAme.finirVol();
  assert.equal(volAme.ameCachee(), false);
  assert.equal(volAme.retourVol(), null);
  assert.ok(n >= 4, "le personnage est prévenu à chaque changement");
  stop();
  volAme.brancherHorlogesAme(null);
});

test("case « Âge pepfit » : en haut à droite, en miroir du Sommeil, trait parti du bas jusqu'à la lisière de l'âme", () => {
  const dispo = dispositionMoi(183);
  const p = dispo.seules;
  assert.equal(p.age.cote, "d");
  assert.equal(p.age.y, p.sommeil.y);
  assert.equal(p.age.largeur, p.sommeil.largeur);
  assert.equal(p.age.depart, "bas");
  // l'ancre est sur la lisière : à 0,92 du rayon de la membrane, côté épaule (en haut à droite)
  const a = placeAme(183);
  const ya = yCorps(p.age.ancre.f, 183);
  const xa = p.age.ancre.dx * 412;
  const r = Math.hypot(xa, ya - a.y);
  assert.ok(proche(r, 0.92 * AME.membrane * (a.cote / 2), 0.05), `rayon ${r}`);
  assert.ok(xa > 0 && ya < a.y, "côté épaule droite de l'écran");
  assert.deepEqual(lisiereAme(183), p.age.ancre);
  // VFC et FC visent le cœur anatomique, hors de l'âme
  for (const [id, ancre] of [["vfc", p.vfc.ancre], ["fc", p.fc.ancre], ["bloc", dispo.blocs.droite.haut.ancre]] as const) {
    const d = Math.hypot(ancre.dx * 412, yCorps(ancre.f, 183) - a.y);
    assert.ok(d > AME.membrane * (a.cote / 2) + 4, `${id} sur l'âme (${d.toFixed(1)} dp)`);
  }
  // la case n'existe qu'avec un âge ; elle porte l'écart signé
  const sans = casesSante({ sexe: "h", tailleCm: 183, poidsKg: 78 }, null, "kg");
  assert.equal(sans.find((k) => k.id === "age"), undefined);
  const avec = casesSante({ sexe: "h", tailleCm: 183, poidsKg: 78 }, null, "kg", { age: 34.9, ecart: -4.4 });
  const k = avec.find((x) => x.id === "age")!;
  assert.equal(k.ecart, -4.4);
  assert.equal(k.valeur, "34,9");
  assert.equal(k.ouvre, true);
});

test("SkSL de la signature : sans préprocesseur, compilé par CanvasKit, avec uLeger", async () => {
  assert.ok(!SKSL_AME.includes("#"), "SkSL n'a pas de #ifdef");
  const require = createRequire(import.meta.url);
  const CanvasKitInit = require("canvaskit-wasm/bin/full/canvaskit.js");
  const CK = await CanvasKitInit();
  let erreur = "";
  const effet = CK.RuntimeEffect.Make(SKSL_AME, (m: string) => (erreur = m));
  assert.ok(effet, erreur);
  const noms = Array.from({ length: effet.getUniformCount() }, (_, i) => effet.getUniformName(i));
  assert.ok(noms.includes("uLeger") && noms.includes("uFond"), noms.join(","));
});
