import type { Issue } from "./types";

export type { Issue } from "./types";

// Web : pas de fenêtre de déverrouillage du système (Android et iPhone ont leur index.<plateforme>.ts).
export const deverrouiller = async (_titre: string, _sousTitre: string): Promise<Issue> => "indisponible";
export const deverrouillageEnCours = () => false;
export const estProtege = (): boolean | null => null;
export const masquerApercu = async (_oui: boolean): Promise<boolean> => false;
