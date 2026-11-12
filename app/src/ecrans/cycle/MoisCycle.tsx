// Le calendrier vertical du cycle (planche cycle, écrans 3a et 3b) : LE calendrier de l'appli (ui/PageMois), avec sa bascule
// liste ou calendrier.
//   - Calendrier : les jours de règles en rond plein (comme une pesée), aujourd'hui cerclé, les jours de la fourchette des
//     prochaines règles en rond pointillé : la seule date à venir montrée (D6). Toucher un jour ouvre la saisie.
//   - Liste : la liste commune des pages du mois (ListeAgenda, calendrier unique) : un cycle par ligne, à la date de son début
//     (sa durée ou « jour 19, en cours », ses dates, la durée de ses règles, sa source) ; toucher une ligne ouvre l'épisode.
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useTheme } from "../../theme";
import type { VueAgenda } from "../../ui/BasculeVue";
import { PageMois, type JourMois } from "../../ui/PageMois";
import { revenir } from "../../ui/revenir";
import { isoLocal, lireJoursCycle, lireReglagesCycle } from "../../cycle/donnees";
import { etatCycle, joursFourchette, joursRegles, plus, type JourCycle } from "../../cycle/modele";
import { useApp } from "../contexte";
import { ListeAgenda, minuitDe, useLectureMois } from "../mesures/ListeAgenda";
import { dateCourte } from "./cycle-vue";
import { FeuilleCycle, type SaisieCycle } from "./FeuilleCycle";

export function MoisCycle() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const params = useLocalSearchParams<{ vue?: string }>();
  const [maintenant] = useState(() => Date.now());
  const auj = isoLocal(maintenant);
  const [vue, setVue] = useState<VueAgenda>(params.vue === "liste" ? "liste" : "mois");
  const [d, setD] = useState<{ jours: JourCycle[]; prevision: boolean } | null>(null);
  const [version, setVersion] = useState(0);
  const [saisie, setSaisie] = useState<SaisieCycle | null>(null);
  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      Promise.all([lireJoursCycle(db), lireReglagesCycle(db)])
        .then(([jours, r]) => vivant && setD({ jours, prevision: r.prevision }))
        .catch(console.error);
      return () => {
        vivant = false;
      };
    }, [db, version]),
  );
  const e = useMemo(() => (d ? etatCycle(d.jours, auj, auj) : null), [d, auj]);
  const fourchette = useMemo(() => (e && d?.prevision ? joursFourchette(e.prevision) : []), [e, d]);
  const jours = useMemo(() => {
    const m = new Map<string, JourMois>();
    if (!e) return m;
    for (const j of fourchette) m.set(j, { marque: "estimee", libelle: "" });
    for (const j of joursRegles(e.episodes)) m.set(j, { marque: "faite", libelle: "" });
    return m;
  }, [e, fourchette]);
  const ouvrir = useCallback(
    (j: string) => {
      if (!e || j > auj) return;
      const ep = e.episodes.find((x) => x.debut <= j && j <= x.fin);
      setSaisie(ep ? { sorte: "regles", episode: ep } : { sorte: "jour", jour: j });
    },
    [e, auj],
  );
  const premier = e?.episodes[0]?.debut ?? null;
  // la liste : un cycle par ligne, à la date de son début (relue quand les jours changent)
  const { lire, version: versionListe, vider } = useLectureMois(
    e
      ? async (debut, fin) =>
          e.cycles
            .filter((c) => minuitDe(c.debut) >= debut && minuitDe(c.debut) < fin)
            .map((c) => {
              const source = t(`cycle.source.${c.source}` as "cycle.source.saisie");
              const dates = c.enCours ? t("cycle.liste.depuis", { d: dateCourte(c.debut) }) : `${dateCourte(c.debut)} – ${dateCourte(plus(c.debut, c.duree! - 1))}`;
              const regles = c.regles != null ? t("cycle.liste.sous", { n: c.regles, source }) : t("cycle.liste.sousEnCours", { source });
              const ep = e.episodes.find((x) => x.debut === c.debut);
              return {
                date: minuitDe(c.debut),
                texte: c.enCours ? `${t("cycle.liste.jourN", { j: e.phase?.j ?? 1 })}, ${t("cycle.liste.enCours")}` : `${c.duree} ${t("cycle.jours")}`,
                sous: `${dates}, ${regles}`,
                bon: true,
                onPress: ep ? () => setSaisie({ sorte: "regles", episode: ep }) : undefined,
              };
            })
      : null,
  );
  // jours relus après une saisie : la liste relit ses mois (pas à la première lecture : la liste les lit elle-même)
  const premiers = useRef<typeof d>(null);
  useEffect(() => {
    if (!d) return;
    if (!premiers.current) premiers.current = d;
    else vider();
  }, [d, vider]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <PageMois
        depart={auj}
        aujourdhui={auj}
        jours={jours}
        couleur={couleurs.partieSante}
        onJour={ouvrir}
        onRetour={revenir}
        futur={false}
        futurJusqua={fourchette.at(-1) ?? null}
        premierMois={premier}
        legende={[
          { marque: "faite", texte: t("cycle.legende.regles") },
          ...(fourchette.length ? [{ marque: "estimee" as const, texte: t("cycle.legende.estimation") }] : []),
        ]}
        vue={vue}
        onVue={setVue}
        titre={t("cycle.titre")}
        liste={
          e ? (
            <ListeAgenda
              lire={lire}
              premier={premier ? minuitDe(premier) : null}
              maintenant={maintenant}
              choisir={null}
              version={versionListe}
              couleur={couleurs.partieSante}
              ditBon={false}
              vide={{ titre: t("cycle.liste.aucun"), texte: t("cycle.liste.aucunTexte") }}
            />
          ) : null
        }
      >
        <FeuilleCycle saisie={saisie} jours={d?.jours ?? []} onFermer={() => setSaisie(null)} onEnregistre={() => setVersion((v) => v + 1)} maintenant={maintenant} />
      </PageMois>
    </SafeAreaView>
  );
}
