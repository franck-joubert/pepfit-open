// Vue « Semaine » des statistiques (décision du 31/10, planche sport-stats) : la semaine calendaire, du lundi au
// dimanche ; celle en cours est partielle, ses jours à venir sont vides et hors des moyennes ; passage à l'heure d'hiver.
process.env.TZ = "Europe/Paris";
import { describe, expect, it } from "./attendu.ts";
import { bornes, decaler, JOUR, joursEntre, lundi, minuit, moyenne, periode, periodeExiste } from "../src/ecrans/mesures/periodes.ts";

// mercredi 28 octobre 2026, 16:42 ; l'heure d'hiver est passée dans la nuit du samedi 24 au dimanche 25
const MAINTENANT = new Date(2026, 9, 28, 16, 42).getTime();
const AUJ = minuit(MAINTENANT);
const jourDe = (ms: number) => { const d = new Date(ms); return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()]; };

describe("semaine calendaire", () => {
  it("semaine partielle : lundi → aujourd'hui lus, les jours à venir vides (ni lus, ni zéro)", () => {
    const lus: number[] = [];
    const p = periode("semaine", 0, MAINTENANT, (j) => (lus.push(j), { v: 5 }), (d) => d.v);
    expect(jourDe(p.debut)).toEqual([2026, 10, 26, 0]);
    expect(jourDe(p.fin)).toEqual([2026, 11, 2, 0]);
    expect(p.barres.length).toBe(7);
    expect(p.jours.length).toBe(3);
    expect(lus.every((j) => j <= AUJ)).toBe(true);
    expect(p.barres.map((b) => b.enCours)).toEqual([false, false, true, false, false, false, false]);
    expect(p.barres.map((b) => b.aVenir)).toEqual([false, false, false, true, true, true, true]);
    for (const b of p.barres.slice(3)) {
      expect(b.v).toBeNull();
      expect(b.jours).toEqual([]);
    }
    expect(jourDe(p.barres[6]!.debut)).toEqual([2026, 11, 1, 0]);
  });

  it("la moyenne ne compte que les jours écoulés avec une donnée", () => {
    const valeurs = new Map([[decaler(AUJ, -2), 6000], [AUJ, 9000]]);
    const p = periode("semaine", 0, MAINTENANT, (j) => (valeurs.has(j) ? { pas: valeurs.get(j)! } : null), (d) => d.pas);
    expect(moyenne(p.barres.map((b) => b.v))).toBe(7500);
    expect(moyenne(p.jours.map((j) => j.v))).toBe(7500);
  });

  it("le lundi, la semaine n'a qu'un jour ; le dimanche soir, elle est entière", () => {
    const lundiMatin = new Date(2026, 10, 2, 0, 30).getTime();
    const p = periode("semaine", 0, lundiMatin, () => null, () => null);
    expect(p.jours.length).toBe(1);
    expect(p.barres[0]!.enCours).toBe(true);
    const dimanche = new Date(2026, 10, 1, 23, 50).getTime();
    const q = periode("semaine", 0, dimanche, () => null, () => null);
    expect(q.jours.length).toBe(7);
    expect(q.barres.some((b) => b.aVenir)).toBe(false);
    expect(q.barres[6]!.enCours).toBe(true);
  });

  it("passage à l'heure d'hiver : la semaine du 19 au 25 oct. a 7 jours à minuit et dure 7 jours + 1 h", () => {
    const b = bornes("semaine", 1, MAINTENANT);
    expect(jourDe(b.debut)).toEqual([2026, 10, 19, 0]);
    expect(jourDe(b.fin)).toEqual([2026, 10, 26, 0]);
    expect(b.fin - b.debut).toBe(7 * JOUR + 3_600_000);
    const jours = joursEntre(b.debut, b.fin);
    expect(jours.length).toBe(7);
    expect(jours.every((j) => new Date(j).getHours() === 0)).toBe(true);
    // dimanche 25, 23:30 (heure d'hiver) : encore la semaine du lundi 19
    const dimanche = new Date(2026, 9, 25, 23, 30).getTime();
    expect(lundi(dimanche)).toBe(b.debut);
    expect(periode("semaine", 0, dimanche, () => null, () => null).jours.length).toBe(7);
  });

  it("navigation : chaque semaine commence un lundi et touche la suivante", () => {
    for (let k = 0; k < 60; k++) {
      const a = bornes("semaine", k, MAINTENANT);
      const avant = bornes("semaine", k + 1, MAINTENANT);
      expect(new Date(a.debut).getDay()).toBe(1);
      expect(new Date(a.debut).getHours()).toBe(0);
      expect(avant.fin).toBe(a.debut);
    }
    // historique depuis le mardi 20 oct. : la semaine du 19 existe, pas celle du 12
    expect(periodeExiste("semaine", 1, MAINTENANT, new Date(2026, 9, 20, 8).getTime())).toBe(true);
    expect(periodeExiste("semaine", 2, MAINTENANT, new Date(2026, 9, 20, 8).getTime())).toBe(false);
  });

  it("mois et année inchangés : 30 jours glissants, 12 mois civils", () => {
    const m = bornes("mois", 0, MAINTENANT);
    expect(m.fin).toBe(decaler(AUJ, 1));
    expect(m.debut).toBe(decaler(AUJ, -29));
    expect(periode("annee", 0, MAINTENANT, () => null, () => null).barres.length).toBe(12);
  });
});
