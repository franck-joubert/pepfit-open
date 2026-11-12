// Textes de la précision pepfit (planche, sections 1 à 7) : noms des caps, des calculs et des étapes, ce que chaque calcul
// sait déjà, ce qui manque à une lecture, lignes de « Tout ce qui compte ». Pur : tests/precision-vue.test.ts.
import { t, tp } from "../i18n/index";
import { jourMois } from "../ecrans/format";
import type { NomIcone } from "../ui/Icone";
import type { Precision } from "../ecrans/energie-precision";
import {
  ACTIONS, calculer, etapesCalcul, LECTURES, lecture, qualites, regulariteMesuree, toutesEtapes, vieille, type Cap, type DonneesPrecision, type Etape, type IdAction, type IdCalcul,
  type IdLecture, type MesureDatee, type Resultat,
} from "./modele";
import type { FaitsPrecision } from "./lire";

export const pc = (n: number) => t("precision.pc", { n: Math.max(0, Math.floor(n)) });
export const gain = (n: number) => t("precision.gain", { n: Math.max(0, Math.floor(n)) });
export const nomCap = (c: Cap) => t(`precision.cap.${c.id}`);
export const texteCap = (c: Cap) => t(`precision.capTexte.${c.id}`);
/** Mot seul (« Bonne ») : sous un titre « Précision » (P10). */
export const motPrecision = (n: Precision) => t(`precision.mot.${n}`);
/** Libellé complet (« Bonne précision ») : partout ailleurs, ceux de l'Énergie. */
export const libellePrecision = (n: Precision) => t(`sante.precision.${n}`);
export const nomCalcul = (id: IdCalcul) => t(`precision.calcul.${id}`);
export const titreFeuille = (id: IdCalcul) => t(`precision.feuille.${id}`);
export const nomLecture = (id: IdLecture) => t(`precision.lecture.${id}`);
/** Titre d'une étape ; avec les données, « Refais ton test VMA » ou « Mets ta FC max à jour » quand la mesure existe déjà. */
export function texteEtape(id: IdAction, d?: DonneesPrecision): string {
  if (id === "vma" && (d?.vma === "test" || d?.vma === "vieux")) return t("precision.etape.vmaRefaire");
  if (id === "fcmax" && d?.fcMax === "mesuree") return t("precision.etape.fcmaxMaj");
  return t(`precision.etape.${id}`);
}
export const avecEtape = (id: IdAction) => t(`precision.avec.${id}`);

export const ICONE_CALCUL: Record<IdCalcul, NomIcone> = {
  depense: "energie", objectifs: "cible", bilan: "balance", zones: "pouls", effort: "flamme", vo2: "souffle", age: "agePepfit",
  composition: "regle", sommeil: "lune", recup: "pouls", rm: "dumbbell", reco: "repeat",
};
export const ICONE_ACTION: Record<IdAction, NomIcone> = {
  profil: "user", naissance: "cal", sexe: "user", taille: "regle", pesee: "poids", tour: "regle", capteur: "montre", nuits: "lune", pas: "pas",
  fcseance: "pouls", semaines: "flamme", repas: "nutrition", pesees: "poids", vma: "course", gras: "balance", fcmax: "pouls", reco: "repeat",
  muscu: "dumbbell",
};

/** Ancienneté lisible : « 12 jours », « 3 mois », « 5 ans ». */
export function duree(j: number): string {
  if (j < 60) return tp("precision.duree.jours", j);
  if (j < 365) return tp("precision.duree.mois", Math.round(j / 30.4));
  return tp("precision.duree.ans", Math.floor(j / 365));
}
/** « aujourd'hui », « il y a 5 ans ». */
export const ilYaDuree = (j: number) => (j <= 0 ? t("precision.aujourdhui") : t("precision.ilYa", { d: duree(j) }));

const nomSource = (f: Pick<FaitsPrecision, "whoop">) => (f.whoop ? "Whoop" : t("sante.santeConnect"));

/** Ligne sous une étape : où l'on en est, et le temps qu'il faut (« 12 jours sur 30 · en 30 jours »). `calcul` : dans la
 * feuille d'un calcul, le détail qui parle de lui (« balance ou saisie : ta masse maigre » pour la dépense). */
