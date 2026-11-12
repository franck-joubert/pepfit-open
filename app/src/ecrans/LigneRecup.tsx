import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { avecOpacite, jetonsDePartie, meler } from "../theme/teintes";
import { coinsJonction, useLigneDecalee } from "../ui/GlisserSupprimer";
import { ContourTuile } from "../ui/ContourTuile";
import { Icone } from "../ui/Icone";
import { IconeSynchro } from "../ui/IconeSynchro";
import { Appui } from "../ui/mouvement";
import { Texte } from "../ui/Texte";
import { heure, nombre } from "./format";
import { gabaritLigne } from "./ligne-jour-styles";
import type { Nuit } from "./mesures/sommeil-donnees";
import { iconeRecup, libelleSommeil, sousLigneModifiee, sousLigneSommeil, type ElementRecup, type EtatSommeil } from "./page-effort";
import { nomRecup, sousLigneRecup } from "./recuperer-vues/briques-donnees";

// Lignes « Sommeil » et récupérations (Sauna, Sieste…) de la liste du jour de l'onglet Effort (planche Effort v2.2, D5 et D10) :
// la carte des séances (même gabarit), mais en rose de la section Corps, avec les recettes des cartes du Sport. La nuit : verre
// = noir mêlé de 20 % du rose à 72 %, filet 14 %, tuile 16 % ; le jour : blanc, filet 12 %, tuile 10 %. Le picto est au trait, en
// rose (jour : assombri de 25 %, comme les icônes actives des onglets). Titre, durée et sous-ligne gardent le blanc ou le noir
// translucide : le rose ne porte jamais le texte. Ni score d'effort, ni coche, ni voile : une récupération n'est pas un effort.

/** Les jetons roses de la section Corps (jeton de partie « sante »). */
function useRose() {
  const { mode } = useTheme();
  const j = jetonsDePartie("sante", mode);
  const rose = j.partieSante;
  return {
    verre: j.verreCarte,
    filet: j.verreFilet,
    tuile: avecOpacite(rose, mode === "nuit" ? 0.16 : 0.1),
    // piste du contour du Sommeil : le rose à faible opacité, jamais un gris opaque
    piste: avecOpacite(rose, mode === "nuit" ? 0.28 : 0.22),
    arc: rose,
    picto: mode === "nuit" ? rose : meler(rose, "#000000", 0.25),
  };
}

/** La carte rose, à la place de celle des séances ; dans une ligne qu'on glisse, elle perd ses coins de droite à la jonction. */
function CarteCorps({ children }: { children: ReactNode }) {
  const r = useRose();
  const decalee = useLigneDecalee();
  return <View style={[gabaritLigne.seance, { backgroundColor: r.verre, borderColor: r.filet }, coinsJonction(decalee)]}>{children}</View>;
}

/** `contour` : part du tour (0 à 1) du contour rose qui se dessine autour de la tuile ; absent, pas de contour (récupérations). */
function TuileCorps({ icone, contour }: { icone: Parameters<typeof Icone>[0]["nom"]; contour?: number | null }) {
  const r = useRose();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[gabaritLigne.tuile, { backgroundColor: r.tuile }]}>
      <Icone nom={icone} couleur={r.picto} taille={24} />
      {contour !== undefined ? <ContourTuile part={contour ?? 0} couleur={r.arc} piste={r.piste} /> : null}
    </View>
  );
}

/** Le « … » d'une ligne : 32 × 28 visibles, zone de toucher de 56 × 52 (hitSlop), comme celui des séances. */
function BoutonOptions({ nom, onPress }: { nom: string; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={t("accueil.entrainement.optionsDe", { nom })}
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => [gabaritLigne.options, pressed && { backgroundColor: couleurs.s2 }]}
    >
      <Icone nom="more" couleur={couleurs.t2} taille={20} />
    </Appui>
  );
}

