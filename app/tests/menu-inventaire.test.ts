// Volet court et page Réglages (planche menu, B validée le 01/11 ; docs/CODE-MENU.md) : aucune entrée de l'ancien menu ne se
// perd, chaque ancienne route mène quelque part, la recherche trouve tout.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  ANCIENNES_ROUTES, chemin, chercher, REGLAGES_INVENTAIRE, ROUTE_PARTIE, ROUTES_ANCIEN_MENU, VOLET,
} from "../src/ecrans/reglages/inventaire.ts";
import { fr } from "../src/i18n/fr.ts";
import { en } from "../src/i18n/en.ts";
import type { Cle } from "../src/i18n/fr.ts";

const APP = new URL("../src/app/", import.meta.url).pathname;
const SRC = new URL("../src/", import.meta.url).pathname;
const lire = (f: string) => readFileSync(join(SRC, f), "utf8");
const tr = (c: Cle) => String(fr[c]);

/**
 * Chaque entrée du menu du 31/10 (NOTES § 1, inventaire) → son id dans le nouveau rangement. Le profil public, le compte, le
 * coach, la connexion IA et le fil sont partis avec la version libre.
 */
const ANCIEN_MENU: Record<string, string> = {
  "volet › Précision pepfit": "precision",
  "volet › Mensurations": "mensurations",
  "volet › Mes aliments": "aliments",
  "volet › Mes plats": "plats",
  "volet › Lieux": "lieux",
  "volet › Parties de l'appli": "onglets",
  "volet › Préférences": "reglages",
  "volet › Connexions": "importer",
  "volet › Données et confidentialité": "sauvegarde",
  "volet › Refaire la première utilisation": "rejouer",
  "Préférences › Toi › Prénom": "prenom",
  "Préférences › Toi › Sexe": "sexe",
  "Préférences › Toi › Date de naissance": "naissance",
  "Préférences › Toi › Taille": "taille",
  "Préférences › Général › Apparence": "apparence",
  "Préférences › Général › Personnage 3D": "personnage",
  "Préférences › Général › Langue": "langue",
  "Préférences › Général › Fuseau": "fuseau",
  "Préférences › Général › Poids": "poids",
  "Préférences › Général › Distance": "distance",
  "Préférences › Séance › Repos par défaut": "repos-defaut",
  "Préférences › Séance › Fin du repos": "fin-repos",
  "Préférences › Séance › Son": "son-repos",
  "Préférences › Séance › Guidage": "guidage",
  "Préférences › Séance › Zones de FC": "zones",
  "Préférences › Séance › Reconnaissance des activités": "reconnaissance",
  "Préférences › Séance › Écran toujours allumé": "ecran-allume",
  "Préférences › Séance › 1RM estimé en séance": "un-rm",
  "Préférences › Séance › Demander l'effort": "demander-effort",
  "Préférences › Séance › Heure des séances": "heure-seances",
  "Préférences › Séance › Rappel": "rappel",
  "Préférences › Nutrition et santé › Objectifs": "objectifs",
  "Préférences › Nutrition et santé › Repas et horaires": "repas",
  "Préférences › Nutrition et santé › Méthode du métabolisme": "metabolisme",
  "Repas et horaires › Rappel des repas": "rappel-repas",
  "Connexions › Santé › Santé Connect": "sante-connect",
  "Connexions › Santé › Withings": "withings",
  "Connexions › Santé › Whoop": "whoop",
  "Connexions › Séances › Batterie": "batterie",
  "Connexions › Importer › Hevy": "hevy",
  "Données › Sauvegarde › Sauvegarder maintenant": "sauvegarder",
  "Données › Sauvegarde › Emplacement": "emplacement",
  "Données › Sauvegarde › Automatique": "automatique",
  "Données › Sauvegarde › Garder": "garder",
  "Données › Sauvegarde › Sauvegarde lisible": "lisible",
  "Données › Sauvegarde › Phrase de secours": "phrase",
  "Données › Sauvegarde › Restaurer": "restaurer",
  "Données › Mes données › Exporter": "exporter",
  "Données › Confidentialité › Améliorer la précision de pepfit": "precision-commune",
  "Données › Confidentialité › Politique de confidentialité": "politique",
  "Données › Confidentialité › Effacer les données de ce téléphone": "effacer",
  "Accueil › appui long › Modifier l'accueil": "cartes-accueil",
};


