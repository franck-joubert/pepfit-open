import type { Langue } from "./detection";
import type { CleSimple } from "./fr";

// Textes propres à la plateforme, lus avant les dictionnaires : rien sur Android et le web ; l'iPhone a plateforme.ios.ts.
export const SURCHARGES: Record<Langue, Partial<Record<CleSimple, string>>> = { fr: {}, en: {}, de: {}, es: {} };
