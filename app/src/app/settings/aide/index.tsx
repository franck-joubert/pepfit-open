import { useCallback, useState } from "react";
import { Keyboard, ScrollView, StyleSheet } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { articlesIntegres } from "../../../aide/articles";
import { ECRAN, THEME } from "../../../aide/ecrans";
import { chercherArticles, chercherParMots } from "../../../aide/recherche";
import { THEMES_AIDE } from "../../../aide/types";
import { drapeaux } from "../../../drapeaux";
import { BarreHaut } from "../../../ui/Cadre";
import { useCharge } from "../../../ecrans/contexte";
import { ChampAide, LigneResultat } from "../../../ecrans/aide/Briques";
import { GroupeReglages, LigneReglage, SectionReglages, SousEtat } from "../../../ecrans/Reglage";
import { aReconnecter } from "../../../ecrans/reglages/etat";
import { chemin, chercher, REGLAGES_INVENTAIRE, type EntreeReglage } from "../../../ecrans/reglages/inventaire";
import { lireActif, t } from "../../../i18n/index";
import type { Cle } from "../../../i18n/fr";
import { useLangue } from "../../../i18n/useLangue";
import { useTheme } from "../../../theme";
import { espace } from "../../../theme/typo";
import { Texte } from "../../../ui/Texte";
import * as whoop from "../../../whoop";
import * as withings from "../../../withings";

/**
 * Aide (planche aide-retours, e5 ; recherche e6) : questions fréquentes par thème. La recherche tourne sur le téléphone,
 * dans les réponses et dans les réglages (D13).
 */
export default function AideSupport() {
  useLangue();
  const { couleurs } = useTheme();
  const [q, setQ] = useState("");
  const langue = lireActif().langue;

  const [l, relire] = useCharge(async (d) => {
    const [w, wi] = await Promise.all([whoop.etatWhoop(d).catch(() => null), withings.etatWithings(d).catch(() => null)]);
    return { whoop: w, withings: wi };
  }, []);
  useFocusEffect(
    useCallback(() => {
      relire().catch(console.error);
    }, [relire]),
  );

  const articles = articlesIntegres(langue);
  const tr = (c: Cle) => t(c as Parameters<typeof t>[0]);
  const visibles = REGLAGES_INVENTAIRE.filter((e) => (!e.drapeau || drapeaux[e.drapeau]) && e.id !== "effacer");
  const cherche = q.trim().length > 0;
  const reponses = cherche ? chercherArticles(q, articles) : [];
  const reglages = cherche ? chercherParMots(q, (m) => chercher(m, tr, visibles)) : [];
  const fermerRecherche = () => (setQ(""), Keyboard.dismiss());

  // Whoop et Withings gardent leur état dans les résultats (« Accès expiré · à reconnecter »), comme dans les Réglages.
  const sousReglage = (e: EntreeReglage) => {
    const s = e.id === "whoop" ? l?.whoop : e.id === "withings" ? l?.withings : null;
    if (s?.erreur && aReconnecter(s.erreur)) return <SousEtat actif={false} erreur texte={`${t(s.erreur === "expire" ? "menu.accesExpire" : "menu.accesPerdu")}`} />;
    return chemin(e, tr);
  };
  const iconeReglage = (e: EntreeReglage) => (e.route.startsWith("/settings/connexions") ? ECRAN.connexions.icone : undefined);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      {cherche ? null : <BarreHaut titre={t("aide.titre")} />}
      <ChampAide q={q} onChange={setQ} retour={cherche ? fermerRecherche : undefined} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: espace.xxl * 2 }}>
        {cherche ? (
          <>
            {reponses.length ? (
              <>
                <SectionReglages titre={t("aide.reponses")} />
                <GroupeReglages>
                  {reponses.map((a) => (
                    <LigneResultat key={a.cle} titre={a.titre} q={q} sous={t(THEME[a.theme].titre)} onPress={() => router.push(`/settings/aide/article/${a.cle}`)} />
                  ))}
                </GroupeReglages>
              </>
            ) : null}
            {reglages.length ? (
              <>
                <SectionReglages titre={t("aide.dansReglages")} />
                <GroupeReglages>
                  {reglages.map((e) => (
                    <LigneResultat key={e.id} titre={tr(e.libelle)} q={q} icone={iconeReglage(e)} sous={sousReglage(e)} onPress={() => router.push(e.route as never)} />
                  ))}
                </GroupeReglages>
              </>
            ) : null}
            {!reponses.length && !reglages.length ? (
              <Texte variante="corps" couleur="t3" style={styles.vide}>
                {t("aide.aucune", { q: q.trim() })}
              </Texte>
            ) : null}
          </>
        ) : (
          <>
            <SectionReglages titre={t("aide.questions")} />
            <GroupeReglages>
              {THEMES_AIDE.filter((th) => articles.some((a) => a.theme === th)).map((th) => (
                <LigneReglage key={th} icone={THEME[th].icone} libelle={t(THEME[th].titre)} sous={t(THEME[th].sous)} onPress={() => router.push(`/settings/aide/theme/${th}`)} />
              ))}
            </GroupeReglages>

          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  vide: { paddingHorizontal: espace.xl, paddingTop: espace.m },
});
