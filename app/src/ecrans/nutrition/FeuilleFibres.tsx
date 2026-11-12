import { useEffect, useState } from "react";
import { departFibres, FIBRES } from "../../nutrition/fibres-eau";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille } from "../../ui/Feuille";
import { Segmente } from "../../ui/Segmente";
import { Texte } from "../../ui/Texte";

// Feuille d'activation des fibres (planche Fibres et eau, D2 « montée douce ») : l'interrupteur de la page Objectifs l'ouvre au lieu
// d'allumer le suivi. Elle propose de commencer à 20, 25 ou 30 g ; la présélection part de la moyenne des 14 derniers jours plus 5 g,
// entre 15 et 30. La fermer laisse le suivi coupé : rien n'est imposé.

export function FeuilleFibres({
  visible,
  moyenne14,
  onFermer,
  onSuivre,
}: {
  visible: boolean;
  /** Fibres moyennes par jour sur les 14 derniers jours (g), ou null sans historique. */
  moyenne14: number | null;
  onFermer: () => void;
  /** L'objectif de départ choisi (g) : l'écran allume le suivi et l'enregistre. */
  onSuivre: (objectifG: number) => void;
}) {
  useLangue();
  const depart = departFibres(moyenne14);
  const [choix, setChoix] = useState<number>(depart);
  useEffect(() => {
    if (visible) setChoix(departFibres(moyenne14));
  }, [visible, moyenne14]);

  const options = FIBRES.departsG.map((g) => ({
    valeur: String(g),
    libelle: t("fibres.grammes", { n: g }),
    sous: g === FIBRES.departsG[0] ? t("fibres.activer.depart") : g === FIBRES.defautG ? t("fibres.activer.repere") : undefined,
  }));

  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("fibres.suivre")}
      pied={<BoutonPrincipal libelle={t("fibres.suivre")} onPress={() => onSuivre(choix)} />}
    >
      <Texte variante="corps" style={{ fontSize: 15, lineHeight: 22 }}>
        {t("fibres.activer.texte", { g: FIBRES.defautG })}
      </Texte>
      <Segmente options={options} valeur={String(choix)} onChange={(v) => setChoix(Number(v))} />
      <Texte variante="meta" couleur="t3" style={{ lineHeight: 18 }}>
        {moyenne14 == null
          ? t("fibres.activer.sansHistorique", { depart })
          : t("fibres.activer.moyenne", { n: Math.round(moyenne14), depart })}
      </Texte>
    </Feuille>
  );
}
