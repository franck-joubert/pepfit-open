// L'ancienne page Composition est retirée (D2 de la revue finale, 30/10 : une seule page pour le poids, Santé › Poids ;
// la route /sante/composition y mène). Restent l'état de Santé Connect et sa ligne des sources, communs aux pages Santé.
import { t } from "../i18n/index";
import { sante, santeConnect } from "../natif/sante";
import { PERMISSIONS_PAGE_SANTE } from "../natif/sante/logique";
import { autoriserSante } from "./sante-donnees";
import { Ligne } from "./suivi-ui";

/** État de Santé Connect pour la ligne des sources : absent, à autoriser (il manque des lectures), autorisé. */
export async function etatSanteConnect(): Promise<"absente" | "aAutoriser" | "autorisee"> {
  if (!(await sante.disponible().catch(() => false))) return "absente";
  const a = new Set(await santeConnect.autorisees().catch(() => []));
  return PERMISSIONS_PAGE_SANTE.every((p) => a.has(p)) ? "autorisee" : "aAutoriser";
}

/** Ligne « Santé Connect » des sources : autoriser ce qui manque, sinon ouvrir ses réglages. */
export function LigneSanteConnect({ etat, aide, onChange }: { etat: "absente" | "aAutoriser" | "autorisee"; aide: string; onChange: () => void }) {
  return (
    <Ligne
      titre={t("sante.santeConnect")}
      sous={aide}
      valeur={t(`sante.${etat}` as "sante.autorisee")}
      onPress={async () => {
        if (etat === "aAutoriser") await autoriserSante();
        else if (etat === "autorisee") await sante.ouvrirReglages();
        onChange();
      }}
    />
  );
}
