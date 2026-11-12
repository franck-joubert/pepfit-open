// Pages Variabilité cardiaque (VFC) et Fréquence cardiaque au repos (planche pas, NOTES § 1 : mesures « état », tableau
// « Pour la suite » ; retour du 29/10) : en tête, le semainier commun et le jour choisi (glissé, toucher une date,
// jamais le futur), la valeur de sa nuit en chiffre fort face à ta normale (flèche + %), puis le bloc propre « Écart à ta
// normale · 30 jours » (rail de la bande, phrase choisie par règle : une hausse de 5 bpm annonce de la fatigue) ; les
// statistiques (StatsEtat.tsx : une pastille par nuit, moyenne lissée, bande de ta normale), l'historique derrière « Toutes
// les mesures » (page agenda), les sources réelles (Whoop, Santé Connect). Rien d'inventé : sans nuit mesurée, la page vide
// propose de relier Whoop ou d'autoriser Santé Connect.
import { router } from "expo-router";
import { useRef, useState } from "react";
import { View, type ScrollViewInstance } from "react-native";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useTheme } from "../../theme";
import { Texte } from "../../ui/Texte";
import { ORIGINE_WHOOP } from "../../whoop/depot";
import { fixe } from "../composition-vue";
import { useCharge } from "../contexte";
import { jourPesee } from "../poids";
import { nomSource } from "../sante-donnees";
import { bandeSerie, ecartNormale, niveauNuit, normaleAu, nuitBonne, nuitsManquantes, parNuit, phraseCoeur, type CleCoeur, type Normale } from "./coeur-calc";
import { lireDonneesCoeur } from "./coeur-donnees";
import { useSanteEnFond, type EtatSC } from "./sante-fond";
import { jourEtat, joursReleves, type Releve } from "./corps-calc";
import { EnteteJour, useJour } from "./EnteteJour";
import { ActionTete, BlocVide, Duo, EnPanne, Groupe, Heros, LigneMesure, Lignes, Note, PageMesure, PageVide, PointJour, Quand, Signe, TitreGroupe, ValeurDuo, useMesure } from "./gabarit";
import { minuit, signe } from "./periodes";
import { SEUIL_NORMALE } from "./scores-calc";
import { heureReleve, LigneToutes, ouvrirAgendaEtat, StatsEtat } from "./StatsEtat";

/** `sc` : null tant que l'état de Santé Connect n'est pas lu (en fond : sante-fond.ts). */
type Donnees = { vfc: Releve[]; fc: Releve[]; whoop: boolean; sc: EtatSC | null };

const minus = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const f = (v: number) => fixe(v, 0);
const sourceDe = (r: Releve) => (r.manuel ? t("mesuresCorps.saisie") : nomSource(r.origine));
const uniteDe = (cle: CleCoeur) => (cle === "vfc" ? t("sante.ms") : t("sante.bpm"));
const titreDe = (cle: CleCoeur) => (cle === "vfc" ? t("mesuresCoeur.titreVfc") : t("mesuresCoeur.titreFc"));

