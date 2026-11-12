import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { router } from "expo-router";
import {
  CLES_FIBRES_EAU,
  ecrireObjectif,
  ecrireReglage,
  garderMaCible,
  grasProfil,
  lireAnneeNaissance,
  lireGesteCible,
  lireMorphologie,
  lireObjectif,
  lireReglage,
  lireReglagesFibresEau,
  lirePremiereSeance,
  moyenneFibres14,
  objectifCalcule,
  objectifDetailCalcule,
  poidsProfil,
  viserEtape,
  type ReglagesFibresEau,
} from "../../db";
import { useTheme } from "../../theme";
import { espace, police } from "../../theme/typo";
import { avecOpacite } from "../../theme/teintes";
import { cleJour, dateEstimee, kcalDepuisMacros, kcalObjectif, OBJECTIF_DEFAUT, ciblesVisibles, planComposition, type Activite, type NiveauEntrainement, type Objectif, type ObjectifDetail, type PlanComposition, type TypeJour } from "../../nutrition/calculs";
import { EAU, FIBRES } from "../../nutrition/fibres-eau";
import { niveauEntrainement, noteCibleVisible, type ModeAffichage } from "../../nutrition/objectifs-calc";
import { duree } from "../../theme/mouvement";
import { Appui, courbes } from "../../ui/mouvement";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille } from "../../ui/Feuille";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { Icone, type NomIcone } from "../../ui/Icone";
import { Interrupteur } from "../../ui/Interrupteur";
import { RoueDuree } from "../../ui/RoueDuree";
import { Segmente } from "../../ui/Segmente";
import { Texte } from "../../ui/Texte";
import { t, type CleSimple, type Params } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useApp } from "../contexte";
import { jourMoisLong, moisAnnee, nombre, versUnite } from "../format";
import { champVerre } from "../../theme/effets";
import { ajouterGras } from "../mesures/corps-donnees";
import { nomSourceCorps } from "../sante-donnees";
import { quandTexte } from "./MesAliments";
import { FeuilleFibres } from "./FeuilleFibres";
import { RoueFibres } from "./FibresEau";
import { FeuilleRoue, LigneFilet, PageNutrition, plage } from "./commun";
import { rafraichirModeAffichage, useModeAffichage } from "./mode-affichage";

// Objectifs (planches 21 et 22, puis planches macros 1 à 6 validées le 01/11) : poids actuel et poids cible avec sa date, % de
// gras actuel et cible (docs/OBJECTIF-GRAS.md), la note quand la cible dépasse les repères (D16), le niveau en prise (D15) ou le
// rythme plafonné, l'activité hors sport seulement pour la formule (D17), la dépense et sa source, le calcul automatique, puis
// le tableau entraînement / repos (kcal à la dizaine et fourchette, D18 ; fibres, repère sucres) ; toucher une colonne ouvre ses
// roues. Calcul limité : une phrase en tête et l'entretien ; sans chiffres, grossesse, mineur : un écran sans objectifs (D20).
// Une cible ne s'affiche qu'avec sa valeur de base (31/10).

const RYTHMES = [0, 0.25, 0.5, 0.75] as const;
const POIDS = plage(30, 200, 0.5);
const GRAS = plage(3, 60, 0.5);
const SEMAINE_MS = 7 * 86_400_000;
// au-delà, la date se dit au mois (« atteint vers décembre 2027 », planche 1)
const DATE_AU_MOIS_MS = 180 * 86_400_000;
const VALEURS = { proteines: plage(0, 400, 5), lipides: plage(0, 300, 5), glucides: plage(0, 800, 5), sucres: plage(0, 300, 5) };
const NIVEAUX: NiveauEntrainement[] = ["debutant", "intermediaire", "avance"];
// Texte teinté des boutons tonals de la planche (« Viser 79 kg à 12,2 % », « Noter un repas ») : la teinte la nuit, plus
// sombre le jour pour tenir 4,5:1 sur le fond pâle.
const TEINTE_TEXTE = { nuit: "#1bd8bb", jour: "#066f63" } as const;
const SANS_CHIFFRES = ["troubleAlimentaire", "imcBas", "perteImcBas"];
// Roue de l'objectif d'eau (0,1 L près), planche Fibres et eau ; celle des fibres est partagée avec la page de suivi (RoueFibres).
const EAU_L = plage(EAU.minMl / 1000, EAU.maxMl / 1000, EAU.pasObjectifMl / 1000);
const REGLAGES_FE_DEFAUT: ReglagesFibresEau = { fibresSuivi: false, fibresObjectifG: FIBRES.defautG, astuce: true, eauSuivi: false, eauObjectifMl: EAU.defautMl, palierReporte: null };

type Details = Record<TypeJour, ObjectifDetail | null>;

/** Clé que la règle désigne (macros.raison.*, macros.titre.*…). */
const tc = (cle: string, p?: Params) => t(cle as CleSimple, p);

export function Objectifs() {
  useLangue();
  const aff = useModeAffichage();
  if (aff.ecran === "sans_chiffres" || aff.ecran === "grossesse" || aff.ecran === "mineur")
    return (
      <PageNutrition titre={t("nutrition.objectifs")}>
        <EtatVide aff={aff} />
      </PageNutrition>
    );
  return <ObjectifsCalcules aff={aff} />;
}

