// Cartes de mesure de l'Accueil modulable (planche pas § 1 bis à 1 quater, validées le 28/10) : même carte que les autres
import { bilanAffiche, useChiffresNutrition } from "../nutrition/mode-affichage";
// blocs (en-tête icône 18 + libellé 13, valeur 24, une ou deux lignes de 13, un petit dessin ; demie ≥ 132 px), toute la
// carte ouvre sa page de statistiques. Pleine : Pas (7 jours en barres), Poids et masse grasse (deux colonnes, chacune
// ouvre sa page), Énergie (solde des 7 jours), Sommeil (7 nuits, mini-hypnogramme pleine largeur). Rien d'inventé : une
// carte sans donnée dit ce qui manque et mène à l'écran qui la débloque.
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { PointJour } from "./gabarit";
import { niveauSommeil, type NiveauPoint } from "./niveau-point";
import Svg, { Circle, Line, Polyline, Rect } from "react-native-svg";
import { lireActif, minuscule, t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { couleursSante } from "../../theme/effets";
import { espace, police, rayon } from "../../theme/typo";
import { Texte } from "../../ui/Texte";
import { fixe } from "../composition-vue";
import { approx, heure, jourMois, nombre, versUnite } from "../format";
import { dureeSommeil } from "../sante-vue";
import { valeurPas } from "../pas-source";
import { listeManques, routeManque } from "../sante-donnees";
import type { DonneesCartes } from "./cartes-donnees";
import { BarrePhases, MiniHypnogramme } from "./GraphesSommeil";
import { signe } from "./periodes";
import { motRecup, phraseRecup } from "./recup-vue";
import { texteEffort } from "./scores-calc";
import { partAnneau } from "../effort-pepfit";
import { nomCategorie, pourAge, RampeVo2, texteVo2 } from "./Vo2";
import { allureA } from "./vma-calc";
import { allureTexte } from "../../natif/suivi/logique";

export type IdCarteAccueil = "pas" | "poids" | "energie" | "sommeil" | "recup" | "effort" | "age" | "vo2max";

/** Les mêmes douces que les pages (barre sous l'objectif à 0,62 le jour, 0,7 la nuit). */
function useTeintes(sport = false) {
  const { couleurs, mode } = useTheme();
  const fort = sport ? couleurs.partieEntrainement : couleurs.partieSante;
  const doux = sport ? (mode === "jour" ? "rgba(232,89,12,0.55)" : "rgba(249,115,22,0.62)") : mode === "jour" ? "rgba(229,23,139,0.62)" : "rgba(255,79,154,0.7)";
  // filet de la partie, translucide (revue finale n° 6 : plus de gris opaque)
  return { fort, doux, ...couleurs, sep: couleurs.line, e: couleursSante[mode] };
}

export function ContenuMesure({ id, plein, d, tete, interactif }: { id: IdCarteAccueil; plein: boolean; d: DonneesCartes; tete: (meta?: string) => ReactNode; interactif: boolean }) {
  switch (id) {
    case "pas":
      return <CartePas plein={plein} d={d} tete={tete} />;
    case "poids":
      return <CartePoids plein={plein} d={d} tete={tete} interactif={interactif} />;
    case "energie":
      return <CarteEnergie plein={plein} d={d} tete={tete} />;
    case "sommeil":
      return <CarteSommeil plein={plein} d={d} tete={tete} />;
    case "recup":
      return <CarteRecup d={d} tete={tete} />;
    case "effort":
      return <CarteEffort d={d} tete={tete} />;
    case "age":
      return <CarteAge d={d} tete={tete} />;
    case "vo2max":
      return <CarteVo2 plein={plein} d={d} tete={tete} />;
  }
}

const PAGE_MESURE: Record<IdCarteAccueil, string> = {
  pas: "/sante/pas",
  poids: "/sante/poids",
  energie: "/sante/energie",
  sommeil: "/sante/sommeil",
  recup: "/sante/recuperation",
  effort: "/sante/effort",
  age: "/sante/age",
  vo2max: "/sante/vo2max",
};

/** Le toucher de la carte entière : sa page, ou l'écran qui débloque la donnée ; pas encore lue (`attente`) : sa page. */
export function actionMesure(id: IdCarteAccueil, d: DonneesCartes, attente = false): () => void {
  const page = PAGE_MESURE;
  if (attente) return () => router.push(page[id] as "/sante/pas");
  if (id === "pas" && (d.pas?.jour.etat ?? "a-connecter") === "a-connecter") return () => router.push("/settings/connexions");
  if (id === "energie" && d.energie?.etat.etat === "a-completer") {
    const manques = d.energie.etat.manques;
    return () => router.push(routeManque(manques));
  }
  return () => router.push(page[id] as "/sante/pas");
}

// ---- Briques ------------------------------------------------------------------------------------------------------------

function Valeur({ v, unite }: { v: string; unite?: string }) {
  const { couleurs } = useTheme();
  return (
    <Texte numberOfLines={1} style={styles.valeur}>
      <Texte style={[styles.nombre, { color: couleurs.t1 }]}>{v}</Texte>
      {unite ? <Texte style={[styles.unite, { color: couleurs.t2 }]}>{` ${unite}`}</Texte> : null}
    </Texte>
  );
}

/** Ligne de la carte précédée du point de la nuit (sommeil d'après sa performance). */
function SousPoint({ niveau, children }: { niveau: NiveauPoint; children: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1 }}>
      <PointJour niveau={niveau} taille={8} libelle={t(`pointSommeil.${niveau}` as "pointSommeil.normal")} />
      <Texte variante="corps" couleur="t2" numberOfLines={1} style={{ flexShrink: 1 }}>
        {children}
      </Texte>
    </View>
  );
}

