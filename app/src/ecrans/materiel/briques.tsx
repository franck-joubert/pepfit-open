// Briques des feuilles du matériel (planche materiel, briques.mjs et style.css) : en-tête de feuille, pas à pas − valeur +,
// grille des poids, puces, tuiles de barre, disque et barre dessinés, résultat, pavé « Autre poids ». Jetons du thème seulement.
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { net, type FormeBarre, type Unite } from "../../db/materiel";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { cible, espace, police } from "../../theme/typo";
import { BarrePicto } from "../../ui/DessinBarre";
import { Icone, type NomIcone } from "../../ui/Icone";
import { Segmente } from "../../ui/Segmente";
import { Texte } from "../../ui/Texte";
import { nombre } from "../format";

export const nb = (v: number): string => nombre(net(v), 2);

/** En-tête d'une feuille du matériel : titre et sous-titre à gauche, retour éventuel, kg / lbs à droite. */
export function EnteteFeuille({ titre, sous, unite, onUnite, onRetour }: { titre: string; sous?: string; unite?: Unite; onUnite?: (u: Unite) => void; onRetour?: () => void }) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.tete}>
      {onRetour ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t("ui.retour")} onPress={onRetour} hitSlop={4} style={styles.retour}>
          <Icone nom="back" couleur={couleurs.t1} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="titre" style={{ fontSize: 18 }} accessibilityRole="header">
          {titre}
        </Texte>
        {sous ? (
          <Texte variante="corps" couleur="t2" style={{ marginTop: 1 }}>
            {sous}
          </Texte>
        ) : null}
      </View>
      {unite && onUnite ? (
        <Segmente
          mini
          options={[
            { valeur: "kg", libelle: "kg" },
            { valeur: "lbs", libelle: "lbs" },
          ]}
          valeur={unite}
          onChange={onUnite}
        />
      ) : null}
    </View>
  );
}

/** Fond des pas à pas (groupe de la feuille), une ligne par réglage. */
export function Bloc({ children, style }: { children: ReactNode; style?: object }) {
  const { couleurs } = useTheme();
  return <View style={[styles.bloc, { backgroundColor: couleurs.feuilleGroupe }, style]}>{children}</View>;
}

/** Pas à pas : libellé (et son aide), − valeur +. Les deux boutons font 44 × 44. */
export function PlusMoins({
  libelle, aide, avant, valeur, unite, onMoins, onPlus, moinsOff, plusOff, premier, fort,
}: {
  libelle: string;
  aide?: string;
  /** Devant le libellé : le disque dessiné d'une ligne de disques. */
  avant?: ReactNode;
  valeur: string;
  unite?: string;
  onMoins: () => void;
  onPlus: () => void;
  moinsOff?: boolean;
  plusOff?: boolean;
  premier?: boolean;
  /** Ligne de disques : libellé en gras, ligne un peu plus basse. */
  fort?: boolean;
}) {
  const { couleurs } = useTheme();
  const bouton = (icone: NomIcone, off: boolean | undefined, onPress: () => void, lu: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={lu}
      accessibilityState={{ disabled: !!off }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [styles.pmB, { backgroundColor: pressed ? couleurs.s2 : couleurs.s3 }, off && { opacity: 0.38 }]}
    >
      <Icone nom={icone} couleur={couleurs.t1} taille={20} />
    </Pressable>
  );
  return (
    <View
      style={[styles.pm, fort && { minHeight: 56 }, !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line }]}
      accessibilityLabel={`${libelle}, ${valeur}${unite ? ` ${unite}` : ""}`}
    >
      <View style={[{ flex: 1, minWidth: 0 }, avant ? styles.pmAvant : null]}>
        {avant}
        <View style={{ flexShrink: 1 }}>
          <Texte variante={fort ? "saisie" : "libelle"} style={fort ? { fontFamily: police.semibold } : { fontSize: 15 }}>
            {libelle}
          </Texte>
          {aide ? (
            <Texte variante="meta" couleur="t3" style={{ marginTop: 1, lineHeight: 16 }}>
              {aide}
            </Texte>
          ) : null}
        </View>
      </View>
      {bouton("moins", moinsOff, onMoins, t("materiel.moins", { libelle }))}
      <Texte variante="saisie" style={styles.pmV} numberOfLines={1} adjustsFontSizeToFit>
        {valeur}
        {unite ? (
          <Texte variante="corps" couleur="t2" style={{ fontFamily: police.medium }}>
            {` ${unite}`}
          </Texte>
        ) : null}
      </Texte>
      {bouton("plus", plusOff, onPlus, t("materiel.plus", { libelle }))}
    </View>
  );
}

