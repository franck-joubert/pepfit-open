// Feuilles des écrans Blessures et Compléments : un jour (roues), un texte court, des choix, l'ajout au journal.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PanResponder, Pressable, StyleSheet, TextInput, View } from "react-native";
import type { TypeJournal } from "../db";
import { SIGNES, type Signe } from "../db/zones-blessure";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { espace, police, POLICE_MAX, rayon } from "../theme/typo";
import { Bouton } from "../ui/Bouton";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { Texte } from "../ui/Texte";
import { RoueDate } from "./FeuillePesee";
import { instantDe, jourDe } from "./planif-donnees";
import { Boutons } from "./suivi-ui";

/** Un jour (AAAA-MM-JJ) choisi aux roues ; « Valider » en bas, fermer sans valider ne change rien. `autre` : action en plus (rouge). */
export function FeuilleJour({
  visible,
  titre,
  valeur,
  onFermer,
  onValider,
  autre,
}: {
  visible: boolean;
  titre: string;
  valeur: string;
  onFermer: () => void;
  onValider: (j: string) => void;
  autre?: { libelle: string; onPress: () => void };
}) {
  useLangue();
  const ms = instantDe(valeur, "12:00");
  const [brouillon, setBrouillon] = useState(ms);
  const [ouverture, setOuverture] = useState(0);
  useEffect(() => {
    if (!visible) return;
    setBrouillon(ms);
    setOuverture((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={titre}
      glisserContenu={false}
      pied={
        <View style={{ gap: espace.s }}>
          <Bouton libelle={t("suivi.valider")} variante="primaire" large onPress={() => onValider(jourDe(brouillon))} />
          {autre ? (
            <Groupe>
              <Option premier danger libelle={autre.libelle} onPress={autre.onPress} />
            </Groupe>
          ) : null}
        </View>
      }
    >
      <RoueDate valeur={ms} onChange={setBrouillon} ouverture={ouverture} />
    </Feuille>
  );
}

/** Un texte court (nom, dose) : le champ, « Enregistrer ». */
export function FeuilleTexte({
  visible,
  titre,
  valeur,
  indice,
  onFermer,
  onValider,
}: {
  visible: boolean;
  titre: string;
  valeur: string;
  indice?: string;
  onFermer: () => void;
  onValider: (texte: string) => void;
}) {
  useLangue();
  const { couleurs } = useTheme();
  const [texte, setTexte] = useState(valeur);
  useEffect(() => {
    if (visible) setTexte(valeur);
  }, [visible, valeur]);
  const valider = () => texte.trim() && onValider(texte.trim());
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={titre} pied={<Bouton libelle={t("suivi.enregistrer")} variante="primaire" large desactive={!texte.trim()} onPress={valider} />}>
      <TextInput
        maxFontSizeMultiplier={POLICE_MAX}
        value={texte}
        onChangeText={setTexte}
        autoFocus
        placeholder={indice}
        placeholderTextColor={couleurs.t3}
        cursorColor={couleurs.partieSante}
        selectionColor={couleurs.partieSante}
        onSubmitEditing={valider}
        returnKeyType="done"
        accessibilityLabel={titre}
        style={[styles.champ, { backgroundColor: couleurs.feuilleGroupe, color: couleurs.t1 }]}
      />
    </Feuille>
  );
}

export type ChoixFeuille = { cle: string; libelle: string; aide?: string; choisi?: boolean; danger?: boolean; onPress: () => void };

/** Une liste de choix (moment, blessure liée, zone) : jamais de liste déroulante. */
export function FeuilleChoix({ visible, titre, choix, onFermer, enTete }: { visible: boolean; titre: string; choix: ChoixFeuille[]; onFermer: () => void; enTete?: ReactNode }) {
  useLangue();
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={titre}>
      {enTete}
      <Groupe>
        {choix.map((c, i) => (
          <Option key={c.cle} premier={i === 0} libelle={c.libelle} aide={c.aide} choisi={c.choisi} danger={c.danger} onPress={c.onPress} />
        ))}
      </Groupe>
    </Feuille>
  );
}

/** Barre de douleur à toucher ou glisser (0 à 10) : toute la barre est la zone de toucher (44 de haut). */
export function BarreDouleur({ valeur, onChange }: { valeur: number; onChange: (n: number) => void }) {
  const { couleurs } = useTheme();
  const largeur = useRef(1);
  const fixer = (x: number) => onChange(Math.max(0, Math.min(10, Math.ceil((x / largeur.current) * 10))));
  const f = useRef(fixer);
  f.current = fixer;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => f.current(e.nativeEvent.locationX),
      onPanResponderMove: (e) => f.current(e.nativeEvent.locationX),
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;
  return (
    <View style={styles.ligneDouleur}>
      <View
        {...pan.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t("suivi.douleurLue", { n: valeur })}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => onChange(Math.max(0, Math.min(10, valeur + (e.nativeEvent.actionName === "increment" ? 1 : -1))))}
        onLayout={(e) => (largeur.current = Math.max(1, e.nativeEvent.layout.width))}
        style={styles.barre}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <View key={i} pointerEvents="none" style={[styles.cran, { backgroundColor: i < valeur ? couleurs.rate : couleurs.s3 }]} />
        ))}
      </View>
      <Texte variante="saisie" style={{ minWidth: 44, textAlign: "right" }}>
        {t("suivi.douleurSur", { n: valeur })}
      </Texte>
    </View>
  );
}

