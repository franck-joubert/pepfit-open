import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { enregistrerProduit } from "../../db";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { kcalDepuisMacros, type Nutriments, type Portion } from "../../nutrition/calculs";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille } from "../../ui/Feuille";
import { Icone } from "../../ui/Icone";
import { Segmente } from "../../ui/Segmente";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { useApp } from "../contexte";
import { approx, lireNombre, saisieDecimale } from "../format";
import { BoutonTonal, ChampTexte, Entete, LigneFilet, PageNutrition, SaisieNutrition } from "./commun";
import { prendreCodeLu } from "./code-lu";

// Nouveau produit (planche 13, 15, 16 ; D3 : clavier numérique pour recopier l'étiquette) : code-barres (caméra), nom, marque,
// base, valeurs pour 100 (l'énergie se calcule des macros tant qu'elle n'est pas saisie : « auto », puis « ~ 351 ») ;
// portions facultatives ; Plus : vitamines et minéraux repliés, ingrédients, Nutri-Score et NOVA. « Lire l'étiquette »
// (OCR sur le téléphone) viendra avec son module natif : le bouton n'est pas montré tant qu'il ne marche pas.

type Cle = "kcal" | "lipides" | "satures" | "glucides" | "sucres" | "fibres" | "proteines" | "sel";
const CHAMPS: { cle: Cle; libelle: Parameters<typeof t>[0]; sous?: boolean }[] = [
  { cle: "kcal", libelle: "nutrition.energie" },
  { cle: "lipides", libelle: "nutrition.lipides" },
  { cle: "satures", libelle: "nutrition.dontSatures", sous: true },
  { cle: "glucides", libelle: "nutrition.glucides" },
  { cle: "sucres", libelle: "nutrition.dontSucres", sous: true },
  { cle: "fibres", libelle: "nutrition.fibres" },
  { cle: "proteines", libelle: "nutrition.proteines" },
  { cle: "sel", libelle: "nutrition.sel" },
];
const PORTIONS: { type: Portion["type"]; libelle: Parameters<typeof t>[0] }[] = [
  { type: "portion", libelle: "nutrition.unePortion" },
  { type: "piece", libelle: "nutrition.unePiece" },
  { type: "paquet", libelle: "nutrition.unPaquet" },
];
/** Vitamines et minéraux (22), avec leur unité pour 100. */
export const MICROS: { cle: string; unite: "mg" | "µg" }[] = [
  { cle: "vitA", unite: "µg" }, { cle: "vitD", unite: "µg" }, { cle: "vitE", unite: "mg" }, { cle: "vitK", unite: "µg" }, { cle: "vitC", unite: "mg" },
  { cle: "vitB1", unite: "mg" }, { cle: "vitB2", unite: "mg" }, { cle: "vitB3", unite: "mg" }, { cle: "vitB5", unite: "mg" }, { cle: "vitB6", unite: "mg" },
  { cle: "vitB8", unite: "µg" }, { cle: "vitB9", unite: "µg" }, { cle: "vitB12", unite: "µg" }, { cle: "calcium", unite: "mg" }, { cle: "fer", unite: "mg" },
  { cle: "magnesium", unite: "mg" }, { cle: "phosphore", unite: "mg" }, { cle: "potassium", unite: "mg" }, { cle: "zinc", unite: "mg" }, { cle: "cuivre", unite: "mg" },
  { cle: "selenium", unite: "µg" }, { cle: "iode", unite: "µg" },
];
const NOTES = ["a", "b", "c", "d", "e"] as const;

