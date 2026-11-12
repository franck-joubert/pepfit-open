// Pages Poids et Masse grasse (planche pas, variante A validée le 28/10 ; retour du 29/10) : en tête, le semainier
// commun et le jour choisi (glissé d'un jour à l'autre, toucher une date, jamais le futur), son relevé et sa moyenne lissée,
// le bloc propre de ce jour (objectif de poids : chemin parcouru et deux dates estimées ; masse grasse : ce qui a bougé en kg
// sur les 30 jours d'avant), les statistiques (StatsEtat.tsx), l'historique derrière « Toutes les pesées » (page agenda en
// vue liste ; l'icône agenda l'ouvre en vue mois), les sources. Pesées : FeuillePoids (ajout) et FeuillePesee (modifier,
// supprimer) de l'appli. Rien d'inventé : sans relevé, la page vide propose d'en ajouter un ou de relier une balance.
// D2 de la revue finale (30/10) : la seule page du poids. Elle porte aussi les tours (Tours.tsx) ; Composition et
// Mensurations y mènent. Un seul format : une décimale partout (« 78,0 kg »).
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, TextInput, View, type ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { modifierPesee, supprimerPesee, type Pesee } from "../../db/api";
import { lireActif, t, tp } from "../../i18n/index";
import { formater } from "../../i18n/temps";
import { useLangue } from "../../i18n/useLangue";
import { sante } from "../../natif/sante";
import { SuppressionDifferee } from "../../photos/attente";
import { useTheme } from "../../theme";
import { espace, police, POLICE_MAX, typo } from "../../theme/typo";
import { BandeauAnnuler } from "../../ui/BandeauAnnuler";
import { Bouton } from "../../ui/Bouton";
import { Feuille, Groupe as GroupeFeuille, Option } from "../../ui/Feuille";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { revenir } from "../../ui/revenir";
import { Texte } from "../../ui/Texte";
import { ORIGINE_WHOOP } from "../../whoop/depot";
import { fixe } from "../composition-vue";
import { useApp, useCharge } from "../contexte";
import { FeuillePesee } from "../FeuillePesee";
import { FeuillePoids } from "../FeuillePoids";
import { approx, heure, jourSemaineMois, lireNombre, versUnite, type Unite } from "../format";
import { jourPesee, saisieLocale } from "../poids";
import { nomSource } from "../sante-donnees";
import { bouge, chemin, dateDans, jourEtat, joursReleves, lisseAu, type Releve } from "./corps-calc";
import { ajouterGras, lireDonneesCorps, memePesee, supprimerGras, type CleCorps, type Tours } from "./corps-donnees";
import { EnteteJour, useJour } from "./EnteteJour";
import { ActionTete, Duo, EnPanne, Groupe, Heros, LigneMesure, Lignes, Note, PageMesure, PageVide, Quand, RailZero, Remplissage, TitreGroupe, ValeurDuo, useMesure } from "./gabarit";
import { decaler, minuit, signe } from "./periodes";
import { agendaChange } from "./agenda-store";
import { LigneToutes, ouvrirAgendaEtat, StatsEtat } from "./StatsEtat";
import { SectionTours } from "./Tours";
import { useSanteEnFond, type EtatSC } from "./sante-fond";
import { signalerSaisie } from "../../precision/service";
import { isoLocal, joursPourUsage } from "../../cycle/donnees";
import { ajustementPoids } from "../../cycle/poids";
import { CYCLE } from "../../cycle/modele";
import { IconeTuile } from "../cycle/IconeTuile";

type Donnees = {
  kg: Releve[];
  gras: Releve[];
  pesees: Pesee[];
  objectif: Awaited<ReturnType<typeof lireDonneesCorps>>["objectif"];
  /** null tant que l'état de Santé Connect n'est pas lu (en fond : sante-fond.ts). */
  sc: EtatSC | null;
  tours: Tours;
};

/** « 17 déc. », « 13 janv. 2027 » hors de l'année en cours. */
function dateCourte(ms: number, maintenant: number): string {
  const autreAnnee = new Date(ms).getFullYear() !== new Date(maintenant).getFullYear();
  return formater(ms, autreAnnee ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });
}

