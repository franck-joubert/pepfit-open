import { useState } from "react";
import { router } from "expo-router";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ajouterMensuration, ecrireDateNaissance, ecrireReglage, ecrireSexe, lireProfilCorps, lireReglage } from "../../db";
import { quand } from "../../ecrans/composition-vue";
import { actualiserCorps } from "../../ecrans/corps-donnees";
import { FeuilleRoue, plage } from "../../ecrans/nutrition/commun";
import { NAISSANCE_DEPART, SEXES, type Naissance, type SexeDeclare } from "../../ecrans/parcours-calc";
import { MolettesDate } from "../../ecrans/parcours-ui";
import { nomSourceCorps } from "../../ecrans/sante-donnees";
import { formater } from "../../i18n/temps";
import { Bouton } from "../../ui/Bouton";
import { useApp, useCharge } from "../../ecrans/contexte";
import { FeuilleNomSection } from "../../ecrans/FeuillesSection";
import { nombre } from "../../ecrans/format";
import { GroupeReglages, LigneReglage, SectionReglages, SousEtat } from "../../ecrans/Reglage";
import { useTheme } from "../../theme";
import { espace } from "../../theme/typo";
import { BarreHaut } from "../../ui/Cadre";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { signalerSaisie } from "../../precision/service";

type Choix = "prenom" | "sexe" | "naissance" | "taille" | null;

const TAILLES = plage(120, 230, 1);

/**
 * Corps (Réglages › Moi, planche menu) : prénom, sexe, date de naissance et taille, ce qui nourrit les calculs de toutes les
 * parties ; repris de Préférences › Toi. Chaque choix ouvre une feuille ou une roue.
 */
export default function Corps() {
  useLangue();
  const { db, reglages, regler } = useApp();
  const { couleurs } = useTheme();
  const [ouvert, setOuvert] = useState<Choix>(null);
  const fermer = () => setOuvert(null);
  // Identité (29/10) : sexe et date de naissance vivent ici (plus dans Mensurations) ; la taille avec sa source.
  const [corps, relireCorps] = useCharge(async (d) => {
    await actualiserCorps(d);
    const declare = await lireReglage(d, "sexe_declare");
    return { ...(await lireProfilCorps(d)), declare: SEXES.includes(declare as SexeDeclare) ? (declare as SexeDeclare) : null };
  }, []);
  const [date, setDate] = useState<Naissance>(NAISSANCE_DEPART);
  const ouvrirNaissance = () => {
    setDate(corps?.naissance ?? { ...NAISSANCE_DEPART, a: corps?.anneeSeule ?? NAISSANCE_DEPART.a });
    setOuvert("naissance");
  };
  const choisirSexe = (s: SexeDeclare) =>
    ecrireReglage(db, "sexe_declare", s)
      .then(() => (s === "h" || s === "f" ? ecrireSexe(db, s) : undefined))
      .then(relireCorps)
      .then(() => (s === "h" || s === "f" ? fermer() : undefined))
      .catch(console.error);
  const declare = corps?.declare ?? corps?.sexe ?? null;
  const texteNaissance = corps?.naissance
    ? formater(new Date(corps.naissance.a, corps.naissance.m - 1, corps.naissance.j).getTime(), { day: "numeric", month: "long", year: "numeric" })
    : corps?.anneeSeule
      ? String(corps.anneeSeule)
      : t("corps.aRenseigner");

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("menu.corps")} />
      <ScrollView contentContainerStyle={{ paddingBottom: espace.xxl * 2 }}>
        <GroupeReglages style={{ marginTop: espace.s }}>
          <LigneReglage libelle={t("profil.prenom")} valeur={reglages.prenom || t("corps.aRenseigner")} onPress={() => setOuvert("prenom")} />
          <LigneReglage libelle={t("corps.sexe")} valeur={corps ? (declare ? t(`parcours.sexe.${declare}`) : t("corps.aRenseigner")) : undefined} onPress={() => setOuvert("sexe")} />
          <LigneReglage
            libelle={t("corps.naissance")}
            sous={corps?.anneeSeule ? <SousEtat actif={false} attention texte={t("corps.aPreciser")} /> : undefined}
            valeur={corps ? texteNaissance : undefined}
            onPress={ouvrirNaissance}
          />
          <LigneReglage
            libelle={t("corps.taille")}
            sous={corps?.taille ? `${nomSourceCorps(corps.taille)}${corps.taille.date ? `, ${quand(corps.taille.date)}` : ""}` : undefined}
            valeur={corps ? (corps.taille ? `${nombre(corps.taille.valeur, 0)} ${t("nutrition.cm")}` : t("corps.aRenseigner")) : undefined}
            onPress={() => setOuvert("taille")}
          />
          {/* Les réponses de l'étape des garde-fous du parcours (D19 : « Tu pourras changer ta réponse dans ton profil »). */}
          <LigneReglage libelle={t("macros.situation.titre")} onPress={() => router.push("/settings/situation")} />
        </GroupeReglages>

      </ScrollView>

      <FeuilleNomSection
        visible={ouvert === "prenom"}
        titre={t("profil.prenom")}
        initial={reglages.prenom}
        bouton={t("profil.enregistrer")}
        libelle={t("profil.prenom")}
        videPermis
        onFermer={fermer}
        onValider={(p) => {
          regler({ prenom: p });
          fermer();
        }}
      />
      <Feuille visible={ouvert === "sexe"} onFermer={fermer} titre={t("corps.sexe")} sousTitre={t("corps.sexeAide")}>
        <Groupe>
          {SEXES.map((s, i) => (
            <Option key={s} premier={i === 0} libelle={t(`parcours.sexe.${s}`)} choisi={declare === s} onPress={() => choisirSexe(s)} />
          ))}
        </Groupe>
        {declare === "nb" || declare === "np" ? (
          <>
            <SectionReglages titre={t("corps.pourLeCalcul")} />
            <Groupe>
              {(["h", "f"] as const).map((s, i) => (
                <Option
                  key={s}
                  premier={i === 0}
                  libelle={t(s === "h" ? "nutrition.homme" : "nutrition.femme")}
                  choisi={corps?.sexe === s}
                  onPress={() => void ecrireSexe(db, s).then(relireCorps).then(fermer).then(signalerSaisie).catch(console.error)}
                />
              ))}
            </Groupe>
          </>
        ) : null}
      </Feuille>
      <Feuille
        visible={ouvert === "naissance"}
        onFermer={fermer}
        titre={t("corps.naissance")}
        sousTitre={t("corps.naissanceAide")}
        glisserContenu={false}
        pied={
          <Bouton
            libelle={t("profil.enregistrer")}
            variante="primaire"
            large
            onPress={() => void ecrireDateNaissance(db, date).then(relireCorps).then(fermer).then(signalerSaisie).catch(console.error)}
          />
        }
      >
        <MolettesDate naissance={date} onChange={setDate} />
      </Feuille>
      <FeuilleRoue
        visible={ouvert === "taille"}
        titre={t("corps.taille")}
        sous={t("corps.tailleAide")}
        valeur={Math.round(corps?.taille?.valeur ?? 170)}
        valeurs={TAILLES}
        texte={(v) => `${nombre(v, 0)} ${t("nutrition.cm")}`}
        onFermer={fermer}
        onValider={(v) => {
          fermer();
          ajouterMensuration(db, "taille", v).then(relireCorps).then(signalerSaisie).catch(console.error);
        }}
      />
    </SafeAreaView>
  );
}
