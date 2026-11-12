import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Easing, View } from "react-native";
import { Redirect, Tabs, usePathname } from "expo-router";
import type { TabsScreenOptions } from "expo-router/build/layouts/TabsClient";
import { useTheme } from "../../theme";
import { useApp } from "../../ecrans/contexte";
import { prechargerSante } from "../../ecrans/sante-lecteurs";
import { enFond } from "../../ecrans/fond";
import { etatParcours, parcoursAFaire } from "../../ecrans/parcours-donnees";
import { courbe } from "../../theme/mouvement";
import { AuraFond } from "../../ui/AuraFond";
import { pageHaloDe } from "../../ui/aura-calc";
import { CadreContenu } from "../../ui/CadreContenu";
import { FournisseurPartie } from "../../ui/ContextePartie";
import { abonnerEveil } from "../../ui/eveil-onglet";
import { Echauffement } from "../../ui/focus-prechauffe";
import { partieDe } from "../../ui/partie";
import { delaiGel, etatEcran, TRANSITION_ONGLETS, TRANSITIONS, varianteEffective } from "../../ui/transition-onglets";
import { useReduit } from "../../ui/reduit";

// Les trois parties (Moi, Sport, Nutrition) : un navigateur d'onglets. Chaque partie se monte à sa
// première visite, ou plus tôt : une fois la première affichée, les autres se montent en fond, une à une (préchargement,
// docs/CODE-FLUIDITE-ONGLETS.md) ; elles restent ensuite montées ; changer de partie ne démonte rien et ne recharge rien à
// l'écran (les données se rafraîchissent au focus, en arrière-plan). Le menu et la bulle de séance sont des couches partagées au-dessus
// (ui/MenuFlottant, ui/CoucheBulle) : la barre d'onglets d'origine n'est pas dessinée.
// Retour Android : « none », il remonte à la pile racine qui quitte l'appli, comme avant (les onglets étaient un remplacement).

const sortieOnglets = Easing.bezier(...courbe.sortie);

/** Un réveil par le menu (ui/eveil-onglet) qui n'est pas suivi d'un focus (navigation refusée ou annulée) s'éteint après ce délai. */
const EVEIL_MS = 1500;

/** Un onglet monté en préchargement n'a jamais été montré : pendant ce délai (son échauffement, ui/focus-prechauffe) il lit ses
 * données (base locale) comme s'il avait le focus, puis il est gelé et s'ouvre rempli. */
const GEL_PRECHARGE_MS = 5000;

/** Les parties montées en fond après le premier écran (la file de fond attend le calme du fil JS et des gestes, ecrans/demarrage). */
const A_PRECHARGER = ["health", "train", "food"] as const;
let prechargeProgramme = false;
function programmerPrechargement(navigation: unknown): void {
  if (prechargeProgramme) return;
  prechargeProgramme = true;
  const nav = navigation as { preload?: (nom: string) => void };
  // Une partie déjà montée (l'ouverte, ou visitée) n'est pas touchée par preload.
  for (const nom of A_PRECHARGER) enFond(`onglet-${nom}`, () => nav.preload?.(nom));
}

/** Pages posées en transparence sur les onglets qui s'animent elles-mêmes, retour compris (app/_layout) : l'onglet dessous
 * n'est pas gelé. La page Âge reste dans la pile pendant son retour (l'âme revient dans la poitrine de Santé) : gelé, Santé
 * restait caché tout le retour et n'apparaissait qu'une fois la page partie (vu au ralenti à l'émulateur, le 29/10). */
const SANS_GEL_DESSOUS = new Set(["sante/age"]);

type EtatPile = { index: number; routes: { name: string }[] };

/** Gèle ses enfants (même principe que react-freeze) : suspendus sans fin, ils gardent leur état et ne se rendent plus. */
function Suspendre({ gele, children }: { gele: boolean; children: ReactNode }): ReactNode {
  if (gele) throw new Promise(() => {});
  return children;
}

/**
 * Un onglet caché est gelé : plus aucun rendu React, donc plus d'effet ni de minuteur JS qui retravaille
 * pour rien. Ses animations natives (Reanimated, UI thread) s'arrêtent avec la vue détachée. Dégelé au focus.
 */
