// En-tête collé (semainier, ligne des macros) : sans fond, une ombre seule ; ligne collée en fondu sur le fil UI (retour de
// Alex du 30/10 sur le Fold : « pas nécessaire de mettre un fond […] l'ombre suffit », « on dirait ça bug sans transition »).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ombreColle, type Partie } from "../src/theme/effets.ts";

const lire = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const PARTIES: Partie[] = ["accueil", "entrainement", "nutrition", "sante"];

test("ombre de l'en-tête collé : s'estompe jusqu'à rien, noire la nuit, très légère le jour", () => {
  for (const p of PARTIES) {
    for (const mode of ["nuit", "jour"] as const) {
      const a = ombreColle(p, mode);
      assert.equal(a[0]!.offset, 0);
      assert.equal(a.at(-1)!.offset, 1);
      assert.equal(a.at(-1)!.opacite, 0, `${p} ${mode} : finit transparente`);
      for (let i = 1; i < a.length; i++) assert.ok(a[i]!.opacite! < a[i - 1]!.opacite!, `${p} ${mode} : décroissante`);
      assert.ok(a[0]!.opacite! <= (mode === "nuit" ? 0.3 : 0.12), `${p} ${mode} : douce`);
    }
    assert.equal(ombreColle(p, "nuit")[0]!.couleur, "#000000");
  }
});

test("zone collée sans fond ; ligne collée animée sur le fil UI, en translateY, « réduire » respecté", () => {
  const zone = lire("ui/ZoneSemainier.tsx");
  assert.doesNotMatch(zone, /verreCarte/, "plus de bande de fond teintée");
  assert.match(zone, /ombreColle\(partie, mode\)/);
  assert.match(
    zone,
    /colle\.value = withTiming\(vu \? 1 : 0, \{ duration: vu && !reduit \? duree\.entree : duree\.sortie, easing: courbes\.sortie, reduceMotion: ReduceMotion\.Never \}\)/,
    "fondu de 200 ms (150 au départ et en mouvement réduit), jamais sauté par Reanimated",
  );
  assert.doesNotMatch(zone, /useAnimatedStyle\(\(\) => \(\{\s*(height|top):/, "aucune hauteur ni position animée");
  // Mouvement réduit : le bord se pose d'un coup (état visé), pas de glissé ; le fondu reste.
  assert.match(zone, /reduit \? colleVue\.value : fondu\.value/);
  assert.match(zone, /reduit \? 0 : GLISSE_COLLE/);
  const journal = lire("ecrans/nutrition/Journal.tsx");
  assert.match(journal, /zone\.montrerColle\(/);
  assert.doesNotMatch(journal, /setColleAffiche|hauteurColle=/, "plus de remise en page au seuil (le bord sautait)");
});