export function Creer() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const p = useLocalSearchParams<{ repas?: string; date?: string; code?: string; nom?: string }>();
  const [nom, setNom] = useState(p.nom ?? "");
  const [marque, setMarque] = useState("");
  const [code, setCode] = useState(p.code ?? "");
  const [base, setBase] = useState<"100g" | "100ml">("100g");
  const [v, setV] = useState<Record<string, string>>({});
  const [micros, setMicros] = useState(false);
  const [ingredients, setIngredients] = useState("");
  const [feuilleIngr, setFeuilleIngr] = useState(false);
  const [notes, setNotes] = useState<{ nutriscore: string | null; nova: number | null }>({ nutriscore: null, nova: null });
  const [feuilleNotes, setFeuilleNotes] = useState(false);
  // Retour du scanner ouvert par « Code-barres » : le code lu remplit la fiche.
  useFocusEffect(
    useCallback(() => {
      const lu = prendreCodeLu();
      if (lu) setCode(lu);
    }, []),
  );

  const n = (c: string) => lireNombre(v[c] ?? "");
  const macros = { proteines: n("proteines") ?? 0, glucides: n("glucides") ?? 0, lipides: n("lipides") ?? 0, fibres: n("fibres") ?? 0 };
  const calculee = Math.round(kcalDepuisMacros(macros));
  const aMacros = macros.proteines + macros.glucides + macros.lipides > 0;
  const pret = !!nom.trim() && (n("kcal") != null || aMacros);
  const nbMicros = MICROS.filter((m) => n(m.cle) != null).length;

  const enregistrer = async () => {
    if (!pret) return;
    const nut: Nutriments = {};
    const mettre = (k: keyof Nutriments, c: string) => {
      const x = n(c);
      if (x != null) (nut as Record<string, number>)[k] = x;
    };
    mettre("energie_kcal", "kcal");
    for (const c of ["lipides", "satures", "glucides", "sucres", "fibres", "proteines", "sel"] as const) mettre(c, c);
    const vm: Record<string, number> = {};
    for (const m of MICROS) if (n(m.cle) != null) vm[m.cle] = n(m.cle)!;
    if (Object.keys(vm).length) nut.micros = vm;
    const portions: Portion[] = PORTIONS.filter((x) => (n(x.type) ?? 0) > 0).map((x) => ({ type: x.type, libelle: "", grammes: n(x.type)! }));
    const produit = await enregistrerProduit(db, {
      code_barres: code.trim() || null, nom, marque: marque.trim() || null, base, nutriments: nut, portions, source: "perso",
      ingredients: ingredients.trim() || null, nutriscore: notes.nutriscore, nova: notes.nova,
    });
    router.replace({ pathname: "/nutrition/produit", params: { produit: produit.id, repas: p.repas, date: p.date } });
  };

  const champ = (cle: string, libelle: string, o: { sous?: boolean; unite?: string; indication?: string; ph?: string } = {}) => (
    <View key={cle} style={[styles.nv, { borderBottomColor: couleurs.line }]}>
      <View style={[{ flex: 1 }, o.sous && { paddingLeft: espace.l }]}>
        <Texte variante="corps" style={{ fontSize: o.sous ? 14 : 15, color: o.sous ? couleurs.t2 : couleurs.t1 }}>
          {libelle}
        </Texte>
        {o.indication ? (
          <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>
            {o.indication}
          </Texte>
        ) : null}
      </View>
      <SaisieNutrition
        cadre={[styles.val, { backgroundColor: couleurs.s1 }]}
        value={v[cle] ?? ""}
        onChangeText={(x) => setV((cur) => ({ ...cur, [cle]: saisieDecimale(x) }))}
        keyboardType="decimal-pad"
        maxLength={7}
        placeholder={o.ph ?? "0"}
        accessibilityLabel={libelle}
        style={[styles.valSaisie, { color: couleurs.t1 }]}
      />
      <Texte variante="corps" couleur="t3" style={styles.unite}>
        {o.unite ?? t("nutrition.g")}
      </Texte>
    </View>
  );

  return (
    <PageNutrition titre={t("nutrition.nouveauProduit")} pied={<BoutonPrincipal libelle={t("ui.enregistrer")} desactive={!pret} onPress={() => void enregistrer().catch(console.error)} />}>
      {code ? (
        <LigneFilet icone="scan" libelle={t("nutrition.codeBarres")} valeur={code.replace(/(\d)(?=(\d{3})+$)/g, "$1 ")} hauteur={48} onPress={() => router.push({ pathname: "/nutrition/scan", params: { pour: "code" } })} chevron={false} />
      ) : (
        <BoutonTonal icone="scan" libelle={t("nutrition.codeBarres")} onPress={() => router.push({ pathname: "/nutrition/scan", params: { pour: "code" } })} style={{ marginTop: espace.xs, backgroundColor: couleurs.s1 }} />
      )}
      <ChampTexte value={nom} onChangeText={setNom} placeholder={t("nutrition.nom")} accessibilityLabel={t("nutrition.nom")} style={{ marginTop: espace.m }} />
      <ChampTexte value={marque} onChangeText={setMarque} placeholder={t("nutrition.marque")} accessibilityLabel={t("nutrition.marque")} style={{ marginTop: espace.s }} />
      <View style={{ marginTop: espace.l }}>
        <Segmente options={[{ valeur: "100g", libelle: t("nutrition.pour100gMaj") }, { valeur: "100ml", libelle: t("nutrition.pour100mlMaj") }]} valeur={base} onChange={setBase} />
      </View>
      {CHAMPS.map((c) =>
        champ(c.cle, t(c.libelle), {
          sous: c.sous,
          unite: c.cle === "kcal" ? t("nutrition.kcal") : undefined,
          ph: c.cle === "kcal" ? (aMacros ? approx(String(calculee)) : t("nutrition.auto")) : undefined,
          indication: c.cle === "kcal" && n("kcal") != null && aMacros ? t("nutrition.macrosEnviron", { n: calculee }) : undefined,
        }),
      )}
      <Entete style={{ marginTop: espace.xxl }}>{t("nutrition.portions")}</Entete>
      {PORTIONS.map((x) => champ(x.type, t(x.libelle), { ph: "" }))}
      <Entete style={{ marginTop: 28 }}>{t("nutrition.plus")}</Entete>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: micros }} onPress={() => setMicros((x) => !x)} style={[styles.row, { borderBottomColor: couleurs.line }]}>
        <Icone nom="etiquette" couleur={couleurs.t3} taille={20} />
        <Texte variante="corps" style={{ flex: 1, fontSize: 16, color: couleurs.t1 }}>
          {t("nutrition.vitamines")}
        </Texte>
        <Texte variante="corps" couleur="t3" style={{ fontSize: 16 }}>{`${nbMicros} / ${MICROS.length}`}</Texte>
        <Icone nom={micros ? "down" : "right"} couleur={couleurs.t3} taille={16} />
      </Pressable>
      {micros ? MICROS.map((m) => champ(m.cle, t(`nutrition.micro.${m.cle}` as "nutrition.micro.vitA"), { sous: true, unite: m.unite })) : null}
      <LigneFilet icone="paquet" libelle={t("nutrition.ingredients")} valeur={ingredients ? t("nutrition.saisis") : "—"} onPress={() => setFeuilleIngr(true)} />
      <LigneFilet
        icone="cible"
        libelle={t("nutrition.nutriNova")}
        valeur={[notes.nutriscore?.toUpperCase(), notes.nova ? `NOVA ${notes.nova}` : null].filter(Boolean).join(", ") || "—"}
        onPress={() => setFeuilleNotes(true)}
      />

      <Feuille visible={feuilleIngr} onFermer={() => setFeuilleIngr(false)} titre={t("nutrition.ingredients")} pied={<BoutonPrincipal libelle={t("ui.valider")} onPress={() => setFeuilleIngr(false)} />}>
        <SaisieNutrition
          cadre={[styles.texte, { backgroundColor: couleurs.feuilleGroupe }]}
          value={ingredients}
          onChangeText={setIngredients}
          multiline
          autoFocus
          accessibilityLabel={t("nutrition.ingredients")}
          style={{ color: couleurs.t1, fontFamily: police.regular, fontSize: 15, minHeight: 120, textAlignVertical: "top" }}
        />
      </Feuille>
      <Feuille visible={feuilleNotes} onFermer={() => setFeuilleNotes(false)} titre={t("nutrition.nutriNova")} pied={<BoutonPrincipal libelle={t("ui.valider")} onPress={() => setFeuilleNotes(false)} />}>
        <Texte variante="entete" couleur="t3">
          {t("nutrition.nutriscoreCourt")}
        </Texte>
        <Segmente<string> options={[{ valeur: "", libelle: "—" }, ...NOTES.map((x) => ({ valeur: x, libelle: x.toUpperCase() }))]} valeur={notes.nutriscore ?? ""} onChange={(x) => setNotes((o) => ({ ...o, nutriscore: x || null }))} />
        <Texte variante="entete" couleur="t3">
          {t("nutrition.novaCourt")}
        </Texte>
        <Segmente<string> options={[{ valeur: "", libelle: "—" }, ...[1, 2, 3, 4].map((x) => ({ valeur: String(x), libelle: String(x) }))]} valeur={notes.nova ? String(notes.nova) : ""} onChange={(x) => setNotes((o) => ({ ...o, nova: x ? Number(x) : null }))} />
      </Feuille>
    </PageNutrition>
  );
}

const styles = StyleSheet.create({
  nv: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  val: { width: 96, height: 44, borderRadius: rayon.l },
  valSaisie: { flex: 1, textAlign: "right", paddingHorizontal: espace.m, paddingVertical: 0, fontFamily: police.medium, fontSize: 16 },
  unite: { width: 30 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  texte: { borderRadius: rayon.l, padding: espace.m },
});

