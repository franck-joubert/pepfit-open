import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { lireSport } from "../../db/depots/suivi-gps";
import type { Sport } from "../../db/depots/lanceur";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { suivi } from "../../natif/suivi";
import { useTheme } from "../../theme";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { surActivitesChangees } from "../activites-evenement";
import { useApp, useCharge } from "../contexte";
import { heureTexte, jourSemaineMois } from "../format";
import { MUSCULATION } from "../lanceur-sports";
import { SuiviDepart } from "../SuiviDepart";
import { instantDe, jourDe } from "../planif-donnees";
import { ouvrirParcours } from "../parcours/demande-parcours";
import { lireRecap, type DonneesRecap } from "./donnees-recap";
import { ajouterAuxRoutines, annulerSerie, annulerSeule } from "./gestes-recap";
import { actionsMenu, annulerDemandeSerie, departDuRecap, quandDepart } from "./recap-calc";

// Porte d'entrée de toute séance (planche ajout-seance-v2, D1) : la séance perso, la routine, la séance prévue, celle du coach ou
// d'un programme, ou un sport du moment. Cette page n'a plus de récap à halo (retour du 06 et du 07/11 : un seul écran de
// lancement) : elle lit la séance et montre l'écran de lancement noir (SuiviDepart), sans halo, avec la date d'une séance prévue et
// le ⋯ (Modifier, Ajouter à mes routines, Annuler : seulement pour une séance prévue). Un sport au suivi GPS ou une routine de
// course y lance le suivi ; la musculation, une routine d'exercices ou un programme de force y lancent la séance au chrono, sans
// GPS, avec leurs exercices, le lieu et les capteurs (FC en direct, écran toujours allumé) à régler avant de démarrer.

const jourTexte = (j: string) => jourSemaineMois(instantDe(j, "12:00"));

export function EcranRecap() {
  useLangue();
  const { db } = useApp();
  const p = useLocalSearchParams<{ seance?: string; routineId?: string; sport?: string; salleId?: string }>();
  const [r, recharger] = useCharge<DonneesRecap | null>(
    (d) => lireRecap(d, { seance: p.seance, routineId: p.routineId, sport: p.sport, ...(p.salleId !== undefined ? { salleId: p.salleId || null } : {}) }),
    [p.seance, p.routineId, p.sport, p.salleId],
  );
  // Modifier, une activité détectée… : la séance se relit au retour et quand la journée change.
  useFocusEffect(useCallback(() => void recharger().catch(console.error), [recharger]));
  useEffect(() => surActivitesChangees(() => void recharger().catch(console.error)), [recharger]);

  const [menu, setMenu] = useState(false);
  const [choix, setChoix] = useState(false);
  // Annulée depuis ce récap : la page se ferme, la bulle « Rétablir » paraît sur la page Sport.
  const fermer = () => (router.canGoBack() ? router.back() : router.replace("/train"));

  // Le sport de l'écran de lancement se lit dans la base (undefined : pas encore lu, null : inconnu du catalogue).
  const depart = r
    ? departDuRecap({
        suiviDisponible: suivi.disponible,
        routineId: r.routineId,
        lignes: r.tiroir?.routine.blocs.flatMap((b) => b.lignes).length ?? 0,
        typeRoutine: r.tiroir?.routine.type ?? null,
        sport: r.sport,
      })
    : null;
  const idSportDepart = r && depart ? (depart.mode === "suivi" ? depart.sport : (r.sport ?? MUSCULATION)) : null;
  const [sportDepart, setSportDepart] = useState<Sport | null | undefined>(undefined);
  useEffect(() => {
    setSportDepart(undefined);
    if (!idSportDepart) return;
    let vivant = true;
    lireSport(db, idSportDepart).then((x) => vivant && setSportDepart(x), () => vivant && setSportDepart(null));
    return () => {
      vivant = false;
    };
  }, [db, idSportDepart]);

  if (r === undefined) return null;
  if (r === null) {
    // La séance ou la routine n'existe plus (annulée sur un autre appareil) : retour sans bruit.
    setTimeout(fermer, 0);
    return null;
  }

  const auj = jourDe(Date.now());
  const actions = actionsMenu({ prevue: r.prevue != null, contenuPropre: r.contenuPropre });
  const onMenu = actions.length ? () => setMenu(true) : undefined;

  const annuler = () => {
    setMenu(false);
    if (!r.prevue) return;
    if (annulerDemandeSerie(r.prevue)) return setChoix(true);
    annulerSerie(db, r.prevue, t("ps.annulee")).then(fermer).catch(signalerErreur());
  };

  // Le sport se lit en un instant : en attendant, le fond de l'écran de lancement (jamais un halo qui disparaîtrait aussitôt).
  // Un sport inconnu du catalogue se lance comme une séance d'exercices, sous le nom de la séance.
  const sport = sportDepart === null && idSportDepart ? { id: idSportDepart, nom: r.nom, slug: null } : sportDepart;
  const seance = depart?.mode === "suivi" && sportDepart ? null : r;
  const ecran = sport ? (
    <SuiviDepart
      sport={sport}
      salleId={r.lieu.id}
      routineId={depart?.mode === "suivi" ? depart.routineId : null}
      seance={seance}
      quand={quandDepart({ prevue: r.prevue != null, jour: r.jour, heure: r.heure }, auj, jourTexte, heureTexte)}
      onMenu={onMenu}
    />
  ) : (
    <FondDepart />
  );

  return (
    <>
      {ecran}
      <Feuille visible={menu} onFermer={() => setMenu(false)}>
        <Groupe>
          {actions.includes("modifier") ? (
            <Option
              premier
              icone="crayon"
              libelle={t("ps.modifier")}
              onPress={() => {
                setMenu(false);
                if (p.seance) ouvrirParcours({ genre: "modifier", seance: r.prevue ? `${r.prevue.programmationId}|${r.prevue.dateOrigine}` : p.seance });
              }}
            />
          ) : null}
          {actions.includes("ajouterRoutines") && r.routineId ? (
            <Option
              icone="routine"
              libelle={t("planif.ajouterAMesRoutines")}
              onPress={() => {
                setMenu(false);
                ajouterAuxRoutines(db, r.routineId!, r.nom).catch(console.error);
              }}
            />
          ) : null}
        </Groupe>
        <Groupe>
          <Option premier danger icone="close" libelle={t("ps.annulerSeance")} onPress={annuler} />
        </Groupe>
      </Feuille>
      <Feuille visible={choix} onFermer={() => setChoix(false)} titre={t("ps.annulerNom", { nom: r.nom })} sousTitre={r.jour ? jourTexte(r.jour) : undefined}>
        <Groupe>
          <Option
            premier
            libelle={t("planif.seuleSeance")}
            onPress={() => {
              setChoix(false);
              if (r.prevue) annulerSeule(db, r.prevue).then(fermer).catch(signalerErreur());
            }}
          />
          <Option
            danger
            libelle={t("planif.touteSerie")}
            onPress={() => {
              setChoix(false);
              if (r.prevue) annulerSerie(db, r.prevue, t("planif.serieRetiree")).then(fermer).catch(signalerErreur());
            }}
          />
        </Groupe>
      </Feuille>
    </>
  );
}

/** Le fond de l'écran de départ, le temps de lire son sport (un instant) : pas de halo qui disparaîtrait aussitôt. */
function FondDepart() {
  const { couleurs } = useTheme();
  return <View style={{ flex: 1, backgroundColor: couleurs.bg }} />;
}
