// Importer un GPX et faire d'une sortie un circuit (planche Circuits, lot E) : la lecture du fichier choisi, ses trois refus, les phrases des deux langues
// et la structure des écrans (rien n'est envoyé avant l'aperçu, un GPX n'est jamais publié, « Tout le monde » grisé près du domicile, une ligne de menu
// seulement pour une sortie avec un tracé). Fonctions pures et lecture des sources : le rendu réel est dans les captures de docs/circuits-code/.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { circuitDepuisGpx } from "../src/circuits/gpx.ts";
import { lireFichierChoisi } from "../src/circuits/importer.ts";
import { GPX_OCTETS_MAX } from "../src/circuits/regles.ts";
import { poidsTexte } from "../src/ecrans/circuit/texte.ts";
import { definirActif, detecter, en, fr, t } from "../src/i18n/index.ts";

const langue = (l: "fr" | "en") => definirActif(detecter({ codeLangue: l, systeme: "metric", fuseau: "Europe/Paris" }));
const source = (chemin: string) => readFileSync(new URL(`../src/${chemin}`, import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");

const pt = (lat: number, lon: number, alt?: number) => `<trkpt lat="${lat}" lon="${lon}">${alt == null ? "" : `<ele>${alt}</ele>`}</trkpt>`;
const gpx = (points: string, nom = "Boucle de la forêt") => `<?xml version="1.0"?><gpx version="1.1" creator="t"><trk><name>${nom}</name><trkseg>${points}</trkseg></trk></gpx>`;
const boucle = (avecAlt: boolean) =>
  Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * 2 * Math.PI;
    return pt(48.8 + 0.01 * Math.sin(a), 5.6537 + 0.014 * Math.cos(a), avecAlt ? 100 + 20 * Math.sin(a * 3) : undefined);
  }).join("");

test("un fichier choisi : lu, ses points et son nom ; le poids est celui du sélecteur", async () => {
  const texte = gpx(boucle(true));
  const r = await lireFichierChoisi({ nom: "foret.gpx", octets: 182 * 1024 }, async () => texte);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.gpx.nPoints, 60);
  assert.equal(r.gpx.octets, 182 * 1024);
  assert.equal(r.gpx.nom, "Boucle de la forêt");
  assert.equal(r.gpx.avecAltitudes, true);
});

test("plus de 20 Mo : refusé AVANT d'être lu (le lecteur n'est jamais appelé)", async () => {
  let lu = false;
  const r = await lireFichierChoisi({ nom: "gros.gpx", octets: GPX_OCTETS_MAX + 1 }, async () => {
    lu = true;
    return "";
  });
  assert.deepEqual(r, { ok: false, erreur: "trop_lourd" });
  assert.equal(lu, false);
  // 20 Mo pile passent.
  const pile = await lireFichierChoisi({ nom: "pile.gpx", octets: GPX_OCTETS_MAX }, async () => gpx(boucle(true)));
  assert.equal(pile.ok, true);
});

test("un fichier qu'on n'arrive pas à ouvrir, ou qui n'est pas un GPX : illisible ; des points sans parcours : aucun tracé", async () => {
  const ko = await lireFichierChoisi({ nom: "a.gpx", octets: 10 }, async () => {
    throw new Error("EACCES");
  });
  assert.deepEqual(ko, { ok: false, erreur: "illisible" });
  assert.deepEqual(await lireFichierChoisi({ nom: "a.txt", octets: 5 }, async () => "bonjour"), { ok: false, erreur: "illisible" });
  const sansTrace = `<?xml version="1.0"?><gpx version="1.1"><wpt lat="48.8" lon="5.6537"><name>Point</name></wpt></gpx>`;
  assert.deepEqual(await lireFichierChoisi({ nom: "p.gpx", octets: sansTrace.length }, async () => sansTrace), { ok: false, erreur: "sans_trace" });
});

test("le circuit d'un fichier est privé, de source « gpx », sans lieu de départ ; sans altitudes, le dénivelé est inconnu (jamais un zéro)", async () => {
  const r = await lireFichierChoisi({ nom: "c.gpx", octets: 100 }, async () => gpx(boucle(false)));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.gpx.avecAltitudes, false);
  const c = circuitDepuisGpx(r.gpx, { nomFichier: "c.gpx", id: "abcdefghijklmno" })!;
  assert.equal(c.visibilite, "prive");
  assert.equal(c.source, "gpx");
  assert.equal(c.departLieu, null);
  assert.equal(c.profil, null);
  assert.equal(c.denivelePlusM, null);
});

test("le poids d'un fichier : octets, Ko, Mo (une décimale sous 10 Mo)", () => {
  langue("fr");
  assert.equal(poidsTexte(900), "900 o");
  assert.equal(poidsTexte(182 * 1024), "182 Ko");
  assert.equal(poidsTexte(1.5 * 1024 * 1024), "1,5 Mo");
  assert.equal(poidsTexte(23 * 1024 * 1024), "23 Mo");
  assert.equal(poidsTexte(GPX_OCTETS_MAX), "20 Mo");
  langue("en");
  assert.equal(poidsTexte(182 * 1024), "182 KB");
  langue("fr");
});

