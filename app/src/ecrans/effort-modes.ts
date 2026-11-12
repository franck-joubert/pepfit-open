// Modes du bloc d'effort (BlocEffort) : « zones » (FC) et « altitude » (profil). Le tracé se dessine toujours : sans FC ni
// profil, en un seul trait neutre (le mode « zones » sans zone, en t3). Revue finale du 30/10, n° 1 : une course sans capteur
// de FC, à l'altitude plate ou absente, partait sur « altitude » alors que seul « zones » portait le tracé : il restait invisible.

export type ModeEffort = "zones" | "altitude";

/** Modes qui ont quelque chose à montrer (sélecteur, courbe, bas du bloc), dans l'ordre. */
export function modesEffort(avecFc: boolean, avecAlt: boolean): ModeEffort[] {
  const modes: ModeEffort[] = [];
  if (avecFc) modes.push("zones");
  if (avecAlt) modes.push("altitude");
  return modes;
}

/** Modes du tracé : au moins « zones », qui le dessine en t3 sans FC. */
export function modesTrace(modes: readonly ModeEffort[]): ModeEffort[] {
  return modes.length ? [...modes] : ["zones"];
}

/** Mode affiché : celui choisi s'il existe parmi `modes`, sinon le premier (un tracé n'est jamais caché). */
export function modeAffiche(choisi: ModeEffort, modes: readonly ModeEffort[]): ModeEffort {
  return modes.includes(choisi) ? choisi : (modes[0] ?? "zones");
}
