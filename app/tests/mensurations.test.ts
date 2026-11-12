// Mensurations (planche mensurations, validée le 30/10) : ordre des tours (M1, M10), repères et valeur proposée
// (M3), molette au pas de 0,5, marche du parcours (M2, M5 : correction depuis la frise et le récapitulatif, Passer), série
// « de mesure en mesure » des statistiques (M6), écriture groupée et correction en base.
import { describe, expect, it } from "./attendu.ts";
import { baseDeTest } from "./aide.ts";
import {
  borner, DEPART, departSur, enCorrection, ORDRE_TOURS, parcours, prochaine, repere, toursPasses, toursPris, valeurProposee, valeursRoue, ZONES, anneauDeFace, cadrage, FIGURES,
  cleConsigne, cleOu, personnage, persoDe, SOUS_POITRINE, zoneDe, type ActionParcours, type EtatParcours,
} from "../src/ecrans/mesures/tours-calc.ts";
import { serieMesures, periodeEtat, statsEtat, type Releve } from "../src/ecrans/mesures/corps-calc.ts";
import { decaler, minuit } from "../src/ecrans/mesures/periodes.ts";
import { lireTours, TOURS } from "../src/ecrans/mesures/corps-donnees.ts";
import {
  ajouterMensurations, ecrirePersonnageChoisi, historiqueMensuration, lirePersonnageChoisi, lireSexe, modifierMensuration, TYPES_MENSURATION,
} from "../src/db/depots/profil.ts";
import { REGLAGES_SYNC } from "../src/sync/schema.ts";
import { fr } from "../src/i18n/fr.ts";
import { en } from "../src/i18n/en.ts";

const jouer = (...a: ActionParcours[]): EtatParcours => a.reduce(parcours, DEPART);
const MAINTENANT = new Date(2026, 9, 30, 18, 20).getTime();
const AUJ = minuit(MAINTENANT);