/** Fichier d'écran d'une route expo-router (« /settings/partie/sport » → settings/partie/[id].tsx), ou null. */
function ecranDe(route: string): string | null {
  const parties = route.split(/[?#]/)[0]!.replace(/^\/+/, "").split("/").filter(Boolean);
  if (!parties.length) return existsSync(join(APP, "(tabs)/index.tsx")) ? "(tabs)/index.tsx" : null;
  let dossier = APP;
  const chemin: string[] = [];
  for (let i = 0; i < parties.length; i++) {
    const p = parties[i]!;
    const dernier = i === parties.length - 1;
    const fichiers = existsSync(dossier) ? readdirSync(dossier) : [];
    const dyn = fichiers.find((f) => /^\[[^\]]+\](\.tsx)?$/.test(f) && (dernier ? f.endsWith(".tsx") || existsSync(join(dossier, f, "index.tsx")) : !f.endsWith(".tsx")));
    if (dernier) {
      if (fichiers.includes(`${p}.tsx`)) return [...chemin, `${p}.tsx`].join("/");
      if (existsSync(join(dossier, p, "index.tsx"))) return [...chemin, p, "index.tsx"].join("/");
      if (i === 0 && existsSync(join(APP, "(tabs)", `${p}.tsx`))) return `(tabs)/${p}.tsx`;
      if (dyn) return [...chemin, dyn.endsWith(".tsx") ? dyn : `${dyn}/index.tsx`].join("/");
      return null;
    }
    if (fichiers.includes(p)) {
      dossier = join(dossier, p);
      chemin.push(p);
    } else if (dyn) {
      dossier = join(dossier, dyn);
      chemin.push(dyn);
    } else return null;
  }
  return null;
}

test("le résolveur de routes du test reconnaît les écrans", () => {
  assert.equal(ecranDe("/settings/partie/sport"), "settings/partie/[id].tsx");
  assert.equal(ecranDe("/settings"), "settings/index.tsx");
  assert.equal(ecranDe("/?modifier=1"), "(tabs)/index.tsx");
  assert.equal(ecranDe("/history"), "history/index.tsx");
  assert.equal(ecranDe("/n-existe-pas"), null);
});

test("chaque entrée de l'ancien menu a une place dans le nouveau", () => {
  const ids = new Set([...REGLAGES_INVENTAIRE.map((e) => e.id), ...VOLET.map((v) => v.id)]);
  for (const [ancien, id] of Object.entries(ANCIEN_MENU)) assert.ok(ids.has(id), `${ancien} → ${id} : sans place`);
  // Assez d'entrées pour couvrir l'inventaire de NOTES § 1 (volet, Préférences, Connexions, Données, Accueil).
  assert.ok(Object.keys(ANCIEN_MENU).length >= 50);
});

test("chaque réglage et chaque ligne du volet s'ouvre sur un écran qui existe", () => {
  const vus = new Set<string>();
  for (const e of REGLAGES_INVENTAIRE) {
    assert.ok(!vus.has(e.id), `id en double : ${e.id}`);
    vus.add(e.id);
    assert.ok(ecranDe(e.route), `${e.id} : ${e.route} n'existe pas`);
    assert.ok(e.ou.length > 0, e.id);
    for (const c of [e.libelle, ...e.ou]) {
      assert.ok(fr[c], `${e.id} : clé ${c} absente (fr)`);
      assert.ok(en[c as keyof typeof en], `${e.id} : clé ${c} absente (en)`);
    }
  }
  for (const v of VOLET) assert.ok(ecranDe(v.route), `volet ${v.id} : ${v.route}`);
});

test("chaque ancienne route mène quelque part ; les redirections vont vers la nouvelle adresse", () => {
  for (const r of ROUTES_ANCIEN_MENU) {
    const f = ecranDe(r);
    assert.ok(f, `${r} : plus d'écran`);
    const source = readFileSync(join(APP, f), "utf8");
    const redirige = /<Redirect\b/.test(source);
    const cible = ANCIENNES_ROUTES[r.split("?")[0]!];
    if (redirige) {
      assert.ok(cible, `${r} redirige sans être dans ANCIENNES_ROUTES`);
      assert.match(source, new RegExp(`href="${cible.replace(/[/]/g, "\\/")}"`), `${r} → ${cible}`);
      assert.ok(ecranDe(cible), `${r} → ${cible} : la cible n'existe pas`);
      assert.doesNotMatch(readFileSync(join(APP, ecranDe(cible)!), "utf8"), /<Redirect\b/, `${cible} : redirection en chaîne`);
    } else assert.equal(cible, undefined, `${r} est dans ANCIENNES_ROUTES mais ne redirige pas`);
  }
  assert.deepEqual(ANCIENNES_ROUTES, { "/settings/preferences": "/settings", "/settings/workout": ROUTE_PARTIE.sport });
});

test("plus aucun écran ne mène aux anciennes adresses", () => {
  const fichiers: string[] = [];
  const parcourir = (d: string) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory()) parcourir(p);
      else if (/\.tsx?$/.test(f.name)) fichiers.push(p);
    }
  };
  parcourir(SRC);
  for (const f of fichiers) {
    if (f.endsWith("ecrans/reglages/inventaire.ts")) continue;
    const s = readFileSync(f, "utf8");
    for (const ancienne of Object.keys(ANCIENNES_ROUTES)) assert.ok(!s.includes(`"${ancienne}"`), `${f} mène encore à ${ancienne}`);
  }
});

