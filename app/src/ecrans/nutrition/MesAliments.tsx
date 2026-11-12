import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChiffresNutrition } from "./mode-affichage";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { listerRepas, masquerAliment, mesAliments, remettreAliment, type Periode, type Repas, type StatAliment, type TriAliments } from "../../db";
import { useTheme } from "../../theme";
import { duree } from "../../theme/mouvement";
import { espace, police } from "../../theme/typo";
import { cleJour, decalerJour } from "../../nutrition/calculs";
import { BandeauAnnuler } from "../../ui/BandeauAnnuler";
import { BoutonIcone } from "../../ui/Cadre";
import { ListeDesintegrable, marquerSuppression } from "../../ui/Desintegration";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { GlisserSupprimer } from "../../ui/GlisserSupprimer";
import { Segmente } from "../../ui/Segmente";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useApp } from "../contexte";
import { jourLong, jourMois, nombre } from "../format";
import { ChampTexte, nomRepas, PageNutrition } from "./commun";

// Mes aliments (D4, planche 9 du profil) : classement par période, trié par nombre de fois, quantité ou kcal. Chaque rang :
// numéro, nom, repas habituel et dernière fois, barre verte à la mesure du premier ; à droite la valeur du tri. 🔍 filtre.
// Appui long sur un rang : « Retirer de mes aliments » (audit du 28/10, constat 21), le journal ne change pas ; « Annuler »
// pendant 8 s, comme le journal. Suppression identique partout (revue finale n° 8) : un rang se glisse aussi vers la gauche
// (« Supprimer »), et part en se désintégrant.

const DELAI_ANNULER_MS = 8000;

const JOURS: Record<Periode, number | null> = { semaine: 7, mois: 30, annee: 365, tout: null };

/** « aujourd'hui », « hier », « jeudi », « 12 sept. ». */
export function quandTexte(j: string, aujourdhui: string): string {
  if (j === aujourdhui) return t("nutrition.aujourdhuiMin");
  if (j === decalerJour(aujourdhui, -1)) return t("nutrition.hier");
  const d = new Date(`${j}T12:00:00`);
  return j >= decalerJour(aujourdhui, -6) ? jourLong(d) : jourMois(d);
}

const masse = (g: number, ml: boolean) => (g >= 1000 ? `${nombre(g / 1000, 1)} ${ml ? "l" : t("nutrition.kg")}` : `${nombre(g, 0)} ${ml ? t("nutrition.ml") : t("nutrition.g")}`);

