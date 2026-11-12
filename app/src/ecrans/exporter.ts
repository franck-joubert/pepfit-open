import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { Executeur } from "../db/executeur";
import { exporterCsv, exporterJson } from "../sync/export";
import { t } from "../i18n/index";
import { parties } from "../i18n/temps";

/** Export local (sans compte) : fichier du jour dans le cache, puis la feuille de partage du système. */
export async function exporterDonnees(db: Executeur, format: "json" | "csv") {
  const d = parties(Date.now());
  const jour = `${d.an}-${String(d.mois + 1).padStart(2, "0")}-${String(d.jour).padStart(2, "0")}`;
  const f = new File(Paths.cache, `pepfit-${jour}.${format}`);
  if (f.exists) f.delete();
  f.create();
  f.write(format === "json" ? await exporterJson(db) : await exporterCsv(db));
  await Sharing.shareAsync(f.uri, { mimeType: format === "json" ? "application/json" : "text/csv", dialogTitle: t("compte.exporter") });
}

/** Un texte (CSV…) écrit dans le cache sous ce nom, puis la feuille de partage du système. */
export async function exporterTexte(nom: string, texte: string, mimeType: string, titre: string) {
  const f = new File(Paths.cache, nom);
  if (f.exists) f.delete();
  f.create();
  f.write(texte);
  await Sharing.shareAsync(f.uri, { mimeType, dialogTitle: titre });
}
