// Détail du bilan (planche sante-energie § 2, D6) : la dépense décomposée, chaque terme avec sa source ; les apports et le
// solde ; les 7 derniers jours autour du zéro ; le lien vers la méthode du métabolisme. Navigation jour par jour.
import { bilanAffiche, useChiffresNutrition } from "./nutrition/mode-affichage";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import { t, tp } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { couleursSante } from "../theme/effets";
import { espace, police } from "../theme/typo";
import { Feuille, Groupe } from "../ui/Feuille";
import { Texte } from "../ui/Texte";
import { useApp } from "./contexte";
import { LigneSurlignee, useLignesChangees } from "./mesures/LignesChangees";
import { segmentsDepense, moyenneSoldes, type MethodeBmr, type MethodeRetenue } from "./energie-calc";
import type { ManqueProfil } from "./energie-precision";
import { jourMoisChiffres } from "./composition-vue";
import { approx, jourCourt, jourSemaineMois, nombre } from "./format";
import { decaler, jourEnergie, lireReglagesEnergie, listeManques, nomSource, soldesSemaine, type JourEnergie } from "./sante-donnees";
import { BarreSegments, IndicePrecision, NavJour, Point, Valeur } from "./sante-ui";
import { Filet, Ligne } from "./suivi-ui";
import { sousPas, sousSport as sousSportTexte } from "./activites-vue";
import { usePrecision } from "./precision/usePrecision";
import { niveau } from "../precision/modele";

/** « −262 », « +92 », « ~2 892 » : signe typographique, « ~ » devant une estimation (D3, D5). */
export const kcal = (v: number, estime = false) => approx(nombre(v, 0), estime);
export const signe = (v: number) => `${Math.round(v) > 0 ? "+" : ""}${nombre(v, 0)}`;
/** Solde signé, « ~ » devant s'il est estimé (« ~ −357 »). */
export const signeEstime = (v: number, estime: boolean) => approx(signe(v), estime);
/** « −0,4 », « +0,2 » (kg par semaine). */
const signeDecimal = (v: number) => `${Math.round(v * 10) > 0 ? "+" : ""}${nombre(v, 1)}`;

export function libelleJour(jour: number, maintenant = Date.now()): string {
  const auj = decaler(maintenant, 0);
  if (jour >= auj) return t("sante.aujourdhui");
  if (jour === decaler(auj, -1)) return t("sante.hier");
  return jourSemaineMois(jour);
}

export const libelleMethode = (m: MethodeBmr | MethodeRetenue, origine?: string | null) =>
  m === "balance" && origine ? t("sante.methode.balanceDe", { nom: nomSource(origine) }) : t(`sante.methode.${m}` as "sante.methode.auto");

/** Métabolisme par défaut : « Adulte moyen », et ce qui manque s'il ne manque qu'une ou deux données (la ligne tient). */
export const sousDefaut = (manques: readonly ManqueProfil[]) =>
  manques.length && manques.length <= 2 ? t("sante.defautSans", { liste: listeManques(manques) }) : t("sante.defautAdulte");

/** Sous-titre du métabolisme : la balance et sa date, l'estimation générale et ce qui lui manque, ou la formule. */
export function sousMetabolisme(e: JourEnergie): string {
  if (e.bmrMesure) return t("sante.balanceDe", { nom: nomSource(e.bmrMesure.origine), date: jourMoisChiffres(e.bmrMesure.date) });
  if (e.bmr.methode === "defaut") return sousDefaut(e.bmr.manques ?? []);
  return t("sante.estimation", { methode: libelleMethode(e.bmr.methode) });
}

