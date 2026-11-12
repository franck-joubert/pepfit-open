// La session « Récupérer » en cours (planche recuperer, § 3.2 et 3.8) : démarrer une sieste ou une activité (avec une durée,
// ou libre), l'alarme de fin par le même système que le minuteur de repos (natif/alarme-recup), « Je suis réveillé » qui
// enregistre avec la fin réelle, « Annuler » qui n'enregistre rien, la reprise après l'appli tuée, la saisie après coup et le
// rappel facultatif. La session en cours vit dans un réglage local (ni synchronisé ni sauvegardé : `recup_en_cours`).
// Testé par tests/recuperer-session.test.ts (le module natif y est le repli sans alarme).
import type { Executeur } from "../db/executeur";
import { nouvelId } from "../db/id";
import { lireReglage, ecrireReglage } from "../db/depots/reglages";
import { drapeaux } from "../drapeaux";
import { t } from "../i18n/index";
import { alarmeRecup } from "../natif/alarme-recup";
import { lireAlerteSieste, REGLAGE_ALERTE_SIESTE, siesteVibre, type AlerteSieste } from "./alerte-sieste";
import { hm } from "./mesures/sommeil-stats";
import {
  bilanRappel, doitRappeler, echeance, finOffice, lireEnCours, lireEtatRappel, RECUPERER, type EnCoursRecup, type Ressenti, type TypeRecup,
} from "./recuperer";
import { enregistrerRecup, isoJour, lireRecupEntre, modifierRecup, siestesParJour } from "./recuperer-donnees";
import { arrondiDette, decalerIso } from "./recup-pepfit";
import { attendreMontre } from "./recuperer-releve";
import { lireRecupJour } from "./recup-donnees";

export const REGLAGE_EN_COURS = "recup_en_cours";
export const REGLAGE_RAPPEL = "rappel_sieste";
export const REGLAGE_RAPPEL_HEURE = "rappel_sieste_heure";
/** Labo de la recette (drapeau laboRecuperer) : l'alarme au bout d'une minute. */
export const REGLAGE_LABO_MINUTE = "labo_recup_minute";
const REGLAGE_RAPPEL_ETAT = "recup_rappel_etat";
/** Une alarme passée depuis plus de 30 min sans « Je suis réveillé » : la sieste est enregistrée seule, à l'heure de l'alarme. */
const OUBLI_MS = 30 * 60_000;
const MIN = 60_000;

// ---------------------------------------------------------------- réglages

export interface ReglagesRecup {
  alerte: AlerteSieste;
  /** Le son choisi pour la fin du repos (Réglages › Séance) : le même son pour la sieste. */
  sonUri: string | null;
  rappel: boolean;
  /** Heure du rappel, en minutes depuis minuit (13:30 par défaut). */
  heureRappel: number;
}

let alerteCourante: AlerteSieste = "les-deux";
/** Le réglage d'alarme de la sieste, gardé en mémoire pour le gestionnaire des notifications (appli ouverte). */
export const alerteSiesteCourante = () => ({ mode: alerteCourante, vibre: siesteVibre(alerteCourante) });

export async function lireReglagesRecup(db: Executeur): Promise<ReglagesRecup> {
  const [a, son, r, h] = await Promise.all([
    lireReglage(db, REGLAGE_ALERTE_SIESTE).catch(() => null),
    lireReglage(db, "son_repos_uri").catch(() => null),
    lireReglage(db, REGLAGE_RAPPEL).catch(() => null),
    lireReglage(db, REGLAGE_RAPPEL_HEURE).catch(() => null),
  ]);
  alerteCourante = lireAlerteSieste(a);
  const heure = Number(h);
  return { alerte: alerteCourante, sonUri: son || null, rappel: r === "1", heureRappel: heure >= 0 && heure < 1440 && h ? heure : RECUPERER.rappel.heure };
}

export async function ecrireAlerteSieste(db: Executeur, a: AlerteSieste): Promise<void> {
  alerteCourante = a;
  await ecrireReglage(db, REGLAGE_ALERTE_SIESTE, a);
  // une alarme déjà programmée prend le nouveau canal
  const e = await lireEnCoursRecup(db);
  if (e) await programmerAlarme(db, e);
}

export async function ecrireRappel(db: Executeur, actif: boolean, heure: number | null, maintenant = Date.now()): Promise<void> {
  await ecrireReglage(db, REGLAGE_RAPPEL, actif ? "1" : "0");
  if (heure != null) await ecrireReglage(db, REGLAGE_RAPPEL_HEURE, String(heure));
  await planifierRappel(db, maintenant);
}

