// Rendu de test de cinq écrans dans une langue (sans APK ni émulateur) : les vrais textes du dictionnaire, la police Inter de l'appli,
// les mesures des composants (Bouton : 15/600, 16 de marge ; Onglets simples : 14/600, 16 de marge ; écran de 412 dp, marges de 20).
// Chaque libellé qui ne tient pas dans sa boîte est entouré de rouge et listé. Les écrans sont des maquettes de mesure, pas des copies.
// node --experimental-strip-types --import ./tests/resolveur.mjs scripts/rendu-langue.ts de [dossier de sortie]   (depuis app/)
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { de, en, es, fr } from "../src/i18n/index.ts";

const langue = process.argv[2] ?? "de";
const sortie = process.argv[3] ?? `../docs/captures-${langue}`;
const dico = { fr, en, de, es }[langue] as Record<string, unknown> | undefined;
if (!dico) throw new Error(`langue inconnue : ${langue}`);
const PLAYWRIGHT = process.env.PLAYWRIGHT ?? "playwright";
const { chromium } = createRequire(import.meta.url)(PLAYWRIGHT);
const POLICES = new URL("../assets/fonts/", import.meta.url).href;

const manquantes: string[] = [];
const tx = (cle: string, p: Record<string, string> = {}): string => {
  const v = dico[cle];
  const s = typeof v === "string" ? v : v && typeof v === "object" ? (v as { other: string }).other : undefined;
  if (s === undefined) {
    manquantes.push(cle);
    return `⟨${cle}⟩`;
  }
  return s.replace(/\{(\w+)\}/g, (m, k: string) => p[k] ?? m);
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const lab = (cle: string, p?: Record<string, string>) => `<span class="l" data-cle="${cle}">${esc(tx(cle, p))}</span>`;

const titre = (cle: string) => `<h1>${lab(cle)}</h1>`;
const entete = (cle: string) => `<h2>${lab(cle)}</h2>`;
const bouton = (cle: string, plein = false, p?: Record<string, string>) => `<div class="b${plein ? " plein" : ""}">${lab(cle, p)}</div>`;
const boutons2 = (a: string, b: string) => `<div class="rang">${bouton(a)}${bouton(b, true)}</div>`;
const puces = (cles: string[]) => `<div class="puces">${cles.map((c, i) => `<div class="p${i ? "" : " on"}">${lab(c)}</div>`).join("")}</div>`;
const onglets = (cles: string[]) =>
  `<div class="onglets" style="--n:${cles.length}">${cles.map((c, i) => `<div class="o${i ? "" : " on"}">${lab(c)}</div>`).join("")}</div>`;
const ligne = (cle: string, valeur = "") => `<div class="ligne">${lab(cle)}<span class="v">${esc(valeur)}</span><span class="chev">›</span></div>`;
const barre = (cles: string[]) => `<div class="barre">${cles.map((c, i) => `<div class="t${i ? "" : " on"}"><i></i>${lab(c)}</div>`).join("")}</div>`;

const ECRANS: Record<string, string> = {
  "1-accueil": [
    titre("ui.onglet.accueil"),
    entete("accueil.blocs.aSuivre"),
    ligne("accueil.blocs.seances", tx("accueil.blocs.rienDePrevu")),
    ligne("accueil.blocs.derniere", tx("accueil.blocs.aujourdhui")),
    ligne("accueil.blocs.records", tx("accueil.blocs.aucunRecord")),
    ligne("accueil.blocs.poids", tx("accueil.blocs.aucunePesee")),
    ligne("accueil.blocs.regularite"),
    boutons2("accueil.blocs.choisirRoutine", "accueil.blocs.demarrer"),
    entete("accueil.courbe.courbe"),
    puces(["accueil.courbe.unMois", "accueil.courbe.troisMois", "accueil.courbe.unAn"]),
    bouton("accueil.lanceur.modifier"),
    boutons2("accueil.modifier.retirerAccueil", "accueil.modifier.ajouter"),
    barre(["ui.onglet.accueil", "ui.onglet.moi", "ui.onglet.entrainement", "ui.onglet.nutrition"]),
  ].join(""),
  "2-seance": [
    titre("seance.seance.titreDefaut"),
    ligne("seance.seance.salle", "Lofting Club"),
    boutons2("seance.seance.lancerRepos", "seance.seance.terminer"),
    bouton("seance.seance.ajouterExercice"),
    bouton("seance.repos.passer"),
    entete("seance.fin.titre"),
    puces(["seance.fin.record", "seance.fin.stable", "seance.fin.note"]),
    bouton("seance.fin.message"),
    bouton("seance.fin.majRoutine", false, { nom: "Push A" }),
    boutons2("seance.fin.abandonner", "seance.fin.enregistrer"),
    ligne("seance.passee.duree", "1:02:15"),
    ligne("seance.passee.volume", "8 450 kg"),
    bouton("seance.passee.enRoutine"),
  ].join(""),
  "3-nutrition": [
    titre("ui.onglet.nutrition"),
    puces(["nutrition.semaine", "nutrition.mois", "nutrition.annee", "nutrition.tout"]),
    bouton("nutrition.ajouterAliment", true),
    boutons2("nutrition.mesAliments", "nutrition.mesProduits"),
    entete("nutrition.energie"),
    ligne("nutrition.proteines", "142 g"),
    ligne("nutrition.glucides", "260 g"),
    ligne("nutrition.lipides", "70 g"),
    ligne("nutrition.fibres", "31 g"),
    boutons2("nutrition.creerProduit", "nutrition.autoriserCamera"),
    ligne("nutrition.rappelRepas"),
    ligne("nutrition.optionsAliment"),
  ].join(""),
  "4-region": [
    titre("region.titre"),
    entete("region.langue"),
    ...Object.entries({ fr: "Français", en: "English", de: "Deutsch", es: "Español" }).map(([l, n]) => `<div class="ligne choix${l === langue ? " on" : ""}"><span class="l">${n}</span></div>`),
    ligne("region.fuseau", "Europe/Berlin"),
    entete("region.poids"),
    puces(["region.kg", "region.lbs", "region.auto"]),
    entete("region.distance"),
    puces(["region.km", "region.mi", "region.auto"]),
  ].join(""),
  "5-cercle": [
    titre("cercle.trouver.titre"),
    onglets(["cercle.onglet.activite", "cercle.onglet.annonces", "cercle.onglet.tops", "cercle.onglet.materiel"]),
    boutons2("cercle.inviter", "social.suivre"),
    boutons2("social.annulerDemande", "cercle.publier.bouton"),
    bouton("cercle.top.ajouterBouton"),
    bouton("cercle.image.recadrerCouv"),
    ligne("cercle.adresse.copier"),
    ligne("social.profil.quiTrouve", tx("social.niveau.nom.public")),
    ligne("cercle.seances.aucun.regler"),
    bouton("cercle.quitter.bouton"),
  ].join(""),
};

const CSS = `
@font-face { font-family: Inter; font-weight: 400; src: url(${POLICES}Inter-Regular.ttf); }
@font-face { font-family: Inter; font-weight: 500; src: url(${POLICES}Inter-Medium.ttf); }
@font-face { font-family: Inter; font-weight: 600; src: url(${POLICES}Inter-SemiBold.ttf); }
* { box-sizing: border-box; margin: 0; }
body { width: 412px; background: #000; color: rgba(255,255,255,.94); font: 400 14px Inter; padding: 24px 20px 96px; }
.l { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
h1 { font: 600 24px Inter; margin: 8px 0 20px; display: flex; }
h2 { font: 600 11px Inter; letter-spacing: .66px; text-transform: uppercase; color: rgba(255,255,255,.7); margin: 24px 0 8px; display: flex; }
.b { min-height: 48px; padding: 0 16px; border-radius: 14px; background: #1f1d1b; font: 600 15px Inter; display: flex; align-items: center;
  justify-content: center; margin: 8px 0; }
.b.plein { background: #e9c46a; color: #111; }
.rang { display: flex; gap: 8px; } .rang .b { flex: 1 1 0; min-width: 0; }
.puces { display: flex; gap: 8px; margin: 8px 0; flex-wrap: wrap; }
.p { height: 32px; padding: 0 12px; border-radius: 16px; background: rgba(255,255,255,.1); font: 500 13px Inter; display: flex; align-items: center; max-width: 180px; }
.p.on { background: rgba(255,255,255,.26); }
.onglets { display: flex; border-bottom: 1px solid rgba(255,255,255,.11); margin: 0 -20px 12px; padding: 0 20px; }
.o { flex: 1 1 0; min-width: 0; height: 48px; display: flex; align-items: center; justify-content: center; padding: 0 16px; font: 500 14px Inter;
  color: rgba(255,255,255,.7); }
.o.on { font-weight: 600; color: rgba(255,255,255,.94); box-shadow: inset 0 -2px #e9c46a; }
.ligne { display: flex; align-items: center; gap: 12px; min-height: 52px; border-bottom: 1px solid rgba(255,255,255,.11); font: 400 15px Inter; }
.ligne .l { flex: 1 1 auto; } .ligne .v { color: rgba(255,255,255,.7); font-size: 14px; white-space: nowrap; flex: 0 0 auto; }
.chev { color: rgba(255,255,255,.4); flex: 0 0 auto; }
.choix.on::after { content: "✓"; margin-left: auto; color: #e9c46a; }
.barre { position: fixed; left: 12px; right: 12px; bottom: 16px; height: 60px; border-radius: 30px; background: rgba(40,40,40,.92); display: flex; padding: 6px; }
.t { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font: 500 11px Inter;
  color: rgba(255,255,255,.7); padding: 0 4px; }
.t i { width: 22px; height: 22px; border-radius: 6px; border: 1.75px solid currentColor; }
.t.on { color: #e9c46a; font-weight: 600; }
.deborde { outline: 2px solid #ff3b30; outline-offset: 2px; }
`;

mkdirSync(new URL(sortie + "/", new URL("..", import.meta.url)), { recursive: true });
const navigateur = await chromium.launch();
const page = await navigateur.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
const debords: string[] = [];
for (const [nom, corps] of Object.entries(ECRANS)) {
  await page.setContent(`<!doctype html><html lang="${langue}"><meta charset="utf-8"><style>${CSS}</style><body>${corps}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const l: string[] = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".l")]
      .filter((e) => e.scrollWidth > e.clientWidth + 0.5)
      .map((e) => {
        e.classList.add("deborde");
        return `${e.dataset.cle ?? ""} « ${e.textContent} » (${e.scrollWidth} px pour ${e.clientWidth})`;
      }),
  );
  for (const x of l) debords.push(`${nom} : ${x}`);
  await page.screenshot({ path: new URL(`${sortie}/${nom}.png`, new URL("..", import.meta.url)).pathname, fullPage: true });
}
await navigateur.close();
const rapport = [`Rendu de test, langue ${langue} : ${Object.keys(ECRANS).length} écrans.`, debords.length ? "Débordements :" : "Aucun débordement.", ...debords.map((d) => `- ${d}`)];
if (manquantes.length) rapport.push(`Clés absentes : ${manquantes.join(", ")}`);
writeFileSync(new URL(`${sortie}/debordements.txt`, new URL("..", import.meta.url)), rapport.join("\n") + "\n");
console.log(rapport.join("\n"));
