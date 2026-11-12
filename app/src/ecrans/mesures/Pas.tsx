// Page Pas (planche pas, variante A validée le 28/10 ; NOTES § 1, 3, 4, 5 ; retour du 29/10) : en tête le
// semainier commun et le jour choisi (EnteteJour : glissé d'un jour à l'autre, jamais le futur ; paramètre de route `jour`),
// son « quand », son nombre et son anneau fin, Distance · Calories · Reste, la journée heure par heure face au rythme
// habituel (ou, avec Whoop qui ne donne qu'un total, la journée sur trois rails), puis les statistiques Semaine / Mois /
// Année, les sources et la feuille de l'objectif ; l'icône agenda ouvre la page agenda (agenda-store). Source des pas : règle commune (pas-source.ts : Withings, Santé
// Connect, puis le compteur du téléphone). Rien d'inventé : un jour sans donnée n'est jamais un zéro, une distance sans taille n'est pas affichée.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type ScrollViewInstance } from "react-native";
import Animated, { useAnimatedProps, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { t, tp } from "../../i18n/index";
import { formater } from "../../i18n/temps";
import { useLangue } from "../../i18n/useLangue";
import { sante } from "../../natif/sante/index";
import { lireApplisSante } from "../applis-sante";
import { useTheme } from "../../theme";
import { police, rayon } from "../../theme/typo";
import { Feuille, Groupe as GroupeFeuille } from "../../ui/Feuille";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { Icone } from "../../ui/Icone";
import { courbes } from "../../ui/mouvement";
import { useReduit } from "../../ui/reduit";
import { Texte } from "../../ui/Texte";
import { LigneGeste } from "../BlocEffort";
import { useApp, useCharge } from "../contexte";
import { approx, heure, heureLue, nombre } from "../format";
import { jourDeRoute } from "./agenda-liste";
import { ouvrirAgenda } from "./agenda-store";
import { EnteteJour, useJour } from "./EnteteJour";
import {
  ActionTete, Anneau, BlocVide, BoutonPlein, Cles, Duo, EnPanne, Groupe, Heros, LigneMesure, Lignes, Note, Os, PageMesure, PageVide, Quand,
  MARGE, RailCompare, Signe, TitreGroupe, Trois, useDefileVers, useMesure, ValeurDuo,
} from "./gabarit";
import { Etiquette, GrapheBarres, Tirets, echelle } from "./graphes";
import { activerPasTelephone, autoriserPasSante, ecrireObjectifPas, lireDonneesPas, lireHeuresPas, type DonneesPas } from "./pas-donnees";
import { nomSource } from "../sante-donnees";
import {
  choixObjectif, cumul, distanceKm, habituelA, OBJECTIF_MAX, OBJECTIF_PAS_DEFAUT, PAS_OBJECTIF, projection, series, statsPas,
} from "./pas-calc";
import { court, decaler, ecartRelatif, joursEntre, libelleLongueur, minuit, periode, periodeExiste, type Periode, type TypePeriode } from "./periodes";
import { EnteteStats, Statistiques } from "./Statistiques";

const jourSemaineMois = (ms: number) => formater(ms, { weekday: "short", day: "numeric", month: "short" });

type Choix = "defaut" | "profil" | "perso";

export function Pas() {
  useLangue();
  const { db } = useApp();
  const params = useLocalSearchParams<{ jour?: string }>();
  const [depuis] = useState(() => Date.now());
  const [x, recharger, panne] = useCharge((d) => lireDonneesPas(d), [], undefined, "sante/pas");
  const { jour, aujourdhui, choisir } = useJour(x?.maintenant ?? depuis, jourDeRoute(params.jour));
  const heures = useHeuresJour(x, jour, aujourdhui);
  const haut = useRef<ScrollViewInstance | null>(null);
  const [objectifOuvert, setObjectifOuvert] = useState(false);
  const [type, setType] = useState<TypePeriode>("semaine");
  const [k, setK] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const defile = useDefileVers();
  // squelette seulement si la lecture dure plus de 300 ms (sinon rien ne bouge à l'arrivée)
  const [os, setOs] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setOs(true), 300);
    return () => clearTimeout(id);
  }, []);

  // un jour touché dans l'agenda : il s'affiche en tête, la page remonte
  const montrerJour = (j: number) => {
    choisir(j);
    haut.current?.scrollTo({ y: 0, animated: false });
  };
  const agenda = () =>
    x &&
    ouvrirAgenda({
      titre: t("mesuresPas.titre"),
      maintenant: x.maintenant,
      premier: x.premier,
      legende: t("mesuresPas.agendaLegende"),
      lire: async (debut, fin) =>
        joursEntre(debut, fin).flatMap((j) => {
          const c = x.jours.get(j);
          if (!c || c.etat !== "valeur") return [];
          return [{ date: j, texte: `${nombre(c.pas, 0)} ${t("mesuresPas.pas")}`, sous: nomSourcePas(c.source), bon: c.pas >= x.objectif }];
        }),
      onJour: montrerJour,
    });

  const actions = (
    <>
      {x && x.premier != null ? <ActionTete nom="cal" libelle={t("mesuresPas.agenda")} onPress={agenda} /> : null}
      <ActionTete nom="cible" libelle={t("mesuresPas.objectifQuotidien")} onPress={() => setObjectifOuvert(true)} />
    </>
  );

  if (!x)
    return (
      <PageMesure halo="pas" titre={t("mesuresPas.titre")} actions={actions}>
        {panne ? <EnPanne onReessayer={() => void recharger().catch(console.error)} /> : os ? <Chargement /> : null}
      </PageMesure>
    );

  const aucuneSource = x.aujourdhui.etat === "a-connecter" && x.santeConnect !== "autorisee" && x.telephone !== "actif" && x.premier == null;
  if (aucuneSource)
    return (
      <PageMesure halo="pas" titre={t("mesuresPas.titre")} actions={actions}>
        <PageVide
          icone="pas"
          titre={t("mesuresPas.aucuneSource")}
          texte={t("mesuresPas.aucuneSourceTexte")}
          action={t("mesures.autoriserSanteConnect")}
          onAction={() => void autoriserPasSante().then(() => recharger()).catch(console.error)}
        />
        {x.telephone === "a-activer" ? (
          <Groupe>
            <LigneMesure titre={t("mesuresPas.telephone")} sous={t("mesuresPas.telephoneAide")} onPress={() => void activerPasTelephone(db).then(() => recharger()).catch(console.error)} />
          </Groupe>
        ) : null}
        <FeuilleObjectif x={x} visible={objectifOuvert} onFermer={() => setObjectifOuvert(false)} onChange={recharger} />
      </PageMesure>
    );

  return (
    <PageMesure
      halo="pas"
      titre={t("mesuresPas.titre")}
      actions={actions}
      defilement={(v) => {
        defile.page(v);
        haut.current = v;
      }}
    >
      <EnteteJour jour={jour} maintenant={x.maintenant} onJour={choisir} avecDonnee={(j) => valeurDe(x, j) != null}>
        <Haut x={x} jour={jour} heures={heures} onAutoriser={() => void autoriserPasSante().then(() => recharger()).catch(console.error)} />
      </EnteteJour>
      <View ref={defile.cible} collapsable={false}>
        <StatsPas x={x} type={type} k={k} sel={sel} setType={(v) => (setType(v), setK(0), setSel(null))} setK={(v) => (setK(v), setSel(null))} setSel={setSel} />
      </View>
      <Sources x={x} recharger={recharger} onObjectif={() => setObjectifOuvert(true)} />
      <FeuilleObjectif x={x} visible={objectifOuvert} onFermer={() => setObjectifOuvert(false)} onChange={recharger} />
    </PageMesure>
  );
}

