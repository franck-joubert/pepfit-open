// Inventaire des réglages (planche menu, B validée le 01/11 ; planches/menu/NOTES.md § 3 et § 9) : chaque réglage, où il vit
// (« Sport › Repos ») et la route qui l'ouvre. Source unique de la recherche de la page Réglages et de
// tests/menu-inventaire.test.ts (chaque entrée de l'ancien menu y a une place, chaque ancienne route mène quelque part).
// Sans React Native : les libellés sont des clés, traduites par l'écran.

import type { Cle } from "../../i18n/fr";

export type EntreeReglage = {
  id: string;
  libelle: Cle;
  /** Où le réglage vit, du plus large au plus précis : ["ui.onglet.entrainement", "menu.repos"] → « Sport › Repos ». */
  ou: Cle[];
  /** Route qui l'ouvre. « /settings#x » : une ligne de la page Réglages elle-même (feuille, interrupteur). */
  route: string;
  /** Visible seulement avec ce drapeau (drapeaux.ts). */
  drapeau?: "connexionIA";
  /** Autres mots qui le trouvent (« Google Agenda » pour l'agenda), séparés par des virgules. */
  motsCles?: Cle;
};

const NUTRITION: Cle = "ui.onglet.nutrition";
const SPORT: Cle = "ui.onglet.entrainement";
const SANTE: Cle = "ui.onglet.sante";
const REGLAGES: Cle = "menu.reglages";
const MOI: Cle[] = [REGLAGES, "menu.moi"];
const CORPS: Cle[] = [...MOI, "menu.corps"];
const APPAREILS: Cle[] = [REGLAGES, "menu.appareils"];
const DONNEES: Cle[] = [REGLAGES, "reglages.donneesConfidentialite"];
const SAUVEGARDE: Cle[] = [...DONNEES, "reglages.sauvegarde"];
const PREFERENCES: Cle[] = [REGLAGES, "reglages.preferences"];
const REGION: Cle[] = [...PREFERENCES, "menu.langueRegion"];

/** Routes des réglages d'une partie, en page pleine (depuis Réglages › Par partie, D21). */
export const ROUTE_PARTIE = { nutrition: "/settings/partie/nutrition", sport: "/settings/partie/sport", sante: "/settings/partie/sante" } as const;
export type PartieReglee = keyof typeof ROUTE_PARTIE;

