// Page Énergie (planche pas, variante A validée le 28/10 ; mesures.js ENERGIE_DEF ; retour du 29/10) : en tête le
import { bilanAffiche, chiffresNutrition, useChiffresNutrition } from "../nutrition/mode-affichage";
// semainier commun et le jour choisi (EnteteJour : glissé d'un jour à l'autre, jamais le futur ; paramètre de route `jour`),
// l'icône agenda ouvre la page agenda ; le bilan du jour choisi (jourEnergie) : son solde en chiffre fort, apports (vert Nutrition) et dépense (nuances d'orange de couleursSante) sur un même rail, la dépense
// en quatre termes et les apports par repas ; statistiques par semaine, mois, année ; le cumul de la période et son
// équivalent estimé en poids face à la balance ; les lignes ; les sources. Sans métabolisme : ce qui manque au profil.
// Jour en cours (demande d'Alex du 04/11) : le réel en plein, le prévu jusqu'à minuit en tirets (energie-prevu.ts) : reste
// du métabolisme, séances prévues, pas habituels, digestion, apports habituels ; le solde ne compte que le réel.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type ScrollViewInstance } from "react-native";
import { lireReglage } from "../../db/depots/reglages";
import { t, tp } from "../../i18n/index";
import { formater } from "../../i18n/temps";
import { useLangue } from "../../i18n/useLangue";
import { sante } from "../../natif/sante";
import { police } from "../../theme/typo";
import { Texte } from "../../ui/Texte";
import { cleJour } from "../../nutrition/calculs";
import { REGLAGE } from "../../whoop/constantes";
import { journalWhoopGarde } from "../../whoop/lecture";
import { jourMoisChiffres } from "../composition-vue";
import { etatSanteConnect } from "../Composition";
import { DELAI_CHARGE_MS, useApp, useCharge } from "../contexte";
import { echelleBarres, segmentsDepense } from "../energie-calc";
import { libelleMethode, signeEstime } from "../FeuilleEnergie";
import { approx, nombre } from "../format";
import { autoriserSante, etatEnergie, listeManques, nomSource, routeManque, type JourEnergie } from "../sante-donnees";
import type { Prevu } from "../energie-prevu";
import { lirePrevus } from "./energie-prevu-donnees";
import { BarreSegments, Point } from "../sante-ui";
import { jourDeRoute } from "./agenda-liste";
import { ouvrirAgenda } from "./agenda-store";
import { EnteteJour, useJour } from "./EnteteJour";
import {
  ActionTete, BlocVide, BoutonPlein, Cles, Duo, EnPanne, Groupe, Heros, LigneAjout, LigneMesure, Lignes, MARGE, Note, Os, PageMesure, Quand,
  TitreGroupe, useDefileVers, useMesure, ValeurDuo,
} from "./gabarit";
import { CourbeCumul, GrapheSemaineEnergie, GrapheSoldeEnergie, useCouleursEnergie, type BarreEnergie } from "./GraphesEnergie";
import { lireDepenseHabitude, lireDetailJour, lireJoursEnergie, lireObjectifEnergie, lirePoidsLisse, type DetailJour } from "./energie-donnees";
import { BlocObjectifDepense, FeuilleObjectifDepense } from "./ObjectifDepense";
import {
  bonneJournee, cumulSoldes, depenseMoyenne, grapheApportsDepense, KCAL_KG, moyenneMois, motSolde, statsEnergie, variationBalance, type JourE, type StatsEnergie,
} from "./energie-stats";
import { bornes, decaler, joursEntre, minuit, periode, periodeExiste, signe, type Periode, type TypePeriode } from "./periodes";
import { LigneSurlignee, useLignesChangees } from "./LignesChangees";
import { EnteteStats, Statistiques, useStats } from "./Statistiques";
import { MiniPrecision } from "../precision/MiniPrecision";
import { sousPas, sousSport as sousSportTexte } from "../activites-vue";

const kc = (v: number, estime = false) => approx(nombre(v, 0), estime);
const mot = (v: number) => t(`energie.${motSolde(v)}` as "energie.deficit");

/** Données d'une période et de celle d'avant (pour « avant : … »), lues en cache ; squelette au-delà de 300 ms. */
function usePeriodeEnergie(type: TypePeriode, k: number, maintenant: number) {
  const { db } = useApp();
  const [jours, setJours] = useState<Map<number, JourE | null>>(new Map());
  const [lent, setLent] = useState(false);
  const [pret, setPret] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    let vivant = true;
    setPret(false);
    const minuterie = setTimeout(() => vivant && setLent(true), 300);
    (async () => {
      const a = bornes(type, k, maintenant);
      const b = bornes(type, k + 1, maintenant);
      const ici = joursEntre(a.debut, Math.min(a.fin, decaler(minuit(maintenant), 1)));
      const m = await lireJoursEnergie(db, ici, maintenant);
      // sans balance lisible, pas de comparaison ; l'échec se journalise (revue finale n° 16)
      const lisse = await lirePoidsLisse(db, ici).catch((e: unknown) => (console.error(e), { avant: null, fin: null }));
      if (!vivant) return;
      setJours(m);
      setBalance(variationBalance(lisse.avant, lisse.fin));
      setPret(true);
      // la période d'avant (« avant : … ») ensuite : l'année se montre sans attendre ses 365 jours de plus
      const av = await lireJoursEnergie(db, joursEntre(b.debut, b.fin), maintenant);
      if (vivant) setJours(new Map([...av, ...m]));
    })()
      .catch(console.error)
      .finally(() => {
        clearTimeout(minuterie);
        if (vivant) setLent(false);
      });
    return () => {
      vivant = false;
      clearTimeout(minuterie);
    };
  }, [db, type, k, maintenant]);
  return { jours, lent, pret, balance };
}

