// Verrou d'ouverture (planche compte-connexion, H3, validée le 03/11 ; D5, D6 ; docs/CODE-VERROU.md) : délai de reverrouillage,
// séance en cours, téléphone sans verrou, réglage propre au téléphone, place dans Réglages et recherche, textes fr et en.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  CLE_VERROU, CLE_VERROU_DELAI, DELAI_VERROU_DEFAUT, DELAIS_VERROU, doitReverrouiller, etatVerrou, lireDelaiVerrou, suiteDeverrouillage,
} from "../src/verrou/regle.ts";
import { tableSync, voyage } from "../src/sync/schema.ts";
import { chemin, chercher, REGLAGES_INVENTAIRE } from "../src/ecrans/reglages/inventaire.ts";
import { fr, type Cle } from "../src/i18n/fr.ts";
import { en } from "../src/i18n/en.ts";

const RACINE = new URL("../", import.meta.url).pathname;
const lire = (f: string) => readFileSync(join(RACINE, f), "utf8");
const tr = (c: Cle) => String(fr[c]);
const trEn = (c: Cle) => String(en[c]);

test("délais : Aussitôt, 1, 5, 15 min ; 1 min par défaut ; une valeur inconnue revient au défaut", () => {
  assert.deepEqual([...DELAIS_VERROU], [0, 60, 300, 900]);
  assert.equal(DELAI_VERROU_DEFAUT, 60);
  assert.equal(lireDelaiVerrou(null), 60);
  assert.equal(lireDelaiVerrou(""), 60);
  assert.equal(lireDelaiVerrou("0"), 0);
  assert.equal(lireDelaiVerrou("300"), 300);
  assert.equal(lireDelaiVerrou("900"), 900);
  assert.equal(lireDelaiVerrou("120"), 60);
  assert.equal(lireDelaiVerrou("abc"), 60);
});

test("reverrouillage : compté depuis l'arrière-plan, au délai près", () => {
  const base = { actif: true, quitteA: 1_000_000, delaiS: 60, seanceEnCours: false };
  assert.equal(doitReverrouiller({ ...base, maintenant: 1_000_000 + 59_999 }), false);
  assert.equal(doitReverrouiller({ ...base, maintenant: 1_000_000 + 60_000 }), true);
  // Aussitôt : le moindre passage en arrière-plan
  assert.equal(doitReverrouiller({ ...base, delaiS: 0, maintenant: 1_000_000 }), true);
  assert.equal(doitReverrouiller({ ...base, delaiS: 900, maintenant: 1_000_000 + 14 * 60_000 }), false);
  assert.equal(doitReverrouiller({ ...base, delaiS: 900, maintenant: 1_000_000 + 15 * 60_000 }), true);
});

test("reverrouillage : rien pendant une séance, rien si éteint, rien sans passage en arrière-plan", () => {
  const loin = { quitteA: 0, maintenant: 3_600_000, delaiS: 60 };
  assert.equal(doitReverrouiller({ ...loin, actif: true, seanceEnCours: true }), false);
  assert.equal(doitReverrouiller({ ...loin, actif: false, seanceEnCours: false }), false);
  assert.equal(doitReverrouiller({ ...loin, actif: true, seanceEnCours: false, quitteA: null }), false);
});

test("réponse de la fenêtre : ok ouvre ; sans verrou ouvre et éteint (ne pas faire croire que c'est protégé) ; annulé reste fermé", () => {
  assert.deepEqual(suiteDeverrouillage("ok"), { ouvrir: true, eteindre: false });
  assert.deepEqual(suiteDeverrouillage("sansVerrou"), { ouvrir: true, eteindre: true });
  assert.deepEqual(suiteDeverrouillage("annule"), { ouvrir: false, eteindre: false });
  assert.deepEqual(suiteDeverrouillage("indisponible"), { ouvrir: false, eteindre: false });
});

