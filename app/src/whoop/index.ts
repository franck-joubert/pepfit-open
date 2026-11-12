// Connexion Whoop de l'appli : branche l'OAuth du téléphone (oauth/client.ts, avec les identifiants de la personne), le coffre
// du téléphone (expo-secure-store) et la base. Les jetons ne quittent jamais le téléphone.
import * as SecureStore from "../coffre";
import { Linking, Platform } from "react-native";
import { navigateur } from "../natif/navigateur";
import { ouvrirAutorisation } from "../natif/navigateur/autorisation";
import type { Executeur } from "../db/executeur";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import { aleatoire, pret } from "../sync/chiffrement";
import { creerApi, type ApiWhoop } from "./api";
import { COFFRE, REGLAGE } from "./constantes";
import { echangerCode, renouveler, urlAutorisation, type RetourAppli } from "../oauth/client";
import { identifiants } from "../identifiants";
import { enregistrerCorps, purgerWhoop, retirerConnexionWhoop } from "./depot";
import { codeRetour } from "./messages";
import { pendantSynchro } from "./etat-synchro";
export { abonnerSynchro, synchroEnCours } from "./etat-synchro";
import { creerJetons, enJetons, type Coffre } from "./jetons";
import { synchroniserWhoop, type BilanSynchro } from "./synchro";
import { relireHistoriqueWhoop, type IssueHistoriqueWhoop } from "./historique";
import { ErreurWhoop } from "./types";
import { corpsVersPepfit } from "./convertir";
import { ecrireDiagnosticActivites, suivreDiagnostic } from "../db/depots/diagnostic-activites";
import { sante } from "../natif/sante/index";

const coffre: Coffre = {
  lire: (c) => SecureStore.getItemAsync(c),
  ecrire: (c, v) => SecureStore.setItemAsync(c, v),
  effacer: (c) => SecureStore.deleteItemAsync(c),
};

/** Identifiants de la personne (identifiants/) ; sans eux, ni connexion ni renouvellement. */
async function mesIdentifiants() {
  const i = await identifiants("whoop");
  if (!i) throw new ErreurWhoop("non-connecte", "identifiants");
  return i;
}
// UNE seule instance pour toute l'appli : son « envol » est ce qui garantit un seul renouvellement à la fois. Une instance par
// appel laissait partir deux renouvellements en même temps ; le refresh tourne, le second était refusé et Whoop se
// déconnectait (un 200 puis des 401 à la même milliseconde).
let jetonsUniques: ReturnType<typeof creerJetons> | null = null;
const jetons = () => (jetonsUniques ??= creerJetons(coffre, COFFRE.jetons, async (rt) => renouveler("whoop", await mesIdentifiants(), rt)));

export interface EtatWhoop {
  connecte: boolean;
  derniereSynchro: number | null;
  erreur: string | null;
}

export async function etatWhoop(db: Executeur): Promise<EtatWhoop> {
  const [c, s, e] = await Promise.all([REGLAGE.connecte, REGLAGE.derniereSynchro, REGLAGE.derniereErreur].map((k) => lireReglage(db, k)));
  return { connecte: c === "1", derniereSynchro: s ? Number(s) : null, erreur: e || null };
}

const hex = (o: Uint8Array) => Array.from(o, (x) => x.toString(16).padStart(2, "0")).join("");

/** Ouvre la page d'autorisation de Whoop (navigateur sur Android, feuille de connexion d'Apple sur iPhone) ; le retour arrive par le lien de l'appli (route « whoop »). */
export async function commencerConnexion(): Promise<void> {
  const i = await mesIdentifiants();
  await pret();
  const state = hex(aleatoire(16));
  const url = urlAutorisation("whoop", i, state);
  await coffre.ecrire(COFFRE.attente, JSON.stringify({ state }));
  // Android : le navigateur ; iPhone : la feuille de connexion d'Apple, qui rend le même retour pepfitopen://
  await ouvrirAutorisation(url, { ios: Platform.OS === "ios", authentifier: navigateur.authentifier, ouvrirLien: (u) => Linking.openURL(u) });
}

/** Fin de la connexion, au retour du navigateur : vérifie le state, échange le code (un seul usage) et garde les jetons. */
export async function finirConnexion(db: Executeur, r: RetourAppli): Promise<void> {
  const brut = await coffre.lire(COFFRE.attente);
  await coffre.effacer(COFFRE.attente);
  // seul access_denied est un refus de l'utilisateur ; le reste (échange raté…) vient de notre côté (messages.ts)
  if (r.erreur) throw new ErreurWhoop(codeRetour(r.erreur), r.erreur);
  const attente = brut ? (JSON.parse(brut) as { state: string }) : null;
  if (!attente || !r.code || r.state !== attente.state) throw new ErreurWhoop("serveur", "state");
  const rep = await echangerCode("whoop", await mesIdentifiants(), r.code);
  await jetons().enregistrer(enJetons(rep, Date.now()));
  await ecrireReglage(db, REGLAGE.connecte, "1");
  await ecrireReglage(db, REGLAGE.derniereErreur, "");
}