test("la recherche trouve chaque réglage par son libellé, en français comme en anglais", () => {
  for (const e of REGLAGES_INVENTAIRE) {
    assert.ok(chercher(tr(e.libelle), tr).some((x) => x.id === e.id), `fr : ${tr(e.libelle)}`);
    const ten = (c: Cle) => String(en[c as keyof typeof en]);
    assert.ok(chercher(ten(e.libelle), ten).some((x) => x.id === e.id), `en : ${ten(e.libelle)}`);
  }
});

test("recherche « rep » : les réglages de Activité › Repos et de Nutrition, chacun dit où il vit", () => {
  const r = chercher("rep", tr);
  const ids = r.map((e) => e.id);
  for (const id of ["repos-defaut", "fin-repos", "repas", "rappel-repas"]) assert.ok(ids.includes(id), id);
  assert.equal(chemin(r.find((e) => e.id === "repos-defaut")!, tr), "Activité › Repos");
  assert.equal(chemin(r.find((e) => e.id === "repas")!, tr), "Nutrition");
  // sans accents ni majuscules ; rien pour une chaîne vide
  assert.ok(chercher("ECRAN", tr).some((e) => e.id === "ecran-allume"));
  assert.ok(chercher("precision", tr).some((e) => e.id === "precision-commune"));
  assert.deepEqual(chercher("  ", tr), []);
  // le chemin compte aussi : « sauvegarde » trouve Emplacement, qui vit dans Sauvegarde
  assert.ok(chercher("sauvegarde", tr).some((e) => e.id === "emplacement"));
});

test("la recherche trouve aussi par la valeur affichée : unités en clair, heures en « h », sans accents ni casse", () => {
  const valeurs = { poids: ["Auto", "kg"], distance: ["mi"], "heure-seances": ["12:00"], rappel: ["30 min avant"], apparence: ["Nuit"], prenom: ["Zoé"] };
  const ids = (q: string, t = tr) => chercher(q, t, REGLAGES_INVENTAIRE, valeurs).map((e) => e.id);
  assert.ok(ids("kilogrammes").includes("poids"));
  assert.ok(ids("KILOGRAMMES").includes("poids"));
  assert.ok(ids("kg").includes("poids"));
  assert.ok(ids("miles").includes("distance"));
  assert.ok(!ids("kilogrammes").includes("distance"));
  for (const q of ["12 h", "12h", "12:00"]) assert.ok(ids(q).includes("heure-seances"), q);
  assert.ok(ids("30 min").includes("rappel"));
  assert.ok(ids("nuit").includes("apparence"));
  assert.ok(ids("zoe").includes("prenom"), "sans accents");
  // en anglais : le nom long de l'unité dans la langue
  const ten = (c: Cle) => String(en[c as keyof typeof en]);
  assert.ok(ids("kilograms", ten).includes("poids"));
  // le libellé passe avant la valeur, la valeur avant le chemin ; sans valeurs, rien ne change
  const r = ids("auto");
  assert.ok(r.indexOf("automatique") < r.indexOf("poids"), "libellé « Automatique » d'abord");
  assert.deepEqual(chercher("rep", tr), chercher("rep", tr, REGLAGES_INVENTAIRE, {}));
  assert.ok(!chercher("kilogrammes", tr).some((e) => e.id === "poids"));
});

test("l'écran Réglages ne donne des valeurs qu'à des réglages de l'inventaire", () => {
  const s = lire("app/settings/index.tsx");
  const bloc = s.slice(s.indexOf("const valeurs: ValeursReglages = {"), s.indexOf("const resultats"));
  const cles = [...bloc.matchAll(/^\s+"?([a-z-]+)"?:/gm)].map((m) => m[1]!);
  assert.ok(cles.length >= 15, `${cles.length} valeurs`);
  for (const c of cles) assert.ok(REGLAGES_INVENTAIRE.some((e) => e.id === c), c);
});

