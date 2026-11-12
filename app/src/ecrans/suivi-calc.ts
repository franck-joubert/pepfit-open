// Blessures et compléments : ce que montrent les écrans, sans React Native (testé dans tests/suivi.test.ts).
// Aucun texte n'interprète une douleur ni ne propose quoi que ce soit : on note, on montre.
import type { BlessureListe, Cote, Moment, Prise, StatutBlessure, Traitement } from "../db/depots/suivi";
import { MOI } from "../db/depots/suivi";
import { MUSCLES_DU_CATALOGUE } from "../db/zones";
import { ARTICULATIONS, estArticulation, zoneSansCote } from "../db/zones-blessure";
import { locale, minuscule, t, tp, type CleSimple } from "../i18n/index";
import { IDS_MUSCLES, NOMS_MUSCLES } from "../ui/3d/muscles";
import { ajouterJ, ecartJ, jourSem } from "./planification";

/** Couleur de chaque statut (D4), toujours avec le mot. */
export const COULEUR_STATUT = { active: "rate", reduite: "echauffement", disparue: "valide" } as const satisfies Record<StatutBlessure, string>;
export const STATUTS: readonly StatutBlessure[] = ["active", "reduite", "disparue"];

export const libelleStatut = (s: StatutBlessure) => t(`suivi.statut.${s}` as CleSimple);

/** Les 20 zones de « Choisir dans la liste » : les muscles du personnage, par nom. */
export const ZONES: readonly string[] = IDS_MUSCLES;

/** Les 13 articulations (planche articulations, D3), de la tête aux pieds : l'ordre de la liste. */
export const ZONES_ARTICULATIONS: readonly string[] = ARTICULATIONS.map((a) => a.id);

/** Zones sans côté (au milieu du corps : cou, abdominaux, rachis, sacrum) : pas de choix Gauche / Droit. */
export const sansCote = (zone: string | null): boolean => zoneSansCote(zone);

export const coteDe = (zone: string | null, cote: Cote): Cote => (sansCote(zone) ? "-" : cote);

/** Nom d'une articulation seule : « Genou », « Main et doigts » (liste). */
export const nomArticulation = (id: string) => t(`suivi.art.${id}` as CleSimple);

/** Nom court, devant un côté : « Main », « Pied » ; les autres gardent leur nom. */
const AVEC_COURT = new Set(["main", "pied"]);
const courtArticulation = (id: string) => (AVEC_COURT.has(id) ? t(`suivi.art.court.${id}` as CleSimple) : nomArticulation(id));

/** Articulations au féminin, pour accorder le côté (« Épaule droite »). */
const ARTICULATIONS_F = new Set(["machoire", "epaule", "main", "hanche", "cheville"]);

/** D3 : « Genou droit », « Épaule droite », « Main gauche », « Deux genoux », « Deux côtés de la mâchoire » ; sans côté, le nom seul. */
function nomArticulationCote(id: string, c: Cote): string {
  if (c === "-") return nomArticulation(id);
  if (c === "2") return t(`suivi.art.deux.${id}` as CleSimple);
  return t(`suivi.zone.nom.${c}${ARTICULATIONS_F.has(id) ? ".fs" : ""}` as CleSimple, { nom: courtArticulation(id) });
}

/** Genre et nombre du nom de zone en français, pour accorder le côté (masculin singulier sinon). */
const ACCORD_ZONE: Record<string, "mp" | "fp" | "fs"> = {
  pectoraux: "mp", fessiers: "mp", ischios: "mp", quadriceps: "mp", obliques: "mp", mollets: "mp", adducteurs: "mp",
  lombaires: "fp", coiffe: "fs",
};

/** « Deltoïde droit », « Pectoraux gauches », « Deltoids, right » (titre proposé, ligne de liste). */
export function nomZone(zone: string | null, cote: Cote): string {
  if (!zone) return t("suivi.sansZone");
  if (estArticulation(zone)) return nomArticulationCote(zone, coteDe(zone, cote));
  const nom = NOMS_MUSCLES[zone] ?? zone;
  const c = coteDe(zone, cote);
  if (c === "-") return nom;
  const accord = c !== "2" && ACCORD_ZONE[zone] ? `.${ACCORD_ZONE[zone]}` : "";
  return t(`suivi.zone.nom.${c}${accord}` as CleSimple, { nom });
}

/** « Deltoïde · droit », « Genou · droit », « Main · les deux » (fiche). */
export function zoneCourte(zone: string | null, cote: Cote): string {
  if (!zone) return t("suivi.sansZone");
  const c = coteDe(zone, cote);
  const nom = !estArticulation(zone) ? (NOMS_MUSCLES[zone] ?? zone) : c === "-" ? nomArticulation(zone) : courtArticulation(zone);
  return c === "-" ? nom : `${nom}, ${t(`suivi.zone.coteCourt.${c}` as CleSimple)}`;
}

