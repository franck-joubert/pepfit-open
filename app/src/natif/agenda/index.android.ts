import { requireOptionalNativeModule } from "expo";
import type { Acces, Calendrier, Creneau, DetailsEvenement, EvenementAgenda } from "./types";

// Agenda du téléphone (planche agenda-ics, D8 à D18) : le module natif d'expo-calendar (paquet officiel d'Expo, API « legacy »
// d'Android, fournisseur d'agenda), appelé directement : absent d'un APK plus ancien, l'agenda est « indisponible » et rien
// d'autre ne change. Audit du paquet et installation : docs/CODE-AGENDA.md. Dates échangées en ISO (comme le JS du paquet).
export type { Acces, Calendrier, DetailsEvenement } from "./types";

interface Permission {
  granted: boolean;
  canAskAgain: boolean;
}
interface CalendrierNatif {
  id: string;
  title?: string | null;
  name?: string | null;
  color?: string | null;
  isPrimary?: boolean | null;
  allowsModifications?: boolean | null;
  isVisible?: boolean | null;
  source?: { name?: string | null; type?: string | null; isLocalAccount?: boolean | null } | null;
}
interface EvenementNatif {
  id: string;
  calendarId?: string | null;
  title?: string | null;
  startDate: string;
  endDate: string;
  allDay?: boolean;
  availability?: string | null;
  notes?: string | null;
}
interface Natif {
  getCalendarPermissionsAsync(): Promise<Permission>;
  requestCalendarPermissionsAsync(): Promise<Permission>;
  getCalendarsAsync(type: string | null): Promise<CalendrierNatif[]>;
  getEventsAsync(debut: string, fin: string, calendriers: string[]): Promise<EvenementNatif[]>;
  getEventByIdAsync(id: string): Promise<EvenementNatif>;
  saveEventAsync(details: Record<string, unknown>, options: Record<string, unknown>): Promise<string>;
  deleteEventAsync(details: { id: string }, options: Record<string, unknown>): Promise<void>;
  saveCalendarAsync(details: Record<string, unknown>): Promise<string>;
}
const natif = requireOptionalNativeModule<Natif>("ExpoCalendar");

const iso = (ms: number) => new Date(ms).toISOString();
const acces = (p: Permission): Acces => (p.granted ? "accorde" : p.canAskAgain ? "aDemander" : "refuse");

export const disponible = () => natif != null;

export const lireAcces = async (): Promise<Acces> => (natif ? acces(await natif.getCalendarPermissionsAsync()) : "indisponible");

/** La fenêtre d'Android (lecture et écriture) ; après deux refus, Android ne la montre plus : « refuse ». */
export const demanderAcces = async (): Promise<Acces> => (natif ? acces(await natif.requestCalendarPermissionsAsync()) : "indisponible");

export async function calendriers(): Promise<Calendrier[]> {
  if (!natif) return [];
  const l = await natif.getCalendarsAsync(null);
  return l
    .filter((c) => c.isVisible !== false)
    .map((c) => ({
      id: c.id,
      titre: c.title || c.name || "",
      compte: c.source?.name ?? "",
      local: !!c.source?.isLocalAccount,
      google: c.source?.type === "com.google",
      couleur: c.color ?? null,
      modifiable: !!c.allowsModifications,
      principal: !!c.isPrimary,
    }));
}

export async function evenements(ids: readonly string[], de: number, a: number): Promise<EvenementAgenda[]> {
  if (!natif || !ids.length) return [];
  const l = await natif.getEventsAsync(iso(de), iso(a), [...ids]);
  return l.map((e) => ({
    id: e.id,
    calendrierId: e.calendarId ?? "",
    titre: e.title ?? "",
    debut: Date.parse(e.startDate),
    fin: Date.parse(e.endDate),
    journee: !!e.allDay,
    libre: e.availability === "free",
    notes: e.notes ?? "",
  }));
}

/** L'événement écrit par pepfit, relu ; null : supprimé dans l'agenda (Android le marque supprimé, le module ne le rend plus). */
export async function evenement(id: string): Promise<Creneau | null> {
  if (!natif) return null;
  try {
    const e = await natif.getEventByIdAsync(id);
    return { debut: Date.parse(e.startDate), fin: Date.parse(e.endDate) };
  } catch (e) {
    if ((e as { code?: string }).code === "E_EVENT_NOT_FOUND") return null;
    throw e;
  }
}

// Pas d'`alarms` (aucun rappel ajouté : le module ne pose HAS_ALARM que s'il en reçoit, D11). Le lieu (03/11) : une chaîne vide
// l'efface (le module ne touche pas au champ qu'on ne lui passe pas). Fuseau : celui du téléphone.
const champs = (d: DetailsEvenement) => ({
  title: d.titre, notes: d.notes, location: d.lieu ?? "", startDate: iso(d.debut), endDate: iso(d.fin), allDay: false, availability: "busy",
});

export async function creerEvenement(calendrierId: string, d: DetailsEvenement): Promise<string> {
  if (!natif) throw new Error("agenda indisponible");
  return natif.saveEventAsync({ ...champs(d), calendarId: calendrierId }, {});
}

export async function modifierEvenement(id: string, d: DetailsEvenement): Promise<void> {
  if (!natif) return;
  await natif.saveEventAsync({ ...champs(d), id }, { futureEvents: false });
}

export async function supprimerEvenement(id: string): Promise<void> {
  if (!natif) return;
  await natif.deleteEventAsync({ id }, { futureEvents: false });
}

/** « Ce téléphone seulement » (D10) : un agenda local créé par pepfit, invisible sur les autres appareils. */
export async function creerAgendaLocal(titre: string): Promise<string> {
  if (!natif) throw new Error("agenda indisponible");
  return natif.saveCalendarAsync({
    title: titre,
    name: "pepfit",
    // Orange du Sport (#f97316), en entier signé ARGB comme l'attend Android.
    color: 0xfff97316 | 0,
    ownerAccount: "pepfit",
    accessLevel: "owner",
    source: { name: "pepfit", isLocalAccount: true },
    isVisible: true,
    isSynced: true,
  });
}
