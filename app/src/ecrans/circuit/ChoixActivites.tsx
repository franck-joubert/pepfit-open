import { Pressable, StyleSheet, View } from "react-native";
import { ACTIVITES_CIRCUIT, type ActiviteCircuit } from "../../circuits/types";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { useCouleurPartie } from "../../ui/ContextePartie";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { useVoileAcc } from "../briques";
import { pictoActivite } from "./activites";

// Les activités d'un circuit à choisir (planche Circuits, « Nouveau circuit » et « Importer un GPX ») : une puce par activité avec son picto,
// plusieurs possibles. Une puce choisie prend le voile de l'accent et un filet de l'accent ; la zone de toucher fait 44 de haut. Le même
// composant sert le menu ⋯ d'un circuit (« Modifier le nom et les activités »).

export function ChoixActivites({ valeur, onChange }: { valeur: readonly ActiviteCircuit[]; onChange: (v: ActiviteCircuit[]) => void }) {
  const { couleurs } = useTheme();
  const acc = useCouleurPartie();
  const voile = useVoileAcc();
  const basculer = (a: ActiviteCircuit) => onChange(ACTIVITES_CIRCUIT.filter((x) => (x === a ? !valeur.includes(a) : valeur.includes(x))));
  return (
    <View style={styles.puces} accessibilityRole="none">
      {ACTIVITES_CIRCUIT.map((a) => {
        const on = valeur.includes(a);
        const libelle = t(`circuit.activite.${a}`);
        return (
          <Pressable
            key={a}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={libelle}
            onPress={() => basculer(a)}
            style={[styles.puce, { backgroundColor: on ? voile : couleurs.s2, borderColor: on ? acc : "transparent" }]}
          >
            <Icone nom={pictoActivite(a)} couleur={on ? acc : couleurs.t2} taille={16} />
            <Texte variante="libelle" style={{ color: on ? couleurs.t1 : couleurs.t2, fontFamily: on ? police.semibold : police.medium }}>
              {libelle}
            </Texte>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  puces: { flexDirection: "row", flexWrap: "wrap", gap: espace.s },
  puce: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: rayon.m, borderWidth: 1 },
});
