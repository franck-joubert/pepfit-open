// Drapeaux des fonctions pas encore en ligne : éteints par défaut, allumés à la mise en ligne.

export const drapeaux = {
  /** Réglages › Connexions › Connexion IA : attend le serveur MCP (serveur/mcp/ARCHITECTURE.md § 8). */
  connexionIA: true,
  /** Labo brut du module pepfit-suivi (pepfitopen://labo/suivi, lot 1) : APK de développement seulement, absent de l'appli publiée. */
  laboSuivi: typeof __DEV__ !== "undefined" && __DEV__,
  /** Labo de la signature de l'Âge pepfit (pepfitopen://labo/age), sans lien dans l'appli : allumé pour la mesure sur l'émulateur
   *  (APK de publication) ; à éteindre avant la mise en ligne, ou à remplacer par __DEV__. */
  laboAge: false,
  /** Labo du profil public (pepfitopen://labo/profil-public) : données de démo et états sans serveur, pour la recette sur
   *  l'émulateur ; éteint dans le dépôt, allumé le temps d'un APK de recette. */
  laboProfilPublic: false,
  /** Labo de « Ouvrir sur un ordinateur » (pepfitopen://labo/qr-ordinateur) : vraie caméra, serveur de doublure, un état
   *  par cas, pour la recette sur l'émulateur ; éteint dans le dépôt, allumé le temps d'un APK de recette. */
  laboQrOrdinateur: false,
  /** Labo des établissements officiels (pepfitopen://gym/labo) : lieux, liste des officiels et fiche de la planche,
   *  sans serveur, pour la recette sur l'émulateur ; éteint dans le dépôt, allumé le temps d'un APK de recette. */
  laboEtablissement: false,
  /** Labo de la liste des IA connectées (pepfitopen://labo/connexion-ia) : une IA active et un code en attente, sans compte ni
   *  serveur, pour voir le glisser « Révoquer » ; éteint dans le dépôt, allumé le temps d'un APK de recette. */
  laboConnexionIA: false,
  /** Labo de la FC coupée (pepfitopen://labo/fc-trous?cas=whoop|sante|non) : padel inventé, courbe interrompue aux trous et
   *  ligne « FC coupée … » ; éteint dans le dépôt, allumé le temps d'un APK de recette. */
  laboFcTrous: false,
  /** Labo de l'espace coach côté membre (pepfitopen://labo/coach) : doublure du serveur avec les données de la planche coach,
   *  pour la recette et les captures sur l'émulateur ; éteint dans le dépôt, allumé le temps d'un APK de recette. */
  laboCoach: false,
  /** Labo des macros (pepfitopen://labo/macros?etat=…) : prépare le profil, les garde-fous et la dépense d'un état de la planche
   *  macros (complet, données, limité, sans chiffres, non calculé, mineur, garde-fous), pour les captures sur l'émulateur ;
   *  ÉCRIT dans la base du téléphone : éteint dans le dépôt, allumé le temps d'un APK de recette. */
  laboMacros: false,
  /** Labo des coachs publics (pepfitopen://labo/coach-public) : doublure du serveur avec les données de la planche coach-public
   *  (Explorer, fiche publiée, nouvelle version, profil unique), pour la recette et les captures sur l'émulateur ; éteint
   *  dans le dépôt, allumé le temps d'un APK de recette. */
  laboCoachPublic: false,
  /** Labo du suivi d'un coach (pepfitopen://labo/suivi-coach?ecran=a1|a2|a5|a6|f1|f3|f3-servi) : doublure du lien, du compte et
   *  du serveur avec les données de la planche fiches-gerees, pour les captures sur l'émulateur ; éteint dans le dépôt,
   *  allumé le temps d'un APK de recette. */
  laboSuiviCoach: false,
  /** Labo Social (pepfitopen://labo/social?ecran=…) : doublure du réseau Social avec les données de la planche social-cercles
   *  (profils, demandes, cercles, contenus chiffrés), sans compte ni serveur, pour la recette et les captures sur
   *  l'émulateur ; éteint dans le dépôt, allumé le temps d'un APK de recette. */
  laboSocial: false,
  /** Labo de l'espace fine des milliers (pepfitopen://labo/espace-fine) : « 9 063 » en chiffres proportionnels et tabulaires,
   *  avec trois séparateurs ; éteint dans le dépôt, allumé le temps d'un APK de recette (docs/ESPACE-FINE.md). */
  laboEspaceFine: false,
  /** Labo des circuits (pepfitopen://labo/circuits?vue=page|carte|autre|retire|credits&c=plateau…) : sème les six tracés de la démo de la
   *  planche Circuits dans la base du téléphone, pour la recette et les captures sur l'émulateur ; ÉCRIT dans la base : éteint dans
   *  le dépôt, allumé le temps d'un APK de recette (scripts/labo-circuits.sh). */
  laboCircuits: false,
  /** Labo de comparaison de l'Effort (pepfitopen://labo/effort, décision du 31/10) : par séance, l'Effort pepfit, la
   *  charge brute et la valeur de Whoop, avec leur corrélation, sur les vraies données du téléphone. Caché (aucun lien) ; à
   *  supprimer avec la comparaison une fois la cohérence vue (planche effort-pepfit, NOTES § 7). */
  laboEffort: true,
  /** Labo de comparaison de la Récupération (pepfitopen://labo/recup, planche recuperation, NOTES § 6) : par matin, notre score,
   *  ses quatre parts, sa précision et le score de Whoop, avec leur corrélation et l'écart par bande. Caché (aucun lien) ;
   *  4 semaines, puis supprimé avec la lecture du score de Whoop (lireComparaisonRecup). */
  laboRecup: true,
  /** Labo du contrôle du sommeil (pepfitopen://labo/sommeil, planche sommeil, D19) : par matin, notre « à rattraper » face à la
   *  dette de Whoop, l'écart, leur corrélation, et les deux besoins de la nuit. Caché (aucun lien), jamais montré aux membres ;
   *  supprimé avec lireComparaisonSommeil une fois l'effort récent et la qualité des sources recalés. */
  laboSommeil: true,
  /** Labo de Récupérer (pepfitopen://labo/recuperer, planche recuperer) : l'alarme d'une sieste ou d'une activité au bout d'une
   *  minute, pour la recette à l'émulateur ; éteint dans le dépôt, allumé le temps d'un APK de recette (docs/CODE-RECUPERER.md). */
  laboRecuperer: false,
  /** Séance en cours partagée avec l'IA (docs/SEANCE-DIRECT.md) : ne fait rien sans compte ni IA connectée avec le droit
   *  de lire les entraînements, ni tant que le serveur n'a pas les collections (il s'arrête alors pour la séance). */
  seanceDirecte: true,
  /** Labo de la séance partagée (pepfitopen://session?direct=demo, sonde=1 pour la mesure) : doublure du serveur et IA de
   *  démo, sans compte ; éteint dans le dépôt, allumé le temps d'un APK de recette. */
  laboSeanceDirecte: false,
  /** Labo du direct coach (pepfitopen://session?coach=demo) : doublure du serveur, Nadia qui a la main et propose, Julie qui
   *  regarde, sans compte (seance-direct/coach-labo.ts) ; éteint dans le dépôt, allumé le temps d'un APK de recette. */
  laboDirectCoach: false,
};
