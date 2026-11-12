// Logo pepfit (kit de la marque, copié dans assets/logo/) → src/ui/logo-pepfit.ts : le texte SVG de chaque fichier, lu par
// SvgXml (pas de transformeur SVG dans Metro). À relancer si les fichiers du kit changent : node scripts/generer-logo.mjs
import { readFileSync, writeFileSync } from "node:fs";

const dossier = new URL("../assets/logo/", import.meta.url);
const fichiers = {
  logoJour: "pepfit-logo-couleur.svg",
  logoNuit: "pepfit-logo-couleur-nuit.svg",
  symboleJour: "pepfit-symbole-couleur-plein.svg",
  symboleNuit: "pepfit-symbole-couleur-nuit.svg",
};
const lignes = ["// Généré par scripts/generer-logo.mjs depuis assets/logo/ : ne pas modifier à la main.", ""];
for (const [nom, f] of Object.entries(fichiers)) {
  const xml = readFileSync(new URL(f, dossier), "utf8").replace(/<title>.*?<\/title>/s, "").replace(/\s+/g, " ").trim();
  lignes.push(`export const ${nom} = ${JSON.stringify(xml)};`);
}
writeFileSync(new URL("../src/ui/logo-pepfit.ts", import.meta.url), lignes.join("\n") + "\n");