const minus = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** D'où vient un relevé : « Saisie », « Withings », « Whoop ». */
const sourceDe = (r: Releve) => (r.manuel ? t("mesuresCorps.saisie") : nomSource(r.origine));

/** Dernier relevé du jour `jour` ou d'avant (le lien vers l'autre page de la même pesée). */
function auPlusTard(l: readonly Releve[], jour: number): Releve | null {
  let m: Releve | null = null;
  for (const r of l) if (minuit(r.date) <= jour && (!m || r.date > m.date)) m = r;
  return m;
}

export function Corps({ cle, jour: depart = null, tours: versTours = false }: { cle: CleCorps; jour?: number | null; tours?: boolean }) {
  useLangue();
  const { db } = useApp();
  const bas = useSafeAreaInsets().bottom;
  const [maintenant] = useState(() => Date.now());
  const u: Unite = lireActif().poids;
  const poids = cle === "poids";
  // la base d'abord ; Santé Connect (état, import) en fond, la page relue s'il apporte du neuf (M8)
  const [lu, recharger, panne] = useCharge((base) => lireDonneesCorps(base, poids), [], undefined, `sante/${cle}`);
  // Suivi du cycle (planche cycle, écran 7) : la moyenne lissée du poids ajustée, si l'usage « poids » du suivi est allumé
  const [joursCycle] = useCharge((base) => (poids ? joursPourUsage(base, "poids") : Promise.resolve(null)), [poids]);
  const { sc, relierSante } = useSanteEnFond(recharger);
  const charge = lu && { ...lu, sc };
  const j = useJour(maintenant, depart);
  const page = useRef<ScrollViewInstance | null>(null);
  const [ajout, setAjout] = useState(false);
  const [peseeOuverte, setPeseeOuverte] = useState<Pesee | null>(null);
  const [grasOuvert, setGrasOuvert] = useState<Releve | null>(null);

  // Suppression (GRILLE 3, revue finale n° 8) : la pesée ou la mesure quitte la page tout de suite, « Annuler » la rend
  // pendant 8 s ; ensuite (ou la page quittée), elle est effacée pour de bon. Supprimée depuis l'agenda (posé par-dessus),
  // on revient à la page, où se tient le bandeau.
  const [enAttente, setEnAttente] = useState<string | null>(null);
  const [suppression] = useState(() => new SuppressionDifferee(setEnAttente));
  useEffect(() => () => suppression.valider(), [suppression]);
  // Les relevés retirés restent cachés jusqu'à la relecture qui suit leur effacement (pas de retour d'une image).
  const [retires, setRetires] = useState<ReadonlySet<string>>(new Set());
  const surAgenda = useRef(false);
  useFocusEffect(useCallback(() => void (surAgenda.current = false), []));
  // Pesée corrigée depuis l'agenda (posé par-dessus) : une fois la page relue, l'agenda relit ses mois.
  useEffect(() => {
    if (surAgenda.current) agendaChange();
  }, [charge]);
  const supprimer = (id: string, effacer: (id: string) => Promise<void>) => {
    setRetires((s) => new Set(s).add(id));
    suppression.demander(id, () => void effacer(id).then(recharger).catch(signalerErreur("supprimer")));
    if (surAgenda.current) revenir();
  };
  const annuler = () => {
    const id = suppression.enAttente;
    suppression.annuler();
    setRetires((s) => new Set([...s].filter((q) => q !== id)));
  };
  const x =
    charge && retires.size
      ? { ...charge, kg: charge.kg.filter((r) => !retires.has(r.id)), gras: charge.gras.filter((r) => !retires.has(r.id)), pesees: charge.pesees.filter((r) => !retires.has(r.id)) }
      : charge;
  const avecBandeau = (contenu: ReactNode) => (
    <View style={{ flex: 1 }}>
      {contenu}
      {enAttente ? (
        <BandeauAnnuler texte={t(poids ? "mesuresCorps.peseeSupprimee" : "mesuresCorps.mesureSupprimee")} bas={bas + espace.l} onAnnuler={annuler} />
      ) : null}
    </View>
  );

  // Arrivée par « Mensurations » (route ?section=tours) : la page s'ouvre sur ses tours. Les blocs du dessus finissent leur
  // mise en page un peu après (courbes) : les tours, déplacés, y sont ramenés pendant la première seconde et demie.
  const toursY = useRef<number | null>(null);
  const toursDebut = useRef<number | null>(null);
  const allerAuxTours = () => {
    if (!versTours || toursY.current == null || !page.current) return;
    toursDebut.current ??= Date.now();
    if (Date.now() - toursDebut.current > 1500) return;
    page.current.scrollTo({ y: Math.max(0, toursY.current - espace.s), animated: false });
  };
  const tours = poids && x ? (
    <View
      onLayout={(e) => {
        toursY.current = e.nativeEvent.layout.y;
        allerAuxTours();
      }}
    >
      <SectionTours tours={x.tours} jour={j.jour} maintenant={maintenant} />
    </View>
  ) : null;
  const defilement = (v: ScrollViewInstance | null) => {
    page.current = v;
    allerAuxTours();
  };

  const feuilles = (
    <>
      {poids ? (
        <>
          <FeuillePoids visible={ajout} onFermer={() => setAjout(false)} onChange={() => void recharger()} />
          <FeuillePesee
            pesee={peseeOuverte}
            onFermer={() => setPeseeOuverte(null)}
            onEnregistrer={(id, patch) => {
              setPeseeOuverte(null);
              void modifierPesee(db, id, patch).then(recharger).catch(signalerErreur());
            }}
            onSupprimer={(id) => {
              setPeseeOuverte(null);
              supprimer(id, (q) => supprimerPesee(db, q));
            }}
          />
        </>
      ) : (
        <>
          <FeuilleAjoutGras
            visible={ajout}
            onFermer={() => setAjout(false)}
            onValider={(v) => {
              setAjout(false);
              void ajouterGras(db, v).then(recharger).then(signalerSaisie).catch(signalerErreur());
            }}
          />
          <FeuilleMesureGras
            r={grasOuvert}
            onFermer={() => setGrasOuvert(null)}
            onSupprimer={(id) => {
              setGrasOuvert(null);
              supprimer(id, (q) => supprimerGras(db, q));
            }}
          />
        </>
      )}
    </>
  );

  // Unité d'affichage : kg ou lbs pour le poids (et les kg de gras), % pour la masse grasse.
  const conv = (kg: number) => versUnite(kg, u);
  const brut = x ? (poids ? x.kg : x.gras) : [];
  const releves = poids ? brut.map((r) => ({ ...r, valeur: conv(r.valeur) })) : brut;
  // l'agenda (page posée par-dessus) lit les relevés et ouvre les feuilles d'après l'état le plus récent
  const vivant = useRef({ releves, brut, x });
  vivant.current = { releves, brut, x };
  const unite = poids ? u : "%";
  const titre = poids ? t("mesuresCorps.poids") : t("mesuresCorps.gras");
  const ajouter = () => setAjout(true);
  const actionAjout = poids ? t("mesuresCorps.ajouterPesee") : t("mesuresCorps.ajouterMesure");
  const plus = <ActionTete nom="plus" libelle={actionAjout} onPress={ajouter} />;

  if (!x)
    return avecBandeau(
      <PageMesure titre={titre} actions={plus}>
        {panne ? <EnPanne onReessayer={() => void recharger().catch(console.error)} /> : null}
        {feuilles}
      </PageMesure>,
    );

  if (!releves.length)
    return avecBandeau(
      <PageMesure titre={titre} actions={plus} defilement={defilement}>
        <PageVide
          icone="balance"
          titre={poids ? t("mesuresCorps.videPoidsTitre") : t("mesuresCorps.videGrasTitre")}
          texte={poids ? t("mesuresCorps.videPoidsTexte") : t("mesuresCorps.videGrasTexte")}
          action={actionAjout}
          onAction={ajouter}
        />
        <Groupe>
          <LigneMesure titre={t("mesuresCorps.relierBalance")} sous={t("mesuresCorps.parSC")} onPress={() => void relierSante()} />
        </Groupe>
        {tours}
        {feuilles}
      </PageMesure>,
    );

  // le cycle : la moyenne lissée ajustée (tendance et dates de l'objectif comprises) ; la pesée reste telle quelle
  const aj = poids ? ajustementPoids(releves, joursCycle ?? null, isoLocal(maintenant)) : null;
  const e = jourEtat(releves, j.jour, aj?.ajustement);
  const lSans = aj ? jourEtat(releves, j.jour).l : null;
  const r = e.releve;
  const jours = joursReleves(releves);
  const ouvrir = (id: string) => {
    const v = vivant.current;
    if (poids) setPeseeOuverte(v.x?.pesees.find((q) => q.id === id) ?? null);
    else setGrasOuvert(v.brut.find((q) => q.id === id) ?? null);
  };
  const agenda = (vue: "liste" | "mois") => {
    surAgenda.current = true;
    ouvrirAgendaEtat({
      titre,
      maintenant,
      releves: () => vivant.current.releves,
      legende: poids ? t("mesuresCorps.legendePesee") : t("mesuresCorps.legendeMesure"),
      vue,
      entree: (q) => ({
        date: q.date,
        texte: `${fixe(q.valeur, 1)} ${unite}`,
        sous: t("mesuresCorps.sourceLigne", { source: sourceDe(q), heure: heure(q.date) }),
        bon: true,
        onPress: () => ouvrir(q.id),
      }),
      onJour: (jj) => {
        j.choisir(jj);
        page.current?.scrollTo({ y: 0, animated: false });
      },
    });
  };
  const lisseSous =
    e.l != null
      ? poids && e.tendance != null
        ? t("mesuresCorps.lisseTendance", { v: fixe(e.l, 1), u: unite, pente: signe(e.tendance, 2) })
        : t("mesuresCorps.lisseSeule", { v: fixe(e.l, 1), u: unite })
      : undefined;
  const quand = r
    ? t(poids ? "mesuresCorps.quandPesee" : "mesuresCorps.quandMesure", { heure: heure(r.date), source: sourceDe(r) })
    : e.precedent
      ? t(poids ? "mesuresCorps.peseePrecedente" : "mesuresCorps.mesurePrecedente", { jour: minus(jourPesee(e.precedent.date, maintenant)) })
      : null;
  const objectifAff = poids && x.objectif ? conv(x.objectif.cible) : null;
  const dernier = releves[releves.length - 1] ?? null;

  return avecBandeau(
    <PageMesure
      titre={titre}
      defilement={defilement}
      actions={
        <>
          <ActionTete nom="cal" libelle={t("mesures.agenda")} onPress={() => agenda("mois")} />
          {plus}
        </>
      }
    >
      <EnteteJour jour={j.jour} maintenant={maintenant} onJour={j.choisir} avecDonnee={(d) => jours.has(d)}>
        {quand ? <Quand texte={quand} /> : null}
        {r == null ? (
          <Heros
            vide
            valeur={
              j.aujourdhui
                ? t(poids ? "mesuresCorps.pasEncorePesee" : "mesuresCorps.pasEncoreMesure")
                : t(poids ? "mesuresCorps.pasDePesee" : "mesuresCorps.pasDeMesureJour")
            }
            sous={lisseSous}
          />
        ) : poids ? (
          <Heros valeur={fixe(r.valeur, 1)} unite={u} libelle={`${titre} ${fixe(r.valeur, 1)} ${u}`} sous={lisseSous} />
        ) : (
          <HerosGras dernier={r} kg={x.kg} conv={conv} u={u} />
        )}
        {aj && e.l != null && lSans != null ? (
          <>
            <Groupe style={{ marginTop: 18 }}>
              <LigneMesure
                avant={<IconeTuile nom="cycle" />}
                titre={t("cycle.poids.lissee")}
                sous={t("cycle.poids.ajustee")}
                valeur={fixe(e.l, 1)}
                unite={u}
                sousValeur={t("cycle.poids.sans", { v: fixe(lSans, 1), u })}
              />
            </Groupe>
            {/* la phrase sous le groupe, comme la note de la Récupération (planche cycle, écran 7) */}
            <Texte variante="corps" couleur="t2" style={{ fontSize: 13.5, lineHeight: 20, marginTop: 12, marginHorizontal: 16 }}>
              {aj.ecart != null
                ? t("cycle.poids.note", { v: fixe(Math.abs(aj.ecart), 1), u, n: CYCLE.poids.cycles })
                : t("cycle.poids.noteAvant", { n: CYCLE.poids.cycles })}
            </Texte>
          </>
        ) : null}
        {poids ? (
          <BlocObjectif
            x={x}
            releves={releves}
            lisse={e.l}
            tendance={e.tendance}
            conv={conv}
            u={u}
            jour={j.jour}
            reference={j.aujourdhui ? maintenant : j.jour}
            maintenant={maintenant}
          />
        ) : (
          <BlocBouge x={x} conv={conv} u={u} jour={j.jour} maintenant={maintenant} />
        )}
      </EnteteJour>

      <StatsEtat
        id={cle}
        releves={releves}
        unite={unite}
        dec={1}
        maintenant={maintenant}
        objectif={objectifAff}
        libelleCourbe={(periode) => t(poids ? "mesuresCorps.courbePoids" : "mesuresCorps.courbeGras", { periode })}
        cles={[
          { libelle: poids ? t("mesuresCorps.clePesee") : t("mesuresCorps.cleMesure"), pastille: true },
          { libelle: t("mesuresCorps.cleLissee"), trait: "plein" },
          ...(objectifAff != null ? [{ libelle: t("mesuresCorps.cleObjectif"), trait: "tiret" as const }] : []),
        ]}
        nomReleves={t("mesuresCorps.mesures")}
        sourceDe={sourceDe}
        ajustement={aj?.ajustement}
      />

      <LigneToutes
        titre={poids ? t("mesuresCorps.toutesPesees") : t("mesuresCorps.toutesMesures")}
        dernier={dernier}
        texte={dernier ? `${fixe(dernier.valeur, 1)} ${unite}` : ""}
        maintenant={maintenant}
        onPress={() => agenda("liste")}
      />

      {tours}
      <Sources x={x} cle={cle} maintenant={maintenant} onAjout={ajouter} relierSante={relierSante} />
      {feuilles}
    </PageMesure>,
  );
}

