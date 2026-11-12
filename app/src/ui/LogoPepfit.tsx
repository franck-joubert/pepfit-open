import { View } from "react-native";
import { SvgXml } from "react-native-svg";
import { useTheme } from "../theme";
import { formeLogo } from "./logo";
import { logoJour, logoNuit, symboleJour, symboleNuit } from "./logo-pepfit";

/** Logo pepfit du kit (couleur, version nuit la nuit) ; sous 80 px de large, le symbole « p. ». */
export function LogoPepfit({ largeur }: { largeur: number }) {
  const { mode } = useTheme();
  const f = formeLogo(largeur);
  const xml = f.forme === "logo" ? (mode === "nuit" ? logoNuit : logoJour) : mode === "nuit" ? symboleNuit : symboleJour;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="pepfit" style={{ width: f.largeur, height: f.hauteur }}>
      <SvgXml xml={xml} width={f.largeur} height={f.hauteur} />
    </View>
  );
}
