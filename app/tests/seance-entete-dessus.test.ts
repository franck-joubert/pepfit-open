// Écran de séance (30/10, en séance réelle) : la liste passait par-dessus l'en-tête et « Terminer » ne répondait
// plus, même hors pause. Non-régression : l'en-tête est au premier plan (zIndex, élévation), la zone de la liste coupe ce
// qui en déborde, le voile de pause laisse passer les touchers.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./attendu.ts";

const src = readFileSync(new URL("../src/app/session.tsx", import.meta.url), "utf8");
const style = (nom: string) => src.match(new RegExp(`\\n  ${nom}: \\{([^}]*)\\}`))?.[1] ?? "";

describe("en-tête de la séance toujours au-dessus", () => {
  it("l'en-tête (et Terminer) est enveloppé au premier plan, avant la zone de la liste", () => {
    const entete = src.indexOf("<View style={styles.entete}>");
    const terminer = src.indexOf('t("seance.seance.terminer")');
    const finEntete = src.indexOf("</BarreHaut>\n      </View>");
    const zone = src.indexOf("<View style={[styles.zone");
    expect(entete > 0 && entete < terminer && terminer < finEntete && finEntete < zone).toBe(true);
    expect(/zIndex: [1-9]/.test(style("entete"))).toBe(true);
    expect(/elevation: [1-9]/.test(style("entete"))).toBe(true);
  });
  it("la zone de la liste ne déborde pas", () => {
    expect(style("zone").includes('overflow: "hidden"')).toBe(true);
  });
  it("le voile de pause ne capte aucun toucher", () => {
    const voile = src.slice(src.indexOf("{enPause ? ("), src.indexOf("{enPause ? (") + 400);
    expect(voile.includes('pointerEvents="none"')).toBe(true);
    expect(voile.includes("onStartShouldSetResponder")).toBe(false);
  });
});
