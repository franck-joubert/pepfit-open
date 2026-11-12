// Web : pas de lecture native, on garde document.cookie.
export const cookies = {
  lire: async (_url: string): Promise<string> => "",
  effacer: async (): Promise<void> => {},
};
