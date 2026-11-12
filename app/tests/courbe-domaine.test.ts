// Domaine des courbes « état » et passage d'une période à l'autre (bug du Fold du 30/10 : 30 j tassé dans le dernier tiers,
// 1 an écrasé à droite après Tout, la fin de la moyenne lissée lue à 75 pour une pesée à 78) : courbe-domaine.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./attendu.ts";
import { periodeEtat, xDepuisFin, type Releve, type TypeEtat } from "../src/ecrans/mesures/corps-calc.ts";
import {
  aChange, changer, couches, dansCadre, domaineEtat, empreinte, etatInitial, etiquettesAxe, etiquettesDates, joindre, memeFin, opaciteRole,
  rayonPastille, terminer, versUI, yValeur, type Cible, type EtatCourbe,
} from "../src/ecrans/mesures/courbe-domaine.ts";
import { decaler, minuit } from "../src/ecrans/mesures/periodes.ts";

const MAINTENANT = new Date(2026, 9, 30, 18, 50).getTime();
const AUJ = minuit(MAINTENANT);
const r = (jours: number, valeur: number, manuel = false): Releve => ({ id: `r${jours}`, date: decaler(AUJ, -jours) + 7 * 3_600_000, valeur, manuel, origine: manuel ? null : "com.withings.wiscale2" });
const fixe = (v: number, dec: number) => v.toFixed(dec).replace(".", ",");
const proche = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;

// Historique de sept ans, à la façon de celui d'Alex : 78 en 2019, 84,8 au plus haut, 71,3 au plus bas, 78 aujourd'hui ;
// pesées rares puis fréquentes la dernière année.
const HISTOIRE: Releve[] = [];
for (let j = 2603; j >= 0; j -= j > 365 ? 23 : 3) {
  const an = (2603 - j) / 365;
  const tendance = an < 4 ? 78 + an * 1.4 : 83.6 - (an - 4) * 1.9;
  HISTOIRE.push(r(j, Math.round((tendance + Math.sin(j) * 0.8) * 10) / 10, j % 2 === 0));
}
HISTOIRE.push(r(1661, 84.8), r(720, 71.3), r(0, 78));
HISTOIRE.sort((a, b) => a.date - b.date);

const LIB: Record<TypeEtat, string> = { mois: "30 j", trim: "90 j", annee: "1 an", tout: "Tout" };
/** Ce que StatsEtat donne à la courbe pour une période (dates : début, milieu, auj.). */
function cible(type: TypeEtat, k = 0, releves = HISTOIRE): Cible {
  const p = periodeEtat(releves, type, k, MAINTENANT);
  const n = p.pts.length;
  const idx = type === "tout" ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];
  return {
    cle: `poids-${type}-${k}`,
    periode: { pts: p.pts, bande: null },
    axe: etiquettesAxe(domaineEtat(p.pts), fixe),
    dates: etiquettesDates(idx.map((i) => [i, i === n - 1 ? "auj." : `${LIB[type]}#${i}`] as const), n),
  };
}

describe("domaine d'une période", () => {
  it("toute la durée de la période, bornes de ses relevés et de sa moyenne lissée, repères dans le cadre", () => {
    for (const [type, n] of [["mois", 30], ["trim", 90], ["annee", 365]] as const) {
      const c = cible(type);
      const d = domaineEtat(c.periode.pts);
      expect(d.duree).toBe(n);
      for (const p of c.periode.pts) {
        if (p.v != null) expect(p.v >= d.lo && p.v <= d.hi).toBe(true);
        if (p.l != null) expect(p.l >= d.lo && p.l <= d.hi).toBe(true);
      }
      expect(d.reperes.every((v) => v >= d.lo && v <= d.hi)).toBe(true);
    }
    const tout = domaineEtat(cible("tout").periode.pts);
    expect(tout.duree).toBe(2604);
  });
  it("décimales des repères : une sous un pas de 1 (30 j : 77,5), aucune au-delà (Tout : 80)", () => {
    expect(domaineEtat(cible("mois").periode.pts).dec).toBe(1);
    expect(domaineEtat(cible("tout").periode.pts).dec).toBe(0);
  });
  it("sans relevé : un domaine quand même (aucune division par zéro)", () => {
    const d = domaineEtat(periodeEtat([], "mois", 0, MAINTENANT).pts);
    expect(d.duree).toBe(30);
    expect(d.hi > d.lo).toBe(true);
  });
  it("bande de ta normale comprise dans les bornes (VFC, FC au repos)", () => {
    const pts = cible("mois").periode.pts;
    const d = domaineEtat(pts, pts.map(() => ({ bas: 60, haut: 95 })));
    expect(d.lo <= 60 && d.hi >= 95).toBe(true);
  });
  it("lu sous la grille du domaine affiché, le dernier point redonne sa valeur ; sous un domaine d'avant, non (le bug)", () => {
    const tout = domaineEtat(cible("tout").periode.pts);
    const an = domaineEtat(cible("annee").periode.pts);
    const lire = (y: number, d: { lo: number; hi: number }) => d.lo + ((150 - y) / 140) * (d.hi - d.lo);
    const l = cible("tout").periode.pts.at(-1)!.l!;
    expect(proche(lire(yValeur(l, tout.lo, tout.hi, 150, 10), tout), l)).toBe(true);
    // le Fold : le trait posé avec les bornes de « 1 an » (figées), les repères écrits avec celles de « Tout » (70 à 85) :
    // une moyenne de 77,9 se lit vers 75
    expect(proche(l, 77.86, 0.01)).toBe(true);
    const lu = lire(yValeur(l, an.lo, an.hi, 150, 10), tout);
    expect(lu > 74 && lu < 75.5).toBe(true);
  });
  it("rayon des pastilles : 3 sur 30 j, 2,2 sur 90 j, 1,6 au-delà", () => {
    expect([rayonPastille(30), rayonPastille(90), rayonPastille(365), rayonPastille(2604)]).toEqual([3, 2.2, 1.6, 1.6]);
  });
});

