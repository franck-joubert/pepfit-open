// « Aider à s'endormir » (planche sommeil, validée le 03/11, B2 à B7) : un écran noir et braise quel que soit le mode (D7),
// la luminosité de la fenêtre au plus bas tant qu'il est ouvert (rendue en sortant), l'écran gardé allumé seulement pendant
// une méthode. Le choix (B2) dans l'ordre des preuves (D6), chaque méthode (B3 à B6, Methodes.tsx), les conseils du soir
// (B7, feuille du bas). Le retour d'Android ramène d'une méthode au choix. La musique attend son contenu (D8) : « Bientôt ».
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { endormir } from "../../natif/endormir";
import { BRAISE, ThemeBraise, useTheme } from "../../theme";
import { police } from "../../theme/typo";
import { Feuille } from "../../ui/Feuille";
import { Icone, type NomIcone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { useCharge } from "../contexte";
import { conseilsDuSoir, ENDORMIR, heureMin, METHODES, minuteDuJour, type Conseil, type MethodeId } from "./endormir";
import { lireSoir } from "./endormir-donnees";
import { Armee, Carree, Fin, Hypnose, Lente, Tete } from "./Methodes";

type Etat = "choix" | Exclude<MethodeId, "musique"> | "fin";

export function Endormir() {
  return (
    <ThemeBraise>
      <PageEndormir />
    </ThemeBraise>
  );
}

function PageEndormir() {
  useLangue();
  const haut = useSafeAreaInsets().top;
  const [etat, setEtat] = useState<Etat>("choix");
  const [conseils, setConseils] = useState(false);
  const [soir] = useCharge((db) => lireSoir(db));
  const liste = soir ? conseilsDuSoir(soir.journee) : null;

  // la fenêtre au plus bas tant que l'écran est ouvert (D7) ; le réglage du téléphone revient en sortant
  useEffect(() => {
    void endormir.luminosite(ENDORMIR.luminosite);
    return () => void endormir.luminosite(null);
  }, []);

  // l'écran reste allumé pendant une méthode, et seulement là : à la fin, le délai du téléphone l'éteint
  const methode = etat !== "choix" && etat !== "fin";
  useEffect(() => {
    if (!methode) return;
    activateKeepAwakeAsync("endormir").catch(() => {});
    return () => void deactivateKeepAwake("endormir").catch(() => {});
  }, [methode]);

  useEffect(() => {
    if (etat === "choix") return;
    const s = BackHandler.addEventListener("hardwareBackPress", () => {
      setEtat("choix");
      return true;
    });
    return () => s.remove();
  }, [etat]);

  const auChoix = useCallback(() => setEtat("choix"), []);
  const aLaFin = useCallback(() => setEtat("fin"), []);
  const fermer = () => (router.canGoBack() ? router.back() : router.replace("/sante/sommeil"));

  return (
    <View style={[styles.page, { paddingTop: haut }]}>
      <StatusBar style="light" />
      {etat === "lente" ? (
        <Lente onArreter={auChoix} onFin={aLaFin} />
      ) : etat === "carree" ? (
        <Carree onArreter={auChoix} onFin={aLaFin} />
      ) : etat === "armee" ? (
        <Armee onArreter={auChoix} onFin={aLaFin} />
      ) : etat === "hypnose" ? (
        <Hypnose onArreter={auChoix} onFin={aLaFin} />
      ) : etat === "fin" ? (
        <Fin onArreter={fermer} />
      ) : (
        <Choix onFermer={fermer} onMethode={setEtat} nConseils={liste?.length ?? null} onConseils={() => setConseils(true)} />
      )}
      <Feuille visible={conseils} onFermer={() => setConseils(false)} titre={t("endormir.pourCeSoir")} sousTitre={t("endormir.conseils.sous")}>
        {liste ? <Conseils liste={liste} /> : null}
      </Feuille>
    </View>
  );
}

// ---------------------------------------------------------------- B2 · le choix

function Choix({ onFermer, onMethode, nConseils, onConseils }: { onFermer: () => void; onMethode: (m: Etat) => void; nConseils: number | null; onConseils: () => void }) {
  const { couleurs } = useTheme();
  const groupes = (["respirer", "relacher"] as const).map((g) => ({ g, l: METHODES.filter((m) => m.groupe === g) }));
  return (
    <>
      <Tete onArreter={onFermer} libelleArreter={t("endormir.fermer")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Texte accessibilityRole="header" style={[styles.grandT, { color: couleurs.t1 }]}>
          {t("endormir.titre")}
        </Texte>
        <Texte style={[styles.sousT, { color: couleurs.t2 }]}>{t("endormir.sous")}</Texte>
        {groupes.map(({ g, l }) => (
          <View key={g}>
            <Texte variante="entete" couleur="t2" style={styles.titreGroupe}>
              {t(g === "respirer" ? "endormir.groupe.respirer" : "endormir.groupe.relacher")}
            </Texte>
            <View style={styles.liste}>
              {l.map((m) => {
                const nom = t(`endormir.m.${m.id}`);
                const duree = t("endormir.min", { n: m.minutes });
                // la musique attend ses pistes (D8 : aucun fichier inventé)
                const prete = m.id !== "musique";
                return (
                  <Ligne
                    key={m.id}
                    icone={m.icone}
                    titre={nom}
                    sous={t(`endormir.m.${m.id}.sous`)}
                    valeur={prete ? duree : t("endormir.bientot")}
                    lu={prete ? t("endormir.commencer", { nom, duree }) : t("endormir.indisponible", { nom })}
                    onPress={prete ? () => onMethode(m.id as Etat) : undefined}
                  />
                );
              })}
            </View>
          </View>
        ))}
        <View style={[styles.liste, { marginTop: 14 }]}>
          <Ligne
            icone="ampoule"
            titre={t("endormir.pourCeSoir")}
            sous={nConseils != null ? tp("endormir.pourCeSoir.sous", nConseils) : undefined}
            lu={t("endormir.pourCeSoir.lu")}
            onPress={nConseils != null ? onConseils : undefined}
            carte
          />
        </View>
      </ScrollView>
    </>
  );
}

function Ligne({ icone, titre, sous, mention, valeur, lu, onPress, carte }: { icone: NomIcone; titre: string; sous?: string; mention?: string; valeur?: string; lu: string; onPress?: () => void; carte?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={lu}
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.ligne,
        carte && { backgroundColor: BRAISE(0.06), borderWidth: 1, borderColor: BRAISE(0.1) },
        pressed && { backgroundColor: BRAISE(0.1) },
        !onPress && !carte && { opacity: 0.55 },
      ]}
    >
      <View style={[styles.tuile, { backgroundColor: BRAISE(0.1) }]}>
        <Icone nom={icone} taille={20} couleur={couleurs.t1} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte numberOfLines={2} style={[styles.ligneT, { color: couleurs.t1 }]}>
          {titre}
        </Texte>
        {sous ? (
          <Texte variante="meta" couleur="t2" style={{ marginTop: 2 }}>
            {sous}
          </Texte>
        ) : null}
        {mention ? (
          <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>
            {mention}
          </Texte>
        ) : null}
      </View>
      {valeur ? <Texte style={[styles.ligneV, { color: couleurs.t1 }]}>{valeur}</Texte> : null}
      {onPress ? <Icone nom="right" taille={16} couleur={couleurs.t3} /> : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------- B7 · les conseils du soir (D11)

function Conseils({ liste }: { liste: Conseil[] }) {
  const { couleurs } = useTheme();
  return (
    <View>
      {liste.map((c, i) => {
        const { icone, titre, texte, source } = texteConseil(c);
        return (
          <View key={c.type} style={[styles.conseil, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line }]}>
            <View style={[styles.tuile, styles.tuileC, { backgroundColor: BRAISE(0.1) }]}>
              <Icone nom={icone} taille={20} couleur={couleurs.t1} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Texte style={[styles.conseilT, { color: couleurs.t1 }]}>{titre}</Texte>
              <Texte variante="corps" couleur="t2" style={styles.conseilP}>
                {texte}
              </Texte>
              <Texte variante="meta" couleur="t2" style={{ marginTop: 4 }}>
                {source}
              </Texte>
            </View>
          </View>
        );
      })}
      <Texte couleur="t2" style={styles.note}>
        {t("endormir.conseils.note")}
      </Texte>
    </View>
  );
}

function texteConseil(c: Conseil): { icone: NomIcone; titre: string; texte: string; source: string } {
  if (c.type === "regularite")
    return {
      icone: "horloge",
      titre: t("endormir.conseils.regularite", { n: c.ecart }),
      texte: c.coucher != null ? t("endormir.conseils.regularite.texte", { h: heureMin(c.coucher) }) : t("endormir.conseils.regularite.sansHeure"),
      source: t("endormir.conseils.regularite.source", { n: ENDORMIR.regularite.nuits }),
    };
  if (c.type === "seance")
    return {
      icone: "dumbbell",
      titre: t("endormir.conseils.seance", { h: heureMin(minuteDuJour(c.fin)) }),
      texte: t(c.proche ? "endormir.conseils.seance.proche" : c.coucherConnu ? "endormir.conseils.seance.loin" : "endormir.conseils.seance.neutre"),
      source: c.titre ? t("endormir.conseils.seance.source", { titre: c.titre }) : t("endormir.conseils.seance.sport"),
    };
  return { icone: "lune", titre: t("endormir.conseils.vingt"), texte: t("endormir.conseils.vingt.texte"), source: t("endormir.conseils.vingt.source") };
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#000000" },
  grandT: { marginTop: 6, marginHorizontal: 20, fontFamily: police.medium, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  sousT: { marginTop: 6, marginHorizontal: 20, fontFamily: police.regular, fontSize: 13.5, lineHeight: 19.5 },
  titreGroupe: { marginTop: 26, marginBottom: 8, marginHorizontal: 20 },
  liste: { marginHorizontal: 12 },
  ligne: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14 },
  tuile: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tuileC: { width: 36, height: 36, borderRadius: 10 },
  ligneT: { fontFamily: police.medium, fontSize: 15, lineHeight: 20 },
  ligneV: { fontFamily: police.medium, fontSize: 15, fontVariant: ["tabular-nums"] },
  conseil: { flexDirection: "row", gap: 12, paddingVertical: 12 },
  conseilT: { fontFamily: police.medium, fontSize: 15, lineHeight: 20 },
  conseilP: { marginTop: 3, lineHeight: 19 },
  note: { marginTop: 8, fontFamily: police.regular, fontSize: 12.5, lineHeight: 19 },
});
