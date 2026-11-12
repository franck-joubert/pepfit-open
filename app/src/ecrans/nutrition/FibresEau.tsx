import type { ReactNode } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import { COULEURS_SUIVIS, type CleSuivi } from "../../nutrition/calculs";
import { FIBRES, type FibresDuJour, type Echange } from "../../nutrition/fibres-eau";
import type { Repas, ReglagesFibresEau } from "../../db";
import { useTheme } from "../../theme";
import { avecOpacite } from "../../theme/teintes";
import { espace, police, rayon } from "../../theme/typo";
import { BoutonTonal } from "../../ui/BoutonTonal";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille } from "../../ui/Feuille";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { approx, nombre } from "../format";
import { auRepas, FeuilleRoue, Jauge, MARGE_CARTE, plage } from "./commun";
import { useModeAffichage } from "./mode-affichage";
import type { OngletEau } from "./FeuilleEau";

// Fibres et eau du Journal (planche Fibres et eau, docs/CODE-FIBRES-EAU.md) : deux barres sous le résumé, le bouton goutte, la carte
// d'astuce du bas (et son palier de +5 g), la feuille des quatre habitudes. Les barres reprennent le langage du résumé (libellé 11,
// valeur 15, objectif 12, jauge 4) ; seule la jauge est colorée, la valeur reste en t1. Une valeur de fibres incomplète (un aliment du
// jour sans fibres connues) passe par `approx()` : la planche dessine « ~18 », l'appli n'écrit plus de « ~ » depuis le 31/10.

/** Hauteur de la ligne de libellé : celle de la goutte (32), pour que les deux jauges soient à la même hauteur. */
const LIGNE = 32;
/** Au-delà, les deux barres passent l'une sous l'autre (planche : « le libellé, la valeur et l'objectif ne se coupent jamais »). */
const POLICE_EMPILE = 1.15;

export function useCouleursSuivis() {
  const { mode } = useTheme();
  return COULEURS_SUIVIS[mode];
}

const capitale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ------------------------------------------------------------------ Les deux barres

export function BarresFibresEau({
  jour,
  reglages,
  fibres,
  eauMl,
  onEau,
  onFibres,
}: {
  jour: string;
  reglages: ReglagesFibresEau;
  fibres: FibresDuJour | null;
  eauMl: number;
  onEau: (onglet: OngletEau) => void;
  /** Ouvre la page de suivi des fibres (D10) : toute la cellule Fibres est le bouton, sans chevron. Absent : la cellule ne bouge pas. */
  onFibres?: () => void;
}) {
  const aff = useModeAffichage();
  const { fontScale } = useWindowDimensions();
  // D11 : sans chiffres, tout disparaît (barres, goutte, carte) ; D12 : un suivi coupé masque sa barre sans rien effacer.
  if (!aff.totauxJournalVisibles) return null;
  const { fibresSuivi, eauSuivi } = reglages;
  if (!fibresSuivi && !eauSuivi) return null;
  const empile = fibresSuivi && eauSuivi && fontScale > POLICE_EMPILE;
  const objectifs = aff.objectifsVisibles;
  const g = Math.round(fibres?.g ?? 0);
  const objG = reglages.fibresObjectifG;
  const objL = nombre(reglages.eauObjectifMl / 1000, 1);
  const eauTexte = nombre(eauMl / 1000, 2);
  return (
    <View style={[styles.barres, empile ? { flexDirection: "column", gap: espace.m + 2 } : { flexDirection: "row", gap: espace.l }]}>
      {fibresSuivi ? (
        <Cellule
          cle="fibres"
          jour={jour}
          libelle={t("nutrition.fibres")}
          valeur={g}
          texteValeur={approx(nombre(g, 0), fibres?.partiel === true)}
          cible={objectifs ? objG : null}
          texteSuite={objectifs ? t("fibres.sur", { n: objG }) : t("nutrition.g")}
          lu={
            fibres?.partiel === true
              ? t(objectifs ? "fibres.a11yPartiel" : "fibres.a11ySansPartiel", { n: g, max: objG })
              : objectifs
                ? t("fibres.a11y", { n: g, max: objG })
                : t("fibres.a11ySans", { n: g })
          }
          empile={empile}
          entree={onFibres}
        />
      ) : null}
      {eauSuivi ? (
        <Cellule
          cle="eau"
          jour={jour}
          libelle={t("eau.nom")}
          valeur={eauMl}
          texteValeur={eauTexte}
          cible={objectifs ? reglages.eauObjectifMl : null}
          texteSuite={objectifs ? t("eau.sur", { n: objL }) : t("eau.unite")}
          lu={objectifs ? t("eau.a11y", { n: eauTexte, max: objL }) : t("eau.a11ySans", { n: eauTexte })}
          empile={empile}
          onPress={() => onEau("aujourdhui")}
          droite={<Goutte onPress={() => onEau("ajouter")} />}
        />
      ) : null}
    </View>
  );
}

