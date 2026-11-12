// Feuilles d'un tour (planche mensurations) : « Ajouter une mesure » (M7 : un seul tour, depuis sa page) et sa correction,
// avec le visuel, la consigne, la dernière valeur et la molette au pas de 0,5 ; « Où poser le mètre » : le visuel en grand
// et la consigne (ouvert par le bloc propre de la page du tour). Le personnage et la consigne suivent le profil (planche
// mensurations-femme, D4, D7).
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { useLargeurContenu } from "../../ui/CadreContenu";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille } from "../../ui/Feuille";
import { RoueDuree } from "../../ui/RoueDuree";
import { Texte } from "../../ui/Texte";
import { fixe } from "../composition-vue";
import { jourSemaineMois } from "../format";
import { FigureEtape } from "./FigureTour";
import type { Sexe } from "../../db/api";
import { cleConsigne, valeursRoue, type Perso, type Tour } from "./tours-calc";

/** Marque de la valeur dans un texte traduit : elle y est écrite en medium (« La dernière fois : **35,0 cm**, … »). */
export const MARQUE = "\u2063";

/** Texte d'aide 12 t3 dont la valeur (repérée par MARQUE) est en medium t2. */
export function AvecValeur({ texte, valeur, style }: { texte: string; valeur: string; style?: object }) {
  const [a, b = ""] = texte.split(MARQUE);
  return (
    <Texte variante="meta" couleur="t3" style={[{ lineHeight: 16 }, style]}>
      {a}
      {texte.includes(MARQUE) ? (
        <Texte variante="meta" couleur="t2" style={{ fontFamily: police.medium }}>
          {valeur}
        </Texte>
      ) : null}
      {b}
    </Texte>
  );
}

/** Carte du personnage cadré sur un tour, à la largeur qu'on lui donne. */
function Visuel({ perso, tour, hauteur }: { perso: Perso; tour: Tour; hauteur: number }) {
  const { couleurs, mode } = useTheme();
  const [l, setL] = useState(0);
  return (
    <View style={[styles.visuel, { height: hauteur, backgroundColor: mode === "nuit" ? couleurs.s2 : couleurs.s3 }]} onLayout={(e) => setL(e.nativeEvent.layout.width)}>
      {l ? <FigureEtape perso={perso} tour={tour} faits={[]} largeur={l} hauteur={hauteur} /> : null}
    </View>
  );
}

const cm = (v: number) => `${fixe(v, 1)} cm`;

/** Ajouter (ou corriger) une mesure d'un tour : la molette part de `depart`. */
export function FeuilleTour({
  tour,
  perso,
  sexe,
  visible,
  sousTitre,
  depart,
  derniere,
  onFermer,
  onEnregistrer,
}: {
  tour: Tour;
  perso: Perso;
  sexe: Sexe | null;
  visible: boolean;
  sousTitre: string;
  depart: number;
  derniere: { valeur: number; date: number } | null;
  onFermer: () => void;
  onEnregistrer: (v: number) => void;
}) {
  const large = useLargeurContenu() >= 560;
  const [v, setV] = useState(depart);
  const [n, setN] = useState(0);
  // chaque ouverture remonte la molette sur la valeur de départ
  useEffect(() => {
    if (!visible) return;
    setV(depart);
    setN((x) => x + 1);
  }, [visible, depart]);
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t(`nutrition.mesure.${tour}`)}
      sousTitre={sousTitre}
      glisserContenu={false}
      pied={<BoutonPrincipal libelle={t("mesuresCorps.enregistrer")} onPress={() => onEnregistrer(v)} />}
    >
      <Visuel perso={perso} tour={tour} hauteur={large ? 220 : 168} />
      <Texte variante="libelle" couleur="t2" style={{ marginTop: 10, lineHeight: 20 }}>
        {t(cleConsigne(tour, sexe))}
      </Texte>
      {derniere ? <AvecValeur texte={t("mensurations.derniereFois", { v: MARQUE, date: jourSemaineMois(derniere.date) })} valeur={cm(derniere.valeur)} style={{ marginTop: 8 }} /> : null}
      <View style={{ marginTop: 6 }}>
        <RoueDuree
          key={`r${n}`}
          libelle={t(`nutrition.mesure.${tour}`)}
          valeur={depart}
          valeurs={valeursRoue(tour)}
          onChange={setV}
          traits={false}
          decoupe={(x) => ({ attenue: "", plein: fixe(x, 1) })}
          lue={cm}
          unite="cm"
        />
      </View>
    </Feuille>
  );
}

/** « Où poser le mètre » en grand : le personnage, la consigne, le rappel du matin. */
export function FeuilleConsigne({ tour, perso, sexe, visible, onFermer }: { tour: Tour; perso: Perso; sexe: Sexe | null; visible: boolean; onFermer: () => void }) {
  const large = useLargeurContenu() >= 560;
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={t(`nutrition.mesure.${tour}`)}>
      <Visuel perso={perso} tour={tour} hauteur={large ? 380 : 320} />
      <Texte variante="libelle" couleur="t2" style={{ marginTop: 12, lineHeight: 20 }}>
        {t(cleConsigne(tour, sexe))}
      </Texte>
      <Texte variante="meta" couleur="t3" style={{ marginTop: 8, marginBottom: espace.s }}>
        {t("mensurations.astuce")}
      </Texte>
    </Feuille>
  );
}

const styles = StyleSheet.create({
  visuel: { borderRadius: rayon.l, overflow: "hidden" },
});
