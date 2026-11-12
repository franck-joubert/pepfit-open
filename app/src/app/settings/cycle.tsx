// Suivi du cycle (planche cycle, écran 9), ouvert par les réglages de Santé (son engrenage, et Réglages › Par partie › Santé ;
// trouvable par la recherche des Réglages : planche menu) : « Suivre mon cycle » (proposé si le profil dit « Femme »,
// activable par tout le monde, D2) ; les sources (Santé Connect, demandé au moment où on l'allume ; la saisie) ; chaque usage
// dans les calculs, coupable ; qui le voit (les coachs : personne ; le Fil : jamais ; l'IA : seulement si le lien l'autorise) ;
// le chiffrement ; « Effacer l'historique du cycle ». Toute la ligne est la cible du toucher, pas seulement la bascule.
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useTheme } from "../../theme";
import { espace } from "../../theme/typo";
import { BarreHaut } from "../../ui/Cadre";
import { BoutonTonal } from "../../ui/BoutonTonal";
import { Feuille } from "../../ui/Feuille";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { useCharge } from "../../ecrans/contexte";
import { GroupeReglages, LigneReglage, SectionReglages } from "../../ecrans/Reglage";
import { assurerCycleSante, ecrireReglageCycle, effacerCycle, lireReglagesCycle, REGLAGES_CYCLE, type ReglagesCycle } from "../../cycle/donnees";
import { demanderRegles, lireReglesAppareil } from "../../ecrans/cycle/cycle-appareil";
import { useApp } from "../../ecrans/contexte";
import { rafraichirRappelRegles } from "../../natif/rappel-regles";
import { signalerSaisie } from "../../precision/service";

export default function ReglagesCycle() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const [r, relire] = useCharge(lireReglagesCycle, []);
  const [effacer, setEffacer] = useState(false);
  const basculer = (cle: keyof typeof REGLAGES_CYCLE, v: boolean) =>
    void (async () => {
      // Santé Connect : l'autorisation (règles et intensité seulement) se demande au moment où on allume la source
      if (cle === "santeConnect" && v && !(await demanderRegles())) return;
      await ecrireReglageCycle(db, cle, v);
      if ((cle === "santeConnect" || cle === "suivi") && v) await assurerCycleSante(db, lireReglesAppareil, Date.now(), true);
      signalerSaisie();
      // le rappel s'allume avec sa demande d'autorisation, en contexte
      if (cle === "rappel" && v) await rafraichirRappelRegles(db, { demander: true });
      await relire();
    })().catch(console.error);
  const ligne = (cle: keyof typeof REGLAGES_CYCLE, libelle: string, sous: string, x: ReglagesCycle, premier = false) => {
    const v = x[cle as keyof ReglagesCycle] as boolean;
    return <LigneReglage premier={premier} libelle={libelle} sous={sous} interrupteur={{ valeur: v, onChange: (n) => basculer(cle, n) }} onPress={() => basculer(cle, !v)} />;
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("cycle.reglages.titre")} />
      <ScrollView contentContainerStyle={{ paddingBottom: espace.xxl * 2 }}>
        {r ? (
          <>
            <GroupeReglages style={{ marginTop: espace.s }}>
              <LigneReglage
                premier
                libelle={t("cycle.reglages.suivre")}
                sous={r.propose ? t("cycle.reglages.propose") : undefined}
                interrupteur={{ valeur: r.suivi, onChange: (n) => basculer("suivi", n) }}
                onPress={() => basculer("suivi", !r.suivi)}
              />
            </GroupeReglages>
            {r.suivi ? (
              <>
                <SectionReglages titre={t("cycle.reglages.sources")} />
                <GroupeReglages>
                  {ligne("santeConnect", t("cycle.reglages.sc"), t("cycle.reglages.scSous"), r, true)}
                  <LigneReglage libelle={t("cycle.reglages.saisie")} sous={t("cycle.reglages.saisieSous")} />
                </GroupeReglages>
                <SectionReglages titre={t("cycle.reglages.calculs")} />
                <GroupeReglages>
                  {ligne("recup", t("cycle.reglages.recup"), t("cycle.reglages.recupSous"), r, true)}
                  {ligne("poids", t("cycle.reglages.poids"), t("cycle.reglages.poidsSous"), r)}
                  {ligne("prevision", t("cycle.reglages.prevision"), t("cycle.reglages.previsionSous"), r)}
                  {ligne("mentionEffort", t("cycle.reglages.mention"), t("cycle.reglages.mentionSous"), r)}
                </GroupeReglages>
                <SectionReglages titre={t("cycle.reglages.rappels")} />
                <GroupeReglages>{ligne("rappel", t("cycle.reglages.rappel"), t("cycle.reglages.rappelSous"), r, true)}</GroupeReglages>
              </>
            ) : null}
            <SectionReglages titre={t("cycle.reglages.quiVoit")} />
            <GroupeReglages>
              <LigneReglage premier libelle={t("cycle.reglages.coachs")} sous={t("cycle.reglages.coachsSous")} valeur={t("cycle.reglages.personne")} />
              <LigneReglage libelle={t("cycle.reglages.fil")} sous={t("cycle.reglages.filSous")} valeur={t("cycle.reglages.jamais")} />
              <LigneReglage libelle={t("cycle.reglages.ia")} sous={t("cycle.reglages.iaSous")} />
            </GroupeReglages>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 8, marginHorizontal: espace.l }}>
              <Icone nom="cadenas" couleur={couleurs.t3} taille={14} />
              <Texte variante="meta" couleur="t3" style={{ flex: 1, lineHeight: 18 }}>
                {t("cycle.reglages.chiffre")}
              </Texte>
            </View>
            <GroupeReglages style={{ marginTop: 18 }}>
              <LigneReglage premier danger fin="aucune" libelle={t("cycle.reglages.effacer")} onPress={() => setEffacer(true)} />
            </GroupeReglages>
          </>
        ) : null}
      </ScrollView>
      <Feuille
        visible={effacer}
        onFermer={() => setEffacer(false)}
        titre={t("cycle.reglages.effacerTitre")}
        pied={
          <BoutonTonal
            danger
            libelle={t("cycle.reglages.effacerOui")}
            onPress={() =>
              void effacerCycle(db)
                .then(() => setEffacer(false))
                .then(signalerSaisie)
                .catch(console.error)
            }
          />
        }
      >
        <Texte variante="corps" couleur="t2" style={{ lineHeight: 20 }}>
          {t("cycle.reglages.effacerTexte")}
        </Texte>
      </Feuille>
    </SafeAreaView>
  );
}
