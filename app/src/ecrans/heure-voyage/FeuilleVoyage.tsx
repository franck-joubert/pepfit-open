// Saisie d'un voyage à la main (planche sommeil, D13 : « saisie à la main, non dessinée ») : destination (le fuseau, avec
// recherche), jour du départ, jour du retour s'il est connu. Une feuille à la fois : la destination et les dates ouvrent la
// leur à la place.
import { useEffect, useState } from "react";
import { villeDuFuseau } from "../../i18n/fuseaux";
import { lireDetecte, t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { Bouton } from "../../ui/Bouton";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { RoueDuree } from "../../ui/RoueDuree";
import { ajouterJ, ecartJ } from "../planification";
import { FeuilleFuseau } from "../SectionRegion";
import { jourCourt } from "./horloge";
import type { Voyage } from "./voyage";

type Sous = "destination" | "aller" | "retour" | null;
const JOURS_ALLER = Array.from({ length: 366 }, (_, i) => i);
const JOURS_RETOUR = Array.from({ length: 121 }, (_, i) => i);

export function FeuilleVoyage({
  visible,
  voyage,
  maison,
  aujourdhui,
  onFermer,
  onEnregistrer,
  onSupprimer,
}: {
  visible: boolean;
  voyage: Voyage | null;
  maison: string | null;
  /** Jour de chez soi (AAAA-MM-JJ). */
  aujourdhui: string;
  onFermer: () => void;
  onEnregistrer: (v: Voyage) => void;
  onSupprimer: () => void;
}) {
  useLangue();
  const [destination, setDestination] = useState<string | null>(null);
  const [aller, setAller] = useState(aujourdhui);
  const [retour, setRetour] = useState<string | null>(null);
  const [sous, setSous] = useState<Sous>(null);
  const [roue, setRoue] = useState(0);
  useEffect(() => {
    if (!visible) return;
    setDestination(voyage?.destination ?? null);
    setAller(voyage && voyage.aller >= aujourdhui ? voyage.aller : ajouterJ(aujourdhui, voyage ? 0 : 7));
    setRetour(voyage?.retour ?? null);
    setSous(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const origine = maison ?? lireDetecte().fuseau;
  const ouvrir = (s: Sous) => {
    setRoue(s === "aller" ? decalage(aujourdhui, aller) : retour ? decalage(aller, retour) : 0);
    setSous(s);
  };
  const enregistrer = () => {
    if (!destination) return;
    onEnregistrer({ destination, origine, aller, retour: retour && retour > aller ? retour : null, preparer: voyage?.preparer ?? true, auto: false });
  };

  return (
    <>
      <Feuille
        visible={visible && sous === null}
        onFermer={onFermer}
        titre={t("heureVoyage.feuilleTitre")}
        pied={destination ? <Bouton libelle={t("heureVoyage.enregistrer")} variante="primaire" large onPress={enregistrer} /> : null}
      >
        <Groupe>
          <Option premier libelle={t("heureVoyage.destination")} valeur={destination ? villeDuFuseau(destination) : t("heureVoyage.choisir")} chevron onPress={() => setSous("destination")} />
          <Option libelle={t("heureVoyage.depart")} valeur={jourCourt(aller, { mois: true })} chevron onPress={() => ouvrir("aller")} />
          <Option libelle={t("heureVoyage.retour")} valeur={retour ? jourCourt(retour, { mois: true }) : t("heureVoyage.retourInconnu")} chevron onPress={() => ouvrir("retour")} />
        </Groupe>
        {voyage ? (
          <Groupe>
            <Option premier libelle={t("heureVoyage.supprimer")} icone="trash" danger onPress={onSupprimer} />
          </Groupe>
        ) : null}
      </Feuille>
      <FeuilleFuseau
        visible={visible && sous === "destination"}
        onFermer={() => setSous(null)}
        onChoisir={(z) => {
          if (z !== "auto") setDestination(z);
          setSous(null);
        }}
        fuseau={destination ?? "auto"}
        detecte={origine}
        sansAuto
        titre={t("heureVoyage.destination")}
      />
      <Feuille
        visible={visible && (sous === "aller" || sous === "retour")}
        onFermer={() => setSous(null)}
        titre={sous === "retour" ? t("heureVoyage.retour") : t("heureVoyage.depart")}
        glisserContenu={false}
        pied={
          <Bouton
            libelle={t("heureVoyage.choisirDate")}
            variante="primaire"
            large
            onPress={() => {
              if (sous === "aller") {
                const a = ajouterJ(aujourdhui, roue);
                setAller(a);
                if (retour && retour <= a) setRetour(null);
              } else setRetour(roue > 0 ? ajouterJ(aller, roue) : null);
              setSous(null);
            }}
          />
        }
      >
        {sous === "aller" ? (
          <RoueDuree
            key="aller"
            libelle={t("heureVoyage.depart")}
            valeur={roue}
            onChange={setRoue}
            valeurs={JOURS_ALLER}
            decoupe={(v) => ({ attenue: "", plein: v === 0 ? t("heureVoyage.aujourdhui") : jourCourt(ajouterJ(aujourdhui, v), { mois: true }) })}
            lue={(v) => jourCourt(ajouterJ(aujourdhui, v), { mois: true })}
            traits={false}
          />
        ) : sous === "retour" ? (
          <RoueDuree
            key="retour"
            libelle={t("heureVoyage.retour")}
            valeur={roue}
            onChange={setRoue}
            valeurs={JOURS_RETOUR}
            decoupe={(v) => ({ attenue: "", plein: v === 0 ? t("heureVoyage.sansRetour") : jourCourt(ajouterJ(aller, v), { mois: true }) })}
            lue={(v) => (v === 0 ? t("heureVoyage.sansRetour") : jourCourt(ajouterJ(aller, v), { mois: true }))}
            traits={false}
          />
        ) : null}
      </Feuille>
    </>
  );
}

const decalage = (de: string, a: string) => Math.max(0, ecartJ(de, a));
