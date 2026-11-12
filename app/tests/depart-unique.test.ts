// Un seul écran de lancement pour les activités (retour du 06 et du 07/11) : la course, les sports au suivi et la
// musculation n'ont plus deux écrans qui se suivent (le récap à halo, puis le départ) mais l'écran noir de SuiviDepart ; la FC en
// direct est celle de n'importe quel capteur (Whoop, ceinture, montre), et la musculation règle son capteur et l'écran allumé là.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { ecrireFcAppareil, ecrireFcDirecte, lireFcAppareil, lireFcDirecte } from "../src/db/depots/suivi-gps.ts";
import { migrer } from "../src/db/migrations.ts";
import { capteurRetenu, nomCapteur, nomsDistincts, quiDiffusent } from "../src/ecrans/capteur-cardiaque.ts";
import { exterieurSeul, familleDe, interieurPossible, lieuxDepart, segmentDepart, SPORTS_RANGES } from "../src/ecrans/familles-sports.ts";
import { COURSE, genreSport, MUSCULATION } from "../src/ecrans/lanceur-sports.ts";
import { aUnProgramme, departDuRecap, exercicesDe, quandDepart } from "../src/ecrans/recap/recap-calc.ts";
import { capteursDepart, ligneFc } from "../src/ecrans/suivi-direct-vue.ts";
import { en as en_accueil } from "../src/i18n/dico-en/accueil.ts";
import { en } from "../src/i18n/dico-en/gps.ts";
import { fr as fr_accueil } from "../src/i18n/dico-fr/accueil.ts";
import { fr } from "../src/i18n/dico-fr/gps.ts";
import type { AppareilFc } from "../src/natif/suivi/types.ts";
import { adapter } from "./aide.ts";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const fc = (adresse: string, nom: string | null, rssi: number, diffuse = true): AppareilFc => ({ adresse, nom, rssi, fc: diffuse });

// ——— Capteur cardiaque multimarque ———

test("capteurs qui diffusent : seulement ceux de la FC (0x180D), du signal le plus fort au plus faible", () => {
  const l = quiDiffusent([fc("A", "Polar H10", -70), fc("B", "Montre", -40, false), fc("C", "WHOOP 4C0912", -50)]);
  assert.deepEqual(l.map((a) => a.adresse), ["C", "A"]);
  assert.deepEqual(quiDiffusent([]), []);
});

test("capteur retenu : le choix de l'écran, sinon le dernier utilisé, sinon le plus proche ; un seul par séance", () => {
  const l = quiDiffusent([fc("A", "Polar H10", -70), fc("C", "WHOOP 4C0912", -50), fc("D", "Garmin", -80)]);
  assert.equal(capteurRetenu(l, null, null)?.adresse, "C", "le plus proche");
  assert.equal(capteurRetenu(l, null, "D")?.adresse, "D", "le dernier utilisé passe avant le plus proche");
  assert.equal(capteurRetenu(l, "A", "D")?.adresse, "A", "le choix fait ici passe avant le dernier");
  assert.equal(capteurRetenu(l, "Z", "Y")?.adresse, "C", "un capteur qui ne diffuse plus n'est pas retenu");
  assert.equal(capteurRetenu([], "A", "A"), null, "rien ne diffuse");
});

test("nom du capteur : « Whoop » pour une Whoop, son nom Bluetooth sinon, « Capteur cardiaque » sans nom ; deux pareils se distinguent", () => {
  assert.equal(nomCapteur({ nom: "WHOOP 4C0912" }), "Whoop");
  assert.equal(nomCapteur({ nom: "Polar H10 7A3B2C" }), "Polar H10 7A3B2C");
  assert.equal(nomCapteur({ nom: "  Garmin   HRM  " }), "Garmin HRM");
  assert.equal(nomCapteur({ nom: null }), "Capteur cardiaque");
  assert.equal(nomCapteur({ nom: "" }), "Capteur cardiaque");
  assert.deepEqual(nomsDistincts([fc("AA:BB:CC:DD:EE:01", "Polar H10", -50), fc("AA:BB:CC:DD:EE:02", "Polar H10", -60), fc("X", "Whoop", -70)]), ["Polar H10 EE01", "Polar H10 EE02", "Whoop"]);
});

