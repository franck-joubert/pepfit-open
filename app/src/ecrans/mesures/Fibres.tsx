// Page de suivi des fibres (planche fibres-page validée, NOTES D1 à D14 ; docs/CODE-FIBRES-PAGE.md) : la page Pas en teinte Nutrition,
// avec les fibres en tilleul. En tête le semainier commun et le jour choisi (paramètre de route `jour`, celui du Journal), son
// chiffre et son anneau ; « D'où viennent tes fibres » classé par apport (cinq lignes puis « Voir les n autres ») ; le palier et les
// conseils (la carte du Journal, trois phrases au lieu d'une) ; les statistiques Semaine / Mois / Année, les plus riches de la
// période et les réglages. Les fibres se déduisent des repas : un jour sans repas ou sans aliment aux fibres connues n'a pas de
// donnée (ni compté, ni zéro) ; aujourd'hui n'entre jamais dans une moyenne. Objectifs masqués (grossesse, mineur) : la page reste,
// sans anneau, sans objectif, sans conseils.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type ScrollViewInstance } from "react-native";
import { CLES_FIBRES_EAU } from "../../db/depots/fibres-eau";
import { ecrireReglage } from "../../db/depots/reglages";
import { locale, t, tp } from "../../i18n/index";
import { formater } from "../../i18n/temps";
import { useLangue } from "../../i18n/useLangue";
import { astuceVisible, PALIER, FIBRES } from "../../nutrition/fibres-eau";
import { decalerJour } from "../../nutrition/calculs";
import { useTheme } from "../../theme";
import { avecOpacite } from "../../theme/teintes";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { Interrupteur } from "../../ui/Interrupteur";
import { revenir } from "../../ui/revenir";
import { Texte } from "../../ui/Texte";
import { useApp, useCharge } from "../contexte";
import { nombre } from "../format";
import { CarteConseils, CartePalier, FeuilleHabitudes, RoueFibres, useCouleursSuivis } from "../nutrition/FibresEau";
import { useModeAffichage } from "../nutrition/mode-affichage";
import { nomRepas } from "../nutrition/nom-repas";
import { texteQuantite } from "../nutrition/commun";
import { repasDeLHeure } from "../../db/depots/nutrition";
import { jourDe } from "../planif-donnees";
import { jourDeRoute } from "./agenda-liste";
import { ouvrirAgenda } from "./agenda-store";
import { EnteteJour, useJour } from "./EnteteJour";
import { alimentsDuJour, atteint, fibresConnues, lignesVisibles, periodeFibres, plusRiches, statsFinis, type AlimentListe } from "./fibres-calc";
import { lireDonneesFibres, type DonneesFibres } from "./fibres-donnees";
import {
  ActionTete, Anneau, BlocVide, EnPanne, Groupe, Heros, LigneAjout, LigneMesure, Lignes, MARGE, Note, Os, PageMesure, PageVide, Signe, TitreGroupe,
} from "./gabarit";
import { GrapheBarres } from "./graphes";
import { court, ecartRelatif, joursEntre, libelleLongueur, minuit, periodeExiste, type TypePeriode } from "./periodes";
import { EnteteStats, Statistiques } from "./Statistiques";

/** « 4,0 », « 3,9 » : les grammes d'une ligne, toujours une décimale comme sur la planche (virgule en français, point en anglais). */
const unDecimale = (v: number) => new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
/** « 22 % », « < 1 % » : une part arrondie à zéro ne s'écrit pas « 0 % » à côté d'un aliment qui compte. */
const partTxt = (p: number) => (p < 1 ? "< 1 %" : `${p} %`);
const jourSemaineMois = (ms: number) => formater(ms, { weekday: "short", day: "numeric", month: "short" });

/** Barre du jour et barre sous l'objectif en tilleul doux : 62 % la nuit, 75 % le jour pour tenir 3:1 sur la carte (D1). */
const OPACITE_DOUX = { nuit: 0.62, jour: 0.75 } as const;

