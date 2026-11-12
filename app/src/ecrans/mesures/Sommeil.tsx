// Page Sommeil (planche pas, variante A, NOTES § 1 ter, validée le 28/10 ; retour du 29/10) sur le gabarit commun :
// en tête le semainier commun et le jour choisi (EnteteJour : glissé d'un jour à l'autre, jamais le futur ; paramètre de
// route `jour`), la nuit qui finit ce jour : « quand », la durée en grand, l'hypnogramme (chronologie de Santé Connect, D15) ou la barre des phases
// (Whoop seul) et pourquoi, la nuit (efficacité, réveils, respiration), les statistiques en phases empilées (objectif en
// tirets, D14), les heures de coucher et de lever, les lignes, les sources. Planche sommeil du 03/11 : sous le héros, « 76 %
// de ton besoin » et le bloc « Dette de sommeil · 7 nuits » (A1, A2) ; « Besoin de la nuit » remplace « Besoin · Whoop »
// (A5). pepfit calcule tout depuis les durées (recup-pepfit.ts, le calcul de la Récupération) : ni la performance, ni le
// besoin, ni la régularité de Whoop ne sont montrés. L'efficacité calculée garde son « ~ ».
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { View, type ScrollViewInstance } from "react-native";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { sante } from "../../natif/sante/index";
import { police } from "../../theme/typo";
import { Texte } from "../../ui/Texte";
import { useApp, useCharge } from "../contexte";
import { avantDelai, DELAI_LECTURE_MS } from "../../natif/sante/logique";
import { assurerNuitsRecup } from "../recup-donnees";
import { depsNuitsAppareil } from "../recup-appareil";
import { approx, heure, jourMois, nombre } from "../format";
import { autoriserSante, nomSource } from "../sante-donnees";
import { moyennePendant } from "../sommeil-calc";
import { jourDeRoute } from "./agenda-liste";
import { ouvrirAgenda } from "./agenda-store";
import { EnteteJour, useJour } from "./EnteteJour";
import {
  ActionTete, BlocVide, Cles, Duo, EnPanne, Groupe, Lignes, LigneMesure, Note, Os, PageMesure, PageVide, PointJour, Quand, styles as gabarit,
  TitreGroupe, useDefileVers, ValeurDuo,
} from "./gabarit";
import { niveauSommeil } from "./niveau-point";
import { BlocBesoinNuit, BlocDette } from "./BlocsDette";
import { BarrePhases, GrapheHoraires, GrapheSommeil, Hypnogramme, Pastille, useCouleursPhases } from "./GraphesSommeil";
import { bornes, decaler, minuit, periodeExiste, type TypePeriode } from "./periodes";
import { derniereNuit, lireSommeil, lireSommeilDuJour, premiereNuitWhoop, type Nuit } from "./sommeil-donnees";
import { partBesoin, type SommeilDuJour } from "./sommeil-dette";
import { hm, PHASES_HYPNO, periodeSommeil, type BarreSommeil, type Phase, type StatsNuits } from "./sommeil-stats";
import { EnteteStats, Statistiques, useStats } from "./Statistiques";
import { MiniPrecision, STYLE_MINI } from "../precision/MiniPrecision";
import { SiestesJour } from "../recuperer-vues/BlocRecuperer";
import { BandeauHeure } from "../heure-voyage/BandeauHeure";
import { CarteCeSoir, LigneEndormir } from "../endormir/CarteCeSoir";
import { carteCeSoir } from "../endormir/endormir";

/** « Nuit du 27 au 28 oct. » (mois répété s'il change). */
export function libelleNuit(jour: number): string {
  const veille = decaler(jour, -1);
  const a = new Date(veille).getMonth() === new Date(jour).getMonth() ? String(new Date(veille).getDate()) : jourMois(veille);
  return t("sante.nuitDu", { a, b: jourMois(jour) });
}

