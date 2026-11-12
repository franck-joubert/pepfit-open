// Réglages d'une partie (planche menu, b-contextuel ; NOTES § 9) : les curseurs de l'en-tête de Nutrition, Sport et Santé
// ouvrent une feuille avec les seuls réglages de la partie, puis « Tous les réglages » ; depuis Réglages › Par partie, le même
// contenu s'ouvre en page pleine, sans « Tous les réglages » (D21). Une ligne au plus mène à un réglage global et le dit en
// gris (« Connexions », D16). Le Fil garde sa page « Ton fil » ; l'Accueil, son mode Modifier (D18).
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ecrireReglage, lireObjectif, lireReglage, lireReglagesPlanif, lireZonesFc, listerRepas } from "../../db";
import { lireReglagesAgenda } from "../../agenda/depot";
import { heureDe } from "../../agenda/synchro";
import { etatFitatu } from "../../fitatu";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import * as natif from "../../natif/agenda";
import { rafraichirRappelsRepas } from "../../natif/rappels-repas";
import { suivi } from "../../natif/suivi";
import { kcalObjectif } from "../../nutrition/calculs";
import { useTheme } from "../../theme";
import { espace } from "../../theme/typo";
import { BoutonIcone } from "../../ui/Cadre";
import { Feuille } from "../../ui/Feuille";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { Appui } from "../../ui/mouvement";
import type { AlerteRepos } from "../alerte-repos";
import { useApp, useCharge } from "../contexte";
import { lireMethode } from "../energie-calc";
import { FeuilleBatterie } from "../FeuilleBatterie";
import { rappelCourt } from "../FeuillesPlanif";
import { approx, dureeRepos, nombre } from "../format";
import { BoutonLigne, GroupeReglages, LigneReglage, SectionReglages, SousEtat } from "../Reglage";
import { REGLAGES_ENERGIE } from "../sante-donnees";
import { lireReglagesCycle } from "../../cycle/donnees";
import { villeDuFuseau } from "../../i18n/fuseaux";
import { lireReglagesHeure } from "../heure-voyage/donnees";
import { duree, jourCourt } from "../heure-voyage/horloge";
import type { PartieReglee } from "./inventaire";

export const LIBELLE_FIN: Record<AlerteRepos, Parameters<typeof t>[0]> = { vibration: "profil.vibration", son: "profil.son", "les-deux": "profil.lesDeux", rien: "profil.rien" };

/** Nom de la partie, tel que dans le menu du bas. */
export const NOM_PARTIE: Record<PartieReglee, Parameters<typeof t>[0]> = { nutrition: "ui.onglet.nutrition", sport: "ui.onglet.entrainement", sante: "ui.onglet.sante" };

/** « Réglages de Nutrition », « Réglages d'Effort » (l'élision : « de Effort » n'existe pas) ; en anglais « Effort settings ». */
export function titreReglagesPartie(partie: PartieReglee): string {
  return partie === "sport" ? t("menu.reglagesEffort") : t("menu.reglagesDe", { partie: t(NOM_PARTIE[partie]) });
}

type Props = {
  /** Ouvre une route (dans la feuille : la ferme d'abord). */
  aller: (route: string) => void;
  /** Surface des groupes : feuilleGroupe dans la feuille, s1 sur une page. */
  fond?: string;
  /** Dans une feuille : les groupes prennent la largeur de la feuille (elle a déjà sa marge de 16). */
  dansFeuille?: boolean;
};

export function ContenuReglagesPartie({ partie, ...p }: Props & { partie: PartieReglee }) {
  useLangue();
  if (partie === "nutrition") return <ReglagesNutrition {...p} />;
  if (partie === "sport") return <ReglagesSport {...p} />;
  return <ReglagesSante {...p} />;
}

const styleGroupe = (dansFeuille?: boolean) => (dansFeuille ? { marginHorizontal: 0 } : null);

/** Fin d'une ligne qui mène à un réglage global : où elle mène, en gris, puis le chevron (D16). */
function Ailleurs({ texte }: { texte: string }) {
  return (
    <Texte variante="corps" couleur="t3" style={{ fontSize: 13 }}>
      {texte}
    </Texte>
  );
}

