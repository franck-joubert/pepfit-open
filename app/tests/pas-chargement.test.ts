// Page Pas restée sur son squelette (Fold, samedi 31/10, 8 h 44 ; docs/PAS-CHARGEMENT.md) : ~1 100 lectures de Santé Connect
// l'une après l'autre, sans délai. Ici : une lecture qui ne revient jamais ne retient plus la page ; la lecture groupée par
// heure remplace les appels par intervalle ; samedi, jour à 0 pas ; heure d'hiver.
process.env.TZ = "Europe/Paris";
import { describe, expect, it } from "./attendu.ts";
import { baseDeTest } from "./aide.ts";
import { avantDelai, ErreurDelaiSante, fabriquerSante, PERMISSIONS, type NatifSante } from "../src/natif/sante/logique.ts";
import { lireDonneesPas } from "../src/ecrans/mesures/pas-donnees.ts";
import { periode } from "../src/ecrans/mesures/periodes.ts";
import { statsPas } from "../src/ecrans/mesures/pas-calc.ts";
import { enregistrerJours } from "../src/whoop/depot.ts";

const H = 3_600_000;
// samedi 31 octobre 2026, 8 h 44 (Paris) : l'heure de la capture d'Alex
const MAINTENANT = new Date(2026, 9, 31, 8, 44).getTime();
const AUJ = new Date(2026, 9, 31).getTime();

/** Natif simulé : Santé Connect présent, pas autorisés. `pasHeure(t)` : pas de l'heure qui commence à t (0 = aucune donnée). */
function natif(o: { pasHeure?: (t: number) => number; bloque?: boolean; groupe?: boolean }) {
  const appels = { pas: 0, pasHeures: 0 };
  const parHeure = o.pasHeure ?? (() => 0);
  const somme = (a: number, b: number) => {
    let n = 0, vu = false;
    for (let t = Math.ceil(a / H) * H; t < b; t += H) if (parHeure(t) > 0) ((n += parHeure(t)), (vu = true));
    return vu ? n : -1;
  };
  const jamais = new Promise<never>(() => {});
  const n: NatifSante = {
    statut: async () => 3,
    autorisees: async () => [PERMISSIONS.pas],
    demander: async () => [],
    poids: async () => [],
    pas: async (bornes) => (appels.pas++, o.bloque ? jamais : bornes.slice(1).map((b, i) => somme(bornes[i]!, b))),
    ...(o.groupe
      ? {
          pasHeures: async (a: number, b: number) => {
            appels.pasHeures++;
            if (o.bloque) return jamais;
            const l: [number, number][] = [];
            for (let t = a; t < b; t += H) if (parHeure(t) > 0) l.push([t, parHeure(t)]);
            return l;
          },
        }
      : {}),
    sommeil: async () => [],
    frequenceRepos: async () => [],
    exporter: async () => {},
    mesures: async () => [],
    seancesSport: async () => [],
    kcalActives: async (b) => b.slice(1).map(() => -1),
    installees: async () => [],
    ouvrir: async () => {},
  };
  return { n, appels };
}

/** 600 pas par heure de 8 h à 20 h, sauf aujourd'hui (0 pas : aucun enregistrement). */
const journees = (t: number) => {
  const h = new Date(t).getHours();
  return t >= AUJ ? 0 : h >= 8 && h < 20 ? 600 : 0;
};

describe("une lecture qui ne revient jamais ne retient plus la page", () => {
  it("avantDelai : la promesse, ou ErreurDelaiSante après le délai", async () => {
    expect(await avantDelai(Promise.resolve(3), 50)).toBe(3);
    const e = await avantDelai(new Promise(() => {}), 20).catch((x: unknown) => x);
    expect(e instanceof ErreurDelaiSante).toBe(true);
  });

  it("Santé Connect bloqué (APK sans lecture groupée) : la page arrive avec ce qu'elle a, sans exception", async () => {
    const { db } = await baseDeTest();
    const { n } = natif({ bloque: true });
    // délai du module (200 ms) plus long que celui de la page (50 ms) : c'est la page qui coupe
    const s = fabriquerSante(n, () => MAINTENANT, 200);
    const t0 = Date.now();
    const x = await lireDonneesPas(db, MAINTENANT, s, 50);
    expect(Date.now() - t0 < 1000).toBe(true);
    expect(x.santeConnect).toBe("autorisee");
    expect(x.aujourdhui).toEqual({ etat: "vide", source: "sante" });
    expect(x.heures).toBe(null);
    expect(x.habituel).toBe(null);
    expect(x.jours.size).toBe(400);
  });

  it("module bloqué aussi en lecture groupée : même chose, pas Whoop gardés dans le journal", async () => {
    const { db } = await baseDeTest();
    await enregistrerJours(db, [{ jour: AUJ - 86_400_000, pas: 7321 }]);
    const s = fabriquerSante(natif({ bloque: true, groupe: true }).n, () => MAINTENANT, 50);
    const x = await lireDonneesPas(db, MAINTENANT, s, 5000);
    expect(x.jours.get(new Date(2026, 9, 30).getTime())).toEqual({ etat: "valeur", pas: 7321, source: "whoop" });
  });

  it("lecture groupée en échec sur 400 jours : pas de rafale de 400 lectures d'un jour derrière", async () => {
    const { db } = await baseDeTest();
    const { n, appels } = natif({ bloque: true });
    await lireDonneesPas(db, MAINTENANT, fabriquerSante(n, () => MAINTENANT, 30), 5000);
    // jours (1), heure par heure d'aujourd'hui (1), rythme habituel (1) : rien de plus
    expect(appels.pas <= 3).toBe(true);
  });
});