export function Fibres() {
  useLangue();
  const { db } = useApp();
  const aff = useModeAffichage();
  const params = useLocalSearchParams<{ jour?: string }>();
  const [depuis] = useState(() => Date.now());
  const [x, recharger, panne] = useCharge((d) => lireDonneesFibres(d), [], undefined, "nutrition/fibres");
  const { jour, aujourdhui, choisir } = useJour(x?.maintenant ?? depuis, jourDeRoute(params.jour));
  const haut = useRef<ScrollViewInstance | null>(null);
  const [roue, setRoue] = useState(false);
  const [habitudes, setHabitudes] = useState(false);
  const [ouvertPour, setOuvertPour] = useState<number | null>(null);
  const [type, setType] = useState<TypePeriode>("semaine");
  const [k, setK] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  // squelette seulement si la lecture dure plus de 300 ms (sinon rien ne bouge à l'arrivée)
  const [os, setOs] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setOs(true), 300);
    return () => clearTimeout(id);
  }, []);
  // Sans chiffres, la barre du Journal est masquée : la page n'a pas d'entrée (un lien ancien referme la page).
  const chiffres = aff.totauxJournalVisibles;
  useEffect(() => {
    if (!chiffres) revenir();
  }, [chiffres]);

  const ecrire = (cle: keyof typeof CLES_FIBRES_EAU, v: string) => ecrireReglage(db, CLES_FIBRES_EAU[cle], v).then(recharger).catch(signalerErreur());
  const objectif = aff.objectifsVisibles && x ? x.reglages.fibresObjectifG : null;

  // un jour touché dans l'agenda : il s'affiche en tête, la page remonte
  const montrerJour = (j: number) => {
    choisir(j);
    haut.current?.scrollTo({ y: 0, animated: false });
  };
  const agenda = () =>
    x &&
    ouvrirAgenda({
      titre: t("fibresPage.titre"),
      maintenant: x.maintenant,
      premier: x.premier,
      accent: "nutrition",
      legende: objectif != null ? t("fibresPage.agendaLegende", { n: nombre(objectif, 0) }) : t("fibresPage.agendaLegendeSans"),
      lire: async (debut, fin) =>
        joursEntre(debut, fin).flatMap((j) => {
          const f = x.jours.get(j);
          const g = fibresConnues(f);
          if (f == null || g == null) return [];
          return [{ date: j, texte: t("fibres.grammes", { n: nombre(Math.round(g), 0) }), sous: f.partiel ? t("fibresPage.auMoins").toLowerCase() : null, bon: objectif != null && atteint(g, objectif) }];
        }),
      onJour: montrerJour,
    });

  const actions = (
    <>
      {x && x.premier != null ? <ActionTete nom="cal" libelle={t("fibresPage.agenda")} onPress={agenda} /> : null}
      {x && objectif != null ? <ActionTete nom="cible" libelle={t("fibresPage.objectifQuotidien")} onPress={() => setRoue(true)} /> : null}
    </>
  );

  if (!chiffres) return null;
  if (!x)
    return (
      <PageMesure accent="nutrition" titre={t("fibresPage.titre")} actions={actions}>
        {panne ? <EnPanne texte={t("fibresPage.panneTexte")} onReessayer={() => void recharger().catch(console.error)} /> : os ? <Chargement avecObjectif={aff.objectifsVisibles} /> : null}
      </PageMesure>
    );

  if (!x.reglages.fibresSuivi)
    return (
      <PageMesure accent="nutrition" titre={t("fibresPage.titre")}>
        <PageVide icone="assiette" titre={t("fibresPage.coupeTitre")} texte={t("fibresPage.coupeTexte")} action={t("fibresPage.ouvrirObjectifs")} onAction={() => router.push("/nutrition/objectifs")} />
      </PageMesure>
    );

  const ajd = aujourdhui;
  const fibresG = fibresConnues(x.jours.get(jour)) ?? 0;
  const conseilsVisibles =
    ajd && objectif != null && astuceVisible({ aujourdhui: ajd, suivi: x.reglages.fibresSuivi, masquee: !x.reglages.astuce, chiffres, fibresG: Math.round(fibresG), objectifG: x.reglages.fibresObjectifG, echange: x.conseils[0] ?? null });
  const palierVisible = ajd && objectif != null && x.palier != null;
  const noter = () => {
    const d = new Date(x.maintenant);
    const repas = repasDeLHeure(x.repas.filter((r) => r.actif), d.getHours() * 60 + d.getMinutes());
    router.push({ pathname: "/nutrition/ajouter", params: { repas: repas?.id ?? "", date: jourDe(jour) } });
  };

  return (
    <PageMesure
      accent="nutrition"
      titre={t("fibresPage.titre")}
      actions={actions}
      defilement={(v) => {
        haut.current = v;
      }}
    >
      <EnteteJour jour={jour} maintenant={x.maintenant} onJour={choisir} avecDonnee={(j) => fibresConnues(x.jours.get(j)) != null}>
        <Haut x={x} jour={jour} objectif={objectif} ouvert={ouvertPour === jour} onOuvrir={() => setOuvertPour((o) => (o === jour ? null : jour))} onNoter={noter} />
        {palierVisible ? (
          <CartePalier
            objectifG={x.reglages.fibresObjectifG}
            suivantG={x.palier!}
            onPasser={() => void ecrire("fibresObjectif", String(x.palier))}
            onPlusTard={() => void ecrire("palierReporte", decalerJour(jourDe(minuit(x.maintenant)), PALIER.reportJours))}
            style={styles.carte}
          />
        ) : null}
        {conseilsVisibles ? <CarteConseils conseils={x.conseils} repas={x.repas} onPress={() => setHabitudes(true)} style={styles.carte} /> : null}
      </EnteteJour>
      <StatsFibres
        x={x}
        objectif={objectif}
        type={type}
        k={k}
        sel={sel}
        setType={(v) => (setType(v), setK(0), setSel(null))}
        setK={(v) => (setK(v), setSel(null))}
        setSel={setSel}
      />
      {objectif != null ? (
        <Reglages
          x={x}
          onObjectif={() => setRoue(true)}
          onConseils={(v) => void ecrire("astuce", v ? "1" : "0")}
        />
      ) : null}
      <RoueFibres
        visible={roue}
        objectifG={x.reglages.fibresObjectifG}
        onFermer={() => setRoue(false)}
        onValider={(g) => (setRoue(false), void ecrire("fibresObjectif", String(g)))}
      />
      <FeuilleHabitudes
        visible={habitudes}
        objectifG={x.reglages.fibresObjectifG}
        onFermer={() => setHabitudes(false)}
        onMasquer={() => (setHabitudes(false), void ecrire("astuce", "0"))}
      />
    </PageMesure>
  );
}

