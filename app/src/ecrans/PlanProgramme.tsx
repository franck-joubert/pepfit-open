import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ouvrirRecap } from "./recap/ouvrir-recap";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { plansSuivis, tx, type PlanEnCours } from "../boutique/donnees";
import { Vignette } from "../boutique/ui";
import { arreterPlan, seancesDuPlan, type SeancePlan } from "../db";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { rafraichirRappels } from "../natif/rappels";
import { useTheme } from "../theme";
import { duree as durees } from "../theme/mouvement";
import { espace, police, rayon } from "../theme/typo";
import { BoutonIcone } from "../ui/Cadre";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { Appui, courbes } from "../ui/mouvement";
import { revenir } from "../ui/revenir";
import { Texte } from "../ui/Texte";
import { useApp, useCharge } from "./contexte";
import { jourMois, jourMoisAnnee, jourSemaineMois } from "./format";
import { BoutonPrincipal } from "../ui/Degrade";
import { midi, texteQuand } from "./Planif";
import { jourDe } from "./planif-donnees";
import { ajouterJ, ecartJ } from "./planification";

// Programme en cours (planche boutique-programmes a10) : la carte « En cours » de la page Programmes (semaine n sur N,
// barre des semaines, prochaine séance, « Voir le programme »), et sa page : les séances semaine par semaine, faites ou à
// venir, chacune ouvrant sa routine ; ⋯ › Arrêter le programme.

/**
 * Carte « En cours » : `nouveau` = le plan vient d'être démarré (il se pose en douceur, une seule fois) ; `deja` : « Déjà fait en
 * mars 2025 · 46 séances » (planche sport-programmes-routines v2, A2). Un plan passé (page de son historique) dit quand il a été
 * terminé ou arrêté.
 */
