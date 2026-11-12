import type { ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { router } from "expo-router";
import { ECRAN } from "../../aide/ecrans";
import { motsDe, morceaux } from "../../aide/recherche";
import type { EcranAide } from "../../aide/types";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { espace, police, POLICE_MAX, rayon, typo } from "../../theme/typo";
import { BoutonIcone } from "../../ui/Cadre";
import { useCouleurPartie } from "../../ui/ContextePartie";
import { Icone, type NomIcone } from "../../ui/Icone";
import { BoutonTonal } from "../../ui/BoutonTonal";
import { Texte } from "../../ui/Texte";
import * as whoop from "../../whoop";
import * as withings from "../../withings";

// Briques des écrans de l'aide (planche aide-retours, e5 à e7) : le champ de recherche, le bouton vers un écran, le titre
// surligné d'un résultat.

/** Ouvre l'écran d'une réponse ; « Reconnecter Whoop » relance la connexion, la page des connexions si elle échoue. */
export function ouvrirEcran(e: EcranAide) {
  const aller = () => router.push(ECRAN[e].route as never);
  if (e === "whoop") whoop.commencerConnexion().catch(aller);
  else if (e === "withings") withings.commencerConnexion().catch(aller);
  else aller();
}

/** Champ « Chercher dans l'aide » (48, s2) ; `retour` : la flèche de la recherche ouverte (e6), dans le même champ. */
export function ChampAide({ q, onChange, retour }: { q: string; onChange: (q: string) => void; retour?: () => void }) {
  const { couleurs } = useTheme();
  const accent = useCouleurPartie();
  return (
    <View style={[styles.rangee, retour ? styles.rangeeOuverte : null]}>
      {retour ? <BoutonIcone nom="back" libelle={t("ui.retour")} onPress={retour} /> : null}
      <View style={[styles.cherche, { backgroundColor: couleurs.s2 }]}>
        <Icone nom="search" couleur={couleurs.t3} taille={18} />
        <TextInput
          maxFontSizeMultiplier={POLICE_MAX}
          value={q}
          onChangeText={onChange}
          placeholder={t("aide.chercher")}
          placeholderTextColor={couleurs.t3}
          cursorColor={accent}
          selectionColor={accent}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={t("aide.chercher")}
          style={[typo.saisie, styles.champ, { fontFamily: police.regular, color: couleurs.t1 }]}
        />
        {q ? <BoutonIcone nom="close" taille={18} libelle={t("aide.effacerRecherche")} onPress={() => onChange("")} /> : null}
      </View>
    </View>
  );
}

/** Bouton vers un écran (« Ouvrir Appareils et connexions », « Reconnecter Whoop ») : tonal, icône de l'écran. */
export function BoutonEcran({ ecran, style }: { ecran: EcranAide; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <BoutonTonal libelle={t(ECRAN[ecran].bouton)} icone={ECRAN[ecran].icone} onPress={() => ouvrirEcran(ecran)} />
    </View>
  );
}

/** Un texte dont les mots cherchés sont en gras (« Mes **pas** **Whoop** ne remontent plus »). */
export function TexteSurligne({ texte, q, lignes }: { texte: string; q: string; lignes?: number }) {
  const parts = motsDe(q).length ? morceaux(texte, q) : [{ t: texte, fort: false }];
  return (
    <Texte variante="saisie" numberOfLines={lignes} style={styles.libelle}>
      {parts.map((p, i) =>
        p.fort ? (
          <Texte key={i} variante="saisie" style={[styles.libelle, { fontFamily: police.semibold }]}>
            {p.t}
          </Texte>
        ) : (
          p.t
        ),
      )}
    </Texte>
  );
}

/** Ligne de résultat (e6) : titre surligné, où il vit dessous, chevron ; `icone` et `sous` pour un réglage. */
export function LigneResultat({ titre, q, sous, icone, onPress, premier }: { titre: string; q: string; sous: ReactNode; icone?: NomIcone; onPress: () => void; premier?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={typeof sous === "string" ? `${titre}, ${sous}` : titre}
      onPress={onPress}
      style={({ pressed }) => [styles.ligne, !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }, pressed && { backgroundColor: couleurs.s3 }]}
    >
      {icone ? <Icone nom={icone} couleur={couleurs.t2} taille={22} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <TexteSurligne texte={titre} q={q} lignes={2} />
        {typeof sous === "string" ? (
          <Texte variante="corps" couleur="t3" numberOfLines={1} style={styles.sous}>
            {sous}
          </Texte>
        ) : (
          sous
        )}
      </View>
      <Icone nom="right" couleur={couleurs.t3} taille={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rangee: { marginHorizontal: espace.l, marginTop: espace.m },
  rangeeOuverte: { flexDirection: "row", alignItems: "center", marginLeft: espace.s, marginTop: espace.xs, gap: espace.xs },
  cherche: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, height: 48, borderRadius: rayon.l, paddingLeft: 14, paddingRight: espace.xs },
  champ: { flex: 1, height: 48, paddingVertical: 0 },
  ligne: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: espace.s, paddingLeft: espace.l, paddingRight: espace.m },
  libelle: { fontFamily: police.regular, fontSize: 15 },
  sous: { fontSize: 13, marginTop: 2 },
});
