import { useCallback, useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { seancesEntre, seancesTerminees, serieHebdo } from "../db";
import { useApp, useCharge } from "../ecrans/contexte";
import { dureeCourte, heure } from "../ecrans/format";
import { ListeAgenda, useLectureMois } from "../ecrans/mesures/ListeAgenda";
import { retourMois } from "../ecrans/Planif";
import { jourDe, lirePlanning, resumeJour } from "../ecrans/planif-donnees";
import { ajouterJ, premierDuMois } from "../ecrans/planification";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import type { VueAgenda } from "../ui/BasculeVue";
import { PageMois, type JourMois } from "../ui/PageMois";

// Page du mois d'Entraînements (planche planification v7, écrans 3 à 5) : la page du mois commune (ui/PageMois.tsx),
// marquée par le planning. Toucher un jour ramène à la page Entraînements, à cette date (retours du 28/10 : plus de tiroir).
// Bascule liste ou calendrier (30/10) : la liste des séances terminées, de la plus récente à la plus ancienne (ListeAgenda,
// le modèle de la liste de la page Poids) ; toucher une séance ouvre son détail.

/** Lecture du planning : douze mois de part et d'autre des mois vus, relue seulement quand on approche d'un bord (trois
 *  mois), pour qu'un défilement rapide trouve ses séances déjà là. */
const MARGE_MOIS = 12;
const BORD_MOIS = 3;

/** Autour d'aujourd'hui, toujours six mois de part et d'autre : « Aujourd'hui » y revient sans attendre une relecture. */
const AUTOUR_AUJ = 6;

const fenetreAutour = (de: string, a: string, auj: string) => {
  const d = premierDuMois(de, -MARGE_MOIS);
  const f = ajouterJ(premierDuMois(a, MARGE_MOIS + 1), -1);
  const dAuj = premierDuMois(auj, -AUTOUR_AUJ);
  const fAuj = ajouterJ(premierDuMois(auj, AUTOUR_AUJ + 1), -1);
  return { de: d < dAuj ? d : dAuj, a: f > fAuj ? f : fAuj };
};

export default function Calendrier() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const [vue, setVue] = useState<VueAgenda>("mois");
  const [maintenant] = useState(() => Date.now());
  const { jour } = useLocalSearchParams<{ jour?: string }>();
  const [auj] = useState(() => jourDe(Date.now()));
  const depart = jour ?? auj;
  const [fenetre, setFenetre] = useState(() => fenetreAutour(depart, depart, auj));
  const [p] = useCharge((db) => lirePlanning(db, fenetre.de, fenetre.a), [fenetre.de, fenetre.a]);
  const [terminees] = useCharge((db) => seancesTerminees(db), []);
  const serie = terminees ? serieHebdo(terminees).enCours : 0;
  // Vue liste : les séances terminées d'un mois, chacune ouvre son détail.
  const { lire, version } = useLectureMois(async (debut, fin) =>
    (await seancesEntre(db, debut, fin))
      .filter((s) => s.fin != null)
      .map((s) => ({
        date: s.debut,
        texte: dureeCourte(s.dureeMin * 60),
        sous: `${s.titre}, ${heure(s.debut)}`,
        bon: true,
        onPress: () => router.push({ pathname: "/history/[id]", params: { id: s.id } }),
      })),
  );
  const premiere = terminees?.length ? terminees[terminees.length - 1]!.debut : null;
  const vus = useCallback((premier: string, dernier: string) => {
    setFenetre((f) => (premier >= premierDuMois(f.de, BORD_MOIS) && dernier < premierDuMois(ajouterJ(f.a, 1), -BORD_MOIS) ? f : fenetreAutour(premier, dernier, auj)));
  }, [auj]);
  // Les jours, résumés une fois par planning (marque, nom) : chaque case lit le sien, sans parcourir le planning.
  const jours = useMemo(() => {
    const m = new Map<string, JourMois>();
    if (!p) return m;
    for (let j = p.de; j <= p.a; j = ajouterJ(j, 1)) {
      const r = resumeJour(p, j);
      if (r.m || r.nom) m.set(j, { marque: r.m, libelle: r.nom });
    }
    return m;
  }, [p]);
  // Le jour touché : la page Entraînements s'y pose à son retour (Planif.retourMois).
  const ouvrir = useCallback((j: string) => {
    retourMois.jour = j;
    router.back();
  }, []);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      {/* Séance faite : le vert « validé », comme le semainier du Sport et l'Accueil (revue finale n° 4, D1). */}
      <PageMois
        depart={depart}
        aujourdhui={auj}
        jours={jours}
        onFenetre={vus}
        onJour={ouvrir}
        onRetour={router.back}
        choisi={jour ?? null}
        serie={serie}
        couleurFaite={couleurs.valide}
        legende={[
          { marque: "faite", texte: t("ui.calendrier.seanceFaite") },
          { marque: "prevue", texte: t("ui.calendrier.prevue") },
          { marque: "manquee", texte: t("ui.calendrier.manquee") },
        ]}
        vue={vue}
        onVue={setVue}
        titre={t("ui.calendrier.seances")}
        liste={
          terminees ? (
            <ListeAgenda
              lire={lire}
              premier={premiere}
              maintenant={maintenant}
              choisir={null}
              version={version}
              couleur={couleurs.valide}
              ditBon={false}
              vide={{ titre: t("ui.calendrier.aucuneSeance"), texte: t("ui.calendrier.aucuneSeanceTexte") }}
            />
          ) : null
        }
      />
    </SafeAreaView>
  );
}