export function CartePlan({ plan, nouveau, onMenu, avecVoir = true, deja }: { plan: PlanEnCours; nouveau?: boolean; onMenu: () => void; avecVoir?: boolean; deja?: string }) {
  useLangue();
  const { couleurs } = useTheme();
  const p = plan.programme;
  const auj = jourDe(Date.now());
  const quand = plan.commence ? null : texteQuand(plan.debut, auj);
  const famille = p?.famille ?? "endu";
  const coul = couleurs[{ endu: "partieAccueil", force: "partieEntrainement", forme: "partieNutrition", sante: "partieSante" }[famille] as "partieAccueil"];
  return (
    <Animated.View
      entering={
        nouveau
          ? FadeInDown.duration(durees.record)
              .easing(courbes.sortie)
              .withInitialValues({ transform: [{ translateY: 12 }] })
          : undefined
      }
      style={[styles.encours, { backgroundColor: couleurs.verreCarte, borderColor: couleurs.verreFilet }]}
    >
      <View style={styles.haut}>
        {p ? <Vignette p={p} hauteur={52} largeur={52} rayon={11} chiffre={false} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Texte variante="exercice" numberOfLines={1}>
            {plan.nom}
          </Texte>
          <Texte numberOfLines={1} style={{ fontSize: 12.5, color: couleurs.t3, marginTop: 2 }}>
            {plan.arreteLe != null
              ? t("boutique.plan.arreteLe", { date: jourMoisAnnee(plan.arreteLe) })
              : plan.fini
              ? plan.derniere
                ? t("boutique.plan.termineLe", { date: jourMoisAnnee(midi(plan.derniere)) })
                : t("boutique.plan.fini")
              : [t("boutique.plan.semaine", { n: plan.semaine, total: plan.semaines }), quand ? t("boutique.plan.commence", { quand }) : null]
                  .filter(Boolean)
                  .join(", ")}
          </Texte>
        </View>
        {/* Un programme passé n'a rien à régler (« Refaire ce programme » est en bas de sa page). */}
        {plan.fini || plan.arreteLe != null ? null : <BoutonIcone nom="more" taille={20} libelle={t("boutique.plan.options", { nom: plan.nom })} onPress={onMenu} />}
      </View>
      <View style={styles.prog} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: plan.semaines }, (_, i) => (
          <View key={i} style={[styles.progSem, { backgroundColor: plan.fini || (plan.commence && i < plan.semaine - 1) ? coul : couleurs.line2 }]}>
            {plan.commence && !plan.fini && plan.arreteLe == null && i === plan.semaine - 1 ? (
              <View style={{ width: `${Math.max(12, (((ecartJ(plan.debut, auj) % 7) + 1) / 7) * 100)}%`, height: 4, borderRadius: 2, backgroundColor: coul }} />
            ) : null}
          </View>
        ))}
      </View>
      {plan.prochaine ? (
        <View style={styles.proch}>
          <Icone nom="cal" couleur={couleurs.action} taille={16} />
          <Texte numberOfLines={1} style={{ flex: 1, fontSize: 13, color: couleurs.t2 }}>
            <Texte style={{ fontFamily: police.semibold, fontSize: 13, color: couleurs.t1 }}>
              {majuscule(`${texteQuand(plan.prochaine.date, auj)}${plan.prochaine.date > ajouterJ(auj, 6) ? "" : ` ${jourMois(midi(plan.prochaine.date))}`}`)}
            </Texte>
            {`, ${plan.prochaine.nom}`}
          </Texte>
        </View>
      ) : null}
      {deja ? (
        <View style={styles.proch}>
          <Icone nom="history" couleur={couleurs.t3} taille={16} />
          <Texte numberOfLines={1} style={{ flex: 1, fontSize: 13, color: couleurs.t2 }}>
            {deja}
          </Texte>
        </View>
      ) : null}
      {avecVoir ? (
        <Appui
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/plan/[id]", params: { id: plan.id } })}
          style={({ pressed }) => [styles.go, { backgroundColor: pressed ? couleurs.s3 : couleurs.btnTonalFond }]}
        >
          <Texte style={{ fontFamily: police.semibold, fontSize: 15, color: couleurs.btnTonalTexte }}>{t("boutique.plan.voir")}</Texte>
        </Appui>
      ) : null}
    </Animated.View>
  );
}
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Feuille ⋯ d'un plan : voir la fiche du catalogue, arrêter le programme. */
export function FeuillePlan({ plan, onFermer, onArrete }: { plan: PlanEnCours | null; onFermer: () => void; onArrete: () => void }) {
  const { db } = useApp();
  return (
    <Feuille visible={plan != null} onFermer={onFermer} titre={plan?.nom} sousTitre={t("boutique.plan.arreterSous")}>
      <Groupe>
        {plan?.programme ? (
          <Option
            premier
            icone="info"
            libelle={t("boutique.plan.ficheCatalogue")}
            chevron
            onPress={() => {
              onFermer();
              router.push({ pathname: "/boutique/[id]", params: { id: plan.catalogueId } });
            }}
          />
        ) : null}
        <Option
          premier={!plan?.programme}
          danger
          icone="trash"
          libelle={t("boutique.plan.arreter")}
          onPress={() => {
            if (!plan) return;
            arreterPlan(db, plan.id)
              .then(() => rafraichirRappels(db))
              .then(onArrete)
              .catch(console.error);
          }}
        />
      </Groupe>
    </Feuille>
  );
}

