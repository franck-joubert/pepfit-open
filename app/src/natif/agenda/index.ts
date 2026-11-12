import type { Acces, Calendrier, Creneau, DetailsEvenement, EvenementAgenda } from "./types";

export type { Acces, Calendrier, DetailsEvenement } from "./types";

// Web : pas d'agenda du téléphone (Android et iPhone ont leur index.<plateforme>.ts).
export const disponible = () => false;
export const lireAcces = async (): Promise<Acces> => "indisponible";
export const demanderAcces = async (): Promise<Acces> => "indisponible";
export const calendriers = async (): Promise<Calendrier[]> => [];
export const evenements = async (_ids: readonly string[], _de: number, _a: number): Promise<EvenementAgenda[]> => [];
export const evenement = async (_id: string): Promise<Creneau | null> => null;
export const creerEvenement = async (_calendrierId: string, _d: DetailsEvenement): Promise<string> => {
  throw new Error("agenda indisponible");
};
export const modifierEvenement = async (_id: string, _d: DetailsEvenement): Promise<void> => {};
export const supprimerEvenement = async (_id: string): Promise<void> => {};
export const creerAgendaLocal = async (_titre: string): Promise<string> => {
  throw new Error("agenda indisponible");
};
