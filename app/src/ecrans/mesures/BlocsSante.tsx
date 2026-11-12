// Page Santé, sous le bloc Énergie (planche pas § 1 quater, validée le 28/10) : Récupération et Effort côte à côte (Effort en
// orange Sport). Même verre que les cases et le bilan ; chacun ouvre sa page. L'Âge pepfit n'a plus de carte ici : il vit
// dans la poitrine du personnage, avec sa case (planches/age-coeur, D1 du 29/10).
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { police, rayon } from "../../theme/typo";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { nombre } from "../format";
import { phraseRecup } from "./recup-vue";
import { texteEffort } from "./scores-calc";
import type { ResumeEffort, ResumeRecup } from "./scores-donnees";

const MARGE = 16;

function Case({ titre, valeur, unite, sous, lignes = 1, onPress, libelle }: { titre: string; valeur: string; unite?: string; sous: string; lignes?: number; onPress: () => void; libelle: string }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      onPress={onPress}
      style={({ pressed }) => [styles.case, { backgroundColor: pressed ? couleurs.s2 : couleurs.verreCarte, borderColor: couleurs.verreFilet }]}
    >
      <View style={styles.titre}>
        <Texte variante="meta" couleur="t2">
          {titre}
        </Texte>
        <Icone nom="right" couleur={couleurs.t3} taille={14} epaisseur={2} />
      </View>
      <Texte numberOfLines={1} style={styles.valeur}>
        {valeur}
        {unite ? <Texte variante="meta" couleur="t2">{` ${unite}`}</Texte> : null}
      </Texte>
      <Texte variante="meta" couleur="t3" numberOfLines={lignes} style={{ marginTop: 2 }}>
        {sous}
      </Texte>
    </Pressable>
  );
}

/** Récupération pepfit (« 90 % » et la phrase d'action, planche recuperation écran 5) et Effort pepfit côte à côte. */
/** `jour` : le jour choisi dans le semainier de la page Santé, passé à la page ouverte. */
export function ScoresSante({ recup, effort, jour }: { recup: ResumeRecup | null | undefined; effort: ResumeEffort | null | undefined; jour: number }) {
  const r = recup;
  const e = effort;
  const titreR = t("accueil.blocs.recuperation");
  const titreE = t("accueil.blocs.effort");
  const ouvrirR = () => router.push({ pathname: "/sante/recuperation", params: { jour: String(jour) } });
  const ouvrirE = () => router.push({ pathname: "/sante/effort", params: { jour: String(jour) } });
  return (
    <View style={styles.rangee}>
      {r && r.score != null && r.niveau ? (
        <Case
          titre={titreR}
          valeur={nombre(r.score, 0)}
          unite="%"
          sous={phraseRecup(r.niveau, r.prudent, r.feminin)}
          lignes={2}
          onPress={ouvrirR}
          libelle={`${titreR} ${t("recup.pourcent", { n: nombre(r.score, 0) })}, ${phraseRecup(r.niveau, r.prudent, r.feminin)}`}
        />
      ) : (
        <Case titre={titreR} valeur="–" sous={t("recup.caseSans")} onPress={ouvrirR} libelle={`${titreR}, ${t("recup.caseSans")}`} />
      )}
      {e && e.score != null ? (
        <Case
          titre={titreE}
          valeur={texteEffort(e.score)}
          sous={e.activite ? t("cartes.activite", { nom: e.activite.nom.toLowerCase(), m: nombre(e.activite.minutes, 0) }) : t("cartes.effortDuJour")}
          onPress={ouvrirE}
          libelle={`${titreE} ${texteEffort(e.score)}`}
        />
      ) : (
        <Case titre={titreE} valeur="–" sous={t("cartes.effortPasNote")} onPress={ouvrirE} libelle={`${titreE}, ${t("cartes.effortPasNote")}`} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rangee: { flexDirection: "row", gap: 12, marginHorizontal: MARGE, marginTop: 12 },
  case: { flex: 1, minHeight: 88, paddingVertical: 12, paddingHorizontal: 14, borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth },
  titre: { flexDirection: "row", alignItems: "center", gap: 2 },
  valeur: { fontFamily: police.semibold, fontSize: 20, lineHeight: 26, marginTop: 4, fontVariant: ["tabular-nums"] },
});
