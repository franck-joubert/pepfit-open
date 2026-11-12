// Historique des prises (planche sante-suivi, D10) dans le calendrier de l'appli (ui/PageMois ; retour du 30/10 :
// plus de mois à flèches). Vue mois : les mois défilent jusqu'à celui d'aujourd'hui (pas de futur) ; un jour prend la
// pastille pleine de Santé si toutes les prises prévues sont cochées, son anneau pour une partie (ou une prise « si besoin »
// seule), le fond s1 si aucune ne l'est. Toucher un jour ouvre sa feuille : prises avec heure et auteur, puis les prévues
// non prises. Vue liste : les prises, de la plus récente à la plus ancienne (ListeAgenda, le modèle de la page Poids).
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { listerTraitements, premierePrise, prisesEntre, type Prise } from "../db";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { rayon } from "../theme/typo";
import { AuraFond } from "../ui/AuraFond";
import type { VueAgenda } from "../ui/BasculeVue";
import { Feuille } from "../ui/Feuille";
import { PageMois, type JourMois } from "../ui/PageMois";
import { revenir } from "../ui/revenir";
import { Texte } from "../ui/Texte";
import { useApp, useCharge } from "./contexte";
import { jourLocal, ListeAgenda, minuitDe, useLectureMois } from "./mesures/ListeAgenda";
import { ajouterJ, premierDuMois } from "./planification";
import { jourDe } from "./planif-donnees";
import { compteJour, dateTitre, partJour, prevuLe } from "./suivi-calc";
import { Auteur, Filet, Ligne } from "./suivi-ui";

/** Prises relues autour des mois vus. */
const MARGE_MOIS = 2;

export function HistoriquePrises() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const [auj] = useState(() => jourDe(Date.now()));
  const [maintenant] = useState(() => Date.now());
  const [vue, setVue] = useState<VueAgenda>("mois");
  const [sel, setSel] = useState<string | null>(null);
  const [d] = useCharge(async (x) => ({ traitements: await listerTraitements(x), premiere: await premierePrise(x) }), []);
  const traitements = d?.traitements;
  const parId = useMemo(() => new Map((traitements ?? []).map((x) => [x.id, x])), [traitements]);

  // Vue mois : les prises des mois vus (et deux de part et d'autre), lues une fois.
  const [prises, setPrises] = useState<Prise[]>([]);
  const [lu, setLu] = useState<{ de: string; a: string } | null>(null);
  const vus = useCallback(
    (premier: string, dernier: string) => {
      if (lu && premier >= lu.de && dernier <= lu.a) return;
      const de = premierDuMois(premier, -MARGE_MOIS);
      const a = ajouterJ(premierDuMois(dernier, MARGE_MOIS + 1), -1);
      setLu({ de, a });
      prisesEntre(db, de, a)
        .then((l) => setPrises((cur) => [...cur.filter((p) => p.date < de || p.date > a), ...l]))
        .catch(console.error);
    },
    [db, lu],
  );
  const jours = useMemo(() => {
    const m = new Map<string, JourMois>();
    if (!traitements || !lu) return m;
    const parJour = new Map<string, Prise[]>();
    for (const p of prises) parJour.set(p.date, [...(parJour.get(p.date) ?? []), p]);
    for (let j = lu.de; j <= lu.a && j <= auj; j = ajouterJ(j, 1)) {
      const duJour = parJour.get(j) ?? [];
      const part = partJour(traitements, duJour, j);
      const marque = part == null ? (duJour.length ? "donnee" : null) : part >= 1 ? "faite" : part > 0 || duJour.length ? "donnee" : "manquee";
      if (marque) m.set(j, { marque, libelle: "" });
    }
    return m;
  }, [traitements, prises, lu, auj]);
  const legende = useMemo(() => {
    const vues = new Set([...jours.values()].map((x) => x.marque));
    return (
      [
        { marque: "faite", texte: t("ui.calendrier.toutesPrises") },
        { marque: "donnee", texte: t("ui.calendrier.unePartie") },
        { marque: "manquee", texte: t("ui.calendrier.aucunePrise") },
      ] as const
    ).filter((x) => vues.has(x.marque));
  }, [jours]);

  // Vue liste : une ligne par prise, son heure ; toucher ouvre la feuille du jour.
  const { lire, version } = useLectureMois(async (debut, fin) =>
    (await prisesEntre(db, jourLocal(debut), ajouterJ(jourLocal(fin), -1))).map((p) => {
      const x = parId.get(p.traitement_id);
      const dose = p.dose ?? x?.dose;
      return { date: minuitDe(p.date), texte: p.heure, sous: [x?.nom, dose].filter(Boolean).join(", "), bon: true };
    }),
  );
  const choisir = useCallback((ms: number) => setSel(jourLocal(ms)), []);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
      <AuraFond partie="sante" fixe />
      <PageMois
        depart={auj}
        aujourdhui={auj}
        jours={jours}
        onFenetre={vus}
        onJour={setSel}
        onRetour={revenir}
        choisi={sel}
        couleur={couleurs.partieSante}
        futur={false}
        premierMois={d ? (d.premiere ?? auj) : auj}
        legende={legende}
        vue={vue}
        onVue={setVue}
        titre={t("suivi.prises")}
        liste={
          d ? (
            <ListeAgenda
              lire={lire}
              premier={d.premiere ? minuitDe(d.premiere) : null}
              maintenant={maintenant}
              choisir={choisir}
              version={version}
              couleur={couleurs.partieSante}
              ditBon={false}
              vide={{ titre: t("ui.calendrier.aucunePrise"), texte: t("ui.calendrier.aucunePriseTexte") }}
            />
          ) : null
        }
      >
        <FeuilleJour jour={sel} traitements={traitements ?? []} parId={parId} onFermer={() => setSel(null)} />
      </PageMois>
    </SafeAreaView>
  );
}

