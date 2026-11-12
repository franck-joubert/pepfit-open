// Feuille « Tour de dos et bonnet » (planche articulations, écran A2, D14) : la case « Pas de poitrine ou très petite », le
// bonnet en puces (AA à H), le tour de dos en puces de tailles françaises (70 à 120, « si tu le connais »), la phrase des
// tailles françaises et la garde « Chiffré avec tes mensurations. Ton coach ne le voit pas. ». « Enregistrer » attend la case
// ou un bonnet ; « Effacer » paraît s'il y a déjà une saisie. Toutes les cibles font 44 dp au moins, aucun sélecteur natif.
// Ouverte par la page Poitrine (A1) et par l'étape Poitrine du parcours guidé (A3). Sous les tailles, « Sinon, mesure-le »
// (planche mensurations-femme, D6) : l'anneau sous la poitrine de la femme et comment passer du tour à la taille française.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { police, rayon } from "../../theme/typo";
import { BoutonTonal } from "../../ui/BoutonTonal";
import { Coche } from "../../ui/Coche";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille } from "../../ui/Feuille";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { FigureEtape } from "./FigureTour";
import { CHOIX_BONNET, PAS_DE_POITRINE, tailleDeTourDos, TAILLES_DOS, texteSoutien, tourDosDeTaille, type Bonnet, type Soutien } from "./bonnet-calc";
import { useMesure } from "./gabarit";

type Brouillon = { bonnet: Bonnet | null; taille: number | null };

/** Valeur affichée d'une saisie (D14) : « 85 B », « B », « Très petite ou aucune ». */
export const libelleSoutien = (s: Soutien): string => texteSoutien(s) ?? t("bonnet.tresPetite");

export function FeuilleBonnet({
  visible,
  valeur,
  onFermer,
  onEnregistrer,
  onEffacer,
}: {
  visible: boolean;
  /** La saisie en cours, null s'il n'y en a pas. */
  valeur: Soutien | null;
  onFermer: () => void;
  onEnregistrer: (s: Soutien) => void;
  onEffacer: () => void;
}) {
  const { couleurs, mode } = useTheme();
  const m = useMesure();
  const [b, setB] = useState<Brouillon>({ bonnet: null, taille: null });
  // chaque ouverture repart de la saisie en cours
  useEffect(() => {
    if (visible) setB({ bonnet: valeur?.bonnet ?? null, taille: valeur?.tourDos != null ? tailleDeTourDos(valeur.tourDos) : null });
  }, [visible, valeur]);

  const pas = b.bonnet === PAS_DE_POITRINE;
  const ok = b.bonnet != null;
  const enregistrer = () => {
    if (b.bonnet == null) return;
    onEnregistrer({ bonnet: b.bonnet, tourDos: b.taille != null ? tourDosDeTaille(b.taille) : null });
  };

  const bouton = <BoutonPrincipal libelle={t("mesuresCorps.enregistrer")} desactive={!ok} onPress={enregistrer} />;
  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("bonnet.titre")}
      sousTitre={t("bonnet.sousTitre")}
      pied={
        valeur ? (
          <View style={styles.pied}>
            <BoutonTonal libelle={t("bonnet.effacer")} onPress={onEffacer} style={{ flex: 1 }} />
            <View style={{ flex: 1 }}>{bouton}</View>
          </View>
        ) : (
          bouton
        )
      }
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: pas }}
        accessibilityLabel={t("bonnet.pasDePoitrine")}
        onPress={() => setB((x) => ({ ...x, bonnet: x.bonnet === PAS_DE_POITRINE ? null : PAS_DE_POITRINE }))}
        style={({ pressed }) => [styles.case, { backgroundColor: pressed ? couleurs.s3 : couleurs.feuilleGroupe }]}
      >
        <Texte variante="corps" style={{ flex: 1, fontSize: 15 }}>
          {t("bonnet.pasDePoitrine")}
        </Texte>
        <View style={[styles.carre, pas ? { backgroundColor: m.fort } : { borderWidth: 1.5, borderColor: couleurs.t3 }]}>{pas ? <Coche couleur="#ffffff" /> : null}</View>
      </Pressable>

      <Titre texte={t("bonnet.bonnet")} />
      <Grille
        libelle={t("bonnet.bonnet")}
        colonnes={5}
        options={CHOIX_BONNET.map((c) => ({ v: c.v, libelle: c.lettre }))}
        valeur={pas ? null : b.bonnet}
        onChange={(v) => setB((x) => ({ ...x, bonnet: x.bonnet === v ? null : (v as Bonnet) }))}
      />

      <Titre texte={t("bonnet.tourDos")} suite={t("bonnet.siTuLeConnais")} />
      <Grille
        libelle={t("bonnet.tourDos")}
        colonnes={6}
        options={TAILLES_DOS.map((v) => ({ v, libelle: String(v) }))}
        valeur={b.taille}
        onChange={(v) => setB((x) => ({ ...x, taille: x.taille === v ? null : v }))}
      />

      <View style={[styles.mesurer, { backgroundColor: couleurs.feuilleGroupe }]}>
        <View style={[styles.vignette, { backgroundColor: mode === "nuit" ? couleurs.s2 : couleurs.s3 }]}>
          <FigureEtape perso="f" tour="sous_poitrine" faits={[]} largeur={88} hauteur={88} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Texte variante="corps" style={{ fontSize: 15, marginBottom: 2 }}>
            {t("bonnet.mesurerTitre")}
          </Texte>
          <Texte variante="corps" couleur="t2" style={{ lineHeight: 18 }}>
            {t("bonnet.mesurerTexte")}
          </Texte>
        </View>
      </View>

      <Texte variante="meta" couleur="t2" style={styles.note}>
        {t("bonnet.explication")}
      </Texte>
      <View style={styles.garde}>
        <Icone nom="cadenas" couleur={couleurs.t3} taille={14} />
        <Texte variante="meta" couleur="t2" style={{ flex: 1 }}>
          {t("bonnet.garde")}
        </Texte>
      </View>
    </Feuille>
  );
}

