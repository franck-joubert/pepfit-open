import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance } from "react-native";
import type { DevenirRoutines, Section } from "../db";
import { useTheme } from "../theme";
import { duree } from "../theme/mouvement";
import { espace, POLICE_MAX, rayon, typo } from "../theme/typo";
import { Bouton } from "../ui/Bouton";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { Appui } from "../ui/mouvement";
import { LigneValeur } from "./FeuillesPlanif";
import { Texte } from "../ui/Texte";
import { t, tp } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";

// Feuilles des sections d'Entraînements (planche v3) : nommer (créer, renommer), menu ⋯, supprimer, déplacer une routine.

/** Créer ou renommer : un champ, clavier ouvert, et le geste principal en dégradé, grisé tant que le nom est vide. */
export function FeuilleNomSection({
  visible,
  titre,
  initial = "",
  bouton,
  libelle = t("accueil.entrainement.nomSection"),
  videPermis = false,
  onFermer,
  onValider,
}: {
  visible: boolean;
  titre: string;
  initial?: string;
  bouton: string;
  /** Libellé du champ (texte indicatif et lecteur d'écran). */
  libelle?: string;
  /** Vrai : un champ vide se valide aussi (le prénom s'efface). */
  videPermis?: boolean;
  onFermer: () => void;
  onValider: (nom: string) => void;
}) {
  useLangue();
  const { couleurs } = useTheme();
  const [nom, setNom] = useState(initial);
  const champ = useRef<TextInputInstance>(null);
  useEffect(() => {
    if (!visible) return;
    setNom(initial);
    // autoFocus part avant que la fenêtre modale soit montée : le clavier ne s'ouvrait pas.
    const id = setTimeout(() => champ.current?.focus(), duree.feuille);
    return () => clearTimeout(id);
  }, [visible, initial]);
  const vide = nom.trim() === "" && !videPermis;
  const valider = () => !vide && onValider(nom.trim());
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={titre}>
      <TextInput
        maxFontSizeMultiplier={POLICE_MAX}
        ref={champ}
        value={nom}
        onChangeText={setNom}
        selectTextOnFocus={initial !== ""}
        maxLength={60}
        returnKeyType="done"
        onSubmitEditing={valider}
        accessibilityLabel={libelle}
        placeholder={libelle}
        placeholderTextColor={couleurs.t3}
        cursorColor={couleurs.action}
        selectionColor={couleurs.action}
        style={[typo.saisie, styles.champ, { backgroundColor: couleurs.feuilleGroupe, color: couleurs.t1 }]}
      />
      <Bouton variante="primaire" large libelle={bouton} desactive={vide} onPress={valider} />
    </Feuille>
  );
}

/** Menu ⋯ d'une section : Monter est masqué sur la première, Descendre sur la dernière. */
export function FeuilleMenuSection({
  section,
  premiere,
  derniere,
  onFermer,
  onAjouter,
  libelleAjouter,
  onRenommer,
  onMonter,
  onDescendre,
  onSupprimer,
}: {
  section: Section | null;
  premiere: boolean;
  derniere: boolean;
  onFermer: () => void;
  onAjouter: () => void;
  /** Sections de la sous-page Programmes (une par type) : ni renommer ni supprimer, et « Nouveau WOD »… pour ajouter. */
  libelleAjouter?: string;
  onRenommer?: () => void;
  onMonter: () => void;
  onDescendre: () => void;
  onSupprimer?: () => void;
}) {
  useLangue();
  return (
    <Feuille visible={section != null} onFermer={onFermer} titre={section?.nom}>
      <Groupe>
        <Option premier icone="plus" libelle={libelleAjouter ?? t("accueil.entrainement.ajouterRoutine")} onPress={onAjouter} />
        {onRenommer ? <Option icone="crayon" libelle={t("accueil.entrainement.renommer")} onPress={onRenommer} /> : null}
        {premiere ? null : <Option icone="monter" libelle={t("accueil.entrainement.monter")} onPress={onMonter} />}
        {derniere ? null : <Option icone="descendre" libelle={t("accueil.entrainement.descendre")} onPress={onDescendre} />}
      </Groupe>
      {onSupprimer ? (
        <Groupe>
          <Option premier danger icone="trash" libelle={t("accueil.entrainement.supprimerSection")} onPress={onSupprimer} />
        </Groupe>
      ) : null}
    </Feuille>
  );
}

/**
 * Supprimer une section. Vide : simple confirmation. Avec des routines : par défaut, déplacées dans la première autre section ;
 * les supprimer aussi est le choix explicite, en rouge.
 */
