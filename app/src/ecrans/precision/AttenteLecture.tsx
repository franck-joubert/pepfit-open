// Lecture en attente (planche precision, section 3 ; PRECISION.md § 3) : à sa place habituelle (page de l'Âge pepfit, de la
// VO2max), un anneau en pointillés, ce qui manque (l'une ou l'autre action suffit-elle, ou les deux), ce qui est déjà là,
// une phrase de pourquoi, un seul bouton. Jamais de cadenas : rien n'est à acheter.
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../../theme";
import { police, rayon } from "../../theme/typo";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Texte } from "../../ui/Texte";
import { t, tp } from "../../i18n/index";
import { CAPS, etapes, lecture, type IdAction } from "../../precision/modele";
import { detailEtape, facteursAge, gain, ICONE_ACTION, manquesPour, nbFacteurs, nomCap, sousCalcul, texteEtape, type Manque } from "../../precision/vue";
import type { EtatPrecision } from "../../precision/service";
import { GroupeP, LigneP, SectionP } from "./Briques";
import { suivreEtape } from "./actions";

const SEUIL = { age: 60, vo2: 50 } as const;

export function AttenteLecture({ calcul, e, fond }: { calcul: "age" | "vo2"; e: EtatPrecision; fond: string }) {
  const { couleurs } = useTheme();
  const { d, r } = e;
  const l = lecture(r, calcul);
  const cap = CAPS[l.cap - 1]!;
  const m = l.capAtteint ? manquesPour(d, calcul, SEUIL[calcul]) : null;
  const premier: IdAction | null = m?.l[0]?.id ?? etapes(d, 1)[0]?.id ?? null;
  const unSeul = m?.mode === "seule";
  const titre = !l.capAtteint ? t("precision.attente.cap", { cap: nomCap(cap) }) : unSeul ? t("precision.attente.titre") : t("precision.attente.titrePlus");
  const sous = !l.capAtteint ? t("precision.attente.capSous", { n: r.score, cap: nomCap(cap), min: cap.min }) : t(`precision.attente.sous.${calcul}`);
  const facteurs = facteursAge(d);
  return (
    <View>
      <View style={styles.anneau} accessible accessibilityLabel={`${titre}, ${sous}`}>
        <Svg width={300} height={300} viewBox="0 0 300 300" style={StyleSheet.absoluteFill}>
          <Circle cx={150} cy={150} r={138} fill="none" stroke={couleurs.t3} strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="3 7" strokeLinecap="round" />
        </Svg>
        <Texte variante="titreFort" style={styles.titre}>
          {titre}
        </Texte>
        <Texte variante="libelle" couleur="t2" style={styles.sous}>
          {sous}
        </Texte>
      </View>

      {l.capAtteint && m ? (
        <>
          <SectionP titre={unSeul ? t("precision.attente.ouOu") : t("precision.attente.lesDeux")} style={{ paddingTop: 12 }} />
          <GroupeP fond={fond}>
            {m.l.map((x, i) => (
              <LigneManque key={x.id} m={x} premiere={i === 0} e={e} calcul={calcul} />
            ))}
          </GroupeP>
        </>
      ) : !l.capAtteint ? (
        <>
          <SectionP titre={t("precision.prochaines")} style={{ paddingTop: 12 }} />
          <GroupeP fond={fond}>
            {etapes(d).map((s, i) => (
              <LigneP key={s.id} premiere={i === 0} icone={ICONE_ACTION[s.id]} titre={texteEtape(s.id, d)} sous={detailEtape(s.id, d, e.faits.femme)} gain={gain(s.affiche)} onPress={() => suivreEtape(s.id)} />
            ))}
          </GroupeP>
        </>
      ) : null}

      <SectionP titre={t("precision.attente.dejaLa")} />
      <GroupeP fond={fond}>
        {calcul === "age" ? (
          <LigneP premiere icone="check" couleurIcone={couleurs.valide} titre={t("precision.attente.facteurs", { n: nbFacteurs(d) })} sous={capitale(facteurs.join(", "))} />
        ) : (
          <LigneP premiere icone="check" couleurIcone={couleurs.valide} titre={sousCalcul("vo2", d, e.faits, r)} />
        )}
      </GroupeP>

      <Texte variante="libelle" couleur="t2" style={styles.pourquoi}>
        {t(`precision.attente.pourquoi.${calcul}`)}
      </Texte>
      {premier ? (
        <BoutonPrincipal
          libelle={premier === "tour" ? t("precision.attente.ctaTour") : texteEtape(premier, d)}
          onPress={() => suivreEtape(premier)}
          style={{ marginHorizontal: 16, marginTop: 28 }}
        />
      ) : null}
    </View>
  );
}

const capitale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Une chose qui manque : le tour de taille (« Mesurer » sur place), des nuits avec la montre, ou une étape. */
function LigneManque({ m, premiere, e, calcul }: { m: Manque; premiere: boolean; e: EtatPrecision; calcul: "age" | "vo2" }) {
  const { couleurs, mode } = useTheme();
  if (m.id === "tour")
    return (
      <LigneP
        premiere={premiere}
        icone="regle"
        titre={t("precision.attente.ligneTour")}
        sous={t("precision.attente.ligneTourSous")}
        droite={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("precision.attente.ctaTour")}
            onPress={() => suivreEtape("tour")}
            hitSlop={{ top: 4, bottom: 4 }}
            style={({ pressed }) => [styles.puce, { backgroundColor: pressed ? couleurs.s3 : mode === "nuit" ? couleurs.s2 : couleurs.s3 }]}
          >
            <Texte variante="libelle" style={{ fontFamily: police.semibold }}>
              {t("precision.attente.mesurer")}
            </Texte>
          </Pressable>
        }
      />
    );
  if (m.id === "nuits" && m.n != null)
    return <LigneP premiere={premiere} icone="lune" titre={tp("precision.attente.ligneNuits", m.n)} sous={t("precision.attente.ligneNuitsSous", { n: e.d.nuits14 })} />;
  return <LigneP premiere={premiere} icone={ICONE_ACTION[m.id]} titre={texteEtape(m.id, e.d)} sous={detailEtape(m.id, e.d, e.faits.femme, calcul)} onPress={() => suivreEtape(m.id)} />;
}

const styles = StyleSheet.create({
  anneau: { width: 300, height: 300, alignSelf: "center", marginTop: 24, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  titre: { textAlign: "center", lineHeight: 30 },
  sous: { textAlign: "center", marginTop: 6 },
  pourquoi: { marginTop: 28, marginHorizontal: 24, lineHeight: 20 },
  puce: { height: 36, paddingHorizontal: 12, borderRadius: rayon.m, alignItems: "center", justifyContent: "center" },
});
