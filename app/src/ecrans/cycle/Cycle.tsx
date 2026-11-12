// La page Cycle (planche cycle, écrans 2a, 2b, 4, 5 et 10), au gabarit des pages de statistiques (comme Récupération,
// Énergie, Pas). De haut en bas :
//   1. le semainier commun (EnteteJour : le jour du cycle sous chaque date ; jamais le futur) ;
//   2. le jour choisi : « Jour 19 · sur 29 en moyenne », la phase en mots simples (« depuis 3 jours »), la frise, « Prochaines
//      règles entre le 8 et le 12 nov. · estimation » ; aujourd'hui, « Ce que ça change aujourd'hui » (Récupération ajustée,
//      moyenne lissée du poids, cible d'Effort qui ne bouge pas ; chaque ligne ouvre sa page) ; « Noter ce jour » ;
//   3. « Statistiques » : 6 cycles, 12 cycles ou Tout ; durée moyenne, une barre par cycle (les règles en plein, la durée
//      habituelle en bande), régularité, durée des règles, prochaines règles, sources ; « Comprendre le suivi du cycle ».
// Rien de noté (ni dans Santé Connect) : l'état vide (écran 5). L'icône calendrier ouvre le calendrier vertical (MoisCycle).
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import { listerPesees } from "../../db/depots/pesees";
import { lireActif, t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useTheme } from "../../theme";
import { police } from "../../theme/typo";
import { BoutonTonal } from "../../ui/BoutonTonal";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Icone } from "../../ui/Icone";
import { Segmente } from "../../ui/Segmente";
import { Texte } from "../../ui/Texte";
import {
  assurerCycleSante, ecrireReglageCycle, isoLocal, lireJoursCycle, lireReglagesCycle, minuitDeIso, REGLAGES_CYCLE_ETEINTS, type ReglagesCycle,
} from "../../cycle/donnees";
import { CYCLE, etatCycle, phase, type Cycle as CycleT, type EtatCycle, type JourCycle, type StatsCycle } from "../../cycle/modele";
import { stats as statsCycles } from "../../cycle/modele";
import { ajustementPoids } from "../../cycle/poids";
import { useApp } from "../contexte";
import { versUnite } from "../format";
import { fixe } from "../composition-vue";
import { lireRecupJour } from "../recup-donnees";
import type { ResultatRecup } from "../recup-pepfit";
import { lireCible } from "../sport-stats-donnees";
import type { Cible } from "../effort-pepfit";
import { texteDemi } from "../mesures/scores-calc";
import { texteRecup } from "../mesures/recup-vue";
import { EnteteJour, useJour } from "../mesures/EnteteJour";
import { ActionTete, Cles, Groupe, LigneMesure, Lignes, PageMesure, TitreGroupe, useDefileVers, useMesure, MARGE } from "../mesures/gabarit";
import { EnteteStats } from "../mesures/Statistiques";
import { minuit } from "../mesures/periodes";
import { formater } from "../../i18n/temps";
import { demanderRegles, lireReglesAppareil, santeDisponible } from "./cycle-appareil";
import { dateCourte, fourchetteCourte, fourchetteLongue, motPhase } from "./cycle-vue";
import { FeuilleCycle, type SaisieCycle } from "./FeuilleCycle";
import { Frise } from "./Frise";
import { IconeTuile } from "./IconeTuile";
import { LienComprendreCycle, TiroirCycle } from "./TiroirCycle";

type Periode = "6" | "12" | "tout";

interface DonneesPage {
  reglages: ReglagesCycle;
  jours: JourCycle[];
  recup: ResultatRecup | null;
  poids: { ajuste: number; brut: number } | null;
  cible: Cible | null;
  /** Santé Connect est sur le téléphone (le bouton « Lire dans Santé Connect »). */
  sante: boolean;
}