/** Barres d'une période : un jour (7, 30 jours) ou un mois (moyenne par jour des jours avec journal). */
function barresDe(p: Periode<JourE>, prevus?: ReadonlyMap<number, Prevu> | null): BarreEnergie[] {
  return p.barres.map((b) => {
    if (p.type === "annee") {
      const m = moyenneMois(b.jours.map((j) => j.donnee));
      return { v: m?.solde ?? null, app: m?.app ?? null, dep: m?.dep ?? 0, comp: m?.comp ?? { bmr: 0, sport: 0, neat: 0, digestion: 0 }, etiquette: b.etiquette, enCours: b.enCours, aVenir: b.aVenir };
    }
    const d = b.jours[0]?.donnee ?? null;
    const pv = p.type === "semaine" ? prevus?.get(b.debut) : null;
    const prevu = pv
      ? { app: pv.apports, dep: pv.depense, comp: { bmr: pv.bmr, sport: pv.sport, neat: pv.neat, digestion: pv.digestion }, seances: pv.seances.map((s) => s.nom) }
      : null;
    return { v: d?.solde ?? null, app: d?.apports ?? null, dep: d?.depense ?? 0, comp: d?.comp ?? { bmr: 0, sport: 0, neat: 0, digestion: 0 }, etiquette: b.etiquette, enCours: b.enCours, aVenir: b.aVenir, prevu };
  });
}

