// Page Âge pepfit (planche pas, autres.js AGE_DEF, NOTES § 1 quater, D17) : en tête le semainier par semaine (ui/BandeSemaines,
// planche age-semainier validée le 30/10 : la page montre la semaine affichée, la semaine en cours au départ), puis la signature « Souffle » (ui/signature-age,
// la forme part de la semaine d'avant et se pose sur celle-ci ; chiffre et ligne animés par la même valeur), le rythme de
// vieillissement, les neuf facteurs groupés (Sommeil, Effort, Forme) avec leur rail et leur impact, la courbe de 30 semaines
// face à l'âge réel, la courbe du rythme, ce qui rajeunit et ce qui est à travailler, les sources, « Comment c'est calculé ».
// Méthode et références : age-calc.ts. Rien d'inventé : sans date de naissance, pas d'âge (on propose de la saisir).
// Ouverte depuis l'âme de la page Santé, la signature y vole depuis la poitrine du personnage (age-entree.tsx).
// Pas encore d'Âge (planche age-attente, validée le 31/10) : sans date de naissance, trop peu de données ou presque prêt, la
// même page : la signature fantôme, les neuf facteurs sur l'anneau, la date du premier Âge, ce qu'il reste à faire et où.
import { router } from "expo-router";
import { useRef, useState, type ReactNode } from "react";
import { PixelRatio, Pressable, StyleSheet, TextInput, View, type ViewInstance } from "react-native";
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { locale, t, tp } from "../../i18n/index";
import { formater } from "../../i18n/temps";
import { suivreEtape } from "../precision/actions";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Icone } from "../../ui/Icone";
import { MiniPrecision, STYLE_MINI } from "../precision/MiniPrecision";
import { usePrecision } from "../precision/usePrecision";
import { lecture } from "../../precision/modele";
import type { EtatPrecision } from "../../precision/service";
import { useLangue } from "../../i18n/useLangue";
import { useTheme } from "../../theme";
import { police } from "../../theme/typo";
import { useLargeurContenu } from "../../ui/CadreContenu";
import { BandeSemaines } from "../../ui/BandeSemaines";
import { Feuille } from "../../ui/Feuille";
import { couleurTexteAge, sensAffiche } from "../../ui/signature-age/couleur";
import { SignatureAge } from "../../ui/signature-age/SignatureAge";
import { Texte } from "../../ui/Texte";
import { useCharge } from "../contexte";
import { nombre } from "../format";
import { definitions, extremes, GROUPES, positionRail, prochainCalcul, type DefFacteur, type FacteurCalcule, type GroupeAge, type IdFacteur, type SemaineAge } from "./age-calc";
import { donneesAgeRecentes, lireAgeVite, lireReculAge, type DonneesAge, type SourceFacteur } from "./age-donnees";
import { attente, dateCourte, texteApres, textePrecision, texteQuand, type EtatFacteur, type LigneAttente, type ReculAge } from "./age-attente";
import { Apparait, FournisseurEntree, useEntree, useEntreeAge, useStyleBloc, useStyleFond, useStyleSignature } from "./age-entree";
import { ame as jetonsAme } from "../../theme/mouvement";
import { Groupe, LigneMesure, Lignes, MARGE, Note, Os, PageMesure, TitreGroupe, useMesure } from "./gabarit";
import { Etiquette, Tirets, useApparition } from "./graphes";
import { EnteteStats, Statistiques } from "./Statistiques";

const PathAnime = Animated.createAnimatedComponent(Path);
const TexteAnime = Animated.createAnimatedComponent(TextInput);

// ---- Formats ------------------------------------------------------------------------------------------------------------

/** « −0,9 », « +0,4 », « 0,0 » : une décimale toujours, signe moins vrai. */
export function ans1(v: number): string {
  const r = Math.round(v * 10) / 10;
  const f = new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(r));
  return r === 0 ? f : `${r > 0 ? "+" : "−"}${f}`;
}
/** « 0,8 », « −3,2 » : une décimale toujours, signe moins vrai, collé (revue finale n° 19). */
const dec1 = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return `${r < 0 ? "−" : ""}${new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(r))}`;
};
/** « an » ou « ans » selon la valeur affichée. */
const motAn = (v: number) => tp("age.an", Math.abs(Math.round(v * 10) / 10));

function heuresMin(minutes: number): string {
  const m = Math.round(minutes);
  return t("age.u.h", { h: Math.floor(m / 60), m: String(m % 60).padStart(2, "0") });
}

export function valeurFacteur(def: DefFacteur, v: number): string {
  switch (def.unite) {
    case "pct":
      return t("age.u.pct", { v: nombre(v, 0) });
    case "h":
      return heuresMin(v * 60);
    case "nbPas":
      return nombre(v, 0);
    case "minSem":
      return v >= 60 ? heuresMin(v) : t("age.u.min", { v: nombre(v, 0) });
    case "vo2":
      return t("age.u.vo2", { v: nombre(v, 0) });
    case "bpm":
      return t("age.u.bpm", { v: nombre(v, 0) });
  }
}

/** « 8,4 ans de moins », « pile ton âge réel ». */
function ligneEcart(ecart: number, queReel = false): string {
  const v = Math.round(Math.abs(ecart) * 10) / 10;
  if (v < 0.05) return t("age.pile");
  const cle = ecart < 0 ? (queReel ? "age.moinsReel" : "age.moins") : queReel ? "age.plusReel" : "age.plus";
  return tp(cle, v);
}

const SOURCE_FACTEUR: Record<IdFacteur, keyof DonneesAge["sources"] | null> = {
  regularite: "sommeil",
  duree: "sommeil",
  pasJour: "marche",
  zones13: "zones",
  zones45: "zones",
  muscu: "muscu",
  vo2: "vo2",
  fcRepos: "fc",
  maigre: "maigre",
};

function nomSource(s: SourceFacteur): string {
  return s ? t(`age.src.${s}` as "age.src.whoop") : t("age.sansSource");
}

