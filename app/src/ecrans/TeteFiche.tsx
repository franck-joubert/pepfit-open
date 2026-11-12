// Tête de la fiche d'un exercice (planche exercices-perso, section 4, D2) : la photo à la place du personnage 3D, ou, sans
// photo ni 3D, les petits persos avec « Ajouter une photo ». La photo s'ouvre en grand (même fenêtre que la photo de séance).
import { useRef, useState } from "react";
import { Image, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { modifierExercice, type Exercice } from "../db";
import { uriPhoto, type Source } from "../photos";
import { effacerPhotoExercice, prendrePhotoExercice } from "../photos/exercices";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { espace, police, rayon } from "../theme/typo";
import { FenetrePleine } from "../ui/FenetrePleine";
import { Feuille } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { Appui } from "../ui/mouvement";
import { Persos } from "../ui/Persos";
import { PhotoZoom } from "../ui/PhotoZoom";
import { Texte } from "../ui/Texte";
import { useApp } from "./contexte";
import { EtapePhoto } from "./formulaire-etapes";

const HAUTEUR_PHOTO = 300;

const secondairesDe = (e: Exercice) => (e.secondaires ? e.secondaires.split("|").filter(Boolean) : []);

/** La photo, arrondie, sous la barre. */
export function TetePhoto({ ex, marge, onLayout }: { ex: Exercice; marge: number; onLayout?: (e: LayoutChangeEvent) => void }) {
  useLangue();
  const [plein, setPlein] = useState(false);
  if (!ex.photo) return null;
  return (
    <View style={{ paddingTop: marge }} onLayout={onLayout}>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel={t("exercices.photo.exercice", { nom: ex.nom })} onPress={() => setPlein(true)} style={styles.photo}>
        <Image source={{ uri: uriPhoto(ex.photo) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={styles.agrandir} pointerEvents="none">
          <Icone nom="plein" couleur="#ffffff" taille={20} />
        </View>
      </Pressable>
      <FenetrePleine visible={plein} entree="fondu" onRetour={() => setPlein(false)}>
        <Pressable accessibilityLabel={t("exercices.photo.fermer")} onPress={() => setPlein(false)} style={styles.plein}>
          <PhotoZoom uri={uriPhoto(ex.photo)} />
        </Pressable>
      </FenetrePleine>
    </View>
  );
}

/** « Photo en attente de connexion. » (D9) : la photo n'est pas encore partie ; l'exercice, lui, sert déjà. */
export function PhotoEnAttente() {
  useLangue();
  const { couleurs } = useTheme();
  return (
    <View style={styles.attente}>
      <Icone nom="nuageoff" couleur={couleurs.t2} taille={18} />
      <Texte variante="meta" couleur="t2">
        {t("exercices.photo.attente")}
      </Texte>
    </View>
  );
}

/** Sans photo ni 3D : les persos en grand, et « Ajouter une photo » (la feuille du formulaire : appareil ou galerie). */
export function TetePersos({ ex, marge, onChange, onLayout }: { ex: Exercice; marge: number; onChange: () => void; onLayout?: (e: LayoutChangeEvent) => void }) {
  useLangue();
  const { db } = useApp();
  const { couleurs, mode } = useTheme();
  const [ouverte, setOuverte] = useState(false);
  const [refus, setRefus] = useState(false);
  const occupe = useRef(false);
  const prendre = async (source: Source) => {
    if (occupe.current) return;
    occupe.current = true;
    try {
      const f = await prendrePhotoExercice(source);
      if (!f) return;
      effacerPhotoExercice(await modifierExercice(db, ex.id, { photo: f }));
      setOuverte(false);
      onChange();
    } catch (e) {
      if (e instanceof Error && e.message === "permission") setRefus(true);
      else console.error(e);
    } finally {
      occupe.current = false;
    }
  };
  return (
    <View style={{ paddingTop: marge }} onLayout={onLayout}>
      <View style={[styles.carte, { backgroundColor: mode === "jour" ? couleurs.s1 : couleurs.s2 }]}>
        <Persos principal={ex.muscle} secondaires={secondairesDe(ex)} hauteur={176} style={styles.persos} />
        <Appui
          accessibilityRole="button"
          onPress={() => setOuverte(true)}
          style={({ pressed }) => [styles.ajouter, { backgroundColor: pressed ? couleurs.s3 : couleurs.btnTonalFond }]}
        >
          <Icone nom="camera" couleur={couleurs.btnTonalTexte} taille={20} />
          <Texte variante="corps" style={{ color: couleurs.btnTonalTexte, fontFamily: police.semibold }}>
            {t("exercices.photo.ajouter")}
          </Texte>
        </Appui>
      </View>
      <Feuille visible={ouverte} onFermer={() => setOuverte(false)} titre={t("exercices.photo.titreExercice")}>
        <EtapePhoto refus={refus} onPrendre={(s) => void prendre(s)} />
      </Feuille>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { height: HAUTEUR_PHOTO, marginHorizontal: espace.l, borderRadius: rayon.xl, overflow: "hidden" },
  agrandir: { position: "absolute", right: espace.s, bottom: espace.s, width: 44, height: 44, borderRadius: rayon.l, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.6)" },
  attente: { flexDirection: "row", alignItems: "center", gap: espace.s, minHeight: 36 },
  plein: { flex: 1, backgroundColor: "#000" },
  carte: { marginHorizontal: espace.l, borderRadius: rayon.xl, alignItems: "center", paddingTop: espace.xl, paddingBottom: espace.l, gap: espace.m },
  persos: { alignSelf: "center" },
  ajouter: { minHeight: 44, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", gap: espace.s, paddingHorizontal: espace.l },
});
