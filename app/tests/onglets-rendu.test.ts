// Les onglets du design système RENDUS pour de vrai (ui/Onglets.tsx) : le vrai composant, lu par react-reconciler dans un arbre de JavaScript
// (tests/rendu), sans doublure du composant. Ce que l'écran affiche vraiment est comparé : l'ordre, l'actif, le compteur, la pastille, les
// rôles lus par les lecteurs d'écran, le rail du classeur ouvert (les tracés SVG), le clavier, le glissement entre panneaux. Les écrans migrés
// (cercle, lieu, profil, Followers et suivis) sont montés pour de bon plus bas : un seul composant, la même barre partout.
import "./rendu/hooks.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type Context, type ReactNode } from "react";
import type { Noeud } from "./rendu/rendu.mjs";
import { gabaritRiche, cheminsRail, marqueDe, opaciteCouleur, gaucheLibelle } from "../src/ui/onglets-calc.ts";

const { monter, trouver, textes, texte, activerHorloge, avancer } = await import("./rendu/rendu.mjs");
const { Onglets, PanneauxOnglets } = await import("../src/ui/Onglets.tsx");
const { CadreContenu } = await import("../src/ui/CadreContenu.tsx");
// Le banc de rendu lit la taille d'écran dans globalThis.__rendu (tests/rendu/natifs/react-native.mjs).
const banc = globalThis as unknown as { __rendu?: { ecran: { width: number; height?: number } } };
const theme = (await import("../src/theme/index.tsx")) as unknown as { __ContexteTheme: Context<unknown> };
const { modes } = await import("../src/theme/jetons.ts");

type Racine = Awaited<ReturnType<typeof monter>>;

const sous = (mode: "nuit" | "jour", e: ReactNode) => createElement(theme.__ContexteTheme.Provider, { value: { mode, apparence: mode, couleurs: modes[mode], choisir() {} } }, e);

const barres = (r: Noeud) => trouver(r, (n) => n.props.accessibilityRole === "tablist");
const onglets = (r: Noeud) => trouver(r, (n) => n.props.accessibilityRole === "tab");
const libelles = (r: Noeud) => onglets(r).map((n) => String(n.props.accessibilityLabel));
const actifs = (r: Noeud) => onglets(r).filter((n) => n.props.accessibilityState?.selected);
/** Les tracés du rail (le Svg posé directement dans la barre, pas ceux des icônes). */
const chemins = (r: Noeud) => {
  const rail = barres(r)[0]?.enfants.find((e) => e.type === "Svg");
  return rail ? trouver(rail, (n) => n.type === "Path").map((n) => String(n.props.d)) : [];
};
const aplati = (n: Noeud): Record<string, unknown> => Object.assign({}, ...([n.props.style].flat(9) as object[]).filter(Boolean));

// Reanimated « vivant » (tests/rendu/natifs/reanimated.mjs) : une horloge factice que seul le test fait avancer (`avancer`) ; les styles et
// les tracés animés se lisent à l'instant où l'on regarde. Une transition se joue à son terme avec `avancer(220)` : aucune attente réelle.
async function avec<T>(e: ReactNode, f: (r: Racine) => Promise<T>, mode: "nuit" | "jour" = "nuit"): Promise<T> {
  activerHorloge();
  const r = await monter(sous(mode, e));
  try {
    await r.jusqua((x) => trouver(x, (n) => n.props.accessibilityRole === "tablist" || !!n.props.__config).length > 0, "la barre d'onglets");
    return await f(r);
  } finally {
    await r.demonter();
  }
}

/** Donne à la barre sa largeur (et sa position), puis à chaque libellé la largeur de son texte : ce que fait l'écran à sa mise en page. */
async function mettreEnPage(r: Racine, largeur: number, y = 0, mesures: number[] = []) {
  await r.agir(() => barres(r.racine)[0]!.props.onLayout({ nativeEvent: { layout: { x: 0, y, width: largeur, height: 48 } } }));
  const lib = trouver(r.racine, (n) => n.type === "Text" && n.props.numberOfLines === 1 && typeof n.props.onLayout === "function");
  await r.agir(() => lib.forEach((n, i) => n.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: mesures[i] ?? 60, height: 20 } } })));
}