const valeurDe = (x: DonneesPas, j: number): number | null => {
  const c = x.jours.get(j);
  return c && c.etat === "valeur" ? c.pas : null;
};

// ---- Haut de page ------------------------------------------------------------------------------------------------------

/**
 * Heure par heure du jour choisi : celle d'aujourd'hui vient de la lecture de la page ; un jour passé est lu à part (Santé
 * Connect autorisé). undefined pendant la lecture, null sans heure par heure.
 */
function useHeuresJour(x: DonneesPas | undefined, jour: number, aujourdhui: boolean): (number | null)[] | null | undefined {
  const [lu, setLu] = useState<{ jour: number; heures: (number | null)[] | null } | null>(null);
  const c = x?.jours.get(jour);
  const passe = !!x && !aujourdhui && x.santeConnect === "autorisee" && c?.etat === "valeur" && c.source === "sante";
  useEffect(() => {
    if (!passe || !x) return;
    let vivant = true;
    void lireHeuresPas(jour, x.maintenant).then((h) => vivant && setLu({ jour, heures: h })).catch(console.error);
    return () => {
      vivant = false;
    };
  }, [passe, jour, x]);
  if (!x) return undefined;
  if (aujourdhui) return x.heures;
  if (!passe) return null;
  return lu?.jour === jour ? lu.heures : undefined;
}

/** Nom de l'appli qui écrit des pas (« Garmin »), sinon « l'appli de ta montre ». */
const nomAppliPas = (paquet: string) => {
  const nom = nomSource(paquet);
  return nom === t("sante.santeConnect") ? t("mesuresPas.tonAppli") : nom;
};

/** Le nom d'une source de pas, dit sous le chiffre. */
const nomSourcePas = (s: "whoop" | "withings" | "sante" | "telephone") => s === "withings" ? "Withings" : t(s === "whoop" ? "mesures.whoop" : s === "telephone" ? "mesures.telephone" : "mesures.santeConnect");

