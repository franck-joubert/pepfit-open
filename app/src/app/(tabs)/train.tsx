import { useCallback, useEffect, useState, type RefObject } from "react";
import { StyleSheet, useWindowDimensions, View, type ScrollViewInstance } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "../../ui/focus-prechauffe";
import { SafeAreaView } from "react-native-safe-area-context";
import { PICTO_TYPE, type Sport } from "../../db";
import { useTheme } from "../../theme";
import { espace, menuOnglets } from "../../theme/typo";
import { ouvrirParcours } from "../../ecrans/parcours/demande-parcours";
import { ouvrirRecap } from "../../ecrans/recap/ouvrir-recap";
import { useApp, useCharge } from "../../ecrans/contexte";
import { lireSport, type DonneesSport } from "../../ecrans/sport-donnees";
import { MaJournee } from "../../ecrans/MaJournee";
import { JaugesActivite } from "../../ecrans/JaugesActivite";
import { useDefilementJauges } from "../../ecrans/useDefilementJauges";
import { jaugesDuJour } from "../../ecrans/memoire-jours";
import { prechargerSemaine } from "../../ecrans/stats-jour";
import { pictoSport } from "../../ecrans/lanceur-sports";
import { ListeJour, cleLigne, retourMois } from "../../ecrans/Planif";
import { BandeSemaine, LigneBande, TitreDate } from "../../ui/BandeSemaine";
import { HAUT_BANDE } from "../../ui/semainier";
import { Actualiser, sansEtirement } from "../../ui/Actualiser";
import { useZoneSemainier, ZoneSemainier } from "../../ui/ZoneSemainier";
import { BoutonsSeance } from "../../ecrans/BoutonsSeance";
import { useHautALArrivee } from "../../ui/haut-arrivee";
import { useOngletQuitte } from "../../ui/onglet-quitte";
import { useOngletRetouche } from "../../ui/onglet-retouche";
import { GlisserJour, PagesJours, usePositionJour } from "../../ui/GlisserJour";
import { jourDe, marque, type LigneJour } from "../../ecrans/planif-donnees";
import { RevenirAujourdhui } from "../../ecrans/RevenirAujourdhui";
import { useSautJour } from "../../ui/saut-jour";
import Reanimated, { useSharedValue } from "react-native-reanimated";
import { ajouterJ, fenetreSemaine, lundiDe } from "../../ecrans/planification";
import { usePlanif } from "../../ecrans/usePlanif";
import { useActionsEffort } from "../../ecrans/ActionsEffort";
import { rafraichirRappels } from "../../natif/rappels";
import { t } from "../../i18n/index";
import { BoutonIcone, TeteOnglet } from "../../ui/Cadre";
import { BoutonReglagesPartie } from "../../ecrans/reglages/Parties";
import { useBulle } from "../../ui/CoucheBulle";
import { useReduit } from "../../ui/reduit";
import { useDesaturationAura } from "../../ui/aura-etat";
import { DESATURATION_PASSE } from "../../ui/aura-calc";
import { BasFlottant } from "../../ui/MenuFlottant";

// Entraînements (planche page Entraînements, A · Grille v2 validée le 27/10 ; retour du 28/10) : la semaine, la date
// du jour affiché sur la ligne de la série, les séances du jour (planification v7). Aujourd'hui, dans la page,
// au-dessus des Capteurs (ecrans/BoutonsSeance, 09/11 : fixés en bas, ils recouvraient le Corps) : « Programmes » et
// « Routines » puis « Ajouter une activité » (plein), qui ouvre le parcours de séance unifié (feuille du sport, planche ajout-seance-v2, ecrans/parcours) ; un jour à venir, rien en bas : son cadre pointillé « Ajouter une séance » ; un jour
// passé « Revenir à aujourd'hui » (tonal). Toucher une séance pas faite ouvre son récap (ecrans/recap).


/** Fenêtre du planning : celle du jour affiché, étendue à la semaine que montre le semainier défilé. */
function fenetreUnie(lundi: string, vue: string | null): { de: string; a: string } {
  const a = fenetreSemaine(lundi);
  if (!vue) return a;
  const b = fenetreSemaine(vue);
  return { de: a.de < b.de ? a.de : b.de, a: a.a > b.a ? a.a : b.a };
}
const rien = () => {};