/** Tout ce que montre la page aujourd'hui ; relu à l'arrivée et après une saisie. */
function useDonneesCycle(maintenant: number) {
  const { db } = useApp();
  const [d, setD] = useState<DonneesPage | null>(null);
  const [version, setVersion] = useState(0);
  const relire = () => setVersion((v) => v + 1);
  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      const auj = minuit(maintenant);
      const lire = async (): Promise<DonneesPage> => {
        const [reglages, jours, recup, pesees, cible, sante] = await Promise.all([
          lireReglagesCycle(db).catch(() => REGLAGES_CYCLE_ETEINTS),
          lireJoursCycle(db),
          lireRecupJour(db, auj).catch(() => null),
          listerPesees(db).catch(() => []),
          lireCible(db, auj, maintenant).catch(() => null),
          santeDisponible(),
        ]);
        const aj = ajustementPoids(
          pesees.map((p) => ({ date: p.date, valeur: p.kg })),
          jours,
          isoLocal(maintenant),
        );
        const der = aj?.pesees.at(-1);
        return { reglages, jours, recup, poids: der ? { ajuste: der.ajuste, brut: der.brut } : null, cible, sante };
      };
      lire()
        .then((x) => vivant && setD(x))
        .catch(console.error);
      // Santé Connect en fond (source allumée, autorisation déjà donnée) : la page relue s'il apporte du neuf
      assurerCycleSante(db, lireReglesAppareil, maintenant)
        .then((n) => (n > 0 && vivant ? lire().then((x) => vivant && setD(x)) : undefined))
        .catch(console.error);
      return () => {
        vivant = false;
      };
    }, [db, maintenant, version]),
  );
  return { d, relire };
}

