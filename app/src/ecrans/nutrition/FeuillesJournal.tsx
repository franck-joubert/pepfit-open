import { useEffect, useMemo, useState } from "react";
import { chiffresNutrition } from "./mode-affichage";
import { Pressable, StyleSheet, View } from "react-native";
import {
  consommationsDuRepas, copierConsommations, ecrireRepetition, joursRemplis, lireRepetition, REGLES_REPETITION, totalDe,
  type Consommation, type RegleRepetition, type Repas,
} from "../../db";
import { useTheme } from "../../theme";
import { espace, police, rayon } from "../../theme/typo";
import { decalerJour } from "../../nutrition/calculs";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { Segmente } from "../../ui/Segmente";
import { Texte } from "../../ui/Texte";
import { minuscule, t, tp } from "../../i18n/index";
import { useApp } from "../contexte";
import { jourEtroit, nombre } from "../format";
import { CaseCocher, LibellePrincipal, nomRepas, texteQuantite, valeurTexte } from "./commun";


// Feuilles du journal (planche : A-menu, A-copier, A-repeter) : le ⋯ d'un repas, copier d'un autre jour, répéter, le mois.

const NOM_REGLE: Record<RegleRepetition, Parameters<typeof t>[0]> = {
  jamais: "nutrition.regle.jamais",
  tous: "nutrition.regle.tous",
  entrainement: "nutrition.regle.entrainement",
  repos: "nutrition.regle.repos",
  semaine: "nutrition.regle.semaine",
};

/** « le déjeuner », « la collation ». */
export function leRepas(r: Pick<Repas, "cle" | "nom">): string {
  return t(r.cle === "collation" ? "nutrition.laRepas" : "nutrition.leRepas", { repas: minuscule(nomRepas(r)) });
}

/**
 * Le ⋯ d'un repas : titre et « 572 kcal · 3 aliments », Comme hier (la veille avait ce repas, celui-ci est vide), Copier d'un autre jour, Répéter (règle), Enregistrer comme plat (planche
 * plats, P9 : un repas qui a des aliments), Repas et horaires, Vider.
 */
export function FeuilleMenuRepas({
  repas, lignes, hierKcal, onFermer, onCommeHier, onCopier, onRepeter, onPlat, onHoraires, onVider,
}: {
  repas: Repas | null;
  lignes: Consommation[];
  /** Kcal du même repas la veille, quand il y avait des aliments et que celui-ci est vide ; sinon null (pas de ligne). */
  hierKcal: number | null;
  onFermer: () => void;
  onCommeHier: () => void;
  onCopier: () => void;
  onRepeter: () => void;
  onPlat: () => void;
  onHoraires: () => void;
  onVider: () => void;
}) {
  const { db } = useApp();
  const [regle, setRegle] = useState<RegleRepetition>("jamais");
  useEffect(() => {
    if (repas) lireRepetition(db, repas.id).then((r) => setRegle(r?.regle ?? "jamais")).catch(() => {});
  }, [db, repas]);
  const total = totalDe(lignes);
  return (
    <Feuille visible={repas != null} onFermer={onFermer} titre={repas ? nomRepas(repas) : undefined} sousTitre={chiffresNutrition() ? `${valeurTexte(total.kcal, total.approx)} ${t("nutrition.kcal")}, ${tp("nutrition.aliments", lignes.length)}` : tp("nutrition.aliments", lignes.length)}>
      {repas ? (
        <>
          <Groupe>
            {hierKcal != null ? <Option premier icone="copie" libelle={t("nutrition.commeHier")} valeur={chiffresNutrition() ? `${nombre(hierKcal, 0)} ${t("nutrition.kcal")}` : undefined} onPress={onCommeHier} /> : null}
            <Option premier={hierKcal == null} icone="copie" libelle={t("nutrition.copierAutreJour")} chevron onPress={onCopier} />
            <Option icone="repeat" libelle={t("nutrition.repeter")} valeur={t(NOM_REGLE[regle])} chevron onPress={onRepeter} />
            {lignes.length ? <Option icone="cocotte" libelle={t("plats.enregistrerComme")} chevron onPress={onPlat} /> : null}
          </Groupe>
          <Groupe>
            <Option premier icone="cal" libelle={t("nutrition.repasHoraires")} chevron onPress={onHoraires} />
          </Groupe>
          {lignes.length ? (
            <Groupe>
              <Option premier icone="trash" danger libelle={t("nutrition.viderRepas")} onPress={onVider} />
            </Groupe>
          ) : null}
        </>
      ) : null}
    </Feuille>
  );
}

