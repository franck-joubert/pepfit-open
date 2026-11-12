// La sieste en cours (planche recuperer, écran 4) : un écran presque noir, même en mode jour (D8 : il se regarde allongé, dans
// la pénombre ; l'écran de veille d'Android prend le relais). Le type de sieste, la minuterie de 64 en graisse fine dans un
// anneau fin, l'heure du réveil ; l'alarme (son et vibration du réglage), la montre qui mesure aussi ; « Je suis réveillé »,
// et « Annuler la sieste » dessous. Les activités (sauna, massage…) ont le même écran, à leur durée.
// L'alarme est une vraie alarme (natif/alarme-recup, comme une appli Horloge) : elle sonne sur le flux ALARME et vibre appli
// fermée, écran verrouillé, en mode silencieux et en « Ne pas déranger » (priorité, alarmes seulement). Une ligne discrète
// dit ce qui la couperait vraiment (silence total, alarmes bloquées, volume à zéro). Sans le module natif (APK ancien),
// notification d'expo-notifications ; sans l'autorisation des notifications, l'écran vibre seul à l'heure.
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Vibration, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { lireSexe } from "../../db/depots/profil";
import { lireReglage } from "../../db/depots/reglages";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { alarmeRecup, type DiagAlarme } from "../../natif/alarme-recup";
import { notificationsPermises } from "../../natif/notifications";
import { sante } from "../../natif/sante";
import { police } from "../../theme/typo";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { Texte } from "../../ui/Texte";
import { useApp } from "../contexte";
import { heure } from "../format";
import { avertissementAlarme, siesteSonne, siesteVibre, VIBRATION_SIESTE, type AvertissementAlarme } from "../alerte-sieste";
import { RECUPERER, type EnCoursRecup as Session } from "../recuperer";
import { annulerRecup, lireEnCoursRecup, lireReglagesRecup, terminerRecup, type ReglagesRecup } from "../recuperer-session";
import { typeRecupTexte } from "./briques";

/** Les couleurs de l'écran sombre, les mêmes de jour comme de nuit. */
const S = { fond: "#050204", t1: "rgba(255,255,255,0.92)", t2: "rgba(255,255,255,0.62)", t3: "rgba(255,255,255,0.44)", piste: "rgba(255,255,255,0.08)", rose: "#ff4f9a", bouton: "rgba(255,255,255,0.1)" };
const R = 124;
const C = 2 * Math.PI * R;

/** La ligne discrète de ce qui couperait l'alarme (Android : Ne pas déranger, volume ; iPhone : réglages de notifications). */
const CLE_COUPE = {
  total: "recuperer.enCours.alarmeTotal",
  bloquee: "recuperer.enCours.alarmeBloquee",
  volume: "recuperer.enCours.alarmeVolume",
  retard: "recuperer.enCours.alarmeRetard",
  notifications: "recuperer.enCours.alarmeNotifications",
  sons: "recuperer.enCours.alarmeSons",
  urgentes: "recuperer.enCours.alarmeUrgentes",
  silencieux: "recuperer.enCours.alarmeSilencieux",
} as const satisfies Record<AvertissementAlarme, string>;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** « Sieste éclair · 20 min », « Un cycle complet · 90 min », « Sieste libre », « Sauna · 15 min ». */
function libelle(e: Session): string {
  if (e.type === "sieste") {
    if (e.choisi == null) return t("recuperer.enCours.siesteLibre");
    const titre = e.choisi === RECUPERER.sieste.eclair ? t("recuperer.sieste.eclair") : typeRecupTexte("sieste");
    return t("recuperer.enCours.sieste", { titre, n: e.choisi });
  }
  return e.choisi != null ? t("recuperer.enCours.activite", { nom: typeRecupTexte(e.type), n: e.choisi }) : t("recuperer.enCours.libre", { nom: typeRecupTexte(e.type) });
}

