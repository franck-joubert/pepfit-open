// Feuille « Ajouter des poids libres » (planche materiel a1, a2) : les six types, rien de pré-rempli ; un type ouvre sa feuille.
import type { GenreMateriel } from "../../db/materiel";
import { t } from "../../i18n/index";
import { useLangue } from "../../i18n/useLangue";
import { Feuille, Groupe, Option } from "../../ui/Feuille";
import { EnteteFeuille } from "./briques";

const ORDRE: readonly GenreMateriel[] = ["halteres", "reglables", "kettlebell", "barre", "disques", "leste"];

export function FeuilleAjout({ visible, onFermer, onChoisir }: { visible: boolean; onFermer: () => void; onChoisir: (g: GenreMateriel) => void }) {
  useLangue();
  return (
    <Feuille visible={visible} onFermer={onFermer}>
      <EnteteFeuille titre={t("materiel.ajouterLibres")} />
      <Groupe>
        {ORDRE.map((g, i) => (
          <Option key={g} premier={i === 0} libelle={t(`materiel.genre.${g}`)} aide={t(`materiel.ajout.${g}`)} chevron onPress={() => onChoisir(g)} />
        ))}
      </Groupe>
    </Feuille>
  );
}
