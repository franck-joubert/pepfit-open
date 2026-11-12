// La saisie rapide du cycle (planche cycle, écran 4) : une feuille. Début (aujourd'hui par défaut) et Fin (« Pas encore »),
// l'Intensité en trois puces (les trois valeurs de Santé Connect), puis « Comment tu te sens · facultatif » : Énergie, Humeur,
// Gêne. « Chiffré, visible par toi seulement. Jamais dans le Fil. », puis « Enregistrer ». Toutes les puces font au moins
// 44 dp de haut ; aucun sélecteur natif : les dates se choisissent sur la roue de l'appli, dans la même feuille.
// Ouverte par « Noter ce jour » hors des règles (NOTES § 7, point 2) : les notes du jour d'abord, « Début des règles » en second.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { t } from "../../i18n/index";
import { formater } from "../../i18n/temps";
import { useTheme } from "../../theme";
import { police, rayon } from "../../theme/typo";
import { BoutonTonal } from "../../ui/BoutonTonal";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille } from "../../ui/Feuille";
import { Icone } from "../../ui/Icone";
import { RoueDuree } from "../../ui/RoueDuree";
import { Texte } from "../../ui/Texte";
import { signalerSaisie } from "../../precision/service";
import { isoLocal, noterJour, noterRegles, retirerRegles } from "../../cycle/donnees";
import { ecartJ, plus, type Episode, type Flux, type JourCycle } from "../../cycle/modele";
import { useApp } from "../contexte";
import { useMesure } from "../mesures/gabarit";
import { midiIso } from "./cycle-vue";

/** Ce que la feuille note : des règles (un épisode à corriger, ou un début proposé), ou les notes d'un jour hors des règles. */
export type SaisieCycle = { sorte: "regles"; episode?: Episode | null; debut?: string } | { sorte: "jour"; jour: string };

type Notes = Pick<JourCycle, "energie" | "humeur" | "gene">;
const SANS_NOTES: Notes = { energie: null, humeur: null, gene: null };
/** Jours en arrière proposés sur la roue du début. */
const JOURS_ROUE = 180;
const PAS_ENCORE = -1;

