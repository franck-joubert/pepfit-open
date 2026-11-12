import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { dissocierDuCatalogue, lierAuCatalogue, libelleMuscle, lireExercice, refuserSuggestion, suggestionPour, type Exercice } from "../db";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { espace, rayon } from "../theme/typo";
import { CLIPS_3D, cle3D } from "../ui/3d/clips";
import { AZIMUT_TROIS_QUARTS } from "../ui/3d/orbite";
import { CORPS } from "../ui/3d/scene";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { coteDesCases } from "./feuille-lien-taille";
import { signalerErreur } from "../ui/FeuilleMessage";
import { margeColonne } from "../ui/largeur";
import { Picto } from "../ui/Picto";
import { CATALOGUE, FICHIERS } from "../ui/pictos-index";
import { useReduit } from "../ui/reduit";
import { Texte } from "../ui/Texte";
import { useApp } from "./contexte";
import { demanderUnExercice } from "./selection";

// three.js et expo-gl ne naissent qu'à l'ouverture de la feuille, et seulement pour un exercice qui a un clip.
const Vue3D = lazy(() => import("../ui/3d/Vue3D"));

/** Écart entre les deux cases ; leur côté (largeur, plafond, hauteur de la feuille) : feuille-lien-taille.ts. */
const ECART = espace.m;

/** À proposition égale, l'exercice du catalogue qui a son propre picto et sa propre 3D passe devant. */
export const departager = (slug: string) => (FICHIERS[CATALOGUE[slug] ?? slug] ? 0.5 : 0) + (CLIPS_3D[slug] ? 0.5 : 0);

/** Ouvre la feuille de recherche limitée au catalogue ; le choix relie l'exercice perso (picto et 3D du catalogue). */
export function choisirDansLeCatalogue(onChoisi: (slug: string) => void, db: Parameters<typeof lireExercice>[0]) {
  demanderUnExercice((id) => {
    lireExercice(db, id)
      .then((c) => c?.slug && onChoisi(c.slug))
      .catch(signalerErreur());
  });
  router.push({ pathname: "/pick", params: { mode: "lier" } });
}

/**
 * Lien d'un exercice perso au catalogue, une seule feuille pour tous les écrans (fiche, menu « … », liste des manques) :
 * suggestion « C'est ça ? » confirmée une fois, choix d'un autre exercice, ou dissocier. Jamais de lien posé sans un toucher ;
 * les séries et les records ne bougent pas (le lien ne donne que le picto et la 3D).
 */