test("le volet est court : précision, suivi et Réglages ; plus de records, d'interrupteurs, de portes de réglages ni de compte", () => {
  const s = lire("ecrans/Profil.tsx");
  assert.doesNotMatch(s, /CarteRecord|recordsRecents/);
  assert.doesNotMatch(s, /interrupteur=/);
  for (const r of ["/settings/preferences", "/settings/connexions", "/settings/data", "/account/ordinateur", "/welcome?rejouer=1"]) assert.ok(!s.includes(`"${r}"`), r);
  assert.match(s, /aller\("\/settings"\)/);
  assert.doesNotMatch(s, /\/account|\/social/);
  assert.match(s, /CartePrecision/);
  // 05/11 : plus de carte du profil, de chiffres, de « Mes cercles » ni d'Historique (doublons de la page Profil).
  assert.doesNotMatch(s, /CarteProfil|statsProfil|mesCercles|\/history/);
});

test("les curseurs sont dans l'en-tête de Nutrition, Sport et Santé (pas de l'Accueil, D18)", () => {
  for (const f of ["ecrans/nutrition/Journal.tsx", "app/(tabs)/train.tsx", "ecrans/Sante.tsx"]) assert.match(lire(f), /<BoutonReglagesPartie partie="(nutrition|sport|sante)"/, f);
  assert.doesNotMatch(lire("ecrans/AccueilAncien.tsx"), /BoutonReglagesPartie/);
  assert.match(lire("ecrans/AccueilAncien.tsx"), /menu\.personnaliser/);
});

test("badge de la porte Réglages : seulement pour une connexion à reconnecter (D11)", async () => {
  const { aReconnecter, serviceAReconnecter } = await import("../src/ecrans/reglages/etat.ts");
  assert.equal(aReconnecter("expire"), true);
  assert.equal(aReconnecter("reseau"), false);
  assert.equal(aReconnecter(null), false);
  assert.equal(serviceAReconnecter({ connecte: true, erreur: "serveur" }, { connecte: true, erreur: "expire" }), "withings");
  assert.equal(serviceAReconnecter({ connecte: true, erreur: "expire" }, { connecte: true, erreur: "expire" }), "whoop");
  assert.equal(serviceAReconnecter(null, null), null);
});

test("agenda du téléphone : dans Activité, trouvé par « Google Agenda » ou « iCal », en français comme en anglais", () => {
  const ten = (c: Cle) => String(en[c as keyof typeof en]);
  const agenda = REGLAGES_INVENTAIRE.find((e) => e.id === "agenda")!;
  assert.equal(chemin(agenda, tr), "Activité");
  assert.equal(agenda.route, "/settings/agenda");
  for (const q of ["google agenda", "ical", "calendrier"]) assert.ok(chercher(q, tr).some((e) => e.id === "agenda"), `fr : ${q}`);
  for (const q of ["google calendar", "agenda"]) assert.ok(chercher(q, ten).some((e) => e.id === "agenda"), `en : ${q}`);
  // Titre des séances écrites (03/11) : sur la page Agenda, trouvé par « emoji », « titre », « lieu ».
  for (const id of ["agenda-emoji", "agenda-format"]) assert.equal(chemin(REGLAGES_INVENTAIRE.find((e) => e.id === id)!, tr), "Activité › Agenda");
  for (const q of ["emoji", "emoji du sport", "titre des seances", "lieu"]) assert.ok(chercher(q, tr).some((e) => e.id.startsWith("agenda-")), `fr : ${q}`);
  for (const q of ["sport emoji", "workout title", "location"]) assert.ok(chercher(q, ten).some((e) => e.id.startsWith("agenda-")), `en : ${q}`);
  assert.match(lire("ecrans/agenda/PageAgenda.tsx"), /agenda\.ecrit\.format[\s\S]*FeuilleTitre/);
  assert.match(lire("ecrans/agenda/FeuilleTitre.tsx"), /agenda\.ecrit\.emoji/);
});

test("sommeil : rappel de coucher et voyage dans la partie Santé, trouvés par « coucher », « jet lag » ou « fuseau », en français comme en anglais", () => {
  const ids = (q: string, t = tr) => chercher(q, t).map((e) => e.id);
  assert.ok(ids("coucher").includes("rappel-coucher"));
  assert.ok(ids("jet lag").includes("voyage"));
  assert.ok(ids("heure d'ete").includes("voyage"));
  assert.ok(ids("fuseau").includes("seances-voyage"));
  const ten = (c: Cle) => String(en[c as keyof typeof en]);
  assert.ok(ids("bedtime", ten).includes("rappel-coucher"));
  assert.ok(ids("jet lag", ten).includes("voyage"));
  assert.equal(chemin(REGLAGES_INVENTAIRE.find((e) => e.id === "seances-voyage")!, tr), `${tr("ui.onglet.sante")} › Rappel de coucher`);
  assert.match(lire("ecrans/reglages/Parties.tsx"), /aller\("\/sante\/rappel-coucher"\)[\s\S]*aller\("\/sante\/voyage"\)/);
});