const DEUX = [
  { valeur: "followers", libelle: "Followers", compte: 0 },
  { valeur: "suivis", libelle: "Suivis", compte: 12 },
] as const;

// ——— Simple ———

test("simple : les onglets dans l'ordre, un seul actif, le compteur à droite du libellé (le 0 reste écrit)", async () => {
  await avec(createElement(Onglets, { etiquette: "Abonnements", onglets: DEUX, valeur: "followers", onChange() {} }), async (r) => {
    assert.equal(barres(r.racine).length, 1, "une seule barre");
    assert.equal(barres(r.racine)[0]!.props.accessibilityLabel, "Abonnements", "la barre a un nom pour les lecteurs d'écran");
    assert.deepEqual(libelles(r.racine), ["Followers 0", "Suivis 12"], "l'ordre, et ce que lit le lecteur : libellé puis compte");
    assert.deepEqual(actifs(r.racine).map((n) => n.props.accessibilityLabel), ["Followers 0"], "un seul actif");
    const compteurs = trouver(r.racine, (n) => n.type === "Text" && /^\d+$/.test(texte(n))).map(texte);
    assert.deepEqual(compteurs, ["0", "12"], "le compteur est un texte à part, le zéro y est");
    const premier = onglets(r.racine)[0]!;
    const noms = textes(premier);
    assert.ok(noms.indexOf("0") > noms.indexOf("Followers"), "à droite du libellé");
  });
});

test("simple : le libellé de l'actif est en 600 et t1, celui des autres en 500 et t2", async () => {
  await avec(createElement(Onglets, { etiquette: "x", onglets: DEUX, valeur: "suivis", onChange() {} }), async (r) => {
    // le libellé est écrit trois fois, superposés : la réserve (invisible, 600), le libellé de repos (500, t2) et le libellé actif (600, t1),
    // chacun sous un calque animé dont l'opacité les croise ; au repos, un seul est visible : celui dont le calque est à 1.
    const visible = (i: number) => {
      const calques = trouver(onglets(r.racine)[i]!, (n) => n.type === "Animated.View" && aplati(n).position === "absolute" && aplati(n).opacity === 1);
      assert.equal(calques.length, 1, "un seul libellé visible au repos");
      return trouver(calques[0]!, (n) => n.type === "Text" && texte(n) === DEUX[i]!.libelle)[0]!;
    };
    const reserve = trouver(onglets(r.racine)[0]!, (n) => n.type === "Text" && texte(n) === "Followers" && aplati(n).opacity === 0)[0]!;
    assert.equal(aplati(reserve).fontFamily, "Inter-SemiBold", "la largeur est réservée en 600 : rien ne saute quand l'onglet devient actif");
  });
});

test("simple : toucher un onglet inactif change d'onglet ; l'actif et le désactivé ne font rien", async () => {
  const appels: string[] = [];
  const liste = [{ valeur: "a", libelle: "A" }, { valeur: "b", libelle: "B" }, { valeur: "c", libelle: "C", desactive: true }];
  await avec(createElement(Onglets, { etiquette: "x", onglets: liste, valeur: "a", onChange: (v: string) => appels.push(v) }), async (r) => {
    const [a, b, c] = onglets(r.racine);
    await r.agir(() => a!.props.onPress());
    await r.agir(() => c!.props.onPress());
    assert.deepEqual(appels, [], "ni l'actif ni le désactivé");
    await r.agir(() => b!.props.onPress());
    assert.deepEqual(appels, ["b"]);
    assert.equal(c!.props.accessibilityState.disabled, true, "le désactivé est annoncé comme tel");
    assert.equal(a!.props.accessibilityState.disabled, false);
  });
});