export function Energie() {
  useLangue();
  const { db } = useApp();
  const e = useCouleursEnergie();
  const chiffres = useChiffresNutrition();
  const maintenant = useRef(Date.now()).current;
  const auj = minuit(maintenant);
  const params = useLocalSearchParams<{ jour?: string }>();
  const { jour, aujourdhui: ajd, choisir } = useJour(maintenant, jourDeRoute(params.jour));
  const d = useDefileVers();
  const haut = useRef<ScrollViewInstance | null>(null);
  const stats = useStats<TypePeriode>("semaine");

  const [x, recharger, panne] = useCharge(async (db) => {
    const [objectif, premier, whoop, journal, sc] = await Promise.all([
      lireObjectifEnergie(db),
      db.getFirstAsync<{ d: string | null }>("SELECT MIN(date) AS d FROM consommations", []),
      lireReglage(db, REGLAGE.connecte),
      journalWhoopGarde(db).catch(() => false),
      etatSanteConnect(),
    ]);
    const methode = await lireReglage(db, "sante_bmr_methode");
    const p = premier?.d ? premier.d.split("-").map(Number) : null;
    return {
      objectif,
      premier: p ? new Date(p[0]!, p[1]! - 1, p[2]!).getTime() : null,
      // relié, ou déconnecté avec son journal gardé : ses mesures servent encore
      whoop: whoop === "1" || journal,
      sc,
      methode,
    };
  }, [], undefined, "sante/energie");

  const { jours, lent, pret, balance } = usePeriodeEnergie(stats.type, stats.k, maintenant);
  const lire = (j: number) => jours.get(j) ?? null;
  const p = useMemo(() => periode<JourE>(stats.type, stats.k, maintenant, lire, (v) => v.solde), [stats.type, stats.k, jours]); // eslint-disable-line react-hooks/exhaustive-deps
  const avant = useMemo(() => periode<JourE>(stats.type, stats.k + 1, maintenant, lire, (v) => v.solde), [stats.type, stats.k, jours]); // eslint-disable-line react-hooks/exhaustive-deps
  // le prévu du jour en cours et des jours à venir de la semaine (lu plus bas, une fois le bilan du jour là)
  const [prevus, setPrevus] = useState<Map<number, Prevu> | null>(null);
  const barres = barresDe(p, chiffres ? prevus : null);
  const obj = x?.objectif.solde ?? null;
  const s = statsEnergie(p.jours.map((j) => j.donnee), obj);
  const dm = depenseMoyenne(p.jours.map((j) => j.donnee));
  // sans journal sur la période, Mois et Année montrent la dépense (barres de la semaine) plutôt qu'un graphe vide
  const barresJour = grapheApportsDepense(stats.type, barres.map((b) => b.v));
  const sAvant = statsEnergie(avant.jours.map((j) => j.donnee), obj);

  // le jour choisi : son bilan et ses repas, et les soldes de sa semaine (pastilles du semainier) ; relus au retour sur la page
  const [lu, setLu] = useState<{ jour: number; detail: DetailJour; semaine: Map<number, JourE | null> } | null>(null);
  // lecture du jour en échec, ou sans réponse en 10 s : « Réessayer » à la place du squelette (docs/PAS-CHARGEMENT.md)
  const [luPanne, setLuPanne] = useState(false);
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    if (!x) return;
    let vivant = true;
    setLuPanne(false);
    const minuteur = setTimeout(() => vivant && setLuPanne(true), DELAI_CHARGE_MS);
    const lundi = decaler(jour, -((new Date(jour).getDay() + 6) % 7));
    const semaine = Array.from({ length: 7 }, (_, i) => decaler(lundi, i)).filter((j) => j <= auj);
    Promise.all([lireDetailJour(db, jour, maintenant), lireJoursEnergie(db, semaine, maintenant)])
      .then(([detail, sem]) => vivant && (setLu({ jour, detail, semaine: sem }), setLuPanne(false)))
      .catch((e: unknown) => (console.error(e), vivant && setLuPanne(true)))
      .finally(() => clearTimeout(minuteur));
    return () => {
      vivant = false;
      clearTimeout(minuteur);
    };
  }, [db, x, jour, auj, maintenant, essai]);
  const detail = lu?.jour === jour ? lu.detail : null;
  // le prévu se lit avec le bilan du jour en cours (le sien, ou relu si la page s'ouvre sur un autre jour) ; relu au retour
  const bilanAuj = lu?.jour === auj && lu.detail.etat.etat === "bilan" ? lu.detail.etat.e : null;
  const prevuLu = useRef(false);
  useEffect(() => {
    if (!x || (!bilanAuj && prevuLu.current)) return;
    let vivant = true;
    const lundiProchain = decaler(auj, 7 - ((new Date(auj).getDay() + 6) % 7));
    (async () => {
      const e = bilanAuj ?? (await etatEnergie(db, auj, maintenant).then((s) => (s.etat === "bilan" ? s.e : null)));
      if (!e) return;
      const m = await lirePrevus(db, joursEntre(auj, lundiProchain), maintenant, e);
      if (vivant) (prevuLu.current = true), setPrevus(m);
    })().catch((e: unknown) => console.error(e));
    return () => {
      vivant = false;
    };
  }, [db, x, auj, maintenant, bilanAuj]);
  const etat = detail?.etat;
  // l'objectif de dépense du jour choisi : sa journée d'habitude (la référence de la jauge de Sport)
  const [habitude, setHabitude] = useState<{ jour: number; v: number | null } | null>(null);
  const [objectifOuvert, setObjectifOuvert] = useState(false);
  useEffect(() => {
    let vivant = true;
    lireDepenseHabitude(db, jour, maintenant)
      .then((v) => vivant && setHabitude({ jour, v }))
      .catch((e: unknown) => (console.error(e), vivant && setHabitude({ jour, v: null })));
    return () => {
      vivant = false;
    };
  }, [db, jour, maintenant]);
  const ref = habitude?.jour === jour ? habitude.v : null;
  const depenseJour = etat?.etat === "bilan" ? etat.e.bilan.depense : null;
  // les statistiques ne dépendent pas du jour : elles restent pendant la lecture d'un autre jour
  const avecBilan = lu?.detail.etat.etat === "bilan";
  const precedent = periodeExiste(stats.type, stats.k + 1, maintenant, x?.premier ?? null);
  // un jour touché dans l'agenda : il s'affiche en tête, la page remonte
  const montrerJour = (j: number) => {
    choisir(j);
    haut.current?.scrollTo({ y: 0, animated: false });
  };
  const agenda = () =>
    ouvrirAgenda({
      titre: t("sante.energie"),
      maintenant,
      premier: x?.premier ?? null,
      legende: t(obj != null ? "energie.agendaObjectif" : "energie.agendaDeficit"),
      lire: async (debut, fin) => {
        const l = joursEntre(debut, Math.min(fin, decaler(auj, 1)));
        const m = await lireJoursEnergie(db, l, maintenant);
        return l.flatMap((j) => {
          const v = m.get(j);
          if (!chiffresNutrition()) return v ? [{ date: j, texte: `${kc(v.depense)} ${t("sante.kcal")}`, sous: t("sante.depense"), bon: true }] : [];
          if (v?.solde == null) return [];
          return [
            {
              date: j,
              texte: `${signe(v.solde)} ${t("sante.kcal")}`,
              sous: `${t("sante.apports")} ${kc(v.apports ?? 0)}, ${t("sante.depense")} ${kc(v.depense)}`,
              bon: bonneJournee(v.solde, obj),
            },
          ];
        });
      },
      onJour: montrerJour,
    });

  return (
    <PageMesure
      halo="energie"
      titre={t("sante.energie")}
      actions={
        <>
          <ActionTete nom="cal" libelle={t("mesures.agenda")} onPress={agenda} />
          <ActionTete nom="cible" libelle={t("energie.objectifDepense")} onPress={() => setObjectifOuvert(true)} />
        </>
      }
      defilement={(v) => {
        d.page(v);
        haut.current = v;
      }}
    >
      <EnteteJour jour={jour} maintenant={maintenant} onJour={choisir} avecDonnee={(j) => lu?.semaine.get(j)?.solde != null}>
        {ajd ? <Quand texte={t("energie.journeeEnCours")} /> : null}
        {!etat && ((!x && panne) || luPanne) ? (
          <EnPanne onReessayer={() => (x ? setEssai((n) => n + 1) : void recharger().catch(console.error))} />
        ) : !etat ? (
          <View style={{ marginHorizontal: MARGE, marginTop: 10, minHeight: 96, justifyContent: "center", gap: 12 }} accessibilityLabel={t("mesures.chargement")}>
            <Os largeur={168} hauteur={52} rayon={8} />
            <Os largeur={220} hauteur={14} />
          </View>
        ) : etat.etat === "a-completer" ? (
          <View style={{ marginHorizontal: 0 }}>
            <BlocVide titre={t("energie.aCompleterTitre")} texte={t("sante.aCompleter", { liste: listeManques(etat.manques) })} />
            <BoutonPlein libelle={t("sante.completer")} onPress={() => router.push(routeManque(etat.manques))} style={{ marginHorizontal: MARGE }} />
          </View>
        ) : (
          <Jour
            jour={jour}
            etat={etat}
            repas={detail!.repas}
            objectif={x?.objectif ?? { cible: null, rythme: null, solde: null }}
            habitude={ref}
            prevu={jour === auj ? (prevus?.get(auj) ?? null) : null}
            onObjectifDepense={() => setObjectifOuvert(true)}
            // un jour passé : l'ajout s'ouvre à sa date
            onAjouter={() => (ajd ? router.navigate("/food") : router.push({ pathname: "/nutrition/ajouter", params: { date: cleJour(new Date(jour)) } }))}
          />
        )}
      </EnteteJour>

      {avecBilan && chiffres ? (
        <View ref={d.cible}>
          <Statistiques<TypePeriode>
            lundi={stats.type === "semaine" ? p.debut : null}
            periodes={(["semaine", "mois", "annee"] as const).map((v) => ({ valeur: v, libelle: t(`mesures.periode.${v}`) }))}
            type={stats.type}
            onType={stats.choisirType}
            titre={p.titre}
            precedent={precedent}
            onAller={stats.aller}
            k={stats.k}
            nb={barres.length}
            sel={stats.sel}
            onSel={stats.setSel}
            cle={`${stats.type}:${stats.k}:${pret ? 1 : 0}`}
            libelleGraphe={libelleGraphe(stats.type, barresJour, p.titre)}
            entete={lent && !pret ? <Os largeur={160} hauteur={34} rayon={8} style={{ marginTop: 18 }} /> : <Entete p={p} barres={barres} s={s} dm={dm} sel={stats.sel} />}
            graphe={(w) =>
              barresJour ? (
                <GrapheSemaineEnergie barres={barres} largeur={w} cle={`${stats.type}:${stats.k}`} pret={pret} sel={stats.sel} libelle={libelleGraphe(stats.type, barresJour, p.titre)} />
              ) : (
                <GrapheSoldeEnergie
                  barres={barres}
                  largeur={w}
                  cle={`${stats.type}:${stats.k}`}
                  pret={pret}
                  sel={stats.sel}
                  objectif={obj}
                  annee={stats.type === "annee"}
                  libelle={t(stats.type === "annee" ? "energie.grapheMois" : "energie.grapheSolde", { titre: p.titre })}
                />
              )
            }
            legende={
              barresJour ? (
                <View style={styles.legende}>
                  <Cles cles={[{ libelle: t("energie.legApports"), carre: e.apports }]} style={{ marginTop: 0 }} />
                  <View style={styles.cle}>
                    <CarreDepense />
                    <Texte variante="meta" couleur="t2">
                      {t("energie.legDepense")}
                    </Texte>
                  </View>
                  {barres.some((b) => b.prevu) ? <Cles cles={[{ libelle: t("energie.prevu"), trait: "tiret" }]} style={{ marginTop: 0 }} /> : null}
                </View>
              ) : (
                <Cles
                  cles={[
                    { libelle: t("energie.legSurplus"), carre: e.apports },
                    { libelle: t("energie.legDeficit"), carre: e.sport },
                    ...(obj != null ? [{ libelle: t("energie.legObjectif", { solde: signe(obj) }), trait: "tiret" as const }] : []),
                  ]}
                />
              )
            }
            apres={
              <>
                {s ? <Cumul p={p} s={s} balance={balance} type={stats.type} /> : null}
                {s ? <LignesPeriode s={s} avant={sAvant} objectif={obj} /> : null}
              </>
            }
          />
        </View>
      ) : null}

      <TitreGroupe>{t("mesures.sources")}</TitreGroupe>
      <Groupe>
        <Lignes>
          {[
            <LigneMesure
              key="j"
              titre={t("energie.srcJournal")}
              sous={t("energie.srcJournalSous")}
              etat={detail?.repas.length ? t("mesures.utilise") : t("energie.vide")}
              onPress={() => router.navigate("/food")}
            />,
            <LigneMesure
              key="w"
              titre={t("mesures.whoop")}
              sous={t("energie.srcWhoopSous")}
              etat={x?.whoop ? t("mesures.utilisee") : t("mesures.nonReliee")}
              onPress={() => router.push("/settings/connexions")}
            />,
            <LigneMesure
              key="sc"
              titre={t("mesures.santeConnect")}
              sous={t("energie.srcScSous")}
              etat={t(x?.sc === "autorisee" ? "mesures.autorisee" : x?.sc === "aAutoriser" ? "mesures.aAutoriser" : "mesures.absente")}
              onPress={async () => {
                if (x?.sc === "aAutoriser") await autoriserSante();
                else if (x?.sc === "autorisee") await sante.ouvrirReglages();
                await recharger();
              }}
            />,
            etat?.etat === "bilan" && etat.e.bmrMesure ? (
              <LigneMesure
                key="b"
                titre={t("energie.srcBalance", { nom: nomSource(etat.e.bmrMesure.origine) })}
                sous={t("energie.srcBalanceSous", { date: jourMoisChiffres(etat.e.bmrMesure.date) })}
                etat={t("mesures.utilisee")}
                onPress={() => router.push("/sante/metabolisme")}
              />
            ) : null,
            <LigneMesure
              key="m"
              titre={t("sante.methodeMetabolisme")}
              etat={!x?.methode || x.methode === "auto" ? t("sante.methode.auto") : libelleMethode(x.methode as "mifflin")}
              onPress={() => router.push("/sante/metabolisme")}
            />,
          ]}
        </Lignes>
      </Groupe>
      <FeuilleObjectifDepense
        visible={objectifOuvert}
        onFermer={() => setObjectifOuvert(false)}
        habitude={ref}
        kcal={depenseJour?.kcal ?? null}
        estime={depenseJour?.estime ?? false}
      />
    </PageMesure>
  );
}

