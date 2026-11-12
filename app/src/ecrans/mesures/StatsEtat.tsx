// Ce que partagent les pages des mesures « état » (Poids, Masse grasse, VFC, Fréquence cardiaque au repos ; planche pas,
// NOTES § 1, retour du 29/10) :
//   - les statistiques : 30 j, 90 j, 1 an, Tout (depuis le premier relevé), la carte glissable (Statistiques.tsx), la courbe
//     (CourbeEtat.tsx) dont l'axe du temps garde toute la période même sans relevé (la date de début à gauche, « auj. » à
//     droite, la partie vide reste vide : on voit que l'historique commence plus tard, et les boutons ne bougent jamais) ;
//   - l'historique derrière un seul bouton (« Toutes les pesées » : la date et la valeur de la dernière, chevron) qui ouvre la
//     page agenda en vue liste ; l'icône agenda de l'en-tête l'ouvre en vue mois (registre agenda-store.ts).
import { useLargeurContenu } from "../../ui/CadreContenu";
import { t, tp } from "../../i18n/index";
import { formater } from "../../i18n/temps";
import { fixe } from "../composition-vue";
import { heure, jourSemaineMois } from "../format";
import { jourPesee } from "../poids";
import { ouvrirAgenda, type EntreeAgenda } from "./agenda-store";
import { indicesEtiquettes, periodeEtat, periodeEtatExiste, relevesEntre, serieJours, serieMesures, statsEtat, TYPES_ETAT, type AjustementLisse, type PointEtat, type Releve, type TypeEtat } from "./corps-calc";
import { colonnesPiste, CourbeEtat, type BandeJour } from "./CourbeEtat";
import { Cles, FlecheVariation, Groupe, LigneMesure, Lignes, Variation, type Cle } from "./gabarit";
import { minuit, signe } from "./periodes";
import { EnteteStats, Statistiques, useStats } from "./Statistiques";
import { Texte } from "../../ui/Texte";

/** Heure d'un relevé, rien si la source n'en donne pas (nuit Whoop sans fin de sommeil : minuit pile). */
export const heureReleve = (r: Releve): string => (r.date === minuit(r.date) ? "" : heure(r.date));

