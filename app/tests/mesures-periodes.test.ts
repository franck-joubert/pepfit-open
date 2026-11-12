// Gabarit des pages de mesure (planche pas) : périodes (semaine du lundi au dimanche, 30 jours, 12 mois civils), jours sans donnée
// hors des moyennes, colonne touchée, position d'un jour passé, lecture groupée des pas de Santé Connect.
import { describe, expect, it } from "./attendu.ts";
import { baseDeTest } from "./aide.ts";
import { bornes, court, decaler, ecartRelatif, meilleur, minuit, moyenne, periode, periodeExiste, positionDuJour, signe } from "../src/ecrans/mesures/periodes.ts";
import { colonne } from "../src/ecrans/mesures/colonne.ts";
import { lirePasJours, derniersJours, type SantePas } from "../src/ecrans/pas-source.ts";
import { fabriquerSante, type NatifSante } from "../src/natif/sante/logique.ts";

const MAINTENANT = new Date(2026, 9, 28, 16, 42).getTime();
const AUJ = minuit(MAINTENANT);

describe("périodes", () => {
  it("semaine : du lundi au dimanche (mercredi 28 oct. : 26 oct. – 1 nov.) ; k = 1 : la semaine d'avant", () => {
    const b0 = bornes("semaine", 0, MAINTENANT);
    expect(b0.debut).toBe(decaler(AUJ, -2));
    expect(b0.fin).toBe(decaler(AUJ, 5));
    const b1 = bornes("semaine", 1, MAINTENANT);
    expect(b1.fin).toBe(b0.debut);
    expect(b1.debut).toBe(decaler(AUJ, -9));
  });
  it("année : 12 mois civils, le mois en cours en dernier", () => {
    const p = periode("annee", 0, MAINTENANT, () => null, () => null);
    expect(p.barres.length).toBe(12);
    expect(new Date(p.barres[11]!.debut).getMonth()).toBe(9);
    expect(new Date(p.barres[0]!.debut).getMonth()).toBe(10);
    expect(p.barres[11]!.enCours).toBe(true);
  });
  it("un jour sans donnée ne compte ni dans la moyenne ni comme un zéro", () => {
    const valeurs: Record<number, number | null> = { [AUJ]: 6000, [decaler(AUJ, -1)]: null, [decaler(AUJ, -2)]: 8000 };
    const p = periode("semaine", 0, MAINTENANT, (j) => (j in valeurs ? (valeurs[j] == null ? null : { pas: valeurs[j]! }) : null), (d) => d.pas);
    expect(p.barres.length).toBe(7);
    expect(p.barres[2]!.enCours).toBe(true);
    expect(p.barres[1]!.v).toBeNull();
    expect(moyenne(p.barres.map((b) => b.v))).toBe(7000);
    expect(meilleur(p.barres)!.v).toBe(8000);
  });
  it("mois : moyenne mensuelle des seuls jours avec donnée", () => {
    const p = periode("annee", 0, MAINTENANT, (j) => (new Date(j).getMonth() === 9 && new Date(j).getDate() <= 2 ? { v: new Date(j).getDate() * 1000 } : null), (d) => d.v);
    expect(p.barres[11]!.v).toBe(1500);
    expect(p.barres[10]!.v).toBeNull();
  });
  it("la période d'avant existe tant qu'elle touche l'historique", () => {
    expect(periodeExiste("semaine", 1, MAINTENANT, decaler(AUJ, -8))).toBe(true);
    expect(periodeExiste("semaine", 2, MAINTENANT, decaler(AUJ, -8))).toBe(false);
    expect(periodeExiste("semaine", 1, MAINTENANT, null)).toBe(false);
  });
  it("un jour passé : la semaine s'il y est, sinon le mois qui le contient", () => {
    expect(positionDuJour(decaler(AUJ, -2), MAINTENANT)).toEqual({ type: "semaine", k: 0, i: 0 });
    expect(positionDuJour(decaler(AUJ, -3), MAINTENANT)).toEqual({ type: "mois", k: 0, i: 26 });
    expect(positionDuJour(decaler(AUJ, -10), MAINTENANT)).toEqual({ type: "mois", k: 0, i: 19 });
    expect(positionDuJour(decaler(AUJ, -31), MAINTENANT)).toEqual({ type: "mois", k: 1, i: 28 });
  });
  it("formats : valeur courte, signe, écart", () => {
    expect(court(10678)).toBe("10,7k");
    expect(court(950)).toBe("950");
    expect(signe(-0.32, 2)).toBe("−0,32");
    expect(signe(1.3, 1)).toBe("+1,3");
    expect(ecartRelatif(7403, 9360)!.toFixed(2)).toBe("-0.21");
    expect(ecartRelatif(1, null)).toBeNull();
  });
});

describe("piste", () => {
  it("colonnes jointives : un toucher prend toujours la plus proche", () => {
    expect(colonne(0, 344, 7)).toBe(0);
    expect(colonne(343, 344, 7)).toBe(6);
    expect(colonne(-20, 344, 7)).toBe(0);
    expect(colonne(400, 344, 7)).toBe(6);
    expect(colonne(170, 340, 30)).toBe(15);
  });
});

describe("pas lus en une fois", () => {
  it("Santé Connect : une seule lecture pour une suite de jours ; Whoop garde la priorité", async () => {
    const { db } = await baseDeTest();
    const jours = derniersJours(7, MAINTENANT);
    let appels = 0;
    const s: SantePas = {
      autorisees: async () => ["pas"],
      pasEntre: async () => {
        throw new Error("lecture jour par jour");
      },
      pasIntervalles: async (b) => {
        appels++;
        return b.slice(1).map((_, i) => (i === 3 ? null : 1000 * (i + 1)));
      },
    };
    const l = await lirePasJours(db, jours, MAINTENANT, s);
    expect(appels).toBe(1);
    expect(l.map((c) => (c.etat === "valeur" ? c.pas : null))).toEqual([1000, 2000, 3000, null, 5000, 6000, 7000]);
  });
  it("le pont Santé Connect découpe les intervalles et rend null sans donnée", async () => {
    const natif = {
      statut: async () => 3,
      autorisees: async () => ["android.permission.health.READ_STEPS"],
      pas: async (b: number[]) => b.slice(1).map((_, i) => (i === 1 ? -1 : 100 * i + 0.4)),
    } as unknown as NatifSante;
    const sante = fabriquerSante(natif, () => MAINTENANT);
    expect(await sante.pasIntervalles([0, 1, 2, 3])).toEqual([0, null, 200]);
    expect(await sante.pasIntervalles([0])).toEqual([]);
  });
});
