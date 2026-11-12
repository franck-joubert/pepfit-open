#!/usr/bin/env python3
"""Génère src/db/machines.ts depuis donnees/machines-exercices.csv (machines courantes et exercices qu'elles portent)."""
import csv, json, re, pathlib

racine = pathlib.Path(__file__).resolve().parents[2]
lignes = list(csv.DictReader(open(racine / "donnees/machines-exercices.csv", encoding="utf-8")))
machines, exos = {}, {}
for r in lignes:
    m = r["machine_id"]
    if not m:
        continue
    nom = re.sub(r"\s*\(.*?\)", "", r["machine_requise"]).strip()
    machines.setdefault(m, {"id": m, "nom": nom, "famille": r["famille"]})
    exos[r["slug"]] = m

def palier(m):
    if m["famille"] == "poulie" or m["famille"] == "smith":
        return 2.5
    return 10 if m["id"] == "presse-cuisses" else 5

sortie = ["// Généré par scripts/generer-machines.py depuis donnees/machines-exercices.csv : ne pas éditer à la main.",
          'export type FamilleMachine = "machine" | "poulie" | "smith";', "",
          "export interface MachineCatalogue {", "  id: string;", "  nom: string;", "  famille: FamilleMachine;", "  /** Palier par défaut (kg) : poulie et Smith 2,5, presse 10, autres 5. */", "  palierDefaut: number;", "}", "",
          "export const MACHINES: readonly MachineCatalogue[] = ["]
for m in sorted(machines.values(), key=lambda x: x["nom"].lower()):
    sortie.append(f'  {{ id: {json.dumps(m["id"])}, nom: {json.dumps(m["nom"], ensure_ascii=False)}, famille: {json.dumps(m["famille"])}, palierDefaut: {palier(m)} }},')
sortie += ["];", "", "/** Slug d'exercice du catalogue → machine qui le porte. */", "export const MACHINE_DE_EXERCICE: Readonly<Record<string, string>> = {"]
for s in sorted(exos):
    sortie.append(f"  {json.dumps(s)}: {json.dumps(exos[s])},")
sortie += ["};", ""]
(racine / "app/src/db/machines.ts").write_text("\n".join(sortie), encoding="utf-8")
print(len(machines), "machines,", len(exos), "exercices")
