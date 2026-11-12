import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ecritParDefaut, lusParDefaut } from "../../agenda/calcul";
import { lireReglagesAgenda } from "../../agenda/depot";
import { agendaLocal, changerAgendas, connecter } from "../../agenda/synchro";
import { t, tp } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import * as natif from "../../natif/agenda";
import { useTheme } from "../../theme";
import { espace } from "../../theme/typo";
import { BarreHaut } from "../../ui/Cadre";
import { BoutonPrincipal } from "../../ui/Degrade";
import { Icone } from "../../ui/Icone";
import { Texte } from "../../ui/Texte";
import { useApp } from "../contexte";
import { Radio } from "../../ui/Radio";
import { GroupeReglages, SectionReglages } from "../Reglage";
import { annonceAgenda, compteDe, sousDe } from "./vue";

// Agendas (planche agenda-ics, 3c ; D9, D10) : cases pour ceux qui comptent quand tu es pris, ronds pour celui où pepfit écrit.
// Défauts : tous sauf anniversaires, jours fériés et abonnements en lecture ; l'agenda principal (Perso) en écriture.
// « Ce téléphone seulement » : un agenda local créé par pepfit au moment de connecter.

/** Choix d'écriture : un agenda d'Android, ou l'agenda local de pepfit (créé au besoin). */
const LOCAL = "local";

export function PageAgendas() {
  useLangue();
  const { db } = useApp();
  const { couleurs } = useTheme();
  const bas = useSafeAreaInsets().bottom;
  const [cals, setCals] = useState<natif.Calendrier[] | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [deja, setDeja] = useState(false);
  const [lus, setLus] = useState<string[]>([]);
  const [ecrit, setEcrit] = useState("");
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    (async () => {
      const [r, l] = await Promise.all([lireReglagesAgenda(db), natif.calendriers()]);
      // L'agenda local de pepfit n'est pas proposé en lecture : il ne porte que ses séances.
      const autres = l.filter((c) => c.id !== r.local);
      setLocal(r.local);
      setCals(autres);
      setDeja(r.connecte);
      setLus(r.connecte ? r.lus.filter((id) => autres.some((c) => c.id === id)) : lusParDefaut(autres));
      setEcrit(r.connecte && r.ecrit ? (r.ecrit === r.local ? LOCAL : r.ecrit) : (ecritParDefaut(autres.filter((c) => !c.local)) ?? LOCAL));
    })().catch(console.error);
  }, [db]);

  const basculer = (id: string) => setLus((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  const valider = async () => {
    if (occupe || !cals) return;
    setOccupe(true);
    try {
      const cible = ecrit === LOCAL ? await agendaLocal(db) : ecrit;
      const ordre = cals.filter((c) => lus.includes(c.id)).map((c) => c.id);
      if (deja) await changerAgendas(db, ordre, cible);
      else {
        const issue = await connecter(db, ordre, cible);
        const nom = ecrit === LOCAL ? t("agenda.cal.local") : (cals.find((c) => c.id === cible)?.titre ?? "");
        annonceAgenda.texte = issue.genre === "ok" ? tp("agenda.bandeau.connecte", issue.ecrites, { agenda: nom }) : null;
      }
      if (router.canGoBack()) router.back();
    } catch (e) {
      console.error(e);
      setOccupe(false);
    }
  };

  const ecrivables = (cals ?? []).filter((c) => c.modifiable && !c.local);
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: couleurs.bg }}>
      <BarreHaut titre={t("agenda.agendas.titre")} />
      <ScrollView contentContainerStyle={{ paddingBottom: espace.l }}>
        {cals ? (
          <>
            <SectionReglages titre={t("agenda.choix.lus")} premiere />
            <GroupeReglages>
              {cals.length ? (
                cals.map((c, i) => <Case key={c.id} c={c} coche={lus.includes(c.id)} onPress={() => basculer(c.id)} />)
              ) : (
                <Texte variante="corps" couleur="t3" style={{ padding: espace.l }}>
                  {t("agenda.choix.aucunLu")}
                </Texte>
              )}
            </GroupeReglages>
            <SectionReglages titre={t("agenda.choix.ecrit")} />
            <GroupeReglages>
              {ecrivables.map((c, i) => (
                <Radio key={c.id} libelle={c.titre} sous={sousDe(c, local)} pastille={c.couleur ?? ""} choisi={ecrit === c.id} onPress={() => setEcrit(c.id)} />
              ))}
              <Radio libelle={t("agenda.cal.local")} sous={t("agenda.cal.localSous")} choisi={ecrit === LOCAL} onPress={() => setEcrit(LOCAL)} />
            </GroupeReglages>
          </>
        ) : null}
      </ScrollView>
      <View style={{ paddingHorizontal: espace.l, paddingTop: espace.s, paddingBottom: bas + espace.l }}>
        <BoutonPrincipal libelle={t(deja ? "agenda.choix.valider" : "agenda.choix.connecter")} onPress={() => void valider()} desactive={!cals || !ecrit || occupe} />
      </View>
    </SafeAreaView>
  );
}

/** Case de la planche (3c) : 22 px, rayon 6 ; cochée, pleine et coche couleur du fond ; la pastille de l'agenda à droite. */
function Case({ c, coche, premier, onPress }: { c: natif.Calendrier; coche: boolean; premier?: boolean; onPress: () => void }) {
  const { couleurs } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: coche }}
      accessibilityLabel={`${c.titre}, ${compteDe(c)}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.ligne,
        !premier && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line2 },
        pressed && { backgroundColor: couleurs.s3 },
      ]}
    >
      <View style={[styles.case, coche ? { backgroundColor: couleurs.t1, borderColor: couleurs.t1 } : { borderColor: couleurs.t3 }]}>
        {coche ? <Icone nom="check" couleur={couleurs.bg} taille={15} epaisseur={2.6} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Texte variante="saisie" numberOfLines={1} style={{ fontSize: 15 }}>
          {c.titre}
        </Texte>
        <Texte variante="meta" couleur="t3" numberOfLines={1} style={{ marginTop: 2 }}>
          {compteDe(c)}
        </Texte>
      </View>
      {c.couleur ? <View style={[styles.pastille, { backgroundColor: c.couleur }]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ligne: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: espace.m, paddingHorizontal: espace.l, paddingVertical: espace.s },
  case: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  pastille: { width: 10, height: 10, borderRadius: 5 },
});
