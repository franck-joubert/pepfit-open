// Les onglets du design système (ui/Onglets.tsx), leurs calculs sans écran : couleur active, gabarits simple et riche, rail du classeur ouvert,
// montée du voile, clavier, glissement entre panneaux. Planche onglets, direction A, validée le 06/11.
import assert from "node:assert/strict";
import { test } from "node:test";
import { jour, nuit } from "../src/theme/jetons.ts";
import { onglets as T } from "../src/theme/onglets.ts";
import { meler, rvba } from "../src/theme/teintes.ts";
import { COULEUR_PARTIE, FOND_PARTIE } from "../src/ui/partie.ts";
import {
  centrer,
  cheminsRail,
  couleurActive,
  couleursRail,
  gabaritRiche,
  gabaritSimple,
  gaucheLibelle,
  marqueDe,
  monteeVoile,
  opaciteCouleur,
  ongletApresGlisse,
  ongletAuClavier,
  prendGlisseOnglets,
  texteCompte,
  voisinActif,
} from "../src/ui/onglets-calc.ts";

const rvb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const luminance = (c: string) => {
  const [r, g, b] = rvb(c).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contraste = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};
const somme = (l: readonly number[]) => l.reduce((s, v) => s + v, 0);

// ——— Couleurs du rail ———

// Fold déplié (06/11) : « ça met la page et l'onglet en noir au lieu de foncer le haut ». Le jeton `segmentPiste` du thème de base est un gris
// opaque ; le rail calcule donc lui-même un voile translucide depuis la couleur de la partie. Alex (06/11) : le voile qui monte est FONCÉ,
// la nuit comme le jour, jamais clair.
test("le voile du rail est uni, sombre, saturé et très translucide (16 %) : jamais un gris, jamais clair ni opaque, pour chaque partie, nuit et jour", () => {
  const sat = (c: string) => {
    const [r, g, b] = rvba(c);
    const max = Math.max(r, g, b);
    return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
  };
  for (const mode of ["nuit", "jour"] as const) {
    const jetons = mode === "nuit" ? nuit : jour;
    assert.equal(opaciteCouleur(jetons.segmentPiste), 1, "le jeton de base est opaque : c'est lui qui noircissait le haut de la page");
    for (const jeton of Object.values(COULEUR_PARTIE)) {
      const { voile, filet } = couleursRail(jetons[jeton], mode);
      assert.ok(voile.startsWith("rgba(") && filet.startsWith("rgba("), "une couleur translucide, pas un gris");
      assert.equal(opaciteCouleur(voile), T.voile[mode].opacite, `${mode} ${jeton} : le voile très léger du mode (${voile})`);
      assert.ok(opaciteCouleur(filet) > 0 && opaciteCouleur(filet) <= 0.25, `${mode} ${jeton} : filet ${filet}`);
      const [r, g, b] = rvba(voile);
      const clair = luminance(`#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`);
      assert.ok(clair < 0.05, `${mode} ${jeton} : le voile est sombre (luminance ${clair.toFixed(3)})`);
      // Saturé : la saturation (HSV) de la partie, jamais un gris ni un noir neutre (le mélange de noir d'avant donnait 0,36 la nuit).
      assert.ok(sat(voile) >= Math.min(0.5, sat(jetons[jeton]) - 0.02), `${mode} ${jeton} : le voile garde la saturation de la partie (${sat(voile).toFixed(2)} contre ${sat(jetons[jeton]).toFixed(2)})`);
    }
  }
});

test("voile du rail : le jour est un prune-violet plus saturé (×1,3), la nuit un prune-violet plus sombre, chacun à l'opacité de son mode", () => {
  assert.equal(couleursRail(jour.partieFil, "jour").voile, "rgba(39,9,51,0.16)");
  const [r, g, b] = rvba(couleursRail(nuit.partieFil, "nuit").voile);
  assert.ok(b > r && r > g, `un violet (${r},${g},${b}), pas un gris`);
  assert.ok((b - g) / b > 0.7, "saturé");
});