// ---- Haut de page ------------------------------------------------------------------------------------------------------

function Haut({ x, jour, objectif, ouvert, onOuvrir, onNoter }: { x: DonneesFibres; jour: number; objectif: number | null; ouvert: boolean; onOuvrir: () => void; onNoter: () => void }) {
  const { fibres: tilleul } = useCouleursSuivis();
  const ajd = jour === minuit(x.maintenant);
  const lignes = x.lignes.get(jour) ?? [];
  const f = x.jours.get(jour);
  const g = fibresConnues(f);
  const partiel = f?.partiel ?? false;
  const anneau = (part: number) => (objectif != null ? <Anneau part={part} couleur={tilleul} /> : undefined);
  if (!lignes.length)
    return (
      <>
        <Heros vide serre valeur={ajd ? t("fibresPage.pasEncore") : t("mesures.pasDeDonneeJour")} droite={anneau(0)} />
        {ajd ? (
          <Groupe style={{ marginTop: 24 }}>
            <LigneAjout libelle={t("fibresPage.noterRepas")} onPress={onNoter} />
          </Groupe>
        ) : (
          <BlocVide titre={t("fibresPage.rienNote")} texte={t("fibresPage.rienNoteTexte")} />
        )}
      </>
    );
  if (g == null)
    return (
      <>
        <Heros vide serre valeur={t("fibresPage.inconnues")} droite={anneau(0)} />
        <BlocVide titre={t("fibresPage.nonRenseignees")} texte={t("fibresPage.nonRenseigneesTexte")} />
        <Liste x={x} jour={jour} ouvert={ouvert} onOuvrir={onOuvrir} sansNote />
      </>
    );
  // Les parts se comptent sur le chiffre écrit (arrondi au gramme), comme la barre du Journal.
  const arrondi = Math.round(g);
  const part = objectif != null ? arrondi / objectif : 0;
  const p = Math.round(part * 100);
  const n = nombre(arrondi, 0);
  return (
    <>
      <Heros
        valeur={n}
        unite={t("nutrition.g")}
        sous={objectif != null ? t(partiel ? "fibresPage.partObjectifPartiel" : "fibresPage.partObjectif", { p, objectif: nombre(objectif, 0) }) : partiel ? t("fibresPage.auMoins") : undefined}
        droite={anneau(part)}
        libelle={
          objectif != null
            ? t(partiel ? "fibresPage.libelleHerosPartiel" : "fibresPage.libelleHeros", { n, p, objectif: nombre(objectif, 0) })
            : t(partiel ? "fibresPage.libelleHerosSansPartiel" : "fibresPage.libelleHerosSans", { n })
        }
      />
      <Liste x={x} jour={jour} ouvert={ouvert} onOuvrir={onOuvrir} />
    </>
  );
}

