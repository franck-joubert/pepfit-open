// Feuille d'une machine (planche materiel a7) : à pile (première charge, pas, charge maximale, petites masses d'appoint) ou
// chargée à disques (poids à vide, charge maximale, disques du lieu). Sans base : la fiche du lieu et l'ajout de machines l'écrivent.
import { useEffect, useState } from "react";
import { barreChargee, etendue, paires, pile, type Disque, type Unite } from "../../db/materiel";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille } from "../../ui/Feuille";
import { Segmente } from "../../ui/Segmente";
import { Bloc, EnteteFeuille, LienTexte, nb, PlusMoins, Puce, Puces, Resultat, Section } from "./briques";
import { convertir } from "./FeuilleDisques";
import { PAS, pasSuivant, pousser } from "./pas";

export interface ValeursMachine {
  mode: "pile" | "disques";
  /** Pile : première charge ; disques : poids à vide. */
  premiere: number | null;
  pas: number;
  max: number | null;
  appoint: number[];
  unite: Unite;
}

/** Petites masses proposées (une fois chacune, D10). */
const APPOINTS: Record<Unite, number[]> = { kg: [2.5, 1.25], lbs: [5, 2.5] };

/** Charges d'une machine réglée ainsi (dans son unité) ; `disquesKg` : les disques olympiques du lieu, en kg. */
export function chargesValeurs(v: ValeursMachine, disquesKg: readonly Disque[]): number[] {
  if (v.mode === "disques") {
    const d = disquesKg.map((x) => ({ kg: convertir(x.kg, "kg", v.unite), paires: x.paires }));
    return d.length ? barreChargee(v.premiere ?? 0, d, Infinity, v.max ?? Infinity) : [];
  }
  return v.max && v.pas > 0 ? pile({ premiere: v.premiere ?? v.pas, pas: v.pas, max: v.max, appoint: v.appoint }) : [];
}

