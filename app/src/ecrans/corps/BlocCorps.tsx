import { useEffect, useRef, useState } from "react";
import { PixelRatio, StyleSheet, View, type ViewInstance } from "react-native";
import { router, useIsFocused } from "expo-router";
import { listerBlessures, listerTraitements, prisesEntre } from "../../db";
import { useTheme } from "../../theme";
import { espace, rayon } from "../../theme/typo";
import { useLargeurContenu } from "../../ui/CadreContenu";
import { Texte } from "../../ui/Texte";
import { placeAme } from "../../ui/3d/verre";
import { t } from "../../i18n/index";
import { lecture } from "../../precision/modele";
import { useCharge } from "../contexte";
import { CarteWhoop } from "../CarteWhoop";
import { CarteCycle } from "../cycle/CarteCycle";
import { FeuilleEnergie } from "../FeuilleEnergie";
import { corpsAffiche } from "../morphologie-calc";
import { FeuillePrecision } from "../precision/FeuillePrecision";
import { usePrecision } from "../precision/usePrecision";
import { dispositionMoi } from "../sante-vue";
import { minuitDe, type DonneesSante } from "../sante-lecteurs";
import { arrete, articulationsAllumees, compteJour, resumeBlessures, zonesAllumees } from "../suivi-calc";
import { Filet, IconeSante, Ligne, Statut } from "../suivi-ui";
import { Bilan, BlocVo2, CarteVide } from "./CartesCorps";
import { useLienCorps, useMorphoDuLien } from "./donnees-corps";
import { useVisibiliteCorps, type DefilementCorps } from "./useDefilementCorps";
import { ZoneCorps } from "./ZoneCorps";

// Le contenu du Corps, à partir du personnage (planche Moi v4) : le personnage en verre teinté sur l'aura, ses valeurs reliées à
// l'endroit du corps qu'elles décrivent, le bilan de l'énergie du jour choisi, la VO2max, le cycle, Whoop, les blessures et les
// compléments, et les feuilles Énergie et Précision. Un seul composant, posé par la page Santé (ecrans/Sante).
// Un jour passé : chaque valeur est lue telle qu'elle était à la fin de ce jour ; le corps et le résumé restent ceux d'aujourd'hui.

const MARGE = espace.l;
/** Le personnage se monte (un contexte GL) quand sa zone approche de l'écran : cette avance (dp) sous le bas de la liste. */
const AVANCE_ENTREE = 200;

type Props = {
  /** Le jour choisi (AAAA-MM-JJ, jamais le futur) et aujourd'hui (AAAA-MM-JJ). */
  date: string;
  aujourdhui: string;
  /** Les données du jour (useDonneesCorps), lues par la page : elle relit aussi au tirage. */
  donnees: Partial<DonneesSante>;
  /** Le défilement de la page (useDefilementCorps) : sans lui, le personnage est toujours à l'écran. */
  defilement?: DefilementCorps;
};