function ReglagesNutrition({ aller, fond, dansFeuille }: Props) {
  const { db } = useApp();
  const [n, relire] = useCharge(async (d) => {
    const [objectif, repas, rappel, delai, fitatu] = await Promise.all([
      lireObjectif(d, "entrainement"), listerRepas(d), lireReglage(d, "nutri_rappel"), lireReglage(d, "nutri_rappel_delai"), etatFitatu(d).catch(() => null),
    ]);
    return { kcal: kcalObjectif(objectif), repas: repas.length, rappel: rappel === "1", delai: Number(delai) || 30, fitatu };
  }, []);
  const rappeler = (v: boolean) =>
    ecrireReglage(db, "nutri_rappel", v ? "1" : "0")
      .then(relire)
      .then(() => rafraichirRappelsRepas(db, { demander: true }))
      .catch(console.error);
  const f = n?.fitatu;
  return (
    <>
      <GroupeReglages fond={fond} style={styleGroupe(dansFeuille)}>
        <LigneReglage libelle={t("nutrition.objectifs")} sous={n ? approx(`${nombre(n.kcal, 0)} ${t("nutrition.kcal")}`) : undefined} onPress={() => aller("/nutrition/objectifs")} />
        <LigneReglage libelle={t("nutrition.repasHoraires")} sous={n ? tp("menu.nbRepas", n.repas) : undefined} onPress={() => aller("/nutrition/repas")} />
        <LigneReglage
          libelle={t("nutrition.rappelRepas")}
          sous={n?.rappel ? t("menu.minAvant", { duree: rappelCourt(n.delai) }) : undefined}
          interrupteur={{ valeur: !!n?.rappel, onChange: rappeler }}
          onPress={() => rappeler(!n?.rappel)}
        />
      </GroupeReglages>
      <GroupeReglages fond={fond} style={[styleGroupe(dansFeuille), { marginTop: espace.m }]}>
        <LigneReglage
          libelle={t("reglages.fitatu")}
          sous={f?.connecte ? <SousEtat actif={!f.erreur} texte={t(f.erreur ? "fitatu.erreur.serveur" : "fitatu.connecteEnCours")} /> : t("reglages.fitatuSous")}
          fin="chevron"
          onPress={() => aller("/settings/fitatu")}
        >
          <Ailleurs texte={t("menu.connexions")} />
        </LigneReglage>
      </GroupeReglages>
    </>
  );
}

