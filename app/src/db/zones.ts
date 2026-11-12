// Blessures (D7) : des muscles du catalogue (noms français de exercices.muscle et secondaires) aux muscles du personnage 3D.

/**
 * Muscles du catalogue (exercices.muscle, secondaires) → muscles du personnage. Une épaule blessée (deltoïde ou coiffe)
 * touche tout exercice « Épaules » ; « Milieu du dos » touche trapèze et grand rond ; « Abducteurs » touche les fessiers.
 */
export const MUSCLES_DU_CATALOGUE: Readonly<Record<string, readonly string[]>> = {
  "Épaules": ["deltoide", "coiffe"],
  Pectoraux: ["pectoraux"],
  Triceps: ["triceps"],
  Biceps: ["biceps", "brachial"],
  "Avant-bras": ["avant_bras", "brachial"],
  "Grand dorsal": ["grand_dorsal", "grand_rond"],
  "Milieu du dos": ["trapeze", "grand_rond"],
  "Trapèzes": ["trapeze"],
  Lombaires: ["lombaires"],
  Abdominaux: ["abdominaux", "obliques"],
  Fessiers: ["fessiers"],
  Abducteurs: ["fessiers"],
  Adducteurs: ["adducteurs"],
  Quadriceps: ["quadriceps"],
  "Ischio-jambiers": ["ischios"],
  Mollets: ["mollets", "tibial"],
  Cou: ["cou"],
};