export function MesAliments() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const chiffres = useChiffresNutrition();
  const { repas = "", date = "" } = useLocalSearchParams<{ repas?: string; date?: string }>();
  const [periode, setPeriode] = useState<Periode>("mois");
  const [tri, setTri] = useState<TriAliments>("fois");
  const [liste, setListe] = useState<StatAliment[] | null>(null);
  const [lesRepas, setLesRepas] = useState<Repas[]>([]);
  const [filtre, setFiltre] = useState<string | null>(null);
  const [menu, setMenu] = useState<StatAliment | null>(null);
  const [retrait, setRetrait] = useState<{ nom: string; defaire: () => Promise<void> } | null>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aujourdhui = cleJour(new Date());

  useEffect(() => {
    listerRepas(db, true).then(setLesRepas).catch((e) => console.error(e));
  }, [db]);
  const lire = useCallback(() => {
    const n = JOURS[periode];
    mesAliments(db, periode, tri, n ? decalerJour(aujourdhui, -n) : null)
      .then(setListe)
      .catch((e) => console.error(e));
  }, [db, periode, tri, aujourdhui]);
  useEffect(lire, [lire]);
  useEffect(() => () => void (minuterie.current && clearTimeout(minuterie.current)), []);

  // Retiré tout de suite de la liste, la base suit ; « Annuler » remet l'état d'avant et relit la liste. Depuis la feuille, la
  // ligne attend qu'elle soit descendue pour se désintégrer.
  const retirer = (x: StatAliment, depuisFeuille = false) => {
    setMenu(null);
    if (depuisFeuille) marquerSuppression(x.produit.id, duree.feuilleSortie);
    setListe((l) => l?.filter((y) => y.produit.id !== x.produit.id) ?? l);
    const avant = masquerAliment(db, x.produit.id);
    avant.catch(signalerErreur("supprimer"));
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setRetrait(null), DELAI_ANNULER_MS);
    setRetrait({ nom: x.produit.nom, defaire: async () => remettreAliment(db, x.produit.id, await avant) });
  };
  const annuler = () => {
    if (!retrait) return;
    if (minuterie.current) clearTimeout(minuterie.current);
    const r = retrait;
    setRetrait(null);
    r.defaire().then(lire).catch(signalerErreur());
  };

  const vue = useMemo(() => {
    const f = filtre?.trim().toLowerCase();
    return (liste ?? []).filter((x) => !f || `${x.produit.nom} ${x.produit.marque ?? ""}`.toLowerCase().includes(f));
  }, [liste, filtre]);
  const mesure = (x: StatAliment) => (tri === "fois" || (!chiffres && tri === "kcal") ? x.fois : tri === "quantite" ? x.quantiteG : x.kcal);
  const max = Math.max(1, ...(liste ?? []).map(mesure));
  // Rang de chaque aliment : celui qui part garde le sien le temps de se désintégrer.
  const rangs = useRef(new Map<string, number>()).current;
  vue.forEach((x, i) => rangs.set(x.produit.id, i + 1));

  return (
    <PageNutrition
      titre={t("nutrition.mesAliments")}
      droite={<BoutonIcone nom="search" libelle={t("nutrition.rechercher")} onPress={() => setFiltre((x) => (x == null ? "" : null))} />}
      pied={retrait ? <BandeauAnnuler texte={t("nutrition.retire", { nom: retrait.nom })} onAnnuler={annuler} /> : undefined}
    >
      {filtre != null ? (
        <View style={{ marginTop: espace.xs, marginBottom: espace.s }}>
          <ChampTexte icone="search" value={filtre} onChangeText={setFiltre} autoFocus placeholder={t("nutrition.rechercher")} accessibilityLabel={t("nutrition.rechercher")} autoCorrect={false} />
        </View>
      ) : null}
      <View style={{ gap: espace.s, marginTop: espace.xs }}>
        <Segmente<Periode>
          options={[
            { valeur: "semaine", libelle: t("nutrition.semaine") },
            { valeur: "mois", libelle: t("nutrition.mois") },
            { valeur: "annee", libelle: t("nutrition.annee") },
            { valeur: "tout", libelle: t("nutrition.tout") },
          ]}
          valeur={periode}
          onChange={setPeriode}
        />
        <Segmente<TriAliments>
          options={[
            { valeur: "fois", libelle: t("nutrition.triFois") },
            { valeur: "quantite", libelle: t("nutrition.triQuantite") },
            ...(chiffres ? [{ valeur: "kcal" as const, libelle: t("nutrition.kcalMaj") }] : []),
          ]}
          valeur={!chiffres && tri === "kcal" ? "fois" : tri}
          onChange={setTri}
        />
      </View>
      <View style={{ height: espace.s }} />
      {liste && vue.length === 0 ? (
        <Texte variante="corps" couleur="t3" style={{ paddingTop: espace.l }}>
          {t("nutrition.aucunAliment")}
        </Texte>
      ) : null}
      <ListeDesintegrable
        liste={vue}
        cleDe={(x) => x.produit.id}
        rendu={(x, etat) => {
          const r = lesRepas.find((y) => y.id === x.repasFrequent);
          const ml = x.produit.base === "100ml";
          const fort = tri === "fois" || (!chiffres && tri === "kcal") ? `${x.fois}×` : tri === "quantite" ? masse(x.quantiteG, ml) : `${nombre(x.kcal, 0)} ${t("nutrition.kcal")}`;
          const faible = tri === "fois" || (!chiffres && tri === "kcal") ? masse(x.quantiteG, ml) : `${x.fois}×`;
          return (
            <GlisserSupprimer actif={etat !== "sort"} onSupprimer={() => retirer(x)}>
              <Pressable
                accessibilityRole="button"
                accessibilityActions={[{ name: "longpress", label: t("nutrition.retirerDeMesAliments") }]}
                onAccessibilityAction={(e) => e.nativeEvent.actionName === "longpress" && setMenu(x)}
                onPress={() =>
                  router.push(x.platId ? { pathname: "/nutrition/plat", params: { id: x.platId, repas, date } } : { pathname: "/nutrition/produit", params: { produit: x.produit.id, repas, date } })
                }
                onLongPress={() => setMenu(x)}
                style={({ pressed }) => [styles.rang, { borderBottomColor: couleurs.line }, pressed && { backgroundColor: couleurs.s1 }]}
              >
                <Texte variante="corps" couleur="t3" style={styles.n}>
                  {rangs.get(x.produit.id)}
                </Texte>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Texte variante="corps" numberOfLines={1} style={{ fontSize: 15, color: couleurs.t1 }}>
                    {x.produit.nom}
                  </Texte>
                  <Texte variante="meta" couleur="t3" numberOfLines={1} style={{ marginTop: 3 }}>
                    {[r ? nomRepas(r) : null, quandTexte(x.derniere, aujourdhui)].filter(Boolean).join(", ")}
                  </Texte>
                  <View style={[styles.barre, { width: `${(mesure(x) / max) * 100}%`, backgroundColor: couleurs.partieNutrition }]} />
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Texte variante="saisie" style={{ fontFamily: police.medium }}>
                    {fort}
                  </Texte>
                  <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>
                    {faible}
                  </Texte>
                </View>
              </Pressable>
            </GlisserSupprimer>
          );
        }}
      />
      <Feuille visible={menu != null} onFermer={() => setMenu(null)} titre={menu?.produit.nom}>
        <Groupe>
          <Option premier icone="close" libelle={t("nutrition.retirerDeMesAliments")} onPress={() => menu && retirer(menu, true)} />
        </Groupe>
      </Feuille>
    </PageNutrition>
  );
}

const styles = StyleSheet.create({
  rang: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: espace.s },
  n: { width: 20, textAlign: "right" },
  barre: { height: 3, borderRadius: 2, marginTop: 7, opacity: 0.7 },
});