function ObjectifsCalcules({ aff }: { aff: ModeAffichage }) {
  const { db, reglages } = useApp();
  const { couleurs, mode } = useTheme();
  const [auto, setAuto] = useState(false);
  const [o, setO] = useState<Record<TypeJour, Objectif>>(OBJECTIF_DEFAUT);
  const [detail, setDetail] = useState<Details>({ entrainement: null, repos: null });
  const [manque, setManque] = useState<string[]>([]);
  // ce qui manque se complète au Profil (sexe, naissance) ou dans Corps (taille, poids)
  const [ouManque, setOuManque] = useState<"/settings/corps" | "/sante/composition">("/settings/corps");
  const [cible, setCible] = useState<number | null>(null);
  const [rythme, setRythme] = useState(0);
  const [activite, setActivite] = useState<Activite>("debout");
  const [pesee, setPesee] = useState<{ kg: number; date: number; source: string | null } | null>(null);
  const [gras, setGras] = useState<{ pct: number; date: number; source: string } | null>(null);
  const [grasCible, setGrasCible] = useState<number | null>(null);
  const [niveau, setNiveau] = useState<NiveauEntrainement>("intermediaire");
  const [age, setAge] = useState<number | undefined>(undefined);
  const [geste, setGeste] = useState<string | null>(null);
  const [alerteGlucides, setAlerteGlucides] = useState(true);
  // Fibres et eau (planche Fibres et eau) : les deux interrupteurs et leurs objectifs ; allumer les fibres passe par une feuille
  // (montée douce), dont la présélection part de la moyenne des 14 derniers jours.
  const [fe, setFe] = useState<ReglagesFibresEau>(REGLAGES_FE_DEFAUT);
  const [activation, setActivation] = useState<{ moyenne: number | null } | null>(null);
  const [roueFe, setRoueFe] = useState<"fibres" | "eau" | null>(null);
  const [roues, setRoues] = useState<TypeJour | null>(null);
  const [roueCible, setRoueCible] = useState<"poids" | "gras" | "grasActuel" | null>(null);
  const [depenseOuverte, setDepenseOuverte] = useState(false);
  // Une cible qui apparaît (sa valeur de base vient d'être remplie) entre en fondu ; pas au premier affichage de la page.
  const [charge, setCharge] = useState(false);
  const anime = useRef(false);
  useEffect(() => {
    if (charge) anime.current = true;
  }, [charge]);

  const charger = useCallback(async () => {
    setAuto((await lireReglage(db, "nutri_auto")) === "1");
    setO({ entrainement: await lireObjectif(db, "entrainement"), repos: await lireObjectif(db, "repos") });
    setDetail({ entrainement: await objectifDetailCalcule(db, "entrainement"), repos: await objectifDetailCalcule(db, "repos") });
    const m = await lireMorphologie(db);
    const naissance = await lireAnneeNaissance(db);
    setAge(naissance ? new Date().getFullYear() - naissance : undefined);
    setNiveau(niveauEntrainement(await lireReglage(db, "nutri_niveau"), await lireReglage(db, "niveau_sport"), await lirePremiereSeance(db)));
    setOuManque(!m.tailleCm || !m.poidsKg ? "/sante/composition" : "/settings/corps");
    setManque(
      [!m.sexe && t("nutrition.manque.sexe"), !m.tailleCm && t("nutrition.manque.taille"), !m.poidsKg && t("nutrition.manque.poids"), !naissance && t("nutrition.manque.naissance")].filter(
        (x): x is string => !!x,
      ),
    );
    const c = Number(await lireReglage(db, "nutri_poids_cible"));
    setCible(c > 0 ? c : null);
    setRythme(Math.abs(Number(await lireReglage(db, "nutri_rythme")) || 0));
    const a = await lireReglage(db, "nutri_activite");
    setActivite(a === "assise" || a === "physique" ? a : "debout");
    // source écrite seulement pour une pesée importée (Whoop, appli via Santé Connect)
    const p = await poidsProfil(db);
    setPesee(p ? { kg: p.valeur, date: p.date ?? Date.now(), source: p.source === "saisie" ? null : nomSourceCorps(p) } : null);
    const g = await grasProfil(db);
    setGras(g ? { pct: g.valeur, date: g.date ?? Date.now(), source: nomSourceCorps(g) } : null);
    const gc = Number(await lireReglage(db, "nutri_gras_cible"));
    setGrasCible(gc > 0 ? gc : null);
    setGeste(await lireGesteCible(db));
    setAlerteGlucides((await lireReglage(db, "nutri_alerte_glucides")) !== "0");
    setFe(await lireReglagesFibresEau(db));
    // le poids, la cible ou le profil ont pu changer : le mode de toute l'appli suit (D20)
    await rafraichirModeAffichage(db);
    setCharge(true);
  }, [db]);
  useEffect(() => {
    charger().catch((e) => console.error(e));
  }, [charger]);

  const d = detail.repos;
  const vis = ciblesVisibles({ poids: !!pesee, gras: !!gras }, { kg: cible, gras: grasCible });
  // Le rythme prend le signe de l'écart : perdre si la cible est sous le poids actuel, prendre sinon.
  const signe = pesee && vis.cibleKg != null && vis.cibleKg > pesee.kg ? 1 : -1;
  const ecrireRythme = async (r: number) => {
    await ecrireReglage(db, "nutri_rythme", String(signe * r));
    await charger();
  };
  // Avec le % de gras actuel et sa cible : masses grasse et maigre visées, écart et durée (planComposition) ; sinon au poids.
  const plan = pesee && gras && vis.grasCible != null ? planComposition(pesee.kg, gras.pct, vis.cibleKg, vis.grasCible, signe * rythme, { niveau, age }) : null;
  const date = plan
    ? plan.semaines
      ? new Date(Date.now() + plan.semaines * SEMAINE_MS)
      : null
    : pesee && vis.cibleKg != null && rythme > 0
      ? dateEstimee(pesee.kg, vis.cibleKg, signe * rythme, new Date())
      : null;
  const atteint = date ? (date.getTime() - Date.now() > DATE_AU_MOIS_MS ? t("macros.atteintMois", { mois: moisAnnee(date) }) : t("nutrition.atteint", { jour: jourMoisLong(date) })) : null;
  const calculable = manque.length === 0;
  const cibles = aff.ciblesVisibles;
  const note = cibles && d?.cible && noteCibleVisible(d.cible, geste, vis.cibleKg, vis.grasCible) ? d.cible : null;
  // D15 : en prise, l'excédent suit le niveau, pas un rythme ; sans % cible, le segmenté du rythme garde le choix maintien / prise.
  const enPrise = d?.type === "prise";
  const autoActif = auto && calculable;
  const basculer = async (v: boolean) => {
    if (!v) for (const j of ["entrainement", "repos"] as const) await ecrireObjectif(db, j, o[j]);
    await ecrireReglage(db, "nutri_auto", v ? "1" : "0");
    await charger();
  };
  const reglerFe = (cle: keyof typeof CLES_FIBRES_EAU, v: string) => ecrireReglage(db, CLES_FIBRES_EAU[cle], v).then(charger).catch(signalerErreur());
  const suivreFibres = (v: boolean) => {
    if (!v) return void reglerFe("fibresSuivi", "0");
    moyenneFibres14(db, cleJour(new Date()))
      .then((moyenne) => setActivation({ moyenne }))
      .catch(signalerErreur());
  };
  const regler = async (jour: TypeJour, v: Objectif) => {
    // Réglé à la main : le calcul automatique s'éteint, les valeurs affichées deviennent les siennes.
    const autre: TypeJour = jour === "entrainement" ? "repos" : "entrainement";
    await ecrireObjectif(db, jour, v);
    if (auto) await ecrireObjectif(db, autre, o[autre]);
    await ecrireReglage(db, "nutri_auto", "0");
    setRoues(null);
    await charger();
  };
  const u = reglages.unite;
  const kg = (v: number) => `${nombre(versUnite(v, u), 1)} ${u}`;
  const pct = (v: number) => `${nombre(v, 1)} %`;
  const fondu = (cle: string, enfant: ReactNode) => (
    <Animated.View key={cle} entering={anime.current ? FadeIn.duration(duree.entree).easing(courbes.sortie) : undefined}>
      {enfant}
    </Animated.View>
  );
  const aujourdhui = cleJour(new Date());
  const raison = aff.ecran === "limite" ? aff.raisons[0] : undefined;
  const doux = avecOpacite(couleurs.partieNutrition, mode === "nuit" ? 0.09 : 0.07);
  const sous = { fontSize: 12, lineHeight: 16, color: couleurs.t3 } as const;

  // D9 : jours dont les glucides passent sous le repère de l'effort (calcul automatique seulement, l'alerte peut se couper).
  const joursBas = autoActif && alerteGlucides ? (["entrainement", "repos"] as const).filter((j) => detail[j]?.alertes.includes("glucidesBas")) : [];
  const bas = joursBas.length ? detail[joursBas.includes("repos") ? "repos" : "entrainement"] : null;
  // Planchers appliqués : même gabarit que l'alerte glucides (non dessinés, à valider).
  const autres = autoActif && d ? d.alertes.filter((a) => a === "plancherEnergie" || a === "glucidesSousPlancher") : [];

  // Rythme : le segmenté s'arrête au plafond de la sèche (D4), nommé dessous quand il est choisi.
  const max = d?.rythmeMax?.kgSemaine ?? null;
  const pasRythme = signe > 0 ? [0, 0.25] : max != null ? [0, ...RYTHMES.filter((r) => r > 0 && r < max - 0.005), Math.round(max * 100) / 100] : [...RYTHMES];
  const rythmeChoisi = pasRythme.reduce((a, r) => (Math.abs(r - rythme) < Math.abs(a - rythme) ? r : a), 0);
  const auPlafond = max != null && signe < 0 && rythmeChoisi > 0 && rythmeChoisi >= Math.round(max * 100) / 100;

  return (
    <PageNutrition titre={t("nutrition.objectifs")}>
      {raison ? (
        <View style={[styles.situ, { backgroundColor: doux }]}>
          <Texte variante="corps" style={styles.noteTitre}>
            {tc(`macros.titre.${raison}`)}
          </Texte>
          <Texte variante="corps" style={[styles.noteTexte, { color: couleurs.t2 }]}>
            {[tc(`macros.raison.${raison}`), aff.renvois[0] ? tc(`macros.renvoi.${aff.renvois[0]}`) : null].filter(Boolean).join(" ")}
          </Texte>
          <View style={{ flexDirection: "row", marginTop: 6, marginLeft: -8 }}>
            <Lien libelle={t("macros.situation")} onPress={() => router.push("/settings/situation")} />
          </View>
        </View>
      ) : null}
      <LigneFilet
        libelle={t("nutrition.poidsActuel")}
        sous={pesee ? [pesee.source, quandTexte(cleJour(new Date(pesee.date)), aujourdhui)].filter(Boolean).join(", ") : undefined}
        valeur={pesee ? kg(pesee.kg) : t("corps.aRenseigner")}
        chevron={!pesee}
        onPress={pesee ? undefined : () => router.push("/sante/composition")}
      />
      {cibles && vis.lignePoids
        ? fondu(
            "poidsCible",
            <LigneFilet
              libelle={t("nutrition.poidsCible")}
              sous={cible != null ? (atteint ?? undefined) : undefined}
              valeur={cible != null ? kg(cible) : t("corps.aRenseigner")}
              onPress={() => setRoueCible("poids")}
            />,
          )
        : null}
      <LigneFilet
        libelle={t("nutrition.grasActuel")}
        sous={gras ? [gras.source, quandTexte(cleJour(new Date(gras.date)), aujourdhui)].join(", ") : undefined}
        valeur={gras ? pct(gras.pct) : t("corps.aRenseigner")}
        chevron={!gras}
        onPress={gras ? undefined : () => setRoueCible("grasActuel")}
        filet={!(note && !(cibles && vis.ligneGras))}
      />
      {cibles && vis.ligneGras
        ? fondu(
            "grasCible",
            <LigneFilet
              libelle={t("nutrition.grasCible")}
              sous={plan ? textePlan(plan, kg, cible == null ? atteint : null) : undefined}
              sousLignes={3}
              valeur={grasCible != null ? pct(grasCible) : t("corps.aRenseigner")}
              onPress={() => setRoueCible("gras")}
              filet={!note}
            />,
          )
        : null}
      {note ? (
        // D16 : la cible dépasse ce que les repères permettent ; l'étape à 6 mois au même % de gras, ou garder sa cible.
        <View style={[styles.note, { backgroundColor: doux }]}>
          <Texte variante="corps" style={styles.noteTitre}>
            {t("macros.note.titre", { gain: `+${kg(note.gainMaigreKg)}`, mois: nombre(note.moisPourCible ?? note.moisSelonRythme ?? 0, 0) })}
          </Texte>
          <Texte variante="corps" style={[styles.noteTexte, { color: couleurs.t2 }]}>
            {t("macros.note.texte", { kg: kg(note.plafondMoisKg) }) +
              (note.etape ? t("macros.note.etape", { mois: note.etape.mois, poids: kg(note.etape.poidsKg), gras: nombre(note.etape.grasPct, 1) }) : "")}
          </Texte>
          <View style={styles.actions}>
            {note.etape ? (
              <BoutonTeinte
                libelle={t("macros.cible.viser", { poids: kg(note.etape.poidsKg), gras: nombre(note.etape.grasPct, 1) })}
                onPress={() => note.etape && void viserEtape(db, note.etape).then(charger).catch(signalerErreur())}
              />
            ) : null}
            <Lien libelle={t("macros.cible.garder")} onPress={() => void garderMaCible(db).then(charger).catch(signalerErreur())} />
          </View>
        </View>
      ) : null}
      {aff.ecran === "limite" ? (
        <LigneFilet libelle={t("macros.objectif")} valeur={!d || d.type === "maintien" ? t("macros.objectif.entretien") : t(`nutrition.plan.${d.type}`)} chevron={false} />
      ) : null}
      {cibles && enPrise ? (
        <View style={[styles.bloc, { borderBottomColor: couleurs.line }]}>
          <Texte variante="corps" style={{ fontSize: 16, color: couleurs.t1, marginBottom: 10 }}>
            {t("macros.niveau")}
            <Texte variante="corps" couleur="t3" style={{ fontSize: 13 }}>{`  ${t("macros.enMusculation")}`}</Texte>
          </Texte>
          <Segmente<NiveauEntrainement>
            options={NIVEAUX.map((n) => ({ valeur: n, libelle: t(`macros.niveau.${n}`) }))}
            valeur={niveau}
            onChange={(n) => void ecrireReglage(db, "nutri_niveau", n).then(charger).catch(signalerErreur())}
          />
          <Texte variante="corps" style={[sous, { marginTop: 8 }]}>
            {t("macros.niveau.aide")}
          </Texte>
          {d?.ecartAfficheKcal != null && d.excedentPctDepense != null ? (
            <Texte variante="corps" style={[sous, { marginTop: 8 }]}>
              {t("macros.niveau.prise", { kcal: nombre(d.ecartAfficheKcal, 0), pct: nombre(d.excedentPctDepense * 100, 0) })}
            </Texte>
          ) : null}
        </View>
      ) : null}
      {cibles && (!enPrise || !plan) ? (
        <View style={[styles.bloc, { borderBottomColor: couleurs.line }]}>
          <Texte variante="corps" style={{ fontSize: 16, color: couleurs.t1, marginBottom: 10 }}>
            {t("nutrition.rythme")}
            <Texte variante="corps" couleur="t3" style={{ fontSize: 13 }}>{`  ${t("nutrition.kgParSemaine")}`}</Texte>
          </Texte>
          <Segmente<string>
            // Signe collé au chiffre, « − » (U+2212) et non un tiret séparé (revue finale n° 19) ; en prise, l'excédent suit le niveau.
            options={pasRythme.map((r) => ({ valeur: String(r), libelle: r === 0 ? t("nutrition.maintien") : signe > 0 ? t("nutrition.plan.prise") : `−${nombre(r, 2)}` }))}
            valeur={String(rythmeChoisi)}
            onChange={(v) => void ecrireRythme(Number(v)).catch(signalerErreur())}
          />
          {auPlafond && d?.rythmeMax ? (
            <Texte variante="corps" style={[sous, { marginTop: 8 }]}>
              {t("macros.plafond", { kg: nombre(-rythmeChoisi, 2), pct: nombre(d.rythmeMax.pctSemaine, 1) })}
            </Texte>
          ) : null}
        </View>
      ) : null}
      {!d || d.activiteVisible ? (
        <View style={[styles.bloc, { borderBottomColor: couleurs.line }]}>
          <Texte variante="corps" style={{ fontSize: 16, color: couleurs.t1, marginBottom: 10 }}>
            {t("nutrition.activiteHorsSport")}
          </Texte>
          <Segmente<Activite>
            options={[
              { valeur: "assise", libelle: t("nutrition.activite.assise") },
              { valeur: "debout", libelle: t("nutrition.activite.debout") },
              { valeur: "physique", libelle: t("nutrition.activite.physique") },
            ]}
            valeur={activite}
            onChange={(a) => void ecrireReglage(db, "nutri_activite", a).then(charger).catch(signalerErreur())}
          />
        </View>
      ) : null}
      {d?.depenseAffichee && d.source ? (
        <>
          <LigneFilet
            libelle={t("macros.depense")}
            sous={t(`macros.depense.${d.source}`, { pct: d.incertitudePct ?? 0 })}
            valeur={`${nombre(d.depenseAffichee.valeur, 0)} ${t("nutrition.kcal")}`}
            onPress={() => setDepenseOuverte(true)}
            filet={!d.joursJournal}
          />
          {d.joursJournal ? (
            <View style={[styles.mesure, { borderBottomColor: couleurs.line }]}>
              <View style={[styles.jauge, { backgroundColor: couleurs.segmentPiste }]}>
                <View style={{ height: "100%", borderRadius: 2, width: `${Math.min(100, (d.joursJournal.tenus / d.joursJournal.requis) * 100)}%`, backgroundColor: couleurs.partieNutrition }} />
              </View>
              <Texte variante="corps" style={[sous, { marginTop: 6 }]}>
                {t("macros.journalJours", d.joursJournal)}
              </Texte>
            </View>
          ) : null}
        </>
      ) : null}
      <LigneFilet
        libelle={t("nutrition.calculAuto")}
        sous={calculable ? undefined : t("nutrition.manqueListe", { liste: manque.join(", ") })}
        onPress={calculable ? undefined : () => router.push(ouManque)}
        chevron={false}
        droite={<Interrupteur valeur={autoActif} desactive={!calculable} onChange={(v) => void basculer(v).catch(signalerErreur())} libelle={t("nutrition.calculAuto")} />}
      />

      <View style={{ marginTop: espace.s }}>
        <View style={[styles.rangTab, { minHeight: 40, borderBottomColor: couleurs.line }]}>
          <View style={{ flex: 1 }} />
          {/* « Entraînement » en entier : la colonne d'en-tête s'élargit vers la gauche, son bord droit reste aligné. */}
          <View style={[styles.colTab, styles.tete, { width: undefined, minWidth: 104 }]}>
            <Icone nom="dumbbell" couleur={couleurs.t3} taille={14} />
            <Texte variante="entete" couleur="t3">
              {t("nutrition.entrCourt")}
            </Texte>
          </View>
          <View style={[styles.colTab, styles.tete]}>
            <Texte variante="entete" couleur="t3">
              {t("nutrition.jourRepos")}
            </Texte>
          </View>
        </View>
        {(
          [
            ["kcal", t("nutrition.kcalMaj"), null],
            ["proteines", t("nutrition.proteines"), null],
            ["glucides", t("nutrition.glucides"), null],
            ["lipides", t("nutrition.lipides"), null],
            ["sucres", t("nutrition.sucres"), t("macros.sucres.sous")],
          ] as const
        )
          .map(([cle, libelle, sousLibelle], i, tout) => {
            const doux2 = cle === "sucres";
            return (
              <View
                key={cle}
                style={[styles.rangTab, cle === "kcal" && { minHeight: autoActif && d?.kcalAffichees ? 68 : 48 }, i < tout.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: couleurs.line }]}
              >
                <View style={{ flex: 1 }}>
                  <Texte variante="corps" style={{ fontSize: 15, color: doux2 ? couleurs.t2 : couleurs.t1 }}>
                    {libelle}
                  </Texte>
                  {sousLibelle ? <Texte variante="corps" style={[sous, { lineHeight: 15, marginTop: 1 }]}>{sousLibelle}</Texte> : null}
                </View>
                {(["entrainement", "repos"] as const).map((j) => {
                  const dj = detail[j];
                  const lu = `${libelle}, ${j === "entrainement" ? t("nutrition.jourEntrainement") : t("nutrition.jourRepos")}`;
                  return (
                    <Pressable key={j} accessibilityRole="button" accessibilityLabel={lu} onPress={() => setRoues(j)} style={styles.colTab}>
                      {cle === "kcal" ? (
                        autoActif && dj?.kcalAffichees ? (
                          // D18 : à la dizaine, la fourchette (incertitude de la dépense) dessous, en petit.
                          <View style={{ alignItems: "flex-end" }}>
                            <Texte variante="corps" style={{ fontSize: 20, color: couleurs.t1 }}>
                              {nombre(dj.kcalAffichees.valeur, 0)}
                            </Texte>
                            <Texte variante="corps" numberOfLines={1} style={[sous, { marginTop: 2 }]}>
                              {`${nombre(dj.kcalAffichees.bas, 0)} – ${nombre(dj.kcalAffichees.haut, 0)}`}
                            </Texte>
                          </View>
                        ) : (
                          <Texte variante="corps" style={{ fontSize: 20, color: couleurs.t1 }}>
                            {nombre(kcalObjectif(o[j]), 0)}
                          </Texte>
                        )
                      ) : (
                        // Calcul automatique coupé : les macros se saisissent, elles prennent le fond des champs (31/10).
                        <View style={[{ flexDirection: "row", alignItems: "center" }, !auto && [styles.champ, { backgroundColor: champVerre[mode].fond }]]}>
                          {cle === "glucides" && joursBas.includes(j) ? <View style={[styles.point, { backgroundColor: couleurs.action }]} /> : null}
                          <Grammes valeur={o[j][cle]} couleur={cle === "sucres" ? couleurs.t2 : couleurs.t1} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
      </View>

      {bas && bas.glucidesParKg != null && bas.bandeGlucidesParKg ? (
        <Alerte couleur={couleurs.action}>
          <Texte variante="corps" style={{ fontSize: 13, lineHeight: 19, fontFamily: police.medium, color: couleurs.t1 }}>
            {tc(`macros.glucidesBas.titre.${joursBas.length === 2 ? "tous" : joursBas[0]}`)}
          </Texte>
          {t(d?.type === "seche" ? "macros.glucidesBas.texteSeche" : "macros.glucidesBas.texte", {
            n: nombre(bas.glucidesParKg, 1),
            bas: nombre(bas.bandeGlucidesParKg[0], 1),
            haut: nombre(bas.bandeGlucidesParKg[1], 1),
          })}
        </Alerte>
      ) : null}
      {autres.map((a) => (
        <Alerte key={a} couleur={couleurs.action}>
          {tc(`macros.alerte.${a}`)}
        </Alerte>
      ))}
      {d ? (
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line }}>
          <LigneFilet
            libelle={t("macros.alerteGlucides")}
            sous={t("macros.alerteGlucides.sous")}
            sousLignes={2}
            chevron={false}
            filet={false}
            droite={
              <Interrupteur
                valeur={alerteGlucides}
                onChange={(v) => void ecrireReglage(db, "nutri_alerte_glucides", v ? "1" : "0").then(charger).catch(signalerErreur())}
                libelle={t("macros.alerteGlucides")}
              />
            }
          />
        </View>
      ) : null}
      <View style={{ marginTop: espace.xl }}>
        <Texte variante="corps" style={styles.sectionTitre}>
          {t("nutrition.fibres")}
        </Texte>
        <LigneFilet
          libelle={t("fibres.suivre")}
          sous={t("fibres.suivreSous")}
          chevron={false}
          filet={fe.fibresSuivi}
          droite={<Interrupteur valeur={fe.fibresSuivi} onChange={suivreFibres} libelle={t("fibres.suivre")} />}
        />
        {fe.fibresSuivi ? (
          <>
            <LigneFilet libelle={t("fibres.objectif")} valeur={t("fibres.grammes", { n: fe.fibresObjectifG })} filet={false} onPress={() => setRoueFe("fibres")} />
            <Texte variante="corps" style={[sous, { lineHeight: 17, paddingTop: 4, paddingBottom: 4 }]}>
              {t("fibres.objectifNote", { g: FIBRES.defautG })}
            </Texte>
          </>
        ) : null}
      </View>
      <View style={{ marginTop: espace.xl }}>
        <Texte variante="corps" style={styles.sectionTitre}>
          {t("eau.nom")}
        </Texte>
        <LigneFilet
          libelle={t("eau.suivre")}
          sous={t("eau.suivreSous")}
          chevron={false}
          filet={fe.eauSuivi}
          droite={<Interrupteur valeur={fe.eauSuivi} onChange={(v) => void reglerFe("eauSuivi", v ? "1" : "0")} libelle={t("eau.suivre")} />}
        />
        {fe.eauSuivi ? <LigneFilet libelle={t("eau.objectif")} valeur={t("eau.litres", { n: nombre(fe.eauObjectifMl / 1000, 1) })} filet={false} onPress={() => setRoueFe("eau")} /> : null}
      </View>
      <Texte variante="corps" style={[sous, { lineHeight: 17, paddingTop: 16, paddingBottom: 28 }]}>
        {[tc(d?.mention ?? "macros.mention"), d?.estimationAAffiner ? t("macros.estimation") : null].filter(Boolean).join(" ")}
      </Texte>

      <FeuilleMacros jour={roues} o={roues ? o[roues] : null} poids={pesee?.kg ?? null} onFermer={() => setRoues(null)} onValider={(j, v) => void regler(j, v).catch(signalerErreur())} />
      <FeuilleDepense d={d} visible={depenseOuverte} onFermer={() => setDepenseOuverte(false)} />
      <FeuilleFibres
        visible={activation != null}
        moyenne14={activation?.moyenne ?? null}
        onFermer={() => setActivation(null)}
        onSuivre={(g) => {
          setActivation(null);
          void ecrireReglage(db, CLES_FIBRES_EAU.fibresObjectif, String(g))
            .then(() => ecrireReglage(db, CLES_FIBRES_EAU.fibresSuivi, "1"))
            .then(charger)
            .catch(signalerErreur());
        }}
      />
      <RoueFibres
        visible={roueFe === "fibres"}
        objectifG={fe.fibresObjectifG}
        onFermer={() => setRoueFe(null)}
        onValider={(v) => (setRoueFe(null), void reglerFe("fibresObjectif", String(v)))}
      />
      <FeuilleRoue
        visible={roueFe === "eau"}
        titre={t("eau.roue.titre")}
        sous={t("eau.roue.sous")}
        valeur={fe.eauObjectifMl / 1000}
        valeurs={EAU_L}
        texte={(v) => nombre(v, 1)}
        lue={(v) => t("eau.litres", { n: nombre(v, 1) })}
        unite={t("eau.unite")}
        onFermer={() => setRoueFe(null)}
        onValider={(v) => (setRoueFe(null), void reglerFe("eauObjectif", String(Math.round(v * 1000))))}
      />
      <FeuilleRoue
        visible={roueCible === "poids"}
        titre={t("nutrition.poidsCible")}
        valeur={cible ?? pesee?.kg ?? 75}
        valeurs={POIDS}
        texte={(v) => kg(v)}
        onFermer={() => setRoueCible(null)}
        onValider={(v) => void ecrireReglage(db, "nutri_poids_cible", String(v)).then(() => (setRoueCible(null), charger())).catch(signalerErreur())}
      />
      <FeuilleRoue
        visible={roueCible === "grasActuel" || roueCible === "gras"}
        titre={roueCible === "gras" ? t("nutrition.grasCible") : t("nutrition.grasActuel")}
        valeur={(roueCible === "gras" ? grasCible ?? (gras ? gras.pct - 2 : null) : null) ?? gras?.pct ?? 20}
        valeurs={GRAS}
        texte={pct}
        onFermer={() => setRoueCible(null)}
        onValider={(v) =>
          void (roueCible === "gras" ? ecrireReglage(db, "nutri_gras_cible", String(v)) : ajouterGras(db, v))
            .then(() => (setRoueCible(null), charger()))
            .catch(signalerErreur())
        }
      />
    </PageNutrition>
  );
}

/** Une valeur en grammes du tableau : 15 medium, « g » en t3. */
function Grammes({ valeur, couleur }: { valeur: number; couleur: string }) {
  return (
    <Texte variante="saisie" style={{ fontSize: 15, fontFamily: police.medium, color: couleur }}>
      {nombre(valeur, 0)}
      <Texte variante="corps" couleur="t3">{` ${t("nutrition.g")}`}</Texte>
    </Texte>
  );
}

/** Sous le tableau : un point orange (la couleur de repère de l'appli) et la phrase qui porte le sens (planche 2). */
function Alerte({ couleur, children }: { couleur: string; children: ReactNode }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.alerte, { borderTopColor: couleurs.line }]}>
      <View style={[styles.point, { backgroundColor: couleur, marginTop: 7, marginRight: 0 }]} />
      <Texte variante="corps" style={{ flex: 1, fontSize: 13, lineHeight: 19, color: couleurs.t2 }}>
        {children}
      </Texte>
    </View>
  );
}

/** Bouton tonal teinté de la planche (fond teinte pâle, texte teinté) : 44 dans la note, 48 dans un état vide. */
function BoutonTeinte({ libelle, onPress, hauteur = 44 }: { libelle: string; onPress: () => void; hauteur?: number }) {
  const { couleurs, mode } = useTheme();
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={libelle}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tonal,
        { minHeight: hauteur, paddingHorizontal: hauteur > 44 ? 22 : 16, backgroundColor: avecOpacite(couleurs.partieNutrition, (mode === "nuit" ? 0.16 : 0.11) + (pressed ? 0.06 : 0)) },
      ]}
    >
      <Texte variante="corps" numberOfLines={1} style={{ fontSize: hauteur > 44 ? 15 : 14, fontFamily: police.semibold, color: TEINTE_TEXTE[mode] }}>
        {libelle}
      </Texte>
    </Appui>
  );
}

/** Lien texte (« Garder ma cible », « Mettre à jour ma situation ») : 44 de haut, 14 medium, t2. */
function Lien({ libelle, onPress }: { libelle: string; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.lien, pressed && { opacity: 0.6 }]}>
      <Texte variante="corps" style={{ fontSize: 14, fontFamily: police.medium, color: couleurs.t2 }}>
        {libelle}
      </Texte>
    </Pressable>
  );
}