describe("échelle du temps pendant le passage", () => {
  const W = 300;
  it("au départ, la série jointe se dessine exactement comme l'ancienne (aucun saut) ; à la fin, la nouvelle remplit le cadre", () => {
    for (const [de, vers] of [["trim", "mois"], ["mois", "trim"], ["annee", "tout"], ["tout", "annee"], ["mois", "tout"]] as const) {
      const a = cible(de).periode;
      const b = cible(vers).periode;
      const j = joindre(a, b);
      const Da = a.pts.length, Db = b.pts.length;
      // à l'instant 0 (domaine d'avant), l'abscisse ne dépend que du rang avant la fin : même rang, même jour, même valeur,
      // donc même pixel que l'image d'avant
      for (let o = 0; o < Math.min(Da, j.pts.length); o += 7) {
        const x = j.pts[j.pts.length - 1 - o]!, y = a.pts[a.pts.length - 1 - o]!;
        expect([x.jour, x.v, x.l]).toEqual([y.jour, y.v, y.l]);
      }
      // à la fin (domaine d'après) : le premier jour de la période au bord gauche, le dernier au bord droit, le reste hors cadre
      expect(proche(xDepuisFin(Db - 1, Db, W), (0.5 * W) / Db)).toBe(true);
      expect(proche(xDepuisFin(0, Db, W), W - (0.5 * W) / Db)).toBe(true);
      expect(xDepuisFin(Db, Db, W) < 0).toBe(true);
    }
  });
  it("90 j → 30 j : les 60 jours en plus restent dessinés le temps de sortir à gauche, les 30 derniers viennent de la nouvelle période", () => {
    const a = cible("trim").periode;
    const b = cible("mois").periode;
    const j = joindre(a, b);
    expect(j.pts.length).toBe(90);
    expect(j.pts.slice(60)).toEqual(b.pts);
    expect(j.pts[0]!.jour).toBe(a.pts[0]!.jour);
  });
  it("30 j → 90 j : la nouvelle seule (ses jours en plus entrent par la gauche)", () => {
    const b = cible("trim").periode;
    expect(joindre(cible("mois").periode, b)).toBe(b);
  });
  it("autre dernier jour (période d'avant, glissé) : pas de jointure, le domaine se pose", () => {
    const a = cible("mois", 1).periode;
    const b = cible("mois", 0).periode;
    expect(memeFin(a, b)).toBe(false);
    expect(joindre(cible("trim", 1).periode, b)).toBe(b);
  });
  it("bande : alignée sur la série jointe, vide pour les jours d'avant qui n'en avaient pas", () => {
    const a = cible("trim").periode;
    const pb = cible("mois").periode.pts;
    const j = joindre(a, { pts: pb, bande: pb.map(() => ({ bas: 1, haut: 2 })) });
    expect(j.bande!.length).toBe(90);
    expect(j.bande![0]).toBeNull();
    expect(j.bande![89]).toEqual({ bas: 1, haut: 2 });
  });
});

