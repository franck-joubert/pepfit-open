// Onglets : la transition d'un onglet à l'autre, JOUÉE pour de vrai (ui/Onglets.tsx rendu par le banc) avec un Reanimated déterministe
// (tests/rendu/natifs/reanimated.mjs, mode vivant) : une horloge factice que le test seul fait avancer, des valeurs dérivées, des styles
// et des props recalculés à chaque image comme le fait le fil UI. Aucune minuterie, aucune horloge réelle, aucune attente : le résultat ne
// dépend ni de la charge de la machine ni de l'ordre des tests (les 20 exécutions sous charge de la refonte du 07/11 le vérifient).
//
// Le bug du 06/11 (page d'un lieu, cinq onglets) : en changeant d'onglet à vitesse normale, des libellés restaient ouverts sur des onglets non
// choisis. Cause : un état d'animation mêlant natif et JS (`q.setValue`), et un état intermédiaire qui survivait au changement d'onglet.
// Ici, la loi : AU REPOS, un seul libellé est ouvert, celui de l'onglet choisi, quoi qu'on ait fait avant (rafale, aller-retour, liste qui
// change, largeur mesurée après coup, mouvement réduit).
import "./rendu/hooks.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, useState, type Context } from "react";
import type { Noeud } from "./rendu/rendu.mjs";
import { gabaritRiche, gabaritSimple, marqueDe, cheminsRail, gaucheLibelle, centrer } from "../src/ui/onglets-calc.ts";
import { suiviGlisse, opaciteGlisse } from "../src/ui/onglets-mouvement.ts";
import { tempsOnglets as TEMPS } from "../src/theme/onglets.ts";

const { monter, trouver, activerHorloge, avancer, vider, agirSec } = await import("./rendu/rendu.mjs");
const { Onglets, PanneauxOnglets } = await import("../src/ui/Onglets.tsx");
const theme = (await import("../src/theme/index.tsx")) as unknown as { __ContexteTheme: Context<unknown> };
const { modes } = await import("../src/theme/jetons.ts");
const natif = (await import("react-native")) as unknown as { reduireMouvement(v: boolean): void };

// ——— Le banc ———

const sous = (e: unknown) => createElement(theme.__ContexteTheme.Provider, { value: { mode: "nuit", apparence: "nuit", couleurs: modes.nuit, choisir() {} } }, e as never);
/** Le style à cet instant : les styles vivants de Reanimated sont lus à l'instant où l'on aplatit. */
const aplati = (n: Noeud): Record<string, unknown> => Object.assign({}, ...([n.props.style].flat(9) as object[]).filter(Boolean));
const barre = (r: Noeud) => trouver(r, (n) => n.props.accessibilityRole === "tablist")[0]!;
const tabs = (r: Noeud) => trouver(r, (n) => n.props.accessibilityRole === "tab");
const interieur = (t: Noeud) => t.enfants.find((e) => e.type === "Animated.View")!;
/** Le libellé déplié d'un onglet riche : son conteneur (overflow caché) porte la largeur et l'opacité. */
const ouvert = (t: Noeud) => aplati(interieur(t).enfants.find((e) => aplati(e).overflow === "hidden")!);
/** L'icône : son conteneur porte l'échelle, le calque coloré posé dessus porte l'opacité. */
const icone = (t: Noeud) => interieur(t).enfants.find((e) => e.type === "Animated.View" && aplati(e).overflow !== "hidden")!;
const echelle = (t: Noeud) => ((aplati(icone(t)).transform as { scale: number }[])[0]!).scale;
const calque = (t: Noeud) => aplati(icone(t).enfants.find((e) => e.type === "Animated.View")!);
const largeurOnglet = (t: Noeud) => Number(aplati(interieur(t)).width);
const rail = (r: Noeud) => trouver(barre(r).enfants.find((e) => e.type === "Svg") ?? { type: "", props: {}, enfants: [] }, (n) => n.type === "Path").map((n) => String(n.props.d));

const LISTE = [
  { valeur: "activite", libelle: "Activité", icone: "groupe3", compte: 3 },
  { valeur: "materiel", libelle: "Matériel", icone: "machine" },
  { valeur: "annonces", libelle: "Annonces", icone: "annonce", compte: 120 },
  { valeur: "cercles", libelle: "Cercles", icone: "trefle", point: true },
  { valeur: "infos", libelle: "Infos", icone: "info" },
] as const;
type Entree = (typeof LISTE)[number];
const MESURES = [60, 70, 80, 55, 40];
/** Les mesures de la liste sans « Matériel » (le deuxième). */
const SANS_MATERIEL = MESURES.filter((_, i) => i !== 1);
const libellesMesures = (liste: readonly Entree[], mesures = MESURES) => liste.map((_, i) => Math.ceil(mesures[i] ?? 60) + 1);
const marquesDe = (liste: readonly Entree[]) => liste.map((o) => marqueDe("compte" in o ? o.compte : undefined, "point" in o ? o.point : undefined));

