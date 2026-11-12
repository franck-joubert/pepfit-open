// Garde-fou : aucune chaîne française en dur dans src/app, src/ui et src/ecrans (tout passe par t() / tp()).
// Un texte est jugé français s'il contient une lettre accentuée ou un mot-outil français, dans un littéral ou un texte JSX.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const RACINE = new URL("..", import.meta.url).pathname;
const DOSSIERS = ["src/app", "src/ui", "src/ecrans"];

/** Exceptions : « fichier:texte » exact. Chaque ligne dit pourquoi. */
const EXCEPTIONS: Record<string, string> = {
  "src/ecrans/SectionRegion.tsx:Français": "autonyme de la langue : toujours écrit dans sa propre langue",
  "src/ecrans/SectionRegion.tsx:Español": "autonyme de la langue : toujours écrit dans sa propre langue",
  "src/ecrans/effort-pepfit.ts:plus": "bande du rythme (BandeRythme « plus »), un identifiant, pas un texte",
  "src/ecrans/effort-muscu.ts:milieu du dos": "nom de muscle du catalogue (valeur en base, comparée sans accent : GROS_MUSCLES), pas un texte",
  "src/ecrans/mesures/Effort.tsx:plus": "bande du rythme (BandeRythme « plus »), un identifiant, pas un texte",
  // (vide au départ : toute exception doit être justifiée ici)
  "src/app/(tabs)/train.tsx:plus": "nom d'icône (Icone « plus »), pas un texte",
  "src/ecrans/Routines.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/circuit/CarteTracePleine.tsx:plus": "nom d'icône (bouton Zoomer de la carte), pas un texte",
  "src/ecrans/circuit/MenuCircuit.tsx:sans compte": "message d'erreur interne levé par circuits/reseau.ts (comparé, jamais affiché), pas un texte",
  "src/ecrans/circuit/activites.ts:pas": "nom d'icône (pictogramme de la randonnée), pas un texte",
  "src/ecrans/FeuilleSport.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/recuperer-vues/FeuilleRecuperer.tsx:plus": "nom d'icône (−5 et +5 min de « Autre »), pas un texte",
  "src/ecrans/EditionWod.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/nutrition/Ajouter.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/mesures/PageTour.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/cycle/Cycle.tsx:plus": "nom d'icône (« Noter ce jour », « Noter mes dernières règles »), pas un texte",
  "src/ecrans/nutrition/Journal.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/nutrition/commun.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/mesures/Tours.tsx:plus": "nom d'icône (Mesurer aussi, Nouvelle mesure), pas un texte",
  "src/ecrans/nutrition/Scanner.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/nutrition/FichePlat.tsx:plus": "nom d'icône (Ajouter les ingrédients), pas un texte",
  "src/ecrans/nutrition/plats-commun.tsx:plus": "nom d'icône (Ajouter un ingrédient), pas un texte",
  "src/ui/BandePaliers.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/parcours/EtapeSport.tsx:plus": "nom d'icône (Ajouter un sport), pas un texte",
  "src/ecrans/parcours/EtapesReglage.tsx:plus": "nom d'icône (une place de plus), pas un texte",
  "src/ecrans/ZonesFc.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/ResultatTestVma.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/FeuilleDemarrer.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/FeuillesPlanif.tsx:plus": "nom d'icône, pas un texte",
  "src/ui/LigneSerie.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/actions-seance.tsx:plus": "nom d'icône, pas un texte",
  "src/app/routine/[id].tsx:plus": "nom d'icône nom=\"plus\", pas un texte",
  "src/app/gyms.tsx:plus": "nom d'icône icone=\"plus\", pas un texte",
  "src/app/pick.tsx:plus": "nom d'icône icone=\"plus\" (« Créer un exercice »), pas un texte",
  "src/app/settings/data.tsx:plus": "nom d'icône (« Ajouter à mes données »), pas un texte",
  "src/ecrans/materiel/FeuilleListe.tsx:plus": "nom d'icône icone=\"plus\" (« Ajouter une plage »), pas un texte",
  "src/ecrans/materiel/FeuilleMachine.tsx:plus": "nom d'icône icone=\"plus\" (petites masses), pas un texte",
  "src/ecrans/materiel/LignesDisques.tsx:plus": "nom d'icône icone=\"plus\" (disques courants), pas un texte",
  "src/ecrans/materiel/briques.tsx:plus": "nom d'icône du bouton + de PlusMoins, pas un texte",
  "src/ecrans/FeuilleAppareil.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/FeuilleSalle.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/FeuillesSection.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/Planif.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/FeuilleReglage.tsx:pas": "clé de roue interne, pas un texte",
  "src/ecrans/AccueilAncien.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/AccueilAncien.tsx:pas": "id du bloc Pas de l'accueil, pas un texte",
  "src/ecrans/BlocsAccueil.tsx:pas": "id du bloc Pas, permission Santé Connect « pas », pas un texte",
  "src/ecrans/accueil-blocs.ts:pas": "id et icône du bloc Pas, pas un texte",
  "src/ecrans/precision/actions.ts:pas": "id de l'étape « autoriser les pas » (IdAction), pas un texte",
  "src/ecrans/mesures/age-attente.ts:pas": "id de l'étape « autoriser les pas » (IdAction), pas un texte",
  "src/ecrans/energie-precision.ts:pas": "id du conseil « brancher les pas » (Conseil), pas un texte",
  "src/ecrans/FeuilleEnergie.tsx:pas": "id du conseil « brancher les pas » (Conseil), pas un texte",
  "src/ecrans/profil-vue.ts:pas": "permission Santé Connect « pas », pas un texte",
  "src/app/history/[id].tsx:pas": "permission Santé Connect « pas » (geste de la séance Whoop), pas un texte",
  "src/ecrans/sante-vue.ts:pas": "identifiant de case (sante.pas) et clé de donnée, pas un texte",
  "src/ecrans/effort-activite.ts:pas": "méthode de l'activité de la journée (MethodeActivite « pas »), un identifiant, pas un texte",
  "src/ecrans/effort-charges.ts:pas": "méthode de l'activité de la journée (« fc » ou « pas ») du labo, un identifiant, pas un texte",
  "src/ecrans/mesures/EffortJour.tsx:pas": "nom d'icône (Icone « pas ») de la ligne Activité de la journée, pas un texte",
  "src/ecrans/page-effort.ts:pas": "nom d'icône (Icone « pas ») de la Marche, pas un texte",
  "src/ecrans/Blessures.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/FicheBlessure.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/Traitements.tsx:plus": "nom d'icône, pas un texte",
  "src/ecrans/accueil-donnees.ts:pas": "permission Santé Connect « pas », pas un texte",
  "src/ecrans/journee-donnees.ts:pas": "permission Santé Connect « pas » et nom d'icône, pas un texte",
  "src/ecrans/RangeeSport.tsx:pas": "nom d'icône (Icone « pas ») de la case Pas, pas un texte",
  "src/ecrans/JaugesActivite.tsx:pas": "nom d'icône (Icone « pas ») de la jauge Pas, pas un texte",
  "src/ecrans/mesures/Cartes.tsx:pas": "id de la carte Pas (et de sa route), pas un texte",
  "src/ecrans/mesures/cartes-donnees.ts:pas": "id de la carte Pas, pas un texte",
  "src/ecrans/mesures/Corps.tsx:plus": "nom d'icône (ajouter une pesée), pas un texte",
  "src/ecrans/mesures/Pas.tsx:pas": "nom d'icône de la page vide des pas, pas un texte",
  "src/ecrans/mesures/Pas.tsx:plus": "nom d'icône (moins/plus de la feuille Objectif), pas un texte",
  "src/ecrans/mesures/gabarit.tsx:plus": "nom d'icône (ligne « Ajouter »), pas un texte",
  "src/ui/3d/alias.ts:equilibre sur un pied": "clé de recherche du clip par nom normalisé (NOMS_3D), pas un texte",
  "src/ui/3d/alias.ts:petits sauts sur place": "clé de recherche du clip par nom normalisé (NOMS_3D), pas un texte",
  "src/ui/3d/alias.ts:rowing avec elastique": "clé de recherche du clip par nom normalisé (NOMS_3D), pas un texte",
  "src/ui/3d/alias.ts:chaise contre le mur": "clé de recherche du clip par nom normalisé (NOMS_3D), pas un texte",
  "src/ui/3d/alias.ts:appuis et changements de direction": "clé de recherche du clip par nom normalisé (NOMS_3D), pas un texte",
};

