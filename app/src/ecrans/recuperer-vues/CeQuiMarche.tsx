// « Ce qui marche pour toi » (planche recuperer, écran 9) : la VFC du lendemain, les jours où l'on a fait quelque chose pour
// récupérer face aux autres jours, sur 8 semaines. Trois états (D12) : net (« Après un sauna, ta VFC du lendemain est en
// moyenne 6 % plus haute », deux barres au dixième), flou (« pas de différence nette »), attente (« Encore 3 bains froids pour
// savoir », 8 points). Une phrase finale : un lien observé chez toi, pas une preuve.
// La page Récupération suit le gabarit des pages de statistiques (correction d'Alex du 31/10) : pas d'onglet Historique,
// cette page s'ouvre par l'encart de la page.
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useTheme } from "../../theme";
import { police } from "../../theme/typo";
import { Texte } from "../../ui/Texte";
import { useApp } from "../contexte";
import { nombre } from "../format";
import { BlocVide, Groupe, MARGE, PageMesure, TitreGroupe, useMesure } from "../mesures/gabarit";
import { RECUPERER } from "../recuperer";
import { lireCeQuiMarche, type Marche } from "../recuperer-donnees";
import { VignetteRecup } from "./briques";
import { phraseMarche, TexteFort } from "./BlocRecuperer";

export function CeQuiMarche() {
  useLangue();
  const { db } = useApp();
  const [l, setL] = useState<Marche[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      lireCeQuiMarche(db)
        .then((x) => vivant && setL(x))
        .catch(console.error);
      return () => {
        vivant = false;
      };
    }, [db]),
  );
  return (
    <PageMesure titre={t("recup.titre")}>
      <TitreGroupe>{t("recuperer.marche.titre")}</TitreGroupe>
      <Texte variante="corps" couleur="t2" style={styles.intro}>
        {t("recuperer.marche.intro")}
      </Texte>
      {l && !l.length ? <BlocVide titre={t("recuperer.marche.titre")} texte={t("recuperer.marche.vide")} /> : null}
      {l && l.length ? (
        <Groupe style={{ marginTop: 12 }}>
          {l.map((m, i) => (
            <BlocMarche key={m.type} m={m} premier={i === 0} />
          ))}
        </Groupe>
      ) : null}
      {l && l.length ? (
        <Texte variante="corps" couleur="t2" style={styles.note}>
          {t("recuperer.marche.note")}
        </Texte>
      ) : null}
    </PageMesure>
  );
}

function BlocMarche({ m, premier }: { m: Marche; premier: boolean }) {
  const { couleurs } = useTheme();
  const mm = useMesure();
  const min = RECUPERER.marche.minAvec;
  const e = m.etat;
  const p = phraseMarche(m);
  return (
    <View style={[styles.bloc, !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line }]}>
      <View style={styles.tete}>
        <VignetteRecup type={m.type} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {e.etat === "attente" ? (
            <>
              <Texte style={styles.titre}>{tp(`recuperer.encore.${m.type}` as "recuperer.encore.sauna", e.manque)}</Texte>
              <Texte variante="meta" couleur="t2" style={styles.sous}>
                {t("recuperer.marche.surHuit", { n: e.n, min })}
              </Texte>
            </>
          ) : (
            <>
              <TexteFort texte={p.texte} fort={p.fort} couleur="t1" style={styles.titre} styleFort={{ fontFamily: police.semibold, color: mm.fort }} />
              <Texte variante="meta" couleur="t2" style={styles.sous}>
                {tp(`recuperer.fois.${m.type}` as "recuperer.fois.sauna", e.n)}
              </Texte>
            </>
          )}
        </View>
      </View>
      {e.etat === "attente" ? (
        <View style={styles.points} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {Array.from({ length: min }, (_, i) => (
            <View key={i} style={[styles.point, { backgroundColor: i < e.n ? mm.fort : couleurs.jaugePiste }]} />
          ))}
        </View>
      ) : m.avecMs != null && m.sansMs != null ? (
        <Comparaison m={m} net={e.etat === "net"} />
      ) : null}
    </View>
  );
}

/** Les deux barres, au dixième (relecture critique de la planche, n° 5) : les lendemains, puis les autres jours. */
function Comparaison({ m, net }: { m: Marche; net: boolean }) {
  const { couleurs } = useTheme();
  const mm = useMesure();
  const a = m.avecMs!;
  const b = m.sansMs!;
  const max = Math.max(a, b) * 1.08;
  const ligne = (libelle: string, v: number, fort: boolean) => (
    <View style={styles.ligne}>
      <Texte variante="meta" couleur="t2" style={styles.lib} numberOfLines={1}>
        {libelle}
      </Texte>
      <View style={styles.piste}>
        <View style={{ width: `${(v / max) * 100}%`, height: 8, borderRadius: 4, backgroundColor: fort ? mm.fort : couleurs.line2 }} />
      </View>
      <Texte style={styles.valeur}>{t("recuperer.ms", { n: nombre(v, 1) })}</Texte>
    </View>
  );
  return (
    <View style={styles.comp} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {ligne(t(`recuperer.lendemains.${m.type}` as "recuperer.lendemains.sauna"), a, net)}
      {ligne(t("recuperer.marche.autres"), b, false)}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13.5, lineHeight: 20, marginTop: 6, marginHorizontal: MARGE },
  note: { fontSize: 12.5, lineHeight: 19, marginTop: 10, marginHorizontal: MARGE },
  bloc: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16 },
  tete: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  titre: { fontFamily: police.medium, fontSize: 15, lineHeight: 21 },
  sous: { marginTop: 3 },
  points: { flexDirection: "row", gap: 4, marginTop: 10 },
  point: { width: 18, height: 6, borderRadius: 3 },
  comp: { marginTop: 12, gap: 8 },
  ligne: { flexDirection: "row", alignItems: "center", gap: 10 },
  lib: { width: 150 },
  piste: { flex: 1 },
  valeur: { fontFamily: police.semibold, fontSize: 12, minWidth: 56, textAlign: "right", fontVariant: ["tabular-nums"] },
});
