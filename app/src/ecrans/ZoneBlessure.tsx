// Zone d'une blessure (planche sante-suivi, D3) : toucher le personnage (Face / Dos) allume le muscle touché et son nom ; le
// côté se choisit dessous ; « Choisir dans la liste » reste pour le lecteur d'écran et les zones cachées. Sans `id` : nouvelle
// blessure (titre = la zone, début aujourd'hui, active) ; avec : la zone de cette blessure change.
// Articulations (planche articulations, D1 à D4) : la bascule Muscle | Articulation, sur la ligne de Face | Dos, montre le
// squelette sous le verre et les 13 articulations en anneaux ; le toucher prend la plus proche, des puces « Proches » lèvent
// le doute. Le type de la blessure suit la zone (depots/suivi.ts). Aucun diagnostic : une zone et un côté.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useLargeurContenu } from "../ui/CadreContenu";
import { router, useIsFocused } from "expo-router";
import Svg, { Circle, Defs, Ellipse, Line, RadialGradient, Stop } from "react-native-svg";
import { creerBlessure, lireBlessure, modifierBlessure, type Cote } from "../db";
import { estArticulation, vuePour } from "../db/zones-blessure";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { carteSante } from "../theme/effets";
import { espace, police, rayon } from "../theme/typo";
import { CorpsSante } from "../ui/3d/CorpsSante";
import { COULEURS_MARQUE, MARQUE } from "../ui/3d/squelette";
import { Segmente } from "../ui/Segmente";
import { NOMS_MUSCLES } from "../ui/3d/muscles";
import { HAUTEUR_CORPS } from "../ui/3d/verre";
import { BoutonPrincipal } from "../ui/Degrade";
import { Texte } from "../ui/Texte";
import { useApp, useCharge } from "./contexte";
import { useMorphologie } from "./morphologie";
import { corpsAffiche } from "./morphologie-calc";
import { jourDe } from "./planif-donnees";
import { coteDe, lirePoint, nomArticulation, nomZone, plusProches, pointsChoisis, sansCote as zoneSansCote, ZONES, ZONES_ARTICULATIONS } from "./suivi-calc";
import { FeuilleChoix } from "./suivi-feuilles";
import { Boutons, EcranSuivi, Groupe, Ligne, TitreGroupe } from "./suivi-ui";
import { useReduit } from "../ui/reduit";

const COTES: readonly Exclude<Cote, "-">[] = ["g", "d", "2"];
const LIBELLE_COTE = { g: "suivi.zone.gauche", d: "suivi.zone.droit", "2": "suivi.zone.lesDeux" } as const;
type ModeZone = "muscle" | "articulation";
/** Bulle : de 150 à 220 dp (« Sacrum et coccyx » ne tient pas en 150) ; le trait part de son bord bas, 30 dp avant 150. */
const BULLE = { haut: 16, h: 62, min: 150, max: 220 } as const;

