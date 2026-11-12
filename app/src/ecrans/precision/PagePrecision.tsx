// Page « Précision pepfit » (planche precision, sections 2 et 5 ; teinte de l'Accueil, comme les réglages) : le score et
// son cap, les prochaines étapes (ou ce qui la tient, très rempli), tes calculs avec leur précision, les cinq caps, une
// phrase en pied. Calculée sur le téléphone.
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme";
import { degrades } from "../../theme/effets";
import { avecOpacite } from "../../theme/teintes";
import { police } from "../../theme/typo";
import { AuraFond } from "../../ui/AuraFond";
import { Actualiser, sansEtirement } from "../../ui/Actualiser";
import { useDefilementAura } from "../../ui/aura-etat";
import { BarreHaut } from "../../ui/Cadre";
import { Feuille } from "../../ui/Feuille";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { CAPS, etapes, lecture, niveau, type Cap, type IdCalcul } from "../../precision/modele";
import {
  detailEtape, gain, ICONE_ACTION, lecturesOuvertesPar, pc, ICONE_CALCUL, lignesTient, lignesTout, motPrecision, nomCalcul, nomCap, sousCalcul, texteCap, texteEtape,
} from "../../precision/vue";
import type { EtatPrecision } from "../../precision/service";
import { Attente, GroupeP, LigneP, Niveau, SectionP } from "./Briques";
import { Heros, type Passage } from "./Heros";
import { useApp } from "../contexte";
import { passageAMontrer } from "../../precision/memoire";
import { marquerVu } from "../../precision/service";
import { usePrecision } from "./usePrecision";
import { suivreEtape } from "./actions";
import { FeuillePrecision } from "./FeuillePrecision";

export function PagePrecision() {
  useLangue();
  const { defilement, surDefilement } = useDefilementAura();
  const insets = useSafeAreaInsets();
  const [visite, setVisite] = useState(0);
  useFocusEffect(useCallback(() => setVisite((v) => v + 1), []));
  const e = usePrecision(visite);
  const { db } = useApp();
  const [tout, setTout] = useState(false);
  // le calcul reste choisi pendant que la feuille redescend
  const [calcul, setCalcul] = useState<IdCalcul | null>(null);
  const [feuille, setFeuille] = useState(false);
  // Passage de cap (planche, section 4) : décidé une fois, à la première lecture de la page ; une fois par cap
  const [passage, setPassage] = useState<Passage | null | undefined>(undefined);
  useEffect(() => {
    if (!e || passage !== undefined) return;
    const pa = passageAMontrer(e.memoire, e.r.cap.n, e.r.score);
    setPassage(pa ? { capAvant: pa.capAvant, scoreAvant: pa.scoreAvant, ouvrent: lecturesOuvertesPar(e.r, pa.lecturesAvant) } : null);
    if (!pa) marquerVu(db, e).catch(console.error);
  }, [e, passage, db]);
  const tete = (
    <View style={{ paddingTop: insets.top }}>
      <BarreHaut titre={t("precision.titre")} />
    </View>
  );
  return (
    <View style={{ flex: 1 }}>
      <AuraFond partie="accueil" fixe defilement={defilement} />
      {/* La zone tirée commence en haut de l'écran (barre d'état comprise) : l'en-tête descend avec la page. */}
      {e && passage !== undefined ? (
        <Actualiser defilement={defilement} recalculer={async () => setVisite((v) => v + 1)} souBarre>
          {tete}
          <Animated.ScrollView {...sansEtirement} onScroll={surDefilement} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}>
            <Heros score={e.r.score} cap={e.r.cap} passage={passage} onFini={() => marquerVu(db, e).catch(console.error)} />
            <Contenu e={e} onTout={() => setTout(true)} onRelire={() => setVisite((v) => v + 1)} onCalcul={(c) => (setCalcul(c), setFeuille(true))} />
          </Animated.ScrollView>
        </Actualiser>
      ) : (
        tete
      )}
      {e ? <FeuilleTout e={e} visible={tout} onFermer={() => setTout(false)} /> : null}
      {/* la ligne d'un calcul ouvre sa feuille ; son lien du bas mène à sa page (§ 6 bis, deux entrées, une feuille) */}
      <FeuillePrecision e={e} calcul={calcul} visible={feuille} onFermer={() => setFeuille(false)} depuisProfil />
    </View>
  );
}

