// « Effacer les données de ce téléphone » (Profil › Données, sans compte), sans React ni natif : l'inventaire de tout ce que
// l'appli garde sur le téléphone, et l'ordre de l'effacement. Testé par tests/effacer.test.ts, qui relit aussi le code : un
// stockage nouveau qui n'est pas inscrit ici fait échouer le test.
import { DOSSIER_PHOTOS } from "../photos/reglage";
import { COFFRE_FITATU } from "../fitatu/constantes";
import { COFFRE } from "../whoop/constantes";
import { COFFRE as COFFRE_WITHINGS } from "../withings/constantes";
import { COFFRE as COFFRE_POLAR } from "../polar/constantes";
import { COFFRE_IDENTIFIANTS } from "../identifiants/modele";

/** Coffre du téléphone (expo-secure-store) : phrase de secours, jetons et session Whoop, jetons Withings et Polar, session
 *  Fitatu, identifiants développeur des API. Effacées sous leur nom exact, jamais renommées (identifiants de protocole figés). */
export const CLES_COFFRE: readonly string[] = ["fonte.phrase", ...Object.values(COFFRE), ...Object.values(COFFRE_WITHINGS), ...Object.values(COFFRE_POLAR), COFFRE_FITATU, ...COFFRE_IDENTIFIANTS];

/** La base (dossier SQLite d'expo-sqlite) et ses fichiers de journal. */
export const NOM_BASE = "fonte.db";
export const FICHIERS_BASE: readonly string[] = [NOM_BASE, `${NOM_BASE}-wal`, `${NOM_BASE}-shm`, `${NOM_BASE}-journal`];

/** Dossiers de l'appli dans ses documents : photos de séance, tampons du suivi GPS et FC (écrits par le natif), photo de profil (anciennes versions). */
export const DOSSIERS: readonly string[] = [DOSSIER_PHOTOS, "suivi", "profil"];

/** Témoin d'un effacement commencé : tant qu'il est là, le lancement reprend l'effacement avant d'ouvrir la base. */
export const TEMOIN = "effacement-en-cours";

/**
 * Tout fichier du code qui écrit sur le téléphone, et comment l'effacement le couvre. Le test relit `src` et `modules` : un
 * fichier qui se met à stocker quelque chose doit être ajouté ici (et son stockage à l'effacement).
 */
export const STOCKAGES: Readonly<Record<string, string>> = {
  "src/db/index.ts": "base fonte.db : fermée, puis fonte.db, -wal, -shm, -journal supprimés",
  "src/db/migrations.ts": "base fonte.db (schéma)",
  "src/sync/local.ts": "coffre fonte.phrase (phrase de secours des sauvegardes chiffrées)",
  "src/coffre.ts": "passerelle du coffre (expo-secure-store) : ne garde rien elle-même",
  "src/whoop/index.ts": "coffre fonte.whoop.* (jetons, attente)",
  "src/withings/index.ts": "coffre fonte.withings.* (jetons, attente)",
  "src/polar/index.ts": "coffre fonte.polar.* (jetons, attente)",
  "src/identifiants/index.ts": "coffre pepfit.identifiants.* (identifiants développeur Whoop, Withings, Polar)",
  "src/fitatu/index.ts": "coffre fonte.fitatu.session (session Fitatu) ; avancement de l'import dans la base",
  "src/fitatu/session.ts": "lit seulement le stockage local de la page Fitatu (WebView) : cookies et stockage web, cookies.effacer",
  "src/app/settings/fitatu.tsx": "WebView de Fitatu : cookies et stockage web, cookies.effacer",
  "src/natif/cookies/index.android.ts": "cookies et stockage web de la WebView : cookies.effacer",
  "modules/pepfit-cookies/android/src/main/java/fit/pep/cookies/PepfitCookiesModule.kt": "cookies et stockage web : effacer",
  "modules/pepfit-stockage/android/src/main/java/fit/pep/stockage/PepfitStockageModule.kt": "accès gardés aux dossiers choisis (SAF) : rendreAcces ; diagnostic-*.json du dossier externe de l'appli : supprimés par rendreAcces",
  "src/photos/index.ts": "documents/photos : dossier supprimé",
  "src/photos/plats.ts": "photos des plats dans documents/photos : dossier supprimé",
  "src/ecrans/exporter.ts": "exports dans le cache : cache vidé",
  "src/sauvegarde/index.ts": "fichier choisi copié dans le cache : cache vidé ; accès au dossier de sauvegarde rendu (stockage.rendreAcces) ; le dossier et ses sauvegardes restent (hors de l'appli)",
  "src/natif/minuteur/index.android.ts": "notifications programmées : toutes annulées",
  "src/natif/alarme-recup/index.android.ts": "notifications programmées : toutes annulées",
  "src/natif/minuteur/index.ios.ts": "notifications programmées : toutes annulées",
  "src/natif/alarme-recup/index.ios.ts": "notifications programmées (fin, relances, rappel) : toutes annulées",
  "src/natif/rappels/index.native.ts": "notifications programmées : toutes annulées",
  "src/natif/rappels-repas/index.native.ts": "notifications programmées : toutes annulées",
  "src/natif/rappels-traitements/index.native.ts": "notifications programmées : toutes annulées",
  "src/natif/rappel-coucher/index.native.ts": "notifications programmées : toutes annulées",
  "src/natif/rappel-regles/index.native.ts": "notifications programmées : toutes annulées",
  "modules/pepfit-alarme/android/src/main/java/fit/pep/alarme/Alarme.kt": "alarme de sieste (AlarmManager et préférences pepfit_alarme) : annulée avec les notifications",
  "modules/pepfit-alarme/android/src/main/java/fit/pep/alarme/AlarmeRecepteur.kt": "alarme de sieste : service de premier plan qui sonne, arrêté avec l'alarme",
  "modules/pepfit-suivi/android/src/main/java/fit/pep/suivi/PepfitSuiviModule.kt": "service de la séance et préférences pepfit-suivi : suivi.oublier",
  "modules/pepfit-suivi/android/src/main/java/fit/pep/suivi/Suivi.kt": "documents/suivi : suivi.oublier, puis dossier supprimé",
};

