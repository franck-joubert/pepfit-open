// Semainier défilant (ui/semainier.ts) : aimanté à la semaine, recadrage sur la semaine d'une date, retour seul après 5 s,
// séparateurs de mois (toujours) et de semaine (pendant le glissé).
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { indexJour, jourDeIndex } from "../src/ui/glisser-jour.ts";
import {
  casesRendues, cranSemaine, debutCadre, dureeBande, estLundi, fonduSemaine, lundiProche, minuterieRetour, recentrer, SEMAINIER, sautRecadrage,
  separateursMois, separateursSemaine, suivreBande,
} from "../src/ui/semainier.ts";

const L = 50; // largeur d'une case (px)
const lundi = indexJour("2026-10-26");

test("glisser la bande la déplace d'autant de cases que le doigt, sans s'arrêter aux semaines", () => {
  assert.equal(suivreBande(lundi, -L * 3, L), lundi + 3);
  assert.equal(suivreBande(lundi, L * 1.5, L), lundi - 1.5);
  assert.equal(suivreBande(lundi, -L * 10, L), lundi + 10);
});

test("au lâcher : aimantée à la semaine (jamais entre deux semaines), élan selon la vitesse, borné", () => {
  const avant = lundi - 7;
  const apres = lundi + 7;
  // Lâcher lent : la semaine la plus proche ; moins d'une demi-semaine, elle revient.
  assert.equal(cranSemaine(lundi + 2.4, 0, L, lundi), lundi);
  assert.equal(cranSemaine(lundi + 3.6, 0, L, lundi), apres);
  assert.equal(cranSemaine(lundi - 3, 0, L, lundi), lundi);
  assert.equal(cranSemaine(lundi - 4, 0, L, lundi), avant);
  // Toujours un lundi : jamais un cran au jour.
  for (const x of [-9.3, -5, -1, 0.4, 2, 3.4, 5.5, 8, 11.2]) {
    for (const vx of [-2, -0.6, -0.2, 0, 0.2, 0.6, 2]) {
      const c = cranSemaine(lundi + x, vx, L, lundi);
      assert.ok(estLundi(c), `x ${x}, vx ${vx} : ${jourDeIndex(c)}`);
    }
  }
  // Pichenette (lâcher vif, peu de chemin) : la semaine suivante dans le sens du doigt.
  assert.equal(cranSemaine(lundi + 0.5, -SEMAINIER.vif, L, lundi), apres);
  assert.equal(cranSemaine(lundi - 0.5, SEMAINIER.vif, L, lundi), avant);
  // Tirée loin puis relancée dans l'autre sens : elle revient sur la semaine qu'on quittait, pas une de plus.
  assert.equal(cranSemaine(lundi + 5, SEMAINIER.vif, L, lundi), lundi);
  // Lent, la pichenette ne compte pas.
  assert.equal(cranSemaine(lundi + 0.5, -0.2, L, lundi), lundi);
  // Lancer fort : plusieurs semaines, borné à `elanMaxSemaines` de la semaine de départ.
  assert.equal(cranSemaine(lundi + 1.2, -1.5, L, lundi), lundi + 14);
  assert.equal(cranSemaine(lundi, -100, L, lundi), lundi + 7 * SEMAINIER.elanMaxSemaines);
  assert.equal(cranSemaine(lundi, 100, L, lundi), lundi - 7 * SEMAINIER.elanMaxSemaines);
  // Le départ du geste peut être légèrement décalé (seuil de prise) : la semaine de départ reste la même.
  assert.equal(cranSemaine(lundi, -100, L, lundi + 0.3), lundi + 7 * SEMAINIER.elanMaxSemaines);
  // Lundi le plus proche (rang 4 : lundi 5 janvier 1970).
  assert.equal(lundiProche(lundi + 3), lundi);
  assert.equal(lundiProche(lundi + 4), apres);
  assert.equal(lundiProche(lundi - 3.4), lundi);
  assert.equal(jourDeIndex(lundiProche(indexJour("2026-11-05"))), "2026-11-02", "jeudi : son lundi");
  assert.equal(jourDeIndex(lundiProche(indexJour("2026-11-06"))), "2026-11-09", "vendredi : le lundi suivant");
});

