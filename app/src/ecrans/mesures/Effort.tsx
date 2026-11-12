// Page Effort (planche effort-pepfit, variante C validée le 31/10, avec ses corrections : le chiffre seul, sans
// unité ; aucun maximum ; la cible se lit ici, pas sur la jauge). Ouverte par la jauge d'effort de l'onglet Sport (paramètre de
// route `jour`). Jetons orange Sport et halo marié Sport et Santé, tirés de la table des pages partagées (pages-partagees.ts). L'icône ⓘ ouvre le tiroir
// « Comprendre l'Effort ». Au gabarit des pages de statistiques (Énergie, Pas, Sommeil ; correction d'Alex du 31/10,
// docs/EFFORT-GABARIT.md) :
//   en tête    le semainier avec l'Effort de chaque jour sous sa date (D10, glissé d'un jour à l'autre, jamais le futur), le
//              grand anneau (le chiffre au centre, l'anneau suit la cible), la cible du jour, « D'où vient ce chiffre », puis
//              « Voir aussi » (la Récupération de ce matin et la dépense du jour : planche recuperation, D9) ;
//   Statistiques  Semaine (une barre par jour sur sa cible, l'Effort de la semaine, « Ton rythme » D8), Mois (30 jours) et
//              Année (une barre par mois : sa semaine moyenne), avec la moyenne, la semaine et le jour les plus chargés.
// Aucun écran ne parle de Whoop : l'effort est celui de pepfit (sport-stats-donnees.ts, effort-pepfit.ts).
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { t, tp } from "../../i18n/index";
import { formater } from "../../i18n/temps";
import { useLangue } from "../../i18n/useLangue";
import { useTheme } from "../../theme";
import { police } from "../../theme/typo";
import { Texte } from "../../ui/Texte";
import { useCouleursAnneau } from "../AnneauSport";
import { useApp } from "../contexte";
import { premierJourSeance } from "../effort-charges";
import { etatEffort, PISTE_RYTHME, scoreEffort, scoreSemaine, SEUILS_RYTHME, type Cible } from "../effort-pepfit";
import { jourMois } from "../format";
import { chargesJournees, lireSemaineEffort, type SemaineEffort } from "../sport-stats-donnees";
import { jourDeRoute } from "./agenda-liste";
import { EnteteJour, useJour } from "./EnteteJour";
import { MentionCycle } from "../cycle/MentionCycle";
import { AnneauEffortJour, DouVient, LienComprendre, LigneCible, TiroirEffort, useEffortJour, useValeursJours, VoirAussi } from "./EffortJour";
import { ActionTete, Groupe, LigneMesure, Lignes, Os, PageMesure, TitreGroupe } from "./gabarit";
import { GrapheBarres } from "./graphes";
import { bornes, decaler, joursEntre, libelleLongueur, lundi as lundiDe, minuit, periode, periodeExiste, type Periode, type TypePeriode } from "./periodes";
import { EnteteStats, Statistiques, useStats } from "./Statistiques";
import { texteDemi, texteEffort } from "./scores-calc";

export function Effort() {
  useLangue();
  const [maintenant] = useState(() => Date.now());
  const params = useLocalSearchParams<{ jour?: string }>();
  const [tiroir, setTiroir] = useState(false);
  return (
    <PageMesure halo="effort" titre={t("mesEffort.titre")} actions={<ActionTete nom="info" libelle={t("mesEffort.comprendre")} onPress={() => setTiroir(true)} />}>
      <Jour maintenant={maintenant} depart={jourDeRoute(params.jour)} onComprendre={() => setTiroir(true)} />
      <StatsEffort maintenant={maintenant} />
      <TiroirEffort visible={tiroir} onFermer={() => setTiroir(false)} />
    </PageMesure>
  );
}