/** Révocation des accès Whoop et Polar avant l'effacement : au plus ce délai, puis on efface quand même. */
export const DELAI_REVOCATION_MS = 5000;

export type Etape = "temoin" | "seance" | "notifications" | "base" | "coffre" | "connexions" | "fichiers" | "redemarrage";

export class ErreurEffacement extends Error {
  readonly etape: Etape;
  constructor(etape: Etape, cause: unknown) {
    super(`effacement : étape ${etape}`, { cause });
    this.etape = etape;
  }
}

/** Gestes de l'effacement ; chacun est rejouable (ce qui n'existe plus n'est pas une erreur). */
export interface DepsEffacement {
  /** Révoque les accès chez Whoop et chez Polar (comme « Déconnecter ») ; vrai si c'est fait ou s'il n'y a pas de connexion. */
  revoquerWhoop(): Promise<boolean>;
  /** Whoop ou Polar n'a pas répondu à temps : l'écran le dit (en une ligne), puis l'effacement continue. */
  whoopNonRevoque(): Promise<void>;
  poserTemoin(): Promise<void>;
  retirerTemoin(): Promise<void>;
  /** Service de la séance (suivi GPS, FC, notification de la séance) arrêté, ses tampons et préférences effacés. */
  arreterSeance(): Promise<void>;
  /** Rappels, minuteur de repos : notifications programmées annulées, celles affichées retirées. */
  annulerNotifications(): Promise<void>;
  /** Ne fait rien si la base est déjà fermée (ou pas ouverte). */
  fermerBase(): Promise<void>;
  supprimerFichierBase(nom: string): Promise<void>;
  effacerCle(cle: string): Promise<void>;
  /** Cookies et stockage web de la WebView. */
  effacerCookies(): Promise<void>;
  /** Accès gardés par Android aux dossiers choisis (dossier de sauvegarde) : rendus. */
  rendreAccesDossiers(): Promise<void>;
  supprimerDossier(nom: string): Promise<void>;
  /** Le reste des documents (sauf `garder`) et tout le cache. */
  viderDocumentsEtCache(garder: string): Promise<void>;
  redemarrer(): Promise<void>;
}

/** Vrai si `p` rend vrai avant `ms` ; faux s'il rend faux, échoue ou tarde. */
async function avant(ms: number, p: Promise<boolean>): Promise<boolean> {
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<boolean>((r) => (minuterie = setTimeout(() => r(false), ms)));
  try {
    return await Promise.race([p.catch(() => false), delai]);
  } finally {
    clearTimeout(minuterie);
  }
}

/**
 * Depuis l'écran (`distant`), l'accès Whoop est d'abord révoqué chez Whoop, en DELAI_REVOCATION_MS au plus ; sans réponse,
 * l'écran le dit et l'effacement continue. La reprise au lancement ne passe pas par le réseau.
 * Efface ensuite tout, dans l'ordre : témoin posé, séance arrêtée, notifications annulées, base fermée puis supprimée, coffre,
 * connexions, fichiers, témoin retiré, redémarrage. Une étape ratée arrête tout (ErreurEffacement) et laisse le témoin :
 * relancer l'effacement, ou l'appli, reprend du début, chaque geste étant rejouable.
 */
export async function effacerTout(d: DepsEffacement, o: { redemarrer: boolean; distant?: boolean; delaiRevocationMs?: number }): Promise<void> {
  const etape = async (e: Etape, f: () => Promise<void>) => {
    try {
      await f();
    } catch (cause) {
      throw new ErreurEffacement(e, cause);
    }
  };
  if (o.distant && !(await avant(o.delaiRevocationMs ?? DELAI_REVOCATION_MS, d.revoquerWhoop()))) await d.whoopNonRevoque();
  await etape("temoin", d.poserTemoin);
  await etape("seance", d.arreterSeance);
  await etape("notifications", d.annulerNotifications);
  await etape("base", async () => {
    await d.fermerBase();
    for (const f of FICHIERS_BASE) await d.supprimerFichierBase(f);
  });
  await etape("coffre", async () => {
    for (const c of CLES_COFFRE) await d.effacerCle(c);
  });
  await etape("connexions", async () => {
    await d.effacerCookies();
    await d.rendreAccesDossiers();
  });
  await etape("fichiers", async () => {
    for (const f of DOSSIERS) await d.supprimerDossier(f);
    await d.viderDocumentsEtCache(TEMOIN);
    await d.retirerTemoin();
  });
  if (o.redemarrer) await etape("redemarrage", d.redemarrer);
}