/** « 27 au 28 oct. » (meilleure nuit). */
function nuitCourte(jour: number): string {
  return libelleNuit(jour).replace(t("mesuresSommeil.prefixeNuit"), "");
}

/** Heure d'un coucher ou d'un lever, `m` minutes depuis le minuit du réveil. */
function heureDe(jour: number, m: number): string {
  return heure(jour + m * 60_000);
}

const texteSource = (n: Nuit): string =>
  n.source === "whoop" ? (n.etapes ? t("mesuresSommeil.whoopEtSante") : t("mesures.whoop")) : n.origine ? nomSource(n.origine) : t("mesures.santeConnect");

function phasesTexte(p: Record<Phase, number>): string {
  return t("mesuresSommeil.phasesTexte", { profond: hm(p.profond), paradoxal: hm(p.paradoxal), leger: hm(p.leger), eveil: hm(p.eveil) });
}

export function PageSommeil() {
  useLangue();
  const { db } = useApp();
  const maintenant = useMemo(() => Date.now(), []);
  const auj = minuit(maintenant);
  const params = useLocalSearchParams<{ jour?: string }>();
  const { jour, aujourdhui: ajd, choisir } = useJour(maintenant, jourDeRoute(params.jour));
  const stats = useStats<TypePeriode>("semaine");
  const defile = useDefileVers();
  const haut = useRef<ScrollViewInstance | null>(null);
  // fenêtre lue : la période affichée et celle d'avant (comparaison), 61 jours au moins, et la nuit du jour choisi
  const besoin = Math.min(decaler(auj, -61), bornes(stats.type, stats.k + 1, maintenant).debut, decaler(jour, -1));
  const [depuis, setDepuis] = useState(besoin);
  if (besoin < depuis) setDepuis(besoin);
  const [x, recharger, panne] = useCharge(async (db) => ({ ...(await lireSommeil(db, depuis, maintenant)), premierWhoop: await premiereNuitWhoop(db) }), [depuis], undefined, "sante/sommeil");

  const derniere = x ? derniereNuit(x.nuits) : null;
  // la nuit qui finit le jour choisi (null : pas de nuit ce jour-là ; undefined : fenêtre en lecture)
  const nuit = x && x.depuis <= decaler(jour, -1) ? (x.nuits.get(jour) ?? null) : undefined;
  const respSante = useRespirationSante(nuit ?? null, maintenant);
  const calcul = useSommeilDuJour(nuit ? jour : null, x?.nuits, maintenant);
  const ceSoir = ajd ? carteCeSoir(calcul, maintenant) : null;
  const objectif = x?.objectif ?? 450;
  // un jour touché dans l'agenda : il s'affiche en tête, la page remonte
  const montrerJour = (j: number) => {
    choisir(j);
    haut.current?.scrollTo({ y: 0, animated: false });
  };
  const agenda = () => {
    if (!x) return;
    const premier = x.premier != null && x.premierWhoop != null ? Math.min(x.premier, x.premierWhoop) : (x.premier ?? x.premierWhoop);
    ouvrirAgenda({
      titre: t("sante.sommeil"),
      maintenant,
      premier,
      legende: t("mesuresSommeil.agendaBon", { d: hm(objectif) }),
      // les nuits déjà lues, sinon celles du mois demandé
      lire: async (debut, fin) => {
        const nuits = debut >= x.depuis ? x.nuits : (await lireSommeil(db, debut, Math.min(fin, maintenant))).nuits;
        return [...nuits.values()]
          .filter((n) => n.jour >= debut && n.jour < fin)
          .sort((a, b) => a.jour - b.jour)
          .map((n) => ({ date: n.jour, texte: hm(n.sommeilMin), sous: `${heure(n.debut)} → ${heure(n.fin)}, ${texteSource(n)}`, bon: n.sommeilMin >= objectif }));
      },
      onJour: montrerJour,
    });
  };

  const actions = <ActionTete nom="cal" libelle={t("mesures.agenda")} onPress={agenda} />;

  if (x && !derniere) {
    const aucune = !x.santeAutorise && !x.whoopConnecte;
    return (
      <PageMesure titre={t("sante.sommeil")}>
        {aucune ? (
          <PageVide
            icone="lune"
            titre={t("mesuresSommeil.aucuneSource")}
            texte={t("mesuresSommeil.aucuneSourceTexte")}
            action={t("mesures.autoriserSanteConnect")}
            onAction={() => void autoriserSante().then(() => recharger())}
          />
        ) : (
          <BlocVide titre={t("mesuresSommeil.aucuneNuit")} texte={t("mesuresSommeil.aucuneNuitTexte")} />
        )}
        <Groupe style={{ marginTop: aucune ? 8 : 12 }}>
          {!x.whoopConnecte ? <LigneMesure titre={t("mesures.relierWhoop")} sous={t("mesuresSommeil.relierWhoopSous")} onPress={() => router.push("/settings/connexions")} /> : null}
          {x.whoopConnecte || !aucune ? <SourceSante x={x} nuit={null} onChange={recharger} /> : null}
        </Groupe>
        {/* sans nuit, les siestes notées dans pepfit restent visibles, et « Démarrer une sieste » (planche recuperer) */}
        <SiestesJour jour={jour} aujourdhui={ajd} />
      </PageMesure>
    );
  }

  // statistiques de la période et de celle d'avant
  const ps = x ? periodeSommeil(stats.type, stats.k, maintenant, x.stats, objectif) : null;
  const avantExiste = x ? periodeExiste(stats.type, stats.k + 1, maintenant, x.premier) : false;
  const prev = x && avantExiste ? periodeSommeil(stats.type, stats.k + 1, maintenant, x.stats, objectif).stats : null;
  const source = nuit ?? derniere;
  // la nuit d'avant le jour choisi (état vide : on peut y aller)
  const precedente = x && nuit === null ? [...x.nuits.keys()].filter((j) => j < jour).sort((a, b) => b - a)[0] : undefined;

  return (
    <PageMesure
      titre={t("sante.sommeil")}
      actions={actions}
      defilement={(v) => {
        defile.page(v);
        haut.current = v;
      }}
    >
      <EnteteJour
        jour={jour}
        maintenant={maintenant}
        onJour={choisir}
        avecDonnee={(j) => !!x?.nuits.has(j)}
        bandeau={ajd ? <BandeauHeure maintenant={maintenant} nuits={x ? x.stats.values() : null} /> : null}
      >
        {nuit === undefined ? (
          panne ? (
            <EnPanne onReessayer={() => void recharger().catch(console.error)} />
          ) : (
            <>
              <Quand texte={t("mesures.chargement")} />
              <HerosAttente />
            </>
          )
        ) : nuit ? (
          <>
            {/* l'heure seule : l'appareil se dit dans le tiroir de la dette (planche sommeil, A1) */}
            <Quand texte={`${libelleNuit(nuit.jour)}, ${heure(nuit.heure)}`} />
            {/* le soir, 2 h avant le coucher conseillé : la carte « Ce soir » au-dessus du héros (planche sommeil, B1) */}
            {calcul && ceSoir ? <CarteCeSoir s={calcul} carte={ceSoir} nuits={x?.nuits} /> : <LigneEndormir />}
            <Heros nuit={nuit} pct={calcul ? partBesoin(nuit.sommeilMin, calcul.matin) : null} />
            {/* précision du sommeil (planche precision, section 7) : sous la ligne du chiffre fort, celle des 7 nuits (D17) */}
            <MiniPrecision calcul="sommeil" valeur={calcul?.dette.precision} style={STYLE_MINI} />
            {calcul ? (
              <BlocDette s={calcul} jour={jour} dormi={nuit.sommeilMin} onSources={() => router.push("/settings/connexions")} onAgenda={agenda} sansPlan={!!ceSoir} />
            ) : null}
            <Phases nuit={nuit} />
            {/* les siestes du jour, rangées à part sous la nuit (planche recuperer, écran 8) */}
            <SiestesJour jour={jour} aujourdhui={ajd} />
            {calcul ? <BlocBesoinNuit b={calcul.matin.besoin} dormi={nuit.sommeilMin} /> : null}
            <LaNuit nuit={nuit} respSante={respSante} />
          </>
        ) : (
          <>
            <Quand texte={libelleNuit(jour)} />
            <LigneEndormir />
            <BlocVide
              titre={ajd ? t("mesuresSommeil.pasEncoreNuit") : t("mesures.pasDeDonneeJour")}
              texte={ajd ? t("mesuresSommeil.pasEncoreNuitTexte") : t("mesuresSommeil.pasDeNuitTexte")}
            />
            {precedente != null ? (
              <Groupe>
                <LigneMesure titre={t("mesuresSommeil.nuitPrecedente")} sous={libelleNuit(precedente)} onPress={() => choisir(precedente)} />
              </Groupe>
            ) : null}
            <SiestesJour jour={jour} aujourdhui={ajd} />
          </>
        )}
      </EnteteJour>
      {x && ps ? (
        <View ref={defile.cible}>
          <Statistiques<TypePeriode>
            lundi={stats.type === "semaine" ? ps.p.debut : null}
            periodes={(["semaine", "mois", "annee"] as const).map((v) => ({ valeur: v, libelle: t(`mesures.periode.${v}` as "mesures.periode.semaine") }))}
            type={stats.type}
            onType={stats.choisirType}
            titre={ps.p.titre}
            precedent={avantExiste}
            onAller={stats.aller}
            k={stats.k}
            entete={<Entete type={stats.type} barre={stats.sel != null ? (ps.barres[stats.sel] ?? null) : null} s={ps.stats} prev={prev} objectif={objectif} />}
            nb={ps.barres.length}
            sel={stats.sel}
            onSel={stats.setSel}
            cle={`${stats.type}:${stats.k}`}
            libelleGraphe={t("mesuresSommeil.grapheLibelle", { titre: ps.p.titre, moyenne: ps.stats.sommeil != null ? hm(ps.stats.sommeil) : "—" })}
            graphe={(l) => (
              <GrapheSommeil
                barres={ps.barres}
                largeur={l}
                cle={`${stats.type}:${stats.k}`}
                sel={stats.sel}
                objectif={objectif}
                semaine={stats.type === "semaine"}
                libelle={ps.p.titre}
              />
            )}
            legende={<LegendeSommeil objectif={objectif} />}
            apres={
              <>
                <Horaires barres={ps.barres} s={ps.stats} />
                <Groupe>
                  <Lignes>
                    {[
                      <LigneMesure
                        key="obj"
                        titre={t("mesuresSommeil.nuitsObjectif")}
                        sous={t("mesuresSommeil.auMoins", { d: hm(objectif) })}
                        valeur={nombre(ps.stats.aObjectif, 0)}
                        unite={t("mesures.sur", { n: ps.stats.n })}
                        sousValeur={prev && prev.n ? t("mesures.avant", { valeur: `${prev.aObjectif} / ${prev.n}` }) : undefined}
                      />,
                      ps.stats.meilleure && stats.type !== "annee" ? (
                        <LigneMesure key="best" titre={t("mesuresSommeil.meilleureNuit")} valeur={hm(ps.stats.meilleure.sommeilMin)} sousValeur={nuitCourte(ps.stats.meilleure.jour)} />
                      ) : null,
                      ps.stats.auLit != null ? (
                        <LigneMesure
                          key="lit"
                          titre={t("mesuresSommeil.tempsAuLit")}
                          sous={t("mesuresSommeil.moyenne")}
                          valeur={hm(ps.stats.auLit)}
                          sousValeur={ps.stats.phases ? t("mesuresSommeil.eveille", { d: hm(ps.stats.phases.eveil) }) : undefined}
                        />
                      ) : null,
                    ]}
                  </Lignes>
                </Groupe>
              </>
            }
          />
        </View>
      ) : null}
      {x ? (
        <>
          <TitreGroupe>{t("mesures.sources")}</TitreGroupe>
          <Groupe>
            <Lignes>
              {[
                <LigneMesure
                  key="w"
                  titre={t("mesures.whoop")}
                  sous={source?.source === "whoop" ? `${t("mesuresSommeil.whoopSous")}, ${heure(source.heure)}` : t("mesuresSommeil.whoopSous")}
                  etat={source?.source === "whoop" ? t("mesures.utilisee") : x.whoopConnecte ? t("mesuresSommeil.enAttente") : t("mesures.nonReliee")}
                  onPress={() => router.push("/settings/connexions")}
                />,
                <SourceSante key="sc" x={x} nuit={source} onChange={recharger} />,
              ]}
            </Lignes>
          </Groupe>
        </>
      ) : null}
    </PageMesure>
  );
}

