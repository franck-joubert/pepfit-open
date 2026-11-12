import { requireOptionalNativeModule } from "expo";

// Module local modules/pepfit-navigateur (Kotlin) : ouvre une adresse de pep.fit dans le navigateur choisi explicitement,
// sans repasser par les App Links de l'appli (src/liens.ts). Absent d'un APK plus ancien : rien ne s'ouvre.
// passerDerriere (lot I, D9) : l'appli passe derrière (moveTaskToBack), le navigateur qui l'a ouverte revient ; absent d'un
// APK d'avant ce lot : faux, l'écran reste (l'utilisateur revient lui-même au navigateur).
interface Natif {
  ouvrir(url: string): boolean;
  passerDerriere?(): boolean;
}
const natif = requireOptionalNativeModule<Natif>("PepfitNavigateur");

export const navigateur = {
  ouvrir: (url: string): boolean => natif?.ouvrir(url) ?? false,
  passerDerriere: (): boolean => natif?.passerDerriere?.() ?? false,
  /** iPhone seulement : Android ouvre l'autorisation dans le navigateur (natif/navigateur/autorisation.ts). */
  authentifier: async (_url: string, _schema: string): Promise<string | null> => null,
};
