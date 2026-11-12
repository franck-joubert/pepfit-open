import { useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { resumesSeancesWhoop } from "../../whoop/lecture";
import { historiqueSeances, seancesParSemaine, supprimerSeance, type SeanceResume, type SemaineHistorique } from "../../db";
import { menagePhotos } from "../../photos";
import { useTheme } from "../../theme";
import { espace, rayon } from "../../theme/typo";
import { useApp, useCharge } from "../../ecrans/contexte";
import { effortsConnus } from "../../ecrans/effort-charges";
import { texteEffort } from "../../ecrans/mesures/scores-calc";
import { ajouterJours, debutMois, debutSemaine, dureeCourte, jourCourt, jourDuMois, jourMois, moisAnnee, nombre, plage, pluriel, versUnite } from "../../ecrans/format";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { BarreHaut } from "../../ui/Cadre";
import { BandeauAnnuler } from "../../ui/BandeauAnnuler";
import { Desintegrable, useFantomes } from "../../ui/Desintegration";
import { signalerErreur } from "../../ui/FeuilleMessage";
import { GlisserSupprimer } from "../../ui/GlisserSupprimer";
import { useAnnuler } from "../../ecrans/suivi-ui";
import type { Entree } from "../../ui/suppression-animee";
import { Icone } from "../../ui/Icone";
import { Segmente } from "../../ui/Segmente";
import { Texte } from "../../ui/Texte";

type Vue = "semaine" | "mois";
interface Barre {
  debut: number;
  n: number;
}

const AUCUNE: SeanceResume[] = [];
const debutDuMois = (ms: number) => debutMois(ms).getTime();

// Suppression (revue finale n° 8, GRILLE 3 « suppression identique partout ») : la ligne se glisse vers la gauche, « Supprimer »,
// elle se désintègre ; « Séance supprimée · Annuler » 8 s, puis l'effacement (aussi en quittant la page). Le détail de la
// séance garde son « Supprimer » du menu.

export default function Historique() {
  const { db, reglages } = useApp();
  const { couleurs } = useTheme();
  const { langue, fuseau } = useLangue();
  const u = reglages.unite;
  const [vue, setVue] = useState<Vue>("semaine");
  const bas = useSafeAreaInsets().bottom + espace.l;
  const [d, recharger] = useCharge<{ seances: SeanceResume[]; semaines: SemaineHistorique[]; whoop: Awaited<ReturnType<typeof resumesSeancesWhoop>>; efforts: Map<string, number> }>(
    async () => {
      const seances = await historiqueSeances(db, { limite: 500 });
      return { seances, semaines: await seancesParSemaine(db, 56), whoop: await resumesSeancesWhoop(db), efforts: await effortsConnus(db, seances.map((x) => x.id)) };
    },
    [db],
  );

  const barres = useMemo<Barre[]>(() => {
    if (!d) return [];
    if (vue === "semaine") return d.semaines.slice(-12).map((s) => ({ debut: s.debut, n: s.nbSeances }));
    const parMois = new Map<number, number>();
    for (const s of d.semaines) parMois.set(debutDuMois(s.debut), (parMois.get(debutDuMois(s.debut)) ?? 0) + s.nbSeances);
    return [...parMois.entries()].sort((a, b) => a[0] - b[0]).slice(-12).map(([debut, n]) => ({ debut, n }));
  }, [d, vue, fuseau]);

  // Glissée puis « Supprimer » : cachée tout de suite, effacée après « Annuler ».
  const [cachees, setCachees] = useState<ReadonlySet<string>>(() => new Set());
  const annuler = useAnnuler(
    {
      supprimer: async (id) => setCachees((c) => new Set(c).add(id)),
      restaurer: async (id) =>
        setCachees((c) => {
          const n = new Set(c);
          n.delete(id);
          return n;
        }),
      purger: (id) =>
        supprimerSeance(db, id)
          .then(() => menagePhotos(db))
          .then(recharger)
          .catch(signalerErreur("supprimer")),
    },
    async () => {},
  );
  const seances = useMemo(() => (d?.seances ?? AUCUNE).filter((s) => !cachees.has(s.id)), [d, cachees]);
  // Séance supprimée (glissée ici, ou depuis son détail) : elle reste en fantôme le temps de se désintégrer.
  const { entrees, fini } = useFantomes(seances, (s) => s.id);
  const sections = useMemo(() => {
    if (!d) return [];
    const groupes = new Map<number, Entree<SeanceResume>[]>();
    for (const e of entrees) {
      const k = vue === "semaine" ? debutSemaine(e.item.debut).getTime() : debutDuMois(e.item.debut);
      groupes.set(k, [...(groupes.get(k) ?? []), e]);
    }
    const ici = vue === "semaine" ? debutSemaine(Date.now()).getTime() : debutDuMois(Date.now());
    return [...groupes.entries()].map(([k, data]) => {
      const vues = data.filter((e) => e.etat !== "sort").map((e) => e.item);
      const titre =
        k === ici
          ? t(vue === "semaine" ? "accueil.historique.cetteSemaine" : "accueil.historique.ceMois")
          : vue === "semaine"
            ? plage(new Date(k), ajouterJours(k, 6))
            : moisAnnee(k);
      const minutes = vues.reduce((total, s) => total + s.dureeMin, 0);
      return { titre: titre.charAt(0).toUpperCase() + titre.slice(1), resume: `${pluriel(vues.length, "communs.seance")}, ${dureeCourte(minutes * 60)}`, data };
    });
  }, [d, entrees, vue, langue, fuseau]);

  const max = Math.max(1, ...barres.map((b) => b.n));
  // Une décimale : 1 séance sur 12 semaines s'affichait « 0 en moyenne ».
  const moyenne = nombre(barres.length ? barres.reduce((t, b) => t + b.n, 0) / barres.length : 0, 1);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("accueil.historique.titre")} />
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: couleurs.line }} />
      <SectionList
        sections={sections}
        keyExtractor={(e) => e.cle}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: espace.l, paddingBottom: espace.xxl }}
        ListHeaderComponent={
          <View style={{ paddingTop: espace.l }}>
            <Segmente<Vue>
              options={[
                { valeur: "semaine", libelle: t("accueil.historique.semaine") },
                { valeur: "mois", libelle: t("accueil.historique.mois") },
              ]}
              valeur={vue}
              onChange={setVue}
            />
            <Texte variante="libelle" couleur="t2" style={{ marginTop: espace.xxl }}>
              {t(vue === "semaine" ? "accueil.historique.parSemaine" : "accueil.historique.parMois")}, {t("accueil.historique.moyenne", { n: moyenne })}
            </Texte>
            <View style={styles.barres} accessibilityLabel={t(vue === "semaine" ? "accueil.historique.parSemaine" : "accueil.historique.parMois")}>
              {barres.map((b, i) => (
                <View
                  key={b.debut}
                  style={[
                    styles.barre,
                    {
                      height: Math.max(4, (b.n / max) * 48),
                      backgroundColor: i === barres.length - 1 ? couleurs.t2 : couleurs.s3,
                    },
                  ]}
                />
              ))}
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
              <Texte variante="meta" couleur="t2">
                {barres[0] ? jourMois(barres[0].debut) : ""}
              </Texte>
              <Texte variante="meta" couleur="t2">
                {t(vue === "semaine" ? "accueil.historique.cetteSemaineMin" : "accueil.historique.ceMoisMin")}
              </Texte>
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.tete}>
            <Texte variante="exercice" style={{ flex: 1 }}>
              {section.titre}
            </Texte>
            <Texte variante="libelle" couleur="t2">
              {section.resume}
            </Texte>
          </View>
        )}
        renderItem={({ item: { item, cle, etat, delai }, index }) => {
          return (
            <Desintegrable cle={cle} etat={etat} delai={delai} onFini={fini}>
              <GlisserSupprimer cle={cle} onSupprimer={() => annuler.supprimer(item.id, t("planif.seanceSupprimee")).catch(signalerErreur("supprimer"))}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(`/history/${item.id}`)}
                  style={({ pressed }) => [styles.ligne, pressed && { backgroundColor: couleurs.s1 }]}
                >
                  <View style={styles.date}>
                    <Texte variante="meta" couleur="t2">
                      {jourCourt(item.debut)}
                    </Texte>
                    <Texte variante="saisie" style={{ fontSize: 17 }}>
                      {jourDuMois(item.debut)}
                    </Texte>
                  </View>
                  <View style={[styles.corps, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Texte variante="exercice" numberOfLines={1}>
                        {item.titre}
                      </Texte>
                      <Texte variante="libelle" couleur="t2">
                        {/* Sans charge (course, padel…), pas de « 0 kg ». */}
                        {dureeCourte(item.dureeMin * 60)}
                        {item.volumeKg > 0 ? `, ${nombre(Math.round(versUnite(item.volumeKg, u)), 0)} ${u}` : ""}
                      </Texte>
                      {/* L'Effort pepfit de la séance (planche effort-pepfit), et la FC moyenne d'une séance vue par Whoop. */}
                      {d?.efforts.get(item.id) != null ? (
                        <Texte variante="meta" couleur="t3" numberOfLines={1}>
                          {d.whoop.get(item.id)?.fcMoy != null
                            ? t("accueil.historique.effortFc", { valeur: texteEffort(d.efforts.get(item.id)!), fc: nombre(d.whoop.get(item.id)!.fcMoy!, 0) })
                            : t("accueil.historique.effort", { valeur: texteEffort(d.efforts.get(item.id)!) })}
                        </Texte>
                      ) : null}
                    </View>
                    {item.nbRecords ? (
                      <View style={styles.records}>
                        <Icone nom="medal" couleur={couleurs.record} taille={16} />
                        <Texte variante="libelle" style={{ color: couleurs.record }}>
                          {pluriel(item.nbRecords, "accueil.historique.record")}
                        </Texte>
                      </View>
                    ) : null}
                    <Icone nom="right" couleur={couleurs.t2} taille={18} />
                  </View>
                </Pressable>
              </GlisserSupprimer>
            </Desintegrable>
          );
        }}
        ListEmptyComponent={
          d ? (
            <Texte variante="libelle" couleur="t2" style={{ marginTop: espace.xxl }}>
              {t("accueil.historique.vide")}
            </Texte>
          ) : undefined
        }
      />
      {annuler.enAttente ? <BandeauAnnuler texte={annuler.enAttente.texte} bas={bas} onAnnuler={() => annuler.annuler().catch(signalerErreur())} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  barres: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 48, marginTop: espace.l },
  barre: { flex: 1, borderRadius: 4 },
  tete: { flexDirection: "row", alignItems: "center", paddingTop: espace.xxl + espace.s, paddingBottom: espace.s },
  ligne: { flexDirection: "row", alignItems: "stretch", borderRadius: rayon.l },
  date: { width: 50, alignItems: "center", justifyContent: "center", marginLeft: -espace.s },
  corps: { flex: 1, flexDirection: "row", alignItems: "center", gap: espace.s, paddingVertical: espace.l, marginLeft: espace.s },
  records: { flexDirection: "row", alignItems: "center", gap: 4 },
});
