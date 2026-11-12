import { Image, View } from "react-native";
import { uriPhoto } from "../photos";
import { useTheme } from "../theme";
import { Icone } from "./Icone";
import { fichierPicto } from "./pictos";
import { useLiens } from "./useLiens";

// Picto A « mouvement » (D2) sur tuile s2 ; sans picto, le picto neutre (haltère). Exercice avec sa photo (planche
// exercices-perso, D2) : la vignette de la photo prend la place du picto.
export function Picto({ slug, nom, taille = 40, photo }: { slug: string | null; nom?: string | null; taille?: number; photo?: string | null }) {
  const { couleurs } = useTheme();
  useLiens(); // un exercice perso relié au catalogue change de picto
  const src = fichierPicto(slug, nom, taille);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: taille,
        height: taille,
        borderRadius: taille >= 40 ? 10 : 8,
        backgroundColor: couleurs.s2,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {photo ? (
        <Image source={{ uri: uriPhoto(photo) }} style={{ width: taille, height: taille }} resizeMode="cover" />
      ) : src != null ? (
        <Image source={src} style={{ width: taille, height: taille }} resizeMode="contain" />
      ) : (
        <Icone nom="dumbbell" couleur={couleurs.t3} taille={Math.round(taille * 0.55)} />
      )}
    </View>
  );
}
