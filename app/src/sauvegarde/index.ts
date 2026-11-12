import { Directory, File, FileMode, Paths } from "expo-file-system";
import type { Executeur } from "../db/executeur";
import { ecrireReglage, lireReglage } from "../db/depots/reglages";
import { menagePhotos } from "../photos";
import { pret } from "../sync/chiffrement";
import { fichiers, phrasesConnues } from "../sync/local";
import { appliquerSauvegarde, lireEntete, lireSauvegarde, phraseOuvre, PREFIXE_REGLAGES_LOCAUX, sauvegarder, type Bilan, type Entete, type Entree, type Mode } from "./archive";
import { fournisseur, FREQUENCES, GARDE_DEFAUT, nomSauvegarde, rotation, sauvegardeDue, type Frequence } from "./regles";

// Sauvegarde dans un dossier choisi une fois par le sélecteur d'Android (SAF : stockage du téléphone, Drive, Dropbox…, par
// leurs applis ; aucune connexion OAuth). Les réglages vivent dans `reglages` sous « sauvegarde_ » : propres à ce téléphone,
// une restauration ne les écrase pas.

const R = {
  dossier: `${PREFIXE_REGLAGES_LOCAUX}dossier`,
  frequence: `${PREFIXE_REGLAGES_LOCAUX}frequence`,
  garder: `${PREFIXE_REGLAGES_LOCAUX}garder`,
  lisible: `${PREFIXE_REGLAGES_LOCAUX}lisible`,
  derniere: `${PREFIXE_REGLAGES_LOCAUX}derniere`,
  /** Date du premier échec depuis la dernière réussite ; effacée à la réussite suivante. */
  echec: `${PREFIXE_REGLAGES_LOCAUX}echec`,
  /** Date de la réussite qui a clos un échec : « ✅ Sauvegarde rétablie » tant qu'elle est la dernière. */
  retablie: `${PREFIXE_REGLAGES_LOCAUX}retablie`,
  /** URI des sauvegardes écrites, la plus récente d'abord (rotation). */
  fichiers: `${PREFIXE_REGLAGES_LOCAUX}fichiers`,
} as const;

export interface EtatSauvegarde {
  dossier: string | null;
  fournisseur: ReturnType<typeof fournisseur>;
  frequence: Frequence;
  garder: number;
  lisible: boolean;
  derniere: number | null;
  echec: number | null;
  retablie: boolean;
}

const nombre = (v: string | null) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export async function lireEtatSauvegarde(db: Executeur): Promise<EtatSauvegarde> {
  const dossier = await lireReglage(db, R.dossier);
  const f = (await lireReglage(db, R.frequence)) as Frequence | null;
  const retablie = await lireReglage(db, R.retablie);
  return {
    dossier,
    fournisseur: dossier ? fournisseur(dossier) : null,
    frequence: f && FREQUENCES.includes(f) ? f : "jamais",
    garder: nombre(await lireReglage(db, R.garder)) ?? GARDE_DEFAUT,
    lisible: (await lireReglage(db, R.lisible)) === "1",
    derniere: nombre(await lireReglage(db, R.derniere)),
    echec: nombre(await lireReglage(db, R.echec)),
    retablie: retablie != null && retablie === (await lireReglage(db, R.derniere)),
  };
}

export const reglerFrequence = (db: Executeur, f: Frequence) => ecrireReglage(db, R.frequence, f);
export const reglerGarde = (db: Executeur, n: number) => ecrireReglage(db, R.garder, String(n));
export const reglerLisible = (db: Executeur, v: boolean) => ecrireReglage(db, R.lisible, v ? "1" : "0");

/** Sélecteur de dossier du système ; false si l'utilisateur annule. La permission est gardée (persistante). */
export async function choisirDossier(db: Executeur): Promise<boolean> {
  let d: Directory;
  try {
    d = await Directory.pickDirectoryAsync();
  } catch {
    return false;
  }
  if (!d?.uri) return false;
  await ecrireReglage(db, R.dossier, d.uri);
  return true;
}

/** Chiffrée sans phrase connue : l'appelant propose de la créer (ou la sauvegarde lisible). */
export class PhraseManquante extends Error {}
export class DossierManquant extends Error {}

let enCours: Promise<Bilan> | null = null;

