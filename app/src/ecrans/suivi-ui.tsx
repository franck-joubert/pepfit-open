// Briques des écrans Blessures et Compléments (planche sante-suivi) : en-tête, groupes, lignes, titres de groupe,
// statut (carré + mot, jamais la couleur seule), auteur (« Toi » ou ✦ nom de l'IA), boutons en trois, barre de douleur, case de prise.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import type { StatutBlessure } from "../db";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { espace, police, rayon } from "../theme/typo";
import { Actualiser, sansEtirement } from "../ui/Actualiser";
import { AuraFond } from "../ui/AuraFond";
import { useDefilementAura } from "../ui/aura-etat";
import { BoutonIcone } from "../ui/Cadre";
import { useOmbreCarte } from "../ui/ContextePartie";
import { Icone, type NomIcone } from "../ui/Icone";
import { Segmente } from "../ui/Segmente";
import { Texte } from "../ui/Texte";
import { auteurDe, COULEUR_STATUT, libelleStatut } from "./suivi-calc";
import { revenir } from "../ui/revenir";

/**
 * Écran poussé de Santé : l'aura de la partie au repos, l'en-tête (← titre, action), le contenu qui défile. `actualiser` : la page
 * de chiffres se tire pour s'actualiser (Métabolisme, historique d'une mesure) ; les listes qu'on modifie et les fiches non.
 */
export function EcranSuivi({ titre, droite, children, bas, actualiser = false }: { titre: string; droite?: ReactNode; children: ReactNode; bas?: ReactNode; actualiser?: boolean }) {
  useLangue();
  const { defilement, surDefilement } = useDefilementAura();
  // L'en-tête et la page : avec `actualiser`, ils descendent ensemble au tirage (ui/Actualiser) ; `bas` reste en place.
  const corps = (
    <>
      <View style={styles.tete}>
        <BoutonIcone nom="back" libelle={t("ui.retour")} onPress={revenir} />
        <Texte variante="titre" accessibilityRole="header" numberOfLines={1} style={{ flex: 1, marginLeft: 2 }}>
          {titre}
        </Texte>
        {droite}
      </View>
      <Animated.ScrollView {...(actualiser ? sansEtirement : null)} onScroll={surDefilement} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: 96 }} keyboardShouldPersistTaps="handled">
        {children}
      </Animated.ScrollView>
    </>
  );
  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
      <AuraFond partie="sante" fixe defilement={defilement} />
      {actualiser ? <Actualiser defilement={defilement}>{corps}</Actualiser> : corps}
      {bas}
    </SafeAreaView>
  );
}

/**
 * Fond opaque d'une ligne de groupe qu'on glisse (le rouge de « Supprimer » ne transparaît pas) : la carte de la partie
 * (blanche le jour ; la nuit, sa teinte posée sur le noir).
 */
export function useFondGroupe() {
  const { couleurs } = useTheme();
  return couleurs.carteOpaque;
}