// ——— Couleur de l'actif ———

test("la nuit l'actif prend la couleur de la partie telle quelle ; le jour elle est assombrie de 25 %", () => {
  for (const [partie, jeton] of Object.entries(COULEUR_PARTIE)) {
    const nuitC = nuit[jeton];
    const jourC = jour[jeton];
    assert.equal(couleurActive(nuitC, "nuit"), nuitC, `${partie} nuit`);
    assert.equal(couleurActive(jourC, "jour"), meler(jourC, "#000000", 0.25), `${partie} jour`);
    assert.ok(luminance(couleurActive(jourC, "jour")) < luminance(jourC), `${partie} : le jour est plus sombre`);
  }
});

test("D2 : le trait et l'icône actifs du jour tiennent 3:1 sur le blanc et sur le fond teinté de chaque partie", () => {
  for (const [partie, jeton] of Object.entries(COULEUR_PARTIE)) {
    const actif = couleurActive(jour[jeton], "jour");
    for (const fond of ["#ffffff", jour[FOND_PARTIE[partie as keyof typeof FOND_PARTIE]]])
      assert.ok(contraste(actif, fond) >= 3, `${partie} sur ${fond} : ${contraste(actif, fond).toFixed(2)}`);
  }
});

// ——— Pastille, point, espace du libellé ———

test("pastille de 1 à 99, « 99+ » au-delà, point sans chiffre, rien à 0", () => {
  assert.equal(marqueDe(undefined, false), "aucune");
  assert.equal(marqueDe(0, false), "aucune");
  assert.equal(marqueDe(1, false), "pastille");
  assert.equal(marqueDe(99, false), "pastille");
  assert.equal(marqueDe(100, false), "pastilleLongue");
  assert.equal(marqueDe(0, true), "point");
  assert.equal(marqueDe(3, true), "pastille", "un nombre l'emporte sur le point");
  assert.equal(texteCompte(7), "7");
  assert.equal(texteCompte(99), "99");
  assert.equal(texteCompte(100), "99+");
});

test("l'espace à gauche du libellé déplié : 8, ou 16 / 28 / 14 pour la pastille, « 99+ » et le point", () => {
  assert.deepEqual((["aucune", "pastille", "pastilleLongue", "point"] as const).map(gaucheLibelle), [8, 16, 28, 14]);
});

// ——— Riche ———

const SANS = ["aucune", "aucune", "aucune", "aucune", "aucune"] as const;

test("riche à 390 dp, cinq onglets : rien ne défile, les onglets se touchent à 2 dp, chacun fait 48 au moins", () => {
  const g = gabaritRiche({ largeur: 390, marge: 16, libelles: [60, 70, 55, 50, 40], marques: SANS, actif: 0 });
  assert.equal(g.defile, false);
  assert.equal(g.contenu, 390);
  assert.ok(g.largeurs.every((w) => w >= T.largeurMin), "48 au moins");
  assert.equal(g.x[0], 16, "le premier onglet sur la marge du contenu");
  g.x.slice(1).forEach((x, i) => assert.ok(Math.abs(x - (g.x[i]! + g.largeurs[i]! + T.ecart)) < 1e-9, "2 dp d'écart"));
  const fin = g.x[4]! + g.largeurs[4]!;
  assert.ok(Math.abs(fin - (390 - 16)) < 1e-9, `le dernier finit sur la marge : ${fin}`);
});

