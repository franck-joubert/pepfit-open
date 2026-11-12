// Un exercice en lecture dans la page d'activité : ses séries, W en couleur d'échauffement, médaille à la place du numéro sur un
// record. Présentationnel : la page lui donne un modèle déjà prêt (`exoLuDe`).
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { INFO_NATURE, type ExerciceDeSeance } from "../../db";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import type { Jetons } from "../../theme/jetons";
import { espace, police } from "../../theme/typo";
import { Medaille } from "../../ui/Medaille";
import { Picto } from "../../ui/Picto";
import { Texte } from "../../ui/Texte";
import { chiffresSuivi } from "../fin-suivi";
import { serieNatureTexte, type Unite } from "../format";
import type { AffichageExercice } from "../seance-passee-vue";
import { couleurTypeSerie, LETTRE, TraceRemplacement } from "../seance-vue";

export interface SerieLue {
  id: string;
  /** « 1 », « W », « F »… ; vide : une publication d'avant, sans numéro. */
  numero: string;
  couleur?: string;
  record: boolean;
  chauffe: boolean;
  texte: string;
}

export interface ExoLu {
  cle: string;
  nom: string;
  slug: string | null;
  photo?: string | null;
  /** L'exercice dont la progression s'ouvre au toucher ; absent : le nom n'est pas un bouton (l'exercice d'un autre membre). */
  progression?: string;
  trace?: ReactNode;
  notes: { id: string; texte: string }[];
  series: SerieLue[];
}

/** Série d'un suivi : distance et durée au format de la fin (« 0,16 km, 0:46 »), sans distance « 0:29 ». */
function texteSerieSuivi(x: { duree_s: number | null; distance_m: number | null }): string {
  const c = chiffresSuivi({ dureeS: x.duree_s ?? 0, distanceM: x.distance_m ?? 0 });
  return c.distance ? `${c.distance}, ${c.duree}` : c.duree;
}

/** Un exercice de ta séance. `suivi` : la série d'un suivi se lit comme sa fin (n° 25). */
export function exoLuDe(e: ExerciceDeSeance, u: Unite, suivi: boolean, couleurs: Jetons): ExoLu {
  const champs = INFO_NATURE[e.exercice.nature].colonnes.map((c) => c.champ);
  let n = 0;
  return {
    cle: e.exercice.id,
    nom: e.exercice.nom,
    slug: e.exercice.slug,
    photo: e.exercice.photo_vignette,
    progression: e.exercice.id,
    trace: <TraceRemplacement e={e} marge={38} />,
    notes: e.notes.map((x) => ({ id: x.id, texte: x.texte })),
    series: e.series
      .filter((x) => x.faite)
      .map((x) => {
        const lettre = LETTRE[x.type];
        if (!lettre) n++;
        return {
          id: x.id,
          numero: lettre ?? String(n),
          couleur: couleurTypeSerie(x.type, couleurs) ?? undefined,
          record: x.records.length > 0,
          chauffe: x.type === "echauffement",
          texte: suivi ? texteSerieSuivi(x) : serieNatureTexte(champs, x, u),
        };
      }),
  };
}

/** `affichage` (seance-passee-vue) : sous un grand visuel, ni petit picto ni nom quand il est le titre ; ligne unique sans numéro. */
export function ExerciceLu({ e, affichage }: { e: ExoLu; affichage: AffichageExercice }) {
  const { couleurs } = useTheme();
  const tete = (
    <>
      {affichage.picto ? <Picto slug={e.slug} nom={e.nom} photo={e.photo ?? undefined} taille={28} /> : null}
      {affichage.nom ? (
        <Texte variante="exercice" numberOfLines={2} style={{ flexShrink: 1 }}>
          {e.nom}
        </Texte>
      ) : null}
    </>
  );
  return (
    <View style={[styles.exo, { borderBottomColor: couleurs.line }]}>
      {affichage.picto || affichage.nom ? (
        e.progression ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("seance.passee.voirProgression", { nom: e.nom })}
            onPress={() => router.push({ pathname: "/progress/[id]", params: { id: e.progression! } })}
            style={styles.teteExo}
          >
            {tete}
          </Pressable>
        ) : (
          <View style={styles.teteExo}>{tete}</View>
        )
      ) : null}
      {e.trace}
      {e.notes.map((n) => (
        <Texte key={n.id} variante="note" couleur="t2" style={{ marginBottom: espace.xs }}>
          {n.texte}
        </Texte>
      ))}
      {e.series.map((x) => (
        <View key={x.id} style={styles.serie}>
          {x.record || (affichage.numeros && x.numero) ? (
            <View style={styles.num}>
              {x.record ? (
                <Medaille taille={22} libelle={t("seance.fin.record")} />
              ) : (
                <Texte variante="corps" style={{ fontFamily: police.semibold, color: x.couleur ?? couleurs.t3 }}>
                  {x.numero}
                </Texte>
              )}
            </View>
          ) : null}
          <Texte variante="saisie" couleur={x.chauffe ? "t2" : "t1"} style={{ fontFamily: police.regular, fontSize: 15 }}>
            {x.texte}
          </Texte>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  exo: { paddingHorizontal: espace.l, paddingTop: espace.m, paddingBottom: espace.s, borderBottomWidth: StyleSheet.hairlineWidth },
  teteExo: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 },
  serie: { minHeight: 34, flexDirection: "row", alignItems: "center" },
  num: { width: 38, marginLeft: -5, alignItems: "center" },
});
