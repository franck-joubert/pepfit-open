import { StyleSheet } from "react-native";
import { espace, rayon } from "../theme/typo";

// Gabarit commun des lignes de la liste du jour (Planif : séance ; LigneRecup : Sommeil et récupérations) : une seule carte,
// un seul « … », pour qu'une ligne de récupération ait exactement la taille d'une séance (planche Effort v2.2, D10).
export const gabaritLigne = StyleSheet.create({
  seance: { borderRadius: rayon.l, paddingVertical: espace.m, paddingLeft: 14, paddingRight: espace.l, minHeight: 64, borderWidth: StyleSheet.hairlineWidth },
  seanceLigne: { flexDirection: "row", alignItems: "center", gap: espace.m },
  tuile: { width: 44, height: 44, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
  sousLigne: { flexDirection: "row", alignItems: "center", gap: espace.xs },
  options: { width: 32, height: 28, marginRight: -espace.s, borderRadius: rayon.s, alignItems: "center", justifyContent: "center" },
});