export function detailEtape(id: IdAction, d: DonneesPrecision, femme = false, calcul?: IdCalcul): string {
  switch (id) {
    case "profil":
      return t("precision.detail.profil");
    case "tour":
      if (d.tourJours != null && vieille(d.tourJours, "tour")) return t("precision.detail.tourVieux", { d: ilYaDuree(d.tourJours) });
      return t(femme ? "precision.detail.tourF" : "precision.detail.tour");
    case "pas":
      return t("precision.detail.pas");
    case "capteur":
      return t("precision.detail.capteur");
    case "repas":
      return calcul === "depense" ? t("precision.detail.repasRecalage", { n: d.nut28 }) : t("precision.detail.repas", { n: d.nut30 });
    case "fcseance":
      return tp("precision.detail.fcseance", d.fcSeances28);
    case "nuits":
      return t("precision.detail.nuits", { n: d.nuits14 });
    case "vma":
      return (d.vma === "test" || d.vma === "vieux") && d.vmaJours != null && vieille(d.vmaJours, "vma")
        ? t("precision.detail.vmaVieux", { d: duree(d.vmaJours) })
        : t("precision.detail.vma");
    case "gras":
      if (d.grasSource && d.grasJours != null && vieille(d.grasJours, "gras")) return t("precision.detail.grasVieux", { d: ilYaDuree(d.grasJours) });
      return calcul === "depense" || calcul === "age" || calcul === "objectifs" ? t("precision.detail.grasMaigre") : t("precision.detail.gras");
    case "pesee":
      return d.poidsJours != null ? t("precision.detail.pesee", { d: ilYaDuree(d.poidsJours) }) : "";
    case "fcmax":
      return d.fcMax === "mesuree" && d.fcMaxJours != null ? t("precision.detail.fcmaxVieux", { d: ilYaDuree(d.fcMaxJours) }) : t("precision.detail.fcmax");
    case "reco":
      return t("precision.detail.reco", { n: d.choixReco });
    case "muscu":
      return t("precision.detail.muscu", { n: d.muscu8 ?? 0 });
    case "pesees":
      return t("precision.detail.pesees", { n: d.semainesPesees });
    case "semaines":
      return t("precision.detail.semaines", { n: d.semainesActives });
    default:
      return "";
  }
}

/** « +4 % avec ton tour de taille » ; « tout est ouvert » au plus haut sans étape. */
export function ligneCarte(r: Resultat, e: Etape | null): { gain: string | null; texte: string } {
  if (!e) return { gain: null, texte: r.score >= 85 ? t("precision.toutOuvert") : "" };
  return { gain: gain(e.affiche), texte: avecEtape(e.id) };
}

const profilComplet = (d: DonneesPrecision) => !!(d.naissance && d.sexe && d.taille && d.poidsJours != null);

