// Étapes d'une course guidée (planche seance-duree § 3, validée le 29/10) : la séance d'un programme (échauffement,
// fractionné et récupérations, retour au calme) devient une suite d'étapes que le suivi GPS enchaîne seul, à la distance ou
// au temps. Pur : testé par tests/etapes-course.test.ts.
import { t } from "../i18n/index";
import { libelleVitesse, vitesseAffichee } from "./unites";

/** « test » : les 6 min à fond d'un test VMA (planche vma-vo2max) ; sa distance donne la VMA. */
export type GenreEtape = "echauffement" | "effort" | "recup" | "retour" | "test";

export interface Etape {
  genre: GenreEtape;
  /** « 3/6 » pour un effort répété ; null sinon. */
  rang: string | null;
  /** Nom de l'exercice (« Course », « Marche ») : le nom d'un effort seul. */
  nom: string | null;
  /** Cible : distance (m) ou durée (s), l'une des deux ; aucune (exercice sans cible) : on passe avec « Étape ». */
  distanceM: number | null;
  dureeS: number | null;
  zone: number | null;
  /** Rang de la ligne de routine d'origine (regroupe les efforts d'un même bloc dans la feuille des étapes). */
  ligne: number;
  /** Sur tapis (D3 du 29/10) : l'étape à la distance passée au temps, la vitesse visée (km/h) à régler sur la machine. */
  vitesseKmH?: number | null;
}

/** Une ligne de la routine telle que la course guidée la lit : ses séries (cibles) et la récup entre deux séries. */
export interface LigneCourse {
  reposS: number;
  zone: number | null;
  nom?: string | null;
  note?: string | null;
  cibles: { distanceM: number | null; dureeS: number | null }[];
}

/** Ligne de routine telle que la lit lireRoutine (db/depots/routines.ts), réduite à ce qui sert ici. */
interface LigneRoutineLue {
  repos_s: number;
  zone?: number | null;
  exercice: { nom: string };
  notes: readonly { texte: string }[];
  cibles: readonly { duree_s: number | null; distance_m: number | null }[];
}

/** Lignes de course d'une routine : la zone est celle de la ligne, sinon le « Z4 » de sa note (anciens plans). */
export function lignesCourse(r: { blocs: readonly { lignes: readonly LigneRoutineLue[] }[] }): LigneCourse[] {
  return r.blocs.flatMap((b) =>
    b.lignes.map((l) => {
      const note = l.notes[0]?.texte ?? null;
      const zoneNote = Number(/\bZ([1-5])\b/.exec(note ?? "")?.[1] ?? 0);
      return { reposS: l.repos_s, zone: l.zone ?? (zoneNote || null), nom: l.exercice.nom, note, cibles: l.cibles.map((c) => ({ distanceM: c.distance_m, dureeS: c.duree_s })) };
    }),
  );
}

const ECHAUFFEMENT = /échauff|warm/i;
const RETOUR = /retour au calme|cool/i;
/** Test VMA (routine « Test VMA », note du bloc des 6 min) ; récupération seule entre deux blocs (« récupération : … », après le
 *  « Z1, très facile, » que l'ajout depuis la boutique met devant la note). */
const TEST = /test vma|mas test/i;
const RECUP = /(^|[·,])\s*(récup|recover)/i;

/**
 * Étapes d'une routine de course : chaque série devient une étape ; entre deux séries d'une même ligne, la récup de la ligne
 * en est une aussi. Une ligne d'une seule série est l'échauffement ou le retour au calme si sa note le dit (programmes :
 * « échauffement », « retour au calme ») ou, sans note, si elle ouvre ou ferme une séance d'au moins trois lignes ; sinon
 * c'est un effort, au nom de son exercice. Une ligne de plusieurs séries numérote ses efforts (« 3/6 »).
 */
export function etapesDeRoutine(lignes: readonly LigneCourse[]): Etape[] {
  const res: Etape[] = [];
  const dernier = lignes.length - 1;
  lignes.forEach((l, i) => {
    const n = l.cibles.length;
    const note = l.note ?? "";
    const genre: GenreEtape =
      n === 1 && TEST.test(note) ? "test"
      : n === 1 && RECUP.test(note) ? "recup"
      : n === 1 && ECHAUFFEMENT.test(note) ? "echauffement"
      : n === 1 && RETOUR.test(note) ? "retour"
      : n === 1 && lignes.length >= 3 && i === 0 ? "echauffement"
      : n === 1 && lignes.length >= 3 && i === dernier ? "retour"
      : "effort";
    l.cibles.forEach((c, k) => {
      const distanceM = c.distanceM || null;
      res.push({ genre, rang: n > 1 ? `${k + 1}/${n}` : null, nom: l.nom ?? null, distanceM, dureeS: distanceM ? null : c.dureeS || null, zone: l.zone, ligne: i });
      if (k < n - 1 && l.reposS > 0) res.push({ genre: "recup", rang: null, nom: null, distanceM: null, dureeS: l.reposS, zone: 1, ligne: i });
    });
  });
  return res;
}