/** Synchro complète (API officielle). Une erreur est gardée pour l'écran Connexions. */
export async function synchroniser(db: Executeur): Promise<BilanSynchro | null> {
  if (!(await etatWhoop(db)).connecte) return null;
  return pendantSynchro(() => synchroniserOfficielle(db));
}

/** L'API officielle seule (sommeil, récupération, cycles, séances, corps). Une erreur est gardée pour l'écran Connexions. */
async function synchroniserOfficielle(db: Executeur): Promise<BilanSynchro | null> {
  try {
    const api = creerApi({ acces: (f) => jetons().accesValable(f) });
    const bilan = await synchroniserWhoop(db, api);
    await ecrireReglage(db, REGLAGE.derniereErreur, "");
    // l'historique plus ancien que la première fenêtre arrive en fond, après la synchro (jamais devant elle)
    void historiqueJours(db, api);
    return bilan;
  } catch (e) {
    const code = e instanceof ErreurWhoop ? e.code : "serveur";
    await ecrireReglage(db, REGLAGE.derniereErreur, code);
    if (code === "expire" || code === "non-connecte") await ecrireReglage(db, REGLAGE.connecte, "0");
    return null;
  } finally {
    // Diagnostic des activités (docs/EFFORT-ACTIVITE.md) : ce que Whoop a livré et ce que l'appli en a fait, lisible par adb pull
    suivreDiagnostic(ecrireDiagnosticActivites(db, { motif: "synchro-whoop", sante }));
  }
}

let historiqueJoursEnCours: Promise<IssueHistoriqueWhoop> | null = null;

/** Historique des jours (historique.ts), une seule relecture à la fois ; ne rejette jamais, reprend à la synchro suivante. */
function historiqueJours(db: Executeur, api: ApiWhoop): Promise<IssueHistoriqueWhoop> {
  historiqueJoursEnCours ??= relireHistoriqueWhoop(db, api, Date.now(), async () => (await lireReglage(db, REGLAGE.connecte)) === "1")
    .catch((e: unknown): IssueHistoriqueWhoop => (console.warn("whoop : historique interrompu", e instanceof Error ? e.message : ""), "interrompu"))
    .finally(() => {
      historiqueJoursEnCours = null;
    });
  return historiqueJoursEnCours;
}

/** Relecture d'une sieste qui attend sa mesure (recuperer-releve.ts) ; rien si Whoop n'est pas relié. */
export const synchroniserApiSeule = synchroniser;

/** Corps du profil Whoop seul (poids, taille, FC max : body_measurement), sans toute la synchro ; rien si non relié ou
 * lu il y a moins de `minutes`. */
export async function actualiserCorpsWhoop(db: Executeur, minutes = 15): Promise<boolean> {
  if (!(await etatWhoop(db)).connecte) return false;
  if (Date.now() - Number((await lireReglage(db, REGLAGE.corpsLu)) ?? 0) < minutes * 60_000) return false;
  const c = await creerApi({ acces: (f) => jetons().accesValable(f) }).corps().catch(() => null);
  if (!c) return false;
  await enregistrerCorps(db, corpsVersPepfit(c));
  await ecrireReglage(db, REGLAGE.corpsLu, String(Date.now()));
  return true;
}

/** Synchro si la dernière date de plus de `minutes` (ouverture de Santé) ; vrai si elle a tourné (Santé relit alors ses cartes). */
export async function synchroniserSiBesoin(db: Executeur, minutes = 15): Promise<boolean> {
  const e = await etatWhoop(db);
  if (!e.connecte) return false;
  if (Date.now() - (e.derniereSynchro ?? 0) <= minutes * 60_000) return false;
  await synchroniser(db);
  return true;
}

/** Révoque l'accès chez Whoop (DELETE /v2/user/access) : vrai si c'est fait ou s'il n'y a pas de connexion, faux si Whoop
 *  n'a pas répondu (injoignable ou déjà révoqué). Ne touche pas au téléphone. */
export async function revoquerAcces(): Promise<boolean> {
  if (!(await coffre.lire(COFFRE.jetons))) return true;
  try {
    await creerApi({ acces: (f) => jetons().accesValable(f) }).revoquer();
    return true;
  } catch {
    return false;
  }
}

/**
 * Déconnexion : révoque l'accès chez Whoop, efface jetons et accès du téléphone, arrête la synchro. Les données (journal de
 * santé) restent, sauf `supprimerDonnees` : la purge complète, qui se propage aux autres appareils (depot.ts).
 */
export async function deconnecter(db: Executeur, supprimerDonnees = false): Promise<void> {
  // injoignable ou déjà révoqué : on purge quand même, l'utilisateur peut aussi retirer l'accès dans son compte Whoop
  await revoquerAcces();
  await jetons().effacer();
  await (supprimerDonnees ? purgerWhoop(db) : retirerConnexionWhoop(db));
}