/** Copier dans un repas : repas d'origine en segmenté, les sept jours d'avant, ses aliments cochés ; « Copier 3 aliments · 482 kcal ». */
export function FeuilleCopier({ repas, tous, date, onFermer, onCopie }: { repas: Repas | null; tous: Repas[]; date: string; onFermer: () => void; onCopie: () => void }) {
  const { db } = useApp();
  const { couleurs, mode } = useTheme();
  const [source, setSource] = useState<string>("");
  const [jour, setJour] = useState(decalerJour(date, -1));
  const [lignes, setLignes] = useState<Consommation[]>([]);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [remplis, setRemplis] = useState<Set<string>>(new Set());
  const jours = useMemo(() => Array.from({ length: 7 }, (_, i) => decalerJour(date, i - 7)), [date]);
  useEffect(() => {
    if (!repas) return;
    setSource(repas.id);
    setJour(decalerJour(date, -1));
    joursRemplis(db, decalerJour(date, -7), decalerJour(date, -1)).then(setRemplis).catch(() => {});
  }, [db, repas, date]);
  useEffect(() => {
    if (!repas || !source) return;
    consommationsDuRepas(db, jour, source)
      .then((l) => {
        setLignes(l);
        setCoches(new Set(l.map((x) => x.id)));
      })
      .catch(() => {});
  }, [db, repas, source, jour]);
  const choisies = lignes.filter((x) => coches.has(x.id));
  const kcal = totalDe(choisies).kcal;
  const libelleCopier = choisies.length ? tp("nutrition.copierN", choisies.length) : t("nutrition.copier");
  const copier = async () => {
    if (!repas || !choisies.length) return;
    await copierConsommations(db, choisies.map((x) => x.id), { date, repasId: repas.id });
    onCopie();
  };
  // Cinq repas dans un segmenté de 412 dp : les noms longs prennent leur forme courte (« Afternoon snack » s'y écrasait).
  const court = (r: Repas) => (r.nom ? r.nom : r.cle === "petit_dej" ? t("nutrition.petitDejCourt") : r.cle === "gouter" ? t("nutrition.gouterCourt") : nomRepas(r));
  return (
    <Feuille
      visible={repas != null}
      onFermer={onFermer}
      titre={repas ? t("nutrition.copierDans", { repas: leRepas(repas) }) : undefined}
      pied={
        <BoutonPrincipal libelle={libelleCopier} desactive={!choisies.length} onPress={() => void copier().catch(console.error)}>
          <LibellePrincipal libelle={libelleCopier} complement={choisies.length && chiffresNutrition() ? `${nombre(kcal, 0)} ${t("nutrition.kcal")}` : undefined} />
        </BoutonPrincipal>
      }
    >
      {repas ? (
        <>
          <Segmente options={tous.map((r) => ({ valeur: r.id, libelle: court(r) }))} valeur={source} onChange={setSource} />
          <View style={styles.jours}>
            {jours.map((j) => {
              const choisi = j === jour;
              const d = new Date(`${j}T12:00:00`);
              return (
                <Pressable
                  key={j}
                  accessibilityRole="button"
                  accessibilityState={{ selected: choisi }}
                  onPress={() => setJour(j)}
                  style={[styles.jour, choisi && { backgroundColor: mode === "nuit" ? couleurs.s3 : couleurs.s2 }]}
                >
                  <Texte variante="entete" couleur="t3">
                    {jourEtroit(d).toUpperCase()}
                  </Texte>
                  <Texte variante="saisie" style={{ fontSize: 16, lineHeight: 20, fontFamily: choisi ? police.semibold : police.medium }}>
                    {Number(j.slice(8))}
                  </Texte>
                  <View style={[styles.point, { backgroundColor: remplis.has(j) ? couleurs.partieNutrition : "transparent" }]} />
                </Pressable>
              );
            })}
          </View>
          {lignes.length ? (
            <Groupe>
              {lignes.map((x, i) => (
                <View key={x.id} style={[styles.ligne, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Texte variante="corps" numberOfLines={1} style={{ fontSize: 15, color: couleurs.t1 }}>
                      {x.produit.nom}
                    </Texte>
                    <Texte variante="meta" couleur="t3" numberOfLines={1} style={{ marginTop: 3 }}>
                      {chiffresNutrition() ? `${texteQuantite(x)}, ${nombre(x.macros.kcal, 0)} ${t("nutrition.kcal")}` : texteQuantite(x)}
                    </Texte>
                  </View>
                  <CaseCocher
                    coche={coches.has(x.id)}
                    libelle={x.produit.nom}
                    onPress={() =>
                      setCoches((c) => {
                        const n = new Set(c);
                        if (n.has(x.id)) n.delete(x.id);
                        else n.add(x.id);
                        return n;
                      })
                    }
                  />
                </View>
              ))}
            </Groupe>
          ) : (
            <Texte variante="corps" couleur="t3" style={{ textAlign: "center", paddingVertical: espace.l }}>
              {t("nutrition.repasVideCeJour")}
            </Texte>
          )}
        </>
      ) : null}
    </Feuille>
  );
}

/** Répéter un repas (D5) : sa règle ; le contenu du jour affiché sert de modèle, posé directement au journal (↻). */
export function FeuilleRepeter({ repas, date, lignes, onFermer }: { repas: Repas | null; date: string; lignes: Consommation[]; onFermer: () => void }) {
  const { db } = useApp();
  const [regle, setRegle] = useState<RegleRepetition>("jamais");
  useEffect(() => {
    if (repas) lireRepetition(db, repas.id).then((r) => setRegle(r?.regle ?? "jamais")).catch(() => {});
  }, [db, repas]);
  const choisir = (r: RegleRepetition) => {
    if (!repas) return;
    setRegle(r);
    ecrireRepetition(db, repas.id, { regle: r, date })
      .then(onFermer)
      .catch(console.error);
  };
  return (
    <Feuille
      visible={repas != null}
      onFermer={onFermer}
      titre={repas ? t("nutrition.repeterRepas", { repas: leRepas(repas) }) : undefined}
      sousTitre={lignes.length ? lignes.map((x) => x.produit.nom).join(", ") : undefined}
    >
      {repas ? (
        <>
          <Groupe>
            {REGLES_REPETITION.map((r, i) => (
              <Option key={r} premier={i === 0} libelle={t(NOM_REGLE[r])} choisi={r === regle} onPress={() => choisir(r)} />
            ))}
          </Groupe>
        </>
      ) : null}
    </Feuille>
  );
}

const styles = StyleSheet.create({
  jours: { flexDirection: "row", gap: 2 },
  jour: { flex: 1, height: 72, borderRadius: rayon.l, alignItems: "center", justifyContent: "center", gap: 3 },
  point: { width: 6, height: 6, borderRadius: 3 },
  ligne: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: espace.m, paddingLeft: espace.l, paddingRight: espace.l },
});