test("rôles : tablist pour la barre, tab pour chaque onglet, un seul dans l'ordre de tabulation (l'actif)", async () => {
  await avec(createElement(Onglets, { etiquette: "x", onglets: DEUX, valeur: "suivis", onChange() {} }), async (r) => {
    assert.deepEqual(onglets(r.racine).map((n) => n.props.focusable), [false, true], "tabulation itinérante : seul l'actif prend le focus");
    assert.equal(barres(r.racine)[0]!.props.focusable, false);
  });
});

test("clavier : flèches, Début et Fin changent d'onglet en sautant les désactivés", async () => {
  const appels: string[] = [];
  const liste = [{ valeur: "a", libelle: "A" }, { valeur: "b", libelle: "B", desactive: true }, { valeur: "c", libelle: "C" }];
  await avec(createElement(Onglets, { etiquette: "x", onglets: liste, valeur: "a", onChange: (v: string) => appels.push(v) }), async (r) => {
    const touche = (key: string) => r.agir(() => barres(r.racine)[0]!.props.onKeyDown({ nativeEvent: { key } }));
    await touche("ArrowRight");
    await touche("End");
    await touche("ArrowLeft");
    await touche("Tab");
    assert.deepEqual(appels, ["c", "c", "c"], "droite saute B ; Fin va à C ; gauche boucle à C (A est l'actif, B désactivé) ; Tab ne fait rien");
  });
});

test("police à 130 % : chaque libellé tient sur une ligne et le texte est plafonné à 1,3", async () => {
  await avec(createElement(Onglets, { etiquette: "x", onglets: [{ valeur: "a", libelle: "Une rubrique au nom très long, vraiment", compte: 3 }, { valeur: "b", libelle: "Autre" }], valeur: "a", onChange() {} }), async (r) => {
    for (const t of trouver(r.racine, (n) => n.type === "Text")) {
      assert.equal(t.props.numberOfLines, 1, `« ${texte(t)} » sur une ligne`);
      assert.ok(t.props.maxFontSizeMultiplier <= 1.3, `« ${texte(t)} » plafonné`);
    }
  });
});

test("simple : la barre déborde des marges de la page (marge négative) et les onglets font 48 de haut", async () => {
  await avec(createElement(Onglets, { etiquette: "x", onglets: DEUX, valeur: "followers", onChange() {}, marge: 20 }), async (r) => {
    const racine = barres(r.racine)[0]!;
    const plat = Object.assign({}, ...(racine.props.style as object[]).flat(9).filter(Boolean));
    assert.equal(plat.marginHorizontal, -20);
    assert.equal(plat.height, 48);
    for (const o of onglets(r.racine)) assert.equal(Object.assign({}, ...(o.props.style as object[]).flat(9).filter(Boolean)).height, 48);
  });
});

// ——— Riche ———

const RICHE = [
  { valeur: "activite", libelle: "Activité", icone: "groupe3", compte: 3 },
  { valeur: "materiel", libelle: "Matériel", icone: "machine" },
  { valeur: "annonces", libelle: "Annonces", icone: "annonce", compte: 120 },
  { valeur: "cercles", libelle: "Cercles", icone: "trefle", point: true },
  { valeur: "infos", libelle: "Infos", icone: "info" },
] as const;

test("riche : une icône par onglet, la pastille (3, « 99+ »), le point, rien à 0 ; ce que lit le lecteur d'écran", async () => {
  await avec(createElement(Onglets, { version: "riche", etiquette: "Contenu", onglets: RICHE, valeur: "materiel", onChange() {} }), async (r) => {
    assert.deepEqual(libelles(r.racine), ["Activité, 3 nouveaux", "Matériel", "Annonces, 120 nouveaux", "Cercles", "Infos"]);
    assert.deepEqual(actifs(r.racine).map((n) => n.props.accessibilityLabel), ["Matériel"]);
    const icones = trouver(r.racine, (n) => n.type === "Svg").length;
    assert.ok(icones >= 5 * 2, `chaque onglet a son icône (au repos, puis colorée) : ${icones} dessins`);
    const pastilles = trouver(r.racine, (n) => n.type === "Text" && n.props.maxFontSizeMultiplier === 1).map(texte);
    assert.deepEqual(pastilles, ["3", "99+"], "la pastille de 3 et celle de « 99+ », rien pour les autres");
    assert.equal(marqueDe(0, true), "point");
  });
});