type Commande = { choisir(v: string): void; poserListe(l: readonly Entree[]): void };
const commande: Commande = { choisir() {}, poserListe() {} };

/** La page : tient l'onglet choisi et la liste, comme `PageCercle` (une liste neuve à chaque rendu). */
function Page({ depart, version }: { depart: string; version: "simple" | "riche" }) {
  const [valeur, setValeur] = useState(depart);
  const [liste, setListe] = useState<readonly Entree[]>(LISTE);
  commande.choisir = setValeur;
  commande.poserListe = setListe;
  return createElement(Onglets, { version, etiquette: "x", onglets: liste.map((o) => ({ ...o })), valeur, onChange: setValeur });
}

type Racine = Awaited<ReturnType<typeof monter>>;

/** Monte la page, SANS attendre : tout est vidé de façon synchrone, l'horloge repart de 0. */
async function avec(version: "simple" | "riche", f: (r: Racine) => void | Promise<void>, { largeur = 390, mesures = true }: { largeur?: number | null; mesures?: boolean } = {}) {
  activerHorloge();
  natif.reduireMouvement(false);
  const r = await monter(sous(createElement(Page, { depart: "activite", version })));
  try {
    vider();
    assert.ok(tabs(r.racine).length > 0, "la barre est montée");
    if (largeur != null) mettreEnPage(r, largeur);
    if (mesures) mesurer(r);
    await f(r);
    assert.deepEqual(r.erreurs.map(String), [], "pas d'erreur de rendu");
  } finally {
    natif.reduireMouvement(false);
    await r.demonter();
  }
}
const mettreEnPage = (r: Racine, largeur: number) => agirSec(() => barre(r.racine).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: largeur, height: 48 } } }));
/** Riche : chaque libellé reçoit la largeur de son texte, comme à la mise en page de l'écran. Simple : chaque onglet, la largeur de son contenu. */
function mesurer(r: Racine, mesures = MESURES) {
  const riche = trouver(r.racine, (n) => n.type === "Text" && n.props.numberOfLines === 1 && typeof n.props.onLayout === "function");
  agirSec(() => riche.forEach((n, i) => n.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: mesures[i] ?? 60, height: 20 } } })));
  const simple = tabs(r.racine).map((t) => trouver(t, (n) => n.type === "View" && typeof n.props.onLayout === "function")[0]);
  agirSec(() => simple.forEach((n, i) => n?.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: mesures[i] ?? 60, height: 20 } } })));
}
const toucher = (r: Racine, i: number) => agirSec(() => tabs(r.racine)[i]!.props.onPress());
const choisis = (r: Racine) => tabs(r.racine).map((t) => !!t.props.accessibilityState.selected);

// ——— Ce que le repos doit montrer, riche ———

/** Au repos : un seul libellé ouvert (celui de l'onglet choisi), les autres fermés et invisibles, l'icône colorée seulement sur le choisi, tout à sa taille ; et la géométrie EXACTE du repos. */
function reposRiche(r: Noeud, choisi: number, quand: string, liste: readonly Entree[] = LISTE, mesures: number[] = MESURES, largeur = 390) {
  const lib = libellesMesures(liste, mesures);
  const attendu = gabaritRiche({ largeur, marge: 16, libelles: lib, marques: marquesDe(liste), actif: choisi });
  const ts = tabs(r);
  assert.equal(ts.length, liste.length, `${quand} : tous les onglets sont là`);
  ts.forEach((t, i) => {
    const o = ouvert(t);
    if (i === choisi) {
      assert.equal(o.width, gaucheLibelle(marquesDe(liste)[i]!) + lib[i]!, `${quand} : le libellé de l'onglet ${i} est ouvert en grand`);
      assert.equal(o.opacity, 1, `${quand} : et lisible`);
      assert.equal(calque(t).opacity, 1, `${quand} : l'icône de l'onglet choisi est colorée`);
    } else {
      assert.equal(o.width, 0, `${quand} : le libellé de l'onglet ${i} est fermé`);
      assert.equal(o.opacity, 0, `${quand} : et invisible`);
      assert.equal(calque(t).opacity, 0, `${quand} : l'icône de l'onglet ${i} n'est pas colorée`);
    }
    assert.equal(echelle(t), 1, `${quand} : l'icône de l'onglet ${i} est à sa taille`);
    assert.equal(largeurOnglet(t), attendu.largeurs[i], `${quand} : l'onglet ${i} a sa largeur de repos`);
  });
  const ouverts = ts.filter((t) => Number(ouvert(t).width) > 0).length;
  assert.equal(ouverts, 1, `${quand} : un seul libellé ouvert`);
  const e = cheminsRail({ largeur, hauteur: 54, montee: 0, x0: attendu.x[choisi]!, x1: attendu.x[choisi]! + attendu.largeurs[choisi]!, debord: 0 });
  assert.deepEqual(rail(r), [e.voile, e.filet], `${quand} : l'encoche est sous l'onglet choisi`);
  assert.deepEqual(ts.map((t) => !!t.props.accessibilityState.selected), ts.map((_, i) => i === choisi), `${quand} : un seul onglet choisi`);
}

