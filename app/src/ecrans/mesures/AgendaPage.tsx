// Page « agenda » des mesures (retour du 29/10, point 5), ouverte par l'icône agenda en haut à droite de chaque
// page de mesure (registre agenda-store.ts : la page appelante passe ses lectures). Le calendrier de l'appli (ui/PageMois,
// retours du 30/10 : plus de grille à flèches) avec sa bascule liste ou calendrier. Vue mois : les mois défilent jusqu'à
// celui d'aujourd'hui (pas de futur), depuis celui du premier jour de l'historique ; un jour qui a une entrée prend la
// pastille pleine de la mesure si la journée est « bonne », son anneau sinon ; légende courte dessous les jours. Vue liste :
// les entrées de la plus récente à la plus ancienne (ListeAgenda). Toucher un jour (ou une ligne sans action propre) le
// montre en haut de la page de mesure ; l'agenda se referme. Une entrée corrigée depuis sa feuille (pesée) : les mois déjà
// montrés sont relus sur place (agendaChange).
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { AuraFond } from "../../ui/AuraFond";
import type { VueAgenda } from "../../ui/BasculeVue";
import { BoutonIcone } from "../../ui/Cadre";
import { PageMois, type JourMois } from "../../ui/PageMois";
import { revenir } from "../../ui/revenir";
import { Texte } from "../../ui/Texte";
import { pointsParJour } from "./agenda-liste";
import { agendaCourant, surAgendaChange, type ParamsAgenda } from "./agenda-store";
import { AccentMesure, accentDe, PageVide, styles as g, useMesure } from "./gabarit";
import { usePartie } from "../../ui/ContextePartie";
import { jourLocal, ListeAgenda, minuitDe, useLectureMois, type LireMois } from "./ListeAgenda";
import { debutMois } from "./periodes";

const capitale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Mois relus autour des mois vus (un défilement rapide trouve ses jours prêts). */
const MARGE_MOIS = 2;

export function AgendaPage() {
  useLangue();
  // figé à l'ouverture : une autre page peut rouvrir le registre ensuite
  const [p] = useState<ParamsAgenda | null>(agendaCourant);
  // rose de Santé, ou la couleur de la visite d'une page partagée (Énergie, Pas) qui l'ouvre
  const partie = usePartie();
  const [vue, setVue] = useState<VueAgenda>(p?.vue ?? "mois");
  // un mois lu une fois pour les deux vues ; relu quand une entrée change
  const { lire, version, vider } = useLectureMois(p?.lire ?? null);
  useEffect(() => surAgendaChange(vider), [vider]);
  const choisir = useMemo(
    () =>
      p?.onJour
        ? (jour: number) => {
            p.onJour!(jour);
            revenir();
          }
        : null,
    [p],
  );
  return (
    <AccentMesure accent={p?.accent ?? accentDe(partie)}>
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        <AuraFond partie={partie} fixe />
        {!p ? (
          <>
            <View style={g.tete}>
              <BoutonIcone nom="back" libelle={t("ui.retour")} onPress={revenir} />
              <Texte variante="titre" accessibilityRole="header" numberOfLines={1} style={g.titre}>
                {t("mesures.agenda")}
              </Texte>
            </View>
            <PageVide icone="cal" titre={t("mesures.agenda")} texte={t("mesures.agendaPerdu")} action={t("ui.retour")} onAction={revenir} />
          </>
        ) : (
          <MoisMesure p={p} lire={lire} version={version} vue={vue} onVue={setVue} choisir={choisir} />
        )}
      </SafeAreaView>
    </AccentMesure>
  );
}

function MoisMesure({
  p,
  lire,
  version,
  vue,
  onVue,
  choisir,
}: {
  p: ParamsAgenda;
  lire: LireMois;
  version: number;
  vue: VueAgenda;
  onVue: (v: VueAgenda) => void;
  choisir: ((jour: number) => void) | null;
}) {
  const m = useMesure();
  const auj = jourLocal(p.maintenant);
  const [fenetre, setFenetre] = useState<{ de: string; a: string } | null>(null);
  // jour → bonne journée ; repris de zéro quand une entrée change
  const [points, setPoints] = useState<Map<string, boolean>>(() => new Map());
  useEffect(() => setPoints(new Map()), [version]);
  useEffect(() => {
    if (!fenetre) return;
    let vivant = true;
    const fin = Math.min(minuitDe(fenetre.a), p.maintenant);
    const mois: number[] = [];
    for (let x = debutMois(minuitDe(fenetre.de), -MARGE_MOIS); x <= fin; x = debutMois(x, 1)) mois.push(x);
    void Promise.all(mois.map(lire)).then((ls) => {
      if (!vivant) return;
      const pts = pointsParJour(ls.flat());
      setPoints((cur) => {
        const n = new Map(cur);
        for (const [j, bon] of pts) n.set(jourLocal(j), bon);
        return n;
      });
    });
    return () => {
      vivant = false;
    };
    // `lire` lit le cache de la page : seuls les mois vus et les changements comptent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fenetre?.de, fenetre?.a, version]);
  const vus = useCallback((de: string, a: string) => setFenetre((f) => (f && f.de === de && f.a === a ? f : { de, a })), []);
  const jours = useMemo(() => {
    const r = new Map<string, JourMois>();
    for (const [j, bon] of points) r.set(j, { marque: bon ? "faite" : "donnee", libelle: "" });
    return r;
  }, [points]);
  const legende = useMemo(() => {
    const l: { marque: "faite" | "donnee"; texte: string }[] = [{ marque: "faite", texte: capitale(p.legende) }];
    if ([...points.values()].some((bon) => !bon)) l.push({ marque: "donnee", texte: capitale(t("mesures.agendaDonnee")) });
    return l;
  }, [points, p.legende]);
  const ouvrir = useCallback((j: string) => choisir?.(minuitDe(j)), [choisir]);
  return (
    <PageMois
      depart={auj}
      aujourdhui={auj}
      jours={jours}
      onFenetre={vus}
      onJour={ouvrir}
      onRetour={revenir}
      couleur={m.fort}
      futur={false}
      premierMois={p.premier != null ? jourLocal(p.premier) : auj}
      legende={legende}
      vue={vue}
      onVue={onVue}
      titre={p.titre}
      liste={<ListeAgenda lire={lire} premier={p.premier} maintenant={p.maintenant} choisir={choisir} version={version} />}
    />
  );
}