describe("ordre et personnage", () => {
  it("de haut en bas, le cou en tête ; la taille (hauteur) n'est pas un tour", () => {
    expect([...ORDRE_TOURS]).toEqual(["cou", "epaules", "poitrine", "bras", "tour_taille", "hanches", "cuisse", "mollet"]);
    expect([...TOURS]).toEqual([...ORDRE_TOURS]);
    expect(TYPES_MENSURATION.includes("cou")).toBe(true);
    expect((ORDRE_TOURS as readonly string[]).includes("taille")).toBe(false);
  });
  it("chaque zone tient dans son image, de haut en bas sur la vue de face, pour l'homme et la femme", () => {
    for (const p of ["h", "f"] as const) {
      for (const t of ORDRE_TOURS) {
        const z = ZONES[p][t];
        expect(z.x0 >= 0 && z.x1 <= FIGURES[p][z.vue].l && z.y > 0 && z.y < FIGURES[p][z.vue].h).toBe(true);
      }
      const ys = ORDRE_TOURS.map((t) => anneauDeFace(p, t).y);
      expect(ys.every((y, i) => i === 0 || y > ys[i - 1]!)).toBe(true);
      expect(ZONES[p].hanches.vue).toBe("dos");
      expect(ZONES[p].mollet.vue).toBe("dos");
    }
  });
  it("la femme : zones sur les repères du dessin (zones-image.json), le tour de dos sous la poitrine", () => {
    expect(FIGURES.f.face).toEqual({ l: 420, h: 930 });
    expect(ZONES.f.poitrine).toMatchObject({ y: 266, x0: 133, x1: 286 });
    expect(ZONES.f.hanches).toMatchObject({ vue: "dos", y: 450, x0: 118, x1: 302 });
    expect(anneauDeFace("f", "hanches")).toEqual({ y: 450, x0: 119, x1: 300 });
    expect(SOUS_POITRINE.y > ZONES.f.poitrine.y && SOUS_POITRINE.y < ZONES.f.tour_taille.y).toBe(true);
    // le tour de dos ne se montre que sur la femme
    expect(persoDe("h", "sous_poitrine")).toBe("f");
    expect(zoneDe("h", "sous_poitrine")).toBe(SOUS_POITRINE);
    expect(zoneDe("f", "cou")).toBe(ZONES.f.cou);
    // l'homme garde ses zones d'aujourd'hui
    expect(ZONES.h.poitrine).toEqual({ vue: "face", y: 268, x0: 80, x1: 270, cx: 175, vh: 400, vw: 300 });
  });
  it("le cadrage centre la zone et garde le haut de l'image dans la carte", () => {
    for (const p of ["h", "f"] as const) {
      const c = cadrage(ZONES[p].bras, 380, 290, p);
      expect(Math.abs(c.ty + ZONES[p].bras.y * c.s - 145) < 1).toBe(true);
      expect(cadrage(ZONES[p].cou, 380, 290, p).ty <= 8).toBe(true);
    }
  });
  it("le personnage : celui du profil ; « Non précisé » : le choix gardé, l'homme d'abord (D4)", () => {
    expect(personnage("f", "h")).toBe("f");
    expect(personnage("h", "f")).toBe("h");
    expect(personnage(null, null)).toBe("h");
    expect(personnage(null, "f")).toBe("f");
  });
  it("consignes (D7) : cou et poitrine propres à la femme et à « Non précisé », les autres pour tous", () => {
    expect(cleConsigne("poitrine", "h")).toBe("mensurations.consigne.poitrine");
    expect(cleConsigne("poitrine", "f")).toBe("mensurations.consigne.poitrine.f");
    expect(cleConsigne("poitrine", null)).toBe("mensurations.consigne.poitrine.x");
    expect(cleConsigne("cou", null)).toBe("mensurations.consigne.cou.f");
    expect(cleConsigne("hanches", "f")).toBe("mensurations.consigne.hanches");
    expect(cleOu("poitrine", "f")).toBe("mensurations.ou.poitrine.f");
    expect(cleOu("cou", "h")).toBe("mensurations.ou.cou");
    for (const langue of [fr, en] as const)
      for (const t of ORDRE_TOURS)
        for (const sexe of ["h", "f", null] as const) {
          expect(typeof langue[cleConsigne(t, sexe)]).toBe("string");
          expect(typeof langue[cleOu(t, sexe)]).toBe("string");
        }
    expect(fr["mensurations.ou.poitrine.f"]).toBe("Au plus fort de la poitrine");
    expect(fr["mensurations.consigne.poitrine.f"].includes("mamelons")).toBe(false);
  });
  it("le choix du personnage est gardé sur ce téléphone, sans toucher au sexe du profil", async () => {
    const { db } = await baseDeTest();
    expect(await lirePersonnageChoisi(db)).toBe(null);
    await ecrirePersonnageChoisi(db, "f");
    expect(await lirePersonnageChoisi(db)).toBe("f");
    expect(await lireSexe(db)).toBe(null);
    expect(REGLAGES_SYNC.includes("mensurations_personnage")).toBe(false);
  });
});

describe("valeur proposée (M3)", () => {
  it("la dernière de la personne d'abord, ramenée au demi-centimètre", () => {
    expect(valeurProposee("mollet", 38.3, "h", 183)).toEqual({ v: 38.5, source: "derniere" });
  });
  it("sinon un repère cohérent par tour, selon le sexe et la taille ; jamais la même valeur partout", () => {
    expect(repere("epaules", "h", 176)).toBe(120);
    expect(repere("mollet", "h", 183)).toBe(38.5);
    expect(repere("tour_taille", "h", 183)).toBe(89.5);
    expect(repere("cou", "f", 163)).toBe(33);
    expect(repere("hanches", "f", 170)).toBe(102);
    const tous = ORDRE_TOURS.map((t) => repere(t, "h", 183));
    expect(new Set(tous).size >= 7).toBe(true);
    expect(tous.includes(80)).toBe(false);
  });
  it("sans sexe : la moyenne homme et femme ; sans taille, ou une taille absurde : la taille de référence", () => {
    expect(repere("bras", null, null)).toBe(30);
    expect(repere("bras", "h", null)).toBe(repere("bras", "h", 176));
    expect(repere("bras", "h", 20)).toBe(repere("bras", "h", 176));
    const p = valeurProposee("cuisse", null, "h", 183);
    expect(p).toEqual({ v: 59, source: "repere", taille: 183 });
  });
  it("molette : pas de 0,5 entre les bornes du tour", () => {
    const v = valeursRoue("mollet");
    expect(v[0]).toBe(20);
    expect(v[1]).toBe(20.5);
    expect(v[v.length - 1]).toBe(70);
    expect(borner("bras", 12)).toBe(15);
    expect(borner("bras", 33.26)).toBe(33.5);
  });
});

