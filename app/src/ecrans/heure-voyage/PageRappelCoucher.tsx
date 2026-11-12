// Le rappel de coucher (planche sommeil, c4) : l'aperçu de la notification, l'interrupteur (éteint par défaut, D15), le
// délai avant le coucher, le plan suivi ou non, et l'heure des séances planifiées en voyage (D14).
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { villeDuFuseau } from "../../i18n/fuseaux";
import { lireActif, lireDetecte, t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { rafraichirRappelCoucher } from "../../natif/rappel-coucher";
import { useTheme } from "../../theme";
import { police } from "../../theme/typo";
import { Icone } from "../../ui/Icone";
import { Segmente } from "../../ui/Segmente";
import { Texte } from "../../ui/Texte";
import { useApp, useCharge } from "../contexte";
import { Groupe, MARGE, Note, PageMesure, TitreGroupe, useMesure } from "../mesures/gabarit";
import { LigneReglage } from "../Reglage";
import { prochainChangement } from "./changement-heure";
import { type ChoixSeances, ecrireReglagesHeure, lireReglagesHeure, lireRythme, type ReglagesHeure } from "./donnees";
import { duree, ecartFuseaux, heureMin, instantDans, jourDans } from "./horloge";
import { AVANTS, corpsRappel, soirsRappel, titreRappel } from "./rappel-coucher";

/** La séance de l'exemple (planche : « ta séance de 7:30 »). */
const SEANCE_MIN = 7 * 60 + 30;

export function PageRappelCoucher() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const maintenant = useMemo(() => Date.now(), []);
  const [x, recharger] = useCharge(async (db) => ({ r: await lireReglagesHeure(db), rythme: await lireRythme(db, maintenant) }), [], undefined, "sommeil/rappel");
  const changer = async (n: Partial<ReglagesHeure>) => {
    await ecrireReglagesHeure(db, n);
    await recharger();
    void rafraichirRappelCoucher(db, { demander: n.rappel === true });
  };
  if (!x) return <PageMesure titre={t("heureVoyage.rappel")}>{null}</PageMesure>;
  const { r, rythme } = x;
  const fuseau = lireActif().fuseau;
  const changement = prochainChangement(instantDans(jourDans(maintenant, fuseau), 0, fuseau), fuseau, 11);
  const soir = soirsRappel({ maintenant, fuseau, rythme, changement, voyage: r.voyage, avant: r.avant, suivrePlan: r.suivrePlan })[0];
  return (
    <PageMesure titre={t("heureVoyage.rappel")} actualiser={false}>
      <Apercu titre={titreRappel(r.avant)} corps={soir ? corpsRappel(soir) : t("heureVoyage.rappelSansRythme")} />
      <Groupe style={{ marginTop: 16 }}>
        <LigneReglage premier libelle={t("heureVoyage.rappel")} sous={<Sous texte={t("heureVoyage.rappelSous")} />} interrupteur={{ valeur: r.rappel, onChange: (v) => void changer({ rappel: v }) }} />
        <View style={[styles.quand, { borderTopColor: couleurs.line2 }]}>
          <Texte variante="saisie" style={styles.libelle}>
            {t("heureVoyage.quand")}
          </Texte>
          <Sous texte={t("heureVoyage.quandSous")} />
          <View style={styles.puces}>
            {AVANTS.map((a) => (
              <Puce key={a} libelle={duree(a)} choisie={r.avant === a} onPress={() => void changer({ avant: a })} />
            ))}
          </View>
        </View>
        <LigneReglage libelle={t("heureVoyage.pendantPlan")} sous={<Sous texte={t("heureVoyage.pendantPlanSous")} />} interrupteur={{ valeur: r.suivrePlan, onChange: (v) => void changer({ suivrePlan: v }) }} />
      </Groupe>
      {!rythme ? <Note style={{ marginHorizontal: MARGE }}>{t("heureVoyage.rappelSansRythme")}</Note> : null}
      <Seances r={r} maintenant={maintenant} onChange={(seances) => void changer({ seances })} />
    </PageMesure>
  );
}

function Sous({ texte }: { texte: string }) {
  return (
    <Texte variante="corps" couleur="t2" style={styles.sous}>
      {texte}
    </Texte>
  );
}