export function Cycle() {
  useLangue();
  const { db } = useApp();
  const [maintenant] = useState(() => Date.now());
  const { jour, aujourdhui, choisir } = useJour(maintenant);
  const { d, relire } = useDonneesCycle(maintenant);
  const defile = useDefileVers();
  const [tiroir, setTiroir] = useState(false);
  const [saisie, setSaisie] = useState<SaisieCycle | null>(null);
  const [periode, setPeriode] = useState<Periode>("6");
  const [largeur, setLargeur] = useState(0);
  const [santeRien, setSanteRien] = useState(false);
  const auj = isoLocal(maintenant);
  const date = isoLocal(jour);
  const actions = (avecCalendrier: boolean) => (
    <>
      {avecCalendrier ? <ActionTete nom="cal" libelle={t("cycle.calendrier")} onPress={() => router.push("/sante/cycle-mois")} /> : null}
      <ActionTete nom="info" libelle={t("cycle.comprendre")} onPress={() => setTiroir(true)} />
    </>
  );
  // une saisie depuis la page allume le suivi s'il était éteint (activable par tout le monde, D2)
  const apresSaisie = () => {
    if (d && !d.reglages.suivi) void ecrireReglageCycle(db, "suivi", true).catch(console.error);
    relire();
  };
  const feuille = <FeuilleCycle saisie={saisie} jours={d?.jours ?? []} onFermer={() => setSaisie(null)} onEnregistre={apresSaisie} maintenant={maintenant} />;

  if (!d)
    return (
      <PageMesure titre={t("cycle.titre")} actions={actions(false)}>
        <View style={{ height: 420 }} />
      </PageMesure>
    );

  const e = etatCycle(d.jours, date, auj);
  if (!e.episodes.length) {
    const lireSante = async () => {
      if (!(await demanderRegles())) return;
      await ecrireReglageCycle(db, "santeConnect", true);
      if (!d.reglages.suivi) await ecrireReglageCycle(db, "suivi", true);
      const n = await assurerCycleSante(db, lireReglesAppareil, Date.now(), true);
      setSanteRien(n === 0);
      relire();
    };
    return (
      <PageMesure titre={t("cycle.titre")} actions={actions(false)}>
        <Vide onNoter={() => setSaisie({ sorte: "regles" })} onSante={d.sante ? () => void lireSante().catch(console.error) : null} santeRien={santeRien} />
        <TiroirCycle visible={tiroir} onFermer={() => setTiroir(false)} etat={null} />
        {feuille}
      </PageMesure>
    );
  }

  const ePourJour = (j: number): string | null => {
    if (j > maintenant) return null;
    const p = phase(isoLocal(j), e.cycles, CYCLE, e.prevision);
    return p ? String(p.j) : "–";
  };
  const ph = e.phase;
  const enCours = ph?.cycle.enCours ?? false;
  const pv = d.reglages.prevision ? e.prevision : ({ possible: false, raison: "aucun" } as const);
  const noter = () => {
    const ep = e.episodes.find((x) => x.debut <= date && date <= x.fin);
    setSaisie(ep ? { sorte: "regles", episode: ep } : { sorte: "jour", jour: date });
  };

  return (
    <PageMesure titre={t("cycle.titre")} actions={actions(true)} defilement={defile.page}>
      <EnteteJour jour={jour} maintenant={maintenant} onJour={choisir} valeur={ePourJour}>
        <View onLayout={(x) => setLargeur(Math.floor(x.nativeEvent.layout.width) - 2 * MARGE)}>
          {ph ? (
            <View style={styles.hero} accessible accessibilityLabel={`${t("cycle.jourN", { j: ph.j })}, ${motPhase(ph.nom)}`}>
              <Texte style={styles.jour}>
                {t("cycle.jourN", { j: ph.j })}
                {e.stats.moyenne != null ? <Texte couleur="t2" style={styles.surMoyenne}>{`  ${t("cycle.surMoyenne", { n: Math.round(e.stats.moyenne) })}`}</Texte> : null}
              </Texte>
              {motPhase(ph.nom) ? (
                <Texte variante="corps" style={styles.phase}>
                  {motPhase(ph.nom)}
                  {e.depuis != null ? <Texte variante="corps" couleur="t3" style={[styles.phase, { fontFamily: police.regular }]}>{`, ${tp("cycle.depuis", e.depuis)}`}</Texte> : null}
                </Texte>
              ) : null}
            </View>
          ) : (
            <View style={styles.hero}>
              <Texte variante="corps" couleur="t2">
                {t("mesures.pasDeDonnee")}
              </Texte>
            </View>
          )}
          {ph && largeur > 0 ? (
            <View style={styles.frise}>
              <Frise etat={{ ...e, prevision: pv }} largeur={largeur} libelle={aujourdhui ? undefined : dateCourte(date)} />
            </View>
          ) : null}
          {ph && enCours && d.reglages.prevision ? <Prevu e={e} /> : null}
        </View>
        {aujourdhui ? <Effets d={d} /> : null}
        <BoutonTonal icone="plus" libelle={t("cycle.noterJour")} onPress={noter} style={styles.noter} />
      </EnteteJour>
      <View ref={defile.cible}>
        <Statistiques e={e} periode={periode} onPeriode={setPeriode} largeur={largeur} prevision={d.reglages.prevision} />
      </View>
      <LienComprendreCycle onPress={() => setTiroir(true)} />
      <TiroirCycle visible={tiroir} onFermer={() => setTiroir(false)} etat={etatCycle(d.jours, auj, auj)} />
      {feuille}
    </PageMesure>
  );
}

/** « Prochaines règles  entre le 8 et le 12 nov.   estimation » ; sans prévision possible, pourquoi. */
function Prevu({ e }: { e: EtatCycle }) {
  const { couleurs } = useTheme();
  const pv = e.prevision;
  return (
    <View style={styles.prevu} accessible>
      <Texte variante="corps" couleur="t2" style={{ fontSize: 13 }}>
        {pv.possible ? t("cycle.prochaines") : pv.raison === "variable" ? t("cycle.tropVariable") : t("cycle.prochaines")}
      </Texte>
      {pv.possible ? (
        <Texte variante="corps" style={{ fontSize: 13, color: couleurs.t1, fontFamily: police.semibold, flexShrink: 1 }}>
          {fourchetteLongue(pv)}
        </Texte>
      ) : pv.raison === "aucun" ? (
        <Texte variante="corps" couleur="t2" style={{ fontSize: 13 }}>
          {t("cycle.apresUnCycle")}
        </Texte>
      ) : null}
      {pv.possible ? (
        <Texte variante="meta" couleur="t3" style={{ marginLeft: "auto" }}>
          {t("cycle.estimation")}
        </Texte>
      ) : null}
    </View>
  );
}

