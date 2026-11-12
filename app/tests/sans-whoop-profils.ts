// Profils de recette « sans Whoop » (docs/AUDIT-SANS-WHOOP.md § 4) pour les tests : le compte de docs/audit-sans-whoop/seed.ts
// (homme né en 1980, 178 cm, 78 kg, 9 courses de 45 min à 18:00, une muscu hier, un footing aujourd'hui, AUCUNE FC en base)
// et un Santé Connect simulé qui rend ce qu'écrit l'écrivain (docs/audit-sans-whoop/ecrivain-sc) : FC continue (1 par minute,
// toutes les 5 s en effort), nuits 23:30 → 07:00 avec stades, pas par heure, un vélo d'une autre appli, et selon le profil la
// FC au repos et la VFC de chaque nuit. Le module natif simulé est celui d'après C2 : la FC d'une plage est rendue en entier.
import type { DatabaseSync } from "node:sqlite";
import { ecrireReglage } from "../src/db/depots/reglages.ts";
import type { Executeur } from "../src/db/executeur.ts";
import { fabriquerSante, PERMISSIONS, PERMISSIONS_PAGE_SANTE, type NatifSante } from "../src/natif/sante/logique.ts";

/** Samedi 31/10/2026, 19:00 (l'horloge figée de la recette). */
export const MAINTENANT = new Date(2026, 9, 31, 19, 0).getTime();
const MIN = 60_000;
const ORIGINE = "fit.pep.recette.sc";

/**
 * fc : FC seule ; fc-sommeil : plus nuits, pas et vélo (Samsung : ni FC au repos ni VFC) ; garmin : plus la FC au repos
 * (pas de VFC) ; complet : plus la VFC ; complet-1min : comme complet, 1 FC par minute même en effort.
 */
export type ProfilSc = "fc" | "fc-sommeil" | "garmin" | "complet" | "complet-1min";

const jourDe = (maintenant: number, n: number) => {
  const d = new Date(maintenant);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
};

/** Efforts de l'écrivain : jour, début (min depuis minuit), durée (min), FC, pas par minute, vélo d'une autre appli. */
const EFFORTS: [number, number, number, number, number, boolean][] = [
  ...[-27, -24, -21, -18, -15, -12, -9, -6, -3].map((n): [number, number, number, number, number, boolean] => [n, 1080, 45, 150, 160, false]),
  [-2, 1080, 60, 138, 0, true],
  [-1, 735, 50, 115, 8, false],
  [0, 600, 40, 132, 140, false],
  [0, 1050, 45, 148, 155, false],
];

/** Le compte de seed.ts, dans une base de test déjà migrée. */
export async function semerCompte(raw: DatabaseSync, db: Executeur, maintenant = MAINTENANT): Promise<void> {
  const a = (h: number, m: number, n = 0) => jourDe(maintenant, n) + (h * 60 + m) * MIN;
  for (const [k, v] of Object.entries({ sexe: "h", naissance: "1980-05-14", annee_naissance: "1980", parcours_fait: "1", langue: "fr", unite: "kg", unite_distance: "km" }))
    await ecrireReglage(db, k, v);
  raw.prepare("INSERT INTO pesee (id, date, kg, source) VALUES ('demo-pesee', ?, 78, 'manuel')").run(a(7, 30, -2));
  raw.prepare("INSERT INTO mensurations (id, type, date, valeur) VALUES ('demo-taille', 'taille', ?, 178)").run(a(7, 30, -20));
  const seance = (id: string, titre: string, debut: number, min: number, activite: string) =>
    raw.prepare("INSERT INTO seances (id, titre, debut, fin, maj_le, activite_id) VALUES (?,?,?,?,?,?)").run(id, titre, debut, debut + min * MIN, maintenant, activite);
  for (const n of [-27, -24, -21, -18, -15, -12, -9, -6, -3]) seance(`demo-c${-n}`, "Course", a(18, 0, n), 45, "cat:course");
  seance("demo-push", "Push A", a(12, 15, -1), 50, "cat:musculation");
  seance("demo-footing", "Footing", a(17, 30, 0), 45, "cat:course");
}