/**
 * La dette et le besoin de la nuit du jour choisi (planche sommeil) : le calcul de la Récupération, relu quand les nuits de
 * la Récupération se mettent à jour (aujourd'hui et hier seulement, comme la page Récupération). null : en lecture.
 */
function useSommeilDuJour(jour: number | null, nuits: ReadonlyMap<number, Nuit> | undefined, maintenant: number): SommeilDuJour | null {
  const { db } = useApp();
  const [lu, setLu] = useState<{ jour: number; s: SommeilDuJour } | null>(null);
  useEffect(() => {
    if (jour == null || !nuits) return;
    let vivant = true;
    const lire = () => lireSommeilDuJour(db, jour, nuits, maintenant).then((s) => vivant && setLu({ jour, s }));
    lire().catch(console.error);
    if (jour >= decaler(minuit(maintenant), -1))
      depsNuitsAppareil()
        .then((deps) => avantDelai(assurerNuitsRecup(db, { ...deps, maintenant: Date.now() }), DELAI_LECTURE_MS))
        .then((n) => (vivant && n ? lire() : undefined))
        .catch(console.warn);
    return () => {
      vivant = false;
    };
  }, [db, jour, nuits, maintenant]);
  return lu && lu.jour === jour ? lu.s : null;
}

/**
 * Respiration de Santé Connect pendant une nuit sans respiration Whoop : moyenne des mesures entre le coucher et le lever
 * (lues jusqu'à cette nuit). null sans mesure.
 */