test("ligne du capteur cardiaque : plusieurs capteurs qui diffusent proposent « Changer », un seul ne propose rien", () => {
  const trouvee = { etat: "trouvee", appareil: { adresse: "A" } } as const;
  assert.deepEqual(ligneFc(true, trouvee, 2), { etat: "ok", cle: "gps.fcPlusieurs", action: "changer" });
  assert.deepEqual(ligneFc(true, trouvee, 1), { etat: "ok", cle: "gps.fcDiffusee", action: null });
  assert.deepEqual(ligneFc(true, trouvee), { etat: "ok", cle: "gps.fcDiffusee", action: null });
  // éteint : ni recherche, ni « diffusion coupée », même s'il y a des capteurs autour
  assert.deepEqual(ligneFc(false, trouvee, 3), { etat: "off", cle: "gps.fcEteinte", action: null });
  assert.deepEqual(ligneFc(true, { etat: "recherche" }, 0), { etat: "att", cle: "gps.recherche", action: null });
});

test("réglage inchangé : la clé garde son nom d'origine, le dernier capteur se mémorise (et s'oublie)", async () => {
  const raw = new DatabaseSync(":memory:");
  const db = adapter(raw);
  await migrer(db);
  assert.equal(await lireFcAppareil(db), null);
  await ecrireFcAppareil(db, "AA:BB");
  assert.equal(await lireFcAppareil(db), "AA:BB");
  await ecrireFcAppareil(db, null);
  assert.equal(await lireFcAppareil(db), null);
  await ecrireFcDirecte(db, true);
  const cle = raw.prepare("SELECT valeur FROM reglages WHERE cle = 'suivi_fc_whoop'").get() as { valeur: string } | undefined;
  assert.equal(cle?.valeur, "1", "suivi_fc_whoop : pas de migration");
  assert.equal(await lireFcDirecte(db), true);
});

test("libellés fr et en : le capteur cardiaque ne cite pas Whoop (sauf comme capteur trouvé), plus de « FC Whoop »", () => {
  for (const d of [fr, en] as Record<string, string>[]) {
    for (const k of ["gps.capteurCardiaque", "gps.fcPlusieurs", "gps.fcDiffusee", "gps.fcCoupee", "gps.fcEteinte", "gps.fc.changer", "gps.fc.choisirTitre", "gps.fc.choisirSous", "gps.appareilsRefuses"]) {
      assert.ok(d[k], `${k} existe`);
      assert.doesNotMatch(d[k]!, /whoop/i, k);
    }
    assert.equal("gps.fcWhoop" in d, false);
  }
  for (const k of ["gps.capteurCardiaque", "gps.fcPlusieurs", "gps.fc.changer", "gps.fc.choisirTitre", "gps.fc.choisirSous"]) assert.ok((en as Record<string, string>)[k], `${k} en anglais`);
  assert.match(fr["gps.fcPlusieurs"], /\{n\}/);
  assert.match(en["gps.fcPlusieurs"], /\{n\}/);
  // « Whoop » ne s'affiche que par le nom du capteur trouvé
  const visibles = ["SectionCapteurs.tsx", "useCapteursDepart.ts", "SuiviDepart.tsx", "recap/EcranRecap.tsx"].map((f) => src(`ecrans/${f}`)).join("\n");
  assert.equal(/gps\.whoop|gps\.fcWhoop/.test(visibles), false);
  assert.match(src("ecrans/capteur-cardiaque.ts"), /t\("gps\.whoop"\)/);
});

// ——— Quel écran pour quelle activité ———

const suiviLa = { suiviDisponible: true, routineId: null, lignes: 0, typeRoutine: null };

