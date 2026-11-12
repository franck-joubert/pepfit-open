// Connexion Fitatu de l'appli : branche le coffre du téléphone (expo-secure-store), la base et le réseau sur le client
// (api.ts) et l'import par lots (historique.ts). Lecture seule chez Fitatu ; la session reste sur le téléphone.
// L'import vit ici, pas dans l'écran : il continue quand on navigue ailleurs dans pepfit, garde l'écran allumé tant qu'il
// tourne, et reprend au lancement et à chaque retour au premier plan (reprendreFitatu, ecrans/contexte.tsx). En arrière-plan,
// Android fige le JS (les pauses ne finissent plus) : l'import attend le retour de pepfit au premier plan.
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as SecureStore from "../coffre";
import type { Executeur } from "../db/executeur";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import { importerFitatu } from "../import/fitatu";
import { creerClientFitatu, type SessionFitatu } from "./api";
import { COFFRE_FITATU, REGLAGE_FITATU } from "./constantes";
import { signalerProgression } from "./etat";
import { decaler, importerHistorique, lireEtat, REPLI_JOURS, type EtatImportFitatu, type IssueImport } from "./historique";
import { premiereDate } from "./session";
export { abonnerFitatu, part, progressionFitatu } from "./etat";

const lireSession = async (): Promise<SessionFitatu | null> => {
  const brut = await SecureStore.getItemAsync(COFFRE_FITATU).catch(() => null);
  try {
    return brut ? (JSON.parse(brut) as SessionFitatu) : null;
  } catch {
    return null;
  }
};
const ecrireSession = (s: SessionFitatu) => SecureStore.setItemAsync(COFFRE_FITATU, JSON.stringify(s));
const attendre = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const client = () => creerClientFitatu({ fetch: (u, i) => fetch(u, i), lireSession, ecrireSession, attendre });

export interface EtatFitatu {
  connecte: boolean;
  /** Dernier import réussi (ms). */
  dernier: number | null;
  /** Code de la dernière erreur (session, limite, reseau…) ; null sinon. */
  erreur: string | null;
  /** Avancement de la période en cours. */
  import: EtatImportFitatu | null;
}

export async function etatFitatu(db: Executeur): Promise<EtatFitatu> {
  const [c, d, e, i] = await Promise.all([REGLAGE_FITATU.connecte, REGLAGE_FITATU.dernier, REGLAGE_FITATU.erreur, REGLAGE_FITATU.import].map((k) => lireReglage(db, k)));
  return { connecte: c === "1", dernier: d ? Number(d) : null, erreur: e || null, import: lireEtat(i ?? null) };
}

/** Session relevée dans la WebView : gardée, puis l'import de l'historique commence (sans l'attendre). */
export async function connecterFitatu(db: Executeur, s: SessionFitatu): Promise<void> {
  await ecrireSession(s);
  await ecrireReglage(db, REGLAGE_FITATU.connecte, "1");
  await ecrireReglage(db, REGLAGE_FITATU.erreur, "");
  // une nouvelle connexion reprend l'import là où il en était (même compte) : l'avancement n'est pas remis à zéro
  void importerFitatuDepuisCompte(db);
}

/** Déconnexion : session oubliée, import arrêté au prochain lot. Les repas déjà importés restent. */
export async function deconnecterFitatu(db: Executeur): Promise<void> {
  await SecureStore.deleteItemAsync(COFFRE_FITATU);
  await ecrireReglage(db, REGLAGE_FITATU.connecte, "0");
  await ecrireReglage(db, REGLAGE_FITATU.erreur, "");
  await ecrireReglage(db, REGLAGE_FITATU.import, "");
}

let enCours: Promise<IssueImport> | null = null;

/** Lancement et retour au premier plan : reprend un import pas fini, sauf session à refaire ou import déjà en cours. Ne rejette jamais. */
export async function reprendreFitatu(db: Executeur): Promise<void> {
  if (enCours) return;
  const e = await etatFitatu(db).catch(() => null);
  if (!e?.connecte || e.erreur === "session" || e.import?.fini) return;
  await importerFitatuDepuisCompte(db);
}

/**
 * Import (ou reprise) de l'historique, un seul à la fois ; `mettreAJour` relit jusqu'à aujourd'hui une fois fini,
 * `toutReimporter` relit tout l'historique (doublons d'avant la mise en accord). Ne rejette jamais.
 */
export function importerFitatuDepuisCompte(db: Executeur, o: { mettreAJour?: boolean; toutReimporter?: boolean } = {}): Promise<IssueImport> {
  if (enCours) return enCours;
  const c = client();
  const p = (async (): Promise<IssueImport> => {
    activateKeepAwakeAsync("fitatu").catch(console.warn);
    const issue = await importerHistorique(
      {
        jour: (d) => c.jour(d),
        produit: (id) => c.produit(id),
        produitConnu: async (id) => {
          const r = await db.getFirstAsync<{ import_cle: string }>("SELECT import_cle FROM produits WHERE import_cle IN (?, ?)", [`fitatu:produit:${id}`, `fitatu:perso:${id}`]);
          return r ? (r.import_cle.startsWith("fitatu:perso:") ? "perso" : "produit") : null;
        },
        importer: async (e, joursRelus) => {
          const r = await importerFitatu(db, e, Date.now(), { joursRelus }); // importerFitatu ouvre lui-même sa transaction exclusive (db/exclusif.ts)
          for (const a of r.alertes ?? []) console.log(`[fitatu] plus de 800 g d'un aliment sec : ${a}`);
          return r;
        },
        lireEtat: () => lireReglage(db, REGLAGE_FITATU.import),
        ecrireEtat: (e) => ecrireReglage(db, REGLAGE_FITATU.import, e),
        attendre,
        aujourdhui,
        premiereDate: async () => {
          const s = await lireSession();
          const profil = await c.utilisateur().catch(() => null);
          return premiereDate(profil, s?.jeton ?? "", decaler(aujourdhui(), -REPLI_JOURS));
        },
        actif: async () => (await lireReglage(db, REGLAGE_FITATU.connecte)) === "1",
        progres: signalerProgression,
        mesure: (m) => console.log(`[fitatu] ${m.jours} jours, ${m.appels} appels : lecture ${m.lectureMs} ms (${m.lectureMs ? ((m.appels * 1000) / m.lectureMs).toFixed(1) : "—"} appels/s), écriture ${m.ecritureMs} ms, ${m.enVol} en vol, pause ${m.pauseMs} ms`),
      },
      o,
    );
    if (issue === "fini") await ecrireReglage(db, REGLAGE_FITATU.dernier, String(Date.now()));
    if (issue !== "coupe") await ecrireReglage(db, REGLAGE_FITATU.erreur, issue === "fini" ? "" : issue);
    return issue;
  })()
    .catch(async (): Promise<IssueImport> => {
      await ecrireReglage(db, REGLAGE_FITATU.erreur, "serveur").catch(() => {});
      return "serveur";
    })
    .finally(() => {
      deactivateKeepAwake("fitatu").catch(console.warn);
      enCours = null;
      signalerProgression(null);
    });
  enCours = p;
  return p;
}

export { COFFRE_FITATU, REGLAGE_FITATU };