describe("passages successifs (changements rapides)", () => {
  const passer = (e: EtatCourbe, type: TypeEtat, reduit = false) => changer(e, cible(type), reduit);
  it("chaque passage vise le domaine de sa période ; la fin du dernier ramène la série à cette seule période", () => {
    let e = etatInitial(cible("trim"));
    for (const type of ["mois", "annee", "tout", "annee", "mois", "tout", "trim"] as const) {
      e = passer(e, type);
      const d = domaineEtat(cible(type).periode.pts);
      expect(e.domaine).toEqual(d);
      expect(e.cle).toBe(`poids-${type}-0`);
    }
    const g = e.gen;
    expect(g).toBe(7);
    // les fins des passages interrompus arrivent après coup : elles ne touchent à rien
    for (let ancien = 1; ancien < g; ancien++) expect(terminer(e, ancien)).toBe(e);
    const fin = terminer(e, g);
    expect(fin.trace).toBe(fin.periode);
    expect(fin.trace.pts.length).toBe(90);
    expect(fin.avant).toBeNull();
    expect(fin.domaine.duree).toBe(90);
  });
  it("1 an → 90 j → 30 j sans attendre : la série garde l'année, les jours encore à l'écran ne disparaissent pas d'un coup", () => {
    let e = etatInitial(cible("annee"));
    e = passer(e, "trim");
    expect(e.trace.pts.length).toBe(365);
    e = passer(e, "mois");
    expect(e.trace.pts.length).toBe(365);
    expect(e.trace.pts.slice(-30)).toEqual(cible("mois").periode.pts);
    e = terminer(e, e.gen);
    expect(e.trace.pts.length).toBe(30);
  });
  it("Tout → 1 an → Tout : le passage repart vers Tout avec tout l'historique", () => {
    let e = etatInitial(cible("tout"));
    e = passer(e, "annee");
    expect(e.trace.pts.length).toBe(2604);
    e = passer(e, "tout");
    expect(e.trace.pts.length).toBe(2604);
    expect(e.domaine.duree).toBe(2604);
  });
  it("étiquettes : celles d'avant sortent, les nouvelles entrent, celles des deux côtés (« auj. ») restent", () => {
    const e = passer(etatInitial(cible("trim")), "mois");
    const dates = couches(e.avant!.dates, e.dates);
    const role = (texte: string) => dates.filter((x) => x.e.texte === texte).map((x) => x.role);
    expect(role("auj.")).toEqual(["garde"]);
    expect(role("90 j#0")).toEqual(["sort"]);
    expect(role("30 j#0")).toEqual(["entre"]);
    // à t = 0 : seules les anciennes se voient ; à t = 1 : seules les nouvelles
    const vues = (t: number) => dates.filter((x) => opaciteRole(x.role, t) > 0).map((x) => x.e.texte).sort();
    expect(vues(0)).toEqual(["90 j#0", "90 j#44", "auj."]);
    expect(vues(1)).toEqual(["30 j#0", "30 j#14", "auj."]);
    // repères de l'axe : même valeur et même texte = gardé ; « 77 » et « 77,0 » se croisent
    const axe = couches([{ pos: 77, texte: "77,0", ancre: "start", fort: false }, { pos: 78, texte: "78", ancre: "start", fort: false }], [
      { pos: 77, texte: "77", ancre: "start", fort: false },
      { pos: 78, texte: "78", ancre: "start", fort: false },
    ]);
    expect(axe.map((x) => `${x.e.texte}:${x.role}`)).toEqual(["77,0:sort", "77:entre", "78:garde"]);
  });
  it("fin du passage : plus rien ne sort", () => {
    let e = passer(etatInitial(cible("trim")), "mois");
    e = terminer(e, e.gen);
    expect(couches(e.avant?.dates ?? null, e.dates).every((x) => x.role === "garde")).toBe(true);
  });
  it("mouvement réduit : rien ne s'anime, la série et les étiquettes sont celles de la période d'emblée", () => {
    const e = passer(etatInitial(cible("trim")), "mois", true);
    expect(e.anime).toBe(false);
    expect(e.trace).toBe(e.periode);
    expect(e.autrePeriode).toBe(true);
    // aucune étiquette ne sort ; les nouvelles « entrent » d'un coup (t = 1 dès que le fil UI a le passage)
    const dates = couches(e.avant!.dates, e.dates, e.anime);
    expect(dates.some((x) => x.role === "sort")).toBe(false);
    expect(dates.filter((x) => x.role === "entre").map((x) => x.e.texte).sort()).toEqual(["30 j#0", "30 j#14"]);
    expect(dates.every((x) => opaciteRole(x.role, 1) === 1)).toBe(true);
  });
  it("glissé vers la période d'avant : le domaine se pose (la piste fait glisser), sans jointure", () => {
    const e = changer(etatInitial(cible("mois")), cible("mois", 1), false);
    expect(e.anime).toBe(false);
    expect(e.trace.pts.length).toBe(30);
  });
  it("nouvelle pesée sur la même période : passage animé des bornes, mêmes dates, pas d'autre période", () => {
    const e0 = etatInitial(cible("mois"));
    const c = cible("mois", 0, [...HISTOIRE.slice(0, -1), r(0, 76.2)]);
    expect(aChange(e0, c)).toBe(true);
    const e = changer(e0, c, false);
    expect(e.anime).toBe(true);
    expect(e.autrePeriode).toBe(false);
    expect(e.trace.pts.length).toBe(30);
    expect(couches(e.avant!.dates, e.dates).every((x) => x.role === "garde")).toBe(true);
    expect(aChange(e, c)).toBe(false);
  });
});