test("riche : le rail est dessiné en deux tracés, l'encoche est sous l'actif et suit le changement d'onglet", async () => {
  const g = (k: number, libelles: number[]) => gabaritRiche({ largeur: 390, marge: 16, libelles, marques: RICHE.map((o) => marqueDe("compte" in o ? o.compte : undefined, "point" in o ? o.point : undefined)), actif: k });
  const mesures = [60, 70, 80, 55, 40];
  const lib = mesures.map((m) => Math.ceil(m) + 1);
  const attendu = (k: number) => {
    const b = g(k, lib);
    return cheminsRail({ largeur: 390, hauteur: 54, montee: 0, x0: b.x[k]!, x1: b.x[k]! + b.largeurs[k]!, debord: 0 });
  };
  for (const k of [0, 2, 4]) {
    await avec(createElement(Onglets, { version: "riche", etiquette: "x", onglets: RICHE, valeur: RICHE[k]!.valeur, onChange() {} }), async (r) => {
      assert.equal(chemins(r.racine).length, 0, "rien n'est dessiné avant la mise en page");
      await mettreEnPage(r, 390, 0, mesures);
      const [voile, filet] = chemins(r.racine);
      assert.equal(voile, attendu(k).voile, `l'encoche sous l'onglet ${k}`);
      assert.equal(filet, attendu(k).filet, `le filet autour de l'onglet ${k}`);
    });
  }
  assert.notEqual(attendu(0).voile, attendu(4).voile);
});

test("riche : D6, le voile monte jusqu'à l'ancre (bas de la couverture) et passe derrière le contenu de l'en-tête", async () => {
  await avec(createElement(Onglets, { version: "riche", etiquette: "x", onglets: RICHE, valeur: "activite", onChange() {}, ancre: 228 }), async (r) => {
    assert.equal(barres(r.racine).length, 1);
    await mettreEnPage(r, 390, 300);
    const [voile] = chemins(r.racine);
    assert.ok(voile!.startsWith("M0 54V-72H390V54"), `le voile monte de 300 − 228 = 72 dp : ${voile}`);
    const plat = Object.assign({}, ...(barres(r.racine)[0]!.props.style as object[]).flat(9).filter(Boolean));
    assert.equal(plat.zIndex, -1, "derrière le contenu de l'en-tête");
  });
  await avec(createElement(Onglets, { version: "riche", etiquette: "x", onglets: RICHE, valeur: "activite", onChange() {} }), async (r) => {
    await mettreEnPage(r, 390, 300);
    assert.ok(chemins(r.racine)[0]!.startsWith("M0 54V0H390V54"), "sans ancre, le voile ne monte pas");
  });
});

test("riche : le voile est UNI, une seule teinte translucide (aucun dégradé), et monte de la barre à l'ancre", async () => {
  await avec(createElement(Onglets, { version: "riche", etiquette: "x", onglets: RICHE, valeur: "activite", onChange() {}, ancre: 228 }), async (r) => {
    await mettreEnPage(r, 390, 300);
    const rail = barres(r.racine)[0]!.enfants.find((x) => x.type === "Svg")!;
    assert.equal(trouver(rail, (n) => n.type === "LinearGradient" || n.type === "Defs").length, 0, "pas de dégradé");
    const fond = String(trouver(rail, (n) => n.type === "Path")[0]!.props.fill);
    assert.ok(fond.startsWith("rgba(") && [0.16, 0.2].includes(opaciteCouleur(fond)), `une couleur à 16 % (jour) ou 20 % (nuit) d'opacité : ${fond}`);
  });
});

