import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { listerSalles, supprimerSalle, type SalleResume } from "../db";
import { useTheme } from "../theme";
import { espace, rayon } from "../theme/typo";
import { useApp, useCharge } from "../ecrans/contexte";
import { FeuilleNouveauLieu, pictoLieu, sousTitreLieu } from "../ecrans/Lieux";
import { LigneDeLieu } from "../ecrans/LigneDeLieu";
import { BandeauAnnuler } from "../ui/BandeauAnnuler";
import { BarreHaut } from "../ui/Cadre";
import { GlisserSupprimer } from "../ui/GlisserSupprimer";
import { Texte } from "../ui/Texte";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { ListeDesintegrable } from "../ui/Desintegration";

const DELAI_ANNULER_MS = 8000;

// Lieux (planche Lieux, liste A) : une liste, l'avatar du lieu (le picto de son type), le lieu par défaut d'abord, « Ajouter un lieu » au pied.
// Liste de réglages : une carte groupée, comme les Préférences (D4 de l'audit global).
// Balayé vers la gauche, un lieu quitte la liste tout de suite ; la base attend que « Annuler » ait expiré (comme les routines).
export default function Lieux() {
  const { db } = useApp();
  useLangue();
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const [lieux, recharger] = useCharge<SalleResume[]>(() => listerSalles(db), [db]);
  // Lien pepfitopen://gyms?nouveau=<type> : la feuille « Nouveau lieu » s'ouvre sur ce type ; &activites=1 : sur ses activités.
  const { nouveau: typeLien, activites: activitesLien } = useLocalSearchParams<{ nouveau?: string; activites?: string }>();
  const [nouveau, setNouveau] = useState<string | null>(null);
  // Aussi quand l'écran est déjà ouvert : le lien change alors seulement ses paramètres.
  useEffect(() => {
    if (typeLien) setNouveau("");
  }, [typeLien]);
  const [enAttente, setEnAttente] = useState<SalleResume | null>(null);
  const attente = useRef<{ id: string; minuterie: ReturnType<typeof setTimeout> } | null>(null);

  const confirmer = () => {
    const a = attente.current;
    if (!a) return;
    clearTimeout(a.minuterie);
    attente.current = null;
    supprimerSalle(db, a.id).then(recharger).catch(console.error);
  };
  // Écran quitté pendant le délai : la suppression part sans attendre.
  useEffect(
    () => () => {
      const a = attente.current;
      if (a) clearTimeout(a.minuterie);
      if (a) supprimerSalle(db, a.id).catch(console.error);
    },
    [db],
  );
  const supprimer = (l: SalleResume) => {
    confirmer();
    const minuterie = setTimeout(() => {
      confirmer();
      setEnAttente((x) => (x?.id === l.id ? null : x));
    }, DELAI_ANNULER_MS);
    attente.current = { id: l.id, minuterie };
    setEnAttente(l);
  };
  const annuler = () => {
    if (attente.current) clearTimeout(attente.current.minuterie);
    attente.current = null;
    setEnAttente(null);
  };

  const visibles = (lieux ?? []).filter((l) => l.id !== enAttente?.id);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("salles.titre")} />
      <ScrollView contentContainerStyle={{ paddingTop: espace.s, paddingBottom: espace.xxl * 3 }}>
        {lieux && lieux.length === 0 ? (
          <Texte variante="corps" couleur="t2" style={styles.vide}>
            {t("salles.vide")}
          </Texte>
        ) : null}
        <View style={[styles.carte, { backgroundColor: couleurs.s1 }]}>
          <ListeDesintegrable
            liste={visibles}
            cleDe={(l) => l.id}
            rendu={(l) => (
              <GlisserSupprimer cle={l.id} onSupprimer={() => supprimer(l)}>
                <LigneDeLieu
                  icone={pictoLieu(l.type)}
                  avatar
                  nom={l.nom + (l.defaut ? t("salles.suffixeDefaut") : "")}
                  sous={sousTitreLieu(l)}
                  fin="right"
                  carte
                  filet={visibles[0]?.id !== l.id}
                  onPress={() => router.push({ pathname: "/gym/[id]", params: { id: l.id } })}
                />
              </GlisserSupprimer>
            )}
          />
          <LigneDeLieu icone="plus" nom={t("salles.ajouterPerso")} leger carte filet={visibles.length > 0} onPress={() => setNouveau("")} />
        </View>
      </ScrollView>
      {enAttente ? <BandeauAnnuler texte={t("lieux.supprime", { nom: enAttente.nom })} bas={bas + espace.l} onAnnuler={annuler} /> : null}
      <FeuilleNouveauLieu
        nom={nouveau}
        type={typeLien}
        activites={activitesLien === "1"}
        onFermer={() => setNouveau(null)}
        onCree={(id) => {
          setNouveau(null);
          recharger().catch(console.error);
          router.push({ pathname: "/gym/[id]", params: { id } });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  vide: { paddingHorizontal: espace.l, paddingVertical: espace.m },
  carte: { marginHorizontal: espace.l, borderRadius: rayon.l, overflow: "hidden" },
});
