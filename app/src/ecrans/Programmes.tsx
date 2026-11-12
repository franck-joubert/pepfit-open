import { useCallback, useEffect, useState } from "react";
import { ListeDesintegrable } from "../ui/Desintegration";
import { ScrollView, StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { moisDe, plansPasses, plansSuivis, tx, type PlanEnCours } from "../boutique/donnees";
import { EntreeParcourir } from "../boutique/pile";
import { sousEntree, Vignette } from "../boutique/ui";
import { supprimerPlan } from "../db";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { rafraichirRappels } from "../natif/rappels";
import { useTheme } from "../theme";
import { espace, police, rayon } from "../theme/typo";
import { BoutonIcone } from "../ui/Cadre";
import { useBulle } from "../ui/CoucheBulle";
import { signalerErreur } from "../ui/FeuilleMessage";
import { GlisserSupprimer, coinsJonction, useLigneDecalee } from "../ui/GlisserSupprimer";
import { Icone } from "../ui/Icone";
import { Appui } from "../ui/mouvement";
import { ChevronRepli, Repli } from "../ui/Repli";
import { revenir } from "../ui/revenir";
import { Texte } from "../ui/Texte";
import { useApp, useCharge } from "./contexte";
import { pluriel } from "./format";
import { CartePlan, FeuillePlan } from "./PlanProgramme";
import { jourDe } from "./planif-donnees";

// Page Programmes (planche sport-programmes-routines v2, A2 et retour 2, validés le 29/10) : en tête « Explorer les
// programmes » (un calendrier dont les séances se posent une fois, planche boutiques, variante A), un séparateur, puis les programmes En cours (avec « Déjà fait
// en mars 2025 » quand le même a déjà été fini) et les Passés, du plus récent au plus ancien : « Terminé en mars · 40 séances
// sur 40 », « Arrêté semaine 5 · janv. · 14 séances », « Terminé 2 fois · dernier en juin ». Toucher un passé ouvre son
// historique ; un passé se glisse pour le supprimer (D7), le programme en cours non (⋯ › Arrêter). Sans aucun programme, la
// page n'existe pas : on entre directement dans Explorer les programmes.

export function Programmes() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const [suivis, recharger] = useCharge((db) => plansSuivis(db), []);
  // Un programme qui vient d'être démarré (boutique) : sa carte « En cours » se pose en douceur.
  const { plan: planNouveau } = useLocalSearchParams<{ plan?: string }>();
  const [menu, setMenu] = useState<PlanEnCours | null>(null);
  const [replies, setReplies] = useState<Set<string>>(new Set());
  const auj = jourDe(Date.now());
  const enCours = (suivis ?? []).filter((p) => !p.fini && p.arreteLe == null);
  const tousPasses = plansPasses(suivis ?? []);
  // Un programme repris est en cours : il n'est pas répété dans les passés, son historique est sur sa carte.
  const passes = tousPasses.filter((p) => !enCours.some((e) => e.catalogueId === p.catalogueId));
  const vide = suivis != null && !enCours.length && !passes.length;
  // Tant qu'on ne sait pas si elle est vide : le fond seul, pas « Explorer les programmes » une demi-seconde avant la
  // boutique (31/10).
  const inconnu = suivis == null;
  // Bulle de séance (revue finale n° 9, D7) : posée au-dessus de la barre de gestes, la fin de liste défile au-dessus d'elle.
  const bulle = useBulle();
  const reserve = useSafeAreaInsets().bottom + espace.s;
  const { reserverBas } = bulle;
  useFocusEffect(useCallback(() => reserverBas(reserve), [reserverBas, reserve]));
  useEffect(() => () => reserverBas(0), [reserverBas]);
  useEffect(() => {
    // Sans aucun programme : la boutique directement, rayon Programmes (retour 2). Le bouton de Sport y va déjà tout seul
    // (entree-programmes.ts) ; reste pour les autres entrées (liens).
    if (vide) router.replace({ pathname: "/boutique", params: { genre: "programme" } });
  }, [vide]);

  const basculer = (cle: string) =>
    setReplies((r) => {
      const n = new Set(r);
      if (n.has(cle)) n.delete(cle);
      else n.add(cle);
      return n;
    });

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <View style={styles.entete}>
        <BoutonIcone nom="back" couleur={couleurs.t1} libelle={t("ui.retour")} onPress={revenir} />
        <Texte variante="titre" accessibilityRole="header" numberOfLines={1} style={{ flex: 1, marginLeft: 2 }}>
          {t("boutique.programmesTitre")}
        </Texte>
      </View>
      {inconnu || vide ? null : (
        <ScrollView contentContainerStyle={{ paddingTop: 4, paddingBottom: bulle.enCours ? bulle.hauteur + reserve + espace.l : espace.xxl * 2 }}>
          <EntreeParcourir
            titre={t("boutique.parcourirProgrammes")}
            sous={sousEntree("programme")}
            calendrier
            onPress={() => router.push({ pathname: "/boutique", params: { genre: "programme" } })}
          />
          {enCours.length ? (
            <>
              <EnteteSection titre={t("boutique.plan.enCours")} n={enCours.length} replie={replies.has("encours")} onPress={() => basculer("encours")} />
              <Repli ouvert={!replies.has("encours")}>
                {enCours.map((p) => {
                  const deja = tousPasses.find((x) => x.catalogueId === p.catalogueId && x.fini);
                  return (
                    <CartePlan
                      key={p.id}
                      plan={p}
                      nouveau={p.id === planNouveau}
                      onMenu={() => setMenu(p)}
                      deja={deja?.derniere ? t("boutique.plan.deja", { mois: moisDe(deja.derniere, auj), faites: pluriel(deja.faites, "communs.seance") }) : undefined}
                    />
                  );
                })}
              </Repli>
            </>
          ) : null}
          {passes.length ? (
            <>
              <EnteteSection titre={t("boutique.passes")} n={passes.length} replie={replies.has("passes")} onPress={() => basculer("passes")} />
              <Repli ouvert={!replies.has("passes")}>
                <View style={styles.passes}>
                  {/* Supprimé, un passé se désintègre comme toute ligne supprimée en glissant (planche suppression-animee). */}
                  <ListeDesintegrable
                    liste={passes}
                    cleDe={(p) => p.id}
                    rendu={(p, etat) => (
                      <GlisserSupprimer
                        actif={etat !== "sort"}
                        cle={p.id}
                        fondContenu="transparent"
                        style={styles.ecart}
                        // Le programme quitte la liste ; ses séances restent dans le journal (D7).
                        onSupprimer={() => supprimerPasse(db, p.id).then(recharger).catch(signalerErreur("supprimer"))}
                      >
                        <LignePasse p={p} auj={auj} />
                      </GlisserSupprimer>
                    )}
                  />
                </View>
              </Repli>
            </>
          ) : null}
        </ScrollView>
      )}
      <FeuillePlan plan={menu} onFermer={() => setMenu(null)} onArrete={() => (setMenu(null), recharger().catch(console.error))} />
    </SafeAreaView>
  );
}