function useRespirationSante(nuit: Nuit | null, maintenant: number): number | null {
  const [lu, setLu] = useState<{ jour: number; v: number | null } | null>(null);
  useEffect(() => {
    if (!nuit || nuit.respiration != null) return;
    let vivant = true;
    const jours = Math.min(400, Math.ceil((maintenant - nuit.debut) / 86_400_000) + 1);
    void sante
      .mesures("respiration", jours)
      .catch(() => null)
      .then((r) => vivant && setLu({ jour: nuit.jour, v: r ? moyennePendant(r, nuit.debut, nuit.fin) : null }));
    return () => {
      vivant = false;
    };
  }, [nuit, maintenant]);
  return nuit && lu?.jour === nuit.jour ? lu.v : null;
}

/** Ligne Santé Connect des sources : ce qu'elle apporte à cette nuit (hypnogramme) ; autoriser, sinon ses réglages. */
function SourceSante({ x, nuit, onChange }: { x: { santeDispo: boolean; santeAutorise: boolean }; nuit: Nuit | null; onChange: () => void }) {
  const etat = !x.santeDispo
    ? t("mesures.absente")
    : !x.santeAutorise
      ? t("mesures.aAutoriser")
      : nuit?.etapes || nuit?.source === "sante"
        ? t("mesures.utilisee")
        : t("mesuresSommeil.pasDePhases");
  return (
    <LigneMesure
      titre={t("mesures.santeConnect")}
      sous={t("mesuresSommeil.santeSous")}
      etat={etat}
      onPress={async () => {
        if (!x.santeAutorise) await autoriserSante();
        else await sante.ouvrirReglages();
        onChange();
      }}
    />
  );
}

