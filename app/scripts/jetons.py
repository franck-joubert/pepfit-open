#!/usr/bin/env python3
"""Jetons de la base v2.2 : primitif → sémantique (nuit, jour) → composant.
`python3 jetons.py` imprime le tableau des contrastes (markdown) ; assembler.py en tire le CSS."""

# 1. Primitifs : valeurs brutes, jamais utilisées directement dans les composants
PRIMITIFS = {
    # neutres chauds (teinte 30°), du noir OLED au papier
    "gris-1000": "#000000", "gris-950": "#141312", "gris-900": "#1f1d1b", "gris-850": "#2c2926",
    "gris-800": "#3a3633", "gris-600": "#675f58", "gris-500": "#948d86", "gris-400": "#b8b1aa",
    "gris-200": "#dbd5ce", "gris-150": "#e9e5df", "gris-100": "#f4f2ee", "craie": "#f5f2ee",
    "gris-0": "#ffffff", "encre-900": "#171411", "encre-700": "#4b453f",
    "orange-500": "#f97316", "orange-550": "#ea6a0c", "orange-600": "#e8590c", "orange-700": "#d24f08",
    "orange-encre": "#1a0b00",
    "vert-400": "#2fd06a", "vert-700": "#106b33", "vert-voile-n": "#0d2416", "vert-voile-j": "#dcefe1",
    "jaune-400": "#facc15", "jaune-800": "#835200",
    "rouge-400": "#ff7a70", "rouge-700": "#b8241c",
    "violet-300": "#b89cff", "violet-700": "#6d3fd6",
    "magenta-300": "#f08bd0", "magenta-700": "#a8328a",
    "sarcelle-300": "#4fd8c4", "sarcelle-800": "#0b6e66",
    "framboise-600": "#cc1722", "framboise-700": "#b5111b", "rose-200": "#ffb0cc", "rose-300": "#f7a0c2",
    # gris froids du jour (refonte du 26/10) : fond blanc pur, éléments gris froid très clair
    "ardoise-50": "#f4f5f7", "ardoise-100": "#e8ebef", "ardoise-120": "#e6e9ed", "ardoise-150": "#dce0e5",
    "ardoise-180": "#cdd3da", "ardoise-200": "#ccd2d9", "ardoise-600": "#636b74", "ardoise-700": "#4a525c",
    "ardoise-900": "#111418", "vert-voile-j2": "#e2f2e7",
    # or des records (retour du 26/10 : remplace la sarcelle)
    "or-300": "#eec25a", "or-800": "#8a6100",
    # couleurs de partie à plat (accueil modulable, décision 8 du 27/10) ; l'orange reprend orange-500 / orange-600 ;
    # Nutrition : lagon-* (v2.2.17, plus bas)
    "bleu-400": "#3d8bff", "bleu-600": "#2563eb",
    "rose-400": "#ff4f9a", "rose-600": "#e5178b",
    # fonds du jour par partie (retour du 27/10) : là où l'aura s'efface, un quasi-blanc teinté de la partie
    # (5 % de sa couleur claire dans le blanc), pour que les cartes blanches s'en détachent
    "fond-bleu": "#f5f9ff", "fond-peche": "#fff8f3", "fond-rose": "#fff6fa",
    # verre des cartes sur l'aura (27/10) : s1 de nuit et blanc, translucides ; filets très légers
    "verre-nuit": "rgba(20,19,18,0.6)",
    "filet-verre-nuit": "rgba(255,255,255,0.06)", "filet-verre-jour": "rgba(17,20,24,0.07)",
    "reste-fond-nuit": "rgba(0,0,0,0.28)", "reste-fond-jour": "rgba(0,0,0,0.05)",
    # textes secondaires et filets translucides (règle d'Alex du 27/10 : pas de gris, du blanc ou du noir à opacité
    # réduite, plus joli sur fond coloré) ; opacités tenant 4,5:1 sur bg, s1, s2, s3 et le verre au pire point de l'aura
    "blanc-70": "rgba(255,255,255,0.7)", "blanc-54": "rgba(255,255,255,0.54)",
    "blanc-21": "rgba(255,255,255,0.21)", "blanc-11": "rgba(255,255,255,0.11)",
    "noir-70": "rgba(0,0,0,0.7)", "noir-58": "rgba(0,0,0,0.58)",
    "noir-18": "rgba(0,0,0,0.18)", "noir-09": "rgba(0,0,0,0.09)",
    # liseré de l'interrupteur éteint, le jour (planche profil-public, D8 du 29/10) : la piste ardoise-180 ne tenait que
    # 1,4:1 sur blanc ; le liseré noir 45 % tient 3,3:1 (contraste non textuel, WCAG 1.4.11). La nuit : rien.
    "noir-45": "rgba(0,0,0,0.45)", "transparent": "rgba(0,0,0,0)",
    # zones de FC, du froid au chaud (planche suivi-gps, D3 tranchée par le 27/10) ; Z2 et Z3 de nuit reprennent
    # bleu-400 et vert-400 ; Z3 de jour foncie de #128a43 à #118740 pour tenir 4,5:1 sur bg. Z4 est ambre, jamais l'orange du geste. Une seule gamme dans l'appli (suivi, séance passée, Lieux)
    # v2.2.20 (30/10, relecture de la planche familles-sports) : libellés « Z » de 11 px à 4,5:1 sur les fonds de page du
    # jour aussi (pêche, bleuté, lagon, rosé) et sur ardoise-50 : Z3 #118740 → #10813e, Z4 #a86400 → #a36100, même teinte
    "zone-ardoise-400": "#9aa7b4", "zone-ardoise-700": "#5d6b7a", "zone-vert-700": "#10813e",
    "ambre-400": "#f5b014", "ambre-800": "#a36100", "cramoisi-400": "#ff4f5e", "cramoisi-700": "#c8102e",
    # altitude (planche suivi-gps, fin de course) : sarcelle en bas, jaune en haut, une autre famille que les zones
    "sarcelle-300": "#4fd8c4", "sarcelle-800": "#0b6e66",
    # Nutrition turquoise (planche teintes-parties, A2 « Lagon vif et profond », le 29/10) : le vert est réservé à ce
    # qui est validé. lagon-300 : à plat la nuit et arrêt clair du dégradé ; lagon-600 : à plat le jour et arrêt du milieu
    # (blanc 3,19:1) ; lagon-800 : arrêt foncé ; fond-lagon : 5 % de lagon-300 dans le blanc
    "lagon-300": "#1bd8bb", "lagon-600": "#0ca291", "lagon-800": "#007c82", "fond-lagon": "#f4fdfc",
    # texte principal translucide aussi (règle d'Alex du 29/10 : plus de gris opaque), comme t2 et t3 depuis la v2.2.11
    "blanc-94": "rgba(255,255,255,0.94)", "noir-90": "rgba(0,0,0,0.9)",
    # piste des jauges du jour (D2 du 29/10 : « noir à 10 % ») ; fond des pictos des repas la nuit (D3)
    "noir-10": "rgba(0,0,0,0.1)", "blanc-10": "rgba(255,255,255,0.1)",
    # Fil, prune et cerise (planche fil, P1 validée le 31/10, puis « Prune/cerise, non ? ») : prune-300 et prune-600
    # arrêts clair et milieu du dégradé, prune-200 à plat la nuit (9,5:1 sur le noir), prune-700 à plat le jour (7,3:1 sur
    # fond-prune) ; cerise-700 arrêt foncé du dégradé et nappe foncée de l'aura (blanc 8,2:1), seconde teinte de la partie ;
    # cerise-300 la nuit (8,5:1 sur le noir), cerise-700 le jour (7,4:1 sur fond-prune) ; fond-prune : quasi-blanc du jour
    "prune-200": "#d199f0", "prune-300": "#c77ddb", "prune-600": "#9440b4", "prune-700": "#7b2f99",
    "cerise-300": "#ff7aa0", "cerise-700": "#9b1144", "fond-prune": "#fbf7fd",
    # Fibres et eau de la Nutrition (planche fibres-eau, D4, validée le 06/11) : un tilleul, plus jaune que le vert
    # « validé » (écart de teinte ΔE 38 et 29 avec lui), et un bleu franc entre les protéines (cyan) et les glucides (violet).
    # Nuit : valeur claire ; jour : valeur profonde. Jauge seulement (3:1 suffit) ; les chiffres restent en t1.
    "tilleul-300": "#b5e04f", "tilleul-700": "#527a00", "eau-400": "#68a2f3", "eau-700": "#2457c9",
}