export function FeuilleEnergie({ visible, onFermer, jourDepart, onPrecision }: { visible: boolean; onFermer: () => void; jourDepart: number; onPrecision: () => void }) {
  useLangue();
  const { db } = useApp();
  const { couleurs, mode } = useTheme();
  const c = couleursSante[mode];
  const chiffres = useChiffresNutrition();
  const [jour, setJour] = useState(jourDepart);
  const [e, setE] = useState<JourEnergie | null>(null);
  const [semaine, setSemaine] = useState<{ jour: number; solde: number | null; estime: boolean }[]>([]);
  const [methode, setMethode] = useState<MethodeBmr>("auto");
  const [version, setVersion] = useState(0);
  const precision = usePrecision(version);
  useEffect(() => {
    if (visible) setJour(jourDepart);
  }, [visible, jourDepart]);
  useEffect(() => {
    if (!visible) return;
    let vivant = true;
    (async () => {
      const r = await lireReglagesEnergie(db);
      const x = await jourEnergie(db, jour, Date.now(), r);
      const s = await soldesSemaine(db, jour);
      if (vivant) {
        setMethode(r.methode);
        setE(x);
        setSemaine(s);
      }
    })().catch(console.error);
    return () => {
      vivant = false;
    };
  }, [db, jour, visible, version]);

  const auj = decaler(Date.now(), 0);
  const b = e ? bilanAffiche(e.bilan, chiffres) : undefined;
  const changees = useLignesChangees(e?.jour ?? jour, visible ? e : null);
  const segs = b ? segmentsDepense(b) : [];
  const couleurTerme = { bmr: c.bmr, sport: c.sport, neat: c.neat, digestion: c.digestion };
  const sousSport = sousSportTexte(b?.sport.seances ?? []);
  const sousBmr = e ? sousMetabolisme(e) : "";
  const recharge = b?.recharge;
  const sousApports =
    recharge?.source === "habitudes"
      ? tp(recharge.methode === "jourSemaine" ? "sante.apportsJourSemaine" : "sante.apportsHabitudes", recharge.n)
      : tp("sante.journalRepas", e?.nbRepas ?? 0);
  const sousDigestion = b?.digestion.duJournal && b.apports
    ? t("sante.partApports", { n: nombre((b.digestion.kcal / b.apports) * 100, 0) })
    : recharge?.source === "habitudes" && b?.apports
      ? t("sante.partApportsEstimes", { n: nombre((b.digestion.kcal / b.apports) * 100, 0) })
      : t("sante.digestionEstimee");

  return (
    <Feuille visible={visible} onFermer={onFermer}>
      <View style={{ flexDirection: "row", alignItems: "center", minHeight: 52 }}>
        <Texte variante="titre" accessibilityRole="header" style={{ flex: 1 }}>
          {t("sante.energie")}
        </Texte>
        <NavJour
          libelle={libelleJour(jour)}
          onPrecedent={() => setJour((j) => decaler(j, -1))}
          onSuivant={() => setJour((j) => Math.min(auj, decaler(j, 1)))}
          suivantPossible={jour < auj}
          libellePrecedent={t("sante.jourPrecedent")}
          libelleSuivant={t("sante.jourSuivant")}
        />
      </View>
      {b ? (
        <>
          <BarreSegments hauteur={12} segments={segs.map((s) => ({ couleur: couleurTerme[s.cle], valeur: s.kcal }))} style={{ marginTop: espace.s, marginBottom: espace.xs }} />
          <Groupe>
            <Ligne avant={<Point couleur={c.bmr} />} titre={t("sante.metabolisme")} sous={sousBmr} valeur={kcal(b.bmr.kcal, b.bmr.estime)} />
            <Filet />
            <LigneSurlignee actif={changees.has("sport")} couleur={couleurs.partieSante}>
              <Ligne
                avant={<Point couleur={c.sport} />}
                titre={t("sante.sportTerme")}
                sous={sousSport}
                // calculé chez nous, la source dite dessous : jamais « ~ » (décision du 31/10)
                valeur={kcal(b.sport.kcal)}
                // le sport compte en plus du métabolisme : moins que la dépense brute du capteur (D11 de la revue finale)
                sousValeur={b.sport.kcal > 0 ? t("sante.enPlusDuRepos") : undefined}
              />
            </LigneSurlignee>
            {b.neat ? (
              <>
                <Filet />
                <LigneSurlignee actif={changees.has("neat")} couleur={couleurs.partieSante}>
                  <Ligne
                    avant={<Point couleur={c.neat} />}
                    titre={t("sante.pas")}
                    sous={sousPas(t(b.neat.defaut ? "sante.pasSupposes" : b.neat.seancesSansPas ? "sante.pasJourSeances" : "sante.pasHorsSport", { n: nombre(b.neat.pasHorsSport, 0) }), b.neat.ignorees)}
                    valeur={kcal(b.neat.kcal, true)}
                  />
                </LigneSurlignee>
              </>
            ) : null}
            <Filet />
            <Ligne
              avant={<Point couleur={c.digestion} />}
              titre={t("sante.digestion")}
              sous={sousDigestion}
              valeur={kcal(b.digestion.kcal, b.digestion.estime)}
            />
            {e!.recalage ? (
              <>
                <Filet />
                <Ligne
                  avant={<Point couleur="transparent" />}
                  titre={t("sante.selonPoids")}
                  sous={t("sante.selonPoidsSous", { v: signeDecimal(e!.recalage.kgSemaine) })}
                  valeur={signeEstime(b.ajustement, true)}
                />
              </>
            ) : null}
            <Filet />
            <Ligne
              titre={<Texte variante="corps" style={{ fontSize: 15, fontFamily: police.semibold }}>{t("sante.depense")}</Texte>}
              sous={
                // sa précision ouvre la feuille de la dépense, qui prend la place de celle-ci ; le conseil y est (§ 6 bis)
                precision ? <IndicePrecision niveau={niveau(precision.r.p.depense ?? 0)} onPress={onPrecision} style={{ marginTop: 3, marginLeft: -6 }} /> : null
              }
              valeur={<Valeur v={kcal(b.depense.kcal, b.depense.estime)} unite={t("sante.kcal")} taille={17} gras={police.semibold} />}
            />
          </Groupe>
          {b.apports != null ? (
            <Groupe>
              <Ligne avant={<Point couleur={c.apports} />} titre={t("sante.apports")} sous={sousApports} valeur={kcal(b.apports, b.soldeEstime)} />
              <Filet />
              <Ligne
                titre={<Texte variante="corps" style={{ fontSize: 15, fontFamily: police.semibold }}>{t("sante.solde")}</Texte>}
                valeur={<Valeur v={signeEstime(b.solde!, b.soldeEstime)} unite={t("sante.kcal")} taille={22} gras={police.semibold} />}
              />
            </Groupe>
          ) : null}
        </>
      ) : (
        <Texte variante="corps" couleur="t2" style={{ marginVertical: espace.l }}>
          {t("sante.pasDeBilan")}
        </Texte>
      )}
      {chiffres ? (
        <Groupe>
          <Semaine l={semaine} auj={jour} />
        </Groupe>
      ) : null}
      <Groupe>
        <Ligne
          hauteur={52}
          titre={t("sante.methodeMetabolisme")}
          valeur={methode === "auto" ? t("sante.methode.auto") : libelleMethode(methode)}
          doux
          onPress={() => {
            onFermer();
            router.push("/sante/metabolisme");
          }}
        />
      </Groupe>
    </Feuille>
  );
}