/** Le jour en tête : le solde, les rails, la dépense en quatre termes, les apports par repas. */
function Jour({
  jour,
  etat,
  repas,
  objectif,
  habitude,
  prevu,
  onObjectifDepense,
  onAjouter,
}: {
  jour: number;
  etat: { etat: "bilan"; e: JourEnergie };
  repas: { id: string; nom: string; kcal: number }[];
  objectif: { cible: number | null; rythme: number | null; solde: number | null };
  habitude: number | null;
  /** Le prévu jusqu'à minuit du jour en cours (en tirets), null un jour passé. */
  prevu: Prevu | null;
  onObjectifDepense: () => void;
  onAjouter: () => void;
}) {
  const e = useCouleursEnergie();
  const m = useMesure();
  const chiffres = useChiffresNutrition();
  const j = etat.e;
  const bBrut = bilanAffiche(j.bilan, chiffres);
  // Journal vide : les apports estimés par les habitudes ne s'affichent pas comme des apports (04/11, 07 h 57 : « rien
  // renseigné et ça m'affiche déjà +553 »). Le solde et la barre des apports attendent un vrai repas noté ; la dépense reste.
  const b = bBrut.recharge?.source === "habitudes" ? { ...bBrut, apports: null, solde: null } : bBrut;
  const changees = useLignesChangees(jour, j);
  // le prévu : la dépense à venir toujours ; les apports habituels à venir seulement avec les chiffres du journal
  const pv = j.enCours ? prevu : null;
  const appPrevus = chiffres && pv ? pv.apports : 0;
  const ech = echelleBarres(b.depense.kcal + (pv?.depense ?? 0), b.apports != null || appPrevus > 0 ? (b.apports ?? 0) + appPrevus : null);
  const segs = segmentsDepense(b);
  const segsPrevus = pv
    ? (["bmr", "sport", "neat", "digestion"] as const).map((cle) => ({ cle, kcal: pv[cle] })).filter((x) => x.kcal > 0.5)
    : [];
  const sousSport = sousSportTexte(b.sport.seances);
  const sousBmr = j.bmrMesure
    ? t("sante.balanceDe", { nom: nomSource(j.bmrMesure.origine), date: jourMoisChiffres(j.bmrMesure.date) })
    : t("sante.estimation", { methode: libelleMethode(j.bmr.methode) });
  const sousHeros = !chiffres
    ? t("sante.depense")
    : b.solde == null
      ? t("energie.journalNonTenuAide")
      : objectif.solde != null && objectif.rythme != null
        ? `${mot(b.solde)}, ${t("energie.objectifPour", { solde: signe(objectif.solde), rythme: signe(objectif.rythme, 1) })}`
        : `${mot(b.solde)}${j.enCours ? `, ${t("energie.enCours")}` : ""}`;
  // sous l'en-tête, en tirets : le solde prévu à minuit (avec les chiffres du journal), sinon la dépense prévue à minuit
  const lignePrevu = !pv
    ? null
    : chiffres && pv.soldeMinuit != null
      ? t("energie.soldePrevu", { solde: signe(pv.soldeMinuit) })
      : t("energie.depensePrevue", { kcal: kc(pv.depenseMinuit) });
  const sousAvecPrevu = (texte: string) =>
    lignePrevu ? (
      <View style={{ marginTop: 2, gap: 4 }}>
        <Texte variante="corps" couleur="t2">
          {texte}
        </Texte>
        <Cles cles={[{ libelle: lignePrevu, trait: "tiret" }]} style={{ marginTop: 0 }} />
      </View>
    ) : (
      texte
    );
  const libellePrevu = lignePrevu ? `, ${lignePrevu}` : "";
  const legendeRails = !pv
    ? null
    : appPrevus > 0
      ? t("energie.prevuMinuitDeux", { d: kc(pv.depense), a: kc(appPrevus) })
      : t("energie.prevuMinuit", { kcal: kc(pv.depense) });
  return (
    <>
      {chiffres ? (
        <Heros
          vide={b.solde == null}
          valeur={b.solde == null ? t("energie.journalNonTenu") : signeEstime(b.solde, b.soldeEstime)}
          unite={t("sante.kcal")}
          sous={sousAvecPrevu(sousHeros)}
          libelle={`${b.solde == null ? t("energie.journalNonTenu") : `${signeEstime(b.solde, b.soldeEstime)} ${t("sante.kcal")}, ${sousHeros}`}${libellePrevu}`}
        />
      ) : (
        // D20 : sans chiffres du journal, la dépense seule en tête
        <Heros valeur={kc(b.depense.kcal, b.depense.estime)} unite={t("sante.kcal")} sous={sousAvecPrevu(sousHeros)} libelle={`${kc(b.depense.kcal, b.depense.estime)} ${t("sante.kcal")}, ${sousHeros}${libellePrevu}`} />
      )}
      {/* l'objectif de dépense (la référence de la jauge de Sport), comme l'anneau de la page Pas */}
      <BlocObjectifDepense kcal={b.depense.kcal} estime={b.depense.estime} habitude={habitude} onPress={onObjectifDepense} />
      <Groupe bloc style={{ marginTop: 8 }}>
        <View
          style={styles.rails}
          accessible={pv != null}
          accessibilityLabel={pv ? t("energie.libelleRails", { d: kc(b.depense.kcal), dp: kc(pv.depense), a: kc(b.apports ?? 0), ap: kc(appPrevus) }) : undefined}
        >
          {b.apports != null || appPrevus > 0 ? (
            <View style={styles.rail}>
              <Texte variante="meta" couleur="t2" style={styles.railLib}>
                {t("sante.apports")}
              </Texte>
              <View style={{ flex: 1 }}>
                <BarreSegments
                  largeur={ech.apports}
                  segments={[...(b.apports != null ? [{ couleur: e.apports, valeur: b.apports }] : []), ...(appPrevus > 0 ? [{ couleur: e.apports, valeur: appPrevus, prevu: true }] : [])]}
                />
              </View>
              {/* le chiffre reste le réel : rien de noté, 0 */}
              <Texte style={styles.railVal} couleur={b.apports != null ? undefined : "t3"}>
                {kc(b.apports ?? 0, b.soldeEstime)}
              </Texte>
            </View>
          ) : null}
          <View style={styles.rail}>
            <Texte variante="meta" couleur="t2" style={styles.railLib}>
              {t("sante.depense")}
            </Texte>
            <View style={{ flex: 1 }}>
              <BarreSegments
                largeur={ech.depense}
                premier={1}
                segments={[...segs.map((x) => ({ couleur: e[x.cle], valeur: x.kcal })), ...segsPrevus.map((x) => ({ couleur: e[x.cle], valeur: x.kcal, prevu: true }))]}
              />
            </View>
            <Texte style={styles.railVal}>{kc(b.depense.kcal, b.depense.estime)}</Texte>
          </View>
          {legendeRails ? <Cles cles={[{ libelle: legendeRails, trait: "tiret" }]} style={{ marginTop: 0 }} /> : null}
        </View>
      </Groupe>

      {/* l'en-tête de la dépense porte sa précision (mot seul, planche precision, section 7) */}
      <View style={styles.enteteMini}>
        <Texte variante="entete" couleur="t3" accessibilityRole="header" style={{ flexShrink: 1 }}>
          {t("energie.depenseTitre", { kcal: kc(b.depense.kcal, b.depense.estime) })}
        </Texte>
        <MiniPrecision calcul="depense" court style={{ marginRight: -6 }} />
      </View>
      <Groupe>
        <Lignes>
          {[
            <LigneMesure key="bmr" avant={<Point couleur={e.bmr} />} titre={t("sante.metabolisme")} sous={sousBmr} valeur={kc(b.bmr.kcal, b.bmr.estime)} />,
            <LigneSurlignee key="sport" actif={changees.has("sport")} couleur={m.fort}>
              <LigneMesure
                avant={<Point couleur={e.sport} />}
                titre={t("sante.sportTerme")}
                sous={sousSport}
                // calculé chez nous, la source dite dessous : jamais « ~ » (décision du 31/10)
                valeur={kc(b.sport.kcal)}
                // le sport compte en plus du métabolisme : moins que la dépense brute du capteur (D11 de la revue finale)
                sousValeur={b.sport.kcal > 0 ? t("sante.enPlusDuRepos") : undefined}
              />
            </LigneSurlignee>,
            b.neat ? (
              <LigneSurlignee key="neat" actif={changees.has("neat")} couleur={m.fort}>
                <LigneMesure avant={<Point couleur={e.neat} />} titre={t("sante.pas")} sous={sousPas(t(b.neat.defaut ? "sante.pasSupposes" : b.neat.seancesSansPas ? "sante.pasJourSeances" : "sante.pasHorsSport", { n: nombre(b.neat.pasHorsSport, 0) }), b.neat.ignorees)} valeur={kc(b.neat.kcal, true)} />
              </LigneSurlignee>
            ) : null,
            <LigneMesure
              key="dig"
              avant={<Point couleur={e.digestion} />}
              titre={t("sante.digestion")}
              sous={b.digestion.duJournal && b.apports ? t("sante.partApports", { n: nombre((b.digestion.kcal / b.apports) * 100, 0) }) : t("sante.digestionEstimee")}
              valeur={kc(b.digestion.kcal, b.digestion.estime)}
            />,
            // le prévu jusqu'à minuit, en tirets et en second : chaque séance prévue, puis le total et ses termes
            ...(pv?.seances ?? []).map((s, i) => (
              <LigneMesure
                key={`prevue${i}`}
                avant={<Point couleur={e.sport} prevu />}
                titre={s.nom || t("sante.sportTerme")}
                sous={s.minutes > 0 ? t("energie.seancePrevue", { heure: s.heure, min: s.minutes }) : t("energie.seancePrevueSansDuree", { heure: s.heure })}
                valeur={kc(s.kcal)}
                attenuee
              />
            )),
            pv ? (
              <LigneMesure
                key="prevu"
                avant={<Point couleur={e.bmr} prevu />}
                titre={t("energie.prevuLigne")}
                // les termes à zéro (aucune séance prévue, plus de pas) ne s'écrivent pas
                sous={(
                  [
                    ["energie.termeBmr", pv.bmr],
                    ["energie.termeSport", pv.sport],
                    ["energie.termePas", pv.neat],
                    ["energie.termeDig", pv.digestion],
                  ] as const
                )
                  .filter(([, v]) => Math.round(v) > 0)
                  .map(([cle, v]) => t(cle, { kcal: kc(v) }))
                  .join(", ")}
                valeur={kc(pv.depense)}
                attenuee
              />
            ) : null,
          ]}
        </Lignes>
      </Groupe>

      {chiffres ? <TitreGroupe>{b.apports != null ? t("energie.apportsTitre", { kcal: kc(b.apports, b.soldeEstime) }) : t("energie.apportsVides")}</TitreGroupe> : null}
      {chiffres ? <Groupe>
        <Lignes>
          {[
            ...repas.map((r) => <LigneMesure key={r.id} avant={<Point couleur={e.apports} />} titre={r.nom} sous={t("energie.journalNutrition")} valeur={kc(r.kcal)} />),
            ...(appPrevus > 0
              ? [<LigneMesure key="hab" avant={<Point couleur={e.apports} prevu />} titre={t("energie.apportsHabituels")} sous={t("energie.apportsHabituelsSous")} valeur={kc(appPrevus)} attenuee />]
              : []),
            <LigneAjout key="aj" libelle={t("energie.noterRepas")} onPress={onAjouter} />,
          ]}
        </Lignes>
      </Groupe> : null}
    </>
  );
}

