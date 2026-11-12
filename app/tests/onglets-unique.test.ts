// Un seul composant d'onglets dans l'appli (D5, planche onglets validée le 06/11) : ui/Onglets, en deux versions
// (simple et riche). Onglet = on change de panneau ; Segmenté = on choisit une valeur ou un filtre. Ce garde-fou échoue si un
// écran redessine ses propres onglets (rôle `tab` ou `tablist` hors du composant), si un ancien composant revient
// (OngletsPage, OngletsMateriel, largeursOnglets, Onglets maison), ou si un écran de la liste de migration n'utilise plus ui/Onglets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const COMPOSANT = "ui/Onglets.tsx";

/** Hors du composant, mais qui ne sont pas des onglets de page (planche onglets, « Hors du composant »). */
const AUTORISES: Record<string, string> = {
  "ui/MenuFlottant.tsx": "navigation principale de l'appli (menu du bas), autre composant déjà validé",
  "ui/BasculeVue.tsx": "bascule liste ou mois : deux boutons-icônes qui changent la vue d'une même page",
  "ecrans/mesures/Frise.tsx": "frise d'étapes (étape en cours), pas des panneaux",
};

/** Écrans de la liste de migration : chacun passe par ui/Onglets. */
const MIGRES = [
  "app/gym/[id].tsx",
  "ecrans/nutrition/Ajouter.tsx",
  "ecrans/recuperer-vues/FeuilleRecuperer.tsx",
];

function sources(dossier = SRC): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const f = join(dossier, n);
    if (statSync(f).isDirectory()) return sources(f);
    return /\.tsx?$/.test(f) ? [relative(SRC, f)] : [];
  });
}
const lire = (f: string) => readFileSync(join(SRC, f), "utf8");

test("onglets uniques : le rôle tab ou tablist n'existe que dans ui/Onglets (et trois exceptions qui n'en sont pas)", () => {
  const fautes = sources()
    .filter((f) => f !== COMPOSANT && !(f in AUTORISES))
    .filter((f) => /accessibilityRole=(["{]\s*)?["']?tab(list)?["']?|accessibilityRole:\s*["']tab(list)?["']|role=["']tab/.test(lire(f)));
  assert.deepEqual(fautes, [], "un onglet de page passe par ui/Onglets (simple ou riche)");
  for (const f of Object.keys(AUTORISES)) assert.ok(existsSync(join(SRC, f)), `${f} : l'exception est périmée, retire-la de la liste`);
});

test("onglets uniques : les anciens composants ne reviennent pas", () => {
  for (const ancien of ["ui/OngletsMateriel.tsx"]) {
    assert.equal(existsSync(join(SRC, ancien)), false, `${ancien} a été remplacé par ui/Onglets`);
  }
  const fautes: string[] = [];
  for (const f of sources()) {
    const s = lire(f);
    if (/\b(OngletsPage|OngletsMateriel|largeursOnglets)\b/.test(s)) fautes.push(`${f} : ancien composant d'onglets`);
    // _layout.tsx : le navigateur du menu du bas s'appelle Onglets (route), ce n'est pas un composant de page
    if (f !== COMPOSANT && !f.endsWith("_layout.tsx") && /\bfunction Onglets\w*\s*[(<]|\bconst Onglets\w*\s*=\s*(\(|memo\()/.test(s) && !/OngletsRecuperer/.test(s)) fautes.push(`${f} : un Onglets maison`);
  }
  assert.deepEqual(fautes, []);
});

test("onglets uniques : l'enveloppe OngletsRecuperer ne fait que poser ui/Onglets", () => {
  for (const [f, nom] of [["ecrans/recuperer-vues/FeuilleRecuperer.tsx", "OngletsRecuperer"]] as const) {
    const s = lire(f);
    const i = s.indexOf(`function ${nom}`);
    assert.ok(i >= 0, `${f} : ${nom} est introuvable`);
    const corps = s.slice(i, s.indexOf("\n}\n", i));
    assert.match(corps, /<Onglets\b/, `${nom} pose le composant unique`);
    assert.doesNotMatch(corps, /Pressable|onPress|accessibilityRole/, `${nom} ne redessine pas d'onglet`);
  }
});

test("onglets uniques : chaque écran de la liste de migration importe ui/Onglets", () => {
  const fautes = MIGRES.filter((f) => !/from "(\.\.\/)+ui\/Onglets"|from "\.\/Onglets"/.test(lire(f)));
  assert.deepEqual(fautes, [], "ces écrans ont quitté ui/Onglets");
});

test("onglets uniques : les écrans à onglets de page ne passent plus par un Segmenté de navigation", () => {
  // Un Segmenté qui change de panneau est un onglet : ces écrans ont les deux (onglets pour les panneaux, Segmenté pour les filtres).
  for (const f of ["app/gym/[id].tsx"]) {
    assert.doesNotMatch(lire(f), /<Segmente\b/, `${f} : les panneaux passent par ui/Onglets`);
  }
});

test("onglets uniques : le composant garde ses deux versions et le glissé latéral", () => {
  const s = lire(COMPOSANT);
  assert.match(s, /version\??:\s*"simple"\s*\|\s*"riche"/);
  assert.match(s, /export function PanneauxOnglets/);
  assert.match(s, /accessibilityRole="tablist"/);
  assert.match(s, /accessibilityRole="tab"/);
});
