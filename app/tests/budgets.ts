// Garde-fou de performance (audit M17, docs/PERF-D.md) : tous les budgets au même endroit, vérifiés à chaque `npm test` par
// tests/budgets-perf.test.ts (requêtes SQLite et lectures Santé Connect par écran sur la base de volume, séance : coche et
// clavier) et tests/perf-a.test.ts (appels natifs Santé Connect). Un écran qui redevient gourmand fait échouer la suite.
//
// Comment ajuster un budget
// 1. Lire le message d'échec : il donne la mesure et le budget (« Sport, relance : 131 requêtes (budget 120) »).
// 2. Un budget qui saute veut presque toujours dire une boucle de requêtes, une lecture Santé Connect sur le chemin
//    d'affichage, ou un composant qui s'abonne à trop de choses. Corriger le code avant de toucher au budget.
// 3. Baisser un budget : toujours permis, à la mesure plus un peu de marge (environ 10 %), dès qu'un correctif le permet.
// 4. Monter un budget : seulement pour une vraie fonction nouvelle, jamais pour faire passer la suite. Écrire la raison en
//    commentaire à côté du chiffre (date, écran, ce qui coûte), la mesure avant et après dans le message de commit, et le
//    noter dans le docs/PERF-*.md de la mission.
// 5. Les temps (ms) sont mesurés sous Node sur PC, avec une large marge : ils ne prennent qu'une régression grossière
//    (un calcul refait mille fois). La vraie mesure de temps est celle de l'émulateur (docs/audit-perf/, sonde).
//
// Origine des chiffres : Perf B (docs/PERF-B.md, requêtes), Perf A (docs/PERF-A.md, appels natifs), Perf D (séance).

export const BUDGETS = {
  // ---- Perf B : requêtes SQLite (sql) et lectures Santé Connect (sc), vérifications statut/autorisees à part
  nutrition: { premiereVisite: 50, changementJour: 35, retour: 20 },
  planning: { semaine: 10, mois: 10, resumesRoutines: 6 },
  // 1re visite : la toute première fois, l'Effort pepfit calcule la charge de chaque séance et le bilan lit deux mois
  sport: { premiere: { sql: 350, sc: 300 }, relance: { sql: 120, sc: 30 }, retour: { sql: 100, sc: 10 } },
  energie: { aujourdhui: { sql: 40, sc: 300 }, trenteJours: { sql: 40, sc: 15 } },
  accueil: { complet: { sql: 50, sc: 10 }, base: { sql: 50, sc: 0 } },
  routines: 30,
  vueRoutine: 10,
  seancePassee: 15,
  mesAliments: 6,
  // Page du mois de Santé (31/10, docs/SANTE-CALENDRIER.md) : les jours avec données d'une fenêtre de 13 mois, en une requête
  // groupée dans la base, sans Santé Connect ; temps sous Node sur la base de volume.
  santeMois: { sql: 1, sc: 0, ms: 300 },

  // ---- Perf A : appels au module natif Santé Connect
  natif: {
    /** statut() et autorisees() : au plus une fois chacun par écran (gardés 30 s, M1). */
    verifications: 1,
    /** Accueil complet (base puis cartes). */
    accueil: 10,
    /** Avant la première valeur d'un écran (Poids, VFC, FC, blocs de l'Accueil) : la base d'abord (M8, M9). */
    avantPremiereValeur: 0,
  },

  // ---- Perf D : séance en cours (M5, M6)
  seance: {
    coche: {
      /** Requêtes avant l'image qui montre la coche (case verte, repos lancé) : aucune. */
      sqlAvantImage: 0,
      /** Requêtes de l'écriture qui suit (série, recalcul limité à la séance, repos en base). Perf D : 16 sur la base de volume ;
       *  avant, le recalcul complet de l'exercice seul en faisait 43, plus la relecture de la séance. */
      sql: 20,
      /** Temps de la partie immédiate (coche posée, repos lancé), ms sous Node. Mesuré : moins de 1 ms. */
      msImmediat: 20,
      /** Temps de l'écriture, ms sous Node. Mesuré : 2 à 3 ms. */
      msEcriture: 150,
      /** Cartes d'exercice redessinées par une coche : la sienne, et celle où passe la série active. */
      cartes: 2,
    },
    touche: {
      /** Composants abonnés à la case active (redessinés à chaque chiffre), en dehors de la case touchée elle-même. */
      abonnes: ["ui/ClavierSeance.tsx", "ecrans/SuiviFin.tsx"],
      /** Molettes recréées par une touche (ses 101 à 721 lignes) : aucune. */
      moletteRecreee: 0,
      /** Temps pour 1 000 touches (pavé, puis calcul de la molette), ms sous Node. Mesuré : 46 ms. */
      msPourMille: 300,
    },
  },
} as const;
