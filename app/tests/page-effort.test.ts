// Page du jour de l'onglet Effort (planche Effort v2.2, D4, D5, D8, D9, D10) : états de la ligne Sommeil, gestes de ses « … », image
// d'une récupération (nom, durée, message, jamais la nuit), récupération sans point ni série ni publication de soi-même, réglage
// « Afficher le sommeil », textes fr et en. Données inventées.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { definirActif } from "../src/i18n/index.ts";
import { fr as effortFr } from "../src/i18n/dico-fr/effort-jour.ts";
import { fr as horairesFr } from "../src/i18n/dico-fr/horaires.ts";
import { en as effortEn } from "../src/i18n/dico-en/effort-jour.ts";
import { cleLigne } from "../src/ecrans/cle-ligne.ts";
import { fusionnerParHeure } from "../src/ecrans/activites-vue.ts";
import { CLE_SOMMEIL_AFFICHE, lireReglages, ecrireReglages } from "../src/ecrans/donnees.ts";
import { bornesDuJour, lirePageEffort } from "../src/ecrans/page-effort-donnees.ts";
import {
  ACTIONS_RECUP, ACTIONS_SOMMEIL, actionsSommeil, dureeNuit, elementRecup, etatSommeil, horairesNuit, iconeRecup,
  recupModifiee, sommeilMontre, sousLigneModifiee, sousLigneSommeil, libelleSommeil, type EtatSommeil,
} from "../src/ecrans/page-effort.ts";
import { epaisseurAuPixel, traceContour } from "../src/ui/contour-tuile.ts";
import { marque, lirePlanning } from "../src/ecrans/planif-donnees.ts";
import { enregistrerRecup, lireRecupEntre, retablirRecup, supprimerRecup } from "../src/ecrans/recuperer-donnees.ts";
import { TYPES_RECUP } from "../src/ecrans/recuperer.ts";
import { baseDeTest, jour } from "./aide.ts";

definirActif({ langue: "fr", fuseau: "Europe/Paris", poids: "kg", distance: "km" });

const MIN = 60_000;
const src = (chemin: string) => readFileSync(new URL(`../src/${chemin}`, import.meta.url), "utf8");
// Un vendredi : la nuit finit à 6 h 55, un sauna à 12 h 20.
const vendredi = jour(2026, 11, 6, 0, 0);
const A = (h: number, m: number) => vendredi + (h * 60 + m) * MIN;
const nuit = { debut: vendredi - 24 * 60 * MIN + (23 * 60 + 10) * MIN, fin: A(6, 55), sommeilMin: 465 };

test("états du Sommeil : lue, pas de donnée, synchro en cours ; rien tant que la lecture n'est pas faite", () => {
  const base = { jour: "2026-11-06", aujourdhui: "2026-11-06", synchro: false };
  assert.equal(etatSommeil({ ...base, nuit }), "lue");
  assert.equal(etatSommeil({ ...base, nuit: null }), "pasDeDonnee");
  assert.equal(etatSommeil({ ...base, nuit: null, synchro: true }), "synchro");
  // pas de « Pas de donnée » qui clignote avant que la nuit soit lue
  assert.equal(etatSommeil({ ...base, nuit: undefined }), "aucune");
  // la synchro attend la nuit d'aujourd'hui, pas celle d'un jour passé
  assert.equal(etatSommeil({ ...base, jour: "2026-11-04", nuit: null, synchro: true }), "pasDeDonnee");
});

test("un jour à venir n'a pas de ligne Sommeil, quoi qu'on ait lu", () => {
  for (const nuitLue of [nuit, null, undefined]) {
    for (const synchro of [false, true]) assert.equal(etatSommeil({ jour: "2026-11-07", aujourdhui: "2026-11-06", nuit: nuitLue, synchro }), "aucune");
  }
});

test("Sommeil masqué par le réglage : aucune ligne, quel que soit l'état ; affiché : toutes sauf « aucune »", () => {
  const etats: EtatSommeil[] = ["lue", "pasDeDonnee", "synchro", "aucune"];
  for (const e of etats) assert.equal(sommeilMontre(false, e), false);
  assert.deepEqual(etats.filter((e) => sommeilMontre(true, e)), ["lue", "pasDeDonnee", "synchro"]);
});

