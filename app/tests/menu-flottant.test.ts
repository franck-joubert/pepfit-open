// Menu flottant des onglets : où il apparaît, ses trois onglets, son dégradé et ses dimensions.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ARRETS_FONDU, barreVisible, dernierAllume, dimensionsMenu, estOnglet, ONGLETS, ongletsVisibles, premierOnglet, rangDePartie, TOUTES_PARTIES, type PartiesActives } from "../src/ui/menu-flottant.ts";
import { readFileSync } from "node:fs";
import { arretsIconeActive, degrades, menu, opaciteVerre } from "../src/theme/effets.ts";
import { menuFlottant } from "../src/theme/mouvement.ts";
import { menuOnglets } from "../src/theme/typo.ts";
import { en } from "../src/i18n/en.ts";
import { fr } from "../src/i18n/fr.ts";

test("trois onglets : Moi (ex-Santé), Effort (ex-Sport), Nutrition ; « / » n'en est pas un", () => {
  assert.deepEqual(
    ONGLETS.map((o) => o.chemin),
    ["/health", "/train", "/food"],
  );
  assert.deepEqual(ONGLETS.map((o) => o.icone), ["sante", "dumbbell", "nutrition"]);
  for (const o of ONGLETS) assert.ok(estOnglet(o.chemin), o.chemin);
  for (const c of ["/", "/me", "/account", "/session", "/done", "/routine/view/3", "/history", "/train/x", "/feed"])
    assert.ok(!estOnglet(c), c);
});

test("aucun onglet n'est obligatoire : le premier allumé s'ouvre, au moins un reste, un seul = pas de barre", () => {
  const p = (health: boolean, train: boolean, food: boolean): PartiesActives => ({ health, train, food });
  assert.equal(premierOnglet(TOUTES_PARTIES), "/health");
  assert.equal(premierOnglet(p(false, true, true)), "/train", "Moi éteint : Sport s'ouvre");
  assert.equal(premierOnglet(p(false, false, true)), "/food");
  assert.equal(premierOnglet(p(false, false, false)), "/health", "réglage abîmé : jamais de barre vide");
  assert.deepEqual(ongletsVisibles(p(true, false, true)).map((o) => o.chemin), ["/health", "/food"]);
  // Le dernier allumé est grisé dans le réglage ; aucun autre ne l'est.
  assert.ok(dernierAllume(p(false, true, false), "/train"));
  assert.ok(!dernierAllume(p(false, true, false), "/food"));
  assert.ok(!dernierAllume(p(true, true, false), "/train"));
  assert.ok(!dernierAllume(TOUTES_PARTIES, "/health"));
  // Barre : visible à deux onglets ou plus ; à un seul, elle disparaît .
  assert.ok(barreVisible(p(true, true, false)));
  assert.ok(!barreVisible(p(false, true, false)));
});

test("libellés traduits en français et en anglais", () => {
  const dicos = [fr, en] as Record<string, unknown>[];
  for (const cle of [...ONGLETS.map((o) => o.cle), "ui.bientot", "ui.monCompte"])
    for (const d of dicos) assert.equal(typeof d[cle], "string", cle);
  assert.equal(fr["ui.onglet.sante"], "Corps");
  // Libellés de la barre : Corps, Activité, Nutrition, et Body, Activity, Nutrition (06/11 : « Moi » portait à confusion avec le profil).
  assert.deepEqual(ONGLETS.map((o) => fr[o.cle]), ["Corps", "Activité", "Nutrition"]);
  assert.deepEqual(ONGLETS.map((o) => en[o.cle]), ["Body", "Activity", "Nutrition"]);
  for (const d of dicos) for (const cle of ["menu.onglets", "menu.ongletsIntro", "menu.ongletsDernier"]) assert.equal(typeof d[cle], "string", cle);
  assert.equal(fr["menu.ongletsDernier"], "Au moins un onglet reste affiché");
  assert.equal(en["ui.bientot"], "Coming soon");
});

test("dégradé du fond : transparent en haut, plein derrière la barre système, sans retour en arrière", () => {
  assert.equal(ARRETS_FONDU[0].opacite, 0);
  assert.equal(ARRETS_FONDU.at(-1)!.opacite, 1);
  ARRETS_FONDU.slice(1).forEach((a, i) => {
    assert.ok(a.offset > ARRETS_FONDU[i]!.offset);
    assert.ok(a.opacite >= ARRETS_FONDU[i]!.opacite);
  });
  assert.equal(menu.nuit.fondu, "#000000");
  assert.equal(menu.jour.fondu, "#ffffff");
});

const luminance = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contraste = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hexa = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const sur = (haut: number[], a: number, bas: number[]) => haut.map((v, i) => v * a + bas[i]! * (1 - a));