function Jour({ maintenant, depart, onComprendre }: { maintenant: number; depart: number | null; onComprendre: () => void }) {
  const { couleurs } = useTheme();
  const { jour, aujourdhui, choisir } = useJour(maintenant, depart);
  const d = useEffortJour(jour, maintenant);
  const valeur = useValeursJours(jour, maintenant);
  const score = d?.effort?.score ?? null;
  const n = d?.effort?.seances ?? 0;
  const nomJour = formater(jour, { weekday: "long" });
  return (
    <EnteteJour jour={jour} maintenant={maintenant} onJour={choisir} valeur={valeur}>
      <AnneauEffortJour score={score} cible={d?.cible ?? null} estime={d?.effort?.estime ?? false} />
      <Texte style={[styles.sousAnneau, { color: couleurs.t2 }]}>
        {`${nomJour.charAt(0).toLocaleUpperCase()}${nomJour.slice(1)}, `}
        <Texte style={[styles.sousAnneau, { color: couleurs.t1, fontFamily: police.semibold }]}>
          {n ? tp("mesEffort.nSeances", n) : t("mesEffort.aucuneSeance")}
        </Texte>
      </Texte>
      {d ? <LigneCible cible={d.cible} score={score} aujourdhui={aujourdhui} /> : null}
      {/* suivi du cycle (planche cycle, écran 8) : en seconde moitié, une mention ; la cible ne change pas */}
      <MentionCycle jour={jour} />
      {d ? <DouVient seances={d.seances} effort={d.effort} pasIndisponibles={d.pasIndisponibles} /> : null}
      <VoirAussi jour={jour} maintenant={maintenant} />
      <LienComprendre onPress={onComprendre} />
    </EnteteJour>
  );
}

// ---- Statistiques ------------------------------------------------------------------------------------------------------

/** Ce que lit une période : la semaine (cibles et rythme), ou les charges de chaque jour (mois, année, depuis le lundi). */
type Lu = { semaine: SemaineEffort } | { charges: Map<number, number> };

/** Lecture d'une période : relue à l'arrivée sur la page ; null pendant la lecture d'une autre période. */
function useLecture<T>(lire: (db: ReturnType<typeof useApp>["db"]) => Promise<T>, cle: string): T | null {
  const { db } = useApp();
  const [v, setV] = useState<{ cle: string; v: T } | null>(null);
  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      lire(db)
        .then((x) => vivant && setV({ cle, v: x }))
        .catch(console.error);
      return () => {
        vivant = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db, cle]),
  );
  return v?.cle === cle ? v.v : null;
}

interface JourE {
  charge: number;
  cible: Cible | null;
}

function StatsEffort({ maintenant }: { maintenant: number }) {
  const a = useCouleursAnneau();
  const stats = useStats<TypePeriode>("semaine");
  const { type, k, sel } = stats;
  const cle = `${type}:${k}`;
  const premier = useLecture((db) => premierJourSeance(db), "premier");
  const lu = useLecture<Lu>(async (db) => {
    const b = bornes(type, k, maintenant);
    if (type === "semaine") return { semaine: await lireSemaineEffort(db, b.debut, maintenant) };
    // depuis le lundi de la première semaine touchée : la semaine la plus chargée se compte en entier
    return { charges: (await chargesJournees(db, lundiDe(b.debut), Math.min(b.fin, decaler(minuit(maintenant), 1)))).totales };
  }, cle);
  const lire = (j: number): JourE | null => {
    if (!lu) return null;
    if ("semaine" in lu) {
      const x = lu.semaine.jours.find((d) => d.jour === j);
      return x && x.charge != null ? { charge: x.charge, cible: x.cible } : null;
    }
    return { charge: lu.charges.get(j) ?? 0, cible: null };
  };
  const p = periode<JourE>(type, k, maintenant, lire, (d) => d.charge);
  const annee = type === "annee";
  const debutMesure = mesures(p.jours)[0]?.jour ?? Infinity;
  // une barre : l'Effort du jour ; l'année, la semaine moyenne du mois (sa charge par jour, sur 7 jours, puis la courbe)
  const barres = p.barres.map((b) => {
    if (!lu) return { ...b, v: null };
    if (!annee) return { ...b, v: b.jours[0]?.donnee ? scoreEffort(b.jours[0].donnee.charge) : null };
    return { ...b, v: moyenneSemaine(mesures(b.jours, debutMesure)) };
  });
  const cibles = p.barres.map((b) => (annee ? null : (b.jours[0]?.donnee?.cible ?? null)));
  const plages = cibles.map((c) => (c ? ([c.bas, c.haut] as [number, number]) : null));
  const libelle = t(annee ? "mesEffort.grapheMois" : "mesEffort.grapheJours", { titre: p.titre });
  return (
    <Statistiques<TypePeriode>
      lundi={type === "semaine" ? p.debut : null}
      periodes={(["semaine", "mois", "annee"] as const).map((v) => ({ valeur: v, libelle: t(`mesures.periode.${v}`) }))}
      type={type}
      onType={stats.choisirType}
      titre={p.titre}
      precedent={periodeExiste(type, k + 1, maintenant, premier)}
      onAller={stats.aller}
      k={k}
      nb={barres.length}
      sel={sel}
      onSel={stats.setSel}
      cle={`${cle}:${lu ? 1 : 0}`}
      libelleGraphe={libelle}
      entete={lu ? <Entete p={p} barres={barres} sel={sel} lu={lu} /> : <Os largeur={160} hauteur={34} rayon={8} style={{ marginTop: 18 }} />}
      graphe={(w) => (
        <GrapheBarres
          barres={barres}
          largeur={w}
          cle={cle}
          sel={sel}
          plein={() => true}
          valeur={type === "semaine" ? (v) => (v > 0 ? texteEffort(v) : t("mesEffort.repos")) : undefined}
          axe={type === "semaine" ? undefined : (v) => texteDemi(v)}
          largeurBarre={type === "semaine" ? 24 : annee ? 18 : 7}
          plages={plages}
          couleursPlage={{ piste: a.piste, trait: a.trait }}
          couleurBarre={(v, i) => a.etat[etatEffort(v, cibles[i] ?? null)]}
          libelle={libelle}
        />
      )}
      apres={!lu ? null : "charges" in lu ? <LignesPeriode p={p} charges={lu.charges} /> : lu.semaine.rythme ? <Rythme r={lu.semaine.rythme.r} bande={lu.semaine.rythme.bande} /> : null}
    />
  );
}