test("le « … » du Sommeil : Modifier et Masquer, jamais Partager ; pas de « … » sans nuit lue (D5)", () => {
  assert.deepEqual([...ACTIONS_SOMMEIL], ["modifier", "masquer"]);
  assert.deepEqual([...actionsSommeil("lue")], ["modifier", "masquer"]);
  assert.deepEqual([...actionsSommeil("pasDeDonnee")], []);
  assert.deepEqual([...actionsSommeil("synchro")], []);
  assert.ok(!(ACTIONS_SOMMEIL as readonly string[]).includes("partager"));
  assert.deepEqual([...ACTIONS_RECUP], ["modifier", "supprimer"]);
  // et le code du menu de la nuit n'a pas d'entrée Partager
  const menu = src("ecrans/ActionsEffort.tsx");
  const feuilleNuit = menu.slice(menu.indexOf("titre={t(\"effortJour.sommeil\")}"), menu.indexOf("recup != null"));
  assert.ok(feuilleNuit.includes("effortJour.masquer") && feuilleNuit.includes("horaires.modifier"));
  assert.ok(!feuilleNuit.includes("partager"), "pas de Partager dans le menu du Sommeil");
});

test("horaires et durée de la ligne Sommeil : « 23:10 → 6:55 » (format de l'heure de l'appli, sans zéro devant), « 7 h 45 »", () => {
  assert.equal(horairesNuit(nuit), "23:10 → 6:55");
  assert.equal(dureeNuit(nuit), "7 h 45");
});

test("les icônes des récupérations : la lune pour la sieste, un pictogramme au trait pour le sauna, chaque type a la sienne (D10)", () => {
  assert.equal(iconeRecup("sieste"), "lune");
  assert.equal(iconeRecup("sauna"), "sauna");
  for (const t of TYPES_RECUP) assert.ok(iconeRecup(t), `icône de ${t}`);
});

test("« modifié » : seulement quand les horaires ont été retouchés", () => {
  assert.equal(recupModifiee({ debutOrig: null, finOrig: null }), false);
  assert.equal(recupModifiee({ debutOrig: A(12, 20), finOrig: A(12, 35) }), true);
  assert.equal(sousLigneModifiee("12:20, 15 min", { debutOrig: null, finOrig: null }), "12:20, 15 min");
  assert.equal(sousLigneModifiee("12:20, 15 min", { debutOrig: A(12, 20), finOrig: A(12, 35) }), `12:20, 15 min, ${horairesFr["horaires.modifie"]}`);
  // la ligne Sommeil, de même : une nuit retouchée garde son original, la sous-ligne le dit
  assert.equal(sousLigneSommeil(nuit), "7 h 45");
  assert.equal(sousLigneSommeil({ ...nuit, original: { debut: nuit.debut - 5 * 60_000, fin: nuit.fin - 5 * 60_000 } }), `7 h 45, ${horairesFr["horaires.modifie"]}`);
});

test("une récupération prend place à son heure parmi les séances, avec sa clé", () => {
  const recup = elementRecup({ id: "r1", type: "sauna", debut: A(12, 20), fin: A(12, 35) } as never, 8);
  const matin = { genre: "faite", seance: { id: "s1", debut: A(8, 30) } } as never;
  const soir = { genre: "faite", seance: { id: "s2", debut: A(18, 0) } } as never;
  const l = fusionnerParHeure<never, typeof recup>([matin, soir], [recup], (x: { seance: { debut: number } }) => x.seance.debut);
  assert.deepEqual(l.map((x) => ("recupId" in x ? x.recupId : (x as { seance: { id: string } }).seance.id)), ["s1", "r1", "s2"]);
  assert.equal(cleLigne(recup), "recup:r1");
});

