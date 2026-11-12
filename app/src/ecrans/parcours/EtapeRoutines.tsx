// Étape « Choisir une routine » (planche ajout-seance-v2, routines et routines-vide) : le drawer intermédiaire. Le catalogue en haut,
// puis les routines de la personne ; sans routine à elle, la zone ne dit rien (aucun texte). Un toucher choisit : réglages en
// « Ajouter », récap en « Démarrer ».
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { PICTO_TYPE } from "../../db";
import type { RoutineResume } from "../../db/depots/routines";
import { texte } from "../../boutique/modele";
import type { RoutineBoutique } from "../../boutique/modele";
import { bilingue, lireActif, t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { Icone } from "../../ui/Icone";
import { fichierPicto } from "../../ui/pictos";
import { Texte } from "../../ui/Texte";
import { resumeExercices } from "../parcours-seance";
import { EnTete } from "./Etapes";

export type RoutineChoisie = { genre: "boutique"; routine: RoutineBoutique } | { genre: "perso"; routine: RoutineResume };

function Ligne({ nom, resume, picto, filet, onPress }: { nom: string; resume: string; picto: string | null; filet: boolean; onPress: () => void }) {
  const { couleurs } = useTheme();
  const src = fichierPicto(picto, null, 128);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${nom}, ${resume}`}
      onPress={onPress}
      style={({ pressed }) => [styles.ligne, filet && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }, pressed && { backgroundColor: couleurs.s3 }]}
    >
      <View style={styles.vignette}>
        {src != null ? <Image source={src} style={styles.image} resizeMode="contain" /> : <Icone nom="dumbbell" couleur={couleurs.t3} taille={22} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte numberOfLines={1} style={{ fontFamily: police.medium, fontSize: 15, color: couleurs.t1 }}>
          {nom}
        </Texte>
        <Texte variante="meta" couleur="t3" numberOfLines={1} style={{ marginTop: 2 }}>
          {resume}
        </Texte>
      </View>
      <Icone nom="right" couleur={couleurs.t3} taille={16} />
    </Pressable>
  );
}

export function EtapeRoutines({
  catalogue,
  perso,
  onRetour,
  onChoisir,
}: {
  catalogue: readonly RoutineBoutique[];
  perso: RoutineResume[];
  onRetour: () => void;
  onChoisir: (c: RoutineChoisie) => void;
}) {
  const { couleurs } = useTheme();
  const langue = lireActif().langue;
  return (
    <View style={{ flex: 1 }}>
      <EnTete titre={t("ps.choisirRoutine")} onRetour={onRetour} />
      <ScrollView nestedScrollEnabled contentContainerStyle={{ paddingBottom: espace.l }}>
        <Texte variante="entete" couleur="t2" style={styles.etiquette}>
          {t("ps.catalogue")}
        </Texte>
        <View style={[styles.carte, { backgroundColor: couleurs.feuilleGroupe }]}>
          {catalogue.map((r, i) => (
            <Ligne
              key={r.id}
              nom={texte(r.nom, bilingue(langue))}
              resume={resumeExercices(r.seance.blocs.length, r.seance.blocs.reduce((n, b) => n + b.series, 0))}
              picto={r.picto}
              filet={i > 0}
              onPress={() => onChoisir({ genre: "boutique", routine: r })}
            />
          ))}
        </View>
        {perso.length ? (
          <>
            <Texte variante="entete" couleur="t2" style={[styles.etiquette, { marginTop: espace.l }]}>
              {t("ps.mesRoutines")}
            </Texte>
            <View style={[styles.carte, { backgroundColor: couleurs.feuilleGroupe }]}>
              {perso.map((r, i) => (
                <Ligne key={r.id} nom={r.nom} resume={resumeExercices(r.nbExercices, r.nbSeries)} picto={PICTO_TYPE[r.type] ?? null} filet={i > 0} onPress={() => onChoisir({ genre: "perso", routine: r })} />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  etiquette: { marginHorizontal: espace.xs, marginBottom: espace.s },
  carte: { borderRadius: rayon.l, overflow: "hidden" },
  ligne: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 10, paddingRight: espace.m, paddingVertical: 6 },
  vignette: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  image: { width: 44, height: 44 },
});