export function FeuilleCycle({
  saisie,
  jours,
  onFermer,
  onEnregistre,
  maintenant = Date.now(),
}: {
  saisie: SaisieCycle | null;
  /** Les jours notés (notes du jour, intensité de l'épisode corrigé). */
  jours: readonly JourCycle[];
  onFermer: () => void;
  onEnregistre: () => void;
  maintenant?: number;
}) {
  const { db } = useApp();
  const { couleurs } = useTheme();
  const auj = isoLocal(maintenant);
  const [sorte, setSorte] = useState<"regles" | "jour">("regles");
  const [etape, setEtape] = useState<"formulaire" | "debut" | "fin">("formulaire");
  const [debut, setDebut] = useState(auj);
  const [fin, setFin] = useState<string | null>(null);
  const [flux, setFlux] = useState<Flux>(2);
  const [notes, setNotes] = useState<Notes>(SANS_NOTES);
  const [brouillon, setBrouillon] = useState(0);
  const [garde, setGarde] = useState<SaisieCycle | null>(saisie);
  useEffect(() => void (saisie && setGarde(saisie)), [saisie]);

  // à chaque ouverture : ce que montre la feuille, d'après ce qui l'a ouverte
  useEffect(() => {
    if (!saisie) return;
    setEtape("formulaire");
    const notesDe = (j: string): Notes => {
      const x = jours.find((y) => y.jour === j);
      return x ? { energie: x.energie, humeur: x.humeur, gene: x.gene } : SANS_NOTES;
    };
    if (saisie.sorte === "jour") {
      setSorte("jour");
      setDebut(saisie.jour);
      setFin(null);
      setNotes(notesDe(saisie.jour));
      return;
    }
    setSorte("regles");
    const e = saisie.episode;
    const d = e?.debut ?? saisie.debut ?? auj;
    setDebut(d);
    setFin(e && !e.ouvert ? e.fin : null);
    const f = e ? jours.find((y) => y.jour === e.debut)?.flux : null;
    setFlux(f && f > 0 ? f : 2);
    setNotes(notesDe(d));
  }, [saisie, jours, auj]);

  const s = saisie ?? garde;
  const episode = s?.sorte === "regles" ? (s.episode ?? null) : null;
  const texteJour = (j: string) =>
    j === auj ? t("cycle.saisie.aujourdhui") : j === plus(auj, -1) ? t("cycle.saisie.hier") : formater(midiIso(j), { weekday: "short", day: "numeric", month: "short" });

  const enregistrer = async () => {
    if (sorte === "jour") await noterJour(db, debut, notes, maintenant);
    else await noterRegles(db, { debut, fin, flux, notes, remplace: episode ? { debut: episode.debut, fin: episode.fin } : null }, maintenant);
    signalerSaisie();
    onEnregistre();
    onFermer();
  };
  const retirer = async () => {
    if (!episode) return;
    await retirerRegles(db, episode.debut, episode.fin, maintenant);
    signalerSaisie();
    onEnregistre();
    onFermer();
  };

  // ---- la roue des dates, dans la même feuille
  if (etape !== "formulaire") {
    const offDebut = ecartJ(debut, auj);
    const valeurs = etape === "debut" ? Array.from({ length: JOURS_ROUE + 1 }, (_, i) => i) : [PAS_ENCORE, ...Array.from({ length: offDebut + 1 }, (_, i) => i)];
    const texte = (v: number) => (v === PAS_ENCORE ? t("cycle.saisie.pasEncore") : texteJour(plus(auj, -v)));
    const valider = () => {
      if (etape === "debut") {
        const d = plus(auj, -brouillon);
        setDebut(d);
        if (fin && fin < d) setFin(null);
      } else setFin(brouillon === PAS_ENCORE ? null : plus(auj, -brouillon));
      setEtape("formulaire");
    };
    return (
      <Feuille
        visible={!!saisie}
        onFermer={() => setEtape("formulaire")}
        titre={t(etape === "debut" ? "cycle.saisie.debut" : "cycle.saisie.fin")}
        glisserContenu={false}
        pied={<BoutonPrincipal libelle={t("ui.valider")} onPress={valider} />}
      >
        <RoueDuree
          key={etape}
          libelle={t(etape === "debut" ? "cycle.saisie.debut" : "cycle.saisie.fin")}
          valeur={brouillon}
          valeurs={valeurs}
          onChange={setBrouillon}
          traits={false}
          decoupe={(v) => ({ attenue: "", plein: texte(v) })}
          lue={texte}
        />
      </Feuille>
    );
  }

  const ouvrirRoue = (e: "debut" | "fin") => {
    setBrouillon(e === "debut" ? ecartJ(debut, auj) : fin ? ecartJ(fin, auj) : PAS_ENCORE);
    setEtape(e);
  };
  const note = (k: keyof Notes) => (v: number) => setNotes((n) => ({ ...n, [k]: n[k] === v ? null : v }));
  return (
    <Feuille
      visible={!!saisie}
      onFermer={onFermer}
      titre={t(sorte === "jour" ? "cycle.saisie.titreJour" : "cycle.saisie.titre")}
      sousTitre={sorte === "jour" ? texteJour(debut) : undefined}
      pied={
        <View style={{ gap: 10 }}>
          <View style={styles.garde}>
            <Icone nom="cadenas" couleur={couleurs.t3} taille={16} />
            <Texte variante="meta" couleur="t3" style={{ flex: 1 }}>
              {t("cycle.garde")}
            </Texte>
          </View>
          <BoutonPrincipal libelle={t("cycle.enregistrer")} onPress={() => void enregistrer().catch(console.error)} />
          {episode ? <BoutonTonal danger libelle={t("cycle.saisie.retirer")} onPress={() => void retirer().catch(console.error)} /> : null}
        </View>
      }
    >
      {sorte === "regles" ? (
        <>
          <LigneChoix titre={t("cycle.saisie.debut")} valeur={texteJour(debut)} onPress={() => ouvrirRoue("debut")} />
          <LigneChoix titre={t("cycle.saisie.fin")} valeur={fin ? texteJour(fin) : t("cycle.saisie.pasEncore")} onPress={() => ouvrirRoue("fin")} />
          <Titre texte={t("cycle.saisie.intensite")} />
          <Puces options={[1, 2, 3].map((v) => ({ v, libelle: t(`cycle.flux.${v}` as "cycle.flux.1") }))} valeur={flux} onChange={(v) => setFlux(v as Flux)} />
        </>
      ) : null}
      <Titre texte={t("cycle.saisie.commentTu")} suite={t("cycle.saisie.facultatif")} />
      <PetitTitre texte={t("cycle.saisie.energie")} />
      <Puces options={[1, 2, 3].map((v) => ({ v, libelle: t(`cycle.niveau.${v}` as "cycle.niveau.1") }))} valeur={notes.energie} onChange={note("energie")} />
      <PetitTitre texte={t("cycle.saisie.humeur")} />
      <Puces options={[1, 2, 3].map((v) => ({ v, libelle: t(`cycle.niveau.${v}` as "cycle.niveau.1") }))} valeur={notes.humeur} onChange={note("humeur")} />
      <PetitTitre texte={t("cycle.saisie.gene")} />
      <Puces options={[0, 1, 2].map((v) => ({ v, libelle: t(`cycle.gene.${v}` as "cycle.gene.0") }))} valeur={notes.gene} onChange={note("gene")} />
      {sorte === "jour" ? (
        <View style={{ marginTop: 18 }}>
          <LigneChoix
            titre={t("cycle.saisie.debutRegles")}
            sous={t("cycle.saisie.debutReglesSous")}
            valeur=""
            onPress={() => {
              setSorte("regles");
              setFin(null);
              setFlux(2);
            }}
          />
        </View>
      ) : null}
    </Feuille>
  );
}