test("rien ne publie une récupération : ni dépôt du fil, ni appel réseau, ni écriture de publication", () => {
  for (const f of ["ecrans/ActionsEffort.tsx", "ecrans/page-effort.ts", "ecrans/usePageEffort.ts", "ecrans/page-effort-donnees.ts", "ecrans/LigneRecup.tsx"]) {
    const s = src(f);
    assert.ok(!/publier|deposerPublication|enregistrerPublication|fetch\(|INSERT INTO publications/i.test(s), `${f} ne publie rien`);
  }
  assert.ok(!/publication/i.test(src("ecrans/recuperer-donnees.ts").replace(/\/\/.*$/gm, "")));
});

test("la page lit les récupérations du jour avec leurs kcal ; la nuit n'est lue que si le Sommeil est affiché", async () => {
  const { db, raw } = await baseDeTest();
  await enregistrerRecup(db, { id: "sauna1", type: "sauna", debut: A(12, 20), fin: A(12, 35), mode: "libre" }, A(12, 40));
  await enregistrerRecup(db, { id: "hier", type: "sieste", debut: A(-10, 14), fin: A(-10, 14) + 20 * MIN, mode: "libre" }, A(12, 40));
  const avec = await lirePageEffort(db, "2026-11-06", true, A(17, 22));
  assert.deepEqual(avec.recups.map((r) => r.recupId), ["sauna1"]);
  assert.equal(avec.nuit, null, "aucune nuit lue : null, pas undefined");
  assert.equal(avec.part, null, "sans nuit, pas de pourcentage de sommeil");
  const sans = await lirePageEffort(db, "2026-11-06", false, A(17, 22));
  assert.equal(sans.nuit, undefined, "Sommeil masqué : la nuit n'est pas lue pour la liste");
  assert.equal(sans.recups.length, 1);
  // un jour à venir : pas de nuit, mais ses récupérations
  assert.equal((await lirePageEffort(db, "2026-11-07", true, A(17, 22))).nuit, undefined);
  assert.deepEqual(bornesDuJour("2026-11-06"), { debut: vendredi, fin: vendredi + 86_400_000 });
  raw.close();
});

test("une récupération n'allume ni le point du jour ni la série, et n'est pas une séance (D5)", async () => {
  const { db, raw } = await baseDeTest();
  const j = "2026-11-06";
  await enregistrerRecup(db, { id: "sauna1", type: "sauna", debut: A(12, 20), fin: A(12, 35), mode: "libre" }, A(12, 40));
  const p = await lirePlanning(db, "2026-11-02", "2026-11-08");
  assert.equal(marque(p, j), null, "pas de point sur ce jour");
  assert.equal(p.jours.length, 0);
  assert.equal(p.seances.length, 0);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM seances").get() as { n: number }).n, 0);
  raw.close();
});

test("supprimer une récupération la retire de la liste, « Annuler » la remet", async () => {
  const { db, raw } = await baseDeTest();
  await enregistrerRecup(db, { id: "sauna1", type: "sauna", debut: A(12, 20), fin: A(12, 35), mode: "libre" }, A(12, 40));
  await supprimerRecup(db, "sauna1", A(12, 41));
  assert.equal((await lireRecupEntre(db, vendredi, vendredi + 86_400_000)).length, 0);
  await retablirRecup(db, "sauna1", A(12, 42));
  assert.deepEqual((await lireRecupEntre(db, vendredi, vendredi + 86_400_000)).map((r) => r.id), ["sauna1"]);
  raw.close();
});

test("« Afficher le sommeil » : vrai par défaut, réglage de l'appareil (jamais synchronisé), écrit et relu (D9)", async () => {
  const { brute, db, raw } = await baseDeTest();
  assert.equal(CLE_SOMMEIL_AFFICHE, "effort_sommeil");
  assert.equal((await lireReglages(db)).sommeilAffiche, true);
  await ecrireReglages(db, { sommeilAffiche: false });
  assert.equal((await lireReglages(db)).sommeilAffiche, false);
  await ecrireReglages(db, { sommeilAffiche: true });
  assert.equal((await lireReglages(db)).sommeilAffiche, true);
  // réglage local : la clé n'est dans aucun changement envoyé aux autres appareils
  assert.ok(!/effort_sommeil/.test(src("sync/schema.ts")), "effort_sommeil absent de la synchro");
  void brute;
  raw.close();
});

test("textes de la page du jour : fr et en à parité, jamais de point médian, rien de vide", () => {
  assert.deepEqual(Object.keys(effortEn).sort(), Object.keys(effortFr).sort());
  for (const [k, v] of [...Object.entries(effortFr), ...Object.entries(effortEn)]) {
    assert.ok(v.length > 0, k);
    assert.ok(!v.includes("·"), `${k} : pas de point médian`);
  }
  assert.equal(effortFr["effortJour.masque"], "Sommeil masqué. Pour le revoir : réglages Activité.");
  // titre de section de la liste du jour (09/11), sur la page Activité seulement (la page du mois n'en a pas)
  assert.equal(effortFr["effortJour.activites"], "Activités");
  assert.equal(effortEn["effortJour.activites"], "Activities");
  const planif = src("ecrans/Planif.tsx");
  const liste = planif.slice(planif.indexOf("export function ListeJour"));
  assert.ok(/\{effort \? \(\s*<Texte variante="entete"[^>]*>\s*\{t\("effortJour.activites"\)\}/.test(liste), "le titre n'est posé que si la page porte l'Effort");
  assert.ok(liste.indexOf("effortJour.activites") < liste.indexOf("<LigneSommeil"), "le titre est au-dessus de la ligne Sommeil");
});

test("zones de clic : le « … » des lignes de récupération et du Sommeil a une zone de toucher d'au moins 44", () => {
  const s = src("ecrans/LigneRecup.tsx");
  // 32 × 28 visibles + hitSlop 12 de chaque côté = 56 × 52
  assert.ok(s.includes("hitSlop={12}") && s.includes("gabaritLigne.options"));
  const g = src("ecrans/ligne-jour-styles.ts");
  const l = Number(/options:[^}]*width: (\d+)/.exec(g)?.[1]);
  const h = Number(/options:[^}]*height: (\d+)/.exec(g)?.[1]);
  assert.ok(l + 24 >= 44 && h + 24 >= 44, `zone ${l + 24} × ${h + 24}`);
});

test("retouches du 09/11, Sommeil : le pourcentage suit le titre (rose), la durée seule dessous, jamais d'horaires sur la ligne", () => {
  const n = { ...nuit, sommeilMin: 512 };
  assert.equal(sousLigneSommeil(n), "8 h 32");
  const retouchee = { ...n, original: { debut: n.debut - 5 * MIN, fin: n.fin - 5 * MIN } };
  assert.equal(sousLigneSommeil(retouchee), `8 h 32, ${horairesFr["horaires.modifie"]}`);
  // ni début ni fin sur la ligne, ni dans le texte lu ; jamais de point médian
  assert.ok(!/\d{1,2}:\d{2}|→/.test(sousLigneSommeil(retouchee)));
  assert.ok(!/\d{1,2}:\d{2}/.test(libelleSommeil(n, 56)));
  assert.ok(!sousLigneSommeil(retouchee).includes("·"));
  // le texte lu dit la durée, puis le pourcentage quand il existe
  assert.equal(libelleSommeil(n, null), "Sommeil, 8 h 32");
  assert.ok(libelleSommeil(n, 70).includes("70"));
  assert.equal(libelleSommeil(n, null), libelleSommeil(n));
  assert.equal(effortFr["effortJour.sommeilPart"], "{n} %");
  assert.equal(effortEn["effortJour.sommeilPart"], "{n}%");
  // la ligne : le pourcentage dans le titre, plus rien à droite que le « … »
  const ligne = src("ecrans/LigneRecup.tsx");
  const corps = ligne.slice(ligne.indexOf("export function LigneSommeil"), ligne.indexOf("export function LigneRecup"));
  assert.ok(corps.includes("effortJour.sommeilPart") && corps.includes("color: r.picto"));
  assert.ok(!corps.includes("dureeNuit") && !corps.includes("styles.duree"), "la durée n'est plus à droite");
});

test("le contour de tuile : départ au milieu du bord haut, longueur du tour juste, trait dans la boîte", () => {
  const { d, longueur } = traceContour(44, 2, 12);
  assert.ok(d.startsWith("M 22 1 "));
  // carré tracé de 42, coins de rayon 11 : 4 × (42 − 22) + 2π × 11
  assert.ok(Math.abs(longueur - (80 + 2 * Math.PI * 11)) < 1e-9);
  // rayon plus grand que la demi-boîte : ramené, jamais négatif
  assert.ok(traceContour(44, 2, 80).longueur > 0);
});

test("ligne Sommeil : le contour est toujours rose (jamais selon le niveau) et les lignes gardent un seul composant de contour", () => {
  const ligne = src("ecrans/LigneRecup.tsx");
  assert.ok(ligne.includes("<ContourTuile"));
  assert.ok(ligne.includes("arc: rose") && ligne.includes("piste: avecOpacite(rose"));
  // ni le vert, ni le rouge, ni le niveau de sommeil ne teintent l'arc
  assert.ok(!/niveauSommeil|couleurs\.valide|couleurs\.rate|#[0-9a-fA-F]{3,8}\b(?!.*000000)/.test(ligne.replace(/"#000000"/g, "")));
  const planif = src("ecrans/Planif.tsx");
  // la séance faite dessine son anneau avec le même composant, et le chiffre n'est plus remonté pour la coche
  assert.ok(planif.includes("<ContourTuile part={1} couleur={couleurs.valide}"));
  const voile = planif.match(/voile: \{[^}]*\}/)?.[0] ?? "";
  assert.ok(voile && !/padding/.test(voile), "le chiffre est centré sur le carré");
  const case_ = planif.match(/casePic: \{[^}]*\}/)?.[0] ?? "";
  assert.ok(case_.includes('position: "absolute"'), "la coche se superpose sans peser sur la mise en page");
});

