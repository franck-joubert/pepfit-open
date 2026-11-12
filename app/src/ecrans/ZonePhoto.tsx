import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { lirePhotoSeance, type PhotoSeance } from "../db";
import { ajouterPhoto, retirerPhoto, uriPhoto, type Source } from "../photos";
import { SuppressionDifferee } from "../photos/attente";
import { useTheme } from "../theme";
import { duree } from "../theme/mouvement";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { espace, rayon } from "../theme/typo";
import { useMargeColonne } from "../ui/CadreContenu";
import { BandeauAnnuler } from "../ui/BandeauAnnuler";
import { ListeDesintegrable, marquerSuppression } from "../ui/Desintegration";
import { FenetrePleine } from "../ui/FenetrePleine";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { PhotoZoom } from "../ui/PhotoZoom";
import { Appui } from "../ui/mouvement";
import { Texte } from "../ui/Texte";
import { VoileHautPhoto } from "./BarreSurPhoto";
import { useApp } from "./contexte";

// Photo de la séance (une au plus), en 4:3. Sans photo : « Ajouter une photo », puis Prendre une photo / Galerie photo.
// Toucher la photo : le menu court (Voir en grand / Remplacer / Supprimer, 08/11). Voir en grand : plein écran, où elle se
// zoome à deux doigts et reprend sa taille au relâcher (29/10) ; un toucher le ferme, un appui long y rouvre le menu (sans « Voir en
// grand »). Pas de recadrage : il n'existe que pour les photos de profil et de cercle (ui/Recadrage). Supprimer : la photo se
// désintègre, sa place se referme sur « Photo supprimée · Annuler » (8 s), puis la suppression est faite (fichiers, serveur).
// `retirable` : × en coin (édition et fin de séance), même suppression. `onChange` : photo ajoutée, remplacée ou supprimée
// (la séance passée la remonte au-dessus du titre). `surAttente` : en couverture, la bulle « Photo supprimée · Annuler » n'est pas dans la
// page qui défile (la barre transparente, posée par-dessus, la recouvrait et prenait le toucher) : la zone garde sa place et passe
// `annuler` (ou null) à la page, qui pose la bulle sous la barre, fixe.
// `couverture` : la photo est la tête de la séance passée, pleine largeur, montant derrière l'en-tête transparent (`haut` : barre d'état
// + barre, ecrans/BarreSurPhoto.tsx ; dessous, le cadre 2:1 de l'image d'un lieu) ; mêmes gestes (plein écran, appui long), sans crédit.

export const HAUTEUR_BULLE = 52;

