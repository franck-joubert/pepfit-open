// Tirer pour actualiser : un seul mécanisme, ui/Actualiser, branché en quelques lignes par page. Ce test classe
// TOUTES les routes de l'appli : branchée (et on vérifie qu'elle l'est) ou exception justifiée. Une route ajoutée plus tard
// fait échouer le test tant qu'on n'a pas choisi.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const SRC = new URL("../src/", import.meta.url).pathname;
const lire = (f: string) => readFileSync(join(SRC, f), "utf8");

function fichiers(dossier: string, motif = /\.tsx?$/): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    return statSync(p).isDirectory() ? fichiers(p, motif) : motif.test(n) ? [relative(SRC, p)] : [];
  });
}

/** Une route = un fichier de src/app, hors mises en page (_layout) et page d'erreur (+not-found). */
const ROUTES = fichiers(join(SRC, "app"), /\.tsx$/).filter((f) => !/\/(_|\+)[^/]*$/.test(f));

// ——— Les pages branchées : route → fichier de l'écran qui porte le branchement ———
const MESURE = "ecrans/mesures/";
const BRANCHEES: Record<string, string> = {
  // les trois onglets
  "app/(tabs)/health.tsx": "ecrans/Sante.tsx",
  "app/(tabs)/train.tsx": "app/(tabs)/train.tsx",
  "app/(tabs)/food.tsx": "ecrans/nutrition/Journal.tsx",
  // pages de statistiques et de détail, sur le gabarit PageMesure
  "app/sante/pas.tsx": `${MESURE}Pas.tsx`,
  "app/sante/energie.tsx": `${MESURE}Energie.tsx`,
  "app/sante/sommeil.tsx": `${MESURE}Sommeil.tsx`,
  "app/sante/recuperation.tsx": `${MESURE}Recuperation.tsx`,
  "app/sante/effort.tsx": `${MESURE}Effort.tsx`,
  "app/sante/fc.tsx": `${MESURE}Coeur.tsx`,
  "app/sante/vfc.tsx": `${MESURE}Coeur.tsx`,
  "app/sante/poids.tsx": `${MESURE}Corps.tsx`,
  "app/sante/gras.tsx": `${MESURE}Corps.tsx`,
  "app/sante/tour.tsx": `${MESURE}PageTour.tsx`,
  "app/sante/vo2max.tsx": `${MESURE}Vo2.tsx`,
  "app/nutrition/fibres.tsx": `${MESURE}Fibres.tsx`,
  "app/sante/age.tsx": `${MESURE}AgePepfit.tsx`,
  "app/sante/cycle.tsx": "ecrans/cycle/Cycle.tsx",
  "app/sante/ce-qui-marche.tsx": "ecrans/recuperer-vues/CeQuiMarche.tsx",
  "app/sante/voyage.tsx": "ecrans/heure-voyage/PageVoyage.tsx",
  "app/sante/heure.tsx": "ecrans/heure-voyage/PageChangementHeure.tsx",
  // pages de chiffres sur EcranSuivi (option `actualiser`) et page Précision
  "app/sante/metabolisme.tsx": "ecrans/Metabolisme.tsx",
  "app/sante/mesure.tsx": "ecrans/HistoriqueMesure.tsx",
  "app/profil/precision.tsx": "ecrans/precision/PagePrecision.tsx",
  "app/gym/[id].tsx": "app/gym/[id].tsx",
};

/**
 * Ce qui branche vraiment une page : le composant lui-même, le gabarit PageMesure (qui l'embarque) ou EcranSuivi avec
 * `actualiser`.
 */
const BRANCHE = [
  /<Actualiser\b/,
  /<PageMesure\b/,
  /<EcranSuivi\b[^>]*\bactualiser\b/,
];
const branche = (s: string) => BRANCHE.some((r) => r.test(s));

