// Indicateur mini de la précision d'un calcul (planche precision, section 7 ; PRECISION.md § 6 bis) : à côté du chiffre qu'il
// qualifie, sur les pages de statistiques ; il ouvre la feuille de ce calcul (P12). `onPress` : depuis une feuille (la
// feuille Énergie de Santé), la feuille de précision prend sa place, c'est la page d'en dessous qui l'ouvre.
import { useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { niveau, type IdCalcul } from "../../precision/modele";
import { IndicePrecision } from "../sante-ui";
import { FeuillePrecision } from "./FeuillePrecision";
import { usePrecision } from "./usePrecision";

/** Sous la ligne d'un chiffre fort : le contenu aligné sur la marge de 16 de la page (zone touchable de 6 de chaque côté). */
export const STYLE_MINI: ViewStyle = { marginLeft: 10, marginTop: 4 };

/**
 * `valeur` : la précision propre au chiffre montré (la Récupération d'un matin, recup-pepfit.ts), au lieu de celle du calcul ;
 * la feuille reste celle du calcul.
 */
export function MiniPrecision({ calcul, valeur, court, style, onPress }: { calcul: IdCalcul; valeur?: number; court?: boolean; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const e = usePrecision();
  const [ouverte, setOuverte] = useState(false);
  if (!e) return valeur != null ? <IndicePrecision niveau={niveau(valeur)} court={court} style={style} /> : null;
  return (
    <>
      <IndicePrecision niveau={niveau(valeur ?? e.r.p[calcul] ?? 0)} court={court} style={style} onPress={onPress ?? (() => setOuverte(true))} />
      {onPress ? null : <FeuillePrecision e={e} calcul={calcul} visible={ouverte} onFermer={() => setOuverte(false)} />}
    </>
  );
}
