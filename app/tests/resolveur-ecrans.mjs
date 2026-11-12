// Lecteurs d'écran sous Node (tests/budgets-perf.test.ts, banc de docs/PERF-B.md) : en plus de tests/resolveur.mjs, `../db`
// (db/index.ts, qui ouvre expo-sqlite) devient db/api.ts, la même API sans l'ouverture de la base ; un autre dossier importé
// devient son index.ts. À importer avant les écrans ; les require() d'assets façon Metro passent par globalThis.require.
import { register } from "node:module";

register("data:text/javascript," + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (/(^|\\/)db$/.test(specifier) && specifier.startsWith(".")) {
    try { return await next(specifier + "/api.ts", context); } catch {}
  }
  // nutrition/commun.tsx (JSX, illisible par Node) : seul nomRepas sert aux lecteurs mesurés
  if (specifier.endsWith("nutrition/commun")) return { url: "data:text/javascript,export const nomRepas = (r) => r.nom ?? r.id;", shortCircuit: true };
  try {
    return await next(specifier, context);
  } catch (e) {
    if (e.code === "ERR_UNSUPPORTED_DIR_IMPORT") return next(specifier + "/index.ts", context);
    throw e;
  }
}`));

globalThis.require ??= (await import("node:module")).createRequire(new URL("../src/db/x.ts", import.meta.url));
