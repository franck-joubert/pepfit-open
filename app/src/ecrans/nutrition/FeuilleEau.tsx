import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import type { AjoutEau } from "../../db";
import { estVerre, EAU, heureTexte, VERRES, type CleVerre } from "../../nutrition/fibres-eau";
import { useTheme } from "../../theme";
import { police } from "../../theme/typo";
import { BandeauAnnuler } from "../../ui/BandeauAnnuler";
import { BoutonPrincipal } from "../../ui/Degrade";
import { ListeDesintegrable, marquerSuppression } from "../../ui/Desintegration";
import { Feuille } from "../../ui/Feuille";
import { Onglets, PanneauxOnglets } from "../../ui/Onglets";
import { RoueDuree } from "../../ui/RoueDuree";
import { Segmente } from "../../ui/Segmente";
import { GlisserSupprimer } from "../../ui/GlisserSupprimer";
import { Texte } from "../../ui/Texte";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { nombre } from "../format";
import { FeuilleHeure } from "../FeuillesPlanif";
import { LigneFilet, plage } from "./commun";

// Tiroir d'eau (planche Fibres et eau, lot 3) : une feuille du bas à deux onglets, Ajouter (préréglages qui règlent la roue, la roue
// reste libre, de 50 à 2 000 ml) et Aujourd'hui (la liste des ajouts : toucher modifie, glisser supprime), puis une étape « Modifier
// l'ajout » dans la même feuille. L'écran (Journal) écrit en base et tient le bandeau « Annuler » ; le tiroir le montre dans son pied
// tant qu'il est ouvert (la fenêtre modale cache celui de la page).

export type OngletEau = "ajouter" | "aujourdhui";

const VALEURS_ML = plage(EAU.ajoutMinMl, EAU.ajoutMaxMl, EAU.pasAjoutMl);
const MINUTES = plage(0, 59, 1);
const POLICE_EMPILE = 1.15;

/** Les valeurs de la roue, avec celle d'un ajout qui n'est pas un multiple de 50 (écrit par l'IA, par exemple) : l'enregistrer ne la change pas. */
const valeursAvec = (ml: number) => (VALEURS_ML.includes(ml) ? VALEURS_ML : [...VALEURS_ML, ml].sort((a, b) => a - b));

const verreDe = (ml: number): CleVerre | null => VERRES.find((v) => v.ml === ml)?.cle ?? null;

const nomAjout = (a: AjoutEau) => (a.libelle && estVerre(a.libelle) ? t(`eau.${a.libelle}`) : t("eau.nom"));

export interface SaisieEau {
  ml: number;
  heureMin: number;
  /** Préréglage dont la quantité est celle de la roue, null sinon. */
  libelle: CleVerre | null;
}