export function StatsEtat({
  id,
  releves,
  unite,
  dec,
  maintenant,
  objectif = null,
  bandeDe,
  libelleCourbe,
  cles,
  nomReleves,
  sourceDe,
  mode = "lisse",
  typeDepart = "mois",
  ajustement,
}: {
  /** Moyenne lissée ajustée au cycle (le poids, planche cycle § 3.5). */
  ajustement?: AjustementLisse | null;
  /** « lisse » : moyenne lissée (poids, gras, VFC…) ; « mesures » : les mesures reliées, sans tendance (tours, M6). */
  mode?: "lisse" | "mesures";
  typeDepart?: TypeEtat;
  /** « poids », « vfc »… : clé des périodes affichées. */
  id: string;
  /** Relevés dans l'unité affichée, du plus ancien au plus récent. */
  releves: readonly Releve[];
  unite: string;
  dec: number;
  maintenant: number;
  objectif?: number | null;
  /** Bande de ta normale de chaque jour de la période (VFC, FC au repos). */
  bandeDe?: (pts: readonly PointEtat[]) => BandeJour[];
  libelleCourbe: (periode: string) => string;
  cles: readonly Cle[];
  /** « Mesures », « Nuits mesurées » */
  nomReleves: string;
  sourceDe: (r: Releve) => string;
}) {
  const width = useLargeurContenu();
  const st = useStats<TypeEtat>(typeDepart);
  const mesures = mode === "mesures";
  const serie = mesures ? serieMesures : (r: readonly Releve[], debut: number, fin: number) => serieJours(r, debut, fin, ajustement);
  const p = periodeEtat(releves, st.type, st.k, maintenant, serie);
  const s = statsEtat(p);
  const N = p.pts.length;
  const bande = bandeDe ? bandeDe(p.pts) : null;
  const precedent = periodeEtatExiste(releves, st.type, st.k + 1, maintenant);
  const avant = st.k === 0 && st.type !== "tout" && precedent ? statsEtat(periodeEtat(releves, st.type, 1, maintenant, serie)) : null;
  const longueur = t(`mesuresCorps.longueur.${st.type}` as "mesuresCorps.longueur.mois");
  const annee = (ms: number) => new Date(ms).getFullYear() !== new Date(maintenant).getFullYear();
  // la date de début de la période, toujours entière (l'année si ce n'est pas celle-ci, ou sur 1 an et Tout)
  const dateDebut = (ms: number) =>
    formater(ms, st.type === "annee" || st.type === "tout" || annee(ms) ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });
  const titrePeriode = t("mesuresCorps.titrePeriode", { debut: dateDebut(p.debut), fin: st.k === 0 ? t("mesuresCorps.aujourdhui") : formater(p.fin, { day: "numeric", month: "short" }) });
  const etiquettes = indicesEtiquettes(st.type, N).map((i) => {
    const j = p.pts[i]!.jour;
    const texte =
      i === N - 1 ? (st.k === 0 ? t("mesuresCorps.auj") : formater(j, { day: "numeric", month: "short" })) : i === 0 ? dateDebut(j) : st.type === "annee" ? formater(j, { month: "short" }) : formater(j, { day: "numeric", month: "short" });
    return [i, texte] as const;
  });
  const choisi: PointEtat | null = st.sel != null ? (p.pts[st.sel] ?? null) : null;
  const bandeChoisie = st.sel != null && bande ? (bande[st.sel] ?? null) : null;
  const decPente = dec + 1;
  const cle = `${id}-${st.type}-${st.k}`;
  const entete = choisi ? (
    <EnteteStats
      petit={
        choisi.releve
          ? t("mesuresCorps.pointSource", { date: jourSemaineMois(choisi.jour), source: sourceDe(choisi.releve), heure: heureReleve(choisi.releve) }).trim()
          : jourSemaineMois(choisi.jour)
      }
      valeur={choisi.v != null ? fixe(choisi.v, dec) : t("mesuresCorps.pasDeMesure")}
      unite={choisi.v != null ? unite : null}
      vide={choisi.v == null}
      ligne={
        [
          choisi.l != null && !mesures ? t("mesuresCorps.moyenneLissee", { v: fixe(choisi.l, dec), u: unite }) : null,
          bandeChoisie ? t("mesuresCorps.bandeSel", { bas: fixe(bandeChoisie.bas, dec), haut: fixe(bandeChoisie.haut, dec), u: unite }) : null,
        ]
          .filter(Boolean)
          .join(", ") || undefined
      }
    />
  ) : mesures ? (
    // M12 : la flèche diagonale devant l'évolution et devant celle de la période d'avant
    <EnteteStats
      petit={t("mensurations.evolution", { longueur })}
      devant={s.variation != null && Math.round(s.variation * 10 ** dec) !== 0 ? <FlecheVariation d={s.variation} taille={20} /> : null}
      valeur={s.variation == null ? "—" : Math.round(s.variation * 10 ** dec) === 0 ? "=" : `${s.variation > 0 ? "+" : "−"}${fixe(Math.abs(s.variation), dec)}`}
      unite={s.variation != null && Math.round(s.variation * 10 ** dec) !== 0 ? unite : null}
      ligne={
        <>
          <Texte variante="meta" couleur="t2">
            {`${tp("mensurations.nMesures", s.n)}${avant?.variation != null ? `, ${t("mensurations.avant", { longueur })}` : ""}`}
          </Texte>
          {avant?.variation != null ? <Variation d={avant.variation} dec={dec} suite={` ${unite}`} couleur="t2" /> : null}
        </>
      }
    />
  ) : (
    <EnteteStats
      petit={t("mesuresCorps.evolution", { longueur })}
      valeur={s.variation != null ? signe(s.variation, dec) : "—"}
      unite={unite}
      ligne={
        s.parSemaine != null
          ? `${t("mesuresCorps.parSemaine", { v: signe(s.parSemaine, decPente), u: unite })}${avant?.variation != null ? `, ${t("mesuresCorps.avant", { v: signe(avant.variation, dec), u: unite })}` : ""}`
          : undefined
      }
    />
  );

  return (
    <Statistiques<TypeEtat>
      periodes={TYPES_ETAT.map((v) => ({ valeur: v, libelle: t(`mesuresCorps.periode.${v}` as "mesuresCorps.periode.mois") }))}
      type={st.type}
      onType={st.choisirType}
      titre={titrePeriode}
      precedent={precedent}
      onAller={st.aller}
      k={st.k}
      entete={entete}
      nb={colonnesPiste(N, width - 56)}
      sel={st.sel}
      onSel={(i) => st.setSel(i == null ? null : Math.min(i, N - 1))}
      cle={cle}
      libelleGraphe={libelleCourbe(titrePeriode)}
      graphe={(l) => <CourbeEtat pts={p.pts} bande={bande} largeur={l} cle={cle} sel={st.sel} objectif={objectif} etiquettes={etiquettes} libelle={titrePeriode} />}
      legende={<Cles cles={cles} />}
      apres={
        <Groupe>
          <Lignes>
            {[
              mesures ? null : <LigneMesure
                key="t"
                titre={t("mesuresCorps.tendance")}
                sous={t("mesuresCorps.tendanceSous")}
                valeur={s.parSemaine != null ? signe(s.parSemaine, decPente) : "—"}
                unite={s.parSemaine != null ? t("mesuresCorps.uniteSem", { u: unite }) : null}
                sousValeur={s.parSemaine != null ? t("mesuresCorps.parMois", { v: signe((s.parSemaine * 30) / 7, dec), u: unite }) : undefined}
              />,
              s.min ? <LigneMesure key="b" titre={t("mesuresCorps.plusBas")} valeur={fixe(s.min.v!, dec)} unite={unite} sousValeur={jourSemaineMois(s.min.jour)} /> : null,
              s.max ? <LigneMesure key="h" titre={t("mesuresCorps.plusHaut")} valeur={fixe(s.max.v!, dec)} unite={unite} sousValeur={jourSemaineMois(s.max.jour)} /> : null,
              <LigneMesure key="n" titre={nomReleves} valeur={String(s.n)} unite={t("mesuresCorps.surJours", { n: s.jours })} />,
            ]}
          </Lignes>
        </Groupe>
      }
    />
  );
}

