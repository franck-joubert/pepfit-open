// Fin de sieste (planche recuperer, écran 5) : « Sieste enregistrée », sans aucun geste à faire ; la mesure de la montre est
// celle qui compte. « Ce que ça change » : « à rattraper » (avant → après) et le reste pour la nuit, la vigilance, la
// Récupération de demain (un peu, poids réduit), la nuit (sa note ne change pas), puis ce que la sieste ne fait pas (planche
// sommeil, A4). « Comment tu te sens ? », facultatif (D13). « Terminé ».
// Une activité : « C'est noté », ses heures, ses kcal (sauna, bain froid), et qu'elle n'ajoute aucun point. La même page
// s'ouvre depuis « Ce que tu as fait pour récupérer » et les siestes de la page Sommeil ; la corbeille la supprime.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { lireSexe } from "../../db/depots/profil";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useTheme } from "../../theme";
import { police } from "../../theme/typo";
import { AuraFond } from "../../ui/AuraFond";
import { BoutonPrincipal } from "../../ui/Degrade";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { useApp } from "../contexte";
import { heure } from "../format";
import { Groupe, LigneMesure, Lignes, MARGE, TitreGroupe, useMesure } from "../mesures/gabarit";
import { lireSommeilDuJour } from "../mesures/sommeil-donnees";
import { instantCoucher } from "../mesures/sommeil-dette";
import { hm } from "../mesures/sommeil-stats";
import { arrondiDette } from "../recup-pepfit";
import { RESSENTIS, sommeilSieste, type Ressenti } from "../recuperer";
import { lireRecup, supprimerRecup, type ActiviteFaite } from "../recuperer-donnees";
import { ecouterReleve, enAttenteDeMontre } from "../recuperer-releve";
import { noterRessenti } from "../recuperer-session";
import { Choix, kcalRecup, minTexte, minutesDe, sourceRecup, typeRecupTexte } from "./briques";

