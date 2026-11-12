// Étape « sport » du parcours (planche ajout-seance-v2, sport-defaut, sports-modifier, sports-derniere) : le titre est le jour visé,
// les sports de la personne (trois par défaut) en grille adaptative, « Choisir une routine » et « Autre sport » (et « Récupérer »
// quand on démarre). Le crayon ouvre « Modifier les sports » : poignée pour déplacer, ✕ pour retirer (éteint sur la dernière
// tuile), « Ajouter un sport ». Un appui long sur une tuile la déplace aussi hors du mode Modifier.
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { Sport } from "../../db";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { avecOpacite } from "../../theme/teintes";
import { espace, police, rayon } from "../../theme/typo";
import { PlaceBloc, useGlisserAccueil } from "../../ui/GlisserAccueil";
import { Icone, type NomIcone } from "../../ui/Icone";
import { fichierPicto } from "../../ui/pictos";
import { Texte } from "../../ui/Texte";
import { DISPOSITION_SPORTS, hauteurTuiles, HAUTEUR_TUILE, pictoSport } from "../lanceur-sports";
import { peutRetirerSport } from "../parcours-seance";
import { EnTete } from "./Etapes";

const ECART = espace.s;

/** Image du sport (pictos d'activité, cadre 128, fond transparent) ; sans picto, l'haltère. */
export function VignetteSport({ slug, taille = 56 }: { slug: string | null; taille?: number }) {
  const { couleurs } = useTheme();
  const src = fichierPicto(pictoSport(slug), null, 512);
  return src != null ? (
    <Image source={src} style={{ width: taille, height: taille }} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
  ) : (
    <View style={{ width: taille, height: taille, alignItems: "center", justifyContent: "center" }}>
      <Icone nom="dumbbell" couleur={couleurs.t3} taille={Math.round(taille / 2)} />
    </View>
  );
}

/** Ligne de la carte des liens : icône, libellé, chevron (56 de haut). */
export function LigneLien({ icone, libelle, filet, onPress }: { icone: NomIcone; libelle: string; filet?: boolean; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.ligneLien, filet && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }, pressed && { backgroundColor: couleurs.s3 }]}
    >
      <Icone nom={icone} couleur={couleurs.t2} taille={20} />
      <Texte numberOfLines={1} style={[styles.lienTexte, { flex: 1, color: couleurs.t1 }]}>
        {libelle}
      </Texte>
      <Icone nom="right" couleur={couleurs.t3} taille={16} />
    </Pressable>
  );
}