// ---- Page ---------------------------------------------------------------------------------------------------------------

export function AgePepfit() {
  useLangue();
  // La page s'affiche tout de suite avec les données que Santé vient de lire : le vol n'attend pas la base, et le fondu (mouvement
  // réduit, Accueil) ne passe plus par l'écran de chargement
  const entree = useEntreeAge();
  const m = useMesure();
  const initiale = useRef(donneesAgeRecentes()).current;
  // l'âge gardé dans la base d'abord ; recalculé en fond s'il le fallait (age-donnees.ts), la page se relit alors
  const relire = useRef<() => void>(() => {});
  const [d, recharger] = useCharge(
    async (db) => {
      // avec le recul des zones et des séances, que lit la page en attente (deux requêtes)
      const [x, recul] = await Promise.all([lireAgeVite(db, () => relire.current()), lireReculAge(db)]);
      return { x, recul: recul as ReculAge | null, maintenant: Date.now() };
    },
    [],
    initiale ? { x: initiale.d, recul: null, maintenant: initiale.maintenant } : undefined,
  );
  relire.current = () => void recharger().catch(console.error);
  const [methode, setMethode] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  // Semaine affichée (rang dans les 30 semaines) ; null : la semaine en cours.
  const [rangSemaine, setRangSemaine] = useState<number | null>(null);
  const styleFond = useStyleFond(entree);
  const styleTete = useStyleBloc(entree, 0);
  // Précision pepfit (P8) : l'âge s'affiche quand son calcul est sûr (précision ≥ 60, cap Portrait) ; sinon, en attente
  const precision = usePrecision();
  const cadre = (enfants: ReactNode, aura = false) => (
    <FournisseurEntree valeur={entree}>
      {/* racine plein écran : la signature qui vole s'y mesure (age-entree.tsx) */}
      <View ref={entree.racine} collapsable={false} style={{ flex: 1 }}>
        <PageMesure titre={t("age.titre")} aura={aura} styleFond={styleFond} styleTete={styleTete} debord>
          {enfants}
        </PageMesure>
      </View>
    </FournisseurEntree>
  );
  const chargement = (
    <Apparait rang={0} style={{ alignItems: "center", marginTop: 24 }}>
      <View accessibilityLabel={t("mesures.chargement")}>
        <Os largeur={236} hauteur={236} rayon={118} />
      </View>
    </Apparait>
  );
  if (!d || !precision) return cadre(chargement);
  // Pas encore d'Âge (D1) : lecture fermée (précision de l'Âge sous 60, cap Portrait), pas de date de naissance, ou aucune
  // semaine calculée : la page en attente
  if (!d.x || !d.x.semaines.some((s) => s.age != null) || !lecture(precision.r, "age").ouverte) {
    if (!d.recul) return cadre(chargement);
    return cadre(
      <>
        <AttenteAge e={precision} recul={d.recul} maintenant={d.maintenant} onMethode={() => setMethode(true)} />
        <FeuilleMethode visible={methode} onFermer={() => setMethode(false)} />
      </>,
    );
  }
  const x = d.x;
  const derniere = x.semaines.length - 1;
  const i = rangSemaine ?? derniere;
  // Seulement les semaines qui ont un Âge, et la semaine en cours (31/10) : pas de cases vides dans le semainier.
  const visibles = x.semaines.map((_, k) => k).filter((k) => k === derniere || x.semaines[k]!.age != null);
  const c = x.semaines[i] ?? x.courante;
  const rythme = x.rythmes[i] ?? null;
  const jourLong = (ms: number) => formater(ms, { weekday: "long", day: "numeric", month: "short" });
  const prochain = prochainCalcul(d.maintenant);
  const sous = i === derniere ? tp("age.prochain", prochain.jours, { jour: jourLong(prochain.lundi) }) : t("age.calcule", { jour: jourLong(c.lundi) });
  const defs = definitions(x.sexe);
  // à l'ouverture, la forme part de la semaine d'avant la semaine en cours (le moment hebdomadaire)
  const precedente = [...x.semaines].reverse().find((s, k) => k > 0 && s.age != null) ?? null;
  // fond uni (la page s'anime elle-même, son fond couvre Santé) ; blocs qui arrivent à leur rang (age-entree.tsx)
  return cadre(
    <>
      <Apparait rang={0}>
        <BandeSemaines
          semaines={visibles.map((k) => ({ lundi: x.semaines[k]!.lundi, vide: x.semaines[k]!.age == null }))}
          affichee={Math.max(0, visibles.indexOf(i))}
          onAffiche={(j) => {
            const k = visibles[j] ?? derniere;
            setRangSemaine(k === derniere ? null : k);
          }}
          sous={sous}
          couleur={m.fort}
          deborde
        />
        {/* sa précision (planche precision, section 7) : sous le semainier */}
        <MiniPrecision calcul="age" style={STYLE_MINI} />
      </Apparait>
      <Centre courante={c} precedente={precedente} fc={derniereFc(c)} rythme={rythme} />
      <Apparait rang={1}>
        <Rythme rythme={rythme} ageReel={c.ageReel} />
      </Apparait>
      <Apparait rang={2}>
        {GROUPES.map((g) => (
          <GroupeFacteurs key={g} groupe={g} facteurs={c.facteurs.filter((f) => f.groupe === g)} defs={defs} x={x} />
        ))}
      </Apparait>
      {/* le bas de la page, hors écran, se monte quand le vol est posé : l'ouverture reste légère */}
      {entree.posee ? (
      <Apparait rang={3}>
      <Note style={{ marginHorizontal: MARGE, marginTop: 12 }}>{t("age.note")}</Note>
      <StatsAge x={x} semaine={c} sel={sel} onSel={setSel} />
      <TitreGroupe>{t("mesures.sources")}</TitreGroupe>
      <Groupe>
        <Lignes>
          {[
            <LigneMesure key="w" titre={t("mesures.whoop")} sous={t("age.source.whoop")} etat={t(x.whoopUtilise ? "mesures.utilisee" : "mesures.nonReliee")} onPress={() => router.push("/settings/connexions")} />,
            <LigneMesure key="s" titre={t("mesures.santeConnect")} sous={t("age.source.sante")} etat={x.sources.marche === "sante" || x.sources.sommeil === "sante" ? t("mesures.utilisee") : null} onPress={() => router.push("/settings/connexions")} />,
            <LigneMesure key="b" titre={t("age.source.balanceTitre")} sous={t("age.source.balance")} etat={x.sources.maigre ? t("mesures.utilisee") : null} onPress={() => router.push("/sante/poids")} />,
            <LigneMesure key="p" titre={t("age.source.pepfitTitre")} sous={t("age.source.pepfit")} etat={x.sources.muscu ? t("mesures.utilisees") : null} />,
            <LigneMesure key="m" titre={t("age.methode")} sous={t("age.methodeSous")} onPress={() => setMethode(true)} />,
          ]}
        </Lignes>
      </Groupe>
      </Apparait>
      ) : null}
      <FeuilleMethode visible={methode} onFermer={() => setMethode(false)} />
    </>,
  );
}

