// Régularité du sommeil sans Whoop (docs/SANS-WHOOP.md, C8) : l'indice de régularité du sommeil (SRI, Phillips 2017, celui de
// Windred 2024 que lit l'Âge pepfit), calculé sur les nuits de Santé Connect. Pour chaque jour de réveil J : la part des
// minutes où l'on est dans le même état (endormi ou éveillé) à 24 h d'écart, entre la fenêtre de midi la veille à midi J et
// celle d'un jour plus tôt ; SRI = 200 × part − 100 (100 : mêmes heures chaque nuit ; 0 : au hasard). Il faut les deux nuits.
// Pur : tests/sans-whoop.test.ts.

const MIN_MS = 60_000;
const FENETRE_MIN = 1440;

const minuitDe = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
const midiAvant = (jour: number) => {
  const d = new Date(jour);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12).getTime();
};

/** Minutes endormies de la fenêtre [midi la veille, midi J[ (1440 cases) d'après les sessions de sommeil. */
function fenetre(jour: number, sessions: readonly { debut: number; fin: number }[]): Uint8Array {
  const a = midiAvant(jour);
  const out = new Uint8Array(FENETRE_MIN);
  for (const s of sessions) {
    const i0 = Math.max(0, Math.floor((s.debut - a) / MIN_MS));
    const i1 = Math.min(FENETRE_MIN, Math.ceil((s.fin - a) / MIN_MS));
    for (let i = i0; i < i1; i++) out[i] = 1;
  }
  return out;
}

/** SRI de chaque jour de réveil (minuit local) qui a une nuit et une nuit la veille ; les sessions viennent de Santé Connect. */
export function regulariteNuits(sessions: readonly { debut: number; fin: number }[]): Map<number, number> {
  const parJour = new Map<number, { debut: number; fin: number }[]>();
  for (const s of sessions) {
    if (!(s.fin > s.debut)) continue;
    const j = minuitDe(s.fin);
    const l = parJour.get(j) ?? [];
    l.push(s);
    parJour.set(j, l);
  }
  const out = new Map<number, number>();
  const jours = [...parJour.keys()].sort((x, y) => x - y);
  for (const j of jours) {
    const veille = minuitDe(midiAvant(j));
    if (!parJour.has(veille)) continue;
    // une session qui déborde (sieste de l'après-midi, nuit commencée avant midi) compte dans les deux fenêtres qu'elle touche
    const tout = [...parJour.get(j)!, ...parJour.get(veille)!];
    const f = fenetre(j, tout);
    const g = fenetre(veille, tout);
    let pareil = 0;
    for (let i = 0; i < FENETRE_MIN; i++) if (f[i] === g[i]) pareil++;
    out.set(j, Math.round((200 * pareil) / FENETRE_MIN - 100));
  }
  return out;
}