export function EtapeSport({
  titre,
  sports,
  edition,
  recuperer,
  onEdition,
  onSport,
  onRetirer,
  onReordonner,
  onAjouterSport,
  onAutre,
  onRecuperer,
}: {
  titre: string;
  sports: Sport[];
  edition: boolean;
  /** « Récupérer » : seulement quand on démarre (aujourd'hui). */
  recuperer: boolean;
  onEdition: (v: boolean) => void;
  onSport: (s: Sport) => void;
  onRetirer: (s: Sport) => void;
  onReordonner: (ids: string[]) => void;
  onAjouterSport: () => void;
  onAutre: () => void;
  onRecuperer: () => void;
}) {
  const { couleurs } = useTheme();
  const [largeur, setLargeur] = useState(0);
  const glisse = useGlisserAccueil({
    blocs: sports.map((s) => ({ id: s.id })),
    largeur,
    ecart: ECART,
    marge: espace.l,
    margeBas: 0,
    disposition: DISPOSITION_SPORTS,
    onDeposer: (l) => onReordonner(l.map((b) => b.id)),
  });
  const fente = glisse.tenu ? glisse.places.get(glisse.tenu) : undefined;
  const retirable = peutRetirerSport(sports.map((s) => s.id));
  return (
    <View style={{ flex: 1 }}>
      <EnTete
        titre={edition ? t("ps.modifierSports") : titre}
        {...(edition
          ? { action: t("ps.ok"), onAction: () => onEdition(false) }
          : { icone: "crayon" as const, libelleIcone: t("ps.modifierSports"), onAction: () => onEdition(true) })}
      />
      <ScrollView nestedScrollEnabled scrollEnabled={glisse.tenu == null} contentContainerStyle={{ paddingBottom: espace.l }}>
        <View onLayout={(e) => setLargeur(e.nativeEvent.layout.width)} style={{ height: largeur > 0 ? glisse.hauteur : hauteurTuiles(sports.length, ECART) }}>
          <View {...glisse.zoneProps} style={StyleSheet.absoluteFill}>
            {/* Où la tuile tenue tombera : fente pointillée de la partie. */}
            {fente ? <View pointerEvents="none" style={[styles.fente, { left: fente.x, top: fente.y, width: fente.l, height: fente.h, borderColor: couleurs.partieEntrainement }]} /> : null}
            {largeur > 0
              ? sports.map((s) => {
                  const r = glisse.places.get(s.id);
                  if (!r) return null;
                  const tenu = glisse.tenu === s.id;
                  return (
                    <PlaceBloc key={s.id} pos={glisse.position(s.id)} rect={r} tenu={tenu} animer {...glisse.toucher(s.id)}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={s.nom}
                        accessibilityHint={t("accueil.lanceur.deplacerAide")}
                        onPress={() => !glisse.recent() && !edition && onSport(s)}
                        style={({ pressed }) => [
                          styles.tuile,
                          edition && { borderWidth: 1, borderColor: avecOpacite(couleurs.partieEntrainement, 0.45) },
                          { backgroundColor: pressed && !tenu && !edition ? couleurs.s3 : couleurs.feuilleGroupe },
                          tenu && { borderWidth: 1.5, borderColor: couleurs.partieEntrainement, boxShadow: `0px 18px 32px -12px ${avecOpacite(couleurs.partieEntrainement, 0.45)}` },
                        ]}
                      >
                        <VignetteSport slug={s.slug} />
                        <Texte numberOfLines={1} style={[styles.nomTuile, { color: couleurs.t1 }]}>
                          {s.nom}
                        </Texte>
                        {edition ? (
                          <>
                            <View accessible accessibilityLabel={t("accueil.lanceur.deplacer", { nom: s.nom })} style={[styles.coin, { left: 0 }]}>
                              <Icone nom="grip" couleur={couleurs.t3} taille={16} />
                            </View>
                            {/* Le dernier sport ne se retire pas : le ✕ est éteint (aucun message de refus à l'appui). */}
                            <Pressable
                              accessibilityRole="button"
                              accessibilityState={{ disabled: !retirable }}
                              accessibilityLabel={t("ps.retirerSport", { nom: s.nom })}
                              disabled={!retirable}
                              onPress={() => onRetirer(s)}
                              style={[styles.coin, { right: 0 }, !retirable && { opacity: 0.3 }]}
                            >
                              <Icone nom="close" couleur={couleurs.t3} taille={16} />
                            </Pressable>
                          </>
                        ) : null}
                      </Pressable>
                    </PlaceBloc>
                  );
                })
              : null}
          </View>
        </View>
        {edition ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={onAjouterSport}
              style={({ pressed }) => [styles.ajout, { borderColor: avecOpacite(couleurs.partieEntrainement, 0.45) }, pressed && { backgroundColor: couleurs.s2 }]}
            >
              <Icone nom="plus" couleur={couleurs.t2} taille={20} />
              <Texte style={[styles.lienTexte, { color: couleurs.t2 }]}>{t("ps.ajouterSport")}</Texte>
            </Pressable>
            {!retirable ? (
              <Texte variante="meta" couleur="t3" style={styles.note}>
                {t("ps.dernierSport")}
              </Texte>
            ) : null}
          </>
        ) : (
          <View style={[styles.liens, { backgroundColor: couleurs.feuilleGroupe }]}>
            {/* Pas de « Choisir une routine » ici (08/11) : les routines se lancent depuis la page Routines. */}
            <LigneLien icone="search" libelle={t("ps.autreSport")} onPress={onAutre} />
            {/* Récupérer (planche recuperer, D1) : la même feuille que la page Récupération ; aujourd'hui seulement. */}
            {recuperer ? <LigneLien icone="feuille" libelle={t("ps.recuperer")} filet onPress={onRecuperer} /> : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tuile: { flex: 1, height: HAUTEUR_TUILE, borderRadius: rayon.l, alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 4 },
  nomTuile: { fontFamily: police.medium, fontSize: 13, maxWidth: "100%", paddingHorizontal: espace.s },
  coin: { position: "absolute", top: 0, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  fente: { position: "absolute", borderRadius: rayon.l, borderWidth: 1.5, borderStyle: "dashed" },
  ajout: { height: 56, marginTop: espace.s, borderRadius: rayon.l, borderWidth: 1, borderStyle: "dashed", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.s },
  note: { textAlign: "center", marginTop: espace.m },
  liens: { marginTop: espace.m, borderRadius: rayon.l, overflow: "hidden" },
  ligneLien: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 14, paddingLeft: espace.l, paddingRight: espace.m },
  lienTexte: { fontFamily: police.medium, fontSize: 15 },
});
