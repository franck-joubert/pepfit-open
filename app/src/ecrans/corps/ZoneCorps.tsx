import { useState, type RefObject } from "react";
import { Pressable, StyleSheet, View, type ViewInstance } from "react-native";
import { router } from "expo-router";
import Svg from "react-native-svg";
import { useTheme } from "../../theme";
import { carteSante } from "../../theme/effets";
import { espace, police, rayon } from "../../theme/typo";
import { useLargeurContenu } from "../../ui/CadreContenu";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { useReduit } from "../../ui/reduit";
import { CorpsSante } from "../../ui/3d/CorpsSante";
import { HAUTEUR_CORPS, LARGEUR_ANCRES, placeAme, yCorps } from "../../ui/3d/verre";
import { lancerVol, volActif } from "../../ui/3d/vol-ame";
import { PrechauffeSignature } from "../../ui/signature-age/SignatureAge";
import { lireActif, t } from "../../i18n/index";
import { lecture } from "../../precision/modele";
import type { EtatPrecision } from "../../precision/service";
import type { articulationsAllumees, zonesAllumees } from "../suivi-calc";
import { nombre } from "../format";
import { PointJour } from "../mesures/gabarit";
import { corpsAffiche } from "../morphologie-calc";
import { CaseEntree, TraitEntree, useEntreeSante } from "../sante-entree";
import { rangs, signatureCases } from "../sante-entree-calc";
import type { DonneesSante } from "../sante-lecteurs";
import { casesSante, type CaseSante, type Disposition } from "../sante-vue";
import { useLienCorps } from "./donnees-corps";

const MARGE = espace.l;
/** Une case plus étroite (écran de 360 dp ou moins) resserre son remplissage : « Masse grasse » et « Sommeil 7 h 12 » y tiennent. */
const LARGEUR_ETROITE = 124;

/** Où mène une case : sa page de mesure (planche pas, 28/10 ; VFC et FC au repos : leurs pages du 29/10), ouverte sur le
 * jour choisi dans le semainier. */
function ouvrir(k: CaseSante, jour: number) {
  const page: Record<CaseSante["id"], string> = {
    sommeil: "/sante/sommeil",
    poids: "/sante/poids",
    gras: "/sante/gras",
    pas: "/sante/pas",
    vfc: "/sante/vfc",
    fc: "/sante/fc",
    age: "/sante/age",
  };
  router.push({ pathname: page[k.id] as "/sante/pas", params: { jour: String(jour) } });
}

/** Le point de la case dit en mots (lecteur d'écran) : sommeil d'après sa performance, VFC et FC face à ta normale. */
const motPoint = (k: CaseSante) =>
  k.point ? `, ${t(k.id === "sommeil" ? (`pointSommeil.${k.point}` as "pointSommeil.normal") : (`point.${k.point}` as "point.normal"))}` : "";

/** L'écart de l'Âge pepfit dit en mots (lecteur d'écran) : « 4,4 ans de moins que ton âge réel ». */
const motEcart = (k: CaseSante) =>
  k.ecart != null ? `, ${t(k.ecart <= 0 ? "cartes.ageMoinsQueReel" : "cartes.agePlusQueReel", { n: nombre(Math.abs(k.ecart), 1) })}` : "";

type Props = {
  donnees: Partial<DonneesSante>;
  precision: EtatPrecision | null;
  morpho: Parameters<typeof corpsAffiche>[0];
  corps: ReturnType<typeof corpsAffiche>;
  dispo: Disposition;
  /** Le jour choisi (minuit local, ms), et s'il est passé. */
  jour: number;
  passe: boolean;
  /** Les zones et articulations des blessures en cours, allumées sur le personnage. */
  allumees: ReturnType<typeof zonesAllumees>;
  reperes: ReturnType<typeof articulationsAllumees>;
  /** La zone qui porte tout ça (mesurée pour le vol de l'âme). */
  zone: RefObject<ViewInstance | null>;
  /** Visibilité donnée par le défilement (useVisibiliteCorps). */
  corpsVisible: boolean;
  ameVue: boolean;
  defileCorps: boolean;
};

/**
 * Le personnage en verre teinté, ses cases et leurs traits (planche Moi v4) : le contenu de la zone du corps. Arrivée (30/10) :
 * le corps en fondu, puis les traits du corps vers les vignettes et les vignettes en léger décalé ; au premier affichage, ou quand
 * les valeurs montrées changent (sante-entree.tsx). Posé dans une zone de `dispo.hauteur` dp (BlocCorps).
 */