// ---------------------------------------------------------------- la session

export async function lireEnCoursRecup(db: Executeur): Promise<EnCoursRecup | null> {
  return lireEnCours(await lireReglage(db, REGLAGE_EN_COURS).catch(() => null));
}

const nomType = (type: TypeRecup) => t(`recuperer.type.${type}` as "recuperer.type.sauna");

async function programmerAlarme(db: Executeur, e: EnCoursRecup): Promise<void> {
  const r = await lireReglagesRecup(db);
  await alarmeRecup.programmer({ fin: e.alarme, sieste: e.type === "sieste", nom: nomType(e.type), alerte: r.alerte, sonUri: r.sonUri }).catch(() => false);
  // une sieste « Libre » : fermée d'office au bout de 3 h, une notification silencieuse le dit
  await alarmeRecup.fermetureLibre(e.type === "sieste" && e.choisi == null ? e.debut + RECUPERER.sieste.libreMax * MIN : null).catch(() => {});
}

/** Démarre une sieste ou une activité : `choisi` en minutes, null en « Libre » (sans alarme). */
export async function demarrerRecup(db: Executeur, o: { type: TypeRecup; choisi: number | null }, maintenant = Date.now()): Promise<EnCoursRecup> {
  const minute = drapeaux.laboRecuperer && o.choisi != null && (await lireReglage(db, REGLAGE_LABO_MINUTE).catch(() => null)) === "1";
  const e: EnCoursRecup = { id: nouvelId(), type: o.type, debut: maintenant, choisi: o.choisi, alarme: minute ? maintenant + MIN : echeance(o.type, maintenant, o.choisi) };
  await ecrireReglage(db, REGLAGE_EN_COURS, JSON.stringify(e));
  await programmerAlarme(db, e);
  // une sieste démarrée : plus de rappel aujourd'hui
  if (o.type === "sieste") await alarmeRecup.rappel(null).catch(() => {});
  return e;
}

/** La fin d'une session : la fin réelle, sauf alarme passée (l'alarme a réveillé) ou sieste libre au-delà de 3 h. */
export function finDe(e: EnCoursRecup, maintenant: number): number {
  if (e.alarme != null && maintenant > e.alarme) return e.alarme;
  return finOffice(e, maintenant) ?? maintenant;
}

export interface FinFc {
  moy: number | null;
  debut: number | null;
  fin: number | null;
}

/** Une session arrêtée avant une minute (lancée par erreur) n'est pas enregistrée, comme « Annuler » (recette du 01/11). */
export const DUREE_MIN_MS = MIN;

/** « Je suis réveillé », « J'ai fini », « Arrêter » : enregistre la session (fin réelle) ; rend son identifiant, null si rien
 *  n'est enregistré (aucune session, ou moins d'une minute). */
export async function terminerRecup(db: Executeur, maintenant = Date.now(), fc?: FinFc | null): Promise<string | null> {
  const e = await lireEnCoursRecup(db);
  if (!e) return null;
  const fin = finDe(e, maintenant);
  if (fin - e.debut < DUREE_MIN_MS) {
    await finir(db);
    return null;
  }
  await enregistrerRecup(
    db,
    {
      id: e.id,
      type: e.type,
      debut: e.debut,
      fin,
      mode: e.choisi != null ? "minuteur" : "libre",
      choisi: e.choisi,
      fcMoy: fc?.moy ?? null,
      fcDebut: fc?.debut ?? null,
      fcFin: fc?.fin ?? null,
    },
    maintenant,
  );
  await finir(db);
  // la mesure de la montre arrive après : relecture différée (recuperer-releve.ts), l'écran de fin le dit en attendant
  if (e.type === "sieste") await attendreMontre(db, e.id, fin).catch((err) => console.error(err));
  return e.id;
}

/** « Annuler la sieste » : rien n'est enregistré, l'alarme est retirée. */
export async function annulerRecup(db: Executeur): Promise<void> {
  await finir(db);
}

async function finir(db: Executeur) {
  await ecrireReglage(db, REGLAGE_EN_COURS, "");
  await alarmeRecup.programmer({ fin: null, sieste: true, nom: "", alerte: alerteCourante, sonUri: null }).catch(() => false);
  await alarmeRecup.fermetureLibre(null).catch(() => {});
}

