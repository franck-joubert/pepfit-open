// Lectures de la page Santé (une par groupe de cartes) et synchro de fond (sante-charge.ts), sans rien de l'écran : la page
// les lit à chaque visite, et le lancement de l'appli les précharge (prechargerSante) pour que la première ouverture de
// Santé montre ses cartes tout de suite. Mesures : docs/SANTE-VITESSE.md.
import type { SQLiteDatabase } from "expo-sqlite";
import type { Executeur } from "../db/executeur";
import { retenirMorphologie } from "./morphologie";
import { lireReglage } from "../db/depots/reglages";
import { REGLAGE } from "../whoop/constantes";
import { dernierJourWhoop, joursWhoop, type JourWhoopLu } from "../whoop/lecture";
import { synchroniserSiBesoin } from "../whoop/index";
import { synchroniserSiBesoin as synchroniserWithingsSiBesoin } from "../withings/index";
import { synchroniserSiBesoin as synchroniserPolarSiBesoin } from "../polar/index";
import { CLE_MEMOIRE, lireMemoire } from "../precision/memoire";
import { chargerSante, enMemoire, oublierMemoire } from "./sante-charge";
import { decaler, donneesPage, etatEnergie, importerSante } from "./sante-donnees";
import { instantDe, jourDe } from "./planif-donnees";
import { lireResumeEffort, lireResumeRecup } from "./mesures/scores-donnees";
import { assurerNuitsRecup } from "./recup-donnees";
import { depsNuitsAppareil, depsRecupAppareil } from "./recup-appareil";
import { assurerImportsRecup } from "./recuperer-donnees";
import { lireAgeVite, lireResumeAge, resumeAge, type ResumeAge } from "./mesures/age-donnees";
import { lireVo2 } from "./mesures/vo2-donnees";
import { assurerCycleSante, lireCycle } from "../cycle/donnees";
import { lireReglesAppareil } from "./cycle/cycle-appareil";

/** Minuit local d'un jour AAAA-MM-JJ. */
export const minuitDe = (j: string) => decaler(instantDe(j, "12:00"), 0);
/** Lecture ratée : journalisée, la case reste vide. */
const sansDonnee = (e: unknown): null => (console.error(e), null);

/** Âge pepfit d'un jour passé gardé 10 min (un an d'historique relu) ; oublié quand la synchro apporte du neuf. */
const AGE_VALIDE_MS = 10 * 60_000;

/** Les lectures de la page, une par groupe de cartes (une lecture ratée laisse sa case vide, et se journalise : revue finale
 * n° 16), et la synchro de fond d'aujourd'hui. */
