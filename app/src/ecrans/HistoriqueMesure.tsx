// Historique d'une mesure (planche sante-energie D7 : même gabarit que Composition) : la dernière valeur, la courbe sur la
// période, puis chaque mesure avec sa source et sa date. Ouvert par une ligne de Composition, ou par VFC et FC repos.
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { historiqueMensuration, type TypeMensuration } from "../db";
import { t, tp } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { couleursSante } from "../theme/effets";
import { espace, police } from "../theme/typo";
import { Segmente } from "../ui/Segmente";
import { Texte } from "../ui/Texte";
import { useCharge } from "./contexte";
import { ecart, fixe, formatMesure, libelleMesure, lireCle, PERIODES_JOURS, pointsPeriode, texteEcart, type PeriodeJours } from "./composition-vue";
import { CourbeMesure } from "./CourbeMesure";
import { jourMoisAnnee, heure } from "./format";
import { historiqueComposition, nomSource, type PointMesure } from "./sante-donnees";
import { Section, Valeur } from "./sante-ui";
import { EcranSuivi, Filet, Groupe, Ligne } from "./suivi-ui";

const MAX_LIGNES = 60;

export function HistoriqueMesure() {
  useLangue();
  const { couleurs, mode } = useTheme();
  const c = couleursSante[mode];
  const cle = lireCle(useLocalSearchParams<{ type?: string }>().type) ?? "poids";
  const [periode, setPeriode] = useState<PeriodeJours>(90);
  const [l] = useCharge(async (db): Promise<PointMesure[]> => {
    if (cle.startsWith("m:")) return (await historiqueMensuration(db, cle.slice(2) as TypeMensuration)).map((m) => ({ date: m.date, valeur: m.valeur, origine: null, manuel: true }));
    return historiqueComposition(db, cle === "maigre" ? "maigre-calcule" : (cle as "poids"));
  }, [cle]);
  const f = formatMesure(cle);
  const couleur = cle === "gras" ? c.gras : cle === "maigre" ? c.bmr : couleurs.partieSante;
  const tous = l ?? [];
  const sur = pointsPeriode(tous, periode);
  const d = ecart([...sur].reverse(), f.decimales);
  const dernier = tous[0];
  return (
    <EcranSuivi titre={libelleMesure(cle)} actualiser>
      <Segmente<string>
        doux
        options={PERIODES_JOURS.map((j) => ({ valeur: String(j), libelle: t(`sante.periode.${j}` as "sante.periode.30") }))}
        valeur={String(periode)}
        onChange={(v) => setPeriode(Number(v) as PeriodeJours)}
        style={{ marginHorizontal: espace.l, marginTop: espace.xs }}
      />
      <View style={{ marginTop: espace.l, marginHorizontal: espace.l }}>
        {dernier ? (
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
            <Valeur v={fixe(dernier.valeur, f.decimales)} unite={f.unite} taille={20} gras={police.semibold} />
            {d != null ? (
              <Texte variante="meta" couleur="t2">
                {texteEcart(d, cle)}
              </Texte>
            ) : null}
          </View>
        ) : null}
        <CourbeMesure points={sur} couleur={couleur} decimales={f.decimales} libelle={libelleMesure(cle)} />
      </View>
      {sur.length ? (
        <>
          <Section>{`${t("sante.historique")}, ${tp("sante.mesuresN", sur.length)}`}</Section>
          <Groupe>
            {[...sur]
              .reverse()
              .slice(0, MAX_LIGNES)
              .flatMap((p, i) => {
                const ligne = (
                  <Ligne
                    key={p.date}
                    titre={jourMoisAnnee(p.date)}
                    sous={`${p.manuel ? t("sante.saisie") : nomSource(p.origine)}, ${heure(p.date)}`}
                    valeur={<Valeur v={fixe(p.valeur, f.decimales)} unite={f.unite} />}
                  />
                );
                return i ? [<Filet key={`f${p.date}`} />, ligne] : [ligne];
              })}
          </Groupe>
        </>
      ) : null}
    </EcranSuivi>
  );
}