/** La durée en grand (« 6 h 22 », le h en petit), puis les horaires et la part du besoin de pepfit (D18). */
function Heros({ nuit, pct }: { nuit: Nuit; pct: number | null }) {
  const m = Math.round(nuit.sommeilMin);
  const h = Math.floor(m / 60);
  const reste = String(m % 60).padStart(2, "0");
  const sous = [
    t("mesuresSommeil.deSommeil"),
    `${heure(nuit.debut)} → ${heure(nuit.fin)}`,
    pct != null ? t("mesuresSommeil.partBesoin", { n: nombre(pct, 0) }) : null,
  ]
    .filter(Boolean)
    .join(", ");
  // point de la nuit d'après la part du besoin (vert, bleu, orange, rouge ; neutre sous 40 % de précision)
  const point = niveauSommeil(pct);
  const motPoint = t(`pointSommeil.${point}` as "pointSommeil.normal");
  return (
    <View style={gabarit.heros} accessible accessibilityLabel={`${hm(m)} ${sous}, ${motPoint}`}>
      <View style={{ flex: 1 }}>
        {m < 60 ? (
          <Texte style={gabarit.chiffre}>
            {String(m)}
            <Texte couleur="t2" style={gabarit.uniteForte}>{` ${t("mesuresSommeil.minUnite")}`}</Texte>
          </Texte>
        ) : (
          <Texte style={gabarit.chiffre}>
            {String(h)}
            <Texte couleur="t2" style={gabarit.uniteForte}>{` ${t("mesuresSommeil.hUnite")} `}</Texte>
            {reste}
          </Texte>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8, marginTop: 2 }}>
          <PointJour niveau={point} libelle={motPoint} />
          <Texte variante="corps" couleur="t2" style={{ flexShrink: 1 }}>
            {sous}
          </Texte>
        </View>
      </View>
    </View>
  );
}