/**
 * Sans chiffres, grossesse, moins de 18 ans (planches 4 à 6) : pas d'objectifs ; un rond et son icône, le titre (l'élément
 * fort), la raison et le renvoi, « Noter un repas » et de quoi corriger sa situation.
 */
function EtatVide({ aff }: { aff: ModeAffichage }) {
  const { couleurs, mode } = useTheme();
  const raison = aff.ecran === "sans_chiffres" ? (aff.raisons.find((r) => SANS_CHIFFRES.includes(r)) ?? "troubleAlimentaire") : aff.ecran;
  const renvoi = aff.ecran === "sans_chiffres" ? "professionnel" : "mineur";
  const icone: NomIcone = aff.ecran === "sans_chiffres" ? "carnet" : aff.ecran === "grossesse" ? "coeur" : "pousse";
  const texte = aff.ecran === "grossesse" ? t("macros.vide.grossesse") : `${tc(`macros.raison.${raison}`)} ${tc(`macros.renvoi.${renvoi}`)}`;
  return (
    <View style={styles.vide}>
      <View style={[styles.rond, { backgroundColor: avecOpacite(couleurs.partieNutrition, mode === "nuit" ? 0.09 : 0.07) }]}>
        <Icone nom={icone} couleur={TEINTE_TEXTE[mode]} taille={30} />
      </View>
      <Texte variante="titre" style={{ fontSize: 22, lineHeight: 28, fontFamily: police.semibold, color: couleurs.t1, textAlign: "center", marginTop: 24, maxWidth: 320 }}>
        {tc(`macros.titre.${raison}`)}
      </Texte>
      <Texte variante="corps" style={{ fontSize: 15, lineHeight: 22, color: couleurs.t2, textAlign: "center", marginTop: 10, maxWidth: 300 }}>
        {texte}
      </Texte>
      <View style={{ alignItems: "center", gap: 4, marginTop: 28 }}>
        <BoutonTeinte libelle={t("macros.noterRepas")} hauteur={48} onPress={() => router.navigate("/food")} />
        {aff.ecran === "mineur" ? (
          <Lien libelle={t("macros.corrigerNaissance")} onPress={() => router.push("/settings/corps")} />
        ) : (
          <Lien libelle={t("macros.situation")} onPress={() => router.push("/settings/situation")} />
        )}
      </View>
    </View>
  );
}

