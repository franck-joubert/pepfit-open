import { Pressable, StyleSheet, View } from "react-native";
import { casesGardeFous, cocher, type ChoixGardeFou } from "../nutrition/objectifs-calc";
import type { SexeRegle } from "../nutrition/regle";
import { useTheme } from "../theme";
import { police, rayon } from "../theme/typo";
import { Icone } from "../ui/Icone";
import { Texte } from "../ui/Texte";
import { t } from "../i18n/index";

// Étape « Une de ces situations te concerne ? » (planches macros 7 et 8, D19) : les cinq cases dans un groupe, « Rien de tout
// ça » seul dans un second ; la case à gauche, la phrase de ce que pepfit en fera sous la case cochée. Sert au parcours de
// bienvenue et à « Mettre à jour ma situation ».

/** Les cases que le sexe propose, sans une réponse devenue sans objet (la grossesse après un passage à « Homme »). */
export function cochesValides(coches: readonly ChoixGardeFou[], sexe: SexeRegle | null): ChoixGardeFou[] {
  const permis = casesGardeFous(sexe);
  return coches.filter((c) => permis.includes(c));
}

export function ChoixGardeFous({ sexe, coches, onChange, couleur }: { sexe: SexeRegle | null; coches: readonly ChoixGardeFou[]; onChange: (c: ChoixGardeFou[]) => void; couleur: string }) {
  const { couleurs } = useTheme();
  const cases = casesGardeFous(sexe);
  const groupe = (l: ChoixGardeFou[], haut: number) => (
    <View style={[styles.groupe, { marginTop: haut, backgroundColor: couleurs.s1 }]}>
      {l.map((c, i) => {
        const actif = coches.includes(c);
        return (
          <Pressable
            key={c}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: actif }}
            onPress={() => onChange(cocher(coches, c))}
            style={({ pressed }) => [styles.opt, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }, pressed && { backgroundColor: couleurs.s2 }]}
          >
            <View style={[styles.case, actif ? { backgroundColor: couleur, borderColor: couleur } : { borderColor: couleurs.line2 }]}>
              {actif ? <Icone nom="check" couleur={couleurs.bg} taille={14} epaisseur={2.6} /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Texte variante="corps" style={styles.texte}>
                {t(`macros.garde.case.${c}`)}
              </Texte>
              {actif && c !== "rien" ? (
                <Texte variante="corps" style={[styles.phrase, { color: couleurs.t2 }]}>
                  {t(`macros.garde.phrase.${c}`)}
                </Texte>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
  return (
    <>
      {groupe(cases.filter((c) => c !== "rien"), 24)}
      {groupe(["rien"], 8)}
    </>
  );
}

const styles = StyleSheet.create({
  groupe: { marginHorizontal: 16, borderRadius: rayon.l, overflow: "hidden" },
  opt: { flexDirection: "row", alignItems: "flex-start", gap: 14, minHeight: 60, paddingTop: 18, paddingBottom: 17, paddingHorizontal: 16 },
  case: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  texte: { fontFamily: police.regular, fontSize: 16, lineHeight: 22 },
  phrase: { fontSize: 13, lineHeight: 18, marginTop: 3 },
});
