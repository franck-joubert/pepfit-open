// Santé Connect pour le suivi du cycle (planche cycle, D7) : la lecture des règles, et la demande de la seule autorisation
// READ_MENSTRUATION, au bon moment (« Lire dans Santé Connect » de l'état vide, ou la source allumée dans les réglages) ; jamais
// au lancement ni avec les autorisations de la page Santé. À part pour que cycle/donnees.ts reste testable sans le module natif.
import { sante } from "../../natif/sante";
import type { LireReglesSante } from "../../cycle/donnees";

export const lireReglesAppareil: LireReglesSante = (debut, fin) => sante.regles(debut, fin);

/** L'autorisation est-elle déjà donnée ? */
export const reglesAutorisees = async () => ((await sante.autorisees().catch((): string[] => [])) as string[]).includes("regles");

/** Demande l'autorisation (une seule : règles et intensité) ; true si elle est donnée. */
export const demanderRegles = () => sante.demanderPermissions(["regles"]).catch(() => false);

/** Santé Connect est-il sur le téléphone ? */
export const santeDisponible = () => sante.disponible().catch(() => false);