/** Une ligne de la feuille (52 dp, toute la ligne se touche) : « Début · Aujourd'hui › ». */
function LigneChoix({ titre, sous, valeur, onPress }: { titre: string; sous?: string; valeur: string; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[titre, sous, valeur].filter(Boolean).join(", ")}
      onPress={onPress}
      style={({ pressed }) => [styles.ligne, { borderBottomColor: couleurs.line }, pressed && { backgroundColor: couleurs.s3 }]}
    >
      <View style={{ flex: 1 }}>
        <Texte variante="corps" style={{ fontSize: 15, fontFamily: police.medium }}>
          {titre}
        </Texte>
        {sous ? (
          <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>
            {sous}
          </Texte>
        ) : null}
      </View>
      <Texte variante="corps" couleur="t2" style={{ fontSize: 15 }}>
        {valeur}
      </Texte>
      <Icone nom="right" couleur={couleurs.t3} taille={16} />
    </Pressable>
  );
}

function Titre({ texte, suite }: { texte: string; suite?: string }) {
  return (
    <Texte variante="corps" style={styles.titre}>
      {texte}
      {suite ? (
        <Texte variante="corps" couleur="t3" style={[styles.titre, { fontFamily: police.regular }]}>
          {suite}
        </Texte>
      ) : null}
    </Texte>
  );
}

function PetitTitre({ texte }: { texte: string }) {
  return (
    <Texte variante="meta" couleur="t2" style={{ marginTop: 10, marginBottom: 6 }}>
      {texte}
    </Texte>
  );
}

/** Trois puces de 44 dp au moins (toute la puce se touche ; jamais de sélecteur natif). */
function Puces({ options, valeur, onChange }: { options: { v: number; libelle: string }[]; valeur: number | null; onChange: (v: number) => void }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  return (
    <View style={styles.puces} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.v === valeur;
        return (
          <Pressable
            key={o.v}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.libelle}
            onPress={() => onChange(o.v)}
            style={({ pressed }) => [styles.puce, { backgroundColor: on ? m.fort : pressed ? couleurs.s3 : couleurs.segmentPiste }]}
          >
            <Texte variante="corps" style={{ fontSize: 14, fontFamily: on ? police.semibold : police.medium, color: on ? "#ffffff" : couleurs.t2 }}>
              {o.libelle}
            </Texte>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  titre: { fontSize: 13, fontFamily: police.semibold, marginTop: 18, marginBottom: 8 },
  puces: { flexDirection: "row", gap: 8 },
  puce: { flex: 1, minHeight: 44, borderRadius: rayon.l, alignItems: "center", justifyContent: "center" },
  garde: { flexDirection: "row", alignItems: "center", gap: 6 },
});
