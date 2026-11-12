// Étape « réglages » du parcours (planche ajout-seance-v2, reglages-defaut, reglages-modifier) : deux lignes,
// Quand et Durée sur une même ligne, puis Lieu. « Répéter » n'apparaît qu'en
// Modifier (D2). Le bouton du pied est celui du geste : « Ajouter » ou « Enregistrer ».
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Icone, type NomIcone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { EnTete } from "./Etapes";

/** Ligne de la carte : icône, libellé, valeur à droite, chevron. */
function Ligne({ icone, libelle, valeur, filet, onPress, fort }: { icone: NomIcone; libelle: string; valeur: string; filet?: boolean; onPress: () => void; fort?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${libelle}, ${valeur}`}
      onPress={onPress}
      style={({ pressed }) => [styles.ligne, filet && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }, pressed && { backgroundColor: couleurs.s3 }]}
    >
      <Icone nom={icone} couleur={couleurs.t2} taille={20} />
      <Texte numberOfLines={1} style={[styles.libelle, { color: couleurs.t1 }]}>
        {libelle}
      </Texte>
      <Texte numberOfLines={1} style={[styles.valeur, { color: fort ? couleurs.t1 : couleurs.t2 }, fort && { fontFamily: police.semibold }]}>
        {valeur}
      </Texte>
      <Icone nom="right" couleur={couleurs.t3} taille={16} />
    </Pressable>
  );
}

/** Une moitié de la ligne « Quand | Durée » : icône et valeur, 56 de haut, zone de toucher entière. */
function Moitie({ icone, valeur, libelle, fort, filet, flexible, onPress }: { icone: NomIcone; valeur: string; libelle: string; fort?: boolean; filet?: boolean; flexible?: boolean; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${libelle}, ${valeur}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.moitie,
        flexible ? { flex: 1, minWidth: 0 } : { flexShrink: 0 },
        filet && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: couleurs.line2 },
        pressed && { backgroundColor: couleurs.s3 },
      ]}
    >
      <Icone nom={icone} couleur={couleurs.t2} taille={20} />
      <Texte numberOfLines={1} style={[styles.valeur, { flexShrink: 1, color: fort ? couleurs.t1 : couleurs.t2 }, fort && { fontFamily: police.semibold }]}>
        {valeur}
      </Texte>
    </Pressable>
  );
}

export function EtapeReglages({
  visuel,
  titre,
  quand,
  duree,
  lieu,
  repeter,
  libelleBouton,
  pret,
  enCours,
  erreur,
  onRetour,
  onQuand,
  onDuree,
  onLieu,
  onRepeter,
  onValider,
}: {
  visuel: ReactNode;
  titre: string;
  quand: string;
  duree: string;
  lieu: string;
  /** « Chaque semaine »… ; absent : la ligne n'existe pas (Ajouter, séance déjà répétée). */
  repeter?: string;
  libelleBouton: string;
  pret: boolean;
  enCours: boolean;
  /** Message d'un refus (hors ligne, heure passée) ; sinon rien. */
  erreur: string | null;
  onRetour: () => void;
  onQuand: () => void;
  onDuree: () => void;
  onLieu: () => void;
  onRepeter: () => void;
  onValider: () => void;
}) {
  const { couleurs } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <EnTete titre={titre} visuel={visuel} onRetour={onRetour} />
      <View style={[styles.carte, { backgroundColor: couleurs.feuilleGroupe }]}>
        <View style={styles.ranguee}>
          <Moitie icone="cal" libelle={t("ps.quand")} valeur={quand} fort flexible onPress={onQuand} />
          <Moitie icone="timer" libelle={t("ps.duree")} valeur={duree} filet onPress={onDuree} />
        </View>
        <Ligne icone="place" libelle={t("ps.lieu")} valeur={lieu} filet onPress={onLieu} />
        {repeter != null ? <Ligne icone="repeat" libelle={t("ps.repeter")} valeur={repeter} filet onPress={onRepeter} /> : null}
      </View>
      {erreur ? (
        <Texte variante="meta" style={{ color: couleurs.rate, marginTop: espace.m, marginHorizontal: espace.xs }}>
          {erreur}
        </Texte>
      ) : null}
      <View style={styles.pied}>
        <BoutonPrincipal libelle={libelleBouton} onPress={onValider} desactive={!pret || enCours} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  carte: { borderRadius: rayon.l, overflow: "hidden" },
  ligne: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l },
  ranguee: { flexDirection: "row" },
  moitie: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l },
  libelle: { fontFamily: police.regular, fontSize: 15, flexGrow: 1, flexShrink: 0 },
  valeur: { fontFamily: police.regular, fontSize: 15, textAlign: "right", flexShrink: 1 },
  pied: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