test("riche : un onglet de 48 dp au moins de large et de haut, aussi à 130 % de police (rien ne dépasse)", async () => {
  await avec(createElement(Onglets, { version: "riche", etiquette: "x", onglets: RICHE, valeur: "activite", onChange() {} }), async (r) => {
    await mettreEnPage(r, 390, 0, [90, 100, 110, 90, 60]);
    for (const o of onglets(r.racine)) {
      const interieur = o.enfants.find((e) => e.type === "Animated.View")!;
      const plat = Object.assign({}, ...(interieur.props.style as object[]).flat(9).filter(Boolean));
      assert.ok(plat.width >= 48, `largeur ${plat.width}`);
      assert.equal(plat.height, 48);
    }
  });
});

test("riche : le libellé déplié a la hauteur de l'onglet (son texte est en absolu : sans hauteur il serait plié à 0), la mesure est dans une bande large", async () => {
  // Vu sur l'émulateur le 06/11 : le libellé de l'actif était invisible (conteneur de hauteur 0, overflow caché) et la largeur
  // mesurée d'un onglet de 48 était celle d'un texte plié. Le banc ne calcule aucune mise en page : on garde ce qui l'a causé.
  await avec(createElement(Onglets, { version: "riche", etiquette: "x", onglets: RICHE, valeur: "activite", onChange() {} }), async (r) => {
    const actif = onglets(r.racine)[0]!;
    const interieur = actif.enfants.find((e) => e.type === "Animated.View")!;
    const ouvre = interieur.enfants.find((e) => aplati(e).overflow === "hidden")!;
    assert.equal(aplati(ouvre).height, 48, "le conteneur du libellé a une hauteur propre");
    assert.ok(textes(ouvre).includes("Activité"), "il porte le libellé");
    const mesure = interieur.enfants.find((e) => e.type === "View" && aplati(e).position === "absolute" && aplati(e).opacity === 0)!;
    assert.ok(Number(aplati(mesure).width) >= 400, "la mesure du libellé se fait dans une bande large, pas dans les 48 de l'onglet");
    assert.ok(textes(mesure).includes("Activité"));
  });
});

test("riche : le jour comme la nuit, la même barre (mêmes onglets, même ordre)", async () => {
  const lire = (mode: "nuit" | "jour") => avec(createElement(Onglets, { version: "riche", etiquette: "x", onglets: RICHE, valeur: "infos", onChange() {} }), async (r) => libelles(r.racine), mode);
  assert.deepEqual(await lire("nuit"), await lire("jour"));
});

// ——— Grand écran : colonne de contenu bornée à 640 dp (Fold déplié) ———

