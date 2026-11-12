// Semainier par semaine (ui/semainier-semaines.ts, ui/semaines-libelles.ts ; planche age-semainier) : une case par semaine,
// voisines qui dépassent et se touchent, cran à la semaine, butées aux deux bouts, séparateurs, libellés.
import assert from "node:assert/strict";
import { test } from "node:test";
import { definirActif } from "../src/i18n/index.ts";
import { SEMAINIER } from "../src/ui/semainier.ts";
import {
  buteeCases, caseTouchee, cranCase, dureeCases, geometrieSemaines, opaciteLibelle, SEMAINES_BANDE, separateursEntreSemaines,
  separateursMoisSemaines, suivreCases, voisines,
} from "../src/ui/semainier-semaines.ts";
import { libelleSemaine, moisDuJeudi, titreSemaine } from "../src/ui/semaines-libelles.ts";

const actif = (langue: "fr" | "en", fuseau = "Europe/Paris") => definirActif({ langue, fuseau, poids: "kg", distance: "km" });
/** Minuit local à Paris d'un lundi (AAAA, mois 1-12, jour). */
const lundi = (a: number, m: number, j: number) => {
  const midi = Date.UTC(a, m - 1, j, 12);
  const decalage = new Date(new Date(midi).toLocaleString("en-US", { timeZone: "Europe/Paris" })).getTime() - new Date(new Date(midi).toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return Date.UTC(a, m - 1, j) - decalage;
};
const N = 30;

test("géométrie : case du centre dans la colonne, voisines qui dépassent de 32, zone de toucher de 48 au moins", () => {
  const tel = geometrieSemaines(412);
  assert.equal(tel.case, 332);
  assert.equal(tel.pas, 340);
  assert.equal(tel.x0, 40);
  assert.equal(tel.x0 - SEMAINES_BANDE.ecart, 32, "part visible d'une voisine");
  assert.equal(tel.zone, 48);
  assert.equal(tel.largeur, 412);
  // Fold ouvert : colonne de 640 au milieu de 690 ; la bande va aux bords, la case du centre reste dans la colonne
  const fold = geometrieSemaines(640, 25);
  assert.equal(fold.case, 560);
  assert.equal(fold.x0, 65);
  assert.equal(fold.x0 + fold.case, 625);
  assert.equal(fold.zone, 73);
  assert.equal(fold.largeur, 690);
  assert.ok(SEMAINES_BANDE.haut >= 44, "cible de 44 en hauteur");
});

test("glisser : le doigt déplace la bande d'autant de cases ; au lâcher, aimantée à une semaine, élan borné", () => {
  const p = 340;
  assert.equal(suivreCases(29, p * 1.5, p), 27.5);
  assert.equal(suivreCases(10, -p, p), 11);
  // lâcher lent : la plus proche
  assert.equal(cranCase(28.4, 0, p, 29, 0, 29), 28);
  assert.equal(cranCase(27.6, 0, p, 29, 0, 29), 28);
  // pichenette (lâcher vif, peu de chemin) : la semaine suivante dans le sens du doigt
  assert.equal(cranCase(28.9, SEMAINIER.vif, p, 29, 0, 29), 28);
  assert.equal(cranCase(10.1, -SEMAINIER.vif, p, 10, 0, 29), 11);
  // jamais plus de 3 semaines du départ du geste, jamais hors de l'historique
  assert.equal(cranCase(26, 20, p, 29, 0, 29), 26);
  assert.equal(cranCase(20, 30, p, 20, 0, 29), 17);
  assert.equal(cranCase(1, 30, p, 2, 0, 29), 0);
  assert.equal(cranCase(29.2, -30, p, 29, 0, 29), 29, "pas de futur");
  for (const x of [0.3, 4.7, 12.5, 28.49]) for (const vx of [-2, -0.3, 0, 0.3, 2]) assert.ok(Number.isInteger(cranCase(x, vx, p, Math.round(x), 0, 29)));
});

test("butées : au-delà de la semaine en cours ou de la première, la bande résiste et ne passe jamais 28 dp", () => {
  const p = 340;
  const max = SEMAINES_BANDE.buteePx / p;
  assert.equal(buteeCases(14, 0, 29, p), 14);
  for (const tire of [0.01, 0.2, 1, 5]) {
    const apres = buteeCases(29 + tire, 0, 29, p) - 29;
    const avant = 0 - buteeCases(-tire, 0, 29, p);
    assert.ok(apres > 0 && apres < max && apres < tire, `futur, tiré de ${tire}`);
    assert.ok(Math.abs(avant - apres) < 1e-9, "même butée au début de l'historique");
  }
  assert.ok(buteeCases(29 + 0.5, 0, 29, p) - 29 < buteeCases(29 + 1, 0, 29, p) - 29, "continue");
});

test("durées : 320 ms par semaine parcourue, de 160 à 480", () => {
  assert.equal(dureeCases(29, 28), 320);
  assert.equal(dureeCases(29, 29.2), 160);
  assert.equal(dureeCases(29, 26), 480);
});

test("toucher : la case du centre, ou une voisine dans sa zone ; rien avant la première ni après la semaine en cours", () => {
  const g = geometrieSemaines(412);
  assert.equal(caseTouchee(28, 206, g, N), 28, "centre");
  assert.equal(caseTouchee(28, 47, g, N), 27, "voisine de gauche, bord de sa zone");
  assert.equal(caseTouchee(28, 10, g, N), 27);
  assert.equal(caseTouchee(28, 400, g, N), 29, "voisine de droite");
  assert.equal(caseTouchee(28, 49, g, N), 28, "juste après la zone : la case du centre");
  assert.equal(caseTouchee(29, 400, g, N), null, "pas de futur");
  assert.equal(caseTouchee(0, 10, g, N), null, "pas d'avant l'historique");
  // bande arrêtée entre deux semaines (pendant l'élan) : la case sous le doigt
  assert.equal(caseTouchee(27.5, 150, g, N), 27);
  const fold = geometrieSemaines(640, 25);
  assert.equal(caseTouchee(12, 70, fold, N), 11, "Fold : zone de 73 depuis le bord de l'écran");
  assert.equal(caseTouchee(12, 345, fold, N), 12);
});

test("libellé des voisines : effacé au repos, plein au centre ; voisines seulement si la semaine existe", () => {
  assert.equal(opaciteLibelle(0), 1);
  assert.equal(opaciteLibelle(1), 0);
  assert.equal(opaciteLibelle(-1), 0);
  assert.ok(opaciteLibelle(0.4) > 0 && opaciteLibelle(0.4) < 1);
  assert.deepEqual(voisines(29, N), { gauche: true, droite: false });
  assert.deepEqual(voisines(0, N), { gauche: false, droite: true });
  assert.deepEqual(voisines(14.4, N), { gauche: true, droite: true });
});

test("séparateurs : le mois avant la première semaine d'un mois (son jeudi), les traits de semaine ailleurs", () => {
  actif("fr");
  const lundis = [lundi(2026, 9, 21), lundi(2026, 9, 28), lundi(2026, 10, 5), lundi(2026, 10, 26), lundi(2026, 11, 2)];
  const mois = lundis.map(moisDuJeudi);
  // 28 sept. – 4 oct. : jeudi 1er octobre, semaine d'octobre ; 26 oct. – 1er nov. : jeudi 29 octobre
  assert.deepEqual(separateursMoisSemaines(mois), [1, 4]);
  assert.deepEqual(separateursEntreSemaines(5, [1, 4]), [2, 3]);
});

test("libellés : du lundi au dimanche, « 1er », mois abrégés à la demande, à cheval sur deux années ; anglais", () => {
  actif("fr");
  assert.equal(libelleSemaine(lundi(2026, 10, 19)), "Semaine du 19 au 25 octobre 2026");
  assert.equal(libelleSemaine(lundi(2026, 10, 26)), "Semaine du 26 octobre au 1er novembre 2026");
  assert.equal(libelleSemaine(lundi(2026, 10, 26), true), "Semaine du 26 oct. au 1er nov. 2026");
  assert.equal(libelleSemaine(lundi(2026, 12, 28)), "Semaine du 28 décembre 2026 au 3 janvier 2027");
  // changements d'heure dans la semaine : le dimanche reste le bon
  assert.equal(libelleSemaine(lundi(2026, 3, 23)), "Semaine du 23 au 29 mars 2026");
  assert.equal(libelleSemaine(lundi(2026, 10, 19)), "Semaine du 19 au 25 octobre 2026");
  assert.equal(titreSemaine(0), "Cette semaine");
  assert.equal(titreSemaine(1), "Semaine dernière");
  assert.equal(titreSemaine(3), "Il y a 3 semaines");
  actif("en");
  assert.equal(libelleSemaine(lundi(2026, 10, 19)), "Week of October 19 – 25, 2026");
  assert.equal(libelleSemaine(lundi(2026, 10, 26), true), "Week of Oct 26 – Nov 1, 2026");
  assert.equal(titreSemaine(3), "3 weeks ago");
  actif("fr");
});
