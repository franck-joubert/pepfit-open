import { useMemo, useState, type ReactNode } from "react";
import { router } from "expo-router";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { signalerErreur } from "../ui/FeuilleMessage";
import { annoncerAnnulable, recupChangee } from "./activites-evenement";
import { useApp } from "./contexte";
import { FeuilleHorairesActivite } from "./FeuilleHorairesActivite";
import { jourLong, jourMois } from "./format";
import type { CibleHoraires } from "./horaires-donnees";
import type { Nuit } from "./mesures/sommeil-donnees";
import { horairesNuit, type ActionsEffortListe, type ElementRecup } from "./page-effort";
import { bornesDuJour } from "./page-effort-donnees";
import { retablirRecup, supprimerRecup } from "./recuperer-donnees";
import { nomRecup } from "./recuperer-vues/briques-donnees";

// Gestes de la liste du jour de l'onglet Effort (planche Effort v2.2) : le « … » du Sommeil (Modifier, Masquer le Sommeil), celui
// d'une récupération (Modifier, Supprimer de l'historique) et les Horaires.

/** Le jour d'une récupération, pour le sous-titre de son menu : « Vendredi 6 novembre ». */
const jourDe = (t0: number) => `${jourLong(t0)} ${jourMois(t0)}`;

export function useActionsEffort(): { effort: ActionsEffortListe; feuilles: ReactNode } {
  useLangue();
  const { db, reglages, regler } = useApp();
  const [nuit, setNuit] = useState<Nuit | null>(null);
  const [recup, setRecup] = useState<ElementRecup | null>(null);
  // La cible des Horaires reste après la fermeture : la feuille redescend avec son contenu.
  const [horaires, setHoraires] = useState<{ cible: CibleHoraires; titre: string } | null>(null);
  const [horairesOuverts, setHorairesOuverts] = useState(false);
  const ouvrirHoraires = (cible: CibleHoraires, titre: string) => {
    setHoraires({ cible, titre });
    setHorairesOuverts(true);
  };

  /** D8 : la ligne disparaît tout de suite, un bandeau de 8 s dit comment la revoir et laisse « Annuler ». */
  const masquer = () => {
    setNuit(null);
    regler({ sommeilAffiche: false });
    annoncerAnnulable({ texte: t("effortJour.masque"), annuler: async () => regler({ sommeilAffiche: true }), lignes: 2, coche: true });
  };

  /** Supprimée tout de suite (suppression douce), rétablie par « Annuler » ; la liste se relit des deux côtés. */
  const supprimer = (e: ElementRecup) => {
    setRecup(null);
    supprimerRecup(db, e.recupId)
      .then(() => {
        recupChangee();
        annoncerAnnulable({
          texte: t("effortJour.recupSupprimee"),
          annuler: async () => {
            await retablirRecup(db, e.recupId);
            recupChangee();
          },
        });
      })
      .catch(signalerErreur("supprimer"));
  };

  const effort = useMemo<ActionsEffortListe>(
    () => ({
      sommeilAffiche: reglages.sommeilAffiche,
      onOuvrirSommeil: (j) => router.push({ pathname: "/sante/sommeil", params: { jour: String(bornesDuJour(j).debut) } }),
      onMenuSommeil: setNuit,
      onMenuRecup: setRecup,
      onSupprimerRecup: supprimer,
    }),
    // `supprimer` ne dépend que de la base : un nouveau rendu n'a pas à redessiner toute la liste
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reglages.sommeilAffiche, db],
  );

  const modifierRecup = (e: ElementRecup) => {
    setRecup(null);
    ouvrirHoraires({ genre: "recup", id: e.recupId }, nomRecup(e.a.type));
  };

  const feuilles = (
    <>
      <Feuille visible={nuit != null} onFermer={() => setNuit(null)} titre={t("effortJour.sommeil")} sousTitre={nuit ? horairesNuit(nuit) : undefined}>
        <Groupe>
          <Option
            premier
            icone="crayon"
            libelle={t("horaires.modifier")}
            aide={t("horaires.modifierAide")}
            onPress={() => {
              if (nuit) ouvrirHoraires({ genre: "nuit", nuit }, t("effortJour.sommeil"));
              setNuit(null);
            }}
          />
          <Option icone="oeilBarre" libelle={t("effortJour.masquer")} aide={t("effortJour.masquerAide")} onPress={masquer} />
        </Groupe>
      </Feuille>

      <Feuille visible={recup != null} onFermer={() => setRecup(null)} titre={recup ? nomRecup(recup.a.type) : undefined} sousTitre={recup ? jourDe(recup.a.debut) : undefined}>
        <Groupe>
          <Option premier icone="crayon" libelle={t("horaires.modifier")} aide={t("horaires.modifierAide")} onPress={() => recup && modifierRecup(recup)} />
        </Groupe>
        <Groupe>
          <Option premier icone="trash" danger libelle={t("planif.supprimerHisto")} onPress={() => recup && supprimer(recup)} />
        </Groupe>
      </Feuille>

      {horaires ? (
        <FeuilleHorairesActivite
          visible={horairesOuverts}
          onFermer={() => setHorairesOuverts(false)}
          cible={horaires.cible}
          titre={horaires.titre}
          onModifie={recupChangee}
        />
      ) : null}
    </>
  );

  return { effort, feuilles };
}