/** Masse grasse : le %, et les kg de gras et de masse maigre de la même pesée (ou de la dernière d'avant). */
function HerosGras({ dernier, kg, conv, u }: { dernier: Releve; kg: Releve[]; conv: (kg: number) => number; u: Unite }) {
  const pesee = memePesee(kg, dernier.date) ?? auPlusTard(kg, minuit(dernier.date));
  return (
    <Heros
      valeur={fixe(dernier.valeur, 1)}
      unite="%"
      libelle={`${t("mesuresCorps.gras")} ${fixe(dernier.valeur, 1)} %`}
      sous={
        pesee
          ? t("mesuresCorps.grasMaigre", {
              gras: fixe(conv((pesee.valeur * dernier.valeur) / 100), 1),
              maigre: fixe(conv(pesee.valeur * (1 - dernier.valeur / 100)), 1),
              u,
            })
          : undefined
      }
    />
  );
}

/** Objectif de poids au jour choisi : cible et reste, part du chemin depuis la première pesée, dates au rythme voulu et à la tendance. */
function BlocObjectif({
  x,
  releves,
  lisse,
  tendance,
  conv,
  u,
  jour,
  reference,
  maintenant,
}: {
  x: Donnees;
  releves: Releve[];
  lisse: number | null;
  tendance: number | null;
  conv: (kg: number) => number;
  u: Unite;
  /** Jour choisi (minuit). */
  jour: number;
  /** Instant d'où partent les dates estimées : maintenant, ou le jour choisi. */
  reference: number;
  maintenant: number;
}) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const o = x.objectif;
  const gras = auPlusTard(x.gras, jour);
  const peseeKg = auPlusTard(x.kg, jour);
  const lienGras = gras ? (
    <LigneMesure
      key="g"
      titre={t("mesuresCorps.gras")}
      sous={
        peseeKg && Math.abs(peseeKg.date - gras.date) < 12 * 3_600_000
          ? t("mesuresCorps.memePesee", { jour: minus(jourPesee(gras.date, maintenant)) })
          : minus(jourPesee(gras.date, maintenant))
      }
      etat={`${fixe(gras.valeur, 1)} %`}
      onPress={() => router.push({ pathname: "/sante/gras", params: { jour: String(minuit(gras.date)) } })}
    />
  ) : null;
  const lienObjectif = (
    <LigneMesure
      key="o"
      titre={o ? t("mesuresCorps.modifierObjectif") : t("mesuresCorps.fixerObjectif")}
      sous={t("mesuresCorps.objectifNutrition")}
      onPress={() => router.push("/nutrition/objectifs")}
    />
  );
  if (!o || lisse == null)
    return (
      <Groupe style={{ marginTop: 24 }}>
        <Lignes>{[lienObjectif, lienGras]}</Lignes>
      </Groupe>
    );
  const cible = conv(o.cible);
  const rythme = o.rythme != null ? conv(o.rythme) : null;
  const premiere = releves[0]!;
  const depart = premiere.valeur;
  const fait = chemin(depart, lisse, cible);
  const atteint = Math.abs(lisse - cible) < 0.05 || Math.sign(cible - depart) !== Math.sign(cible - lisse);
  const dv = rythme != null ? dateDans(lisse, cible, rythme, reference) : null;
  const dt = dateDans(lisse, cible, tendance, reference);
  const date = (d: number | null) => (d == null ? t("mesuresCorps.jamais") : t("mesuresCorps.vers", { date: approx(dateCourte(d, maintenant)) }));
  return (
    <>
      <TitreGroupe>{t("mesuresCorps.objectif")}</TitreGroupe>
      <Groupe bloc>
        <Duo
          gauche={<ValeurDuo valeur={fixe(cible, 1)} unite={u} sous={atteint ? t("mesuresCorps.atteint") : t("mesuresCorps.reste", { v: fixe(Math.abs(lisse - cible), 1), u })} />}
          droite={<ValeurDuo droite valeur={`${Math.round(fait * 100)} %`} sous={t("mesuresCorps.depuis", { date: dateCourte(premiere.date, maintenant) })} />}
        />
        <View style={[styles.chemin, { backgroundColor: couleurs.s3 }]} accessible accessibilityLabel={`${Math.round(fait * 100)} %`}>
          <Remplissage part={fait} style={{ backgroundColor: m.fort }} />
        </View>
        <View style={styles.bornes}>
          <Texte variante="meta" couleur="t3">{`${fixe(depart, 1)} ${u}`}</Texte>
          <Texte variante="meta" couleur="t3">{`${fixe(cible, 1)} ${u}`}</Texte>
        </View>
        <View style={[styles.dates, { borderTopColor: m.sep }]}>
          <View style={{ flex: 1, paddingTop: 12 }}>
            <Texte variante="meta" couleur="t3">
              {rythme != null ? t("mesuresCorps.rythmeVoulu", { v: signe(rythme, 1), u }) : t("mesuresCorps.rythmeNonRegle")}
            </Texte>
            <Texte style={styles.date}>{rythme != null ? date(dv) : "—"}</Texte>
          </View>
          <View style={{ flex: 1, paddingTop: 12, paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: m.sep }}>
            <Texte variante="meta" couleur="t3">
              {tendance != null ? t("mesuresCorps.taTendance", { v: signe(tendance, 2), u }) : t("mesuresCorps.tendanceInconnue")}
            </Texte>
            <Texte style={styles.date}>{tendance != null ? date(dt) : "—"}</Texte>
          </View>
        </View>
      </Groupe>
      <Groupe>
        <Lignes>{[lienObjectif, lienGras]}</Lignes>
      </Groupe>
    </>
  );
}

