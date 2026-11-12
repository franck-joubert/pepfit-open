// Retours d'Alex du 29/10 au soir : la désintégration rétablie partout où l'on supprime en glissant (séances du jour, règles
// de programmation), le glissé de suppression plus rapide, l'onglet re-touché qui ramène à aujourd'hui (jour et semainier).
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { cleLigne } from "../src/ecrans/cle-ligne.ts";
import type { LigneJour } from "../src/ecrans/planif-donnees.ts";
import { SORTIE_LIGNE_MS } from "../src/ui/arbitrage-gestes.ts";
import { abonnerRetouche, retoucher } from "../src/ui/onglet-retouche.ts";
import { fusionner, type Entree } from "../src/ui/suppression-animee.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const lire = (f: string) => readFileSync(join(SRC, f), "utf8");
const fichiers = (d: string): string[] =>
  readdirSync(join(SRC, d)).flatMap((n) => {
    const f = join(d, n);
    return statSync(join(SRC, f)).isDirectory() ? fichiers(f) : /\.tsx$/.test(n) ? [f] : [];
  });

const faite = (id: string) => ({ genre: "faite", seance: { id } }) as unknown as LigneJour;
const prevue = (prog: string, origine: string) =>
  ({ genre: "prevue", occ: { programmationId: prog, routineId: "r", date: origine, origine, heure: "18:00", repetee: true }, nom: "Haut", dureeS: 3600, manquee: false }) as LigneJour;

test("séance du jour supprimée : elle reste à sa place, en sortie, le temps de se désintégrer (clé de la ligne)", () => {
  const padel = faite("s-padel");
  const haut = prevue("p1", "2026-10-29");
  const course = faite("s-course");
  const avant: Entree<LigneJour>[] = [padel, haut, course].map((l) => ({ cle: cleLigne(l), item: l, etat: "vu" }));
  // Le Padel est supprimé (marqué au toucher de « Supprimer ») : il sort, entre les mêmes voisins.
  const parties = new Set<string>();
  const apres = fusionner(avant, [haut, course], cleLigne, (c) => (c === "s-padel" ? 0 : null), parties);
  assert.deepEqual(apres.map((e) => [e.cle, e.etat]), [["s-padel", "sort"], ["p1|2026-10-29", "vu"], ["s-course", "vu"]]);
  // Une séance prévue a sa clé (programmation et jour d'origine) : retirée, elle sort aussi.
  const apres2 = fusionner(apres, [course], cleLigne, (c) => (c === "p1|2026-10-29" ? 0 : null), parties);
  assert.deepEqual(apres2.filter((e) => e.etat === "sort").map((e) => e.cle), ["s-padel", "p1|2026-10-29"]);
  // Annuler : elle revient (« entre »).
  assert.equal(fusionner(apres2, [padel, course], cleLigne, () => null, parties).find((e) => e.cle === "s-padel")?.etat, "entre");
});

test("partout où l'on supprime en glissant, la ligne est dans une liste à désintégration", () => {
  const avec = fichiers(".").filter((f) => lire(f).includes("<GlisserSupprimer"));
  assert.ok(avec.length >= 10, `fichiers : ${avec.length}`);
  for (const f of avec) {
    // LigneSerie (une série) : posée par ses appelants dans un ListeDesintegrable (séance, fiche routine).
    if (f.endsWith("LigneSerie.tsx")) continue;
    assert.match(lire(f), /ListeDesintegrable|<Desintegrable/, `${f} : GlisserSupprimer hors d'une liste à désintégration`);
  }
  for (const f of ["ecrans/seance-vue.tsx", "app/routine/[id].tsx"]) assert.match(lire(f), /ListeDesintegrable/);
  // Les deux qui ne l'étaient plus : séances du jour (Sport) et règles de programmation.
  assert.match(lire("ecrans/Planif.tsx"), /<ListeDesintegrable[\s\S]*cleDe=\{cleLigne\}[\s\S]*<GlisserSupprimer/);
  assert.match(lire("ecrans/FeuillesPlanif.tsx"), /<ListeDesintegrable[\s\S]*<GlisserSupprimer/);
});

