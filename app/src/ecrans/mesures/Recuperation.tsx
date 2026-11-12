// Page Récupération (planche recuperation, validée le 31/10, avec ses corrections : un petit « % » à côté du
// score ; la couleur de l'onglet d'origine ; le gabarit des pages de statistiques, comme Énergie, Pas, Sommeil). La
// Récupération est celle de pepfit (recup-pepfit.ts), jamais celle de Whoop. Rangée sous Santé, page partagée
// (pages-partagees.ts) : depuis Sport, accents orange ; depuis Santé, roses ; halo marié rose et orange ; par lien direct,
// Santé. L'icône ⓘ ouvre le tiroir « Comprendre la Récupération ». De haut en bas :
//   1. le semainier commun (EnteteJour : le score de chaque matin sous sa date, glissé d'un jour à l'autre, jamais le futur ;
//      paramètre de route `jour`) ;
//   2. le jour choisi : le grand anneau, la phrase d'action, la précision de ce matin, la cible d'Effort que le score règle,
//      « D'où vient ce chiffre » (les quatre parts et leur somme) ;
//   3. « Statistiques » : Semaine, Mois, Année et la navigation entre périodes (moyenne, barres sur 100 avec les seuils 34 et
//      67, jours prêts, meilleur jour, jour le plus bas, VFC et sommeil moyens), puis ta VFC des 42 dernières nuits dans sa zone.
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { View, type ScrollViewInstance } from "react-native";
import { t, tp } from "../../i18n/index";
import { formater } from "../../i18n/temps";
import { useLangue } from "../../i18n/useLangue";
import { useTheme } from "../../theme";
import { Texte } from "../../ui/Texte";
import { useApp } from "../contexte";
import { nombre } from "../format";
import { lireRecupJours } from "../recup-donnees";
import { RECUP, type ResultatRecup } from "../recup-pepfit";
import { jourDeRoute } from "./agenda-liste";
import { EnteteJour, useJour } from "./EnteteJour";
import { ActionTete, Cles, Groupe, LigneMesure, Lignes, PageMesure, Signe, TitreGroupe, useDefileVers, useMesure } from "./gabarit";
import { GrapheBarres } from "./graphes";
import { decaler, ecartRelatif, minuit, periode, periodeExiste, type Periode, type TypePeriode } from "./periodes";
import { AnneauRecup, BlocNuit, CarteCible, DouVientRecup, GrapheVfc, LienComprendreRecup, PhraseRecup, TiroirRecup, useRecupJour } from "./RecupJour";
import { heuresMinutes, texteRecup } from "./recup-vue";
import { EnteteStats, Statistiques, useStats } from "./Statistiques";
import { BlocRecuperer } from "../recuperer-vues/BlocRecuperer";

const TYPES: TypePeriode[] = ["semaine", "mois", "annee"];
/** Historique relu : un peu plus d'une année (12 mois civils et la période d'avant pour les comparaisons). */
const HISTORIQUE_JOURS = 400;

const moyenne = (l: readonly number[]) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
/** Où tombe une valeur face à une zone : dedans, au-dessus, en dessous. */
const placeZone = (v: number, z: readonly [number, number]) => (v < z[0] ? "recup.sousZone" : v > z[1] ? "recup.auDessusZone" : "recup.dansZone");

/** Chaque matin d'un peu plus d'un an, recalculé (rien n'est stocké en score) ; relu à l'arrivée sur la page. */
function useHistoriqueRecup(maintenant: number): Map<number, ResultatRecup> | null {
  const { db } = useApp();
  const [m, setM] = useState<Map<number, ResultatRecup> | null>(null);
  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      const auj = minuit(maintenant);
      lireRecupJours(db, decaler(auj, -HISTORIQUE_JOURS), auj, maintenant)
        .then((x) => vivant && setM(x))
        .catch(console.error);
      return () => {
        vivant = false;
      };
    }, [db, maintenant]),
  );
  return m;
}