export function lecteursSante(db: Executeur, date: string, jour: number, passe: boolean) {
  const fin = () => (passe ? decaler(jour, 1) - 1 : Date.now());
  return {
    parties: {
      cases: () => donneesPage(db, fin(), passe),
      energie: () => etatEnergie(db, jour).catch(sansDonnee),
      whoop: () => (passe ? joursWhoop(db, jour, jour).then((m) => m.get(jour) ?? null) : dernierJourWhoop(db)).catch(sansDonnee) as Promise<JourWhoopLu | null>,
      whoopConnecte: () => lireReglage(db, REGLAGE.connecte).then((v) => v === "1", () => false),
      recup: () => lireResumeRecup(db, fin()).catch(sansDonnee),
      effort: () => lireResumeEffort(db, fin()).catch(sansDonnee),
      // aujourd'hui : l'âge gardé dans la base tout de suite, recalculé en fond s'il le faut (nouvelle semaine, saisie,
      // synchro sur des semaines déjà comptées : age-donnees.ts) ; un jour passé : calculé, gardé 10 min en mémoire
      age: (reposer: (r: ResumeAge | null) => void) =>
        (passe
          ? enMemoire(`age:${date}`, AGE_VALIDE_MS, () => lireResumeAge(db, fin()))
          : lireAgeVite(db, (d) => reposer(resumeAge(d))).then(resumeAge)
        ).catch(sansDonnee),
      // VO2max (planche vma-vo2max, D1) : l'état d'aujourd'hui ; un jour passé n'en a pas.
      vo2: () => (passe ? Promise.resolve(null) : lireVo2(db).catch(sansDonnee)),
      // Suivi du cycle (planche cycle, D3) : null si le suivi est éteint (pas de carte) ; le jour choisi
      cycle: () => lireCycle(db, date).catch(sansDonnee),
      // l'âge ouvert ou non à la dernière précision calculée (null : jamais calculée) : la case Âge n'attend pas le calcul
      // de la précision (3 à 5 s au lancement à froid sur l'émulateur), qui la corrige ensuite
      ageOuvertAvant: () => lireReglage(db, CLE_MEMOIRE).then((m) => lireMemoire(m)?.lectures.includes("age") ?? null, () => null),
    },
    // un jour passé relit la base : l'import et la synchro ont lieu à l'ouverture (aujourd'hui). Santé Connect d'abord
    // (mesures de la balance, VFC, FC), puis Whoop, Withings et Polar ; un échec (hors ligne) est journalisé, sans feuille d'erreur
    // à chaque visite.
    rafraichir: passe
      ? undefined
      : async () => {
          const importees = await importerSante(db).catch((e: unknown) => (console.error(e), 0));
          const synchros = await Promise.all([
            synchroniserSiBesoin(db).catch(nonSynchro),
            synchroniserWithingsSiBesoin(db).catch(nonSynchro),
            synchroniserPolarSiBesoin(db).catch(nonSynchro),
          ]);
          // les siestes et les activités de récupération de Santé Connect (recuperer-donnees.ts), puis les nuits de la
          // Récupération, après Santé Connect, Whoop et Polar (recup-donnees.ts)
          await depsRecupAppareil()
            .then((deps) => assurerImportsRecup(db, deps))
            .catch((e: unknown) => console.error(e));
          const nuits = await depsNuitsAppareil()
            .then((deps) => assurerNuitsRecup(db, deps, true))
            .catch((e: unknown) => (console.error(e), 0));
          // les règles de Santé Connect (suivi du cycle allumé, source allumée, autorisation déjà donnée : jamais demandée ici)
          const regles = await assurerCycleSante(db, lireReglesAppareil).catch((e: unknown) => (console.error(e), 0));
          const neuf = importees > 0 || synchros.some(Boolean) || nuits > 0 || regles > 0;
          if (neuf) oublierMemoire();
          return neuf;
        },
  };
}
const nonSynchro = (e: unknown) => (console.error(e), false);
export type DonneesSante = { [K in keyof ReturnType<typeof lecteursSante>["parties"]]: Awaited<ReturnType<ReturnType<typeof lecteursSante>["parties"][K]>> };

/** Dernières valeurs lues, par jour (AAAA-MM-JJ) : Santé monté (ou remonté) les montre tout de suite, puis les relit. */
export const memoireSante = new Map<string, Partial<DonneesSante>>();

/** Garde une valeur lue, pour le prochain montage de Santé. */
export function retenirSante<K extends keyof DonneesSante>(date: string, k: K, v: DonneesSante[K]): void {
  memoireSante.set(date, { ...memoireSante.get(date), [k]: v });
}

/** Lancement de l'appli : les cartes d'aujourd'hui lues dans la base (ni Santé Connect ni réseau : la page les fera), la
 * morphologie (corps, Poids), et l'Âge pepfit gardé vérifié (recalculé en fond s'il le faut). */
export function prechargerSante(db: SQLiteDatabase): Promise<void> {
  const date = jourDe(Date.now());
  const { parties } = lecteursSante(db, date, minuitDe(date), false);
  // le corps et la case Poids viennent de la morphologie (morphologie.ts)
  return Promise.all([chargerSante<DonneesSante>({ parties }, (k, v) => retenirSante(date, k, v)), retenirMorphologie(db)]).then(() => {});
}