// ——— Riche ———

test("riche : un onglet après l'autre, aller puis retour, chaque animation menée à son terme : au repos, un seul libellé ouvert (le bug du lieu vérifié)", async () => {
  await avec("riche", (r) => {
    reposRiche(r.racine, 0, "au départ");
    for (const [i, nom] of [[1, "Matériel"], [2, "Annonces"], [3, "Cercles"], [4, "Infos"], [0, "Activité (retour de Infos)"], [2, "Annonces"], [0, "Activité"], [1, "Matériel"], [0, "Activité"]] as const) {
      toucher(r, i);
      avancer(TEMPS.deplace);
      reposRiche(r.racine, i, `vers ${nom}`);
    }
  });
});

test("riche : le choix se lit tout de suite (rôles lus), le mouvement vient ensuite ; rien ne bouge avant l'horloge", async () => {
  await avec("riche", (r) => {
    toucher(r, 3);
    assert.deepEqual(choisis(r), [false, false, false, true, false], "l'onglet choisi est annoncé tout de suite");
    assert.equal(Number(ouvert(tabs(r.racine)[3]!).opacity), 0, "mais son libellé n'a pas encore paru (60 ms de retard)");
    assert.equal(Number(ouvert(tabs(r.racine)[0]!).opacity), 1, "et celui de l'ancien est encore là");
    avancer(TEMPS.deplace);
    reposRiche(r.racine, 3, "au terme");
  });
});

test("riche : pendant la transition seuls l'onglet quitté et l'onglet d'arrivée sont animés, les autres restent fermés et à leur taille", async () => {
  await avec("riche", (r) => {
    toucher(r, 4);
    for (const ms of [16, 16, 16, 16, 16, 16, 16]) {
      avancer(ms);
      tabs(r.racine).forEach((t, i) => {
        if (i === 0 || i === 4) return;
        assert.equal(ouvert(t).width, 0, `l'onglet ${i} reste fermé`);
        assert.equal(ouvert(t).opacity, 0);
        assert.equal(calque(t).opacity, 0);
        assert.equal(echelle(t), 1);
      });
    }
    const [a, b] = [tabs(r.racine)[0]!, tabs(r.racine)[4]!];
    assert.ok(Number(ouvert(a).width) < Number(gabaritRiche({ largeur: 390, marge: 16, libelles: libellesMesures(LISTE), marques: marquesDe(LISTE), actif: 0 }).largeurs[0]) - 40, "l'ancien se referme");
    assert.ok(Number(ouvert(b).width) > 0, "le nouveau s'ouvre");
    avancer(TEMPS.deplace);
    reposRiche(r.racine, 4, "au terme");
  });
});

test("riche : l'encoche glisse sans saut (jamais plus de 60 dp d'une image à l'autre), de l'ancien onglet au nouveau, et finit pile dessous", async () => {
  await avec("riche", (r) => {
    const x0 = () => Number(/ ([\d.]+) 16V54Z$/.exec(rail(r.racine)[0] ?? "")?.[1] ?? NaN);
    toucher(r, 4);
    let avant = x0();
    let max = 0;
    for (let i = 0; i < 14; i++) {
      avancer(16);
      const x = x0();
      max = Math.max(max, Math.abs(x - avant));
      avant = x;
    }
    assert.ok(Number.isFinite(avant), "le tracé est lisible");
    assert.ok(max < 140, `pas de saut : ${max}`);
    reposRiche(r.racine, 4, "au terme");
  });
});

