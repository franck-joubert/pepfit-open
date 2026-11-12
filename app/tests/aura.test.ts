// Aura commune : teintes de la planche, cadence (repos 6 s, arrêt 14 s), défilement (35 %, effacée à 520 px), glissement.
import assert from "node:assert/strict";
import { test } from "node:test";
import { degrades, type Partie } from "../src/theme/effets.ts";
import {
  ALPHA_AURA,
  cadenceAura,
  cibleAura,
  decalageAura,
  DESATURATION_PASSE,
  desaturerRvb,
  dureeGlisse,
  melangerAura,
  nappesAura,
  opaciteAura,
  sortieQuart,
} from "../src/ui/aura-calc.ts";

const PARTIES = ["accueil", "entrainement", "nutrition", "sante"] as const satisfies readonly Partie[];

test("les teintes sont celles du dégradé de la partie : claire, médiane, foncée", () => {
  for (const p of PARTIES) {
    const c = cibleAura(p, "nuit");
    assert.equal(c.length, 21);
    const hex = (i: number) => "#" + [0, 1, 2].map((k) => Math.round(c[i + k]!).toString(16).padStart(2, "0")).join("");
    // ordre de dessin : claire, foncée, médiane
    assert.equal(hex(9), degrades[p].arrets[0]!.couleur);
    assert.equal(hex(12), degrades[p].arrets[2]!.couleur);
    assert.equal(hex(15), degrades[p].arrets[1]!.couleur);
  }
});

test("intensité : nuit 30/42/32 %, jour 22/30/20 % (claire, médiane, foncée)", () => {
  assert.deepEqual(ALPHA_AURA.nuit, [0.3, 0.42, 0.32]);
  assert.deepEqual(ALPHA_AURA.jour, [0.22, 0.3, 0.2]);
  assert.deepEqual(cibleAura("sante", "nuit").slice(18), [0.3, 0.32, 0.42]);
  assert.deepEqual(cibleAura("sante", "jour").slice(18), [0.22, 0.2, 0.3]);
});

test("cadence : pleine, 15 i/s après 6 s, arrêt après 14 s", () => {
  assert.equal(cadenceAura(0), "pleine");
  assert.equal(cadenceAura(5999), "pleine");
  assert.equal(cadenceAura(6000), "repos");
  assert.equal(cadenceAura(13999), "repos");
  assert.equal(cadenceAura(14000), "arret");
});

test("défilement : 35 % de la vitesse jusqu'à 220 dp, puis fixée et toujours visible, jamais avant le haut", () => {
  assert.equal(decalageAura(0), -0);
  assert.equal(decalageAura(100), -35);
  assert.equal(decalageAura(-40), -0);
  assert.equal(decalageAura(600), -600 * 0.35);
  assert.equal(decalageAura(2000), -220);
  assert.equal(opaciteAura(0), 1);
  assert.equal(opaciteAura(900), 1);
});

test("glissement : 1,1 s, ou 0,2 s en mouvement réduit ; part de l'ancienne teinte et arrive à la nouvelle", () => {
  assert.equal(dureeGlisse(false), 1100);
  assert.equal(dureeGlisse(true), 200);
  const a = cibleAura("accueil", "nuit");
  const b = cibleAura("sante", "nuit");
  assert.deepEqual(melangerAura(a, b, sortieQuart(0)), a);
  assert.deepEqual(melangerAura(a, b, sortieQuart(1)), b);
  assert.ok(sortieQuart(0.5) > 0.9, "sortie douce : presque arrivé à mi-course");
});