/** Une sauvegarde complète dans le dossier choisi, puis la rotation ; deux appels rapprochés partagent la même. */
export function sauvegarderMaintenant(db: Executeur): Promise<Bilan> {
  enCours ??= (async () => {
    const e = await lireEtatSauvegarde(db);
    if (!e.dossier) throw new DossierManquant();
    await pret();
    const phrase = e.lisible ? null : ((await phrasesConnues())[0] ?? null);
    if (!e.lisible && !phrase) throw new PhraseManquante();
    try {
      const maintenant = Date.now();
      const f = new Directory(e.dossier).createFile(nomSauvegarde(maintenant, await lireReglage(db, "pseudo").catch(() => null)), "application/octet-stream");
      const h = f.open(FileMode.Truncate);
      let bilan: Bilan;
      try {
        bilan = await sauvegarder(db, fichiers, { ecrire: (o) => h.writeBytes(o) }, phrase, maintenant);
      } catch (err) {
        h.close();
        try {
          f.delete();
        } catch {
          // fichier déjà absent
        }
        throw err;
      }
      h.close();
      await ecrireReglage(db, R.derniere, String(maintenant));
      await db.runAsync("DELETE FROM reglages WHERE cle = ?", [R.echec]);
      if (e.echec != null) await ecrireReglage(db, R.retablie, String(maintenant));
      else await db.runAsync("DELETE FROM reglages WHERE cle = ?", [R.retablie]);
      await tourner(db, f.uri, e.garder);
      return bilan;
    } catch (err) {
      if (e.echec == null) await ecrireReglage(db, R.echec, String(Date.now()));
      throw err;
    }
  })().finally(() => {
    enCours = null;
  });
  return enCours;
}

async function tourner(db: Executeur, nouvelle: string, garder: number): Promise<void> {
  let connues: string[] = [];
  try {
    connues = JSON.parse((await lireReglage(db, R.fichiers)) ?? "[]") as string[];
  } catch {
    // liste illisible : on repart de la nouvelle
  }
  const r = rotation(connues, nouvelle, garder);
  const restent: string[] = [];
  for (const u of r.effacer) {
    try {
      const f = new File(u);
      if (f.exists) f.delete();
    } catch {
      restent.push(u); // dossier devenu inaccessible : on réessaiera
    }
  }
  await ecrireReglage(db, R.fichiers, JSON.stringify([...r.liste, ...restent]));
}

/** Au lancement et au retour au premier plan : une sauvegarde si elle est due. Silencieuse ; l'échec reste affiché. */
export async function sauvegarderSiDue(db: Executeur): Promise<boolean> {
  const e = await lireEtatSauvegarde(db);
  if (!e.dossier || !sauvegardeDue(e.frequence, e.derniere, Date.now())) return false;
  // Un échec récent (moins d'une heure) n'est pas retenté à chaque retour au premier plan.
  if (e.echec != null && Date.now() - e.echec < 3_600_000 && (e.derniere == null || e.echec > e.derniere)) return false;
  await sauvegarderMaintenant(db);
  return true;
}

// Restauration : le fichier choisi est copié dans le cache par le sélecteur, puis lu par morceaux.

const entreeFichier = (f: File): Entree & { fermer(): void } => {
  const h = f.open(FileMode.ReadOnly);
  return { lire: (n) => h.readBytes(n), fermer: () => h.close() };
};

export interface FichierChoisi {
  uri: string;
  entete: Entete;
  /** Une phrase de ce téléphone l'ouvre déjà (ou elle est lisible) : pas de saisie. */
  phraseConnue: string | null;
}

/** Sélecteur de fichier puis en-tête ; null si annulé. Lève ErreurSauvegarde si ce n'est pas une sauvegarde de pepfit. */
export async function choisirFichier(): Promise<FichierChoisi | null> {
  const { getDocumentAsync } = await import("expo-document-picker");
  const r = await getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
  if (r.canceled || !r.assets[0]) return null;
  const uri = r.assets[0].uri;
  await pret();
  const e = entreeFichier(new File(uri));
  let entete: Entete;
  try {
    entete = await lireEntete(e);
  } finally {
    e.fermer();
  }
  const phraseConnue = entete.chiffre ? ((await phrasesConnues()).find((p) => phraseOuvre(entete, p)) ?? null) : "";
  return { uri, entete, phraseConnue };
}

/** Restaure le fichier choisi ; la phrase est celle connue ou saisie. Le cache est vidé ensuite. */
export async function restaurer(db: Executeur, choisi: FichierChoisi, phrase: string | null, mode: Mode): Promise<void> {
  const f = new File(choisi.uri);
  const e = entreeFichier(f);
  try {
    const schema = (await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version", []))?.user_version ?? 0;
    const contenu = await lireSauvegarde(e, phrase ? [phrase] : [], fichiers, schema);
    await appliquerSauvegarde(db, contenu, mode);
  } finally {
    e.fermer();
    if (f.uri.startsWith(Paths.cache.uri)) {
      try {
        f.delete();
      } catch {
        // le cache sera vidé par le système
      }
    }
  }
  if (mode === "remplacer") await menagePhotos(db);
}