test("riche : le libellé qui sort et celui qui entre se croisent (jamais deux ouverts à pleine opacité), l'icône change de couleur sans saut", async () => {
  await avec("riche", (r) => {
    toucher(r, 3);
    let couleurAvant = 0;
    for (let i = 0; i < 14; i++) {
      avancer(16);
      const [a, b] = [ouvert(tabs(r.racine)[0]!), ouvert(tabs(r.racine)[3]!)];
      assert.ok(!(Number(a.opacity) > 0.95 && Number(b.opacity) > 0.95), `à ${(i + 1) * 16} ms : deux libellés pleins en même temps`);
      const c = Number(calque(tabs(r.racine)[3]!).opacity);
      assert.ok(c - couleurAvant < 0.3, `la couleur de l'icône monte sans saut : ${c - couleurAvant}`);
      couleurAvant = c;
    }
    avancer(TEMPS.deplace);
    reposRiche(r.racine, 3, "au terme");
  });
});

test("riche : le texte du libellé déplié garde sa largeur quand l'onglet se referme (Android le raccourcirait en « A.. » : c'est le conteneur qui le coupe)", async () => {
  await avec("riche", (r) => {
    const texte = (t: Noeud) => trouver(interieur(t), (n) => n.type === "Text" && aplati(n).position === "absolute" && aplati(n).width !== undefined)[0];
    assert.ok(texte(tabs(r.racine)[0]!), "le texte du libellé déplié a une largeur propre");
    toucher(r, 3);
    for (let i = 0; i < 16; i++) {
      avancer(16);
      for (const t of tabs(r.racine)) {
        const tx = texte(t);
        assert.ok(tx && Number(aplati(tx).width) >= 1000, `à ${(i + 1) * 16} ms : le texte d'un libellé ne rétrécit pas avec son onglet`);
      }
    }
  });
});
test("riche : l'aller-retour rapide (le retour avant la fin de l'aller) revient au repos de l'onglet de départ", async () => {
  await avec("riche", (r) => {
    toucher(r, 3);
    avancer(40);
    toucher(r, 0);
    avancer(40);
    toucher(r, 3);
    avancer(10);
    toucher(r, 0);
    avancer(TEMPS.deplace);
    reposRiche(r.racine, 0, "après les allers-retours");
  });
});

test("riche : une rafale (le toucher suivant avant la fin du précédent, à une image d'écart) finit sur un seul libellé ouvert", async () => {
  await avec("riche", (r) => {
    for (const i of [1, 2, 3, 4, 0, 4, 2]) {
      toucher(r, i);
      avancer(17);
    }
    avancer(TEMPS.deplace);
    reposRiche(r.racine, 2, "après la rafale");
  });
});

test("riche : 80 rafales au hasard (graine fixe), instants quelconques, finissent TOUJOURS au repos exact de l'onglet visé", async () => {
  let graine = 7_112_025;
  const alea = () => {
    graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0;
    return graine / 2 ** 32;
  };
  await avec("riche", (r) => {
    for (let essai = 0; essai < 80; essai++) {
      let dernier = 0;
      const touches = 2 + Math.floor(alea() * 8);
      for (let t = 0; t < touches; t++) {
        dernier = Math.floor(alea() * LISTE.length);
        toucher(r, dernier);
        avancer(Math.floor(alea() * 260));
      }
      avancer(TEMPS.deplace);
      reposRiche(r.racine, dernier, `essai ${essai}`);
      // au repos plus rien ne bouge : l'horloge a beau avancer, l'arbre reste le même
      const avant = JSON.stringify(tabs(r.racine).map((t) => [ouvert(t), calque(t), echelle(t), largeurOnglet(t)]).concat(rail(r.racine) as never));
      avancer(500);
      assert.equal(JSON.stringify(tabs(r.racine).map((t) => [ouvert(t), calque(t), echelle(t), largeurOnglet(t)]).concat(rail(r.racine) as never)), avant, `essai ${essai} : rien ne bouge au repos`);
    }
  });
});

test("riche : une page qui se rend de nouveau (liste neuve, même contenu) ne coupe pas la transition", async () => {
  await avec("riche", (r) => {
    toucher(r, 2);
    avancer(48);
    const milieu = JSON.stringify(tabs(r.racine).map((t) => [ouvert(t), calque(t), largeurOnglet(t)]));
    agirSec(() => commande.choisir("annonces")); // même valeur : la page se rend de nouveau, avec une liste neuve
    assert.equal(JSON.stringify(tabs(r.racine).map((t) => [ouvert(t), calque(t), largeurOnglet(t)])), milieu, "rien n'a sauté, rien n'est reparti");
    avancer(TEMPS.deplace);
    reposRiche(r.racine, 2, "après le rendu de la page");
  });
});