# 2. Sémantique : le rôle, par mode. La nuit prolonge la v2.1 ; le jour garde le même caractère
SEMANTIQUE = {
    #  rôle           nuit            jour
    "bg":          ("gris-1000",    "gris-0"),   # fond d'écran
    "s1":          ("gris-950",     "ardoise-50"),     # surface levée : ligne active, feuille, champ de note
    "s2":          ("gris-900",     "ardoise-100"),   # boutons tonals, pastilles, champs actifs
    "s3":          ("gris-850",     "ardoise-150"),   # pastille de navigation, piste des barres
    "line":        ("blanc-11",     "noir-09"),   # filets de séparation (sur bg : gris-900 et ardoise-120)
    "line-2":      ("blanc-21",     "noir-18"),   # contour des cases à faire (sur bg : gris-800 et ardoise-200)
    "t1":          ("blanc-94",   "noir-90"),  # texte principal, chiffres saisis (translucide depuis la v2.2.17)
    "t2":          ("blanc-70",     "noir-70"),  # texte secondaire
    "t3":          ("blanc-54",     "noir-58"),   # méta, en-têtes de colonnes, précédent
    "action":      ("orange-500",   "orange-600"), # LE geste : valider, enregistrer, curseur, progression
    "action-presse": ("orange-550", "orange-700"),
    "sur-action":  ("orange-encre", "orange-encre"),
    "valide":      ("vert-400",     "vert-700"),   # série validée
    "valide-voile": ("vert-voile-n", "vert-voile-j2"),
    "echauffement": ("jaune-400",   "jaune-800"),  # W
    "rate":        ("rouge-400",    "rouge-700"),  # F, et toute action destructive
    "info":        ("bleu-400",     "bleu-600"),   # information : un réglage à faire (capteur qui ne diffuse pas, autorisation) ; jamais le rouge d'une erreur
    # variation d'une mesure sans jugement (30/10, mensurations M12) : flèche diagonale orange en hausse, bleue en
    # baisse, jamais vert et rouge (aucun sens n'est pénalisant) ; orange-700 le jour pour tenir 3:1 sous l'aura rosée
    "hausse":      ("orange-500",   "orange-700"),
    "baisse":      ("bleu-400",     "bleu-600"),
    # jauge des fibres et de l'eau sous le résumé du Journal (planche fibres-eau, D4) : aucun texte, la valeur reste en t1
    "fibres":      ("tilleul-300",  "tilleul-700"),
    "eau":         ("eau-400",      "eau-700"),
    "degressive":  ("violet-300",   "violet-700"), # D (plus de bleu : c'est la couleur de Hevy)
    "record":      ("or-300",       "or-800"),     # record battu, toujours avec la médaille (or, 26/10)
    "superset":    ("magenta-300",  "magenta-700"),  # trait et en-tête d'un groupe en superset (distinct du D violet)
    "muscle":      ("framboise-600", "framboise-700"), # muscle principal allumé sur le personnage 3D (picto-3d v4)
    "muscle-2":    ("rose-200",     "rose-300"),     # muscle secondaire allumé sur le personnage 3D
    "inter":       ("gris-850",     "ardoise-180"),  # interrupteur éteint (plein)
    "inter-lisere": ("transparent", "noir-45"),      # liseré de l'interrupteur éteint (jour seulement, D8)
    "partie-accueil":      ("bleu-400",   "bleu-600"),   # icône d'un bloc de l'accueil (à plat ; le dégradé reste au geste)
    "partie-entrainement": ("orange-500", "orange-600"),
    "partie-nutrition":    ("lagon-300",  "lagon-600"),  # turquoise (v2.2.17) ; vert = validé
    "partie-sante":        ("rose-400",   "rose-600"),
    "partie-fil":          ("prune-200",  "prune-700"),  # prune (planche fil, P1)
    "second-fil":          ("cerise-300", "cerise-700"), # cerise, seconde teinte du Fil (ta réaction, son cerclage)
    "fond-accueil":       ("gris-1000", "fond-bleu"),     # fond d'un onglet sous l'aura (nuit : bg)
    "fond-entrainement":  ("gris-1000", "fond-peche"),
    "fond-nutrition":     ("gris-1000", "fond-lagon"),
    "fond-sante":         ("gris-1000", "fond-rose"),
    "fond-fil":           ("gris-1000", "fond-prune"),
    "verre-carte": ("verre-nuit",   "gris-0"),   # carte (onglets, groupes) : blanche le jour sur le fond teinté (v2.2.17, D6) ; teintée la nuit (RECETTE_PARTIE)
    "verre-filet": ("filet-verre-nuit", "filet-verre-jour"),  # contour 1 px de la carte de verre
    "reste-fond": ("reste-fond-nuit", "reste-fond-jour"),  # fond du bloc « Il reste » : noir translucide, distinct des cartes de repas
    "zone-1":      ("zone-ardoise-400", "zone-ardoise-700"),  # zones de FC (suivi en direct, tracé, courbes, tableaux)
    "zone-2":      ("bleu-400",     "bleu-600"),
    "zone-3":      ("vert-400",     "zone-vert-700"),
    "zone-4":      ("ambre-400",    "ambre-800"),
    "zone-5":      ("cramoisi-400", "cramoisi-700"),
    "alt-bas":     ("sarcelle-300", "sarcelle-800"),  # altitude : bas du tracé et du profil (fin de course, bloc d'effort)
    "alt-haut":    ("jaune-400",    "jaune-800"),     # altitude : haut
    "jauge-piste": ("blanc-21",     "noir-10"),       # piste d'une jauge (nuit : inchangée ; jour : D2 du 29/10)
    "picto-repas": ("blanc-10",     "gris-0"),        # fond du picto d'un repas (point 3 du 29/10 ; nuit : D3)
    "segment-piste": ("gris-900",   "ardoise-100"),   # piste d'un segmenté (teintée de la partie : RECETTE_PARTIE)
    "segment-choisi": ("gris-850",  "gris-0"),        # option choisie d'un segmenté (le jour : blanc, avec ombre)
    "anneau-libre": ("blanc-21",    "noir-18"),       # anneau d'un choix libre (radio ; teinté : RECETTE_PARTIE)
    "carte-opaque": ("gris-950",    "gris-0"),        # la carte posée sur le noir, opaque : contenu d'une ligne qu'on glisse
}

