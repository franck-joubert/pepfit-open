import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { nomDeCircuit } from "../../circuits/construire";
import { NOM_MAX } from "../../circuits/regles";
import { ACTIVITES_CIRCUIT, type ActiviteCircuit, type Circuit } from "../../circuits/types";
import { modifierCircuit, supprimerCircuit } from "../../db/depots/circuits";
import { t } from "../../i18n/index";
import { espace } from "../../theme/typo";
import { BoutonTonal } from "../../ui/BoutonTonal";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { Texte } from "../../ui/Texte";
import { useApp } from "../contexte";
import { Champ } from "../briques";
import { montrerBref } from "../bref";
import { ChoixActivites } from "./ChoixActivites";

// Le menu ⋯ d'un circuit (planche Circuits, e3) : modifier le nom et les activités, le supprimer. Une seule feuille à plusieurs pas
// (flèche de retour), comme les feuilles à étapes de l'appli.

type Etape = "menu" | "modifier" | "supprimer";

export function MenuCircuit({
  circuit,
  visible,
  onFermer,
  onChange,
  onSupprime,
}: {
  circuit: Circuit;
  visible: boolean;
  onFermer: () => void;
  /** Le circuit a changé sur le téléphone : la page le relit. */
  onChange: () => void;
  /** Le circuit n'existe plus : la page se ferme. */
  onSupprime: () => void;
}) {
  const { db } = useApp();
  const [etape, setEtape] = useState<Etape>("menu");
  const [nom, setNom] = useState(circuit.nom);
  const [activites, setActivites] = useState<ActiviteCircuit[]>(circuit.activites);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setEtape("menu");
    setNom(circuit.nom);
    setActivites(circuit.activites);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const occuper = async (f: () => Promise<void>) => {
    if (occupe) return;
    setOccupe(true);
    try {
      await f();
    } catch (e) {
      console.warn(e);
    } finally {
      setOccupe(false);
    }
  };

  const enregistrer = () =>
    occuper(async () => {
      const n = nomDeCircuit(nom);
      if (!n || !activites.length) return;
      const ordre = ACTIVITES_CIRCUIT.filter((a) => activites.includes(a));
      await modifierCircuit(db, circuit.id, { nom: n, activites: ordre });
      onChange();
      onFermer();
    });

  const supprimer = () =>
    occuper(async () => {
      await supprimerCircuit(db, circuit.id);
      onFermer();
      montrerBref(t("circuit.supprime"), true);
      onSupprime();
    });

  const titre = {
    menu: t("circuit.menu.titre"),
    modifier: t("circuit.modifier.titre"),
    supprimer: t("circuit.supprimer.titre"),
  }[etape];
  const nomValide = nomDeCircuit(nom) != null && activites.length > 0;

  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={titre}
      onRetour={etape === "menu" ? undefined : () => setEtape("menu")}
      pied={
        etape === "modifier" ? (
          <BoutonPrincipal libelle={t("circuit.modifier.enregistrer")} desactive={!nomValide || occupe} onPress={enregistrer} />
        ) : etape === "supprimer" ? (
          <View style={styles.pied}>
            <BoutonTonal libelle={t("circuit.supprimer.confirmer")} danger desactive={occupe} onPress={supprimer} />
            <BoutonTonal libelle={t("ui.annuler")} onPress={() => setEtape("menu")} />
          </View>
        ) : undefined
      }
    >
      {etape === "menu" ? (
        <Groupe>
          <Option premier icone="crayon" libelle={t("circuit.menu.modifier")} onPress={() => setEtape("modifier")} />
          <Option icone="trash" libelle={t("circuit.menu.supprimer")} aide={t("circuit.menu.supprimerAide")} onPress={() => setEtape("supprimer")} />
        </Groupe>
      ) : null}

      {etape === "modifier" ? (
        <View style={styles.formulaire}>
          <Champ serre value={nom} onChangeText={setNom} maxLength={NOM_MAX} autoCapitalize="sentences" accessibilityLabel={t("circuit.modifier.nom")} placeholder={t("circuit.modifier.nom")} />
          <ChoixActivites valeur={activites} onChange={setActivites} />
          {activites.length ? null : (
            <Texte variante="corps" couleur="t2" accessibilityLiveRegion="polite">
              {t("circuit.modifier.activiteUne")}
            </Texte>
          )}
        </View>
      ) : null}

      {etape === "supprimer" ? (
        <Texte variante="libelle" couleur="t2" style={styles.texte}>
          {t("circuit.supprimer.texte")}
        </Texte>
      ) : null}

    </Feuille>
  );
}

const styles = StyleSheet.create({
  formulaire: { gap: espace.m, paddingBottom: espace.s },
  pied: { gap: espace.s },
  texte: { paddingBottom: espace.s },
});