/** Ce qu'il manque pour qu'un calcul passe son seuil : une seule action suffit (« ou »), sinon les deux meilleures (« et »). */
export type Manque = { id: IdAction; n?: number };
export function manquesPour(d: DonneesPrecision, calcul: IdCalcul, min: number): { mode: "seule" | "ensemble"; l: Manque[] } | null {
  const p = (x: DonneesPrecision) => calculer(x).p[calcul] ?? 0;
  if (p(d) >= min) return null;
  const seules: (Manque & { delai: number; peine: number })[] = [];
  for (const a of ACTIONS) {
    if (a.tiroir || !a.si(d)) continue;
    if (a.id === "nuits") {
      // les nuits : le nombre qu'il faut, pas « dors avec ta montre » en entier
      for (let k = 1; d.nuits14 + k <= 14; k++) {
        if (p({ ...d, nuits14: d.nuits14 + k }) >= min) {
          seules.push({ id: "nuits", n: k, delai: k, peine: 1 });
          break;
        }
      }
      continue;
    }
    if (p(a.fait(d)) >= min) seules.push({ id: a.id, delai: a.delai, peine: a.effort ?? 1 });
  }
  if (seules.length) {
    // la plus simple tout de suite, et la plus courte qui demande du temps (« ton tour de taille ou 3 nuits »)
    const tout = seules.filter((x) => !x.delai).sort((x, y) => x.peine - y.peine);
    const temps = seules.filter((x) => x.delai).sort((x, y) => x.delai - y.delai);
    const l = tout.length && temps.length ? [tout[0]!, temps[0]!] : [...tout, ...temps].slice(0, 2);
    return { mode: "seule", l: l.map(({ id, n }) => (n == null ? { id } : { id, n })) };
  }
  // aucune ne suffit seule : les deux qui rapportent le plus au calcul (une montre d'abord, pas les plus rapides)
  // (la seconde choisie une fois la première faite : une montre apporte déjà les pas)
  const meilleure = (x: DonneesPrecision) => etapesCalcul(x, calcul, 6).sort((a, b) => b.gain - a.gain)[0] ?? null;
  const e1 = meilleure(d);
  const e2 = e1 ? meilleure(ACTIONS.find((a) => a.id === e1.id)!.fait(d)) : null;
  const e = [e1, e2].filter((x): x is NonNullable<typeof x> => x != null);
  if (e.length) return { mode: "ensemble", l: e.map((x) => ({ id: x.id })) };
  // rien ne fait monter le calcul seul (l'âge sans date de naissance ni montre) : les deux qu'il faut ensemble
  const l: Manque[] = [];
  if (d.naissance !== "date") l.push({ id: d.sexe && d.taille ? "naissance" : "profil" });
  if (!d.capteur) l.push({ id: "capteur" });
  return l.length ? { mode: "ensemble", l } : null;
}

export const texteManque = (m: Manque) => (m.id === "nuits" && m.n != null ? tp("precision.manque.nuits", m.n) : t(`precision.manque.${m.id}` as "precision.manque.tour"));

/** Facteurs de l'Âge pepfit qui ont une donnée (la date de naissance est une condition, pas un facteur). */
export function facteursAge(d: DonneesPrecision): string[] {
  const l: string[] = [];
  if (d.nuits14 + (d.nuitsAvant ?? 0) > 0) l.push(t("precision.facteur.fcRepos"), t("precision.facteur.sommeil"));
  if (regulariteMesuree(d)) l.push(t("precision.facteur.regularite"));
  if (d.pas14 + (d.pasAvant ?? 0) > 0) l.push(t("precision.facteur.pas"));
  if (d.fcSeances28 > 0) l.push(t("precision.facteur.zones"));
  if (d.muscu8) l.push(t("precision.facteur.muscu"));
  if (d.vma) l.push(t("precision.facteur.vo2"));
  if (d.grasSource || d.navyJours != null) l.push(t("precision.facteur.maigre"));
  return l;
}
/** Nombre de facteurs (sur 9) : temps en zones compte pour deux (zones 1-3 et 4-5). */
export const nbFacteurs = (d: DonneesPrecision) => facteursAge(d).length + (d.fcSeances28 > 0 ? 1 : 0);

