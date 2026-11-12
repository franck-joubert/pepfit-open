import { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import * as Location from "../natif/position";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { adopterSalleOSM, ecrireCacheAutour, lireCacheAutour, listerSalles, type SalleResume } from "../db";
import { cleSports, depuisCache, distanceKm, ErreurLieux, rechercheValide, sansMesSalles, sportsOSM, type CauseLieux, type Position, type SalleOSM } from "../salles/osm";
import { chercherSalles, DELAI_AUTOUR_MS, sallesAutour } from "../salles/reseau";
import { useTheme } from "../theme";
import { espace, police, POLICE_MAX, rayon, typo } from "../theme/typo";
import { BarreHaut } from "../ui/Cadre";
import { BoutonPrincipal } from "../ui/Degrade";
import { FenetrePleine } from "../ui/FenetrePleine";
import { Icone } from "../ui/Icone";
import { Texte } from "../ui/Texte";
import { useCouleurPartie } from "../ui/ContextePartie";
import { signalerErreur } from "../ui/FeuilleMessage";
import { useApp } from "./contexte";
import { lienCarte } from "./lien-maps";
import { FeuilleNouveauLieu, pictoLieu } from "./Lieux";
import { LigneDeLieu } from "./LigneDeLieu";
import { sousLieu } from "../salles/sous-titre-lieu";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";

// Lieu de la séance (D) en plein écran : recherche par nom (Photon), « Ne pas définir le lieu », Mes lieux (picto du type),
// « Ajouter un lieu » (feuille « Nouveau lieu »), puis « Autour de moi » (salles d'Overpass, gardé 7 jours). Une salle d'OSM
// s'ouvre en fiche avant d'être choisie. `aide` : texte du banc d'essai, à la place du sous-titre. Chaque ligne est une LigneDeLieu : avatar
// du lieu (picto du type), sous-titre selon la règle unique de salles/sous-titre-lieu.ts (adresse courte, distance devant dans « Autour de moi »). `sport` (30/10, au padel) :
// « Autour de moi » montre d'abord les lieux de ce sport (terrains, centres, piscines), puis les salles de sport ; chaque étape
// a son délai (position 6 s, cartes 8 s) : jamais d'attente sans fin, une erreur avec « Réessayer ».

type Autour = { etat: "attente" } | { etat: "refus"; redemander: boolean } | { etat: "erreur"; cause: CauseLieux } | { etat: "ok"; salles: SalleOSM[] };

const causeDe = (e: unknown): CauseLieux => (e instanceof ErreurLieux ? e.cause : "serveurs");
/** Position du téléphone : 6 s au plus (localisation coupée, l'émulateur sans position : la demande ne revient jamais). */
const DELAI_POSITION_MS = 6000;

const ATTENTE_RECHERCHE_MS = 350;

/** `promesse`, ou l'erreur `cause` après `ms` : rien dans « Autour de moi » n'attend sans fin. */
function avant<T>(promesse: Promise<T>, ms: number, cause: CauseLieux): Promise<T> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<never>((_, non) => {
    minuteur = setTimeout(() => non(new ErreurLieux(cause, `timeout ${ms} ms`)), ms);
  });
  return Promise.race([promesse, delai]).finally(() => clearTimeout(minuteur));
}

async function localiser(demander: boolean): Promise<Position | { refus: true; redemander: boolean }> {
  // la boîte d'autorisation attend Alex : pas de délai ici
  let p = await Location.getForegroundPermissionsAsync();
  if (!p.granted && demander && p.canAskAgain) p = await Location.requestForegroundPermissionsAsync();
  if (!p.granted) return { refus: true, redemander: p.canAskAgain };
  try {
    const l = await avant(
      (async () =>
        (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })))(),
      DELAI_POSITION_MS,
      "position",
    );
    return { lat: l.coords.latitude, lon: l.coords.longitude };
  } catch (e) {
    throw e instanceof ErreurLieux ? e : new ErreurLieux("position", String(e));
  }
}