/** Page d'un plan : la carte, puis ses séances semaine par semaine. */
export function PlanProgramme() {
  useLangue();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { couleurs } = useTheme();
  const [d] = useCharge(
    async (db) => {
      const plan = (await plansSuivis(db)).find((x) => x.id === id) ?? null;
      // Arrêté : ses séances jusqu'à l'arrêt (programmations désactivées, lues quand même).
      const toutes = plan ? await seancesDuPlan(db, plan.id, plan.arreteLe != null) : [];
      const seances = plan?.arreteLe != null ? toutes.filter((s) => s.date <= jourDe(plan.arreteLe!)) : toutes;
      const faites = plan
        ? new Set(
            (
              await db.getAllAsync<{ routine_id: string; debut: number }>(
                "SELECT routine_id, debut FROM seances WHERE fin IS NOT NULL AND routine_id IN (SELECT id FROM routines WHERE plan_id = ?)",
                [plan.id],
              )
            ).map((s) => `${s.routine_id}|${jourDe(s.debut)}`),
          )
        : new Set<string>();
      return { plan, seances, faites };
    },
    [id],
  );
  const [menu, setMenu] = useState(false);
  const insetBas = useSafeAreaInsets().bottom;
  const plan = d?.plan ?? null;
  const passe = !!plan && (plan.fini || plan.arreteLe != null);
  const semaines = new Map<number, SeancePlan[]>();
  if (plan)
    for (const s of d!.seances) {
      const n = Math.floor(ecartJ(plan.debut, s.date) / 7) + 1;
      semaines.set(n, [...(semaines.get(n) ?? []), s]);
    }
  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <View style={styles.entete}>
        <BoutonIcone nom="back" couleur={couleurs.t1} libelle={t("ui.retour")} onPress={revenir} />
        <Texte variante="titre" accessibilityRole="header" numberOfLines={1} style={{ flex: 1, marginLeft: 2 }}>
          {plan?.nom ?? ""}
        </Texte>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: espace.xxl * 2 + (passe ? 64 : 0) }}>
        {plan ? <CartePlan plan={plan} avecVoir={false} onMenu={() => setMenu(true)} /> : null}
        {[...semaines.entries()].map(([n, l]) => (
          <View key={n}>
            <View style={styles.teteSemaine}>
              <Texte variante="entete" couleur="t2">
                {t("boutique.fiche.semaine", { n })}
              </Texte>
              {plan?.programme?.calendrier[n - 1]?.accent ? (
                <Texte numberOfLines={1} style={{ flex: 1, fontSize: 12, color: couleurs.t3 }}>
                  {tx(plan.programme.calendrier[n - 1]!.accent!)}
                </Texte>
              ) : null}
            </View>
            <View style={{ marginHorizontal: 16 }}>
              <Groupe>
                {l.map((s, i) => {
                  const faite = d!.faites.has(`${s.routineId}|${s.date}`);
                  return (
                    <Appui
                      key={s.programmationId}
                      accessibilityRole="button"
                      accessibilityLabel={`${jourSemaineMois(midi(s.date))}, ${s.nom}${faite ? `, ${t("boutique.plan.faite")}` : ""}`}
                      onPress={() => (faite || passe ? router.push({ pathname: "/routine/view/[id]", params: { id: s.routineId, detail: "1" } }) : ouvrirRecap({ prevue: { programmationId: s.programmationId, origine: s.date } }))}
                      style={({ pressed }) => [
                        styles.ligne,
                        i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 },
                        pressed && { backgroundColor: couleurs.s3 },
                      ]}
                    >
                      <Texte variante="meta" couleur="t3" style={{ width: 84 }}>
                        {majuscule(jourSemaineMois(midi(s.date)))}
                      </Texte>
                      <Texte numberOfLines={1} style={{ flex: 1, fontFamily: police.medium, fontSize: 14 }}>
                        {s.nom}
                      </Texte>
                      {faite ? <Icone nom="check" couleur={couleurs.valide} taille={18} /> : <Icone nom="right" couleur={couleurs.t3} taille={16} />}
                    </Appui>
                  );
                })}
              </Groupe>
            </View>
          </View>
        ))}
      </ScrollView>
      {/* Un programme passé : un seul plein, « Refaire ce programme » (sa fiche de la boutique, pour le redémarrer). En position
          absolue, il ignore le rembourrage bas du SafeAreaView : sa marge compte la barre de navigation (comme Routines). */}
      {passe && plan ? (
        <View style={[styles.bas, { bottom: insetBas + 16 }]}>
          <BoutonPrincipal icone="repeat" libelle={t("boutique.plan.refaire")} onPress={() => router.push({ pathname: "/boutique/[id]", params: { id: plan.catalogueId } })} />
        </View>
      ) : null}
      <FeuillePlan plan={menu && !passe ? plan : null} onFermer={() => setMenu(false)} onArrete={() => (setMenu(false), revenir())} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  entete: { height: 64, flexDirection: "row", alignItems: "center", paddingLeft: 4, paddingRight: 8 },
  encours: { marginHorizontal: 16, marginBottom: 8, padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  bas: { position: "absolute", left: 16, right: 16 },
  haut: { flexDirection: "row", alignItems: "center", gap: 12 },
  prog: { flexDirection: "row", gap: 3, marginTop: 14 },
  progSem: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  proch: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  go: { height: 48, borderRadius: rayon.l, alignItems: "center", justifyContent: "center", marginTop: 14 },
  teteSemaine: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, marginTop: 20, marginBottom: 8 },
  ligne: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingLeft: 16, paddingRight: 12 },
});