export function FeuilleEau({
  visible,
  ongletInitial,
  estAujourdhui,
  ajouts,
  totalMl,
  objectifMl,
  maintenantMin,
  bandeau,
  onAnnuler,
  onFermer,
  onAjouter,
  onModifier,
  onSupprimer,
}: {
  visible: boolean;
  ongletInitial: OngletEau;
  /** Faux pour un autre jour que celui d'aujourd'hui : « Ce jour », « ce jour-là ». */
  estAujourdhui: boolean;
  /** Ajouts du jour affiché, du plus récent au plus ancien. */
  ajouts: AjoutEau[];
  totalMl: number;
  /** Objectif d'eau, ou null quand les objectifs ne se montrent pas (grossesse, moins de 18 ans) : le total seul. */
  objectifMl: number | null;
  /** Heure actuelle, en minutes depuis minuit : l'heure d'un nouvel ajout. */
  maintenantMin: () => number;
  /** Ce qui vient d'être retiré (« 200 ml d'eau supprimés »), avec son « Annuler » (8 s, tenu par l'écran). */
  bandeau: string | null;
  onAnnuler: () => void;
  onFermer: () => void;
  onAjouter: (s: SaisieEau) => void;
  onModifier: (id: string, s: SaisieEau) => void;
  onSupprimer: (a: AjoutEau) => void;
}) {
  useLangue();
  const { couleurs } = useTheme();
  const { fontScale } = useWindowDimensions();
  const [onglet, setOnglet] = useState<OngletEau>(ongletInitial);
  const [ml, setMl] = useState<number>(EAU.ajoutDefautMl);
  // La roue n'est pas contrôlée après son montage : toucher un préréglage la remonte à la nouvelle valeur.
  const [cleRoue, setCleRoue] = useState(0);
  const [edition, setEdition] = useState<AjoutEau | null>(null);
  const [mlEdit, setMlEdit] = useState(0);
  const [heureEdit, setHeureEdit] = useState(0);
  const [heureOuverte, setHeureOuverte] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setOnglet(ongletInitial);
    setMl(EAU.ajoutDefautMl);
    setCleRoue((n) => n + 1);
    setEdition(null);
  }, [visible, ongletInitial]);

  const sous = useMemo(() => {
    const n = nombre(totalMl / 1000, 2);
    if (objectifMl == null) return t(estAujourdhui ? "eau.tiroir.sousSans" : "eau.tiroir.sousSansAutre", { n });
    return t(estAujourdhui ? "eau.tiroir.sous" : "eau.tiroir.sousAutre", { n, max: nombre(objectifMl / 1000, 1) });
  }, [totalMl, objectifMl, estAujourdhui]);

  const ouvrirEdition = (a: AjoutEau) => {
    setMlEdit(a.ml);
    setHeureEdit(a.heure_min);
    setEdition(a);
  };
  const bandeauEl = bandeau ? <BandeauAnnuler texte={bandeau} onAnnuler={onAnnuler} /> : null;

  if (edition)
    return (
      <>
        <Feuille
          visible={visible}
          onFermer={onFermer}
          titre={t("eau.modifier.titre")}
          glisserContenu={false}
          onRetour={() => setEdition(null)}
          pied={
            <View style={{ gap: 4 }}>
              <BoutonPrincipal
                libelle={t("ui.enregistrer")}
                onPress={() => {
                  onModifier(edition.id, { ml: mlEdit, heureMin: heureEdit, libelle: verreDe(mlEdit) });
                  setEdition(null);
                }}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  // La feuille redescend, puis la ligne se désintègre dans la liste (même délai que les repas du Journal).
                  marquerSuppression(edition.id, 250);
                  onSupprimer(edition);
                  setEdition(null);
                }}
                style={({ pressed }) => [styles.supprimer, pressed && { opacity: 0.6 }]}
              >
                <Texte variante="corps" style={{ fontSize: 14, fontFamily: police.medium, color: couleurs.rate }}>
                  {t("eau.supprimerAjout")}
                </Texte>
              </Pressable>
            </View>
          }
        >
          <RoueMl key={edition.id} valeur={edition.ml} valeurs={valeursAvec(edition.ml)} onChange={setMlEdit} />
          <LigneFilet libelle={t("eau.heure")} valeur={heureTexte(heureEdit)} filet={false} onPress={() => setHeureOuverte(true)} />
        </Feuille>
        <FeuilleHeure
          visible={heureOuverte}
          valeur={heureTexte(heureEdit)}
          titre={t("eau.heure.titre")}
          minutes={MINUTES}
          onFermer={() => setHeureOuverte(false)}
          onValider={(h) => {
            const [hh, mm] = h.split(":").map(Number) as [number, number];
            setHeureEdit(hh * 60 + mm);
            setHeureOuverte(false);
          }}
        />
      </>
    );

  const choisi = verreDe(ml);
  const options = VERRES.map((v) => ({ valeur: v.cle, libelle: t(`eau.${v.cle}`), sous: t("eau.ml", { n: v.ml }) }));
  const touche = (cle: CleVerre) => {
    setMl(VERRES.find((v) => v.cle === cle)!.ml);
    setCleRoue((n) => n + 1);
  };
  const colonnes = fontScale > POLICE_EMPILE ? 2 : undefined;

  return (
    <Feuille
      visible={visible}
      onFermer={onFermer}
      titre={t("eau.tiroir.titre")}
      sousTitre={sous}
      glisserContenu={false}
      pied={
        onglet === "ajouter" ? (
          <View style={{ gap: 8 }}>
            {bandeauEl}
            <BoutonPrincipal libelle={t("eau.ajouterMl", { n: ml })} onPress={() => onAjouter({ ml, heureMin: maintenantMin(), libelle: choisi })} />
          </View>
        ) : (
          bandeauEl ?? undefined
        )
      }
    >
      <Onglets
        marge={0}
        etiquette={t("eau.onglets")}
        onglets={[
          { valeur: "ajouter", libelle: t("eau.onglet.ajouter") },
          { valeur: "aujourdhui", libelle: t(estAujourdhui ? "eau.onglet.aujourdhui" : "eau.onglet.ceJour"), compte: ajouts.length },
        ]}
        valeur={onglet}
        onChange={setOnglet}
      />
      <PanneauxOnglets glisse={false} onglets={["ajouter", "aujourdhui"]} valeur={onglet} onChange={setOnglet}>
        {onglet === "ajouter" ? (
          <View style={{ gap: 8 }}>
            <Segmente options={options} valeur={choisi} onChange={touche} colonnes={colonnes} />
            <RoueMl key={cleRoue} valeur={ml} valeurs={VALEURS_ML} onChange={setMl} />
          </View>
        ) : (
          <ListeDesintegrable
            liste={ajouts}
            cleDe={(a) => a.id}
            autour={(e) => <View>{e}</View>}
            vide={
              <View style={styles.vide}>
                <Texte variante="corps" style={{ fontSize: 15, fontFamily: police.medium }}>
                  {t("eau.vide.titre")}
                </Texte>
                <Texte variante="corps" couleur="t2" style={{ fontSize: 13, lineHeight: 19, textAlign: "center" }}>
                  {t(estAujourdhui ? "eau.vide.texte" : "eau.vide.texteAutre")}
                </Texte>
              </View>
            }
            rendu={(a, etat) => (
              <GlisserSupprimer actif={() => etat !== "sort"} fondContenu={couleurs.feuilleFond} onSupprimer={() => onSupprimer(a)}>
                <LigneFilet
                  avant={
                    <Texte variante="corps" couleur="t3" numberOfLines={1} style={{ fontSize: 14, minWidth: 44, fontVariant: ["tabular-nums"] }}>
                      {heureTexte(a.heure_min)}
                    </Texte>
                  }
                  libelle={nomAjout(a)}
                  valeur={
                    <Texte variante="corps" numberOfLines={1} style={{ fontSize: 15, fontFamily: police.medium }}>
                      {t("eau.ml", { n: nombre(a.ml, 0) })}
                    </Texte>
                  }
                  chevron={false}
                  onPress={() => ouvrirEdition(a)}
                />
              </GlisserSupprimer>
            )}
          />
        )}
      </PanneauxOnglets>
    </Feuille>
  );
}

/** La roue des millilitres : « 250 » dans la bande, « ml » à droite ; lue « 250 millilitres », réglable par plus et moins. */
function RoueMl({ valeur, valeurs, onChange }: { valeur: number; valeurs: number[]; onChange: (ml: number) => void }) {
  return (
    <RoueDuree
      libelle={t("eau.roue")}
      valeur={valeur}
      valeurs={valeurs}
      onChange={onChange}
      traits={false}
      decoupe={(v) => ({ attenue: "", plein: String(v) })}
      lue={(v) => t("eau.roue.lue", { n: v })}
      unite={t("eau.mlUnite")}
    />
  );
}

const styles = StyleSheet.create({
  supprimer: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  vide: { alignItems: "center", gap: 4, paddingVertical: 36, paddingHorizontal: 24 },
});