/** Ce que chaque calcul sait déjà (ligne de « Tes calculs »). */
export function sousCalcul(id: IdCalcul, d: DonneesPrecision, f: FaitsPrecision, r: Resultat): string {
  switch (id) {
    case "depense":
      if (f.recalee) return t("precision.sous.recalee");
      if (!profilComplet(d)) return t("precision.sous.profilIncomplet");
      return d.pas14 > 0 ? t("precision.sous.profilPas", { source: nomSource(f) }) : t("precision.sous.profilSansPas");
    case "objectifs":
      return r.q.recalage > 0 ? t("precision.sous.ajustes") : lecture(r, "objectifsPerso").ouverte || profilComplet(d) ? t("precision.sous.calcules") : t("precision.sous.parDefaut");
    case "bilan":
      return d.nut30 ? tp("precision.sous.repas", d.nut30) : t("precision.sous.aucunRepas");
    case "zones": {
      const texte = t(`precision.sous.fcMax.${d.fcMax}`);
      return d.fcMax === "mesuree" && d.nuits14 >= 10 ? t("precision.sous.nuitsCourt", { texte, n: d.nuits14 }) : texte;
    }
    case "effort":
      if (d.capteur === "polar") return tp("precision.sous.effortPolar", d.fcSeances28);
      return d.capteur === "whoop" ? t("precision.sous.effortWhoop") : !d.capteur ? t("precision.sous.effortSansMontre") : tp("precision.sous.effortFc", d.fcSeances28);
    case "vo2":
      return d.vma === "test" && f.vmaDate != null ? t("precision.sous.vma.test", { date: jourMois(f.vmaDate) }) : t(`precision.sous.vma.${d.vma ?? "rien"}`);
    case "age": {
      if (lecture(r, "age").ouverte || (r.p.age ?? 0) >= 60) return t("precision.sous.facteurs", { n: nbFacteurs(d) });
      const m = manquesPour(d, "age", 60);
      if (!m) return t("precision.sous.facteurs", { n: nbFacteurs(d) });
      const [a, b] = m.l.map(texteManque);
      if (!b) return t("precision.sous.manque", { a: a! });
      return t(m.mode === "seule" ? "precision.sous.manqueOu" : "precision.sous.manqueEt", { a: a!, b });
    }
    case "composition": {
      if (d.tourJours === 0 && !d.grasSource) return t("precision.sous.tourAujourdhui");
      const l: string[] = [];
      if (d.grasSource === "balance") l.push(t("precision.sous.balance"));
      else if (d.grasSource === "saisie") l.push(t("precision.sous.grasSaisi"));
      if (d.tourJours != null) l.push(d.grasSource ? t("precision.sous.tour") : t("precision.sous.tourEtCou"));
      if (l.length) return l.join(", ");
      if (d.poidsJours == null) return t("precision.sous.aucuneMesure");
      return d.semainesPesees >= 2 ? t("precision.sous.niTourNiGras") : t("precision.sous.unPoids");
    }
    case "sommeil":
      if (d.capteur === "polar") return t("precision.sous.sommeilPolar", { n: d.nuits14 });
      return d.capteur === "whoop" ? t("precision.sous.sommeilWhoop", { n: d.nuits14 }) : !d.capteur ? t("precision.sous.pasDeMontre") : tp("precision.sous.nuits", d.nuits14);
    case "recup":
      if (!d.recup) return t("precision.sous.recupRien");
      return d.recup.jours <= 0 ? tp("precision.sous.recupParts", d.recup.parts) : t("precision.sous.recupVieille", { d: ilYaDuree(d.recup.jours) });
    case "rm":
      return tp("precision.sous.muscu", d.muscu8 ?? 0);
    case "reco":
      return d.choixReco ? tp("precision.sous.choix", d.choixReco) : t("precision.sous.rienAppris");
  }
}

/** Sous-titre de la feuille d'un calcul (« D'après 6 nuits de Santé Connect sur 14 »). */
export function sousTitreFeuille(id: IdCalcul, d: DonneesPrecision, f: FaitsPrecision, r: Resultat): string {
  if (id === "sommeil" && d.capteur && d.nuits14) return t("precision.feuille.nuitsDe", { n: d.nuits14, source: nomSource(f) });
  if (id === "depense" && !f.recalee && profilComplet(d) && d.pas14 > 0) return t("precision.feuille.depenseDe");
  return sousCalcul(id, d, f, r);
}

/** Une ligne de « Tout ce qui compte » : la donnée, son état, et ce qu'elle rapporte (null : elle est pleine, une coche). */
export interface LigneDonnee {
  cle: string;
  icone: NomIcone;
  titre: string;
  sous: string;
  gain: Etape | null;
  action: IdAction | null;
}

