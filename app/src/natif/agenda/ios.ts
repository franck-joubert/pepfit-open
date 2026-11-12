import type { Acces, Calendrier, Creneau, DetailsEvenement, EvenementAgenda } from "./types";

// Agenda de l'iPhone : le même module natif d'expo-calendar (« ExpoCalendar », API « legacy », EventKit), appelé directement
// comme sur Android, sans import d'Expo ici (testé avec un faux module : tests/ios-divers.test.ts). Écarts d'iOS, d'après
// node_modules/expo-calendar/ios/CalendarModule.swift (58.0.6) :
// - getCalendarsAsync(null) exige aussi l'accès aux Rappels : on demande « event » ;
// - pas d'isVisible ni d'isPrimary : l'agenda principal est celui des nouveaux événements (getDefaultCalendarAsync) ;
// - « Sur mon iPhone » : source de type « local » ; Google passe par CalDAV (source « Gmail » ou l'adresse) ;
// - un événement absent : code ERR_EVENT_NOT_FOUND (E_EVENT_NOT_FOUND sur Android) ;
// - créer un agenda demande entityType et la source (sourceId).

interface Permission {
  granted: boolean;
  canAskAgain: boolean;
}
interface SourceNatif {
  id?: string | null;
  name?: string | null;
  type?: string | null;
}
interface CalendrierNatif {
  id: string;
  title?: string | null;
  color?: string | null;
  allowsModifications?: boolean | null;
  source?: SourceNatif | null;
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
export interface NatifAgendaIos {
  getCalendarPermissionsAsync(): Promise<Permission>;
  requestCalendarPermissionsAsync(): Promise<Permission>;
  getCalendarsAsync(type: "event"): Promise<CalendrierNatif[]>;
  getDefaultCalendarAsync(): Promise<CalendrierNatif>;
  getSourcesAsync(): Promise<SourceNatif[]>;
  getEventsAsync(debut: string, fin: string, calendriers: string[]): Promise<EvenementNatif[]>;
  getEventByIdAsync(id: string, debut: string | undefined): Promise<EvenementNatif>;
  saveEventAsync(details: Record<string, unknown>, options: Record<string, unknown>): Promise<string>;
  deleteEventAsync(details: { id: string }, options: Record<string, unknown>): Promise<void>;
  saveCalendarAsync(details: Record<string, unknown>): Promise<string>;
}

const iso = (ms: number) => new Date(ms).toISOString();
// iOS : canAskAgain est faux dès le premier refus (« Refusé » dans Réglages › Confidentialité › Calendriers)
const acces = (p: Permission): Acces => (p.granted ? "accorde" : p.canAskAgain ? "aDemander" : "refuse");
const PAS_TROUVE = new Set(["ERR_EVENT_NOT_FOUND", "E_EVENT_NOT_FOUND"]);

/** Un agenda Google ajouté dans Réglages › Calendrier › Comptes : CalDAV, compte nommé « Gmail » ou par son adresse. */
const estGoogle = (s: SourceNatif | null | undefined) => s?.type === "caldav" && /gmail|google/i.test(s.name ?? "");

/** Orange du Sport (#f97316), en ARGB non signé : EXUtilities.UIColor lit un entier 0xAARRGGBB. */
export const ORANGE_SPORT_ARGB = 0xfff97316;

export function fabriquerAgendaIos(natif: NatifAgendaIos | null) {
  // Les champs écrits (D11, ajustements du 03/11) : pas d'`alarms` ; le lieu vide l'efface ; fuseau du téléphone.
  const champs = (d: DetailsEvenement) => ({
    title: d.titre, notes: d.notes, location: d.lieu ?? "", startDate: iso(d.debut), endDate: iso(d.fin), allDay: false, availability: "busy",
  });

  return {
    disponible: () => natif != null,

    lireAcces: async (): Promise<Acces> => (natif ? acces(await natif.getCalendarPermissionsAsync()) : "indisponible"),

    /** La fenêtre d'iOS (accès complet, texte NSCalendarsFullAccessUsageDescription) ; refusée une fois : « refuse ». */
    demanderAcces: async (): Promise<Acces> => (natif ? acces(await natif.requestCalendarPermissionsAsync()) : "indisponible"),

    async calendriers(): Promise<Calendrier[]> {
      if (!natif) return [];
      const [l, defaut] = await Promise.all([natif.getCalendarsAsync("event"), natif.getDefaultCalendarAsync().catch(() => null)]);
      return l.map((c) => ({
        id: c.id,
        titre: c.title ?? "",
        compte: c.source?.name ?? "",
        local: c.source?.type === "local",
        google: estGoogle(c.source),
        couleur: c.color ?? null,
        modifiable: !!c.allowsModifications,
        principal: c.id === defaut?.id,
      }));
    },

    async evenements(ids: readonly string[], de: number, a: number): Promise<EvenementAgenda[]> {
      if (!natif || !ids.length) return [];
      const l = await natif.getEventsAsync(iso(de), iso(a), [...ids]);
      // Aucun des agendas demandés n'existe plus : EventKit chercherait dans tous ; on ne garde que les demandés.
      return l
        .filter((e) => ids.includes(e.calendarId ?? ""))
        .map((e) => ({
          id: e.id,
          calendrierId: e.calendarId ?? "",
          titre: e.title ?? "",
          debut: Date.parse(e.startDate),
          fin: Date.parse(e.endDate),
          journee: !!e.allDay,
          libre: e.availability === "free",
          notes: e.notes ?? "",
        }));
    },

    /** L'événement écrit par pepfit, relu ; null : supprimé dans l'agenda. */
    async evenement(id: string): Promise<Creneau | null> {
      if (!natif) return null;
      try {
        const e = await natif.getEventByIdAsync(id, undefined);
        return { debut: Date.parse(e.startDate), fin: Date.parse(e.endDate) };
      } catch (e) {
        if (PAS_TROUVE.has((e as { code?: string }).code ?? "")) return null;
        throw e;
      }
    },

    async creerEvenement(calendrierId: string, d: DetailsEvenement): Promise<string> {
      if (!natif) throw new Error("agenda indisponible");
      return natif.saveEventAsync({ ...champs(d), calendarId: calendrierId }, {});
    },

    async modifierEvenement(id: string, d: DetailsEvenement): Promise<void> {
      if (!natif) return;
      await natif.saveEventAsync({ ...champs(d), id }, { futureEvents: false });
    },

    async supprimerEvenement(id: string): Promise<void> {
      if (!natif) return;
      await natif.deleteEventAsync({ id }, { futureEvents: false });
    },

    /**
     * « Ce téléphone seulement » (D10) : un agenda « Sur mon iPhone ». iOS cache cette source quand les calendriers iCloud
     * sont allumés : l'agenda va alors dans la source par défaut (iCloud), donc visible sur les autres appareils Apple.
     */
    async creerAgendaLocal(titre: string): Promise<string> {
      if (!natif) throw new Error("agenda indisponible");
      const sources = await natif.getSourcesAsync().catch((): SourceNatif[] => []);
      const locale = sources.find((s) => s.type === "local" && s.id);
      return natif.saveCalendarAsync({
        title: titre,
        color: ORANGE_SPORT_ARGB,
        entityType: "event",
        ...(locale?.id ? { sourceId: locale.id } : {}),
      });
    },
  };
}