export default function Entrainement() {
  const { db } = useApp();
  const { couleurs } = useTheme();
  const [d] = useCharge<DonneesSport>(async () => {
    rafraichirRappels(db).catch(console.error);
    return lireSport(db);
  }, [db], undefined, "sport");
  // Planification (planche v7) : jour choisi dans la bande semaine ; au retour de la page du mois, le jour qu'on y a touché.
  const [sel, setSel] = useState(() => jourDe(Date.now()));
  useFocusEffect(
    useCallback(() => {
      const j = retourMois.jour;
      retourMois.jour = null;
      if (j) setSel(j);
    }, []),
  );
  const lundi = lundiDe(sel);
  const position = usePositionJour(sel);
  const saut = useSautJour({ jour: sel, position, onJour: setSel });
  const zone = useZoneSemainier();
  const haut = useSharedValue(0); // le même défilement pour le tirage (ui/Actualiser)
  // Semainier défilé librement (29/10) : ses marques se lisent aussi sur les semaines qu'on vient voir.
  const [vue, setVue] = useState<string | null>(null);
  const plan = usePlanif(fenetreUnie(lundi, vue));
  // Page Effort : le « … » du Sommeil et des récupérations, leurs feuilles (Horaires, Partager).
  const { effort, feuilles: feuillesEffort } = useActionsEffort();
  const p = plan.p;
  const auj = p?.aujourdhui ?? jourDe(Date.now());
  // Jauges : les autres jours passés de la semaine affichée sont lus d'avance, l'un après l'autre, 1,5 s après l'arrivée sur
  // un jour (docs/JAUGES-PASSE.md) : toucher un jour du semainier montre ses jauges tout de suite.
  useEffect(() => {
    const id = setTimeout(() => void prechargerSemaine(db, lundi, sel, auj).catch(() => {}), 1500);
    return () => clearTimeout(id);
  }, [db, lundi, sel, auj]);
  // La bulle de séance est une couche partagée (ui/CoucheBulle) : le contenu défile dessous, on lui réserve sa place.
  const bulle = useBulle();
  // Bas fixe (menu, bulle, « Revenir à aujourd'hui ») : la fin de liste et les bulles « Annuler » se posent au-dessus.
  const [hauteurBas, setHauteurBas] = useState(0);
  const quand = sel === auj ? "aujourdhui" : sel > auj ? "futur" : "passe";
  // Jour passé : l'aura de Sport se désature un peu, en fondu (31/10) ; le futur garde la teinte d'aujourd'hui.
  const reduit = useReduit();
  // Jauges (09/11) : grandes en haut de page, elles se métamorphosent au défilement en petites jauges fixées sous le
  // semainier ; pas pour un jour à venir (ni elles, ni leur place). Tout sur le fil UI (ecrans/useDefilementJauges).
  const large = useWindowDimensions().width >= 600;
  const jaugesActives = !!p && jaugesDuJour(sel, p.aujourdhui);
  const jauges = useDefilementJauges({ reduit, large, jaugesActives, compact: zone.compact, haut });
  useDesaturationAura("entrainement", quand === "passe" ? DESATURATION_PASSE : 0, !reduit);
  // Picto d'une ligne de séance (B5) : routine → premier exercice (muscu, cross) ou picto de son type ; séance sans routine →
  // le sport dont elle porte le nom (« Course à pied », « Padel »).
  const pictoDe = (l: LigneJour): string | null => {
    const id = l.genre === "faite" ? l.seance.routineId : l.occ.routineId;
    const r = id ? d?.pictos.routines.get(id) : undefined;
    if (r) return (r.type === "muscu" || r.type === "cross" ? r.slug : null) ?? PICTO_TYPE[r.type] ?? r.slug;
    // Séance prévue d'un sport seul : le picto de son sport (réglages de la séance).
    if (l.genre === "prevue") {
      const sp = l.sport ? d?.catalogue.find((x) => x.id === l.sport) : undefined;
      return sp ? pictoSport(sp.slug) : null;
    }
    const s = d?.catalogue.find((x) => x.nom === l.seance.titre);
    return s ? pictoSport(s.slug) : (d?.pictos.seances.get(l.seance.id) ?? null);
  };

  // Liens pepfitopen://train?... : tous mènent au parcours de séance (planche ajout-seance-v2). ?lanceur=1, ?modifier=1 et ?ajout=1 :
  // la feuille du sport ; ?sport=cat:padel : le récap de ce sport ; ?modifier=0 : la page, sans feuille.
  const lien = useLocalSearchParams<{ sport?: string; modifier?: string; ajout?: string; fc?: string; lanceur?: string; applis?: string; ble?: string }>();
  // Recette : ?fc=128 simule une ceinture en direct (capteurs, à l'écran seulement).
  const demoFc = lien.fc && Number(lien.fc) > 0 ? Number(lien.fc) : null;
  // Recette : ?applis=Whoop,Withings et ?ble=Polar H10 (ou aucun, cherche) imposent Santé Connect et la ligne Bluetooth, à l'écran seulement.
  const demoCapteurs = lien.applis != null || lien.ble ? { applis: lien.applis != null ? lien.applis.split(",").filter(Boolean) : undefined, ble: lien.ble } : null;
  useEffect(() => {
    if (!lien.lanceur && !lien.sport && !lien.modifier && !lien.ajout) return;
    router.setParams({ lanceur: undefined, sport: undefined, modifier: undefined, ajout: undefined });
    if (lien.modifier === "0") return;
    if (lien.sport) ouvrirRecap({ sport: lien.sport });
    else ouvrirParcours({ genre: "sport", jour: jourDe(Date.now()), mode: "demarrer" });
  }, [lien.lanceur, lien.sport, lien.modifier, lien.ajout]);

  // Arrivée par le menu : en haut, d'un coup ; onglet re-touché : remonte en haut en défilant.
  useHautALArrivee("/train", jauges.ref as unknown as RefObject<ScrollViewInstance>);
  // Onglet re-touché (29/10 au soir, remplace la règle qui gardait le jour) : le jour affiché revient à aujourd'hui, du
  // même glissé que « Revenir à aujourd'hui » (dans le bon sens), et le semainier sur sa semaine, même défilé sans changer de jour.
  const [recadre, setRecadre] = useState(0);
  useOngletRetouche("/train", () => {
    saut.sauter(auj);
    setRecadre((n) => n + 1);
  });

  // Quitté pour un autre onglet : retour à aujourd'hui (pas après la page du mois ou une séance).
  useOngletQuitte("/train", () => setSel(jourDe(Date.now())));

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
      {/* L'en-tête, le semainier et la page descendent ensemble (ui/Actualiser). Soulever une séance (glisser-déposer) suspend le tirage. */}
      <Actualiser defilement={haut} actif={!plan.souleve}>
      <TeteOnglet titre={t("accueil.entrainement.titre")}>
        <BoutonIcone nom="cal" libelle={t("planif.ouvrirMois")} onPress={() => router.push({ pathname: "/calendrier", params: { jour: sel } })} />
        <BoutonReglagesPartie partie="sport" />
      </TeteOnglet>
        <View {...plan.zoneProps} style={{ flex: 1 }}>
          {/* Semainier collé au défilement (29/10) : la bande reste en haut et se resserre en descendant (ui/ZoneSemainier). */}
          <ZoneSemainier
            zone={zone}
            // Rangée fixée sous le semainier : les grandes jauges, métamorphosées en petites (le bord coupé la suit).
            fixee={jaugesActives ? <JaugesActivite date={sel} p={jauges.p} visible={jauges.fixeVisible} actif={jauges.docke} /> : null}
            progression={jauges.p}
            bande={
              p ? (
                <BandeSemaine
                  // Pendant « Revenir à aujourd'hui », la bande se recadre dès le départ du glissé (même durée, même courbe).
                  lundi={lundiDe(saut.cible ?? sel)}
                  recadre={recadre}
                  sel={sel}
                  aujourdhui={p.aujourdhui}
                  couleur={couleurs.partieEntrainement}
                  // Séance faite : le vert « validé » (teintes-parties, le 29/10)
                  couleurFaite={couleurs.valide}
                  marque={(j) => marque(p, j)}
                  onSel={setSel}
                  // Hors d'aujourd'hui, « Revenir à aujourd'hui » est en bas : pas de second ↺ en haut.
                  vise={plan.vise}
                  mesure={plan.mesurerCase}
                  position={position}
                  onVue={(j) => setVue(lundiDe(j))}
                  compact={zone.compact}
                />
              ) : null
            }
          >
          {/* Glissé entre les jours (retours du 28/10) : la bande reste fixe, la page du jour voisin suit le doigt. */}
          <GlisserJour jour={sel} position={position} onJour={(sens) => setSel(ajouterJ(sel, sens))}>
            <Reanimated.ScrollView
              {...sansEtirement}
              ref={jauges.ref}
              onScroll={jauges.defilement}
              onLayout={(e) => jauges.setHautVisible(e.nativeEvent.layout.height)}
              scrollEventThrottle={16}
              // Page courte : de quoi faire toute la course des jauges, même un jour sans séance.
              contentContainerStyle={{ paddingTop: HAUT_BANDE, paddingBottom: hauteurBas + espace.l, minHeight: jauges.hauteurMin }}
            >
              {p ? (
                <>
                  <View onLayout={(e) => jauges.mesurerHautPages(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
                    <LigneBande titre={<TitreDate j={sel} aujourdhui={p.aujourdhui} />} serie={d?.serie ?? 0} couleur={couleurs.partieEntrainement} />
                  </View>
                  <Reanimated.View style={saut.style}>
                  <PagesJours
                    jour={sel}
                    position={position}
                    saut={saut.saut}
                    decalage={saut.decalage}
                    rendu={(j, vif) => {
                      const futur = j > p.aujourdhui;
                      return (
                        <View style={styles.jour}>
                          {/* Grandes jauges (planche activite-jauges) : sous la date, avant les séances, et leur place dans la page ; la copie
                              de la page défile et glisse avec les jours, celle de la zone prend le relais quand elles se métamorphosent. */}
                          {!jaugesDuJour(j, p.aujourdhui) ? null : <JaugesActivite date={j} p={jauges.repos} visible={jauges.pageVisible} actif={vif && !jauges.docke} />}
                          <ListeJour
                            p={p}
                            j={j}
                            onMenu={vif ? plan.actions.menu : rien}
                            onBalayer={vif ? plan.actions.balayer : rien}
                            onProgrammer={() => vif && ouvrirParcours({ genre: "sport", jour: j, mode: "ajouter" })}
                            onAppuiLong={vif ? plan.soulever : undefined}
                            onFinAppui={vif ? plan.finAppui : undefined}
                            cachee={vif && plan.souleve ? cleLigne(plan.souleve.l) : null}
                            // Un jour à venir (D8, 29/10) : le cadre pointillé « Programmer une séance », comme aujourd'hui,
                            // même sous des séances déjà prévues ; pas de bouton plein seul en bas d'une page vide.
                            cadreToujours={futur}
                            // Aujourd'hui et à venir, sans séance : « Rien de prévu » puis « Ajouter une séance » (31/10).
                            rienDePrevu={j >= p.aujourdhui}
                            pictoDe={pictoDe}
                            agendaDe={vif ? plan.agendaDe : undefined}
                            effort={effort}
                          />
                          {/* Les boutons d'aujourd'hui (09/11) : dans la page, au-dessus des Capteurs, ils défilent avec elle. */}
                          {j === p.aujourdhui ? <BoutonsSeance jour={p.aujourdhui} cibleProgrammes={d?.cibleProgrammes} enCours={!!bulle.enCours} /> : null}
                          {/* Capteurs (planche entrainements-capteurs, variante A ; point vert, sport-stats v2) : aujourd'hui seulement
                              (31/10). Un autre jour choisi : la rangée fond et sa place se referme ; elle revient de même. */}
                          {j === p.aujourdhui ? <MaJournee date={j} aujourdhui visible={vif} demoFc={demoFc} demoCapteurs={demoCapteurs} /> : null}
                        </View>
                      );
                    }}
                  />
                  </Reanimated.View>
                </>
              ) : null}
            </Reanimated.ScrollView>
          </GlisserJour>
          </ZoneSemainier>
          {plan.flottant}
        </View>
      </Actualiser>
      {/* La bulle « Annuler » reste au-dessus du menu : hors du tirage, elle ne descend pas avec la page. */}
      {!plan.regles ? plan.bulle(hauteurBas + espace.s) : null}
      <BasFlottant onHauteur={setHauteurBas}>
        {/* Au-dessus de la bulle de séance, qui flotte elle-même au-dessus du menu. */}
        {/* Au moins 8 entre le pied et la bulle (n° 8). */}
        <View style={[styles.bas, { paddingBottom: bulle.enCours ? bulle.hauteur + espace.s : 0 }]}>
          {quand === "aujourdhui" ? null : (
            // Jour passé ou à venir : « Revenir à aujourd'hui », un seul glissé vers aujourd'hui (29/10).
            <RevenirAujourdhui visible onPress={() => saut.sauter(auj)} />
          )}
        </View>
      </BasFlottant>


      {plan.feuilles}
      {feuillesEffort}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Cartes et blocs à 16 des bords, alignés sur le titre (décision du 28/10, après la planche qui disait 8).
  jour: { marginHorizontal: espace.l },
  bas: { paddingHorizontal: espace.l, gap: espace.s },
});