/** « D'où viennent tes fibres » : les aliments du jour du plus riche au moins riche, cinq d'abord (D3, D4), sans geste sur une ligne (D5). */
function Liste({ x, jour, ouvert, onOuvrir, sansNote }: { x: DonneesFibres; jour: number; ouvert: boolean; onOuvrir: () => void; sansNote?: boolean }) {
  const lignes = x.lignes.get(jour) ?? [];
  const liste = useMemo(() => alimentsDuJour(lignes), [lignes]);
  const parId = useMemo(() => new Map(lignes.map((l) => [l.id, l])), [lignes]);
  if (!liste.aliments.length) return null;
  const { montrees, autres } = lignesVisibles(liste.aliments, ouvert);
  const ligne = (a: AlimentListe) => {
    const c = parId.get(a.id);
    const repas = x.repas.find((r) => r.id === a.repasId);
    const quantite = c ? texteQuantite(c) : `${nombre(a.quantiteG, 0)} ${t("nutrition.g")}`;
    const sous = repas ? t("fibresPage.quantiteRepas", { quantite, repas: nomRepas(repas) }) : quantite;
    if (a.g == null) return <LigneMesure key={a.id} titre={a.nom} sous={sous} valeur="–" attenuee libelle={t("fibresPage.ligneA11yInconnue", { nom: a.nom, quantite: sous })} />;
    return (
      <LigneMesure
        key={a.id}
        titre={a.nom}
        sous={sous}
        valeur={unDecimale(a.g)}
        unite={t("nutrition.g")}
        sousValeur={partTxt(a.part ?? 0)}
        libelle={t("fibresPage.ligneA11y", { nom: a.nom, quantite: sous, g: unDecimale(a.g), p: (a.part ?? 0) < 1 ? "< 1" : (a.part ?? 0) })}
      />
    );
  };
  return (
    <>
      <TitreGroupe>{t("fibresPage.dOu")}</TitreGroupe>
      <Groupe>
        <Lignes>
          {[
            ...montrees.map(ligne),
            autres > 0 ? <LigneMesure key="voir" titre={ouvert ? t("fibresPage.voirMoins") : t("fibresPage.voirAutres", { n: autres })} onPress={onOuvrir} fleche={ouvert ? "haut" : "bas"} /> : null,
          ]}
        </Lignes>
        {liste.sansFibres > 0 && !sansNote ? <Note style={styles.noteListe}>{tp("fibresPage.sansFibres", liste.sansFibres)}</Note> : null}
      </Groupe>
    </>
  );
}

// ---- Statistiques ------------------------------------------------------------------------------------------------------

