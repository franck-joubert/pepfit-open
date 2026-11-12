// Le plan du voyage (planche sommeil, c3) : trajet, préparer ou non, la frise à l'heure du lieu, ce soir, sur place.
// Saisi à la main (FeuilleVoyage) ou vu à l'arrivée (fuseau du téléphone).
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { villeDuFuseau } from "../../i18n/fuseaux";
import { lireDetecte, t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { rafraichirRappelCoucher } from "../../natif/rappel-coucher";
import { Segmente } from "../../ui/Segmente";
import { useApp, useCharge } from "../contexte";
import { ActionTete, BlocVide, BoutonPlein, Groupe, LigneMesure, Lignes, MARGE, Note, PageMesure, TitreGroupe } from "../mesures/gabarit";
import { TuileIcone } from "./BandeauHeure";
import { ecrireReglagesHeure, lireReglagesHeure, lireRythme } from "./donnees";
import { FeuilleVoyage } from "./FeuilleVoyage";
import { FriseVoyage, LegendeFrise } from "./FriseVoyage";
import { duree, heureMin, jourCourt, jourDans } from "./horloge";
import { Evenement } from "./PageChangementHeure";
import { GRAND_EST_MIN, type LigneVoyage, ligneVoyage, momentVoyage, planVoyage, type Voyage } from "./voyage";

export function PageVoyage() {
  useLangue();
  const { db } = useApp();
  const maintenant = useMemo(() => Date.now(), []);
  const [x, recharger] = useCharge(async (db) => ({ r: await lireReglagesHeure(db), rythme: await lireRythme(db, maintenant) }), [], undefined, "sommeil/voyage");
  const [feuille, setFeuille] = useState(false);
  const maison = x?.r.maison ?? lireDetecte().fuseau;
  const v = x?.r.voyage ?? null;
  const ecrire = async (voyage: Voyage | null) => {
    await ecrireReglagesHeure(db, { voyage });
    await recharger();
    void rafraichirRappelCoucher(db);
  };
  return (
    <PageMesure titre={t("heureVoyage.voyage")} actions={v ? <ActionTete nom="crayon" libelle={t("heureVoyage.modifier")} onPress={() => setFeuille(true)} /> : undefined}>
      {!x ? null : !v ? (
        <>
          <BlocVide titre={t("heureVoyage.aucunVoyageTitre")} texte={t("heureVoyage.aucunVoyageTexte")} />
          <BoutonPlein libelle={t("heureVoyage.ajouter")} onPress={() => setFeuille(true)} style={{ marginHorizontal: MARGE }} />
        </>
      ) : (
        <Plan v={v} rythme={x.rythme} maintenant={maintenant} onPreparer={(preparer) => void ecrire({ ...v, preparer })} />
      )}
      <FeuilleVoyage
        visible={feuille}
        voyage={v}
        maison={maison}
        aujourdhui={jourDans(maintenant, maison)}
        onFermer={() => setFeuille(false)}
        onEnregistrer={(n) => {
          setFeuille(false);
          void ecrire(n);
        }}
        onSupprimer={() => {
          setFeuille(false);
          void ecrire(null);
        }}
      />
    </PageMesure>
  );
}

function Plan({ v, rythme, maintenant, onPreparer }: { v: Voyage; rythme: Awaited<ReturnType<typeof lireRythme>>; maintenant: number; onPreparer: (p: boolean) => void }) {
  const ville = villeDuFuseau(v.destination);
  const p = rythme ? planVoyage(v, rythme) : null;
  const decalage = p?.decalage ?? 0;
  const quand = v.retour
    ? t("heureVoyage.quandAR", { aller: jourCourt(v.aller), retour: jourCourt(v.retour, { mois: true }) })
    : t("heureVoyage.quandDepuis", { aller: jourCourt(v.aller, { mois: true }) });
  const texte = p ? t(decalage < 0 ? "heureVoyage.versOuest" : "heureVoyage.versEst", { quand, d: duree(decalage) }) : quand;
  return (
    <>
      <Evenement titre={t("heureVoyage.trajet", { de: villeDuFuseau(v.origine), a: ville })} texte={texte} />
      {v.auto ? <Note style={{ marginHorizontal: MARGE }}>{t("heureVoyage.detecte")}</Note> : null}
      {!p ? (
        <BlocVide titre={t("heureVoyage.sansRythmeTitre")} texte={t("heureVoyage.sansRythmeTexte")} />
      ) : p.sousSeuil ? (
        <BlocVide titre={t("heureVoyage.sousSeuilTitre")} texte={t("heureVoyage.sousSeuilTexte")} />
      ) : p.court ? (
        <BlocVide titre={t("heureVoyage.courtTitre")} texte={t("heureVoyage.courtTexte")} />
      ) : (
        <>
          {!v.auto ? (
            <View style={{ marginTop: 16, marginHorizontal: MARGE }}>
              <Segmente
                doux
                options={[
                  { valeur: "oui", libelle: t("heureVoyage.preparer") },
                  { valeur: "non", libelle: t("heureVoyage.sansPreparer") },
                ]}
                valeur={v.preparer ? "oui" : "non"}
                onChange={(o) => onPreparer(o === "oui")}
              />
            </View>
          ) : null}
          <TitreGroupe>{t("heureVoyage.planLieu")}</TitreGroupe>
          <Groupe bloc>
            <FriseVoyage lignes={p.lignes} />
            <LegendeFrise />
          </Groupe>
          <CeSoir p={p} v={v} maintenant={maintenant} />
          <TitreGroupe>{t("heureVoyage.surPlace")}</TitreGroupe>
          <Groupe>
            <Lignes>
              {[
                <LigneMesure key="repas" avant={<TuileIcone nom="assiette" />} titre={t("heureVoyage.repasLieu", { ville })} sous={t("heureVoyage.repasLieuSous")} />,
                <LigneMesure key="sieste" avant={<TuileIcone nom="lune" />} titre={t("heureVoyage.siesteVoyage")} sous={t("heureVoyage.siesteVoyageSous")} />,
              ]}
            </Lignes>
          </Groupe>
          <Note style={{ marginHorizontal: MARGE }}>{t("heureVoyage.noteVoyage")}</Note>
        </>
      )}
    </>
  );
}

/** « Ce soir » : la ligne du jour (avant le départ, la première du plan, sous son jour). Le coucher mène au rappel (D15). */
function CeSoir({ p, v, maintenant }: { p: ReturnType<typeof planVoyage>; v: Voyage; maintenant: number }) {
  const moment = momentVoyage(v, p, maintenant);
  const jour = jourDans(maintenant, moment === "surPlace" ? v.destination : v.origine);
  const auj = ligneVoyage(p, jour);
  const l: LigneVoyage | undefined = auj ?? (moment === "avant" ? p.lignes[0] : undefined);
  if (!l) return null;
  const lever = heureMin(l.lever);
  const lignes = [
    <LigneMesure
      key="coucher"
      avant={<TuileIcone nom="lune" />}
      titre={t("heureVoyage.coucheVers", { heure: heureMin(l.coucher) })}
      onPress={() => router.push("/sante/rappel-coucher")}
      sous={l.ecart === 0 ? t("heureVoyage.coucheHabitude", { lever }) : t("heureVoyage.coucheSous", { ecart: t(l.ecart < 0 ? "heureVoyage.plusTot" : "heureVoyage.plusTard", { d: duree(l.ecart) }), lever })}
    />,
  ];
  if (l.lumiere) {
    const tard = !p.ouest && Math.abs(p.decalage) > GRAND_EST_MIN && l.lumiere[0] > l.lever;
    lignes.push(
      <LigneMesure
        key="lumiere"
        avant={<TuileIcone nom="soleil" />}
        titre={p.ouest ? t("heureVoyage.lumiereJusqua", { heure: heureMin(l.lumiere[1]) }) : t("heureVoyage.lumiereDe", { de: heureMin(l.lumiere[0]), a: heureMin(l.lumiere[1]) })}
        sous={t(p.ouest ? "heureVoyage.lumiereSoirSous" : tard ? "heureVoyage.lumiereTardSous" : "heureVoyage.lumiereMatinSous")}
      />,
    );
  }
  return (
    <>
      <TitreGroupe>{auj ? t("heureVoyage.ceSoir") : jourCourt(l.jour, { capitale: true, mois: true })}</TitreGroupe>
      <Groupe>
        <Lignes>{lignes}</Lignes>
      </Groupe>
    </>
  );
}