test("un sport au suivi GPS : le départ du suivi (GPS) ; la musculation : le même écran noir, au chrono, sans GPS", () => {
  assert.deepEqual(departDuRecap({ ...suiviLa, sport: COURSE }), { mode: "suivi", sport: COURSE, routineId: null });
  assert.deepEqual(departDuRecap({ ...suiviLa, sport: "cat:bicycling" }), { mode: "suivi", sport: "cat:bicycling", routineId: null });
  assert.deepEqual(departDuRecap({ ...suiviLa, sport: MUSCULATION }), { mode: "seance" });
  assert.deepEqual(departDuRecap({ ...suiviLa, sport: null }), { mode: "seance" });
});

test("une routine : course guidée par ses étapes pour une routine de course, séance d'exercices sinon ; sans module de suivi, toujours la séance au chrono", () => {
  assert.deepEqual(departDuRecap({ ...suiviLa, routineId: "r1", lignes: 13, typeRoutine: "course", sport: "cat:course" }), { mode: "suivi", sport: COURSE, routineId: "r1" });
  assert.deepEqual(departDuRecap({ ...suiviLa, routineId: "r1", lignes: 8, typeRoutine: "muscu", sport: MUSCULATION }), { mode: "seance" });
  // une routine de musculation dont le sport serait au suivi : ses exercices restent la séance
  assert.deepEqual(departDuRecap({ ...suiviLa, routineId: "r1", lignes: 8, typeRoutine: "muscu", sport: COURSE }), { mode: "seance" });
  // une routine sans exercices : son sport décide, sans la routine
  assert.deepEqual(departDuRecap({ ...suiviLa, routineId: "r1", lignes: 0, typeRoutine: "course", sport: COURSE }), { mode: "suivi", sport: COURSE, routineId: null });
  assert.deepEqual(departDuRecap({ suiviDisponible: false, routineId: "r1", lignes: 13, typeRoutine: "course", sport: COURSE }), { mode: "seance" });
  assert.deepEqual(departDuRecap({ ...suiviLa, suiviDisponible: false, sport: COURSE }), { mode: "seance" });
});

test("chaque sport du catalogue a un seul écran de lancement, le noir : suivi pour le suivi GPS, séance au chrono pour la force", () => {
  assert.ok(SPORTS_RANGES.length > 20);
  for (const id of SPORTS_RANGES) {
    const sport = id.startsWith("cat:") ? id : `cat:${id}`;
    const d = departDuRecap({ ...suiviLa, sport });
    assert.equal(d.mode, genreSport(sport) === "muscu" ? "seance" : "suivi", sport);
    if (d.mode === "suivi") assert.equal(d.sport, sport);
  }
});

test("le GPS seulement pour les sports qui s'y prêtent : dehors, pas sur tapis ni en récupération ; la FC partout sauf en récupération", () => {
  assert.deepEqual(capteursDepart("cat:course", false), { segment: true, gps: true, fc: true });
  assert.deepEqual(capteursDepart("cat:course", true), { segment: true, gps: false, fc: true });
  assert.equal(capteursDepart("cat:bicycling", true).gps, false);
  assert.equal(capteursDepart("cat:randonnee", false).gps, true);
  assert.equal(capteursDepart("cat:musculation", false).gps, false);
  assert.equal(capteursDepart("cat:musculation", false).segment, false);
});