export function ZonePhoto({ seanceId, retirable = false, couverture, style, onChange, surAttente }: {
  seanceId: string;
  retirable?: boolean;
  couverture?: { haut: number };
  style?: StyleProp<ViewStyle>;
  onChange?: () => void;
  surAttente?: (annuler: (() => void) | null) => void;
}) {
  // Fold déplié : la couverture occupe la colonne bornée et ne va plus bord à bord : coins bas arrondis, comme celle d'un lieu.
  const bordsLibres = useMargeColonne() > 0;
  const { db } = useApp();
  useLangue();
  const { couleurs } = useTheme();
  const [photo, setPhoto] = useState<PhotoSeance | null>();
  const [feuille, setFeuille] = useState<"ajout" | "menu" | null>(null);
  const [plein, setPlein] = useState(false);
  // Appareil photo refusé : feuille « Autoriser » (ouvre les réglages) au lieu du toast natif.
  const [refus, setRefus] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  // Photo retirée de l'écran, en attente de suppression (Annuler la remet).
  const [masquee, setMasquee] = useState<string | null>(null);
  const [enAttente, setEnAttente] = useState<string | null>(null);
  const [suppression] = useState(() => new SuppressionDifferee(setEnAttente));
  // Contenu de la feuille gardé pendant qu'elle descend.
  const mode = useRef<"ajout" | "menu">("ajout");
  if (feuille) mode.current = feuille;
  // Menu ouvert depuis le plein écran : « Voir en grand » n'y a pas de sens (gardé pendant que la feuille descend).
  const menuDepuisPlein = useRef(false);
  const ouvrirMenu = () => {
    menuDepuisPlein.current = plein;
    setFeuille("menu");
  };

  const recharger = useCallback(() => lirePhotoSeance(db, seanceId).then(setPhoto), [db, seanceId]);
  useEffect(() => {
    recharger().catch(console.error);
  }, [recharger]);
  // En quittant l'écran, la suppression en attente est faite.
  useEffect(() => () => suppression.valider(), [suppression]);

  const ajouter = async (source: Source) => {
    setFeuille(null);
    setPlein(false);
    setEnvoi(true);
    try {
      if (await ajouterPhoto(db, seanceId, source)) {
        await recharger();
        onChange?.();
      }
    } catch (e) {
      if (e instanceof Error && e.message === "permission") {
        setRefus(true);
      } else console.error(e);
    } finally {
      setEnvoi(false);
    }
  };

  const supprimer = (depuisFeuille: boolean) => {
    if (!photo) return;
    const id = photo.id;
    setFeuille(null);
    setPlein(false);
    // Depuis la feuille, la désintégration attend qu'elle soit descendue.
    marquerSuppression(id, depuisFeuille ? duree.feuilleSortie : 0);
    setMasquee(id);
    suppression.demander(id, () => {
      retirerPhoto(db, seanceId, id)
        .then(recharger)
        .then(() => onChange?.())
        .catch(console.error);
    });
  };
  const annuler = () => {
    suppression.annuler();
    setMasquee(null);
  };
  const annulerRef = useRef(annuler);
  annulerRef.current = annuler;
  const ancree = !!couverture && !!surAttente;
  useEffect(() => {
    if (ancree) surAttente(enAttente ? () => annulerRef.current() : null);
  }, [ancree, enAttente, surAttente]);
  useEffect(() => () => surAttente?.(null), [surAttente]);

  // En couverture, la place est déjà tenue pendant la lecture : rien ne saute quand la photo arrive.
  if (photo === undefined) return couverture ? <View style={{ paddingTop: couverture.haut }}><View style={styles.cadreCouverture} /></View> : null;
  const visible = photo && photo.id !== masquee ? [photo] : [];

  return (
    <View style={[styles.zone, couverture && { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }, style]}>
      <ListeDesintegrable
        liste={visible}
        cleDe={(p) => p.id}
        rendu={(p) => (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={t("exercices.photo.ouvrir")}
            accessibilityHint={t("exercices.photo.menu")}
            onPress={ouvrirMenu}
            style={[styles.photo, { backgroundColor: couleurs.s1 }, couverture && { aspectRatio: undefined, borderRadius: 0, paddingTop: couverture.haut }, couverture && bordsLibres && { borderBottomLeftRadius: rayon.xl, borderBottomRightRadius: rayon.xl }]}
          >
            <Image source={{ uri: uriPhoto(p.chemin_local) }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
            {couverture ? <View style={styles.cadreCouverture} /> : null}
            {couverture ? <VoileHautPhoto haut={couverture.haut} /> : null}
            {retirable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("exercices.photo.retirer")}
                hitSlop={6}
                onPress={() => supprimer(false)}
                style={styles.retirerZone}
              >
                <View style={styles.retirer}>
                  <Icone nom="close" couleur="#fff" taille={16} />
                </View>
              </Pressable>
            ) : null}
          </Pressable>
        )}
      />
      {enAttente ? (
        <View style={couverture && { paddingTop: couverture.haut, paddingHorizontal: espace.l, paddingBottom: espace.m }}>
          {ancree ? <View style={{ height: HAUTEUR_BULLE }} /> : <BandeauAnnuler texte={t("exercices.photo.supprimee")} onAnnuler={annuler} />}
        </View>
      ) : visible.length ? null : (
        <Appui
          accessibilityRole="button"
          disabled={envoi}
          onPress={() => setFeuille("ajout")}
          style={({ pressed }) => [styles.ajout, { backgroundColor: pressed ? couleurs.s3 : couleurs.btnTonalFond, opacity: envoi ? 0.38 : 1 }]}
        >
          <Icone nom="camera" couleur={couleurs.t2} />
          <Texte variante="exercice" style={{ color: couleurs.btnTonalTexte, fontFamily: "Inter-Medium" }}>
            {t("exercices.photo.ajouter")}
          </Texte>
        </Appui>
      )}

      {photo ? (
        <FenetrePleine visible={plein} entree="fondu" onRetour={() => setPlein(false)}>
          <Pressable
            accessibilityLabel={t("exercices.photo.fermer")}
            accessibilityHint={t("exercices.photo.menuPlein")}
            onPress={() => setPlein(false)}
            onLongPress={ouvrirMenu}
            style={styles.plein}
          >
            <PhotoZoom uri={uriPhoto(photo.chemin_local)} />
          </Pressable>
        </FenetrePleine>
      ) : null}

      {/* Après le plein écran : la feuille s'ouvre par-dessus. */}
      <Feuille
        visible={feuille != null}
        onFermer={() => setFeuille(null)}
        titre={mode.current === "menu" ? t("exercices.photo.titre") : photo ? t("exercices.photo.remplacer") : t("exercices.photo.ajouter")}
      >
        {mode.current === "menu" ? (
          <Groupe>
            {menuDepuisPlein.current ? null : (
              <Option
                premier
                icone="image"
                libelle={t("exercices.photo.voir")}
                onPress={() => {
                  setFeuille(null);
                  setPlein(true);
                }}
              />
            )}
            <Option premier={menuDepuisPlein.current} icone="repeat" libelle={t("exercices.photo.remplacer")} onPress={() => setFeuille("ajout")} />
            <Option icone="trash" danger libelle={t("exercices.photo.supprimer")} onPress={() => supprimer(true)} />
          </Groupe>
        ) : (
          <Groupe>
            <Option premier icone="camera" libelle={t("exercices.photo.prendre")} onPress={() => ajouter("appareil")} />
            <Option icone="image" libelle={t("exercices.photo.galerie")} onPress={() => ajouter("galerie")} />
          </Groupe>
        )}
      </Feuille>
      <Feuille visible={refus} onFermer={() => setRefus(false)} titre={t("exercices.photo.refusee")}>
        <Groupe>
          <Option
            premier
            icone="camera"
            libelle={t("exercices.photo.autoriser")}
            onPress={() => {
              setRefus(false);
              Linking.openSettings().catch(() => {});
            }}
          />
          <Option libelle={t("ui.fermer")} onPress={() => setRefus(false)} />
        </Groupe>
      </Feuille>
    </View>
  );
}

const styles = StyleSheet.create({
  zone: { paddingHorizontal: espace.l, paddingTop: espace.l, paddingBottom: espace.xs },
  photo: { width: "100%", aspectRatio: 4 / 3, borderRadius: rayon.l, overflow: "hidden" },
  cadreCouverture: { width: "100%", aspectRatio: 2, maxHeight: 240 },
  // × de 32 px, zone de clic de 44.
  retirerZone: { position: "absolute", top: 2, right: 2, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  retirer: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  ajout: { height: 52, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.s },
  plein: { flex: 1, backgroundColor: "#000" },
});