describe("parcours (M2, M5)", () => {
  it("Suivant et Passer avancent ; au bout, le récapitulatif ; rien ne s'écrit avant", () => {
    const e = jouer({ type: "suivant", v: 39 }, { type: "suivant", v: 120.5 }, { type: "passer" });
    expect(e.i).toBe(3);
    expect(e.valeurs).toEqual({ cou: 39, epaules: 120.5 });
    expect([...e.passes]).toEqual(["poitrine"]);
    const fin = ORDRE_TOURS.slice(3).reduce((x) => parcours(x, { type: "suivant", v: 50 }), e);
    expect(fin.recap).toBe(true);
    expect(toursPris(fin).map((x) => x.type)).toEqual(["cou", "epaules", "bras", "tour_taille", "hanches", "cuisse", "mollet"]);
    expect(toursPasses(fin)).toEqual(["poitrine"]);
  });
  it("toucher une étape prise : correction, puis retour où l'on en était ; Annuler ne change rien", () => {
    let e = jouer({ type: "suivant", v: 39 }, { type: "suivant", v: 120 }, { type: "suivant", v: 102 }, { type: "suivant", v: 35 }, { type: "suivant", v: 84.5 });
    expect(e.i).toBe(5);
    e = parcours(e, { type: "aller", k: 2 });
    expect([e.i, e.reprise, enCorrection(e)]).toEqual([2, 5, true]);
    const v = parcours(e, { type: "valider", v: 103 });
    expect([v.i, v.reprise, v.valeurs.poitrine]).toEqual([5, null, 103]);
    const a = parcours(e, { type: "annuler" });
    expect([a.i, a.reprise, a.valeurs.poitrine]).toEqual([5, null, 102]);
  });
  it("toucher une étape à faire ou passée : on la prend à la suite, sans correction", () => {
    let e = jouer({ type: "passer" });
    e = parcours(e, { type: "aller", k: 0 });
    expect([e.i, e.reprise]).toEqual([0, null]);
    e = parcours(e, { type: "suivant", v: 38 });
    expect([e.i, e.valeurs.cou, e.passes.includes("cou")]).toEqual([1, 38, false]);
    expect(prochaine(e, 0)).toBe(1);
  });
  it("corriger depuis le récapitulatif y ramène, par Valider comme par Annuler ; ← revient à la dernière étape", () => {
    const fin = ORDRE_TOURS.reduce((x) => parcours(x, { type: "suivant", v: 40 }), DEPART);
    const c = parcours(fin, { type: "corriger", k: 3 });
    expect([c.recap, c.i, enCorrection(c)]).toEqual([false, 3, true]);
    const v = parcours(c, { type: "valider", v: 36 });
    expect([v.recap, v.valeurs.bras]).toEqual([true, 36]);
    expect(parcours(c, { type: "annuler" }).recap).toBe(true);
    const q = parcours(fin, { type: "quitterRecap" });
    expect([q.recap, q.i]).toEqual([false, ORDRE_TOURS.length - 1]);
  });
  it("bilan d'un coach (A3, D24) : les seuls tours demandés, dans l'ordre du parcours ; au bout, la fin (retour au bilan)", () => {
    const e = departSur(["hanches", "poids", "bras", "tour_taille", "sommeil"]);
    expect([...e.ordre]).toEqual(["bras", "tour_taille", "hanches"]);
    expect(departSur(["sommeil"])).toBe(DEPART);
    expect(departSur(undefined)).toBe(DEPART);
    const deux = parcours(parcours(e, { type: "passer" }), { type: "suivant", v: 82.5 });
    expect([deux.i, prochaine(deux, deux.i)]).toEqual([2, null]);
    const fin = parcours(deux, { type: "suivant", v: 96 });
    expect(fin.recap).toBe(true);
    expect(toursPris(fin)).toEqual([{ type: "tour_taille", valeur: 82.5 }, { type: "hanches", valeur: 96 }]);
    expect(toursPasses(fin)).toEqual(["bras"]);
    // toucher une étape hors du parcours ne fait rien
    expect(parcours(e, { type: "aller", k: 5 })).toBe(e);
  });
  it("bilan : les tours déjà pris pour lui sont dans la frise, l'étape sur le premier qui reste ; corrigés seulement, ils repartent", () => {
    const e = departSur(["tour_taille", "hanches", "bras"], { tour_taille: 84, hanches: 98, cou: 40 });
    expect([e.i, e.valeurs]).toEqual([0, { tour_taille: 84, hanches: 98 }]);
    expect(e.ordre[e.i]).toBe("bras");
    expect(prochaine(e, e.i)).toBeNull();
    const fin = parcours(e, { type: "suivant", v: 35.5 });
    expect(fin.recap).toBe(true);
    expect(toursPris(fin)).toEqual([{ type: "bras", valeur: 35.5 }]);
    const corrige = parcours(parcours(e, { type: "aller", k: 2 }), { type: "valider", v: 97.5 });
    expect(toursPris(corrige)).toEqual([{ type: "hanches", valeur: 97.5 }]);
  });
});