function HerosAttente() {
  return (
    <View style={gabarit.heros} accessibilityLabel={t("mesures.chargement")} aria-busy>
      <View>
        <Os largeur={168} hauteur={52} rayon={8} />
        <Os largeur={220} hauteur={14} style={{ marginTop: 12 }} />
      </View>
    </View>
  );
}

/** Hypnogramme (ou barre des phases) et les quatre phases : durée, part du temps au lit. */
function Phases({ nuit }: { nuit: Nuit }) {
  const coul = useCouleursPhases();
  const p = nuit.phases;
  const auLit = nuit.auLitMin;
  const titre = nuit.etapes ? t("mesuresSommeil.hypnogramme", { d: hm(auLit) }) : t("mesuresSommeil.phasesAuLit", { d: hm(auLit) });
  if (!p && !nuit.etapes)
    return (
      <>
        <TitreGroupe>{t("mesuresSommeil.phasesTitre")}</TitreGroupe>
        <Groupe bloc>
          <Note style={{ marginTop: 0 }}>{t("mesuresSommeil.sansPhases")}</Note>
        </Groupe>
      </>
    );
  // durées : celles de la nuit (Whoop prime), sinon recomptées sur la chronologie
  const durees: Record<Phase, number> = p ?? { eveil: 0, leger: 0, profond: 0, paradoxal: 0 };
  if (!p && nuit.etapes) for (const e of nuit.etapes) durees[e.phase] += (e.fin - e.debut) / 60_000;
  const legende = (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
      {PHASES_HYPNO.map((ph) => (
        <View key={ph} style={{ flex: 1, minWidth: 0 }} accessible accessibilityLabel={`${t(`sante.stade.${ph}` as "sante.stade.eveil")} ${hm(durees[ph])}, ${Math.round((durees[ph] / auLit) * 100)} %`}>
          <Pastille couleur={coul[ph]} libelle={t(`sante.stade.${ph}` as "sante.stade.eveil")} />
          <Texte numberOfLines={1} style={{ fontFamily: police.medium, fontSize: 15, marginTop: 3, fontVariant: ["tabular-nums"] }}>
            {hm(durees[ph])}
          </Texte>
          <Texte variante="meta" couleur="t3">{`${Math.round((durees[ph] / auLit) * 100)} %`}</Texte>
        </View>
      ))}
    </View>
  );
  return (
    <>
      <TitreGroupe>{titre}</TitreGroupe>
      <Groupe bloc>
        {nuit.etapes ? (
          <Hypnogramme
            etapes={nuit.etapes}
            libelle={t("mesuresSommeil.hypnoLibelle", { phases: PHASES_HYPNO.map((ph) => `${t(`sante.stade.${ph}` as "sante.stade.eveil")} ${hm(durees[ph])}`).join(", ") })}
          />
        ) : (
          <BarrePhases phases={durees} />
        )}
        {legende}
        {nuit.etapes ? (
          <Texte variante="meta" couleur="t3" style={{ marginTop: 10 }}>
            {nuit.source === "whoop" ? t("mesuresSommeil.deuxSources") : t("mesuresSommeil.uneSource", { source: nuit.origine ? nomSource(nuit.origine) : t("mesures.santeConnect") })}
          </Texte>
        ) : (
          <Note>{nuit.source === "whoop" ? t("mesuresSommeil.whoopSansOrdre") : t("mesuresSommeil.santeSansOrdre")}</Note>
        )}
      </Groupe>
    </>
  );
}