test("toucher une date : la bande se recadre sur le lundi de sa semaine", () => {
  assert.equal(debutCadre("2026-10-26"), indexJour("2026-10-26"));
  assert.ok(estLundi(debutCadre("2026-11-02")));
  assert.equal(estLundi(indexJour("2026-11-01")), false);
  assert.equal(estLundi(indexJour("2026-10-29")), false);
  // Durée proportionnelle, bornée (une semaine : 320 ms).
  assert.equal(dureeBande(lundi + 7, lundi), 320);
  assert.equal(dureeBande(lundi, lundi), 160);
  assert.equal(dureeBande(lundi, lundi + 70), 480);
});

test("cases rendues autour du centre ; saut plutôt qu'animation au-delà ; recentrage après un long défilement", () => {
  const c = casesRendues(lundi);
  assert.equal(c[0], lundi - SEMAINIER.rendues);
  assert.equal(c.length, 2 * SEMAINIER.rendues + 7);
  assert.equal(sautRecadrage(lundi, lundi + 14), false);
  assert.equal(sautRecadrage(lundi, lundi + 28), true);
  assert.equal(recentrer(lundi, lundi + 7), false);
  assert.equal(recentrer(lundi, lundi + 15), true);
});

test("défilée sans date touchée, la bande revient seule après 5 s sans geste ; un geste ou un toucher l'annule", () => {
  assert.equal(SEMAINIER.retourMs, 5_000);
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let retours = 0;
    const m = minuterieRetour(() => retours++, { setTimeout, clearTimeout } as never);
    m.lacher();
    mock.timers.tick(4_999);
    assert.equal(retours, 0);
    mock.timers.tick(1);
    assert.equal(retours, 1);
    assert.equal(m.arme(), false);
    // Nouveau geste avant les 5 s : le compte repart du dernier lâcher.
    m.lacher();
    mock.timers.tick(3_000);
    m.annuler(); // doigt reposé
    m.lacher();
    mock.timers.tick(3_000);
    assert.equal(retours, 1);
    mock.timers.tick(2_000);
    assert.equal(retours, 2);
    // Date touchée : plus de retour.
    m.lacher();
    m.annuler();
    mock.timers.tick(20_000);
    assert.equal(retours, 2);
  } finally {
    mock.timers.reset();
  }
});

test("étiquette du mois : collée à gauche, arrive avec le 1er jour du mois suivant et pousse l'ancienne", async () => {
  const { jourDeIndex } = await import("../src/ui/glisser-jour.ts");
  const { moisRendus, xEtiquette, ECART_MOIS } = await import("../src/ui/semainier.ts");
  const oct = indexJour("2026-10-01");
  const nov = indexJour("2026-11-01");
  const mois = moisRendus(casesRendues(lundi), jourDeIndex);
  assert.deepEqual(mois.map((m) => m.cle), ["2026-09", "2026-10", "2026-11"]);
  assert.equal(mois[1]!.rang, oct);
  const bord = 16;
  const larg = 90;
  // Bande sur la semaine du 26 oct. : « octobre » collée au bord ; « novembre » au-dessus du 1er nov. (6 cases plus loin).
  assert.equal(xEtiquette(oct, nov, lundi, L, larg, bord), bord);
  assert.equal(xEtiquette(nov, null, lundi, L, larg, bord), bord + 6 * L);
  // Le 1er nov. approche : « octobre » est poussée hors du cadre, jamais par-dessus « novembre ».
  const debut = nov - 1.5;
  const xNov = xEtiquette(nov, null, debut, L, larg, bord);
  const xOct = xEtiquette(oct, nov, debut, L, larg, bord);
  assert.equal(xNov, bord + 1.5 * L);
  assert.equal(xOct, xNov - larg - ECART_MOIS);
  assert.ok(xOct < bord);
  // Le 1er nov. passé : « novembre » se colle à son tour.
  assert.equal(xEtiquette(nov, null, nov + 3, L, larg, bord), bord);
});