function Ecran({ route, navigation, gelApresMs, children }: { route: string; gelApresMs: number; navigation: { isFocused: () => boolean; addListener: (e: "focus" | "blur", f: () => void) => () => void; getParent: () => { getState: () => EtatPile } | undefined }; children: ReactNode }) {
  // Le layout est posé hors du contexte de navigation de l'écran : le focus vient de `navigation`, pas de useIsFocused.
  const [focus, setFocus] = useState(() => navigation.isFocused());
  useEffect(() => {
    setFocus(navigation.isFocused());
    const a = navigation.addListener("focus", () => setFocus(true));
    const b = navigation.addListener("blur", () => setFocus(false));
    return () => {
      a();
      b();
    };
  }, [navigation]);
  // Le menu réveille la partie visée dans la même mise à jour que la navigation (ui/eveil-onglet) : elle est dégelée dans l'image
  // où sa scène apparaît, pas une mise à jour plus tard, quand l'ancien écran a déjà disparu (écran vide).
  const [eveille, setEveille] = useState(false);
  useEffect(() => abonnerEveil(route, () => setEveille(true)), [route]);
  useEffect(() => {
    if (!eveille) return;
    const m = setTimeout(() => setEveille(false), EVEIL_MS);
    return () => clearTimeout(m);
  }, [eveille]);
  const actif = focus || eveille;
  // Le premier rendu n'est jamais gelé : une partie montée en préchargement (pas encore ouverte) se dessine et lit ses données.
  const [gele, setGele] = useState(false);
  const montree = useRef(actif);
  useEffect(() => {
    if (actif) {
      montree.current = true;
      setGele(false);
      programmerPrechargement(navigation);
      return;
    }
    const dessous = () => {
      const pile = navigation.getParent()?.getState();
      return pile != null && SANS_GEL_DESSOUS.has(pile.routes[pile.index]?.name ?? "");
    };
    const m = setTimeout(() => !navigation.isFocused() && !dessous() && setGele(true), montree.current ? gelApresMs : GEL_PRECHARGE_MS);
    return () => clearTimeout(m);
  }, [actif, navigation, gelApresMs]);
  // Monté en préchargement, jamais ouvert, pas encore gelé : ses lectures de focus partent sans attendre l'ouverture.
  const echauffe = !actif && !montree.current && !gele;
  return (
    <FournisseurPartie route={route}>
      <Echauffement.Provider value={echauffe}>
      <Suspense fallback={null}>
        {/* Fold déplié : la partie tient dans une colonne de 640 dp au plus, centrée, sur l'aura pleine largeur (D5). */}
        <CadreContenu route={route} onglet>
          <Suspendre gele={gele && !actif}>{children}</Suspendre>
        </CadreContenu>
      </Suspense>
      </Echauffement.Provider>
    </FournisseurPartie>
  );
}

export default function Onglets() {
  const { couleurs } = useTheme();
  const { db } = useApp();
  // Premier lancement : le parcours de première utilisation (app/welcome) avant les onglets.
  const [aFaire, setAFaire] = useState(etatParcours.aFaire);
  useEffect(() => {
    if (aFaire == null)
      parcoursAFaire(db)
        .then(setAFaire)
        .catch((e) => {
          console.error(e);
          setAFaire(false);
        });
  }, [db, aFaire]);
  // Les cartes de Santé lues dans la base peu après le lancement (sans réseau) : sa première ouverture les montre tout de
  // suite (docs/SANTE-VITESSE.md) ; en fond après le premier écran, pour ne pas retenir l'Accueil (ecrans/fond.ts).
  useEffect(() => {
    enFond("cartes-sante", () => prechargerSante(db));
  }, [db]);
  const variante = varianteEffective(TRANSITION_ONGLETS, useReduit());
  const { dureeMs } = TRANSITIONS[variante];
  const animation: TabsScreenOptions =
    variante === "aucune"
      ? { animation: "none" }
      : {
          animation: "fade",
          // Courbe de sortie des jetons (part vite, se pose), comme toutes les entrées de l'appli.
          transitionSpec: { animation: "timing", config: { duration: dureeMs, easing: sortieOnglets } },
          sceneStyleInterpolator: ({ current }) => {
            const g = etatEcran(variante, -1);
            const d = etatEcran(variante, 1);
            const opacity = current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [g.opacite, 1, d.opacite] });
            const translateX = current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [g.decalageX, 0, d.decalageX] });
            return { sceneStyle: { opacity, transform: [{ translateX }] } };
          },
        };
  // Page partagée ouverte (Énergie, Pas, Effort) : l'aura garde la teinte de l'onglet, d'où part le halo de la page.
  const chemin = usePathname();
  const tenue = useRef(partieDe(chemin));
  if (!pageHaloDe(chemin)) tenue.current = partieDe(chemin);
  const partie = tenue.current;
  if (aFaire == null) return <View style={{ flex: 1, backgroundColor: couleurs.bg }} />;
  if (aFaire) return <Redirect href="/welcome" />;
  // Le fond (aura) est commun aux trois parties : derrière les écrans, qui sont transparents, dans la cible du flou du menu.
  // Les touchers réveillent l'aura depuis la racine (app/_layout).
  return (
    <View style={{ flex: 1, backgroundColor: couleurs.bg }}>
    <AuraFond partie={partie} />
    <Tabs
      backBehavior="none"
      tabBar={() => null}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" }, ...animation }}
      screenLayout={({ route, navigation, children }) => <Ecran route={route.name} navigation={navigation} gelApresMs={delaiGel(variante)}>{children}</Ecran>}
    >
      {/* Expo Router 58 : seuls les écrans déclarés ici s'affichent (les autres routes du dossier sont ignorées). */}
      {/* « index » : la route « / », qui redirige vers le premier onglet allumé ; puis les trois onglets, dans l'ordre de la barre. */}
      <Tabs.Screen name="index" />
      <Tabs.Screen name="health" />
      <Tabs.Screen name="train" />
      <Tabs.Screen name="food" />
    </Tabs>
    </View>
  );
}
