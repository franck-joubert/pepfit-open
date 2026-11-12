import { useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useTheme } from "../theme";
import { espace, police, POLICE_MAX, rayon, typo } from "../theme/typo";
import { normaliser, type Sport } from "../db";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { Feuille, Groupe } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { fichierPicto } from "../ui/pictos";
import { Texte } from "../ui/Texte";
import { grouperParFamille, nomFamille, type Famille } from "./familles-sports";
import { pictoSport } from "./lanceur-sports";

// Catalogue des sports (recherche et familles), utilisé par l'accueil, la détection d'activité et le parcours de séance.

/**
 * Catalogue des sports : recherche, puis la liste, rangée par famille (D9 du 30/10 : Force, Endurance dehors… ; une recherche
 * donne une liste seule). `deja` : les sports du lanceur (✓ en ajout). En ajout, toucher ajoute ou retire ; sinon (« Autre
 * sport »), toucher choisit le sport.
 */
export function FeuilleCatalogue({
  visible,
  titre,
  sports,
  deja,
  ajout,
  onFermer,
  onChoisir,
}: {
  visible: boolean;
  titre: string;
  sports: Sport[];
  deja: string[];
  ajout: boolean;
  onFermer: () => void;
  onChoisir: (s: Sport) => void;
}) {
  useLangue();
  const { couleurs } = useTheme();
  const [q, setQ] = useState("");
  useEffect(() => {
    if (visible) setQ("");
  }, [visible]);
  // Jamais ouverte : rien à rendre ni à trier (l'onglet Sport la rend fermée à chaque rendu ; audit de performance, M13). Une
  // fois ouverte, elle reste rendue : sa fermeture s'anime.
  const ouverte = useRef(visible);
  if (visible) ouverte.current = true;
  if (!ouverte.current) return null;
  const n = normaliser(q.trim());
  // Les sports qui ont leur image d'abord (planche : une vignette par ligne), puis les autres, chacun par nom.
  const image = (s: Sport) => (fichierPicto(pictoSport(s.slug), null, 40) != null ? 0 : 1);
  const liste = (n ? sports.filter((s) => normaliser(s.nom).includes(n)) : sports).map((s, i) => ({ s, i })).sort((a, b) => image(a.s) - image(b.s) || a.i - b.i).map((x) => x.s);
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={titre}>
      <View style={[styles.champ, { backgroundColor: couleurs.feuilleGroupe }]}>
        <Icone nom="search" couleur={couleurs.t3} taille={18} />
        <TextInput
          maxFontSizeMultiplier={POLICE_MAX}
          value={q}
          onChangeText={setQ}
          placeholder={t("accueil.lanceur.rechercher")}
          placeholderTextColor={couleurs.t3}
          cursorColor={couleurs.action}
          returnKeyType="search"
          accessibilityLabel={t("accueil.lanceur.rechercher")}
          style={[typo.saisie, { flex: 1, fontFamily: police.regular, fontSize: 15, color: couleurs.t1, padding: 0 }]}
        />
      </View>
      {(n ? [{ famille: null as Famille | null, sports: liste }] : grouperParFamille(liste)).map((g) => (
        <View key={g.famille ?? "recherche"}>
          {g.famille ? (
            <Texte variante="entete" couleur="t2" accessibilityRole="header" style={styles.famille}>
              {nomFamille(g.famille)}
            </Texte>
          ) : null}
          <Groupe>
            {g.sports.map((s, i) => {
              const la = deja.includes(s.id);
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityLabel={ajout ? (la ? t("accueil.lanceur.dejaLa", { nom: s.nom }) : t("accueil.lanceur.ajouterNom", { nom: s.nom })) : s.nom}
                  onPress={() => onChoisir(s)}
                  style={({ pressed }) => [
                    styles.ligne,
                    i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 },
                    pressed && { backgroundColor: couleurs.s3 },
                  ]}
                >
                  <Vignette slug={s.slug} />
                  <Texte numberOfLines={1} style={[styles.titre, { flex: 1, color: ajout && la ? couleurs.t3 : couleurs.t1 }]}>
                    {s.nom}
                  </Texte>
                  {ajout ? (
                    <View style={styles.lance}>
                      <Icone nom={la ? "check" : "plus"} couleur={la ? couleurs.t1 : couleurs.t2} taille={18} />
                    </View>
                  ) : (
                    <Icone nom="right" couleur={couleurs.t3} taille={16} />
                  )}
                </Pressable>
              );
            })}
          </Groupe>
        </View>
      ))}
    </Feuille>
  );
}

/** Vignette d'un sport dans une feuille : 40, rayon 10, fond blanc le jour, s2 la nuit. */
function Vignette({ slug }: { slug: string | null }) {
  const { couleurs, mode } = useTheme();
  const src = fichierPicto(pictoSport(slug), null, 40);
  return (
    <View style={[styles.vignette, { backgroundColor: mode === "jour" ? couleurs.bg : couleurs.s2 }]}>
      {src != null ? <Image source={src} style={{ width: 40, height: 40 }} resizeMode="contain" /> : <Icone nom="dumbbell" couleur={couleurs.t3} taille={20} />}
    </View>
  );
}

const styles = StyleSheet.create({
  famille: { marginTop: espace.l, marginBottom: espace.s, marginHorizontal: espace.xs },
  ligne: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 14, paddingLeft: espace.l, paddingRight: 6, paddingVertical: 6 },
  titre: { fontFamily: police.medium, fontSize: 15 },
  lance: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  vignette: { width: 40, height: 40, marginLeft: -4, borderRadius: rayon.m, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  champ: { height: 48, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, marginBottom: espace.l },
});
