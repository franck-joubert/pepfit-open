import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { t, tp } from "../../i18n/index";
import { sante, santeConnect, type PermissionSante } from "../../natif/sante/index";
import { useTheme } from "../../theme";
import { espace } from "../../theme/typo";
import { BarreHaut } from "../../ui/Cadre";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { Texte } from "../../ui/Texte";
import { useApp } from "../../ecrans/contexte";
import { BoutonLigne, GroupeReglages, LigneReglage, SectionReglages } from "../../ecrans/Reglage";
import { SEUILS_RECO, momentDe, type Contexte } from "../../ecrans/reconnaissance";
import {
  ecrireReglageReco, lireActiviteCatalogue, lireHabitudes, lireReglagesReco, oublierChoix, oublierHabitude, type REGLAGES_RECO,
} from "../../db/depots/activites";
import type { Activite } from "../../ecrans/changer-activite";

type Habitude = { act: Activite; n: number; resume: string };

/** Ce que la majorité des choix d'un sport partage : « Mardis soir », sinon « Soir », sinon rien. */
function resumeHabitude(l: readonly Contexte[]): string {
  const majorite = <K,>(f: (c: Contexte) => K): K | null => {
    const n = new Map<K, number>();
    for (const c of l) n.set(f(c), (n.get(f(c)) ?? 0) + 1);
    const [k, v] = [...n.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    return k != null && v / Math.max(1, l.length) >= SEUILS_RECO.MAJORITE ? k : null;
  };
  const jour = majorite((c) => c.jour);
  const moment = majorite((c) => momentDe(c.minute));
  const parts = [jour != null ? t(`activite.jours.${jour}` as "activite.jours.0") : null, moment ? t(`activite.moment.${moment}` as "activite.moment.soir") : null].filter(Boolean);
  const s = parts.join(" ");
  return s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : "";
}

/**
 * Reconnaissance des activités (Préférences › Séance ; planche activite-detectee § 6) : les deux paliers, la FC de la
 * montre (détection sans Whoop), ce que pepfit a appris (chaque habitude s'oublie), tout oublier. Rien ne quitte le téléphone.
 */
export default function Reconnaissance() {
  const { db } = useApp();
  const { couleurs } = useTheme();
  const [r, setR] = useState<{ proposer: boolean; auto: boolean } | null>(null);
  const [habitudes, setHabitudes] = useState<Habitude[]>([]);
  const [fc, setFc] = useState<"absent" | "a-autoriser" | "autorisee">("absent");
  const [choisie, setChoisie] = useState<Habitude | null>(null);
  const [toutOublier, setToutOublier] = useState(false);

  const charger = useCallback(async () => {
    const [reg, h, dispo] = await Promise.all([lireReglagesReco(db), lireHabitudes(db), sante.disponible().catch(() => false)]);
    const l: Habitude[] = [];
    for (const x of h) {
      const act = await lireActiviteCatalogue(db, x.sport);
      if (act) l.push({ act, n: x.n, resume: resumeHabitude(x.contextes) });
    }
    setR(reg);
    setHabitudes(l);
    setFc(!dispo ? "absent" : (await santeConnect.autorisees().catch((): PermissionSante[] => [])).includes("fc-montre") ? "autorisee" : "a-autoriser");
  }, [db]);
  useEffect(() => {
    charger().catch(console.error);
  }, [charger]);

  const regler = (cle: keyof typeof REGLAGES_RECO, v: boolean) => {
    setR((x) => (x ? { ...x, [cle]: v } : x));
    ecrireReglageReco(db, cle, v).catch(console.error);
  };
  const etat = (n: number) =>
    t(n >= SEUILS_RECO.AUTO_N && r?.auto ? "reco.etat.auto" : n >= SEUILS_RECO.SUGGESTION_N ? "reco.etat.suggestion" : "reco.etat.attente");

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("reco.titre")} />
      <ScrollView contentContainerStyle={{ paddingBottom: espace.xxl * 2 }}>
        <View style={{ height: espace.s }} />
        <GroupeReglages>
          <LigneReglage libelle={t("reco.proposer")} sous={t("reco.proposerSous")} interrupteur={r ? { valeur: r.proposer, onChange: (v) => regler("proposer", v) } : undefined} />
          <LigneReglage libelle={t("reco.auto")} sous={t("reco.autoSous")} interrupteur={r ? { valeur: r.auto, onChange: (v) => regler("auto", v) } : undefined} />
        </GroupeReglages>
        {fc !== "absent" ? (
          <GroupeReglages style={{ marginTop: espace.m }}>
            <LigneReglage libelle={t("reco.montre")} sous={t("reco.montreSous")} valeur={fc === "autorisee" ? t("reco.autorisee") : undefined}>
              {fc === "a-autoriser" ? (
                <BoutonLigne
                  libelle={t("reco.autoriser")}
                  onPress={() =>
                    sante
                      .demanderPermissions(["fc-montre"])
                      .then(charger)
                      .catch(console.error)
                  }
                />
              ) : null}
            </LigneReglage>
          </GroupeReglages>
        ) : null}
        <SectionReglages titre={t("reco.appris")} />
        {habitudes.length ? (
          <GroupeReglages>
            {habitudes.map((h) => (
              <LigneReglage
                key={h.act.id}
                libelle={h.act.nom}
                sous={[h.resume, tp("reco.nChoix", h.n)].filter(Boolean).join(", ")}
                valeur={etat(h.n)}
                fin="aucune"
                onPress={() => setChoisie(h)}
              />
            ))}
          </GroupeReglages>
        ) : (
          <Texte variante="corps" couleur="t2" style={{ marginHorizontal: espace.xl, marginTop: espace.xs }}>
            {t("reco.rien")}
          </Texte>
        )}
        {habitudes.length ? (
          <GroupeReglages style={{ marginTop: espace.m }}>
            <LigneReglage icone="trash" danger libelle={t("reco.oublier")} fin="aucune" onPress={() => setToutOublier(true)} />
          </GroupeReglages>
        ) : null}
        <Texte variante="meta" couleur="t2" style={{ marginHorizontal: espace.xl, marginTop: espace.m }}>
          {t("reco.pied")}
        </Texte>
      </ScrollView>
      <Feuille visible={choisie != null} onFermer={() => setChoisie(null)} titre={choisie?.act.nom} sousTitre={choisie?.resume || undefined}>
        <Groupe>
          <Option
            premier
            danger
            icone="trash"
            libelle={t("reco.oublierHabitude")}
            onPress={() => {
              const h = choisie;
              setChoisie(null);
              if (h) oublierHabitude(db, h.act.id).then(charger).catch(console.error);
            }}
          />
        </Groupe>
      </Feuille>
      <Feuille visible={toutOublier} onFermer={() => setToutOublier(false)} titre={t("reco.oublierQuestion")} sousTitre={t("reco.oublierSous")}>
        <Groupe>
          <Option
            premier
            danger
            icone="trash"
            libelle={t("reco.oublier")}
            onPress={() => {
              setToutOublier(false);
              oublierChoix(db).then(charger).catch(console.error);
            }}
          />
          <Option libelle={t("reco.garder")} onPress={() => setToutOublier(false)} />
        </Groupe>
      </Feuille>
    </SafeAreaView>
  );
}
