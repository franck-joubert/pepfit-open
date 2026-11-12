// Données de la page Fibres (planche fibres-page validée) : les repas d'un an et un mois en une seule lecture, d'où l'on tire les
// fibres de chaque jour (rien n'est stocké : valeur pour 100 g × quantité), les réglages, le palier de +5 g et les conseils du
// jour. Un jour sans repas n'est pas dans `jours` ; un jour dont aucun aliment n'a de fibres connues n'a pas de donnée non plus
// (fibresConnues). Les clés des tables sont les minuits locaux, comme sur les autres pages de mesure.
import { lireReglagesFibresEau, type ReglagesFibresEau } from "../../db/depots/fibres-eau";
import { consommationsEntre, listerRepas, type Consommation, type Repas } from "../../db/depots/nutrition";
import type { Executeur } from "../../db/executeur";
import { CONSEILS_PAGE, conseilsDuJour, fibresDuJour, PALIER, palierFibres, type Echange, type FibresDuJour } from "../../nutrition/fibres-eau";
import { instantDe, jourDe } from "../planif-donnees";
import { fibresConnues } from "./fibres-calc";
import { decaler, minuit } from "./periodes";

/** Historique lu : un an et un mois (l'année glissante et la période d'avant du mois), comme la page Pas. */
export const JOURS_HISTORIQUE = 400;

export interface DonneesFibres {
  maintenant: number;
  reglages: ReglagesFibresEau;
  /** Fibres de chaque jour qui a des repas (minuit → valeur), même quand aucun aliment n'a de fibres connues (fibresConnues le dit). */
  jours: Map<number, FibresDuJour>;
  /** Lignes du journal de chaque jour (minuit), pour la liste du jour et « les plus riches ». */
  lignes: Map<number, Consommation[]>;
  /** Repas, éteints compris : le nom du repas d'une ligne d'un jour passé. */
  repas: Repas[];
  /** Premier jour avec des fibres connues, null sans aucun. */
  premier: number | null;
  /** Objectif suivant proposé (aujourd'hui), null sinon : conseils coupés, objectif déjà au repère, deux semaines pas tenues, report. */
  palier: number | null;
  /** Les conseils d'aujourd'hui (la carte du Journal en montre le premier) ; vide quand le suivi ou les conseils sont coupés. */
  conseils: Echange[];
}

export async function lireDonneesFibres(db: Executeur, maintenant: number = Date.now()): Promise<DonneesFibres> {
  const auj = minuit(maintenant);
  const aujourdhui = jourDe(auj);
  const reglages = await lireReglagesFibresEau(db);
  const [brut, repas] = await Promise.all([consommationsEntre(db, jourDe(decaler(auj, -JOURS_HISTORIQUE)), aujourdhui), listerRepas(db, true)]);
  const jours = new Map<number, FibresDuJour>();
  const lignes = new Map<number, Consommation[]>();
  let premier: number | null = null;
  for (const [date, l] of brut) {
    const jour = minuit(instantDe(date, "12:00"));
    const f = fibresDuJour(l);
    lignes.set(jour, l);
    jours.set(jour, f);
    if (fibresConnues(f) != null && (premier == null || jour < premier)) premier = jour;
  }
  let palier: number | null = null;
  let conseils: Echange[] = [];
  if (reglages.fibresSuivi && reglages.astuce) {
    // les 14 jours qui précèdent (la série du palier) et les 7 derniers jours (les légumineuses du conseil), comme le Journal
    const precedents = Array.from({ length: PALIER.jours }, (_, i) => jours.get(decaler(auj, -PALIER.jours + i)) ?? null);
    palier = palierFibres({ objectifG: reglages.fibresObjectifG, jours: precedents, aujourdhui, reporteJusqua: reglages.palierReporte });
    const duJour = lignes.get(auj) ?? [];
    const semaine = Array.from({ length: 7 }, (_, i) => lignes.get(decaler(auj, -6 + i)) ?? []).flat();
    conseils = conseilsDuJour({ date: aujourdhui, jour: duJour, semaine, n: CONSEILS_PAGE });
  }
  return { maintenant, reglages, jours, lignes, repas, premier, palier, conseils };
}