// Retour d'Alex du 06/11 : sur le Fold déplié, « ça met la page et l'onglet en noir au lieu de foncer le haut ». Le voile du rail doit
// être un aplat translucide (opacité réduite), derrière les onglets et le panneau, bord à bord de l'écran, alors que les onglets restent
// sur les marges de la colonne ; l'onglet actif garde son libellé déplié et son encoche. Même rendu sous le thème de base (non teinté
// par SurfacePartie), où `segmentPiste` est un gris opaque : le voile ne doit pas le lire.
for (const mode of ["nuit", "jour"] as const) {
  for (const ecran of [390, 690, 820, 1306]) {
    test(`riche sur ${ecran} dp (${mode}) : voile translucide derrière les onglets, bord à bord, onglets sur la colonne, libellé de l'actif déplié`, async () => {
      banc.__rendu = { ecran: { width: ecran } };
      const colonne = Math.min(ecran, 640);
      const marge = (ecran - colonne) / 2;
      const montee = 72;
      const haut = 54;
      try {
        const e = createElement(CadreContenu, { route: "cercle/[pseudo]", children: createElement(Onglets, { version: "riche", etiquette: "x", onglets: RICHE, valeur: "activite", onChange() {}, ancre: 228 }) });
        await avec(
          e,
          async (r) => {
            const mesures = [90, 70, 80, 55, 40];
            await mettreEnPage(r, colonne, 300, mesures);
            const barre = barres(r.racine)[0]!;
            const rail = barre.enfants.find((x) => x.type === "Svg")!;
            const defile = barre.enfants.find((x) => x.type === "ScrollView" || x.type === "Animated.ScrollView")!;
            assert.ok(barre.enfants.indexOf(rail) < barre.enfants.indexOf(defile), "le voile est dessiné avant les onglets : derrière eux");
            // Bord à bord de l'écran : le dessin déborde de la colonne de la marge de chaque côté.
            assert.equal(rail.props.width, ecran, "le dessin a la largeur de l'écran, en dp (pas un pourcentage)");
            assert.equal(rail.props.viewBox, `${-marge} ${-montee} ${ecran} ${haut + montee}`);
            assert.equal(Number(aplati(rail).left) + 0, -marge + 0, "il commence au bord gauche de l'écran");
            const [voile, filet] = chemins(r.racine);
            assert.ok(voile!.startsWith(`M${-marge} ${haut}V${-montee}H${colonne + marge}V${haut}`), `le voile va de 0 à ${ecran} : ${voile}`);
            assert.ok(filet!.startsWith(`M${-marge} ${haut - 0.5}H`) && filet!.endsWith(`H${colonne + marge}`), `le filet aussi : ${filet}`);
            // Translucide : la couleur de la partie à opacité réduite, jamais un aplat opaque (le thème de base a un gris opaque).
            const [pv, pf] = trouver(rail, (n) => n.type === "Path");
            const vue = opaciteCouleur(String(pv!.props.fill));
            assert.ok(vue > 0 && vue <= 0.5, `le voile est translucide (opacité ${vue})`);
            assert.ok(opaciteCouleur(String(pf!.props.stroke)) < 1, "le filet aussi");
            assert.notEqual(pv!.props.fill, modes[mode].segmentPiste, "ce n'est pas le gris opaque du thème de base");
            // L'onglet actif est ouvert dans le voile : l'encoche est tracée sous lui (elle contient l'arc), il n'a aucun fond propre.
            assert.ok(/A10 10/.test(voile!), "l'encoche de l'actif est dans le voile");
            const actif = onglets(r.racine)[0]!;
            const interieur = actif.enfants.find((x) => x.type === "Animated.View")!;
            assert.equal(aplati(interieur).backgroundColor, undefined, "l'onglet actif n'a pas de fond : il est rattaché au panneau");
            // Les onglets sont sur les marges de la colonne : 16 de chaque côté de la colonne de 640 dp, pas de l'écran.
            const g = gabaritRiche({ largeur: colonne, marge: 16, libelles: mesures.map((m) => Math.ceil(m) + 1), marques: RICHE.map((o) => marqueDe("compte" in o ? o.compte : undefined, "point" in o ? o.point : undefined)), actif: 0 });
            const contenu = aplati(defile).contentContainerStyle ?? defile.props.contentContainerStyle;
            assert.equal((contenu as { paddingHorizontal: number }).paddingHorizontal, 16, "la marge des onglets est celle de la colonne");
            assert.equal((contenu as { minWidth: number }).minWidth, colonne, "la rangée ne dépasse pas la colonne");
            const largeurs = onglets(r.racine).map((o) => Number(aplati(o.enfants.find((x) => x.type === "Animated.View")!).width));
            assert.deepEqual(largeurs, g.largeurs, "chaque onglet a la largeur calculée sur la colonne");
            const somme = largeurs.reduce((a, b) => a + b, 0) + 2 * (largeurs.length - 1) + 32;
            assert.ok(Math.abs(somme - colonne) < 0.5, `la rangée remplit la colonne (${somme} pour ${colonne})`);
            // Le libellé de l'actif est déplié (largeur du texte mesurée + 8), pleinement visible.
            const ouvre = interieur.enfants.find((x) => aplati(x).overflow === "hidden")!;
            assert.equal(Number(aplati(ouvre).width), gaucheLibelle("pastille") + Math.ceil(mesures[0]!) + 1, "le libellé est déplié à la largeur de son texte (après la place de la pastille)");
            assert.equal(aplati(ouvre).opacity, 1, "et opaque : on le lit");
            assert.ok(textes(ouvre).includes("Activité"));
          },
          mode,
        );
      } finally {
        banc.__rendu = undefined;
      }
    });
  }
}

