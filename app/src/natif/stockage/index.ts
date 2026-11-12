// iOS et web : pas d'accès gardés à rendre, pas de dossier externe pour le diagnostic.
export const stockage = {
  rendreAcces: async (): Promise<void> => {},
  ecrireDiagnostic: async (_nom: string, _contenu: string): Promise<boolean> => false,
};
