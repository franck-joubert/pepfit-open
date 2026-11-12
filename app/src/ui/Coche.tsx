import { View } from "react-native";

export function Coche({ couleur }: { couleur: string }) {
  return (
    <View
      style={{
        width: 7,
        height: 13,
        borderRightWidth: 2.5,
        borderBottomWidth: 2.5,
        borderColor: couleur,
        transform: [{ rotate: "45deg" }, { translateY: -1 }],
      }}
    />
  );
}