function derniereFc(s: SemaineAge): number | null {
  const f = s.facteurs.find((f) => f.id === "fcRepos");
  return f?.v30 ?? f?.v6 ?? null;
}

// ---- Centre : la signature et le chiffre ------------------------------------------------------------------------------

function fmtWorklet(v: number, sep: string): string {
  "worklet";
  return Math.abs(v).toFixed(1).replace(".", sep);
}

/** « 1 an de moins » → « 8,4 ans de moins » : le nombre du modèle remplacé (sur le fil de l'interface). */
function nombreModele(s: string, n: string): string {
  "worklet";
  return s.replace(/\d+([.,]\d+)?/, n);
}

function Centre({ courante, precedente, fc, rythme }: { courante: SemaineAge; precedente: SemaineAge | null; fc: number | null; rythme: number | null }) {
  const { couleurs, mode } = useTheme();
  const width = useLargeurContenu();
  const taille = Math.min(width - 2 * MARGE, 300);
  const jour = mode === "jour";
  const age = courante.age;
  const ecart = age != null ? courante.ecart : 0;
  const semainePassee = precedente?.age != null ? precedente.ecart : ecart;
  // arrivée depuis l'âme : la signature a déjà la couleur du jour ; sinon elle part de la semaine d'avant. Mouvement réduit :
  // la valeur du jour tout de suite (fondu enchaîné de la planche age-coeur, pas de compte de 35,1 à 34,9)
  const entree = useEntree();
  const enVol = entree?.mode === "vol";
  const reduit = entree?.mode === "reduit";
  // Départ de la forme et du chiffre, figé à l'ouverture : changer de semaine (semainier) les fait glisser de là où ils en
  // sont ; le texte de départ des champs ne change plus après le montage (sinon il écraserait le texte animé)
  const depart = useRef(enVol || reduit ? ecart : semainePassee).current;
  const valeur = useSharedValue(depart);
  const sig = useRef<ViewInstance>(null);
  const styleSignature = useStyleSignature(entree);
  const styleChiffre = useStyleBloc(entree, -1);
  const reel = courante.ageReel;
  const ageDepart = useRef(dec1(reel + depart)).current;
  const sep = dec1(1.5).includes(",") ? "," : ".";
  // Modèles de la ligne d'écart (le pluriel se décide sur le fil de l'interface, avec la valeur animée).
  const fr = locale().startsWith("fr");
  const modeles = {
    moinsUn: tp("age.moins", 1),
    moinsN: tp("age.moins", 5),
    plusUn: tp("age.plus", 1),
    plusN: tp("age.plus", 5),
    pile: t("age.pile"),
  };
  const propsAge = useAnimatedProps(() => {
    const s = fmtWorklet(reel + valeur.value, sep);
    return { text: s, defaultValue: s } as never;
  }, [reel, sep]);
  const propsLigne = useAnimatedProps(() => {
    const s = sensAffiche(valeur.value, ecart);
    const v = Math.abs(valeur.value);
    const n = fmtWorklet(v, sep);
    const un = fr ? v < 2 : Math.abs(v - 1) < 0.05;
    const texte = s === 0 ? modeles.pile : nombreModele(s < 0 ? (un ? modeles.moinsUn : modeles.moinsN) : un ? modeles.plusUn : modeles.plusN, n);
    return { text: texte, defaultValue: texte } as never;
  }, [ecart, fr]);
  const styleLigne = useAnimatedStyle(() => {
    const s = sensAffiche(valeur.value, ecart);
    return { color: couleurTexteAge(s * Math.max(0.5, Math.abs(valeur.value)), jour) };
  }, [ecart, jour]);
  const grandTexte = PixelRatio.getFontScale() > 1.3;
  const libelle = age != null ? t("age.lecteur", { age: dec1(age), ecart: ligneEcart(ecart) }) : t("age.lecteurAttente");
  const ligne = (
    <TexteAnime editable={false} underlineColorAndroid="transparent" animatedProps={propsLigne} defaultValue={ligneEcart(depart)} maxFontSizeMultiplier={1.15} style={[styles.ligneEcart, styleLigne]} />
  );
  return (
    <View style={styles.centre}>
      <View style={{ width: taille, height: taille }}>
        <Animated.View style={[StyleSheet.absoluteFill, styleSignature]}>
          <View ref={sig} collapsable={false} style={StyleSheet.absoluteFill} onLayout={() => entree?.surPlace(sig.current, taille)}>
            <SignatureAge
              ecart={ecart}
              ecartPrecedent={reduit ? ecart : semainePassee}
              rythme={Math.max(-1, Math.min(3, rythme ?? 1))}
              fc={fc}
              taille={taille}
              fond={couleurs.fondSante}
              valeur={valeur}
              leger={enVol ? entree.leger : undefined}
              horloges={enVol ? entree.depart?.horloges : null}
              ouverture={enVol ? "vol" : "semaine"}
              delaiOnde={jetonsAme.vol}
            />
          </View>
        </Animated.View>
        <Animated.View style={[styles.bloc, styleChiffre]} pointerEvents="none" accessible accessibilityLabel={libelle} accessibilityLiveRegion="polite">
          {age != null ? (
            <>
              <TexteAnime
                editable={false}
                underlineColorAndroid="transparent"
                animatedProps={propsAge}
                defaultValue={ageDepart}
                maxFontSizeMultiplier={1.15}
                style={[styles.age, { color: couleurs.t1 }]}
              />
              <Texte variante="entete" couleur="t2" maxFontSizeMultiplier={1.15}>
                {t("age.libelle")}
              </Texte>
              {!grandTexte ? ligne : null}
            </>
          ) : (
            <Texte variante="corps" couleur="t2" style={{ textAlign: "center", width: taille * 0.6, lineHeight: 19 }}>
              {t("age.peu")}
            </Texte>
          )}
        </Animated.View>
      </View>
      {grandTexte && age != null ? ligne : null}
    </View>
  );
}