const ilYa = (j: number) => tp("precision.jours", j);
/** « Courses GPS sans FC » → « courses GPS sans FC » (les sigles gardent leurs capitales). */
const minusculeInitiale = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function lignesTout(d: DonneesPrecision): LigneDonnee[] {
  const tout = toutesEtapes(d);
  const g = (...ids: IdAction[]) => tout.find((e) => ids.includes(e.id)) ?? null;
  const l: LigneDonnee[] = (
    [
    { cle: "profil", icone: "user", titre: t("precision.donnee.profil"), sous: t("precision.donnee.profilSous"), gain: g("profil", "naissance", "sexe", "taille") },
    {
      cle: "poids",
      icone: "poids",
      titre: t("precision.donnee.poids"),
      sous:
        d.poidsJours == null
          ? t("precision.donnee.jamaisPese")
          : d.poidsJours === 0
            ? t("precision.donnee.poidsAujourdhui", { n: d.semainesPesees })
            : t("precision.donnee.poidsSous", { j: ilYa(d.poidsJours), n: d.semainesPesees }),
      gain: g("pesees", "pesee"),
    },
    {
      cle: "tour",
      icone: "regle",
      titre: t("precision.donnee.tour"),
      sous: d.tourJours == null ? t("precision.donnee.tourJamais") : d.tourJours === 0 ? t("precision.donnee.tourAujourdhui") : t("precision.donnee.tourIlYa", { j: ilYa(d.tourJours) }),
      gain: g("tour", "gras"),
    },
    { cle: "pas", icone: "pas", titre: t("precision.donnee.pas"), sous: t("precision.donnee.pasSous", { n: d.pas14 }), gain: g("pas") },
    { cle: "nuits", icone: "lune", titre: t("precision.donnee.nuits"), sous: t("precision.donnee.surQuatorze", { n: d.nuits14 }), gain: g("nuits", "capteur") },
    { cle: "fc", icone: "pouls", titre: t("precision.donnee.fc"), sous: tp("precision.donnee.fcSous", d.fcSeances28), gain: g("fcseance") },
    { cle: "semaines", icone: "flamme", titre: t("precision.donnee.semaines"), sous: t("precision.donnee.surQuatre", { n: d.semainesActives }), gain: g("semaines") },
    ] as Omit<LigneDonnee, "action">[]
  ).map((x) => ({ ...x, action: x.gain?.id ?? null }));
  if (d.parties?.nutrition !== false)
    l.push({ cle: "repas", icone: "nutrition", titre: t("precision.donnee.repas"), sous: t("precision.donnee.repasSous", { n: d.nut30 }), gain: g("repas"), action: g("repas")?.id ?? null });
  if (d.court) {
    const sous = d.vma === "test" || d.vma === "vieux" ? t("precision.sous.vma." + d.vma as "precision.sous.vma.vieux") : [t("precision.donnee.vmaJamais"), d.vma ? minusculeInitiale(t(`precision.sous.vma.${d.vma}`)) : null].filter(Boolean).join(", ");
    l.push({ cle: "vma", icone: "course", titre: t("precision.donnee.vma"), sous, gain: g("vma"), action: g("vma")?.id ?? null });
  }
  return l;
}

/** « Ce qui la tient » (très rempli, sans étape) : les données qui s'entretiennent. */
export function lignesTient(d: DonneesPrecision): LigneDonnee[] {
  const l: LigneDonnee[] = [];
  if (d.parties?.nutrition !== false) l.push({ cle: "repas", icone: "nutrition", titre: t("precision.donnee.repas"), sous: t("precision.donnee.repasSous", { n: d.nut30 }), gain: null, action: null });
  l.push({ cle: "nuits", icone: "lune", titre: t("precision.donnee.nuits"), sous: t("precision.donnee.surQuatorze", { n: d.nuits14 }), gain: null, action: null });
  l.push({ cle: "pesees", icone: "poids", titre: t("precision.donnee.pesees"), sous: t("precision.donnee.peseesSous", { n: d.semainesPesees }), gain: null, action: null });
  return l;
}

/** Les lectures qu'ouvre un passage de cap (« Âge pepfit · Masses grasse et maigre · Date d'arrivée »). */
export function lecturesOuvertesPar(r: Resultat, avant: readonly string[]): string {
  return r.lectures
    .filter((l) => l.ouverte && !avant.includes(l.id))
    .map((l) => nomLecture(l.id))
    .join(", ");
}

export const ID_LECTURES = LECTURES.map((l) => l.id);