/** Petit carré aux quatre nuances de la dépense (légende, décomposition). */
function CarreDepense() {
  const e = useCouleursEnergie();
  return (
    <View style={styles.carre}>
      {[e.bmr, e.sport, e.neat, e.digestion].map((c) => (
        <View key={c} style={{ flex: 1, backgroundColor: c }} />
      ))}
    </View>
  );
}

function Decomposition({ comp }: { comp: { bmr: number; sport: number; neat: number; digestion: number } }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
      <CarreDepense />
      <Texte variante="meta" couleur="t3" numberOfLines={1} style={{ flexShrink: 1 }}>
        {t("energie.decomp", { bmr: kc(comp.bmr), sport: kc(comp.sport), pas: kc(comp.neat), dig: kc(comp.digestion) })}
      </Texte>
    </View>
  );
}

/** Titre du graphe pour la lecture d'écran : barres apports / dépense (par jour ou par mois) ou solde. */
function libelleGraphe(type: TypePeriode, barresJour: boolean, titre: string): string {
  if (barresJour) return t(type === "annee" ? "energie.grapheDepenseMois" : "energie.grapheSemaine", { titre });
  return t(type === "annee" ? "energie.grapheMois" : "energie.grapheSolde", { titre });
}

function Entete({ p, barres, s, dm, sel }: { p: Periode<JourE>; barres: BarreEnergie[]; s: StatsEnergie | null; dm: { dep: number; comp: StatsEnergie["comp"] } | null; sel: number | null }) {
  const longueur = t(`mesures.longueur.${p.type}`);
  const b = sel != null ? barres[sel] : null;
  if (b && sel != null) {
    const pb = p.barres[sel]!;
    const seances = p.type === "annee" ? [] : (pb.jours[0]?.donnee?.seances ?? []);
    const petit = p.type === "annee" ? t("energie.moyenneParJour", { titre: pb.titre }) : [pb.titre, ...seances].join(", ");
    // un jour à venir avec une séance prévue : tout est prévu, en tirets
    if (b.aVenir && b.prevu)
      return (
        <EnteteStats
          petit={[pb.titre, ...b.prevu.seances].join(", ")}
          valeur={kc(b.prevu.dep)}
          unite={t("sante.kcal")}
          ligne={<Cles cles={[{ libelle: t("energie.jourPrevu"), trait: "tiret" }]} style={{ marginTop: 0 }} />}
          apres={<Decomposition comp={b.prevu.comp} />}
        />
      );
    // le jour en cours : son prévu jusqu'à minuit sous la décomposition du réel
    const prevuDuJour = b.prevu && !b.aVenir ? <Cles cles={[{ libelle: t("energie.prevuMinuit", { kcal: kc(b.prevu.dep) }), trait: "tiret" }]} style={{ marginTop: 4 }} /> : null;
    // journal non tenu : la dépense du jour (ou du mois) reste connue
    if (b.v == null && b.dep > 0)
      return (
        <EnteteStats
          petit={petit}
          valeur={kc(b.dep, true)}
          unite={t("sante.kcal")}
          ligne={<Texte variante="meta" style={{ fontSize: 13 }}>{t("energie.depenseSansJournal")}</Texte>}
          apres={
            <>
              <Decomposition comp={b.comp} />
              {prevuDuJour}
            </>
          }
        />
      );
    if (b.v == null) return <EnteteStats petit={petit} valeur={t("energie.journalNonTenu")} vide ligne={t("energie.horsMoyennes")} />;
    return (
      <EnteteStats
        petit={petit}
        valeur={signe(b.v)}
        unite={t("energie.kcalMot", { mot: mot(b.v) })}
        ligne={
          <Texte variante="meta" style={{ fontSize: 13 }}>
            {t("energie.apportsDepense", { a: kc(b.app ?? 0), d: kc(b.dep) })}
          </Texte>
        }
        apres={
          <>
            <Decomposition comp={b.comp} />
            {prevuDuJour}
          </>
        }
      />
    );
  }
  if (!s && dm)
    return (
      <EnteteStats
        petit={t("energie.depenseMoyennePeriode", { longueur })}
        valeur={kc(dm.dep, true)}
        unite={t("energie.kcalJ")}
        ligne={<Texte variante="meta" style={{ fontSize: 13 }}>{t("energie.aucunJournalAide")}</Texte>}
        apres={<Decomposition comp={dm.comp} />}
      />
    );
  if (!s) return <EnteteStats petit={t("energie.soldeMoyen", { longueur })} valeur={t("energie.aucunJournal")} vide ligne={t("energie.aucunJournalAide")} />;
  return (
    <EnteteStats
      petit={t("energie.soldeMoyen", { longueur })}
      valeur={signe(s.moy)}
      unite={t("energie.kcalJour", { mot: mot(s.moy) })}
      ligne={
        <Texte variante="meta" style={{ fontSize: 13 }}>
          {t("energie.apportsDepenseMoy", { a: kc(s.app), d: kc(s.dep) })}
        </Texte>
      }
      apres={<Decomposition comp={s.comp} />}
    />
  );
}

