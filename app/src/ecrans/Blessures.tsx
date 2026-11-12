// Blessures (planche sante-suivi, écran 1) : en cours puis passées ; balayer une ligne la supprime (« Blessure supprimée · Annuler »).
import { useCallback } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listerBlessures, MOI, purgerBlessure, purgerSupprimes, restaurerBlessure, supprimerBlessure, type BlessureListe } from "../db";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { espace } from "../theme/typo";
import { BandeauAnnuler } from "../ui/BandeauAnnuler";
import { Bouton } from "../ui/Bouton";
import { BoutonIcone } from "../ui/Cadre";
import { ListeDesintegrable, marquerSuppression } from "../ui/Desintegration";
import { GlisserSupprimer } from "../ui/GlisserSupprimer";
import { Texte } from "../ui/Texte";
import { useApp, useCharge } from "./contexte";
import { dateCourte, enCoursEtPassees, nomZone } from "./suivi-calc";
import { Auteur, Carre, EcranSuivi, Filet, Groupe, Ligne, Statut, suppressionDemandee, styles as s, TitreGroupe, useAnnuler, useFondGroupe } from "./suivi-ui";

const UNE_MINUTE = 60_000;

export function Blessures() {
  useLangue();
  const { db } = useApp();
  const bas = useSafeAreaInsets().bottom + espace.l;
  const fond = useFondGroupe();
  const [liste, recharger] = useCharge(async (d) => {
    await purgerSupprimes(d, Date.now() - UNE_MINUTE);
    return listerBlessures(d);
  });
  const annuler = useAnnuler({ supprimer: (id) => supprimerBlessure(db, id), restaurer: (id) => restaurerBlessure(db, id), purger: (id) => purgerBlessure(db, id) }, recharger);
  // « Supprimer la blessure » dans la fiche : la même suite ici, au retour.
  useFocusEffect(
    useCallback(() => {
      const id = suppressionDemandee.blessure;
      suppressionDemandee.blessure = null;
      if (!id) return;
      marquerSuppression(id);
      annuler.supprimer(id, t("suivi.blessureSupprimee")).catch(console.error);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
  const { enCours, passees } = enCoursEtPassees(liste ?? []);
  const ouvrir = (b: BlessureListe) => router.push({ pathname: "/blessures/[id]", params: { id: b.id } });

  const ligne = (b: BlessureListe, i: number, passee: boolean) => {
    // Titre par défaut = la zone : on ne la répète pas dessous.
    const zone = nomZone(b.zone, b.cote);
    const zoneSous = zone === b.titre ? null : zone;
    const ia = b.auteur !== MOI;
    return (
      <View>
        {i > 0 ? <Filet /> : null}
        <GlisserSupprimer fondContenu={fond} onSupprimer={() => annuler.supprimer(b.id, t("suivi.blessureSupprimee")).catch(console.error)}>
          <Ligne
            avant={<Carre statut={b.statut} />}
            titre={b.titre}
            sous={
              passee ? (
                `${zoneSous ? `${zoneSous}, ` : ""}${dateCourte(b.debut)} → ${dateCourte(b.depuis)}`
              ) : zoneSous || ia ? (
                <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 1 }}>
                  {zoneSous ? (
                    <Texte variante="meta" couleur="t2" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {zoneSous}
                      {ia ? ", " : ""}
                    </Texte>
                  ) : null}
                  {ia ? <Auteur auteur={b.auteur} /> : null}
                </View>
              ) : undefined
            }
            valeur={<Statut statut={b.statut} />}
            sousValeur={passee ? undefined : t("suivi.depuisLe", { date: dateCourte(b.depuis) })}
            onPress={() => ouvrir(b)}
            libelle={zoneSous ? `${b.titre}, ${zoneSous}` : b.titre}
          />
        </GlisserSupprimer>
      </View>
    );
  };

  return (
    <EcranSuivi
      titre={t("suivi.blessures")}
      droite={<BoutonIcone nom="plus" libelle={t("suivi.ajouterBlessure")} onPress={() => router.push("/blessures/zone")} />}
      bas={annuler.enAttente ? <BandeauAnnuler texte={annuler.enAttente.texte} bas={bas} onAnnuler={() => annuler.annuler().catch(console.error)} /> : null}
    >
      {liste ? (
        <>
          <TitreGroupe texte={t("suivi.enCours")} />
          <Groupe>
            {/* « Aucune blessure » une fois la dernière sortie (désintégrée), pas avant. */}
            <ListeDesintegrable
              liste={enCours}
              cleDe={(b) => b.id}
              vide={<Ligne titre={t("suivi.aucuneBlessure")} sous={undefined} chevron={false} />}
              rendu={(b) => ligne(b, enCours.indexOf(b), false)}
            />
          </Groupe>
          {enCours.length ? null : (
            // État vide utile : le message et l'action (le « + » du haut reste) ; tonal sous la carte, où il se détache.
            <View style={s.plein}>
              <Bouton large libelle={t("suivi.ajouterBlessure")} onPress={() => router.push("/blessures/zone")} />
            </View>
          )}
          <ListeDesintegrable
            liste={passees}
            cleDe={(b) => b.id}
            autour={(e) => (
              <>
                <TitreGroupe texte={t("suivi.passees")} />
                <Groupe>{e}</Groupe>
              </>
            )}
            rendu={(b) => ligne(b, passees.indexOf(b), true)}
          />
        </>
      ) : null}
    </EcranSuivi>
  );
}