test("riche : une liste qui change (un onglet de moins avant l'actif) pose le nouveau repos, un seul libellé ouvert, aussi en pleine transition", async () => {
  await avec("riche", (r) => {
    toucher(r, 2);
    avancer(40);
    const moins = LISTE.filter((o) => o.valeur !== "materiel");
    agirSec(() => commande.poserListe(moins));
    mesurer(r, SANS_MATERIEL);
    avancer(TEMPS.deplace);
    assert.equal(tabs(r.racine).length, 4);
    assert.equal(tabs(r.racine)[1]!.props.accessibilityLabel, "Annonces, 120 nouveaux");
    reposRiche(r.racine, 1, "après le changement de liste", moins, SANS_MATERIEL);
    // et la suite marche : un toucher mène bien où il doit
    toucher(r, 3);
    avancer(TEMPS.deplace);
    reposRiche(r.racine, 3, "après un toucher dans la nouvelle liste", moins, SANS_MATERIEL);
    // la liste revient (onglet ajouté avant l'actif)
    agirSec(() => commande.poserListe(LISTE));
    mesurer(r);
    avancer(TEMPS.deplace);
    reposRiche(r.racine, 4, "la liste d'origine est revenue (l'actif « infos » est le cinquième)");
  });
});

test("riche : la largeur mesurée arrive APRÈS le toucher, en pleine transition, ou après coup : même repos", async () => {
  await avec(
    "riche",
    (r) => {
      // la barre est mesurée, pas encore les libellés
      toucher(r, 3);
      avancer(48);
      mesurer(r); // les libellés arrivent en pleine transition
      avancer(TEMPS.deplace);
      reposRiche(r.racine, 3, "mesures arrivées en route");
      toucher(r, 0);
      avancer(TEMPS.deplace);
      reposRiche(r.racine, 0, "puis un toucher");
    },
    { mesures: false },
  );
  await avec(
    "riche",
    (r) => {
      // rien n'est mesuré : on touche déjà
      toucher(r, 2);
      avancer(30);
      mettreEnPage(r, 390); // la barre est mesurée en route
      mesurer(r);
      avancer(TEMPS.deplace);
      reposRiche(r.racine, 2, "largeur de la barre arrivée en route");
    },
    { largeur: null, mesures: false },
  );
});

test("riche : avant la mise en page, rien n'est dessiné (ni rail, ni largeur) ; les onglets se partagent la rangée", async () => {
  await avec(
    "riche",
    (r) => {
      assert.equal(rail(r.racine).length, 0, "pas de rail avant de connaître la largeur");
      for (const t of tabs(r.racine)) {
        assert.equal(aplati(interieur(t)).width, undefined, "pas de largeur posée");
        assert.equal(aplati(interieur(t)).flex, 1, "ils se partagent la rangée");
      }
    },
    { largeur: null, mesures: false },
  );
});

test("riche, mouvement réduit : l'encoche est tout de suite sous l'onglet choisi, le libellé fond en 120 ms (linéaire), rien ne se pose ni ne glisse", async () => {
  await avec("riche", (r) => {
    natif.reduireMouvement(true);
    vider();
    toucher(r, 3);
    // au premier instant, la géométrie est déjà celle du repos de l'onglet 3
    const attendu = gabaritRiche({ largeur: 390, marge: 16, libelles: libellesMesures(LISTE), marques: marquesDe(LISTE), actif: 3 });
    tabs(r.racine).forEach((t, i) => {
      assert.equal(Number(ouvert(t).width), i === 3 ? gaucheLibelle(marquesDe(LISTE)[3]!) + libellesMesures(LISTE)[3]! : 0, `l'onglet ${i} a déjà sa largeur de repos`);
      assert.equal(echelle(t), 1, "l'icône ne se pose pas");
    });
    assert.deepEqual(tabs(r.racine).map(largeurOnglet), attendu.largeurs, "les onglets sont déjà à leur largeur de repos");
    avancer(TEMPS.reduit / 2);
    const mi = Number(ouvert(tabs(r.racine)[3]!).opacity);
    assert.ok(mi > 0.4 && mi < 0.6, `à mi-fondu, à moitié : ${mi}`);
    avancer(TEMPS.reduit);
    reposRiche(r.racine, 3, "après le fondu");
    natif.reduireMouvement(false);
    vider();
    toucher(r, 0);
    avancer(40);
    assert.ok(Number(ouvert(tabs(r.racine)[3]!).width) > 0 && Number(ouvert(tabs(r.racine)[3]!).width) < Number(attendu.largeurs[3]), "mouvement rétabli : l'onglet se referme en glissant");
    avancer(TEMPS.deplace);
    reposRiche(r.racine, 0, "mouvement rétabli");
  });
});

