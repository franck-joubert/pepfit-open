// Effort en séance (planche programmes-charges, variante B validée le 29/10) : la note de séance en haut (consigne d'effort,
// pourquoi partir léger), les lignes sous l'exercice (poids proposé, essai d'une première séance) et la question
// « C'était comment ? » qui s'ouvre sous une série cochée. Textes et choix : effort-seance.ts (pur, testé).
import { StyleSheet, View } from "react-native";
import type { MotEffort } from "../boutique/poids";
import { t } from "../i18n/index";
import { useTheme } from "../theme";
import { police, rayon } from "../theme/typo";
import { Icone, type NomIcone } from "../ui/Icone";
import { Appui } from "../ui/mouvement";
import { Texte } from "../ui/Texte";
import { choixEffort, type LigneEffort } from "./effort-seance";

/** Note de séance, en haut de la liste : une ligne par paragraphe, chacun avec son icône. */
export function NoteSeance({ lignes }: { lignes: { icone: NomIcone; texte: string }[] }) {
  const { couleurs } = useTheme();
  if (!lignes.length) return null;
  return (
    <View style={[styles.note, { backgroundColor: couleurs.s1 }]}>
      {lignes.map((l, i) => (
        <View key={i} style={styles.noteLigne}>
          <Icone nom={l.icone} couleur={couleurs.t2} taille={18} />
          <Texte variante="meta" couleur="t2" style={styles.noteTexte}>
            {l.texte}
          </Texte>
        </View>
      ))}
    </View>
  );
}

/** « + 2,5 kg : … », « Encore facile : essaie 30 kg. » : le début, jusqu'aux deux-points, en gras. */
export function LigneEffortVue({ l, marge = 0 }: { l: LigneEffort; marge?: number }) {
  const { couleurs } = useTheme();
  const couleur = l.ok ? couleurs.valide : couleurs.t2;
  const m = /^(.+?)(\s?:\s)(.*)$/s.exec(l.texte);
  return (
    <View style={[styles.ligne, { paddingLeft: marge }]} accessibilityRole="text">
      <Icone nom={l.icone} couleur={l.ok ? couleurs.valide : couleurs.t1} taille={18} />
      <Texte variante="meta" style={[styles.ligneTexte, { color: couleur }]}>
        {m ? (
          <>
            <Texte variante="meta" style={[styles.ligneTexte, { color: l.ok ? couleurs.valide : couleurs.t1, fontFamily: police.semibold }]}>
              {m[1]}
            </Texte>
            {`${m[2]}${m[3]}`}
          </>
        ) : (
          l.texte
        )}
      </Texte>
    </View>
  );
}

/** « C'était comment ? » : Max, Dur, Bien, Facile, chacun traduit en répétitions dessous ; la réponse visée est cerclée. */
export function QuestionEffort({ rirVise, choisi, onChoisir }: { rirVise: number | null; choisi?: MotEffort | null; onChoisir: (m: MotEffort) => void }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.question, { backgroundColor: couleurs.s1 }]}>
      <Texte variante="meta" couleur="t2" style={styles.questionTexte}>
        {t("seance.effort.question")}
      </Texte>
      <View style={styles.puces} accessibilityRole="radiogroup">
        {choixEffort(rirVise).map((c) => {
          const on = c.mot === choisi;
          return (
            <Appui
              key={c.mot}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t(c.vise ? "seance.effort.vise" : "seance.effort.choix", { mot: c.libelle, sous: c.sous })}
              onPress={() => onChoisir(c.mot)}
              style={[
                styles.puce,
                { backgroundColor: on ? couleurs.t1 : couleurs.s2 },
                c.vise && !on && { borderWidth: 1.5, borderColor: couleurs.line2 },
              ]}
            >
              <Texte style={{ fontFamily: police.semibold, fontSize: 15, color: on ? couleurs.bg : couleurs.t1 }}>{c.libelle}</Texte>
              <Texte style={{ fontFamily: police.medium, fontSize: 11, marginTop: 1, color: on ? couleurs.bg : couleurs.t2, opacity: on ? 0.75 : 1 }}>{c.sous}</Texte>
            </Appui>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { marginTop: 4, marginBottom: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: rayon.l, gap: 8 },
  noteLigne: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  noteTexte: { flex: 1, fontSize: 13, lineHeight: 18 },
  ligne: { flexDirection: "row", alignItems: "flex-start", gap: 8, minHeight: 36, paddingVertical: 9 },
  ligneTexte: { flexShrink: 1, fontSize: 13, lineHeight: 18 },
  question: { marginHorizontal: -6, marginBottom: 4, paddingTop: 8, paddingBottom: 10, paddingHorizontal: 6, borderRadius: rayon.l },
  questionTexte: { fontSize: 13, marginHorizontal: 2, marginBottom: 8 },
  puces: { flexDirection: "row", gap: 6 },
  puce: { flex: 1, minHeight: 48, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
});