function ReglagesSport({ aller, fond, dansFeuille }: Props) {
  const { reglages, regler } = useApp();
  const [planif] = useCharge(lireReglagesPlanif, []);
  const [batterie, relireBatterie] = useCharge(() => suivi.batterie().catch(() => null), []);
  const [aideBatterie, setAideBatterie] = useState(false);
  const [agenda] = useCharge(ligneAgenda, []);
  return (
    <>
      {/* Page du jour (planche Effort v2.2, D9) : le Sommeil masqué par son « … » se réaffiche ici ; réglage de l'appareil, la lecture
          du sommeil continue même éteint. */}
      <SectionReglages premiere titre={t("effortJour.pageDuJour")} style={dansFeuille ? styles.sectionFeuille : undefined} />
      <GroupeReglages fond={fond} style={styleGroupe(dansFeuille)}>
        <LigneReglage
          libelle={t("effortJour.afficherSommeil")}
          sous={t("effortJour.afficherSommeilSous")}
          interrupteur={{ valeur: reglages.sommeilAffiche, onChange: (v) => regler({ sommeilAffiche: v }) }}
          onPress={() => regler({ sommeilAffiche: !reglages.sommeilAffiche })}
        />
      </GroupeReglages>
      <SectionReglages titre={t("profil.seance")} style={dansFeuille ? styles.sectionFeuille : undefined} />
      <GroupeReglages fond={fond} style={styleGroupe(dansFeuille)}>
        <LigneReglage libelle={t("menu.repos")} sous={`${dureeRepos(reglages.reposDefautS)}, ${t(LIBELLE_FIN[reglages.alerteRepos])}`} onPress={() => aller("/settings/repos")} />
        <LigneReglage libelle={t("reglages.guidage.titre")} sous={`${reglages.tempos.poly}, ${reglages.tempos.isolation}`} onPress={() => aller("/settings/guidage")} />
        <LigneReglage libelle={t("profil.ecranAllume")} interrupteur={{ valeur: reglages.ecranAllume, onChange: (v) => regler({ ecranAllume: v }) }} onPress={() => regler({ ecranAllume: !reglages.ecranAllume })} />
        <LigneReglage libelle={t("reglages.manques.titre")} sous={t("reglages.manques.sous")} onPress={() => aller("/settings/exercices-sans-picto")} />
        <LigneReglage libelle={t("profil.unRm")} interrupteur={{ valeur: reglages.unRmSeance, onChange: (v) => regler({ unRmSeance: v }) }} onPress={() => regler({ unRmSeance: !reglages.unRmSeance })} />
        <LigneReglage
          libelle={t("profil.demanderEffort")}
          sous={t("profil.demanderEffortSous")}
          interrupteur={{ valeur: reglages.demanderEffort, onChange: (v) => regler({ demanderEffort: v }) }}
          onPress={() => regler({ demanderEffort: !reglages.demanderEffort })}
        />
      </GroupeReglages>
      <SectionReglages titre={t("menu.rappelsDetection")} style={dansFeuille ? styles.sectionFeuille : undefined} />
      <GroupeReglages fond={fond} style={styleGroupe(dansFeuille)}>
        <LigneReglage
          libelle={t("menu.rappel")}
          sous={planif ? `${planif.heureDefaut}, ${t("reglages.avant", { duree: rappelCourt(planif.rappelDefautMin) })}` : undefined}
          onPress={() => aller("/settings/rappel")}
        />
        <LigneReglage libelle={t("reco.titre")} onPress={() => aller("/settings/reconnaissance")} />
        {/* Batterie (D5, Android seulement) : écran éteint, FC et GPS tiennent si pepfit est « Non restreinte ». */}
        {batterie ? (
          <LigneReglage libelle={t("reglages.batterie")} sous={<SousEtat actif={!batterie.optimisee} texte={t(batterie.optimisee ? "reglages.batterieOptimisee" : "reglages.batterieLibre")} />}>
            {batterie.optimisee ? <BoutonLigne libelle={t("reglages.regler")} onPress={() => setAideBatterie(true)} /> : null}
          </LigneReglage>
        ) : null}
      </GroupeReglages>
      {/* Agenda (planche agenda-ics, 1a et 3x) : entre la détection et Hevy ; l'agenda du téléphone. */}
      <SectionReglages titre={t("agenda.titre")} style={dansFeuille ? styles.sectionFeuille : undefined} />
      <GroupeReglages fond={fond} style={styleGroupe(dansFeuille)}>
        <LigneReglage
          libelle={t("agenda.titre")}
          sous={agenda || undefined}
          onPress={() => aller("/settings/agenda")}
        />
      </GroupeReglages>
      <GroupeReglages fond={fond} style={[styleGroupe(dansFeuille), { marginTop: espace.m }]}>
        <LigneReglage libelle={t("reglages.hevy")} sous={t("reglages.hevySous")} fin="chevron" onPress={() => aller("/settings/connexions")}>
          <Ailleurs texte={t("menu.connexions")} />
        </LigneReglage>
      </GroupeReglages>
      <FeuilleBatterie
        visible={aideBatterie}
        onFermer={() => {
          setAideBatterie(false);
          relireBatterie().catch(console.error);
        }}
      />
    </>
  );
}

/** Sous-ligne « Agenda » (1x, 3x) : pas connecté, connecté (à jour à…), accès refusé dans Android. */
async function ligneAgenda(db: Parameters<typeof lireReglagesAgenda>[0]): Promise<string> {
  const [r, acces] = await Promise.all([lireReglagesAgenda(db), natif.lireAcces().catch(() => "indisponible" as const)]);
  if (!r.connecte) return t("agenda.ligne.pasConnecte");
  if (acces === "refuse" || acces === "aDemander") return t("agenda.ligne.refuse");
  return r.maj ? t("agenda.ligne.connecte", { heure: heureDe(r.maj) }) : t("agenda.ligne.connecteSeul");
}

