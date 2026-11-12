// Le voile sous le menu du bas, RENDU pour de vrai (docs/degrade-bas/README.md) : le vrai composant Fondu de l'appli, lu par
// react-reconciler, à 320, 390, 820 et 1306 dp (Fold déplié). Le dégradé et son aplat doivent couvrir toute la largeur de
// l'écran, bord à bord, en nombres de dp (pas « 100 % » laissé au natif), nuit et jour.
import "./rendu/hooks.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type Context } from "react";
import type { Noeud } from "./rendu/rendu.mjs";

const { monter, trouver } = await import("./rendu/rendu.mjs");
// Le banc de rendu (tests/rendu/natifs/react-native.mjs) lit la taille d'écran dans globalThis.__rendu.
const banc = globalThis as unknown as { __rendu?: { ecran: { width: number; height?: number } } };
const { Fondu } = await import("../src/ui/MenuFlottant.tsx");
const theme = (await import("../src/theme/index.tsx")) as unknown as { __ContexteTheme: Context<unknown> };
const { modes } = await import("../src/theme/jetons.ts");

const LARGEURS = [320, 390, 820, 1306];

async function rendre(largeur: number, mode: "nuit" | "jour") {
  banc.__rendu = { ecran: { width: largeur } };
  const r = await monter(
    createElement(theme.__ContexteTheme.Provider, { value: { mode, apparence: mode, couleurs: modes[mode], choisir() {} } }, createElement(Fondu, { chemin: "/health" })),
  );
  await r.jusqua((x) => trouver(x, (n) => n.type === "Svg").length > 0, "le voile");
  return r;
}
const un = (racine: Noeud, type: string) => {
  const t = trouver(racine, (n) => n.type === type);
  assert.equal(t.length, 1, `un seul ${type}`);
  return t[0]!;
};

for (const mode of ["nuit", "jour"] as const) {
  for (const largeur of LARGEURS) {
    test(`le voile du bas couvre ${largeur} dp, bord à bord (${mode})`, async () => {
      const r = await rendre(largeur, mode);
      try {
        const svg = un(r.racine, "Svg");
        assert.equal(svg.props.width, largeur, "le dessin a la largeur de l'écran");
        assert.equal(svg.props.viewBox, `0 0 ${largeur} ${svg.props.height}`, "la fenêtre du dessin aussi");
        const rect = un(r.racine, "Rect");
        assert.equal(rect.props.x, 0, "il part du bord gauche");
        assert.equal(rect.props.width, largeur, "il va jusqu'au bord droit");
        assert.equal(rect.props.height, svg.props.height, "sur toute la hauteur du dessin");
        const cadre = trouver(r.racine, (n) => n.type === "Animated.View").find((n) => JSON.stringify(n.props.style).includes('"left":0'))!;
        const style = Object.assign({}, ...(cadre.props.style as object[]).flat(9).filter(Boolean)) as Record<string, number>;
        assert.equal(style.left, 0);
        assert.equal(style.right, 0);
        assert.equal(style.width, largeur, "le cadre aussi");
      } finally {
        await r.demonter();
      }
    });
  }
}