/** Groupe de lignes : carte de la partie (v2.2.17 : blanche le jour sur le fond teinté, teintée la nuit), filet et ombre douce. */
export function Groupe({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { couleurs } = useTheme();
  const ombre = useOmbreCarte();
  return (
    <View style={[styles.groupe, { backgroundColor: couleurs.verreCarte, borderWidth: StyleSheet.hairlineWidth, borderColor: couleurs.verreFilet, boxShadow: ombre }, style]}>
      {children}
    </View>
  );
}

export function TitreGroupe({ texte, droite }: { texte: string; droite?: string }) {
  return (
    <View style={styles.titreGroupe}>
      <Texte variante="entete" couleur="t2" accessibilityRole="header">
        {texte}
      </Texte>
      {droite ? (
        <Texte variante="meta" couleur="t2" style={{ fontFamily: police.medium }}>
          {droite}
        </Texte>
      ) : null}
    </View>
  );
}

/** Filet entre deux lignes d'un groupe, en retrait de 16 de chaque côté. */
export function Filet() {
  const { couleurs } = useTheme();
  return <View style={[styles.filet, { backgroundColor: couleurs.line }]} />;
}

/** Ligne de groupe : avant (carré, icône), titre et sous-titre, valeur et sous-valeur, chevron. */
export function Ligne({
  avant,
  titre,
  sous,
  valeur,
  sousValeur,
  doux,
  chevron = true,
  onPress,
  rouge,
  centre,
  hauteur = 56,
  tailleTitre = 15,
  libelle,
}: {
  avant?: ReactNode;
  titre: ReactNode;
  sous?: ReactNode;
  valeur?: ReactNode;
  sousValeur?: ReactNode;
  doux?: boolean;
  chevron?: boolean;
  onPress?: () => void;
  rouge?: boolean;
  centre?: boolean;
  hauteur?: number;
  tailleTitre?: number;
  libelle?: string;
}) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={libelle}
      style={({ pressed }) => [styles.ligne, { minHeight: hauteur }, pressed && { backgroundColor: couleurs.s3 }]}
    >
      {avant}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof titre === "string" ? (
          <Texte
            variante="corps"
            style={[
              { fontSize: tailleTitre, color: rouge ? couleurs.rate : couleurs.t1 },
              rouge && { fontFamily: police.medium },
              centre && { textAlign: "center" },
            ]}
          >
            {titre}
          </Texte>
        ) : (
          titre
        )}
        {sous != null ? (
          <View style={{ marginTop: 2, flexDirection: "row", alignItems: "center" }}>
            {typeof sous === "string" ? (
              <Texte variante="meta" couleur="t2" numberOfLines={1}>
                {sous}
              </Texte>
            ) : (
              sous
            )}
          </View>
        ) : null}
      </View>
      {valeur != null || sousValeur != null ? (
        <View style={{ alignItems: "flex-end", flexShrink: 1, maxWidth: "62%" }}>
          {typeof valeur === "string" ? (
            <Texte variante="corps" numberOfLines={1} style={{ fontSize: 15, fontFamily: doux ? police.regular : police.medium, color: doux ? couleurs.t2 : couleurs.t1 }}>
              {valeur}
            </Texte>
          ) : (
            valeur
          )}
          {sousValeur ? (
            <Texte variante="meta" couleur="t2" style={{ marginTop: 2 }}>
              {sousValeur}
            </Texte>
          ) : null}
        </View>
      ) : null}
      {chevron && onPress ? (
        <View style={{ marginRight: -4 }}>
          <Icone nom="right" couleur={couleurs.t3} taille={16} epaisseur={2} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** Carré de couleur du statut (10 × 10 en tête de ligne, 8 × 8 dans le texte). */
export function Carre({ statut, taille = 10 }: { statut: StatutBlessure; taille?: number }) {
  const { couleurs } = useTheme();
  return <View style={{ width: taille, height: taille, borderRadius: taille > 8 ? 3 : 2, backgroundColor: couleurs[COULEUR_STATUT[statut]] }} />;
}

/** « ■ Active » : le carré et le mot, dans la couleur du statut. */
export function Statut({ statut, texte, taille = 15, gras = true }: { statut: StatutBlessure; texte?: string; taille?: number; gras?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.statut}>
      <Carre statut={statut} taille={8} />
      <Texte variante="corps" numberOfLines={1} style={{ fontSize: taille, color: couleurs[COULEUR_STATUT[statut]], fontFamily: gras ? police.medium : police.regular }}>
        {texte ?? libelleStatut(statut)}
      </Texte>
    </View>
  );
}

/** Auteur d'une écriture : « Toi », ou ✦ et le nom de l'IA. */
export function Auteur({ auteur, taille = 12, prefixe }: { auteur: string; taille?: number; prefixe?: string }) {
  const { couleurs } = useTheme();
  const a = auteurDe(auteur);
  return (
    <View style={styles.statut}>
      {prefixe ? (
        <Texte variante="meta" couleur="t2" style={{ fontSize: taille }}>
          {prefixe}
        </Texte>
      ) : null}
      {a.ia ? <Icone nom="etincelle" couleur={couleurs.t2} taille={12} epaisseur={2} /> : null}
      <Texte variante="meta" couleur="t2" numberOfLines={1} style={{ fontSize: taille, marginLeft: a.ia ? -3 : 0 }}>
        {a.nom}
      </Texte>
    </View>
  );
}

/** Boutons côte à côte (jamais de liste déroulante) : le Segmente commun, version douce de la planche (statut, type, côté). */
export function Boutons<V extends string>({
  options,
  valeur,
  onChange,
  dans,
  style,
}: {
  options: readonly { valeur: V; libelle: string; statut?: StatutBlessure }[];
  valeur: V | null;
  onChange: (v: V) => void;
  dans?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Segmente
      doux
      dans={dans}
      options={options.map((o) => ({ valeur: o.valeur, libelle: o.libelle, avant: o.statut ? <Carre statut={o.statut} taille={8} /> : undefined }))}
      valeur={valeur}
      onChange={onChange}
      style={[{ marginHorizontal: espace.l, marginTop: espace.s }, style]}
    />
  );
}

/** Barre de douleur : 10 crans, les `n` premiers en rouge. */
export function Douleur({ n }: { n: number }) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.douleur} accessibilityLabel={t("suivi.douleurLue", { n })}>
      {Array.from({ length: 10 }, (_, i) => (
        <View key={i} style={{ width: 4, height: 8, borderRadius: 1, backgroundColor: i < n ? couleurs.rate : couleurs.line }} />
      ))}
    </View>
  );
}