/** Le détail de la dépense (chevron, non dessiné : à valider) : la valeur et sa fourchette, sa source, la formule, les ajustements. */
function FeuilleDepense({ d, visible, onFermer }: { d: ObjectifDetail | null; visible: boolean; onFermer: () => void }) {
  const { couleurs } = useTheme();
  if (!d?.depenseAffichee || !d.source) return null;
  const lignes = [
    t(`macros.source.${d.source}`),
    d.source === "formule" && d.methodeRepos ? t("macros.depense.methode", { methode: t(`macros.methode.${d.methodeRepos}`) }) : null,
    ...d.ajustements.map((a) => tc(`macros.ajustement.${a}`)),
    d.joursJournal ? t("macros.depense.mesureeA14", { requis: d.joursJournal.requis }) : null,
  ].filter((x): x is string => !!x);
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={t("macros.depense.detail")}>
      <Texte variante="titre" style={{ textAlign: "center", fontFamily: police.regular, fontSize: 28 }}>
        {nombre(d.depenseAffichee.valeur, 0)}
        <Texte variante="corps" couleur="t2" style={{ fontSize: 15 }}>{` ${t("nutrition.kcal")}`}</Texte>
      </Texte>
      <Texte variante="corps" style={{ textAlign: "center", fontSize: 12, color: couleurs.t3, marginTop: 2, marginBottom: espace.m }}>
        {`${nombre(d.depenseAffichee.bas, 0)} – ${nombre(d.depenseAffichee.haut, 0)}`}
      </Texte>
      {lignes.map((l) => (
        <Texte key={l} variante="corps" style={{ fontSize: 14, lineHeight: 20, color: couleurs.t2, marginBottom: espace.s }}>
          {l}
        </Texte>
      ))}
    </Feuille>
  );
}