type Traitements = Awaited<ReturnType<typeof listerTraitements>>;

/** Le jour touché : prises avec heure et auteur, puis les prévues non prises. */
function FeuilleJour({
  jour,
  traitements,
  parId,
  onFermer,
}: {
  jour: string | null;
  traitements: Traitements;
  parId: Map<string, Traitements[number]>;
  onFermer: () => void;
}) {
  const { couleurs } = useTheme();
  const [duJour] = useCharge((x) => (jour ? prisesEntre(x, jour, jour) : Promise.resolve([])), [jour]);
  const l = jour ? (duJour ?? []) : [];
  const pris = new Set(l.map((p) => p.traitement_id));
  const nonPris = jour ? traitements.filter((x) => prevuLe(x, jour) && !pris.has(x.id)) : [];
  const compte = jour ? compteJour(traitements, l, jour) : { prevus: 0, pris: 0 };
  return (
    <Feuille visible={jour != null} onFermer={onFermer} titre={jour ? dateTitre(jour) : undefined} sousTitre={compte.prevus ? t("suivi.surN", compte) : undefined}>
      <View style={[styles.groupe, { backgroundColor: couleurs.feuilleGroupe }]}>
        {l.length || nonPris.length ? (
          <>
            {l.map((p, i) => {
              const x = parId.get(p.traitement_id);
              const dose = p.dose ?? x?.dose;
              return (
                <View key={p.id}>
                  {i > 0 ? <Filet /> : null}
                  <Ligne
                    titre={x?.nom ?? ""}
                    sous={
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        {dose ? (
                          <Texte variante="meta" couleur="t2">
                            {`${dose}, `}
                          </Texte>
                        ) : null}
                        <Auteur auteur={p.auteur} />
                      </View>
                    }
                    valeur={p.heure}
                    doux
                    chevron={false}
                    hauteur={52}
                  />
                </View>
              );
            })}
            {nonPris.map((x, i) => (
              <View key={x.id}>
                {i > 0 || l.length ? <Filet /> : null}
                <Ligne titre={x.nom} sous={t("suivi.nonPris")} valeur="—" doux chevron={false} hauteur={52} />
              </View>
            ))}
          </>
        ) : (
          <Ligne titre={t("suivi.aucunePrise")} chevron={false} hauteur={52} />
        )}
      </View>
    </Feuille>
  );
}

const styles = StyleSheet.create({
  groupe: { borderRadius: rayon.l, overflow: "hidden" },
});
