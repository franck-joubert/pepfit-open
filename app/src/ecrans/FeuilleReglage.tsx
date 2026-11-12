import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { autreUnite, libelleLibre, paliersReguliers, type PoidsLibre, type UniteEquipement } from "../db";
import { useTheme } from "../theme";
import { espace, rayon } from "../theme/typo";
import { Bouton } from "../ui/Bouton";
import { Feuille } from "../ui/Feuille";
import { BoutonPrincipal } from "../ui/Degrade";
import { RoueDuree } from "../ui/RoueDuree";
import { Texte } from "../ui/Texte";
import { indiceRepos, nombre } from "./format";
import { t, tp } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";

/** Charges proposées par les roues : au demi, puis à l'unité, puis au 2,5 ; 0 = aucun maximum. */
const CHARGES: number[] = [];
for (let v = 0.5; v <= 20; v += 0.5) CHARGES.push(v);
for (let v = 21; v <= 100; v += 1) CHARGES.push(v);
for (let v = 102.5; v <= 400; v += 2.5) CHARGES.push(v);
const AVEC_AUCUN = [0, ...CHARGES];
const PAS = [0.5, 1, 1.25, 2, 2.5, 4, 5, 10, 15, 20];

export type CibleReglage =
  | { genre: "poids"; type: PoidsLibre; min: number; max: number; pas: number; unite: UniteEquipement }
  | { genre: "machine"; nom: string; palier: number; max: number; unite: UniteEquipement };

export type ValeursReglage =
  | { genre: "poids"; type: PoidsLibre; min: number; max: number; pas: number; unite: UniteEquipement }
  | { genre: "machine"; palier: number; max: number; unite: UniteEquipement };

const lueNombre = (v: number) => `${nombre(v, 2)}`;
const proche = (v: number, l: number[]) => l[indiceRepos(v, l)]!;

/** Le drawer de réglage unique : haltères, kettlebells, barre et disques (min, max, pas) et machine (palier, max). L'unité bascule au toucher. */
export function FeuilleReglage({ cible, onFermer, onEnregistrer, onRetirer }: { cible: CibleReglage | null; onFermer: () => void; onEnregistrer: (v: ValeursReglage) => void; onRetirer?: () => void }) {
  const { couleurs } = useTheme();
  useLangue();
  const [brouillon, setBrouillon] = useState<ValeursReglage | null>(null);
  const courant = useRef<ValeursReglage | null>(null);
  const [ouverture, setOuverture] = useState(0);
  const derniere = useRef<CibleReglage | null>(null);
  if (cible) derniere.current = cible;

  useEffect(() => {
    if (!cible) return;
    const v: ValeursReglage =
      cible.genre === "poids"
        ? { genre: "poids", type: cible.type, min: proche(cible.min, CHARGES), max: proche(cible.max, AVEC_AUCUN), pas: proche(cible.pas, PAS), unite: cible.unite }
        : { genre: "machine", palier: proche(cible.palier, PAS), max: proche(cible.max, AVEC_AUCUN), unite: cible.unite };
    courant.current = v;
    setBrouillon(v);
    setOuverture((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cible]);

  const regler = (patch: Partial<{ min: number; max: number; pas: number; palier: number; unite: UniteEquipement }>) => {
    if (!courant.current) return;
    const v = { ...courant.current, ...patch } as ValeursReglage;
    courant.current = v;
    setBrouillon(v);
  };

  const c = cible ?? derniere.current;
  const b = brouillon;
  const unite = b?.unite ?? c?.unite ?? "kg";

  const roue = (cle: string, libelle: string, valeur: number, valeurs: number[], surChange: (v: number) => void) => (
    <View key={`${ouverture}-${cle}`} style={{ flex: 1 }}>
      <Texte variante="meta" couleur="t3" style={styles.etiquette}>
        {libelle}
      </Texte>
      <RoueDuree
        libelle={libelle}
        valeur={valeur}
        onChange={surChange}
        valeurs={valeurs}
        decoupe={(v) => ({ attenue: "", plein: v === 0 ? "—" : lueNombre(v) })}
        lue={(v) => (v === 0 ? t("salles.aucun") : `${lueNombre(v)} ${unite}`)}
        traits={false}
      />
    </View>
  );

  const resume = (() => {
    if (!b) return "";
    const premier = b.genre === "poids" ? b.min : b.palier;
    const pas = b.genre === "poids" ? b.pas : b.palier;
    if (b.max <= 0) return t("salles.resumeAucunMax", { pas: lueNombre(pas), unite: b.unite });
    const n = paliersReguliers(premier, pas, b.max).length;
    return tp("salles.resumeCharges", n, { min: lueNombre(premier), max: lueNombre(b.max), unite: b.unite });
  })();

  return (
    <Feuille
      visible={cible != null}
      onFermer={onFermer}
      titre={c ? (c.genre === "poids" ? libelleLibre(c.type) : c.nom) : ""}
      glisserContenu={false}
      pied={<BoutonPrincipal libelle={t("ui.enregistrer")} onPress={() => courant.current && onEnregistrer(courant.current)} />}
    >
      {b ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("salles.uniteLabel", { unite: b.unite, autre: autreUnite(b.unite) })}
            onPress={() => regler({ unite: autreUnite(b.unite) })}
            style={({ pressed }) => [styles.unite, { backgroundColor: pressed ? couleurs.s3 : couleurs.s2 }]}
          >
            <Texte variante="corps" couleur="t2" style={{ flex: 1 }}>
              {t("salles.unite")}
            </Texte>
            <Texte variante="saisie">{b.unite}</Texte>
          </Pressable>
          <View style={styles.roues}>
            {b.genre === "poids" ? (
              <>
                {roue("min", t("salles.min"), b.min, CHARGES, (v) => regler({ min: v }))}
                {roue("max", t("salles.max"), b.max, AVEC_AUCUN, (v) => regler({ max: v }))}
                {roue("pas", t("salles.pas"), b.pas, PAS, (v) => regler({ pas: v }))}
              </>
            ) : (
              <>
                {roue("palier", t("salles.palier"), b.palier, PAS, (v) => regler({ palier: v }))}
                {roue("max", t("salles.max"), b.max, AVEC_AUCUN, (v) => regler({ max: v }))}
              </>
            )}
          </View>
          <Texte variante="corps" couleur="t2" style={styles.resume}>
            {resume}
          </Texte>
          {onRetirer ? <Bouton libelle={t("salles.retirer")} variante="tonal" large onPress={onRetirer} /> : null}
        </>
      ) : null}
    </Feuille>
  );
}

const styles = StyleSheet.create({
  unite: { minHeight: 48, borderRadius: rayon.l, paddingHorizontal: espace.l, flexDirection: "row", alignItems: "center" },
  roues: { flexDirection: "row", gap: 4 },
  etiquette: { textAlign: "center" },
  resume: { textAlign: "center", fontSize: 14 },
});