/** « Toutes les pesées » : la date et la valeur de la dernière, chevron ; ouvre l'agenda en vue liste. */
export function LigneToutes({ titre, dernier, texte, maintenant, onPress }: { titre: string; dernier: Releve | null; texte: string; maintenant: number; onPress: () => void }) {
  return (
    <Groupe style={{ marginTop: 28 }}>
      <LigneMesure titre={titre} sous={dernier ? jourPesee(dernier.date, maintenant) : null} etat={dernier ? texte : null} onPress={onPress} />
    </Groupe>
  );
}

/** Ouvre la page agenda sur ces relevés (vue liste ou mois). `lire` relit `releves()` à chaque fois : l'agenda voit les derniers. */
export function ouvrirAgendaEtat({
  titre,
  maintenant,
  releves,
  legende,
  vue,
  entree,
  onJour,
}: {
  titre: string;
  maintenant: number;
  releves: () => readonly Releve[];
  legende: string;
  vue: "liste" | "mois";
  entree: (r: Releve) => EntreeAgenda;
  onJour: (jour: number) => void;
}) {
  const l = releves();
  ouvrirAgenda({
    titre,
    maintenant,
    premier: l.length ? minuit(Math.min(...l.map((r) => r.date))) : null,
    legende,
    vue,
    lire: async (debut, fin) => relevesEntre(releves(), debut, fin).map(entree),
    onJour,
  });
}