test("la dernière ligne supprimée se désintègre aussi : aucune liste rendue sous condition de sa longueur", () => {
  // Rendue sous `liste.length ? (…)`, la liste disparaissait avec sa dernière ligne, sans grains : le cadre passe par `autour`,
  // l'état vide par `vide` (ListeDesintegrable les garde tant qu'un élément sort).
  for (const f of fichiers(".")) {
    const lignes = lire(f).split("\n");
    lignes.forEach((l, i) => {
      if (!l.includes("<ListeDesintegrable")) return;
      const avant = lignes.slice(Math.max(0, i - 4), i).join("\n");
      assert.doesNotMatch(avant, /\.length\s*(===\s*0\s*)?\?\s*\(?\s*$|\.length\s*&&|\.length\s*\?\s*\(\s*\n\s*<(View|Groupe|>)/m, `${f}:${i + 1}`);
      // Branche « sinon » d'un état vide : `x.length === 0 ? (…vide…) : (<ListeDesintegrable`.
      if (/\)\s*:\s*\(\s*$/.test(lignes[i - 1] ?? "")) assert.doesNotMatch(lignes.slice(Math.max(0, i - 40), i).join("\n"), /\.length\s*===\s*0\s*\?\s*\(/, `${f}:${i + 1}`);
    });
  }
  for (const [f, motif] of [
    ["ecrans/Traitements.tsx", /autour=/],
    ["ecrans/Blessures.tsx", /vide=\{<Ligne titre=\{t\("suivi\.aucuneBlessure"\)\}/],
    ["ecrans/EditionWod.tsx", /autour=/],
    ["ecrans/Routines.tsx", /vide=\{/],
    ["ecrans/nutrition/Journal.tsx", /autour=/],
    ["ecrans/FeuillesPlanif.tsx", /autour=\{\(e\) => <Groupe>/],
    ["ecrans/Planif.tsx", /vide=\{!sansCadre/],
  ] as const)
    assert.match(lire(f), motif, f);
  // Un repas qui se vide reste ouvert (son choix est fixé à la lecture du jour) : sa liste reste montée.
  assert.match(lire("ecrans/nutrition/Journal.tsx"), /setOuvertJour\(\(c\) => \(c\.date === date && c\.id \? c : /);
});

test("« Supprimer » touché : la ligne sort plus vite (120 ms au lieu de 200), puis se désintègre sans trou", () => {
  assert.equal(SORTIE_LIGNE_MS, 120);
  const g = lire("ui/GlisserSupprimer.tsx");
  assert.match(g, /duration: SORTIE_LIGNE_MS/);
  // La ligne glissée se cache quand les grains sont dessinés (signal du Desintegrable), pas 64 ms après la sortie : plus
  // d'image vide entre la barre et les grains (vu à l'émulateur le 29/10 au soir).
  assert.match(g, /etatDes === "sort" && grains/);
  assert.match(lire("ui/Desintegration.tsx"), /else setGrains\(true\)/);
});

test("onglet re-touché : la page remonte en haut ET revient à aujourd'hui, semainier compris (Sport, Nutrition, Santé)", () => {
  // Deux abonnés au même onglet (remontée en haut, retour à aujourd'hui) : les deux sont prévenus.
  const vus: string[] = [];
  const a = abonnerRetouche("/health", () => vus.push("haut"));
  const b = abonnerRetouche("/health", () => vus.push("aujourdhui"));
  retoucher("/health");
  a();
  b();
  assert.deepEqual(vus.sort(), ["aujourdhui", "haut"]);
  // Chaque page s'abonne et passe au semainier le recadrage (il revient même défilé sans changer de jour).
  const pages: [string, string, RegExp][] = [
    ["app/(tabs)/train.tsx", "/train", /saut\.sauter\(auj\)/],
    ["ecrans/nutrition/Journal.tsx", "/food", /saut\.sauter\(aujourdhui\)/],
    ["ecrans/Sante.tsx", "/health", /setDate\(aujourdhui\)/],
  ];
  for (const [f, chemin, jour] of pages) {
    const s = lire(f);
    assert.ok(s.includes(`useHautALArrivee("${chemin}"`), `${f} : remontée en haut`);
    const i = s.indexOf(`useOngletRetouche("${chemin}"`);
    assert.ok(i > 0, `${f} : onglet re-touché`);
    assert.match(s.slice(i, i + 200), jour, `${f} : retour à aujourd'hui (glissé dans le bon sens pour Sport et Nutrition)`);
    assert.match(s, /recadre=\{recadre\}/, `${f} : semainier recadré`);
  }
});
