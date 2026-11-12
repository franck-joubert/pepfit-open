import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Retouches du 08/11 sur la page Nutrition : « Comme hier » dans la feuille du repas, macros à lettre colorée, fond de l'interrupteur.
const journal = readFileSync(new URL("../src/ecrans/nutrition/Journal.tsx", import.meta.url), "utf8");
const commun = readFileSync(new URL("../src/ecrans/nutrition/commun.tsx", import.meta.url), "utf8");
const feuilles = readFileSync(new URL("../src/ecrans/nutrition/FeuillesJournal.tsx", import.meta.url), "utf8");

test("« Comme hier » n'est plus sur la carte du repas : il est la première ligne de la feuille, avant « Copier d'un autre jour »", () => {
  assert.ok(!journal.includes('t("nutrition.commeHier")'), "la carte ne porte plus le bouton");
  assert.ok(!/styles\.hier\b/.test(journal), "plus de style hier sur la carte");
  const i = feuilles.indexOf('t("nutrition.commeHier")');
  const j = feuilles.indexOf('t("nutrition.copierAutreJour")');
  assert.ok(i > 0 && i < j, "Comme hier au-dessus de Copier d'un autre jour");
  assert.match(feuilles, /hierKcal != null \? <Option premier/, "la ligne n'existe que s'il y avait des données la veille");
  assert.match(feuilles, /premier=\{hierKcal == null\}/, "sans la ligne, « Copier » reste la première");
  assert.match(journal, /hierKcal=\{menu \? \(d\?\.hier\.get\(menu\.id\) \?\? null\) : null\}/, "même source que l'ancien bouton : dj.hier");
});

test("macros du haut : chiffres en couleur de texte principale, lettre colorée, libellé complet pour le lecteur d'écran", () => {
  const corps = commun.slice(commun.indexOf("export function CelluleResume"));
  assert.match(corps, /color: couleurs\.t1/, "chiffre en t1");
  assert.ok(!/color: c\[cle\]\s*\}\}>\s*\{" "\}/.test(corps), "plus de chiffre en couleur de macro");
  assert.match(corps, /color: c\[cle\], textTransform: "none"/, "lettre dans la couleur de la macro, comme le bandeau collé");
  assert.match(corps, /accessibilityLabel=\{etiquette \?\? `\$\{libelle\} \$\{affiche\}`\}/, "libellé complet conservé");
  assert.match(journal, /libelle=\{t\("nutrition\.total"\)\} lettre=""/, "Total : plus de lettre « T » (09/11), libellé complet pour le lecteur d'écran");
});

test("interrupteur Jour sportif / Jour de repos : fond noir translucide", () => {
  assert.match(journal, /styles\.pisteEntr, \{ backgroundColor: "rgba\(0,0,0,0\.4\)" \}/);
});

test("plus de boutons flottants : ni « Ajouter un aliment » ni le scanner en bas ; le « + » de chaque repas est le bouton principal", () => {
  assert.ok(!journal.includes('t("nutrition.ajouterAliment")'), "plus de bouton d'ajout flottant");
  assert.ok(!journal.includes('t("nutrition.scanner")'), "plus de bouton scanner flottant");
  assert.match(journal, /<BoutonPrincipal compact iconeSeule icone="plus"/, "le + d'un repas est un BoutonPrincipal (carré de 44)");
  assert.ok(!/styles\.plus\b/.test(journal), "plus de pastille à contour");
  // Le bandeau Annuler et « Revenir à aujourd'hui » restent flottants, avec la marge de la barre d'onglets (BasFlottant).
  assert.match(journal, /<BasFlottant onHauteur=\{setHauteurBas\}>[\s\S]*<BandeauAnnuler[\s\S]*<RevenirAujourdhui/);
});

test("le scanner reste atteignable : la page d'ajout ouverte par le « + » du repas a son bouton de scan, avec le repas et le jour", () => {
  const ajouter = readFileSync(new URL("../src/ecrans/nutrition/Ajouter.tsx", import.meta.url), "utf8");
  assert.match(ajouter, /accessibilityLabel=\{t\("nutrition\.scanner"\)\}[\s\S]{0,200}\/nutrition\/scan[\s\S]{0,120}repas: repas\?\.id/);
  assert.match(journal, /pathname: "\/nutrition\/ajouter", params: \{ repas: r\.id, date \}/);
});

test("BoutonPrincipal en icône seule : carré de 44, sans libellé affiché", () => {
  const d = readFileSync(new URL("../src/ui/Degrade.tsx", import.meta.url), "utf8");
  assert.match(d, /contenuCarre: \{ paddingHorizontal: 13 \}/);
  assert.match(d, /iconeSeule \? null : \(desactive \? null : children\)/);
});