// ——— Glissement entre panneaux ———

type Config = {
  onMoveShouldSetPanResponder: (e: unknown, g: { dx: number; dy: number; x0: number }) => boolean;
  onPanResponderRelease: (e: unknown, g: { dx: number; vx: number }) => void;
};
const panneau = (r: Noeud) => trouver(r, (n) => n.props.__config)[0]!;
const config = (r: Noeud) => panneau(r).props.__config as Config;
const toucher = (r: Noeud, pageX: number) => panneau(r).props.onTouchStartCapture({ nativeEvent: { pageX } });

test("D4 : un glissé nettement horizontal passe au panneau voisin ; un départ sur le bord gauche (volet) ne prend pas la main", async () => {
  const appels: string[] = [];
  const liste = ["a", "b", "c"];
  await avec(createElement(PanneauxOnglets, { onglets: liste, valeur: "b", onChange: (v: string) => void appels.push(v), children: createElement("Contenu", null, "panneau") }), async (r) => {
    const c = config(r.racine);
    toucher(r.racine, 200);
    assert.equal(c.onMoveShouldSetPanResponder({}, { dx: -60, dy: 4, x0: 0 }), true, "pris malgré x0 = 0 : le départ vient du toucher");
    c.onPanResponderRelease({}, { dx: -220, vx: -0.3 });
    c.onPanResponderRelease({}, { dx: 220, vx: 0.3 });
    toucher(r.racine, 12);
    assert.equal(c.onMoveShouldSetPanResponder({}, { dx: 60, dy: 4, x0: 0 }), false, "le bord gauche est au volet");
    toucher(r.racine, 200);
    assert.equal(c.onMoveShouldSetPanResponder({}, { dx: 8, dy: 0, x0: 0 }), false, "trop court : c'est un appui");
    assert.equal(c.onMoveShouldSetPanResponder({}, { dx: 40, dy: 60, x0: 0 }), false, "plutôt vertical : le défilement garde la main");
    assert.deepEqual(appels, ["c", "a"], "à gauche : suivant ; à droite : précédent");
  });
});

test("D4 : aux bords, rien ; un panneau qui défile à l'horizontale garde son geste ; `glisse={false}` coupe le raccourci", async () => {
  const appels: string[] = [];
  const e = (valeur: string, extra: object = {}) => createElement(PanneauxOnglets, { onglets: ["a", "b"], valeur, onChange: (v: string) => void appels.push(v), children: createElement("Contenu", null, "x"), ...extra });
  await avec(e("a"), async (r) => {
    toucher(r.racine, 200);
    config(r.racine).onPanResponderRelease({}, { dx: 220, vx: 0.4 });
    assert.deepEqual(appels, [], "le premier onglet : rien avant lui");
  });
  await avec(e("b"), async (r) => {
    config(r.racine).onPanResponderRelease({}, { dx: -220, vx: -0.4 });
    assert.deepEqual(appels, [], "le dernier : rien après lui");
  });
  await avec(e("a", { defileHorizontal: true }), async (r) => {
    toucher(r.racine, 200);
    assert.equal(config(r.racine).onMoveShouldSetPanResponder({}, { dx: -60, dy: 0, x0: 0 }), false);
  });
  await avec(e("a", { glisse: false }), async (r) => {
    toucher(r.racine, 200);
    assert.equal(config(r.racine).onMoveShouldSetPanResponder({}, { dx: -60, dy: 0, x0: 0 }), false);
  });
});

test("D4 : la liste des panneaux peut porter des désactivés (ils sont sautés)", async () => {
  const appels: string[] = [];
  const liste = [{ valeur: "a" }, { valeur: "b", desactive: true }, { valeur: "c" }];
  await avec(createElement(PanneauxOnglets, { onglets: liste, valeur: "a", onChange: (v: string) => void appels.push(v), children: createElement("Contenu", null, "x") }), async (r) => {
    config(r.racine).onPanResponderRelease({}, { dx: -220, vx: -0.4 });
    assert.deepEqual(appels, ["c"]);
  });
});
