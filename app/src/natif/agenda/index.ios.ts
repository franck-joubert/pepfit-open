import { requireOptionalNativeModule } from "expo";
import { fabriquerAgendaIos, type NatifAgendaIos } from "./ios";

// iPhone : le module natif d'expo-calendar, comme sur Android ; ses écarts sont dans ./ios.ts (docs/CODE-IOS-DIVERS.md).
export type { Acces, Calendrier, DetailsEvenement } from "./types";

const a = fabriquerAgendaIos(requireOptionalNativeModule<NatifAgendaIos>("ExpoCalendar"));

export const disponible = a.disponible;
export const lireAcces = a.lireAcces;
export const demanderAcces = a.demanderAcces;
export const calendriers = a.calendriers;
export const evenements = a.evenements;
export const evenement = a.evenement;
export const creerEvenement = a.creerEvenement;
export const modifierEvenement = a.modifierEvenement;
export const supprimerEvenement = a.supprimerEvenement;
export const creerAgendaLocal = a.creerAgendaLocal;