/** L'en-tête : la valeur touchée (un jour, ou la semaine moyenne d'un mois), sinon l'Effort de la semaine ou d'une semaine moyenne. */
function Entete({ p, barres, sel, lu }: { p: Periode<JourE>; barres: { v: number | null }[]; sel: number | null; lu: Lu }) {
  const b = sel != null ? p.barres[sel] : null;
  if (b && sel != null) {
    const v = barres[sel]!.v;
    if (p.type === "annee") return <EnteteStats petit={t("mesEffort.semaineMoyenneDe", { titre: b.titre })} valeur={v ? texteEffort(v) : "–"} />;
    const c = b.jours[0]?.donnee?.cible ?? null;
    return (
      <EnteteStats
        petit={b.titre}
        valeur={v ? texteEffort(v) : "–"}
        ligne={c ? t("mesEffort.cibleJour", { bas: texteDemi(c.bas), haut: texteDemi(c.haut) }) : v == null ? undefined : v > 0 ? undefined : t("mesEffort.repos")}
      />
    );
  }
  if ("semaine" in lu) {
    const s = lu.semaine;
    return (
      <EnteteStats
        petit={t("mesEffort.effortSemaine")}
        valeur={texteEffort(s.score)}
        ligne={s.seances ? `${tp("mesEffort.nSeances", s.seances)}${tp("mesEffort.enJours", s.joursAvecSeance)}` : undefined}
      />
    );
  }
  const m = semaineMoyenne(p);
  return <EnteteStats petit={`${t("mesEffort.semaineMoyenne")}, ${libelleLongueur(p.type)}`} valeur={m != null ? texteEffort(m) : "–"} vide={m == null} />;
}

/** L'Effort d'une semaine moyenne de la période : sa charge par jour, sur 7 jours, puis la courbe (jamais une moyenne de scores). */
function semaineMoyenne(p: Periode<JourE>): number | null {
  return moyenneSemaine(mesures(p.jours));
}

/** Les jours à partir du premier jour mesuré : les mois d'avant tes débuts ne tirent pas la moyenne vers 0. */
function mesures<J extends { jour: number; donnee: JourE | null }>(jours: readonly J[], depuis?: number): J[] {
  const d = depuis ?? jours.find((j) => (j.donnee?.charge ?? 0) > 0)?.jour;
  return d == null ? [] : jours.filter((j) => j.jour >= d);
}

/** Charge par jour, sur 7 jours, puis la courbe ; null sans charge. */
function moyenneSemaine(jours: readonly { donnee: JourE | null }[]): number | null {
  const total = jours.reduce((s, j) => s + (j.donnee?.charge ?? 0), 0);
  return total > 0 ? scoreSemaine((total / jours.length) * 7) : null;
}

