import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { basculerFavoriPlat, kcalPortion, listerPlats, type Plat } from "../../db";
import { useTheme } from "../../theme";
import { duree } from "../../theme/mouvement";
import { espace } from "../../theme/typo";
import { BandeauAnnuler } from "../../ui/BandeauAnnuler";
import { ListeDesintegrable, marquerSuppression } from "../../ui/Desintegration";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { GlisserSupprimer } from "../../ui/GlisserSupprimer";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useApp } from "../contexte";
import { CadreVide, ChampTexte, PageNutrition } from "./commun";
import { sousLignePlat, VignettePlat } from "./plats-commun";
import { annulerSuppressionPlat, demanderSuppressionPlat, useSuppressionPlat } from "./suppression-plat";

// Mes plats (planche plats, 4c à 4e ; P11) : page du volet du profil (sous Mes aliments) et de « Ce plat ». Recherche, « +
// Nouveau plat », les plats du plus récemment mangé au plus ancien (vignette : la photo, sinon la cocotte ; les recettes
// Fitatu disent leur provenance). Toucher = la fiche ; appui long = Modifier, Dupliquer, favori, Supprimer ; glisser =
// supprimer (désintégration, « Annuler » 8 s, comme partout).

export function MesPlats() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const { repas = "", date = "" } = useLocalSearchParams<{ repas?: string; date?: string }>();
  const [q, setQ] = useState("");
  const [liste, setListe] = useState<Plat[] | null>(null);
  const [menu, setMenu] = useState<Plat | null>(null);
  const attente = useSuppressionPlat();

  const lire = useCallback(() => {
    listerPlats(db, q)
      .then(setListe)
      .catch((e) => console.error(e));
  }, [db, q]);
  useFocusEffect(lire);

  const supprimer = (x: Plat, depuisFeuille = false) => {
    setMenu(null);
    if (depuisFeuille) marquerSuppression(x.id, duree.feuilleSortie);
    demanderSuppressionPlat(db, x, lire);
  };
  const vue = (liste ?? []).filter((x) => x.id !== attente?.id);
  const ouvrir = (x: Plat) => router.push({ pathname: "/nutrition/plat", params: { id: x.id, repas, date } });
  const modifier = (x: Plat, copie = false) => {
    setMenu(null);
    router.push({ pathname: "/nutrition/plat-edition", params: copie ? { copie: x.id, repas, date } : { id: x.id } });
  };

  return (
    <PageNutrition
      titre={t("plats.mesPlats")}
      complement={liste ? String(vue.length) : undefined}
      pied={attente ? <BandeauAnnuler texte={t("plats.supprime", { nom: attente.nom })} onAnnuler={annulerSuppressionPlat} /> : undefined}
    >
      <ChampTexte icone="search" value={q} onChangeText={setQ} placeholder={t("plats.rechercher")} accessibilityLabel={t("plats.rechercher")} autoCorrect={false} style={{ marginTop: espace.xs }} />
      <CadreVide libelle={t("plats.nouveau")} onPress={() => router.push({ pathname: "/nutrition/plat-edition", params: { repas, date } })} style={{ marginTop: espace.m }} />
      <View style={{ height: espace.xs }} />
      {liste && vue.length === 0 ? (
        <Texte variante="corps" couleur="t3" style={styles.vide}>
          {q.trim() ? t("plats.aucunResultat") : t("plats.aucun")}
        </Texte>
      ) : null}
      <ListeDesintegrable
        liste={vue}
        cleDe={(x) => x.id}
        rendu={(x, etat) => (
          <GlisserSupprimer actif={etat !== "sort"} onSupprimer={() => supprimer(x)}>
            <Pressable
              accessibilityRole="button"
              accessibilityActions={[{ name: "longpress", label: t("plats.options") }]}
              onAccessibilityAction={(e) => e.nativeEvent.actionName === "longpress" && setMenu(x)}
              onPress={() => ouvrir(x)}
              onLongPress={() => setMenu(x)}
              style={({ pressed }) => [styles.rang, { borderBottomColor: couleurs.line, backgroundColor: pressed ? couleurs.s1 : couleurs.bg }]}
            >
              <VignettePlat plat={x} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Texte variante="corps" numberOfLines={1} style={{ fontSize: 15, color: couleurs.t1 }}>
                  {x.nom}
                </Texte>
                <Texte variante="meta" couleur="t3" numberOfLines={1} style={{ marginTop: 3 }}>
                  {sousLignePlat(x, kcalPortion(x))}
                </Texte>
              </View>
              <Icone nom="right" couleur={couleurs.t3} taille={16} />
            </Pressable>
          </GlisserSupprimer>
        )}
      />
      <Feuille visible={menu != null} onFermer={() => setMenu(null)} titre={menu?.nom} sousTitre={menu ? sousLignePlat(menu, kcalPortion(menu)) : undefined}>
        {menu ? (
          <>
            <Groupe>
              <Option premier icone="crayon" libelle={t("plats.modifier")} chevron onPress={() => modifier(menu)} />
              <Option icone="copie" libelle={t("plats.dupliquer")} onPress={() => modifier(menu, true)} />
              <Option
                icone={menu.favori ? "coeurp" : "coeur"}
                libelle={t(menu.favori ? "nutrition.retirerFavori" : "nutrition.ajouterFavori")}
                onPress={() => {
                  const x = menu;
                  setMenu(null);
                  basculerFavoriPlat(db, x.id, !x.favori).then(lire).catch(signalerErreur());
                }}
              />
            </Groupe>
            <Groupe>
              <Option premier icone="trash" danger libelle={t("plats.supprimer")} onPress={() => supprimer(menu, true)} />
            </Groupe>
          </>
        ) : null}
      </Feuille>
    </PageNutrition>
  );
}

const styles = StyleSheet.create({
  rang: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  vide: { paddingVertical: espace.l, lineHeight: 19 },
});