export interface DonneesSc {
  fc: { t: number; bpm: number }[];
  nuits: { debut: number; fin: number; etapes: { debut: number; fin: number; type: number }[] }[];
  pas: { debut: number; fin: number; n: number }[];
  repos: { date: number; bpm: number }[];
  vfc: { date: number; valeur: number }[];
  seances: { debut: number; fin: number; type: number; titre: string }[];
}

/** Ce que l'écrivain met dans Santé Connect pour un profil (28 jours jusqu'à `maintenant`). */
export function donneesSc(profil: ProfilSc, maintenant = MAINTENANT): DonneesSc {
  let graine = 20261031;
  const alea = () => ((graine = (graine * 1103515245 + 12345) % 2147483648), graine / 2147483648);
  const gauss = () => {
    let x = 0;
    for (let i = 0; i < 6; i++) x += alea();
    return (x - 3) / Math.sqrt(0.5);
  };
  const sommeil = profil !== "fc";
  const pasEffort = profil === "complet-1min" ? 60_000 : 5_000;
  const effortA = (t: number) => EFFORTS.find(([n, deb, min]) => t >= jourDe(maintenant, n) + deb * MIN && t < jourDe(maintenant, n) + (deb + min) * MIN) ?? null;
  const JOURS = 27;
  const baseNuit: number[] = [];
  const vfcNuit: number[] = [];
  for (let n = -JOURS; n <= 0; n++) {
    const dur = EFFORTS.some(([j, , , bpm]) => j === n - 1 && bpm >= 138);
    baseNuit[n + JOURS] = 52 + 1.6 * gauss() + (dur ? 3 : 0);
    vfcNuit[n + JOURS] = 56 * Math.exp(0.1 * gauss() - (dur ? 0.15 : 0));
  }
  vfcNuit[JOURS] = 60;
  const d: DonneesSc = { fc: [], nuits: [], pas: [], repos: [], vfc: [], seances: [] };
  for (let n = -JOURS; n <= 0; n++) {
    const jour = jourDe(maintenant, n);
    const finJour = Math.min(jour + (23 * 60 + 30) * MIN, maintenant);
    for (let t = jour - 30 * MIN; t < finJour; t += effortA(t) ? pasEffort : MIN) {
      const h = new Date(t);
      const m = h.getHours() * 60 + h.getMinutes();
      const e = effortA(t);
      let bpm: number;
      if (e) bpm = e[3] + 4 * gauss();
      else if (m >= 23 * 60 + 30 || m < 7 * 60) {
        const reveil = m >= 23 * 60 + 30 ? n + 1 : n;
        const phase = (m >= 23 * 60 + 30 ? m - (23 * 60 + 30) : m + 30) / 450;
        bpm = baseNuit[Math.min(JOURS, reveil + JOURS)]! + 4 * Math.abs(phase - 0.45) + 1.5 * gauss();
      } else bpm = 72 + 4 * gauss() + ((m >= 510 && m < 540) || (m >= 720 && m < 735) ? 18 : 0);
      d.fc.push({ t, bpm: Math.round(Math.max(40, bpm)) });
    }
    if (!sommeil) continue;
    for (let hh = 7; hh < 23; hh++) {
      const a = jour + hh * 3_600_000;
      if (a + 3_600_000 > maintenant) break;
      let pas = 400 + 300 * alea() + (hh === 8 || hh === 12 ? 1500 : 0);
      for (let t = a; t < a + 3_600_000; t += MIN) pas += effortA(t)?.[4] ?? 0;
      d.pas.push({ debut: a, fin: a + 3_600_000, n: Math.round(pas) });
    }
    const sa = jour - 30 * MIN + Math.round((alea() - 0.5) * 40) * MIN;
    const sz = jour + (7 * 60 + Math.round((alea() - 0.5) * 30)) * MIN;
    if (sz <= maintenant) {
      // stades Santé Connect : 1 éveil, 4 léger, 5 profond, 6 paradoxal
      const etapes: DonneesSc["nuits"][number]["etapes"] = [];
      let t = sa;
      for (let cycle = 0; t < sz; cycle++) {
        for (const [type, base] of [[4, 25], [5, 30], [4, 15], [6, 17], [1, 3]] as const) {
          const min = type === 5 ? (cycle < 2 ? 30 : 10) : type === 6 ? 12 + 6 * cycle : base;
          const fin = Math.min(sz, t + min * MIN);
          if (fin > t) etapes.push({ debut: t, fin, type });
          t = fin;
          if (t >= sz) break;
        }
      }
      d.nuits.push({ debut: sa, fin: sz, etapes });
      if (profil !== "fc-sommeil") d.repos.push({ date: sz, bpm: Math.round(baseNuit[n + JOURS]! - 2) });
      if (profil === "complet" || profil === "complet-1min") d.vfc.push({ date: sz - 15 * MIN, valeur: Math.round(vfcNuit[n + JOURS]! * 10) / 10 });
    }
    for (const [j, deb, min, , , velo] of EFFORTS)
      if (j === n && velo && jour + (deb + min) * MIN <= maintenant) d.seances.push({ debut: jour + deb * MIN, fin: jour + (deb + min) * MIN, type: 8, titre: "Vélo" });
  }
  return d;
}