export function Coeur({ cle, jour: depart = null }: { cle: CleCoeur; jour?: number | null }) {
  useLangue();
  const [maintenant] = useState(() => Date.now());
  // la base d'abord ; Santé Connect (état, import) en fond, la page relue s'il apporte du neuf (M8). L'autre mesure (FC ou
  // VFC) est lue aussi : la page la montre à côté.
  const [lu, recharger, panne] = useCharge((db) => lireDonneesCoeur(db, maintenant), [], undefined, "sante/coeur");
  const { sc, relierSante } = useSanteEnFond(recharger);
  const x: Donnees | undefined = lu && { ...lu, sc };
  const j = useJour(maintenant, depart);
  const page = useRef<ScrollViewInstance | null>(null);
  const m = useMesure();
  const vfc = cle === "vfc";
  const titre = titreDe(cle);
  const unite = uniteDe(cle);
  const releves = x ? x[cle] : [];
  // l'agenda (page posée par-dessus) relit les nuits d'après l'état le plus récent
  const vivant = useRef<{ l: readonly Releve[]; nuits: Map<number, number> | null }>({ l: releves, nuits: null });
  if (vivant.current.l !== releves) vivant.current = { l: releves, nuits: null };
  const nuitsVivantes = () => (vivant.current.nuits ??= parNuit(vivant.current.l));

  if (!x) return <PageMesure titre={titre}>{panne ? <EnPanne onReessayer={() => void recharger().catch(console.error)} /> : null}</PageMesure>;

  const lignesSources = <Sources cle={cle} x={x} maintenant={maintenant} relierSante={relierSante} />;
  if (!releves.length)
    return (
      <PageMesure titre={titre}>
        <PageVide
          icone="pouls"
          titre={vfc ? t("mesuresCoeur.videVfcTitre") : t("mesuresCoeur.videFcTitre")}
          texte={vfc ? t("mesuresCoeur.videVfcTexte") : t("mesuresCoeur.videFcTexte")}
          action={x.whoop ? t("mesuresCoeur.voirConnexions") : t("mesures.relierWhoop")}
          onAction={() => router.push("/settings/connexions")}
        />
        {lignesSources}
      </PageMesure>
    );

  const nuits = nuitsVivantes();
  const e = jourEtat(releves, j.jour);
  const r = e.releve;
  const n = normaleAu(cle, nuits, j.jour);
  const jours = joursReleves(releves);
  const autreCle: CleCoeur = vfc ? "fc" : "vfc";
  const autre = jourEtat(x[autreCle], j.jour);
  const autreReleve = autre.releve ?? autre.precedent;
  const agenda = (vue: "liste" | "mois") =>
    ouvrirAgendaEtat({
      titre,
      maintenant,
      releves: () => vivant.current.l,
      legende: vfc ? t("mesuresCoeur.legendeVfc") : t("mesuresCoeur.legendeFc"),
      vue,
      entree: (q) => ({
        date: q.date,
        texte: `${f(q.valeur)} ${unite}`,
        sous: [sourceDe(q), heureReleve(q)].filter(Boolean).join(", "),
        bon: nuitBonne(cle, q.valeur, normaleAu(cle, nuitsVivantes(), minuit(q.date))),
      }),
      onJour: (jj) => {
        j.choisir(jj);
        page.current?.scrollTo({ y: 0, animated: false });
      },
    });
  const quand = r
    ? t("mesuresCoeur.quand", { source: sourceDe(r), heure: heureReleve(r) }).trim()
    : e.precedent
      ? t("mesuresCoeur.precedente", { jour: minus(jourPesee(e.precedent.date, maintenant)) })
      : null;
  const normaleTexte = n ? t("mesuresCoeur.normale30", { v: f(n.centre), u: unite }) : null;

  return (
    <PageMesure
      titre={titre}
      defilement={(v) => void (page.current = v)}
      actions={<ActionTete nom="cal" libelle={t("mesures.agenda")} onPress={() => agenda("mois")} />}
    >
      <EnteteJour jour={j.jour} maintenant={maintenant} onJour={j.choisir} avecDonnee={(d) => jours.has(d)}>
        {quand ? <Quand texte={quand} /> : null}
        {r ? (
          <Heros
            valeur={f(r.valeur)}
            unite={unite}
            libelle={`${titre} ${f(r.valeur)} ${unite}${normaleTexte ? `, ${normaleTexte}` : ""}`}
            sous={
              n ? (
                <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 8, marginTop: 2 }}>
                  <PointJour niveau={niveauNuit(cle, r.valeur, n)} />
                  <Signe ecart={ecartNormale(r.valeur, n)} egal={t("mesuresCoeur.egalNormale")} seuil={SEUIL_NORMALE} />
                  <Texte variante="corps" couleur="t2">
                    {normaleTexte!}
                  </Texte>
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", columnGap: 8, marginTop: 2 }}>
                  <PointJour niveau="neutre" />
                  <Texte variante="corps" couleur="t2">
                    {t("mesuresCoeur.sansNormale")}
                  </Texte>
                </View>
              )
            }
          />
        ) : (
          <Heros vide valeur={j.aujourdhui ? t("mesuresCoeur.pasEncore") : t("mesuresCoeur.pasDeMesure")} sous={normaleTexte ?? undefined} />
        )}
        <BlocNormale cle={cle} v={r?.valeur ?? null} n={n} manque={nuitsManquantes(nuits, j.jour)} unite={unite} />
        <Groupe>
          <Lignes>
            {[
              autreReleve ? (
                <LigneMesure
                  key="a"
                  titre={titreDe(autreCle)}
                  sous={minus(jourPesee(autreReleve.date, maintenant))}
                  etat={`${f(autreReleve.valeur)} ${uniteDe(autreCle)}`}
                  onPress={() => router.push({ pathname: vfc ? "/sante/fc" : "/sante/vfc", params: { jour: String(minuit(autreReleve.date)) } })}
                />
              ) : null,
              <LigneMesure key="r" titre={t("mesuresCoeur.recuperation")} sous={t("mesuresCoeur.recuperationSous")} onPress={() => router.push("/sante/recuperation")} />,
            ]}
          </Lignes>
        </Groupe>
      </EnteteJour>

      <StatsEtat
        id={cle}
        releves={releves}
        unite={unite}
        dec={0}
        maintenant={maintenant}
        bandeDe={(pts) => bandeSerie(cle, pts, nuits)}
        libelleCourbe={(periode) => t(vfc ? "mesuresCoeur.courbeVfc" : "mesuresCoeur.courbeFc", { periode })}
        cles={[
          { libelle: t("mesuresCoeur.cleNuit"), pastille: true },
          { libelle: t("mesuresCorps.cleLissee"), trait: "plein" },
          { libelle: t("mesuresCoeur.cleNormale"), carre: m.voile },
        ]}
        nomReleves={t("mesuresCoeur.nuitsMesurees")}
        sourceDe={sourceDe}
      />

      <LigneToutes
        titre={t("mesuresCorps.toutesMesures")}
        dernier={releves[releves.length - 1] ?? null}
        texte={`${f(releves[releves.length - 1]!.valeur)} ${unite}`}
        maintenant={maintenant}
        onPress={() => agenda("liste")}
      />

      {lignesSources}
    </PageMesure>
  );
}