export function Contenu({ e, onTout, onRelire, onCalcul }: { e: EtatPrecision; onTout: () => void; onRelire: () => void; onCalcul?: (id: IdCalcul) => void }) {
  const { d, r } = e;
  const prochaines = etapes(d);
  const rempli = r.score >= 85 && prochaines.length === 0;
  const femme = e.faits.femme;
  return (
    <>
      {rempli ? (
        <>
          <SectionP titre={t("precision.tient")} />
          <GroupeP>
            {lignesTient(d).map((l, i) => (
              <LigneP key={l.cle} premiere={i === 0} icone={l.icone} titre={l.titre} sous={l.sous} coche />
            ))}
          </GroupeP>
        </>
      ) : (
        <>
          <SectionP titre={t("precision.prochaines")} />
          <GroupeP>
            {prochaines.map((s, i) => (
              <LigneP
                key={s.id}
                premiere={i === 0}
                icone={ICONE_ACTION[s.id]}
                titre={texteEtape(s.id, d)}
                sous={detailEtape(s.id, d, femme)}
                gain={gain(s.affiche)}
                onPress={() => suivreEtape(s.id, undefined, onRelire)}
              />
            ))}
            <LigneP premiere={!prochaines.length} icone="list" titre={t("precision.tout")} onPress={onTout} />
          </GroupeP>
        </>
      )}

      <SectionP titre={t("precision.calculs")} droite={t("precision.colonne")} />
      <GroupeP>
        {r.calculs
          .filter((c) => c.actif)
          .map((c, i) => {
            const age = c.id === "age" ? lecture(r, "age") : null;
            const attente = age != null && !age.ouverte;
            return (
              <LigneP
                key={c.id}
                premiere={i === 0}
                icone={ICONE_CALCUL[c.id]}
                titre={nomCalcul(c.id)}
                sous={sousCalcul(c.id, d, e.faits, r)}
                attenuee={attente}
                droite={attente ? <Attente texte={age!.capAtteint ? t("precision.enAttente") : nomCap(CAPS[age!.cap - 1]!)} /> : <Niveau niveau={niveau(c.valeur ?? 0)} texte={motPrecision(niveau(c.valeur ?? 0))} />}
                onPress={onCalcul ? () => onCalcul(c.id) : undefined}
              />
            );
          })}
      </GroupeP>

      <SectionP titre={t("precision.lesCaps")} />
      <GroupeP>
        {CAPS.map((c) => (
          <Palier key={c.n} c={c} atteint={r.cap} />
        ))}
      </GroupeP>

      <View style={styles.pied}>
        <PiedIcone />
        <Texte variante="meta" couleur="t3" style={{ flex: 1, lineHeight: 16 }}>
          {t("precision.pied")}
        </Texte>
      </View>
    </>
  );
}

function PiedIcone() {
  const { couleurs } = useTheme();
  return (
    <View style={{ marginTop: 1 }}>
      <Icone nom="verrou" couleur={couleurs.t3} taille={14} epaisseur={2} />
    </View>
  );
}

/** Un cap de l'échelle : rond plein coché atteint, anneau et point en cours, anneau pâle à venir ; un trait les relie. */
function Palier({ c, atteint }: { c: Cap; atteint: Cap }) {
  const { couleurs, mode } = useTheme();
  const bleu = couleurs.partieAccueil;
  const etat = c.n < atteint.n || (c.n === 5 && atteint.n === 5) ? "fait" : c.n === atteint.n ? "ici" : "futur";
  const anneau = avecOpacite(bleu, 0.45);
  return (
    <View style={styles.palier} accessible accessibilityLabel={`${nomCap(c)}, ${pc(c.min)}, ${texteCap(c)}`}>
      <View style={styles.rep}>
        {c.n < 5 ? <View style={[styles.trait, { backgroundColor: couleurs.line }]} /> : null}
        <View
          style={[
            styles.rond,
            etat === "fait"
              ? { backgroundColor: bleu }
              : { backgroundColor: couleurs.s1, borderWidth: etat === "ici" ? 2 : 1.5, borderColor: etat === "ici" ? bleu : anneau },
          ]}
        >
          {etat === "fait" ? <Icone nom="check" couleur={mode === "nuit" ? couleurs.bg : degrades.accueil.sur} taille={12} epaisseur={2.75} /> : null}
          {etat === "ici" ? <View style={[styles.point, { backgroundColor: bleu }]} /> : null}
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={styles.capNom}>
          <Texte variante="corps" couleur={etat === "futur" ? "t2" : "t1"} style={{ fontSize: 15, lineHeight: 22, fontFamily: police.medium }}>
            {nomCap(c)}
          </Texte>
          <Texte variante="corps" couleur="t3" style={{ fontSize: 13 }}>
            {pc(c.min)}
          </Texte>
        </View>
        <Texte variante="corps" couleur="t2" style={{ fontSize: 13, lineHeight: 17 }}>
          {texteCap(c)}
        </Texte>
      </View>
    </View>
  );
}

/** Feuille « Tout ce qui compte » : chaque donnée, son état, et ce qu'elle rapporte (coche quand elle est pleine). */
function FeuilleTout({ e, visible, onFermer }: { e: EtatPrecision; visible: boolean; onFermer: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={t("precision.tout")} sousTitre={t("precision.toutSous")}>
      <GroupeP fond={couleurs.feuilleGroupe} style={{ marginHorizontal: 0 }}>
        {lignesTout(e.d).map((l, i) => (
          <LigneP key={l.cle} premiere={i === 0} icone={l.icone} titre={l.titre} sous={l.sous} gain={l.gain ? gain(l.gain.affiche) : null} coche={!l.gain} />
        ))}
      </GroupeP>
    </Feuille>
  );
}

const styles = StyleSheet.create({
  pied: { flexDirection: "row", gap: 8, alignItems: "flex-start", paddingTop: 16, paddingHorizontal: 20 },
  palier: { flexDirection: "row", gap: 14, paddingVertical: 12, paddingLeft: 16, paddingRight: 12, minHeight: 64 },
  rep: { width: 22, alignItems: "center" },
  trait: { position: "absolute", top: 24, bottom: -14, width: 1.5 },
  rond: { width: 20, height: 20, borderRadius: 10, marginTop: 1, alignItems: "center", justifyContent: "center" },
  point: { width: 8, height: 8, borderRadius: 4 },
  capNom: { flexDirection: "row", alignItems: "baseline", gap: 6 },
});
