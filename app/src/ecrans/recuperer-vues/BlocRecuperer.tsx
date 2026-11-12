// « Récupérer » dans les pages (planche recuperer) :
//   - page Récupération (écran 1) : le bouton plein « Récupérer » sous le score (D1, aujourd'hui seulement), « Ce que tu as
//     fait pour récupérer » du jour choisi, la règle en une phrase, et l'encart « Ce qui marche pour toi », seulement quand
//     une réponse nette existe ;
//   - page Sommeil (écran 8) : « Siestes » sous la nuit, « à rattraper » avant et après la sieste, « Démarrer une sieste ».
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { t } from "../../i18n/index";
import { useTheme } from "../../theme";
import { police } from "../../theme/typo";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { useApp } from "../contexte";
import { heure, jourSemaineMois } from "../format";
import { Groupe, LigneMesure, Lignes, MARGE, TitreGroupe, useMesure } from "../mesures/gabarit";
import { hm } from "../mesures/sommeil-stats";
import { arrondiDette, RECUP } from "../recup-pepfit";
import { sommeilSieste, type EnCoursRecup, type TypeRecup } from "../recuperer";
import { lireCeQuiMarche, lireRecupEntre, type ActiviteFaite, type Marche } from "../recuperer-donnees";
import { lireDetteDuJour, lireEnCoursRecup, reprendreRecup } from "../recuperer-session";
import { kcalRecup, minutesDe, nomRecup, sourceRecup, sousLigneRecup, VignetteRecup } from "./briques";
import { FeuilleRecuperer } from "./FeuilleRecuperer";

const JOUR = 86_400_000;
const lendemain = (jour: number) => {
  const d = new Date(jour);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
};

interface Journee {
  activites: ActiviteFaite[];
  kcal: Map<string, number>;
  enCours: EnCoursRecup | null;
  marche: Marche | null;
}

/** Les sessions d'un jour (minuit), leurs kcal, la session en cours, la réponse nette de « Ce qui marche » ; relu à l'arrivée. */
function useJournee(jour: number, avecMarche: boolean): [Journee | null, () => void] {
  const { db } = useApp();
  const [j, setJ] = useState<Journee | null>(null);
  const charger = useCallback(() => {
    let vivant = true;
    (async () => {
      await reprendreRecup(db).catch(() => null);
      const [activites, enCours, marche] = await Promise.all([
        lireRecupEntre(db, jour, lendemain(jour)),
        lireEnCoursRecup(db),
        avecMarche ? lireCeQuiMarche(db).catch((): Marche[] => []) : Promise.resolve([] as Marche[]),
      ]);
      const kcal = new Map<string, number>();
      for (const a of activites) {
        const k = await kcalRecup(db, a.type, minutesDe(a), a.debut).catch(() => null);
        if (k != null) kcal.set(a.id, k);
      }
      if (vivant) setJ({ activites, kcal, enCours, marche: marche.find((m) => m.etat.etat === "net") ?? null });
    })().catch(console.error);
    return () => {
      vivant = false;
    };
  }, [db, jour, avecMarche]);
  useFocusEffect(charger);
  return [j, charger];
}

/** « Après un sauna, ta VFC du lendemain est en moyenne 6 % plus haute. » : le texte, et sa partie forte. */
export function phraseMarche(m: Marche): { texte: string; fort: string | null } {
  const apres = t(`recuperer.apres.${m.type}` as "recuperer.apres.sauna");
  if (m.etat.etat !== "net") return { texte: t("recuperer.marche.flou", { apres }), fort: null };
  const fort = t("recuperer.marche.fort", { n: Math.round(Math.abs(m.etat.ecart) * 100), sens: t(m.etat.ecart > 0 ? "recuperer.marche.haute" : "recuperer.marche.basse") });
  return { texte: t("recuperer.marche.net", { apres, fort }), fort };
}

/** Un texte dont une partie est en gras (la partie forte d'une phrase traduite). */
export function TexteFort({ texte, fort, styleFort, style, couleur = "t2" }: { texte: string; fort: string | null; styleFort: object; style?: object; couleur?: "t1" | "t2" }) {
  const i = fort ? texte.indexOf(fort) : -1;
  if (!fort || i < 0)
    return (
      <Texte variante="corps" couleur={couleur} style={style}>
        {texte}
      </Texte>
    );
  return (
    <Texte variante="corps" couleur={couleur} style={style}>
      {texte.slice(0, i)}
      <Texte style={styleFort}>{fort}</Texte>
      {texte.slice(i + fort.length)}
    </Texte>
  );
}