function Sous({ children }: { children: string }) {
  return (
    <Texte variante="corps" couleur="t2" numberOfLines={1} style={{ marginTop: 1 }}>
      {children}
    </Texte>
  );
}

/** Carte sans donnée : ce qui manque, en 15 t2 (le toucher de la carte mène à l'écran qui la débloque). */
function Vide({ texte }: { texte: string }) {
  return (
    <Texte variante="corps" couleur="t2" numberOfLines={2} style={{ fontSize: 15, marginTop: 6 }}>
      {texte}
    </Texte>
  );
}

/** Jauge de 6 (rayon 2) : la part, et le trait de ton habitude à cette heure (t1, 2 px, qui dépasse de 3). */
function Jauge({ part, trait, sport }: { part: number; trait?: number | null; sport?: boolean }) {
  const c = useTeintes(sport);
  return (
    <View style={[styles.piste, { backgroundColor: c.s3 }]}>
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max(0, Math.min(1, part)) * 100}%`, borderRadius: 2, backgroundColor: c.fort }} />
      {trait != null ? <View style={[styles.trait, { left: `${Math.max(0, Math.min(1, trait)) * 100}%`, backgroundColor: c.t1 }]} /> : null}
    </View>
  );
}

/** Courbe de 30 jours (moyenne lissée, âge des semaines) et son point final. */
function MiniCourbe({ points, hauteur = 24, largeur }: { points: readonly (number | null)[]; hauteur?: number; largeur?: number }) {
  const c = useTeintes();
  const [l, setL] = useState(largeur ?? 0);
  const v = points.map((p, i) => [i, p] as const).filter((x): x is readonly [number, number] => x[1] != null);
  if (v.length < 2) return null;
  const lo = Math.min(...v.map((x) => x[1])), hi = Math.max(...v.map((x) => x[1]));
  const n = points.length - 1 || 1;
  const xy = v.map(([i, p]) => [(i / n) * Math.max(0, l - 4), 3 + ((hi - p) / (hi - lo || 1)) * (hauteur - 6)] as const);
  const fin = xy[xy.length - 1]!;
  return (
    <View onLayout={largeur ? undefined : (e) => setL(e.nativeEvent.layout.width)} style={{ height: hauteur, marginTop: 12, width: largeur }}>
      {l > 0 ? (
        <Svg width={l} height={hauteur}>
          <Polyline points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} fill="none" stroke={c.fort} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={fin[0]} cy={fin[1]} r={3} fill={c.fort} />
        </Svg>
      ) : null}
    </View>
  );
}

/** 7 jours en petites barres (132 × 44) : pleines à l'objectif, voilées sinon, objectif en tirets. */
function MiniBarres({ valeurs, objectif, largeur = 132, hauteur = 44 }: { valeurs: readonly (number | null)[]; objectif: number; largeur?: number; hauteur?: number }) {
  const c = useTeintes();
  const max = Math.max(objectif * 1.125, ...valeurs.map((v) => v ?? 0), 1);
  const k = (hauteur - 2) / max;
  const pas = largeur / valeurs.length;
  const bw = Math.min(14, pas * 0.56);
  return (
    <Svg width={largeur} height={hauteur} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {valeurs.map((v, i) =>
        v == null ? null : (
          <Rect key={i} x={i * pas + (pas - bw) / 2} y={hauteur - v * k} width={bw} height={Math.max(2, v * k)} rx={2} fill={v >= objectif ? c.fort : c.doux} />
        ),
      )}
      <Line x1={0} x2={largeur} y1={hauteur - objectif * k} y2={hauteur - objectif * k} stroke={c.t1} strokeOpacity={0.5} strokeDasharray="3 3" strokeWidth={1} />
    </Svg>
  );
}

/** Soldes de 7 jours autour du zéro : surplus vers le haut en vert, déficit vers le bas en orange. */
function MiniSoldes({ soldes, largeur = 132, hauteur = 44 }: { soldes: readonly (number | null)[]; largeur?: number; hauteur?: number }) {
  const c = useTeintes();
  const mid = hauteur / 2;
  const max = Math.max(700, ...soldes.map((v) => Math.abs(v ?? 0)));
  const k = (hauteur / 2 - 2) / max;
  const pas = largeur / soldes.length;
  const bw = Math.min(14, pas * 0.56);
  return (
    <Svg width={largeur} height={hauteur} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Line x1={0} x2={largeur} y1={mid} y2={mid} stroke={c.line2} strokeWidth={1} />
      {soldes.map((v, i) => {
        if (v == null) return null;
        const h = Math.max(2, Math.min(hauteur / 2 - 2, Math.abs(v) * k));
        return <Rect key={i} x={i * pas + (pas - bw) / 2} y={v >= 0 ? mid - h : mid} width={bw} height={h} rx={2} fill={v >= 0 ? c.e.apports : c.e.sport} />;
      })}
    </Svg>
  );
}

/** Rails apports (vert) et dépense (4 nuances d'orange) à la même échelle ; `large` : libellés et valeurs. */
function RailsEnergie({ apports, depense, segments, large }: { apports: number | null; depense: number; segments: readonly { cle: "bmr" | "sport" | "neat" | "digestion"; kcal: number }[]; large?: boolean }) {
  const c = useTeintes();
  const max = Math.max(apports ?? 0, depense, 1);
  const rail = (largeur: number, contenu: ReactNode) => (
    <View style={{ flex: 1 }}>
      <View style={{ width: `${(largeur / max) * 100}%`, height: 6, flexDirection: "row", borderRadius: 2, overflow: "hidden" }}>{contenu}</View>
    </View>
  );
  const vert = <View style={{ flex: 1, backgroundColor: c.e.apports }} />;
  const orange = segments.map((s) => <View key={s.cle} style={{ flex: Math.max(0.0001, s.kcal), backgroundColor: c.e[s.cle] }} />);
  if (!large)
    return (
      <View style={{ marginTop: 12, gap: 5 }}>
        {apports != null ? <View style={{ flexDirection: "row" }}>{rail(apports, vert)}</View> : null}
        <View style={{ flexDirection: "row" }}>{rail(depense, orange)}</View>
      </View>
    );
  const ligne = (libelle: string, v: string, r: ReactNode) => (
    <View style={styles.railLarge}>
      <Texte variante="meta" couleur="t2" style={{ width: 62 }}>
        {libelle}
      </Texte>
      {r}
      <Texte style={styles.railValeur}>{v}</Texte>
    </View>
  );
  return (
    <View style={{ marginTop: 12, gap: 8 }}>
      {apports != null ? ligne(t("sante.apports"), nombre(apports, 0), rail(apports, vert)) : null}
      {ligne(t("sante.depense"), approx(nombre(depense, 0)), rail(depense, orange))}
    </View>
  );
}

function Legende({ gauche, droite }: { gauche: ReactNode; droite: ReactNode }) {
  return (
    <View style={styles.legende}>
      {typeof gauche === "string" ? <Texte variante="meta" couleur="t3">{gauche}</Texte> : gauche}
      {typeof droite === "string" ? <Texte variante="meta" couleur="t3">{droite}</Texte> : droite}
    </View>
  );
}

function Carre({ couleur, libelle }: { couleur: string; libelle: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: couleur }} />
      <Texte variante="meta" couleur="t3">
        {libelle}
      </Texte>
    </View>
  );
}

/** Deux colonnes côte à côte (valeur à gauche, dessin à droite, alignés en bas). */
function Duo({ gauche, droite }: { gauche: ReactNode; droite: ReactNode }) {
  return (
    <View style={styles.duo}>
      <View style={{ flex: 1, minWidth: 0 }}>{gauche}</View>
      {droite}
    </View>
  );
}

const kcalSigne = (v: number) => signe(Math.round(v), 0);
const motSolde = (v: number) => t(v < 0 ? "cartes.deficit" : v > 0 ? "cartes.surplus" : "cartes.equilibre");

// ---- Cartes ------------------------------------------------------------------------------------------------------------

function CartePas({ plein, d, tete }: { plein: boolean; d: DonneesCartes; tete: (meta?: string) => ReactNode }) {
  const p = d.pas;
  if (!p || p.jour.etat === "a-connecter")
    return (
      <>
        {tete()}
        <Vide texte={t("cartes.pasAucuneSource")} />
      </>
    );
  const n = valeurPas(p.jour);
  const part = (n ?? 0) / p.objectif;
  const trait = p.habituel != null ? p.habituel / p.objectif : null;
  const avance = n != null && p.habituel != null ? n - p.habituel : null;
  const source = p.jour.source === "withings" ? "Withings" : t(p.jour.source === "whoop" ? "mesures.whoop" : p.jour.source === "telephone" ? "mesures.telephone" : "mesures.santeConnect");
  const avanceTexte = avance == null ? null : t(avance >= 0 ? "cartes.avance" : "cartes.retard", { n: nombre(Math.abs(avance), 0) });
  if (!plein)
    return (
      <>
        {tete()}
        <Valeur v={n == null ? "–" : nombre(n, 0)} />
        <Sous>{t("cartes.surObjectif", { n: nombre(p.objectif, 0) })}</Sous>
        {avanceTexte ? <Sous>{avanceTexte}</Sous> : <Sous>{source}</Sous>}
        <Jauge part={part} trait={trait} />
      </>
    );
  const pourcent = t("cartes.partObjectif", { p: nombre(part * 100, 0), n: nombre(p.objectif, 0) });
  const projection = p.projection != null ? `, ${t("cartes.ceSoir", { n: approx(nombre(Math.round(p.projection / 10) * 10, 0)) })}` : "";
  return (
    <>
      {tete(source)}
      <Duo
        gauche={
          <>
            <Valeur v={n == null ? "–" : nombre(n, 0)} unite={t("cartes.pasUnite")} />
            <Sous>{`${pourcent}${projection}`}</Sous>
          </>
        }
        droite={<MiniBarres valeurs={p.semaine} objectif={p.objectif} />}
      />
      <Jauge part={part} trait={trait} />
      <Legende gauche={trait != null ? t("cartes.traitHabitude", { h: heure(p.maintenant) }) : ""} droite={t("cartes.septJours")} />
    </>
  );
}

function CartePoids({ plein, d, tete, interactif }: { plein: boolean; d: DonneesCartes; tete: (meta?: string) => ReactNode; interactif: boolean }) {
  const r = d.corps;
  const u = lireActif().poids;
  const sep = useSep();
  if (!r?.poids)
    return (
      <>
        {tete()}
        <Vide texte={t("cartes.aucunePesee")} />
      </>
    );
  // une décimale partout, comme la page Poids (D2 de la revue finale) : « 78,0 kg »
  const kg = fixe(versUnite(r.poids.valeur, u), 1);
  const e30 = r.ecart30Kg != null ? t("cartes.ecart30", { v: signe(versUnite(r.ecart30Kg, u), 1), u }) : null;
  if (!plein)
    return (
      <>
        {tete()}
        <Valeur v={kg} unite={u} />
        {r.gras ? <Sous>{t("cartes.deGras", { v: nombre(r.gras.valeur, 1) })}</Sous> : null}
        {e30 ? <Sous>{e30}</Sous> : null}
        <MiniCourbe points={r.serieKg} />
      </>
    );
  const quand = `${jourOuHier(r.poids.date)} ${heure(r.poids.date)}`;
  const colonne = (route: "/sante/poids" | "/sante/gras", libelle: string, v: string, unite: string, ecart: string | null, serie: readonly number[], premiere: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${libelle} ${v} ${unite}, ${t("cartes.voirStats")}`}
      disabled={!interactif}
      onPress={() => router.push(route)}
      style={({ pressed }) => [styles.colonne, !premiere && { borderLeftWidth: 1, borderLeftColor: sep }, pressed && { opacity: 0.6 }]}
    >
      <Texte variante="meta" couleur="t3" style={{ marginTop: 6 }}>
        {libelle}
      </Texte>
      <View style={{ marginTop: -8 }}>
        <Valeur v={v} unite={unite} />
      </View>
      {ecart ? <Sous>{ecart}</Sous> : null}
      <MiniCourbe points={serie} hauteur={30} />
    </Pressable>
  );
  const o = r.objectif;
  return (
    <>
      {tete(quand)}
      <View style={styles.colonnes}>
        {colonne("/sante/poids", t("sante.poids"), kg, u, r.ecart30Kg != null ? t("cartes.ecart30j", { v: signe(versUnite(r.ecart30Kg, u), 1), u }) : null, r.serieKg, true)}
        {r.gras
          ? colonne("/sante/gras", t("sante.gras"), nombre(r.gras.valeur, 1), "%", r.ecart30Gras != null ? t("cartes.ecart30jPt", { v: signe(r.ecart30Gras, 1) }) : null, r.serieGras, false)
          : null}
      </View>
      {o ? (
        <View style={[styles.objectif, { borderTopColor: sep }]}>
          <Texte variante="meta" couleur="t2" numberOfLines={1}>
            {o.dateRythme != null
              ? t("cartes.objectifDate", { v: nombre(versUnite(o.cible, u), 1), u, date: jourMois(o.dateRythme) })
              : t("cartes.objectif", { v: nombre(versUnite(o.cible, u), 1), u })}
          </Texte>
        </View>
      ) : null}
    </>
  );
}

