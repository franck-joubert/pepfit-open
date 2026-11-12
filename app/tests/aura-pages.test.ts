// Aura des pages poussées : elle suit le défilement de la page comme celle des onglets (35 %, fixée après 220 dp), par un seul
// mécanisme (useDefilementAura, ui/aura-etat.ts), sur le thread UI. Un test structurel garantit que toute page à défilement
// vertical qui pose une aura fixe le branche, hors exceptions justifiées.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const SRC = new URL("../src/", import.meta.url).pathname;
const lire = (f: string) => readFileSync(join(SRC, f), "utf8");

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    return statSync(p).isDirectory() ? fichiers(p) : /\.tsx$/.test(n) ? [relative(SRC, p)] : [];
  });
}

/** Pages qui posent une aura fixe et défilent, mais la laissent immobile (fichier → raison). */
const EXCEPTIONS: Record<string, string> = {
  "app/welcome.tsx": "accueil de première ouverture : étapes à écran fixe, les ScrollView ne sont que des zones de choix dans une étape",
};

const defile = (s: string) => /<(Animated\.)?(ScrollView|FlatList)\b/.test(s);
const poseAura = (s: string) => /<(AuraFond|HaloPartage)\b/.test(s);

test("toute page poussée à défilement qui pose une aura fixe branche son défilement (useDefilementAura)", () => {
  const manque: string[] = [];
  for (const f of fichiers(SRC)) {
    if (f === "ui/AuraFond.tsx" || f.startsWith("app/(tabs)/")) continue;
    const s = lire(f);
    if (!poseAura(s) || !defile(s) || f in EXCEPTIONS) continue;
    const branche = /useDefilementAura\(/.test(s) && /onScroll=\{surDefilement\}/.test(s) && /<(AuraFond|HaloPartage)\b[^>]*\bdefilement=\{/.test(s);
    if (!branche) manque.push(f);
  }
  assert.deepEqual(manque, [], "pages à défilement dont l'aura reste immobile : brancher useDefilementAura, ou l'ajouter aux exceptions avec sa raison");
});

test("les exceptions sont à jour : elles posent encore une aura fixe, défilent, et ne branchent rien", () => {
  for (const [f, raison] of Object.entries(EXCEPTIONS)) {
    const s = lire(f);
    assert.ok(raison.length > 20, `${f} : raison`);
    assert.ok(poseAura(s) && defile(s), `${f} n'a plus de quoi être une exception`);
    assert.doesNotMatch(s, /useDefilementAura/, `${f} branche déjà son défilement : retirer l'exception`);
  }
});

test("les gabarits de page sont branchés", () => {
  for (const f of ["ecrans/mesures/gabarit.tsx", "ecrans/suivi-ui.tsx", "ecrans/precision/PagePrecision.tsx"]) {
    assert.match(lire(f), /useDefilementAura\(/, f);
    assert.match(lire(f), /<Animated\.ScrollView\b/, f);
  }
});

test("un seul mécanisme : le défilement d'une page est une valeur partagée écrite sur le thread UI, sans setState ni défilement des onglets", () => {
  const etat = lire("ui/aura-etat.ts");
  const hook = etat.slice(etat.indexOf("export function useDefilementAura"), etat.indexOf("/** Une partie qui pose"));
  assert.match(hook, /useAnimatedScrollHandler/);
  assert.doesNotMatch(hook, /useState|setState|signalerDefilement|defilementAura\.value/, "l'aura d'une page ne touche pas à celle de l'onglet");
  // l'aura fixe suit la valeur de la page ; sans elle, rien ; celle de l'onglet reste `defilementAura`
  const fond = lire("ui/AuraFond.tsx");
  assert.match(fond, /defilement=\{fixe \? \(defilement \?\? null\) : defilementAura\}/);
  assert.match(fond, /translateY: defilement && !reduit \? decalageAura\(defilement\.value\) : 0/, "mouvement réduit : pas de décalage");
  assert.doesNotMatch(fond, /decalageAura\(defilementAura\.value\)/);
});

test("un défilement de page ne demande la suite de sa liste qu'au plus toutes les 200 ms", () => {
  const etat = lire("ui/aura-etat.ts");
  assert.match(etat, /PAUSE_FIN_MS = 200/);
});
