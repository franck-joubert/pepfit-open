import { Text, type TextProps } from "react-native";
import { useTheme } from "../theme";
import { POLICE_MAX, typo, type VarianteTexte } from "../theme/typo";
import type { Jetons } from "../theme/jetons";

interface Props extends TextProps {
  variante?: VarianteTexte;
  couleur?: keyof Jetons;
}

export function Texte({ variante = "corps", couleur = "t1", style, maxFontSizeMultiplier = POLICE_MAX, ...reste }: Props) {
  const { couleurs } = useTheme();
  return <Text maxFontSizeMultiplier={maxFontSizeMultiplier} {...reste} style={[typo[variante], { color: couleurs[couleur] }, style]} />;
}
