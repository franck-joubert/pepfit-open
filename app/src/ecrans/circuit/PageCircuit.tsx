import { useEffect, useMemo, useState } from "react";
import { Pressable, Share, StyleSheet, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import Animated, { useAnimatedReaction } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { activiteAffichee, cibleDuDepart, cleSource, plageProfil, SUIVRE_DISPONIBLE } from "../../circuits/page";
import { ACTIVITES_CIRCUIT, type ActiviteCircuit, type Circuit } from "../../circuits/types";
import { vueDuCircuit } from "../../circuits/vue";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { espace, rayon } from "../../theme/typo";
import { AuraFond } from "../../ui/AuraFond";
import { useDefilementAura } from "../../ui/aura-etat";
import { BarreHaut, BoutonIcone } from "../../ui/Cadre";
import { Icone } from "../../ui/Icone";
import { ImageLieu } from "../../ui/ImageLieu";
import { revenir } from "../../ui/revenir";
import { Segmente } from "../../ui/Segmente";
import { Texte } from "../../ui/Texte";
import { BarreSurPhoto, barreReplie, useHautEntete } from "../BarreSurPhoto";
import { useApp } from "../contexte";
import { Bref, LigneBrique, Puce, TitreGroupe, Vide } from "../briques";
import { distanceDe, usePositionConnue } from "../usePositionConnue";
import { pictoActivite } from "./activites";
import { AttenteCircuit } from "./AttenteCircuit";
import { BarreSuivre } from "./BoutonSuivre";
import { CarteCircuit } from "./CarteCircuit";
import { ChiffresCircuit } from "./ChiffresCircuit";
import { CouvertureCircuit } from "./CouvertureCircuit";
import { MenuCircuit } from "./MenuCircuit";
import { MonTemps } from "./MonTemps";
import { ProfilCircuit } from "./ProfilCircuit";
import { resumeCircuit } from "./texte";
import { useCircuit } from "./useCircuit";

// LA page d'un circuit (planche Circuits, page ; docs/CODE-CIRCUITS.md) : la couverture (l'image du tracé), le nom, la carte qui s'ouvre
// en plein écran, l'activité, les trois chiffres, le profil, le départ, « Mon temps » (sur le téléphone seulement), d'où viennent les
// données, et au bas le seul bouton, « Suivre ce circuit » (BoutonSuivre). Le circuit se lit sur le téléphone. Trois états : chargement
// (formes d'attente), prêt, retiré.

const BLANC = "rgba(255,255,255,0.96)";
const HAUTEUR_CARTE = 208;

export function PageCircuit({ id }: { id: string }) {
  const { etat, relire } = useCircuit(id);

  if (!etat) {
    return (
      <SafeAreaView edges={[]} style={styles.page}>
        <AuraFond partie="fil" fixe />
        <AttenteCircuit />
        <BarreSurPhoto replie={false} titre="" titreSurPhoto={false}>
          {() => null}
        </BarreSurPhoto>
      </SafeAreaView>
    );
  }
  if (etat.etat === "retire") {
    return (
      <SafeAreaView edges={["top"]} style={styles.page}>
        <AuraFond partie="fil" fixe />
        <BarreHaut titre={t("circuit.titre")} />
        <Vide icone="circuit" titre={t("circuit.retire.titre")} texte={t("circuit.retire.texte")} />
      </SafeAreaView>
    );
  }
  return <CircuitPret circuit={etat.circuit} relire={relire} />;
}

function CircuitPret({ circuit, relire }: { circuit: Circuit; relire: () => Promise<void> }) {
  const { db } = useApp();
  const { couleurs } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hautEntete = useHautEntete();
  const hautImage = hautEntete + Math.min(width / 2, 240);
  const position = usePositionConnue();
  const [replie, setReplie] = useState(false);
  // Le défilement va sur le thread UI (l'aura du Fil le suit) ; la barre ne repasse par le JS que quand elle se replie ou se déplie.
  const { defilement, surDefilement } = useDefilementAura();
  useAnimatedReaction(
    () => barreReplie(defilement.value, hautImage, hautEntete),
    (maintenant, avant) => {
      if (maintenant !== avant) scheduleOnRN(setReplie, maintenant);
    },
    [hautImage, hautEntete],
  );
  const [menu, setMenu] = useState(false);
  const [choisie, setChoisie] = useState<ActiviteCircuit | null>(null);
  const [cible, setCible] = useState<string | null>(null);
  const vue = useMemo(() => vueDuCircuit(circuit), [circuit]);

  useEffect(() => {
    let actif = true;
    cibleDuDepart(db, circuit.departLieu)
      .then((c) => actif && setCible(c))
      .catch(console.warn);
    return () => {
      actif = false;
    };
  }, [db, circuit.departLieu]);

  // Un tracé illisible (jamais publié par cette appli) : rien à dessiner, la page le dit comme un circuit qui ne se charge pas.
  if (!vue) {
    return (
      <SafeAreaView edges={["top"]} style={styles.page}>
        <AuraFond partie="fil" fixe />
        <BarreHaut titre={t("circuit.titre")} />
        <Vide icone="circuit" titre={t("circuit.indisponible.titre")} />
      </SafeAreaView>
    );
  }

  const activite = activiteAffichee(circuit.activites, choisie);
  const ordre = ACTIVITES_CIRCUIT.filter((a) => circuit.activites.includes(a));
  const source = cleSource(circuit);
  const texteSource = source.avecIgn ? t("circuit.source.avecIgn", { source: t(source.cle) }) : t(source.cle);
  const depart = circuit.departNom ?? circuit.commune;
  const loin = distanceDe(position, vue.points[0]!);
  const ouvrirDepart = () => {
    if (cible) router.push({ pathname: "/gym/[id]", params: { id: cible } });
  };
  const partager = () => {
    // Le partage est un texte (nom et résumé) : un circuit n'a pas de page web où mener.
    Share.share({ message: `${circuit.nom}\n${resumeCircuit(circuit)}` }).catch(console.warn);
  };
  const plage = plageProfil(circuit);

  return (
    <SafeAreaView edges={[]} style={styles.page}>
      <AuraFond partie="fil" fixe defilement={defilement} />
      <View style={styles.zone}>
        <BarreSurPhoto replie={replie} titre={circuit.nom} titreSurPhoto={false}>
          {(blanc) => (
            <>
              <BoutonIcone nom="partager" couleur={blanc ? BLANC : undefined} libelle={t("circuit.partager")} onPress={partager} />
              <BoutonIcone nom="more" couleur={blanc ? BLANC : undefined} libelle={t("circuit.options")} onPress={() => setMenu(true)} />
            </>
          )}
        </BarreSurPhoto>
        <Animated.ScrollView
          contentContainerStyle={{ paddingBottom: espace.xxl * 2 + bottom + (SUIVRE_DISPONIBLE ? 52 + espace.l : 0) }}
          scrollEventThrottle={16}
          onScroll={surDefilement}
        >
          <CouvertureCircuit circuit={circuit} vue={vue} haut={hautEntete} />
          <View style={styles.corps}>
            <Texte variante="titreFort" accessibilityRole="header" style={styles.titre}>
              {circuit.nom}
            </Texte>
            {circuit.commune ? (
              <Texte variante="libelle" couleur="t2" style={styles.commune}>
                {circuit.commune}
              </Texte>
            ) : null}
            <View style={styles.puces}>
              <Puce ton="plein" icone="circuit" libelle={t(`circuit.type.${circuit.type}`)} />
              {ordre.length === 1 ? <Puce ton="plein" icone={pictoActivite(ordre[0]!)} libelle={t(`circuit.activite.${ordre[0]!}`)} /> : null}
            </View>

            <View style={styles.carte}>
              <CarteCircuit vue={vue} type={circuit.type} hauteur={HAUTEUR_CARTE} onOuvrir={() => router.push({ pathname: "/circuit/carte/[id]", params: { id: circuit.id } })} />
            </View>

            {ordre.length > 1 ? (
              <Segmente<ActiviteCircuit>
                style={styles.segmente}
                valeur={activite}
                onChange={setChoisie}
                options={ordre.map((a) => ({
                  valeur: a,
                  libelle: t(`circuit.activite.${a}`),
                  avant: <Icone nom={pictoActivite(a)} couleur={a === activite ? couleurs.t1 : couleurs.t2} taille={18} />,
                }))}
              />
            ) : null}

            <ChiffresCircuit circuit={circuit} activite={activite} />

            <View style={styles.profil}>
              <ProfilCircuit vue={vue} plage={plage} />
            </View>

            {depart ? (
              <>
                <TitreGroupe texte={t("circuit.depart")} haut={espace.xxl + espace.s} />
                {/* La ligne d'un lieu est de pleine largeur : on la recale sur les marges de la page. */}
                <View style={styles.depart}>
                  <LigneBrique
                    premier
                    avant={
                      <ImageLieu picto="place" taillePicto={22} style={styles.vignette} />
                    }
                    titre={depart}
                    sous={loin ? t("circuit.depart.deToi", { distance: loin }) : null}
                    chevron={!!cible}
                    accessibilityLabel={cible ? `${depart}. ${t("circuit.depart.voir")}` : depart}
                    onPress={cible ? ouvrirDepart : undefined}
                  />
                </View>
              </>
            ) : null}

            {SUIVRE_DISPONIBLE ? <MonTemps circuitId={circuit.id} /> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("circuit.source.voir", { texte: texteSource })}
              onPress={() => router.push("/settings/aide/credits")}
              style={styles.source}
            >
              <Icone nom="info" couleur={couleurs.t3} taille={16} />
              <Texte variante="meta" couleur="t3" style={styles.sourceTexte}>
                {texteSource}
              </Texte>
              <Icone nom="right" couleur={couleurs.t3} taille={14} />
            </Pressable>
          </View>
        </Animated.ScrollView>
        {SUIVRE_DISPONIBLE ? <BarreSuivre circuit={circuit} activite={choisie} /> : null}
      </View>
      <MenuCircuit circuit={circuit} visible={menu} onFermer={() => setMenu(false)} onChange={() => void relire()} onSupprime={revenir} />
      <Bref />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  zone: { flex: 1 },
  corps: { paddingHorizontal: espace.l },
  titre: { marginTop: espace.l, fontSize: 22, lineHeight: 28, letterSpacing: -0.26 },
  commune: { marginTop: espace.xs },
  puces: { flexDirection: "row", flexWrap: "wrap", gap: espace.s, marginTop: espace.m },
  carte: { marginTop: espace.l },
  segmente: { marginTop: espace.m },
  profil: { marginTop: espace.xxl },
  depart: { marginLeft: -espace.l, marginRight: -espace.m },
  vignette: { width: 56, height: 56, borderRadius: rayon.l, overflow: "hidden" },
  // 44 de haut au moins : la ligne entière se touche.
  source: { flexDirection: "row", alignItems: "center", gap: espace.s, minHeight: 44, marginTop: espace.xl },
  sourceTexte: { flex: 1 },
});