test("contour de tuile : mêmes marges sur les quatre côtés et les quatre coins, épaisseur entière en pixels", () => {
  for (const ep of [2, epaisseurAuPixel(2, 2.625), epaisseurAuPixel(2, 2.75), epaisseurAuPixel(2, 3)]) {
    const { d } = traceContour(44, ep, 12);
    const n = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    // M m a, H x, A rr rr 0 0 1 X Y, V y, A … X Y, H x, A … X Y, V y, A … X Y
    const arcs = [...d.matchAll(/A ([\d.]+) [\d.]+ 0 0 1 ([\d.]+) ([\d.]+)/g)].map((m) => ({ r: Number(m[1]), x: Number(m[2]), y: Number(m[3]) }));
    assert.equal(arcs.length, 4);
    const [c1, c2, c3] = [arcs[0]!, arcs[1]!, arcs[2]!];
    assert.ok(new Set(arcs.map((a) => a.r)).size === 1, "le même rayon aux quatre coins");
    const a = ep / 2;
    const [haut, droite, bas, gauche] = [n[1]!, 44 - c1.x, 44 - c2.y, c3.x];
    for (const marge of [haut, droite, bas, gauche]) assert.ok(Math.abs(marge - a) < 1e-3, `marge ${marge} ≠ ${a}`);
    // le rayon extérieur reste celui de la tuile (12) quelle que soit l'épaisseur
    assert.ok(Math.abs(c1.r + a - 12) < 1e-3);
  }
  // 2 dp à 2,625 = 5,25 px : ramené à 5 px ; à 3 : 6 px exacts ; jamais sous 1 px ni NaN
  assert.ok(Math.abs(epaisseurAuPixel(2, 2.625) * 2.625 - 5) < 1e-9);
  assert.ok(Math.abs(epaisseurAuPixel(2, 3) - 2) < 1e-9);
  assert.ok(epaisseurAuPixel(0.1, 2) * 2 >= 1);
  assert.equal(epaisseurAuPixel(2, 0), 2);
  assert.equal(epaisseurAuPixel(NaN, 3), NaN);
});