/** Cumul de la période, son équivalent estimé en poids, la variation de la balance sur les mêmes jours. */
function Cumul({ p, s, balance, type }: { p: Periode<JourE>; s: StatsEnergie; balance: number | null; type: TypePeriode }) {
  const kg = s.cumul / KCAL_KG;
  const cumul = cumulSoldes(p.jours.map((j) => j.donnee));
  const premier = p.jours[0]?.jour ?? p.debut;
  const dernier = p.jours[p.jours.length - 1]?.jour ?? p.debut;
  return (
    <Groupe bloc>
      <Duo
        gauche={
          <ValeurDuo
            avant={t("energie.cumul", { longueur: t(`mesures.longueur.${type}`) })}
            valeur={signe(s.cumul)}
            unite={t("sante.kcal")}
            sous={`${tp("energie.cumulDe", s.n, { mot: mot(s.cumul) })}${s.sans ? ` ${tp("energie.sansJournal", s.sans)}` : ""}`}
          />
        }
        droite={
          <ValeurDuo droite avant={t("energie.equivalent")} valeur={signe(kg, 1)} unite={t("energie.kg")} sous={balance != null ? t("energie.balance", { v: signe(balance, 1) }) : undefined} />
        }
      />
      <CourbeCumulLargeur cumul={cumul} cle={`${p.type}:${p.k}:${s.n}`} debut={formater(premier, { day: "numeric", month: "short" })} fin={p.k === 0 ? t("mesures.aujCourt") : formater(dernier, { day: "numeric", month: "short" })} total={s.cumul} />
      <Note>{t("energie.noteCumul")}</Note>
    </Groupe>
  );
}