test("sous-ligne de Verrouillage (3a) : Désactivé, Aussitôt, Après 1 min ; téléphone sans verrou : Désactivé", () => {
  const texte = (e: ReturnType<typeof etatVerrou>, d: (c: Cle) => string) => d(e.cle).replace("{min}", String(e.min));
  assert.equal(texte(etatVerrou(false, true, 60), tr), "Désactivé");
  assert.equal(texte(etatVerrou(true, true, 0), tr), "Aussitôt");
  assert.equal(texte(etatVerrou(true, true, 60), tr), "Après 1 min");
  assert.equal(texte(etatVerrou(true, null, 300), tr), "Après 5 min");
  assert.equal(texte(etatVerrou(true, false, 60), tr), "Désactivé");
  assert.equal(texte(etatVerrou(true, true, 900), trEn), "After 15 min");
});

test("le réglage reste sur ce téléphone : ni le verrou ni son délai ne voyagent", () => {
  const t = tableSync("reglages");
  assert.ok(t);
  assert.equal(voyage(t, CLE_VERROU), false);
  assert.equal(voyage(t, CLE_VERROU_DELAI), false);
});

test("Réglages › Préférences › Verrouillage : dans l'inventaire, la recherche le trouve en français et en anglais", () => {
  const e = REGLAGES_INVENTAIRE.find((x) => x.id === "verrou");
  assert.ok(e);
  assert.equal(e.route, "/settings/verrou");
  assert.equal(chemin(e, tr), "Réglages › Préférences");
  assert.equal(chercher("verrou", tr)[0]?.id, "verrou");
  assert.equal(chercher("app lock", trEn)[0]?.id, "verrou");
  assert.ok(chercher("reverrouille", tr).some((x) => x.id === "verrou-delai"));
  // la valeur affichée compte aussi : « aussitôt » trouve la ligne
  assert.ok(chercher("aussitot", tr, REGLAGES_INVENTAIRE, { verrou: ["Aussitôt"] }).some((x) => x.id === "verrou"));
  // la page existe et la ligne est sous Langue et région, dans Préférences
  const reglages = lire("src/app/settings/index.tsx");
  assert.ok(lire("src/app/settings/verrou.tsx").includes("export default function Verrouillage"));
  assert.ok(reglages.indexOf('t("verrou.titre")') > reglages.indexOf('t("menu.langueRegion")'));
  assert.ok(reglages.indexOf('t("verrou.titre")') < reglages.indexOf('t("menu.aide")'));
});

test("l'écran verrouillé passe avant l'appli ; l'aperçu des récents est masqué sans FLAG_SECURE", () => {
  const racine = lire("src/app/_layout.tsx");
  assert.ok(racine.indexOf("<GardeVerrou>") > racine.indexOf("<FournisseurApp>"));
  assert.ok(racine.indexOf("<GardeVerrou>") < racine.indexOf("<Stack"));
  const kt = lire("modules/pepfit-deverrouillage/android/src/main/java/fit/pep/deverrouillage/PepfitDeverrouillageModule.kt");
  assert.match(kt, /setRecentsScreenshotEnabled\(!oui\)/);
  assert.match(kt, /Function\("estProtege"\)/);
  assert.doesNotMatch(kt.replace(/\/\/.*$/gm, ""), /FLAG_SECURE/);
  // pas de mot de passe pepfit : seule la fenêtre du système déverrouille
  assert.match(lire("src/verrou/Verrou.tsx"), /deverrouiller\(t\("verrou\.fenetreTitre"\)/);
});

test("textes : chaque clé du verrou existe en français et en anglais, non vide", () => {
  const cles = (Object.keys(fr) as Cle[]).filter((c) => c.startsWith("verrou."));
  assert.ok(cles.length >= 15);
  for (const c of cles) {
    assert.ok(String(fr[c]).trim(), c);
    assert.ok(String(en[c]).trim(), c);
  }
});
