import { useEffect } from "react";
import { toucherAilleurs } from "../ui/GlisserSupprimer";
import { BackHandler, Platform, View } from "react-native";
import { router, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { NavigationBar } from "expo-navigation-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FournisseurTheme, useTheme } from "../theme";
import { FournisseurApp, useApp } from "../ecrans/contexte";
import { FournisseurMenu } from "../ui/MenuFlottant";
import { FournisseurBulle } from "../ui/CoucheBulle";
import { FeuilleSeanceEnCours } from "../ecrans/demarrer-seance";
import { Parcours } from "../ecrans/parcours/Parcours";
import { CarteFinProgramme } from "../ecrans/CarteFinProgramme";
import { FournisseurPartie } from "../ui/ContextePartie";
import { CadreContenu } from "../ui/CadreContenu";
import { FournisseurVolet } from "../ui/Volet";
import { reveillerAura } from "../ui/aura-etat";
import { seanceEnCours } from "../db";
import { FeuilleNotifications } from "../ui/FeuilleNotifications";
import { NotificationsAppli } from "../ui/NotificationsAppli";
import { suivi } from "../natif/suivi";
import { GuideFond } from "../ecrans/GuideFond";
import { reconcilierFcMuscu } from "../ecrans/fc-muscu";
import { lireMorphologie } from "../ecrans/morphologie";
import { prechargerCorpsSante } from "../ui/3d/CorpsSante";
import { BandeauPrecision } from "../ecrans/precision/BandeauPrecision";
import { RecalculEffort } from "../ecrans/RecalculEffort";
import { RepriseRecup } from "../ecrans/recuperer-vues/Reprise";
import { enFond } from "../ecrans/fond";
import { GardeVerrou } from "../verrou/Verrou";

/**
 * Une séance non terminée survit à la fermeture : on la rouvre au lancement. Un suivi GPS en cours (ou en pause) aussi ; la
 * FC d'une séance de muscu (lot 5) n'est pas un suivi à rouvrir : celle d'une séance déjà finie est close.
 */
function RepriseSeance() {
  const { db } = useApp();
  useEffect(() => {
    // Lectures au lancement : un échec n'est pas un geste raté, il va au journal (pas de feuille d'erreur).
    seanceEnCours(db)
      .then((s) => {
        if (s) router.push({ pathname: "/session", params: { reprise: "1" } });
      })
      .catch((e) => console.error(e));
    reconcilierFcMuscu(db)
      .catch((e) => console.error(e))
      .then(() => suivi.etat())
      .then((e) => {
        if (e && e.statut !== "arrete" && e.mode !== "muscu") router.push("/suivi/direct");
      })
      .catch((e) => console.error(e));
  }, [db]);
  return null;
}

/**
 * iPhone : pas de bouton retour, seulement le glissé depuis le bord, qui n'existe que s'il y a un écran dessous. Un écran
 * ouvert par un lien ou une notification reçoit donc les onglets dessous (expo-router les pose seulement à l'ouverture par
 * un lien) : le glissé ramène à l'Accueil, comme RetourSysteme sur Android. Android garde son comportement.
 */
export const unstable_settings = Platform.OS === "ios" ? { initialRouteName: "(tabs)" } : {};

/**
 * Retour du système (geste ou bouton Android) sur un écran ouvert sans écran d'avant (lien, notification, appli rouverte sur
 * place) : il quittait l'appli (03/11, page Compte). On va alors à l'Accueil, comme la flèche des en-têtes
 * (ui/revenir.ts). Les quatre onglets restent des racines : le retour y quitte l'appli, comme d'habitude.
 */
const RACINES = new Set(["/", "/food", "/train", "/health"]);
function RetourSysteme() {
  const chemin = usePathname();
  useEffect(() => {
    const h = BackHandler.addEventListener("hardwareBackPress", () => {
      if (RACINES.has(chemin) || router.canGoBack()) return false;
      router.replace("/");
      return true;
    });
    return () => h.remove();
  }, [chemin]);
  return null;
}

/**
 * Le personnage de Santé préparé d'avance, l'appli posée (30/10 : « l'arrivée sur la page santé peut lagger au
 * premier chargement ») : décodé et mis en pose pendant qu'on regarde l'Accueil, il n'est plus à faire en arrivant sur Santé.
 * Rien si la partie Santé est éteinte.
 */
function PrechargeSante() {
  const { db, reglages } = useApp();
  const sante = reglages.parties.health;
  // en fond, une fois le premier écran posé (ecrans/fond.ts)
  useEffect(() => {
    if (!sante) return;
    enFond("corps-sante", () => lireMorphologie(db).then((mo) => prechargerCorpsSante(mo?.sexe === "f" ? "femme" : "homme", mo?.sexe !== "f" && mo?.epaules !== false)));
  }, [db, sante]);
  return null;
}

function Pile() {
  const { mode, couleurs } = useTheme();
  return (
    <>
      <StatusBar style={mode === "nuit" ? "light" : "dark"} />
      {/* Barre système transparente (enforceContrast: false, app.json) : boutons clairs la nuit, noirs le jour. Côté natif,
          `style` est la couleur des boutons (« dark » = boutons sombres), à l'inverse de ce qu'annonce le type. */}
      <NavigationBar style={mode === "nuit" ? "light" : "dark"} />
      <FournisseurApp>
        {/* Verrou d'ouverture (planche compte-connexion, H3) : allumé, l'écran verrouillé passe avant tout le reste. */}
        <GardeVerrou>
        {/* Écrans poussés : fondu et montée de 8 % (260 ms, courbe sortie ; retour 220 ms, jetons duree.page et pageRetour,
            ressources Android de plugins/duree-pages.js) : on « entre » dans le détail.
            Onglets sans animation de pile (touchés sans cesse ; leur transition est dans (tabs)/_layout) ; la séance monte du bas, comme une feuille. Chaque écran annonce
            sa partie (dégradé de son geste principal). */}
        {/* Un toucher, où qu'il tombe (onglets, écrans poussés, menu, bulle), est un geste : l'aura et la comète de la bulle
            reprennent leur pleine cadence (onTouchStart remonte sans prendre le geste). */}
        {/* Une ligne glissée sur « Supprimer » : toucher ailleurs la referme, et ce toucher ne fait rien d'autre (B8). */}
        <View
          style={{ flex: 1 }}
          onTouchStart={reveillerAura}
          onTouchMove={reveillerAura}
          onStartShouldSetResponderCapture={(e) => toucherAilleurs(e.nativeEvent.pageX, e.nativeEvent.pageY)}
        >
        {/* Le volet du profil recouvre la page et le menu. */}
        <FournisseurVolet>
        <FournisseurMenu>
        <FournisseurBulle>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: couleurs.bg }, animation: "fade_from_bottom" }}
          screenLayout={({ route, children }) => (
            <FournisseurPartie route={route.name} herite>
              {/* Fold déplié : colonne de 640 dp au plus, centrée (D5, ui/largeur.ts) ; séance, carte et onglets à part. */}
              <CadreContenu route={route.name}>{children}</CadreContenu>
            </FournisseurPartie>
          )}
        >
          {/* Les quatre parties : un navigateur d'onglets (app/(tabs)/_layout), qui garde chaque partie montée. */}
          <Stack.Screen name="(tabs)" options={{ animation: "none" }} />
          {/* Séance : posée sans animation par-dessus l'écran d'appel, elle monte et redescend elle-même (ui/Montee). */}
          <Stack.Screen name="session" options={{ animation: "none", presentation: "transparentModal", contentStyle: { backgroundColor: "transparent" }, gestureEnabled: false }} />
          {/* Âge pepfit : posé sans animation, en transparence ; il s'anime lui-même (ecrans/mesures/age-entree.tsx), l'âme de
              la page Santé y vole jusqu'à la grande signature (planches/age-coeur). */}
          <Stack.Screen name="sante/age" options={{ animation: "none", presentation: "transparentModal", contentStyle: { backgroundColor: "transparent" } }} />
          {/* Page du mois : poussée depuis la droite (planche planification, 260 ms). */}
          <Stack.Screen name="calendrier" options={{ animation: "slide_from_right" }} />
          {/* Récap avant séance (planche ajout-seance-v2) : monte plein écran, 280 ms (ui/Feuille pour le mouvement réduit). */}
          <Stack.Screen name="seance-recap" options={{ animation: "slide_from_bottom", animationDuration: 280 }} />
          {/* Sieste en cours (planche recuperer) : on en sort par « Je suis réveillé » ou « Annuler » (pas de geste de retour). */}
          <Stack.Screen name="recuperer/en-cours" options={{ gestureEnabled: false, animation: "fade" }} />
          {/* Aider à s'endormir (planche sommeil, D7) : fondu sur fond noir, jamais un éclair blanc ; le retour est géré par l'écran. */}
          <Stack.Screen name="sante/endormir" options={{ animation: "fade", contentStyle: { backgroundColor: "#000000" } }} />
          {/* Course en direct : on n'en sort que par Terminer (pas de geste de retour). */}
          <Stack.Screen name="suivi/direct" options={{ gestureEnabled: false }} />
        </Stack>
        {/* Parcours de séance unifié (planche ajout-seance-v2) : démarrer, ajouter et modifier une séance. */}
        <Parcours />
        <CarteFinProgramme />
        <FeuilleSeanceEnCours />
        <FeuilleNotifications />
        {/* « +4 % de précision, Voir » juste après une saisie (planche precision, section 4) */}
        <BandeauPrecision />
        {/* Appli ouverte : pas de notification système, bandeau « Voir » hors de l'écran concerné ; arrivée sur un écran : ses
            notifications sont retirées (docs/NOTIFICATIONS.md) */}
        <NotificationsAppli />
        </FournisseurBulle>
        </FournisseurMenu>
        </FournisseurVolet>
        </View>
        <RepriseSeance />
        <RetourSysteme />
        <RepriseRecup />
        <PrechargeSante />
        <RecalculEffort />
        <GuideFond />
        </GardeVerrou>
      </FournisseurApp>
    </>
  );
}

export default function Racine() {
  return (
    <SafeAreaProvider>
      <FournisseurTheme>
        <Pile />
      </FournisseurTheme>
    </SafeAreaProvider>
  );
}
