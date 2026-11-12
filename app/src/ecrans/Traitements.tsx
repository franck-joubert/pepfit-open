// Compléments (planche sante-suivi, D9) : la liste du jour par moment (cocher est facultatif ; un « si besoin » ne compte
// pas dans « 2 sur 3 »), puis En cours et Arrêtés ; balayer une ligne la supprime (Annuler). Hors du médical : que des
// compléments (les médicaments saisis avant ont été effacés par la migration 48, le 31/10).
// Le nom de l'écran, de la route et de la table restent (noms internes).
import { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  creerTraitement, listerTraitements, MOI, noterPrise, prisesEntre, purgerSupprimes, purgerTraitement, restaurerTraitement, retirerPrise, supprimerTraitement,
  type Traitement,
} from "../db";
import { parties } from "../i18n/temps";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { espace, police } from "../theme/typo";
import { BandeauAnnuler } from "../ui/BandeauAnnuler";
import { Bouton } from "../ui/Bouton";
import { BoutonIcone } from "../ui/Cadre";
import { ListeDesintegrable, marquerSuppression } from "../ui/Desintegration";
import { GlisserSupprimer } from "../ui/GlisserSupprimer";
import { Texte } from "../ui/Texte";
import { useApp, useCharge } from "./contexte";
import { jourDe } from "./planif-donnees";
import { arrete, compteJour, libelleMoment, listeDuJour, periode, resumeTraitement, sousTitrePrise } from "./suivi-calc";
import { FeuilleTexte } from "./suivi-feuilles";
import { Auteur, CasePrise, EcranSuivi, Filet, Groupe, Ligne, suppressionDemandee, styles as s, TitreGroupe, useAnnuler, useFondGroupe } from "./suivi-ui";

const UNE_MINUTE = 60_000;
const pad = (n: number) => String(n).padStart(2, "0");
/** HH:MM de maintenant, dans le fuseau de l'appli. */
export function heureMaintenant(): string {
  const p = parties(Date.now());
  return `${pad(p.h)}:${pad(p.min)}`;
}