// ——— Les exceptions : un fichier ou un dossier (se termine par « / ») → la raison ———
const EXCEPTIONS: Record<string, string> = {
  // écrans d'entrée et redirections
  "app/(tabs)/index.tsx": "porte d'entrée : redirige vers le premier onglet, aucun contenu",
  "app/sante/composition.tsx": "redirection vers la page Poids",
  "app/nutrition/mesure.tsx": "redirection vers la page d'un tour de mesure",
  "app/nutrition/mensurations.tsx": "redirection vers la page Poids (tours)",
  "app/tableau-de-bord.tsx": "ancien Accueil modulable, désactivé",
  "app/welcome.tsx": "première ouverture : étapes à écran fixe",
  "app/done.tsx": "écran de fin de séance, sans donnée à relire",
  // pages de mois et d'agenda : on y choisit un jour, ce ne sont pas des chiffres
  "app/sante/mois.tsx": "calendrier ou liste de jours pour en choisir un",
  "app/sante/agenda.tsx": "liste de jours pour en choisir un",
  "app/sante/cycle-mois.tsx": "calendrier du cycle pour choisir un jour",
  "app/nutrition/mois.tsx": "calendrier ou liste de jours pour en choisir un",
  "app/calendrier.tsx": "calendrier ou liste de séances pour choisir un jour",
  // saisie, réglage et exercice guidé
  "app/sante/mensurations.tsx": "parcours de saisie des mesures",
  "app/sante/endormir.tsx": "exercice guidé d'endormissement",
  "app/sante/rappel-coucher.tsx": "réglage du rappel du coucher (PageMesure avec actualiser={false})",
  "app/recuperer/": "exercices de récupération guidés (respiration : PageMesure avec actualiser={false})",
  "app/nutrition/": "saisie d'aliments et de plats, scan, objectifs : formulaires et recherche",
  "app/blessures/": "suivi qu'on modifie (blessures) : listes et fiches de saisie",
  "app/traitements/": "suivi qu'on modifie (compléments) : listes et fiches de saisie",
  "app/settings/": "réglages : formulaires et choix",
  "app/profil/": "profil personnel (formulaires, parcours d'introduction, listes)",
  "app/circuit/": "page d'un circuit (fiche lue à l'ouverture, Réessayer si elle ne vient pas) et sa carte plein écran, où le glissé est celui de la carte",
  // séance en cours et ses écrans
  "app/session.tsx": "séance en cours",
  "app/suivi/": "suivi d'une séance en cours (départ, direct, fin)",
  "app/seance-recap.tsx": "récapitulatif d'une séance terminée (archive)",
  "app/history/": "historique et détail d'une séance terminée (archive, avec modification)",
  "app/progress/": "progression d'un exercice, avec saisie",
  "app/swap.tsx": "choix d'un exercice de remplacement (feuille plein écran)",
  "app/pick.tsx": "choix d'un exercice (sélecteur)",
  // catalogues et listes de choix
  "app/boutique/": "catalogue et fiches de la boutique",
  "app/programmes.tsx": "catalogue de programmes",
  "app/plan/": "plan d'un programme",
  "app/routines.tsx": "liste de routines qu'on modifie",
  "app/routine/": "fiche de routine qu'on modifie",
  "app/gyms.tsx": "liste de lieux à choisir",
  "app/gym/machine.tsx": "fiche d'une machine",
  "app/3d/": "visionneuse 3D",
  "app/whoop.tsx": "retour de connexion Whoop",
  "app/withings.tsx": "retour de connexion Withings",
  "app/polar.tsx": "retour de connexion Polar",
};

const cle = (f: string) => Object.keys(EXCEPTIONS).find((e) => (e.endsWith("/") ? f.startsWith(e) : f === e));

test("toute route est classée : branchée ou exception justifiée", () => {
  const sansClasse = ROUTES.filter((f) => !(f in BRANCHEES) && !cle(f));
  assert.deepEqual(sansClasse, [], "routes ni branchées ni exceptions : brancher <Actualiser> (ui/Actualiser) ou les ajouter aux exceptions avec leur raison");
  const doubles = ROUTES.filter((f) => f in BRANCHEES && cle(f) && !(cle(f) as string).endsWith("/"));
  assert.deepEqual(doubles, [], "routes à la fois branchées et exceptions");
});