/** « Ce que ça change aujourd'hui » : chaque ligne seulement si elle s'applique ; chaque ligne ouvre sa page. */
function Effets({ d }: { d: DonneesPage }) {
  const u = lireActif().poids;
  const r = d.recup;
  const lignes = [
    d.reglages.recup && r?.ajuste && r.score != null ? (
      <LigneMesure
        key="r"
        avant={<IconeTuile nom="pouls" />}
        titre={t("cycle.change.recup")}
        sous={t("cycle.change.recupSous")}
        valeur={texteRecup(r.score)}
        sousValeur={r.ajuste.sans != null ? t("cycle.change.sinon", { v: texteRecup(r.ajuste.sans) }) : undefined}
        libelle={t("cycle.change.luRecup", { v: texteRecup(r.score), sans: r.ajuste.sans != null ? texteRecup(r.ajuste.sans) : t("cycle.recup.sansScore") })}
        onPress={() => router.push("/sante/recuperation")}
      />
    ) : null,
    d.reglages.poids && d.poids ? (
      <LigneMesure
        key="p"
        avant={<IconeTuile nom="balance" />}
        titre={t("cycle.change.poids")}
        sous={t("cycle.change.poidsSous")}
        valeur={fixe(versUnite(d.poids.ajuste, u), 1)}
        unite={u}
        sousValeur={t("cycle.change.sinon", { v: `${fixe(versUnite(d.poids.brut, u), 1)} ${u}` })}
        libelle={t("cycle.change.luPoids", { v: `${fixe(versUnite(d.poids.ajuste, u), 1)} ${u}`, sans: `${fixe(versUnite(d.poids.brut, u), 1)} ${u}` })}
        onPress={() => router.push("/sante/poids")}
      />
    ) : null,
    d.cible ? (
      <LigneMesure
        key="c"
        avant={<IconeTuile nom="eclair" />}
        titre={t("cycle.change.cible")}
        sous={t("cycle.change.cibleSous")}
        valeur={t("cycle.change.cibleValeur", { bas: texteDemi(d.cible.bas), haut: texteDemi(d.cible.haut) })}
        libelle={t("cycle.change.luCible", { v: t("cycle.change.cibleValeur", { bas: texteDemi(d.cible.bas), haut: texteDemi(d.cible.haut) }) })}
        onPress={() => router.push("/sante/effort")}
      />
    ) : null,
  ].filter((x) => x != null);
  if (!lignes.length) return null;
  return (
    <>
      <TitreGroupe>{t("cycle.change")}</TitreGroupe>
      <Groupe>
        <Lignes>{lignes}</Lignes>
      </Groupe>
    </>
  );
}