export function Traitements() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom + espace.l;
  const fond = useFondGroupe();
  const auj = jourDe(Date.now());
  const [d, recharger] = useCharge(async (x) => {
    await purgerSupprimes(x, Date.now() - UNE_MINUTE);
    return { traitements: await listerTraitements(x), prises: await prisesEntre(x, auj, auj) };
  }, [auj]);
  const [nouveau, setNouveau] = useState(false);
  const annuler = useAnnuler({ supprimer: (id) => supprimerTraitement(db, id), restaurer: (id) => restaurerTraitement(db, id), purger: (id) => purgerTraitement(db, id) }, recharger);
  const supprimer = (x: Traitement) => annuler.supprimer(x.id, t("suivi.complementSupprime", { nom: x.nom })).catch(console.error);
  useFocusEffect(
    useCallback(() => {
      const x = suppressionDemandee.traitement;
      suppressionDemandee.traitement = null;
      if (!x) return;
      marquerSuppression(x.id);
      annuler.supprimer(x.id, t("suivi.complementSupprime", { nom: x.nom })).catch(console.error);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
  const ecrire = (p: Promise<unknown>) => p.then(recharger).catch(console.error);
  const ouvrir = (x: Traitement) => router.push({ pathname: "/traitements/[id]", params: { id: x.id } });
  const traitements = d?.traitements ?? [];
  const prises = d?.prises ?? [];
  const groupes = listeDuJour(traitements, prises, auj);
  const compte = compteJour(traitements, prises, auj);
  const enCours = traitements.filter((x) => !arrete(x, auj));
  const arretes = traitements.filter((x) => arrete(x, auj));

  const ligne = (x: Traitement, i: number, sous: string) => (
    <View>
      {i > 0 ? <Filet /> : null}
      <GlisserSupprimer fondContenu={fond} onSupprimer={() => supprimer(x)}>
        <Ligne
          titre={x.nom}
          sous={
            <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 1 }}>
              <Texte variante="meta" couleur="t2" numberOfLines={1} style={{ flexShrink: 1 }}>
                {sous}
                {x.auteur !== MOI ? ", " : ""}
              </Texte>
              {x.auteur !== MOI ? <Auteur auteur={x.auteur} /> : null}
            </View>
          }
          onPress={() => ouvrir(x)}
        />
      </GlisserSupprimer>
    </View>
  );

  return (
    <EcranSuivi
      titre={t("suivi.complements")}
      droite={<BoutonIcone nom="plus" libelle={t("suivi.ajouter")} onPress={() => setNouveau(true)} />}
      bas={annuler.enAttente ? <BandeauAnnuler texte={annuler.enAttente.texte} bas={bas} onAnnuler={() => annuler.annuler().catch(console.error)} /> : null}
    >
      {d ? (
        <>
          <TitreGroupe texte={t("suivi.aujourdhuiTitre")} droite={compte.prevus ? t("suivi.surN", compte) : undefined} />
          <Groupe>
            {groupes.length ? (
              groupes.map((g) => (
                <View key={g.moment ?? "-"}>
                  <Texte variante="meta" couleur="t2" style={{ fontFamily: police.medium, paddingHorizontal: espace.l, paddingTop: espace.m }}>
                    {libelleMoment(g.moment)}
                  </Texte>
                  {g.lignes.map(({ t: x, heure }, i) => (
                    <View key={x.id}>
                      {i > 0 ? <Filet /> : null}
                      <Ligne
                        titre={x.nom}
                        sous={sousTitrePrise(x)}
                        onPress={() => ouvrir(x)}
                        chevron={false}
                        valeur={
                          <View style={{ flexDirection: "row", alignItems: "center", gap: espace.m }}>
                            {heure ? (
                              <Texte variante="meta" style={{ color: couleurs.valide }}>
                                {heure}
                              </Texte>
                            ) : null}
                            <CasePrise
                              ok={heure != null}
                              libelle={heure ? `${x.nom}, ${t("suivi.priseNotee", { heure })}` : `${x.nom}, ${t("suivi.notePrise")}`}
                              onPress={() => ecrire(heure ? retirerPrise(db, x.id, auj) : noterPrise(db, x.id, auj, heureMaintenant()))}
                            />
                          </View>
                        }
                      />
                    </View>
                  ))}
                </View>
              ))
            ) : (
              <Ligne titre={t("suivi.aucunComplement")} chevron={false} />
            )}
          </Groupe>
          {groupes.length ? null : (
            // État vide utile : le message et l'action (le « + » du haut reste) ; tonal sous la carte, où il se détache.
            <View style={s.plein}>
              <Bouton large libelle={t("suivi.ajouterComplement")} onPress={() => setNouveau(true)} />
            </View>
          )}
          {/* Titre et groupe restent là tant qu'une ligne sort : la dernière supprimée se désintègre aussi. */}
          <ListeDesintegrable
            liste={enCours}
            cleDe={(x) => x.id}
            autour={(e) => (
              <>
                <TitreGroupe texte={t("suivi.enCours")} />
                <Groupe>{e}</Groupe>
              </>
            )}
            rendu={(x) => ligne(x, enCours.indexOf(x), resumeTraitement(x, auj))}
          />
          <ListeDesintegrable
            liste={arretes}
            cleDe={(x) => x.id}
            autour={(e) => (
              <>
                <TitreGroupe texte={t("suivi.arretes")} />
                <Groupe>{e}</Groupe>
              </>
            )}
            rendu={(x) => ligne(x, arretes.indexOf(x), periode(x))}
          />
        </>
      ) : null}
      <FeuilleTexte
        visible={nouveau}
        titre={t("suivi.nouveauComplement")}
        valeur=""
        indice={t("suivi.nom")}
        onFermer={() => setNouveau(false)}
        onValider={(nom) => {
          setNouveau(false);
          creerTraitement(db, { nom, debut: auj })
            .then((id) => router.push({ pathname: "/traitements/[id]", params: { id } }))
            .catch(console.error);
        }}
      />
    </EcranSuivi>
  );
}
