import type { EtatSante } from "../natif/sante/types";
import { t } from "../i18n/index";
import { deMurale, parties } from "../i18n/temps";
import { ajouterJours, anneeDe, debutJour, depuisUnite, jourSemaineMois, jourSemaineMoisAnnee, lireNombre, nombre, saisieDecimale, versUnite, type Unite } from "./format";

/** Applis qui déposent le poids dans Santé Connect, telles qu'on les montre (initiales, pas de logo). Un seul connecteur côté code. */
export const SERVICES_SANTE = [
  { nom: "Samsung Health", initiales: "SH", paquet: "com.sec.android.app.shealth" },
  { nom: "Withings", initiales: "W", paquet: "com.withings.wiscale2" },
  { nom: "Fitbit", initiales: "F", paquet: "com.fitbit.FitbitMobile" },
  { nom: "Google Fit", initiales: "GF", paquet: "com.google.android.apps.fitness", remplacee: true },
] as const;

export type EtatService = "reconnu" | "a-autoriser" | "pas-installee" | "remplacee" | "eteint";

export interface LigneService {
  nom: string;
  initiales: string;
  paquet: string;
  etat: EtatService;
  detail: string | null;
}

/** Une ligne par service : reconnu (a déjà déposé une pesée), installé mais muet (à autoriser), absent, ou Google Fit remplacé.
 *  Tant que Santé Connect n'est pas lisible (absent, module manquant), les applis sont éteintes, sans détail. */
export function lignesServices(etat: EtatSante): LigneService[] {
  const lisible = etat.connecteur === "pret" || etat.connecteur === "a-autoriser";
  return SERVICES_SANTE.map((s) => {
    const base = { nom: s.nom, initiales: s.initiales, paquet: s.paquet };
    if ("remplacee" in s) return { ...base, etat: "remplacee", detail: t("accueil.poids.remplacee") };
    if (!lisible) return { ...base, etat: "eteint", detail: null };
    const a = etat.applis.find((x) => x.paquet === s.paquet);
    if (!a?.installee) return { ...base, etat: "pas-installee", detail: t("accueil.poids.pasInstallee") };
    if (a.partage) return { ...base, etat: "reconnu", detail: t("accueil.poids.reconnu") };
    return { ...base, etat: "a-autoriser", detail: t("accueil.poids.nePartagePas") };
  });
}

/** Nom affiché de l'appli d'origine d'une pesée importée. */
export function nomOrigine(paquet: string | null): string {
  return SERVICES_SANTE.find((s) => s.paquet === paquet)?.nom ?? t("accueil.poids.importAuto");
}

/** Années de la roue de date : de 2015 à l'année en cours. */
export function valeursAnnees(maintenant: number): number[] {
  const fin = anneeDe(maintenant);
  return Array.from({ length: fin - 2015 + 1 }, (_, i) => 2015 + i);
}

export const nbJoursMois = (annee: number, mois: number): number => new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();

/** Date d'une pesée saisie à la main : début du jour choisi (elle vaut pour les séances de ce jour-là), jamais dans le futur.
 *  Aujourd'hui garde l'heure actuelle ; `mois` va de 0 à 11, le jour est ramené au dernier du mois (31 févr. → 28 ou 29). */
export function datePesee(jour: number, mois: number, annee: number, maintenant: number): number {
  const j = Math.min(jour, nbJoursMois(annee, mois));
  const debut = deMurale(new Date(annee, mois, j));
  if (debut >= debutJour(maintenant).getTime()) return maintenant;
  return debut;
}

export function decomposer(ms: number): { jour: number; mois: number; annee: number } {
  const p = parties(ms);
  return { jour: p.jour, mois: p.mois, annee: p.an };
}

/** « Aujourd'hui », « Hier », « jeu. 22 oct. » ou « jeu. 22 oct. 2024 » hors de l'année en cours. */
export function jourPesee(ms: number, maintenant: number): string {
  const j = debutJour(ms).getTime();
  if (j === debutJour(maintenant).getTime()) return t("communs.aujourdhui");
  if (j === ajouterJours(maintenant, -1).getTime()) return t("communs.hier");
  return anneeDe(ms) === anneeDe(maintenant) ? jourSemaineMois(ms) : jourSemaineMoisAnnee(ms);
}

/** Poids saisi dans l'unité des réglages (kg ou lbs), rendu en kg ; null s'il est illisible ou hors de 0 à 500 kg. */
export function kgSaisi(texte: string, u: Unite): number | null {
  const v = lireNombre(texte);
  if (v == null) return null;
  const kg = depuisUnite(v, u);
  return kg > 0 && kg <= 500 ? kg : null;
}

/** Champ décimal dans la langue (« 77,4 » en français, « 77.4 » en anglais) : des chiffres et un seul séparateur, relus par
 *  lireNombre ; le clavier du téléphone peut donner le point ou la virgule. */
export function saisieLocale(s: string): string {
  const t = saisieDecimale(s);
  return nombre(0.5, 1).includes(",") ? t.replace(".", ",") : t;
}

/** Une pesée prête à corriger : dans l'unité des réglages, au dixième, sans espace des milliers (« 77,4 », « 170.6 »). */
export function saisiePoids(kg: number, u: Unite): string {
  return saisieLocale((Math.round(versUnite(kg, u) * 10) / 10).toFixed(1));
}