// ---- Le tiroir d'un calcul (docs/PRECISION-AIDE.md) : ce que c'est, pourquoi la note, ce qu'il faut faire -------------

/** Un facteur du calcul : sa donnée, où elle en est (« 0 sur 5 », « test, il y a 5 ans »), pleine ou non, trop vieille. */
export interface Facteur {
  cle: string;
  titre: string;
  valeur: string;
  ok: boolean;
  /** Mesure datée qui a perdu de sa valeur : sa clé de vétusté et son ancienneté. */
  vieux?: { mesure: MesureDatee; jours: number };
}

type CleFacteur =
  | "profil" | "naissance" | "sexe" | "poids" | "pesees" | "pas" | "gras" | "tour" | "recalage" | "repas" | "fcMax" | "nuits" | "regularite"
  | "fcSeance" | "semaines" | "vma" | "muscu" | "reco" | "historique" | "cycle";

/** Les facteurs de chaque calcul, du plus lourd au plus léger (les poids de CALCULS, modele.ts). */
export const FACTEURS_CALCUL: Record<IdCalcul, readonly CleFacteur[]> = {
  depense: ["profil", "poids", "pas", "gras", "recalage"],
  objectifs: ["profil", "poids", "recalage", "gras"],
  bilan: ["repas", "pesees"],
  zones: ["fcMax", "nuits"],
  effort: ["fcSeance", "nuits", "poids", "sexe"],
  vo2: ["vma", "naissance", "sexe"],
  age: ["naissance", "nuits", "pas", "fcSeance", "semaines", "vma", "regularite", "gras"],
  composition: ["poids", "gras", "pesees", "tour"],
  sommeil: ["nuits", "regularite"],
  recup: ["nuits", "regularite"],
  rm: ["muscu"],
  reco: ["reco", "historique"],
};

const surN = (n: number, sur: number) => t("precision.aide.sur", { n, sur });
const avecDate = (texte: string, j: number | null | undefined) => (j == null ? texte : t("precision.aide.virgule", { texte, d: ilYaDuree(j) }));