/** Signes d'une entrée du journal (D6) : « Raideur · gonflement ». */
export function texteSignes(l: readonly string[]): string {
  return l.map((x, i) => (i ? minuscule(t(`suivi.signe.${x}` as CleSimple)) : t(`suivi.signe.${x}` as CleSimple))).join(", ");
}

/** Toucher d'une articulation (D4) : au-delà de TOUCHER dp du point le plus proche, rien ; PROCHES dp de plus, des puces. */
export const TOUCHER = 36;
export const PROCHES = 14;
export const MAX_PROCHES = 3;

/**
 * Points (« id:c » → x, y en dp) touchés en (x, y) : le plus proche est choisi ; ceux à moins de son écart + PROCHES (3 au
 * plus, lui compris) sont proposés en puces, seulement s'ils sont plusieurs. null si rien n'est assez près.
 */
export function plusProches(points: Readonly<Record<string, { x: number; y: number }>>, x: number, y: number): { choisi: string; proches: string[] } | null {
  const l = Object.entries(points)
    .map(([k, p]) => ({ k, d: Math.hypot(p.x - x, p.y - y) }))
    .sort((a, b) => a.d - b.d);
  const p0 = l[0];
  if (!p0 || p0.d > TOUCHER) return null;
  const proches = l.filter((p) => p.d <= p0.d + PROCHES).slice(0, MAX_PROCHES).map((p) => p.k);
  return { choisi: p0.k, proches: proches.length > 1 ? proches : [] };
}

/** « genou:d » → id et côté (« - » au milieu du corps). */
export function lirePoint(k: string): { id: string; cote: Cote } {
  const [id = "", c] = k.split(":");
  return { id, cote: (c || "-") as Cote };
}

/** Points d'une articulation choisie (« genou:d », ou les deux genoux pour « Les deux »). */
export function pointsChoisis(id: string | null, cote: Cote): string[] {
  if (!id) return [];
  if (zoneSansCote(id)) return [`${id}:-`];
  return cote === "2" ? [`${id}:d`, `${id}:g`] : [`${id}:${cote === "-" ? "d" : cote}`];
}


/** Muscles du personnage que sollicite un exercice (principal et secondaires du catalogue, « a|b »). */
export function zonesExercice(muscle: string | null, secondaires: string | null): Set<string> {
  const noms = [muscle, ...(secondaires ?? "").split("|")].filter((m): m is string => !!m);
  return new Set(noms.flatMap((m) => MUSCLES_DU_CATALOGUE[m] ?? []));
}

/** D7 : les blessures actives ou réduites dont la zone est sollicitée par l'exercice. Le côté n'est pas filtré. */
export function reperesExercice<B extends Pick<BlessureListe, "zone" | "statut">>(muscle: string | null, secondaires: string | null, blessures: readonly B[]): B[] {
  const z = zonesExercice(muscle, secondaires);
  return blessures.filter((b) => b.statut !== "disparue" && b.zone != null && z.has(b.zone));
}

/** D2 : ce qui s'allume sur le personnage de Santé (actives seulement) ; les articulations ont leur anneau (articulationsAllumees). */
export function zonesAllumees(blessures: readonly Pick<BlessureListe, "id" | "zone" | "cote" | "statut">[]): { id: string; zone: string; cote: Cote }[] {
  return blessures.filter((b) => b.statut === "active" && b.zone && !estArticulation(b.zone)).map((b) => ({ id: b.id, zone: b.zone!, cote: b.cote }));
}

/** Planche articulations, D7 : les articulations des blessures actives, marquées d'un anneau ambre touchable sur Santé. */
export function articulationsAllumees(blessures: readonly Pick<BlessureListe, "id" | "zone" | "cote" | "statut">[]): { id: string; zone: string; cote: Cote }[] {
  return blessures.filter((b) => b.statut === "active" && estArticulation(b.zone)).map((b) => ({ id: b.id, zone: b.zone!, cote: coteDe(b.zone, b.cote) }));
}

export function enCoursEtPassees<B extends Pick<BlessureListe, "statut">>(l: readonly B[]): { enCours: B[]; passees: B[] } {
  return { enCours: l.filter((b) => b.statut !== "disparue"), passees: l.filter((b) => b.statut === "disparue") };
}

/** « Toi », ou le nom de l'IA (affiché après ✦) ; tant que la table des connexions n'existe pas, l'id de l'auteur. */
export function auteurDe(auteur: string, nomsIA: ReadonlyMap<string, string> = new Map()): { ia: boolean; nom: string } {
  return auteur === MOI ? { ia: false, nom: t("suivi.toi") } : { ia: true, nom: nomsIA.get(auteur) ?? auteur };
}