export function FeuilleLien({ exercice, visible, onFermer, onFini }: { exercice: Exercice; visible: boolean; onFermer: () => void; onFini: () => void }) {
  useLangue();
  const { db } = useApp();
  const [cible, setCible] = useState<{ ex: Exercice; lie: boolean; autres: Exercice[] } | null>(null);

  useEffect(() => {
    if (!visible) return;
    let vivant = true;
    (async () => {
      if (exercice.lie_a) {
        const c = await db.getFirstAsync<{ id: string }>("SELECT id FROM exercices WHERE slug = ? AND perso = 0", [exercice.lie_a]);
        const ex = c ? await lireExercice(db, c.id) : null;
        if (vivant && ex) setCible({ ex, lie: true, autres: [] });
        return;
      }
      const s = await suggestionPour(db, exercice.id, { departager });
      if (!vivant) return;
      if (s) setCible({ ex: s.catalogue, lie: false, autres: s.autres });
      else {
        // Rien d'assez proche à proposer : on passe directement au choix.
        onFermer();
        choisirDansLeCatalogue((slug) => lierAuCatalogue(db, exercice.id, slug).then(onFini).catch(signalerErreur()), db);
      }
    })().catch(signalerErreur());
    return () => {
      vivant = false;
      setCible(null);
    };
  }, [visible, exercice.id, exercice.lie_a, db]); // eslint-disable-line react-hooks/exhaustive-deps

  const autre = () => {
    onFermer();
    choisirDansLeCatalogue((slug) => lierAuCatalogue(db, exercice.id, slug).then(onFini).catch(signalerErreur()), db);
  };
  const fini = (p: Promise<unknown>) => {
    onFermer();
    p.then(onFini).catch(signalerErreur());
  };

  // À égalité (« Hip thrust » sans matériel), l'exercice touché prend la place de celui qu'on montrait : picto et animation
  // changent, rien n'est lié avant « Oui, c'est ça ».
  const plutot = (ex: Exercice) => cible && setCible({ ex, lie: false, autres: [cible.ex, ...cible.autres.filter((a) => a.id !== ex.id)] });

  const c = cible?.ex;
  return (
    <Feuille
      visible={visible && cible != null}
      onFermer={onFermer}
      titre={cible?.lie ? t("exercices.lien.relieA", { nom: c?.nom ?? "" }) : t("exercices.lien.ceciEst", { nom: c?.nom ?? "" })}
      sousTitre={cible?.lie ? t("exercices.lien.dissocierExplication") : t("exercices.lien.explication")}
    >
      {c ? (
        <View style={styles.apercu}>
          <Apercu ex={c} lignes={cible?.lie ? 3 : 4 + (cible?.autres.length ?? 0)} />
          <Texte variante="meta" couleur="t2">
            {c.muscle ? libelleMuscle(c.muscle) : ""}
          </Texte>
        </View>
      ) : null}
      <Groupe>
        {cible?.lie ? (
          <>
            <Option premier libelle={t("exercices.lien.autre")} onPress={autre} />
            <Option danger libelle={t("exercices.lien.dissocier")} onPress={() => fini(dissocierDuCatalogue(db, exercice.id))} />
          </>
        ) : (
          <>
            <Option premier libelle={t("exercices.lien.oui")} onPress={() => c?.slug && fini(lierAuCatalogue(db, exercice.id, c.slug))} />
            {cible?.autres.map((a) => (
              <Option key={a.id} libelle={t("exercices.lien.plutot", { nom: a.nom })} onPress={() => plutot(a)} />
            ))}
            <Option libelle={t("exercices.lien.autre")} onPress={autre} />
            <Option libelle={t("exercices.lien.non")} onPress={() => fini(refuserSuggestion(db, exercice.id))} />
          </>
        )}
        <Option libelle={t("exercices.lien.annuler")} onPress={onFermer} />
      </Groupe>
    </Feuille>
  );
}

/**
 * Ce que l'exercice du catalogue donnera, côte à côte et aussi grand que la feuille le permet : le picto (image fixe) et le
 * mouvement 3D (le clip de la fiche et de la séance, Vue3D, en boucle, sans toucher ni son). Sans clip : le picto seul,
 * centré, plus grand. La 3D n'existe que feuille ouverte (la fenêtre modale démonte son contenu à la fermeture).
 */
function Apercu({ ex, lignes }: { ex: Exercice; lignes: number }) {
  const { couleurs } = useTheme();
  const { reglages } = useApp();
  const reduit = useReduit();
  const { width: ecran, height: haut } = useWindowDimensions();
  const [erreur, setErreur] = useState<string | null>(null);
  const cle = cle3D(ex.slug, ex.nom);
  useEffect(() => setErreur(null), [cle]);
  const avec3D = cle != null && erreur == null;
  // largeur utile de la feuille : la colonne de contenu moins ses marges
  const utile = ecran - 2 * margeColonne(ecran) - 2 * espace.l;
  const cote = coteDesCases(utile, haut, lignes, avec3D, ECART);
  const couleurs3D = useMemo(
    () => ({ fond: couleurs.s2, corps: CORPS, principal: couleurs.muscle, secondaire: couleurs.muscle2 }),
    [couleurs],
  );
  return (
    <View style={styles.cases}>
      <Picto slug={ex.slug} nom={ex.nom} taille={cote} />
      {avec3D ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ width: cote, height: cote, borderRadius: rayon.m, backgroundColor: couleurs.s2, overflow: "hidden" }}
        >
          <Suspense fallback={null}>
            <Vue3D
              key={cle}
              cle={cle}
              couleurs={couleurs3D}
              lecture={!reduit}
              dos={0}
              azimut={AZIMUT_TROIS_QUARTS}
              serre={0.92}
              elan={false}
              horizontal
              libelle={t("accueil.progression.en3D", { nom: ex.nom })}
              onPret={() => {}}
              onErreur={setErreur}
              personnage={reglages.personnage}
              ips={30}
            />
          </Suspense>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  apercu: { alignItems: "center", gap: espace.s, marginBottom: espace.m },
  cases: { flexDirection: "row", justifyContent: "center", gap: ECART },
});