describe("lecture groupée par heure", () => {
  it("400 jours et 30 × 24 heures en une vingtaine de demandes, mêmes chiffres qu'un appel par intervalle", async () => {
    const { db } = await baseDeTest();
    const g = natif({ pasHeure: journees, groupe: true });
    const groupe = await lireDonneesPas(db, MAINTENANT, fabriquerSante(g.n, () => MAINTENANT));
    const u = natif({ pasHeure: journees });
    const unParUn = await lireDonneesPas(db, MAINTENANT, fabriquerSante(u.n, () => MAINTENANT));
    expect(g.appels.pasHeures <= 20).toBe(true);
    expect([...groupe.jours.entries()]).toEqual([...unParUn.jours.entries()]);
    expect(groupe.habituel).toEqual(unParUn.habituel);
    expect(groupe.heures).toEqual(unParUn.heures);
    expect(groupe.jours.get(new Date(2026, 9, 30).getTime())).toEqual({ etat: "valeur", pas: 7200, source: "sante" });
  });

  it("dimanche 25/10, heure d'hiver (25 heures) : la journée garde ses 12 heures de marche", async () => {
    const { db } = await baseDeTest();
    const x = await lireDonneesPas(db, MAINTENANT, fabriquerSante(natif({ pasHeure: journees, groupe: true }).n, () => MAINTENANT));
    expect(x.jours.get(new Date(2026, 9, 25).getTime())).toEqual({ etat: "valeur", pas: 7200, source: "sante" });
    expect(x.habituel!.every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe("samedi, jour à 0 pas", () => {
  // Santé Connect a un enregistrement de 0 pas ce matin (montre portée, immobile)
  const zero = (t: number) => (t >= AUJ ? 0 : journees(t));
  function zeroCeMatin() {
    const r = natif({ pasHeure: zero, groupe: true });
    const pasHeures = r.n.pasHeures!;
    r.n.pasHeures = async (a, b) => [...(await pasHeures(a, b)), ...(a <= AUJ && AUJ < b ? ([[AUJ + 7 * H, 0]] as [number, number][]) : [])];
    return r.n;
  }

  it("0 pas de Santé Connect est une valeur ; la semaine (lun. → sam.) se calcule", async () => {
    const { db } = await baseDeTest();
    const x = await lireDonneesPas(db, MAINTENANT, fabriquerSante(zeroCeMatin(), () => MAINTENANT));
    expect(x.aujourdhui).toEqual({ etat: "valeur", pas: 0, source: "sante" });
    const lire = (j: number) => {
      const c = x.jours.get(j);
      return c && c.etat === "valeur" ? { pas: c.pas } : null;
    };
    const p = periode("semaine", 0, x.maintenant, lire, (d) => d.pas);
    const s = statsPas(p.jours, x.objectif);
    expect(p.barres.length).toBe(7);
    expect(s.n).toBe(6);
    expect(s.total).toBe(5 * 7200);
    expect(Number.isFinite(s.moyenne!)).toBe(true);
  });

  it("aucun enregistrement ce matin : vide (pas un zéro inventé)", async () => {
    const { db } = await baseDeTest();
    const x = await lireDonneesPas(db, MAINTENANT, fabriquerSante(natif({ pasHeure: zero, groupe: true }).n, () => MAINTENANT));
    expect(x.aujourdhui).toEqual({ etat: "vide", source: "sante" });
  });
});
