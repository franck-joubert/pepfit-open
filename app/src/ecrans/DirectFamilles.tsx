// Suivi en direct des familles 2 à 5 (planche familles-sports, lots 2 à 4, décisions du 30/10) : un seul écran (SuiviDirect),
// le même squelette, une boîte au milieu qui change de contenu. Ici, ce que les familles ajoutent : la courbe de FC (intérieur,
// sports et cours), la scène du sport (sans capteur de FC, et la récupération), le chrono à largeur fixe et la FC des sports et
// cours, le compte à rebours de la récupération. La logique est dans direct-familles.ts.
import { useState, type ReactNode } from "react";
import { Image, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { useSharedValue } from "react-native-reanimated";
import { texteEffort } from "./mesures/scores-calc";
import { t } from "../i18n/index";
import type { EchantillonFc } from "../natif/suivi/types";
import { useTheme } from "../theme";
import type { Jetons } from "../theme/jetons";
import { espace, police, rayon } from "../theme/typo";
import { fichierPicto } from "../ui/pictos";
import { Texte } from "../ui/Texte";
import { ENTREE, RepartFin } from "./BlocEffort";
import { compteRebours, fcDeLaSeance } from "./direct-familles";
import { ChiffresListe } from "./GuidageDirect";
import { nombre } from "./format";
import { pictoSport } from "./lanceur-sports";
import { chronoTexte, zoneDe } from "./suivi-direct-vue";
import { bornesDe, maxDe, type RefZones } from "./zones-fc";

const couleurZone = (c: Jetons, z: number) => c[`zone${Math.max(1, z)}` as keyof Jetons] as string;

/** La boîte du milieu : à la place de la carte, même marge, même rayon ; elle prend la hauteur qui reste. */
export function BoiteDirect({ children, centre }: { children: ReactNode; centre?: boolean }) {
  const { couleurs } = useTheme();
  return <View style={[styles.boite, centre && styles.centre, { backgroundColor: couleurs.s1, borderColor: couleurs.line }]}>{children}</View>;
}

/** La scène du sport : son picto 3D, sur la boîte ; `part` : sa taille dans la boîte (réduite en récupération, correction 9). */
export function SceneSport({ slug, part = 0.78 }: { slug: string | null; part?: number }) {
  const src = fichierPicto(pictoSport(slug), null, 512);
  if (src == null) return null;
  return <Image source={src} style={{ width: `${part * 100}%`, height: `${part * 100}%` }} resizeMode="contain" accessibilityIgnoresInvertColors />;
}

/**
 * Courbe de FC de la séance (intérieur, sports et cours) : colorée par zone, seuils en pointillé, zone visée en bande pâle,
 * bornes ajustées aux données ; le dernier point marque la FC du moment. Pas de moyenne ici : elle est dans les chiffres
 * (correction 5 du 30/10).
 */
export function CourbeFcDirect({ fc, fcMax, cible }: { fc: readonly EchantillonFc[]; fcMax: RefZones; cible: number | null }) {
  const { couleurs } = useTheme();
  const [taille, setTaille] = useState({ l: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: l, height: h } = e.nativeEvent.layout;
    setTaille((x) => (x.l === l && x.h === h ? x : { l, h }));
  };
  const bornes = bornesDe(fcMax);
  const haut = [...bornes.slice(1), maxDe(fcMax) + 1];
  const pas = Math.max(1, Math.ceil(fc.length / 300));
  const pts = fc.filter((_, i) => i % pas === 0 || i === fc.length - 1);
  const finS = Math.max(60, (pts.at(-1)?.s ?? 0) / 1000);
  const plus = Math.max(...pts.map((p) => p.bpm), cible ? haut[cible - 1]! : 0) + 4;
  const y0 = bornes[0] - 7;
  const y1 = (haut.find((b) => b >= plus) ?? haut[4]!) + 6;
  const { l, h } = taille;
  const lg = Math.max(0, l - 26);
  const hg = Math.max(0, h - 16);
  const X = (s: number) => (s / 1000 / finS) * lg;
  const Y = (b: number) => 2 + (1 - (Math.min(Math.max(b, y0), y1) - y0) / (y1 - y0)) * (hg - 4);
  // Morceaux d'une même zone (le point de jonction appartient aux deux).
  const morceaux: { z: number; d: string }[] = [];
  let prec: string | null = null;
  for (const p of pts) {
    const z = Math.max(1, zoneDe(p.bpm, fcMax));
    const xy = `${X(p.s).toFixed(1)},${Y(p.bpm).toFixed(1)}`;
    const der = morceaux.at(-1);
    if (der && der.z === z) der.d += `L${xy}`;
    else morceaux.push({ z, d: prec ? `M${prec}L${xy}` : `M${xy}` });
    prec = xy;
  }
  const minutes = finS / 60;
  const pasMin = minutes <= 40 ? 10 : minutes <= 90 ? 15 : 30;
  const grad = Array.from({ length: Math.floor(minutes / pasMin) + 1 }, (_, i) => i * pasMin).filter((m) => m * 60 <= finS - pasMin * 15);
  const der = pts.at(-1);
  return (
    <View style={styles.courbe}>
      <Texte couleur="t2" style={styles.courbeT}>
        {t("gps.fcSeance")}
      </Texte>
      <View style={{ flex: 1 }} onLayout={onLayout} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {l > 0 && h > 0 && pts.length >= 2 ? (
          <Svg width={l} height={h}>
            {cible ? <Rect x={0} y={Y(haut[cible - 1]!)} width={lg} height={Math.max(0, Y(bornes[cible - 1]!) - Y(haut[cible - 1]!))} fill={couleurZone(couleurs, cible)} opacity={0.1} /> : null}
            {bornes.slice(1).filter((b) => b < y1).map((b) => (
              <Line key={b} x1={0} x2={lg} y1={Y(b)} y2={Y(b)} stroke={couleurs.line2} strokeDasharray="2 4" />
            ))}
            {[1, 2, 3, 4, 5].filter((z) => bornes[z - 1]! < y1).map((z) => (
              <SvgText key={z} x={l - 20} y={(Y(bornes[z - 1]!) + Y(haut[z - 1]!)) / 2 + 4} fontSize={10.5} fontFamily={police.medium} fill={couleurZone(couleurs, z)}>
                {`Z${z}`}
              </SvgText>
            ))}
            {morceaux.map((m, i) => (
              <Path key={i} d={m.d} fill="none" stroke={couleurZone(couleurs, m.z)} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {der ? <Circle cx={X(der.s)} cy={Y(der.bpm)} r={4.5} fill={couleurZone(couleurs, zoneDe(der.bpm, fcMax))} stroke={couleurs.s1} strokeWidth={2.5} /> : null}
            {grad.map((m) => (
              <SvgText key={m} x={X(m * 60_000)} y={h - 1} fontSize={10.5} fontFamily={police.medium} fill={couleurs.t3} textAnchor={m === 0 ? "start" : "middle"}>
                {m === grad.at(-1) && m > 0 ? `${m} min` : String(m)}
              </SvgText>
            ))}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

/** Chrono à largeur fixe (correction 6 du 30/10) : la place de « 0:00:00 » est gardée dès 0:00, la FC à côté ne bouge pas. */
function ChronoFixe({ ms, pause }: { ms: number; pause: boolean }) {
  const { couleurs } = useTheme();
  return (
    <View>
      <Texte style={[styles.chrono, { opacity: 0 }]} accessible={false}>
        0:00:00
      </Texte>
      <Texte style={[styles.chrono, styles.chronoVrai, { color: pause ? couleurs.t3 : couleurs.t1 }]} accessibilityRole="timer">
        {chronoTexte(ms)}
      </Texte>
    </View>
  );
}

/** FC des sports et cours : la valeur et sa zone en mots ; la barre des zones, dessous, remplace la mini-jauge. */
function FcSimple({ bpm, fcMax }: { bpm: number | null; fcMax: RefZones }) {
  const { couleurs } = useTheme();
  const z = bpm != null ? zoneDe(bpm, fcMax) : 0;
  return (
    <View style={styles.fc} accessibilityLabel={bpm != null ? `${bpm} ${t("gps.bpm")}${z ? `, ${t("gps.zone", { n: z })}` : ""}` : undefined}>
      <View style={styles.fcV}>
        <Texte style={styles.fcB}>{bpm != null ? String(bpm) : "—"}</Texte>
        <Texte couleur="t2" style={styles.fcU}>
          {t("gps.bpm")}
        </Texte>
      </View>
      {z ? <Texte style={[styles.fcZ, { color: couleurZone(couleurs, z) }]}>{t("gps.zone", { n: z })}</Texte> : null}
    </View>
  );
}

/**
 * Sports et cours en direct : le chrono en grand (seul élément fort), la FC et sa zone, le temps par zone ; la boîte montre la
 * courbe de FC, ou la scène du sport sans capteur (correction 3) ; dessous les pas (sauf motocross, voile…), l'effort de la
 * séance et la FC moyenne.
 */
export function SeanceDirect({ tempsMs, pause, fc, fcVue, bpm, fcMax, slug, pas, effort }: {
  tempsMs: number;
  pause: boolean;
  fc: readonly EchantillonFc[];
  fcVue: boolean;
  bpm: number | null;
  fcMax: RefZones;
  slug: string | null;
  /** null : pas masqués pour ce sport ; « — » sans donnée. */
  pas: number | null | undefined;
  effort: number | null;
}) {
  const fige = useSharedValue<number>(ENTREE.fin);
  const s = fcVue ? fcDeLaSeance(fc, fcMax) : null;
  const items: { valeur: string; unite?: string; libelle: string }[] = [];
  if (pas !== undefined) items.push({ valeur: pas == null ? "—" : nombre(pas, 0), libelle: t("gps.pas") });
  // L'Effort pepfit, le chiffre seul ; sans FC, il vient du barème du sport : estimé, « ~ » (approx).
  items.push({ valeur: effort == null ? "—" : texteEffort(effort), libelle: t("gps.effort") });
  if (s?.moy != null) items.push({ valeur: String(s.moy), unite: t("gps.bpm"), libelle: t("gps.fcMoyenne") });
  return (
    <>
      <View style={styles.bloc}>
        <View style={styles.rang}>
          <View>
            <ChronoFixe ms={tempsMs} pause={pause} />
            <Texte couleur="t2" style={styles.lib}>
              {pause ? t("gps.enPause") : t("gps.duree")}
            </Texte>
          </View>
          {fcVue ? <FcSimple bpm={bpm} fcMax={fcMax} /> : null}
        </View>
        {s ? (
          <View style={styles.zones}>
            <RepartFin vue={{ zonesS: s.zones, zonesFc: typeof fcMax === "number" ? null : fcMax }} t={fige} />
          </View>
        ) : null}
      </View>
      <BoiteDirect centre={!(fcVue && fc.length >= 2)}>
        {fcVue && fc.length >= 2 ? <CourbeFcDirect fc={fc} fcMax={fcMax} cible={null} /> : <SceneSport slug={slug} />}
      </BoiteDirect>
      <ChiffresListe items={items} />
    </>
  );
}

/**
 * Récupération en direct : la boîte porte le chrono (ou le compte à rebours d'une durée visée, D11), la scène du sport en petit
 * (correction 9) ; ni FC, ni zones, ni effort.
 */
export function RecupDirect({ tempsMs, pause, slug, lieu, viseeS }: { tempsMs: number; pause: boolean; slug: string | null; lieu: string | null; viseeS: number | null }) {
  const { couleurs } = useTheme();
  const r = viseeS ? compteRebours(tempsMs / 1000, viseeS) : null;
  const gros = r ? (r.atteint ? `+${chronoTexte(r.depasseS * 1000)}` : chronoTexte(r.resteS * 1000)) : chronoTexte(tempsMs);
  const lib = pause
    ? t("gps.enPause")
    : r
      ? r.atteint
        ? t("gps.dureeAtteinte")
        : t("gps.resteSur", { d: t("gps.guide.minCourt", { n: Math.round(viseeS! / 60) }) })
      : lieu
        ? t("gps.dureeLieu", { lieu })
        : t("gps.duree");
  const couleur = pause ? couleurs.t3 : r?.atteint ? couleurs.valide : couleurs.t1;
  return (
    <BoiteDirect centre>
      <View style={styles.sceneP}>
        <SceneSport slug={slug} part={1} />
      </View>
      <Texte style={[styles.recup, { color: couleur }]} accessibilityRole="timer" numberOfLines={1} adjustsFontSizeToFit>
        {gros}
      </Texte>
      <Texte couleur="t2" style={[styles.lib, { textAlign: "center", color: r?.atteint && !pause ? couleurs.valide : couleurs.t2 }]}>
        {lib}
      </Texte>
      {r && !r.atteint ? (
        <View style={[styles.piste, { backgroundColor: couleurs.s3 }]}>
          <View style={{ width: `${Math.min(100, (tempsMs / 1000 / viseeS!) * 100)}%`, height: "100%", backgroundColor: couleurs.action, borderRadius: 2 }} />
        </View>
      ) : null}
    </BoiteDirect>
  );
}

const styles = StyleSheet.create({
  boite: { flex: 1, minHeight: 0, marginTop: 14, marginHorizontal: espace.l, borderRadius: rayon.l, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  centre: { alignItems: "center", justifyContent: "center" },
  courbe: { flex: 1, paddingTop: 12, paddingBottom: 10, paddingLeft: 14, paddingRight: 12 },
  courbeT: { fontSize: 12, marginBottom: 6 },
  bloc: { paddingTop: 4, paddingHorizontal: espace.l },
  rang: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: espace.s },
  chrono: { fontFamily: police.light, fontSize: 72, lineHeight: 84, letterSpacing: -2.2, includeFontPadding: false, fontVariant: ["tabular-nums"] },
  chronoVrai: { position: "absolute", left: 0, top: 0 },
  lib: { fontSize: 13, marginTop: -2 },
  fc: { alignItems: "flex-end", paddingBottom: 10 },
  fcV: { flexDirection: "row", alignItems: "baseline" },
  fcB: { fontFamily: police.light, fontSize: 34, lineHeight: 38, letterSpacing: -0.7, fontVariant: ["tabular-nums"] },
  fcU: { fontSize: 14, marginLeft: 3 },
  fcZ: { fontFamily: police.semibold, fontSize: 13, marginTop: 4 },
  zones: { marginTop: 14 },
  sceneP: { width: "62%", height: "48%", alignItems: "center", justifyContent: "center" },
  recup: { fontFamily: police.light, fontSize: 96, lineHeight: 104, letterSpacing: -3.4, includeFontPadding: false, fontVariant: ["tabular-nums"], marginTop: espace.l },
  piste: { width: "60%", height: 4, borderRadius: 2, overflow: "hidden", marginTop: espace.l },
});