/** Aperçu de la notification (planche : .notif) : l'appli, le titre, la phrase du premier soir. */
function Apercu({ titre, corps }: { titre: string; corps: string }) {
  const m = useMesure();
  return (
    <View style={[styles.notif, { backgroundColor: m.groupe }]} accessible accessibilityLabel={`${t("heureVoyage.apercu")} : ${titre}. ${corps}`}>
      <View style={styles.app}>
        <View style={[styles.pastille, { backgroundColor: m.fort }]}>
          <Icone nom="lune" couleur="#ffffff" taille={12} />
        </View>
        <Texte variante="meta" couleur="t2">
          {t("heureVoyage.notifApp")}
        </Texte>
      </View>
      <Texte style={styles.notifTitre}>{titre}</Texte>
      <Texte variante="corps" couleur="t2" style={{ marginTop: 2, lineHeight: 20 }}>
        {corps}
      </Texte>
    </View>
  );
}

/** Puce du délai : 44 de haut, choisie = liseré et texte d'accent (planche : .puce.on). */
function Puce({ libelle, choisie, onPress }: { libelle: string; choisie: boolean; onPress: () => void }) {
  const m = useMesure();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: choisie }}
      accessibilityLabel={libelle}
      onPress={onPress}
      style={({ pressed }) => [styles.puce, { backgroundColor: m.voile, borderColor: choisie ? m.fort : "transparent", opacity: pressed ? 0.7 : 1 }]}
    >
      <Texte style={[styles.puceTexte, choisie && { color: m.fort, fontFamily: police.semibold }]}>{libelle}</Texte>
    </Pressable>
  );
}

/** Les séances planifiées en voyage (D14) : heure du lieu ou heure de chez soi, avec l'exemple de 7:30. */
function Seances({ r, maintenant, onChange }: { r: ReglagesHeure; maintenant: number; onChange: (c: ChoixSeances) => void }) {
  const m = useMesure();
  const maison = r.maison ?? lireDetecte().fuseau;
  const chez = villeDuFuseau(maison);
  const v = r.voyage && r.voyage.destination !== maison ? r.voyage : null;
  const heure = heureMin(SEANCE_MIN);
  const note =
    r.seances === "lieu"
      ? v
        ? t("heureVoyage.noteLieu", { heure, chez, lieu: villeDuFuseau(v.destination) })
        : t("heureVoyage.noteLieuSans", { heure })
      : v
        ? t("heureVoyage.noteMaison", { heure, chez, lieu: villeDuFuseau(v.destination), heureLieu: heureMin(SEANCE_MIN + ecartFuseaux(maintenant, maison, v.destination)) })
        : t("heureVoyage.noteMaisonSans", { chez });
  return (
    <>
      <TitreGroupe>{t("heureVoyage.seancesTitre")}</TitreGroupe>
      <View style={{ marginHorizontal: MARGE }}>
        <Segmente
          doux
          options={[
            { valeur: "lieu", libelle: t("heureVoyage.heureLieu") },
            { valeur: "maison", libelle: t("heureVoyage.heureDe", { ville: chez }) },
          ]}
          valeur={r.seances}
          onChange={(c) => onChange(c as ChoixSeances)}
        />
      </View>
      <Note style={{ marginHorizontal: MARGE }}>{note}</Note>
      {r.voyage ? null : (
        <Pressable accessibilityRole="link" onPress={() => router.push("/sante/voyage")} style={styles.lien}>
          <Texte variante="corps" style={{ color: m.fort, fontFamily: police.medium }}>
            {t("heureVoyage.ajouter")}
          </Texte>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  notif: { marginTop: 4, marginHorizontal: MARGE, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16 },
  app: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  pastille: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  notifTitre: { fontFamily: police.semibold, fontSize: 15, lineHeight: 20 },
  quand: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderTopWidth: StyleSheet.hairlineWidth },
  libelle: { fontSize: 16 },
  sous: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  puces: { flexDirection: "row", gap: 8, marginTop: 12 },
  puce: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  puceTexte: { fontFamily: police.medium, fontSize: 15, fontVariant: ["tabular-nums"] },
  lien: { minHeight: 44, justifyContent: "center", marginHorizontal: MARGE, marginTop: 8, alignSelf: "flex-start" },
});