/** Les statistiques : 6 cycles, 12 cycles ou Tout. */
function Statistiques({ e, periode, onPeriode, largeur, prevision }: { e: EtatCycle; periode: Periode; onPeriode: (p: Periode) => void; largeur: number; prevision: boolean }) {
  const m = useMesure();
  const s = statsCycles(e.cycles, periode === "tout" ? Number.POSITIVE_INFINITY : Number(periode));
  const libelle = periode === "tout" ? t("cycle.stats.tousCycles", { n: s.n }) : t(periode === "6" ? "cycle.stats.n6" : "cycle.stats.n12");
  const pv = e.prevision;
  return (
    <>
      <TitreGroupe>{t("cycle.stats")}</TitreGroupe>
      <Segmente<Periode>
        doux
        options={[
          { valeur: "6", libelle: t("cycle.stats.n6") },
          { valeur: "12", libelle: t("cycle.stats.n12") },
          { valeur: "tout", libelle: t("cycle.stats.tout") },
        ]}
        valeur={periode}
        onChange={onPeriode}
        style={{ marginHorizontal: MARGE, marginTop: 8 }}
      />
      <View style={{ marginHorizontal: MARGE, marginTop: 14 }}>
        {s.n ? (
          <EnteteStats
            petit={t("cycle.stats.dureeMoyenne", { periode: libelle })}
            valeur={String(Math.round(s.moyenne!))}
            unite={t("cycle.jours")}
            ligne={t("cycle.stats.deA", { min: s.min!, max: s.max! })}
          />
        ) : (
          <EnteteStats petit={t("cycle.stats.dureeMoyenne", { periode: libelle })} valeur={t("cycle.stats.aucun")} vide />
        )}
      </View>
      {s.n && largeur > 0 ? (
        <View style={{ marginHorizontal: MARGE, marginTop: 18 }}>
          <GrapheCycles s={s} largeur={largeur} />
        </View>
      ) : null}
      {s.n ? (
        <Cles
          style={{ marginHorizontal: MARGE }}
          cles={[
            { libelle: t("cycle.cle.regles"), carre: m.fort },
            { libelle: t("cycle.cle.reste"), carre: m.doux },
            { libelle: t("cycle.cle.habituelle"), carre: m.voile },
          ]}
        />
      ) : null}
      <Groupe style={{ marginTop: 20 }}>
        <Lignes>
          {[
            s.mot && s.sd != null ? (
              <LigneMesure
                key="reg"
                titre={t("cycle.regularite")}
                sous={t("cycle.regulariteSous")}
                valeur={t(`cycle.mot.${s.mot}` as "cycle.mot.regulier")}
                sousValeur={tp("cycle.plusMoins", Math.round(s.sd * 10) / 10)}
              />
            ) : null,
            s.regles != null ? (
              <LigneMesure key="dr" titre={t("cycle.dureeRegles")} sous={t("cycle.enMoyenne")} valeur={tp("cycle.joursN", Math.round(s.regles))} />
            ) : null,
            prevision && pv.possible ? (
              <LigneMesure
                key="pv"
                titre={t("cycle.prochaines")}
                sous={pv.n > 1 ? t("cycle.estimationSur", { n: pv.n }) : t("cycle.estimationSur1")}
                valeur={fourchetteCourte(pv)}
                sousValeur={tp("cycle.plusMoins", pv.fourchette)}
              />
            ) : null,
            <LigneMesure
              key="src"
              titre={t("cycle.sources")}
              sous={t("cycle.sourcesSous")}
              valeur={tp("cycle.nCycles", e.cycles.length)}
              onPress={() => router.push({ pathname: "/sante/cycle-mois", params: { vue: "liste" } })}
            />,
          ]}
        </Lignes>
      </Groupe>
    </>
  );
}

/** Une barre par cycle : sa durée (pâle, la dernière un peu plus soutenue), ses règles en bas en plein ; la durée habituelle
 * (moyenne ± écart type) en bande ; la durée au-dessus, le mois dessous. */
function GrapheCycles({ s, largeur }: { s: StatsCycle; largeur: number }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const H = 196;
  const haut = 26;
  const bas = 166;
  const f: CycleT[] = s.faits;
  const hi = Math.max(34, (s.max ?? 30) + 3);
  const y = (v: number) => bas - (v / hi) * (bas - haut);
  const pasX = largeur / f.length;
  const lb = Math.max(4, Math.min(34, pasX - 18));
  const sd = s.sd ?? 0;
  const mois = (d: string) => formater(minuitDeIso(d) + 12 * 3_600_000, { month: "short" });
  return (
    <Svg width={largeur} height={H} accessible accessibilityRole="image" accessibilityLabel={t("cycle.stats.graphe", { min: s.min ?? 0, max: s.max ?? 0 })}>
      {sd > 0 ? <Rect x={0} y={y(s.moyenne! + sd)} width={largeur} height={y(s.moyenne! - sd) - y(s.moyenne! + sd)} fill={m.voile} /> : null}
      <Line x1={0} x2={largeur} y1={bas} y2={bas} stroke={couleurs.line} />
      {f.map((c, i) => {
        const cx = pasX * i + pasX / 2;
        const der = i === f.length - 1;
        return (
          <G key={c.debut}>
            <Rect x={cx - lb / 2} y={y(c.duree!)} width={lb} height={bas - y(c.duree!)} rx={6} fill={m.fort} fillOpacity={der ? 0.5 : 0.3} />
            {c.regles != null ? <Rect x={cx - lb / 2} y={y(c.regles)} width={lb} height={bas - y(c.regles)} rx={6} fill={m.fort} /> : null}
            {f.length <= 12 ? (
              <SvgText x={cx} y={y(c.duree!) - 8} textAnchor="middle" fontSize={12} fontFamily={police.semibold} fill={couleurs.t1}>
                {String(c.duree)}
              </SvgText>
            ) : null}
            {f.length <= 12 || i % Math.ceil(f.length / 8) === 0 ? (
              <SvgText x={cx} y={H - 4} textAnchor="middle" fontSize={11} fontFamily={der ? police.semibold : police.regular} fill={der ? couleurs.t1 : couleurs.t3}>
                {mois(c.debut)}
              </SvgText>
            ) : null}
          </G>
        );
      })}
    </Svg>
  );
}