/** Récupération ajoutée avant de refaire un test arrêté par une pause (D3) : 3 min. */
export const RECUP_RELANCE_S = 180;

/**
 * Test VMA arrêté par une pause (D3, planche vma-vo2max) : après l'étape `r` (le test interrompu, clos par un tour), une
 * récupération de 3 min puis les 6 min de nouveau. `relances` : les étapes interrompues, dans l'ordre (indices dans la suite
 * déjà allongée par les précédentes) ; gardées avec le suivi lancé, elles redonnent la même suite après la mort de l'appli.
 */
export function avecRelances(etapes: readonly Etape[], relances: readonly number[]): Etape[] {
  let l = [...etapes];
  for (const r of relances) {
    const test = l[r];
    if (!test || test.genre !== "test") continue;
    l = [...l.slice(0, r + 1), { genre: "recup", rang: null, nom: null, distanceM: null, dureeS: RECUP_RELANCE_S, zone: 1, ligne: test.ligne }, { ...test }, ...l.slice(r + 1)];
  }
  return l;
}

/**
 * Résultat d'un test VMA : la dernière étape « test » finie et pas interrompue ; sa distance ramenée à 6 min pile (le tour
 * tombe une seconde après la cible au plus). Passée avant 5 min 50 s (« Étape ») : pas de résultat.
 */
export function resultatTest(etapes: readonly Etape[], relances: readonly number[], tours: readonly { s: number; d: number }[]): { distanceM: number; i: number } | null {
  for (let i = etapes.length - 1; i >= 0; i--) {
    if (etapes[i]!.genre !== "test" || relances.includes(i) || tours.length <= i) continue;
    const debut = tours[i - 1] ?? { s: 0, d: 0 };
    const fin = tours[i]!;
    const dureeS = (fin.s - debut.s) / 1000;
    const cible = etapes[i]!.dureeS ?? 360;
    if (dureeS < cible - 10) return null;
    return { distanceM: ((fin.d - debut.d) * cible) / dureeS, i };
  }
  return null;
}

/** Où en est la course : l'étape en cours et ce qui avait été fait (distance, temps) quand elle a commencé. */
export interface EtatGuidage {
  i: number;
  debutM: number;
  debutS: number;
}

export const ETAT_INITIAL: EtatGuidage = { i: 0, debutM: 0, debutS: 0 };

/**
 * L'état se lit sur les tours du suivi : chaque changement d'étape pose un tour (le natif les garde, même si l'appli est
 * tuée), l'étape en cours est donc le nombre de tours et elle a commencé au dernier.
 */
export function etatDesTours(tours: readonly { s: number; d: number }[]): EtatGuidage {
  const der = tours.at(-1);
  return der ? { i: tours.length, debutM: der.d, debutS: der.s / 1000 } : ETAT_INITIAL;
}

/** Fini : plus d'étape (la course continue en suivi libre). */
export const fini = (etapes: readonly Etape[], e: EtatGuidage) => e.i >= etapes.length;

/**
 * Avance d'une ou plusieurs étapes si la cible de l'étape en cours est atteinte (distance ou temps depuis son début).
 * `change` : l'étape a changé (annonce, vibration, tour enregistré).
 */
export function avancer(etapes: readonly Etape[], e: EtatGuidage, distanceM: number, tempsS: number): { etat: EtatGuidage; change: boolean } {
  let x = e;
  while (!fini(etapes, x)) {
    const et = etapes[x.i]!;
    const fait = et.distanceM ? distanceM - x.debutM >= et.distanceM : et.dureeS ? tempsS - x.debutS >= et.dureeS : false;
    if (!fait) break;
    // La suivante commence où la cible tombait (pas au relevé suivant) : le temps et la distance ne glissent pas d'une étape à l'autre.
    const finM = et.distanceM ? x.debutM + et.distanceM : distanceM;
    const finS = et.dureeS ? x.debutS + et.dureeS : tempsS;
    x = { i: x.i + 1, debutM: finM, debutS: finS };
  }
  return { etat: x, change: x.i !== e.i };
}