test("teinte de la section sur le verre : icônes blanches à 3:1 (élément graphique) sur le fond le plus défavorable (blanc derrière)", () => {
  for (const mode of ["jour", "nuit"] as const) {
    const c = menu[mode];
    const verre = sur([0, 0, 0], opaciteVerre(c.verre), [255, 255, 255]);
    assert.equal(c.sansFlou, `rgba(0,0,0,${Math.round(opaciteVerre(c.verre) * 100) / 100})`);
    assert.ok(c.verre.intensite / c.verre.reduction <= 25, "rayon du flou");
    for (const [partie, d] of Object.entries(degrades) as [keyof typeof degrades, (typeof degrades)["accueil"]][]) {
      for (const arret of d.arrets) {
        const teinte = rgb(arret.couleur).map((v) => v * (1 - c.assombrir[partie]));
        const fond = hexa(sur(teinte, c.opacite, verre));
        const r = contraste(c.inactif, fond);
        assert.ok(r >= 3, `${mode} ${partie} ${arret.couleur} ${r.toFixed(2)}`);
      }
    }
    assert.equal(c.inactif, "#ffffff");
    assert.equal(c.actifFond, "#ffffff");
    assert.ok(contraste(c.actifTexte, c.actifFond) >= 4.5);
    // Icône de l'onglet actif : dégradé de sa partie, chaque arrêt à 3:1 au moins sur le rond blanc (élément graphique).
    for (const partie of Object.keys(degrades) as (keyof typeof degrades)[])
      for (const a of arretsIconeActive(partie)) assert.ok(contraste(a.couleur, c.actifFond) >= 3, `icône ${partie} ${a.couleur} ${contraste(a.couleur, c.actifFond).toFixed(2)}`);
  }
});

test("zones de clic et marge de fin de liste", () => {
  assert.ok(menuOnglets.onglet >= 44);
  assert.ok(menuOnglets.marge >= menuOnglets.hauteur + menuOnglets.ecartBas + menuOnglets.fondu);
  for (const ms of [menuFlottant.cacher, menuFlottant.elargir, menuFlottant.libelle]) assert.ok(ms > 0 && ms <= 300);
});

test("barre seule : plus de pastille avatar à droite, la pilule est centrée et tient de 344 à 600 dp avec « Nutrition » actif", () => {
  for (const largeur of [344, 360, 368, 390, 412, 600]) {
    const d = dimensionsMenu(largeur, menuOnglets);
    // pilule : marges des deux bords + trois ronds + l'onglet actif (icône 22, écart 8, libellé de 60 dp) + trois écarts
    const barre = d.hauteur - d.onglet + 3 * d.largeur + d.actif[0] + 22 + 8 + 60 + d.actif[1] + 3 * d.ecart;
    assert.ok(barre <= largeur, `${largeur} dp : ${barre}`);
  }
  const menuSrc = readFileSync(new URL("../src/ui/MenuFlottant.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(menuSrc, /PastilleAvatar|useCompteMenu|placementBas|dimensionsPastille/, "l'avatar n'est plus dans la barre du bas");
  assert.match(menuSrc, /zone: \{[^}]*justifyContent: "center"/, "la barre seule est centrée");
});

test("rangDePartie : la place de la couleur d'une page dans la barre", () => {
  const barre = ["fil", "sante", "entrainement", "nutrition"] as const;
  assert.equal(rangDePartie(barre, "fil", 2), 0, "profil (violet) : sous l'onglet Accueil");
  assert.equal(rangDePartie(barre, "entrainement", 0), 2);
  assert.equal(rangDePartie(barre, "accueil", 2), 2, "Accueil bleu : aucun onglet, la dernière place");
  assert.equal(rangDePartie(["sante", "nutrition"], "fil", 3), 1, "onglet éteint : la dernière place, bornée à la barre");
  assert.equal(rangDePartie(["sante"], "accueil", 0), 0);
});

test("la teinte de la barre suit la page affichée (partieDe), pas le dernier onglet actif", () => {
  const menuSrc = readFileSync(new URL("../src/ui/MenuFlottant.tsx", import.meta.url), "utf8");
  assert.match(menuSrc, /const partie = partieDe\(chemin === "\/" \? premier : chemin\)/);
  assert.match(menuSrc, /<Fond partie=\{partie\} rang=\{rangTeinte\}/);
  assert.doesNotMatch(menuSrc, /<Fond[^>]*actifChemin/, "plus de couleur tirée du dernier onglet");
  // Une teinte pour chacune des cinq parties : toute page, tout écran poussé a la sienne.
  assert.match(menuSrc, /const TEINTES: Teinte\[\] = PARTIES\.map/);
});