/** Ce qui a bougé sur les 30 jours d'avant le jour choisi (moyennes lissées du poids et du %) ; lien vers le Poids de la même pesée. */
function BlocBouge({ x, conv, u, jour, maintenant }: { x: Donnees; conv: (kg: number) => number; u: Unite; jour: number; maintenant: number }) {
  const kgA = lisseAu(x.kg, decaler(jour, -30)), kgB = lisseAu(x.kg, jour);
  const gA = lisseAu(x.gras, decaler(jour, -30)), gB = lisseAu(x.gras, jour);
  const b = kgA != null && kgB != null && gA != null && gB != null ? bouge(kgA, kgB, gA, gB) : null;
  const pesee = auPlusTard(x.kg, jour);
  const gras = auPlusTard(x.gras, jour);
  const max = b ? Math.max(Math.abs(conv(b.gras)), Math.abs(conv(b.maigre)), 0.5) * 1.3 : 1;
  return (
    <>
      {b ? (
        <>
          <TitreGroupe>{t("mesuresCorps.bouge")}</TitreGroupe>
          <Groupe bloc>
            <RailZero libelle={t("mesuresCorps.masseGrasse")} valeur={conv(b.gras)} max={max} texte={t("mesuresCorps.kgSigne", { v: signe(conv(b.gras), 1), u })} />
            <RailZero libelle={t("mesuresCorps.masseMaigre")} valeur={conv(b.maigre)} max={max} texte={t("mesuresCorps.kgSigne", { v: signe(conv(b.maigre), 1), u })} />
            <Texte variante="corps" style={{ marginTop: 10 }}>
              {t(`mesuresCorps.phrase.${b.phrase}` as "mesuresCorps.phrase.rien")}
            </Texte>
            <Note>{t("mesuresCorps.noteImpedance")}</Note>
          </Groupe>
        </>
      ) : null}
      {pesee ? (
        <Groupe style={b ? undefined : { marginTop: 24 }}>
          <LigneMesure
            titre={t("mesuresCorps.poids")}
            sous={
              gras && Math.abs(pesee.date - gras.date) < 12 * 3_600_000
                ? t("mesuresCorps.memePesee", { jour: minus(jourPesee(pesee.date, maintenant)) })
                : minus(jourPesee(pesee.date, maintenant))
            }
            etat={`${fixe(conv(pesee.valeur), 1)} ${u}`}
            onPress={() => router.push({ pathname: "/sante/poids", params: { jour: String(minuit(pesee.date)) } })}
          />
        </Groupe>
      ) : null}
    </>
  );
}

