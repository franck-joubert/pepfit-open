// Vue liste des pages du mois (bascule liste ou calendrier, ui/PageMois ; retour du 30/10 : la même partout,
// sur le modèle de la liste de la page Poids) : les entrées de la partie (pesées, mesures, séances, repas, prises) de la
// plus récente à la plus ancienne, groupées par mois, lues un mois à la fois en remontant jusqu'au mois du premier jour de
// l'historique. Un point de la couleur de la partie devant chaque ligne (plein si l'entrée est « bonne »). Toucher une
// ligne : son action propre (une pesée ouvre sa feuille, une séance son détail), sinon le jour est choisi.
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { t } from "../../i18n/index";
import { formater } from "../../i18n/temps";
import { rayon } from "../../theme/typo";
import { grouperParMois, moisAvant } from "./agenda-liste";
import type { EntreeAgenda } from "./agenda-store";
import { BlocVide, Groupe, LigneMesure, Lignes, MARGE, Note, Os, TitreGroupe, useMesure } from "./gabarit";
import { debutMois } from "./periodes";

export type LireMois = (mois: number) => Promise<EntreeAgenda[]>;

const capitale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const titreMois = (ms: number) => capitale(formater(ms, { month: "long", year: "numeric" }));

/** Jour local « AAAA-MM-JJ » d'un instant, et son minuit (les mesures comptent en heure du téléphone, periodes.ts). */
export const jourLocal = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const minuitDe = (j: string): number => {
  const [a, m, d] = j.split("-").map(Number) as [number, number, number];
  return new Date(a, m - 1, d).getTime();
};

/**
 * Lectures d'une page du mois, un mois à la fois et lues une fois pour les deux vues (un échec n'est pas retenu).
 * `vider` (une entrée a changé) efface le cache et fait monter `version` : les vues relisent leurs mois.
 */
export function useLectureMois(lireEntre: ((debut: number, fin: number) => Promise<EntreeAgenda[]>) | null) {
  const cache = useRef(new Map<number, Promise<EntreeAgenda[]>>());
  const [version, setVersion] = useState(0);
  const vider = useCallback(() => {
    cache.current.clear();
    setVersion((v) => v + 1);
  }, []);
  const source = useRef(lireEntre);
  source.current = lireEntre;
  const lire = useCallback<LireMois>((mois) => {
    let x = cache.current.get(mois);
    if (!x && source.current) {
      x = source.current(mois, debutMois(mois, 1)).catch((e: unknown) => {
        console.error(e);
        cache.current.delete(mois);
        return [];
      });
      cache.current.set(mois, x);
    }
    return x ?? Promise.resolve([]);
  }, []);
  return { lire, version, vider };
}

type Mois = { mois: number; entrees: EntreeAgenda[] };
/** Entrées lues au moins par lecture (un mois dense en a assez seul : une pesée par jour). */
const ENTREES_LOT = 12;

