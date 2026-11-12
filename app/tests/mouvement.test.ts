// Jetons de mouvement et progression continue de la barre de repos.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cibleBarre } from "../src/ecrans/repos-barre.ts";
import { duree, echelle, ressort } from "../src/theme/mouvement.ts";
import { TRANSITIONS } from "../src/ui/transition-onglets.ts";

test("durées d'interface sous 300 ms, échelles jamais nulles", () => {
  for (const [nom, ms] of Object.entries(duree)) assert.ok(ms > 0 && ms <= 300, `${nom} : ${ms} ms`);
  for (const [nom, e] of Object.entries(echelle)) assert.ok(e >= 0.5 && e < 1, `${nom} : ${e}`);
});

test("la barre vise la seconde suivante, en continu", () => {
  assert.deepEqual(cibleBarre(90, 90, 1), { part: 89 / 90, saut: false });
  assert.deepEqual(cibleBarre(45, 90, 45 / 90), { part: 44 / 90, saut: false });
  assert.deepEqual(cibleBarre(1, 90, 1 / 90), { part: 0, saut: false });
});

test("+15 ou reprise : saut rejoint vite ; total nul : barre vide", () => {
  assert.equal(cibleBarre(60, 105, 44 / 90).saut, true);
  assert.equal(cibleBarre(30, 90, 1).saut, true);
  assert.deepEqual(cibleBarre(10, 0, 0.5), { part: 0, saut: true });
});

test("retour après un glissé : ressort sans rebond visible ; onglets sur les jetons", () => {
  const { damping, stiffness, mass } = ressort.retour;
  const amortissement = damping / (2 * Math.sqrt(stiffness * mass));
  assert.ok(amortissement >= 0.85 && amortissement <= 1, `amortissement ${amortissement.toFixed(2)}`);
  assert.equal(TRANSITIONS.glisse.dureeMs, duree.onglet);
  assert.equal(TRANSITIONS.fondu.dureeMs, duree.ongletFondu);
});

test("revue finale (L9) : jeton de la pile de vignettes, valeurs de la planche D12", async () => {
  const { pile } = await import("../src/theme/mouvement.ts");
  assert.deepEqual(pile, { duree: 520, ecart: 40, delai: 120 });
});

test("revue finale (L9) : écrans poussés en 260 / 220 ms sur Android, mêmes valeurs que les jetons", async () => {
  const { createRequire } = await import("node:module");
  const { courbe, desintegration } = await import("../src/theme/mouvement.ts");
  const plugin = createRequire(import.meta.url)("../plugins/duree-pages.js");
  assert.deepEqual(plugin.DUREES, { page: duree.page, retour: duree.pageRetour, fondu: duree.entree });
  assert.deepEqual(plugin.COURBES, { sortie: [...courbe.sortie], fermeture: [...courbe.fermeture] });
  // Les ressources de react-native-screens remplacées : fondu qui monte (aller, retour) et poussée de côté.
  for (const r of ["rns_fade_from_bottom", "rns_no_animation_350", "rns_fade_to_bottom", "rns_no_animation_250", "rns_slide_in_from_right", "rns_slide_out_to_left", "rns_slide_in_from_left", "rns_slide_out_to_right"])
    assert.ok(plugin.RESSOURCES[`anim/${r}.xml`], r);
  assert.match(plugin.RESSOURCES["anim/rns_fade_from_bottom.xml"], /android:duration="260"/);
  assert.doesNotMatch(Object.values(plugin.RESSOURCES).join(""), /duration="(350|250|400)"/);
  // La liste attend la fin du retour, plus une image.
  assert.equal(desintegration.apresRetour, duree.pageRetour + 16);
  const { readFileSync } = await import("node:fs");
  assert.match(readFileSync(new URL("../src/app/_layout.tsx", import.meta.url), "utf8"), /name="calendrier" options=\{\{ animation: "slide_from_right" \}\}/);
  assert.match(readFileSync(new URL("../app.json", import.meta.url), "utf8"), /"\.\/plugins\/duree-pages\.js"/);
});

