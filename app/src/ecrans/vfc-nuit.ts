// La VFC d'une nuit (docs/SANS-WHOOP.md, C15) : la moyenne des mesures prises pendant la session de sommeil (et la demi-heure
// qui suit le réveil), au lieu de la DERNIÈRE mesure du jour civil. Oura en écrit plusieurs par nuit ; une mesure ponctuelle
// de l'après-midi ne remplace plus celle de la nuit. Sans session connue, la nuit va de 18:00 la veille à midi. Une mesure
// hors de toute nuit ne sert que pour un jour qui n'a rien de la nuit (la plus récente, comme avant). Pur : tests/sans-whoop.test.ts.

const MIN = 60_000;
const APRES_REVEIL_MS = 30 * MIN;

const minuitDe = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
/** Jour de réveil (minuit) d'une mesure dans la nuit par défaut (18:00 la veille → midi), null hors nuit. */
const nuitParDefaut = (t: number): number | null => {
  const h = new Date(t).getHours();
  return h >= 18 ? minuitDe(t + 12 * 3_600_000) : h < 12 ? minuitDe(t) : null;
};

export interface VfcNuit<M> {
  valeur: number;
  /** La plus récente des mesures retenues (sa source, sa date). */
  derniere: M;
  n: number;
}

/** La VFC de chaque nuit (jour de réveil, minuit local) ; `sessions` : les nuits de Santé Connect, si on les a. */
export function vfcDesNuits<M extends { date: number; valeur: number }>(mesures: readonly M[], sessions: readonly { debut: number; fin: number }[] = []): Map<number, VfcNuit<M>> {
  const nuit = new Map<number, M[]>();
  const jour = new Map<number, M>();
  for (const m of mesures) {
    if (!(m.valeur > 0)) continue;
    const s = sessions.find((x) => m.date >= x.debut && m.date <= x.fin + APRES_REVEIL_MS);
    const j = s ? minuitDe(s.fin) : nuitParDefaut(m.date);
    if (j != null) nuit.set(j, [...(nuit.get(j) ?? []), m]);
    else {
      const c = minuitDe(m.date);
      const d = jour.get(c);
      if (!d || m.date > d.date) jour.set(c, m);
    }
  }
  const out = new Map<number, VfcNuit<M>>();
  for (const [j, l] of nuit) {
    const derniere = l.reduce((a, b) => (b.date > a.date ? b : a));
    out.set(j, { valeur: l.reduce((a, b) => a + b.valeur, 0) / l.length, derniere, n: l.length });
  }
  for (const [j, m] of jour) if (!out.has(j)) out.set(j, { valeur: m.valeur, derniere: m, n: 1 });
  return out;
}