/** La nuit : efficacité, réveils, respiration (la régularité de Whoop n'est plus montrée : un calcul de Whoop). */
function LaNuit({ nuit, respSante }: { nuit: Nuit; respSante: number | null }) {
  const resp = nuit.respiration ?? respSante;
  return (
    <>
      <TitreGroupe>{t("mesuresSommeil.laNuit")}</TitreGroupe>
      <Groupe>
        <Lignes>
          {[
            <LigneMesure
              key="eff"
              titre={t("mesuresSommeil.efficacite")}
              sous={t("mesuresSommeil.efficaciteSous")}
              valeur={approx(`${nombre(nuit.efficacite, 0)} %`, nuit.efficaciteCalculee)}
            />,
            nuit.reveils != null ? <LigneMesure key="rev" titre={t("mesuresSommeil.reveils")} valeur={nombre(nuit.reveils, 0)} /> : null,
            resp != null ? (
              <LigneMesure
                key="resp"
                titre={t("mesuresSommeil.respiration")}
                sous={nuit.respiration != null ? t("mesures.whoop") : t("mesures.santeConnect")}
                valeur={nombre(resp, 1)}
                unite={t("mesuresSommeil.parMin")}
              />
            ) : null,
          ]}
        </Lignes>
      </Groupe>
    </>
  );
}