/** Mois et année : la semaine moyenne, la semaine la plus chargée (en entier, du lundi), le jour le plus chargé. */
function LignesPeriode({ p, charges }: { p: Periode<JourE>; charges: Map<number, number> }) {
  const m = semaineMoyenne(p);
  if (m == null) return null;
  let semaine: { lundi: number; score: number } | null = null;
  for (let l = lundiDe(p.debut); l < p.fin; l = decaler(l, 7)) {
    const c = joursEntre(l, decaler(l, 7)).reduce((s, j) => s + (charges.get(j) ?? 0), 0);
    if (c > 0 && (!semaine || scoreSemaine(c) > semaine.score)) semaine = { lundi: l, score: scoreSemaine(c) };
  }
  let jour: { jour: number; score: number } | null = null;
  for (const j of p.jours) if (j.donnee && j.donnee.charge > 0 && (!jour || scoreEffort(j.donnee.charge) > jour.score)) jour = { jour: j.jour, score: scoreEffort(j.donnee.charge) };
  return (
    <Groupe>
      <Lignes>
        {[
          <LigneMesure key="m" titre={t("mesEffort.semaineMoyenne")} sous={libelleLongueur(p.type)} valeur={texteEffort(m)} />,
          semaine ? <LigneMesure key="s" titre={t("mesEffort.semainePlus")} valeur={texteEffort(semaine.score)} sousValeur={t("mesEffort.duLundi", { date: jourMois(semaine.lundi) })} /> : null,
          jour ? <LigneMesure key="j" titre={t("mesEffort.jourPlus")} valeur={texteEffort(jour.score)} sousValeur={jourMois(jour.jour)} /> : null,
        ]}
      </Lignes>
    </Groupe>
  );
}

/** « Ton rythme » (D8) : la piste de 0,5 à 2 fois ta semaine habituelle, la bande de ton rythme, ton repère, une phrase. */
function Rythme({ r, bande }: { r: number; bande: "calme" | "rythme" | "plus" | "beaucoup" }) {
  const { couleurs } = useTheme();
  const a = useCouleursAnneau();
  const pos = (x: number) => `${Math.max(0, Math.min(1, (x - PISTE_RYTHME[0]) / (PISTE_RYTHME[1] - PISTE_RYTHME[0]))) * 100}%` as const;
  const couleur = bande === "rythme" ? couleurs.valide : bande === "beaucoup" ? couleurs.rate : couleurs.t2;
  return (
    <>
      <TitreGroupe>{t("mesEffort.tonRythme")}</TitreGroupe>
      <Groupe bloc>
        <View style={styles.rythmeHaut} accessible accessibilityLabel={`${t("mesEffort.foisHabituelle", { r: texteEffort(r) })}, ${t(`mesEffort.bande.${bande}`)}`}>
          <Texte style={[styles.rythmeTitre, { color: couleurs.t1 }]}>{t("mesEffort.foisHabituelle", { r: texteEffort(r) })}</Texte>
          <Texte style={[styles.rythmeEtat, { color: couleur }]}>{t(`mesEffort.bande.${bande}`)}</Texte>
        </View>
        <View style={[styles.piste, { backgroundColor: a.piste }]}>
          <View style={[styles.bande, { left: pos(SEUILS_RYTHME.calme), width: `${((SEUILS_RYTHME.rythme - SEUILS_RYTHME.calme) / (PISTE_RYTHME[1] - PISTE_RYTHME[0])) * 100}%`, backgroundColor: couleurs.valide }]} />
          <View style={[styles.repere, { left: pos(r), backgroundColor: couleurs.t1 }]} />
        </View>
        {/* Repères écartés : « plus calme » à gauche, « ton rythme » au centre de la bande, « beaucoup plus » à droite. */}
        <View style={styles.graduation}>
          <Texte style={[styles.grad, { color: couleurs.t2 }]}>{t("mesEffort.grad.calme")}</Texte>
          <Texte style={[styles.grad, { color: couleurs.t2, textAlign: "center" }]}>{t("mesEffort.grad.rythme")}</Texte>
          <Texte style={[styles.grad, { color: couleurs.t2, textAlign: "right" }]}>{t("mesEffort.grad.beaucoup")}</Texte>
        </View>
        <Texte variante="corps" couleur="t2" style={styles.rythmePhrase}>
          {t(`mesEffort.phrase.${bande}`)}
        </Texte>
      </Groupe>
    </>
  );
}

const styles = StyleSheet.create({
  sousAnneau: { textAlign: "center", fontFamily: police.regular, fontSize: 14, marginTop: 12 },
  rythmeHaut: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  rythmeTitre: { flex: 1, fontFamily: police.semibold, fontSize: 15 },
  rythmeEtat: { fontFamily: police.semibold, fontSize: 13.5 },
  piste: { height: 6, borderRadius: 3, marginTop: 14, overflow: "visible" },
  bande: { position: "absolute", top: 0, bottom: 0, borderRadius: 3, opacity: 0.35 },
  repere: { position: "absolute", top: -5, width: 4, height: 16, marginLeft: -2, borderRadius: 2 },
  graduation: { flexDirection: "row", marginTop: 8 },
  grad: { flex: 1, fontFamily: police.regular, fontSize: 12 },
  rythmePhrase: { fontSize: 13.5, lineHeight: 20, marginTop: 8 },
});