// ---- Rythme de vieillissement -------------------------------------------------------------------------------------------

function Rythme({ rythme, ageReel }: { rythme: number | null; ageReel: number }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const [l, setL] = useState(0);
  const pos = rythme == null ? null : Math.max(0, Math.min(1, (rythme + 1) / 4));
  return (
    <View style={styles.rythme}>
      <View style={styles.duo}>
        <View style={{ flexShrink: 1 }}>
          <Texte variante="meta" couleur="t3">
            {t("age.rythme")}
          </Texte>
          <Texte style={styles.rythmeValeur}>{rythme == null ? "—" : t("age.x", { v: dec1(rythme) })}</Texte>
          {rythme == null ? (
            <Texte variante="meta" couleur="t3">
              {t("age.rythmeAttente")}
            </Texte>
          ) : null}
        </View>
        <Texte variante="meta" couleur="t3" style={{ textAlign: "right" }}>
          {t("age.ageReel", { v: dec1(ageReel) })}
        </Texte>
      </View>
      <View style={{ height: 16, justifyContent: "center" }} onLayout={(e) => setL(e.nativeEvent.layout.width)} accessible accessibilityLabel={`${t("age.rythme")} ${rythme == null ? "—" : t("age.x", { v: dec1(rythme) })}`}>
        {l > 0 ? (
          <Svg width={l} height={16}>
            <Defs>
              <LinearGradient id="railRythme" x1="0" x2="1" y1="0" y2="0">
                <Stop offset="0" stopColor={m.fort} stopOpacity={0.55} />
                <Stop offset="0.5" stopColor={couleurs.s3} stopOpacity={1} />
                <Stop offset="1" stopColor={couleurs.s3} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={4} width={l} height={8} rx={3} fill="url(#railRythme)" />
            <Rect x={l / 2 - 1} y={1} width={2} height={14} rx={1} fill={couleurs.t1} opacity={0.6} />
            {pos != null ? <Rect x={pos * l - 6} y={0} width={12} height={16} rx={4} fill={m.fort} stroke={couleurs.bg} strokeWidth={2} /> : null}
          </Svg>
        ) : null}
      </View>
      <View style={styles.bornes}>
        <Texte variante="meta" couleur="t3">
          {t("age.plusLent")}
        </Texte>
        <Texte variante="meta" couleur="t3" style={{ marginLeft: 8 }}>
          {t("age.unX")}
        </Texte>
        <Texte variante="meta" couleur="t3">
          {t("age.plusRapide")}
        </Texte>
      </View>
    </View>
  );
}

// ---- Facteurs -----------------------------------------------------------------------------------------------------------

function GroupeFacteurs({ groupe, facteurs, defs, x }: { groupe: GroupeAge; facteurs: FacteurCalcule[]; defs: Record<IdFacteur, DefFacteur>; x: DonneesAge }) {
  const total = facteurs.reduce((s, f) => s + f.impact, 0);
  return (
    <>
      <TitreGroupe>{t("age.titreGroupe", { groupe: t(`age.groupe.${groupe}` as "age.groupe.sommeil"), impact: `${ans1(total)} ${motAn(total)}` })}</TitreGroupe>
      <Groupe>
        <Lignes>
          {facteurs.map((f) => {
            const def = defs[f.id];
            const cleSource = SOURCE_FACTEUR[f.id];
            const source = nomSource(cleSource ? x.sources[cleSource] : null);
            const sous =
              f.id === "vo2" && f.v6 == null
                ? t("age.vo2Absente")
                : f.v6 == null
                  ? t("age.sansDonnee", { source })
                  : f.v30 != null
                    ? t("age.sous", { v6: valeurFacteur(def, f.v6), v30: valeurFacteur(def, f.v30), source })
                    : t("age.sousSeul", { v6: valeurFacteur(def, f.v6), source });
            return (
              <LigneMesure
                key={f.id}
                titre={t(`age.f.${f.id}` as "age.f.regularite")}
                sous={sous}
                valeur={f.v6 == null ? null : ans1(f.impact)}
                unite={f.v6 == null ? null : motAn(f.impact)}
                haut={<RailFacteur def={def} v={f.v6} />}
              />
            );
          })}
        </Lignes>
      </Groupe>
    </>
  );
}

/** Rail d'un facteur : la zone claire est la plage favorable, le curseur est la moyenne de 6 mois. */
function RailFacteur({ def, v }: { def: DefFacteur; v: number | null }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const a = positionRail(def, def.rail.favorable[0]);
  const b = positionRail(def, def.rail.favorable[1]);
  return (
    <View style={[styles.railF, { backgroundColor: couleurs.s3 }]} accessible={false}>
      <View style={[styles.zoneF, { left: `${a * 100}%`, right: `${(1 - b) * 100}%`, backgroundColor: m.voile, borderColor: m.doux }]} />
      {v != null ? <View style={[styles.curseurF, { left: `${positionRail(def, v) * 100}%`, backgroundColor: m.fort, borderColor: m.groupe }]} /> : null}
    </View>
  );
}

