// Surlignage des lignes d'Énergie qui ont changé après une activité associée ou ignorée (energie-surligne.ts) : page Énergie
// et feuille Énergie, le voile commun de ui/Surligne.
import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import type { JourEnergie } from "../sante-donnees";
import { Surligne, SURLIGNE_MS } from "../../ui/Surligne";
import { empreinte, lignesChangees, type LigneEnergie } from "./energie-surligne";

const AUCUNE: ReadonlySet<LigneEnergie> = new Set();

/** Lignes à surligner du jour montré, le temps du surlignage. */
export function useLignesChangees(jour: number, e: JourEnergie | null): ReadonlySet<LigneEnergie> {
  const [l, setL] = useState(AUCUNE);
  const cle = e ? `${jour}|${Object.values(empreinte(e)).join("|")}` : null;
  useEffect(() => {
    if (!e) return;
    const c = lignesChangees(jour, e);
    if (!c.length) return;
    setL(new Set(c));
    const m = setTimeout(() => setL(AUCUNE), SURLIGNE_MS);
    return () => clearTimeout(m);
    // `cle` résume le jour et ses deux lignes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  return l;
}

/** Une ligne, voilée de la couleur de la partie quand elle vient de changer. */
export function LigneSurlignee({ actif, couleur, children }: { actif: boolean; couleur: string; children: ReactNode }) {
  return (
    <View>
      {children}
      {actif ? <Surligne couleur={couleur} rayon={0} /> : null}
    </View>
  );
}
