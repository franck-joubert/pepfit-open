import { readFileSync } from "node:fs";
import { bilanNoms } from "../src/db/audit-noms.ts";
import type { Catalogue } from "../src/db/catalogue.ts";

const cat = JSON.parse(readFileSync(new URL("../assets/catalogue/exercices.json", import.meta.url), "utf8")) as Catalogue;
const b = bilanNoms(cat.exercices);
const nom = new Map(cat.exercices.map((e) => [e.slug, e]));

function liste(titre: string, slugs: string[], detail = false): void {
  console.log(`\n${titre} : ${slugs.length}`);
  if (detail) for (const s of slugs) console.log(`  ${s}  FR « ${nom.get(s)!.nom} »  EN « ${nom.get(s)!.nom_en} »`);
}

console.log(`Catalogue : ${b.total} exercices, dont ${b.composesAutomatiquement} avec un nom français composé automatiquement.`);
liste("Sans nom français", b.sansNomFr, true);
liste("Sans nom anglais", b.sansNomEn, true);
liste("Nom français visiblement anglais", b.frVisiblementAnglais, true);
liste("Nom anglais visiblement français", b.enVisiblementFrancais, true);
liste("Noms français et anglais identiques (légitime pour Squat, Burpee…)", b.identiques);
