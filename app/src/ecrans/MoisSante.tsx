import { useCallback, useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import type { VueAgenda } from "../ui/BasculeVue";
import { PageMois, type JourMois } from "../ui/PageMois";
import { revenir } from "../ui/revenir";
import { lireActif, t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useApp, useCharge } from "./contexte";
import { jourLocal, ListeAgenda, minuitDe, useLectureMois } from "./mesures/ListeAgenda";
import { ajouterJ, premierDuMois } from "./planification";
import { jourDe } from "./planif-donnees";
import { ligneJourSante, lireJoursSante, premierJourSante, type JourSante } from "./sante-jours";

// Page du mois de Santé (calendrier partagé, ui/PageMois.tsx ; demande d'Alex du 31/10, docs/SANTE-CALENDRIER.md) : un
// jour qui a des données de santé (sommeil, VFC, FC au repos, poids, mesures, pas) porte un simple point rose, rien d'autre.
// Toucher un jour ramène sur Santé, à ce jour (semainier et cartes). Lecture légère : une requête groupée dans la base par
// fenêtre de mois (sante-jours.ts), jamais Santé Connect. Bascule liste ou calendrier : un jour par ligne, ses données
// principales, du plus récent au plus ancien (ListeAgenda) ; toucher un jour ramène aussi sur Santé.

const MARGE_MOIS = 6;

export function MoisSante() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const { jour } = useLocalSearchParams<{ jour?: string }>();
  const [auj] = useState(() => jourDe(Date.now()));
  const [maintenant] = useState(() => Date.now());
  const depart = jour ?? auj;
  const [vue, setVue] = useState<VueAgenda>("mois");
  const [lus, setLus] = useState<Map<string, JourSante>>(new Map());
  const [fenetre, setFenetre] = useState<{ de: string; a: string } | null>(null);

  const vus = useCallback(
    (premier: string, dernier: string) => {
      if (fenetre && premier >= fenetre.de && dernier <= fenetre.a) return;
      const de = premierDuMois(premier, -MARGE_MOIS);
      const a = ajouterJ(premierDuMois(dernier, MARGE_MOIS + 1), -1);
      setFenetre({ de, a });
      lireJoursSante(db, de, a)
        .then((m) => setLus((cur) => new Map([...cur, ...m])))
        .catch(console.error);
    },
    [db, fenetre],
  );
  const jours = useMemo(() => {
    const m = new Map<string, JourMois>();
    for (const j of lus.keys()) m.set(j, { marque: "point", libelle: "" });
    return m;
  }, [lus]);
  // Le jour touché : Santé s'y pose (son semainier glisse sur la semaine) ; `n` : le même jour choisi deux fois y revient.
  const ouvrir = useCallback((j: string) => router.navigate({ pathname: "/health", params: { date: j, n: String(Date.now()) } }), []);
  const [premierJour] = useCharge((x) => premierJourSante(x), []);
  // Vue liste : un jour par ligne, ses données principales.
  const { lire, version } = useLectureMois(async (debut, fin) => {
    const unite = lireActif().poids;
    const m = await lireJoursSante(db, jourLocal(debut), ajouterJ(jourLocal(fin), -1));
    return [...m].map(([j, x]) => ({ date: minuitDe(j), texte: "", sous: ligneJourSante(x, unite), bon: true }));
  });
  const choisir = useCallback((ms: number) => ouvrir(jourLocal(ms)), [ouvrir]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <PageMois
        depart={depart}
        aujourdhui={auj}
        jours={jours}
        couleur={couleurs.partieSante}
        onFenetre={vus}
        onJour={ouvrir}
        onRetour={revenir}
        choisi={jour ?? null}
        futur={false}
        premierMois={premierJour}
        legende={[{ marque: "point", texte: t("ui.calendrier.joursSante") }]}
        vue={vue}
        onVue={setVue}
        titre={t("ui.onglet.sante")}
        liste={
          premierJour !== undefined ? (
            <ListeAgenda
              lire={lire}
              premier={premierJour ? minuitDe(premierJour) : null}
              maintenant={maintenant}
              choisir={choisir}
              version={version}
              couleur={couleurs.partieSante}
              ditBon={false}
              vide={{ titre: t("ui.calendrier.aucuneDonneeSante"), texte: t("ui.calendrier.aucuneDonneeSanteTexte") }}
            />
          ) : null
        }
      />
    </SafeAreaView>
  );
}
