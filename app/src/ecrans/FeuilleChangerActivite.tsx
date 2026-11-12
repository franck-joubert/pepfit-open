// « Changer d'activité » (planche activite-detectee § 5, validée le 29/10) : sur la fiche de n'importe quelle séance, les
// tuiles du lanceur (l'activité actuelle marquée), puis « Ce qui change » avant d'enregistrer : ce qui reste (séries, tracé,
// FC), ce qui suit le sport (titre, distance en vitesse ou en allure, VMA, effort et dépense estimés).
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { espace, rayon } from "../theme/typo";
import { BoutonPrincipal } from "../ui/Degrade";
import { Feuille } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { Texte } from "../ui/Texte";
import { changerActivite, lireSeanceAChanger, type SeanceLue } from "../db/depots/activites";
import { familleSeance, MUSCULATION, planChangement, type Activite } from "./changer-activite";
import { effetsChangement } from "./activites-vue";
import { ChoixSports, EnTeteFeuille } from "./ActiviteDetectee";
import { activitesChangees } from "./activites-evenement";
import { useApp } from "./contexte";
import { heure, jourSemaineMois } from "./format";
import { bmrA } from "./sante-donnees";

export function FeuilleChangerActivite({
  seanceId,
  visible,
  onFermer,
  onChange,
}: {
  seanceId: string;
  visible: boolean;
  onFermer: () => void;
  /** Le sport a changé : la fiche se relit. */
  onChange: () => void;
}) {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const [s, setS] = useState<SeanceLue | null>(null);
  const [choisi, setChoisi] = useState<Activite | null>(null);
  const [corps, setCorps] = useState<{ kg: number | null; bmrKcal: number | null }>({ kg: null, bmrKcal: null });
  useEffect(() => {
    if (!visible) return;
    setChoisi(null);
    let vivant = true;
    (async () => {
      const l = await lireSeanceAChanger(db, seanceId);
      const p = await db.getFirstAsync<{ kg: number }>("SELECT kg FROM pesee ORDER BY date DESC LIMIT 1", []);
      const bmr = l ? await bmrA(db, l.debut).catch(() => null) : null;
      if (!vivant) return;
      setS(l);
      setCorps({ kg: p?.kg ?? null, bmrKcal: bmr });
    })().catch(console.error);
    return () => {
      vivant = false;
    };
  }, [visible, db, seanceId]);
  const actuel = s?.activite?.id ?? (s && familleSeance(s) === "muscu" ? MUSCULATION : null);
  const plan = s && choisi ? planChangement(s, choisi) : null;
  const effets =
    s && choisi && plan && !plan.inchange
      ? effetsChangement(plan, { titre: s.titre, debut: s.debut, fin: s.fin, distanceM: s.distanceM, de: s.activite?.id ?? null, vers: choisi.id }, corps)
      : [];
  const sous = s ? `${s.titre ?? s.activite?.nom ?? ""}, ${jourSemaineMois(s.debut)}, ${heure(s.debut)}` : undefined;
  const enregistrer = async () => {
    if (!choisi) return;
    await changerActivite(db, seanceId, choisi);
    onFermer();
    onChange();
    activitesChangees();
  };
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("activite.changerActivite")}
      sousTitre={sous}
      pied={
        <BoutonPrincipal
          libelle={choisi && !plan?.inchange ? t("activite.enregistrer", { sport: choisi.nom }) : t("activite.choisis")}
          desactive={!choisi || !!plan?.inchange}
          onPress={() => enregistrer().catch(console.error)}
        />
      }
    >
      <ChoixSports choisi={choisi} actuel={actuel} onChoisir={setChoisi} />
      {effets.length ? (
        <>
          <EnTeteFeuille texte={t("activite.ceQuiChange")} />
          <View style={[styles.groupe, { backgroundColor: couleurs.feuilleGroupe }]}>
            {effets.map((e, i) => (
              <View key={e.titre} style={[styles.effet, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line }]}>
                <Icone nom={e.icone} couleur={e.reste ? couleurs.valide : couleurs.t2} epaisseur={e.reste ? 2.25 : undefined} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Texte variante="saisie" style={{ fontSize: 15 }}>
                    {e.titre}
                  </Texte>
                  <Texte variante="meta" couleur="t3">
                    {e.sous}
                  </Texte>
                </View>
                {e.valeur ? (
                  <Texte variante="corps" style={{ fontSize: 14 }}>
                    {e.valeur}
                  </Texte>
                ) : null}
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Feuille>
  );
}

const styles = StyleSheet.create({
  groupe: { borderRadius: rayon.l, overflow: "hidden" },
  effet: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l, paddingVertical: espace.s },
});
