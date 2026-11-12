// Le test de rendu (tests/rendu-lieu.test.ts) charge les VRAIS écrans de l'appli (.tsx compris) sous Node : ce fichier branche
// la transpilation TypeScript/JSX et remplace les modules natifs par leurs doublures (natifs/). Importé avant tout le reste.
import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const natifs = (f) => new URL(`./natifs/${f}`, import.meta.url).href;
const DOUBLES = {
  "react-native": natifs("react-native.mjs"),
  "expo-router": natifs("expo-router.mjs"),
  "react-native-safe-area-context": natifs("safe-area.mjs"),
  "react-native-svg": natifs("svg.mjs"),
  "react-native-reanimated": natifs("reanimated.mjs"),
  "react-native-gesture-handler": natifs("gesture-handler.mjs"),
};
for (const m of [
  "@maplibre/maplibre-react-native",
  "@shopify/react-native-skia",
  "expo",
  "expo/fetch",
  "expo-blur",
  "expo-document-picker",
  "expo-file-system",
  "expo-haptics",
  "expo-image-manipulator",
  "expo-image-picker",
  "expo-keep-awake",
  "expo-localization",
  "expo-location",
  "expo-notifications",
  "expo-sqlite",
  "expo-sharing",
  "expo-status-bar",
  "expo-system-ui",
  "react-native-worklets",
]) DOUBLES[m] = natifs("divers.mjs");

const SOURCES = /\.(ts|tsx)$/;
const sansNodeModules = (url) => !url.includes("/node_modules/");
const fichier = (c) => existsSync(c) && statSync(c).isFile();

registerHooks({
  resolve(specifier, context, suite) {
    if (DOUBLES[specifier]) return { url: DOUBLES[specifier], format: "module", shortCircuit: true };
    // imports à la manière de Metro : sans extension, ou un dossier (son index)
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:") && !SOURCES.test(specifier)) {
      const base = fileURLToPath(new URL(specifier, context.parentURL));
      for (const c of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
        if (fichier(c)) return { url: pathToFileURL(c).href, format: "module", shortCircuit: true };
      }
    }
    return suite(specifier, context);
  },
  load(url, context, suite) {
    if (!SOURCES.test(url) || !url.startsWith("file:") || !sansNodeModules(url)) return suite(url, context);
    const chemin = fileURLToPath(url);
    const source = readFileSync(chemin, "utf8");
    let { outputText } = ts.transpileModule(source, {
      fileName: chemin,
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, verbatimModuleSyntax: false, isolatedModules: true },
    });
    // `require` à la manière de Metro : un JSON se lit, une image (ou une police) n'est que son chemin.
    if (/\brequire\(/.test(outputText)) {
      outputText = `import { createRequire as __cr } from "node:module";\nconst __r = __cr(import.meta.url);\nconst require = (p) => (/\\.json$/.test(p) ? __r(p) : p);\n${outputText}`;
    }
    // Les deux contextes (réglages de l'appli, thème) ne s'exportent pas : le test les fournit à l'écran.
    if (/\/ecrans\/contexte\.tsx$/.test(url)) outputText += "\nexport const __Contexte = Contexte;\n";
    if (/\/theme\/index\.tsx$/.test(url)) outputText += "\nexport const __ContexteTheme = Contexte;\n";
    return { format: "module", source: outputText, shortCircuit: true };
  },
});