/** Sous la ligne du % cible : l'incohérence en une phrase douce, sinon l'objectif et les masses visées (et la date s'il n'y a
 * pas de poids cible pour la porter). */
function textePlan(p: PlanComposition, kg: (v: number) => string, atteint: string | null): string {
  const i = p.incoherence;
  if (i?.cas === "sousMaigre") return t("nutrition.plan.sousMaigre", { maigre: kg(i.maigreKg) });
  if (i) return t("nutrition.plan.perteMaigre", { perte: kg(i.perteKg), pct: nombre(Math.max(3, i.grasGardePct), 1) });
  const ecart = (v: number) => `${v < 0 ? "−" : "+"}${kg(Math.abs(v))}`;
  const masses = p.type === "maintien" ? "" : t("nutrition.plan.masses", { maigre: ecart(p.ecartMaigreKg), gras: ecart(p.ecartGrasKg) });
  return [t(`nutrition.plan.${p.type}`) + masses, atteint].filter(Boolean).join(", ");
}

/** Roues d'un type de jour (planche 22) : les kcal recalculées des macros, protéines (g/kg dessous), glucides, lipides, sucres. */
function FeuilleMacros({ jour, o, poids, onFermer, onValider }: { jour: TypeJour | null; o: Objectif | null; poids: number | null; onFermer: () => void; onValider: (j: TypeJour, v: Objectif) => void }) {
  const [b, setB] = useState<Objectif>(OBJECTIF_DEFAUT.entrainement);
  useEffect(() => {
    if (o) setB(o);
  }, [o, jour]);
  const roue = (cle: keyof Objectif, libelle: string) => (
    <View style={{ flex: 1 }}>
      <RoueDuree
        key={`${jour}-${cle}`}
        libelle={libelle}
        valeur={o?.[cle] ?? 0}
        valeurs={VALEURS[cle]}
        onChange={(v) => setB((x) => ({ ...x, [cle]: v }))}
        traits={false}
        decoupe={(v) => ({ attenue: "", plein: String(v) })}
        lue={(v) => `${v} ${t("nutrition.g")}`}
      />
      <Texte variante="entete" couleur="t3" numberOfLines={1} adjustsFontSizeToFit style={{ textAlign: "center", marginTop: espace.xs }}>
        {libelle}
      </Texte>
    </View>
  );
  return (
    <Feuille
      visible={jour != null}
      onFermer={onFermer}
      titre={jour === "entrainement" ? t("nutrition.jourEntrainement") : t("nutrition.jourRepos")}
      glisserContenu={false}
      pied={<BoutonPrincipal libelle={t("ui.valider")} onPress={() => jour && onValider(jour, b)} />}
    >
      <Texte variante="titre" style={{ textAlign: "center", fontFamily: police.regular, fontSize: 28 }}>
        {nombre(kcalDepuisMacros(b), 0)}
        <Texte variante="corps" couleur="t2" style={{ fontSize: 15 }}>{` ${t("nutrition.kcal")}`}</Texte>
      </Texte>
      <View style={{ flexDirection: "row", gap: espace.xs }}>
        {roue("proteines", poids ? t("nutrition.protParKg", { n: nombre(b.proteines / poids, 1) }) : t("nutrition.prot"))}
        {roue("glucides", t("nutrition.glucides"))}
        {roue("lipides", t("nutrition.lipides"))}
        {roue("sucres", t("nutrition.sucres"))}
      </View>
    </Feuille>
  );
}