export function FeuilleSupprimerSection({
  section,
  nb,
  autres,
  onFermer,
  onSupprimer,
}: {
  section: Section | null;
  nb: number;
  autres: Section[];
  onFermer: () => void;
  onSupprimer: (devenir: DevenirRoutines) => void;
}) {
  useLangue();
  const { couleurs } = useTheme();
  const [choix, setChoix] = useState<string>("supprimer");
  useEffect(() => {
    if (section) setChoix(autres[0]?.id ?? "supprimer");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section?.id]);
  const titre = section ? t("accueil.entrainement.supprimerNom", { nom: section.nom }) : undefined;
  if (nb === 0) {
    return (
      <Feuille visible={section != null} onFermer={onFermer} titre={titre}>
        <Groupe>
          <Option premier danger icone="trash" libelle={t("accueil.entrainement.supprimerSection")} onPress={() => onSupprimer("supprimer")} />
          <Option libelle={t("accueil.entrainement.garder")} onPress={onFermer} />
        </Groupe>
      </Feuille>
    );
  }
  return (
    <Feuille visible={section != null} onFermer={onFermer} titre={titre}>
      <Texte variante="meta" couleur="t3" style={styles.sous}>
        {tp("accueil.entrainement.nbRoutines", nb)}
      </Texte>
      <Texte variante="entete" couleur="t3" style={styles.libelle}>
        {t("accueil.entrainement.lesRoutines")}
      </Texte>
      <Groupe>
        {autres.map((s, i) => (
          <Radio
            key={s.id}
            premier={i === 0}
            libelle={t("accueil.entrainement.deplacerDansNom", { nom: s.nom })}
            choisi={choix === s.id}
            onPress={() => setChoix(s.id)}
          />
        ))}
        <Radio
          premier={autres.length === 0}
          danger
          libelle={t("accueil.entrainement.supprimerAussi")}
          choisi={choix === "supprimer"}
          onPress={() => setChoix("supprimer")}
        />
      </Groupe>
      <Appui
        accessibilityRole="button"
        accessibilityLabel={t("accueil.entrainement.supprimerSection")}
        onPress={() => onSupprimer(choix === "supprimer" ? "supprimer" : { vers: choix })}
        style={({ pressed }) => [styles.danger, { backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe }]}
      >
        <Texte variante="exercice" style={{ color: couleurs.rate }}>
          {t("accueil.entrainement.supprimerSection")}
        </Texte>
      </Appui>
    </Feuille>
  );
}

function Radio({ libelle, choisi, onPress, danger, premier }: { libelle: string; choisi: boolean; onPress: () => void; danger?: boolean; premier?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: choisi }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.radio,
        !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 },
        pressed && { backgroundColor: couleurs.s3 },
      ]}
    >
      <View style={[styles.rond, { borderColor: choisi ? couleurs.t1 : couleurs.t3 }]}>
        {choisi ? <View style={[styles.point, { backgroundColor: couleurs.t1 }]} /> : null}
      </View>
      <Texte variante="saisie" style={{ flex: 1, fontSize: 15, color: danger ? couleurs.rate : couleurs.t1 }}>
        {libelle}
      </Texte>
    </Pressable>
  );
}

/** ⋯ d'une carte : la section actuelle cochée ; toucher une autre déplace la routine et ferme. */
export function FeuilleDeplacerRoutine({
  routine,
  sections,
  onFermer,
  onChoisir,
  onNouvelle,
  libelle,
  programmation,
  onProgrammation,
}: {
  routine: { nom: string; sectionId: string | null } | null;
  sections: Section[];
  onFermer: () => void;
  onChoisir: (sectionId: string) => void;
  /** Absent : pas de « Nouvelle section » (sous-page Programmes : les sections sont les types). */
  onNouvelle?: () => void;
  /** Titre de la liste : « Déplacer dans » par défaut, « Type » pour les programmes. */
  libelle?: string;
  /** Planification (planche v7) : « Tous les lundis +1 » ou « Aucune ». */
  programmation?: string;
  onProgrammation?: () => void;
}) {
  useLangue();
  // Sans section (ou à section disparue), la routine s'affiche dans la première.
  const actuelle = sections.find((s) => s.id === routine?.sectionId)?.id ?? sections[0]?.id;
  return (
    <Feuille visible={routine != null} onFermer={onFermer} titre={routine?.nom}>
      {onProgrammation ? (
        <Groupe>
          <LigneValeur icone="cal" libelle={t("planif.programmation")} valeur={programmation} chevron onPress={onProgrammation} />
        </Groupe>
      ) : null}
      <Texte variante="entete" couleur="t3" style={styles.libelle}>
        {libelle ?? t("accueil.entrainement.deplacerDans")}
      </Texte>
      <Groupe>
        {sections.map((s, i) => (
          <Option
            key={s.id}
            premier={i === 0}
            libelle={s.nom}
            choisi={s.id === actuelle}
            onPress={() => (s.id === actuelle ? onFermer() : onChoisir(s.id))}
          />
        ))}
      </Groupe>
      {onNouvelle ? (
        <Groupe>
          <Option premier icone="plus" libelle={t("accueil.entrainement.nouvelleSection")} onPress={onNouvelle} />
        </Groupe>
      ) : null}
    </Feuille>
  );
}

const styles = StyleSheet.create({
  champ: { height: 52, borderRadius: rayon.l, paddingHorizontal: espace.l, paddingVertical: 0 },
  sous: { marginTop: -espace.s },
  libelle: { paddingHorizontal: espace.xs, marginBottom: -espace.xs },
  radio: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l },
  rond: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  point: { width: 10, height: 10, borderRadius: 5 },
  danger: { minHeight: 52, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
});