test("riche : l'actif est le plus large (son libellé), les autres se partagent le reste à parts égales", () => {
  const g = gabaritRiche({ largeur: 390, marge: 16, libelles: [60, 70, 55, 50], marques: ["aucune", "aucune", "aucune", "aucune"], actif: 1 });
  const autres = g.largeurs.filter((_, i) => i !== 1);
  assert.ok(g.largeurs[1]! > Math.max(...autres));
  assert.ok(autres.every((w) => Math.abs(w - autres[0]!) < 1e-9), "parts égales");
  // l'actif = icône 48 + espace 8 + libellé 70 + sa part
  const part = autres[0]! - 48;
  assert.ok(Math.abs(g.largeurs[1]! - (48 + 8 + 70 + part)) < 1e-9);
});

test("riche : la pastille et le point donnent plus de place au libellé de l'actif, les autres onglets la lui cèdent", () => {
  const base = { largeur: 390, marge: 16, libelles: [60, 60, 60], actif: 0 };
  const g = (m: "aucune" | "pastille" | "pastilleLongue" | "point") => gabaritRiche({ ...base, marques: [m, "aucune", "aucune"] });
  const rien = g("aucune");
  for (const [m, plus] of [["pastille", 8], ["point", 6], ["pastilleLongue", 20]] as const) {
    const avec = g(m);
    assert.ok(Math.abs(avec.largeurs[0]! - (rien.largeurs[0]! + plus * (1 - 1 / 3))) < 1e-9, `${m} : l'actif gagne ${plus} moins sa part`);
    assert.ok(avec.largeurs[1]! < rien.largeurs[1]!, `${m} : les autres cèdent`);
    assert.ok(Math.abs(somme(avec.largeurs) - somme(rien.largeurs)) < 1e-9, `${m} : la barre reste pleine`);
  }
});

test("riche : jusqu'à cinq onglets rien ne défile à 390 dp ; des libellés trop longs font défiler la rangée", () => {
  for (const n of [2, 3, 4, 5]) {
    const g = gabaritRiche({ largeur: 390, marge: 16, libelles: Array(n).fill(80), marques: Array(n).fill("aucune"), actif: 0 });
    assert.equal(g.defile, false, `${n} onglets`);
  }
  const long = gabaritRiche({ largeur: 390, marge: 16, libelles: [300, 70, 55, 50, 40], marques: SANS, actif: 0 });
  assert.equal(long.defile, true);
  assert.ok(long.contenu > 390);
  assert.ok(long.largeurs.every((w) => w >= T.largeurMin), "toujours 48 au moins");
  assert.equal(long.x[1], long.x[0]! + long.largeurs[0]! + T.ecart);
});

test("riche sur le Fold déplié : les onglets restent alignés sur la marge du contenu (41 dp)", () => {
  const g = gabaritRiche({ largeur: 640, marge: 41, libelles: [60, 70, 55], marques: ["aucune", "aucune", "aucune"], actif: 0 });
  assert.equal(g.x[0], 41);
  assert.ok(Math.abs(g.x[2]! + g.largeurs[2]! - (640 - 41)) < 1e-9);
});

// ——— Rail du classeur ouvert ———

test("rail : voile bord à bord, encoche sous l'actif (marge haute 6, rayon 10), filet de 1 dp qui remonte autour", () => {
  const { voile, filet } = cheminsRail({ largeur: 390, hauteur: 54, montee: 0, x0: 100, x1: 200 });
  assert.ok(voile.startsWith("M0 54V0H390V54"), voile);
  assert.ok(voile.includes("H200V16A10 10 0 0 0 190 6H110A10 10 0 0 0 100 16V54Z"), voile);
  assert.ok(filet.startsWith("M0 53.5H100.5V16"), filet);
  assert.ok(filet.includes("H189.5") || filet.includes("H190"), filet);
  assert.ok(filet.endsWith("V53.5H390"), filet);
});