function Haut({ x, jour, heures, onAutoriser }: { x: DonneesPas; jour: number; heures: (number | null)[] | null | undefined; onAutoriser: () => void }) {
  const auj = minuit(x.maintenant);
  const ajd = jour === auj;
  const c = x.jours.get(jour) ?? { etat: "a-connecter" as const };
  const source = c.etat === "a-connecter" ? null : c.source;
  const nom = source ? nomSourcePas(source) : null;
  // Whoop écrit les pas du jour d'un coup quand la journée se ferme : on ne le dit que si c'est bien lui qui écrit dans Santé Connect.
  const [whoopEcrit, setWhoopEcrit] = useState(false);
  useEffect(() => {
    let vivant = true;
    lireApplisSante(sante).then((l) => vivant && setWhoopEcrit(l.includes("Whoop"))).catch(() => {});
    return () => {
      vivant = false;
    };
  }, []);
  const total = c.etat === "valeur" ? c.pas : null;
  const part = total == null ? 0 : total / x.objectif;
  const p = Math.round(part * 100);
  const km = total == null ? null : distanceKm(total, x.tailleCm);
  // l'heure par heure ne vaut que si la source du jour est Santé Connect (sinon les deux totaux ne se ressemblent pas)
  const heureParHeure = source === "sante" && heures != null;
  return (
    <>
      {nom ? <Quand texte={nom} /> : null}
      {total == null ? (
        <Heros
          vide
          valeur={ajd ? t("mesuresPas.pasEncore") : t("mesures.pasDeDonneeJour")}
          sous={ajd && nom ? t("mesuresPas.pasEncoreSous", { source: nom }) : undefined}
          droite={<Anneau part={0} />}
        />
      ) : (
        <Heros
          valeur={nombre(total, 0)}
          sous={t("mesuresPas.partObjectif", { p, objectif: nombre(x.objectif, 0) })}
          droite={<Anneau part={part} />}
          libelle={t("mesuresPas.libelleHeros", { n: nombre(total, 0), p, objectif: nombre(x.objectif, 0) })}
        />
      )}
      {total != null ? (
        <Trois
          cases={[
            ...(km != null ? [{ titre: t("mesuresPas.distance"), valeur: nombre(km, 1), unite: t("mesuresPas.km") }] : []),
            { titre: t("mesuresPas.calories"), valeur: approx(nombre(total * x.kcalParPas, 0)), unite: t("mesuresPas.kcal") },
            // « Reste » ne se dit que d'aujourd'hui (un jour passé est fini)
            ...(ajd ? [{ titre: t("mesuresPas.reste"), valeur: nombre(Math.max(0, x.objectif - total), 0), unite: t("mesuresPas.pas") }] : []),
          ]}
        />
      ) : null}
      {total == null && x.horsPriorite ? (
        <BlocVide titre={t("mesuresPas.horsPriorite")} texte={t("mesuresPas.horsPrioriteTexte", { appli: x.horsPriorite.map(nomAppliPas).join(", ") })} />
      ) : total == null ? (
        <BlocVide titre={t("mesuresPas.rienCompte")} texte={t(source === "whoop" ? "mesuresPas.rienCompteTexteWhoop" : ajd && whoopEcrit ? "mesuresPas.rienCompteTexteWhoopSC" : "mesuresPas.rienCompteTexte")} />
      ) : heureParHeure ? (
        <AuFil x={x} heures={heures!} jour={jour} />
      ) : source === "sante" && heures === undefined ? (
        <AuFilChargement />
      ) : (
        <LaJournee x={x} jour={jour} total={total} whoop={source === "whoop"} onAutoriser={onAutoriser} />
      )}
    </>
  );
}