export const REGLAGES_INVENTAIRE: EntreeReglage[] = [
  // Accueil (D18 : pas de curseurs dans son en-tête ; « Personnaliser les cartes » en bas de l'accueil)
  { id: "cartes-accueil", libelle: "menu.cartesAccueil", ou: ["ui.onglet.accueil"], route: "/?modifier=1" },
  // Nutrition › curseurs
  { id: "objectifs", libelle: "nutrition.objectifs", ou: [NUTRITION], route: "/nutrition/objectifs" },
  { id: "repas", libelle: "nutrition.repasHoraires", ou: [NUTRITION], route: "/nutrition/repas" },
  { id: "rappel-repas", libelle: "nutrition.rappelRepas", ou: [NUTRITION, "nutrition.repasHoraires"], route: ROUTE_PARTIE.nutrition },
  // Sport › curseurs › Page du jour (planche Effort v2.2, D9)
  { id: "afficher-sommeil", libelle: "effortJour.afficherSommeil", ou: [SPORT, "effortJour.pageDuJour"], route: ROUTE_PARTIE.sport, motsCles: "effortJour.motsCles" },
  // Sport › curseurs › Séance
  { id: "repos-defaut", libelle: "profil.reposDefaut", ou: [SPORT, "menu.repos"], route: "/settings/repos" },
  { id: "fin-repos", libelle: "profil.finRepos", ou: [SPORT, "menu.repos"], route: "/settings/repos" },
  { id: "son-repos", libelle: "profil.son", ou: [SPORT, "menu.repos"], route: "/settings/repos" },
  { id: "pictos-manquants", libelle: "reglages.manques.titre", ou: [SPORT], route: "/settings/exercices-sans-picto" },
  { id: "guidage", libelle: "reglages.guidage.titre", ou: [SPORT, "profil.seance"], route: "/settings/guidage" },
  { id: "ecran-allume", libelle: "profil.ecranAllume", ou: [SPORT, "profil.seance"], route: ROUTE_PARTIE.sport },
  { id: "un-rm", libelle: "profil.unRm", ou: [SPORT, "profil.seance"], route: ROUTE_PARTIE.sport },
  { id: "demander-effort", libelle: "profil.demanderEffort", ou: [SPORT, "profil.seance"], route: ROUTE_PARTIE.sport },
  // Sport › curseurs › Rappels et détection
  { id: "rappel", libelle: "menu.rappel", ou: [SPORT, "menu.rappelsDetection"], route: "/settings/rappel" },
  { id: "heure-seances", libelle: "reglages.heureSeances", ou: [SPORT, "menu.rappel"], route: "/settings/rappel" },
  { id: "reconnaissance", libelle: "reco.titre", ou: [SPORT, "menu.rappelsDetection"], route: "/settings/reconnaissance" },
  { id: "batterie", libelle: "reglages.batterie", ou: [SPORT, "menu.rappelsDetection"], route: ROUTE_PARTIE.sport },
  // Sport › curseurs › Agenda (planche agenda-ics, 1x et 3x) : l'agenda du téléphone ; les agendas se choisissent une fois connecté
  { id: "agenda", libelle: "agenda.titre", ou: [SPORT], route: "/settings/agenda", motsCles: "agenda.recherche" },
  { id: "agenda-agendas", libelle: "agenda.agendas.titre", ou: [SPORT, "agenda.titre"], route: "/settings/agenda", motsCles: "agenda.recherche" },
  // Titre des séances écrites (ajustements du 03/11) : sur la page Agenda, une fois connecté
  { id: "agenda-emoji", libelle: "agenda.ecrit.emoji", ou: [SPORT, "agenda.titre"], route: "/settings/agenda", motsCles: "agenda.ecrit.recherche" },
  { id: "agenda-format", libelle: "agenda.ecrit.format", ou: [SPORT, "agenda.titre"], route: "/settings/agenda", motsCles: "agenda.ecrit.recherche" },
  { id: "agenda-reecrire", libelle: "agenda.reecrire.titre", ou: [SPORT, "agenda.titre"], route: "/settings/agenda", motsCles: "agenda.reecrire.recherche" },
  { id: "agenda-deconnecter", libelle: "agenda.deconnecter", ou: [SPORT, "agenda.titre"], route: "/settings/agenda" },
  // Santé › curseurs (D14) ; les rappels de sieste viendront ici (docs/CODE-MENU.md)
  { id: "zones", libelle: "zones.titre", ou: [SANTE], route: "/settings/zones" },
  { id: "metabolisme", libelle: "sante.methodeMetabolisme", ou: [SANTE], route: "/sante/metabolisme" },
  // Suivi du cycle (planche cycle, écran 9) : sa page, et ce qu'on y cherche le plus
  { id: "cycle", libelle: "cycle.reglages.titre", ou: [SANTE], route: "/settings/cycle" },
  { id: "suivre-cycle", libelle: "cycle.reglages.suivre", ou: [SANTE, "cycle.reglages.titre"], route: "/settings/cycle" },
  { id: "effacer-cycle", libelle: "cycle.reglages.effacer", ou: [SANTE, "cycle.reglages.titre"], route: "/settings/cycle" },
  // Sommeil : rappel de coucher, voyage, heure des séances en voyage (planche sommeil, c3 et c4 ; docs/CODE-HEURE-VOYAGE.md)
  { id: "rappel-coucher", libelle: "heureVoyage.rappel", ou: [SANTE], route: "/sante/rappel-coucher", motsCles: "heureVoyage.motsRappel" },
  { id: "voyage", libelle: "heureVoyage.voyage", ou: [SANTE], route: "/sante/voyage", motsCles: "heureVoyage.motsVoyage" },
  { id: "seances-voyage", libelle: "heureVoyage.seancesVoyage", ou: [SANTE, "heureVoyage.rappel"], route: "/sante/rappel-coucher", motsCles: "heureVoyage.motsSeances" },
  // Réglages › Moi
  { id: "corps", libelle: "menu.corps", ou: MOI, route: "/settings/corps" },
  { id: "prenom", libelle: "profil.prenom", ou: CORPS, route: "/settings/corps" },
  { id: "sexe", libelle: "corps.sexe", ou: CORPS, route: "/settings/corps" },
  { id: "naissance", libelle: "corps.naissance", ou: CORPS, route: "/settings/corps" },
  { id: "taille", libelle: "corps.taille", ou: CORPS, route: "/settings/corps" },
  { id: "personnage", libelle: "profil.personnage", ou: MOI, route: "/settings#personnage", motsCles: "profil.personnageRecherche" },
  // Réglages › Par partie (D20)
  { id: "onglets", libelle: "menu.onglets", ou: [REGLAGES, "menu.parPartie"], route: "/settings#onglets" },
  // Réglages › Appareils et connexions (D15)
  { id: "sante-connect", libelle: "reglages.santeConnect", ou: APPAREILS, route: "/settings/connexions" },
  { id: "historique-sante", libelle: "reglages.historiqueSante", ou: [...APPAREILS, "reglages.santeConnect"], route: "/settings/connexions" },
  { id: "withings", libelle: "reglages.withings", ou: APPAREILS, route: "/settings/connexions" },
  { id: "whoop", libelle: "reglages.whoop", ou: APPAREILS, route: "/settings/connexions" },
  { id: "importer", libelle: "reglages.importer", ou: APPAREILS, route: "/settings/connexions" },
  { id: "hevy", libelle: "reglages.hevy", ou: [...APPAREILS, "reglages.importer"], route: "/settings/connexions" },
  // Réglages › Données et confidentialité ; « Améliorer la précision de pepfit » y reste (calibration, sans-whoop)
  { id: "sauvegarde", libelle: "reglages.sauvegarde", ou: DONNEES, route: "/settings/data" },
  { id: "sauvegarder", libelle: "reglages.sauvegarderMaintenant", ou: SAUVEGARDE, route: "/settings/data" },
  { id: "emplacement", libelle: "reglages.emplacement", ou: SAUVEGARDE, route: "/settings/data" },
  { id: "automatique", libelle: "reglages.automatique", ou: SAUVEGARDE, route: "/settings/data" },
  { id: "garder", libelle: "reglages.garder", ou: SAUVEGARDE, route: "/settings/data" },
  { id: "lisible", libelle: "reglages.sauvegardeLisible", ou: SAUVEGARDE, route: "/settings/data" },
  { id: "restaurer", libelle: "reglages.restaurer", ou: SAUVEGARDE, route: "/settings/data" },
  { id: "phrase", libelle: "compte.phrase", ou: SAUVEGARDE, route: "/settings/phrase" },
  { id: "exporter", libelle: "compte.exporter", ou: DONNEES, route: "/settings#exporter" },
  { id: "precision-commune", libelle: "profil.statsCommunes", ou: DONNEES, route: "/settings#precision" },
  { id: "politique", libelle: "reglages.politique", ou: DONNEES, route: "/settings#politique" },
  // Réglages › Préférences
  { id: "apparence", libelle: "profil.apparence", ou: PREFERENCES, route: "/settings#apparence" },
  { id: "langue-region", libelle: "menu.langueRegion", ou: PREFERENCES, route: "/settings/region" },
  { id: "langue", libelle: "region.langue", ou: REGION, route: "/settings/region" },
  { id: "fuseau", libelle: "region.fuseau", ou: REGION, route: "/settings/region" },
  { id: "poids", libelle: "region.poids", ou: REGION, route: "/settings/region" },
  { id: "distance", libelle: "region.distance", ou: REGION, route: "/settings/region" },
  // Verrou d'ouverture (planche compte-connexion, H3) : sous Langue et région
  { id: "verrou", libelle: "verrou.titre", ou: PREFERENCES, route: "/settings/verrou" },
  { id: "verrou-delai", libelle: "verrou.reverrouille", ou: [...PREFERENCES, "verrou.titre"], route: "/settings/verrou" },
  // Réglages › Aide, puis tout en bas
  { id: "aide", libelle: "aide.titre", ou: [REGLAGES, "menu.aide"], route: "/settings/aide", motsCles: "aide.recherche" },
  // Crédits des données (planche Circuits, lot G) : la page dit d'où viennent les circuits et les cartes
  { id: "credits", libelle: "circuit.credits.ligne", ou: [REGLAGES, "menu.aide"], route: "/settings/aide/credits", motsCles: "circuit.credits.mots" },
  { id: "rejouer", libelle: "parcours.rejouer", ou: [REGLAGES, "menu.aide"], route: "/welcome?rejouer=1" },
  { id: "effacer", libelle: "reglages.effacer", ou: [REGLAGES], route: "/settings#effacer" },
];

