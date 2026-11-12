import { useMemo, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { LANGUES, lireDetecte, resoudre, t, type Langue, type Preferences } from "../i18n/index";
import { FUSEAUX, regionDuFuseau, villeDuFuseau } from "../i18n/fuseaux";
import { libelleDecalage } from "../i18n/temps";
import { normaliser } from "../db/normaliser";
import { useTheme } from "../theme";
import { espace, POLICE_MAX, rayon } from "../theme/typo";
import { Feuille, Groupe, Option } from "../ui/Feuille";
import { Icone } from "../ui/Icone";
import { Texte } from "../ui/Texte";
import { useApp } from "./contexte";
import { LigneReglage } from "./Reglage";

type Champ = "langue" | "fuseau" | "poids" | "distance";

/** Autonymes : chaque langue s'écrit dans sa propre langue. */
export const NOM_LANGUE: Record<Langue, string> = { fr: "Français", en: "English", de: "Deutsch", es: "Español" };

const libelleFuseau = (z: string) => villeDuFuseau(z);

/** Langue et région (Préférences › Général) : chaque ligne vaut « Auto · valeur détectée » ou un choix forcé, et ouvre une feuille de choix.
 *  Renvoie les lignes (à poser dans un GroupeReglages) et les feuilles (à poser hors du défilement). */
export function useRegion() {
  const { reglages, regler } = useApp();
  const [ouvert, setOuvert] = useState<Champ | null>(null);
  const p = reglages.region;
  const detecte = lireDetecte();
  const actif = resoudre(p, detecte);

  const valeur = (auto: boolean, v: string) => (auto ? `${t("region.auto")}, ${v}` : v);
  const choisir = (patch: Partial<Preferences>) => {
    setOuvert(null);
    regler({ region: { ...p, ...patch } });
  };

  const lignes = [
    <LigneReglage key="langue" libelle={t("region.langue")} valeur={valeur(p.langue === "auto", NOM_LANGUE[actif.langue])} onPress={() => setOuvert("langue")} />,
    <LigneReglage key="fuseau" libelle={t("region.fuseau")} valeur={valeur(p.fuseau === "auto", libelleFuseau(actif.fuseau))} onPress={() => setOuvert("fuseau")} />,
    <LigneReglage key="poids" libelle={t("region.poids")} valeur={valeur(p.poids === "auto", actif.poids)} onPress={() => setOuvert("poids")} />,
    <LigneReglage key="distance" libelle={t("region.distance")} valeur={valeur(p.distance === "auto", actif.distance)} onPress={() => setOuvert("distance")} />,
  ];

  const feuilles = (
    <>
      <Feuille visible={ouvert === "langue"} onFermer={() => setOuvert(null)} titre={t("region.langue")}>
        <Groupe>
          <Option premier libelle={t("region.auto")} aide={t("region.detecte", { valeur: NOM_LANGUE[detecte.langue] })} choisi={p.langue === "auto"} onPress={() => choisir({ langue: "auto" })} />
          {LANGUES.map((l) => (
            <Option key={l} libelle={NOM_LANGUE[l]} choisi={p.langue === l} onPress={() => choisir({ langue: l })} />
          ))}
        </Groupe>
      </Feuille>
      <Feuille visible={ouvert === "poids"} onFermer={() => setOuvert(null)} titre={t("region.poids")}>
        <Groupe>
          <Option premier libelle={t("region.auto")} aide={t("region.detecte", { valeur: detecte.poids })} choisi={p.poids === "auto"} onPress={() => choisir({ poids: "auto" })} />
          <Option libelle="kg" choisi={p.poids === "kg"} onPress={() => choisir({ poids: "kg" })} />
          <Option libelle="lbs" choisi={p.poids === "lbs"} onPress={() => choisir({ poids: "lbs" })} />
        </Groupe>
      </Feuille>
      <Feuille visible={ouvert === "distance"} onFermer={() => setOuvert(null)} titre={t("region.distance")}>
        <Groupe>
          <Option premier libelle={t("region.auto")} aide={t("region.detecte", { valeur: detecte.distance })} choisi={p.distance === "auto"} onPress={() => choisir({ distance: "auto" })} />
          <Option libelle="km" choisi={p.distance === "km"} onPress={() => choisir({ distance: "km" })} />
          <Option libelle="mi" choisi={p.distance === "mi"} onPress={() => choisir({ distance: "mi" })} />
        </Groupe>
      </Feuille>
      <FeuilleFuseau visible={ouvert === "fuseau"} onFermer={() => setOuvert(null)} onChoisir={(z) => choisir({ fuseau: z })} fuseau={p.fuseau} detecte={detecte.fuseau} />
    </>
  );
  return { lignes, feuilles };
}

/** Choix d'un fuseau, avec recherche. `sansAuto` : sans « Automatique » (la destination d'un voyage, planche sommeil). */
export function FeuilleFuseau({
  visible,
  onFermer,
  onChoisir,
  fuseau,
  detecte,
  sansAuto,
  titre,
}: {
  visible: boolean;
  onFermer: () => void;
  onChoisir: (z: "auto" | string) => void;
  fuseau: string;
  detecte: string;
  sansAuto?: boolean;
  titre?: string;
}) {
  const { couleurs } = useTheme();
  const [q, setQ] = useState("");
  const maintenant = useMemo(() => Date.now(), [visible]);
  const zones = useMemo(() => {
    const s = new Set<string>(FUSEAUX);
    s.add(detecte);
    if (fuseau !== "auto") s.add(fuseau);
    return [...s];
  }, [detecte, fuseau]);
  const mots = normaliser(q).split(" ").filter(Boolean);
  const trouvees = zones.filter((z) => {
    const cible = normaliser(`${villeDuFuseau(z)} ${regionDuFuseau(z)} ${libelleDecalage(maintenant, z)}`);
    return mots.every((m) => cible.includes(m));
  });
  const detail = (z: string) => [regionDuFuseau(z), libelleDecalage(maintenant, z)].filter(Boolean).join(", ");
  const fermer = () => {
    setQ("");
    onFermer();
  };

  return (
    <Feuille visible={visible} onFermer={fermer} titre={titre ?? t("region.fuseau")}>
      <View style={[styles.recherche, { backgroundColor: couleurs.s2 }]}>
        <Icone nom="search" couleur={couleurs.t2} taille={20} />
        <TextInput
          maxFontSizeMultiplier={POLICE_MAX}
          accessibilityLabel={t("region.recherche")}
          placeholder={t("region.recherche")}
          placeholderTextColor={couleurs.t3}
          value={q}
          onChangeText={setQ}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.saisie, { color: couleurs.t1 }]}
        />
      </View>
      <Groupe>
        {mots.length === 0 && !sansAuto ? (
          <Option premier libelle={t("region.auto")} aide={t("region.detecte", { valeur: `${libelleFuseau(detecte)} (${libelleDecalage(maintenant, detecte)})` })} choisi={fuseau === "auto"} onPress={() => (setQ(""), onChoisir("auto"))} />
        ) : null}
        {trouvees.map((z, i) => (
          <Option key={z} premier={(mots.length > 0 || !!sansAuto) && i === 0} libelle={libelleFuseau(z)} aide={detail(z)} choisi={fuseau === z} onPress={() => (setQ(""), onChoisir(z))} />
        ))}
      </Groupe>
      {trouvees.length === 0 ? (
        <Texte variante="corps" couleur="t3" style={{ textAlign: "center", padding: espace.l }}>
          {t("region.aucunResultat")}
        </Texte>
      ) : null}
    </Feuille>
  );
}

const styles = StyleSheet.create({
  recherche: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l, borderRadius: rayon.l },
  saisie: { flex: 1, minHeight: 48, fontFamily: "Inter-Regular", fontSize: 16 },
});