# 2 bis. Teinte par partie (v2.2.17, retour du 29/10 : « le gris a l'air malade ») : dans un écran, les surfaces
#    et les filets prennent la couleur de la partie (`partie-*` du mode). Calculé au rendu par theme/teintes.ts, une fois
#    par partie et par mode. Le jour : fond de page = `fond-*`, cartes et surfaces levées blanches, éléments à x % de la
#    partie dans le blanc. La nuit : les gris mêlés de x % de la partie (s3 : 12 % ; t3 y tient 4,57:1 sur le turquoise, le
#    plus clair) ; carte = partie à 20 % dans le noir, posée à 72 %.
#    Filets et anneaux : la partie à x % d'opacité (ils se posent sur tous les fonds).
RECETTE_PARTIE = {
    "jour": {"s2": 0.08, "s3": 0.13, "inter": 0.18, "segment-piste": 0.08, "line": 0.16, "line-2": 0.30, "verre-filet": 0.12, "anneau-libre": 0.45},
    "nuit": {"s1": 0.06, "s2": 0.10, "s3": 0.12, "segment-piste": 0.12, "segment-choisi": 0.26, "line": 0.20, "line-2": 0.34,
             "verre-filet": 0.14, "anneau-libre": 0.45, "verre-carte": (0.2, 0.72)},
}

