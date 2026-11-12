import type { ReactNode } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import type { Plat } from "../../db";
import { uriPhoto } from "../../photos";
import { useTheme } from "../../theme";
import { espace, rayon } from "../../theme/typo";
import type { Macros, Unite } from "../../nutrition/calculs";
import type { ProduitFige } from "../../nutrition/plats";
import { useOmbreCarte } from "../../ui/ContextePartie";
import { Icone } from "../../ui/Icone";
import { chiffresNutrition, useChiffresNutrition } from "./mode-affichage";
import { Texte } from "../../ui/Texte";
import { t, tp } from "../../i18n/index";
import { approx, nombre } from "../format";
import { fraction, libelleUnite, LigneValeurs, MACROS, Rangee, useCouleursMacros } from "./commun";

// Pièces des plats (planche plats, validée le 30/10) : la carte d'ingrédients aux colonnes du journal (en-tête P · G · L ·
// Suc., chaque ingrédient avec son étiquette de quantité et ses valeurs), la carte des valeurs (1 portion, 100 g, plat
// entier), la vignette d'un plat (photo ou cocotte).

/** Carte de la planche (`.carte`) : fond s1, rayon 12, ombre douce et filet. */
export function CartePlat({ children, style }: { children: ReactNode; style?: object }) {
  const { couleurs } = useTheme();
  const ombre = useOmbreCarte();
  return <View style={[styles.carte, { backgroundColor: couleurs.s1, borderColor: couleurs.verreFilet, boxShadow: ombre }, style]}>{children}</View>;
}

/** En-tête des colonnes (`.tb.hd`) : P, G, L, Suc. dans la couleur de chaque valeur. */
export function EnteteColonnes({ premiere }: { premiere?: string }) {
  const c = useCouleursMacros();
  const { couleurs } = useTheme();
  if (!useChiffresNutrition()) return null;
  return (
    <View style={styles.hd}>
      <Rangee
        cellules={[
          <Texte key="t" variante="entete" couleur="t3" numberOfLines={1}>
            {premiere ?? ""}
          </Texte>,
          ...MACROS.map((m) => (
            <Texte key={m.cle} variante="entete" numberOfLines={1} style={{ color: c[m.cle] ?? couleurs.t3 }}>
              {t(m.court)}
            </Texte>
          )),
        ]}
      />
    </View>
  );
}

/** « 1 boîte · 400 g », « ¼ pièce · 38 g », « 125 g » : la quantité d'un ingrédient (en fractions, comme la roue). */
export function texteIngredient(i: { quantite_g: number; unite: Unite; nb_unites: number; produit: Pick<ProduitFige, "base" | "portions"> }): string {
  const base = i.produit.base === "100ml" ? t("nutrition.ml") : t("nutrition.g");
  const g = `${nombre(i.quantite_g, i.quantite_g < 10 ? 1 : 0)} ${base}`;
  if (i.unite === "g") return g;
  const p = i.produit.portions.find((x) => x.type === i.unite);
  return `${fraction(i.nb_unites)} ${libelleUnite(i.unite, p?.libelle)}, ${g}`;
}

