#!/usr/bin/env python3
"""Petits persos (planche exercices-perso, D5) : couches pré-rendues du personnage de l'appli, de face et de dos.

Pour chaque vue : le corps seul, éclairé (même image nuit et jour : le corps est #938b89 dans les deux modes) ; puis, pour
chaque muscle du personnage que touche un muscle du catalogue (src/db/zones.ts, MUSCLES_DU_CATALOGUE), ce muscle seul,
éclairé dans la couleur de son rôle (jetons `muscle` et `muscle2`, nuit et jour), l'opacité valant sa présence dans le
masque. Toutes les couches d'une vue partagent le cadre du corps ; un muscle est rogné à sa boîte, sa place notée en part
du cadre. L'appli les superpose (src/ui/Persos.tsx) : aucun contexte GL, quelques petites images.

Écrit assets/persos/*.webp et src/ui/persos-images.ts : python3 scripts/persos/generer.py
"""
import json, os, pathlib, re, shutil, subprocess
from PIL import Image

ICI = pathlib.Path(__file__).resolve().parent
APPLI = ICI.parents[1]
TMP = pathlib.Path(os.environ.get("TMPDIR", "/tmp")) / "persos-appli"
SORTIE = APPLI / "assets" / "persos"
H = 480  # px de haut : la fiche les montre à 170 dp, soit 450 px sur l'écran extérieur du Fold
CORPS = "#938b89"

zones = (APPLI / "src" / "db" / "zones.ts").read_text(encoding="utf-8")
IDS = sorted({i for v in re.findall(r"\[([^\]]*)\]", zones.split("MUSCLES_DU_CATALOGUE", 1)[1]) for i in re.findall(r'"(\w+)"', v)})

jetons = (APPLI / "src" / "theme" / "jetons.ts").read_text(encoding="utf-8")
def couleurs(bloc):
    corps_bloc = jetons.split(f"export const {bloc} = {{", 1)[1].split("\n};", 1)[0]
    return re.search(r'\bmuscle: "(#\w+)"', corps_bloc).group(1), re.search(r'\bmuscle2: "(#\w+)"', corps_bloc).group(1)
COUL = {m: couleurs(m) for m in ("nuit", "jour")}
ROLES = {"p": (1, 0), "s": (2, 1)}  # rôle du shader, rang de la couleur

taches = {}
for vue in ("face", "dos"):
    taches[f"{vue}-corps"] = dict(face=vue == "face", corpsCouleur=CORPS, h=H)
    for mode, cc in COUL.items():
        for r, (role, k) in ROLES.items():
            for m in IDS:
                taches[f"{vue}-{mode}-{r}-{m}"] = dict(face=vue == "face", muscle=m, role=role, couleur=cc[k], corpsCouleur=CORPS, h=H)

shutil.rmtree(TMP, ignore_errors=True)
subprocess.run(["node", str(ICI / "rendre.mjs"), json.dumps(taches), str(TMP)], check=True)

shutil.rmtree(SORTIE, ignore_errors=True)
SORTIE.mkdir(parents=True)
donnees = {}
total = 0
for vue in ("face", "dos"):
    corps = Image.open(TMP / f"{vue}-corps.png").convert("RGBA")
    cadre = corps.getbbox()
    corps = corps.crop(cadre)
    W, Hc = corps.size
    corps.save(SORTIE / f"{vue}-corps.webp", "WEBP", quality=90, alpha_quality=100, method=6)
    total += (SORTIE / f"{vue}-corps.webp").stat().st_size
    couches = {}
    for mode in COUL:
        for r in ROLES:
            for m in IDS:
                nom = f"{vue}-{mode}-{r}-{m}"
                im = Image.open(TMP / f"{nom}.png").convert("RGBA").crop(cadre)
                # opacité sous 3/255 : bruit de l'anticrénelage, pas du muscle
                a = im.getchannel("A").point(lambda x: 0 if x < 3 else 255)
                b = a.getbbox()
                if not b:
                    continue  # muscle caché dans cette vue
                im.crop(b).save(SORTIE / f"{nom}.webp", "WEBP", quality=90, alpha_quality=100, method=6)
                total += (SORTIE / f"{nom}.webp").stat().st_size
                couches[nom] = [round(b[0] / W, 5), round(b[1] / Hc, 5), round((b[2] - b[0]) / W, 5), round((b[3] - b[1]) / Hc, 5)]
    donnees[vue] = dict(ratio=round(W / Hc, 5), couches=couches)

lignes = [
    "// Généré par scripts/persos/generer.py : ne pas modifier à la main.",
    "// Couches des petits persos (planche exercices-perso, D5) : le corps de chaque vue, puis chaque muscle du personnage dans",
    "// la couleur de son rôle (p : principal, s : secondaire) et du mode. Place d'un muscle : [x, y, largeur, hauteur] en part",
    "// du cadre du corps. `ratio` : largeur sur hauteur du cadre.",
    "/* eslint-disable @typescript-eslint/no-require-imports */",
    "import type { ImageSourcePropType } from \"react-native\";",
    "",
    "export interface CouchePerso {",
    "  source: ImageSourcePropType;",
    "  place: readonly [number, number, number, number];",
    "}",
    "",
    "export const VUES_PERSOS = {",
]
for vue, d in donnees.items():
    lignes.append(f"  {vue}: {{")
    lignes.append(f"    ratio: {d['ratio']},")
    lignes.append(f"    corps: require(\"../../assets/persos/{vue}-corps.webp\") as ImageSourcePropType,")
    lignes.append("    couches: {")
    for nom, place in d["couches"].items():
        cle = nom.split("-", 1)[1]
        lignes.append(f"      \"{cle}\": {{ source: require(\"../../assets/persos/{nom}.webp\"), place: [{', '.join(str(x) for x in place)}] }},")
    lignes.append("    } as Readonly<Record<string, CouchePerso>>,")
    lignes.append("  },")
lignes.append("} as const;")
(APPLI / "src" / "ui" / "persos-images.ts").write_text("\n".join(lignes) + "\n", encoding="utf-8")
print(sum(len(d["couches"]) for d in donnees.values()) + 2, "images,", total // 1024, "Ko")
shutil.rmtree(TMP, ignore_errors=True)