test("picto de séance faite : pas de bordure ni de découpe sous le contour, contour au-dessus du voile, coche sans halo", () => {
  const planif = src("ecrans/Planif.tsx");
  const tuile = planif.match(/tuilePic: \{[^}]*\}/)?.[0] ?? "";
  assert.ok(tuile && !/borderWidth/.test(tuile), "la bordure décalait l'origine du contour et le rognait à droite et en bas");
  const picto = planif.slice(planif.indexOf("export function PictoSeance"), planif.indexOf("Une séance du jour : picto"));
  assert.ok(picto.indexOf("styles.voile") < picto.indexOf("<ContourTuile"), "le contour est dessiné après le voile");
  assert.ok(picto.indexOf("<ContourTuile") < picto.indexOf("styles.casePic"), "la coche passe sur le contour, du même vert");
  const coche = planif.match(/casePic: \{[^}]*\}/)?.[0] ?? "";
  assert.ok(coche && !/borderWidth/.test(coche), "pas de halo : il coupait le contour dans le coin");
  assert.ok(!picto.includes("carteOpaque"));
  // le même composant de contour que le Sommeil, épaisseur au pixel
  assert.ok(src("ui/ContourTuile.tsx").includes("epaisseurAuPixel(epaisseurDemandee, PixelRatio.get())"));
});