export function FeuilleMachine({
  visible, nom, valeurs, disquesKg, onFermer, onEnregistrer, onRetirer,
}: {
  visible: boolean;
  nom: string;
  valeurs: ValeursMachine | null;
  disquesKg: readonly Disque[];
  onFermer: () => void;
  onEnregistrer: (v: ValeursMachine) => void;
  onRetirer?: () => void;
}) {
  useLangue();
  const [v, setV] = useState<ValeursMachine | null>(valeurs);
  useEffect(() => {
    if (visible && valeurs) setV(valeurs);
  }, [visible, valeurs]);
  if (!v) return <Feuille visible={false} onFermer={onFermer}>{null}</Feuille>;

  const u = v.unite;
  const poser = (p: Partial<ValeursMachine>) => setV((x) => (x ? { ...x, ...p } : x));
  const charges = chargesValeurs(v, disquesKg);
  const nbDisques = paires(disquesKg);
  const premiere = v.premiere ?? v.pas;
  const pasVide = u === "kg" ? 2.5 : 5;
  const pasMax = v.mode === "disques" ? (u === "kg" ? 10 : 20) : v.pas;

  const resultat = (() => {
    if (v.mode === "pile") {
      if (!charges.length) return <Resultat titre={t("materiel.detail.machineSans")} sous={t("materiel.machine.incomplet")} />;
      return (
        <Resultat
          titre={etendue(charges, u)}
          sous={v.appoint.length ? tp("materiel.machine.resAppoint", charges.length, { n: charges.length }) : tp("materiel.machine.res", charges.length, { n: charges.length })}
        />
      );
    }
    if (!nbDisques) return <Resultat titre={`${nb(v.premiere ?? 0)} ${u}`} sous={t("materiel.machine.sansDisques")} />;
    const arret = v.max != null && charges[charges.length - 1]! < v.max;
    return (
      <Resultat
        titre={etendue(charges, u)}
        sous={arret ? tp("materiel.machine.arret", nbDisques, { n: nbDisques, max: nb(v.max!), unite: u }) : tp("materiel.machine.avecDisques", nbDisques, { n: nbDisques })}
      />
    );
  })();

  return (
    <Feuille visible={visible} onFermer={onFermer} pied={<BoutonPrincipal libelle={t("ui.enregistrer")} onPress={() => onEnregistrer(v)} />}>
      <EnteteFeuille
        titre={nom}
        sous={t("materiel.machine.sous")}
        unite={u}
        onUnite={(x) => x !== u && setV({ ...v, unite: x, premiere: v.premiere == null ? null : convertir(v.premiere, u, x), max: v.max == null ? null : convertir(v.max, u, x), appoint: [] })}
      />
      <Segmente
        options={[
          { valeur: "pile", libelle: t("materiel.machine.pile") },
          { valeur: "disques", libelle: t("materiel.machine.disques") },
        ]}
        valeur={v.mode}
        onChange={(m) => poser({ mode: m })}
      />
      {v.mode === "pile" ? (
        <>
          <Bloc>
            <PlusMoins
              premier
              libelle={t("materiel.machine.premiere")}
              valeur={nb(premiere)}
              unite={u}
              moinsOff={premiere <= 0}
              onMoins={() => poser({ premiere: pousser(premiere, -v.pas) })}
              onPlus={() => poser({ premiere: pousser(premiere, v.pas) })}
            />
            <PlusMoins
              libelle={t("materiel.machine.pas")}
              valeur={nb(v.pas)}
              unite={u}
              moinsOff={v.pas <= PAS[0]!}
              plusOff={v.pas >= PAS[PAS.length - 1]!}
              onMoins={() => poser({ pas: pasSuivant(v.pas, -1) })}
              onPlus={() => poser({ pas: pasSuivant(v.pas, 1) })}
            />
            <PlusMoins
              libelle={t("materiel.machine.max")}
              valeur={v.max == null ? t("materiel.barre.aucune") : nb(v.max)}
              unite={v.max == null ? undefined : u}
              moinsOff={v.max == null}
              onMoins={() => poser({ max: v.max == null || v.max - pasMax < premiere ? null : pousser(v.max, -pasMax) })}
              onPlus={() => poser({ max: v.max == null ? pousser(premiere, pasMax * 9) : pousser(v.max, pasMax) })}
            />
          </Bloc>
          <Section titre={t("materiel.machine.petites")} />
          <Puces>
            {APPOINTS[u].map((a) => {
              const on = v.appoint.includes(a);
              return (
                <Puce
                  key={a}
                  icone="plus"
                  on={on}
                  libelle={`${nb(a)} ${u}`}
                  onPress={() => poser({ appoint: on ? v.appoint.filter((x) => x !== a) : [...v.appoint, a] })}
                />
              );
            })}
          </Puces>
        </>
      ) : (
        <Bloc>
          <PlusMoins
            premier
            libelle={t("materiel.machine.aVide")}
            aide={t("materiel.machine.aVideAide")}
            valeur={nb(v.premiere ?? 0)}
            unite={u}
            moinsOff={(v.premiere ?? 0) <= 0}
            onMoins={() => poser({ premiere: pousser(v.premiere ?? 0, -pasVide) })}
            onPlus={() => poser({ premiere: pousser(v.premiere ?? 0, pasVide) })}
          />
          <PlusMoins
            libelle={t("materiel.machine.max")}
            valeur={v.max == null ? t("materiel.barre.aucune") : nb(v.max)}
            unite={v.max == null ? undefined : u}
            moinsOff={v.max == null}
            onMoins={() => poser({ max: v.max == null || v.max - pasMax <= (v.premiere ?? 0) ? null : pousser(v.max, -pasMax) })}
            onPlus={() => poser({ max: v.max == null ? pousser(v.premiere ?? 0, pasMax * 10) : pousser(v.max, pasMax) })}
          />
        </Bloc>
      )}
      {resultat}
      {onRetirer ? <LienTexte libelle={t("materiel.retirer")} onPress={onRetirer} /> : null}
    </Feuille>
  );
}
