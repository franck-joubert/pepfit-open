// Jours qui ont des données de santé (page du mois de Santé, docs/SANTE-CALENDRIER.md ; demande d'Alex du 31/10) : une
// seule requête dans la base (pesées, mesures du corps, tours, jours Whoop, pas des journées), jamais Santé Connect. Les
// lignes sont rangées à leur jour (fuseau de l'appli, comme le semainier) ; un jour garde ses données principales :
// sommeil, VFC, FC au repos, poids, pas, et le nombre des autres mesures. Sans React Native. Tests : tests/sante-jours.test.ts.
import type { Executeur } from "../db/executeur";
import { t, tp } from "../i18n/index";
import { fixe } from "./composition-vue";
import { nombre, versUnite, type Unite } from "./format";
import { instantDe, jourDe } from "./planif-donnees";
import { ajouterJ } from "./planification";
import { dureeSommeil } from "./sante-vue";

export interface JourSante {
  sommeilMin: number | null;
  vfc: number | null;
  fcRepos: number | null;
  /** Dernière pesée du jour (kg). */
  poids: number | null;
  pas: number | null;
  /** Autres mesures du jour (balance, tours…). */
  mesures: number;
}

/** Une ligne de la requête : `t` (instant) ou `j` (AAAA-MM-JJ) date la ligne ; `k` dit ce qu'elle porte. */
export interface LigneSante {
  k: "poids" | "vfc" | "fc" | "mesure" | "whoop" | "journee";
  t: number | null;
  j: string | null;
  a: number | null;
  b: number | null;
  c: number | null;
  d: number | null;
}

/** Ni la taille (saisie du profil), ni la FC max, ni la VMA : ce ne sont pas des données d'un jour. Ni, dans « mensurations »,
 * le tour de dos et le bonnet : ils ne servent qu'au dessin du personnage. */
const HORS_JOUR = "('taille','fc_max','vma_test','vma_course')";

// Une requête pour toute la fenêtre : chaque table ne donne que ses colonnes utiles, bornée par son index de date.
const REQUETE = `
  SELECT 'poids' AS k, date AS t, NULL AS j, kg AS a, NULL AS b, NULL AS c, NULL AS d FROM pesee WHERE date >= ? AND date < ?
  UNION ALL
  SELECT CASE type WHEN 'vfc' THEN 'vfc' WHEN 'fc' THEN 'fc' ELSE 'mesure' END, date, NULL, valeur, NULL, NULL, NULL
    FROM mesure_corps WHERE date >= ? AND date < ? AND type NOT IN ${HORS_JOUR}
  UNION ALL
  SELECT 'mesure', date, NULL, NULL, NULL, NULL, NULL FROM mensurations WHERE date >= ? AND date < ? AND type NOT IN ('taille', 'bonnet', 'tour_dos')
  UNION ALL
  SELECT 'whoop', jour, NULL, sommeil_min, vfc, fc_repos, pas FROM whoop_jour
    WHERE jour >= ? AND jour < ? AND (sommeil_min > 0 OR vfc IS NOT NULL OR fc_repos IS NOT NULL OR pas > 0)
  UNION ALL
  SELECT 'journee', NULL, jour, pas, NULL, NULL, NULL FROM jour_activite WHERE jour >= ? AND jour <= ? AND pas > 0`;

const vide = (): JourSante => ({ sommeilMin: null, vfc: null, fcRepos: null, poids: null, pas: null, mesures: 0 });

/** Les lignes rangées par jour. Whoop prime pour la nuit (sommeil, VFC, FC au repos) ; la dernière pesée du jour ; les pas
 *  des journées (source retenue) avant ceux de Whoop. */
export function resumerJoursSante(lignes: readonly LigneSante[]): Map<string, JourSante> {
  const m = new Map<string, JourSante>();
  const derniere = new Map<string, number>();
  // les lignes des journées (sans instant) d'abord : celles de Whoop ne les remplacent pas
  for (const l of [...lignes].sort((x, y) => (x.t ?? 0) - (y.t ?? 0))) {
    const j = l.j ?? jourDe(l.t!);
    const x = m.get(j) ?? vide();
    m.set(j, x);
    if (l.k === "poids") {
      x.poids = l.a;
      derniere.set(j, l.t!);
    } else if (l.k === "vfc") x.vfc ??= l.a;
    else if (l.k === "fc") x.fcRepos ??= l.a;
    else if (l.k === "mesure") x.mesures++;
    else if (l.k === "journee") x.pas = l.a;
    else {
      if (l.a != null && l.a > 0) x.sommeilMin = l.a;
      if (l.b != null) x.vfc = l.b;
      if (l.c != null) x.fcRepos = l.c;
      if (l.d != null && l.d > 0 && x.pas == null) x.pas = l.d;
    }
  }
  return m;
}

/** Jours avec données de `debut` à `fin` (AAAA-MM-JJ, compris), en une requête. */
export async function lireJoursSante(db: Executeur, debut: string, fin: string): Promise<Map<string, JourSante>> {
  const de = instantDe(debut);
  const a = instantDe(ajouterJ(fin, 1));
  const lignes = await db.getAllAsync<LigneSante>(REQUETE, [de, a, de, a, de, a, de, a, debut, fin]);
  return resumerJoursSante(lignes);
}

/** Premier jour qui a une donnée de santé (borne de la page du mois et de sa liste), null sans donnée. */
export async function premierJourSante(db: Executeur): Promise<string | null> {
  const x = await db.getFirstAsync<{ t: number | null; j: string | null }>(
    `SELECT (SELECT MIN(t) FROM (
        SELECT MIN(date) AS t FROM pesee UNION ALL
        SELECT MIN(date) FROM mesure_corps WHERE type NOT IN ${HORS_JOUR} UNION ALL
        SELECT MIN(date) FROM mensurations WHERE type NOT IN ('taille', 'bonnet', 'tour_dos') UNION ALL
        SELECT MIN(jour) FROM whoop_jour)) AS t,
      (SELECT MIN(jour) FROM jour_activite WHERE pas > 0) AS j`,
    [],
  );
  const l = [x?.t != null ? jourDe(x.t) : null, x?.j ?? null].filter((v): v is string => v != null).sort();
  return l[0] ?? null;
}

/** Une ligne de la vue liste : « 7 h 12 · 54 ms · 52 bpm · 78,4 kg · 8 400 pas » ; sans elles, « 2 mesures ». */
export function ligneJourSante(x: JourSante, unite: Unite): string {
  const l: string[] = [];
  if (x.sommeilMin != null) l.push(dureeSommeil(x.sommeilMin));
  if (x.vfc != null) l.push(`${nombre(x.vfc, 0)} ${t("sante.ms")}`);
  if (x.fcRepos != null) l.push(`${nombre(x.fcRepos, 0)} ${t("sante.bpm")}`);
  if (x.poids != null) l.push(`${fixe(versUnite(x.poids, unite), 1)} ${unite}`);
  if (x.pas != null) l.push(`${nombre(x.pas, 0)} ${t("cartes.pasUnite")}`);
  if (!l.length && x.mesures) l.push(tp("sante.mesuresN", x.mesures));
  return l.join(", ");
}