function ReglagesSante({ aller, fond, dansFeuille }: Props) {
  const [s] = useCharge(async (d) => {
    const [zones, methode, cycle, heure] = await Promise.all([
      lireZonesFc(d).catch(() => null), lireReglage(d, REGLAGES_ENERGIE.methode), lireReglagesCycle(d).catch(() => null), lireReglagesHeure(d).catch(() => null),
    ]);
    return { fcMax: zones?.fcMax.bpm ?? null, methode: lireMethode(methode), cycle: cycle?.suivi ?? null, heure };
  }, []);
  const h = s?.heure;
  return (
    <GroupeReglages fond={fond} style={styleGroupe(dansFeuille)}>
      <LigneReglage libelle={t("zones.titre")} sous={s?.fcMax ? t("menu.fcMax", { n: nombre(s.fcMax, 0) }) : undefined} onPress={() => aller("/settings/zones")} />
      <LigneReglage libelle={t("sante.methodeMetabolisme")} sous={s ? t(`sante.methode.${s.methode}`) : undefined} onPress={() => aller("/sante/metabolisme")} />
      {/* Suivi du cycle (planche cycle, écran 9 ; place de planches/menu/NOTES.md § 10) ; les rappels de sieste viendront dessous. */}
      <LigneReglage
        libelle={t("cycle.reglages.titre")}
        sous={s && s.cycle != null ? t(s.cycle ? "cycle.reglages.active" : "cycle.reglages.desactive") : undefined}
        onPress={() => aller("/settings/cycle")}
      />
      {/* Sommeil (planche sommeil, c3 et c4) : le rappel de coucher, éteint par défaut (D15), et le voyage en cours. */}
      <LigneReglage
        libelle={t("heureVoyage.rappel")}
        sous={h ? (h.rappel ? t("heureVoyage.reglageAvant", { d: duree(h.avant) }) : t("heureVoyage.reglageEteint")) : undefined}
        onPress={() => aller("/sante/rappel-coucher")}
      />
      <LigneReglage
        libelle={t("heureVoyage.voyage")}
        sous={h ? (h.voyage ? t("heureVoyage.reglageVoyage", { ville: villeDuFuseau(h.voyage.destination), quand: jourCourt(h.voyage.aller, { mois: true }) }) : t("heureVoyage.reglageAucun")) : undefined}
        onPress={() => aller("/sante/voyage")}
      />
    </GroupeReglages>
  );
}

/**
 * Curseurs de l'en-tête d'une partie (D13 : l'icône « réglages d'un écran » du Fil), à droite du calendrier, en t2 (D22),
 * zone de 44 (BoutonIcone). Ils ouvrent la feuille « Réglages de Nutrition » ; on la ferme d'un glissé ou par Retour.
 */
export function BoutonReglagesPartie({ partie }: { partie: PartieReglee }) {
  useLangue();
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <BoutonIcone nom="curseurs" libelle={titreReglagesPartie(partie)} onPress={() => setOuvert(true)} />
      <FeuilleReglagesPartie partie={partie} visible={ouvert} onFermer={() => setOuvert(false)} />
    </>
  );
}

function FeuilleReglagesPartie({ partie, visible, onFermer }: { partie: PartieReglee; visible: boolean; onFermer: () => void }) {
  const { couleurs } = useTheme();
  const aller = (route: string) => {
    onFermer();
    router.push(route as never);
  };
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={titreReglagesPartie(partie)}>
      <View>
        {visible ? <ContenuReglagesPartie partie={partie} aller={aller} fond={couleurs.feuilleGroupe} dansFeuille /> : null}
        <TousLesReglages onPress={() => aller("/settings")} />
      </View>
    </Feuille>
  );
}

/** « Tous les réglages › » : ferme chaque feuille de partie (centré, 14/500 t2, zone de 48). */
function TousLesReglages({ onPress }: { onPress: () => void }): ReactNode {
  const { couleurs } = useTheme();
  return (
    <Appui accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.tous, pressed && { backgroundColor: couleurs.s2 }]}>
      <Texte variante="libelle" couleur="t2" style={{ fontFamily: "Inter-Medium" }}>
        {t("menu.tous")}
      </Texte>
      <Icone nom="right" couleur={couleurs.t3} taille={16} />
    </Appui>
  );
}

const styles = StyleSheet.create({
  sectionFeuille: { paddingHorizontal: espace.l, paddingTop: espace.l },
  tous: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.xs, minHeight: 48, marginTop: espace.m, borderRadius: 12 },
});
