// Coffre factice d'expo-secure-store pour les tests (voir resolveur.mjs) : un dictionnaire partagé, lisible par les tests.
const g = globalThis as unknown as { __coffreReel?: Map<string, string> };
export const reel: Map<string, string> = (g.__coffreReel ??= new Map());
export const getItemAsync = async (cle: string): Promise<string | null> => reel.get(cle) ?? null;
export const setItemAsync = async (cle: string, valeur: string): Promise<void> => void reel.set(cle, valeur);
export const deleteItemAsync = async (cle: string): Promise<void> => void reel.delete(cle);