/** Le module natif simulé : Santé Connect de l'émulateur, avec les autorisations de l'accueil (FC comprise). `pasVides` :
 * l'agrégat des pas ne rend rien (l'appli de la montre hors des priorités de Santé Connect, C12). */
export function natifSc(profil: ProfilSc, o: { maintenant?: number; pasVides?: boolean; sansFc?: boolean } = {}): NatifSante & { d: DonneesSc } {
  const d = donneesSc(profil, o.maintenant ?? MAINTENANT);
  const dans = (t: number, a: number, b: number) => t >= a && t <= b;
  const perms = PERMISSIONS_PAGE_SANTE.filter((p) => !(o.sansFc && p === "fc-montre")).map((p) => PERMISSIONS[p]);
  const pasEntre = (a: number, b: number) => {
    const l = d.pas.filter((p) => p.debut >= a && p.fin <= b);
    return o.pasVides || !l.length ? -1 : l.reduce((s, p) => s + p.n, 0);
  };
  return {
    d,
    statut: async () => 3,
    autorisees: async () => perms,
    demander: async (p) => p,
    poids: async () => [],
    pas: async (bornes) => bornes.slice(1).map((b, i) => pasEntre(bornes[i]!, b)),
    pasHeures: async (a, b) => (o.pasVides ? [] : d.pas.filter((p) => p.debut >= a && p.debut < b).map((p) => [p.debut, p.n] as [number, number])),
    sommeil: async (a, b) => d.nuits.filter((s) => dans(s.debut, a, b)).map((s) => ({ ...s, origine: ORIGINE })),
    frequenceRepos: async (a, b) => d.repos.filter((r) => dans(r.date, a, b)).map((r) => ({ ...r, origine: ORIGINE })),
    exporter: async () => undefined,
    mesures: async (type, a, b) => (type === "vfc" ? d.vfc.filter((v) => dans(v.date, a, b)).map((v) => ({ ...v, origine: ORIGINE })) : []),
    seancesSport: async (a, b) => d.seances.filter((s) => s.fin >= a && s.debut <= b).map((s) => ({ ...s, origine: ORIGINE })),
    kcalActives: async (bornes) => bornes.slice(1).map(() => -1),
    distance: async (bornes) => bornes.slice(1).map(() => -1),
    fc: async (a, b) => d.fc.filter((x) => dans(x.t, a, b)),
    originesPas: async (a, b) => (d.pas.some((p) => p.debut >= a && p.debut < b) ? [ORIGINE] : []),
    installees: async () => [],
    ouvrir: async () => undefined,
  };
}

/** La façade Santé de l'appli sur le Santé Connect simulé (à mettre dans `sante` avec Object.assign). */
export const santeSc = (profil: ProfilSc, o: Parameters<typeof natifSc>[1] = {}) => fabriquerSante(natifSc(profil, o), () => o.maintenant ?? MAINTENANT, 60_000);