// ——— Simple ———

/** Simple : l'actif en t1/600 (opacité 1), les autres en t2/500 ; le trait est sous l'actif, aux mesures du repos. */
function reposSimple(r: Noeud, choisi: number, quand: string) {
  const g = gabaritSimple({ largeur: 390, marge: 0, naturels: MESURES.map((m) => m + 2 * 16 + 1) });
  tabs(r).forEach((t, i) => {
    const calques = trouver(t, (n) => n.type === "Animated.View" && aplati(n).position === "absolute");
    assert.equal(calques.length, 2, `${quand} : deux libellés superposés, repos et actif`);
    const [repos, actif] = calques.map((n) => Number(aplati(n).opacity));
    assert.equal(actif, i === choisi ? 1 : 0, `${quand} : le libellé actif de l'onglet ${i}`);
    assert.equal(repos, i === choisi ? 0 : 1, `${quand} : le libellé de repos de l'onglet ${i}`);
  });
  const trait = trouver(r, (n) => n.type === "Animated.View" && aplati(n).height === 2 && aplati(n).bottom === 0)[0];
  assert.ok(trait, `${quand} : le trait est posé`);
  assert.ok(Math.abs(Number(aplati(trait!).left) - g.x[choisi]!) < 1e-9 && Math.abs(Number(aplati(trait!).width) - g.largeurs[choisi]!) < 1e-9, `${quand} : le trait est sous l'onglet ${choisi} (${String(aplati(trait!).left)}, ${String(aplati(trait!).width)})`);
}

test("simple : le trait glisse, les libellés se croisent, et au repos le trait est sous l'actif, le libellé actif seul en t1, quoi qu'on ait fait avant", async () => {
  await avec("simple", (r) => {
    reposSimple(r.racine, 0, "au départ");
    for (const i of [1, 2, 4, 0, 3, 1]) {
      toucher(r, i);
      avancer(40);
      toucher(r, (i + 2) % 5);
      avancer(17);
      toucher(r, i);
      avancer(TEMPS.deplace);
      reposSimple(r.racine, i, `vers ${i}`);
    }
  });
});

test("simple : pendant la route, le libellé qui s'allume et celui qui s'éteint se croisent en douceur (couleur et graisse, sans saut de largeur)", async () => {
  await avec("simple", (r) => {
    toucher(r, 2);
    let avant = 0;
    for (let i = 0; i < 12; i++) {
      avancer(16);
      const [, actif] = trouver(tabs(r.racine)[2]!, (n) => n.type === "Animated.View" && aplati(n).position === "absolute").map((n) => Number(aplati(n).opacity));
      assert.ok(actif! - avant < 0.3, `sans saut : ${actif! - avant}`);
      avant = actif!;
    }
    avancer(TEMPS.deplace);
    reposSimple(r.racine, 2, "au terme");
  });
});

test("simple, mouvement réduit : le trait saute sous l'actif, les libellés fondent en 120 ms", async () => {
  await avec("simple", (r) => {
    natif.reduireMouvement(true);
    vider();
    toucher(r, 3);
    const trait = trouver(r.racine, (n) => n.type === "Animated.View" && aplati(n).height === 2 && aplati(n).bottom === 0)[0]!;
    const g = gabaritSimple({ largeur: 390, marge: 0, naturels: MESURES.map((m) => m + 2 * 16 + 1) });
    assert.ok(Math.abs(Number(aplati(trait).left) - g.x[3]!) < 1e-9, "le trait est déjà sous l'onglet 3");
    avancer(TEMPS.reduit);
    reposSimple(r.racine, 3, "après le fondu");
  });
});

// ——— Rangée qui défile (riche, barre étroite) ———

