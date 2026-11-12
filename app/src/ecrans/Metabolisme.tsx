// Réglage du métabolisme de base (planche sante-energie § 4, D9, D10) : la valeur retenue en grand, les méthodes à cocher
// (chacune avec sa valeur ; sans ses données, grisée et non cochable), puis la dépense des pas du jour, la digestion, et les
// kcal par pas (Automatique d'après le poids, la taille ou la distance ; Manuel réglé à la roue).
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ecrireReglage } from "../db";
import { t } from "../i18n/index";
import { useLangue } from "../i18n/useLangue";
import { useTheme } from "../theme";
import { espace, police } from "../theme/typo";
import { Texte } from "../ui/Texte";
import { useCharge } from "./contexte";
import { bmrDefaut, choisirBmr, METHODES_BMR, methodeAuto, valeursBmr, type KcalPas, type MethodeBmr, type ModeKcalPas } from "./energie-calc";
import { decaler } from "./energie-precision";
import { kcal, libelleMethode, sousDefaut } from "./FeuilleEnergie";
import { fixe, jourMoisChiffres } from "./composition-vue";
import { approx, nombre } from "./format";
import { FeuilleRoue, plage } from "./nutrition/commun";
import { donneesBmr, jourEnergie, lireReglagesEnergie, nomSource, oublierFormules, REGLAGES_ENERGIE } from "./sante-donnees";
import { Section } from "./sante-ui";
import { EcranSuivi, Filet, Groupe, Ligne } from "./suivi-ui";

const KCAL_PAS = plage(0.02, 0.06, 0.001);
const DIGESTION = plage(5, 20, 1);

export function Metabolisme() {
  useLangue();
  const [x, recharger] = useCharge(async (db) => {
    const t0 = Date.now();
    const r = await lireReglagesEnergie(db);
    return { d: await donneesBmr(db, t0), r, t0, db, e: await jourEnergie(db, decaler(t0, 0), t0, r).catch(() => null) };
  }, [], undefined, "sante/metabolisme");
  const [roue, setRoue] = useState<"kcalPas" | "digestion" | null>(null);
  if (!x) return <EcranSuivi titre={t("sante.metabolisme")}>{null}</EcranSuivi>;
  const { d, r, t0, db, e } = x;
  const v = valeursBmr(d);
  const retenu = choisirBmr(r.methode, d, t0);
  const auto = methodeAuto(d, t0);
  const choisir = async (m: MethodeBmr) => {
    await ecrireReglage(db, REGLAGES_ENERGIE.methode, m);
    await recharger();
  };
  const sous: Record<MethodeBmr, string> = {
    auto: t("sante.methode.autoAide"),
    balance: d.balance ? t("sante.mesureDu", { date: jourMoisChiffres(d.balance.date) }) : t("sante.aucuneBalance"),
    katch: d.maigre ? t("sante.maigreKg", { v: fixe(d.maigre.kg, 1) }) : t("sante.sansMaigre"),
    cunningham: d.maigre ? t("sante.maigreKg", { v: fixe(d.maigre.kg, 1) }) : t("sante.sansMaigre"),
    mifflin: d.profil ? t("sante.profilAide", { kg: fixe(d.profil.kg, 1), cm: nombre(d.profil.cm, 0), age: d.profil.age }) : t("sante.sansProfil"),
    harris: d.profil ? t("sante.profilAide", { kg: fixe(d.profil.kg, 1), cm: nombre(d.profil.cm, 0), age: d.profil.age }) : t("sante.sansProfil"),
  };
  // Automatique a toujours une valeur : faute de tout, l'estimation générale (adulte moyen complété par ce qu'on sait)
  const valeur = (m: MethodeBmr) => (m === "auto" ? (auto === "defaut" ? bmrDefaut(d) : v[auto]) : v[m]);
  const neat = e?.bilan.neat ?? null;
  const pasJour = neat && !neat.defaut ? neat.pasHorsSport + (e?.bilan.sport.seances.reduce((a, s) => a + (s.pas ?? 0), 0) ?? 0) : null;
  const choisirModePas = async (m: ModeKcalPas) => {
    await ecrireReglage(db, REGLAGES_ENERGIE.modeKcalPas, m);
    oublierFormules();
    if (m === "manuel") setRoue("kcalPas");
    await recharger();
  };

  return (
    <EcranSuivi titre={t("sante.metabolisme")} actualiser>
      <View style={styles.actuel}>
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Texte variante="chiffreFort" style={{ lineHeight: 52, letterSpacing: -0.88 }}>
            {kcal(retenu.kcal, retenu.estime)}
          </Texte>
          <Texte variante="corps" couleur="t2" style={{ fontSize: 15, marginLeft: 6 }}>
            {t("sante.kcalParJour")}
          </Texte>
        </View>
        <Texte variante="corps" couleur="t2" style={{ marginTop: 2 }}>
          {retenu.methode === "balance" && d.balance
            ? t("sante.balanceDe", { nom: nomSource(d.balance.origine), date: jourMoisChiffres(d.balance.date) })
            : retenu.methode === "defaut"
              ? sousDefaut(retenu.manques ?? [])
              : t("sante.estimation", { methode: libelleMethode(retenu.methode) })}
        </Texte>
      </View>
      <Section>{t("sante.methode")}</Section>
      <Groupe>
        <View accessibilityRole="radiogroup">
          {METHODES_BMR.map((m, i) => {
            const val = valeur(m);
            const possible = val != null;
            const on = r.methode === m || (r.methode !== "auto" && m === "auto" && !v[r.methode]);
            return (
              <View key={m}>
                {i > 0 ? <Filet /> : null}
                <Choix
                  on={on}
                  possible={possible}
                  onPress={() => choisir(m)}
                  titre={m === "balance" ? libelleMethode("balance", d.balance?.origine) : libelleMethode(m)}
                  sous={sous[m]}
                  valeur={val ? kcal(val.kcal, val.estime) : null}
                />
              </View>
            );
          })}
        </View>
      </Groupe>
      <Section>{t("sante.depenseTitre")}</Section>
      <Groupe>
        <Ligne
          titre={t("sante.pas")}
          sous={neat && pasJour != null && pasJour !== neat.pasHorsSport ? t("sante.pasHorsSeances", { n: nombre(pasJour, 0) }) : undefined}
          valeur={neat ? t("sante.pasDepense", { kcal: kcal(neat.kcal, true), n: nombre(neat.pasHorsSport, 0) }) : undefined}
          doux
          chevron={false}
        />
        <Filet />
        <Ligne titre={t("sante.digestion")} valeur={t("sante.partApports", { n: nombre(r.partDigestion * 100, 0) })} doux onPress={() => setRoue("digestion")} />
      </Groupe>
      <Section>{t("sante.kcalParPas")}</Section>
      <Groupe>
        <View accessibilityRole="radiogroup">
          <Choix
            on={r.modeKcalPas === "auto"}
            onPress={() => choisirModePas("auto")}
            titre={t("sante.kcalPas.auto")}
            sous={sousKcalPasAuto(e?.kcalPas.mode === "auto" ? e.kcalPas : null)}
            lignes={2}
            valeur={e?.kcalPas.mode === "auto" ? approxPas(e.kcalPas) : null}
          />
          <Filet />
          <Choix
            on={r.modeKcalPas === "manuel"}
            onPress={() => choisirModePas("manuel")}
            titre={t("sante.kcalPas.manuel")}
            sous={t("sante.kcalPas.manuelAide", { v: nombre(r.kcalParPas, 3) })}
            valeur={nombre(r.kcalParPas, 3)}
          />
        </View>
      </Groupe>
      <FeuilleRoue
        visible={roue === "kcalPas"}
        titre={t("sante.kcalParPas")}
        valeur={r.kcalParPas}
        valeurs={KCAL_PAS}
        texte={(n) => t("sante.kcalPasValeur", { v: nombre(n, 3) })}
        onFermer={() => setRoue(null)}
        onValider={async (n) => {
          await ecrireReglage(db, REGLAGES_ENERGIE.kcalParPas, String(n));
          oublierFormules();
          setRoue(null);
          await recharger();
        }}
      />
      <FeuilleRoue
        visible={roue === "digestion"}
        titre={t("sante.partDigestion")}
        valeur={Math.round(r.partDigestion * 100)}
        valeurs={DIGESTION}
        texte={(n) => t("sante.partApports", { n: nombre(n, 0) })}
        onFermer={() => setRoue(null)}
        onValider={async (n) => {
          await ecrireReglage(db, REGLAGES_ENERGIE.digestion, String(n / 100));
          setRoue(null);
          await recharger();
        }}
      />
    </EcranSuivi>
  );
}

