import { useEffect, useState } from "react";
import { signalerErreur } from "../ui/FeuilleMessage";
import { useApp } from "./contexte";
import { FeuilleHoraires } from "./FeuilleHoraires";
import { ecrireHoraires, effetHoraires, lireHoraires, retablirHoraires, type CibleHoraires, type LectureHoraires } from "./horaires-donnees";
import type { Champ, Horaires } from "./horaires";

/**
 * « Horaires » d'une activité de la base (séance, récupération, nuit) : lit ses horaires à l'ouverture, dit l'effet d'un changement
 * de jour, écrit, rétablit. `onModifie` : l'appelant relit son écran. La séance en cours de fin (pas encore enregistrée) utilise
 * FeuilleHoraires directement.
 */
export function FeuilleHorairesActivite({
  visible,
  onFermer,
  cible,
  titre,
  champ,
  onModifie,
}: {
  visible: boolean;
  onFermer: () => void;
  cible: CibleHoraires;
  /** Le nom de l'activité, en sous-titre. */
  titre: string;
  /** La ligne ouverte à l'ouverture (Début par défaut). */
  champ?: Champ;
  onModifie?: () => void;
}) {
  const { db } = useApp();
  const [lecture, setLecture] = useState<LectureHoraires | null>(null);
  const cle = cible.genre === "nuit" ? `nuit:${cible.nuit.cle ?? cible.nuit.jour}:${cible.nuit.debut}:${cible.nuit.fin}` : `${cible.genre}:${cible.id}`;
  useEffect(() => {
    if (!visible) return;
    let vivant = true;
    setLecture(null);
    lireHoraires(db, cible).then(
      (l) => vivant && (l ? setLecture(l) : onFermer()),
      () => vivant && onFermer(),
    );
    return () => {
      vivant = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, cle, db]);

  const fin = () => {
    onFermer();
    onModifie?.();
  };
  return (
    <FeuilleHoraires
      visible={visible}
      onFermer={onFermer}
      titre={titre}
      champ={champ}
      lecture={lecture}
      effet={(apres: Horaires) => effetHoraires(db, cible, apres)}
      onValider={(h) =>
        ecrireHoraires(db, cible, h).then((refus) => {
          // la feuille refuse avant : un refus ici veut dire que la base a changé entre-temps, la feuille reste ouverte
          if (!refus) fin();
        }, signalerErreur())
      }
      onRetablir={lecture?.original ? () => retablirHoraires(db, cible).then(fin, signalerErreur()) : undefined}
    />
  );
}