export function ZoneBlessure({ id }: { id?: string }) {
  useLangue();
  const { db } = useApp();
  const { couleurs, mode } = useTheme();
  const reduit = useReduit();
  const width = useLargeurContenu();
  const morpho = useMorphologie();
  // Le contexte GL ne vit que si l'écran est devant (comme Santé) : recouvert, sa surface n'existe plus.
  const devant = useIsFocused();
  const [f] = useCharge(async (d) => (id ? lireBlessure(d, id) : null), [id]);
  const [dos, setDos] = useState(false);
  const [modeZone, setModeZone] = useState<ModeZone>("muscle");
  // une zone par mode : basculer ne perd pas le muscle choisi
  const [muscle, setMuscle] = useState<string | null>(null);
  const [art, setArt] = useState<string | null>(null);
  const [cote, setCote] = useState<Exclude<Cote, "-">>("d");
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [points, setPoints] = useState<Record<string, { x: number; y: number }>>({});
  const [proches, setProches] = useState<string[]>([]);
  const [liste, setListe] = useState(false);
  useEffect(() => {
    if (!f) return;
    const z = f.blessure.zone;
    if (estArticulation(z)) {
      setModeZone("articulation");
      setArt(z);
      setDos(vuePour(z, "face") === "dos");
    } else setMuscle(z);
    if (f.blessure.cote !== "-") setCote(f.blessure.cote);
  }, [f]);
  const enArt = modeZone === "articulation";
  const zone = enArt ? art : muscle;
  const sansCote = zone != null && zoneSansCote(zone);
  const c = coteDe(zone, cote);
  // changer de mode ou de vue efface les puces (elles ne valent que pour le toucher qui les a fait naître)
  useEffect(() => setProches([]), [modeZone, dos]);
  const choisirPoint = (k: string) => {
    const p = lirePoint(k);
    setArt(p.id);
    if (p.cote !== "-") setCote(p.cote);
  };
  const toucherArt = (x: number, y: number) => {
    const r = plusProches(points, x, y);
    if (!r) return;
    choisirPoint(r.choisi);
    setProches(r.proches);
  };
  // anneaux : neutres, l'articulation choisie en ambre ; le trait de la bulle va au premier point choisi de la vue
  const choisis = enArt ? pointsChoisis(art, c) : [];
  const pointArt = choisis.map((k) => points[k]).find((p) => p != null) ?? null;
  const marque = COULEURS_MARQUE[mode];
  const valider = async () => {
    if (!zone) return;
    if (id) {
      await modifierBlessure(db, id, { zone, cote: c });
      router.back();
      return;
    }
    const nouvel = await creerBlessure(db, { titre: nomZone(zone, c), zone, cote: c, debut: jourDe(Date.now()) });
    router.replace({ pathname: "/blessures/[id]", params: { id: nouvel } });
  };
  const trait = carteSante[mode].trait;
  const cible = enArt ? pointArt : point;

  return (
    <EcranSuivi
      titre={t("suivi.zone.titre")}
      bas={
        // « Valider » en pied, comme les autres pages (il ne flotte plus au milieu de l'écran).
        <View style={styles.pied}>
          <BoutonPrincipal libelle={t("suivi.valider")} desactive={!zone} onPress={() => valider().catch(console.error)} />
        </View>
      }
    >
      {/* D2 : [Muscle | Articulation], plus large, puis [Face | Dos], sur une ligne : le corps garde sa place */}
      <View style={styles.bascules}>
        <Segmente
          doux
          options={[
            { valeur: "muscle", libelle: t("suivi.zone.muscle") },
            { valeur: "articulation", libelle: t("suivi.zone.articulation") },
          ]}
          valeur={modeZone}
          onChange={setModeZone}
          style={{ flex: 1.45 }}
        />
        <Segmente
          doux
          options={[
            { valeur: "face", libelle: t("suivi.zone.face") },
            { valeur: "dos", libelle: t("suivi.zone.dos") },
          ]}
          valeur={dos ? "dos" : "face"}
          onChange={(v) => setDos(v === "dos")}
          style={{ flex: 1 }}
        />
      </View>
      <View style={{ height: HAUTEUR_CORPS, marginTop: espace.s }}>
        {/* Halo rose derrière le personnage : sur le fond sombre, il se lit comme une surface à toucher. */}
        <Svg width={width} height={HAUTEUR_CORPS} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <RadialGradient id="haloZone" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={couleurs.partieSante} stopOpacity={mode === "nuit" ? 0.28 : 0.18} />
              <Stop offset="1" stopColor={couleurs.partieSante} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={width / 2} cy={HAUTEUR_CORPS / 2} rx={width * 0.42} ry={HAUTEUR_CORPS * 0.5} fill="url(#haloZone)" />
        </Svg>
        {devant ? (
        <CorpsSante
          corps={corpsAffiche(morpho)}
          mode={mode}
          reduit={reduit}
          fixe
          dos={dos}
          zones={!enArt && muscle ? [{ zone: muscle, cote: c }] : []}
          articulations={enArt}
          onPoints={enArt ? setPoints : undefined}
          libelle={t(enArt ? "suivi.zone.corpsArt" : "suivi.zone.corps")}
          onToucher={(m, x, y) => {
            if (enArt) return toucherArt(x, y);
            if (!m) return;
            setMuscle(m.zone);
            // de dos, le côté du doigt est celui du personnage vu de derrière : le pixel le dit déjà
            setCote(m.cote);
          }}
          onCentreZone={setPoint}
        />
        ) : null}
        {(zone && cible) || enArt ? (
          <Svg width={width} height={HAUTEUR_CORPS} style={StyleSheet.absoluteFill} pointerEvents="none">
            {zone && cible ? <Line x1={espace.l + BULLE.min - 30} y1={BULLE.haut + BULLE.h} x2={cible.x} y2={cible.y} stroke={trait} strokeWidth={1} /> : null}
            {!enArt && zone && cible ? <Circle cx={cible.x} cy={cible.y} r={3} fill={trait} /> : null}
            {enArt
              ? Object.entries(points).map(([k, p]) =>
                  choisis.includes(k) ? (
                    <Anneau key={k} x={p.x} y={p.y} lis={marque.lis} couleur={marque.ambre} />
                  ) : (
                    <Anneau key={k} x={p.x} y={p.y} lis={marque.lis} couleur={marque.neutre} neutre />
                  ),
                )
              : null}
          </Svg>
        ) : null}
        <View pointerEvents="none" style={[styles.caisse, { backgroundColor: couleurs.verreCarte, borderColor: couleurs.verreFilet }]}>
          <Texte variante="meta" couleur="t2">
            {t(enArt ? "suivi.zone.articulation" : "suivi.zone.muscle")}
          </Texte>
          {zone ? (
            <Texte variante="corps" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 17, fontFamily: police.semibold, color: couleurs.t1 }}>
              {nomZone(zone, c)}
            </Texte>
          ) : (
            <Texte variante="meta" couleur="t2" numberOfLines={2}>
              {t(enArt ? "suivi.zone.toucheArt" : "suivi.zone.touche")}
            </Texte>
          )}
        </View>
        {/* D4 : puces « Proches » dans la bande vide sous les pieds, sur deux rangs s'il le faut */}
        {enArt && proches.length ? (
          <View style={styles.proches} accessibilityRole="radiogroup" accessibilityLabel={t("suivi.zone.prochesLu")}>
            <Texte variante="meta" couleur="t2" style={{ fontSize: 12, marginRight: 2 }}>
              {t("suivi.zone.proches")}
            </Texte>
            {proches.map((k) => {
              const p = lirePoint(k);
              const on = choisis.includes(k);
              return (
                <Pressable
                  key={k}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => choisirPoint(k)}
                  style={({ pressed }) => [
                    styles.puce,
                    { backgroundColor: mode === "nuit" ? couleurs.s2 : couleurs.verreCarte, borderColor: on ? marque.ambre : couleurs.line2, borderWidth: on ? 2 : 1 },
                    pressed && { transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <Texte variante="corps" numberOfLines={1} style={{ fontSize: 13, fontFamily: police.medium, color: couleurs.t1 }}>
                    {nomZone(p.id, p.cote)}
                  </Texte>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
      {sansCote ? null : (
        <>
          <TitreGroupe texte={t("suivi.zone.cote")} />
          <Boutons options={COTES.map((x) => ({ valeur: x, libelle: t(LIBELLE_COTE[x]) }))} valeur={cote} onChange={setCote} />
        </>
      )}
      <Groupe>
        <Ligne
          titre={t("suivi.zone.liste")}
          valeur={enArt ? t("suivi.zone.nbArt", { n: ZONES_ARTICULATIONS.length }) : t("suivi.zone.nb", { n: ZONES.length })}
          doux
          onPress={() => setListe(true)}
        />
      </Groupe>
      <FeuilleChoix
        visible={liste}
        titre={t(enArt ? "suivi.zone.articulation" : "suivi.zone.titre")}
        onFermer={() => setListe(false)}
        enTete={
          enArt ? (
            <Texte variante="meta" couleur="t2" style={styles.sousListe}>
              {t("suivi.zone.sousArt")}
            </Texte>
          ) : undefined
        }
        choix={
          enArt
            ? // de la tête aux pieds (D3)
              ZONES_ARTICULATIONS.map((z) => ({
                cle: z,
                libelle: nomArticulation(z),
                choisi: z === art,
                onPress: () => {
                  setArt(z);
                  // choisie de face, une articulation du dos passe la vue de dos (et la mâchoire de face)
                  setDos(vuePour(z, dos ? "dos" : "face") === "dos");
                  setProches([]);
                  setListe(false);
                },
              }))
            : [...ZONES]
                .sort((a, b) => (NOMS_MUSCLES[a] ?? a).localeCompare(NOMS_MUSCLES[b] ?? b))
                .map((z) => ({
                  cle: z,
                  libelle: NOMS_MUSCLES[z] ?? z,
                  choisi: z === muscle,
                  onPress: () => {
                    setMuscle(z);
                    setListe(false);
                  },
                }))
        }
      />
    </EcranSuivi>
  );
}

/** Anneau d'une articulation (D7) : neutre (fin) ou choisi (ambre et point), toujours sur un liseré (noir la nuit, blanc le jour). */
function Anneau({ x, y, lis, couleur, neutre = false }: { x: number; y: number; lis: string; couleur: string; neutre?: boolean }) {
  const m = neutre ? MARQUE.neutre : MARQUE.ambre;
  return (
    <>
      <Circle cx={x} cy={y} r={m.r} fill="none" stroke={lis} strokeWidth={m.lis} />
      <Circle cx={x} cy={y} r={m.r} fill="none" stroke={couleur} strokeWidth={m.trait} />
      {neutre ? null : <Circle cx={x} cy={y} r={MARQUE.ambre.point} fill={couleur} />}
    </>
  );
}

const styles = StyleSheet.create({
  bascules: { flexDirection: "row", gap: espace.s, marginHorizontal: espace.l, marginTop: espace.xs },
  proches: {
    position: "absolute",
    left: 0,
    right: 0,
    top: HAUTEUR_CORPS - 50,
    minHeight: 48,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: espace.l,
    paddingTop: 2,
  },
  puce: { height: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: "center" },
  sousListe: { marginHorizontal: espace.l, marginBottom: espace.s },
  pied: { paddingHorizontal: espace.l, paddingTop: espace.s, paddingBottom: espace.l },
  caisse: {
    position: "absolute",
    top: 16,
    left: espace.l,
    minWidth: BULLE.min,
    maxWidth: BULLE.max,
    minHeight: BULLE.h,
    borderRadius: rayon.l,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: espace.m,
    paddingVertical: 10,
    justifyContent: "center",
  },
});