export function FeuilleSalle({ visible, onFermer, salleId, onChoisir, aide, surPlace = false, sport = null }: {
  visible: boolean;
  /** Sport de la séance (`cat:padel`, nom affiché) : ses lieux en tête de « Autour de moi » ; absent : salles de sport. */
  sport?: { id: string; nom: string } | null;
  /** Ouverte sur place (séance en cours, fin de séance, départ) : un lieu créé ici garde la position du téléphone (29/10). */
  surPlace?: boolean;
  onFermer: () => void;
  salleId: string | null;
  onChoisir: (id: string | null) => void;
  aide?: (salle: SalleResume) => string | undefined;
}) {
  const { db } = useApp();
  useLangue();
  const { couleurs } = useTheme();
  // curseur de la partie de l'écran qui ouvre la feuille (orange dans le Sport), jamais l'orange ailleurs
  const accent = useCouleurPartie();
  const insets = useSafeAreaInsets();
  const [salles, setSalles] = useState<SalleResume[]>([]);
  const [position, setPosition] = useState<Position | null>(null);
  const [autour, setAutour] = useState<Autour>({ etat: "attente" });
  const [q, setQ] = useState("");
  const [trouvees, setTrouvees] = useState<SalleOSM[] | "erreur" | null>(null);
  const [fiche, setFiche] = useState<SalleOSM | null>(null);
  const [perso, setPerso] = useState<string | null>(null);
  const tour = useRef(0);
  // essai en cours d'« Autour de moi » : la réponse d'un essai plus ancien (Réessayer, réouverture) est ignorée
  const essai = useRef(0);
  const sports = sportsOSM(sport?.id);
  const sansNom = sport ? t("salles.lieuSansNom", { sport: sport.nom }) : undefined;

  const chargerAutour = async (demander: boolean) => {
    const n = ++essai.current;
    const poser = (a: Autour) => n === essai.current && setAutour(a);
    setAutour({ etat: "attente" });
    try {
      const p = await localiser(demander);
      if ("refus" in p) return poser({ etat: "refus", redemander: p.redemander });
      if (n === essai.current) setPosition(p);
      const garde = await lireCacheAutour(db).catch(() => null);
      const cache = depuisCache(garde, p, Date.now(), false, sports);
      if (cache) return poser({ etat: "ok", salles: cache });
      try {
        // sallesAutour a ses propres délais ; celui-ci garde l'écran même si le réseau ne rend jamais la main
        const l = await avant(sallesAutour(p, { sports, sansNom }), DELAI_AUTOUR_MS + 1000, "serveurs");
        // une liste vide ne se garde pas : la prochaine ouverture redemande
        if (l.length) await ecrireCacheAutour(db, { le: Date.now(), position: p, salles: l, sports: cleSports(sports) }).catch(console.warn);
        poser({ etat: "ok", salles: l });
      } catch (e) {
        // aucun serveur : les lieux déjà vus ici, même anciens, plutôt qu'une erreur
        const ancien = depuisCache(garde, p, Date.now(), true, sports);
        if (ancien) return poser({ etat: "ok", salles: ancien });
        throw e;
      }
    } catch (e) {
      console.warn("salles autour", e);
      poser({ etat: "erreur", cause: causeDe(e) });
    }
  };

  useEffect(() => {
    if (!visible) return;
    setQ("");
    setFiche(null);
    setTrouvees(null);
    listerSalles(db).then(setSalles).catch(console.error);
    void chargerAutour(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, visible, sport?.id]);

  // Recherche : 350 ms après la dernière frappe ; une réponse en retard ne remplace pas la plus récente.
  useEffect(() => {
    if (!rechercheValide(q)) return setTrouvees(null);
    const n = ++tour.current;
    const minuteur = setTimeout(() => {
      chercherSalles(q, position)
        .then((l) => n === tour.current && setTrouvees(l))
        .catch(() => n === tour.current && setTrouvees("erreur"));
    }, ATTENTE_RECHERCHE_MS);
    return () => clearTimeout(minuteur);
  }, [q, position]);

  const choisirOSM = async (s: SalleOSM) => onChoisir(await adopterSalleOSM(db, s, sport?.id));
  const sources = salles.map((s) => s.sourceId);
  const recherche = rechercheValide(q);
  const qMin = q.trim().toLowerCase();
  const miennes = recherche ? salles.filter((s) => s.nom.toLowerCase().includes(qMin)) : salles;
  // Recherche par nom : les lieux déjà trouvés autour qui correspondent (là tout de suite, même sans réseau), puis Photon.
  const autourNommes = recherche && autour.etat === "ok" ? autour.salles.filter((s) => s.nom.toLowerCase().includes(qMin)) : [];
  const vusParNom = new Set(autourNommes.map((s) => s.sourceId));
  const parNom = sansMesSalles([...autourNommes, ...(Array.isArray(trouvees) ? trouvees.filter((s) => !vusParNom.has(s.sourceId)) : [])], sources);

  // Règle unique du sous-titre (salles/sous-titre-lieu.ts) : l'adresse courte, le sport en secours. `aide` (banc d'essai) la remplace.
  const sousMienne = (s: SalleResume) => aide?.(s) ?? sousLieu({ adresse: s.adresse, secours: s.activites.map((x) => x.nom).join(", ") }) ?? undefined;
  const ligneMienne = (s: SalleResume) => (
    <LigneDeLieu
      key={s.id}
      icone={pictoLieu(s.type)}
      avatar
      nom={s.nom}
      q={recherche ? q : ""}
      sous={sousMienne(s)}
      fin={s.id === salleId ? "check" : undefined}
      onPress={() => onChoisir(s.id)}
    />
  );
  const ligneOSM = (s: SalleOSM) => (
    <LigneDeLieu
      key={s.sourceId}
      icone={pictoLieu(s.type)}
      avatar
      nom={s.nom}
      q={recherche ? q : ""}
      distance={s.distanceM != null ? distanceKm(s.distanceM) : undefined}
      sous={sousLieu({ adresse: s.adresseComplete ?? s.adresse, secours: s.duSport ? sport?.nom : null })}
      fin="right"
      onPress={() => setFiche(s)}
    />
  );

  return (
    <FenetrePleine visible={visible} onRetour={() => (fiche ? setFiche(null) : onFermer())}>
      <View style={{ flex: 1, backgroundColor: couleurs.bg, paddingTop: insets.top }}>
        {fiche ? (
          <FicheSalle salle={fiche} bas={insets.bottom} onRetour={() => setFiche(null)} onChoisir={() => choisirOSM(fiche).catch(signalerErreur())} />
        ) : (
          <>
            <BarreHaut titre={t("salles.salleSeance")} onRetour={onFermer} />
            <View style={[styles.recherche, { backgroundColor: couleurs.s1 }]}>
              <Icone nom="search" couleur={couleurs.t3} />
              <TextInput
                maxFontSizeMultiplier={POLICE_MAX}
                value={q}
                onChangeText={setQ}
                placeholder={t("salles.rechercherSalle")}
                placeholderTextColor={couleurs.t3}
                cursorColor={accent}
                returnKeyType="search"
                accessibilityLabel={t("salles.rechercherSalle")}
                style={[typo.saisie, { flex: 1, fontFamily: police.regular, color: couleurs.t1, padding: 0 }]}
              />
              {q ? (
                <Pressable accessibilityRole="button" accessibilityLabel={t("ui.effacer")} onPress={() => setQ("")} style={styles.effacer}>
                  <Icone nom="close" couleur={couleurs.t2} />
                </Pressable>
              ) : null}
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + espace.xxl }}>
              {recherche ? (
                <>
                  {miennes.length ? <Entete titre={t("salles.mesSalles")} /> : null}
                  {miennes.map(ligneMienne)}
                  <Entete titre={t("salles.titre")} />
                  {parNom.map(ligneOSM)}
                  {trouvees === "erreur" ? <LigneDeLieu icone="search" nom={t("salles.rechercheIndispo")} sous={t("salles.verifierConnexion")} /> : null}
                  <View style={{ height: espace.s }} />
                  <LigneDeLieu icone="plus" nom={t("salles.ajouterPersoNom", { nom: q.trim() })} onPress={() => setPerso(q.trim())} />
                </>
              ) : (
                <>
                  <View style={{ height: espace.s }} />
                  <LigneDeLieu icone="close" nom={t("salles.nePasDefinir")} fin={salleId ? undefined : "check"} onPress={() => onChoisir(null)} />
                  <Entete titre={t("salles.mesSalles")} haut={espace.l} />
                  {salles.map(ligneMienne)}
                  <LigneDeLieu icone="plus" nom={t("salles.ajouterPerso")} onPress={() => setPerso("")} />
                  <Entete titre={t("salles.autourDeMoi")} />
                  {autour.etat === "refus" ? (
                    <LigneDeLieu
                      icone="placeoff"
                      nom={t("salles.localisationRefusee")}
                      action={{
                        libelle: t("salles.autoriser"),
                        onPress: () => (autour.redemander ? void chargerAutour(true) : Linking.openSettings().catch(console.error)),
                      }}
                    />
                  ) : autour.etat === "erreur" ? (
                    <LigneDeLieu
                      icone="placeoff"
                      nom={t("salles.autourIndispo")}
                      sous={t(SOUS_ERREUR[autour.cause])}
                      action={{
                        libelle: t("salles.reessayer"),
                        onPress: () => void chargerAutour(true),
                      }}
                    />
                  ) : autour.etat === "ok" ? (
                    autour.salles.length ? (
                      sansMesSalles(autour.salles, sources).map(ligneOSM)
                    ) : (
                      <LigneDeLieu icone="place" nom={t("salles.autourAucune")} sous={t("salles.autourAucuneSous")} />
                    )
                  ) : (
                    <LigneDeLieu icone="place" nom={t("salles.autourRecherche")} />
                  )}
                </>
              )}
            </ScrollView>
          </>
        )}
      </View>
      <FeuilleNouveauLieu
        nom={perso}
        position={surPlace ? position : null}
        onFermer={() => setPerso(null)}
        onCree={(id) => {
          setPerso(null);
          onChoisir(id);
        }}
      />
    </FenetrePleine>
  );
}