const ACCENT = /[àâäçéèêëîïôöùûüœÀÂÇÉÈÊËÎÏÔÙÛÜŒ]/;
const MOTS = /(^|[\s'’(«])(le|la|les|des|du|une|pour|avec|sans|dans|sur|ou|et|ton|ta|tes|votre|vos|pas|plus|ce|cette|est|sont|à)([\s'’.,;:!?»)]|$)/i;

function fichiers(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? fichiers(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

function sansCommentaires(src: string): string {
  let out = "";
  let i = 0;
  let q: string | null = null;
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (q) {
      out += c;
      if (c === "\\") out += src[++i] ?? "";
      else if (c === q) q = null;
      i++;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && n === "*") {
      const j = src.indexOf("*/", i + 2);
      const bloc = src.slice(i, j < 0 ? src.length : j + 2);
      out += bloc.replace(/[^\n]/g, " ");
      i += bloc.length;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") q = c;
    out += c;
    i++;
  }
  return out;
}

const francais = (s: string) => ACCENT.test(s) || MOTS.test(s);

function suspects(src: string): { ligne: number; texte: string }[] {
  const sc = sansCommentaires(src);
  const trouves: { ligne: number; texte: string }[] = [];
  const lignes = sc.split("\n");
  lignes.forEach((l, idx) => {
    if (/^\s*(import|export\s.*\sfrom)\b/.test(l)) return;
    // Littéraux
    for (const m of l.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
      const t = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ");
      if (t.trim() && francais(t)) trouves.push({ ligne: idx + 1, texte: t.trim() });
    }
    // Texte JSX : entre > et < (hors expressions)
    for (const m of l.matchAll(/>([^<>{}=]+)</g)) {
      const t = m[1]!.trim();
      if (t && /[A-Za-zÀ-ÿ]{2}/.test(t) && francais(t)) trouves.push({ ligne: idx + 1, texte: t });
    }
    // Ligne de texte JSX seule
    const seul = /^\s*([^<>{}=;()`"'\/&|]+[A-Za-zÀ-ÿ.!?:,'’ ]*)$/.exec(l);
    if (seul && /^\s*[A-ZÀ-Ý][^=;(){}]*$/.test(l) && !/^\s*(return|const|let|type|interface|export|import|case|default|else|break|continue|if|for|while)\b/.test(l) && francais(l)) trouves.push({ ligne: idx + 1, texte: l.trim() });
  });
  return trouves;
}

test("aucune chaîne française en dur dans src/app, src/ui et src/ecrans", () => {
  const restes: string[] = [];
  for (const d of DOSSIERS) {
    for (const f of fichiers(join(RACINE, d))) {
      const rel = relative(RACINE, f);
      const src = readFileSync(f, "utf8");
      if (src.startsWith("// Écrit par scripts/")) continue; // fichiers générés (pictos-index.ts : chemins de fichiers)
      for (const s of suspects(src)) {
        if (EXCEPTIONS[`${rel}:${s.texte}`]) continue;
        restes.push(`${rel}:${s.ligne}  ${s.texte}`);
      }
    }
  }
  assert.equal(restes.length, 0, `${restes.length} chaîne(s) française(s) en dur :\n${restes.join("\n")}`);
});

test("détecteur : repère le français, laisse passer le code", () => {
  assert.equal(suspects('const a = "Séance terminée";').length, 1);
  assert.equal(suspects("<Texte>Ajouter une série</Texte>").length, 1);
  assert.equal(suspects('const a = "Inter-Regular"; // commentaire en français').length, 0);
  assert.equal(suspects('import { x } from "../ecrans/format";').length, 0);
  assert.equal(suspects('accessibilityRole="button"').length, 0);
  assert.equal(suspects("<Texte>{t(\"profil.titre\")}</Texte>").length, 0);
});