test("chaque page branchée l'est vraiment, par le composant commun", () => {
  for (const [route, ecran] of Object.entries(BRANCHEES)) {
    assert.ok(ROUTES.includes(route), `${route} n'existe plus : retirer de la liste`);
    const s = lire(ecran);
    assert.ok(branche(s), `${route} : ${ecran} ne branche pas Actualiser`);
    // une page branchée n'éteint jamais le tirage (seuls un réglage et un exercice le font : voir plus bas)
    assert.ok(!/\bactualiser=\{false\}/.test(s), `${route} : ${ecran} éteint le tirage (actualiser={false})`);
  }
});

test("les gabarits qui embarquent le tirage le portent, avec le recalcul de la page", () => {
  for (const f of ["ecrans/mesures/gabarit.tsx", "ecrans/suivi-ui.tsx"]) assert.match(lire(f), /<Actualiser\b/, f);
  assert.match(lire("ecrans/mesures/gabarit.tsx"), /actualiser = true/, "PageMesure : tirage par défaut");
  assert.match(lire("ecrans/suivi-ui.tsx"), /actualiser = false/, "EcranSuivi : tirage à la demande (listes et fiches non)");
});

test("les exceptions sont à jour : elles visent des routes, avec une vraie raison, sans être branchées", () => {
  for (const [chemin, raison] of Object.entries(EXCEPTIONS)) {
    assert.ok(raison.length > 12, `${chemin} : raison`);
    const cibles = ROUTES.filter((f) => (chemin.endsWith("/") ? f.startsWith(chemin) : f === chemin));
    assert.ok(cibles.length > 0, `${chemin} ne vise plus aucune route : retirer l'exception`);
    for (const f of cibles) if (!(f in BRANCHEES)) assert.ok(!/<Actualiser\b/.test(lire(f)), `${f} branche déjà Actualiser : retirer l'exception`);
  }
});

test("les pages sur gabarit qui sont un réglage ou un exercice éteignent le tirage", () => {
  assert.match(lire("ecrans/heure-voyage/PageRappelCoucher.tsx"), /<PageMesure titre=\{t\("heureVoyage\.rappel"\)\} actualiser=\{false\}>/);
  assert.match(lire("ecrans/recuperer-vues/Respiration.tsx"), /<PageMesure titre=\{t\("recuperer\.respi\.titre"\)\} actualiser=\{false\}>/);
});

