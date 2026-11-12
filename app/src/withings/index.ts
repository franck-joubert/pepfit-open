// Connexion Withings de l'appli (balance) : branche l'OAuth du téléphone (oauth/client.ts, avec les identifiants de la
// personne), le coffre du téléphone (expo-secure-store) et la base. Même modèle que Whoop (whoop/index.ts) : les jetons ne
// quittent jamais le téléphone. Withings exige une URL de retour HTTPS : la page relais (relais/retour.html) rend la main à
// l'appli.
import * as SecureStore from "../coffre";
import { Linking, Platform } from "react-native";
import { navigateur } from "../natif/navigateur";
import { ouvrirAutorisation } from "../natif/navigateur/autorisation";
import type { Executeur } from "../db/executeur";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import { aleatoire, pret } from "../sync/chiffrement";
import { creerEtatSynchro } from "../whoop/etat-synchro";
import { creerJetons, enJetons, type Coffre } from "../whoop/jetons";
import { ErreurWhoop } from "../whoop/types";
import { echangerCode, renouveler, urlAutorisation, type RetourAppli } from "../oauth/client";
import { identifiants } from "../identifiants";
import { creerApi } from "./api";
import { COFFRE, REGLAGE } from "./constantes";
import { purgerWithings } from "./depot";
import { codeRetour } from "./messages";
import { lireDiagnostic } from "./diagnostic";
import type { DiagnosticWithings } from "./types";
import { synchroniserWithings, type BilanWithings } from "./synchro";
import { synchroniserPlus } from "./synchro-plus";

const coffre: Coffre = {
  lire: (c) => SecureStore.getItemAsync(c),
  ecrire: (c, v) => SecureStore.setItemAsync(c, v),
  effacer: (c) => SecureStore.deleteItemAsync(c),
};

/** Identifiants de la personne (identifiants/) ; sans eux, ni connexion ni renouvellement. */
async function mesIdentifiants() {
  const i = await identifiants("withings");
  if (!i) throw new ErreurWhoop("non-connecte", "identifiants");
  return i;
}
// Une seule instance (un seul renouvellement à la fois), comme Whoop : le refresh tourne, deux renouvellements simultanés en perdraient un.
let jetonsUniques: ReturnType<typeof creerJetons> | null = null;
const jetons = () => (jetonsUniques ??= creerJetons(coffre, COFFRE.jetons, async (rt) => renouveler("withings", await mesIdentifiants(), rt)));
const api = () => creerApi({ acces: (f) => jetons().accesValable(f) });

const etat = creerEtatSynchro();
export const synchroEnCours = etat.synchroEnCours;
export const abonnerSynchro = etat.abonnerSynchro;

export interface EtatWithings {
  connecte: boolean;
  derniereSynchro: number | null;
  erreur: string | null;
  /** Ce que l'API a livré à la dernière synchro (journal de Connexions) ; null avant la première. */
  diagnostic: DiagnosticWithings | null;
  /** La connexion date d'avant le droit « activité » : reconnecter Withings pour lire le sommeil et les pas. */
  reconnexion: boolean;
}

export async function etatWithings(db: Executeur): Promise<EtatWithings> {
  const [c, s, e, d, r] = await Promise.all([REGLAGE.connecte, REGLAGE.derniereSynchro, REGLAGE.derniereErreur, REGLAGE.diagnostic, REGLAGE.reconnexion].map((k) => lireReglage(db, k)));
  return { connecte: c === "1", derniereSynchro: s ? Number(s) : null, erreur: e || null, diagnostic: lireDiagnostic(d ?? null), reconnexion: c === "1" && r === "1" };
}

const hex = (o: Uint8Array) => Array.from(o, (x) => x.toString(16).padStart(2, "0")).join("");

/** Ouvre la page d'autorisation de Withings (navigateur sur Android, feuille de connexion d'Apple sur iPhone) ; le retour arrive par le lien de l'appli (route « withings »). */
export async function commencerConnexion(): Promise<void> {
  const i = await mesIdentifiants();
  await pret();
  const state = hex(aleatoire(16));
  const url = urlAutorisation("withings", i, state);
  await coffre.ecrire(COFFRE.attente, JSON.stringify({ state }));
  // Android : le navigateur ; iPhone : la feuille de connexion d'Apple, qui rend le même retour pepfitopen://
  await ouvrirAutorisation(url, { ios: Platform.OS === "ios", authentifier: navigateur.authentifier, ouvrirLien: (u) => Linking.openURL(u) });
}

/** Fin de la connexion, au retour du navigateur : vérifie le state, échange le code (valable 30 s) et garde les jetons. */
export async function finirConnexion(db: Executeur, r: RetourAppli): Promise<void> {
  const brut = await coffre.lire(COFFRE.attente);
  await coffre.effacer(COFFRE.attente);
  if (r.erreur) throw new ErreurWhoop(codeRetour(r.erreur), r.erreur);
  const attente = brut ? (JSON.parse(brut) as { state: string }) : null;
  if (!attente || !r.code || r.state !== attente.state) throw new ErreurWhoop("serveur", "state");
  const rep = await echangerCode("withings", await mesIdentifiants(), r.code);
  await jetons().enregistrer(enJetons(rep, Date.now()));
  // nouvelle connexion : tout l'historique est relu
  await ecrireReglage(db, REGLAGE.curseur, "");
  await ecrireReglage(db, REGLAGE.plusCurseur, "");
  await ecrireReglage(db, REGLAGE.plusJusqua, "");
  await ecrireReglage(db, REGLAGE.reconnexion, "");
  await ecrireReglage(db, REGLAGE.connecte, "1");
  await ecrireReglage(db, REGLAGE.derniereErreur, "");
}

/** Synchro (tout l'historique la première fois, puis l'incrémental). Une erreur est gardée pour l'écran Connexions. */
export function synchroniser(db: Executeur): Promise<BilanWithings | null> {
  return etat.pendantSynchro(async () => {
    if (!(await etatWithings(db)).connecte) return null;
    try {
      const bilan = await synchroniserWithings(db, api());
      await ecrireReglage(db, REGLAGE.derniereErreur, "");
      // Activité et sommeil après les pesées, sans jamais les mettre en échec : une erreur ici est gardée à part
      try {
        await synchroniserPlus(db, api(), (await jetons().lire())?.scope);
      } catch (e) {
        await ecrireReglage(db, REGLAGE.plusErreur, e instanceof ErreurWhoop ? e.code : "serveur");
      }
      return bilan;
    } catch (e) {
      const code = e instanceof ErreurWhoop ? e.code : "serveur";
      await ecrireReglage(db, REGLAGE.derniereErreur, code);
      if (code === "expire" || code === "non-connecte") await ecrireReglage(db, REGLAGE.connecte, "0");
      return null;
    }
  });
}

/** Synchro si la dernière date de plus de `minutes` (ouverture de Santé, de Corps) ; vrai si elle a tourné. */
export async function synchroniserSiBesoin(db: Executeur, minutes = 15): Promise<boolean> {
  const e = await etatWithings(db);
  if (!e.connecte || Date.now() - (e.derniereSynchro ?? 0) <= minutes * 60_000) return false;
  await synchroniser(db);
  return true;
}

/** Déconnexion : efface jetons et données Withings du téléphone. L'accès donné à son application se retire dans son compte
 *  Withings (Withings veut cette demande signée : ce n'est pas fait d'ici). */
export async function deconnecter(db: Executeur): Promise<void> {
  await jetons().effacer();
  await coffre.effacer(COFFRE.attente);
  await purgerWithings(db);
}