function facteur(cle: CleFacteur, d: DonneesPrecision): Facteur {
  const q = qualites(d);
  const f = (valeur: string, ok: boolean, vieux?: Facteur["vieux"]): Facteur => ({ cle, titre: t(`precision.aide.f.${cle}`), valeur, ok, ...(vieux ? { vieux } : {}) });
  const date = (mesure: MesureDatee, j: number | null | undefined) => (j != null && vieille(j, mesure) ? { mesure, jours: j } : undefined);
  switch (cle) {
    case "profil": {
      const ok = d.naissance === "date" && d.sexe && d.taille;
      return f(t(ok ? "precision.aide.v.complet" : "precision.aide.v.incomplet"), ok);
    }
    case "naissance":
      return f(t(`precision.aide.v.naissance.${d.naissance ?? "aucune"}`), d.naissance === "date");
    case "sexe":
      return f(t(d.sexe ? "precision.aide.v.indique" : "precision.aide.v.absent"), d.sexe);
    case "poids":
      return f(d.poidsJours == null ? t("precision.aide.v.jamais") : ilYaDuree(d.poidsJours), q.poids >= 1, date("poids", d.poidsJours));
    case "pesees":
      return f(surN(d.semainesPesees, 4), q.pesees >= 1);
    case "pas":
      return f(surN(d.pas14, 14), q.pas >= 1);
    case "gras": {
      if (d.grasSource) return f(avecDate(t(`precision.aide.v.gras.${d.grasSource}`), d.grasJours), q.gras >= 0.99, date("gras", d.grasJours));
      if (d.navyJours != null) return f(avecDate(t("precision.aide.v.gras.tours"), d.navyJours), false, date("gras", d.navyJours));
      return f(t("precision.aide.v.absente"), false);
    }
    case "tour":
      return f(d.tourJours == null ? t("precision.aide.v.jamais") : ilYaDuree(d.tourJours), q.tour >= 1, date("tour", d.tourJours));
    case "recalage":
      if (q.recalage >= 1) return f(t("precision.aide.v.fait"), true);
      if (q.recalage > 0) return f(t("precision.aide.v.repasSur", { n: d.nut28, sur: 24 }), false);
      return f(d.nut28 < 14 ? t("precision.aide.v.repasSur", { n: d.nut28, sur: 14 }) : t("precision.aide.v.peseesSur", { n: d.semainesPesees, sur: 3 }), false);
    case "repas":
      return f(surN(d.nut30, 30), q.nutrition >= 1);
    case "fcMax":
      return f(
        d.fcMax === "mesuree" ? avecDate(t("precision.aide.v.fcMax.mesuree"), d.fcMaxJours) : t(`precision.aide.v.fcMax.${d.fcMax}`),
        q.fcMax >= 1,
        d.fcMax === "mesuree" ? date("fcMax", d.fcMaxJours) : undefined,
      );
    case "nuits":
      return f(d.capteur ? surN(d.nuits14, 14) : t("precision.aide.v.pasDeMontre"), q.nuits >= 1);
    case "regularite":
      return f(t(!q.regularite ? "precision.aide.v.regulariteManque" : d.capteur === "whoop" ? "precision.aide.v.whoop" : "precision.aide.v.nuitsMontre"), q.regularite >= 1);
    case "fcSeance":
      return f(surN(d.fcSeances28, 4), q.fcSeance >= 1);
    case "semaines":
      return f(surN(d.semainesActives, 4), q.semaines >= 1);
    case "vma": {
      const test = d.vma === "test" || d.vma === "vieux";
      const v = test ? avecDate(t("precision.aide.v.vma.test"), d.vmaJours) : t(`precision.aide.v.vma.${(d.vma ?? "rien") as "rien"}`);
      return f(v, q.vma >= 1, test ? date("vma", d.vmaJours) : undefined);
    }
    case "muscu":
      return f(surN(d.muscu8 ?? 0, 6), (q.muscu ?? 0) >= 1);
    case "reco":
      return f(surN(d.choixReco, 5), q.reco >= 1);
    case "historique":
      return f(surN(d.seances8, 12), q.historique >= 1);
    case "cycle":
      return f(t(d.recup?.cycle === "ajuste" ? "precision.aide.v.cycle.ajuste" : "precision.aide.v.cycle.attente"), d.recup?.cycle === "ajuste");
  }
}

/** Les facteurs d'un calcul ; le cycle (planche cycle) seulement pour la Récupération, et seulement si le suivi est allumé. */
export const facteursCalcul = (id: IdCalcul, d: DonneesPrecision): Facteur[] => [
  ...FACTEURS_CALCUL[id].map((c) => facteur(c, d)),
  ...(id === "recup" && d.recup?.cycle ? [facteur("cycle", d)] : []),
];

export interface AideCalcul {
  /** Ce que c'est, en une ou deux phrases. */
  quoi: string;
  /** Pourquoi la note : les facteurs du calcul. */
  facteurs: Facteur[];
  /** « Ton test VMA a 5 ans : refais-le pour retrouver une bonne précision » (la plus vieille des mesures datées). */
  vieux: string | null;
  /** Ce qu'il faut faire : 1 à 3 étapes cliquables, avec leur gain. */
  etapes: Etape[];
  /** Au plus haut, ou rien à faire : la phrase qui le dit (null s'il y a des étapes). */
  fin: string | null;
}

export function aideCalcul(id: IdCalcul, d: DonneesPrecision, r: Resultat = calculer(d)): AideCalcul {
  const facteurs = facteursCalcul(id, d);
  const etapes = etapesCalcul(d, id);
  const v = facteurs.filter((x) => x.vieux).sort((a, b) => b.vieux!.jours - a.vieux!.jours)[0]?.vieux;
  const p = r.p[id] ?? 0;
  return {
    quoi: t(`precision.aide.quoi.${id}`),
    facteurs,
    vieux: v ? t(`precision.aide.vieux.${v.mesure}`, { d: duree(v.jours) }) : null,
    etapes,
    fin: etapes.length ? null : t(p >= 100 ? "precision.aide.complet" : "precision.aide.rien"),
  };
}