/** Journée heure par heure : avance sur le rythme habituel, projection du soir, courbe cumulée et pas de chaque heure. */
function AuFil({ x, heures, jour }: { x: DonneesPas; heures: (number | null)[]; jour: number }) {
  const ajd = jour === minuit(x.maintenant);
  const total = heures.reduce<number>((a, v) => a + (v ?? 0), 0);
  const d = new Date(x.maintenant);
  // un jour passé est fini : sa courbe va jusqu'à minuit, sans avance ni projection du soir
  const h = ajd ? d.getHours() + d.getMinutes() / 60 : 24;
  const hab = x.habituel;
  const avance = ajd && hab ? total - habituelA(hab, h) : null;
  const proj = ajd && hab ? projection(total, hab, h) : null;
  const [W, setW] = useState(0);
  return (
    <>
      <TitreGroupe>{t("mesuresPas.auFil")}</TitreGroupe>
      <Groupe bloc>
        {avance != null && proj != null ? (
          <Duo
            gauche={<ValeurDuo valeur={`${avance >= 0 ? "+" : "−"}${nombre(Math.abs(avance), 0)}`} unite={t("mesuresPas.pas")} sous={t(avance >= 0 ? "mesuresPas.avance" : "mesuresPas.retard")} />}
            droite={<ValeurDuo droite valeur={approx(nombre(Math.round(proj / 10) * 10, 0))} sous={t("mesuresPas.ceSoir")} />}
          />
        ) : null}
        <View onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))}>
          {W > 0 ? <CourbeJour W={W} heures={heures} habituel={hab} total={total} objectif={x.objectif} heure={h} projection={proj} maintenant={ajd ? x.maintenant : null} /> : null}
        </View>
        <Cles
          cles={[
            { libelle: t(ajd ? "mesuresPas.cleAuj" : "mesuresPas.cleJour"), trait: "plein" },
            ...(hab ? [{ libelle: t("mesuresPas.cleHabituel"), trait: "point" as const }] : []),
            { libelle: t("mesuresPas.cleObjectif"), trait: "tiret" },
          ]}
        />
        {!hab ? <Note>{t("mesuresPas.sansHabituel")}</Note> : null}
      </Groupe>
    </>
  );
}

/** Place de l'heure par heure d'un jour passé pendant sa lecture. */
function AuFilChargement() {
  return (
    <>
      <TitreGroupe>{t("mesuresPas.auFil")}</TitreGroupe>
      <Groupe bloc style={{ height: 228 }}>
        <View accessible accessibilityLabel={t("mesures.chargement")} style={{ flex: 1, justifyContent: "flex-end" }}>
          <Os largeur="100%" hauteur={30} />
        </View>
      </Groupe>
    </>
  );
}

const PathAnime = Animated.createAnimatedComponent(Path);
const CercleAnime = Animated.createAnimatedComponent(Circle);

