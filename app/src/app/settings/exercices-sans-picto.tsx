import { useState } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { JOURS_USAGE, lireExercice, manquesEnCsv, manquesParUsage, suggestionsAConfirmer, usageExercices, type Exercice, type Manque } from "../../db";
import { useApp, useCharge } from "../../ecrans/contexte";
import { exporterTexte } from "../../ecrans/exporter";
import { departager, FeuilleLien } from "../../ecrans/FeuilleLien";
import { GroupeReglages, LigneReglage, SectionReglages } from "../../ecrans/Reglage";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useTheme } from "../../theme";
import { espace } from "../../theme/typo";
import { cle3D } from "../../ui/3d/clips";
import { BarreHaut } from "../../ui/Cadre";
import { Bouton } from "../../ui/Bouton";
import { PartieImposee } from "../../ui/ContextePartie";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { clePicto } from "../../ui/pictos";
import { Texte } from "../../ui/Texte";
import { useLiens } from "../../ui/useLiens";

/** Les pastilles d'une ligne, en mots : « sans picto, sans 3D ». */
const manque = (m: Manque) => [m.sansPicto ? t("reglages.manques.sansPicto") : null, m.sans3D ? t("reglages.manques.sans3D") : null].filter(Boolean).join(", ");

/**
 * Exercices sans picto ni 3D (Sport › Pictos manquants) : en haut ceux à relier au catalogue (un exercice perso qui ressemble à un
 * exercice du catalogue, à confirmer), puis les plus utilisés des 90 derniers jours qui manquent de picto ou de 3D, et l'export de
 * la liste. Calculé sur le téléphone, rien n'est envoyé au serveur.
 */
export default function PictosManquants() {
  return (
    <PartieImposee partie="entrainement">
      <Page />
    </PartieImposee>
  );
}

function Page() {
  useLangue();
  useLiens();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const [lien, setLien] = useState<Exercice | null>(null);
  const [d, relire] = useCharge(async (db) => {
    const [propositions, usage] = await Promise.all([
      suggestionsAConfirmer(db, { departager }),
      usageExercices(db, Date.now() - JOURS_USAGE * 86_400_000),
    ]);
    return { propositions, usage };
  }, []);
  const manques = d ? manquesParUsage(d.usage, (slug, nom) => clePicto(slug, nom) != null, (slug, nom) => cle3D(slug, nom) != null, 50) : [];
  const exporter = () => exporterTexte("pepfit-exercices-sans-picto.csv", manquesEnCsv(manques), "text/csv", t("reglages.manques.exportTitre"));
  const ouvrir = (m: Manque) => {
    if (!m.perso) return router.push({ pathname: "/progress/[id]", params: { id: m.id } });
    lireExercice(db, m.id).then((e) => e && setLien(e)).catch(signalerErreur());
  };
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("reglages.manques.titre")} />
      <ScrollView contentContainerStyle={{ paddingTop: espace.s, paddingBottom: espace.xxl * 2 }}>
        {d && d.propositions.length ? (
          <>
            <SectionReglages premiere titre={t("reglages.manques.aRelier")} />
            <GroupeReglages>
              {d.propositions.map((p, i) => (
                <LigneReglage key={p.exercice.id} premier={i === 0} libelle={p.exercice.nom} sous={p.catalogue.nom} onPress={() => setLien(p.exercice)} />
              ))}
            </GroupeReglages>
          </>
        ) : null}
        <SectionReglages premiere={!d?.propositions.length} titre={t("reglages.manques.plusUtilises")} />
        {d && manques.length ? (
          <GroupeReglages>
            {manques.map((m, i) => (
              <LigneReglage
                key={m.id}
                premier={i === 0}
                libelle={m.nom}
                sous={`${tp("reglages.manques.series", m.series)}, ${tp("reglages.manques.seances", m.seances)}, ${manque(m)}`}
                onPress={() => ouvrir(m)}
              />
            ))}
          </GroupeReglages>
        ) : d ? (
          <Texte variante="corps" couleur="t2" style={{ paddingHorizontal: espace.l }}>
            {t("reglages.manques.rien")}
          </Texte>
        ) : null}
        {manques.length ? (
          <View style={{ paddingHorizontal: espace.l, marginTop: espace.l }}>
            <Bouton large variante="tonal" libelle={t("reglages.manques.exporter")} onPress={() => exporter().catch(signalerErreur("exporter"))} />
          </View>
        ) : null}
        <Texte variante="meta" couleur="t3" style={{ paddingHorizontal: espace.l, marginTop: espace.m }}>
          {t("reglages.manques.local")}
        </Texte>
      </ScrollView>
      {lien ? <FeuilleLien exercice={lien} visible onFermer={() => setLien(null)} onFini={() => relire().catch(() => {})} /> : null}
    </SafeAreaView>
  );
}