export function ListeAgenda({
  lire,
  premier,
  maintenant,
  choisir,
  version,
  couleur: couleurDonnee,
  vide,
  ditBon = true,
}: {
  lire: LireMois;
  /** Premier jour de l'historique (borne de la lecture en remontant), null sans historique. */
  premier: number | null;
  maintenant: number;
  /** Toucher une ligne sans action propre : le jour (minuit) ; null : la ligne ne se touche pas. */
  choisir: ((jour: number) => void) | null;
  version: number;
  /** Couleur des points (défaut : celle de la mesure). */
  couleur?: string;
  /** Rien à montrer : titre et texte du bloc vide. */
  vide?: { titre: string; texte: string };
  /** Faux : le lecteur d'écran ne dit pas « bonne journée » (séances, repas : chaque entrée est pleine). */
  ditBon?: boolean;
}) {
  const m = useMesure();
  const couleur = couleurDonnee ?? m.fort;
  const [liste, setListe] = useState<Mois[]>([]);
  // prochain mois à lire (null : début de l'historique atteint)
  const [prochain, setProchain] = useState<number | null>(() => debutMois(maintenant, 0));
  const [charge, setCharge] = useState(true);
  const enCours = useRef(false);
  const vivant = useRef(true);
  useEffect(
    () => () => {
      vivant.current = false;
    },
    [],
  );

  // un mois à la fois en remontant ; un mois sans entrée est passé (sans dépasser le mois du premier jour) ; jusqu'à
  // ENTREES_LOT entrées au moins : une liste clairsemée (un cycle par mois) ne s'arrête pas sur une seule ligne, une liste
  // courte ne relançant pas toujours la lecture en bas (onEndReached)
  const suite = async (depuis: number | null) => {
    if (enCours.current || depuis == null) return;
    enCours.current = true;
    setCharge(true);
    let mois: number | null = depuis;
    const ajout: Mois[] = [];
    while (mois != null && ajout.reduce((n, x) => n + x.entrees.length, 0) < ENTREES_LOT) {
      ajout.push(...grouperParMois(await lire(mois)));
      mois = moisAvant(mois, premier);
    }
    if (!vivant.current) return;
    setListe((l) => [...l, ...ajout]);
    setProchain(mois);
    setCharge(false);
    enCours.current = false;
  };
  useEffect(() => {
    void suite(prochain).catch(console.error);
    // première lecture : le mois en cours
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Une entrée a changé : les mois déjà parcourus (du mois en cours jusqu'au prochain à lire) sont relus sur place, sans
  // remonter la liste ; une pesée déplacée dans un mois vide jusque-là y apparaît.
  const aLire = useRef(prochain);
  aLire.current = prochain;
  useEffect(() => {
    if (!version) return;
    let ok = true;
    (async () => {
      const n = aLire.current;
      const relus: Mois[] = [];
      for (let mois: number | null = debutMois(maintenant, 0); mois != null && mois !== n; mois = moisAvant(mois, premier)) {
        relus.push(...grouperParMois(await lire(mois)));
      }
      if (ok && vivant.current) setListe(relus);
    })().catch(console.error);
    return () => {
      ok = false;
    };
    // `lire` lit le cache de la page, vidé à chaque changement
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const fin =
    charge ? (
      <View style={{ marginTop: 28, marginHorizontal: MARGE, gap: 10 }} accessible accessibilityLabel={t("mesures.chargement")}>
        <Os largeur={96} hauteur={11} />
        <Os largeur="100%" hauteur={56} rayon={rayon.l} />
      </View>
    ) : prochain != null ? undefined : liste.length ? (
      <Note style={{ marginTop: 16, marginHorizontal: MARGE }}>{t("mesures.agendaDebut")}</Note>
    ) : (
      <BlocVide titre={vide?.titre ?? t("mesures.pasDeDonnee")} texte={vide?.texte ?? t("mesures.agendaVide")} />
    );

  return (
    <FlatList
      data={liste}
      keyExtractor={(x) => String(x.mois)}
      contentContainerStyle={{ paddingBottom: 104 }}
      onEndReached={() => void suite(prochain).catch(console.error)}
      onEndReachedThreshold={0.6}
      ListFooterComponent={fin}
      renderItem={({ item }) => (
        <>
          <TitreGroupe>{titreMois(item.mois)}</TitreGroupe>
          <Groupe>
            <Lignes>
              {item.entrees.map((e, i) => {
                const titre = capitale(formater(e.date, { weekday: "long", day: "numeric" }));
                const action = e.onPress ?? (choisir ? () => choisir(e.date) : undefined);
                return (
                  <LigneMesure
                    key={`${e.date}-${i}`}
                    titre={titre}
                    sous={e.sous}
                    valeur={e.texte}
                    avant={<View style={[styles.point, { borderColor: couleur }, e.bon && { backgroundColor: couleur }]} />}
                    onPress={action}
                    libelle={[formater(e.date, { weekday: "long", day: "numeric", month: "long" }), e.texte, e.sous, e.bon && ditBon ? t("mesures.agendaBon") : null].filter(Boolean).join(", ")}
                  />
                );
              })}
            </Lignes>
          </Groupe>
        </>
      )}
    />
  );
}

const styles = StyleSheet.create({
  point: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
});
