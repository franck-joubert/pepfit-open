// Identifiants développeur gardés dans le coffre du téléphone (expo-secure-store), jamais dans la base ni dans une sauvegarde.
// Sans identifiants gardés, ceux de la construction (EXPO_PUBLIC_*) servent s'ils sont complets.
import * as SecureStore from "../coffre";
import { aProposer, cleIdentifiants as cle, lireIdentifiants, type Fournisseur, type Identifiants, type Prerempli } from "./modele";

export { COFFRE_IDENTIFIANTS, FOURNISSEURS, REDIRECTION_APPLI, redirectionValide, type Fournisseur, type Identifiants } from "./modele";

// Chaque variable est écrite en entier (process.env.EXPO_PUBLIC_…) : Metro ne remplace que les accès littéraux.
const PREREMPLI: Record<Fournisseur, Prerempli> = {
  whoop: { clientId: process.env.EXPO_PUBLIC_WHOOP_CLIENT_ID, clientSecret: process.env.EXPO_PUBLIC_WHOOP_CLIENT_SECRET, redirection: process.env.EXPO_PUBLIC_WHOOP_REDIRECT_URI },
  withings: { clientId: process.env.EXPO_PUBLIC_WITHINGS_CLIENT_ID, clientSecret: process.env.EXPO_PUBLIC_WITHINGS_CLIENT_SECRET, redirection: process.env.EXPO_PUBLIC_WITHINGS_REDIRECT_URI },
  polar: { clientId: process.env.EXPO_PUBLIC_POLAR_CLIENT_ID, clientSecret: process.env.EXPO_PUBLIC_POLAR_CLIENT_SECRET, redirection: process.env.EXPO_PUBLIC_POLAR_REDIRECT_URI },
};

async function gardes(f: Fournisseur): Promise<Identifiants | null> {
  const brut = await SecureStore.getItemAsync(cle(f));
  try {
    return brut ? lireIdentifiants(JSON.parse(brut)) : null;
  } catch {
    return null;
  }
}

/** Les identifiants à utiliser ; null s'ils manquent (l'écran des identifiants s'ouvre alors). */
export async function identifiants(f: Fournisseur): Promise<Identifiants | null> {
  return (await gardes(f)) ?? lireIdentifiants(aProposer(f, null, PREREMPLI[f]));
}

/** Ce que l'écran affiche au départ. */
export async function identifiantsAProposer(f: Fournisseur): Promise<Identifiants> {
  return aProposer(f, await gardes(f), PREREMPLI[f]);
}

/** Garde des identifiants complets ; faux s'ils ne le sont pas. */
export async function garderIdentifiants(f: Fournisseur, i: Identifiants): Promise<boolean> {
  const ok = lireIdentifiants(i);
  if (!ok) return false;
  await SecureStore.setItemAsync(cle(f), JSON.stringify(ok));
  return true;
}

export const oublierIdentifiants = (f: Fournisseur) => SecureStore.deleteItemAsync(cle(f));