/** « Étape » : passe à la suivante maintenant (fin de récup avancée). */
export const passer = (e: EtatGuidage, distanceM: number, tempsS: number): EtatGuidage => ({ i: e.i + 1, debutM: distanceM, debutS: tempsS });

/** Ce qui reste de l'étape en cours (m ou s) et la part restante (1 → 0) pour sa jauge ; null sans étape ou sans cible. */
export function resteEtape(etapes: readonly Etape[], e: EtatGuidage, distanceM: number, tempsS: number): { reste: number; unite: "m" | "s"; part: number } | null {
  const et = etapes[e.i];
  if (!et) return null;
  if (et.distanceM) {
    const r = Math.max(0, et.distanceM - (distanceM - e.debutM));
    return { reste: r, unite: "m", part: r / et.distanceM };
  }
  if (!et.dureeS) return null;
  const r = Math.max(0, et.dureeS - (tempsS - e.debutS));
  return { reste: r, unite: "s", part: r / et.dureeS };
}

/** Nom court d'une étape : « Échauffement », « 3/6 », « Récup », « Retour au calme », « Course ». */
export function nomEtape(et: Etape): string {
  if (et.genre === "recup") return t("gps.guide.recup");
  if (et.genre === "echauffement") return t("gps.guide.echauffement");
  if (et.genre === "retour") return t("gps.guide.retour");
  if (et.genre === "test") return t("gps.guide.test");
  return et.rang ?? et.nom ?? t("gps.guide.effort");
}

/** Cible lisible : « 1 km », « 400 m », « 1:30 » ; « » sans cible. */
export function cibleEtape(et: Etape): string {
  if (et.distanceM) return et.distanceM >= 1000 && et.distanceM % 100 === 0 ? `${String(et.distanceM / 1000).replace(".", ",")} km` : `${et.distanceM} m`;
  if (!et.dureeS) return "";
  const s = et.dureeS;
  const duree = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return et.vitesseKmH ? `${duree}, ${vitesseAffichee(et.vitesseKmH)} ${libelleVitesse()}` : duree;
}

/** Allure de référence pour estimer la durée d'une étape à la distance (bande des étapes, fin prévue) : 6'00" au km. */
export const ALLURE_ESTIMEE_S_KM = 360;

/** Durée prévue d'une étape (s) : sa durée, ou sa distance à l'allure de référence ; 60 s pour une étape sans cible. */
export const dureePrevueS = (et: Etape, allureSKm = ALLURE_ESTIMEE_S_KM) => et.dureeS ?? (et.distanceM ? (et.distanceM / 1000) * allureSKm : 60);

/**
 * Part de la VMA visée sur tapis, par zone (repères des allures de vma-calc.ts) : Z1 et Z2 footing, Z3 marathon, Z4 seuil,
 * Z5 fractionné court ; une étape sans zone, comme un footing.
 */
export const PART_VMA_ZONE: Readonly<Record<number, number>> = { 1: 0.6, 2: 0.65, 3: 0.8, 4: 0.875, 5: 1 };

/** Vitesse visée sur tapis (km/h, au dixième comme une machine) : la part de la VMA de la zone ; sans VMA, l'allure de référence. */
export function vitesseTapisKmH(zone: number | null, vmaKmH: number | null): number {
  const v = vmaKmH ? vmaKmH * (PART_VMA_ZONE[zone ?? 2] ?? PART_VMA_ZONE[2]!) : 3600 / ALLURE_ESTIMEE_S_KM;
  return Math.round(v * 10) / 10;
}

/**
 * Course guidée sur tapis (D3 du 29/10, D8 de la planche) : sans GPS, une étape à la distance devient une étape au temps,
 * à la vitesse visée de sa zone (1 km à 12 km/h, 5'00" au km : 5 min). Les étapes au temps ne changent pas.
 */
export function etapesAuTemps(etapes: readonly Etape[], vmaKmH: number | null): Etape[] {
  return etapes.map((et) => {
    if (!et.distanceM) return et;
    const v = vitesseTapisKmH(et.zone, vmaKmH);
    return { ...et, distanceM: null, dureeS: Math.round((et.distanceM / 1000 / v) * 3600), vitesseKmH: v };
  });
}

/** Durée dite par la voix : « 1 minute 30 », « 15 minutes », « 45 secondes ». */
function dureeDite(s: number): string {
  const m = Math.floor(s / 60), r = s % 60;
  if (!m) return t("gps.guide.secondes", { n: r });
  const mn = t(m === 1 ? "gps.guide.minute" : "gps.guide.minutes", { n: m });
  return r ? `${mn} ${r}` : mn;
}

