import { useCallback, useMemo, useState } from "react";
import { chiffresNutrition } from "./mode-affichage";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { kcalParJour, premierJourNutrition } from "../../db";
import { useTheme } from "../../theme";
import type { VueAgenda } from "../../ui/BasculeVue";
import { PageMois, type JourMois } from "../../ui/PageMois";
import { useApp, useCharge } from "../contexte";
import { nombre } from "../format";
import { jourLocal, ListeAgenda, minuitDe, useLectureMois } from "../mesures/ListeAgenda";
import { ajouterJ, premierDuMois } from "../planification";
import { jourDe } from "../planif-donnees";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { revenir } from "../../ui/revenir";

// Page du mois de Nutrition (calendrier partagé, ui/PageMois.tsx) : un jour rempli a sa pastille au dégradé turquoise et
// « 2 311 kcal » dessous (teintes-parties, 29/10) ;
// toucher un jour ouvre son journal (`n` : le même jour choisi deux fois rouvre bien ce jour).
// Bascule liste ou calendrier (30/10) : la liste des jours notés, kcal du jour, du plus récent au plus ancien (ListeAgenda,
// le modèle de la liste de la page Poids) ; toucher un jour ouvre son journal.

const MARGE_MOIS = 6;

export function MoisNutrition() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const { jour } = useLocalSearchParams<{ jour?: string }>();
  const [auj] = useState(() => jourDe(Date.now()));
  const [maintenant] = useState(() => Date.now());
  const depart = jour ?? auj;
  const [vue, setVue] = useState<VueAgenda>("mois");
  const [kcal, setKcal] = useState<Map<string, number>>(new Map());
  const [lu, setLu] = useState<{ de: string; a: string } | null>(null);

  const vus = useCallback(
    (premier: string, dernier: string) => {
      if (lu && premier >= lu.de && dernier <= lu.a) return;
      const de = premierDuMois(premier, -MARGE_MOIS);
      const a = ajouterJ(premierDuMois(dernier, MARGE_MOIS + 1), -1);
      setLu({ de, a });
      kcalParJour(db, de, a)
        .then((m) => setKcal((cur) => new Map([...cur, ...m])))
        .catch(console.error);
    },
    [db, lu],
  );
  const jours = useMemo(() => {
    const m = new Map<string, JourMois>();
    for (const [j, k] of kcal) m.set(j, chiffresNutrition() ? { marque: "faite", libelle: nombre(k, 0), unite: t("nutrition.kcal") } : { marque: "faite", libelle: "" });
    return m;
  }, [kcal]);
  const ouvrir = useCallback((j: string) => router.navigate({ pathname: "/food", params: { date: j, n: String(Date.now()) } }), []);
  // Vue liste : un jour noté par ligne, ses kcal ; il s'ouvre au toucher.
  const [premierJour] = useCharge((x) => premierJourNutrition(x), []);
  const { lire, version } = useLectureMois(async (debut, fin) => {
    const m = await kcalParJour(db, jourLocal(debut), ajouterJ(jourLocal(fin), -1));
    return [...m].map(([j, k]) => ({ date: minuitDe(j), texte: chiffresNutrition() ? `${nombre(k, 0)} ${t("nutrition.kcal")}` : t("macros.jourNote"), bon: true }));
  });
  const choisir = useCallback((ms: number) => ouvrir(jourLocal(ms)), [ouvrir]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <PageMois
        depart={depart}
        aujourdhui={auj}
        jours={jours}
        couleur={couleurs.partieNutrition}
        degrade
        onFenetre={vus}
        onJour={ouvrir}
        onRetour={revenir}
        choisi={jour ?? null}
        legende={[{ marque: "faite", texte: t("ui.calendrier.repasNotes") }]}
        vue={vue}
        onVue={setVue}
        titre={t("ui.onglet.nutrition")}
        liste={
          premierJour !== undefined ? (
            <ListeAgenda
              lire={lire}
              premier={premierJour ? minuitDe(premierJour) : null}
              maintenant={maintenant}
              choisir={choisir}
              version={version}
              couleur={couleurs.partieNutrition}
              ditBon={false}
              vide={{ titre: t("ui.calendrier.aucunRepas"), texte: t("ui.calendrier.aucunRepasTexte") }}
            />
          ) : null
        }
      />
    </SafeAreaView>
  );
}
