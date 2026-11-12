// Anneaux de Sport (planche sport-stats v2, S2 et S3) : la piste, le remplissage de la couleur de son état (orange en cours,
// vert atteint, rouge trop loin) et, sur l'effort, le petit trait de l'idéal à l'extérieur de l'anneau. Trois tailles : la
// rangée (40 dp, l'icône de l'Accueil au centre), la ligne fixe (20 dp) et le héros de la page Effort (104 dp).
// Le trait est blanc translucide la nuit (30/10 : « fais la blanche transparente plutôt sur mode nuit »), brun très
// foncé translucide le jour : le blanc se perdait sur l'aura pêche (limite des planches sport-stats S3 et effort-pepfit). Remplissage à l'arrivée et quand la valeur change : 700 ms, comme l'Anneau de
// Santé ; le trait ne bouge pas. « Réduire les animations » : posé d'un coup.
// `morphe` (page Activité, planche du 09/11) : l'anneau garde la boîte de la grande jauge, ses rayon et trait suivent l'avancement
// de la métamorphose sur le fil UI (animatedProps, jamais d'échelle du Svg : elle épaissirait le trait) ; la boîte entière est
// mise à l'échelle par le parent. Le trait de l'arc est posé sur un tiret aussi long que le plus grand tour : seul le décalage
// bouge (un nombre), même quand le rayon change.
import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useAnimatedProps, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../theme";
import { avecOpacite } from "../theme/teintes";
import { Icone, type NomIcone } from "../ui/Icone";
import { courbes } from "../ui/mouvement";
import { useReduit } from "../ui/reduit";
import type { EtatJauge } from "./effort-pepfit";
import { geometrieAnneau, type Mesures } from "./metamorphose-jauges";

const CercleAnime = Animated.createAnimatedComponent(Circle);

/** Géométrie de la planche (anneauSvg) : boîte, rayon et épaisseur de l'anneau, rayon et épaisseur du trait. */
const GEO = {
  rangee: { vb: 48, r: 18, ep: 4, rz: 22.6, epz: 2.4 },
  mini: { vb: 48, r: 17, ep: 6, rz: 23.2, epz: 3 },
  grand: { vb: 96, r: 40, ep: 7, rz: 47, epz: 3.2 },
} as const;

/** Couleurs de l'anneau : piste, remplissage selon l'état, trait de l'idéal. */
export function useCouleursAnneau() {
  const { couleurs, mode } = useTheme();
  return {
    piste: mode === "nuit" ? "rgba(255,255,255,0.14)" : avecOpacite(couleurs.partieEntrainement, 0.14),
    trait: mode === "nuit" ? "rgba(255,255,255,0.6)" : "rgba(43,16,2,0.55)",
    etat: { cours: couleurs.partieEntrainement, ok: couleurs.valide, alerte: couleurs.rate } as Record<EtatJauge, string>,
  };
}

export function AnneauSport({
  part,
  zone = null,
  etat,
  taille,
  geo = "rangee",
  icone,
  anime = true,
  morphe,
}: {
  part: number;
  /** Arc de la cible, en parts du tour sur l'échelle de 0 à 10 (zoneAnneau). */
  zone?: [number, number] | null;
  etat: EtatJauge;
  taille: number;
  geo?: keyof typeof GEO;
  icone?: NomIcone;
  anime?: boolean;
  /** Métamorphose : avancement (0 grande, 1 petite) et mesures de la grande jauge ; avec `geo="grand"` et `taille` = 96 × k. */
  morphe?: { p: SharedValue<number>; mesures: Mesures };
}) {
  const { couleurs } = useTheme();
  const c = useCouleursAnneau();
  const reduit = useReduit();
  const g = GEO[geo];
  const m = g.vb / 2;
  const tour = 2 * Math.PI * g.r;
  const t = Math.max(0, Math.min(1, part));
  const p = useSharedValue(anime && !reduit ? 0 : t);
  useEffect(() => {
    p.value = anime && !reduit ? withDelay(80, withTiming(t, { duration: 700, easing: courbes.sortie })) : t;
  }, [t, anime, reduit, p]);
  const arc = useAnimatedProps((): { r?: number; strokeWidth?: number; strokeDashoffset?: number } => {
    if (!morphe) return { strokeDashoffset: tour * (1 - p.value) };
    const m = geometrieAnneau(morphe.p.value, morphe.mesures);
    return { r: m.rayon, strokeWidth: m.epaisseur, strokeDashoffset: tour - p.value * 2 * Math.PI * m.rayon };
  });
  const piste = useAnimatedProps((): { r?: number; strokeWidth?: number } => {
    if (!morphe) return {};
    const m = geometrieAnneau(morphe.p.value, morphe.mesures);
    return { r: m.rayon, strokeWidth: m.epaisseur };
  });
  const traitZone = useAnimatedProps((): { strokeWidth?: number } => (morphe ? { strokeWidth: geometrieAnneau(morphe.p.value, morphe.mesures).epaisseurZone } : {}));
  const tz = 2 * Math.PI * g.rz;
  return (
    <View style={{ width: taille, height: taille, alignItems: "center", justifyContent: "center" }} accessible={false} importantForAccessibility="no-hide-descendants">
      {/* Marge de 2 unités autour de la boîte : le trait de l'idéal (rz + epz / 2) en déborde un peu, et Android coupe un Svg
          à ses bords malgré overflow visible (31/10 : « la zone idéale est coupée à gauche »). */}
      <Svg
        width={(taille * (g.vb + 4)) / g.vb}
        height={(taille * (g.vb + 4)) / g.vb}
        viewBox={`-2 -2 ${g.vb + 4} ${g.vb + 4}`}
        style={{ position: "absolute", left: (-taille * 2) / g.vb, top: (-taille * 2) / g.vb }}
      >
        {morphe ? (
          <CercleAnime cx={m} cy={m} r={g.r} fill="none" stroke={c.piste} strokeWidth={g.ep} animatedProps={piste} />
        ) : (
          <Circle cx={m} cy={m} r={g.r} fill="none" stroke={c.piste} strokeWidth={g.ep} />
        )}
        {t > 0 ? (
          <CercleAnime
            cx={m}
            cy={m}
            r={g.r}
            fill="none"
            stroke={c.etat[etat]}
            strokeWidth={g.ep}
            strokeLinecap="round"
            strokeDasharray={`${tour} ${tour}`}
            animatedProps={arc}
            transform={`rotate(-90 ${m} ${m})`}
          />
        ) : null}
        {zone ? (
          morphe ? (
            <CercleAnime
              cx={m}
              cy={m}
              r={g.rz}
              fill="none"
              stroke={c.trait}
              strokeWidth={g.epz}
              animatedProps={traitZone}
              strokeLinecap="round"
              strokeDasharray={`${tz * Math.max(0.001, zone[1] - zone[0])} ${tz}`}
              strokeDashoffset={-tz * zone[0]}
              transform={`rotate(-90 ${m} ${m})`}
            />
          ) : (
            <Circle
              cx={m}
              cy={m}
              r={g.rz}
              fill="none"
              stroke={c.trait}
              strokeWidth={g.epz}
              strokeLinecap="round"
              strokeDasharray={`${tz * Math.max(0.001, zone[1] - zone[0])} ${tz}`}
              strokeDashoffset={-tz * zone[0]}
              transform={`rotate(-90 ${m} ${m})`}
            />
          )
        ) : null}
      </Svg>
      {icone ? <Icone nom={icone} couleur={couleurs.t2} taille={18} /> : null}
    </View>
  );
}