/** Sources : la balance (par Santé Connect), les saisies, Santé Connect et son état réel. */
function Sources({ x, cle, maintenant, onAjout, relierSante }: { x: Donnees; cle: CleCorps; maintenant: number; onAjout: () => void; relierSante: () => Promise<void> }) {
  const l = cle === "poids" ? x.kg : x.gras;
  const importee = [...l].reverse().find((r) => !r.manuel) ?? null;
  const saisies = l.filter((r) => r.manuel).length;
  const nom = importee ? nomSource(importee.origine) : "";
  return (
    <>
      <TitreGroupe>{t("mesures.sources")}</TitreGroupe>
      <Groupe>
        <Lignes>
          {[
            importee ? (
              <LigneMesure
                key="b"
                titre={importee.origine === ORIGINE_WHOOP ? nom : t(cle === "poids" ? "mesuresCorps.balanceTitre" : "mesuresCorps.balanceImpedance", { nom })}
                sous={t("mesuresCorps.parSanteConnect", { quand: `${minus(jourPesee(importee.date, maintenant))} ${heure(importee.date)}` })}
                etat={t("mesures.utilisee")}
                onPress={() => void sante.ouvrirReglages(importee.origine ?? undefined)}
              />
            ) : null,
            <LigneMesure
              key="s"
              titre={t("mesuresCorps.saisie")}
              sous={t("mesuresCorps.ajouteeMain")}
              etat={saisies ? tp(cle === "poids" ? "mesuresCorps.nbPesees" : "mesuresCorps.nbMesures", saisies) : null}
              onPress={onAjout}
            />,
            <LigneMesure
              key="c"
              titre={t("mesures.santeConnect")}
              sous={cle === "poids" ? t("mesuresCorps.poidsAutres") : t("mesuresCorps.grasAutres")}
              etat={x.sc ? t(x.sc === "autorisee" ? "mesures.autorisee" : x.sc === "aAutoriser" ? "mesures.aAutoriser" : "mesures.absente") : null}
              onPress={() => void relierSante()}
            />,
          ]}
        </Lignes>
      </Groupe>
    </>
  );
}