/** Écart à ta normale · 30 jours : l'écart de la nuit, ta normale et sa bande, le rail, la phrase de la règle. */
function BlocNormale({ cle, v, n, manque, unite }: { cle: CleCoeur; v: number | null; n: Normale | null; manque: number; unite: string }) {
  if (!n) return <BlocVide titre={t("mesuresCoeur.normaleBientotTitre")} texte={tp("mesuresCoeur.normaleBientotTexte", manque)} />;
  const phrase = v != null ? phraseCoeur(cle, v, n) : null;
  const position = phrase === "hausse" ? "haut" : phrase;
  return (
    <>
      <TitreGroupe>{t("mesuresCoeur.ecartTitre")}</TitreGroupe>
      <Groupe bloc>
        <Duo
          gauche={
            v != null ? (
              <ValeurDuo valeur={signe(v - n.centre, 0)} unite={unite} sous={t(`mesuresCoeur.position.${position!}` as "mesuresCoeur.position.bas")} />
            ) : (
              <ValeurDuo valeur="—" sous={t("mesuresCoeur.pasDeMesureCourt")} />
            )
          }
          droite={<ValeurDuo droite avant={t("mesuresCoeur.taNormale")} valeur={f(n.centre)} unite={unite} sous={t("mesuresCoeur.bande", { bas: f(n.bas), haut: f(n.haut), u: unite })} />}
        />
        <RailNormale v={v} n={n} unite={unite} />
        {phrase ? (
          <Texte variante="corps" style={{ marginTop: 12 }}>
            {t(`mesuresCoeur.phrase.${cle}.${phrase}` as "mesuresCoeur.phrase.fc.hausse")}
          </Texte>
        ) : null}
        <Note>{tp("mesuresCoeur.noteNormale", n.n)}</Note>
      </Groupe>
    </>
  );
}