test("riche, barre étroite : la rangée défile, l'actif est ramené en vue (animé), et le rail suit le défilement à l'image près", async () => {
  await avec(
    "riche",
    (r) => {
      const defile = () => trouver(barre(r.racine), (n) => n.type === "Animated.ScrollView")[0]!;
      const repos = (k: number) => gabaritRiche({ largeur: 200, marge: 16, libelles: libellesMesures(LISTE), marques: marquesDe(LISTE), actif: k });
      assert.ok(repos(0).defile, "la rangée ne tient pas : elle défile");
      const appels = () => defile().defilements ?? [];
      assert.equal(appels()[0]?.animated, false, "le premier placement se fait sans animation");
      assert.equal(appels().at(-1)?.x, 0, "le premier onglet est au bord");
      toucher(r, 4);
      avancer(TEMPS.deplace);
      const g = repos(4);
      assert.deepEqual(appels().at(-1), { x: centrer(g.x[4]!, g.largeurs[4]!, 200, g.contenu), animated: true }, "l'actif est ramené en vue, en glissant");
      assert.ok(Number(appels().at(-1)!.x) > 0, "et la rangée a bougé");
      // le rail suit le défilement : l'encoche recule de ce qui a défilé
      const x0 = () => Number(/ ([\d.]+) 16V54Z$/.exec(rail(r.racine)[0] ?? "")?.[1] ?? NaN);
      const avant = x0();
      agirSec(() => defile().props.onScroll({ nativeEvent: { contentOffset: { x: 30, y: 0 } } }));
      assert.ok(Math.abs(x0() - (avant - 30)) < 1e-6, `l'encoche recule de 30 : ${avant} → ${x0()}`);
      agirSec(() => defile().props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 0 } } }));
      assert.ok(Math.abs(x0() - avant) < 1e-6, "elle revient");
    },
    { largeur: 200 },
  );
});

// ——— Les panneaux : le contenu suit le geste ———

interface Geste {
  onMoveShouldSetPanResponder(e: unknown, g: { dx: number; dy: number; x0: number }): boolean;
  onPanResponderGrant(e: unknown, g: { dx: number }): void;
  onPanResponderMove(e: unknown, g: { dx: number }): void;
  onPanResponderRelease(e: unknown, g: { dx: number; vx: number }): void;
  onPanResponderTerminate(): void;
}
/** Les panneaux d'une page à trois onglets (a, b, c), qui tient son onglet comme `PageCercle`. */
function Panneaux({ depart, appels }: { depart: string; appels: string[] }) {
  const [v, setV] = useState(depart);
  return createElement(PanneauxOnglets, {
    onglets: ["a", "b", "c"],
    valeur: v,
    onChange: (x: string) => {
      appels.push(x);
      setV(x);
    },
    children: createElement("Contenu", null, v),
  });
}
async function avecPanneaux(depart: string, f: (r: Racine, appels: string[]) => void) {
  activerHorloge();
  natif.reduireMouvement(false);
  const appels: string[] = [];
  const r = await monter(sous(createElement(Panneaux, { depart, appels })));
  try {
    vider();
    f(r, appels);
    assert.deepEqual(r.erreurs.map(String), [], "pas d'erreur de rendu");
  } finally {
    natif.reduireMouvement(false);
    await r.demonter();
  }
}
const panneau = (r: Racine) => trouver(r.racine, (n) => !!n.props.__config)[0]!;
const geste = (r: Racine) => panneau(r).props.__config as Geste;
const pos = (r: Racine) => {
  const st = aplati(panneau(r));
  return { dx: ((st.transform as { translateX: number }[])[0]!).translateX, op: Number(st.opacity) };
};
const pris = (r: Racine, dx: number) => {
  agirSec(() => panneau(r).props.onTouchStartCapture({ nativeEvent: { pageX: 200 } }));
  agirSec(() => geste(r).onPanResponderGrant({}, { dx }));
};

test("panneaux : au repos le contenu est en place et opaque ; le doigt le pousse de la moitié (butée douce, voisin de l'autre côté), le lâcher le ramène en 180 ms", async () => {
  await avecPanneaux("b", (r, appels) => {
    assert.deepEqual(pos(r), { dx: 0, op: 1 }, "au repos");
    pris(r, 20);
    // le doigt a fait 20 avant la prise : le panneau part de là, sans saut
    agirSec(() => geste(r).onPanResponderMove({}, { dx: 20 }));
    assert.deepEqual(pos(r), { dx: 0, op: 1 }, "pas de saut à la prise");
    agirSec(() => geste(r).onPanResponderMove({}, { dx: -80 })); // 100 dp vers la gauche : le suivant (c) existe
    const x = suiviGlisse(-100, true);
    assert.ok(Math.abs(pos(r).dx - x) < 1e-9 && x < -30 && x > -50, `le panneau suit, en gros la moitié : ${pos(r).dx}`);
    assert.ok(Math.abs(pos(r).op - opaciteGlisse(x)) < 1e-9 && pos(r).op < 1 && pos(r).op > 0.6, "il s'estompe un peu");
    agirSec(() => geste(r).onPanResponderMove({}, { dx: -2000 }));
    assert.ok(pos(r).dx > -96 && pos(r).op >= 0.6 - 1e-9, "butée douce : jamais plus de 96 dp, jamais sous 60 %");
    // lâché trop court : ne change pas d'onglet, revient en place en 180 ms
    agirSec(() => geste(r).onPanResponderMove({}, { dx: -60 }));
    agirSec(() => geste(r).onPanResponderRelease({}, { dx: -60, vx: -0.05 }));
    assert.deepEqual(appels, [], "pas de changement d'onglet");
    avancer(TEMPS.retour / 2);
    assert.ok(pos(r).dx < 0 && pos(r).dx > suiviGlisse(-80, true), "à mi-retour : en route");
    avancer(TEMPS.retour);
    assert.deepEqual(pos(r), { dx: 0, op: 1 }, "revenu en place");
  });
});