/** Saisie d'un % de masse grasse : un chiffre fort au clavier décimal, entre 2 et 70 %. */
function FeuilleAjoutGras({ visible, onFermer, onValider }: { visible: boolean; onFermer: () => void; onValider: (v: number) => void }) {
  const { couleurs } = useTheme();
  const [texte, setTexte] = useState("");
  const [erreur, setErreur] = useState(false);
  const valider = () => {
    const v = lireNombre(texte);
    if (v == null || v < 2 || v > 70) return setErreur(true);
    setTexte("");
    setErreur(false);
    onValider(v);
  };
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={t("mesuresCorps.nouvelleMesure")}>
      <View style={styles.saisie}>
        <TextInput
          maxFontSizeMultiplier={POLICE_MAX}
          value={texte}
          onChangeText={(s) => {
            setTexte(saisieLocale(s));
            setErreur(false);
          }}
          keyboardType="decimal-pad"
          placeholder="—"
          placeholderTextColor={couleurs.t3}
          cursorColor={couleurs.partieSante}
          selectionColor={couleurs.partieSante}
          accessibilityLabel={t("mesuresCorps.pourcentGras")}
          style={[typo.chiffreFort, { color: erreur ? couleurs.rate : couleurs.t1, padding: 0, minWidth: 96, textAlign: "center" }]}
        />
        <Texte variante="saisie" couleur="t2">
          %
        </Texte>
      </View>
      <Texte variante="meta" couleur={erreur ? "rate" : "t2"} style={{ textAlign: "center", marginTop: 4 }}>
        {erreur ? t("mesuresCorps.horsPlage") : t("mesuresCorps.pourcentGras")}
      </Texte>
      <View style={{ marginTop: 16 }}>
        <Bouton libelle={t("mesuresCorps.enregistrer")} variante="primaire" large onPress={valider} />
      </View>
    </Feuille>
  );
}