# 3. Composants : ce que le code lit
COMPOSANTS = {
    "btn-primaire-fond": "action", "btn-primaire-texte": "sur-action",
    "btn-tonal-fond": "s2", "btn-tonal-texte": "t1",
    "serie-active-fond": "s1", "serie-active-champ": "s2", "serie-valider": "action",
    "serie-faite-fond": "valide-voile", "serie-faite-coche": "valide",
    "repos-fond": "s1", "repos-piste": "s3", "repos-trait": "action",
    "nav-actif-pastille": "s3", "nav-actif-texte": "t1", "nav-inactif": "t3",
    "feuille-fond": "s1", "feuille-groupe": "s2", "feuille-poignee": "s3",
    "interrupteur-piste": "t1", "interrupteur-bouton": "bg",
    "interrupteur-piste-eteint": "inter", "interrupteur-bouton-eteint": "t3",
    "interrupteur-lisere-eteint": "inter-lisere",
}

# 4. Jour (refonte du 26/10) : feuilles du bas (feuilles, repos) blanches comme l'écran, éléments en s1 ;
#    interrupteur à pastille blanche, allumé comme éteint. La nuit ne change pas.
#    Un rôle sémantique, ou à défaut une primitive.
FEUILLE_JOUR = {
    "feuille-fond": "bg", "feuille-groupe": "s1", "feuille-poignee": "s3", "repos-fond": "bg",
    "interrupteur-bouton": "gris-0", "interrupteur-bouton-eteint": "gris-0",
}
# Dans une feuille, en jour, ce qui était posé en s2 passe en s1 (les éléments d'une feuille sont en s1).
DANS_FEUILLE_JOUR = {"s2": "s1", "btn-tonal-fond": "s1", "serie-active-champ": "s1"}


