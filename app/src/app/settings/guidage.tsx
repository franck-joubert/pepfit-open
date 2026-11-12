import { useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "../../ecrans/contexte";
import { GroupeReglages, LigneReglage, SectionReglages } from "../../ecrans/Reglage";
import { lireTempo, tempoTexte, TEMPOS_USINE, type Famille } from "../../ecrans/tempo";
import { useTheme } from "../../theme";
import { espace } from "../../theme/typo";
import { BarreHaut } from "../../ui/Cadre";
import { FeuilleTempo } from "../../ui/RoueDuree";
import { Segmente } from "../../ui/Segmente";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";

const FAMILLES: Famille[] = ["poly", "isolation"];

/**
 * Guidage (planche idee-plein-ecran, Profil › Préférences) : tempos par défaut par famille (D5) et plein écran de la
 * séance. La section « Voix » de la planche arrive avec le lot 4.
 */
export default function Guidage() {
  useLangue();
  const { reglages, regler } = useApp();
  const { couleurs } = useTheme();
  const [famille, setFamille] = useState<Famille | null>(null);
  const tempo = (f: Famille) => tempoTexte(lireTempo(reglages.tempos[f]) ?? lireTempo(TEMPOS_USINE[f])!);
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("reglages.guidage.titre")} />
      <ScrollView contentContainerStyle={{ paddingBottom: espace.xxl * 2 }}>
        <SectionReglages premiere titre={t("reglages.guidage.temposDefaut")} />
        <GroupeReglages>
          {FAMILLES.map((f, i) => (
            <LigneReglage key={f} premier={i === 0} libelle={t(`reglages.guidage.${f}`)} sous={t(`reglages.guidage.${f}Exemples`)} valeur={tempo(f)} onPress={() => setFamille(f)} hauteur={60} />
          ))}
        </GroupeReglages>

        <SectionReglages titre={t("reglages.guidage.pleinEcran")} />
        <GroupeReglages>
          <LigneReglage premier libelle={t("reglages.guidage.ruban")} interrupteur={{ valeur: reglages.rubanTempo, onChange: (v) => regler({ rubanTempo: v }) }} />
          <LigneReglage libelle={t("reglages.guidage.ouvrir")}>
            <Segmente<"liste" | "plein">
              mini
              options={[
                { valeur: "liste", libelle: t("reglages.guidage.liste") },
                { valeur: "plein", libelle: t("reglages.guidage.plein") },
              ]}
              valeur={reglages.ouvrirPleinEcran ? "plein" : "liste"}
              onChange={(v) => regler({ ouvrirPleinEcran: v === "plein" })}
            />
          </LigneReglage>
        </GroupeReglages>
      </ScrollView>

      <FeuilleTempo
        visible={famille != null}
        tempo={famille ? reglages.tempos[famille] : null}
        onFermer={() => setFamille(null)}
        onEnregistrer={(v) => {
          if (!famille) return;
          // Tempo vide : retour au tempo d'usine de la famille.
          regler({ tempos: { ...reglages.tempos, [famille]: v ?? TEMPOS_USINE[famille] } });
          setFamille(null);
        }}
      />
    </SafeAreaView>
  );
}