function Titre({ texte, suite }: { texte: string; suite?: string }) {
  return (
    <View style={styles.titre}>
      <Texte variante="entete" couleur="t3" accessibilityRole="header">
        {texte}
      </Texte>
      {suite ? (
        <Texte variante="meta" couleur="t3">
          {suite}
        </Texte>
      ) : null}
    </View>
  );
}

/** Puces en grille (44 dp au moins, toute la puce se touche) ; toucher la puce choisie la retire. */
function Grille({
  libelle,
  colonnes,
  options,
  valeur,
  onChange,
}: {
  libelle: string;
  colonnes: number;
  options: readonly { v: number; libelle: string }[];
  valeur: number | null;
  onChange: (v: number) => void;
}) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const rangs = Array.from({ length: Math.ceil(options.length / colonnes) }, (_, i) => options.slice(i * colonnes, (i + 1) * colonnes));
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={libelle} style={{ gap: 8 }}>
      {rangs.map((r, i) => (
        <View key={i} style={styles.rang}>
          {r.map((o) => {
            const on = o.v === valeur;
            return (
              <Pressable
                key={o.v}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={o.libelle}
                onPress={() => onChange(o.v)}
                style={({ pressed }) => [
                  styles.puce,
                  { backgroundColor: on ? m.voile : pressed ? couleurs.s3 : couleurs.feuilleGroupe, borderColor: on ? m.fort : "transparent" },
                ]}
              >
                <Texte variante="corps" style={{ fontSize: 15, fontFamily: on ? police.semibold : police.regular, fontVariant: ["tabular-nums"] }}>
                  {o.libelle}
                </Texte>
              </Pressable>
            );
          })}
          {/* les cases vides gardent la largeur des colonnes sur le dernier rang */}
          {Array.from({ length: colonnes - r.length }, (_, k) => (
            <View key={`v${k}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  case: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, borderRadius: rayon.l },
  carre: { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  titre: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 22, marginBottom: 8, paddingHorizontal: 16 },
  rang: { flexDirection: "row", gap: 8 },
  puce: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  mesurer: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, paddingVertical: 12, paddingLeft: 12, paddingRight: 16, borderRadius: rayon.l },
  vignette: { width: 88, height: 88, borderRadius: rayon.m, overflow: "hidden" },
  note: { marginTop: 14, marginHorizontal: 4, lineHeight: 18 },
  garde: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, marginHorizontal: 4 },
  pied: { flexDirection: "row", gap: 8 },
});
