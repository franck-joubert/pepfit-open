import * as SecureStore from "../coffre";
import { File, Paths } from "expo-file-system";
import { nouvellePhrase, pret } from "./chiffrement";
import type { Fichiers } from "./moteur";

// Aides locales de la sauvegarde chiffrée (version libre, sans compte) : la phrase de secours gardée dans le stockage
// sécurisé du téléphone, et l'accès aux fichiers du dossier des documents (photos).

/** Phrase de secours créée par une première sauvegarde chiffrée. */
const CLE_PHRASE = "fonte.phrase"; // identifiant de protocole figé : ne pas renommer

/** Phrase locale, null s'il n'y en a pas encore. */
export const phraseLocale = () => SecureStore.getItemAsync(CLE_PHRASE);

/** Première sauvegarde chiffrée : crée et garde la phrase de secours, à montrer tout de suite. */
export async function creerPhraseLocale(): Promise<string> {
  await pret();
  const phrase = nouvellePhrase();
  await SecureStore.setItemAsync(CLE_PHRASE, phrase);
  return phrase;
}

/** Phrases qui peuvent ouvrir une sauvegarde de ce téléphone. */
export async function phrasesConnues(): Promise<string[]> {
  const p = await phraseLocale();
  return p ? [p] : [];
}

/** Fichiers du dossier des documents (photos), pour la sauvegarde. */
export const fichiers: Fichiers = {
  existe: (chemin) => new File(Paths.document, chemin).exists,
  lire: (chemin) => new File(Paths.document, chemin).bytes(),
  ecrire: async (chemin, contenu) => {
    const f = new File(Paths.document, chemin);
    if (!f.parentDirectory.exists) f.parentDirectory.create({ intermediates: true, idempotent: true });
    await f.write(contenu);
  },
};
