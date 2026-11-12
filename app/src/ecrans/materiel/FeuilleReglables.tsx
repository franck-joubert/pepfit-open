// Feuille Haltères réglables (planche materiel a4) : poignées, poids d'une poignée, disques en paires ; l'appli calcule les deux
// cas, deux haltères chargés pareil ou un seul qui prend tous les disques.
import { useEffect, useState } from "react";
import { etendue, halteresReglables, net, type Disque, type Unite } from "../../db/materiel";
import type { Materiel, NouveauMateriel } from "../../db/depots/materiel";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille } from "../../ui/Feuille";
import { Bloc, EnteteFeuille, LienTexte, nb, PavePoids, PlusMoins, Resultat, Section } from "./briques";
import { LignesDisques } from "./LignesDisques";
import { pousser } from "./pas";

/** Disques courants des haltères réglables (trou de 25 à 30 mm). */
const COURANTS_REGLABLES: Record<Unite, number[]> = { kg: [5, 2.5, 2, 1.25, 1, 0.5], lbs: [10, 5, 2.5, 1.25] };
/** Poids d'une poignée à l'ouverture (un champ, pas du matériel : on le règle avant d'enregistrer). */
const POIGNEE: Record<Unite, number> = { kg: 2, lbs: 5 };

export function FeuilleReglables({
  visible, element, uniteDefaut, onFermer, onEnregistrer, onRetirer,
}: {
  visible: boolean;
  element: Materiel | null;
  uniteDefaut: Unite;
  onFermer: () => void;
  onEnregistrer: (m: NouveauMateriel) => void;
  onRetirer?: () => void;
}) {
  useLangue();
  const [unite, setUnite] = useState<Unite>(uniteDefaut);
  const [poignees, setPoignees] = useState(2);
  const [poignee, setPoignee] = useState(POIGNEE[uniteDefaut]);
  const [disques, setDisques] = useState<Disque[]>([]);
  const [autre, setAutre] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const u = element?.unite ?? uniteDefaut;
    setUnite(u);
    setPoignees(element?.nombre ?? 2);
    setPoignee(element?.poidsPropre ?? POIGNEE[u]);
    setDisques(element?.disques ?? []);
    setAutre(false);
  }, [visible, element, uniteDefaut]);

  // Sans disque, rien à calculer : la poignée seule n'est pas un résultat.
  const r = disques.some((d) => d.paires > 0) ? halteresReglables({ poignee, poignees, disques }) : { deux: [], un: [] };
  const kit = net(poignees * poignee + disques.reduce((s, d) => s + 2 * d.kg * d.paires, 0));
  const pas = unite === "kg" ? 0.5 : 1;

  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      pied={
        autre ? undefined : (
          <BoutonPrincipal
            libelle={t("ui.enregistrer")}
            onPress={() =>
              onEnregistrer({
                id: element?.id, genre: "reglables", forme: null, nom: null, poids: [], poidsPropre: poignee, nombre: poignees, chargeMax: null, maxParCote: null,
                trou: null, prechargee: false, disques: disques.filter((d) => d.paires > 0), unite,
              })
            }
          />
        )
      }
    >
      {autre ? (
        <>
          <EnteteFeuille titre={t("materiel.autrePoids")} sous={t("materiel.disques")} onRetour={() => setAutre(false)} />
          <PavePoids
            unite={unite}
            aide={(v) => t("materiel.autre.aide", { kg: v, unite })}
            onAjouter={(v) => {
              if (!disques.some((d) => d.kg === v)) setDisques([...disques, { kg: v, paires: 1 }]);
              setAutre(false);
            }}
          />
        </>
      ) : (
        <>
          <EnteteFeuille
            titre={t("materiel.genre.reglables")}
            sous={kit > 0 ? t("materiel.reglables.sous", { kg: nb(kit), unite }) : undefined}
            unite={unite}
            onUnite={(u) => {
              if (u === unite) return;
              setUnite(u);
              setPoignee(POIGNEE[u]);
              setDisques([]);
            }}
          />
          <Bloc>
            <PlusMoins
              premier
              libelle={t("materiel.reglables.poignees")}
              valeur={String(poignees)}
              moinsOff={poignees <= 1}
              onMoins={() => setPoignees(Math.max(1, poignees - 1))}
              onPlus={() => setPoignees(poignees + 1)}
            />
            <PlusMoins
              libelle={t("materiel.reglables.poignee")}
              aide={t("materiel.reglables.poigneeAide")}
              valeur={nb(poignee)}
              unite={unite}
              moinsOff={poignee <= pas}
              onMoins={() => setPoignee(pousser(poignee, -pas, pas))}
              onPlus={() => setPoignee(pousser(poignee, pas))}
            />
          </Bloc>
          <Section titre={t("materiel.disques")} extra={t("materiel.enPaires")} />
          <LignesDisques disques={disques} unite={unite} courants={COURANTS_REGLABLES[unite]} onChange={setDisques} onAutre={() => setAutre(true)} />
          {r.deux.length ? <Resultat titre={etendue(r.deux, unite)} sous={t("materiel.reglables.deux")} /> : null}
          {r.un.length ? (
            <Resultat premier={!r.deux.length} titre={t("materiel.reglables.jusqua", { kg: nb(r.un[r.un.length - 1]!), unite })} sous={t("materiel.reglables.un")} />
          ) : null}
          {element && onRetirer ? <LienTexte libelle={t("materiel.retirer")} onPress={onRetirer} /> : null}
        </>
      )}
    </Feuille>
  );
}