const lireJour = (j: string) => j.split("-").map(Number) as [number, number, number];
const formats = new Map<string, Intl.DateTimeFormat>();
function formatJour(j: string, o: Intl.DateTimeFormatOptions): string {
  const cle = `${locale()}|${JSON.stringify(o)}`;
  let f = formats.get(cle);
  if (!f) formats.set(cle, (f = new Intl.DateTimeFormat(locale(), { ...o, timeZone: "UTC" })));
  const [a, m, d] = lireJour(j);
  return f.format(Date.UTC(a, m - 1, d));
}
/** 26/10 (fr), 10/26 (en). */
export const dateCourte = (j: string) => formatJour(j, { day: "2-digit", month: "2-digit" });
/** 21/10/2026 */
export const dateLongue = (j: string) => formatJour(j, { day: "2-digit", month: "2-digit", year: "numeric" });
/** lundi 26 octobre */
export const dateTitre = (j: string) => {
  const s = formatJour(j, { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
/** Octobre 2026 */
export const moisTitre = (j: string) => {
  const s = formatJour(j, { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
/** mer., jeu. … pour la bande des 7 jours. */
export const jourCourtDe = (j: string) => formatJour(j, { weekday: "short" });

/** « Active depuis le 26/10 · 2 jours » (en tête de fiche) : le nombre de jours compte depuis le changement. */
export function depuisStatut(statut: StatutBlessure, depuis: string, aujourdhui: string): string {
  const n = Math.max(0, ecartJ(depuis, aujourdhui));
  return `${t("suivi.statutDepuis", { statut: libelleStatut(statut), date: dateCourte(depuis) })}, ${n === 0 ? t("suivi.aujourdhui") : tp("suivi.jours", n)}`;
}

/** Ligne Blessures de Santé (D1) : les blessures en cours, chacune avec son statut. */
export function resumeBlessures(l: readonly Pick<BlessureListe, "titre" | "statut">[]): { titre: string; statut: StatutBlessure }[] {
  return l.filter((b) => b.statut !== "disparue").map((b) => ({ titre: b.titre, statut: b.statut }));
}

// ——— Compléments ———

export type Frequence = { genre: "jour" } | { genre: "besoin" } | { genre: "jours"; jours: number[] } | { genre: "semaine"; n: number };

export function lireFrequence(f: string): Frequence {
  if (f === "besoin") return { genre: "besoin" };
  if (f.startsWith("jours:")) {
    const jours = f.slice(6).split(",").map(Number).filter((n) => n >= 1 && n <= 7);
    return jours.length ? { genre: "jours", jours: [...new Set(jours)].sort() } : { genre: "jour" };
  }
  if (f.startsWith("semaine:")) {
    const n = Number(f.slice(8));
    return n > 0 ? { genre: "semaine", n } : { genre: "jour" };
  }
  return { genre: "jour" };
}

export function ecrireFrequence(f: Frequence): string {
  if (f.genre === "jours") return `jours:${f.jours.join(",")}`;
  if (f.genre === "semaine") return `semaine:${f.n}`;
  return f.genre;
}

type T = Pick<Traitement, "frequence" | "debut" | "fin" | "max_jour" | "moment">;

/** Lundi = 1 … dimanche = 7 (comme « jours:1,3,5 »). */
const numJour = (j: string) => jourSem(j) + 1;

/** Le complément court ce jour-là (entre début et fin). */
export const actifLe = (x: T, j: string) => x.debut <= j && (x.fin == null || j <= x.fin);

/** Il apparaît dans la liste du jour : actif et, pour « certains jours », l'un d'eux. */
export function afficheLe(x: T, j: string): boolean {
  if (!actifLe(x, j)) return false;
  const f = lireFrequence(x.frequence);
  return f.genre !== "jours" || f.jours.includes(numJour(j));
}

/** Il compte dans « 2 sur 3 » (D9) : pas les « si besoin », ni les « n par semaine » (sans jour fixé). */
export function prevuLe(x: T, j: string): boolean {
  const g = lireFrequence(x.frequence).genre;
  return afficheLe(x, j) && (g === "jour" || g === "jours");
}

export const arrete = (x: Pick<Traitement, "fin">, aujourdhui: string) => x.fin != null && x.fin < aujourdhui;

/** Part du jour : prévus, et ceux qui ont au moins une prise ce jour-là. */
export function compteJour(traitements: readonly (T & { id: string })[], prises: readonly Pick<Prise, "traitement_id" | "date">[], j: string): { prevus: number; pris: number } {
  const pris = new Set(prises.filter((p) => p.date === j).map((p) => p.traitement_id));
  const prevus = traitements.filter((x) => prevuLe(x, j));
  return { prevus: prevus.length, pris: prevus.filter((x) => pris.has(x.id)).length };
}

/** Barre d'un jour de l'historique, de 0 à 1 ; null = rien de prévu ce jour-là. */
export function partJour(traitements: readonly (T & { id: string })[], prises: readonly Pick<Prise, "traitement_id" | "date">[], j: string): number | null {
  const c = compteJour(traitements, prises, j);
  return c.prevus ? c.pris / c.prevus : null;
}

const ORDRE_MOMENTS: readonly (Moment | null)[] = ["matin", "midi", "soir", "coucher", null];

export const libelleMoment = (m: Moment | null) => t(m ? (`suivi.moment.${m}` as CleSimple) : "suivi.moment.aucun");

/** Liste du jour (D9), par moment : chaque complément avec l'heure de sa dernière prise du jour (null = pas coché). */
export function listeDuJour<X extends T & { id: string }>(
  traitements: readonly X[],
  prises: readonly Pick<Prise, "traitement_id" | "date" | "heure">[],
  j: string,
): { moment: Moment | null; lignes: { t: X; heure: string | null }[] }[] {
  const derniere = new Map<string, string>();
  for (const p of prises) if (p.date === j && (derniere.get(p.traitement_id) ?? "") <= p.heure) derniere.set(p.traitement_id, p.heure);
  const du = traitements.filter((x) => afficheLe(x, j));
  return ORDRE_MOMENTS.map((moment) => ({
    moment,
    lignes: du.filter((x) => (x.moment ?? null) === moment).map((x) => ({ t: x, heure: derniere.get(x.id) ?? null })),
  })).filter((g) => g.lignes.length);
}

/** Les 7 derniers jours (le plus ancien d'abord) : pris ou non. */
export function septJours(id: string, prises: readonly Pick<Prise, "traitement_id" | "date">[], aujourdhui: string): { jour: string; pris: boolean }[] {
  const jours = new Set(prises.filter((p) => p.traitement_id === id).map((p) => p.date));
  return Array.from({ length: 7 }, (_, i) => {
    const jour = ajouterJ(aujourdhui, i - 6);
    return { jour, pris: jours.has(jour) };
  });
}

const NOMS_JOURS = [1, 2, 3, 4, 5, 6, 7].map((n) => ajouterJ("2026-10-26", n - 1)); // 26/10/2026 est un lundi

/** « Tous les jours », « Si besoin · 3 par jour au plus », « lun., mer., ven. », « 3 par semaine ». */
export function texteFrequence(x: Pick<Traitement, "frequence" | "max_jour">, avecMax = true): string {
  const f = lireFrequence(x.frequence);
  const max = avecMax && x.max_jour ? `, ${t("suivi.frequence.max", { n: x.max_jour })}` : "";
  if (f.genre === "besoin") return `${t("suivi.frequence.besoin")}${max}`;
  if (f.genre === "jours") return `${f.jours.map((n) => jourCourtDe(NOMS_JOURS[n - 1]!)).join(", ")}${max}`;
  if (f.genre === "semaine") return `${t("suivi.frequence.semaine", { n: f.n })}${max}`;
  return `${t("suivi.frequence.jour")}${max}`;
}

/** « Tous les jours · matin · depuis le 01/09 », « … · du 15/10 au 31/03 », « … · jusqu'au 30/10 ». */
export function resumeTraitement(x: T, aujourdhui: string): string {
  // la liste reste courte : le maximum par jour est dans la fiche
  const morceaux = [texteFrequence(x, false)];
  if (x.moment) morceaux.push(minuscule(libelleMoment(x.moment)));
  if (x.fin == null) morceaux.push(t("suivi.depuisCourt", { date: dateCourte(x.debut) }));
  // Une fin proche se lit « jusqu'au 30/10 » ; une lointaine, avec son début : « du 15/10 au 31/03 ».
  else if (ecartJ(aujourdhui, x.fin) <= 14) morceaux.push(t("suivi.jusquau", { date: dateCourte(x.fin) }));
  else morceaux.push(t("suivi.duAu", { de: dateCourte(x.debut), a: dateCourte(x.fin) }));
  return morceaux.join(", ");
}

/** « 01/06 → 30/09 » (arrêtés). */
export const periode = (x: Pick<Traitement, "debut" | "fin">) => `${dateCourte(x.debut)} → ${x.fin ? dateCourte(x.fin) : ""}`;

/** « Complément · 5 g », « Complément · 1 gélule · si besoin ». */
export function sousTitrePrise(x: Pick<Traitement, "dose" | "frequence">): string {
  const m = [t("suivi.type.complement")];
  if (x.dose) m.push(x.dose);
  if (lireFrequence(x.frequence).genre === "besoin") m.push(minuscule(t("suivi.frequence.besoin")));
  return m.join(", ");
}

/** Heure de prise par défaut d'un rappel, selon le moment. */
export const HEURE_MOMENT: Record<Moment, string> = { matin: "08:00", midi: "12:30", soir: "20:00", coucher: "22:30" };
