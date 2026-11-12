import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { chargerGarde } from "../../circuits/chargement";
import { SUIVRE_DISPONIBLE } from "../../circuits/page";
import type { Circuit } from "../../circuits/types";
import { traceGeoJson, vueDuCircuit, type VueCircuit } from "../../circuits/vue";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { espace } from "../../theme/typo";
import { revenir } from "../../ui/revenir";
import { Texte } from "../../ui/Texte";
import { useApp } from "../contexte";
import { BoutonSuivre } from "./BoutonSuivre";
import { CarteTracePleine } from "./CarteTracePleine";
import { resumeCircuit } from "./texte";

// La carte d'un circuit en plein écran (planche Circuits, lot C2) : on charge le circuit, CarteTracePleine fait le reste (la carte du bas
// rappelle le circuit et propose de le suivre).

export function CartePleine({ id }: { id: string }) {
  const { db } = useApp();
  const { couleurs } = useTheme();
  const [circuit, setCircuit] = useState<Circuit | null | undefined>(undefined);
  useEffect(() => {
    chargerGarde(db, id)
      .then((g) => setCircuit(g?.circuit ?? null))
      .catch(() => setCircuit(null));
  }, [db, id]);
  // Le circuit n'est plus sur le téléphone (retiré entre-temps) : on revient à la page, qui le dit.
  useEffect(() => {
    if (circuit === null) revenir();
  }, [circuit]);
  const vue = useMemo(() => (circuit ? vueDuCircuit(circuit) : null), [circuit]);
  if (!circuit || !vue) return <View style={[styles.page, { backgroundColor: couleurs.bg }]} />;
  return <CarteOuverte circuit={circuit} vue={vue} />;
}

function CarteOuverte({ circuit, vue }: { circuit: Circuit; vue: VueCircuit }) {
  const { couleurs } = useTheme();
  const trace = useMemo(() => traceGeoJson(vue, couleurs.altBas, couleurs.altHaut, couleurs.t3), [vue, couleurs.altBas, couleurs.altHaut, couleurs.t3]);
  return (
    <CarteTracePleine
      trace={trace}
      vue={vue}
      bbox={circuit.bbox}
      arrivee={circuit.type === "lineaire"}
      libelles={{ pleine: t("circuit.carte.pleine"), tout: t("circuit.carte.toutLeCircuit"), loin: t("circuit.carte.loin") }}
      bas={
        <>
          <Texte variante="exercice" numberOfLines={1} accessibilityRole="header">
            {circuit.nom}
          </Texte>
          <Texte variante="libelle" couleur="t2" numberOfLines={1} style={styles.resume}>
            {resumeCircuit(circuit)}
          </Texte>
          {SUIVRE_DISPONIBLE ? <BoutonSuivre circuit={circuit} style={styles.suivre} /> : null}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  resume: { marginTop: 2 },
  suivre: { marginTop: espace.m },
});