const TYPES: readonly TypeJournal[] = ["douleur", "ressenti", "aide"];

/**
 * « Ajouter au journal » (D5) : type en trois boutons, douleur de 0 à 10 si douleur, quelques mots. Daté d'aujourd'hui.
 * Signes (planche articulations, D6) : Raideur, Gonflement, facultatifs, constatés soi-même ; pas pour « Ce qui aide ».
 */
export function FeuilleJournal({ visible, onFermer, onValider }: { visible: boolean; onFermer: () => void; onValider: (e: { type: TypeJournal; douleur: number | null; texte: string; signes: Signe[] }) => void }) {
  useLangue();
  const { couleurs } = useTheme();
  const [type, setType] = useState<TypeJournal>("douleur");
  const [douleur, setDouleur] = useState(3);
  const [texte, setTexte] = useState("");
  const [signes, setSignes] = useState<Signe[]>([]);
  useEffect(() => {
    if (!visible) return;
    setType("douleur");
    setDouleur(3);
    setTexte("");
    setSignes([]);
  }, [visible]);
  const basculer = (x: Signe) => setSignes((l) => (l.includes(x) ? l.filter((y) => y !== x) : SIGNES.filter((y) => y === x || l.includes(y))));
  const possible = type === "douleur" || !!texte.trim();
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("suivi.ajouterJournal")}
      pied={<Bouton libelle={t("suivi.enregistrer")} variante="primaire" large desactive={!possible} onPress={() => onValider({ type, douleur: type === "douleur" ? douleur : null, texte, signes: type === "aide" ? [] : signes })} />}
    >
      <Boutons options={TYPES.map((x) => ({ valeur: x, libelle: t(`suivi.type.${x}`) }))} valeur={type} onChange={setType} style={{ marginHorizontal: 0, marginTop: 0 }} />
      {type === "douleur" ? <BarreDouleur valeur={douleur} onChange={setDouleur} /> : null}
      {type === "aide" ? null : (
        <>
          <View style={styles.titreSignes}>
            <Texte variante="entete" couleur="t2" accessibilityRole="header">
              {t("suivi.signes")}
            </Texte>
            <Texte variante="meta" couleur="t2" style={{ fontFamily: police.medium }}>
              {t("suivi.facultatif")}
            </Texte>
          </View>
          <View style={styles.signes}>
            {SIGNES.map((x) => {
              const on = signes.includes(x);
              return (
                <Pressable
                  key={x}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => basculer(x)}
                  style={({ pressed }) => [
                    styles.signe,
                    { backgroundColor: on ? `${couleurs.partieSante}2e` : couleurs.feuilleGroupe },
                    on && { borderWidth: 1.5, borderColor: couleurs.partieSante, paddingLeft: 12 },
                    pressed && { transform: [{ scale: 0.98 }] },
                  ]}
                >
                  {on ? <Icone nom="check" couleur={couleurs.partieSante} taille={16} epaisseur={2.4} /> : null}
                  <Texte variante="corps" style={{ fontSize: 14, fontFamily: on ? police.medium : police.regular, color: couleurs.t1 }}>
                    {t(`suivi.signe.${x}`)}
                  </Texte>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
      <TextInput
        maxFontSizeMultiplier={POLICE_MAX}
        value={texte}
        onChangeText={setTexte}
        placeholder={t("suivi.texteCourt")}
        placeholderTextColor={couleurs.t3}
        cursorColor={couleurs.partieSante}
        selectionColor={couleurs.partieSante}
        multiline
        maxLength={280}
        accessibilityLabel={t("suivi.texteCourt")}
        style={[styles.champ, styles.multi, { backgroundColor: couleurs.feuilleGroupe, color: couleurs.t1 }]}
      />
    </Feuille>
  );
}

const styles = StyleSheet.create({
  champ: { minHeight: 52, borderRadius: rayon.l, paddingHorizontal: espace.l, fontFamily: police.regular, fontSize: 16, marginTop: espace.m },
  multi: { minHeight: 88, paddingTop: 14, textAlignVertical: "top", lineHeight: 22 },
  ligneDouleur: { flexDirection: "row", alignItems: "center", gap: espace.m, marginTop: espace.m },
  barre: { flex: 1, height: 44, flexDirection: "row", alignItems: "center", gap: 3 },
  cran: { flex: 1, height: 16, borderRadius: 3 },
  titreSignes: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: espace.xl },
  signes: { flexDirection: "row", gap: espace.s, marginTop: espace.s },
  signe: { flexDirection: "row", alignItems: "center", gap: 6, height: 44, paddingHorizontal: 16, borderRadius: 22 },
});
