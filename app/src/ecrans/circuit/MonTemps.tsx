import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { monTemps, type MonTemps as Temps, type TempsCircuit } from "../../circuits/suivre";
import { lireTemps } from "../../db/depots/circuits-temps";
import { t, tp } from "../../i18n/index";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { Texte } from "../../ui/Texte";
import { useApp } from "../contexte";
import { anneeDe, dureeCourte, jourMoisAnneeLong, jourMoisLong } from "../format";
import { GroupeCarte, LigneBrique, TitreGroupe } from "../briques";

// « Mon temps » de la page d'un circuit (planche Circuits, p1 et p4) : le meilleur temps et la dernière fois, avec le nombre de fois. Les temps
// restent sur le téléphone (réglage `circuit_temps:<id>`) : le serveur ne sait ni qui a suivi un circuit, ni combien de fois, ni en combien de
// temps (ni compteur, ni classement, ni record). Un circuit jamais suivi dit comment avoir un temps. Les sorties supprimées ne retirent pas leur temps.

/** « 12 octobre », avec l'année quand ce n'est pas l'année en cours. */
const jourTexte = (ms: number) => (anneeDe(ms) === anneeDe(Date.now()) ? jourMoisLong(ms) : jourMoisAnneeLong(ms));

export function MonTemps({ circuitId }: { circuitId: string }) {
  const { db } = useApp();
  const [temps, setTemps] = useState<TempsCircuit[] | null>(null);
  useEffect(() => {
    let actif = true;
    lireTemps(db, circuitId)
      .then((x) => actif && setTemps(x))
      .catch(console.warn);
    return () => {
      actif = false;
    };
  }, [db, circuitId]);
  // Le temps se lit avant d'être dessiné : pas de bloc « vide » qui clignote avant de devenir une ligne.
  if (!temps) return null;
  const mien = monTemps(temps);
  return mien ? <Faits mien={mien} /> : <Vide />;
}

function Faits({ mien }: { mien: Temps }) {
  // Une seule fois : le meilleur temps est aussi la dernière fois ; une deuxième ligne dirait la même chose.
  const lignes = mien.fois > 1 ? ([["medal", "circuit.temps.meilleur", mien.meilleur], ["history", "circuit.temps.derniere", mien.derniere]] as const) : ([["medal", "circuit.temps.meilleur", mien.meilleur]] as const);
  return (
    <>
      <TitreGroupe texte={t("circuit.temps.titre")} droite={tp("circuit.temps.fois", mien.fois, { n: mien.fois })} haut={espace.xxl} />
      <GroupeCarte>
        {lignes.map(([icone, cle, x], i) => (
          <LigneBrique
            key={cle}
            premier={i === 0}
            icone={icone}
            titre={t(cle)}
            sous={jourTexte(x.le)}
            fin={<Valeur dureeS={x.dureeS} />}
          />
        ))}
      </GroupeCarte>
    </>
  );
}

function Valeur({ dureeS }: { dureeS: number }) {
  return (
    <Texte variante="corps" numberOfLines={1} style={styles.valeur}>
      {dureeCourte(dureeS)}
    </Texte>
  );
}

function Vide() {
  const { couleurs } = useTheme();
  return (
    <>
      <TitreGroupe texte={t("circuit.temps.titre")} haut={espace.xxl} />
      <View style={[styles.vide, { backgroundColor: couleurs.s2 }]}>
        <Texte variante="corps" style={styles.videTitre}>
          {t("circuit.temps.vide.titre")}
        </Texte>
        <Texte variante="libelle" couleur="t2">
          {t("circuit.temps.vide.texte")}
        </Texte>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  valeur: { fontFamily: police.semibold, fontVariant: ["tabular-nums"] },
  vide: { paddingVertical: 14, paddingHorizontal: espace.l, borderRadius: rayon.xl, gap: 2 },
  videTitre: { fontFamily: police.semibold },
});