function Cellule({
  cle,
  jour,
  libelle,
  valeur,
  texteValeur,
  cible,
  texteSuite,
  lu,
  empile,
  onPress,
  droite,
  entree,
}: {
  cle: CleSuivi;
  jour: string;
  libelle: string;
  valeur: number;
  texteValeur: string;
  /** Objectif, ou null sans objectif visible (grossesse, moins de 18 ans) : la valeur seule, sans jauge. */
  cible: number | null;
  /** « / 30 g », ou l'unité seule sans objectif. */
  texteSuite: string;
  lu: string;
  empile: boolean;
  onPress?: () => void;
  droite?: ReactNode;
  /** Toute la cellule est un bouton de 48 de haut au moins (D10), sans chevron : la zone déborde de 6 en haut et en bas, de 8 de chaque côté. */
  entree?: () => void;
}) {
  const { couleurs } = useTheme();
  const texte = (
    <Texte variante="meta" couleur="t2" numberOfLines={1} style={{ fontSize: 11, lineHeight: 20 }}>
      {libelle}
      <Texte variante="saisie" couleur="t1" style={{ fontSize: 15, lineHeight: 20 }}>
        {` ${texteValeur}`}
      </Texte>
      <Texte variante="meta" couleur="t3">
        {` ${texteSuite}`}
      </Texte>
    </Texte>
  );
  const valeurA11y = cible != null ? { min: 0, max: cible, now: Math.min(valeur, cible) } : undefined;
  if (entree) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${lu}, ${t("fibres.ouvrirSuivi")}`}
        accessibilityValue={valeurA11y}
        onPress={entree}
        style={({ pressed }) => [empile ? undefined : styles.cellule, styles.entree, pressed && { backgroundColor: couleurs.s3 }]}
      >
        <View style={styles.ligne}>
          <View style={styles.libelle}>{texte}</View>
          {droite}
        </View>
        {cible != null ? (
          <View style={{ marginTop: 6 }}>
            <Jauge jour={jour} cle={cle} valeur={valeur} cible={cible} />
          </View>
        ) : null}
      </Pressable>
    );
  }
  return (
    <View style={empile ? undefined : styles.cellule}>
      <View style={styles.ligne}>
        {onPress ? (
          <Pressable accessibilityRole="progressbar" accessibilityLabel={lu} accessibilityValue={valeurA11y} onPress={onPress} hitSlop={{ top: 6, bottom: 6 }} style={styles.libelle}>
            {texte}
          </Pressable>
        ) : (
          <View accessible accessibilityRole="progressbar" accessibilityLabel={lu} accessibilityValue={valeurA11y} style={styles.libelle}>
            {texte}
          </View>
        )}
        {droite}
      </View>
      {cible != null ? (
        <Pressable accessible={false} importantForAccessibility="no-hide-descendants" disabled={!onPress} onPress={onPress} hitSlop={{ top: 8, bottom: 14 }} style={{ marginTop: 6 }}>
          <Jauge jour={jour} cle={cle} valeur={valeur} cible={cible} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Le bouton goutte : la forme du + d'un repas (32, rayon 12, bordure 1,5) dans une zone de 44 qui déborde de la ligne ; couleur de l'eau. */
function Goutte({ onPress }: { onPress: () => void }) {
  const eau = useCouleursSuivis().eau;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t("eau.ajouter")} onPress={onPress} style={styles.zoneGoutte}>
      {({ pressed }) => (
        <View style={[styles.goutte, { borderColor: eau }, pressed && { backgroundColor: avecOpacite(eau, 0.16) }]}>
          <Icone nom="goutte" couleur={eau} taille={18} epaisseur={2.25} />
        </View>
      )}
    </Pressable>
  );
}

// ------------------------------------------------------------------ Carte d'astuce et palier

/** Bloc teinté plat (fond de la partie à 9 % la nuit, 7 % le jour), comme la note des Objectifs : il ne rivalise pas avec les repas. */
function useFondDoux() {
  const { couleurs, mode } = useTheme();
  return (appui = false) => avecOpacite(couleurs.partieNutrition, (mode === "nuit" ? 0.09 : 0.07) + (appui ? 0.04 : 0));
}

/**
 * « Pour monter tes fibres » (planche page de suivi des fibres, D7) : un seul composant pour le Journal et la page. Une phrase au
 * conditionnel au Journal (le titre, la phrase, un chevron) ; plusieurs sur la page (le titre et le chevron, puis chaque phrase
 * entre deux filets). Toucher ouvre les habitudes, la même feuille. `style` : les marges de la carte, quand elle n'est pas dans le Journal.
 */
export function CarteConseils({ conseils, repas, onPress, style }: { conseils: readonly Echange[]; repas: readonly Repas[]; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  useLangue();
  const { couleurs } = useTheme();
  const fond = useFondDoux();
  const textes = conseils.map((c) => texteConseil(c, repas));
  if (!textes.length) return null;
  const multi = textes.length > 1;
  const titre = (
    <Texte variante="corps" style={{ fontSize: 13, fontFamily: police.semibold }}>
      {t("fibres.carte.titre")}
    </Texte>
  );
  const chevron = <Icone nom="right" couleur={couleurs.t3} taille={16} />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t("fibres.carte.titre")}. ${textes.join(" ")}`}
      accessibilityHint={t("fibres.carte.ouvrir")}
      onPress={onPress}
      style={({ pressed }) => [styles.carte, multi ? styles.carteMulti : styles.carteLigne, { backgroundColor: fond(pressed) }, style]}
    >
      {multi ? (
        <>
          <View style={styles.conseilsTete}>
            <View style={{ flex: 1, minWidth: 0 }}>{titre}</View>
            <View style={styles.conseilsChevron}>{chevron}</View>
          </View>
          {textes.map((x, i) => (
            <View key={x} style={[styles.conseil, i === 0 ? styles.conseilPremier : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line }, i === textes.length - 1 && { paddingBottom: 12 }]}>
              <Texte variante="corps" couleur="t2" style={{ fontSize: 13, lineHeight: 19 }}>
                {x}
              </Texte>
            </View>
          ))}
        </>
      ) : (
        <>
          <View style={{ flex: 1, minWidth: 0 }}>
            {titre}
            <Texte variante="corps" couleur="t2" style={{ fontSize: 13, lineHeight: 19, marginTop: 2 }}>
              {textes[0]}
            </Texte>
          </View>
          {chevron}
        </>
      )}
    </Pressable>
  );
}