/** Le volet court (B, allégé le 05/11) : précision, suivi, puis Réglages. Ce n'est pas de la recherche, mais l'inventaire. */
export const VOLET: { id: string; route: string }[] = [
  { id: "precision", route: "/profil/precision" },
  { id: "mensurations", route: "/sante/poids?section=tours" },
  { id: "aliments", route: "/nutrition/aliments" },
  { id: "plats", route: "/nutrition/plats" },
  { id: "lieux", route: "/gyms" },
  { id: "reglages", route: "/settings" },
];

/** Routes du menu du 31/10 (NOTES § 1) : toutes doivent mener quelque part ; celles qui redirigent sont dans ANCIENNES_ROUTES. */
export const ROUTES_ANCIEN_MENU = [
  "/profil/precision", "/history", "/sante/poids?section=tours", "/nutrition/aliments", "/nutrition/plats", "/gyms",
  "/settings/preferences", "/settings/connexions", "/settings/data", "/settings/guidage", "/settings/zones", "/settings/reconnaissance",
  "/settings/region", "/settings/workout", "/nutrition/objectifs", "/nutrition/repas",
  "/sante/metabolisme", "/welcome?rejouer=1",
];

/** Anciennes adresses devenues des redirections (liens pepfitopen://, notifications, écrans qui y menaient) → nouvelle adresse. */
export const ANCIENNES_ROUTES: Record<string, string> = {
  "/settings/preferences": "/settings",
  "/settings/workout": ROUTE_PARTIE.sport,
};