/**
 * Au lancement et au retour de l'appli : une session oubliée (alarme passée depuis 30 min, sieste libre de plus de 3 h) est
 * enregistrée seule ; rend la session encore en cours, ou l'identifiant de celle qui vient d'être enregistrée.
 */
export async function reprendreRecup(db: Executeur, maintenant = Date.now()): Promise<{ enCours: EnCoursRecup | null; enregistree: string | null }> {
  const e = await lireEnCoursRecup(db);
  if (!e) return { enCours: null, enregistree: null };
  const oubliee = (e.alarme != null && maintenant > e.alarme + OUBLI_MS) || finOffice(e, maintenant) != null;
  if (!oubliee) return { enCours: e, enregistree: null };
  return { enCours: null, enregistree: await terminerRecup(db, maintenant) };
}

/** « C'est déjà fait » : une session notée après coup (début, durée). */
export async function enregistrerApresCoup(db: Executeur, o: { type: TypeRecup; debut: number; minutes: number }, maintenant = Date.now()): Promise<string> {
  return enregistrerRecup(db, { type: o.type, debut: o.debut, fin: o.debut + Math.max(1, o.minutes) * MIN, mode: "apres-coup" }, maintenant);
}

/** « Comment tu te sens ? » (facultatif, D13) ; null l'efface. */
export async function noterRessenti(db: Executeur, id: string, r: Ressenti | null): Promise<void> {
  await modifierRecup(db, id, { ressenti: r });
}

// ---------------------------------------------------------------- la dette du jour

/** « À rattraper » ce matin (recup-pepfit.ts, RECUP version 4 : siestes d'hier comptées), et après les siestes d'aujourd'hui ; null sous le seuil de précision. */
export async function lireDetteDuJour(db: Executeur, maintenant = Date.now()): Promise<{ avant: number; apres: number; siestes: number } | null> {
  const d = new Date(maintenant);
  const auj = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const [r, s] = await Promise.all([lireRecupJour(db, auj), siestesParJour(db, auj, auj)]);
  const dette = r.detail.sommeil.dette;
  if (dette == null) return null;
  const siestes = s.get(isoJour(auj)) ?? 0;
  return { avant: dette, apres: Math.max(0, dette - siestes), siestes };
}

// ---------------------------------------------------------------- le rappel (§ 3.8, D10)

/**
 * Programme (ou retire) le rappel d'aujourd'hui : activé, avant l'heure, au moins 2 h à rattraper, aucune sieste aujourd'hui,
 * aucune séance en cours, pas en pause ; au plus un par jour. Deux rappels ignorés de suite : pause de 7 jours.
 */
export async function planifierRappel(db: Executeur, maintenant = Date.now()): Promise<boolean> {
  const r = await lireReglagesRecup(db);
  const auj = isoJour(maintenant);
  const d = new Date(maintenant);
  const minuit = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  let etat = lireEtatRappel(await lireReglage(db, REGLAGE_RAPPEL_ETAT).catch(() => null));
  // le bilan du dernier rappel : suivi d'une sieste ce jour-là, ou ignoré
  if (etat.dernier && etat.dernier < auj) {
    const [a, m, j] = etat.dernier.split("-").map(Number);
    const jour = new Date(a!, m! - 1, j!).getTime();
    const siestes = await lireRecupEntre(db, jour, jour + 86_400_000);
    etat = bilanRappel(etat, auj, () => siestes.some((x) => x.type === "sieste"), decalerIso);
  }
  const siesteFaite = (await lireRecupEntre(db, minuit, minuit + 86_400_000)).some((x) => x.type === "sieste") || (await lireEnCoursRecup(db))?.type === "sieste";
  const seance = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM seances WHERE fin IS NULL", []).catch(() => null);
  const dette = r.rappel ? await lireDetteDuJour(db, maintenant).catch(() => null) : null;
  const oui = doitRappeler({
    actif: r.rappel,
    minuteDuJour: d.getHours() * 60 + d.getMinutes(),
    heure: r.heureRappel,
    dette: dette?.apres ?? null,
    siesteFaite,
    seanceEnCours: (seance?.n ?? 0) > 0,
    aujourdhui: auj,
    etat,
  });
  if (oui) etat = { ...etat, dernier: auj };
  await ecrireReglage(db, REGLAGE_RAPPEL_ETAT, JSON.stringify(etat)).catch(() => {});
  await alarmeRecup.rappel(oui ? { quand: minuit + r.heureRappel * MIN, dette: hm(arrondiDette(dette!.apres)) } : null).catch(() => {});
  return oui;
}
