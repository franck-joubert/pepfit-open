// Lignes de disques (planche materiel a4 et a6) : une ligne par poids, le disque dessiné à son échelle, le nombre de paires
// en pas à pas ; les poids courants manquants s'ajoutent d'un toucher, « Autre » ouvre le pavé (dans la feuille parente).
import { View } from "react-native";
import { net, type Disque, type Unite } from "../../db/materiel";
import { versUnite } from "../format";
import { t, tp } from "../../i18n/index";
import { Bloc, DisqueDessin, nb, PlusMoins, Puce, Puces } from "./briques";

const enKg = (kg: number, u: Unite) => (u === "kg" ? kg : net(kg / versUnite(1, "lbs")));

export function LignesDisques({
  disques, unite, courants, max = 4, onChange, onAutre,
}: {
  disques: readonly Disque[];
  unite: Unite;
  /** Poids courants proposés quand ils manquent (les `max` premiers). */
  courants: readonly number[];
  max?: number;
  onChange: (d: Disque[]) => void;
  onAutre: () => void;
}) {
  const tries = [...disques].sort((a, b) => b.kg - a.kg);
  const manquent = courants.filter((v) => !disques.some((d) => d.kg === v)).slice(0, max);
  const regler = (kg: number, delta: number) => onChange(disques.map((d) => (d.kg === kg ? { kg, paires: Math.max(0, d.paires + delta) } : d)));
  return (
    <View style={{ gap: 10 }}>
      {tries.length ? (
        <Bloc>
          {tries.map((d, i) => (
            <PlusMoins
              key={d.kg}
              premier={i === 0}
              fort
              avant={<DisqueDessin kg={enKg(d.kg, unite)} />}
              libelle={`${nb(d.kg)} ${unite}`}
              valeur={String(d.paires)}
              unite={tp("materiel.paire", d.paires)}
              moinsOff={d.paires <= 0}
              onMoins={() => regler(d.kg, -1)}
              onPlus={() => regler(d.kg, 1)}
            />
          ))}
        </Bloc>
      ) : null}
      <Puces>
        {manquent.map((v) => (
          <Puce key={v} role="button" icone="plus" libelle={nb(v)} onPress={() => onChange([...disques, { kg: v, paires: 1 }])} />
        ))}
        <Puce role="button" libelle={t("materiel.disques.autre")} onPress={onAutre} />
      </Puces>
    </View>
  );
}