export function Recuperation() {
  useLangue();
  const { couleurs } = useTheme();
  const m = useMesure();
  const [maintenant] = useState(() => Date.now());
  const params = useLocalSearchParams<{ jour?: string }>();
  const { jour, aujourdhui, choisir } = useJour(maintenant, jourDeRoute(params.jour));
  const d = useRecupJour(jour, maintenant);
  const h = useHistoriqueRecup(maintenant);
  const stats = useStats<TypePeriode>("semaine");
  const defile = useDefileVers();
  const haut = useRef<ScrollViewInstance | null>(null);
  const [tiroir, setTiroir] = useState(false);
  const [largeurVfc, setLargeurVfc] = useState(0);
  const defilement = (v: ScrollViewInstance | null) => {
    defile.page(v);
    haut.current = v;
  };

  const lire = (j: number) => {
    const r = h?.get(j);
    return r?.score != null ? r : null;
  };
  const valeurJour = (j: number) => {
    if (!h || j > maintenant) return null;
    const s = h.get(j)?.score;
    return s != null ? nombre(s, 0) : "–";
  };
  const score = (r: ResultatRecup) => r.score;
  const p: Periode<ResultatRecup> = periode(stats.type, stats.k, maintenant, lire, score);
  const avant: Periode<ResultatRecup> = periode(stats.type, stats.k + 1, maintenant, lire, score);
  const premier = h ? ([...h.entries()].find(([, r]) => r.score != null)?.[0] ?? null) : null;
  const precedent = periodeExiste(stats.type, stats.k + 1, maintenant, premier);
  const barres = p.barres.map((b) => ({ v: b.v, etiquette: b.etiquette, enCours: b.enCours, aVenir: b.aVenir }));
  const notes = p.jours.filter((x): x is typeof x & { donnee: ResultatRecup & { score: number } } => x.donnee?.score != null);
  const notesAvant = avant.jours.filter((x) => x.donnee?.score != null).map((x) => x.donnee!.score!);
  const moy = moyenne(notes.map((x) => x.donnee.score));
  const moyAvant = moyenne(notesAvant);
  const prets = notes.filter((x) => x.donnee.score >= RECUP.seuils[1]).length;
  const meilleur = notes.reduce<(typeof notes)[number] | null>((a, b) => (!a || b.donnee.score > a.donnee.score ? b : a), null);
  const plusBas = notes.reduce<(typeof notes)[number] | null>((a, b) => (!a || b.donnee.score < a.donnee.score ? b : a), null);
  const vfc = notes.map((x) => x.donnee.detail.vfc.valeur).filter((v): v is number => v != null);
  const dormi = notes.map((x) => x.donnee.detail.sommeil.dormi).filter((v): v is number => v != null);
  const derniere = notes.at(-1)?.donnee;
  const zone = derniere?.detail.vfc.norme && derniere.detail.vfc.norme.q > 0 ? derniere.detail.vfc.norme.zone : null;
  const longueur = t(`mesures.longueur.${stats.type}` as "mesures.longueur.semaine");
  const dateJour = (j: number) => formater(j, { weekday: "short", day: "numeric", month: "short" });

  const entete = (() => {
    const b = stats.sel != null ? p.barres[stats.sel] : null;
    if (b) {
      const petit = stats.type === "annee" ? t("mesures.moyenneMois", { titre: b.titre }) : b.titre;
      if (b.v == null) return <EnteteStats petit={petit} valeur={t("mesures.pasDeDonnee")} vide />;
      return <EnteteStats petit={petit} valeur={nombre(b.v, 0)} unite="%" />;
    }
    if (moy == null) return <EnteteStats petit={t("mesures.moyenneDe", { longueur })} valeur={t("mesures.pasDeDonnee")} vide />;
    const e = ecartRelatif(moy, moyAvant);
    return (
      <EnteteStats
        petit={t("mesures.moyenneDe", { longueur })}
        valeur={nombre(moy, 0)}
        unite="%"
        ligne={
          e != null ? (
            <>
              <Signe ecart={e} />
              <Texte variante="meta" couleur="t2">
                {t("mesures.vsAvant", { avant: t(`mesures.avantDe.${stats.type}`), valeur: texteRecup(moyAvant!) })}
              </Texte>
            </>
          ) : undefined
        }
      />
    );
  })();

  // les 42 dernières nuits : la VFC, sa zone de la nuit (la norme des 42 d'avant)
  const auj = minuit(maintenant);
  const nuits = Array.from({ length: RECUP.norme.nuits }, (_, i) => decaler(auj, i - RECUP.norme.nuits + 1)).map((j) => {
    const r = h?.get(j);
    const n = r?.detail.vfc.norme;
    return { jour: j, vfc: r?.detail.vfc.valeur ?? null, zone: n && n.q > 0 ? n.zone : null };
  });
  const zoneAuj = h?.get(auj)?.detail.vfc.norme;

  return (
    <PageMesure
      halo="recuperation"
      titre={t("recup.titre")}
      actions={<ActionTete nom="info" libelle={t("recup.comprendre")} onPress={() => setTiroir(true)} />}
      defilement={defilement}
    >
      <EnteteJour jour={jour} maintenant={maintenant} onJour={choisir} valeur={valeurJour}>
        {d ? (
          <>
            <AnneauRecup r={d.r} feminin={d.feminin} />
            <PhraseRecup d={d} aujourdhui={aujourdhui} />
            <BlocNuit r={d.r} aujourdhui={aujourdhui} />
            {/* Récupérer (planche recuperer, écran 1) : le bouton sous le score, ce que tu as fait, ce qui marche pour toi */}
            <BlocRecuperer jour={jour} aujourdhui={aujourdhui} />
            <CarteCible d={d} aujourdhui={aujourdhui} />
            {d.r.score != null ? <DouVientRecup r={d.r} /> : null}
          </>
        ) : (
          <View style={{ height: 420 }} />
        )}
        <LienComprendreRecup onPress={() => setTiroir(true)} />
      </EnteteJour>
      <View ref={defile.cible}>
        <Statistiques<TypePeriode>
          lundi={stats.type === "semaine" ? p.debut : null}
          periodes={TYPES.map((v) => ({ valeur: v, libelle: t(`mesures.periode.${v}` as "mesures.periode.semaine") }))}
          type={stats.type}
          onType={stats.choisirType}
          titre={p.titre}
          precedent={precedent}
          onAller={stats.aller}
          k={stats.k}
          entete={entete}
          nb={barres.length}
          sel={stats.sel}
          onSel={stats.setSel}
          cle={`${stats.type}-${stats.k}`}
          libelleGraphe={`${t("recup.grapheSemaine")}, ${p.titre}`}
          graphe={(largeur) => (
            <GrapheBarres
              barres={barres}
              largeur={largeur}
              cle={`${stats.type}-${stats.k}`}
              sel={stats.sel}
              max={100}
              seuils={RECUP.seuils}
              plein={(v) => v >= RECUP.seuils[1]}
              valeur={stats.type === "semaine" ? (v) => nombre(v, 0) : undefined}
              axe={(v) => nombre(v, 0)}
              largeurBarre={stats.type === "semaine" ? 26 : stats.type === "annee" ? 16 : 7}
              libelle={`${t("recup.grapheSemaine")}, ${p.titre}`}
            />
          )}
          legende={
            <Cles
              cles={[
                { libelle: t("recup.legendePret"), carre: m.fort },
                { libelle: t("recup.legendeDessous"), carre: m.doux },
                { libelle: t("recup.legendeSeuils"), trait: "tiret" },
              ]}
            />
          }
          apres={
            notes.length ? (
              <Groupe>
                <Lignes>
                  {[
                    <LigneMesure key="p" titre={t("recup.joursPretsTitre")} valeur={nombre(prets, 0)} unite={t("mesures.sur", { n: notes.length })} />,
                    meilleur ? <LigneMesure key="m" titre={t("recup.meilleurJour")} valeur={texteRecup(meilleur.donnee.score)} sousValeur={dateJour(meilleur.jour)} /> : null,
                    plusBas && plusBas !== meilleur ? (
                      <LigneMesure
                        key="b"
                        titre={t("recup.jourBas")}
                        sous={plusBas.donnee.detail.sommeil.dormi != null ? t("recup.apresNuit", { d: heuresMinutes(plusBas.donnee.detail.sommeil.dormi) }) : null}
                        valeur={texteRecup(plusBas.donnee.score)}
                        sousValeur={dateJour(plusBas.jour)}
                        onPress={() => {
                          choisir(plusBas.jour);
                          haut.current?.scrollTo({ y: 0, animated: false });
                        }}
                      />
                    ) : null,
                    vfc.length ? (
                      <LigneMesure
                        key="v"
                        titre={t("recup.vfcMoyenne")}
                        sous={tp("recup.nNuits", vfc.length)}
                        valeur={nombre(moyenne(vfc)!, 0)}
                        unite={t("recup.ms")}
                        sousValeur={
                          zone ? (
                            <Texte variante="meta" style={{ color: placeZone(moyenne(vfc)!, zone) === "recup.dansZone" ? couleurs.valide : couleurs.t3 }}>
                              {t(placeZone(moyenne(vfc)!, zone))}
                            </Texte>
                          ) : undefined
                        }
                      />
                    ) : null,
                    dormi.length ? (
                      <LigneMesure
                        key="s"
                        titre={t("recup.sommeilMoyen")}
                        sous={tp("recup.nNuits", dormi.length)}
                        valeur={heuresMinutes(moyenne(dormi)!)}
                        sousValeur={derniere ? t("recup.besoin", { besoin: heuresMinutes(derniere.detail.sommeil.besoin) }) : undefined}
                        onPress={() => router.push({ pathname: "/sante/sommeil", params: { jour: String(jour) } })}
                      />
                    ) : null,
                  ]}
                </Lignes>
              </Groupe>
            ) : null
          }
        />
      </View>
      {h && nuits.some((n) => n.vfc != null) ? (
        <>
          <TitreGroupe>{t("recup.vfcZone")}</TitreGroupe>
          <View style={{ marginHorizontal: 16, minHeight: 200 }} onLayout={(e) => setLargeurVfc(Math.floor(e.nativeEvent.layout.width))}>
            {largeurVfc > 0 ? <GrapheVfc nuits={nuits} largeur={largeurVfc} /> : null}
          </View>
          <Cles
            style={{ marginHorizontal: 16 }}
            cles={[
              { libelle: t("recup.legendeZone"), carre: m.voile },
              { libelle: t("recup.legendeSept"), trait: "plein" },
              { libelle: t("recup.legendeNuit"), pastille: true, couleur: couleurs.t2 },
            ]}
          />
          <Texte variante="corps" couleur="t2" style={{ fontSize: 13.5, lineHeight: 20, marginTop: 10, marginHorizontal: 16 }}>
            {zoneAuj && zoneAuj.q > 0 ? t("recup.noteZone", { bas: nombre(zoneAuj.zone[0], 0), haut: nombre(zoneAuj.zone[1], 0) }) : t("recup.noteZoneSeule")}
          </Texte>
        </>
      ) : null}
      <TiroirRecup visible={tiroir} onFermer={() => setTiroir(false)} score={d?.r.score ?? null} />
    </PageMesure>
  );
}