/** Courbe cumulée du jour (rose, se trace en 700 ms), habituel en pointillés, objectif en tirets ; pas de chaque heure dessous. */
function CourbeJour({
  W,
  heures,
  habituel,
  total,
  objectif,
  heure: hMaint,
  projection: proj,
  maintenant,
}: {
  W: number;
  heures: (number | null)[];
  habituel: number[] | null;
  total: number;
  objectif: number;
  heure: number;
  projection: number | null;
  /** null : un jour passé, fini à minuit. */
  maintenant: number | null;
}) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const reduit = useReduit();
  const H = 132;
  const base = H - 4;
  const max = echelle(Math.max(objectif, proj ?? 0, total) * 1.08);
  const X = (h: number) => (h / 24) * W;
  const Y = (v: number) => base - (v / max) * (base - 8);
  const hEntiere = Math.floor(hMaint);
  const c = cumul(heures.slice(0, hEntiere));
  const pts: [number, number][] = [[0, 0], ...c.map((v, i): [number, number] => [i + 1, v]), [hMaint, total]];
  const xy = pts.map(([h, v]) => [X(h), Y(v)] as const);
  const ligne = xy.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)} ${b.toFixed(1)}`).join("");
  let longueur = 0;
  for (let i = 1; i < xy.length; i++) longueur += Math.hypot(xy[i]![0] - xy[i - 1]![0], xy[i]![1] - xy[i - 1]![1]);
  const fin = xy[xy.length - 1]!;
  const hab = habituel ? cumul(habituel).map((v, i) => `L${X(i + 1).toFixed(1)} ${Y(v).toFixed(1)}`).join("") : "";
  const p = useSharedValue(reduit ? 1 : 0);
  const o = useSharedValue(reduit ? 0 : 0);
  useEffect(() => {
    if (reduit) {
      o.value = withTiming(1, { duration: 200, easing: courbes.sortie });
      return;
    }
    p.value = withDelay(120, withTiming(1, { duration: 700, easing: courbes.sortie }));
    o.value = withDelay(620, withTiming(1, { duration: 260, easing: courbes.sortie }));
  }, [reduit, p, o]);
  const trace = useAnimatedProps(() => ({ strokeDashoffset: longueur * (1 - p.value) }));
  const aire = useAnimatedProps(() => ({ fillOpacity: o.value }));
  const point = useAnimatedProps(() => ({ opacity: o.value }));
  const pasMax = Math.max(1, ...heures.map((v) => v ?? 0));
  const bw = W / 24 - 3;
  const hab_ = habituel ? habituelA(habituel, hMaint) : null;
  const libelle = maintenant == null ? t("mesuresPas.courbeJour", { n: nombre(total, 0) }) : t("mesuresPas.courbe", { n: nombre(total, 0), heure: heure(maintenant) });
  return (
    <View accessible accessibilityLabel={hab_ != null ? t("mesuresPas.courbeHabituel", { texte: libelle, n: nombre(hab_, 0) }) : libelle}>
      <Svg width={W} height={H}>
        <Defs>
          <LinearGradient id="aire-pas" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={m.fort} stopOpacity={0.28} />
            <Stop offset="1" stopColor={m.fort} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {[max / 2, max].map((v) => (
          <Line key={v} x1={0} x2={W} y1={Y(v)} y2={Y(v)} stroke={m.grille} strokeWidth={1} />
        ))}
        <Line x1={0} x2={W} y1={base} y2={base} stroke={couleurs.line2} strokeWidth={1} />
        <Tirets x1={0} x2={W} y={Y(objectif)} />
        <Etiquette x={0} y={Y(objectif) - 6} texte={t("mesuresPas.objectifN", { n: nombre(objectif, 0) })} ancre="start" />
        {hab ? <Path d={`M0 ${base}${hab}`} fill="none" stroke={m.habituel} strokeWidth={2} strokeDasharray="0.5 4.5" strokeLinecap="round" /> : null}
        <PathAnime d={`${ligne}L${fin[0].toFixed(1)} ${base}L0 ${base}Z`} fill="url(#aire-pas)" animatedProps={aire} />
        <PathAnime
          d={ligne}
          fill="none"
          stroke={m.fort}
          strokeWidth={2.25}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={`${longueur} ${longueur}`}
          animatedProps={trace}
        />
        <CercleAnime cx={fin[0]} cy={fin[1]} r={4.5} fill={m.fort} stroke={m.groupe} strokeWidth={2} animatedProps={point} />
      </Svg>
      <Svg width={W} height={48} style={{ marginTop: 6 }}>
        {heures.map((v, h) =>
          !v ? null : (
            <Rect
              key={h}
              x={X(h) + 1.5}
              y={30 - Math.max(2, (v / pasMax) * 28)}
              width={Math.max(1, bw)}
              height={Math.max(2, (v / pasMax) * 28)}
              rx={2}
              fill={h === hEntiere ? m.fort : m.doux}
            />
          ),
        )}
        {[0, 6, 12, 18, 24].map((hh) => (
          <Etiquette key={hh} x={X(hh)} y={45} texte={t("mesuresPas.heureH", { h: hh })} ancre={hh === 0 ? "start" : hh === 24 ? "end" : "middle"} />
        ))}
      </Svg>
    </View>
  );
}

/** Journée sans heure par heure (Whoop) : aujourd'hui, la moyenne de 30 jours et l'objectif sur trois rails de même échelle. */
function LaJournee({ x, jour, total, whoop, onAutoriser }: { x: DonneesPas; jour: number; total: number; whoop: boolean; onAutoriser: () => void }) {
  const ajd = jour === minuit(x.maintenant);
  const s30 = statsPas(
    Array.from({ length: 30 }, (_, i) => {
      const j = decaler(jour, -30 + i);
      return { jour: j, v: valeurDe(x, j) };
    }),
    x.objectif,
  );
  const moy = s30.moyenne;
  const max = Math.max(x.objectif, moy ?? 0, total) * 1.12;
  return (
    <>
      <TitreGroupe>{t("mesuresPas.laJournee")}</TitreGroupe>
      <Groupe bloc>
        <View style={{ gap: 0 }}>
          <RailCompare libelle={t(ajd ? "mesuresPas.cleAuj" : "mesuresPas.cleJour")} part={total / max} valeur={nombre(total, 0)} />
          {moy != null ? <RailCompare libelle={t("mesuresPas.moyenne30")} part={moy / max} valeur={nombre(moy, 0)} style="doux" /> : null}
          <RailCompare libelle={t("mesuresPas.cleObjectif")} part={x.objectif / max} valeur={nombre(x.objectif, 0)} style="objectif" />
        </View>
        {whoop ? <Note>{t("mesuresPas.noteWhoop")}</Note> : null}
      </Groupe>
      {x.santeConnect === "aAutoriser" ? (
        <Groupe>
          <LigneMesure titre={t("mesuresPas.voirHeures")} sous={t("mesuresPas.avecSante")} onPress={onAutoriser} />
        </Groupe>
      ) : null}
    </>
  );
}

// ---- Statistiques ------------------------------------------------------------------------------------------------------

function StatsPas({
  x,
  type,
  k,
  sel,
  setType,
  setK,
  setSel,
}: {
  x: DonneesPas;
  type: TypePeriode;
  k: number;
  sel: number | null;
  setType: (v: TypePeriode) => void;
  setK: (v: number) => void;
  setSel: (v: number | null) => void;
}) {
  const lire = (j: number) => {
    const v = valeurDe(x, j);
    return v == null ? null : { pas: v };
  };
  const p = useMemo(() => periode(type, k, x.maintenant, lire, (d) => d.pas), [type, k, x]);
  const avant = useMemo(() => periode(type, k + 1, x.maintenant, lire, (d) => d.pas), [type, k, x]);
  const s = statsPas(p.jours, x.objectif);
  const sAvant = statsPas(avant.jours, x.objectif);
  const longueur = libelleLongueur(type);
  const b = sel != null ? p.barres[sel] : null;
  const annee = type === "annee";
  const plein = (v: number) => v >= x.objectif;

  let entete;
  if (b) {
    const petit = annee ? t("mesures.moyenneMois", { titre: b.titre }) : b.titre;
    entete =
      b.v == null ? (
        <EnteteStats petit={petit} vide valeur={t("mesures.pasDeDonnee")} ligne={t("mesuresPas.aucuneSourceJour")} />
      ) : (
        <EnteteStats
          petit={petit}
          valeur={nombre(b.v, 0)}
          unite={annee ? t("mesuresPas.pasJour") : t("mesuresPas.pas")}
          ligne={b.v >= x.objectif ? t("mesuresPas.objectifAtteint") : t("mesuresPas.sousObjectif", { n: nombre(x.objectif - b.v, 0) })}
        />
      );
  } else if (s.n <= 1) {
    entete = (
      <EnteteStats
        petit={s.n ? jourSemaineMois(s.meilleur!.jour) : t("mesures.moyenneDe", { longueur })}
        valeur={s.n ? nombre(s.total, 0) : t("mesures.pasDeDonnee")}
        vide={!s.n}
        unite={s.n ? t("mesuresPas.pas") : null}
        ligne={t("mesuresPas.desDeuxJours")}
      />
    );
  } else {
    const e = ecartRelatif(s.moyenne, sAvant.moyenne);
    entete = (
      <EnteteStats
        petit={t("mesures.moyenneDe", { longueur })}
        valeur={nombre(s.moyenne!, 0)}
        unite={t("mesuresPas.pasJour")}
        ligne={
          e != null && sAvant.moyenne != null ? (
            <>
              <Signe ecart={e} />
              <Texte variante="meta" couleur="t2">
                {t("mesures.vsAvant", { avant: t(`mesures.avantDe.${type}`), valeur: nombre(sAvant.moyenne, 0) })}
              </Texte>
            </>
          ) : undefined
        }
      />
    );
  }

  const precedent = periodeExiste(type, k + 1, x.maintenant, x.premier);
  return (
    <Statistiques<TypePeriode>
      lundi={type === "semaine" ? p.debut : null}
      periodes={(["semaine", "mois", "annee"] as const).map((v) => ({ valeur: v, libelle: t(`mesures.periode.${v}`) }))}
      type={type}
      onType={setType}
      titre={x.premier != null && minuit(x.premier) === minuit(x.maintenant) && k === 0 ? t("mesuresPas.premierJour") : p.titre}
      precedent={precedent}
      onAller={(sens) => setK(Math.max(0, k + sens))}
      k={k}
      entete={entete}
      nb={p.barres.length}
      sel={sel}
      onSel={setSel}
      cle={`${type}:${k}`}
      libelleGraphe={t(annee ? "mesuresPas.grapheMois" : "mesuresPas.grapheJours", { titre: p.titre })}
      graphe={(W) => (
        <GrapheBarres
          barres={p.barres}
          largeur={W}
          cle={`${type}:${k}`}
          sel={sel}
          plein={plein}
          objectif={x.objectif}
          valeur={type === "semaine" ? court : undefined}
          axe={type === "semaine" ? undefined : court}
          largeurBarre={type === "semaine" ? 28 : annee ? 18 : 7}
          libelle={t(annee ? "mesuresPas.grapheMois" : "mesuresPas.grapheJours", { titre: p.titre })}
        />
      )}
      apres={<LignesPas x={x} p={p} s={s} sAvant={sAvant} k={k} />}
    />
  );
}

function LignesPas({ x, p, s, sAvant, k }: { x: DonneesPas; p: Periode<{ pas: number }>; s: ReturnType<typeof statsPas>; sAvant: ReturnType<typeof statsPas>; k: number }) {
  if (!s.n) return null;
  const km = distanceKm(s.total, x.tailleCm);
  const annee = p.type === "annee";
  // séries : tous les jours connus, du plus récent au plus ancien
  const tous = [...x.jours.keys()].sort((a, b) => b - a).map((j) => ({ jour: j, v: valeurDe(x, j) }));
  const se = series(tous, x.objectif);
  const auj = valeurDe(x, minuit(x.maintenant));
  let serie = null;
  if (se.enCours)
    serie = (
      <LigneMesure
        titre={t("mesuresPas.serieEnCours")}
        sous={tp("mesuresPas.record", se.record)}
        valeur={nombre(se.enCours, 0)}
        unite={tp("mesuresPas.jours", se.enCours).replace(/^\S+\s/, "")}
      />
    );
  else if (k === 0 && auj != null && auj < x.objectif)
    serie = (
      <LigneMesure
        titre={t("mesuresPas.serie")}
        sous={[se.record ? tp("mesuresPas.record", se.record) : null, se.dernier ? t("mesuresPas.derniereReussite", { date: formater(se.dernier, { weekday: "short", day: "numeric" }) }) : null].filter(Boolean).join(", ")}
        valeur={nombre(x.objectif - auj, 0)}
        unite={t("mesuresPas.pas")}
        sousValeur={t("mesuresPas.pourRelancer")}
      />
    );
  return (
    <Groupe>
      <Lignes>
        {[
          <LigneMesure
            key="total"
            titre={t("mesuresPas.total")}
            valeur={annee ? nombre(s.total / 1e6, 2) : nombre(s.total, 0)}
            unite={annee ? t("mesuresPas.millionsPas") : t("mesuresPas.pas")}
            sousValeur={km != null ? t("mesuresPas.kmEstimes", { n: nombre(km, 1) }) : undefined}
          />,
          s.meilleur ? <LigneMesure key="meilleur" titre={t("mesuresPas.meilleurJour")} valeur={nombre(s.meilleur.v, 0)} sousValeur={jourSemaineMois(s.meilleur.jour)} /> : null,
          <LigneMesure
            key="atteint"
            titre={t("mesuresPas.objectifAtteint")}
            valeur={nombre(s.atteints, 0)}
            unite={t("mesures.surN", { n: s.n })}
            sousValeur={sAvant.n ? t("mesures.avant", { valeur: `${sAvant.atteints} / ${sAvant.n}` }) : undefined}
          />,
          serie,
        ]}
      </Lignes>
    </Groupe>
  );
}

// ---- Sources -----------------------------------------------------------------------------------------------------------

function Sources({ x, recharger, onObjectif }: { x: DonneesPas; recharger: () => void; onObjectif: () => void }) {
  const { db } = useApp();
  const etatSante =
    x.santeConnect === "absente"
      ? t("mesures.absente")
      : x.santeConnect === "aAutoriser"
        ? t("mesures.aAutoriser")
        : t("mesures.utilisee");
  const choix = choixObjectif(x.objectif, x.profil?.objectif ?? null);
  return (
    <>
      <TitreGroupe>{t("mesures.sources")}</TitreGroupe>
      <Groupe>
        <Lignes>
          {[
            <LigneMesure
              key="sc"
              titre={t("mesures.santeConnect")}
              sous={t("mesuresPas.heureParHeure")}
              etat={etatSante}
              onPress={() => {
                if (x.santeConnect === "aAutoriser") void autoriserPasSante().then(() => recharger()).catch(console.error);
                else if (x.santeConnect === "autorisee") void sante.ouvrirReglages().catch(console.error);
              }}
            />,
            ...(x.telephone === "indisponible"
              ? []
              : [
                  <LigneMesure
                    key="telephone"
                    titre={t("mesuresPas.telephone")}
                    sous={t("mesuresPas.telephoneAide")}
                    etat={x.telephone === "actif" ? t("mesures.utilisee") : t("mesuresPas.nonActivee")}
                    onPress={() => (x.telephone === "a-activer" ? void activerPasTelephone(db).then(() => recharger()).catch(console.error) : undefined)}
                  />,
                ]),
            <LigneMesure
              key="obj"
              titre={t("mesuresPas.objectifQuotidien")}
              sous={t(choix === "defaut" ? "mesuresPas.parDefaut" : choix === "profil" ? "mesuresPas.dapresTesPas" : "mesuresPas.personnalise")}
              etat={nombre(x.objectif, 0)}
              onPress={onObjectif}
            />,
          ]}
        </Lignes>
      </Groupe>
    </>
  );
}

// ---- Feuille de l'objectif ---------------------------------------------------------------------------------------------

function FeuilleObjectif({ x, visible, onFermer, onChange }: { x: DonneesPas; visible: boolean; onFermer: () => void; onChange: () => void }) {
  const { db } = useApp();
  const { couleurs, mode } = useTheme();
  const m = useMesure();
  const [v, setV] = useState(x.objectif);
  useEffect(() => {
    if (visible) setV(x.objectif);
  }, [visible, x.objectif]);
  const profil = x.profil?.objectif ?? null;
  const choix: Choix = choixObjectif(v, profil);
  const fondBouton = mode === "jour" ? couleurs.s1 : couleurs.s2;
  const option = (c: Choix, titre: string, aide: string, valeur: number | null, onPress: (() => void) | null) => (
    <Pressable
      key={c}
      accessibilityRole="radio"
      accessibilityState={{ checked: choix === c, disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress ?? undefined}
      style={({ pressed }) => [styles.option, pressed && { backgroundColor: couleurs.s3 }, !onPress && { opacity: 0.5 }]}
    >
      <View style={[styles.radio, { borderColor: choix === c ? m.fort : couleurs.line2 }]}>{choix === c ? <View style={[styles.radioPlein, { backgroundColor: m.fort }]} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Texte variante="corps" style={{ fontSize: 15 }}>
          {titre}
        </Texte>
        <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>
          {aide}
        </Texte>
      </View>
      {valeur != null ? <Texte style={{ fontFamily: police.medium, fontSize: 15, color: couleurs.t1, fontVariant: ["tabular-nums"] }}>{nombre(valeur, 0)}</Texte> : null}
    </Pressable>
  );
  const pas = (s: 1 | -1) => setV((a) => Math.max(1000, Math.min(OBJECTIF_MAX * 2, Math.round((a + s * PAS_OBJECTIF) / PAS_OBJECTIF) * PAS_OBJECTIF)));
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={t("mesuresPas.objectifQuotidien")}>
      <View style={styles.reglage}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("mesuresPas.moins500")} onPress={() => pas(-1)} style={({ pressed }) => [styles.bouton, { backgroundColor: pressed ? couleurs.s3 : fondBouton }]}>
          <Icone nom="moins" couleur={couleurs.t1} taille={22} />
        </Pressable>
        <View style={{ alignItems: "center" }} accessible accessibilityLiveRegion="polite" accessibilityLabel={`${nombre(v, 0)} ${t("mesuresPas.parJour")}`}>
          <Texte style={{ fontFamily: police.light, fontSize: 44, lineHeight: 52, letterSpacing: -0.9, color: couleurs.t1, fontVariant: ["tabular-nums"] }}>{nombre(v, 0)}</Texte>
          <Texte variante="corps" couleur="t2">
            {t("mesuresPas.parJour")}
          </Texte>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t("mesuresPas.plus500")} onPress={() => pas(1)} style={({ pressed }) => [styles.bouton, { backgroundColor: pressed ? couleurs.s3 : fondBouton }]}>
          <Icone nom="plus" couleur={couleurs.t1} taille={22} />
        </Pressable>
      </View>
      <GroupeFeuille>
        {option("defaut", t("mesuresPas.parDefaut"), t("mesuresPas.defautAide"), OBJECTIF_PAS_DEFAUT, () => setV(OBJECTIF_PAS_DEFAUT))}
        <View style={[styles.filet, { backgroundColor: couleurs.line }]} />
        {option(
          "profil",
          t("mesuresPas.dapresTesPas"),
          x.profil ? t("mesuresPas.profilAide", { n: nombre(x.profil.moyenne, 0) }) : t("mesuresPas.profilAttente"),
          profil,
          profil != null ? () => setV(profil) : null,
        )}
        <View style={[styles.filet, { backgroundColor: couleurs.line }]} />
        {option("perso", t("mesuresPas.personnalise"), t("mesuresPas.persoAide"), null, () => pas(1))}
      </GroupeFeuille>
      <BoutonPlein
        libelle={t("mesures.enregistrer")}
        onPress={() => {
          void ecrireObjectifPas(db, v)
            .then(() => {
              onFermer();
              onChange();
            })
            .catch(signalerErreur());
        }}
      />
    </Feuille>
  );
}

// ---- Chargement --------------------------------------------------------------------------------------------------------

function Chargement() {
  return (
    <View accessibilityLabel={t("mesures.chargement")} accessible>
      <View style={{ marginHorizontal: 16 }}>
        <Os largeur={160} hauteur={13} />
      </View>
      <View style={styles.chargeHeros}>
        <View>
          <Os largeur={168} hauteur={52} rayon={8} />
          <View style={{ height: 12 }} />
          <Os largeur={120} hauteur={14} />
        </View>
        <Anneau part={0} />
      </View>
      <View style={styles.chargeTrois}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flex: 1, gap: 8 }}>
            <Os largeur={52} hauteur={11} />
            <Os largeur={64} hauteur={16} />
          </View>
        ))}
      </View>
      <TitreGroupe>{t("mesuresPas.auFil")}</TitreGroupe>
      <Groupe bloc style={{ height: 268 }}>
        <Os largeur={120} hauteur={22} />
        <View style={{ height: 150 }} />
        <Os largeur="100%" hauteur={30} />
      </Groupe>
    </View>
  );
}

const styles = StyleSheet.create({
  expire: { marginTop: 20, marginHorizontal: MARGE },
  reglage: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  bouton: { width: 56, height: 56, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
  option: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: 16 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioPlein: { width: 10, height: 10, borderRadius: 5 },
  filet: { height: 1, marginHorizontal: 16 },
  chargeHeros: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, marginHorizontal: 16, minHeight: 96 },
  chargeTrois: { flexDirection: "row", marginTop: 18, marginHorizontal: 16, paddingTop: 14, gap: 14 },
});