export function ZoneCorps({ donnees, precision, morpho, corps, dispo, jour, passe, allumees, reperes, zone, corpsVisible, ameVue, defileCorps }: Props) {
  const { couleurs, mode } = useTheme();
  const reduit = useReduit();
  // largeur de la colonne (Fold déplié, ui/largeur.ts) : le corps et ses cases y sont centrés
  const width = useLargeurContenu();
  const lien = useLienCorps();
  const ouvrirBlessure = (id: string) => router.push({ pathname: "/blessures/[id]", params: { id } });
  // L'Âge pepfit (planches/age-coeur, validé le 29/10) : l'âme dans la poitrine et sa case en haut à droite, dès qu'il y a un âge
  // Précision pepfit (P8) : l'âge ne s'affiche que si sa lecture est ouverte (cap Portrait et précision de l'âge ≥ 60) ; en
  // attente, sa case dit « Bientôt » et l'âme ne se pose pas
  // En attendant son calcul, la précision mémorisée la dernière fois.
  const ageOuvert = precision ? lecture(precision.r, "age").ouverte : donnees.ageOuvertAvant === true;
  const ageConnu = precision != null || donnees.ageOuvertAvant != null;
  const ageLu = donnees.age?.age != null && ageOuvert ? donnees.age : null;
  const ecartAme = ageLu ? (lien.ecart != null && !Number.isNaN(Number(lien.ecart)) ? Number(lien.ecart) : ageLu.ecart) : null;
  const ame = ageLu && ecartAme != null && lien.ame !== "0" ? { ecart: ecartAme, rythme: Math.max(-1, Math.min(3, ageLu.rythme ?? 1)), fc: ageLu.fc ?? donnees.cases?.fcRepos ?? null } : null;
  const placeA = placeAme(corps.tailleCm);
  const cases = casesSante(
    passe && donnees.cases && morpho ? { ...morpho, poidsKg: donnees.cases.poids } : morpho,
    donnees.cases ?? null,
    lireActif().poids,
    ageLu && ecartAme != null ? { age: ageLu.ageReel + ecartAme, ecart: ecartAme } : ageConnu && !ageOuvert && donnees.age ? "bientot" : null,
    dispo,
  );
  // Arrivée : au premier affichage, ou quand les valeurs montrées changent (sante-entree.tsx)
  const [corpsPret, setCorpsPret] = useState(false);
  const entree = useEntreeSante({ pret: corpsPret, charge: donnees.cases !== undefined && donnees.age !== undefined && donnees.ageOuvertAvant !== undefined, signature: signatureCases(cases), reduit, cases });
  const horloge = entree.t;
  const montrees = entree.cases;
  const rang = rangs(montrees);
  const c = carteSante[mode];
  // les ancres sont comptées sur 412 dp : le corps ne s'élargit pas avec l'écran (Fold déplié)
  // et la zone est remontée de dispo.decalage : le trait part du point du corps, dans la zone montrée
  const ancre = (k: CaseSante) => ({ x: width / 2 + k.ancre.dx * LARGEUR_ANCRES, y: yCorps(k.ancre.f, corps.tailleCm) - dispo.decalage });
  // Toucher l'âge (sa case ou l'âme) : l'âme s'envole jusqu'à la grande signature de la page Âge (vol-ame.ts) ; sans âme à
  // l'écran, ou en mouvement réduit, la page s'ouvre en fondu.
  const ouvrirAge = () => {
    if (volActif()) return;
    // un jour passé : l'âme montre la semaine de ce jour, la page Âge celle d'aujourd'hui ; pas de vol entre les deux
    if (!ame || !ameVue || reduit || passe || !zone.current) {
      router.push("/sante/age");
      return;
    }
    zone.current.measureInWindow((x, y) => {
      lancerVol({ x: x + width / 2, y: y - dispo.decalage + placeA.y, cote: placeA.cote, lent: Math.max(1, Math.min(20, Number(lien.lent) || 1)) });
      console.log("[transition] age toucher");
      router.push("/sante/age");
    });
  };
  return (
    <>
      {/* le corps garde sa zone entière (470 dp, caméra inchangée) et sa taille : elle est remontée, le vide au-dessus de la
          tête et sous les pieds est rogné par la zone */}
      <View style={[styles.corps, { top: -dispo.decalage }]} pointerEvents="box-none">
        <CorpsSante
          corps={corps}
          mode={mode}
          reduit={reduit}
          prepasse={lien.prepasse !== "0"}
          lisse={lien.aa === "1"}
          ame={ame}
          onPret={() => setCorpsPret(true)}
          largeur={width}
          visible={corpsVisible}
          defile={defileCorps}
          ameVue={ameVue}
          mesure={lien.mesure === "1"}
          tourner
          zones={allumees}
          reperes={reperes}
          onRepere={ouvrirBlessure}
          onToucher={
            allumees.length || reperes.length
              ? (m) => {
                  // toucher le muscle allumé ouvre sa fiche (D2) ; l'anneau d'une articulation aussi (onRepere)
                  const b = m && allumees.find((z) => z.zone === m.zone);
                  if (b) ouvrirBlessure(b.id);
                }
              : undefined
          }
          libelle={t("sante.corps")}
        />
        {/* le shader de la grande signature compilé d'avance : elle arrive à l'heure quand l'âme s'envole */}
        {ame ? <PrechauffeSignature /> : null}
        {/* l'âme : un rond de 60 dp sur la poitrine ouvre aussi la page (D4) ; la case porte l'étiquette parlée */}
        {ame && ameVue ? (
          <Pressable
            importantForAccessibility="no"
            accessible={false}
            onPress={ouvrirAge}
            style={[styles.ame, { left: width / 2 - 30, top: placeA.y - 30 }]}
          />
        ) : null}
      </View>
      <Svg width={width} height={dispo.hauteur} style={StyleSheet.absoluteFill} pointerEvents="none">
        {montrees.filter((k) => k.double !== "bas").map((k) => {
          const a = ancre(k);
          let x = k.cote === "g" ? MARGE + k.largeur : width - MARGE - k.largeur;
          // case double : le trait part de la jonction des deux moitiés ; case de l'âge : de son bas (il frôlerait la tête)
          let y0 = k.double === "haut" ? k.y + k.hauteur : k.y + k.hauteur / 2;
          if (k.depart === "bas") {
            x += k.cote === "g" ? -20 : 20;
            y0 = k.y + k.hauteur;
          }
          // tracé depuis le corps
          return <TraitEntree key={k.id} t={horloge} rang={rang[k.id] ?? 0} x1={a.x} y1={a.y} x2={x} y2={y0} couleur={c.trait} />;
        })}
      </Svg>
      {montrees.map((k) => (
        <CaseEntree
          key={k.id}
          t={horloge}
          rang={rang[k.id] ?? 0}
          cote={k.cote}
          style={[styles.cadreCase, { top: k.y, height: k.hauteur, width: k.largeur }, k.cote === "g" ? { left: MARGE } : { right: MARGE }]}
        >
        <Pressable
          accessibilityRole={k.ouvre ? "button" : undefined}
          accessibilityLabel={`${k.libelle}${k.aCote ? ` ${k.aCote}` : ""} ${k.valeur}${k.suite ? ` ${k.suite}` : ""}${k.unite ? ` ${k.unite}` : ""}${motPoint(k)}${motEcart(k)}`}
          disabled={!k.ouvre}
          onPress={() => (k.id === "age" ? ouvrirAge() : ouvrir(k, jour))}
          style={({ pressed }) => [
            styles.caisse,
            { top: 0, left: 0, height: k.hauteur, width: k.largeur, paddingHorizontal: k.largeur < LARGEUR_ETROITE ? espace.s : espace.m, backgroundColor: pressed ? couleurs.s2 : couleurs.verreCarte, borderColor: couleurs.verreFilet },
            k.double === "haut" && styles.doubleHaut,
            k.double === "bas" && styles.doubleBas,
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Texte variante="meta" couleur="t2" numberOfLines={1} style={{ flexShrink: 1 }}>
              {k.libelle}
            </Texte>
            {k.aCote ? (
              <Texte variante="meta" numberOfLines={1} style={{ color: couleurs.t1, fontFamily: police.medium, marginLeft: -4 }}>
                {k.aCote}
              </Texte>
            ) : null}
            {k.point ? <PointJour niveau={k.point} taille={8} /> : null}
          </View>
          <Texte variante={k.vide ? "meta" : "titre"} numberOfLines={1} style={k.vide ? { color: couleurs.t2, lineHeight: 26 } : [{ color: couleurs.t1, lineHeight: 26 }, k.double && { fontSize: 18, lineHeight: 22 }]}>
            {k.valeur}
            {k.suite ? <Texte variante="corps" couleur="t2" style={{ fontSize: 15 }}>{` ${k.suite}`}</Texte> : null}
            {k.unite ? <Texte variante="meta" couleur="t2">{` ${k.unite}`}</Texte> : null}
            {/* l'écart de l'âge n'est plus écrit sur la case (planche Moi v4) : l'âme le dit, le lecteur d'écran aussi (motEcart) */}
          </Texte>
          {k.ouvre ? (
            <View style={styles.chevron} pointerEvents="none">
              <Icone nom="right" couleur={couleurs.t3} taille={14} epaisseur={2} />
            </View>
          ) : null}
        </Pressable>
        </CaseEntree>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  caisse: {
    position: "absolute",
    borderRadius: rayon.l,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: espace.m,
    justifyContent: "center",
  },
  chevron: { position: "absolute", right: 6, top: 0, bottom: 0, justifyContent: "center" },
  cadreCase: { position: "absolute" },
  corps: { position: "absolute", left: 0, right: 0, height: HAUTEUR_CORPS },
  ame: { position: "absolute", width: 60, height: 60, borderRadius: 30 },
  doubleHaut: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  doubleBas: { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: 0 },
});