// ---- Statistiques -------------------------------------------------------------------------------------------------------

function StatsAge({ x, semaine, sel, onSel }: { x: DonneesAge; semaine: SemaineAge; sel: number | null; onSel: (i: number | null) => void }) {
  const l = x.semaines;
  const debut = l[0]!.lundi;
  const valides = l.filter((s) => s.age != null);
  const premier = valides[0] ?? null;
  const dernier = x.courante.age != null ? x.courante : null;
  const choisie = sel != null ? l[sel] ?? null : null;
  let entete;
  if (choisie) {
    entete =
      choisie.age == null ? (
        <EnteteStats petit={t("age.semaineDu", { date: formater(choisie.lundi, { day: "numeric", month: "short" }) })} valeur={t("age.semaineVide")} vide />
      ) : (
        <EnteteStats
          petit={t("age.semaineDu", { date: formater(choisie.lundi, { day: "numeric", month: "short" }) })}
          valeur={dec1(choisie.age)}
          unite={t("age.ans")}
          ligne={ligneEcart(choisie.ecart, true)}
        />
      );
  } else if (premier && dernier && valides.length > 1) {
    const v = dernier.age! - premier.age!;
    entete = <EnteteStats petit={t("age.evolution")} valeur={ans1(v)} unite={motAn(v)} ligne={t("age.deA", { a: dec1(premier.age!), b: dec1(dernier.age!) })} />;
  } else entete = <EnteteStats petit={t("age.evolution")} valeur="—" ligne={t("age.unPoint")} />;
  // ce qui rajeunit et ce qui est à travailler : la semaine affichée, comme les groupes du haut
  const { meilleur, pire } = extremes(semaine.facteurs);
  const defs = definitions(x.sexe);
  return (
    <Statistiques<"six">
      periodes={[{ valeur: "six", libelle: t("age.periode") }]}
      type="six"
      onType={() => {}}
      titre={t("age.titrePeriode", { date: formater(debut, { day: "numeric", month: "short" }) })}
      precedent={false}
      onAller={() => {}}
      k={0}
      entete={entete}
      nb={l.length}
      sel={sel}
      onSel={onSel}
      cle="age"
      libelleGraphe={t("age.graphe")}
      graphe={(w) => <CourbeAge semaines={l} ageReel={x.courante.ageReel} largeur={w} sel={sel} />}
      apres={
        <>
          <Groupe bloc>
            <Texte variante="meta" couleur="t3">
              {t("age.rythmeTitre")}
            </Texte>
            <Texte style={styles.duoValeur}>{x.rythme == null ? "—" : t("age.x", { v: dec1(x.rythme) })}</Texte>
            {x.rythme != null ? (
              <Texte variante="meta" couleur="t3">
                {t("age.rythmePour", { v: dec1(x.rythme) })}
              </Texte>
            ) : (
              <Texte variante="meta" couleur="t3">
                {t("age.rythmeAttente")}
              </Texte>
            )}
            <CourbeRythme rythmes={x.rythmes} debut={debut} />
            <Note>{t("age.rythmeNote")}</Note>
          </Groupe>
          <Groupe>
            <Lignes>
              {[
                <LigneMesure
                  key="m"
                  titre={t("age.meilleur")}
                  sous={meilleur ? t(`age.f.${meilleur.id}` as "age.f.regularite") : t("age.sansSource")}
                  valeur={meilleur ? ans1(meilleur.impact) : null}
                  unite={meilleur ? motAn(meilleur.impact) : null}
                />,
                <LigneMesure
                  key="p"
                  titre={t("age.travailler")}
                  sous={
                    pire
                      ? t("age.repere", { facteur: t(`age.f.${pire.id}` as "age.f.regularite"), valeur: valeurFacteur(defs[pire.id], pire.v6!), repere: valeurFacteur(defs[pire.id], defs[pire.id].repere) })
                      : t("age.rienDeDefavorable")
                  }
                  valeur={pire ? ans1(pire.impact) : null}
                  unite={pire ? motAn(pire.impact) : null}
                />,
              ]}
            </Lignes>
          </Groupe>
        </>
      }
    />
  );
}