function StatsFibres({
  x,
  objectif,
  type,
  k,
  sel,
  setType,
  setK,
  setSel,
}: {
  x: DonneesFibres;
  objectif: number | null;
  type: TypePeriode;
  k: number;
  sel: number | null;
  setType: (v: TypePeriode) => void;
  setK: (v: number) => void;
  setSel: (v: number | null) => void;
}) {
  const { fibres: tilleul } = useCouleursSuivis();
  const { mode } = useTheme();
  const auj = minuit(x.maintenant);
  const lire = (j: number) => x.jours.get(j);
  const p = useMemo(() => periodeFibres(type, k, x.maintenant, lire), [type, k, x]);
  const avant = useMemo(() => periodeFibres(type, k + 1, x.maintenant, lire), [type, k, x]);
  const s = statsFinis(p.jours, auj, objectif);
  const sAvant = statsFinis(avant.jours, auj, objectif);
  const longueur = libelleLongueur(type);
  const b = sel != null ? p.barres[sel] : null;
  const annee = type === "annee";
  // Sans objectif, toutes les barres sont pleines ; sinon, pleine à l'objectif atteint (au gramme près, comme le Journal).
  const plein = (v: number) => objectif == null || atteint(v, objectif);
  const doux = avecOpacite(tilleul, OPACITE_DOUX[mode]);

  let entete;
  if (b) {
    const petit = annee ? t("mesures.moyenneMois", { titre: b.titre }) : b.titre;
    entete =
      b.v == null ? (
        <EnteteStats petit={petit} vide valeur={t("mesures.pasDeDonnee")} />
      ) : (
        <EnteteStats
          petit={petit}
          valeur={nombre(b.v, 0)}
          unite={t("nutrition.g")}
          ligne={objectif == null ? undefined : atteint(b.v, objectif) ? t("fibresPage.objectifAtteint") : t("fibresPage.sousObjectif", { n: nombre(objectif - Math.round(b.v), 0) })}
        />
      );
  } else if (s.n <= 1) {
    entete = (
      <EnteteStats
        petit={s.n ? jourSemaineMois(s.meilleur!.jour) : t("mesures.moyenneDe", { longueur })}
        valeur={s.n ? nombre(s.total, 0) : t("mesures.pasDeDonnee")}
        vide={!s.n}
        unite={s.n ? t("nutrition.g") : null}
        ligne={s.n ? t("fibresPage.desDeuxJours") : undefined}
      />
    );
  } else {
    const e = ecartRelatif(s.moyenne, sAvant.moyenne);
    entete = (
      <EnteteStats
        petit={t("mesures.moyenneDe", { longueur })}
        valeur={nombre(s.moyenne!, 0)}
        unite={t("nutrition.g")}
        ligne={
          e != null && sAvant.moyenne != null ? (
            <>
              <Signe ecart={e} />
              <Texte variante="meta" couleur="t2">
                {t("mesures.vsAvant", { avant: t(`mesures.avantDe.${type}`), valeur: `${nombre(sAvant.moyenne, 0)} ${t("nutrition.g")}` })}
              </Texte>
            </>
          ) : undefined
        }
      />
    );
  }

  // La barre du jour (ou du mois en cours) vaut ce qu'il y a de noté pour l'instant : elle se dessine douce, et une ligne le dit.
  const duJour = k === 0 && p.barres.some((x) => x.enCours && x.v != null);
  const precedent = periodeExiste(type, k + 1, x.maintenant, x.premier);
  const libelleGraphe = t(annee ? "fibresPage.grapheMois" : "fibresPage.grapheJours", { titre: p.titre });
  return (
    <Statistiques<TypePeriode>
      lundi={type === "semaine" ? p.debut : null}
      periodes={(["semaine", "mois", "annee"] as const).map((v) => ({ valeur: v, libelle: t(`mesures.periode.${v}`) }))}
      type={type}
      onType={setType}
      titre={p.titre}
      precedent={precedent}
      onAller={(sens) => setK(Math.max(0, k + sens))}
      k={k}
      entete={entete}
      nb={p.barres.length}
      sel={sel}
      onSel={setSel}
      cle={`${type}:${k}`}
      libelleGraphe={libelleGraphe}
      graphe={(W) => (
        <GrapheBarres
          barres={p.barres}
          largeur={W}
          cle={`${type}:${k}`}
          sel={sel}
          plein={plein}
          objectif={objectif}
          valeur={type === "semaine" ? court : undefined}
          axe={type === "semaine" ? undefined : court}
          largeurBarre={type === "semaine" ? 28 : annee ? 18 : 7}
          libelle={libelleGraphe}
          couleurBarre={(v, i) => (p.barres[i]?.enCours || !plein(v) ? doux : tilleul)}
          opaciteEnCours={1}
        />
      )}
      legende={duJour ? <Note style={styles.legende}>{t("fibresPage.aujourdhuiPasCompte")}</Note> : undefined}
      apres={<Apres x={x} p={p} s={s} sAvant={sAvant} objectif={objectif} type={type} />}
    />
  );
}