test("revue finale (L9) : « réduire » suivi en direct dans les communs ; fondu court ; série sans largeur animée", async () => {
  const { readFileSync } = await import("node:fs");
  const lire = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  const communs = ["ui/BandeSemaine.tsx", "ui/Segmente.tsx", "ui/MenuFlottant.tsx", "ui/ZoneSemainier.tsx", "ui/saut-jour.ts", "ui/IconeSynchro.tsx", "ui/Serie.tsx", "ui/Feuille.tsx", "ui/Volet.tsx", "ui/CoucheBulle.tsx"];
  for (const f of communs) assert.doesNotMatch(lire(f), /useReducedMotion/, `${f} : « réduire » lu une fois au lancement (ui/reduit.ts)`);
  // Feuille, volet, bulle : en mouvement réduit, fondu de 150 ms au lieu d'un saut.
  assert.match(lire("ui/Feuille.tsx"), /Animated\.timing\(fondu, \{ toValue: 1, duration: duree\.sortie/);
  assert.match(lire("ui/Volet.tsx"), /const fondu = \{ duration: duree\.sortie, easing: courbes\.sortie \}/);
  assert.match(lire("ui/CoucheBulle.tsx"), /const ms = reduit \? duree\.sortie : duree\.bulle/);
  // Série (D10) : dépli en 220 ms, révélé en scaleX ; plus de largeur animée.
  const serie = lire("ui/Serie.tsx");
  assert.match(serie, /const DEPLI_MS = duree\.deplacement;/);
  assert.match(serie, /scaleX/);
  assert.doesNotMatch(serie, /width: largeur\.value/);
  // Semainier collé : la page et la ligne collée glissent en translateY, plus en `top`.
  assert.doesNotMatch(lire("ui/ZoneSemainier.tsx"), /useAnimatedStyle\(\(\) => \(\{ top:/);
});

test("revue finale (L9, D5, retour du 30/10) : colonne de 640 dp au plus partout sur le Fold déplié ; séance, carte, scanner et 3D pleine largeur ; fond plein écran", async () => {
  const { LARGEUR_CONTENU, largeurContenu, margeColonne, pleineLargeur } = await import("../src/ui/largeur.ts");
  assert.equal(LARGEUR_CONTENU, 640);
  assert.equal(largeurContenu(412), 412, "téléphone : rien ne change");
  assert.equal(margeColonne(412), 0, "téléphone : pas de marge");
  assert.equal(largeurContenu(690), 640, "Fold déplié : colonne bornée");
  assert.equal(margeColonne(690), 25);
  for (const r of ["session", "suivi/direct", "(tabs)", "nutrition/scan", "3d/[key]", "circuit/carte/[id]"]) assert.ok(pleineLargeur(r), r);
  for (const r of ["programmes", "history", "sante/sommeil", "routine/view/[id]", "sante/age", "calendrier", "boutique/[id]", "welcome", "circuit/[id]"]) assert.ok(!pleineLargeur(r), r);
  for (const o of ["index", "train", "food", "health"]) assert.ok(!pleineLargeur(o, true), o);
  // Les dessins calés sur l'écran, dans les pages bornées, lisent la largeur de la colonne.
  const { readFileSync } = await import("node:fs");
  const lire = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  for (const f of ["ui/Courbe.tsx", "ecrans/CourbeMesure.tsx", "ecrans/mesures/StatsEtat.tsx", "ecrans/ZoneBlessure.tsx", "ecrans/mesures/Parcours.tsx", "ecrans/mesures/PageTour.tsx", "ecrans/mesures/FeuilleTour.tsx", "ecrans/usePlanif.tsx", "app/progress/[id].tsx", "ecrans/BlocFcMuscu.tsx", "ui/GlisserJour.tsx", "ecrans/Sante.tsx", "ecrans/corps/BlocCorps.tsx", "ecrans/corps/ZoneCorps.tsx", "ecrans/corps/CartesCorps.tsx", "ecrans/mesures/AgePepfit.tsx", "ui/PageMois.tsx", "ecrans/FicheProgramme.tsx", "ecrans/BlocEffort.tsx"])
    assert.doesNotMatch(lire(f), /useWindowDimensions\(\)|Dimensions\.get\("window"\)\.width/, f);
  assert.match(lire("app/_layout.tsx"), /<CadreContenu route=\{route\.name\}>/);
  assert.match(lire("app/(tabs)/_layout.tsx"), /<CadreContenu route=\{route\} onglet>/);
  // Le fond d'une page (aura, couleur unie) déborde de la colonne : pas de bande noire à gauche (Pas, bienvenue, 30/10).
  assert.match(lire("ui/AuraFond.tsx"), /<FondPlein style=\{styleFond\}>/);
  assert.doesNotMatch(lire("ui/AuraFond.tsx"), /StyleSheet\.absoluteFill/);
  assert.match(lire("ui/CadreContenu.tsx"), /left: -marge, right: -marge/);
  // Le vol de l'âme vers la page Âge compte la marge de la colonne où la page est posée.
  assert.match(lire("ecrans/mesures/age-entree.tsx"), /suite\(x \+ marge, y\)/);
});

test("bouton du bas en position absolue dans un SafeAreaView à bord bas : sa marge compte la barre de navigation (30/10)", async () => {
  const { readFileSync } = await import("node:fs");
  const lire = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  assert.match(lire("ecrans/Routines.tsx"), /styles\.basVide, \{ bottom: \(bulle\.enCours \? bulle\.hauteur \+ reserve : insetBas\) \+ espace\.l \}/);
  assert.match(lire("ecrans/PlanProgramme.tsx"), /styles\.bas, \{ bottom: insetBas \+ 16 \}/);
});

test("revue finale (L9, n° 14) : la suppression part de l'image prise au geste ; chronos dans logcat", async () => {
  const { readFileSync } = await import("node:fs");
  const s = readFileSync(new URL("../src/ui/Desintegration.tsx", import.meta.url), "utf8");
  assert.match(s, /prise\.current = \{ t0, image \}/);
  assert.match(s, /\(deja\?\.image \?\? capturer\(\)\)/);
  assert.match(s, /\[transition\] suppression/);
});

test("audit du mouvement (L6) : une seule vitesse de lancer, plus de durée ni de courbe en dur dans les glissés", async () => {
  const { geste } = await import("../src/theme/mouvement.ts");
  const { VOLET } = await import("../src/ui/volet.ts");
  const { GLISSER_JOUR } = await import("../src/ui/glisser-jour.ts");
  assert.equal(VOLET.vitesse, geste.vitesse);
  assert.equal(GLISSER_JOUR.vitesse, geste.vitesse);
  const { readFileSync } = await import("node:fs");
  const lire = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  assert.match(lire("ui/Feuille.tsx"), /const VITESSE = geste\.vitesse;/, "feuille : même seuil que le volet et les jours");
  for (const f of ["ui/Glisser.tsx", "ui/GlisserEntrainement.tsx", "ui/GlisserAccueil.tsx", "ui/GlisserSupprimer.tsx", "ui/Feuille.tsx", "ui/RoueDuree.tsx"]) {
    const s = lire(f);
    assert.doesNotMatch(s, /Easing\.bezier\(\d/, `${f} : courbe recopiée en dur`);
    assert.doesNotMatch(s, /isReduceMotionEnabled/, `${f} : « réduire les animations » lu à part (ui/reduit.ts)`);
  }
});
