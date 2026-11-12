import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { chargerCatalogue, type Catalogue } from "../src/db/catalogue.ts";
import { avecExclusivite } from "../src/db/exclusif.ts";
import type { Executeur } from "../src/db/executeur.ts";
import { migrer } from "../src/db/migrations.ts";

type P = (string | number | null)[];

export function adapter(db: DatabaseSync): Executeur {
  return {
    execAsync: async (sql: string) => void db.exec(sql),
    runAsync: async (sql: string, p: P) => db.prepare(sql).run(...p),
    getFirstAsync: async <T>(sql: string, p: P) => ((db.prepare(sql).get(...p) as T | undefined) ?? null),
    getAllAsync: async <T>(sql: string, p: P) => db.prepare(sql).all(...p) as T[],
    // Comme expo-sqlite : un BEGIN refusé (transaction déjà ouverte par une autre tâche) passe aussi par le ROLLBACK, qui
    // annule alors la transaction de l'autre tâche.
    withTransactionAsync: async (t: () => Promise<void>) => {
      try {
        db.exec("BEGIN");
        await t();
        db.exec("COMMIT");
      } catch (e) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // déjà annulée
        }
        throw e;
      }
    },
  };
}

export function catalogue(): Catalogue {
  return JSON.parse(readFileSync(new URL("../assets/catalogue/exercices.json", import.meta.url), "utf8")) as Catalogue;
}

/** Contexte asynchrone des tests : un appel à la façade fait depuis une de ses transactions échoue tout de suite. */
const contexteTest = new AsyncLocalStorage<unknown>();

/** La façade de l'appli (db/exclusif.ts), avec la détection des appels faits depuis une transaction. */
export const facade = <T extends Executeur>(db: T, attenteMs?: number): T => avecExclusivite(db, { contexte: contexteTest, attenteMs });

/** Lance `f` hors de toute transaction (comme un geste de l'écran), même depuis un rappel appelé dans l'une d'elles. */
export const horsTransaction = <R>(f: () => R): R => contexteTest.exit(f);

/**
 * Base en mémoire, migrée ; avec `avecCatalogue`, le catalogue complet est chargé. `db` est la façade, comme celle de
 * l'appli (db/index.ts) ; `brute` la connexion sans façade.
 */
export async function baseDeTest(avecCatalogue = false) {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  const brute = adapter(raw);
  await migrer(brute);
  if (avecCatalogue) await chargerCatalogue(brute, catalogue());
  return { raw, db: facade(brute), brute };
}

/** Jour J à 18 h (heure locale), en ms. */
export function jour(annee: number, mois: number, j: number, h = 18, min = 0): number {
  return new Date(annee, mois - 1, j, h, min).getTime();
}

/**
 * Ce que le serveur lit en clair dans des changements reçus : chaque `charge` sans son bloc chiffré `_s`. Chercher un
 * secret dans tout le JSON (bloc chiffré compris) donnait de faux échecs : le base64 du chiffré contient une suite donnée
 * de 4 lettres par hasard (« qvbn » : ~0,9 % des passages avec le catalogue, mesuré le 27/10).
 */
export function vuEnClair(lignes: Iterable<{ tab: string; cle: string; charge: string | null }>): string {
  return JSON.stringify(
    [...lignes].map((c) => {
      if (!c.charge) return c;
      const { _s: _, ...clair } = JSON.parse(c.charge) as Record<string, unknown>;
      return { ...c, charge: clair };
    }),
  );
}

/**
 * Le secret est-il dans ce que le serveur lit en clair (vuEnClair) ? Un secret fait de chiffres seulement (« 539 » kcal)
 * se cherche comme un nombre entier : jamais collé à une lettre ou à un chiffre. Sinon, les millisecondes de Date.now()
 * (hlc, cree_le) ou un identifiant hexadécimal le contiennent par hasard : faux échec de l'aller-retour de la synchro
 * complète, reproduit avec une horloge à 1762539000000.
 */
export function dansLeClair(vu: string, secret: string): boolean {
  if (!/^\d+$/.test(secret)) return vu.includes(secret);
  return new RegExp(`(?<![0-9A-Za-z])${secret}(?![0-9A-Za-z])`).test(vu);
}

/** Les colonnes sensibles d'une table ne sont jamais dans le clair d'un changement, et le bloc chiffré est là. */
export function sensiblesChiffrees(lignes: Iterable<{ tab: string; charge: string | null }>, tab: string, sensibles: readonly string[]): number {
  let n = 0;
  for (const c of lignes) {
    if (c.tab !== tab || !c.charge) continue;
    const charge = JSON.parse(c.charge) as Record<string, unknown>;
    for (const s of sensibles) if (s in charge) throw new Error(`${tab}.${s} en clair`);
    if (typeof charge._s !== "string" || !charge._s) throw new Error(`${tab} : bloc chiffré absent`);
    n++;
  }
  return n;
}