function useSep() {
  return useTheme().couleurs.line;
}

function jourOuHier(ms: number): string {
  const auj = new Date();
  const d = new Date(ms);
  const ecart = Math.round((new Date(auj.getFullYear(), auj.getMonth(), auj.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
  return ecart === 0 ? t("cartes.aujourdhuiMin") : ecart === 1 ? t("cartes.hierMin") : jourMois(ms);
}

function CarteEnergie({ plein, d, tete }: { plein: boolean; d: DonneesCartes; tete: (meta?: string) => ReactNode }) {
  const r = d.energie;
  const c = useTeintes();
  const chiffres = useChiffresNutrition();
  if (!r)
    return (
      <>
        {tete()}
        <Vide texte={t("cartes.energieIndisponible")} />
      </>
    );
  if (r.etat.etat === "a-completer")
    return (
      <>
        {tete()}
        <Vide texte={t("sante.aCompleter", { liste: listeManques(r.etat.manques) })} />
      </>
    );
  const b = bilanAffiche(r.etat.e.bilan, chiffres);
  const enCours = r.etat.e.enCours;
  const solde = b.solde;
  if (!plein)
    return (
      <>
        {tete()}
        <Valeur v={solde != null ? approx(kcalSigne(solde), b.soldeEstime) : approx(nombre(b.depense.kcal, 0))} unite={t("cartes.kcal")} />
        <Sous>{solde != null ? `${motSolde(solde)}${enCours ? `, ${t("cartes.enCours")}` : ""}` : chiffres ? t("cartes.journalVide") : t("cartes.depenseMin")}</Sous>
        <RailsEnergie apports={b.apports} depense={b.depense.kcal} segments={r.segments} />
        <Legende gauche={chiffres ? <Carre couleur={c.e.apports} libelle={t("cartes.apportsMin")} /> : null} droite={<Carre couleur={c.e.sport} libelle={t("cartes.depenseMin")} />} />
      </>
    );
  return (
    <>
      {tete(enCours ? t("cartes.journeeEnCours") : undefined)}
      <Duo
        gauche={
          <>
            <Valeur v={solde != null ? approx(kcalSigne(solde), b.soldeEstime) : approx(nombre(b.depense.kcal, 0))} unite={solde != null ? `${t("cartes.kcal")}, ${motSolde(solde)}` : t("cartes.kcal")} />
            {r.semaine && chiffres ? <Sous>{t("cartes.semaineEnergie", { v: kcalSigne(r.semaine.moyenne), kg: signe(r.semaine.kg, 1) })}</Sous> : null}
          </>
        }
        droite={chiffres ? <MiniSoldes soldes={r.soldes.map((s) => s.solde)} /> : null}
      />
      <RailsEnergie apports={b.apports} depense={b.depense.kcal} segments={r.segments} large />
    </>
  );
}

/** La nuit : part du besoin, besoin et dette calculés par pepfit (lireResumeSommeil) ; ni la performance ni le besoin de Whoop. */
function CarteSommeil({ plein, d, tete }: { plein: boolean; d: DonneesCartes; tete: (meta?: string) => ReactNode }) {
  const r = d.sommeil;
  const [l, setL] = useState(0);
  if (!r)
    return (
      <>
        {tete()}
        <Vide texte={t("cartes.aucuneNuit")} />
      </>
    );
  const n = r.nuit;
  const horaires = `${heure(n.debut)} → ${heure(n.fin)}`;
  const forme = (
    <View onLayout={(e) => setL(e.nativeEvent.layout.width)} style={{ marginTop: 12 }}>
      {n.etapes && l > 0 ? <MiniHypnogramme etapes={n.etapes} largeur={l} hauteur={plein ? 32 : 26} /> : n.phases ? <BarrePhases phases={n.phases} hauteur={8} /> : null}
    </View>
  );
  if (!plein)
    return (
      <>
        {tete()}
        <Valeur v={dureeSommeil(n.sommeilMin)} />
        {r.part != null ? <SousPoint niveau={niveauSommeil(r.part)}>{t("cartes.partBesoin", { p: nombre(r.part, 0) })}</SousPoint> : null}
        <Sous>{horaires}</Sous>
        {forme}
      </>
    );
  const meta = `${n.source === "whoop" ? t("mesures.whoop") : n.origine === "withings" ? "Withings" : t("mesures.santeConnect")} ${heure(n.heure)}`;
  return (
    <>
      {tete(meta)}
      <Duo
        gauche={
          <>
            <Valeur v={dureeSommeil(n.sommeilMin)} />
            <SousPoint niveau={niveauSommeil(r.part)}>{r.part != null ? `${t("cartes.partBesoin", { p: nombre(r.part, 0) })}, ${horaires}` : horaires}</SousPoint>
          </>
        }
        droite={<MiniBarres valeurs={r.sept} objectif={r.objectif} />}
      />
      {forme}
      <Legende
        gauche={r.besoinMin != null ? t("cartes.besoinDette", { b: dureeSommeil(r.besoinMin), d: dureeSommeil(r.detteMin ?? 0) }) : ""}
        droite={r.moyenneSept != null ? t("cartes.septNuits", { d: dureeSommeil(r.moyenneSept) }) : ""}
      />
    </>
  );
}

function CarteRecup({ d, tete }: { d: DonneesCartes; tete: (meta?: string) => ReactNode }) {
  const r = d.recup;
  // La Récupération pepfit (planche recuperation) : « 90 % », le mot et la phrase ; jamais celle de Whoop.
  if (!r || r.score == null || !r.niveau)
    return (
      <>
        {tete()}
        <Vide texte={t("recup.caseSans")} />
      </>
    );
  return (
    <>
      {tete()}
      <Valeur v={nombre(r.score, 0)} unite="%" />
      <Sous>{motRecup(r.niveau, r.feminin)}</Sous>
      <Sous>{phraseRecup(r.niveau, r.prudent, r.feminin)}</Sous>
      <Jauge part={r.score / 100} />
    </>
  );
}

function CarteEffort({ d, tete }: { d: DonneesCartes; tete: (meta?: string) => ReactNode }) {
  const r = d.effort;
  // L'Effort pepfit (planche effort-pepfit) : le chiffre seul, sans unité ni maximum ; la jauge suit la cible du jour.
  if (!r || r.score == null)
    return (
      <>
        {tete()}
        <Vide texte={t("cartes.effortPasNote")} />
      </>
    );
  return (
    <>
      {tete()}
      <Valeur v={texteEffort(r.score)} />
      {r.activite ? <Sous>{t("cartes.activite", { nom: minuscule(r.activite.nom), m: nombre(r.activite.minutes, 0) })}</Sous> : null}
      {r.semaine != null ? <Sous>{t("cartes.cetteSemaine", { d: texteEffort(r.semaine) })}</Sous> : null}
      <Jauge part={partAnneau(r.score)} sport />
    </>
  );
}

function CarteAge({ d, tete }: { d: DonneesCartes; tete: (meta?: string) => ReactNode }) {
  const r = d.age;
  // précision pepfit : l'âge attend que son calcul soit sûr
  if (r && d.lectures && !d.lectures.includes("age"))
    return (
      <>
        {tete()}
        <Vide texte={t("precision.attente.bientot")} />
      </>
    );
  if (!r || r.age == null)
    return (
      <>
        {tete()}
        <Vide texte={r ? t("cartes.ageDonnees") : t("cartes.ageNaissance")} />
      </>
    );
  const ecart = Math.abs(r.ecart);
  return (
    <>
      {tete()}
      <Valeur v={nombre(r.age, 1)} unite={t("cartes.ans")} />
      <Sous>{t(r.ecart <= 0 ? "cartes.ansDeMoins" : "cartes.ansDePlus", { n: nombre(ecart, 1) })}</Sous>
      {r.evolution != null ? <Sous>{t("cartes.evolutionAge", { v: signe(r.evolution, 1) })}</Sous> : null}
      <MiniCourbe points={r.serie} />
    </>
  );
}

/** VO2max (planche vma-vo2max, D1) : la valeur, la catégorie et l'âge, la VMA, la rampe ; pleine : la VMA et deux allures. */
function CarteVo2({ plein, d, tete }: { plein: boolean; d: DonneesCartes; tete: (meta?: string) => ReactNode }) {
  const { couleurs } = useTheme();
  const r = d.vo2;
  if (!r?.vo2)
    return (
      <>
        {tete()}
        <Vide texte={t("vo2.faireTest")} />
      </>
    );
  if (d.lectures && !d.lectures.includes("vo2"))
    return (
      <>
        {tete()}
        <Vide texte={t("precision.attente.bientot")} />
      </>
    );
  const cat = r.categorie ? minuscule(nomCategorie(r.categorie)) : "";
  const vma = r.vma ? approx(nombre(r.vma.vma, 1), r.vma.source !== "test") : null;
  if (!plein)
    return (
      <>
        {tete()}
        <Valeur v={texteVo2(r)} unite={t("vo2.unite")} />
        <Sous>{r.age != null ? t("vo2.carteSous", { cat, age: r.age }) : cat}</Sous>
        {vma ? <Sous>{t("vo2.vmaN", { v: vma })}</Sous> : null}
        <RampeVo2 vo2={r.vo2.valeur} age={r.age} sexe={r.sexe} mini />
      </>
    );
  return (
    <>
      {tete(r.vma?.source === "test" ? t("vo2.carteTest", { date: jourMois(r.vma.date) }) : undefined)}
      <Valeur v={texteVo2(r)} unite={`${t("vo2.unite")}, ${pourAge(cat, r.age)}`} />
      <RampeVo2 vo2={r.vo2.valeur} age={r.age} sexe={r.sexe} mini />
      {r.vma ? (
        <View style={[styles.vo2Cols, { borderTopColor: couleurs.line }]}>
          <View style={{ flex: 1 }}>
            <Texte variante="meta" couleur="t3">{t("vo2.vma")}</Texte>
            <Texte style={styles.vo2V}>{`${vma} ${t("vo2.kmh")}`}</Texte>
          </View>
          <View style={{ flex: 1 }}>
            <Texte variante="meta" couleur="t3">{t("vo2.allure.footing")}</Texte>
            <Texte style={styles.vo2V}>{allureTexte(allureA(r.vma.vma, 0.6))}</Texte>
          </View>
          <View style={{ flex: 1 }}>
            <Texte variante="meta" couleur="t3">{t("vo2.allure.seuil")}</Texte>
            <Texte style={styles.vo2V}>{allureTexte(allureA(r.vma.vma, 0.85))}</Texte>
          </View>
        </View>
      ) : null}
    </>
  );
}

/** « 6 h 07 », « 45 min » */
function dureeCourte(min: number): string {
  const m = Math.round(min);
  return m < 60 ? t("cartes.minutes", { n: m }) : dureeSommeil(m);
}

const styles = StyleSheet.create({
  valeur: { marginTop: 10 },
  vo2Cols: { flexDirection: "row", gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  vo2V: { fontFamily: police.medium, fontSize: 15, marginTop: 2, fontVariant: ["tabular-nums"] },
  nombre: { fontFamily: police.medium, fontSize: 24, lineHeight: 30, fontVariant: ["tabular-nums"] },
  unite: { fontFamily: police.regular, fontSize: 14 },
  piste: { height: 6, borderRadius: 2, marginTop: 12 },
  trait: { position: "absolute", top: -3, bottom: -3, width: 2, marginLeft: -1, borderRadius: 1 },
  legende: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  duo: { flexDirection: "row", alignItems: "flex-end", gap: espace.m },
  railLarge: { flexDirection: "row", alignItems: "center", gap: 10 },
  railValeur: { width: 52, textAlign: "right", fontFamily: police.medium, fontSize: 13, fontVariant: ["tabular-nums"] },
  colonnes: { flexDirection: "row", marginTop: 4, marginHorizontal: -16 },
  colonne: { flex: 1, paddingTop: 6, paddingBottom: 4, paddingHorizontal: 16, minHeight: 44, borderRadius: rayon.s },
  objectif: { marginTop: 12, paddingTop: 10, borderTopWidth: 1 },
});