test("rail : l'encoche suit l'actif ; sans mesure, pas d'encoche ; elle ne sort pas de la barre", () => {
  const sans = cheminsRail({ largeur: 390, hauteur: 54, montee: 0, x0: null, x1: null });
  assert.ok(!sans.voile.includes("A"), "pas d'arc sans actif mesuré");
  const gauche = cheminsRail({ largeur: 390, hauteur: 54, montee: 0, x0: -30, x1: 80 });
  assert.ok(gauche.voile.includes(" 0 16V54Z"), "bord gauche borné à 0");
  const droite = cheminsRail({ largeur: 390, hauteur: 54, montee: 0, x0: 300, x1: 450 });
  assert.ok(droite.voile.includes("H390V16"), "bord droit borné à la largeur");
});

test("rail : D6, le voile uni monte de `montee` au-dessus de la barre ; le filet, lui, reste au niveau de la barre", () => {
  const { voile, filet } = cheminsRail({ largeur: 390, hauteur: 54, montee: 72, x0: 100, x1: 200 });
  assert.ok(voile.startsWith("M0 54V-72H390V54"), voile);
  assert.ok(!filet.includes("-72"), "le filet ne monte pas avec le voile");
});

test("rail : `debord` étend le voile et le filet de chaque côté (colonne plus étroite que l'écran)", () => {
  const { voile, filet } = cheminsRail({ largeur: 390, hauteur: 54, montee: 0, x0: 100, x1: 200, debord: 25 });
  assert.ok(voile.startsWith("M-25 54V0H415V54"), voile);
  assert.ok(filet.startsWith("M-25 53.5") && filet.endsWith("H415"), filet);
});

test("montée du voile : du haut de la barre au bord bas de l'en-tête, jamais négative, nulle sans ancre", () => {
  assert.equal(monteeVoile(300, 228), 72);
  assert.equal(monteeVoile(300, null), 0);
  assert.equal(monteeVoile(300, undefined), 0);
  assert.equal(monteeVoile(300, Number.NaN), 0);
  assert.equal(monteeVoile(200, 228), 0, "l'ancre sous la barre : rien à monter");
});

// ——— Simple ———

test("simple : parts égales tant que les libellés tiennent, rien ne défile", () => {
  const g = gabaritSimple({ largeur: 390, marge: 0, naturels: [90, 100] });
  assert.deepEqual(g.largeurs, [195, 195]);
  assert.deepEqual(g.x, [0, 195]);
  assert.equal(g.defile, false);
  assert.equal(g.contenu, 390);
});

test("simple : le premier libellé tombe sur la marge du contenu (marge de la rangée = marge − 16)", () => {
  const g = gabaritSimple({ largeur: 390, marge: 0, naturels: [90, 100, 80] });
  assert.equal(g.x[0], 0, "l'onglet commence à la marge moins ses 16 dp : le libellé est à 16");
  const m = gabaritSimple({ largeur: 640, marge: 25, naturels: [90, 100] });
  assert.equal(m.x[0], 25);
  assert.equal(m.largeurs[0]! + m.largeurs[1]!, 640 - 50);
});

test("simple : quand un libellé ne tient pas en part égale, chacun prend sa largeur et le reste se partage", () => {
  // 4 onglets à 390 dp : « Mes produits » (118) ne tient pas dans 97,5 ; 84 + 82 + 97 + 118 = 381 < 390
  const g = gabaritSimple({ largeur: 390, marge: 0, naturels: [84, 82, 97, 118] });
  assert.equal(g.defile, false);
  assert.ok(Math.abs(somme(g.largeurs) - 390) < 1e-9, "la rangée est remplie");
  assert.ok(g.largeurs[3]! > g.largeurs[0]!, "le plus long garde la plus grande part");
});

test("simple : au-delà de la place, la rangée défile et chaque onglet garde sa largeur", () => {
  const naturels = [140, 150, 130, 160];
  const g = gabaritSimple({ largeur: 390, marge: 0, naturels });
  assert.equal(g.defile, true);
  assert.deepEqual(g.largeurs, naturels);
  assert.equal(g.contenu, somme(naturels));
});