/** Page Récupération : le bouton, la journée, la règle, l'encart (écran 1). */
export function BlocRecuperer({ jour, aujourdhui }: { jour: number; aujourdhui: boolean }) {
  const [j, recharger] = useJournee(jour, aujourdhui);
  const [feuille, setFeuille] = useState(false);
  const siestes = j?.activites.some((a) => a.type === "sieste") ?? false;
  return (
    <>
      {aujourdhui ? <BoutonPrincipal libelle={t("recuperer.bouton")} icone="feuille" onPress={() => setFeuille(true)} style={styles.bouton} /> : null}
      {j?.enCours ? <LigneEnCours e={j.enCours} /> : null}
      {j && j.activites.length ? (
        <>
          <TitreGroupe>{t("recuperer.fait")}</TitreGroupe>
          <Groupe>
            <Lignes>
              {j.activites.map((a) => (
                <LigneMesure
                  key={a.id}
                  avant={<VignetteRecup type={a.type} />}
                  titre={nomRecup(a.type)}
                  sous={sousLigneRecup(a, j.kcal.get(a.id) ?? null)}
                  libelle={t("recuperer.ouvrir", { nom: nomRecup(a.type), heure: heure(a.debut) })}
                  onPress={() => router.push({ pathname: "/recuperer/fin", params: { id: a.id } })}
                />
              ))}
            </Lignes>
          </Groupe>
          <Texte variante="corps" couleur="t2" style={styles.note}>
            {`${siestes ? t("recuperer.regleSieste") : ""}${t("recuperer.regleReste")}`}
          </Texte>
        </>
      ) : null}
      {j?.marche ? <EncartMarche m={j.marche} /> : null}
      <FeuilleRecuperer
        visible={feuille}
        onFermer={() => {
          setFeuille(false);
          recharger();
        }}
      />
    </>
  );
}

function LigneEnCours({ e }: { e: EnCoursRecup }) {
  return (
    <Groupe style={{ marginTop: 12 }}>
      <LigneMesure
        avant={<VignetteRecup type={e.type} />}
        titre={nomRecup(e.type)}
        sous={e.alarme != null ? t(e.type === "sieste" ? "recuperer.enCours.reveil" : "recuperer.enCours.fin", { heure: heure(e.alarme) }) : t("recuperer.enCours.depuis", { heure: heure(e.debut) })}
        onPress={() => router.push(e.type === "respiration" ? "/recuperer/respiration" : "/recuperer/en-cours")}
      />
    </Groupe>
  );
}

/** L'encart « Ce qui marche pour toi » : une réponse nette, qui ouvre la page. */
export function EncartMarche({ m: r }: { m: Marche }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  const p = phraseMarche(r);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("recuperer.marche.ouvrir", { texte: p.texte })}
      onPress={() => router.push("/sante/ce-qui-marche")}
      style={({ pressed }) => [styles.encart, { backgroundColor: pressed ? couleurs.s3 : m.voile }]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte style={styles.encartTitre}>{t("recuperer.marche.titre")}</Texte>
        <TexteFort texte={p.texte} fort={p.fort} style={styles.encartTexte} styleFort={{ color: couleurs.t1, fontFamily: police.semibold }} />
      </View>
      <Icone nom="right" couleur={couleurs.t3} taille={18} />
    </Pressable>
  );
}

/** « À rattraper » (minutes) au-delà duquel « Démarrer une sieste » prend le bouton principal (planche sommeil, D16). */
export const SEUIL_DETTE_CTA = RECUP.dette.seuilCta;

