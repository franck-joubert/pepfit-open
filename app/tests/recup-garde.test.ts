// Garde de la Récupération pepfit (planche recuperation) : aucun texte affiché ne nomme Whoop ni n'écrit « ~ » ; le score de
// Whoop (whoop_jour.recup) n'est lu que par le labo de comparaison ; « 90 % » s'écrit avec son petit « % » ; rien de médical.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fr } from "../src/i18n/dico-fr/mesures-recup.ts";
import { en } from "../src/i18n/dico-en/mesures-recup.ts";

const textes = (d: Record<string, unknown>) => Object.values(d).flatMap((v) => (typeof v === "string" ? [v] : Object.values(v as Record<string, string>)));

test("les textes de la Récupération ne nomment jamais Whoop, n'écrivent pas « ~ » et ne parlent pas de soin", () => {
  for (const s of [...textes(fr), ...textes(en)]) {
    assert.doesNotMatch(s, /whoop/i, s);
    assert.doesNotMatch(s, /[~≈]/, s);
    assert.doesNotMatch(s, /médic|maladi|malade|blessure|medical|illness|injur/i, s);
  }
  assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort(), "mêmes clés en français et en anglais");
});

test("« 90 % » : le petit « % » en français et en anglais", () => {
  assert.equal(fr["recup.pourcent"], "{n}\u00a0%", "espace insécable : le « % » ne passe jamais seul à la ligne");
  assert.equal(en["recup.pourcent"], "{n}%");
});

/** Les fichiers de l'appli ; le dossier Whoop (sa synchro range le score, sans l'afficher) et le schéma sont écartés par le test. */
function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    return statSync(p).isDirectory() ? fichiers(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

test("le score de Récupération de Whoop n'est lu que par le labo de comparaison", () => {
  const racine = new URL("../src/", import.meta.url).pathname;
  const lecteurs = fichiers(racine)
    .filter((p) => !p.includes("/whoop/") && !p.includes("/db/"))
    .filter((p) => /SELECT[^"`]*\brecup\b[^"`]*FROM whoop_jour|whoop_jour[^"`]*\brecup\b/.test(readFileSync(p, "utf8")))
    .map((p) => p.slice(racine.length));
  assert.deepEqual(lecteurs, ["ecrans/recup-donnees.ts"]);
  const source = readFileSync(join(racine, "ecrans/recup-donnees.ts"), "utf8");
  const avant = source.slice(0, source.indexOf("// ---------------------------------------------------------------- labo"));
  assert.doesNotMatch(avant, /\brecup\b[^_]*FROM whoop_jour/, "hors du labo, jamais lu");
});