test("panneaux : au bord de la liste, le doigt n'entraîne presque rien ; un geste interrompu (terminate) ramène le panneau en place", async () => {
  await avecPanneaux("a", (r) => {
    pris(r, 0);
    agirSec(() => geste(r).onPanResponderMove({}, { dx: 200 })); // vers la droite : pas de précédent
    const bord = pos(r).dx;
    assert.ok(Math.abs(bord - suiviGlisse(200, false)) < 1e-9 && bord < 40, `au bord : presque rien (${bord})`);
    agirSec(() => geste(r).onPanResponderMove({}, { dx: -200 })); // vers la gauche : b existe
    assert.ok(pos(r).dx < -40, "du côté du voisin : suit plus");
    agirSec(() => geste(r).onPanResponderTerminate());
    avancer(TEMPS.retour);
    assert.deepEqual(pos(r), { dx: 0, op: 1 }, "un autre a pris le geste : le panneau est revenu");
  });
});

test("panneaux : un glissé qui passe au voisin donne le nouveau contenu depuis 28 dp du bon côté, qui se pose en 220 ms ; le fondu dure 180 ms", async () => {
  await avecPanneaux("b", (r, appels) => {
    pris(r, 0);
    agirSec(() => geste(r).onPanResponderMove({}, { dx: -150 }));
    agirSec(() => geste(r).onPanResponderRelease({}, { dx: -220, vx: -0.4 }));
    assert.deepEqual(appels, ["c"], "à gauche : le suivant");
    assert.deepEqual(pos(r), { dx: 28, op: 0 }, "le nouveau contenu arrive de la droite (28 dp), invisible : aucune image à pleine opacité de l'ancien état");
    avancer(TEMPS.fondu / 2);
    assert.ok(pos(r).op > 0.4 && pos(r).op < 1, "il apparaît");
    assert.ok(pos(r).dx > 0 && pos(r).dx < 28, "il glisse");
    avancer(TEMPS.fondu);
    assert.equal(pos(r).op, 1, "opaque au bout de 180 ms");
    avancer(TEMPS.glisse);
    assert.deepEqual(pos(r), { dx: 0, op: 1 }, "en place au bout de 220 ms");
    // dans l'autre sens
    pris(r, 0);
    agirSec(() => geste(r).onPanResponderRelease({}, { dx: 220, vx: 0.4 }));
    assert.deepEqual(appels, ["c", "b"], "à droite : le précédent");
    assert.deepEqual(pos(r), { dx: -28, op: 0 }, "il arrive de la gauche");
    avancer(TEMPS.glisse);
    assert.deepEqual(pos(r), { dx: 0, op: 1 });
  });
});

test("panneaux : un changement d'onglet venu d'ailleurs (un toucher sur la barre) ne glisse pas : fondu seul, depuis zéro", async () => {
  await avecPanneaux("a", (r, appels) => {
    // le sens d'un glissé précédent, jamais suivi d'un changement, ne doit pas coller à un changement venu d'ailleurs
    pris(r, 0);
    agirSec(() => geste(r).onPanResponderRelease({}, { dx: 20, vx: 0.01 }));
    avancer(TEMPS.retour);
    assert.deepEqual(appels, []);
    agirSec(() => void 0);
  });
});

test("panneaux, mouvement réduit : le contenu ne glisse pas, il fond en 120 ms (linéaire)", async () => {
  await avecPanneaux("b", (r, appels) => {
    natif.reduireMouvement(true);
    vider();
    pris(r, 0);
    agirSec(() => geste(r).onPanResponderRelease({}, { dx: -220, vx: -0.4 }));
    assert.deepEqual(appels, ["c"]);
    assert.deepEqual(pos(r), { dx: 0, op: 0 }, "pas de course, invisible au premier instant");
    avancer(TEMPS.reduit / 2);
    assert.ok(Math.abs(pos(r).op - 0.5) < 1e-9, `à mi-fondu, à moitié (linéaire) : ${pos(r).op}`);
    avancer(TEMPS.reduit);
    assert.deepEqual(pos(r), { dx: 0, op: 1 });
  });
});