/** L'état vide (écran 5) : suivi allumé, rien de noté, rien dans Santé Connect. */
function Vide({ onNoter, onSante, santeRien }: { onNoter: () => void; onSante: (() => void) | null; santeRien: boolean }) {
  const { couleurs } = useTheme();
  return (
    <>
      <View style={styles.vide}>
        <Texte style={styles.videTitre}>{t("cycle.vide.titre")}</Texte>
        <Texte variante="corps" couleur="t2" style={styles.videTexte}>
          {t("cycle.vide.texte")}
        </Texte>
        <BoutonPrincipal icone="plus" libelle={t("cycle.vide.noter")} onPress={onNoter} style={{ marginTop: 22 }} />
        {onSante ? <BoutonTonal libelle={t("cycle.vide.sante")} onPress={onSante} style={{ marginTop: 10 }} /> : null}
        {santeRien ? (
          <Texte variante="meta" couleur="t2" style={{ marginTop: 8 }}>
            {t("cycle.vide.santeRien")}
          </Texte>
        ) : null}
      </View>
      <Groupe style={{ marginTop: 28 }}>
        <Lignes>
          {[
            <LigneMesure key="r" avant={<IconeTuile nom="pouls" />} titre={t("cycle.change.recup")} sous={t("cycle.vide.recupSous")} />,
            <LigneMesure key="p" avant={<IconeTuile nom="balance" />} titre={t("cycle.vide.poids")} sous={t("cycle.vide.poidsSous")} />,
            <LigneMesure key="c" avant={<IconeTuile nom="cal" />} titre={t("cycle.prochaines")} sous={t("cycle.vide.prevSous")} />,
          ]}
        </Lignes>
      </Groupe>
      <View style={styles.note}>
        <Icone nom="cadenas" couleur={couleurs.t3} taille={14} />
        <Texte variante="meta" couleur="t3" style={{ flex: 1, lineHeight: 18 }}>
          {t("cycle.vide.garde")}
        </Texte>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: 10, marginHorizontal: MARGE },
  jour: { fontSize: 46, lineHeight: 50, fontFamily: police.semibold, letterSpacing: -1.4, fontVariant: ["tabular-nums"] },
  surMoyenne: { fontSize: 17, fontFamily: police.medium, letterSpacing: 0 },
  phase: { fontSize: 15, fontFamily: police.medium, marginTop: 4 },
  frise: { marginTop: 18, marginHorizontal: MARGE },
  prevu: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, marginHorizontal: MARGE, flexWrap: "wrap" },
  noter: { marginTop: 18, marginHorizontal: MARGE },
  vide: { marginTop: 26, marginHorizontal: MARGE },
  videTitre: { fontSize: 20, lineHeight: 26, fontFamily: police.semibold, letterSpacing: -0.2 },
  videTexte: { fontSize: 13.5, lineHeight: 20, marginTop: 8 },
  note: { flexDirection: "row", gap: 6, marginTop: 8, marginHorizontal: MARGE, alignItems: "flex-start" },
});

