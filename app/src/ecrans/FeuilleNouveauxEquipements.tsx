import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  annulerTraitement, confirmerEquipement, equipementsDetectes, ignorerEquipement, toutConfirmer,
  type EquipementDetecte, type StatutDetecte,
} from "../db";
import { useTheme } from "../theme";
import { espace } from "../theme/typo";
import { Bouton } from "../ui/Bouton";
import { BoutonPrincipal } from "../ui/Degrade";
import { Feuille } from "../ui/Feuille";
import { Picto } from "../ui/Picto";
import { Texte } from "../ui/Texte";
import { useApp } from "./contexte";
import { charge } from "./format";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";

/** Équipements vus en séance et absents de l'inventaire (ou charge au-dessus du max) : une ligne chacun, Ignorer / Confirmer, annulable. */
export function FeuilleNouveauxEquipements({ visible, salleId, onFermer, onChange }: { visible: boolean; salleId: string | null; onFermer: () => void; onChange: () => void }) {
  const { db, reglages } = useApp();
  useLangue();
  const { couleurs } = useTheme();
  const [lignes, setLignes] = useState<EquipementDetecte[]>([]);
  const [statuts, setStatuts] = useState<Record<string, StatutDetecte>>({});

  useEffect(() => {
    if (!visible || !salleId) return;
    equipementsDetectes(db, salleId)
      .then((l) => {
        setLignes(l);
        setStatuts({});
      })
      .catch((e) => console.error(e));
  }, [visible, salleId, db]);

  const statut = (l: EquipementDetecte) => statuts[l.id] ?? "a_confirmer";
  const poser = (id: string, s: StatutDetecte) => setStatuts((x) => ({ ...x, [id]: s }));
  const agir = (f: () => Promise<unknown>, apres: () => void) =>
    f()
      .then(() => {
        apres();
        onChange();
      })
      .catch((e) => console.error(e));
  const restants = lignes.filter((l) => statut(l) === "a_confirmer");

  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("salles.nouveauxEquipements")}
      pied={
        restants.length ? (
          <BoutonPrincipal
            libelle={t("salles.toutConfirmer")}
            onPress={() => {
              if (!salleId) return;
              const ids = restants.map((l) => l.id);
              agir(() => toutConfirmer(db, salleId), () => ids.forEach((id) => poser(id, "confirme")));
            }}
          />
        ) : (
          <Bouton libelle={t("ui.fermer")} variante="tonal" large onPress={onFermer} />
        )
      }
    >
      {lignes.map((l) => {
        const s = statut(l);
        const detail = l.nouveau
          ? l.exerciceNom
          : `${l.exerciceNom}, ${charge(l.plafondKg, reglages.unite)} ${reglages.unite}`;
        return (
          <View key={l.id} style={styles.ligne}>
            <Picto slug={l.exerciceSlug} nom={l.exerciceNom} taille={40} />
            <View style={{ flex: 1 }}>
              <Texte variante="exercice" numberOfLines={1}>
                {l.libelle}
              </Texte>
              <Texte variante="meta" couleur="t2" numberOfLines={1}>
                {detail}
              </Texte>
            </View>
            {s === "a_confirmer" ? (
              <View style={styles.actions}>
                <Bouton libelle={t("salles.ignorer")} variante="tonal" onPress={() => agir(() => ignorerEquipement(db, l.id), () => poser(l.id, "ignore"))} />
                <Bouton libelle={t("salles.confirmer")} variante="tonal" onPress={() => agir(() => confirmerEquipement(db, l.id), () => poser(l.id, "confirme"))} />
              </View>
            ) : (
              <View style={styles.actions}>
                <Texte variante="meta" style={{ color: s === "confirme" ? couleurs.valide : couleurs.t3 }}>
                  {s === "confirme" ? t("salles.confirme") : t("salles.ignore")}
                </Texte>
                <Bouton libelle={t("ui.annuler")} variante="tonal" onPress={() => agir(() => annulerTraitement(db, l.id), () => poser(l.id, "a_confirmer"))} />
              </View>
            )}
          </View>
        );
      })}
    </Feuille>
  );
}

const styles = StyleSheet.create({
  ligne: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.m },
  actions: { flexDirection: "row", alignItems: "center", gap: espace.s },
});