/** Distance dite par la voix : « 1 kilomètre », « 400 mètres ». */
function distanceDite(m: number): string {
  if (m >= 1000 && m % 1000 === 0) return t(m === 1000 ? "gps.guide.kilometre" : "gps.guide.kilometres", { n: m / 1000 });
  return t("gps.guide.metres", { n: m });
}

/** Annonce vocale au début d'une étape (D4) : « Récup, 1 minute 30. », « 3 sur 6, 1 kilomètre en zone 4. ». */
export function annonceEtape(et: Etape | undefined): string {
  if (!et) return t("gps.guide.annonceFin");
  if (et.genre === "test") return t("gps.guide.annonceTest");
  const duree = et.dureeS ? dureeDite(et.dureeS) : "";
  // « 12 kilomètres heure », pas « 12,0 » : la voix dit la décimale seulement quand il y en a une
  const vitesse = et.vitesseKmH ? t(libelleVitesse() === "mph" ? "gps.guide.aMph" : "gps.guide.aKmh", { v: vitesseAffichee(et.vitesseKmH).replace(/[,.]0$/, "") }) : "";
  const cible = et.distanceM ? distanceDite(et.distanceM) : [duree, vitesse].filter(Boolean).join(" ");
  const zone = et.zone && et.genre !== "recup" ? t("gps.guide.enZone", { n: et.zone }) : "";
  const nom = et.genre === "effort" && et.rang ? t("gps.guide.rangDit", { n: et.rang.split("/")[0]!, total: et.rang.split("/")[1]! }) : nomEtape(et);
  const suite = [cible, zone].filter(Boolean).join(" ");
  return suite ? `${nom}, ${suite}.` : `${nom}.`;
}

/**
 * Verdict de la FC face à la zone visée : dans la zone, au-dessus (« ralentis »), en dessous (« accélère »). Au début d'une
 * étape la FC suit avec retard : les 45 premières secondes, au-dessus elle « redescend », en dessous elle « monte ».
 */
export type Verdict = { genre: "zone" | "haut" | "bas" | "redescend" | "monte"; zone: number };
export const DELAI_FC_S = 45;

export function verdictZone(zoneFc: number, visee: number | null, depuisS: number): Verdict | null {
  if (!visee || !zoneFc) return null;
  if (zoneFc === visee) return { genre: "zone", zone: zoneFc };
  if (zoneFc > visee) return { genre: depuisS < DELAI_FC_S ? "redescend" : "haut", zone: zoneFc };
  return { genre: depuisS < DELAI_FC_S ? "monte" : "bas", zone: zoneFc };
}

/** Ligne de la feuille des étapes : une étape, ou les efforts à venir d'un même bloc avec leurs récups (« 4/6 à 6/6 »). */
export interface LigneFeuille {
  /** Index de la première étape de la ligne. */
  i: number;
  etat: "faite" | "en_cours" | "a_venir";
  etape: Etape;
  /** Dernière étape regroupée (efforts à venir d'un bloc) ; null pour une ligne simple. */
  jusqua: Etape | null;
  /** Récup entre les efforts regroupés (s). */
  recupS: number | null;
  /** Durée prévue de la ligne (s). */
  prevueS: number;
}

export function lignesFeuille(etapes: readonly Etape[], courante: number, allureSKm = ALLURE_ESTIMEE_S_KM): LigneFeuille[] {
  const res: LigneFeuille[] = [];
  let i = 0;
  while (i < etapes.length) {
    const et = etapes[i]!;
    const etat = i < courante ? "faite" : i === courante ? "en_cours" : "a_venir";
    // Efforts à venir d'un même bloc (et leurs récups) : une ligne, s'il y en a au moins deux.
    if (etat === "a_venir" && et.genre === "effort" && et.rang) {
      let j = i;
      while (j + 1 < etapes.length && etapes[j + 1]!.ligne === et.ligne) j++;
      const efforts = etapes.slice(i, j + 1).filter((x) => x.genre === "effort");
      if (efforts.length >= 2) {
        const prevueS = etapes.slice(i, j + 1).reduce((a, x) => a + dureePrevueS(x, allureSKm), 0);
        const recup = etapes.slice(i, j + 1).find((x) => x.genre === "recup");
        res.push({ i, etat, etape: et, jusqua: efforts.at(-1)!, recupS: recup?.dureeS ?? null, prevueS });
        i = j + 1;
        continue;
      }
    }
    res.push({ i, etat, etape: et, jusqua: null, recupS: null, prevueS: dureePrevueS(et, allureSKm) });
    i++;
  }
  return res;
}