function Entete({ titre, haut = espace.xxl }: { titre: string; haut?: number }) {
  return (
    <Texte variante="entete" couleur="t3" accessibilityRole="header" style={{ paddingHorizontal: espace.l, paddingTop: haut, paddingBottom: 6 }}>
      {titre}
    </Texte>
  );
}

const SOUS_ERREUR = { reseau: "salles.autourReseau", serveurs: "salles.autourServeurs", position: "salles.autourPosition" } as const;

/** Fiche d'une salle d'OSM (D5) : nom, distance, adresse. Les machines partagées viendront avec le serveur. */
function FicheSalle({ salle, bas, onRetour, onChoisir }: { salle: SalleOSM; bas: number; onRetour: () => void; onChoisir: () => void }) {
  const { couleurs } = useTheme();
  const plan = lienCarte({ lat: salle.lat, lon: salle.lon, nom: salle.nom, adresse: salle.adresseComplete }, Platform.OS);
  return (
    <View style={{ flex: 1 }}>
      <BarreHaut titre={t("salles.salle")} onRetour={onRetour} />
      <View style={{ flex: 1, paddingHorizontal: espace.l, paddingTop: espace.s }}>
        <Texte variante="titreFort" accessibilityRole="header">
          {salle.nom}
        </Texte>
        {/* Pas encore de vignette de carte : distance et adresse ouvrent la salle dans une appli de cartes (30/10, lien-maps). */}
        <Pressable
          disabled={!plan}
          onPress={plan ? () => Linking.openURL(plan).catch(console.error) : undefined}
          accessibilityRole={plan ? "link" : "text"}
          accessibilityLabel={plan ? [salle.distanceM != null ? distanceKm(salle.distanceM) : null, salle.adresseComplete, t("ui.ouvrirMaps")].filter(Boolean).join(", ") : undefined}
          hitSlop={{ top: espace.s, bottom: espace.m }}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          {salle.distanceM != null ? (
            <Texte variante="corps" couleur="t2" style={{ marginTop: espace.s }}>
              {distanceKm(salle.distanceM)}
            </Texte>
          ) : null}
          {salle.adresseComplete ? (
            <Texte variante="corps" couleur="t3" style={{ marginTop: 2 }}>
              {salle.adresseComplete}
            </Texte>
          ) : null}
        </Pressable>
      </View>
      <View style={[styles.dock, { borderTopColor: couleurs.line, paddingBottom: Math.max(bas, espace.s) + espace.l }]}>
        <BoutonPrincipal libelle={t("salles.choisirCette")} onPress={onChoisir} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  recherche: { marginHorizontal: espace.l, marginTop: espace.xs, height: 48, borderRadius: rayon.l, flexDirection: "row", alignItems: "center", gap: espace.m, paddingLeft: 14, paddingRight: 2 },
  effacer: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  dock: { paddingHorizontal: espace.l, paddingTop: espace.m, borderTopWidth: StyleSheet.hairlineWidth },
});
