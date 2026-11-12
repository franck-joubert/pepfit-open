// Les sources s'écrivent à la manière de Metro (imports sans extension) ; Node demande « .ts ».
// react-native-libsodium (module natif) est remplacé par libsodium-wrappers-sumo, même API.
import { register } from "node:module";

// expo-secure-store (module natif) est remplacé par un coffre en mémoire (globalThis.__coffreReel), pour tester les simulations.
const coffreFactice = new URL("./coffre-factice.ts", import.meta.url).href;

register("data:text/javascript," + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === "expo-secure-store") return { url: ${JSON.stringify(coffreFactice)}, shortCircuit: true };
  if (specifier === "react-native-libsodium") return next("libsodium-wrappers-sumo", context);
  try {
    return await next(specifier, context);
  } catch (e) {
    // dossier importé (« ../natif/rappels ») : son index.ts, comme Metro
    if (e.code === "ERR_UNSUPPORTED_DIR_IMPORT" && specifier.startsWith(".")) return next(specifier + "/index.ts", context);
    if (e.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && !/\\.[a-z]+$/.test(specifier)) {
      try { return await next(specifier + ".ts", context); } catch {}
      return next(specifier + "/index.ts", context);
    }
    throw e;
  }
}`));

// Aucun test ne parle à pep.fit : un appel vers ce domaine échoue comme hors ligne ; les serveurs de test locaux (127.0.0.1)
// et les faux fetch injectés ne sont pas touchés.
const fetchReel = globalThis.fetch;
globalThis.fetch = (entree, init) => {
  const url = String(entree?.url ?? entree);
  if (/^https?:\/\/([^/@]*\.)?pep\.fit([/:?#]|$)/i.test(url)) return Promise.reject(new TypeError("Network request failed (tests : pep.fit n'est jamais appelé)"));
  return fetchReel(entree, init);
};