/** Ce qui suit la carte : Meilleur jour et Objectif atteint (D6), puis les plus riches de la période (D9). */
function Apres({ x, p, s, sAvant, objectif, type }: { x: DonneesFibres; p: ReturnType<typeof periodeFibres>; s: ReturnType<typeof statsFinis>; sAvant: ReturnType<typeof statsFinis>; objectif: number | null; type: TypePeriode }) {
  const riches = useMemo(() => plusRiches(p.jours.flatMap((j) => x.lignes.get(j.jour) ?? [])), [p, x]);
  return (
    <>
      {s.n ? (
        <Groupe>
          <Lignes>
            {[
              s.meilleur ? <LigneMesure key="meilleur" titre={t("fibresPage.meilleurJour")} valeur={nombre(Math.round(s.meilleur.v), 0)} unite={t("nutrition.g")} sousValeur={jourSemaineMois(s.meilleur.jour)} /> : null,
              objectif != null ? (
                <LigneMesure
                  key="atteint"
                  titre={t("fibresPage.objectifAtteint")}
                  valeur={nombre(s.atteints, 0)}
                  unite={tp("fibresPage.surJours", s.n)}
                  sousValeur={sAvant.n ? t("mesures.avant", { valeur: `${sAvant.atteints} / ${sAvant.n}` }) : undefined}
                />
              ) : null,
            ]}
          </Lignes>
        </Groupe>
      ) : null}
      {riches.length ? (
        <>
          <TitreGroupe>{t("fibresPage.riches", { longueur: libelleLongueur(type) })}</TitreGroupe>
          <Groupe>
            <Lignes>
              {riches.map((r) => (
                <LigneMesure
                  key={r.nom}
                  titre={r.nom}
                  sous={tp("fibresPage.fois", r.fois)}
                  valeur={r.g >= 100 ? nombre(r.g, 0) : unDecimale(r.g)}
                  unite={t("nutrition.g")}
                  sousValeur={partTxt(r.part)}
                  libelle={t("fibresPage.richeA11y", { nom: r.nom, fois: tp("fibresPage.fois", r.fois), g: r.g >= 100 ? nombre(r.g, 0) : unDecimale(r.g), p: r.part < 1 ? "< 1" : r.part })}
                />
              ))}
            </Lignes>
          </Groupe>
        </>
      ) : null}
    </>
  );
}

// ---- Réglages ----------------------------------------------------------------------------------------------------------

function Reglages({ x, onObjectif, onConseils }: { x: DonneesFibres; onObjectif: () => void; onConseils: (v: boolean) => void }) {
  const objectif = x.reglages.fibresObjectifG;
  return (
    <>
      <TitreGroupe>{t("fibresPage.reglages")}</TitreGroupe>
      <Groupe>
        <Lignes>
          {[
            <LigneMesure
              key="objectif"
              titre={t("fibresPage.objectifQuotidien")}
              sous={t(objectif === FIBRES.defautG ? "fibresPage.parDefaut" : "fibresPage.personnalise")}
              valeur={nombre(objectif, 0)}
              unite={t("nutrition.g")}
              onPress={onObjectif}
            />,
            <LigneMesure
              key="conseils"
              titre={t("fibresPage.afficherConseils")}
              droite={<Interrupteur valeur={x.reglages.astuce} onChange={onConseils} libelle={t("fibresPage.afficherConseils")} />}
            />,
          ]}
        </Lignes>
      </Groupe>
    </>
  );
}

// ---- Chargement --------------------------------------------------------------------------------------------------------

/** Aux mêmes hauteurs que la page chargée : la date, le héros et son anneau, cinq lignes ; rien ne saute à l'arrivée. */
function Chargement({ avecObjectif }: { avecObjectif: boolean }) {
  const { fibres: tilleul } = useCouleursSuivis();
  return (
    <View accessibilityLabel={t("mesures.chargement")} accessible>
      <View style={{ marginHorizontal: 16 }}>
        <Os largeur={160} hauteur={13} />
      </View>
      <View style={styles.chargeHeros}>
        <View>
          <Os largeur={120} hauteur={52} rayon={8} />
          <View style={{ height: 12 }} />
          <Os largeur={96} hauteur={14} />
        </View>
        {avecObjectif ? <Anneau part={0} couleur={tilleul} /> : null}
      </View>
      <TitreGroupe>{t("fibresPage.dOu")}</TitreGroupe>
      <Groupe style={{ height: 5 * 57 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.chargeLigne}>
            <View style={{ gap: 6 }}>
              <Os largeur={128} hauteur={14} />
              <Os largeur={88} hauteur={11} />
            </View>
            <Os largeur={36} hauteur={16} />
          </View>
        ))}
      </Groupe>
    </View>
  );
}

const styles = StyleSheet.create({
  // le palier et les conseils : 20 sous la liste ou le héros, au bord des groupes de la page (la carte du Journal a 16 de marge aussi)
  carte: { marginHorizontal: MARGE, marginTop: 20, marginBottom: 0 },
  noteListe: { marginHorizontal: MARGE, marginTop: 4, marginBottom: 12 },
  legende: { marginRight: 8 },
  chargeHeros: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, marginHorizontal: 16, minHeight: 96 },
  chargeLigne: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 56, paddingHorizontal: 16 },
});