def valeur(nom, i):
    """Primitive d'un rôle sémantique (selon le mode i), ou la primitive elle-même."""
    return PRIMITIFS[SEMANTIQUE[nom][i]] if nom in SEMANTIQUE else PRIMITIFS[nom]

# Paires texte / fond réellement utilisées sur la planche (texte, fond, où)
PAIRES = [
    ("t1", "bg", "titres, chiffres de la séance"), ("t1", "s1", "chiffres de la ligne active"),
    ("t1", "s2", "chiffres saisis, boutons tonals"), ("t2", "bg", "texte secondaire"),
    ("t2", "s1", "texte secondaire sur feuille"), ("t2", "s2", "pastilles Repos / Note"),
    ("t3", "bg", "méta, précédent, en-têtes"), ("t3", "s1", "méta sur ligne active, barre de repos"),
    ("t3", "s2", "aides des feuilles"), ("t2", "s3", "texte secondaire sur piste"), ("t3", "s3", "méta sur piste"),
    ("sur-action", "action", "texte et coche sur orange"),
    ("valide", "bg", "« 3 séries », 3/3"), ("valide", "s2", "numéro de série faite"),
    ("valide", "valide-voile", "coche de série faite"),
    ("echauffement", "s2", "pastille W"), ("echauffement", "bg", "W dans l'historique"),
    ("rate", "s2", "pastille F"), ("rate", "bg", "Abandonner la séance"), ("rate", "s1", "Retirer la série (feuille)"),
    ("info", "bg", "« Diffusion de la FC coupée », départ du suivi"), ("info", "s1", "état dans une feuille (Activer la FC)"),
    ("hausse", "s1", "flèche ↗ d'une variation (non-texte, 3:1)"), ("hausse", "fond-sante", "flèche ↗ sur le fond rosé (non-texte, 3:1)"),
    ("baisse", "s1", "flèche ↘ d'une variation (non-texte, 3:1)"), ("baisse", "fond-sante", "flèche ↘ sur le fond rosé (non-texte, 3:1)"),
    ("fibres", "bg", "jauge des fibres (non-texte, 3:1)"), ("fibres", "fond-nutrition", "jauge des fibres sur le fond de la Nutrition (non-texte, 3:1)"),
    ("eau", "bg", "jauge de l'eau (non-texte, 3:1)"), ("eau", "fond-nutrition", "jauge de l'eau sur le fond de la Nutrition (non-texte, 3:1)"),
    ("degressive", "s2", "pastille D"), ("superset", "bg", "trait et en-tête de superset"), ("superset", "s2", "superset sur pastille"), ("record", "bg", "record du jour"), ("record", "s1", "record sur surface"),
    ("t1", "fond-accueil", "titre sur le fond teinté"), ("t2", "fond-accueil", "texte secondaire, fond teinté"),
    ("t3", "fond-accueil", "méta, fond teinté"), ("t3", "fond-entrainement", "méta, fond teinté"),
    ("t3", "fond-nutrition", "méta, fond teinté"), ("t3", "fond-sante", "méta, fond teinté"),
    ("t3", "fond-fil", "méta, fond teinté"), ("partie-fil", "fond-fil", "type d'une publication, sur le fond du Fil"),
    ("partie-fil", "bg", "accent du Fil"), ("second-fil", "bg", "cerise : ta réaction (non-texte, 3:1)"),
    ("second-fil", "fond-fil", "cerise sur le fond du Fil (non-texte, 3:1)"),
    ("action", "bg", "trait de progression, curseur (non-texte, 3:1)"),
    ("action", "s1", "trait de repos sur la barre (non-texte, 3:1)"),
    ("zone-1", "bg", "« Z1 », zone de FC"), ("zone-2", "bg", "« Z2 »"), ("zone-3", "bg", "« Z3 »"),
    ("zone-4", "bg", "« Z4 »"), ("zone-5", "bg", "« Z5 »"),
    ("zone-1", "fond-entrainement", "« Z1 » sur le fond du Sport (pêche)"), ("zone-2", "fond-entrainement", "« Z2 », pêche"),
    ("zone-3", "fond-entrainement", "« Z3 », pêche"), ("zone-4", "fond-entrainement", "« Z4 », pêche"),
    ("zone-5", "fond-entrainement", "« Z5 », pêche"),
    ("zone-1", "fond-sante", "« Z1 » sur le fond le plus sombre (rosé)"), ("zone-2", "fond-sante", "« Z2 », rosé"),
    ("zone-3", "fond-sante", "« Z3 », rosé"), ("zone-4", "fond-sante", "« Z4 », rosé"), ("zone-5", "fond-sante", "« Z5 », rosé"),
    ("zone-1", "s1", "tracé sur la carte (non-texte, 3:1)"), ("zone-5", "s1", "tracé sur la carte (non-texte, 3:1)"),
    ("alt-bas", "s1", "tracé d'altitude (non-texte, 3:1)"), ("alt-haut", "s1", "tracé d'altitude (non-texte, 3:1)"),
    ("inter-lisere", "bg", "liseré de l'interrupteur éteint, jour (non-texte, 3:1 ; la nuit, la piste gris-850 suffit)"),
    ("inter-lisere", "s1", "liseré de l'interrupteur éteint sur un groupe, jour (non-texte, 3:1)"),
]


