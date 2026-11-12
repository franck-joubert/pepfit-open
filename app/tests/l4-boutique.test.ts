// Lot L4 de la revue finale (30/10) : boutique. Puces à rayon 10 (D13), marges de 16 sur les fiches (D8), plafond de police
// de la recherche, pile de vignettes sur le jeton `pile` et partie après l'arrivée de la page (n° 64), tuiles aux couleurs
// de l'objectif gardées (D3), erreurs d'écriture qui se disent (n° 16).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mock, test } from "node:test";
import { quandPageArrivee, SECOURS } from "../src/boutique/arrivee.ts";
import { duree } from "../src/theme/mouvement.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const lire = (f: string) => readFileSync(join(SRC, f), "utf8");

const FICHIERS_L4 = ["ecrans/Boutique.tsx", "boutique/ui.tsx", "boutique/pile.tsx", "boutique/arrivee.ts", "boutique/page-arrivee.ts", "ecrans/FicheProgramme.tsx", "ecrans/FicheRoutine.tsx"];

test("puces de la boutique : rayon 10, plus de pilule (n° 27, D13)", () => {
  const s = lire("ecrans/Boutique.tsx");
  const puce = s.match(/^\s*puce: \{[^}]*\}/m)?.[0] ?? "";
  assert.match(puce, /height: 36/);
  assert.match(puce, /borderRadius: rayon\.m/);
  assert.doesNotMatch(s, /borderRadius: 18/);
});

test("fiches et liste vide : marges de 16, plus de 20 (n° 40, D8)", () => {
  for (const f of ["ecrans/FicheProgramme.tsx", "ecrans/FicheRoutine.tsx", "ecrans/Boutique.tsx"]) {
    assert.doesNotMatch(lire(f), /padding(Horizontal)?: (20|espace\.xl)\b/, f);
  }
  // Le visuel de tête aligne sa pastille et son chiffre sur le titre.
  const ui = lire("boutique/ui.tsx");
  assert.match(ui, /heros && \{ top: pastilleHaut, left: espace\.l \}/);
  assert.match(ui, /left: heros \? espace\.l :/);
});

test("recherche de la boutique : plafond de police à 130 % (n° 44)", () => {
  const champ = lire("ecrans/Boutique.tsx").match(/<TextInput[\s\S]*?\/>/)?.[0] ?? "";
  assert.match(champ, /maxFontSizeMultiplier=\{POLICE_MAX\}/);
});