describe("statistiques de mesure en mesure (M6)", () => {
  const r = (jours: number, valeur: number): Releve => ({ id: `t${jours}`, date: decaler(AUJ, -jours) + 8 * 3_600_000, valeur, manuel: true, origine: null });
  it("les mesures reliées, rien avant la première ni après la dernière de la période", () => {
    const s = serieMesures([r(10, 88), r(5, 86), r(1, 85)], decaler(AUJ, -12), AUJ);
    expect(s.length).toBe(13);
    expect(s[0]!.l).toBeNull();
    expect(s[2]!.l).toBe(88);
    expect(s[2]!.v).toBe(88);
    expect(Math.abs(s[4]!.l! - 87.2) < 1e-9).toBe(true);
    expect(s[11]!.l).toBe(85);
    expect(s[12]!.l).toBeNull();
  });
  it("évolution = dernière mesure − première de la période", () => {
    const p = periodeEtat([r(100, 90), r(60, 88), r(30, 86.5), r(8, 84.5)], "trim", 0, MAINTENANT, serieMesures);
    const st = statsEtat(p);
    expect(st.n).toBe(3);
    expect(Math.abs(st.variation! + 3.5) < 1e-9).toBe(true);
    expect(st.min!.v).toBe(84.5);
  });
});

describe("en base", () => {
  it("le parcours s'écrit d'un coup, à la même date ; une valeur illisible n'écrit rien", async () => {
    const { db } = await baseDeTest();
    await ajouterMensurations(db, [{ type: "cou", valeur: 39 }, { type: "mollet", valeur: 38.5 }], MAINTENANT);
    const t = await lireTours(db);
    expect(t.cou![0]!.valeur).toBe(39);
    expect(t.mollet![0]!.date).toBe(MAINTENANT);
    await expect(ajouterMensurations(db, [{ type: "bras", valeur: 35 }, { type: "cuisse", valeur: 0 }], MAINTENANT)).rejects.toThrow();
    expect((await historiqueMensuration(db, "bras")).length).toBe(0);
  });
  it("corriger une valeur garde sa date", async () => {
    const { db } = await baseDeTest();
    const [id] = await ajouterMensurations(db, [{ type: "bras", valeur: 35 }], MAINTENANT);
    await modifierMensuration(db, id!, 35.5);
    const l = await historiqueMensuration(db, "bras");
    expect([l[0]!.valeur, l[0]!.date]).toEqual([35.5, MAINTENANT]);
  });
});
