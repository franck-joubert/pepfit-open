// La source des zones de FC, écrite sous chaque barre des zones (planche vma-vo2max, D2) : « Réserve cardiaque · FC max 184,
// mesurée · repos 46 », « Tranches de la FC max · 181, d'après ton âge ».
import { t } from "../i18n/index";
import type { Zones } from "./zones-fc";

export function sourceZones(z: Zones): string {
  const src = t(`zones.src.${z.fcMax.source}`);
  return z.methode === "karvonen" && z.fcRepos
    ? t("zones.source.reserve", { max: z.fcMax.bpm, src, repos: z.fcRepos.bpm })
    : t("zones.source.fcmax", { max: z.fcMax.bpm, src });
}