/** « 0,027 » ; « ~ 0,035 » quand c'est l'estimation faute de poids ou de taille. */
const approxPas = (k: KcalPas) => approx(nombre(k.kcal, 3), k.source === "defaut");

/** Sous-titre de l'Automatique : la valeur et d'où elle vient ; en estimation, ce qu'il faut ajouter. */
function sousKcalPasAuto(k: KcalPas | null): string {
  if (!k) return "";
  const v = nombre(k.kcal, 3);
  if (k.source === "distance") return t("sante.kcalPas.distance", { v });
  if (k.source === "profil") return t("sante.kcalPas.profil", { v });
  return `${t("sante.kcalPas.defaut", { v })}, ${t(k.manque === "poids" ? "sante.kcalPas.ajoutePoids" : "sante.kcalPas.ajouteTaille")}`;
}

/** Ligne à cocher (méthode du métabolisme, mode des kcal par pas) : rond, titre, aide, valeur à droite. */
function Choix(p: { on: boolean; possible?: boolean; onPress: () => void; titre: string; sous: string; valeur: ReactNode; lignes?: number }) {
  const { on, possible = true, onPress, titre, sous, valeur, lignes = 1 } = p;
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled: !possible }}
      disabled={!possible}
      onPress={onPress}
      style={({ pressed }) => [styles.ligne, pressed && { backgroundColor: couleurs.s3 }]}
    >
      <View style={[styles.radio, { borderColor: on ? couleurs.partieSante : couleurs.anneauLibre }]}>
        {on ? <View style={[styles.point, { backgroundColor: couleurs.partieSante }]} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="corps" style={{ fontSize: 15, color: possible ? couleurs.t1 : couleurs.t3, fontFamily: on ? police.medium : police.regular }}>
          {titre}
        </Texte>
        {sous ? (
          <Texte variante="meta" couleur="t2" numberOfLines={lignes} style={{ marginTop: 2 }}>
            {sous}
          </Texte>
        ) : null}
      </View>
      {valeur != null ? (
        <Texte variante="corps" style={{ fontSize: 15, fontFamily: police.medium, color: possible ? couleurs.t1 : couleurs.t3, fontVariant: ["tabular-nums"] }}>
          {valeur}
        </Texte>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actuel: { marginTop: espace.s, marginHorizontal: espace.l },
  ligne: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l, paddingVertical: espace.s },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  point: { width: 10, height: 10, borderRadius: 5 },
});