test("semainier collé : se resserre au rythme du défilement, d'un coup en mouvement réduit", async () => {
  const { compactDe, hauteurBande, HAUT_BANDE, HAUT_COMPACTE } = await import("../src/ui/semainier.ts");
  assert.equal(compactDe(0, false), 0);
  assert.equal(compactDe(14, false), 0.5);
  assert.equal(compactDe(500, false), 1);
  assert.equal(compactDe(-40, false), 0, "rebond en haut : pleine");
  assert.equal(hauteurBande(0), HAUT_BANDE);
  assert.equal(hauteurBande(1), HAUT_COMPACTE);
  assert.equal(hauteurBande(0.5), (HAUT_BANDE + HAUT_COMPACTE) / 2);
  assert.equal(compactDe(10, true), 0);
  assert.equal(compactDe(20, true), 1);
});

test("toucher une date : le jour sous le doigt d'après la position de la bande, même défilée", async () => {
  const { rangTouche } = await import("../src/ui/semainier.ts");
  const bord = 8;
  // Bande posée sur la semaine du 26 oct. : le 3e cas est le mercredi 28.
  assert.equal(rangTouche(lundi, bord + 2.5 * L, L, bord), lundi + 2);
  // Bande défilée jusqu'au dimanche 1er nov. (6 jours plus loin) : au même endroit, c'est le mardi 3 nov. (bug du 29/10 : le
  // toucher choisissait le mercredi 28, la case qui était là avant le défilement).
  assert.equal(rangTouche(lundi + 6, bord + 2.5 * L, L, bord), indexJour("2026-11-03"));
  // Bande arrêtée entre deux jours pendant un élan : le jour sous le doigt.
  assert.equal(rangTouche(lundi + 0.5, bord + 0.2 * L, L, bord), lundi);
  assert.equal(rangTouche(lundi + 0.5, bord + 0.6 * L, L, bord), lundi + 1);
});

test("séparateur de mois : à gauche du 1er de chaque mois (entre le dernier jour du mois et lui), toujours là", () => {
  const rangs = casesRendues(lundi);
  const mois = separateursMois(rangs, jourDeIndex);
  assert.deepEqual(mois.map(jourDeIndex), ["2026-10-01", "2026-11-01"]);
  // Le séparateur se pose à gauche du rang : entre le 31 oct. et le 1er nov.
  const nov = indexJour("2026-11-01");
  assert.equal(jourDeIndex(nov - 1), "2026-10-31");
  assert.ok(mois.includes(nov));
  // Fin de février, années bissextile ou non ; changement d'année.
  assert.deepEqual(separateursMois([indexJour("2028-02-28"), indexJour("2028-02-29"), indexJour("2028-03-01")], jourDeIndex), [indexJour("2028-03-01")]);
  assert.deepEqual(separateursMois([indexJour("2027-02-28"), indexJour("2027-03-01")], jourDeIndex), [indexJour("2027-03-01")]);
  assert.deepEqual(separateursMois([indexJour("2026-12-31"), indexJour("2027-01-01")], jourDeIndex).map(jourDeIndex), ["2027-01-01"]);
  // Bande défilée plus loin : les séparateurs suivent les cases rendues.
  assert.ok(separateursMois(casesRendues(lundi + 70), jourDeIndex).map(jourDeIndex).includes("2027-01-01"));
});

