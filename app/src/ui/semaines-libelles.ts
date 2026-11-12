// Libellés du semainier par semaine (ui/BandeSemaines.tsx) : « Semaine du 19 au 25 octobre 2026 », à cheval sur deux mois
// « … du 26 octobre au 1er novembre 2026 » (mois abrégés quand la forme longue ne tient pas), et le titre de la ligne sous la
// bande (« Cette semaine », « Semaine dernière », « Il y a 3 semaines »). Dates lues dans le fuseau choisi, à midi : un
// changement d'heure dans la semaine ne déplace pas le dimanche. Testé par tests/semainier-semaines.test.ts.
import { t, tp } from "../i18n/index";
import { formater, parties } from "../i18n/temps";

const JOUR = 86_400_000;
/** Midi du `j`-ième jour de la semaine qui commence `lundi` (minuit local). */
const midi = (lundi: number, j: number) => lundi + j * JOUR + JOUR / 2;
const quantieme = (ms: number) => {
  const j = parties(ms).jour;
  return j === 1 ? t("ui.semaines.premier") : String(j);
};

/** « Semaine du 19 au 25 octobre 2026 » ; `court` : mois abrégés (« du 26 oct. au 1er nov. 2026 »). */
export function libelleSemaine(lundi: number, court = false): string {
  const a = midi(lundi, 0);
  const b = midi(lundi, 6);
  const pa = parties(a);
  const pb = parties(b);
  const mois = (ms: number) => formater(ms, { month: court ? "short" : "long" });
  const d1 = quantieme(a);
  const d2 = quantieme(b);
  if (pa.an !== pb.an) return t("ui.semaines.ans", { d1, m1: mois(a), a1: String(pa.an), d2, m2: mois(b), a2: String(pb.an) });
  if (pa.mois !== pb.mois) return t("ui.semaines.mois", { d1, m1: mois(a), d2, m2: mois(b), an: String(pb.an) });
  return t("ui.semaines.meme", { d1, d2, mois: mois(b), an: String(pb.an) });
}

/** Titre de la ligne sous la bande : `avant` semaines avant la semaine en cours. */
export function titreSemaine(avant: number): string {
  if (avant <= 0) return t("ui.semaines.cette");
  if (avant === 1) return t("ui.semaines.derniere");
  return tp("ui.semaines.ilya", avant);
}

/** Mois (AAAA-M) du jeudi de la semaine : celui de la semaine, pour le séparateur de mois (règle ISO). */
export function moisDuJeudi(lundi: number): string {
  const p = parties(midi(lundi, 3));
  return `${p.an}-${p.mois}`;
}
