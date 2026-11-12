// Connexion Polar de l'appli (AccessLink v3) : branche l'OAuth du téléphone (oauth/client.ts, avec les identifiants de la
// personne), le coffre du téléphone (expo-secure-store) et la base. Le jeton reste sur le téléphone, qui lit lui-même l'API.
import * as SecureStore from "../coffre";
import { Linking } from "react-native";
import type { Executeur } from "../db/executeur";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import { aleatoire, pret } from "../sync/chiffrement";
import { creerEtatSynchro } from "../whoop/etat-synchro";
import type { Coffre } from "../whoop/jetons";
import { ErreurWhoop } from "../whoop/types";
import { echangerCode, urlAutorisation, type RetourAppli } from "../oauth/client";
import { identifiants } from "../identifiants";
import { creerApi } from "./api";
import { COFFRE, REGLAGE } from "./constantes";
import { creerJetons, enJetons } from "./jetons";
import { purgerPolar } from "./depot";
import { codeRetour } from "./messages";
import { oublierPolar } from "./source";
import { synchroniserPolar, type BilanPolar } from "./synchro";

const coffre: Coffre = {
  lire: (c) => SecureStore.getItemAsync(c),
  ecrire: (c, v) => SecureStore.setItemAsync(c, v),
  effacer: (c) => SecureStore.deleteItemAsync(c),
};

/** Identifiants de la personne (identifiants/) ; sans eux, pas de connexion. */
async function mesIdentifiants() {
  const i = await identifiants("polar");
  if (!i) throw new ErreurWhoop("non-connecte", "identifiants");
  return i;
}
const jetons = () => creerJetons(coffre, COFFRE.jetons);
const api = () => creerApi({ acces: () => jetons().accesValable() });

const etat = creerEtatSynchro();
export const synchroEnCours = etat.synchroEnCours;
export const abonnerSynchro = etat.abonnerSynchro;

export interface EtatPolar {
  connecte: boolean;
  derniereSynchro: number | null;
  erreur: string | null;
}

export async function etatPolar(db: Executeur): Promise<EtatPolar> {
  const [c, s, e] = await Promise.all([REGLAGE.connecte, REGLAGE.derniereSynchro, REGLAGE.derniereErreur].map((k) => lireReglage(db, k)));
  return { connecte: c === "1", derniereSynchro: s ? Number(s) : null, erreur: e || null };
}

const hex = (o: Uint8Array) => Array.from(o, (x) => x.toString(16).padStart(2, "0")).join("");

/** Ouvre la page d'autorisation de Polar Flow dans le navigateur ; le retour arrive par le lien de l'appli (route « polar »). */
export async function commencerConnexion(): Promise<void> {
  const i = await mesIdentifiants();
  await pret();
  const state = hex(aleatoire(16));
  const url = urlAutorisation("polar", i, state);
  await coffre.ecrire(COFFRE.attente, JSON.stringify({ state }));
  await Linking.openURL(url);
}

/** Fin de la connexion, au retour du navigateur : vérifie le state, échange le code (un seul usage, 10 min) et garde le jeton. */
export async function finirConnexion(db: Executeur, r: RetourAppli): Promise<void> {
  const brut = await coffre.lire(COFFRE.attente);
  await coffre.effacer(COFFRE.attente);
  if (r.erreur) throw new ErreurWhoop(codeRetour(r.erreur), r.erreur);
  const attente = brut ? (JSON.parse(brut) as { state: string }) : null;
  if (!attente || !r.code || r.state !== attente.state) throw new ErreurWhoop("serveur", "state");
  const rep = await echangerCode("polar", await mesIdentifiants(), r.code);
  await jetons().enregistrer(enJetons(rep, Date.now()));
  // nouvelle connexion : l'inscription auprès de son application (POST /v3/users, à la synchro) et tout l'historique sont refaits
  for (const k of [REGLAGE.inscrit, REGLAGE.curseurFc, REGLAGE.curseurActivite, REGLAGE.derniereErreur]) await ecrireReglage(db, k, "");
  await ecrireReglage(db, REGLAGE.connecte, "1");
  oublierPolar();
}

/** Synchro (tout l'historique la première fois, puis l'incrémental). Une erreur est gardée pour l'écran Connexions. */
export function synchroniser(db: Executeur): Promise<BilanPolar | null> {
  return etat.pendantSynchro(async () => {
    if (!(await etatPolar(db)).connecte) return null;
    try {
      const bilan = await synchroniserPolar(db, api());
      await ecrireReglage(db, REGLAGE.derniereErreur, "");
      return bilan;
    } catch (e) {
      const code = e instanceof ErreurWhoop ? e.code : "serveur";
      await ecrireReglage(db, REGLAGE.derniereErreur, code);
      if (code === "expire" || code === "non-connecte") await ecrireReglage(db, REGLAGE.connecte, "0");
      return null;
    } finally {
      oublierPolar();
    }
  });
}

/** Synchro si la dernière date de plus de `minutes` (ouverture de Santé) ; vrai si elle a tourné. */
export async function synchroniserSiBesoin(db: Executeur, minutes = 15): Promise<boolean> {
  const e = await etatPolar(db);
  if (!e.connecte || Date.now() - (e.derniereSynchro ?? 0) <= minutes * 60_000) return false;
  await synchroniser(db);
  return true;
}

/** Retire l'accès de pepfit chez Polar (désinscription, qui révoque le jeton) : vrai si c'est fait ou s'il n'y a pas de
 *  connexion, faux si Polar n'a pas répondu. Ne touche pas au téléphone. */
export async function revoquerAcces(): Promise<boolean> {
  const j = await jetons().lire();
  if (!j) return true;
  if (!j.user_id) return false;
  try {
    await creerApi({ acces: async () => j.access_token }).desinscrire(j.user_id);
    return true;
  } catch (e) {
    // jeton déjà refusé : l'accès est déjà retiré
    return e instanceof ErreurWhoop && e.code === "expire";
  }
}

/** Déconnexion : révoque l'accès chez Polar, efface le jeton ; `garder` : les données importées restent sur le téléphone. */
export async function deconnecter(db: Executeur, garder = false): Promise<void> {
  // injoignable : on déconnecte quand même, l'utilisateur peut aussi retirer l'accès dans son compte Polar Flow
  await revoquerAcces();
  await jetons().effacer();
  await coffre.effacer(COFFRE.attente);
  await purgerPolar(db, garder);
  oublierPolar();
}