/** Grille des poids : un poids qu'on a est plein ; un toucher l'ajoute ou le retire. `hors` : poids ajoutés hors grille, cerclés. */
export function Grille({ valeurs, choisis, onBasculer, colonnes = 6, hors = [], unite }: { valeurs: readonly number[]; choisis: readonly number[]; onBasculer: (v: number) => void; colonnes?: number; hors?: readonly number[]; unite: Unite }) {
  const { couleurs } = useTheme();
  const rangs: (number | null)[][] = [];
  for (let i = 0; i < valeurs.length; i += colonnes) {
    const r: (number | null)[] = valeurs.slice(i, i + colonnes);
    while (r.length < colonnes) r.push(null);
    rangs.push(r);
  }
  return (
    <View style={{ gap: espace.s }} accessibilityRole="none">
      {rangs.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", gap: espace.s }}>
          {r.map((v, j) => {
            if (v == null) return <View key={`v${j}`} style={{ flex: 1 }} />;
            const on = choisis.includes(v);
            return (
              <Pressable
                key={v}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${nb(v)} ${unite}`}
                onPress={() => onBasculer(v)}
                style={({ pressed }) => [
                  styles.case,
                  { backgroundColor: on ? couleurs.t1 : pressed ? couleurs.s3 : couleurs.s2 },
                  hors.includes(v) && on && { borderWidth: 1.5, borderColor: couleurs.t1 },
                ]}
              >
                <Texte variante="saisie" numberOfLines={1} adjustsFontSizeToFit style={{ color: on ? couleurs.bg : couleurs.t2, fontFamily: on ? police.semibold : police.medium, fontSize: 15 }}>
                  {nb(v)}
                </Texte>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Puces à toucher (postes, cardio, petites masses, poids de disque à ajouter) : pleine si on l'a, sinon cerclée. */
export function Puce({ libelle, on, onPress, icone, role = "checkbox" }: { libelle: string; on?: boolean; onPress: () => void; icone?: NomIcone; role?: "checkbox" | "button" }) {
  const { couleurs } = useTheme();
  const ic = on ? "check" : icone;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === "checkbox" ? { checked: !!on } : undefined}
      accessibilityLabel={libelle}
      onPress={onPress}
      style={({ pressed }) => [
        styles.puce,
        on ? { backgroundColor: couleurs.t1, paddingLeft: 11 } : { borderWidth: 1, borderColor: couleurs.line2, backgroundColor: pressed ? couleurs.s2 : "transparent" },
        ic && !on ? { paddingLeft: 11 } : null,
      ]}
    >
      {ic ? <Icone nom={ic} couleur={on ? couleurs.bg : couleurs.t2} taille={16} /> : null}
      <Texte variante="libelle" style={{ color: on ? couleurs.bg : couleurs.t2, fontFamily: on ? police.semibold : police.regular }}>
        {libelle}
      </Texte>
    </Pressable>
  );
}

export function Puces({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.puces, style]}>{children}</View>;
}

/** Résultat sous les réglages : ce que ça donne, en grand ; d'où ça vient, dessous. */
export function Resultat({ titre, sous, premier = true }: { titre: string; sous?: string; premier?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.res, !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line, marginTop: espace.s }]} accessibilityLiveRegion="polite">
      <Texte variante="titre" style={{ fontSize: 22, letterSpacing: -0.2, lineHeight: 27 }}>
        {titre}
      </Texte>
      {sous ? (
        <Texte variante="corps" couleur="t2" style={{ marginTop: 4 }}>
          {sous}
        </Texte>
      ) : null}
    </View>
  );
}

/** Titre de section d'une feuille (« Disques  en paires »). */
export function Section({ titre, extra }: { titre: string; extra?: string }) {
  return (
    <View style={styles.sec}>
      <Texte variante="exercice" style={{ fontSize: 14 }}>
        {titre}
      </Texte>
      {extra ? (
        <Texte variante="corps" couleur="t2" style={{ fontFamily: police.medium }}>
          {extra}
        </Texte>
      ) : null}
    </View>
  );
}

/** Lien texte (« Passer au cardio ») : 44 de haut, t2. */
export function LienTexte({ libelle, onPress }: { libelle: string; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.lien, pressed && { opacity: 0.6 }]}>
      <Texte variante="libelle" style={{ fontFamily: police.medium, color: couleurs.t2 }}>
        {libelle}
      </Texte>
    </Pressable>
  );
}

// ---------------------------------------------------------------- dessins

const DIM: Record<string, [number, number]> = {
  "25": [44, 10], "20": [42, 9], "15": [37, 8], "10": [31, 7], "7.5": [28, 7], "5": [23, 6], "2.5": [18, 5], "2": [17, 5], "1.5": [15, 4.5],
  "1.25": [14, 4], "1": [13, 4], "0.5": [10, 3.5],
};
/** Hauteur et épaisseur d'un disque de profil, à l'échelle de son poids en kg. */
export const dimDisque = (kg: number): [number, number] => DIM[String(net(kg))] ?? [Math.max(10, Math.min(44, 10 + kg * 1.4)), 5];

/** Un disque vu de profil, à l'échelle de son poids (en kg). */
export function DisqueDessin({ kg }: { kg: number }) {
  const { couleurs } = useTheme();
  const [h, w] = dimDisque(kg);
  return (
    <Svg width={16} height={44} viewBox="0 0 16 44" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x={(16 - w) / 2} y={(44 - h) / 2} width={w} height={h} rx={1.6} fill={couleurs.t2} />
    </Svg>
  );
}

/** Tuiles des six types de barre, trois par rang. */
export function TuilesBarre({ formes, choisie, onChoisir }: { formes: readonly FormeBarre[]; choisie: FormeBarre; onChoisir: (f: FormeBarre) => void }) {
  const { couleurs } = useTheme();
  const rangs = [formes.slice(0, 3), formes.slice(3, 6)];
  return (
    <View style={{ gap: espace.s }} accessibilityRole="radiogroup">
      {rangs.map((r, i) => (
        <View key={i} style={{ flexDirection: "row", gap: espace.s }}>
          {r.map((f) => {
            const on = f === choisie;
            return (
              <Pressable
                key={f}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={t(`materiel.barre.${f}`)}
                onPress={() => onChoisir(f)}
                style={({ pressed }) => [styles.tuile, { backgroundColor: on ? couleurs.t1 : pressed ? couleurs.s3 : couleurs.s2 }]}
              >
                <BarrePicto forme={f} couleur={on ? couleurs.bg : couleurs.t2} largeur={40} />
                <Texte variante="corps" style={{ color: on ? couleurs.bg : couleurs.t2, fontFamily: on ? police.semibold : police.medium }}>
                  {t(`materiel.tuile.${f}`)}
                </Texte>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------- pavé « Autre poids »

/** Saisie d'un poids au pavé (la touche Valider devient Ajouter). Renvoie la valeur ou rien. */
export function PavePoids({ unite, aide, onAjouter }: { unite: Unite; aide: (v: string) => string; onAjouter: (v: number) => void }) {
  const { couleurs } = useTheme();
  const [s, setS] = useState("");
  const v = Number(s.replace(",", "."));
  const ok = s !== "" && Number.isFinite(v) && v > 0;
  const taper = (c: string) =>
    setS((x) => {
      if (c === "," && (x.includes(",") || x === "")) return x;
      if (x.includes(",") && x.split(",")[1]!.length >= 2) return x;
      if (x.replace(",", "").length >= 5) return x;
      return x === "0" && c !== "," ? c : x + c;
    });
  const touche = (c: string, style?: object) => (
    <Pressable
      key={c}
      accessibilityRole="button"
      accessibilityLabel={c}
      onPress={() => taper(c)}
      style={({ pressed }) => [styles.touche, { backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe }, style]}
    >
      <Texte variante="titre" style={{ fontSize: 24, fontFamily: police.regular }}>
        {c}
      </Texte>
    </Pressable>
  );
  return (
    <View>
      <View style={styles.saisie} accessibilityLiveRegion="polite">
        <Texte variante="titreFort" style={{ fontSize: 40, fontFamily: police.semibold }}>
          {s || "0"}
        </Texte>
        <Texte variante="saisie" couleur="t2" style={{ marginLeft: 4 }}>
          {unite}
        </Texte>
      </View>
      <Texte variante="meta" couleur="t3" style={{ textAlign: "center", marginBottom: espace.m, minHeight: 16 }}>
        {ok ? aide(nb(v)) : ""}
      </Texte>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <View style={{ flex: 3, gap: 6 }}>
          {[["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]].map((r) => (
            <View key={r[0]} style={{ flexDirection: "row", gap: 6 }}>
              {r.map((c) => touche(c))}
            </View>
          ))}
          <View style={{ flexDirection: "row", gap: 6 }}>
            {touche(",")}
            {touche("0", { flex: 2 })}
          </View>
        </View>
        <View style={{ width: 96, gap: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("materiel.effacer")}
            onPress={() => setS((x) => x.slice(0, -1))}
            style={({ pressed }) => [styles.touche, { flex: 0, height: 52, backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe }]}
          >
            <Icone nom="efface" couleur={couleurs.t1} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !ok }}
            disabled={!ok}
            onPress={() => {
              onAjouter(net(v));
              setS("");
            }}
            style={[styles.touche, styles.valider, { backgroundColor: couleurs.valide }, !ok && { opacity: 0.38 }]}
          >
            <Icone nom="check" couleur={couleurs.bg} taille={20} />
            <Texte variante="exercice" style={{ color: couleurs.bg }}>
              {t("ui.ajouter")}
            </Texte>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Liste de React à séparer par des filets (lignes de la fiche, sans clés en double). */

const styles = StyleSheet.create({
  tete: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 52, marginBottom: 2 },
  retour: { width: cible.min, height: cible.min, marginLeft: -10, alignItems: "center", justifyContent: "center" },
  bloc: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 4 },
  pm: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 60, paddingVertical: 6 },
  pmAvant: { flexDirection: "row", alignItems: "center", gap: 10 },
  pmB: { width: cible.min, height: cible.min, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  pmV: { minWidth: 76, textAlign: "center", fontFamily: police.semibold, fontSize: 18 },
  case: { flex: 1, height: cible.min, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  puces: { flexDirection: "row", flexWrap: "wrap", gap: espace.s },
  puce: { minHeight: cible.min, paddingHorizontal: 14, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 6 },
  res: { paddingTop: 14, paddingBottom: 2 },
  sec: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 },
  lien: { minHeight: cible.min, alignItems: "center", justifyContent: "center", marginTop: espace.s },
  tuile: { flex: 1, minHeight: 72, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 4 },
  saisie: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", paddingVertical: espace.s },
  touche: { flex: 1, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  valider: { flex: 1, flexDirection: "row", gap: 6 },
});
