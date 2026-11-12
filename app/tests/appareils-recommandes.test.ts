// Page Appareils recommandés (planche appareils-recommandes-v5) : capacités par marque, hôte du téléphone selon la plateforme,
// textes fr et en, route ouverte depuis Connexions et nulle part ailleurs.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { CONNEXION_DIRECTE, ICONE_CAPACITE, MARQUES, capacitesEtat, hotes, plateformeDeLaVue, type CapaciteId } from "../src/appareils/appareils-donnees.ts";
import { IMAGE_APPLE_SANTE, IMAGE_SANTE_CONNECT } from "../src/appareils/images-hotes.ts";
import { logoPolar, logoWhoop, logoWithings } from "../src/appareils/logos-marques.ts";
import { fr } from "../src/i18n/dico-fr/appareils-reco.ts";
import { en } from "../src/i18n/dico-en/appareils-reco.ts";

const RACINE = new URL("..", import.meta.url).pathname;
const lire = (f: string) => readFileSync(join(RACINE, f), "utf8");
const liste = (m: keyof typeof MARQUES) => MARQUES[m].capacites.map((c) => `${c.id}:${c.etat}`);

test("capacités par marque : celles de la planche, dans l'ordre", () => {
  assert.deepEqual(liste("telephone"), ["fc:plein", "vfc:plein", "sommeil:plein", "pas:plein", "seances:plein", "poids:plein"]);
  assert.deepEqual(liste("whoop"), ["sommeil:plein", "vfc:plein", "temp:plein", "seances:plein", "pas:essai"]);
  assert.deepEqual(liste("withings"), ["poids:plein", "compo:plein", "sommeil:plein", "pas:plein", "temp:plein", "fc:plein"]);
  assert.deepEqual(liste("polar"), ["seances:bientot", "sommeil:bientot", "vfc:bientot", "fc:bientot", "pas:bientot"]);
  assert.deepEqual(liste("ceinture"), ["fcSeance:plein", "vfc:bientot"]);
});

test("Withings : poids, composition, sommeil, pas, température et FC en plein ; Polar est une carte « bientôt » entière", () => {
  assert.deepEqual(capacitesEtat("withings", "plein"), ["poids", "compo", "sommeil", "pas", "temp", "fc"]);
  assert.deepEqual(capacitesEtat("withings", "bientot"), []);
  assert.equal(MARQUES.polar.bientot, true);
  assert.ok(MARQUES.polar.capacites.every((c) => c.etat === "bientot"));
  assert.ok(!MARQUES.whoop.bientot && !MARQUES.withings.bientot);
  assert.deepEqual(capacitesEtat("whoop", "essai"), ["pas"]);
  assert.deepEqual(CONNEXION_DIRECTE, ["whoop", "withings", "polar"]);
});

test("la plateforme choisit le service en grand : Santé Connect sur Android, Apple Santé sur iPhone", () => {
  assert.deepEqual(hotes("android"), { principal: "santeConnect", autre: "appleSante" });
  assert.deepEqual(hotes("ios"), { principal: "appleSante", autre: "santeConnect" });
  assert.equal(plateformeDeLaVue(undefined, "ios"), "ios");
  assert.equal(plateformeDeLaVue(undefined, "android"), "android");
  assert.equal(plateformeDeLaVue(undefined, "web"), "android");
  // ?vue= force la plateforme (captures)
  assert.equal(plateformeDeLaVue("iphone", "android"), "ios");
  assert.equal(plateformeDeLaVue("android", "ios"), "android");
});

const TOUTES: CapaciteId[] = ["fc", "fcSeance", "vfc", "sommeil", "pas", "seances", "poids", "compo", "temp"];
const dicos = [fr, en] as Record<string, string>[];

test("textes fr et en présents pour chaque capacité, chaque étiquette et chaque phrase", () => {
  assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
  for (const id of TOUTES) for (const d of dicos) assert.ok((d[`appareilsReco.cap.${id}`]?.length ?? 0) > 0, id);
  const attendues = ["ligne", "titre", "intro", "viaTelephone", "santeConnect", "appleSante", "android", "iphone", "autreAvant", "autreApres", "compat", "connexionDirecte", "interet", "bientot", "essai", "enSeance", "ceinture", "pied"];
  for (const k of attendues) for (const d of dicos) assert.ok((d[`appareilsReco.${k}`]?.length ?? 0) > 0, k);
  for (const m of Object.values(MARQUES)) for (const c of m.capacites) assert.ok(`appareilsReco.cap.${c.id}` in fr);
  assert.equal(fr["appareilsReco.titre"], "Appareils");
  assert.equal(fr["appareilsReco.interet"], "Données lues chez la marque, sans son appli ni Santé Connect : récupération et température en plus.");
  assert.equal(fr["appareilsReco.pied"], "pepfit calcule tout seul, les connexions sont un bonus.");
});

test("aucun point médian, « store » ni « bloc » dans les textes (fr et en)", () => {
  for (const d of dicos) {
    for (const v of Object.values(d)) {
      assert.ok(!/[·•]/.test(v), v);
      assert.ok(!/\b(stores?|blocs?|blocks?)\b/i.test(v), v);
    }
  }
});

test("aucun texte en dur dans l'écran : tout passe par t()", () => {
  const src = lire("src/ecrans/Appareils.tsx");
  assert.ok(!/>\s*[A-ZÀ-ÿ][a-zà-ÿ]+[^<{]*</.test(src.replace(/<Texte[^>]*>\s*\{/g, "")), "texte JSX en dur");
  assert.ok(!/[·]/.test(src));
});

test("icônes : celles de l'appli, toutes définies dans ui/Icone.tsx", () => {
  const icone = lire("src/ui/Icone.tsx");
  for (const id of TOUTES) assert.ok(new RegExp(`^  ${ICONE_CAPACITE[id]}:`, "m").test(icone), ICONE_CAPACITE[id]);
});

test("logos et images embarqués : aucun réseau", () => {
  for (const xml of [logoWhoop, logoWithings, logoPolar]) {
    assert.ok(xml.startsWith("<svg") && xml.includes("<path"));
    assert.ok(!/<image|href=|url\(/.test(xml));
  }
  for (const img of [IMAGE_SANTE_CONNECT, IMAGE_APPLE_SANTE]) {
    assert.ok(img.startsWith("data:image/png;base64,iVBORw0KGgo"));
    assert.ok(img.length > 2000);
  }
});

const sources = (dossier: string): string[] =>
  readdirSync(join(RACINE, dossier)).flatMap((n) => {
    const rel = `${dossier}/${n}`;
    return statSync(join(RACINE, rel)).isDirectory() ? sources(rel) : /\.tsx?$/.test(n) ? [rel] : [];
  });

test("route /settings/appareils : établie depuis Connexions, depuis nulle part ailleurs", () => {
  assert.ok(existsSync(join(RACINE, "src/app/settings/appareils.tsx")));
  const connexions = lire("src/app/settings/connexions.tsx");
  assert.match(connexions, /router\.push\("\/settings\/appareils"\)/);
  assert.match(connexions, /t\("appareilsReco\.ligne"\)/);
  const ailleurs = sources("src").filter((f) => !["src/app/settings/connexions.tsx", "src/app/settings/appareils.tsx"].includes(f) && lire(f).includes("settings/appareils"));
  assert.deepEqual(ailleurs, []);
});