test("un seul mécanisme : le composant, jamais un RefreshControl ni un second geste de tirage", () => {
  for (const f of fichiers(SRC)) {
    const s = lire(f);
    assert.ok(!/\bRefreshControl\b|\bonRefresh\b/.test(s), `${f} : RefreshControl ou onRefresh (utiliser ui/Actualiser)`);
    if (f !== "ui/Actualiser.tsx" && !f.startsWith("actualiser/")) assert.ok(!/actualiserMaintenant\(/.test(s), `${f} lance l'actualisation sans passer par ui/Actualiser`);
  }
});

test("l'indicateur : un filet à la couleur de la partie, sans spinner ni texte, sans reste de planche", () => {
  const i = lire("ui/IndicateurActualiser.tsx");
  assert.match(i, /useCouleurPartie\(\)/, "la couleur de la partie");
  assert.match(i, /<Reflet\b/, "le reflet du bouton principal");
  assert.ok(!/ActivityIndicator|<Svg\b|<Texte\b|<Text\b|\bt\("/.test(i), "ni spinner natif, ni arc, ni texte");
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(i.replace(/couleur: "#ffffff"/g, "")), "aucune couleur en dur, hors le blanc du reflet");
  const c = lire("ui/Actualiser.tsx");
  assert.ok(!/lireReglage|useState/.test(c), "le composant ne lit aucun réglage de planche");
  for (const f of fichiers(SRC)) assert.ok(!/actualiser_variante|actualiser_fige/.test(lire(f)), `${f} : reste de planche`);
  // le gonflement au seuil ne joue pas en mouvement réduit
  assert.match(c, /if \(!reduitSV\.value\) pop\.value/);
});

test("le composant : geste natif sans conflit avec le défilement, jamais deux synchros, aucun texte", () => {
  const s = lire("ui/Actualiser.tsx");
  // le tirage ne compte que tout en haut, ne gêne ni le défilement vers le haut ni le glissé horizontal
  assert.match(s, /defilement\.value <= 1/);
  assert.match(s, /failOffsetY: \[-8,/);
  assert.match(s, /failOffsetX: \[-12, 12\]/);
  // l'indicateur ne capte aucun toucher
  assert.match(s, /pointerEvents="none"/);
  // mouvement réduit : pas de rotation ni de déplacement, un fondu
  assert.match(s, /reduitSV\.value/);
  // pas de libellé : l'indicateur est caché des lecteurs d'écran
  assert.match(s, /no-hide-descendants/);
  assert.ok(!/<Texte\b|<Text\b|\bt\("/.test(s), "aucun texte dans l'indicateur");
  // un seul lancement à la fois : le geste est coupé pendant une actualisation
  assert.match(s, /!enCours\.value/);
});

/** Ce qui doit descendre avec la page, par fichier : l'en-tête est entre <Actualiser> et </Actualiser>. */
const ENTETES: Record<string, string> = {
  "app/(tabs)/train.tsx": "<TeteOnglet",
  "ecrans/nutrition/Journal.tsx": "<TeteOnglet",
  "ecrans/Sante.tsx": "<TeteOnglet",
  "ecrans/mesures/gabarit.tsx": "styles.tete",
  "ecrans/suivi-ui.tsx": "{corps}",
  "ecrans/precision/PagePrecision.tsx": "{tete}",
  "app/gym/[id].tsx": "<BarreHaut",
};

test("l'en-tête descend avec la page : il est dans <Actualiser>, jamais au-dessus", () => {
  for (const [f, marque] of Object.entries(ENTETES)) {
    const s = lire(f);
    const debut = s.indexOf("<Actualiser");
    const fin = s.indexOf("</Actualiser>");
    assert.ok(debut >= 0 && fin > debut, `${f} : <Actualiser> introuvable`);
    const dedans = s.slice(debut, fin);
    assert.ok(dedans.includes(marque), `${f} : « ${marque} » doit être dans <Actualiser> pour descendre avec la page`);
    assert.ok(!/<Actualiser\b[^>]*\bdecalage=/.test(s), `${f} : plus de décalage, l'indicateur est dans le vide laissé par la page`);
  }
});

test("chaque ScrollView tiré coupe l'étirement natif d'Android (sansEtirement), sinon le contenu s'allonge sans l'en-tête", () => {
  for (const f of Object.keys(ENTETES)) assert.match(lire(f), /\.\.\.(\(actualiser \? sansEtirement : null\)|sansEtirement)/, f);
  assert.match(lire("ui/Actualiser.tsx"), /export const sansEtirement = \{ overScrollMode: "never" \}/);
});

test("la bulle « Annuler » de l'Effort reste hors du tirage : elle ne descend pas avec la page", () => {
  const s = lire("app/(tabs)/train.tsx");
  assert.ok(s.indexOf("plan.bulle(") > s.indexOf("</Actualiser>"), "la bulle est après </Actualiser>");
});

test("pendant un glisser-déposer ou un aliment tenu, le tirage est suspendu", () => {
  assert.match(lire("app/(tabs)/train.tsx"), /<Actualiser\b[^\n]*actif=\{!plan\.souleve\}/);
  assert.match(lire("ecrans/nutrition/Journal.tsx"), /<Actualiser\b[^\n]*actif=\{!tenu\}/);
});