/** La phrase d'un conseil : « Au déjeuner, du riz complet… » ; un repas que la personne a nommé elle-même ne se décline pas (« au Brunch »), la phrase se dit sans repas. */
function texteConseil(c: Echange, repas: readonly Repas[]): string {
  const r = c.repasId ? repas.find((x) => x.id === c.repasId) : c.repasCle ? repas.find((x) => x.cle === c.repasCle) : undefined;
  const quand = r && r.nom == null ? auRepas(r) : null;
  const phrase = t(`fibres.echange.${c.cle}`, { n: c.gainG });
  return capitale(quand ? t("fibres.carte.avecRepas", { quand, phrase }) : t("fibres.carte.sansRepas", { phrase }));
}

/** Après deux semaines tenues : la même place propose +5 g ; rien ne change sans le geste, « Plus tard » repousse d'une semaine. */
export function CartePalier({ objectifG, suivantG, onPasser, onPlusTard, style }: { objectifG: number; suivantG: number; onPasser: () => void; onPlusTard: () => void; style?: StyleProp<ViewStyle> }) {
  useLangue();
  const { couleurs } = useTheme();
  const fond = useFondDoux();
  return (
    <View style={[styles.carte, { backgroundColor: fond() }, style]}>
      <Texte variante="corps" style={{ fontSize: 13, fontFamily: police.semibold }}>
        {t("fibres.palier.titre")}
      </Texte>
      <Texte variante="corps" couleur="t2" style={{ fontSize: 13, lineHeight: 19, marginTop: 2 }}>
        {t("fibres.palier.texte", { g: objectifG, suivant: suivantG })}
      </Texte>
      <View style={styles.actionsPalier}>
        <BoutonTonal libelle={t("fibres.palier.passer", { g: suivantG })} hauteur={44} onPress={onPasser} />
        <Pressable accessibilityRole="link" onPress={onPlusTard} style={({ pressed }) => [styles.lien, pressed && { opacity: 0.6 }]}>
          <Texte variante="corps" style={{ fontSize: 14, fontFamily: police.medium, color: couleurs.t2 }}>
            {t("fibres.palier.plusTard")}
          </Texte>
        </Pressable>
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ La roue de l'objectif

const FIBRES_G = plage(FIBRES.minG, FIBRES.maxG, 1);

/** La roue de l'objectif de fibres (10 à 60 g, au gramme près) : celle des Objectifs et celle de la page de suivi, une seule. */
export function RoueFibres({ visible, objectifG, onFermer, onValider }: { visible: boolean; objectifG: number; onFermer: () => void; onValider: (g: number) => void }) {
  useLangue();
  return (
    <FeuilleRoue
      visible={visible}
      titre={t("fibres.roue.titre")}
      sous={t("fibres.roue.sous", { g: FIBRES.defautG })}
      valeur={objectifG}
      valeurs={FIBRES_G}
      texte={(v) => nombre(v, 0)}
      lue={(v) => t("fibres.grammes", { n: v })}
      unite={t("nutrition.g")}
      onFermer={onFermer}
      onValider={onValider}
      enPlus={
        objectifG !== FIBRES.defautG ? (
          <View style={{ alignItems: "center" }}>
            <BoutonTonal libelle={t("fibres.roue.retablir", { g: FIBRES.defautG })} hauteur={44} onPress={() => onValider(FIBRES.defautG)} />
          </View>
        ) : null
      }
    />
  );
}

// ------------------------------------------------------------------ Les quatre habitudes

const HABITUDES = [
  { titre: "fibres.habitudes.feculents", sous: "fibres.habitudes.feculentsSous" },
  { titre: "fibres.habitudes.legumes", sous: "fibres.habitudes.legumesSous" },
  { titre: "fibres.habitudes.coque", sous: "fibres.habitudes.coqueSous" },
  { titre: "fibres.habitudes.legumineuses", sous: "fibres.habitudes.legumineusesSous" },
] as const;

const GARDE_FOUS = ["fibres.habitudes.gardeCru", "fibres.habitudes.gardeRepas", "fibres.habitudes.gardeDiverticules"] as const;

/** Feuille de lecture : quatre habitudes, trois garde-fous en petit, un lien pour ne plus voir la carte, « Compris » au pied. */
export function FeuilleHabitudes({ visible, objectifG, onFermer, onMasquer }: { visible: boolean; objectifG: number; onFermer: () => void; onMasquer: () => void }) {
  useLangue();
  const { couleurs } = useTheme();
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("fibres.carte.titre")}
      sousTitre={t("fibres.habitudes.sous", { g: objectifG })}
      pied={<BoutonPrincipal libelle={t("fibres.habitudes.compris")} onPress={onFermer} />}
    >
      <View style={{ paddingBottom: espace.s }}>
        {HABITUDES.map((h, i) => (
          <View key={h.titre} style={[styles.habitude, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line }]}>
            <Texte variante="corps" style={{ fontSize: 15, fontFamily: police.medium }}>
              {t(h.titre)}
            </Texte>
            <Texte variante="corps" couleur="t2" style={{ fontSize: 13, lineHeight: 19, marginTop: 2 }}>
              {t(h.sous)}
            </Texte>
          </View>
        ))}
        <View style={[styles.gardes, { borderTopColor: couleurs.line }]}>
          {GARDE_FOUS.map((g) => (
            <Texte key={g} variante="meta" couleur="t3" style={{ lineHeight: 18 }}>
              {t(g)}
            </Texte>
          ))}
        </View>
        <Pressable accessibilityRole="link" onPress={onMasquer} style={({ pressed }) => [styles.masquer, pressed && { opacity: 0.6 }]}>
          <Texte variante="corps" style={{ fontSize: 14, fontFamily: police.medium, color: couleurs.t2 }}>
            {t("fibres.habitudes.masquer")}
          </Texte>
        </Pressable>
      </View>
    </Feuille>
  );
}