test("Extérieur / Intérieur (07/11) : le segmenté seulement où un GPS a du sens, absent quand l'intérieur est impossible (jamais grisé)", () => {
  // course, marche, vélo : les deux choix ; natation : Piscine / Eau libre
  for (const s of ["cat:course", "cat:marche", "cat:bicycling", "cat:natation"]) {
    assert.equal(segmentDepart(s), true, s);
    assert.equal(interieurPossible(s), true, s);
    assert.equal(exterieurSeul(s), false, s);
  }
  // rando, VTT, ski de fond, kayak… : pas de segmenté (le choix n'existe pas, on ne le grise pas)
  for (const s of ["cat:randonnee", "cat:vtt", "cat:ski-de-fond", "cat:kayak", "cat:triathlon"]) {
    assert.equal(segmentDepart(s), false, s);
    assert.equal(interieurPossible(s), false, s);
    assert.equal(exterieurSeul(s), true, s);
  }
  // musculation, sports et cours, récupération : pas de segmenté du tout
  for (const s of ["cat:musculation", "cat:cross-training", "cat:padel", "cat:hiit", "cat:yoga", "cat:sauna"]) {
    assert.equal(segmentDepart(s), false, s);
    assert.equal(lieuxDepart(s), null, s);
  }
  // sur tout le catalogue : un segmenté ⇒ un sport du dehors ou à deux lieux ; un segmenté ⇒ l'intérieur est possible
  for (const id of SPORTS_RANGES) {
    const sport = `cat:${id}`;
    assert.equal(segmentDepart(sport), interieurPossible(sport), sport);
    assert.equal(lieuxDepart(sport) != null, segmentDepart(sport), sport);
    assert.equal(exterieurSeul(sport), familleDe(sport) === "dehors" && !interieurPossible(sport), sport);
  }
  // les libellés : « Extérieur » / « Intérieur », « Outdoor » / « Indoor » en anglais
  assert.deepEqual(lieuxDepart("cat:course"), ["Extérieur", "Intérieur"]);
  assert.equal(fr["gps.exterieur"], "Extérieur");
  assert.equal(en["gps.exterieur"], "Outdoor");
  assert.equal(en["gps.interieur"], "Indoor");
  // le segmenté grisé : l'écran le passe `desactive`, et Segmente le grise sans le rendre touchable
  assert.match(src("ecrans/SuiviDepart.tsx"), /vus\.segment && interieurPossible\(sport\.id\)/);
  assert.doesNotMatch(src("ecrans/SuiviDepart.tsx"), /desactive=\{!interieurPossible/);
  assert.match(src("ecrans/SuiviDepart.tsx"), /valeur=\{interieur \? "tapis" : "dehors"\}/);
  assert.match(src("ui/Segmente.tsx"), /disabled=\{desactive \|\| o\.desactive\}/);
  assert.equal(/Dehors|Tapis/.test(fr["gps.exterieur"] + fr["gps.interieur"]), false);
});

// ——— Structure : un seul écran de lancement ———

/** Les fichiers sources de l'appli (hors dictionnaires). */
function sources(dir = new URL("../src/", import.meta.url).pathname): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

test("un seul écran de lancement : seul commencer.ts pousse /suivi/depart, le récap héberge l'écran noir pour toute séance, sans halo", () => {
  // Le labo de recette des circuits (drapeau laboCircuits, éteint dans le dépôt) ouvre le départ sans le garde : un suivi natif d'un passage
  // précédent poserait sa feuille « séance en cours » sur la capture.
  const poussent = sources().filter((f) => !f.includes("/src/app/labo/") && /pathname: "\/suivi\/depart"/.test(readFileSync(f, "utf8")));
  assert.deepEqual(poussent.map((f) => f.split("/src/")[1]), ["ecrans/commencer.ts"]);
  const commencer = src("ecrans/commencer.ts");
  assert.equal(/retirer: String\(retirer\)/.test(commencer), false, "plus de récap empilé sous le départ");
  const recap = src("ecrans/recap/EcranRecap.tsx");
  assert.match(recap, /import \{ SuiviDepart \} from "\.\.\/SuiviDepart"/);
  assert.match(recap, /departDuRecap\(/);
  assert.match(recap, /<SuiviDepart[\s\S]*seance=\{seance\}[\s\S]*onMenu=\{onMenu\}/);
  // plus de récap à halo avant une séance : ni gabarit, ni fond d'aura, ni l'ancien récap de musculation
  assert.equal(/GabaritRecap|GroupeRecap|AuraFond|RecapSeance|CapteursRecap/.test(recap), false, "le récap à halo n'existe plus");
  // l'écran de départ est celui de SuiviDepart : fond noir, pas le halo
  assert.equal(/AuraFond|GabaritRecap/.test(src("ecrans/SuiviDepart.tsx")), false);
  assert.equal(/AuraFond|GabaritRecap/.test(src("ecrans/recap/CarteSeance.tsx")), false);
  assert.equal(/dessous/.test(src("ecrans/SuiviDepart.tsx")), false);
  // une séance prévue montre sa date ; un lancement maintenant ne dit pas « Aujourd'hui »
  assert.match(recap, /quandDepart\(/);
});

test("la ligne sous le titre : la date d'une séance prévue, jamais « Aujourd'hui » pour un lancement maintenant", () => {
  const jourTexte = (j: string) => (j === "2026-11-05" ? "Jeu. 5 nov." : j);
  const heureTexte = (h: string) => h;
  const auj = "2026-11-04";
  // séance prévue : jour et heure, sans durée (texte minimal)
  assert.equal(quandDepart({ prevue: true, jour: "2026-11-05", heure: "18:00" }, auj, jourTexte, heureTexte), "Jeu. 5 nov., 18:00");
  assert.equal(quandDepart({ prevue: true, jour: auj, heure: null }, auj, jourTexte, heureTexte), "Aujourd'hui", "une séance prévue aujourd'hui le dit");
  // lancement maintenant : rien
  assert.equal(quandDepart({ prevue: false, jour: auj, heure: null }, auj, jourTexte, heureTexte), null);
});

test("la carte de la séance : ses exercices, son programme ; un sport seul ou une séance libre n'a ni l'un ni l'autre", () => {
  const ligne = (nom: string) => ({ id: nom, exercice: { nom } });
  const tiroir = (genre: string, lien: unknown, lignes = 2) => ({ genre, lien, routine: { blocs: [{ lignes: Array.from({ length: lignes }, (_, i) => ligne(`e${i}`)) }] } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seance = (routineId: string | null, t: any) => ({ routineId, tiroir: t });
  assert.equal(exercicesDe(seance("r1", tiroir("routine", null))).length, 2);
  assert.equal(exercicesDe(seance(null, null)).length, 0, "un sport seul n'a aucun exercice");
  assert.equal(exercicesDe(seance("r1", tiroir("routine", null, 0))).length, 0, "une routine vide non plus");
  const lien = { avancement: { semaine: 2 } };
  assert.equal(aUnProgramme(seance("r1", tiroir("programme", lien))), true);
  assert.equal(aUnProgramme(seance("r1", tiroir("horsProgramme", lien))), true);
  assert.equal(aUnProgramme(seance("r1", tiroir("routine", null))), false, "une routine à soi n'a pas de ligne Programme");
  assert.equal(aUnProgramme(seance(null, null)), false);
  // la carte : programme (nom, semaine, séance), séance (nom, nombre d'exercices) ou « Séance libre » ; composants des réglages
  const carte = src("ecrans/recap/CarteSeance.tsx");
  assert.match(carte, /<GroupeReglages>/);
  assert.match(carte, /<LigneReglage[\s\S]*libelle=\{programme\.lien\.nom\}/);
  assert.match(carte, /libelle=\{n > 0 \? r\.nom : t\("accueil\.lanceur\.seanceLibre"\)\}/);
  assert.match(carte, /tp\("tiroirs\.exercices", n\)/);
  assert.equal(/AuraFond|GabaritRecap|GroupeRecap/.test(carte), false);
  assert.equal(fr_accueil["accueil.lanceur.seanceLibre"], "Séance libre");
  assert.ok(en_accueil["accueil.lanceur.seanceLibre"]);
  // sur l'écran noir : sous le titre du sport, pas de nom de séance en titre, ni liste d'exercices, ni rappel
  const depart = src("ecrans/SuiviDepart.tsx");
  assert.match(depart, /<CarteSeance r=\{seance\} \/>/);
  assert.match(depart, /\{routine\?\.nom \?\? sport\.nom\}/);
});

test("la musculation règle son capteur et l'écran allumé sur l'écran noir avant de démarrer ; l'interrupteur global reste", () => {
  const depart = src("ecrans/SuiviDepart.tsx");
  // séance d'exercices : jamais de GPS ni de segment Extérieur / Intérieur, la FC en direct, l'écran allumé de la séance (réglage global)
  assert.match(depart, /seance \? \{ segment: false, gps: false, fc: suivi\.disponible \} : capteursDepart\(sport\.id, tapis\)/);
  assert.match(depart, /useCapteursDepart\(\{ gps: vus\.gps, fc: vus\.fc, ecran: seance \? "seance" : "suivi", demander: !seance,/);
  assert.match(depart, /\{vus\.fc \|\| seance \? \(/, "la section Capteurs reste, même sans module de suivi : l'écran allumé");
  // Démarrer : le capteur retenu est mémorisé, puis le geste du récap (séance vide, routine, programme) ; le garde est dans le geste
  assert.match(depart, /await capteurs\.memoriser\(\);\s*await demarrerDepuisRecap\(db, \{ \.\.\.s, lieu: /);
  assert.match(depart, /if \(seance\) \{[\s\S]*await lancerSeance\(seance\)/);
  // le lieu : choisi ici, pas celui du récap ; la pile : le geste retire l'écran de lancement (Back revient à l'origine)
  assert.match(src("ecrans/recap/gestes-recap.ts"), /commencer\(db, r\.routineId, salleId, undefined, 1\)/);
  assert.match(src("ecrans/recap/gestes-recap.ts"), /demarrerSport\(db, sport, \{ salleId, tapis: o\.tapis === true, retirer: 1 \}\)/);
  const hook = src("ecrans/useCapteursDepart.ts");
  assert.match(hook, /regler\(\{ ecranAllume: v \}\)/, "l'écran allumé de la séance est le réglage global");
  assert.match(hook, /ecrireFcDirecte\(db, v\)/, "la FC : le même réglage que Appareils et connexions");
  assert.match(src("app/settings/connexions.tsx"), /ecrireFcDirecte/);
  assert.match(src("ecrans/fc-muscu.ts"), /lireFcAppareil\(db\)/);
  assert.match(src("ecrans/fc-muscu.ts"), /suivi\.demarrer\(\{ mode: "muscu", fc: true, appareil,/);
});

test("une seule section Capteurs : le départ d'un sport et celui d'une séance de musculation partagent le même composant et le même hook", () => {
  const depart = src("ecrans/SuiviDepart.tsx");
  assert.match(depart, /<SectionCapteurs c=\{capteurs\} gps=\{vus\.gps\} fc=\{vus\.fc\} recette=\{recette\} \/>/);
  const section = src("ecrans/SectionCapteurs.tsx");
  // zones de clic de 44 px, pas de sélecteur natif, pas de point médian
  assert.match(section, /tonal: \{ height: 44,/);
  // carte étroite seulement : le départ noir garde le bouton à droite (pas de changement de l'écran choisi par Alex)
  assert.match(section, /const dessous = sous && !!c\.action && !!c\.interrupteur;/);
  assert.equal(/<SectionCapteurs[^>]*etroit/.test(depart), false);
  assert.equal(/<SectionCapteurs[^>]*etroit/.test(src("ecrans/recap/EcranRecap.tsx")), false, "plus de carte étroite : l'écran noir seul");
  assert.equal(/<Picker|<select|·/.test(section + src("ecrans/recap/CarteSeance.tsx")), false);
  assert.equal(/<Picker|<select/.test(depart), false);
  // un seul capteur par séance : le choix passe par une feuille, jamais par plusieurs lignes actives
  assert.match(section, /<Option[\s\S]*choisi=\{a\.adresse === retenu\}/);
});
