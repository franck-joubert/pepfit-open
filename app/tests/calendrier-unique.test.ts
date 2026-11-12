// Un seul calendrier dans l'appli (retour du 30/10 : « tous doivent avoir le format de défilement vertical :
// cohérence ») : ui/PageMois, mois empilés qui défilent, bascule liste ou calendrier dans sa barre. Ce garde-fou échoue
// si un écran dessine sa propre grille de mois (grilleMois, grille à 7 colonnes, flèches « mois précédent / suivant »),
// pose la bascule ailleurs, ou ouvre la page du mois sans bascule ni légende.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const CALENDRIER = "ui/PageMois.tsx";

function ecrans(dossier = SRC): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const f = join(dossier, n);
    if (statSync(f).isDirectory()) return ecrans(f);
    return f.endsWith(".tsx") ? [relative(SRC, f)] : [];
  });
}
const lire = (f: string) => readFileSync(join(SRC, f), "utf8");

test("calendrier unique : aucune autre grille de mois que ui/PageMois", () => {
  const fautes: string[] = [];
  for (const f of ecrans()) {
    if (f === CALENDRIER) continue;
    const s = lire(f);
    if (/\bgrilleMois\(|\bcasesMois\(/.test(s)) fautes.push(`${f} : grille de mois maison`);
    if (/100 \/ 7|\/ 7\}%|14\.28\d*%/.test(s)) fautes.push(`${f} : grille à 7 colonnes`);
    if (/moisPrecedent|moisSuivant/.test(s)) fautes.push(`${f} : flèches de mois`);
  }
  assert.deepEqual(fautes, [], "un calendrier passe par ui/PageMois (défilement vertical)");
});

test("calendrier unique : la bascule liste ou calendrier ne vit que dans la barre de PageMois", () => {
  const fautes = ecrans().filter((f) => f !== CALENDRIER && f !== "ui/BasculeVue.tsx" && /<BasculeVue\b/.test(lire(f)));
  assert.deepEqual(fautes, []);
  assert.match(lire(CALENDRIER), /<BasculeVue valeur=\{vue\} onChange=\{onVue\} \/>/);
});

test("calendrier unique : chaque page du mois a sa bascule, sa vue liste et sa légende", () => {
  const pages = ecrans().filter((f) => f !== CALENDRIER && /<PageMois\b/.test(lire(f)));
  // Sport, Nutrition, Santé, mesures (Poids, Pas, Sommeil… par le registre de l'agenda), prises des compléments
  // + le cycle (planche cycle, écran 3) : règles et fourchette des prochaines règles
  assert.deepEqual(pages.sort(), ["app/calendrier.tsx", "ecrans/HistoriquePrises.tsx", "ecrans/MoisSante.tsx", "ecrans/cycle/MoisCycle.tsx", "ecrans/mesures/AgendaPage.tsx", "ecrans/nutrition/MoisNutrition.tsx"]);
  for (const f of pages) {
    const s = lire(f);
    assert.match(s, /onVue=\{/, `${f} : bascule`);
    assert.match(s, /liste=\{/, `${f} : vue liste`);
    assert.match(s, /<ListeAgenda\b/, `${f} : liste sur le modèle de Poids`);
    assert.match(s, /legende=\{/, `${f} : légende`);
  }
  // pas de futur là où il n'a pas de sens : mesures et prises
  for (const f of ["ecrans/mesures/AgendaPage.tsx", "ecrans/HistoriquePrises.tsx", "ecrans/MoisSante.tsx", "ecrans/cycle/MoisCycle.tsx"]) assert.match(lire(f), /futur=\{false\}/, f);
});
