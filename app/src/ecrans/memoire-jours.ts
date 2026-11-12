// Mémoire des lectures d'un jour, au niveau de l'onglet (docs/JAUGES-PASSE.md, 31/10) : les jauges de Sport et la carte des
// capteurs ne repartent plus de zéro à chaque page montée. Une page de jour est démontée dès qu'elle n'est plus la veille, le
// jour ou le lendemain du jour choisi : sans mémoire, revenir sur aujourd'hui relisait tout, carte repliée en attendant.
//   - ce qui a été lu est rendu tout de suite (`lu`), puis relu en douceur si la valeur a vieilli ;
//   - deux lectures du même jour en même temps n'en font qu'une (la rangée et la ligne fixe lisent le même jour) ;
//   - une lecture ne dure jamais plus de `delaiMs` : passé ce délai, le repli (« — ») plutôt qu'un squelette sans fin.
// Pur (sans React Native) : testé par tests/memoire-jours.test.ts.

/** Une promesse bornée : au-delà de `ms`, ou en échec, `repli`. */
export function avecDelai<T, R>(p: Promise<T>, ms: number, repli: R): Promise<T | R> {
  return new Promise((ok) => {
    const minuterie = setTimeout(() => ok(repli), ms);
    p.then(
      (v) => {
        clearTimeout(minuterie);
        ok(v);
      },
      () => {
        clearTimeout(minuterie);
        ok(repli);
      },
    );
  });
}

export interface MemoireJours<T> {
  /** Dernière valeur lue pour ce jour (même vieillie), sinon undefined. */
  lu(cle: string): T | undefined;
  /** Lue il y a moins de `vieMs` (pas besoin de relire). */
  frais(cle: string, maintenant?: number): boolean;
  /** Lit le jour (ou rejoint la lecture en cours) et garde le résultat. */
  charger(cle: string, lire: () => Promise<T>): Promise<T>;
  /** Pose une valeur (une lecture en deux temps, comme la référence de la dépense qui suit les chiffres). */
  poser(cle: string, v: T): void;
  oublier(): void;
}

export function creerMemoire<T>({ vieMs, max = 40 }: { vieMs: number; max?: number }): MemoireJours<T> {
  const valeurs = new Map<string, { v: T; lu: number }>();
  const enCours = new Map<string, Promise<T>>();
  const poser = (cle: string, v: T) => {
    valeurs.delete(cle);
    valeurs.set(cle, { v, lu: Date.now() });
    // les plus anciennes lectures partent d'abord : la mémoire ne grossit pas au fil des semaines parcourues
    while (valeurs.size > max) valeurs.delete(valeurs.keys().next().value!);
  };
  return {
    lu: (cle) => valeurs.get(cle)?.v,
    frais: (cle, maintenant = Date.now()) => {
      const x = valeurs.get(cle);
      return x != null && maintenant - x.lu < vieMs;
    },
    charger(cle, lire) {
      const deja = enCours.get(cle);
      if (deja) return deja;
      const p = lire().then(
        (v) => {
          poser(cle, v);
          return v;
        },
      );
      enCours.set(cle, p);
      const fin = () => {
        if (enCours.get(cle) === p) enCours.delete(cle);
      };
      p.then(fin, fin);
      return p;
    },
    poser,
    oublier: () => {
      valeurs.clear();
      enCours.clear();
    },
  };
}

/** Jauges d'un jour (AAAA-MM-JJ) : aujourd'hui et tout jour passé ; jamais un jour à venir (ni elles, ni leur place). */
export const jaugesDuJour = (jour: string, aujourdhui: string) => jour <= aujourdhui;

/** Jours d'une semaine (lundi AAAA-MM-JJ) à lire d'avance : ceux d'avant aujourd'hui compris, sauf celui déjà affiché. */
export function joursAPrecharger(lundi: string, affiche: string, aujourdhui: string): string[] {
  const [a, m, j] = lundi.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(a!, m! - 1, j! + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (iso !== affiche && jaugesDuJour(iso, aujourdhui)) out.push(iso);
  }
  return out;
}