function CourbeCumulLargeur({ cumul, cle, debut, fin, total }: { cumul: number[]; cle: string; debut: string; fin: string; total: number }) {
  const [w, setW] = useState(0);
  return (
    <View onLayout={(ev) => setW(Math.round(ev.nativeEvent.layout.width))} style={{ marginTop: 4 }}>
      {w > 0 ? <CourbeCumul cumul={cumul} largeur={w} cle={cle} debut={debut} fin={fin} libelle={t("energie.grapheCumul", { v: signe(total) })} /> : null}
    </View>
  );
}

/** Objectif tenu, au-dessus, soldes, apports et dépense moyens ; chacun face à la période d'avant. */
function LignesPeriode({ s, avant, objectif }: { s: StatsEnergie; avant: StatsEnergie | null; objectif: number | null }) {
  const av = (v: string | null) => (v == null ? undefined : t("mesures.avant", { valeur: v }));
  const perte = objectif != null && objectif <= 0;
  return (
    <Groupe>
      <Lignes>
        {[
          objectif != null ? (
            <LigneMesure
              key="tenu"
              titre={t("energie.objectifTenu")}
              sous={t(perte ? "energie.objectifTenuPerte" : "energie.objectifTenuPrise", { n: nombre(Math.abs(objectif), 0) })}
              valeur={nombre(s.tenu, 0)}
              unite={t("mesures.surN", { n: s.n })}
              sousValeur={av(avant ? `${avant.tenu} / ${avant.n}` : null)}
            />
          ) : null,
          objectif != null ? (
            <LigneMesure
              key="dessus"
              titre={t(perte ? "energie.auDessus" : "energie.enDessous")}
              sous={perte ? tp("energie.dontSurplus", s.surplus) : tp("energie.dontDeficit", s.deficit)}
              valeur={nombre(s.dessus, 0)}
              unite={t("mesures.surN", { n: s.n })}
              sousValeur={av(avant ? `${avant.dessus} / ${avant.n}` : null)}
            />
          ) : null,
          <LigneMesure key="solde" titre={t("energie.soldeMoyenLigne")} valeur={signe(s.moy)} unite={t("energie.kcalJ")} sousValeur={av(avant ? signe(avant.moy) : null)} />,
          <LigneMesure key="app" titre={t("energie.apportsMoyens")} valeur={kc(s.app)} unite={t("sante.kcal")} sousValeur={av(avant ? kc(avant.app) : null)} />,
          <LigneMesure key="dep" titre={t("energie.depenseMoyenne")} valeur={kc(s.dep, true)} unite={t("sante.kcal")} sousValeur={av(avant ? kc(avant.dep, true) : null)} />,
        ]}
      </Lignes>
    </Groupe>
  );
}

const styles = StyleSheet.create({
  enteteMini: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 22, marginBottom: -6, marginHorizontal: MARGE },
  rails: { gap: 10 },
  rail: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 18 },
  railLib: { width: 62 },
  railVal: { width: 58, textAlign: "right", fontFamily: police.medium, fontSize: 13, fontVariant: ["tabular-nums"] },
  legende: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 6, marginTop: 8, alignItems: "center" },
  cle: { flexDirection: "row", alignItems: "center", gap: 6 },
  carre: { width: 10, height: 10, borderRadius: 3, overflow: "hidden", flexDirection: "row" },
});