/** Tracé d'une série avec trous (une semaine sans point coupe la ligne). */
function chemin(pts: readonly ({ x: number; y: number } | null)[]): { d: string; longueur: number } {
  let d = "";
  let longueur = 0;
  let prec: { x: number; y: number } | null = null;
  for (const p of pts) {
    if (!p) {
      prec = null;
      continue;
    }
    d += `${prec ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    if (prec) longueur += Math.hypot(p.x - prec.x, p.y - prec.y);
    prec = p;
  }
  return { d, longueur };
}

function Trace({ d, longueur, cle, couleur }: { d: string; longueur: number; cle: string; couleur: string }) {
  const p = useApparition(cle);
  const L = Math.max(1, longueur);
  const props = useAnimatedProps(() => ({ strokeDashoffset: L * Math.pow(1 - p.value, 4) }));
  return <PathAnime d={d} fill="none" stroke={couleur} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={`${L} ${L}`} animatedProps={props} />;
}

function CourbeAge({ semaines, ageReel, largeur, sel }: { semaines: readonly SemaineAge[]; ageReel: number; largeur: number; sel: number | null }) {
  const m = useMesure();
  const { couleurs } = useTheme();
  const W = largeur - 28;
  const H = 160;
  const ages = semaines.map((s) => s.age).filter((v): v is number => v != null);
  const lo = Math.floor((Math.min(ageReel, ...ages) - 3) / 5) * 5;
  const hi = Math.ceil((Math.max(ageReel, ...ages) + 2) / 5) * 5;
  const x = (i: number) => (semaines.length > 1 ? (i / (semaines.length - 1)) * W : W / 2);
  const y = (v: number) => 8 + ((hi - v) / (hi - lo || 1)) * (H - 28);
  const pts = semaines.map((s, i) => (s.age == null ? null : { x: x(i), y: y(s.age) }));
  const { d, longueur } = chemin(pts);
  const reperes: number[] = [];
  for (let v = lo; v <= hi; v += 5) reperes.push(v);
  const der = pts[pts.length - 1];
  const choisi = sel != null ? pts[sel] : null;
  return (
    <Svg width={largeur} height={H} accessibilityLabel={t("age.graphe")}>
      {reperes.map((v) => (
        <G key={v}>
          <Line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke={m.grille} strokeWidth={1} />
          <Etiquette x={W + 6} y={y(v) + 4} texte={String(v)} ancre="start" />
        </G>
      ))}
      <Tirets x1={0} x2={W} y={y(ageReel)} />
      <Etiquette x={0} y={y(ageReel) - 6} texte={t("age.ageReel", { v: dec1(ageReel) })} ancre="start" />
      {sel != null ? <Rect x={x(sel) - W / 60} y={4} width={W / 30} height={H - 28} rx={4} fill={couleurs.t1} opacity={0.07} /> : null}
      {d ? <Trace d={d} longueur={longueur} cle="age" couleur={m.fort} /> : null}
      {der ? <Circle cx={der.x} cy={der.y} r={4} fill={m.fort} stroke={m.groupe} strokeWidth={2} /> : null}
      {choisi ? <Circle cx={choisi.x} cy={choisi.y} r={4.5} fill={m.fort} stroke={couleurs.t1} strokeWidth={1.5} /> : null}
      <Etiquette x={0} y={H - 3} texte={formater(semaines[0]!.lundi, { day: "numeric", month: "short" })} ancre="start" />
      <Etiquette x={W} y={H - 3} texte={t("age.cetteSem")} ancre="end" fort />
    </Svg>
  );
}

function CourbeRythme({ rythmes, debut }: { rythmes: readonly (number | null)[]; debut: number }) {
  const m = useMesure();
  const [l, setL] = useState(0);
  const W = Math.max(0, l - 28);
  const H = 90;
  const vals = rythmes.filter((v): v is number => v != null);
  const lo = Math.min(0, Math.floor(Math.min(0, ...vals)));
  const hi = Math.max(2, Math.ceil(Math.max(2, ...vals)));
  const x = (i: number) => (rythmes.length > 1 ? (i / (rythmes.length - 1)) * W : 0);
  const y = (v: number) => 6 + ((hi - v) / (hi - lo || 1)) * (H - 24);
  const { d, longueur } = chemin(rythmes.map((v, i) => (v == null ? null : { x: x(i), y: y(v) })));
  const reperes: number[] = [];
  for (let v = lo; v <= hi; v++) reperes.push(v);
  return (
    <View style={{ marginTop: 12 }} onLayout={(e) => setL(e.nativeEvent.layout.width)}>
      {l > 0 ? (
        <Svg width={l} height={H} accessibilityLabel={t("age.rythmeGraphe")}>
          {reperes.map((v) => (
            <G key={v}>
              <Line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke={m.grille} strokeWidth={1} />
              <Etiquette x={W + 6} y={y(v) + 4} texte={t("age.x", { v: nombre(v, 0) })} ancre="start" />
            </G>
          ))}
          <Tirets x1={0} x2={W} y={y(1)} />
          {d ? <Trace d={d} longueur={longueur} cle="rythme" couleur={m.fort} /> : null}
          <Etiquette x={0} y={H - 3} texte={formater(debut, { day: "numeric", month: "short" })} ancre="start" />
          <Etiquette x={W} y={H - 3} texte={t("age.cetteSem")} ancre="end" fort />
        </Svg>
      ) : null}
    </View>
  );
}

// ---- Pas encore d'Âge (planche age-attente) ----------------------------------------------------------------------------

/** Signe d'état : le même sur l'anneau et en tête de ligne (plein prêt, demi en cours, creux à faire, petit point facultatif). */
function Signe({ etat, cx, cy, fort, t2, t3 }: { etat: EtatFacteur; cx: number; cy: number; fort: string; t2: string; t3: string }) {
  switch (etat) {
    case "pret":
      return <Circle cx={cx} cy={cy} r={4.5} fill={fort} />;
    case "encours":
      return (
        <G>
          <Circle cx={cx} cy={cy} r={4} fill="none" stroke={fort} strokeWidth={1.5} />
          <Path d={`M${cx} ${cy - 4}a4 4 0 0 1 0 8z`} fill={fort} />
        </G>
      );
    case "afaire":
      return <Circle cx={cx} cy={cy} r={4} fill="none" stroke={t2} strokeWidth={1.5} />;
    default:
      return <Circle cx={cx} cy={cy} r={2} fill={t3} />;
  }
}

const nomFacteur = (id: IdFacteur) => t(`age.f.${id}` as "age.f.regularite");
const etatLu = (e: EtatFacteur) => t(`age.attente.etat.${e}` as "age.attente.etat.pret");

function AttenteAge({ e, recul, maintenant, onMethode }: { e: EtatPrecision; recul: ReculAge; maintenant: number; onMethode: () => void }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const a = attente({ d: e.d, memoire: e.memoire, recul, vmaDate: e.faits.vmaDate, maintenant });
  const capteur = !!e.d.capteur;
  const coul = { fort: m.fort, t2: couleurs.t2, t3: couleurs.t3 };
  // les neuf points sur l'anneau, dans l'ordre de la liste, groupés (un pas vide entre deux groupes), du haut, en horaire
  const points: { f: LigneAttente; x: number; y: number }[] = [];
  let k = 0;
  for (const g of GROUPES) {
    for (const f of a.facteurs.filter((x) => x.groupe === g)) {
      const angle = ((-90 + 15 + k * 30) * Math.PI) / 180;
      points.push({ f, x: 150 + 141 * Math.cos(angle), y: 150 + 141 * Math.sin(angle) });
      k++;
    }
    k++;
  }
  const lus = a.facteurs.map((f) => `${nomFacteur(f.id)} ${etatLu(f.etat)}`).join(", ");
  const apres = a.cas === "naissance" ? texteApres(a.date) : null;
  return (
    <>
      <Apparait rang={0}>
        <View style={styles.attente}>
          <View style={[StyleSheet.absoluteFill, { opacity: a.opacite }]}>
            <SignatureAge ecart={0} rythme={1} fc={null} taille={300} fond={couleurs.fondSante} fantome={{ flou: a.flou }} />
          </View>
          <Svg width={300} height={300} viewBox="0 0 300 300" style={StyleSheet.absoluteFill} accessible accessibilityLabel={tp("age.attente.lecteurPoints", a.prets, { liste: lus })}>
            <Circle cx={150} cy={150} r={141} fill="none" stroke={couleurs.t3} strokeOpacity={0.45} strokeWidth={1} strokeDasharray="2 6" strokeLinecap="round" />
            {points.map(({ f, x, y }) => (
              <G key={f.id}>
                <Circle cx={x} cy={y} r={8} fill={couleurs.fondSante} />
                <Signe etat={f.etat} cx={x} cy={y} {...coul} />
              </G>
            ))}
          </Svg>
          <View style={styles.attenteBloc} accessible accessibilityLiveRegion="polite">
            {a.cas === "naissance" ? (
              <>
                <Texte style={[styles.manque, { color: couleurs.t1 }]}>{t("age.attente.manque")}</Texte>
                <Texte style={[styles.manqueSous, { color: couleurs.t2 }]}>{t("age.attente.manqueSous")}</Texte>
              </>
            ) : a.date ? (
              <>
                <Texte style={[styles.dateAttente, { color: couleurs.t1 }]} numberOfLines={1} maxFontSizeMultiplier={1.15}>
                  {dateCourte(a.date.lundi)}
                </Texte>
                <Texte variante="entete" couleur="t2" maxFontSizeMultiplier={1.15} style={{ marginTop: 2 }}>
                  {t("age.attente.premier")}
                </Texte>
                <Texte style={[styles.quand, { color: m.fort }]}>{texteQuand(a.date, capteur)}</Texte>
              </>
            ) : (
              <>
                <Texte style={[styles.manque, { color: couleurs.t1 }]}>{t("age.attente.sansDate")}</Texte>
                <Texte style={[styles.manqueSous, { color: couleurs.t2 }]}>{t("age.attente.sansDateSous")}</Texte>
              </>
            )}
          </View>
        </View>
        {/* sans date de naissance, un seul bouton (D6) ; la date si tu la saisis aujourd'hui */}
        {a.cas === "naissance" ? (
          <>
            <BoutonPrincipal libelle={t("age.attente.bouton")} onPress={() => suivreEtape("naissance")} style={{ marginHorizontal: MARGE, marginTop: 20 }} />
            {apres ? <Texte style={[styles.apres, { color: couleurs.t2 }]}>{apres}</Texte> : null}
          </>
        ) : null}
        <Texte style={[styles.quoi, { color: couleurs.t2 }]}>{t("age.attente.quoi")}</Texte>
      </Apparait>
      <Apparait rang={1}>
        {GROUPES.map((g) => {
          const l = a.facteurs.filter((f) => f.groupe === g);
          const n = l.filter((f) => f.etat === "pret").length;
          return (
            <View key={g}>
              <TitreGroupe>{tp("age.attente.groupe", n, { groupe: t(`age.groupe.${g}` as "age.groupe.sommeil"), sur: l.length })}</TitreGroupe>
              <Groupe>
                {/* filet en retrait du signe (44), comme la planche */}
                {l.map((f, j) => (
                  <View key={f.id}>
                    {j > 0 ? <View style={[styles.filetAttente, { backgroundColor: m.sep }]} /> : null}
                    <LigneFacteurAttente f={f} coul={coul} />
                  </View>
                ))}
              </Groupe>
            </View>
          );
        })}
        <TitreGroupe>{t("age.attente.loin")}</TitreGroupe>
        <Groupe>
          <Lignes>
            {[
              <LigneMesure key="p" titre={t("age.attente.precisionTitre")} sous={textePrecision(a, capteur)} onPress={() => router.push("/profil/precision")} />,
              <LigneMesure key="m" titre={t("age.methode")} sous={t("age.attente.methodeSous")} onPress={onMethode} />,
            ]}
          </Lignes>
        </Groupe>
      </Apparait>
    </>
  );
}

/** Une ligne de facteur : signe, nom, où il en est (« Prête » appuyé), traits du compte, et le lien vers l'écran où agir. */
function LigneFacteurAttente({ f, coul }: { f: LigneAttente; coul: { fort: string; t2: string; t3: string } }) {
  const { couleurs } = useTheme();
  const i = f.etat === "pret" ? f.sous.indexOf(", ") : -1;
  const sous =
    i > 0 ? (
      <Texte variante="meta" couleur="t3" style={styles.sousAttente}>
        <Texte variante="meta" style={{ fontFamily: police.medium, color: couleurs.t2 }}>
          {f.sous.slice(0, i)}
        </Texte>
        {f.sous.slice(i)}
      </Texte>
    ) : (
      <Texte variante="meta" couleur="t3" style={styles.sousAttente}>
        {f.sous}
      </Texte>
    );
  const action = f.action;
  return (
    <Pressable
      disabled={!action}
      onPress={action ? () => suivreEtape(action) : undefined}
      accessibilityRole={action ? "button" : undefined}
      accessibilityLabel={
        action && f.lien
          ? t("age.attente.lecteurLigne", { titre: nomFacteur(f.id), etat: etatLu(f.etat), sous: f.sous, lien: f.lien })
          : `${nomFacteur(f.id)}, ${etatLu(f.etat)}, ${f.sous}`
      }
      style={({ pressed }) => [styles.ligneAttente, pressed && { backgroundColor: couleurs.s3 }]}
    >
      <View style={styles.signe}>
        <Svg width={16} height={16} viewBox="0 0 16 16">
          <Signe etat={f.etat} cx={8} cy={8} {...coul} />
        </Svg>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="corps" style={{ fontSize: 15, lineHeight: 20 }}>
          {nomFacteur(f.id)}
        </Texte>
        {sous}
        {f.traits ? (
          <View style={styles.traits}>
            {Array.from({ length: f.traits.sur }, (_, j) => (
              <View key={j} style={[styles.trait, { backgroundColor: j < f.traits!.n ? coul.fort : couleurs.s3 }]} />
            ))}
          </View>
        ) : null}
      </View>
      {f.lien ? (
        <View style={styles.lienAttente}>
          <Texte variante="corps" style={{ fontFamily: police.medium, color: coul.fort }}>
            {f.lien}
          </Texte>
          <Icone nom="right" couleur={coul.fort} taille={16} epaisseur={1.75} />
        </View>
      ) : null}
    </Pressable>
  );
}

// ---- Comment c'est calculé ----------------------------------------------------------------------------------------------

const REFERENCES = ["regul", "duree", "steps", "modere", "intense", "muscu", "vo2", "fc", "maigre", "gompertz"] as const;
const FACTEUR_DE_REF: Record<(typeof REFERENCES)[number], IdFacteur | null> = {
  regul: "regularite",
  duree: "duree",
  steps: "pasJour",
  modere: "zones13",
  intense: "zones45",
  muscu: "muscu",
  vo2: "vo2",
  fc: "fcRepos",
  maigre: "maigre",
  gompertz: null,
};

function FeuilleMethode({ visible, onFermer }: { visible: boolean; onFermer: () => void }) {
  return (
    <Feuille visible={visible} onFermer={onFermer} titre={t("age.methode")}>
      {(["age.methode.p1", "age.methode.p2", "age.methode.p3"] as const).map((k) => (
        <Texte key={k} variante="corps" couleur="t2" style={{ fontSize: 15, lineHeight: 22, marginTop: 8 }}>
          {t(k)}
        </Texte>
      ))}
      <Texte variante="entete" couleur="t3" style={{ marginTop: 20 }}>
        {t("age.methode.etudes")}
      </Texte>
      {REFERENCES.map((r) => {
        const f = FACTEUR_DE_REF[r];
        return (
          <View key={r} style={{ marginTop: 10 }}>
            {f ? (
              <Texte variante="corps" style={{ fontFamily: police.medium }}>
                {t(`age.f.${f}` as "age.f.regularite")}
              </Texte>
            ) : null}
            <Texte variante="meta" couleur="t3" style={{ lineHeight: 18, marginTop: 2 }} selectable>
              {t(`age.ref.${r}` as "age.ref.regul")}
            </Texte>
          </View>
        );
      })}
    </Feuille>
  );
}

const styles = StyleSheet.create({
  // page en attente (planche age-attente)
  attente: { width: 300, height: 300, alignSelf: "center", marginTop: 8 },
  attenteBloc: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", paddingHorizontal: 54 },
  dateAttente: { fontFamily: police.light, fontSize: 52, lineHeight: 58, letterSpacing: -1.6, textAlign: "center" },
  quand: { fontFamily: police.medium, fontSize: 13, lineHeight: 18, marginTop: 8, maxWidth: 190, textAlign: "center" },
  manque: { fontFamily: police.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.22, maxWidth: 200, textAlign: "center" },
  manqueSous: { fontSize: 13, lineHeight: 18, marginTop: 6, maxWidth: 190, textAlign: "center" },
  apres: { fontSize: 13, lineHeight: 18, marginTop: 10, marginHorizontal: MARGE, textAlign: "center" },
  quoi: { fontSize: 13, lineHeight: 20, marginTop: 24, marginHorizontal: MARGE },
  ligneAttente: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingTop: 12, paddingBottom: 14, paddingLeft: MARGE, paddingRight: 8, minHeight: 64 },
  signe: { width: 16, height: 20, alignItems: "center", justifyContent: "center" },
  sousAttente: { lineHeight: 16, marginTop: 3 },
  traits: { flexDirection: "row", gap: 3, marginTop: 8, maxWidth: 220 },
  trait: { flex: 1, height: 6, borderRadius: 2 },
  filetAttente: { height: 1, marginLeft: 44, marginRight: MARGE },
  lienAttente: { flexDirection: "row", alignItems: "center", alignSelf: "center", gap: 2, minHeight: 44, paddingLeft: 12, paddingRight: 8 },
  centre: { alignItems: "center", marginTop: 4 },
  bloc: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  // un TextInput ne s'ajuste pas à son texte : largeur fixe pour 4 chiffres tabulaires (« 30,9 »)
  age: { fontFamily: police.light, fontSize: 56, lineHeight: 62, letterSpacing: -1.7, fontVariant: ["tabular-nums"], padding: 0, width: 150, textAlign: "center" },
  ligneEcart: { fontFamily: police.medium, fontSize: 15, marginTop: 6, fontVariant: ["tabular-nums"], padding: 0, width: 220, textAlign: "center" },
  rythme: { marginTop: 16, marginHorizontal: MARGE },
  duo: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 12 },
  rythmeValeur: { fontFamily: police.semibold, fontSize: 24, lineHeight: 30, letterSpacing: -0.24, fontVariant: ["tabular-nums"] },
  duoValeur: { fontFamily: police.semibold, fontSize: 20, lineHeight: 26, marginTop: 2, fontVariant: ["tabular-nums"] },
  bornes: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  railF: { height: 6, borderRadius: 2, marginTop: 8, maxWidth: 220 },
  zoneF: { position: "absolute", top: 0, bottom: 0, borderRadius: 2, borderWidth: 1 },
  curseurF: { position: "absolute", top: -4, width: 10, height: 14, marginLeft: -5, borderRadius: 3, borderWidth: 2 },
});
