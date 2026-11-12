import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { lireSeance, lireSuiviLance, seanceEnCours } from "../db";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { suivi } from "../natif/suivi";
import { espace } from "../theme/typo";
import { useBulle } from "../ui/CoucheBulle";
import { FournisseurPartie } from "../ui/ContextePartie";
import { BoutonPrincipal } from "../ui/Degrade";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { seanceChangee } from "./bulle-evenement";
import { ouvrirSeance } from "./ouvrir-seance";
import { useApp } from "./contexte";
import { terminer } from "./donnees";
import { finSansPauses } from "./duree-seance";
import { garderDemarrage, type ChoixEnCours, type EnCours, type Issue, type OutilsGarde } from "./garde-demarrage";
import { passerRepos } from "./repos";
import { finirFcMuscu } from "./fc-muscu";
import { abandonnerSuivi, terminerSuivi } from "./suivi-enregistrer";

// Point d'entrée commun de tous les démarrages de séance (garde-demarrage.ts) et sa feuille « Tu as une séance en cours »,
// posée une fois à la racine (app/_layout). Sans feuille montée, une séance en cours est simplement rouverte (comportement
// d'avant).

let outils: OutilsGarde | null = null;

const sansFeuille: OutilsGarde = {
  enCours: async () => null,
  demander: async () => "reprendre",
  reprendre: () => {},
  terminer: async () => {},
  abandonner: async () => {},
};

/**
 * Démarre une séance par `lancer`, après la feuille si une séance ou un suivi GPS est déjà en cours. `retirer` : les écrans de
 * lancement empilés sous la séance, retirés aussi quand la séance en cours est reprise (pile-lancement.ts).
 */
export function demarrerSeance(lancer: () => Promise<void>, retirer = 0): Promise<Issue> {
  return garderDemarrage(outils ?? sansFeuille, lancer, retirer);
}

/** La feuille du garde, et les gestes réels (base, suivi GPS, bulle) qu'elle déclenche. */
export function FeuilleSeanceEnCours() {
  useLangue();
  const { db } = useApp();
  const bulle = useBulle();
  const abandonnerBulle = useRef(bulle.abandonner);
  abandonnerBulle.current = bulle.abandonner;
  const [question, setQuestion] = useState<{ e: EnCours; repondre: (c: ChoixEnCours) => void } | null>(null);

  useEffect(() => {
    const o: OutilsGarde = {
      enCours: async () => {
        const s = await seanceEnCours(db);
        if (s) return { genre: "seance", id: s.id, titre: s.titre ?? t("exercices.commencer.seanceLibre") };
        if (!suivi.disponible) return null;
        const e = await suivi.etat();
        // FC d'une séance de muscu sans séance en cours : un reste, clos à l'ouverture de la prochaine séance
        if (!e || e.statut === "arrete" || e.mode === "muscu") return null;
        return { genre: "suivi", titre: (await lireSuiviLance(db))?.titre ?? t("gps.court.course") };
      },
      demander: (e) => new Promise((repondre) => setQuestion({ e, repondre })),
      reprendre: (e, retirer) => ouvrirSeance(e.genre === "seance" ? { pathname: "/session", params: { reprise: "1" } } : "/suivi/direct", retirer),
      terminer: async (e) => {
        if (e.genre === "suivi") {
          await terminerSuivi(db);
          return;
        }
        const s = await lireSeance(db, e.id);
        if (!s) return;
        const chrono = { debut: s.seance.debut, pauseDebut: s.seance.pause_debut, pauseCumulS: s.seance.pause_cumul_s };
        await terminer(db, s, { note: s.seance.note ?? "", majRoutine: false, fin: finSansPauses(chrono, Date.now()) });
        await passerRepos(db);
        await finirFcMuscu(db).catch(console.error);
        seanceChangee();
      },
      abandonner: (e) => (e.genre === "seance" ? abandonnerBulle.current(e.id) : abandonnerSuivi(db)),
    };
    outils = o;
    return () => {
      if (outils === o) outils = null;
    };
  }, [db]);

  // La feuille descend, puis le choix part : la désintégration de la bulle (abandon) se voit sans la feuille devant.
  const choisir = (c: ChoixEnCours) => {
    const q = question;
    setQuestion(null);
    if (q) setTimeout(() => q.repondre(c), c === "annuler" || c === "reprendre" ? 0 : 240);
  };

  // Une séance est un geste d'Entraînements : la feuille en prend le dégradé, d'où qu'on démarre (comme la bulle).
  return (
    <FournisseurPartie route="train">
    <Feuille visible={question != null} onFermer={() => choisir("annuler")} titre={t("accueil.garde.titre")} sousTitre={question?.e.titre}>
      <BoutonPrincipal libelle={t("accueil.garde.reprendre")} icone="play" onPress={() => choisir("reprendre")} />
      <View style={styles.groupe}>
        <Groupe>
          <Option premier libelle={t("accueil.garde.terminer")} icone="check" onPress={() => choisir("terminer")} />
          <Option danger libelle={t("accueil.garde.abandonner")} icone="trash" onPress={() => choisir("abandonner")} />
        </Groupe>
      </View>
      <View style={styles.groupe}>
        <Groupe>
          <Option premier libelle={t("accueil.garde.annuler")} onPress={() => choisir("annuler")} />
        </Groupe>
      </View>
    </Feuille>
    </FournisseurPartie>
  );
}

const styles = StyleSheet.create({
  groupe: { marginTop: espace.m },
});