/**
 * « Sommeil » en tête de la liste du jour : la nuit qui finit ce jour. Lue : le titre, suivi du pourcentage en rose quand il y a un
 * score (« Sommeil 56 % »), la durée dormie seule dessous (« 8 h 32 », ni début ni fin : ils sont dans la page Sommeil), « … »
 * (Modifier, Masquer le Sommeil). Sans donnée ou en cours de synchro : le mot à droite, ni « … » ni durée. Elle ouvre la page
 * Sommeil de ce jour.
 */
export function LigneSommeil({
  etat,
  nuit,
  part,
  onOuvrir,
  onMenu,
}: {
  etat: Exclude<EtatSommeil, "aucune">;
  nuit: Nuit | null;
  /** Part du besoin dormie, en % (celle de la page Sommeil, partBesoin) ; null sans mesure : ni pourcentage, ni arc. */
  part?: number | null;
  onOuvrir: () => void;
  onMenu: () => void;
}) {
  useLangue();
  const { couleurs } = useTheme();
  const r = useRose();
  const lue = etat === "lue" && nuit ? nuit : null;
  const mot = t(etat === "synchro" ? "effortJour.synchro" : "effortJour.pasDeDonnee");
  const nom = t("effortJour.sommeil");
  const pct = lue && part != null && Number.isFinite(part) ? Math.max(0, Math.min(100, Math.round(part))) : null;
  return (
    <CarteCorps>
      <Pressable accessibilityRole="button" accessibilityLabel={lue ? libelleSommeil(lue, pct) : `${nom}, ${mot}`} accessibilityHint={t("effortJour.ouvrirSommeil")} onPress={onOuvrir} style={gabaritLigne.seanceLigne}>
        <TuileCorps icone="sommeil" contour={pct != null ? pct / 100 : undefined} />
        <View style={{ flex: 1, gap: 2 }}>
          <Texte variante="exercice" numberOfLines={1}>
            {nom}
            {/* le pourcentage (rose) suit le titre sur la même ligne ; le rose ne porte que lui */}
            {pct != null ? <Texte variante="exercice" style={{ color: r.picto }}>{` ${t("effortJour.sommeilPart", { n: nombre(pct, 0) })}`}</Texte> : null}
          </Texte>
          {lue ? (
            <Texte variante="meta" couleur="t2" numberOfLines={1}>
              {sousLigneSommeil(lue)}
            </Texte>
          ) : null}
        </View>
        {lue ? (
          <BoutonOptions nom={nom} onPress={onMenu} />
        ) : (
          <View style={styles.mot}>
            {etat === "synchro" ? <IconeSynchro enCours nom="arc" taille={16} couleur={couleurs.t2} marge={0} /> : null}
            <Texte variante="meta" couleur="t2" style={styles.motTexte}>
              {mot}
            </Texte>
          </View>
        )}
      </Pressable>
    </CarteCorps>
  );
}

/** Une récupération : son pictogramme au trait, son nom, « 12:20, 15 min, 8 kcal » ; la toucher ouvre la session. */
export function LigneRecup({ e, onMenu }: { e: ElementRecup; onMenu: () => void }) {
  useLangue();
  const nom = nomRecup(e.a.type);
  return (
    <CarteCorps>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("effortJour.ouvrirRecup", { nom, heure: heure(e.a.debut) })}
        onPress={() => router.push({ pathname: "/recuperer/fin", params: { id: e.a.id } })}
        style={gabaritLigne.seanceLigne}
      >
        <TuileCorps icone={iconeRecup(e.a.type)} />
        <View style={{ flex: 1, gap: 2 }}>
          <Texte variante="exercice" numberOfLines={2}>
            {nom}
          </Texte>
          <Texte variante="meta" couleur="t2">
            {sousLigneModifiee(sousLigneRecup(e.a, e.kcal), e.a)}
          </Texte>
        </View>
        <BoutonOptions nom={nom} onPress={onMenu} />
      </Pressable>
    </CarteCorps>
  );
}

const styles = StyleSheet.create({
  mot: { flexDirection: "row", alignItems: "center", gap: 8 },
  motTexte: { fontSize: 14 },
});