def hexa(role, mode):
    return PRIMITIFS[SEMANTIQUE[role][0 if mode == "nuit" else 1]]


def rvba(c):
    """([r, v, b] 0-255, opacité) d'un « #rrggbb » ou d'un « rgba(r,v,b,a) »."""
    if c.startswith("#"):
        return [int(c[i:i + 2], 16) for i in (1, 3, 5)], 1.0
    v = [float(x) for x in c[c.index("(") + 1:-1].split(",")]
    return v[:3], v[3] if len(v) > 3 else 1.0


def sur(haut, bas):
    """Couleur composée (opaque) de `haut`, éventuellement translucide, posée sur `bas` opaque."""
    (h, a), b = rvba(haut), rvba(bas)[0]
    return [h[i] * a + b[i] * (1 - a) for i in range(3)]


def lum(c):
    f = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (f(x / 255) for x in c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(texte, fond, mode):
    """Contraste d'un texte (translucide ou non) sur un fond, l'un et l'autre composés sur le bg du mode."""
    f = sur(fond, hexa("bg", mode))
    t = sur(texte, "#" + "".join(f"{round(v):02x}" for v in f))
    x, y = sorted((lum(t), lum(f)))
    return (y + 0.05) / (x + 0.05)


def css():
    lignes = [":root {"] + [f"  --p-{k}: {v};" for k, v in PRIMITIFS.items()] + ["}"]
    for i, mode in enumerate(("nuit", "jour")):
        lignes.append(f".{mode} {{")
        lignes += [f"  --{r}: var(--p-{v[i]});" for r, v in SEMANTIQUE.items()]
        lignes += [f"  --{c}: var(--{r});" for c, r in COMPOSANTS.items()]
        if mode == "jour":
            lignes += [f"  --{c}: var(--{'p-' if r not in SEMANTIQUE else ''}{r});" for c, r in FEUILLE_JOUR.items()]
        lignes.append(f"  color-scheme: {'dark' if mode == 'nuit' else 'light'};")
        lignes.append("}")
    lignes.append(".jour .sheet {" + "".join(f" --{c}: var(--{r});" for c, r in DANS_FEUILLE_JOUR.items()) + " }")
    return "\n".join(lignes)


def tableau():
    out = ["| Texte | Fond | Usage | Nuit | Jour |", "|---|---|---|---|---|"]
    for t, f, u in PAIRES:
        seuil = 3 if "non-texte" in u else 4.5
        cel = []
        for m in ("nuit", "jour"):
            r = ratio(hexa(t, m), hexa(f, m), m)
            cel.append(f"{r:.2f}:1".replace(".", ",") + ("" if r >= seuil else " ✗"))
        out.append(f"| `{t}` | `{f}` | {u} | {cel[0]} | {cel[1]} |")
    return "\n".join(out)


if __name__ == "__main__":
    print(tableau())