export function FinRecup() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const m = useMesure();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [a, setA] = useState<ActiviteFaite | null | undefined>(undefined);
  const [dette, setDette] = useState<{ avant: number; apres: number; soirs: number; coucher: number | null } | null>(null);
  const [kcal, setKcal] = useState<number | null>(null);
  const [ressenti, setRessenti] = useState<Ressenti | null>(null);
  const [feminin, setFeminin] = useState(false);
  const [attente, setAttente] = useState(false);
  // la mesure de la montre arrive après la sieste (recuperer-releve.ts) : l'écran se relit alors tout seul
  const [relu, setRelu] = useState(0);
  useEffect(() => ecouterReleve(() => setRelu((n) => n + 1)), []);

  useEffect(() => {
    if (!id) return;
    let vivant = true;
    (async () => {
      const x = await lireRecup(db, id);
      const [d, k, sexe, enAttente] = await Promise.all([
        x?.type === "sieste" ? lireSommeilDuJour(db, new Date(new Date().setHours(0, 0, 0, 0)).getTime()).catch(() => null) : Promise.resolve(null),
        x ? kcalRecup(db, x.type, minutesDe(x), x.debut).catch(() => null) : Promise.resolve(null),
        lireSexe(db).catch(() => null),
        x?.type === "sieste" && x.sommeilMin == null ? enAttenteDeMontre(db, id).catch(() => false) : Promise.resolve(false),
      ]);
      if (!vivant) return;
      setA(x);
      setAttente(enAttente);
      setRessenti(x?.ressenti ?? null);
      setFeminin(sexe === "f");
      setKcal(k);
      // « à rattraper » avant et après CETTE sieste, si elle est d'aujourd'hui (le même calcul que la page Sommeil)
      const auj = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
      if (x && d?.dette.chiffre && x.debut >= auj) {
        const apres = d.dette.aRattraper;
        setDette({ avant: Math.min(d.matin.dette.aRattraper, apres + sommeilSieste(x)), apres, soirs: d.dette.soirs, coucher: d.coucher });
      }
    })().catch(console.error);
    return () => {
      vivant = false;
    };
  }, [db, id, relu]);

  const fermer = () => (router.canGoBack() ? router.back() : router.replace("/sante/recuperation"));
  const choisir = (r: Ressenti) => {
    if (!a) return;
    const v = ressenti === r ? null : r;
    setRessenti(v);
    noterRessenti(db, a.id, v).catch(signalerErreur());
  };
  const supprimer = () => a && supprimerRecup(db, a.id).then(fermer, signalerErreur());

  const sieste = a?.type === "sieste";
  const source = a ? sourceRecup(a) : null;
  const n = a && sieste ? sommeilSieste(a) : 0;
  const texte = !a
    ? ""
    : sieste
      ? a.sommeilMin != null && source
        ? t("recuperer.finSieste.mesure", { debut: heure(a.debut), fin: heure(a.fin), appareil: t(a.sources.includes("whoop") ? "recuperer.finSieste.bracelet" : "recuperer.finSieste.montre"), n })
        : t(
            attente ? (a.mode === "minuteur" ? "recuperer.finSieste.attente" : "recuperer.finSieste.attenteLibre") : a.mode === "minuteur" ? "recuperer.finSieste.minuteur" : "recuperer.finSieste.libre",
            { debut: heure(a.debut), fin: heure(a.fin), n },
          )
      : t("recuperer.finActivite.texte", { debut: heure(a.debut), fin: heure(a.fin), n: minutesDe(a) });
  // vigilance : plus alerte une demi-heure après le réveil, pendant 1 h 30 environ (aux 5 min)
  const vigilance = a && sieste ? Math.round((a.fin + 30 * 60_000) / 300_000) * 300_000 : 0;
  const resteTexte = !dette
    ? ""
    : dette.apres <= 0
      ? t("recuperer.finSieste.rattraperRien")
      : dette.coucher != null
        ? t("recuperer.finSieste.rattraperSous", { heure: heure(instantCoucher(dette.coucher)), soirs: tp("mesuresSommeil.soirs", dette.soirs) })
        : t("recuperer.finSieste.rattraperNuit");
  const ressentiTexte = (r: Ressenti) => t(`recuperer.finSieste.${r}${feminin && r !== "pareil" ? "_f" : ""}` as "recuperer.finSieste.repose");

  return (
    <View style={{ flex: 1, backgroundColor: couleurs.fondSante }}>
      <AuraFond partie="sante" fixe />
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
        <View style={styles.tete}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("recuperer.fermer")} onPress={fermer} style={styles.bi}>
            <Icone nom="close" couleur={couleurs.t1} taille={22} />
          </Pressable>
          {a ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t("ui.supprimer")} onPress={supprimer} style={styles.bi}>
              <Icone nom="trash" couleur={couleurs.t2} taille={20} />
            </Pressable>
          ) : null}
        </View>
        {a ? (
          <View style={{ flex: 1 }}>
            <View style={styles.finTete}>
              <View style={[styles.coche, { backgroundColor: m.voile }]}>
                <Icone nom="check" couleur={m.fort} taille={26} epaisseur={2.4} />
              </View>
              <Texte variante="titreFort" style={styles.titre}>
                {sieste ? t("recuperer.finSieste.titre") : `${typeRecupTexte(a.type)}, ${t("recuperer.finActivite.titre")}`}
              </Texte>
              <Texte variante="libelle" couleur="t2" style={styles.texte}>
                {texte}
              </Texte>
            </View>
            {sieste ? (
              <>
                <TitreGroupe>{t("recuperer.finSieste.change")}</TitreGroupe>
                <Groupe>
                  <Lignes>
                    {[
                      dette ? (
                        <LigneMesure
                          key="d"
                          titre={t("recuperer.finSieste.rattraper")}
                          sous={resteTexte}
                          libelle={t("recuperer.finSieste.rattraperLu", { avant: hm(arrondiDette(dette.avant)), apres: hm(arrondiDette(dette.apres)), reste: resteTexte })}
                          sousValeur={
                            <Texte style={styles.fleche}>
                              <Texte style={[styles.fleche, { color: couleurs.t3, fontFamily: police.medium, textDecorationLine: "line-through" }]}>{hm(arrondiDette(dette.avant))}</Texte>
                              {` → ${hm(arrondiDette(dette.apres))}`}
                            </Texte>
                          }
                        />
                      ) : null,
                      <LigneMesure
                        key="v"
                        titre={t("recuperer.finSieste.vigilance")}
                        sous={t("recuperer.finSieste.vigilanceSous")}
                        valeur={`${heure(vigilance)} → ${heure(vigilance + 90 * 60_000)}`}
                      />,
                      <LigneMesure key="r" titre={t("recuperer.finSieste.demain")} sous={t("recuperer.finSieste.demainSous")} />,
                      <LigneMesure key="n" titre={t("recuperer.finSieste.nuit")} sous={t("recuperer.finSieste.nuitSous")} />,
                    ]}
                  </Lignes>
                </Groupe>
                {n > 0 ? (
                  <Texte variante="corps" couleur="t2" style={styles.note}>
                    {t("recuperer.finSieste.honnete", { n })}
                  </Texte>
                ) : null}
                <TitreGroupe>{t("recuperer.finSieste.sens")}</TitreGroupe>
                <View accessibilityRole="radiogroup" accessibilityLabel={t("recuperer.finSieste.sensLu")} style={styles.puces}>
                  {RESSENTIS.map((r) => (
                    <Choix
                      key={r}
                      centre
                      radio={false}
                      choisi={ressenti === r}
                      onPress={() => choisir(r)}
                      libelle={ressentiTexte(r)}
                      style={{ flex: 1 }}
                      gauche={
                        <Texte numberOfLines={1} style={styles.puce}>
                          {ressentiTexte(r)}
                        </Texte>
                      }
                    />
                  ))}
                </View>
                <Texte variante="corps" couleur="t2" style={styles.note}>
                  {t("recuperer.finSieste.facultatif")}
                </Texte>
              </>
            ) : (
              <>
                {kcal != null ? (
                  <Groupe style={{ marginTop: 20 }}>
                    <LigneMesure titre={typeRecupTexte(a.type)} sous={t("recuperer.finActivite.kcal", { n: kcal })} valeur={minTexte(minutesDe(a))} />
                  </Groupe>
                ) : null}
                <Texte variante="corps" couleur="t2" style={styles.note}>
                  {t("recuperer.finActivite.aucunPoint")}
                </Texte>
              </>
            )}
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <View style={styles.bas}>
          <BoutonPrincipal libelle={t("recuperer.termine")} onPress={fermer} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  tete: { height: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 6 },
  bi: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  finTete: { paddingTop: 8, paddingHorizontal: MARGE },
  coche: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  titre: { marginTop: 8, letterSpacing: -0.36 },
  texte: { marginTop: 6, lineHeight: 20 },
  fleche: { fontFamily: police.semibold, fontSize: 15, fontVariant: ["tabular-nums"] },
  puces: { flexDirection: "row", gap: 8, marginTop: 8, marginHorizontal: MARGE },
  puce: { fontFamily: police.medium, fontSize: 14 },
  note: { fontSize: 12.5, lineHeight: 19, marginTop: 10, marginHorizontal: MARGE },
  bas: { paddingHorizontal: MARGE, paddingBottom: 16, width: "100%", maxWidth: 672, alignSelf: "center" },
});