test("les trois erreurs disent le poids et la limite, dans les deux langues, sans clé manquante", () => {
  langue("fr");
  assert.equal(t("circuit.importer.lourd.texte", { taille: "23 Mo", limite: "20 Mo" }), "Celui-ci fait 23 Mo, la limite est de 20 Mo. Exporte un seul parcours à la fois.");
  assert.equal(t("circuit.importer.illisible.titre"), "Fichier illisible");
  assert.equal(t("circuit.importer.sanstrace.titre"), "Aucun tracé dedans");
  const cles = Object.keys(fr).filter((k) => /^circuit\.(importer|nouveau|mes\.(vide|note)|menu\.(faire|deja))/.test(k));
  assert.ok(cles.length > 40);
  for (const k of cles) assert.ok(k in en, `clé anglaise manquante : ${k}`);
  assert.equal(t("circuit.nouveau.nomDe", { sport: "Randonnée", date: "3 novembre" }), "Randonnée du 3 novembre");
});

test("structure : l'import lit le fichier sur le téléphone et ne l'envoie jamais", () => {
  const ecran = source("ecrans/circuit/ImporterGpx.tsx");
  assert.ok(!/publierCircuit|rendrePublic|visibilite:\s*"public"/.test(ecran), "un GPX importé reste privé");
  assert.ok(!/\bfetch\s*\(/.test(ecran), "aucun envoi direct depuis l'écran");
  assert.ok(!/SERVEUR|demanderAltitudes/.test(ecran), "rien ne part vers un serveur");
  assert.ok(ecran.includes("ecrireCircuit(db, c)"), "le circuit est écrit sur le téléphone");
  const choix = source("ecrans/circuit/choisirGpx.ts");
  assert.ok(!/fetch|SERVEUR/.test(choix), "le sélecteur ne touche pas au réseau");
  assert.ok(choix.includes("copie.delete()"), "la copie du cache est supprimée après lecture");
  // Annuler le tout premier choix ferme l'écran ; « Changer » ne le ferme pas.
  assert.ok(/if \(premier\) revenir\(\)/.test(ecran));
});

test("structure : un circuit tiré d'une sortie est écrit sur le téléphone, un par sortie ; le menu ne publie ni ne signale", () => {
  const ecran = source("ecrans/circuit/NouveauCircuit.tsx");
  assert.ok(ecran.includes("await ecrireCircuit(db, circuit)"));
  assert.ok(ecran.includes("circuitDeSortie(db, seanceId)"), "un circuit par sortie");
  assert.ok(!/\bfetch\s*\(|rendrePublic/.test(ecran));
  const menu = source("ecrans/circuit/MenuCircuit.tsx");
  assert.ok(!/publierCircuit|retirerPublication|signalerCircuit/.test(menu), "rien ne part vers un serveur");
  assert.ok(menu.includes("<ChoixActivites"), "les activités se choisissent par le même composant que dans Nouveau circuit");
});

test("structure : la ligne de menu d'une sortie n'existe que pour une sortie avec un tracé, et « Déjà un circuit » prend sa place", () => {
  const page = source("app/history/[id].tsx");
  assert.ok(/effort && effort\.vue\.trace\.length >= 2 \?/.test(page));
  assert.ok(page.includes('t("circuit.menu.faire")') && page.includes('t("circuit.menu.deja")'));
  assert.ok(page.includes('pathname: "/circuit/nouveau"') && page.includes("params: { sortie: seance.seance.id }"));
  assert.ok(page.includes("circuitDeSortie(db, seanceId)"));
});

test("structure : les trois routes existent et chaque écran réutilise les briques communes (une ligne, une carte, un choix d'activités)", () => {
  for (const r of ["mes", "importer", "nouveau"]) assert.ok(readFileSync(new URL(`../src/app/circuit/${r}.tsx`, import.meta.url), "utf8").includes("export default function"));
  assert.ok(source("ecrans/circuit/MesCircuits.tsx").includes("<LigneCircuit"), "la ligne d'un circuit est celle de Découvrir");
  for (const f of ["NouveauCircuit", "ImporterGpx"]) {
    const s = source(`ecrans/circuit/${f}.tsx`);
    assert.ok(s.includes("<CarteCircuit") && s.includes("<ChoixActivites") && s.includes("<ChiffresCircuit"), `${f} : la carte, les chiffres et les activités sont ceux des autres écrans`);
  }
  // Un petit élément se touche sur 44 dp au moins.
  assert.ok(/minHeight: 44, paddingHorizontal: 14/.test(source("ecrans/circuit/ChoixActivites.tsx")));
  assert.ok(/changer: \{ minHeight: 44, minWidth: 44/.test(source("ecrans/circuit/ImporterGpx.tsx")));
});

test("structure : le Segmenté désactive une option sans bloquer les autres", () => {
  const s = source("ui/Segmente.tsx");
  assert.ok(s.includes("desactive?: boolean }[]"));
  assert.ok(s.includes("disabled={desactive || o.desactive}"));
  assert.ok(s.includes("disabled: desactive || o.desactive"));
});