test("séparateur de semaine : à gauche de chaque lundi, sauf un 1er du mois ; seulement pendant le glissé, fondu court", () => {
  const rangs = casesRendues(lundi);
  const sem = separateursSemaine(rangs, jourDeIndex);
  assert.ok(sem.every(estLundi));
  assert.equal(sem.length, rangs.filter(estLundi).length);
  assert.ok(sem.includes(indexJour("2026-11-02")));
  // Lundi 1er février 2027 : le séparateur de mois est déjà là, pas de second par-dessus.
  const fev = indexJour("2027-02-01");
  assert.ok(estLundi(fev));
  assert.deepEqual(separateursSemaine([fev - 1, fev, fev + 1], jourDeIndex), []);
  assert.deepEqual(separateursMois([fev - 1, fev, fev + 1], jourDeIndex), [fev]);
  // 4 px de haut.
  assert.equal(SEMAINIER.semaineHauteur, 4);
  // Doigt posé : apparaît ; lâché : disparaît ; fondu court, d'un coup en mouvement réduit.
  assert.deepEqual(fonduSemaine(true, false), { vers: 1, ms: SEMAINIER.semaineFonduMs });
  assert.deepEqual(fonduSemaine(false, false), { vers: 0, ms: SEMAINIER.semaineFonduMs });
  assert.ok(SEMAINIER.semaineFonduMs > 0 && SEMAINIER.semaineFonduMs <= 200);
  assert.deepEqual(fonduSemaine(true, true), { vers: 1, ms: 0 });
  assert.deepEqual(fonduSemaine(false, true), { vers: 0, ms: 0 });
});

test("séparateurs alignés sur le milieu des chiffres, bande pleine ou resserrée", async () => {
  const { milieuChiffre, HAUT_BANDE, HAUT_COMPACTE, HAUT_LETTRE, PASTILLE } = await import("../src/ui/semainier.ts");
  // Case : lettre, écart de 4, chiffre (h), écart de 4, pastille, le tout centré dans la bande.
  const milieu = (hauteur: number, lettre: number, h: number) => {
    const haut = (hauteur - (lettre + 4 + h + 4 + PASTILLE)) / 2;
    return haut + lettre + 4 + h / 2 - hauteur / 2;
  };
  for (const h of [19, 21, 24]) {
    assert.equal(milieuChiffre(0), milieu(HAUT_BANDE, HAUT_LETTRE, h));
    assert.equal(milieuChiffre(1), milieu(HAUT_COMPACTE, 0, h));
  }
  assert.equal(milieuChiffre(0), 4.5, "bande pleine : 4,5 px sous le milieu");
  assert.equal(milieuChiffre(1), -3, "resserrée : 3 px au-dessus");
});

test("pages sans futur : le glissé bute en douceur sur la semaine en cours ; Sport et Nutrition gardent le futur", async () => {
  const { buteeDouce } = await import("../src/ui/semainier.ts");
  const max = lundi; // semaine d'aujourd'hui (jeudi 29 oct. 2026)
  // Vers le passé ou dans la semaine : la bande suit le doigt.
  assert.equal(buteeDouce(lundi - 10.3, max), lundi - 10.3);
  assert.equal(buteeDouce(max, max), max);
  // Au-delà : retenue, jamais plus d'une demi-case, et toujours dans le sens du doigt (pas de saut ni de recul).
  let avant = max;
  for (const e of [0.1, 0.5, 1, 2, 4, 7, 20]) {
    const v = buteeDouce(max + e, max);
    assert.ok(v > avant && v < max + SEMAINIER.butee, `dépassement ${e} → ${v - max}`);
    assert.ok(v - max < e, "résiste dès le départ");
    avant = v;
  }
  assert.ok(buteeDouce(max + 1, max) - max < 0.35, "un jour tiré : moins d'un tiers de case");
  // Sans butée (Sport, Nutrition) : rien ne change.
  assert.equal(buteeDouce(max + 9, null), max + 9);
  // Au lâcher : jamais après la semaine en cours, même lancée fort vers le futur ; le passé reste libre.
  assert.equal(cranSemaine(buteeDouce(max + 3, max), -2, L, max, max), max);
  assert.equal(cranSemaine(max + 0.4, -SEMAINIER.vif, L, max, max), max);
  assert.equal(cranSemaine(max - 0.5, SEMAINIER.vif, L, max, max), max - 7);
  assert.equal(cranSemaine(max - 14, -0.6, L, max - 14, max), max - 7, "depuis le passé, on remonte jusqu'à la semaine en cours");
  assert.equal(cranSemaine(max - 7, -100, L, max - 7, max), max);
  // Sans butée : la pichenette va vers la semaine à venir.
  assert.equal(cranSemaine(max + 0.4, -SEMAINIER.vif, L, max), max + 7);
});