export function BlocCorps({ date, aujourdhui, donnees, defilement }: Props) {
  const { couleurs } = useTheme();
  // largeur de la colonne (Fold déplié, ui/largeur.ts)
  const width = useLargeurContenu();
  // Le corps reste monté quand on quitte la page (docs/PERF-C.md, M7) : son contexte GL survit à la perte de sa surface
  // (patches/expo-gl), le retour n'a rien à refaire. Hors de l'écran, sa boucle est en pause (CorpsSante : sans le focus, plus
  // aucun rendu ; pendant le vol de l'âme vers la page Âge, posée en transparence, il se dessine encore).
  const focus = useIsFocused();
  const precision = usePrecision(focus);
  const lien = useLienCorps();
  const morpho = useMorphoDuLien();
  const jour = minuitDe(date);
  const passe = date !== aujourdhui;
  const [feuille, setFeuille] = useState(lien.energie === "1");
  const [feuillePrecision, setFeuillePrecision] = useState(false);
  // la page reste montée : un second lien ?energie=1 rouvre la feuille
  useEffect(() => {
    if (lien.energie === "1") setFeuille(true);
  }, [lien.energie]);
  // Blessures et compléments (D1, D2) : la liste sous le bilan, la blessure active allumée sur le personnage ; les prises du
  // jour choisi.
  const [suivi] = useCharge(
    async (db) => ({ blessures: await listerBlessures(db), traitements: await listerTraitements(db), prises: await prisesEntre(db, date, date) }),
    [date],
  );
  const allumees = zonesAllumees(suivi?.blessures ?? []);
  const reperes = articulationsAllumees(suivi?.blessures ?? []);
  const enCours = resumeBlessures(suivi?.blessures ?? []);
  const compte = compteJour(suivi?.traitements ?? [], suivi?.prises ?? [], date);
  const actifs = (suivi?.traitements ?? []).filter((x) => !arrete(x, date)).length;
  const corps = corpsAffiche(morpho);
  // Disposition (5/11) : calculée depuis la taille du corps dessiné, la largeur de la colonne et la police du système
  const dispo = dispositionMoi(corps.tailleCm, width, PixelRatio.getFontScale());
  const energie = donnees.energie ?? null;
  // La zone du corps sortie de l'écran par le défilement ne se dessine plus ; la poitrine sortie, l'âme non plus.
  const [zoneY, setZoneY] = useState<number | null>(null);
  const zone = useRef<ViewInstance>(null);
  const placeA = placeAme(corps.tailleCm);
  const haut = zoneY ?? 150;
  const { corpsVisible, ameVue, defileCorps } = useVisibiliteCorps(
    defilement,
    // la poitrine sortie par le haut : rayon de l'âme et de sa lueur, 45 dp
    { corps: haut + dispo.hauteur, ame: haut - dispo.decalage + placeA.y + 45, entree: zoneY == null ? Infinity : zoneY - AVANCE_ENTREE },
  );

  return (
    <>
      <View
        ref={zone}
        style={{ height: dispo.hauteur, overflow: "hidden" }}
        accessible={false}
        onLayout={(ev) => setZoneY(ev.nativeEvent.layout.y)}
      >
        <ZoneCorps
          donnees={donnees}
          precision={precision}
          morpho={morpho}
          corps={corps}
          dispo={dispo}
          jour={jour}
          passe={passe}
          allumees={allumees}
          reperes={reperes}
          zone={zone}
          corpsVisible={corpsVisible}
          ameVue={ameVue}
          defileCorps={defileCorps}
        />
      </View>
      {/* l'énergie a toujours un bilan (plus ou moins précis) : il ouvre la page Énergie sur le jour choisi */}
      {energie?.etat === "bilan" ? <Bilan e={energie.e} onPress={() => router.push({ pathname: "/sante/energie", params: { jour: String(jour) } })} /> : null}
      {/* VO2max sous Énergie (D1) : la valeur, la catégorie pour l'âge, la VMA ; ouvre sa page */}
      {donnees.vo2?.vo2 ? (
        // précision pepfit : la VO2max attend que son calcul soit sûr (≥ 50 et cap Portrait) ; en attente, sa carte le dit
        precision && !lecture(precision.r, "vo2").ouverte ? (
          <CarteVide titre={t("vo2.court")} texte={t("precision.attente.bientot")} onPress={() => router.push("/sante/vo2max")} />
        ) : (
          <BlocVo2 d={donnees.vo2} />
        )
      ) : null}
      {/* Récupération et Effort sont dans la rangée sous le semainier (Social v4) ; l'Âge pepfit est dans le corps
          (planches/age-coeur, D1 du 29/10 : sa carte d'ici est retirée) */}
      {/* Suivi du cycle (planche cycle, D3) : seulement si le suivi est allumé */}
      {donnees.cycle ? <CarteCycle d={donnees.cycle} /> : null}
      {/* sans score, Whoop dit qu'il attend sa synchro (les deux scores lus : la carte Whoop ne passe pas avant eux) */}
      {donnees.recup === null && donnees.effort === null ? (
        donnees.whoop ? (
          <CarteWhoop j={donnees.whoop} />
        ) : donnees.whoopConnecte ? (
          <CarteVide titre={t("journee.whoop")} texte={t("sante.whoopAttente")} onPress={() => router.push("/settings/connexions")} />
        ) : null
      ) : null}
      {suivi ? (
        <View style={[styles.suivi, { backgroundColor: couleurs.verreCarte, borderColor: couleurs.verreFilet }]}>
          <Ligne
            avant={<IconeSante nom="pansement" />}
            titre={t("suivi.blessures")}
            hauteur={64}
            sous={
              enCours.length ? (
                <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "nowrap", overflow: "hidden" }}>
                  {enCours.map((b, i) => (
                    <View key={`${b.titre}${i}`} style={{ flexDirection: "row", alignItems: "center" }}>
                      {i > 0 ? (
                        <Texte variante="meta" couleur="t2">
                          {", "}
                        </Texte>
                      ) : null}
                      <Statut statut={b.statut} texte={b.titre} taille={12} gras={false} />
                    </View>
                  ))}
                </View>
              ) : (
                t("suivi.aucuneBlessure")
              )
            }
            onPress={() => router.push("/blessures")}
          />
          <Filet />
          <Ligne
            avant={<IconeSante nom="flacon" />}
            titre={t("suivi.complements")}
            hauteur={64}
            sous={
              compte.prevus
                ? t(compte.pris > 1 ? "suivi.prisesDuJour" : "suivi.priseDuJour", compte)
                : actifs
                  ? t("suivi.enCoursN", { n: actifs })
                  : t("suivi.aucunComplement")
            }
            onPress={() => router.push("/traitements")}
          />
        </View>
      ) : null}
      {/* une seule feuille à la fois : la précision de la dépense prend la place de la feuille Énergie (§ 6 bis) */}
      <FeuilleEnergie
        visible={feuille}
        onFermer={() => setFeuille(false)}
        jourDepart={jour}
        onPrecision={() => {
          setFeuille(false);
          setFeuillePrecision(true);
        }}
      />
      <FeuillePrecision e={precision} calcul="depense" visible={feuillePrecision} onFermer={() => setFeuillePrecision(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  suivi: { marginHorizontal: MARGE, marginTop: espace.m, borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
});
