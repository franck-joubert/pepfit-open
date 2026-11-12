import { router, type Href } from "expo-router";
import { ouvrirDepuisLancement } from "./pile-lancement";

/** Ouvre la séance (ou son suivi en direct) en retirant `retirer` écrans de lancement de la pile (pile-lancement.ts). */
export const ouvrirSeance = (href: Href, retirer = 0): void => ouvrirDepuisLancement<Href>(router, href, retirer);
