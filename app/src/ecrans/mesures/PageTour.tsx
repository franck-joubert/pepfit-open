// Page d'un tour (planche mensurations, M6) : le gabarit de Poids et Masse grasse, à la place de la liste nue d'avant. Le
// semainier et le jour choisi : sa mesure, sinon la dernière d'avant, datée ; l'écart depuis la précédente et depuis la
// première, chacun avec sa flèche (M12). Bloc propre « Où poser le mètre » (la vignette ouvre la consigne en grand) et, pour le
// tour de taille, le rapport à la taille (M9). Statistiques 30 j / 90 j / 1 an / Tout, les mesures reliées (pas de moyenne
// lissée : un tour se prend toutes les deux ou trois semaines). « Ajouter une mesure » (M7 : au jour choisi s'il est passé)
// et les cinq dernières ; une ligne s'ouvre (modifier la valeur, supprimer, Annuler 8 s) ; « Toutes les mesures » ouvre
// l'agenda en liste, l'icône agenda en mois. Page Poitrine (planche articulations, A1, D10) : pour une femme ou « Non précisé »,
// la section « Soutien-gorge » et sa ligne facultative « Tour de dos et bonnet », sous « Où poser le mètre ». Le personnage
// et le libellé « Où poser le mètre » suivent le profil (planche mensurations-femme, D4, D7 : la femme et « Au plus fort de
// la poitrine » pour elle ; « Non précisé » : le personnage choisi dans le parcours).
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ajouterMensuration, ecrireSoutien, effacerSoutien, historiqueMensuration, lirePersonnageChoisi, lireSexe, lireSoutien, modifierMensuration, supprimerMensuration, tailleProfil,
  type Mensuration, type Sexe,
} from "../../db/api";
import { minusculeInitiale, t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { SuppressionDifferee } from "../../photos/attente";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { BandeauAnnuler } from "../../ui/BandeauAnnuler";
import { Feuille, Groupe as GroupeFeuille, Option } from "../../ui/Feuille";
import { signalerSaisie } from "../../precision/service";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { Icone } from "../../ui/Icone";
import { revenir } from "../../ui/revenir";
import { Texte } from "../../ui/Texte";
import { fixe } from "../composition-vue";
import { useApp, useCharge } from "../contexte";
import { heure, jourMois, jourSemaineMois } from "../format";
import { jourPesee } from "../poids";
import { agendaChange } from "./agenda-store";
import { soutienPropose, type Soutien } from "./bonnet-calc";
import { joursReleves, type Releve } from "./corps-calc";
import { tourAuJour } from "./corps-donnees";
import { EnteteJour, useJour } from "./EnteteJour";
import { FeuilleBonnet, libelleSoutien } from "./FeuilleBonnet";
import { FeuilleConsigne, FeuilleTour } from "./FeuilleTour";
import { FigureEtape } from "./FigureTour";
import { ActionTete, Groupe, Heros, LigneAjout, LigneMesure, Lignes, PageMesure, PageVide, Quand, TitreGroupe, Variation } from "./gabarit";
import { minuit } from "./periodes";
import { ouvrirAgendaEtat, StatsEtat } from "./StatsEtat";
import { cleOu, personnage, valeurProposee, type Perso, type Tour } from "./tours-calc";

const JOUR_MS = 86_400_000;
const DERNIERES = 5;
const minus = minusculeInitiale;

type Donnees = { l: Mensuration[]; taille: number | null; sexe: Sexe | null; soutien: Soutien | null; choix: Perso | null };

export function PageTour({ tour, jour: depart = null }: { tour: Tour; jour?: number | null }) {
  useLangue();
  const { db } = useApp();
  const { couleurs, mode } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const [maintenant] = useState(() => Date.now());
  const [charge, recharger] = useCharge(
    async (base): Promise<Donnees> => {
      const [l, taille, sexe, soutien, choix] = await Promise.all([
        historiqueMensuration(base, tour), tailleProfil(base), lireSexe(base), tour === "poitrine" ? lireSoutien(base) : null, lirePersonnageChoisi(base),
      ]);
      return { l, taille: taille?.valeur ?? null, sexe, soutien, choix };
    },
    [tour],
  );
  const j = useJour(maintenant, depart);
  const page = useRef<ScrollViewInstance | null>(null);
  const [ajout, setAjout] = useState(false);
  const [ouverte, setOuverte] = useState<Mensuration | null>(null);
  const [modif, setModif] = useState<Mensuration | null>(null);
  const [consigne, setConsigne] = useState(false);
  const [bonnet, setBonnet] = useState(false);

  // Suppression (comme les pesées) : la mesure quitte la page tout de suite, « Annuler » la rend pendant 8 s.
  const [enAttente, setEnAttente] = useState<string | null>(null);
  const [suppression] = useState(() => new SuppressionDifferee(setEnAttente));
  useEffect(() => () => suppression.valider(), [suppression]);
  const [retires, setRetires] = useState<ReadonlySet<string>>(new Set());
  const surAgenda = useRef(false);
  useFocusEffect(useCallback(() => void (surAgenda.current = false), []));
  useEffect(() => {
    if (surAgenda.current) agendaChange();
  }, [charge]);
  const supprimer = (id: string) => {
    setRetires((s) => new Set(s).add(id));
    suppression.demander(id, () => void supprimerMensuration(db, id).then(recharger).catch(signalerErreur("supprimer")));
    if (surAgenda.current) revenir();
  };
  const annuler = () => {
    const id = suppression.enAttente;
    suppression.annuler();
    setRetires((s) => new Set([...s].filter((q) => q !== id)));
  };

  const nom = t(`nutrition.mesure.${tour}`);
  const sexe = charge?.sexe ?? null;
  const perso = personnage(sexe, charge?.choix ?? null);
  const ou = t(cleOu(tour, sexe));
  const l = (charge?.l ?? []).filter((m) => !retires.has(m.id));
  // relevés du plus ancien au plus récent (gabarit des mesures « état »)
  const releves: Releve[] = [...l].reverse().map((m) => ({ id: m.id, date: m.date, valeur: m.valeur, manuel: true, origine: null }));
  const vivant = useRef({ releves, l });
  vivant.current = { releves, l };
  // M7 : une mesure ajoutée depuis un jour passé prend ce jour-là (à l'heure qu'il est)
  const dateAjout = () => (j.aujourdhui ? Date.now() : j.jour + (Date.now() - minuit(Date.now())));
  // D10 : seulement pour une femme ou « Non précisé », jamais obligatoire
  const avecSoutien = tour === "poitrine" && charge != null && soutienPropose(charge.sexe);
  const proposee = valeurProposee(tour, l[0]?.valeur ?? null, charge?.sexe ?? null, charge?.taille ?? null).v;
  const plus = <ActionTete nom="plus" libelle={t("mesuresCorps.ajouterMesure")} onPress={() => setAjout(true)} />;

  const feuilles = (
    <>
      <FeuilleTour
        tour={tour}
        perso={perso}
        sexe={sexe}
        visible={ajout}
        sousTitre={`${jourPesee(dateAjout(), maintenant)}, ${heure(Date.now())}`}
        depart={proposee}
        derniere={l[0] ? { valeur: l[0].valeur, date: l[0].date } : null}
        onFermer={() => setAjout(false)}
        onEnregistrer={(v) => {
          setAjout(false);
          void ajouterMensuration(db, tour, v, dateAjout()).then(recharger).then(signalerSaisie).catch(signalerErreur());
        }}
      />
      <FeuilleTour
        tour={tour}
        perso={perso}
        sexe={sexe}
        visible={modif != null}
        sousTitre={modif ? t("mensurations.mesureDu", { date: jourSemaineMois(modif.date) }) : ""}
        depart={modif?.valeur ?? proposee}
        derniere={null}
        onFermer={() => setModif(null)}
        onEnregistrer={(v) => {
          const id = modif?.id;
          setModif(null);
          if (id) void modifierMensuration(db, id, v).then(recharger).then(signalerSaisie).catch(signalerErreur());
        }}
      />
      <Feuille visible={ouverte != null} onFermer={() => setOuverte(null)} titre={ouverte ? t("mensurations.mesureDu", { date: jourSemaineMois(ouverte.date) }) : undefined}>
        {ouverte ? (
          <>
            <Texte style={styles.chiffreFeuille}>
              {fixe(ouverte.valeur, 1)}
              <Texte variante="saisie" couleur="t2">
                {" cm"}
              </Texte>
            </Texte>
            <Texte variante="corps" couleur="t2" style={{ textAlign: "center", marginTop: 4, marginBottom: espace.l }}>
              {`${t("mesuresCorps.saisie")}, ${heure(ouverte.date)}`}
            </Texte>
            <GroupeFeuille>
              <Option premier icone="crayon" libelle={t("mensurations.modifier")} onPress={() => (setModif(ouverte), setOuverte(null))} />
              <Option danger icone="trash" libelle={t("mesuresCorps.supprimerMesure")} onPress={() => (setOuverte(null), supprimer(ouverte.id))} />
            </GroupeFeuille>
          </>
        ) : null}
      </Feuille>
      <FeuilleConsigne tour={tour} perso={perso} sexe={sexe} visible={consigne} onFermer={() => setConsigne(false)} />
      {avecSoutien ? (
        <FeuilleBonnet
          visible={bonnet}
          valeur={charge?.soutien ?? null}
          onFermer={() => setBonnet(false)}
          onEnregistrer={(x) => {
            setBonnet(false);
            void ecrireSoutien(db, x).then(recharger).catch(signalerErreur());
          }}
          onEffacer={() => {
            setBonnet(false);
            void effacerSoutien(db).then(recharger).catch(signalerErreur("supprimer"));
          }}
        />
      ) : null}
    </>
  );
  const avecBandeau = (contenu: ReactNode) => (
    <View style={{ flex: 1 }}>
      {contenu}
      {enAttente ? <BandeauAnnuler texte={t("mesuresCorps.mesureSupprimee")} bas={bas + espace.l} onAnnuler={annuler} /> : null}
    </View>
  );

  // Bloc propre : où poser le mètre (et, pour le tour de taille, le rapport à la taille)
  const ouPoser = (dernier: Mensuration | null) => (
    <>
      <TitreGroupe>{t("mensurations.ouPoser")}</TitreGroupe>
      <Groupe>
        <Lignes>
          {[
            <Pressable
              key="v"
              accessibilityRole="button"
              accessibilityLabel={`${t("mensurations.ouPoser")} : ${ou}`}
              onPress={() => setConsigne(true)}
              style={({ pressed }) => [styles.ouPoser, pressed && { backgroundColor: couleurs.s3 }]}
            >
              <View style={[styles.vignette, { backgroundColor: mode === "nuit" ? couleurs.s2 : couleurs.s3 }]}>
                <FigureEtape perso={perso} tour={tour} faits={[]} largeur={88} hauteur={88} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Texte variante="corps" style={{ fontSize: 15, marginBottom: 2 }}>
                  {ou}
                </Texte>
                <Texte variante="corps" couleur="t2" style={{ lineHeight: 18 }}>
                  {t("mensurations.astuce")}
                </Texte>
              </View>
              <Icone nom="right" couleur={couleurs.t3} taille={16} epaisseur={2} />
            </Pressable>,
            tour === "tour_taille" && dernier && charge?.taille ? (
              <LigneMesure
                key="r"
                titre={t("mensurations.rapport")}
                sous={t("mensurations.rapportSous", { tour: fixe(dernier.valeur, 1), taille: fixe(charge.taille, 0) })}
                valeur={fixe(dernier.valeur / charge.taille, 2)}
              />
            ) : null,
          ]}
        </Lignes>
      </Groupe>
      {avecSoutien ? (
        <>
          <TitreGroupe>{t("bonnet.section")}</TitreGroupe>
          <Groupe>
            <LigneMesure
              titre={t("bonnet.titre")}
              valeur={charge.soutien ? libelleSoutien(charge.soutien) : null}
              etat={charge.soutien ? null : t("bonnet.facultatif")}
              onPress={() => setBonnet(true)}
            />
          </Groupe>
          <Texte variante="meta" couleur="t2" style={{ marginTop: 8, marginHorizontal: 32 }}>
            {t("bonnet.note")}
          </Texte>
        </>
      ) : null}
    </>
  );

  if (!charge) return avecBandeau(<PageMesure titre={nom} actions={plus}>{feuilles}</PageMesure>);

  if (!l.length)
    return avecBandeau(
      <PageMesure titre={nom} actions={plus}>
        <PageVide icone="regle" titre={t("mensurations.videTitre")} texte={t("mensurations.videTexte")} action={t("mesuresCorps.ajouterMesure")} onAction={() => setAjout(true)} />
        {ouPoser(null)}
        {feuilles}
      </PageMesure>,
    );

  const a = tourAuJour(l, j.jour);
  const premiere = l[l.length - 1]!;
  const jours = joursReleves(releves);
  const ecarts: ReactNode[] = [];
  if (a?.precedente) ecarts.push(<Variation key="p" d={a.m.valeur - a.precedente.valeur} couleur="t2" suite={` cm${t("mensurations.depuisLe", { date: jourMois(a.precedente.date) })}`} />);
  if (a && premiere.id !== a.m.id && premiere.id !== a.precedente?.id)
    ecarts.push(<Variation key="d" d={a.m.valeur - premiere.valeur} couleur="t2" suite={` cm${t("mensurations.depuisLe", { date: jourMois(premiere.date) })}`} />);
  const ilYa = a ? Math.round((j.jour - minuit(a.m.date)) / JOUR_MS) : 0;
  const quand = !a
    ? null
    : a.duJour
      ? t("mesuresCorps.quandMesure", { heure: heure(a.m.date), source: t("mesuresCorps.saisie") })
      : j.aujourdhui && ilYa > 1
        ? tp("mensurations.derniereMesureIlYa", ilYa, { jour: jourSemaineMois(a.m.date) })
        : t("mensurations.derniereMesure", { jour: minus(jourPesee(a.m.date, maintenant)) });
  const agenda = (vue: "liste" | "mois") => {
    surAgenda.current = true;
    ouvrirAgendaEtat({
      titre: nom,
      maintenant,
      releves: () => vivant.current.releves,
      legende: t("mesuresCorps.legendeMesure"),
      vue,
      entree: (r) => ({
        date: r.date,
        texte: `${fixe(r.valeur, 1)} cm`,
        sous: t("mesuresCorps.sourceLigne", { source: t("mesuresCorps.saisie"), heure: heure(r.date) }),
        bon: true,
        onPress: () => setOuverte(vivant.current.l.find((m) => m.id === r.id) ?? null),
      }),
      onJour: (jj) => {
        j.choisir(jj);
        page.current?.scrollTo({ y: 0, animated: false });
      },
    });
  };

  return avecBandeau(
    <PageMesure
      titre={nom}
      defilement={(v) => void (page.current = v)}
      actions={
        <>
          <ActionTete nom="cal" libelle={t("mesures.agenda")} onPress={() => agenda("mois")} />
          {plus}
        </>
      }
    >
      <EnteteJour jour={j.jour} maintenant={maintenant} onJour={j.choisir} avecDonnee={(d) => jours.has(d)}>
        {quand ? <Quand texte={quand} /> : null}
        {a ? (
          <Heros
            valeur={fixe(a.m.valeur, 1)}
            unite="cm"
            libelle={`${nom} ${fixe(a.m.valeur, 1)} cm`}
            sous={ecarts.length ? <View style={styles.ecarts}>{ecarts.flatMap((x, i) => (i ? [<Texte key={`s${i}`} variante="corps" couleur="t2">{", "}</Texte>, x] : [x]))}</View> : undefined}
          />
        ) : (
          <Heros vide valeur={t("mesuresCorps.pasEncoreMesure")} />
        )}
      </EnteteJour>

      {ouPoser(a?.m ?? l[0]!)}

      <StatsEtat
        id={`tour-${tour}`}
        mode="mesures"
        typeDepart="trim"
        releves={releves}
        unite="cm"
        dec={1}
        maintenant={maintenant}
        libelleCourbe={(periode) => t("mensurations.courbe", { tour: nom, periode })}
        cles={[
          { libelle: t("mesuresCorps.cleMesure"), pastille: true },
          { libelle: t("mensurations.cleEvolution"), trait: "plein" },
        ]}
        nomReleves={t("mesuresCorps.mesures")}
        sourceDe={() => t("mesuresCorps.saisie")}
      />

      <TitreGroupe>{t("mesuresCorps.mesures")}</TitreGroupe>
      <Groupe>
        <Lignes>
          {[
            <LigneAjout key="+" libelle={t("mesuresCorps.ajouterMesure")} onPress={() => setAjout(true)} />,
            ...l.slice(0, DERNIERES).map((m, i) => {
              const avant = l[i + 1];
              return (
                <LigneMesure
                  key={m.id}
                  titre={jourSemaineMois(m.date)}
                  sous={t("mesuresCorps.sourceLigne", { source: t("mesuresCorps.saisie"), heure: heure(m.date) })}
                  valeur={fixe(m.valeur, 1)}
                  unite="cm"
                  sousValeur={avant ? <Variation d={m.valeur - avant.valeur} /> : undefined}
                  onPress={() => setOuverte(m)}
                />
              );
            }),
            <LigneMesure key="t" titre={t("mesuresCorps.toutesMesures")} etat={String(l.length)} onPress={() => agenda("liste")} />,
          ]}
        </Lignes>
      </Groupe>
      {feuilles}
    </PageMesure>,
  );
}

const styles = StyleSheet.create({
  ecarts: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 2 },
  ouPoser: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  vignette: { width: 88, height: 88, borderRadius: rayon.m, overflow: "hidden" },
  chiffreFeuille: { fontFamily: police.light, fontSize: 44, lineHeight: 52, textAlign: "center", fontVariant: ["tabular-nums"] },
});