/** Rail de ta normale : la bande (voile), ta normale (trait), la nuit (point plein). */
function RailNormale({ v, n, unite }: { v: number | null; n: Normale; unite: string }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const lo = Math.min(n.bas, v ?? n.bas);
  const hi = Math.max(n.haut, v ?? n.haut);
  const marge = Math.max((hi - lo) * 0.25, 2);
  const a = lo - marge;
  const b = hi + marge;
  const pc = (x: number) => ((x - a) / (b - a)) * 100;
  return (
    <View
      style={{ marginTop: 16, marginBottom: 4, height: 14, justifyContent: "center" }}
      accessible
      accessibilityLabel={t("mesuresCoeur.railLibelle", { bas: f(n.bas), haut: f(n.haut), u: unite, v: v != null ? f(v) : "—" })}
    >
      <View style={{ height: 8, borderRadius: 3, backgroundColor: couleurs.s3 }}>
        <View style={{ position: "absolute", top: 0, bottom: 0, left: `${pc(n.bas)}%`, width: `${pc(n.haut) - pc(n.bas)}%`, borderRadius: 3, backgroundColor: m.voile, borderWidth: 1, borderColor: m.doux }} />
        <View style={{ position: "absolute", top: -3, bottom: -3, left: `${pc(n.centre)}%`, width: 1.5, marginLeft: -0.75, backgroundColor: couleurs.t2 }} />
      </View>
      {v != null ? (
        <View style={{ position: "absolute", left: `${pc(v)}%`, marginLeft: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: m.fort, borderWidth: 2, borderColor: m.groupe }} />
      ) : null}
    </View>
  );
}

/** Sources : Whoop (chaque nuit, pendant le sommeil), Santé Connect (montre, bague) et leur état réel. */
function Sources({ cle, x, maintenant, relierSante }: { cle: CleCoeur; x: Donnees; maintenant: number; relierSante: () => Promise<void> }) {
  const l = x[cle];
  const whoop = [...l].reverse().find((r) => r.origine === ORIGINE_WHOOP) ?? null;
  const autre = [...l].reverse().find((r) => r.origine !== ORIGINE_WHOOP) ?? null;
  const relier = () => router.push("/settings/connexions");
  return (
    <>
      <TitreGroupe>{t("mesures.sources")}</TitreGroupe>
      <Groupe>
        <Lignes>
          {[
            <LigneMesure
              key="w"
              titre={t("mesures.whoop")}
              sous={whoop ? t("mesuresCoeur.sourceWhoopQuand", { quand: minus(jourPesee(whoop.date, maintenant)) }) : t("mesuresCoeur.sourceWhoop")}
              etat={whoop ? t("mesures.utilisee") : x.whoop ? null : t("mesures.nonReliee")}
              onPress={relier}
            />,
            <LigneMesure
              key="s"
              titre={t("mesures.santeConnect")}
              sous={
                autre
                  ? t("mesuresCoeur.sourceSanteQuand", { nom: sourceDe(autre), quand: minus(jourPesee(autre.date, maintenant)) })
                  : cle === "vfc"
                    ? t("mesuresCoeur.sourceSanteVfc")
                    : t("mesuresCoeur.sourceSanteFc")
              }
              etat={x.sc ? t(x.sc === "autorisee" ? "mesures.autorisee" : x.sc === "aAutoriser" ? "mesures.aAutoriser" : "mesures.absente") : null}
              onPress={() => void relierSante()}
            />,
          ]}
        </Lignes>
      </Groupe>
    </>
  );
}
