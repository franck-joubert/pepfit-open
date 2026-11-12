// Feuille de la précision d'un calcul (planche precision, section 7 ; P12) : le pourcentage du calcul et son mot, une jauge à
// trois encoches (40, 65, 85 : les seuils des mots), « Bonne à 65 % · encore 12 % » ; ce que c'est, pourquoi la note (ses
// facteurs, avec l'ancienneté des mesures ; docs/PRECISION-AIDE.md) ; ce qui la fait monter (gain du calcul, au moins
// 2 points, les immédiates d'abord), ou la phrase qui dit qu'il n'y a rien à faire ; ce qui ne dépend pas de toi ; en bas,
// « Tout voir · Précision pepfit 61 % », ou, ouverte depuis le Profil, « Voir ton sommeil ». Une seule feuille à la fois.
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../../theme";
import { police, rayon } from "../../theme/typo";
import { useCouleurPartie, useDegrade } from "../../ui/ContextePartie";
import { avecOpacite } from "../../theme/teintes";
import { Feuille } from "../../ui/Feuille";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";
import { niveau, niveauSuivant, SEUILS_MOTS, type IdCalcul } from "../../precision/modele";
import {
  aideCalcul, detailEtape, gain, ICONE_ACTION, libellePrecision, motPrecision, pc, sousTitreFeuille, texteEtape, titreFeuille, type Facteur,
} from "../../precision/vue";
import { Icone } from "../../ui/Icone";
import type { EtatPrecision } from "../../precision/service";
import { GroupeP, Jauge, LigneP, Niveau } from "./Briques";
import { PAGE_CALCUL, suivreEtape } from "./actions";

export const ENCOCHES_MOTS = [SEUILS_MOTS.moyenne, SEUILS_MOTS.bonne, SEUILS_MOTS.elevee];
/** Ce qui ne dépend pas de toi, par calcul. */
const NOTE: Partial<Record<IdCalcul, "precision.feuille.note.sommeil">> = { sommeil: "precision.feuille.note.sommeil" };
const ICONE_PAGE: Partial<Record<IdCalcul, "lune" | "energie" | "souffle" | "agePepfit" | "pouls" | "regle" | "poids">> = {
  sommeil: "lune", recup: "pouls", depense: "energie", vo2: "souffle", age: "agePepfit", zones: "pouls", composition: "regle", bilan: "poids",
};