/** En-tête des statistiques : la moyenne de la période, ou la nuit touchée. */
function Entete({ type, barre, s, prev, objectif }: { type: TypePeriode; barre: BarreSommeil | null; s: StatsNuits; prev: StatsNuits | null; objectif: number }) {
  if (barre) {
    const petit = barre.moyenne ? t("mesuresSommeil.moyenneParNuitDe", { titre: barre.titre }) : libelleNuit(barre.debut);
    if (barre.v == null) return <EnteteStats petit={petit} valeur={t("mesures.pasDeDonnee")} vide ligne={t("mesuresSommeil.nuitSansDonnee")} />;
    const ecart = barre.v >= objectif ? t("mesuresSommeil.objectifAtteint") : t("mesuresSommeil.sousObjectif", { d: hm(objectif - barre.v) });
    const horaires = barre.coucher != null && barre.lever != null ? `${heureDe(barre.debut, barre.coucher)} → ${heureDe(barre.debut, barre.lever)}` : null;
    const ligne = horaires ?? "";
    return (
      <EnteteStats
        petit={petit}
        valeur={hm(barre.v)}
        unite={ecart}
        ligne={ligne || undefined}
        apres={barre.phases ? <Decomp texte={phasesTexte(barre.phases)} /> : null}
      />
    );
  }
  if (s.sommeil == null) return <EnteteStats petit={t("mesures.moyenneDe", { longueur: t(`mesures.longueur.${type}` as "mesures.longueur.semaine") })} valeur={t("mesures.pasDeDonnee")} vide />;
  const dm = prev?.sommeil != null ? s.sommeil - prev.sommeil : null;
  const comp =
    dm == null
      ? undefined
      : `${Math.abs(dm) < 1 ? t("mesures.stable") : `${dm > 0 ? "+" : "−"}${hm(Math.abs(dm))}`} ${t("mesuresSommeil.vsAvant", { avant: t(`mesures.avantDe.${type}`) })}`;
  return (
    <EnteteStats
      petit={t("mesures.moyenneDe", { longueur: t(`mesures.longueur.${type}` as "mesures.longueur.semaine") })}
      valeur={hm(s.sommeil)}
      unite={t("mesuresSommeil.parNuit")}
      ligne={comp}
      apres={s.phases ? <Decomp texte={phasesTexte(s.phases)} /> : null}
    />
  );
}

function Decomp({ texte }: { texte: string }) {
  return (
    <Texte variante="meta" couleur="t3" style={{ marginTop: 4 }}>
      {texte}
    </Texte>
  );
}

function LegendeSommeil({ objectif }: { objectif: number }) {
  const coul = useCouleursPhases();
  return (
    <Cles
      cles={[
        { libelle: t("sante.stade.profond"), carre: coul.profond },
        { libelle: t("sante.stade.leger"), carre: coul.leger },
        { libelle: t("sante.stade.paradoxal"), carre: coul.paradoxal },
        { libelle: t("mesuresSommeil.objectifD", { d: hm(objectif) }), trait: "tiret" },
      ]}
    />
  );
}

/** Heures de coucher et de lever de la période : moyennes et leur écart (± min), une plage par nuit. */
function Horaires({ barres, s }: { barres: readonly BarreSommeil[]; s: StatsNuits }) {
  const [W, setW] = useState(0);
  if (s.coucher == null || s.lever == null) return null;
  // l'heure moyenne d'un coucher (minutes autour du minuit de réveil) se lit sur n'importe quel jour
  const base = new Date(2026, 0, 5).getTime();
  const plus = (ec: number | null) => (ec != null ? t("mesuresSommeil.plusMoins", { n: nombre(ec, 0) }) : undefined);
  return (
    <Groupe bloc>
      <Duo
        gauche={<ValeurDuo avant={t("mesuresSommeil.coucherMoyen")} valeur={heure(base + s.coucher * 60_000)} sous={plus(s.ecCoucher)} />}
        droite={<ValeurDuo droite avant={t("mesuresSommeil.leverMoyen")} valeur={heure(base + s.lever * 60_000)} sous={plus(s.ecLever)} />}
      />
      <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
        {W > 0 ? (
          <GrapheHoraires
            barres={barres}
            largeur={W}
            coucher={s.coucher}
            lever={s.lever}
            libelle={t("mesuresSommeil.horairesLibelle", { coucher: heure(base + s.coucher * 60_000), lever: heure(base + s.lever * 60_000) })}
          />
        ) : (
          <View style={{ height: 150 }} />
        )}
      </View>
      <Note>{t("mesuresSommeil.horairesNote")}</Note>
    </Groupe>
  );
}