export function EnCoursRecup() {
  useLangue();
  const { db } = useApp();
  const [e, setE] = useState<Session | null | undefined>(undefined);
  const [r, setR] = useState<ReglagesRecup | null>(null);
  const [montre, setMontre] = useState(false);
  const [feminin, setFeminin] = useState(false);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [diag, setDiag] = useState<DiagAlarme | null>(null);
  const vibree = useRef(false);
  // la notification touchée ouvre l'écran avec ?silence=1 : l'alarme se tait (le plein écran, lui, la laisse sonner)
  const { silence } = useLocalSearchParams<{ silence?: string }>();
  useEffect(() => {
    if (silence === "1") alarmeRecup.arreter().catch(() => {});
  }, [silence]);

  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      Promise.all([
        lireEnCoursRecup(db),
        lireReglagesRecup(db),
        lireReglage(db, "whoop_connecte").catch(() => null),
        sante.autorisees().catch((): string[] => []),
        lireSexe(db).catch(() => null),
        alarmeRecup.diagnostic().catch(() => null),
      ])
        .then(([s, reg, whoop, aut, sexe, d]) => {
          if (!vivant) return;
          setE(s);
          setDiag(d);
          setR(reg);
          setMontre(whoop === "1" || (aut as string[]).includes("sommeil"));
          setFeminin(sexe === "f");
          if (!s) router.back();
        })
        .catch(console.error);
      return () => {
        vivant = false;
      };
    }, [db]),
  );

  useEffect(() => {
    const h = setInterval(() => setMaintenant(Date.now()), 250);
    return () => clearInterval(h);
  }, []);

  // l'heure est passée, appli ouverte : l'alarme native sonne et vibre seule ; sans elle, la notification fait sonner et vibrer
  // (notifications-appli) ; sans l'autorisation des notifications, l'écran vibre
  const fini = e?.alarme != null && maintenant >= e.alarme;
  useEffect(() => {
    if (!fini || vibree.current || !r || !siesteVibre(r.alerte) || alarmeRecup.natif) return;
    vibree.current = true;
    notificationsPermises()
      .then((ok) => {
        if (!ok) Vibration.vibrate(VIBRATION_SIESTE);
      })
      .catch(() => {});
  }, [fini, r]);

  const reveille = () =>
    terminerRecup(db)
      .then((id) => {
        Vibration.cancel();
        if (id) router.replace({ pathname: "/recuperer/fin", params: { id } });
        else router.back();
      })
      .catch(signalerErreur());
  const annuler = () =>
    annulerRecup(db)
      .then(() => {
        Vibration.cancel();
        router.back();
      })
      .catch(signalerErreur());

  if (!e) return <View style={{ flex: 1, backgroundColor: S.fond }} />;
  const total = e.alarme != null ? (e.alarme - e.debut) / 1000 : null;
  const ecoule = (maintenant - e.debut) / 1000;
  const reste = total != null ? Math.max(0, total - ecoule) : null;
  const part = total != null ? Math.min(1, ecoule / total) : 0;
  const sieste = e.type === "sieste";
  const sous = fini
    ? t("recuperer.enCours.cEstLHeure")
    : e.alarme != null
      ? t(sieste ? "recuperer.enCours.reveil" : "recuperer.enCours.fin", { heure: heure(e.alarme) })
      : t("recuperer.enCours.depuis", { heure: heure(e.debut) });
  const alerte = r ? t(`recuperer.alerteChoix.${r.alerte}`) : "";
  const coupe = e.alarme != null ? avertissementAlarme(diag, !r || siesteSonne(r.alerte)) : null;
  return (
    <View style={{ flex: 1, backgroundColor: S.fond }}>
      <StatusBar style="light" />
      {/* une lueur rose très basse, sans bord (relecture critique de la planche, n° 3) */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="lueur" cx="50%" cy="110%" rx="120%" ry="60%" fx="50%" fy="110%">
            <Stop offset="0" stopColor="#e5178b" stopOpacity={0.16} />
            <Stop offset="0.45" stopColor="#8a2be2" stopOpacity={0.06} />
            <Stop offset="0.75" stopColor={S.fond} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#lueur)" />
      </Svg>
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
        <View style={styles.centre}>
          <Texte style={[styles.lib, { color: S.t2 }]}>{libelle(e)}</Texte>
          <View
            style={styles.minuterie}
            accessible
            accessibilityRole="timer"
            accessibilityLabel={reste != null ? t("recuperer.enCours.reste", { m: Math.floor(reste / 60), s: Math.floor(reste % 60), fin: sous }) : `${mmss(ecoule)}, ${sous}`}
          >
            <Svg width={264} height={264} viewBox="0 0 264 264" style={StyleSheet.absoluteFill}>
              <Circle cx={132} cy={132} r={R} fill="none" stroke={S.piste} strokeWidth={3} />
              {total != null ? (
                <Circle
                  cx={132}
                  cy={132}
                  r={R}
                  fill="none"
                  stroke={S.rose}
                  strokeOpacity={0.75}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray={`${C} ${C}`}
                  strokeDashoffset={C * (1 - part)}
                  transform="rotate(-90 132 132)"
                />
              ) : null}
            </Svg>
            <View style={styles.dedans}>
              <Texte style={[styles.chiffre, { color: S.t1 }]}>{mmss(reste ?? ecoule)}</Texte>
              <Texte style={[styles.sous, { color: S.t2 }]}>{sous}</Texte>
            </View>
          </View>
          <Texte style={[styles.info, { color: S.t3 }]}>
            {[
              e.alarme != null && r ? t("recuperer.enCours.alerte", { alerte }) : null,
              coupe ? t(CLE_COUPE[coupe]) : null,
              sieste && montre ? t("recuperer.enCours.montre") : null,
            ]
              .filter(Boolean)
              .join("\n")}
          </Texte>
        </View>
        <View style={styles.bas}>
          <Pressable accessibilityRole="button" onPress={reveille} style={({ pressed }) => [styles.reveil, { backgroundColor: pressed ? "rgba(255,255,255,0.16)" : S.bouton }]}>
            <Texte style={[styles.reveilTexte, { color: S.t1 }]}>{sieste ? t(feminin ? "recuperer.enCours.reveilleF" : "recuperer.enCours.reveille") : t("recuperer.enCours.fini")}</Texte>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={annuler} style={styles.petit}>
            <Texte style={[styles.petitTexte, { color: S.t3 }]}>{sieste ? t("recuperer.enCours.annulerSieste") : t("recuperer.enCours.annuler")}</Texte>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingBottom: 40 },
  lib: { fontFamily: police.medium, fontSize: 14 },
  minuterie: { width: 264, height: 264, marginTop: 22 },
  dedans: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  chiffre: { fontFamily: police.light, fontSize: 64, letterSpacing: -1.9, lineHeight: 70, fontVariant: ["tabular-nums"] },
  sous: { fontFamily: police.regular, fontSize: 14, marginTop: 10, fontVariant: ["tabular-nums"] },
  info: { fontFamily: police.regular, fontSize: 13, lineHeight: 21, marginTop: 26, textAlign: "center" },
  bas: { paddingHorizontal: 24, paddingBottom: 20, alignItems: "center", gap: 6, alignSelf: "center", width: "100%", maxWidth: 448 },
  reveil: { alignSelf: "stretch", height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  reveilTexte: { fontFamily: police.semibold, fontSize: 16 },
  petit: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16 },
  petitTexte: { fontFamily: police.regular, fontSize: 13 },
});