export function FeuillePrecision({
  e,
  calcul,
  visible,
  onFermer,
  depuisProfil,
}: {
  e: EtatPrecision | null;
  calcul: IdCalcul | null;
  visible: boolean;
  onFermer: () => void;
  depuisProfil?: boolean;
}) {
  const { couleurs, mode } = useTheme();
  const degrade = useDegrade();
  const partie = useCouleurPartie();
  if (!e || !calcul) return <Feuille visible={false} onFermer={onFermer}>{null}</Feuille>;
  const p = e.r.p[calcul] ?? 0;
  const nv = niveau(p);
  const suivant = niveauSuivant(p);
  const aide = aideCalcul(calcul, e.d, e.r);
  const etapes = aide.etapes;
  const fond = couleurs.feuilleGroupe;
  const note = NOTE[calcul];
  const page = PAGE_CALCUL[calcul];
  const aller = (f: () => void) => {
    onFermer();
    f();
  };
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={titreFeuille(calcul)} sousTitre={sousTitreFeuille(calcul, e.d, e.faits, e.r)}>
      <View style={[styles.bloc, { backgroundColor: fond }]} accessible accessibilityLabel={`${titreFeuille(calcul)}, ${pc(p)}, ${libellePrecision(nv)}`}>
        <View style={styles.l1}>
          <Texte variante="titreFort">
            {p}
            <Texte variante="corps" couleur="t2" style={{ fontSize: 15, fontFamily: police.regular }}>
              {" %"}
            </Texte>
          </Texte>
          <Niveau niveau={nv} texte={motPrecision(nv)} grand />
        </View>
        <Jauge valeur={p} encoches={ENCOCHES_MOTS} fond={fond} arrets={degrade.arrets} piste={avecOpacite(partie, mode === "nuit" ? 0.2 : 0.14)} style={{ marginTop: 12 }} />
        <View style={styles.sous}>
          {suivant ? (
            <>
              <Texte variante="corps" couleur="t2">
                {t("precision.feuille.aMot", { mot: motPrecision(suivant.niveau), n: suivant.min })}
              </Texte>
              <Texte variante="corps" couleur="t2">
                {t("precision.feuille.encore", { n: suivant.min - p })}
              </Texte>
            </>
          ) : (
            <Texte variante="corps" couleur="t2">
              {t("precision.feuille.auPlusHaut")}
            </Texte>
          )}
        </View>
      </View>
      <Texte variante="corps" couleur="t2" style={styles.quoi}>
        {aide.quoi}
      </Texte>
      <Texte variante="entete" couleur="t3" accessibilityRole="header" style={styles.entete}>
        {t("precision.aide.pourquoi", { n: p })}
      </Texte>
      <GroupeP fond={fond} style={styles.facteurs}>
        {aide.facteurs.map((f) => (
          <LigneFacteur key={f.cle} f={f} />
        ))}
      </GroupeP>
      {aide.vieux ? (
        <Texte variante="corps" couleur="t1" style={styles.quoi}>
          {aide.vieux}
        </Texte>
      ) : null}
      {etapes.length ? (
        <>
          <Texte variante="entete" couleur="t3" accessibilityRole="header" style={styles.entete}>
            {t("precision.feuille.monter")}
          </Texte>
          <GroupeP fond={fond} style={{ marginHorizontal: 0 }}>
            {etapes.map((s, i) => (
              <LigneP
                key={s.id}
                premiere={i === 0}
                icone={ICONE_ACTION[s.id]}
                titre={texteEtape(s.id, e.d)}
                sous={detailEtape(s.id, e.d, e.faits.femme, calcul)}
                gain={gain(Math.round(s.gain))}
                onPress={() => suivreEtape(s.id, onFermer)}
              />
            ))}
          </GroupeP>
        </>
      ) : (
        <Texte variante="corps" couleur="t2" style={styles.quoi}>
          {aide.fin}
        </Texte>
      )}
      {note ? (
        <Texte variante="meta" couleur="t3" style={styles.note}>
          {t(note)}
        </Texte>
      ) : null}
      <GroupeP fond={fond} style={{ marginHorizontal: 0 }}>
        {depuisProfil && page ? (
          <LigneP premiere icone={ICONE_PAGE[calcul] ?? "chart"} titre={t(`precision.feuille.voir.${calcul as "sommeil"}`)} onPress={() => aller(() => router.push(page))} />
        ) : (
          <LigneP premiere icone="list" titre={t("precision.feuille.toutVoir")} sous={t("precision.titre")} valeur={pc(e.r.score)} onPress={() => aller(() => router.push("/profil/precision"))} />
        )}
      </GroupeP>
    </Feuille>
  );
}

/** Un facteur : sa donnée à gauche, où elle en est à droite (« 0 sur 5 », « test, il y a 5 ans »), une coche s'il est plein. */
function LigneFacteur({ f }: { f: Facteur }) {
  const { couleurs } = useTheme();
  return (
    <View style={styles.facteur} accessible accessibilityLabel={`${f.titre}, ${f.valeur}`}>
      <Texte variante="corps" couleur="t1" style={styles.facteurT} numberOfLines={1}>
        {f.titre}
      </Texte>
      <Texte variante="corps" couleur={f.vieux ? "t1" : "t2"} style={styles.facteurV} numberOfLines={2}>
        {f.valeur}
      </Texte>
      <View style={styles.marque}>{f.ok ? <Icone nom="check" couleur={couleurs.valide} taille={16} epaisseur={2.25} /> : null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { borderRadius: rayon.l, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 12 },
  l1: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sous: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  entete: { paddingTop: 6, paddingHorizontal: 4, marginBottom: -4 },
  note: { paddingHorizontal: 4, marginTop: -2 },
  quoi: { paddingHorizontal: 4, fontSize: 14, lineHeight: 20 },
  facteurs: { marginHorizontal: 0, paddingVertical: 6 },
  facteur: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, paddingLeft: 16, paddingRight: 12 },
  facteurT: { flex: 1, fontSize: 14, lineHeight: 19 },
  facteurV: { flexShrink: 1, maxWidth: "55%", textAlign: "right", fontSize: 14, lineHeight: 19, fontVariant: ["tabular-nums"] },
  marque: { width: 16, alignItems: "center" },
});