test("pile : jeton `pile` de theme/mouvement, plus de valeurs en dur (n° 62)", () => {
  const s = lire("boutique/pile.tsx");
  assert.match(s, /import \{ (calendrier, )?pile \} from "\.\.\/theme\/mouvement"/);
  assert.doesNotMatch(s, /OUVERTURE|duration: 520|withDelay\(120/);
  assert.match(s, /withDelay\(pile\.delai \+ i \* pile\.ecart, withTiming\(1, \{ duration: pile\.duree, easing: courbes\.sortie \}\)\)/);
  // La partie attend la fin de l'entrée de la page (n° 64), comme les barres de la fiche programme.
  assert.match(s, /const arrivee = usePageArrivee\("pile"\)/);
  const crochet = lire("boutique/page-arrivee.ts");
  assert.match(crochet, /quandPageArrivee\(/);
  assert.match(crochet, /\(type, f\) => navigation\.addListener\(type, f\)/);
  assert.match(crochet, /\[transition\] \$\{nom\} arrivee/);
  const fiche = lire("ecrans/FicheProgramme.tsx");
  assert.match(fiche, /const arrivee = usePageArrivee\("fiche"\)/);
  assert.match(fiche, /if \(!arrivee\) return;\n\s*e\.value = withDelay\(/);
});

/** Pile de navigation simulée : `emettre("transitionEnd", false)` comme native-stack (closing). */
function pileSimulee() {
  const ecoutes = new Map<string, Set<(e: { data?: { closing?: boolean } }) => void>>();
  const abonner = (type: "transitionStart" | "transitionEnd", f: (e: { data?: { closing?: boolean } }) => void) => {
    if (!ecoutes.has(type)) ecoutes.set(type, new Set());
    ecoutes.get(type)!.add(f);
    return () => void ecoutes.get(type)!.delete(f);
  };
  const emettre = (type: string, closing: boolean) => [...(ecoutes.get(type) ?? [])].forEach((f) => f({ data: { closing } }));
  const abonnes = () => [...ecoutes.values()].reduce((n, s) => n + s.size, 0);
  return { abonner, emettre, abonnes };
}

test("pile : l'éventail part à transitionEnd, pas au montage ni sur une page qui part (n° 64)", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const p = pileSimulee();
    const parties: string[] = [];
    quandPageArrivee(p.abonner, (par) => parties.push(par));
    mock.timers.tick(100);
    p.emettre("transitionStart", false);
    mock.timers.tick(200);
    assert.deepEqual(parties, [], "rien pendant l'entrée de la page");
    p.emettre("transitionEnd", true);
    assert.deepEqual(parties, [], "une page qui part ne compte pas");
    p.emettre("transitionEnd", false);
    assert.deepEqual(parties, ["transitionEnd"]);
    assert.equal(p.abonnes(), 0, "désabonné");
    mock.timers.tick(SECOURS.montage * 2);
    assert.deepEqual(parties, ["transitionEnd"], "une seule fois");
  } finally {
    mock.timers.reset();
  }
});

test("pile : entrée native en retard sur le montage (mesuré à l'émulateur) : le secours attend transitionStart", () => {
  assert.deepEqual(SECOURS, { entree: duree.page + 16, montage: 1200 });
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    // transitionStart 1 090 ms après le montage, transitionEnd perdu : départ une image après la durée d'entrée.
    const p = pileSimulee();
    const parties: string[] = [];
    quandPageArrivee(p.abonner, (par) => parties.push(par));
    mock.timers.tick(1090);
    assert.deepEqual(parties, [], "le secours du montage ne part pas avant l'entrée");
    p.emettre("transitionStart", true);
    p.emettre("transitionStart", false);
    mock.timers.tick(SECOURS.entree - 1);
    assert.deepEqual(parties, [], "toujours pas : l'entrée dure au plus duree.page");
    mock.timers.tick(1);
    assert.deepEqual(parties, ["secours"]);
  } finally {
    mock.timers.reset();
  }
});

test("pile : aucune transition (page déjà entrée) : secours du montage ; démontée, rien ne part", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const p = pileSimulee();
    const parties: string[] = [];
    quandPageArrivee(p.abonner, (par) => parties.push(par));
    mock.timers.tick(SECOURS.montage - 1);
    assert.deepEqual(parties, []);
    mock.timers.tick(1);
    assert.deepEqual(parties, ["secours"]);
    assert.equal(p.abonnes(), 0);

    const q = pileSimulee();
    let partie = 0;
    const defaire = quandPageArrivee(q.abonner, () => partie++);
    defaire();
    q.emettre("transitionEnd", false);
    mock.timers.tick(SECOURS.montage * 2);
    assert.equal(partie, 0);
    assert.equal(q.abonnes(), 0);
  } finally {
    mock.timers.reset();
  }
});

test("tuiles et vignettes aux couleurs de l'objectif, gardées (D3)", () => {
  const ui = lire("boutique/ui.tsx");
  assert.match(ui, /endu: \{ c: "partieAccueil"/);
  assert.match(ui, /force: \{ c: "partieEntrainement"/);
  assert.match(ui, /forme: \{ c: "partieNutrition"/);
  assert.match(ui, /sante: \{ c: "partieSante"/);
});

test("profil des zones de la fiche : largeur de la colonne de contenu (D5)", () => {
  const s = lire("ecrans/FicheProgramme.tsx");
  assert.match(s, /useLargeurContenu\(\)/);
  assert.doesNotMatch(s, /useWindowDimensions/);
});

test("erreurs : aucune avalée ni seulement journalisée sur une écriture de la boutique (n° 16)", () => {
  for (const f of FICHIERS_L4) {
    const s = lire(f);
    assert.doesNotMatch(s, /\.catch\(\(\) => \{\}\)/, f);
    assert.doesNotMatch(s, /\.catch\(console\.error\)/, f);
  }
  const r = lire("ecrans/FicheRoutine.tsx");
  assert.match(r, /signalerErreur\(\)\(e\)/);
  assert.match(r, /\}\)\(\)\.catch\(signalerErreur\(\)\)/);
});