/** En-tête de section repliable (chevron, libellé en capitales, nombre), sans ⋯ : rien à y régler. */
function EnteteSection({ titre, n, replie, onPress }: { titre: string; n: number; replie: boolean; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Appui accessibilityRole="button" accessibilityState={{ expanded: !replie }} accessibilityLabel={`${titre}, ${n}`} onPress={onPress} style={styles.section}>
      <ChevronRepli ouvert={!replie} couleur={couleurs.t3} />
      <Texte variante="entete" couleur="t2">
        {titre}
      </Texte>
      <Texte variante="meta" couleur="t3">
        {n}
      </Texte>
    </Appui>
  );
}

/** Un programme passé : vignette, nom, état (✓ vert s'il a été terminé), chevron ; ouvre son historique. */
function LignePasse({ p, auj }: { p: PlanEnCours & { fois: number }; auj: string }) {
  const { couleurs } = useTheme();
  const decalee = useLigneDecalee();
  const termine = p.arreteLe == null;
  const mois = moisDe(p.arreteLe != null ? jourDe(p.arreteLe) : (p.derniere ?? p.fin), auj);
  const etat = !termine
    ? t("boutique.passe.arrete", { n: p.semaine, mois, faites: pluriel(p.faites, "communs.seance") })
    : p.fois > 1
      ? t("boutique.passe.terminePlusieurs", { fois: p.fois, mois })
      : t("boutique.passe.termine", { mois, faites: pluriel(p.faites, "communs.seance"), total: p.nbSeances });
  return (
    <Appui
      accessibilityRole="button"
      accessibilityLabel={`${p.nom}, ${etat}`}
      onPress={() => router.push({ pathname: "/plan/[id]", params: { id: p.id } })}
      style={[styles.passe, { backgroundColor: couleurs.carteOpaque, borderColor: couleurs.verreFilet }, coinsJonction(decalee)]}
    >
      {p.programme ? <Vignette p={p.programme} hauteur={48} largeur={48} rayon={10} chiffre={false} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="exercice" numberOfLines={1}>
          {p.programme ? tx(p.programme.nom) : p.nom}
        </Texte>
        <View style={styles.etat}>
          {termine ? <Icone nom="check" couleur={couleurs.valide} taille={14} epaisseur={2.5} /> : null}
          <Texte numberOfLines={1} style={{ flex: 1, fontSize: 12.5, color: couleurs.t2 }}>
            {etat}
          </Texte>
        </View>
      </View>
      <Icone nom="right" couleur={couleurs.t3} taille={16} />
    </Appui>
  );
}

/** Supprime un passé (glisser) puis remet les rappels à jour. */
export async function supprimerPasse(db: Parameters<typeof supprimerPlan>[0], id: string) {
  await supprimerPlan(db, id);
  await rafraichirRappels(db);
}

const styles = StyleSheet.create({
  entete: { height: 64, flexDirection: "row", alignItems: "center", paddingLeft: 4, paddingRight: 8 },
  section: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: espace.s, marginTop: espace.s, marginHorizontal: espace.s, paddingLeft: espace.s },
  passes: { paddingHorizontal: espace.l },
  // Écart sous chaque passé, dans la ligne : il se replie avec elle quand elle se désintègre.
  ecart: { borderRadius: rayon.l, marginBottom: espace.s },
  passe: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 72, paddingVertical: 10, paddingLeft: 12, paddingRight: espace.s, borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth },
  etat: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
});