/** Minuscules sans accents, pour chercher « reperes » comme « repères ». */
export const normaliser = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Chemin lisible d'une entrée : « Sport › Repos ». */
export const chemin = (e: EntreeReglage, tr: (c: Cle) => string) => e.ou.map(tr).join(" › ");

/** Valeurs affichées des réglages, par id d'entrée (« poids » → ["kg"], « heure-seances » → ["18:00"]), fournies par l'écran. */
export type ValeursReglages = Partial<Record<string, string[]>>;

/** Nom long des unités affichées en abrégé : « kilogrammes » trouve « kg ». */
const NOM_UNITE: Record<string, Cle> = { kg: "region.kg", lbs: "region.lbs", km: "region.km", mi: "region.mi" };

/** Ce qu'une valeur affichée laisse chercher : elle-même, « 18 h » pour « 18:00 » (« 18 h 30 » pour « 18:30 »), le nom long de ses unités. */
export function formesValeur(v: string, tr: (c: Cle) => string): string[] {
  const formes = [v];
  const heures = v.replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h: string, m: string) => `${Number(h)} h${m === "00" ? "" : ` ${m}`}`);
  if (heures !== v) formes.push(heures);
  for (const m of v.split(/[\s·,]+/)) {
    const u = NOM_UNITE[m.toLowerCase()];
    if (u) formes.push(tr(u));
  }
  return formes;
}

/** Minuscules sans accents ni espaces : « 12h » trouve « 12 h ». */
const serre = (s: string) => normaliser(s).replace(/\s+/g, "");

/**
 * Recherche (règle 5 de la planche) : par libellé, puis par valeur affichée (« kilogrammes », « 18 h »), puis par chemin
 * (« repos » trouve aussi ce qui vit dans Repos) ; ce qui commence par le texte cherché vient d'abord. `entrees` : les entrées
 * visibles (drapeaux) ; `valeurs` : ce que chaque ligne affiche en ce moment (rien : la recherche reste par libellé et chemin).
 */
export function chercher(q: string, tr: (c: Cle) => string, entrees: EntreeReglage[] = REGLAGES_INVENTAIRE, valeurs: ValeursReglages = {}): EntreeReglage[] {
  const n = normaliser(q);
  if (!n) return [];
  const ns = serre(q);
  const rang = (e: EntreeReglage) => {
    const l = normaliser(tr(e.libelle));
    if (l.startsWith(n)) return 0;
    if (l.split(/[\s'’-]+/).some((m) => m.startsWith(n))) return 1;
    if (l.includes(n)) return 2;
    if ((valeurs[e.id] ?? []).some((v) => formesValeur(v, tr).some((f) => serre(f).includes(ns)))) return 3;
    if (e.motsCles && normaliser(tr(e.motsCles)).includes(n)) return 3;
    if (normaliser(chemin(e, tr)).includes(n)) return 4;
    return -1;
  };
  return entrees
    .map((e, i) => ({ e, r: rang(e), i }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.e);
}