const styles = StyleSheet.create({
  sectionTitre: { fontSize: 14, lineHeight: 20, fontFamily: police.semibold, paddingBottom: 2 },
  bloc: { paddingTop: espace.m, paddingBottom: espace.l, borderBottomWidth: StyleSheet.hairlineWidth },
  rangTab: { flexDirection: "row", alignItems: "center", minHeight: 48 },
  champ: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: 76, justifyContent: "flex-end" },
  colTab: { width: 104, minHeight: 48, alignItems: "flex-end", justifyContent: "center", paddingRight: 4 },
  tete: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, minHeight: 40 },
  note: { borderRadius: 12, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 6, marginTop: 12, marginBottom: 4 },
  situ: { borderRadius: 12, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 6, marginTop: 4, marginBottom: 8 },
  noteTitre: { fontSize: 15, lineHeight: 20, fontFamily: police.medium },
  noteTexte: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4, marginTop: 10 },
  tonal: { borderRadius: 10, alignItems: "center", justifyContent: "center" },
  lien: { minHeight: 44, paddingHorizontal: 8, justifyContent: "center" },
  mesure: { paddingTop: 4, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  jauge: { height: 4, borderRadius: 2, overflow: "hidden" },
  point: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  alerte: { flexDirection: "row", gap: 10, paddingTop: 12, paddingBottom: 14, borderTopWidth: StyleSheet.hairlineWidth },
  vide: { alignItems: "center", paddingTop: 72, paddingHorizontal: 8 },
  rond: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
});

export { objectifCalcule };