/** Case de prise : 28 × 28 dans une zone de 44. */
export function CasePrise({ ok, onPress, libelle }: { ok: boolean; onPress: () => void; libelle: string }) {
  const { couleurs } = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: ok }} accessibilityLabel={libelle} onPress={onPress} style={styles.caseZone}>
      <View style={[styles.case, { borderColor: ok ? couleurs.valide : couleurs.line2, backgroundColor: ok ? couleurs.valideVoile : "transparent" }]}>
        {ok ? <Icone nom="check" couleur={couleurs.valide} taille={16} epaisseur={2.4} /> : null}
      </View>
    </Pressable>
  );
}

/** Pastille d'icône des lignes de Santé (36 × 36, fond rose léger). */
export function IconeSante({ nom }: { nom: NomIcone }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.icone, { backgroundColor: `${couleurs.partieSante}24` }]}>
      <Icone nom={nom} couleur={couleurs.partieSante} taille={20} />
    </View>
  );
}

export const styles = StyleSheet.create({
  tete: { height: 64, flexDirection: "row", alignItems: "center", paddingLeft: 6, paddingRight: espace.s },
  groupe: { borderRadius: rayon.l, marginHorizontal: espace.l, marginTop: espace.s, overflow: "hidden" },
  titreGroupe: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: espace.xxl, marginHorizontal: espace.l },
  filet: { height: StyleSheet.hairlineWidth, marginHorizontal: espace.l },
  ligne: { flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l, paddingVertical: espace.s },
  statut: { flexDirection: "row", alignItems: "center", gap: 6 },
  douleur: { flexDirection: "row", gap: 2, marginLeft: 6 },
  caseZone: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginVertical: -8, marginRight: -10 },
  case: { width: 28, height: 28, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  icone: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  plein: { marginHorizontal: espace.l, marginTop: espace.m },
});

const DELAI_ANNULER_MS = 8000;

/** Supprimer depuis une fiche : la liste, au retour, joue la même suite (désintégration, « Annuler »). */
export const suppressionDemandee: { blessure: string | null; traitement: { id: string; nom: string } | null } = { blessure: null, traitement: null };

/**
 * Suppression avec « Annuler » (D8) : suppression douce tout de suite (la ligne quitte la liste), « Annuler » la rend ;
 * le délai passé (ou l'écran quitté), l'effacement définitif.
 */
export function useAnnuler(
  actions: { supprimer(id: string): Promise<void>; restaurer(id: string): Promise<void>; purger(id: string): Promise<void> },
  recharger: () => Promise<void>,
  /** Délai d'« Annuler » : 8 s ; 5 s pour couper un appareil (planche compte-connexion, 5c). */
  delai = DELAI_ANNULER_MS,
) {
  const [enAttente, setEnAttente] = useState<{ id: string; texte: string } | null>(null);
  const attente = useRef<{ id: string; minuterie: ReturnType<typeof setTimeout> } | null>(null);
  const a = useRef(actions);
  a.current = actions;
  const confirmer = useCallback(() => {
    const x = attente.current;
    if (!x) return;
    clearTimeout(x.minuterie);
    attente.current = null;
    a.current.purger(x.id).catch(console.error);
  }, []);
  useEffect(() => () => confirmer(), [confirmer]);
  const supprimer = useCallback(
    async (id: string, texte: string) => {
      confirmer();
      await a.current.supprimer(id);
      await recharger();
      const minuterie = setTimeout(() => {
        confirmer();
        setEnAttente((e) => (e?.id === id ? null : e));
      }, delai);
      attente.current = { id, minuterie };
      setEnAttente({ id, texte });
    },
    [confirmer, recharger, delai],
  );
  const annuler = useCallback(async () => {
    const x = attente.current;
    if (!x) return;
    clearTimeout(x.minuterie);
    attente.current = null;
    setEnAttente(null);
    await a.current.restaurer(x.id);
    await recharger();
  }, [recharger]);
  return { enAttente, supprimer, annuler };
}

/** « Modifiées par toi · 22/10 », « Ajoutées par ✦ Claude · 22/10 ». */
export function SignatureNotes({ cle, auteur, date }: { cle: "suivi.notesModifiees" | "suivi.notesAjoutees"; auteur: string; date: string }) {
  const { couleurs } = useTheme();
  const a = auteurDe(auteur);
  const [avant, apres] = t(cle, { qui: "\u0000", date }).split("\u0000") as [string, string];
  return (
    <View style={[styles.statut, { gap: 3, marginTop: espace.s }]}>
      <Texte variante="meta" couleur="t2">
        {avant.trimEnd()}
      </Texte>
      {a.ia ? <Icone nom="etincelle" couleur={couleurs.t2} taille={12} epaisseur={2} /> : null}
      <Texte variante="meta" couleur="t2">
        {`${a.ia ? a.nom : t("suivi.toiMin")}${apres}`}
      </Texte>
    </View>
  );
}
