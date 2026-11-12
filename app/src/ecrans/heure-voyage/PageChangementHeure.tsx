// Le plan du changement d'heure (planche sommeil, c2) : la nuit qui saute, 20 min par soir du jeudi au dimanche, la
// lumière, le dîner, la sieste. Les heures partent du rythme des 7 dernières nuits ; sans lui, le décalage seul.
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { lireActif, minuscule, t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { police } from "../../theme/typo";
import { Texte } from "../../ui/Texte";
import { useCharge } from "../contexte";
import { BlocVide, Groupe, LigneMesure, Lignes, MARGE, Note, PageMesure, TitreGroupe, useMesure } from "../mesures/gabarit";
import { ajouterJ } from "../planification";
import { TuileIcone } from "./BandeauHeure";
import { type Changement, type LigneChangement, PAS_MIN, planChangement, prochainChangement } from "./changement-heure";
import { lireRythme } from "./donnees";
import { duree, heureMin, heurePile, instantDans, jourCourt, jourDans, jourSemaineLong } from "./horloge";

/** « − 20 min », « + 40 min ». */
export const signe = (d: number): string => `${d < 0 ? "−" : "+"} ${duree(d)}`;

/** En-tête d'un événement (planche : .evt) : un titre de 24 et une phrase. */
export function Evenement({ titre, texte }: { titre: string; texte: string }) {
  return (
    <View style={styles.evt}>
      <Texte accessibilityRole="header" style={styles.evtTitre}>
        {titre}
      </Texte>
      <Texte couleur="t2" style={styles.evtTexte}>
        {texte}
      </Texte>
    </View>
  );
}

/** Ligne d'un plan : la valeur du soir en accent (planche : .lm.auj). */
export function LignePlan({ titre, sous, valeur, sousValeur, ceSoir }: { titre: string; sous: string; valeur: string; sousValeur?: string; ceSoir?: boolean }) {
  const m = useMesure();
  return (
    <View style={styles.ligne} accessible accessibilityLabel={[titre, sous, valeur, sousValeur].filter(Boolean).join(", ")}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="corps" style={{ fontSize: 15 }}>
          {titre}
        </Texte>
        <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>
          {sous}
        </Texte>
      </View>
      <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
        <Texte style={[styles.valeur, ceSoir && { color: m.fort }]}>{valeur}</Texte>
        {sousValeur ? (
          <Texte variante="meta" couleur="t3" style={{ marginTop: 2 }}>
            {sousValeur}
          </Texte>
        ) : null}
      </View>
    </View>
  );
}

function sousLigne(l: LigneChangement, nom: string): string {
  const lendemain = jourCourt(ajouterJ(l.jour, 1));
  if (l.lever == null) return t(l.fin ? "heureVoyage.leverFinSans" : "heureVoyage.sansRythmeLigne");
  const p = { jour: lendemain, heure: heureMin(l.lever) };
  if (l.fin) return t("heureVoyage.leverFin", p);
  return l.nouvelle ? t("heureVoyage.leverNouvelle", { ...p, nom: minuscule(nom) }) : t("heureVoyage.leverLe", p);
}

export function PageChangementHeure() {
  useLangue();
  const maintenant = useMemo(() => Date.now(), []);
  const z = lireActif().fuseau;
  const auj = jourDans(maintenant, z);
  const c = useMemo(() => prochainChangement(instantDans(auj, 0, z), z, 62), [auj, z]);
  const [rythme] = useCharge((db) => lireRythme(db, maintenant), []);
  const nom = t(c?.ete === false ? "heureVoyage.hiver" : "heureVoyage.ete");
  return (
    <PageMesure titre={nom}>
      {!c ? (
        <BlocVide titre={t("heureVoyage.aucunChangementTitre")} texte={t("heureVoyage.aucunChangementTexte")} />
      ) : (
        <Contenu c={c} rythme={rythme} auj={auj} nom={nom} />
      )}
    </PageMesure>
  );
}

function Contenu({ c, rythme, auj, nom }: { c: Changement; rythme: Awaited<ReturnType<typeof lireRythme>> | undefined; auj: string; nom: string }) {
  const plan = planChangement(c, rythme ?? null);
  const amp = Math.abs(c.delta);
  const p = { avant: heurePile(c.heureAvant), apres: heurePile(c.heureApres), d: amp === 60 ? t("heureVoyage.uneHeure") : duree(amp) };
  const j1 = minuscule(jourSemaineLong(plan[0]!.jour));
  const j2 = minuscule(jourSemaineLong(plan[1]!.jour));
  const jour = jourSemaineLong(c.jour);
  return (
    <>
      <Evenement titre={`${jour} ${jourCourt(c.jour, { semaine: false, mois: true })}`} texte={t(c.ete ? "heureVoyage.evtMoins" : "heureVoyage.evtPlus", p)} />
      {rythme === null ? <BlocVide titre={t("heureVoyage.sansRythmeTitre")} texte={t("heureVoyage.sansRythmeTexte")} /> : null}
      <TitreGroupe>{c.ete ? t("heureVoyage.planEte", { d: duree(PAS_MIN) }) : t("heureVoyage.planHiver", { d: duree(PAS_MIN), j1, j2 })}</TitreGroupe>
      <Groupe>
        <Lignes>
          {plan.map((l) => {
            const ceSoir = l.jour === auj;
            const titre = jourCourt(l.jour, { capitale: true });
            const ecart = l.fin ? t("heureVoyage.tonHeure") : signe(l.decalage);
            return (
              <LignePlan
                key={l.jour}
                titre={ceSoir ? t("heureVoyage.ceSoirLigne", { jour: titre }) : titre}
                sous={sousLigne(l, nom)}
                valeur={l.coucher != null ? heureMin(l.coucher) : ecart}
                sousValeur={l.coucher != null ? ecart : undefined}
                ceSoir={ceSoir}
              />
            );
          })}
        </Lignes>
      </Groupe>
      <TitreGroupe>{t("heureVoyage.etAussi")}</TitreGroupe>
      <Groupe>
        <Lignes>
          {[
            <LigneMesure
              key="lumiere"
              avant={<TuileIcone nom="soleil" />}
              titre={c.ete ? t("heureVoyage.lumiereEte", { jour }) : t("heureVoyage.lumiereHiver")}
              sous={t(c.ete ? "heureVoyage.lumiereEteSous" : "heureVoyage.lumiereHiverSous")}
            />,
            <LigneMesure
              key="diner"
              avant={<TuileIcone nom="assiette" />}
              titre={c.ete ? t("heureVoyage.dinerEte") : t("heureVoyage.dinerHiver", { j1, j2 })}
              sous={t("heureVoyage.dinerSous")}
            />,
            <LigneMesure key="sieste" avant={<TuileIcone nom="lune" />} titre={t("heureVoyage.siesteCourte", { jour })} sous={t("heureVoyage.siesteCourteSous")} />,
          ]}
        </Lignes>
      </Groupe>
      <Note style={{ marginHorizontal: MARGE }}>{t("heureVoyage.noteChangement")}</Note>
    </>
  );
}

export const styles = StyleSheet.create({
  evt: { marginTop: 4, marginHorizontal: MARGE },
  evtTitre: { fontFamily: police.semibold, fontSize: 24, lineHeight: 30, letterSpacing: -0.36 },
  evtTexte: { fontSize: 13.5, lineHeight: 19.5, marginTop: 4, fontVariant: ["tabular-nums"] },
  ligne: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: 16 },
  valeur: { fontFamily: police.medium, fontSize: 15, fontVariant: ["tabular-nums"] },
});
