// Bascule « liste » / « mois » en haut de toutes les pages de style agenda mensuel (retour du 29/10, point 5) :
// deux boutons d'icône côte à côte, liste à gauche, mois (icône agenda) à droite ; le choisi prend le fond s3. Zone de
// toucher 44 : 40 de haut, plus 2 de chaque côté par hitSlop, dans la marge de la bascule (revue finale n° 48). Commune
// aux agendas des pages de mesure, des entraînements et de la nutrition (ui/PageMois) : se pose à droite de l'en-tête.
//
//   const [vue, setVue] = useState<VueAgenda>("mois");
//   <BasculeVue valeur={vue} onChange={setVue} />
import { Pressable, StyleSheet, View } from "react-native";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { rayon } from "../theme/typo";
import { Icone } from "./Icone";

export type VueAgenda = "liste" | "mois";

export function BasculeVue({ valeur, onChange }: { valeur: VueAgenda; onChange: (v: VueAgenda) => void }) {
  const { couleurs } = useTheme();
  const bouton = (v: VueAgenda) => {
    const choisi = valeur === v;
    return (
      <Pressable
        key={v}
        accessibilityRole="tab"
        accessibilityState={{ selected: choisi }}
        accessibilityLabel={t(v === "liste" ? "mesures.vueListe" : "mesures.vueMois")}
        onPress={() => onChange(v)}
        hitSlop={{ top: 2, bottom: 2 }}
        style={({ pressed }) => [styles.bouton, choisi && { backgroundColor: couleurs.s3 }, pressed && !choisi && { backgroundColor: couleurs.s2 }]}
      >
        <Icone nom={v === "liste" ? "list" : "cal"} couleur={choisi ? couleurs.t1 : couleurs.t2} taille={20} />
      </Pressable>
    );
  };
  return (
    <View accessibilityRole="tablist" style={[styles.bascule, { backgroundColor: couleurs.s1 }]}>
      {bouton("liste")}
      {bouton("mois")}
    </View>
  );
}

const styles = StyleSheet.create({
  bascule: { flexDirection: "row", padding: 2, borderRadius: rayon.l, marginRight: 4 },
  bouton: { width: 44, height: 40, borderRadius: rayon.m, alignItems: "center", justifyContent: "center" },
});