test("simple : sans mesure (largeur 0), pas de défilement", () => {
  const g = gabaritSimple({ largeur: 0, marge: 0, naturels: [0, 0] });
  assert.equal(g.defile, false);
});

test("l'actif d'une rangée qui défile est ramené au centre, sans dépasser les bords", () => {
  assert.equal(centrer(0, 100, 390, 800), 0, "le premier reste sur son bord");
  assert.equal(centrer(700, 100, 390, 800), 410, "le dernier reste sur son bord");
  assert.equal(centrer(300, 100, 390, 800), 155, "un onglet du milieu arrive au centre");
});

// ——— Clavier ———

test("voisin : saute les désactivés et boucle", () => {
  assert.equal(voisinActif([false, true, false], 0, 1), 2);
  assert.equal(voisinActif([false, true, false], 2, 1), 0);
  assert.equal(voisinActif([false, true, false], 0, -1), 2);
  assert.equal(voisinActif([true, true, false], 2, 1), 2, "aucun autre : il reste là");
});

test("clavier : flèches, Début et Fin ; les flèches s'inversent de droite à gauche ; une autre touche ne fait rien", () => {
  const off = [false, false, true, false];
  assert.equal(ongletAuClavier("ArrowRight", off, 0), 1);
  assert.equal(ongletAuClavier("ArrowRight", off, 1), 3, "saute le désactivé");
  assert.equal(ongletAuClavier("ArrowLeft", off, 0), 3, "boucle");
  assert.equal(ongletAuClavier("ArrowRight", off, 0, true), 3, "inversé en lecture de droite à gauche");
  assert.equal(ongletAuClavier("Home", [true, false, false], 2), 1, "le premier actif");
  assert.equal(ongletAuClavier("End", [false, false, true], 0), 1, "le dernier actif");
  assert.equal(ongletAuClavier("Tab", off, 0), null);
  assert.equal(ongletAuClavier("a", off, 0), null);
  assert.equal(ongletAuClavier("Home", [true, true], 0), null);
});

// ——— Glissement latéral ———

test("D4 : le glissé prend la main s'il est nettement horizontal, hors du bord gauche, et si le panneau ne défile pas", () => {
  assert.equal(prendGlisseOnglets(-60, 5, 200), true);
  assert.equal(prendGlisseOnglets(60, 10, 200), true);
  assert.equal(prendGlisseOnglets(-60, 5, 20), false, "parti du bord gauche (40 dp) : le volet du profil");
  assert.equal(prendGlisseOnglets(-60, 5, 40), false, "le bord de 40 dp est au volet, comme dans ui/volet.ts");
  assert.equal(prendGlisseOnglets(-60, 5, 41), true, "juste au-delà du bord");
  assert.equal(prendGlisseOnglets(-60, 5, 200, true), false, "le panneau défile à l'horizontale");
  assert.equal(prendGlisseOnglets(-10, 2, 200), false, "pas assez loin");
  assert.equal(prendGlisseOnglets(-40, 40, 200), false, "diagonal : le défilement vertical garde la main");
});

test("glissé lâché : doigt vers la gauche, panneau suivant ; vers la droite, précédent ; rien aux bords ; saute le désactivé", () => {
  const off = [false, false, true, false];
  assert.equal(ongletApresGlisse(off, 0, -200, 0, 390), 1);
  assert.equal(ongletApresGlisse(off, 1, -200, 0, 390), 3, "saute le désactivé");
  assert.equal(ongletApresGlisse(off, 1, 200, 0, 390), 0);
  assert.equal(ongletApresGlisse(off, 0, 200, 0, 390), null, "bord gauche : rien avant");
  assert.equal(ongletApresGlisse(off, 3, -200, 0, 390), null, "bord droit : rien après");
  assert.equal(ongletApresGlisse(off, 0, -10, 0, 390), null, "trop court et pas vif : retour en place");
  assert.equal(ongletApresGlisse(off, 0, -60, -1.2, 390), 1, "court mais vif");
});
