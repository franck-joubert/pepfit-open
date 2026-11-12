// Web : pas de liens pep.fit dans l'appli, rien à rouvrir (l'iPhone a index.ios.ts).
export const navigateur = {
  ouvrir: (_url: string): boolean => false,
  passerDerriere: (): boolean => false,
  /** iPhone seulement (connexions OAuth, natif/navigateur/autorisation.ts). */
  authentifier: async (_url: string, _schema: string): Promise<string | null> => null,
};