/** 7 derniers jours : le solde de chaque jour autour du zéro (vert = excédent, rose = déficit), le jour choisi plein ; un
 * jour aux apports estimés (habitudes) est pâli. */
function Semaine({ l, auj }: { l: { jour: number; solde: number | null; estime: boolean }[]; auj: number }) {
  const { couleurs, mode } = useTheme();
  const c = couleursSante[mode];
  const { width } = useWindowDimensions();
  const W = width - espace.l * 4;
  const H = 96;
  const mid = 44;
  const max = Math.max(400, ...l.map((x) => Math.abs(x.solde ?? 0)));
  const k = 40 / max;
  const pas = W / 7;
  const bw = 26;
  const moy = moyenneSoldes(l.map((x) => x.solde));
  return (
    <View style={{ paddingHorizontal: espace.l, paddingTop: 14, paddingBottom: espace.m }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Texte variante="corps" style={{ fontFamily: police.medium }}>
          {t("sante.septJours")}
        </Texte>
        {moy != null ? (
          <Texte variante="meta" couleur="t3">
            {t("sante.moyenneJour", { v: signe(moy) })}
          </Texte>
        ) : null}
      </View>
      <Svg
        width={W}
        height={H}
        style={{ marginTop: 10 }}
        accessibilityLabel={l.filter((x) => x.solde != null).map((x) => t("sante.soldeDu", { jour: jourSemaineMois(x.jour), v: signe(x.solde!) })).join(", ")}
      >
        <Line x1={0} x2={W} y1={mid} y2={mid} stroke={couleurs.line2} strokeWidth={1} />
        {l.map((x, i) => {
          const xx = i * pas + (pas - bw) / 2;
          const choisi = x.jour === auj;
          const v = x.solde;
          const h = v == null ? 0 : Math.max(2, Math.abs(v) * k);
          return (
            <G key={x.jour}>
              {v != null ? (
                <Rect x={xx} y={v >= 0 ? mid - h : mid} width={bw} height={h} rx={3} fill={v >= 0 ? c.apports : c.sport} opacity={(choisi ? 1 : 0.72) * (x.estime ? 0.45 : 1)} />
              ) : null}
              <SvgText x={xx + bw / 2} y={H - 2} fontSize={11} fontFamily={police.regular} textAnchor="middle" fill={choisi ? couleurs.t1 : couleurs.t3}>
                {choisi && x.jour === decaler(Date.now(), 0) ? t("suivi.aujCourt") : jourCourt(x.jour)}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