const styles = StyleSheet.create({
  // Le résumé du dessus finit avec ses 18 de marge ; les repas commencent 14 sous la ligne de jauges.
  barres: { paddingHorizontal: MARGE_CARTE, marginBottom: 14 },
  cellule: { flex: 1, minWidth: 0 },
  entree: { borderRadius: rayon.l, marginVertical: -6, marginHorizontal: -8, paddingVertical: 6, paddingHorizontal: 8, minHeight: 48 },
  ligne: { flexDirection: "row", alignItems: "center", minHeight: LIGNE },
  libelle: { flex: 1, minWidth: 0, minHeight: LIGNE, justifyContent: "center" },
  // La zone de 44 déborde de la ligne de 32 (6 en haut, 6 en bas, 6 à droite) : le carré visible reste aligné sur le bord de la barre.
  zoneGoutte: { width: 44, height: 44, marginVertical: -6, marginRight: -6, alignItems: "center", justifyContent: "center" },
  goutte: { width: 32, height: 32, borderRadius: rayon.l, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  carte: { marginHorizontal: MARGE_CARTE, marginBottom: 16, borderRadius: rayon.l, paddingHorizontal: 16, paddingVertical: 14 },
  carteLigne: { flexDirection: "row", alignItems: "center", gap: espace.m, minHeight: 44 },
  // Plusieurs phrases (page) : le titre et son chevron de 44, puis chaque phrase entre deux filets ; le chevron déborde de la marge de 16.
  carteMulti: { paddingTop: 4, paddingBottom: 6 },
  conseilsTete: { flexDirection: "row", alignItems: "center", minHeight: 44, marginRight: -16 },
  conseilsChevron: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  conseil: { paddingTop: 10, paddingBottom: 11 },
  conseilPremier: { paddingTop: 0 },
  actionsPalier: { flexDirection: "row", alignItems: "center", gap: espace.s, marginTop: 10, marginLeft: -4 },
  lien: { minHeight: 44, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  habitude: { paddingVertical: 12 },
  gardes: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 10 },
  masquer: { minHeight: 44, marginTop: 6, alignItems: "center", justifyContent: "center" },
});
