// Petite couche « describe / it / expect » au-dessus de node:test, pour les tests écrits à la manière de vitest
// (tests whoop-*) : le projet n'a qu'un lanceur, `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

export { describe, it };

/** Vrai si `reel` contient au moins les champs de `attendu` (récursif, comme toMatchObject). */
function contient(reel: unknown, attendu: unknown): boolean {
  if (attendu instanceof RegExp) return typeof reel === "string" && attendu.test(reel);
  if (attendu === null || typeof attendu !== "object") return Object.is(reel, attendu);
  if (reel === null || typeof reel !== "object") return false;
  if (Array.isArray(attendu)) {
    return Array.isArray(reel) && reel.length === attendu.length && attendu.every((v, i) => contient(reel[i], v));
  }
  return Object.entries(attendu).every(([k, v]) => contient((reel as Record<string, unknown>)[k], v));
}

/** Comme toEqual de vitest : les champs à undefined ne comptent pas. */
function sansIndefinis(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sansIndefinis);
  if (v && typeof v === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(v))) {
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, sansIndefinis(x)]));
  }
  return v;
}

function erreurConforme(e: unknown, attendu?: unknown): boolean {
  if (attendu === undefined) return true;
  const message = e instanceof Error ? e.message : String(e);
  if (typeof attendu === "string") return message.includes(attendu);
  if (attendu instanceof RegExp) return attendu.test(message);
  if (typeof attendu === "function") return e instanceof (attendu as new () => unknown);
  return contient(e, attendu);
}

function matchers(reel: unknown, non: boolean) {
  const verifier = (ok: boolean, message: string) => {
    if (ok === non) assert.fail(`${non ? "non " : ""}${message} — reçu : ${JSON.stringify(reel)}`);
  };
  return {
    toBe: (v: unknown) => verifier(Object.is(reel, v), `toBe ${JSON.stringify(v)}`),
    toEqual: (v: unknown) => {
      let ok = true;
      try { assert.deepStrictEqual(sansIndefinis(reel), sansIndefinis(v)); } catch { ok = false; }
      verifier(ok, `toEqual ${JSON.stringify(v)}`);
    },
    toMatchObject: (v: unknown) => verifier(contient(reel, v), `toMatchObject ${JSON.stringify(v)}`),
    toBeNull: () => verifier(reel === null, "toBeNull"),
    toBeUndefined: () => verifier(reel === undefined, "toBeUndefined"),
    toBeGreaterThanOrEqual: (n: number) => verifier((reel as number) >= n, `>= ${n}`),
    toHaveLength: (n: number) => verifier((reel as { length: number }).length === n, `longueur ${n}`),
    toContain: (v: unknown) => verifier(
      typeof reel === "string" ? reel.includes(v as string) : (reel as unknown[]).includes(v), `toContain ${JSON.stringify(v)}`),
    toMatch: (v: RegExp | string) => verifier(typeof v === "string" ? (reel as string).includes(v) : v.test(reel as string), `toMatch ${v}`),
    toThrow: (v?: unknown) => {
      let leve = false, conforme = false;
      try { (reel as () => unknown)(); } catch (e) { leve = true; conforme = erreurConforme(e, v); }
      verifier(leve && conforme, `toThrow ${v ?? ""}`);
    },
  };
}

/** expect.stringContaining (dans un toMatchObject) : une expression qui cherche le texte. */
expect.stringContaining = (texte: string) => new RegExp(texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
expect.unreachable = (message = "ne devait pas être atteint") => assert.fail(message);

export function expect(reel: unknown) {
  return {
    ...matchers(reel, false),
    not: matchers(reel, true),
    resolves: new Proxy({}, {
      get: (_, nom: string) => async (...args: unknown[]) =>
        (matchers(await (reel as Promise<unknown>), false) as Record<string, (...a: unknown[]) => void>)[nom]!(...args),
    }) as ReturnType<typeof matchers>,
    rejects: new Proxy({}, {
      get: (_, nom: string) => async (...args: unknown[]) => {
        let erreur: unknown, rejete = false;
        try { await (reel as Promise<unknown>); } catch (e) { rejete = true; erreur = e; }
        if (!rejete) assert.fail("la promesse devait échouer");
        (matchers(erreur, false) as Record<string, (...a: unknown[]) => void>)[nom]!(...args);
      },
    }) as ReturnType<typeof matchers>,
  };
}