describe("empreinte, étiquettes, fil UI", () => {
  it("empreinte : change avec une valeur, une saisie, la bande ; stable sinon", () => {
    const p = cible("mois").periode;
    expect(empreinte(p)).toBe(empreinte({ pts: [...p.pts], bande: null }));
    const autre = p.pts.map((x, i) => (i === 29 ? { ...x, v: 77.9 } : x));
    expect(empreinte({ pts: autre, bande: null }) !== empreinte(p)).toBe(true);
    const saisie = p.pts.map((x, i) => (i === 29 ? { ...x, releve: { ...x.releve!, manuel: !x.releve!.manuel } } : x));
    expect(empreinte({ pts: saisie, bande: null }) !== empreinte(p)).toBe(true);
    expect(empreinte({ pts: p.pts, bande: p.pts.map(() => ({ bas: 1, haut: 2 })) }) !== empreinte(p)).toBe(true);
  });
  it("même cible : rien ne change ; textes des dates changés (langue, minuit) : nouveau passage", () => {
    const c = cible("mois");
    const e = etatInitial(c);
    expect(aChange(e, cible("mois"))).toBe(false);
    expect(aChange(e, { ...c, dates: c.dates.map((d) => ({ ...d, texte: `${d.texte}!` })) })).toBe(true);
  });
  it("dates : jours avant le dernier, début à gauche (ancre début), « auj. » en fort à droite", () => {
    expect(etiquettesDates([[0, "1 oct."], [14, "15 oct."], [29, "auj."]], 30)).toEqual([
      { pos: 29, texte: "1 oct.", ancre: "start", fort: false },
      { pos: 15, texte: "15 oct.", ancre: "middle", fort: false },
      { pos: 0, texte: "auj.", ancre: "end", fort: true },
    ]);
  });
  it("fondu au bord du cadre : 1 dedans, 0 à la distance de fondu", () => {
    expect(dansCadre(50, 10, 150, 6)).toBe(1);
    expect(dansCadre(153, 10, 150, 6)).toBe(0.5);
    expect(dansCadre(4, 10, 150, 6)).toBe(0);
  });
  it("série pour le fil UI : NaN pour un jour sans relevé, saisies en 1, bande seulement si elle existe", () => {
    const pts = cible("mois").periode.pts;
    const u = versUI({ pts, bande: null });
    expect(u.V.length).toBe(30);
    expect(u.B).toEqual([]);
    expect(Number.isNaN(u.V[1]!)).toBe(pts[1]!.v == null);
    expect(u.M[29]).toBe(pts[29]!.releve?.manuel ? 1 : 0);
  });
});

describe("worklets du module", () => {
  // Le plugin worklets fige les fonctions qu'une fonction « worklet » appelle là où elle est définie : définies plus bas
  // dans le fichier, elles valent undefined (plantage vu le 30/10 à l'émulateur sur une version intermédiaire : « undefined
  // is not a function » au premier rendu). Chaque worklet de ces fichiers n'appelle que des worklets définies AVANT elle.
  for (const f of ["src/ecrans/mesures/courbe-domaine.ts", "src/ecrans/mesures/CourbeEtat.tsx", "src/ecrans/mesures/corps-calc.ts"]) {
    it(f, () => {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
      const defs = [...src.matchAll(/^(?:export )?function (\w+)\(/gm)].map((m) => ({ nom: m[1]!, at: m.index! }));
      const corps = defs.map((d, i) => src.slice(d.at, defs[i + 1]?.at ?? src.length));
      const worklets = defs.filter((_, i) => corps[i]!.includes('"worklet";'));
      const mal: string[] = [];
      for (const d of worklets) {
        const c = corps[defs.indexOf(d)]!;
        for (const w of worklets) if (w.at > d.at && new RegExp(`\\b${w.nom}\\(`).test(c)) mal.push(`${d.nom} → ${w.nom}`);
      }
      expect(mal).toEqual([]);
    });
  }
});