/** Ligne d'un ingrédient (`.al2`) : nom (et « ajusté »), étiquette de quantité (teintée si ajustée), valeurs ; toucher = sa roue. */
export function LigneIngredient({ nom, quantite, m, ajuste, onPress, onLongPress }: { nom: string; quantite: string; m: Macros; ajuste?: boolean; onPress?: () => void; onLongPress?: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${nom}${ajuste ? `, ${t("plats.ajuste")}` : ""}, ${quantite}`}
      disabled={!onPress}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.al, pressed && { backgroundColor: couleurs.s2 }]}
    >
      <View style={styles.l1}>
        <Texte variante="corps" numberOfLines={1} style={{ flex: 1, fontSize: 15, color: couleurs.t1 }}>
          {nom}
          {ajuste ? (
            <Texte variante="meta" couleur="t3">
              {`  ${t("plats.ajuste")}`}
            </Texte>
          ) : null}
        </Texte>
        <EtiquetteQuantite texte={quantite} ajuste={ajuste} />
      </View>
      <View style={{ marginTop: 5 }}>
        <LigneValeurs m={m} niveau="aliment" />
      </View>
    </Pressable>
  );
}

/** Étiquette de quantité (`.qt`, rayon 6) ; ajustée, teintée du vert de la Nutrition (`.qt.on`). */
export function EtiquetteQuantite({ texte, ajuste }: { texte: string; ajuste?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.qt, { backgroundColor: ajuste ? `${couleurs.partieNutrition}38` : couleurs.s2 }]}>
      <Texte variante="meta" numberOfLines={1} style={{ color: ajuste ? couleurs.t1 : couleurs.t2 }}>
        {texte}
      </Texte>
    </View>
  );
}

/** « + Ajouter un ingrédient » au pied d'une carte (`.ajt`), filet au-dessus. */
export function AjoutCarte({ libelle, onPress }: { libelle: string; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.ajt, { borderTopColor: couleurs.line }, pressed && { backgroundColor: couleurs.s2 }]}>
      <Icone nom="plus" couleur={couleurs.t2} taille={20} />
      <Texte variante="corps" couleur="t2" style={{ fontSize: 15 }}>
        {libelle}
      </Texte>
    </Pressable>
  );
}

/** Une ligne de la carte des valeurs (`.vl`) : « 1 portion  540 g », puis les valeurs au niveau d'un repas. */
function LigneValeur({ libelle, sous, m, premier }: { libelle: string; sous?: string; m: Macros; premier?: boolean }) {
  const { couleurs } = useTheme();
  return (
    <View style={[styles.vl, !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line }]}>
      <View style={styles.vlTete}>
        <Texte variante="saisie" style={{ fontSize: 15 }}>
          {libelle}
        </Texte>
        {sous ? (
          <Texte variante="meta" couleur="t3">
            {sous}
          </Texte>
        ) : null}
      </View>
      <LigneValeurs m={m} niveau="repas" />
    </View>
  );
}

/** Carte des valeurs : une portion (et son poids), 100 g, le plat entier (et son poids) ; « ~ » si le poids est estimé. */
export function CarteValeurs({ portion, portionG, cent, entier, poidsG, base = "g", style }: { portion: Macros; portionG: number; cent: Macros; entier: Macros; poidsG: number; base?: string; style?: object }) {
  if (!useChiffresNutrition()) return null;
  return (
    <CartePlat style={style}>
      <EnteteColonnes />
      <LigneValeur premier libelle={t("plats.unePortion")} sous={`${nombre(portionG, 0)} ${base}`} m={portion} />
      <LigneValeur libelle={`100 ${base}`} m={cent} />
      <LigneValeur libelle={t("plats.platEntier")} sous={`${nombre(poidsG, 0)} ${base}`} m={entier} />
    </CartePlat>
  );
}

/** Vignette d'un plat dans une liste (`.vg`, 40, rayon 8) : sa photo, sinon la cocotte. */
export function VignettePlat({ plat, taille = 40 }: { plat: Pick<Plat, "photo_vignette">; taille?: number }) {
  const { couleurs, mode } = useTheme();
  return (
    <View style={[styles.vg, { width: taille, height: taille, backgroundColor: couleurs.pictoRepas }, mode === "jour" && { borderWidth: StyleSheet.hairlineWidth, borderColor: couleurs.verreFilet }]}>
      {plat.photo_vignette ? <Image source={{ uri: uriPhoto(plat.photo_vignette) }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Icone nom="cocotte" couleur={couleurs.t2} taille={20} />}
    </View>
  );
}

/** Sous-ligne d'un plat dans Mes plats : « 4 portions · 569 kcal la portion », « Fitatu · sans ingrédients · 612 kcal la portion ». */
export function sousLignePlat(p: Plat, kcalPortion: number): string {
  const kcal = nombre(kcalPortion, 0);
  return [
    p.source === "fitatu" ? t("nutrition.provenanceFitatu") : null,
    p.sans_ingredients ? t("plats.sansIngredients") : tp("plats.nPortions", p.portions),
    !chiffresNutrition() ? null : p.portions > 1 || p.sans_ingredients ? t("plats.kcalPortion", { kcal }) : `${kcal} ${t("nutrition.kcal")}`,
  ]
    .filter(Boolean)
    .join(", ");
}

/** « 1 portion · 540 g · 569 kcal » : la quantité ajoutée par défaut depuis une liste (une portion, P7). */
export function sousLigneAjout(portionG: number, kcal: number, base = "g"): string {
  return [`${fraction(1)} ${t("nutrition.unite.portion")}`, `${nombre(portionG, 0)} ${base}`, chiffresNutrition() ? `${nombre(kcal, 0)} ${t("nutrition.kcal")}` : null].filter(Boolean).join(", ");
}

/** Masse lisible : « 540 g », « 2,2 kg » au-delà de 10 kg… (on garde les grammes jusque-là, comme la planche : « 2 160 g »). */
export const masseG = (g: number, base = "g", estime = false) => approx(`${nombre(g, 0)} ${base}`, estime);

const styles = StyleSheet.create({
  carte: { borderRadius: rayon.l, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  hd: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 4 },
  al: { paddingTop: 9, paddingBottom: 10, paddingHorizontal: 16 },
  l1: { flexDirection: "row", alignItems: "center", gap: espace.s, minHeight: 24 },
  qt: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, maxWidth: "55%" },
  ajt: { height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espace.s, borderTopWidth: StyleSheet.hairlineWidth },
  vl: { paddingTop: 12, paddingBottom: 13, paddingHorizontal: 16 },
  vlTete: { flexDirection: "row", alignItems: "baseline", gap: espace.s, marginBottom: 6 },
  vg: { borderRadius: 8, overflow: "hidden", alignItems: "center", justifyContent: "center" },
});