/** Une mesure de gras : saisie (supprimable) ou importée (lecture seule, à corriger dans son appli). */
function FeuilleMesureGras({ r, onFermer, onSupprimer }: { r: Releve | null; onFermer: () => void; onSupprimer: (id: string) => void }) {
  const [garde, setGarde] = useState<Releve | null>(r);
  if (r && r !== garde) setGarde(r);
  const x = r ?? garde;
  if (!x) return null;
  const source = x.manuel ? t("mesuresCorps.saisie") : nomSource(x.origine);
  return (
    <Feuille visible={r != null} onFermer={onFermer} titre={x.manuel ? t("mesuresCorps.mesureSaisie") : t("mesuresCorps.mesureImportee", { source })}>
      <Texte style={[typo.chiffreFort, { textAlign: "center", lineHeight: 52 }]}>
        {fixe(x.valeur, 1)}
        <Texte variante="saisie" couleur="t2">{" %"}</Texte>
      </Texte>
      <Texte variante="corps" couleur="t2" style={{ textAlign: "center", marginTop: 4 }}>
        {`${jourSemaineMois(x.date)}, ${heure(x.date)}${x.manuel ? "" : `, ${source}, ${t("mesuresCorps.lectureSeule")}`}`}
      </Texte>
      {x.manuel ? (
        <GroupeFeuille>
          <Option premier danger icone="trash" libelle={t("mesuresCorps.supprimerMesure")} onPress={() => onSupprimer(x.id)} />
        </GroupeFeuille>
      ) : (
        <Note>{t("mesuresCorps.noteLectureSeule", { source })}</Note>
      )}
    </Feuille>
  );
}

const styles = StyleSheet.create({
  chemin: { height: 8, borderRadius: 3, overflow: "hidden" },
  bornes: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  dates: { flexDirection: "row", marginTop: 14, borderTopWidth: 1 },
  date: { fontFamily: police.medium, fontSize: 17, marginTop: 3, fontVariant: ["tabular-nums"] },
  saisie: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 6, marginTop: 8 },
});