/** Page Sommeil : les siestes du jour sous la nuit, la dette, « Démarrer une sieste » (écran 8). */
export function SiestesJour({ jour, aujourdhui }: { jour: number; aujourdhui: boolean }) {
  const { db } = useApp();
  const [siestes, setSiestes] = useState<ActiviteFaite[] | null>(null);
  const [dette, setDette] = useState<{ avant: number; apres: number } | null>(null);
  const [feuille, setFeuille] = useState(false);
  const charger = useCallback(() => {
    let vivant = true;
    Promise.all([lireRecupEntre(db, jour, jour + JOUR + 3_600_000), aujourdhui ? lireDetteDuJour(db).catch(() => null) : Promise.resolve(null)])
      .then(([l, d]) => {
        if (!vivant) return;
        setSiestes(l.filter((a) => a.type === "sieste" && a.debut < lendemain(jour)));
        setDette(d);
      })
      .catch(console.error);
    return () => {
      vivant = false;
    };
  }, [db, jour, aujourdhui]);
  useFocusEffect(charger);
  if (!siestes) return null;
  return (
    <>
      {siestes.length ? (
        <>
          <TitreGroupe>{t("recuperer.sommeil.siestes", { date: jourSemaineMois(jour) })}</TitreGroupe>
          <Groupe>
            <Lignes>
              {[
                ...siestes.map((s) => {
                  const source = sourceRecup(s);
                  const n = sommeilSieste(s);
                  return (
                    <LigneMesure
                      key={s.id}
                      avant={<VignetteRecup type={"sieste" as TypeRecup} />}
                      titre={t("recuperer.sommeil.ligne", { debut: heure(s.debut), fin: heure(s.fin) })}
                      sous={source ? (s.sources.includes("pepfit") ? t("recuperer.sommeil.fusion", { source }) : source) : "pepfit"}
                      valeur={t("recuperer.min", { n })}
                      sousValeur={t("recuperer.sommeil.dormies")}
                      libelle={t("recuperer.sommeil.lu", { debut: heure(s.debut), fin: heure(s.fin), n })}
                      onPress={() => router.push({ pathname: "/recuperer/fin", params: { id: s.id } })}
                    />
                  );
                }),
                dette && dette.apres !== dette.avant ? (
                  <LigneMesure key="dette" titre={t("recuperer.sommeil.dette")} sous={t("recuperer.sommeil.detteAvant", { d: hm(arrondiDette(dette.avant)) })} valeur={hm(arrondiDette(dette.apres))} />
                ) : null,
              ]}
            </Lignes>
          </Groupe>
          <Texte variante="corps" couleur="t2" style={styles.note}>
            {t("recuperer.sommeil.note")}
          </Texte>
        </>
      ) : null}
      {aujourdhui ? (
        <View style={styles.tonal}>
          {/* Plus de 1 h 30 à rattraper : la sieste devient l'action principale de la page. */}
          {(dette?.apres ?? 0) > SEUIL_DETTE_CTA ? (
            <BoutonPrincipal libelle={t("recuperer.sommeil.demarrer")} icone="lune" onPress={() => setFeuille(true)} />
          ) : (
            <BoutonTonalRose libelle={t("recuperer.sommeil.demarrer")} onPress={() => setFeuille(true)} />
          )}
        </View>
      ) : null}
      <FeuilleRecuperer
        visible={feuille}
        etape="sieste"
        onFermer={() => {
          setFeuille(false);
          charger();
        }}
      />
    </>
  );
}

/** Le bouton tonal de la page Sommeil : la lune et le libellé dans la couleur de la page (`.btn.tonal.p`). */
function BoutonTonalRose({ libelle, onPress }: { libelle: string; onPress: () => void }) {
  const { couleurs } = useTheme();
  const m = useMesure();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={libelle} onPress={onPress} style={({ pressed }) => [styles.boutonTonal, { backgroundColor: pressed ? couleurs.s3 : couleurs.btnTonalFond }]}>
      <Icone nom="lune" couleur={m.fort} taille={18} />
      <Texte variante="exercice" style={{ color: m.fort }}>
        {libelle}
      </Texte>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bouton: { marginTop: 18, marginHorizontal: MARGE },
  note: { fontSize: 12.5, lineHeight: 19, marginTop: 10, marginHorizontal: MARGE },
  encart: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, marginHorizontal: MARGE, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12 },
  encartTitre: { fontFamily: police.semibold, fontSize: 15, lineHeight: 20 },
  encartTexte: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  tonal: { marginTop: 18, marginHorizontal: MARGE },
  boutonTonal: { minHeight: 52, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
});