test("nappes : immobiles en amplitude 0, bornées en pleine, opacité du cœur celle de l'état", () => {
  const e = cibleAura("accueil", "jour");
  const fixe1 = nappesAura(e, 0, 0, 412);
  const fixe2 = nappesAura(e, 37, 0, 412);
  assert.deepEqual(fixe1, fixe2);
  assert.equal(fixe1[0]!.x, 0.2 * 412);
  assert.match(fixe1[0]!.coeur, /,0\.220\)$/);
  assert.match(fixe1[0]!.bord, /,0\.000\)$/);
  for (let t = 0; t < 40; t += 3) {
    const n = nappesAura(e, t, 1, 412);
    assert.ok(Math.abs(n[0]!.x - 0.2 * 412) <= 0.09 * 412 + 1e-6);
    assert.ok(Math.abs(n[0]!.r / (0.62 * 412 * 1.55) - 1) <= 0.0601);
  }
});

test("jour passé de Sport : l'aura se désature un peu, sans tourner au gris ni changer de luminance", () => {
  const lum = (c: readonly number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  const orange = [255, 122, 40] as const;
  assert.deepEqual(desaturerRvb(...orange, 0), [...orange]);
  const passe = desaturerRvb(...orange, DESATURATION_PASSE);
  const gris = desaturerRvb(...orange, 1);
  assert.ok(Math.abs(gris[0] - gris[2]) < 1e-9, "à 1, gris");
  assert.ok(Math.abs(lum(passe) - lum(orange)) < 1e-9, "luminance gardée");
  // un repère discret : l'écart rouge-bleu reste au moins la moitié de l'original
  assert.ok(passe[0] - passe[2] >= (orange[0] - orange[2]) / 2);
  assert.ok(passe[0] - passe[2] < orange[0] - orange[2]);
  // nappesAura applique la désaturation aux trois nappes, 0 par défaut
  const e = cibleAura("entrainement", "nuit");
  assert.deepEqual(nappesAura(e, 3, 1, 412, 0), nappesAura(e, 3, 1, 412));
  assert.notEqual(nappesAura(e, 3, 1, 412, DESATURATION_PASSE)[0]!.coeur, nappesAura(e, 3, 1, 412)[0]!.coeur);
});

test("halo des pages partagées : couple par page, entrée depuis l'onglet sans saut, puis le mélange", async () => {
  const { CYCLE_HALO_MS, HALOS_PAGES, etatHalo, etatMarie } = await import("../src/ui/aura-calc.ts");
  assert.deepEqual(HALOS_PAGES.energie, ["entrainement", "nutrition"]);
  assert.deepEqual(HALOS_PAGES.pas, ["entrainement", "sante"]);
  assert.ok(CYCLE_HALO_MS >= 10000 && CYCLE_HALO_MS <= 20000, "mouvement lent");
  // à l'ouverture, exactement la teinte de l'onglet d'origine : aucun saut
  const sante = cibleAura("sante", "nuit");
  const sport = cibleAura("entrainement", "nuit");
  const vert = cibleAura("nutrition", "nuit");
  assert.deepEqual(etatHalo(sante, sport, vert, 0, 0), sante);
  // une fois entré, le mélange seul ; la phase sans borne boucle sans saut
  const marie = etatMarie(sport, vert, 0.3);
  etatHalo(sante, sport, vert, 0.3, 1).forEach((v, i) => assert.ok(Math.abs(v - marie[i]!) < 1e-9));
  etatMarie(sport, vert, 1000.3).forEach((v, i) => assert.ok(Math.abs(v - etatMarie(sport, vert, 0.3)[i]!) < 1e-6));
});

test("pages au halo partagé lues sur la route : l'aura des onglets garde alors sa teinte", async () => {
  const { pageHaloDe } = await import("../src/ui/aura-calc.ts");
  assert.equal(pageHaloDe("/sante/energie"), "energie");
  assert.equal(pageHaloDe("/sante/pas"), "pas");
  assert.equal(pageHaloDe("/sante/effort"), "effort");
  assert.equal(pageHaloDe("/sante/sommeil"), null);
  assert.equal(pageHaloDe("/sante/constructor"), null);
  assert.equal(pageHaloDe("/train"), null);
});
