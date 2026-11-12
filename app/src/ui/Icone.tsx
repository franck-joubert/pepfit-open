import { useId } from "react";
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { COCHE_D, SCEAU_D } from "./sceau";
import { axeDegrade, type Arret } from "../theme/effets";

// Icônes de la base v2.2 et des écrans muscu (viewBox 24, trait 1,75, bouts ronds), recopiées des <symbol>.
const DESSINS = {
  // Nutrition : repères des repas (tasse, assiette, biscuit, bol), scanner, favori, lampe, clavier.
  tasse: <Path d="M4.5 9h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM15.5 10h1a2.5 2.5 0 0 1 0 5h-1.3M3.5 21h14M8 3.5c-.6 1 .6 2 0 3M11.5 3.5c-.6 1 .6 2 0 3" />,
  assiette: (
    <>
      <Circle cx={12} cy={12.5} r={4.5} />
      <Path d="M3 4v5a1.5 1.5 0 0 0 3 0V4M4.5 10.5V20M20 20V4c-1.2.8-2 2.6-2 5v3h2" />
    </>
  ),
  biscuit: (
    <>
      <Circle cx={12} cy={12} r={8} />
      <Path d="M9 9.5h.01M14.5 8.5h.01M13 14.5h.01M8.5 14.5h.01M16 12h.01" strokeWidth={2.6} />
    </>
  ),
  pomme: <Path d="M12 8c-1.6-1.1-5.6-1.5-7 1.6-1.5 3.2.3 8.6 3 10 1.4.8 2.6.3 4-.3 1.4.6 2.6 1.1 4 .3 2.7-1.4 4.5-6.8 3-10C17.6 6.5 13.6 6.9 12 8zM12 8c0-2 .8-3.5 2.6-4.5" />,
  bol: <Path d="M3.5 11h17a8.5 8.5 0 0 1-17 0zM9 20h6M9.5 3.5c-.7 1.2.7 2.3 0 3.5M14 3.5c-.7 1.2.7 2.3 0 3.5" />,
  // Nutrition (lot 2, planche) : ajout rapide, paquet, téléphone, catalogue pepfit, classement, rappel, étiquette, mesure.
  eclair: <Path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />,
  // Plat (planche plats, 30/10) : la cocotte (couvercle, bouton, anses), distincte des repères des repas.
  cocotte: <Path d="M4 10.5h16M5.5 10.5c.6-2.5 3.2-4 6.5-4s5.9 1.5 6.5 4M12 6.5V5M10.5 5h3M5.5 10.5v6a3 3 0 0 0 3 3h7a3 3 0 0 0 3-3v-6M5.5 13.5h-2M18.5 13.5h2" />,
  paquet: <Path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8" />,
  appareil: (
    <>
      <Rect x={6.5} y={3} width={11} height={18} rx={2.5} />
      <Path d="M10.5 18h3" />
    </>
  ),
  cible: (
    <>
      <Circle cx={12} cy={12} r={8} />
      <Circle cx={12} cy={12} r={4} />
      <Circle cx={12} cy={12} r={0.9} fill="currentColor" />
    </>
  ),
  classement: <Path d="M5 20V12M12 20V5M19 20v-5" />,
  cloche: <Path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 1.5h-15zM10 20.5h4" />,
  etiquette: <Path d="M4 7.5V6a2 2 0 012-2h1.5M16.5 4H18a2 2 0 012 2v1.5M20 16.5V18a2 2 0 01-2 2h-1.5M7.5 20H6a2 2 0 01-2-2v-1.5M8 9h8M8 12h8M8 15h5" />,
  regle: <Path d="M3.5 15.5l12-12 5 5-12 12zM7.5 11.5l2 2M10.5 8.5l2 2M13.5 5.5l2 2" />,
  horsligne: <Path d="M4 4l16 16M8.5 8.8A5.5 5.5 0 006.5 13h-.2a3.5 3.5 0 000 7H17M19.6 16.8A3.5 3.5 0 0017 13a5.5 5.5 0 00-7.6-5.1" />,
  scan: <Path d="M4 7.5V6a2 2 0 012-2h1.5M16.5 4H18a2 2 0 012 2v1.5M20 16.5V18a2 2 0 01-2 2h-1.5M7.5 20H6a2 2 0 01-2-2v-1.5M8 8.5v7M11 8.5v7M13.5 8.5v7M16 8.5v7" />,
  // QR (transfert de la clé, planche chiffrement-compte) : trois carrés de repère et des modules.
  qr: (
    <Path d="M5.5 4h3A1.5 1.5 0 0110 5.5v3A1.5 1.5 0 018.5 10h-3A1.5 1.5 0 014 8.5v-3A1.5 1.5 0 015.5 4zM15.5 4h3A1.5 1.5 0 0120 5.5v3a1.5 1.5 0 01-1.5 1.5h-3A1.5 1.5 0 0114 8.5v-3A1.5 1.5 0 0115.5 4zM5.5 14h3a1.5 1.5 0 011.5 1.5v3A1.5 1.5 0 018.5 20h-3A1.5 1.5 0 014 18.5v-3A1.5 1.5 0 015.5 14zM14 14h2.5v2.5M20 14v.01M14 20h.01M17 17v3h3" />
  ),
  coeur: <Path d="M12 19.5s-7-4.3-7-9.6A4 4 0 0112 7.6a4 4 0 017 2.3c0 5.3-7 9.6-7 9.6z" />,
  // Montre (capteurs du Sport, planche sport-programmes-routines v2) : boîtier, bracelets, aiguilles.
  montre: <Path d="M9.5 6.5h5a3 3 0 013 3v5a3 3 0 01-3 3h-5a3 3 0 01-3-3v-5a3 3 0 013-3zM9 6.5l.7-3h4.6l.7 3M9 17.5l.7 3h4.6l.7-3M12 9.6V12l1.6 1.1" />,
  coeurp: <Path d="M12 19.5s-7-4.3-7-9.6A4 4 0 0112 7.6a4 4 0 017 2.3c0 5.3-7 9.6-7 9.6z" fill="currentColor" />,
  lampe: <Path d="M8 3h8v4l-2 3v10h-4V10L8 7zM12 13v2" />,
  clavier: <Path d="M3 8.5a2.5 2.5 0 012.5-2.5h13A2.5 2.5 0 0121 8.5v7a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 15.5zM7 10h.01M11 10h.01M15 10h.01M8 14h8" />,
  dumbbell: <Path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11" />,
  // Onglet « Matériel » d'un lieu (planche lieux non vérifiés) : la machine à poids guidée, sa pile et sa poignée.
  machine: (
    <>
      <Path d="M4 20.5h16M7 20.5V4h3v16.5M10 8h7.5v5.5M17.5 13.5v3" />
      <Circle cx={17.5} cy={17.5} r={1.1} />
    </>
  ),
  // Santé : blessure (pansement), complément (flacon), auteur IA (étincelle dessinée, pas un emoji).
  pansement: (
    <>
      <Rect x={2.5} y={8} width={19} height={8} rx={4} transform="rotate(-45 12 12)" />
      <Rect x={9.5} y={9.5} width={5} height={5} rx={1} transform="rotate(-45 12 12)" />
    </>
  ),
  flacon: <Path d="M8.5 8h7a2.5 2.5 0 012.5 2.5v8a2.5 2.5 0 01-2.5 2.5h-7A2.5 2.5 0 016 18.5v-8A2.5 2.5 0 018.5 8zM8 3.5h8V8H8zM9.5 14.5h5" />,
  etincelle: <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  plus: <Path d="M12 5v14M5 12h14" />,
  moins: <Path d="M5 12h14" />,
  // Effacer le dernier chiffre (clavier de séance).
  efface: <Path d="M9 5.5h10.5v13H9L3.5 12zM11.7 10.1l3.8 3.8M15.5 10.1l-3.8 3.8" />,
  crayon: <Path d="M4.5 19.5l1-4L16 5l3 3L8.5 18.5zM14 7l3 3" />,
  copie: (
    <>
      <Rect x={8.5} y={8.5} width={11} height={11} rx={2.5} />
      <Path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </>
  ),
  search: (
    <>
      <Circle cx={11} cy={11} r={6.5} />
      <Path d="M20 20l-4.2-4.2" />
    </>
  ),
  down: <Path d="M6 9l6 6 6-6" />,
  right: <Path d="M9 6l6 6-6 6" />,
  // variation d'une mesure (mensurations M12) : diagonale, jamais vert ni rouge (couleurs hausse / baisse)
  hausse: <Path d="M7 17L17 7M9.5 7H17v7.5" />,
  baisse: <Path d="M7 7l10 10M17 9.5V17H9.5" />,
  back: <Path d="M19 12H5M11 6l-6 6 6 6" />,
  left: <Path d="M15 6l-6 6 6 6" />,
  retour: <Path d="M9 14l-4-4 4-4M5 10h9.5a4.5 4.5 0 010 9H11" />,
  more: (
    <>
      <Circle cx={5.5} cy={12} r={1.1} fill="currentColor" />
      <Circle cx={12} cy={12} r={1.1} fill="currentColor" />
      <Circle cx={18.5} cy={12} r={1.1} fill="currentColor" />
    </>
  ),
  check: <Path d="M5 12.5l4.5 4.5L19 7.5" />,
  vibre: <Path d="M9.5 4h5a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 18.5v-13A1.5 1.5 0 0 1 9.5 4zM4.5 8.5v7M19.5 8.5v7M2 10.5v3M22 10.5v3" />,
  timer: (
    <>
      <Circle cx={12} cy={13} r={7.5} />
      <Path d="M12 9.5V13l2.2 2M9.5 2.5h5" />
    </>
  ),
  noteplus: <Path d="M13.5 20.5H6v-17h8.5L19 8v4.5M14 3.5V8.5h5M18 15.5v6M15 18.5h6" />,
  clip: (
    <>
      <Path d="M9 4.5H6.5v16h11v-16H15" />
      <Rect x={9} y={3} width={6} height={3} rx={1} />
      <Path d="M9.5 11h5M9.5 14.5h3.5" />
    </>
  ),
  pin: <Path d="M9 3.5h6M10 3.5v6L7 13h10l-3-3.5v-6M12 13v7.5" />,
  // Note de routine : presse-papiers épinglé ; note de séance : une page.
  clippin: (
    <>
      <Path d="M9 4.5H6.5v16h11v-16H15" />
      <Rect x={9} y={3} width={6} height={3} rx={1} />
      <Path d="M10 9.5h4M10.7 9.5v2.8L9.5 14h5l-1.2-1.7V9.5M12 14v3.5" />
    </>
  ),
  page: <Path d="M14 3.5H6v17h12v-13zM14 3.5v4h4M9 12h6M9 15.5h4" />,
  trash:<Path d="M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 14h9l1-14M10.5 10.5v6.5M13.5 10.5v6.5" />,
  close: <Path d="M6 6l12 12M18 6L6 18" />,
  filtre: (
    <>
      <Path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <Circle cx={15} cy={7} r={2} />
      <Circle cx={9} cy={17} r={2} />
    </>
  ),
  repeat: <Path d="M4 11V9.5a3 3 0 013-3h12M16 3.5l3 3-3 3M20 13v1.5a3 3 0 01-3 3H5M8 20.5l-3-3 3-3" />,
  flamme: <Path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 002.5 2.5z" />,
  swap: <Path d="M7 4v16M3.5 7.5L7 4l3.5 3.5M17 20V4M13.5 16.5L17 20l3.5-3.5" />,
  arrow: <Path d="M5 12h14M13 6l6 6-6 6" />,
  cal: (
    <>
      <Rect x={3.5} y={5} width={17} height={15.5} rx={2.5} />
      <Path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  place: (
    <>
      <Path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <Circle cx={12} cy={10} r={2.3} />
    </>
  ),
  sync: <Path d="M19.5 9A8 8 0 0 0 5 7.5M4.5 15A8 8 0 0 0 19 16.5M5 3.5v4h4M19 20.5v-4h-4" />,
  play: <Path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />,
  pause: <Path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z" fill="currentColor" />,
  // Suivi GPS en direct (planche suivi-gps) : drapeau du tour, GPS, cadenas, arrêt.
  tour: <Path d="M6 21V3.5M6 4.5h11.5l-2.5 4 2.5 4H6" />,
  gps: (
    <>
      <Circle cx={12} cy={12} r={6.5} />
      <Circle cx={12} cy={12} r={2} fill="currentColor" />
      <Path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </>
  ),
  verrou: (
    <>
      <Rect x={5} y={10.5} width={14} height={10} rx={2.5} />
      <Path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
    </>
  ),
  stop: <Rect x={6} y={6} width={12} height={12} rx={2.5} fill="currentColor" />,
  // Plein écran de la séance (planche idee-plein-ecran) : bascule, série précédente / suivante, tempo, voix (lot 4).
  plein: <Path d="M4 9V6a2 2 0 012-2h3M15 4h3a2 2 0 012 2v3M20 15v3a2 2 0 01-2 2h-3M9 20H6a2 2 0 01-2-2v-3" />,
  prec: (
    <>
      <Path d="M6.5 5.5v13" />
      <Path d="M18 5.5v13l-9-6.5z" fill="currentColor" />
    </>
  ),
  suiv: (
    <>
      <Path d="M17.5 5.5v13" />
      <Path d="M6 5.5v13l9-6.5z" fill="currentColor" />
    </>
  ),
  tempo: <Path d="M5 19.5h14M9 19.5L11 4.5h2l2 15M12 15l5-8" />,
  voix: <Path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9.2a4 4 0 010 5.6M18.2 6.6a7.6 7.6 0 010 10.8" />,
  home: <Path d="M4 10.5L12 4l8 6.5V20H14.5v-5.5h-5V20H4z" />,
  // Types de lieu (planche Lieux) : salle = dumbbell ; extérieur, piscine, terrain, domicile.
  exterieur: <Path d="M12 3.5l-5 7h3l-3.5 5.5h11L14 10.5h3zM12 16v4.5M4 20.5h16" />,
  piscine: (
    <Path d="M8.5 14.5V6a2 2 0 0 1 4 0M15.5 14.5V6a2 2 0 0 1 4 0M8.5 9.5h7M8.5 12.5h7M3 17.5c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1M3 21c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1" />
  ),
  terrain: (
    <>
      <G transform="rotate(-38 11 12)">
        <Path d="M11 2.5a5 5 0 0 1 5 5v3a5 5 0 0 1-3.2 4.7V17h-3.6v-1.8A5 5 0 0 1 6 10.5v-3a5 5 0 0 1 5-5zM9.6 17h2.8v4H9.6z" />
        <Circle cx={9.4} cy={7.4} r={0.65} fill="currentColor" stroke="none" />
        <Circle cx={12.6} cy={7.4} r={0.65} fill="currentColor" stroke="none" />
        <Circle cx={11} cy={10.2} r={0.65} fill="currentColor" stroke="none" />
      </G>
      <Circle cx={19} cy={5} r={1.7} />
    </>
  ),
  domicile: <Path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5M10 20v-5.5h4V20" />,
  // Catégories de Découvrir (planche decouvrir, docs/CODE-DECOUVRIR.md) : vélo (aussi celui des circuits), kettlebell, barre de traction, ballon, montagne et fanion, lotus, gant.
  velo: (
    <>
      <Circle cx={5.5} cy={16} r={3.5} />
      <Circle cx={18.5} cy={16} r={3.5} />
      <Path d="M5.5 16H11l4-7.5M9.2 8.5L11 16M9.2 8.5H15M15 8.5l3.5 7.5M7.7 7.2h3M14 5.8h2.3M15 8.5L14 5.8" />
    </>
  ),
  kettlebell: (
    <>
      <Path d="M8.8 9.8V7.4a3.2 3.2 0 0 1 6.4 0v2.4" />
      <Path d="M12 9.4c-3.7 0-6.2 2.6-6.2 5.7 0 2.6 1.7 4.6 3.7 4.6h5c2 0 3.7-2 3.7-4.6 0-3.1-2.5-5.7-6.2-5.7z" />
    </>
  ),
  barre: (
    <>
      <Path d="M3.5 4.5h17M5.5 4.5v16M18.5 4.5v16" />
      <Path d="M9.6 4.5l1.3 4.1M14.4 4.5l-1.3 4.1" />
      <Circle cx={12} cy={10.6} r={1.7} />
      <Path d="M12 12.3v3.9M12 16.2l-1.7 3.4M12 16.2l1.7 3.4" />
    </>
  ),
  ballon: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M3.5 12h17M12 3.5v17M5.9 5.9c2.8 2.8 2.8 9.4 0 12.2M18.1 5.9c-2.8 2.8-2.8 9.4 0 12.2" />
    </>
  ),
  escalade: (
    <>
      <Path d="M3 20l6.5-11 4 6.5 2-3L21 20z" />
      <Path d="M9.5 9V4.2l3.2 1.3-3.2 1.3" />
    </>
  ),
  lotus: (
    <>
      <Path d="M12 15.6c-2.3-2.3-2.9-6 0-10.4 2.9 4.4 2.3 8.1 0 10.4z" />
      <Path d="M11.4 16.3C9.6 13.5 6.6 12.2 3.4 12.5c.3 3.4 2.9 5.9 6.1 6.2 1 .1 1.8-.1 2.5-.5M12.6 16.3c1.8-2.8 4.8-4.1 8-3.8-.3 3.4-2.9 5.9-6.1 6.2-1 .1-1.8-.1-2.5-.5" />
    </>
  ),
  gant: (
    <>
      <Path d="M7 20.5v-3.2C5.3 15.8 4.5 13.8 4.5 11.2A6.7 6.7 0 0 1 11.2 4.5h2.4a5.4 5.4 0 0 1 5.4 5.4v2.3a5 5 0 0 1-3.7 4.8v3.5z" />
      <Path d="M7 17.6h8.3M11.3 11.5h4.4" />
    </>
  ),
  // Macros (planches/macros) : états sans objectifs chiffrés (sans chiffres, mineur) ; « coeur » sert à la grossesse.
  carnet: <Path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4M2 6h4M2 10h4M2 14h4M2 18h4M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />,
  pousse: <Path d="M7 20h10M10 20c5.5-2.5.8-6.4 3-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />,
  nutrition: <Path d="M12 8.2c-1.2-1.1-2.6-1.6-4-1.4C5.4 7.2 4 9.6 4 12.4 4 16.6 6.9 20.5 9.4 20.5c1.1 0 1.6-.5 2.6-.5s1.5.5 2.6.5c2.5 0 5.4-3.9 5.4-8.1 0-2.8-1.4-5.2-4-5.6-1.4-.2-2.8.3-4 1.4zM12 8V5.5c0-1.1.7-2 1.8-2" />,
  pas: <Path d="M8 3.5c1.7 0 2.6 1.8 2.6 4.2S9.8 12 8.3 12 5.8 10.4 5.8 8.2 6.4 3.5 8 3.5zM6.2 14.5l4.1-.6.3 2.2a2.1 2.1 0 0 1-4.1.6zM16 7.5c1.6 0 2.2 3.3 2.2 5.1s-1 3.9-2.5 3.9-2.3-1.8-2.3-4.1.9-4.9 2.6-4.9zM13.6 18.4l4.1.6-.3 2.1a2.1 2.1 0 0 1-4.1-.6z" />,
  sante: <Path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20zM4.8 12.5h4l1.4-2.5 2.2 4.5 1.4-2h5.4" />,
  user: (
    <>
      <Circle cx={12} cy={8.5} r={3.8} />
      <Path d="M4.5 20.5c1.1-3.8 4-5.8 7.5-5.8s6.4 2 7.5 5.8" />
    </>
  ),
  // Top d'un cercle (planche social-cercles, F5) : la coupe ; la médaille reste le record personnel.
  coupe: <Path d="M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0zM7.5 6H5a2.5 2.5 0 0 0 2.7 3.5M16.5 6H19a2.5 2.5 0 0 1-2.7 3.5M12 14v3M8.5 20.5h7l-1-3.5h-5z" />,
  medal: (
    <>
      <Circle cx={12} cy={15} r={5.5} />
      <Path d="M8.5 10.7L6 3.5h4l2 5 2-5h4l-2.5 7.2" />
      <Path d="M12 12.6l.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.2z" fill="currentColor" stroke="none" />
    </>
  ),
  alerte: (
    <>
      <Path d="M12 4.5L21 19.5H3z" />
      <Path d="M12 10v4.2" />
      <Circle cx={12} cy={16.9} r={0.6} fill="currentColor" />
    </>
  ),
  info: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 11v5" />
      <Circle cx={12} cy={8} r={0.6} fill="currentColor" />
    </>
  ),
  chart: <Path d="M4 19.5h16M6.5 16l4-4.5 3 2.5 4.5-6" />,
  grip: (
    <>
      {[6, 12, 18].flatMap((y) => [
        <Circle key={`a${y}`} cx={9} cy={y} r={1.2} fill="currentColor" stroke="none" />,
        <Circle key={`b${y}`} cx={15} cy={y} r={1.2} fill="currentColor" stroke="none" />,
      ])}
    </>
  ),
  history: <Path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v3.5H8M12 8v4.3l2.8 1.7" />,
  download: <Path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />,
  upload: <Path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19.5h14" />,
  nuage: <Path d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 9.1 4.7 4.7 0 0 0 7 18.5z" />,
  nuageoff: <Path d="M10 6.6a5.5 5.5 0 0 1 7.6 3.95A4 4 0 0 1 19.6 17.8M16 18.5H7A4.7 4.7 0 0 1 5.4 9.4M4 4l16 16" />,
  sortie: <Path d="M14 4.5H6.5v15H14M10.5 12H20M16.5 8.5L20 12l-3.5 3.5" />,
  cle: (
    <>
      <Circle cx={8} cy={15} r={4} />
      <Path d="M11 12l8.5-8.5M16.5 6.5l2.5 2.5M14.5 8.5l2 2" />
    </>
  ),
  export: <Path d="M12 15V3.5M7.5 8L12 3.5 16.5 8M5 13.5v6h14v-6" />,
  // Connexion IA (planche connexion-ia-simple) : invite de commande (Claude Code, agents), ouvrir une autre appli.
  invite: <Path d="M5.5 8l4 4-4 4M12.5 16.5h6" />,
  ouvrir: <Path d="M13.5 4.5h6v6M19.5 4.5L11 13M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10" />,
  // Profil public (planches/profil-public, commun.js) : en ligne, aperçu, partager, bloquer, signaler, sommeil, course.
  globe: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5z" />
    </>
  ),
  // Direct coach (planche direct-coach) : la main (qui l'a, la retirer), la récupération et forme (domaine de santé).
  main: <Path d="M8 12.8V6.2a1.5 1.5 0 0 1 3 0v5.3M11 11.2V4.7a1.5 1.5 0 0 1 3 0v6.6M14 11.5V6.4a1.5 1.5 0 0 1 3 0v7.4c0 3.8-2.6 6.7-6.2 6.7-2.3 0-3.8-1-5-2.9l-2.3-3.9a1.5 1.5 0 0 1 2.6-1.5L8 14.2" />,
  recup: (
    <>
      <Path d="M4.2 16.5a8 8 0 1 1 15.6 0M12 15.5l3.6-4.6M5.5 19.5h13" />
      <Circle cx={12} cy={15.8} r={1.2} fill="currentColor" stroke="none" />
    </>
  ),
  oeil: (
    <>
      <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <Circle cx={12} cy={12} r={3} />
    </>
  ),
  // Ignorer une activité détectée (planche activite-detectee)
  oeilBarre: (
    <>
      <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <Circle cx={12} cy={12} r={3} />
      <Path d="M4 4l16 16" />
    </>
  ),
  partager: (
    <>
      <Circle cx={18} cy={5.5} r={2.5} />
      <Circle cx={6} cy={12} r={2.5} />
      <Circle cx={18} cy={18.5} r={2.5} />
      <Path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1" />
    </>
  ),
  bloquer: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M6 6l12 12" />
    </>
  ),
  drapeau: <Path d="M5.5 21V4M5.5 4.5h11l-2.2 4 2.2 4h-11" />,
  lune: <Path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  // Ligne « Sommeil » de la liste du jour (planche effort, D10) : la lune et une petite étoile à quatre branches.
  sommeil: (
    <>
      <Path d="M18.6 14.4A7.4 7.4 0 0 1 9.6 5.4a7.4 7.4 0 1 0 9 9z" />
      <Path d="M17.5 3.5v4M15.5 5.5h4" />
    </>
  ),
  // Sauna au trait (planche effort, D10) : la vapeur au-dessus d'un banc.
  sauna: (
    <>
      <Path d="M8 3.5c-1 1.2 1 2.3 0 3.5M12 3.5c-1 1.2 1 2.3 0 3.5M16 3.5c-1 1.2 1 2.3 0 3.5" />
      <Path d="M4.5 12h15M6.5 12v7.5M17.5 12v7.5M6.5 15.5h11" />
    </>
  ),
  // « Récupérer » (planche recuperer) : la feuille du bouton, le réveil du rappel de sieste.
  feuille: <Path d="M5.5 18.5C5 11 9.5 5.5 19 5c.4 9-4.6 14-13.5 13.5zM5.5 18.5L13 11" />,
  reveil: (
    <>
      <Circle cx={12} cy={13} r={7} />
      <Path d="M12 9.5V13l2.2 1.6M5 4.5L3 6.5M19 4.5l2 2" />
    </>
  ),
  course: (
    <>
      <Circle cx={14.5} cy={4.5} r={1.8} />
      <Path d="M9 21l2.5-5.5 3 2.5v4M6 12.5l3-3.5 4 1 2.5 3.5 3 1M11.5 15.5l1.5-5.5" />
    </>
  ),
  bouclier: <Path d="M12 3.5l7 2.8v5.4c0 4.3-3 7.6-7 8.8-4-1.2-7-4.5-7-8.8V6.3z" />,
  list: (
    <>
      <Path d="M9.5 6.5h10M9.5 12h10M9.5 17.5h10" />
      <Circle cx={5} cy={6.5} r={1} fill="currentColor" stroke="none" />
      <Circle cx={5} cy={12} r={1} fill="currentColor" stroke="none" />
      <Circle cx={5} cy={17.5} r={1} fill="currentColor" stroke="none" />
    </>
  ),
  // La carte dépliée (planche planche-decouvrir, Segmenté Liste / Carte).
  carte: (
    <>
      <Path d="M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" />
      <Path d="M9 4.5v13M15 6.5v13" />
    </>
  ),
  link: <Path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2" />,
  unlink: <Path d="M15.5 13.3l3.2-3.2a4 4 0 0 0-5.7-5.7L9.8 7.6M8.5 10.7l-3.2 3.2a4 4 0 0 0 5.7 5.7l3.2-3.2M8 2.5V5M2.5 8H5M16 21.5V19M21.5 16H19" />,
  placeoff: <Path d="M8.4 4.9A6.5 6.5 0 0 1 18.5 10c0 1.9-.8 3.8-1.8 5.5M14.7 18.3C13.2 20 12 21 12 21s-6.5-5.6-6.5-11c0-.9.2-1.8.5-2.6M4 4l16 16" />,
  camera: (
    <>
      <Path d="M4 8.5h3.2L8.8 6h6.4l1.6 2.5H20v11H4z" />
      <Circle cx={12} cy={13.5} r={3.4} />
    </>
  ),
  // Appareils connectés (planche compte-connexion, 5a) : un écran et un téléphone.
  appareils: (
    <>
      <Rect x={3} y={5} width={13} height={9} rx={1.8} />
      <Path d="M6 18h7" />
      <Rect x={15.5} y={9.5} width={5.5} height={10} rx={1.5} />
    </>
  ),
  // Direct sur écran (planche seance-live, P1 à P4) : la télé du studio ; la ceinture cardio (Bluetooth).
  ecran: (
    <>
      <Rect x={3} y={4.5} width={18} height={12} rx={2} />
      <Path d="M8.5 20h7M12 16.5V20" />
    </>
  ),
  capteur: <Path d="M7 7.5l10 9-5 4.5V3l5 4.5-10 9" />,
  // Ouvrir sur un ordinateur (planches/qr-ordinateur) : écran de portable et sa base.
  ordinateur: (
    <>
      <Rect x={4} y={5} width={16} height={10.5} rx={2} />
      <Path d="M2.5 19h19" />
    </>
  ),
  image: (
    <>
      <Rect x={3.5} y={4.5} width={17} height={15} rx={2.5} />
      <Circle cx={9} cy={9.5} r={1.6} />
      <Path d="M4 17.5l5-5 4 4 2.5-2.5 4.5 4.5" />
    </>
  ),
  routine: (
    <>
      <Rect x={4.5} y={3.5} width={15} height={17} rx={2.5} />
      <Path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
    </>
  ),
  monter: <Path d="M12 19V5M6.5 10.5L12 5l5.5 5.5" />,
  descendre: <Path d="M12 5v14M6.5 13.5L12 19l5.5-5.5" />,
  langue: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5z" />
    </>
  ),
  horloge: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 7.5V12l3 2" />
    </>
  ),
  // Sommeil, changement d'heure et voyage (planche sommeil, c2 et c3) : la lumière du jour, le vol.
  soleil: (
    <>
      <Circle cx={12} cy={12} r={3.8} />
      <Path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
    </>
  ),
  avion: <Path d="M12 3.2c.8 0 1.4.7 1.4 1.5v4.6l7.1 4.3v1.9l-7.1-2.2v4.1l2 1.5v1.6L12 19.6l-3.4.9v-1.6l2-1.5v-4.1l-7.1 2.2v-1.9l7.1-4.3V4.7c0-.8.6-1.5 1.4-1.5z" />,
  poids: (
    <>
      <Path d="M6 8h12l1.5 11h-15z" />
      <Path d="M9.5 8a2.5 2.5 0 015 0" />
    </>
  ),
  distance: <Path d="M4 18c3-8 5 2 8-6s5 0 8-6" />,
  // Pages de mesure (planche pas, 28/10) : énergie, récupération, âge pepfit ; flèches d'écart à la normale (sommeil : « lune » du profil public).
  energie: <Path d="M12 3c1 3 4 4.5 4 9a4 4 0 0 1-8 0c0-2 1-3 1-3 .5 1.5 1.5 2 1.5 2C10.5 8 12 6 12 3z" />,
  pouls: <Path d="M3 12h4l2-5 4 10 2-5h6" />,
  // Page Appareils (planche appareils-recommandes-v5) : composition corporelle (goutte) et température (thermomètre).
  goutte: <Path d="M12 3.5s6 6.2 6 10.5a6 6 0 0 1-12 0c0-4.3 6-10.5 6-10.5z" />,
  thermo: <Path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0zM12 9v7" />,
  /** VO2max (planche vma-vo2max) : deux poumons et la trachée. */
  souffle: (
    <>
      <Path d="M12 3v7.5M12 10.5c0 1.2-1 2-2.5 2.3M12 10.5c0 1.2 1 2 2.5 2.3" />
      <Path d="M9.5 6.5C7 6.8 4.5 10.5 4.5 15.6c0 2.6 1.2 4 2.9 4 1.3 0 2.1-.9 2.1-2.4z" />
      <Path d="M14.5 6.5c2.5.3 5 4 5 9.1 0 2.6-1.2 4-2.9 4-1.3 0-2.1-.9-2.1-2.4z" />
    </>
  ),
  // Lecture en attente (précision pepfit) : le « pas encore » de l'activité détectée, un cercle en pointillés ; jamais un cadenas.
  // Anneau ouvert d'un quart : « Synchro en cours » (ligne Sommeil), il tourne.
  arc: <Path d="M12 4a8 8 0 1 1-8 8" />,
  attente: <Circle cx={12} cy={12} r={8} strokeDasharray="2.6 2.4" />,
  agePepfit: (
    <>
      <Circle cx={12} cy={12} r={8} />
      <Path d="M12 7v5l3 2" />
    </>
  ),
  hautFleche: <Path d="M12 19V5M6 11l6-6 6 6" />,
  basFleche: <Path d="M12 5v14M6 13l6 6 6-6" />,
  /** Pèse-personne (poids de corps). */
  balance: (
    <>
      <Rect x={4} y={4} width={16} height={16} rx={4} />
      <Path d="M8.5 10a3.5 3.5 0 017 0M12 10l1.25-1.75" />
    </>
  ),
  /** Suivi du cycle (planche cycle) : un cercle ouvert et son point, au même trait. */
  cycle: (
    <>
      <Path d="M19.4 9.5A8 8 0 1 1 14.5 4.4" />
      <Circle cx={18} cy={6} r={1.6} fill="currentColor" stroke="none" />
    </>
  ),
  /** Cadenas des données chiffrées (planche cycle : « Chiffré, visible par toi seulement »). */
  cadenas: (
    <>
      <Rect x={5.5} y={10.5} width={13} height={9.5} rx={2.5} />
      <Path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  /** Sceau à coche : établissement officiel (planche Établissement, 30/10). */
  sceau: (
    <>
      <Path d={SCEAU_D} />
      <Path d={COCHE_D} />
    </>
  ),
  /** Combiné : appeler. */
  tel: <Path d="M6.6 3.8l2.7.4 1.3 3.7-1.9 1.6a11 11 0 0 0 5.8 5.8l1.6-1.9 3.7 1.3.4 2.7a2 2 0 0 1-2 2.1A15.6 15.6 0 0 1 4.5 5.8a2 2 0 0 1 2.1-2z" />,
  // Coachs publics (planches/coach-public, appli.src.html) : enregistrer, « fait par », établissement, contacter, réseaux.
  signet: <Path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-4-6 4V5.5a1 1 0 0 1 1-1z" />,
  gens: (
    <>
      <Circle cx={9} cy={8.5} r={3.2} />
      <Path d="M3 19c.9-3 3.2-4.6 6-4.6s5.1 1.6 6 4.6M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.6c1.7.6 3 2 3.5 4.4" />
    </>
  ),
  etab: <Path d="M4 20V8.5l8-4 8 4V20M3 20h18M9 20v-5h6v5" />,
  mail: (
    <>
      <Rect x={3.5} y={5.5} width={17} height={13} rx={2.5} />
      <Path d="M4 7l8 6 8-6" />
    </>
  ),
  insta: (
    <>
      <Rect x={4} y={4} width={16} height={16} rx={4.5} />
      <Circle cx={12} cy={12} r={3.6} />
      <Circle cx={16.8} cy={7.2} r={0.9} fill="currentColor" stroke="none" />
    </>
  ),
  tiktok: <Path d="M13.5 4v10.5a3.5 3.5 0 1 1-3.5-3.5M13.5 4c.4 2.6 2.1 4.2 4.5 4.5" />,
  youtube: (
    <>
      <Rect x={3} y={6} width={18} height={12} rx={3.5} />
      <Path d="M10.5 9.5v5l4.2-2.5z" fill="currentColor" />
    </>
  ),
  strava: <Path d="M10.5 3.5l-5 10h3l2-4 2 4h3zM14 15.5l1.6 3.2 1.6-3.2" />,
  /** Le Fil (planche fil) : une publication et deux lignes de texte. */
  fil: (
    <>
      <Rect x={4} y={4} width={16} height={8} rx={2.5} />
      <Path d="M4 16.5h16M4 20.5h10" />
    </>
  ),
  /** Réagir : un visage qui sourit et un « + ». */
  reagir: (
    <>
      <Path d="M20.4 11.2A8.5 8.5 0 1 1 12.8 3.5" />
      <Path d="M8.7 14.2a4 4 0 0 0 6.6 0M9 9.5h.01M15 9.5h.01" strokeWidth={2.2} />
      <Path d="M19 2.8v5.4M16.3 5.5h5.4" />
    </>
  ),
  /** Commenter : une bulle. */
  commenter: <Path d="M4.5 18.8V7a2.5 2.5 0 0 1 2.5-2.5h10A2.5 2.5 0 0 1 19.5 7v7a2.5 2.5 0 0 1-2.5 2.5H8.6z" />,
  /** Étoile d'un avis (planche lieux non vérifiés, N1 à N4) : même tracé que `Etoiles`. */
  etoile: <Path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />,
  /** Menu de l'Accueil (planche v4) : trois traits. */
  burger: <Path d="M4 7h16M4 12h16M4 17h16" />,
  /** Découverte : une boussole. */
  decouvrir: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </>
  ),
  /** Agrandir une carte : deux coins. */
  agrandir: <Path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" />,
  // Circuits (planche Circuits, lot B) : un circuit, un fichier GPX, le vélo de la planche Découvrir, le « − » du zoom d'une carte.
  /** Un circuit : un départ, un tracé qui boucle, une arrivée. */
  circuit: (
    <>
      <Circle cx={6} cy={18} r={2.2} />
      <Circle cx={18.2} cy={4.6} r={2.2} />
      <Path d="M8.2 18H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.8" />
    </>
  ),
  /** Un fichier GPX : une feuille cornée avec un tracé. */
  fichier: <Path d="M6.5 3.5h7l4 4v13h-11zM13.5 3.5v4h4M9 15c1.2-1.5 2-1.5 3 0s1.8 1.5 3 0" />,
  /** Le « − » du zoom d'une carte, avec le « + » (`plus`) ; `moins` reste celui du retrait d'une ligne. */
  zmoins: <Path d="M5 12h14" />,
  /** Réglages d'un écran : deux curseurs. */
  curseurs: (
    <>
      <Path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <Circle cx={15} cy={7} r={2} />
      <Circle cx={9} cy={17} r={2} />
    </>
  ),
  // « Aider à s'endormir » (planche sommeil, 03/11) : les méthodes, le son, les conseils du soir.
  vague: <Path d="M3 12c2.2-4 4.4-4 6.6 0s4.4 4 6.6 0 3.6-3 4.8-1.5" />,
  carre: <Rect x={5} y={5} width={14} height={14} rx={2.5} />,
  corps: (
    <>
      <Circle cx={12} cy={5} r={2} />
      <Path d="M12 8v6M8 10.5l4-1.5 4 1.5M9.5 21l2.5-7 2.5 7" />
    </>
  ),
  spirale: <Path d="M12 12.5a1 1 0 1 1 1-1.2 2.6 2.6 0 0 1-2.9 3.4 4.2 4.2 0 0 1-2.6-5.4A5.8 5.8 0 0 1 15 6.4a7.4 7.4 0 0 1 3.9 9.1" />,
  son: <Path d="M4.5 9.5h3l4-3.5v12l-4-3.5h-3zM15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" />,
  ampoule: <Path d="M9 17.5h6M10 20.5h4M12 3.5a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3.5z" />,
  /** Envoyer (un commentaire) : une flèche. */
  envoyer: <Path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" />,
  // Social (planche social-cercles) : l'onglet (deux silhouettes, D2), suivre, followers, cercles, modération.
  amis: (
    <>
      <Circle cx={9} cy={8.5} r={3.3} />
      <Path d="M3 19.5c.9-3.3 3.3-5 6-5s5.1 1.7 6 5" />
      <Circle cx={16.5} cy={9} r={2.7} />
      <Path d="M16.5 14.5c2.2 0 4 1.4 4.6 4" />
    </>
  ),
  abonnes: (
    <>
      <Circle cx={10} cy={8.5} r={3.6} />
      <Path d="M3.5 20c1-3.6 3.6-5.5 6.5-5.5 1.6 0 3.1.5 4.3 1.5M15.5 18.5l2 2 4-4.5" />
    </>
  ),
  suivre: (
    <>
      <Circle cx={10} cy={8.5} r={3.6} />
      <Path d="M3.5 20c1-3.6 3.6-5.5 6.5-5.5 1.5 0 2.9.4 4 1.2M18.5 14v6M15.5 17h6" />
    </>
  ),
  retirer: (
    <>
      <Circle cx={10} cy={8.5} r={3.6} />
      <Path d="M3.5 20c1-3.6 3.6-5.5 6.5-5.5 1.5 0 2.9.4 4 1.2M15.5 17.5h6" />
    </>
  ),
  cercle: (
    <>
      <Circle cx={12} cy={6.5} r={2.5} />
      <Circle cx={6} cy={16.5} r={2.5} />
      <Circle cx={18} cy={16.5} r={2.5} />
      <Path d="M10.7 8.7l-3.3 5.6M13.3 8.7l3.3 5.6M8.5 16.5h7" />
    </>
  ),
  annonce: <Path d="M4 10v4a1 1 0 0 0 1 1h2l8 4.5V4.5L7 9H5a1 1 0 0 0-1 1zM8 15l1 5h2.5l-1-5M18.5 9.5a3.5 3.5 0 0 1 0 5" />,
  bannir: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M6 6l12 12" />
    </>
  ),
  sablier: <Path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 8 4.5 8 8.5s-8 4-8 8.5M16 3.5c0 4.5-8 4.5-8 8.5s8 4 8 8.5" />,
  refaire: <Path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
  /** Demi-disque plein : jour, nuit ou auto. */
  apparence: (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 3.5a8.5 8.5 0 010 17z" fill="currentColor" />
    </>
  ),
  /** Trois bonhommes (planche cercles v4, PI4) : une personne au centre, deux plus petites de chaque côté ; remplace l'haltère des séances partagées. */
  groupe3: (
    <>
      <Circle cx={12} cy={8} r={3} />
      <Path d="M6.8 19.5c.6-3.4 2.8-5.2 5.2-5.2s4.6 1.8 5.2 5.2" />
      <Circle cx={4.8} cy={10.4} r={2} />
      <Path d="M2.4 17.8c.3-1.9 1.4-3.2 3-3.5" />
      <Circle cx={19.2} cy={10.4} r={2} />
      <Path d="M21.6 17.8c-.3-1.9-1.4-3.2-3-3.5" />
    </>
  ),
  /** Membre invisible (planche PI5) : chapeau et lunettes, à la place du @pseudo. */
  anonyme: (
    <>
      <Path d="M4 11.5h16" />
      <Path d="M7 11.5l1.2-5.6a1.6 1.6 0 0 1 1.6-1.3h4.4a1.6 1.6 0 0 1 1.6 1.3L17 11.5" />
      <Circle cx={8} cy={16.6} r={2.6} />
      <Circle cx={16} cy={16.6} r={2.6} />
      <Path d="M10.6 16.2c.9-.5 1.9-.5 2.8 0" />
    </>
  ),
  /** Trèfle des Cercles (planche PI1) : trois cercles qui se recouvrent. */
  trefle: (
    <>
      <Circle cx={12} cy={9.2} r={5.5} strokeWidth={2} />
      <Circle cx={14.94} cy={14.3} r={5.5} strokeWidth={2} />
      <Circle cx={9.06} cy={14.3} r={5.5} strokeWidth={2} />
    </>
  ),
  /** Anneau : le cercle sans photo (la lettre « O » des Cercles). */
  anneau: <Circle cx={12} cy={12} r={7.5} strokeWidth={2} />,
  sourdine: <Path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5h4M4 4l16 16" />,
  transfert: <Path d="M4 8.5h13M13.5 5l3.5 3.5-3.5 3.5M20 15.5H7M10.5 12l-3.5 3.5 3.5 3.5" />,
  quitter: <Path d="M10 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10M14.5 8l4 4-4 4M18.5 12H9.5" />,
  itineraire: <Path d="M20 4L4 10.8l6.3 2.4 2.5 6.5z" />,
  appeler: <Path d="M5.5 4.5h3l1.6 4-2 1.4a10.5 10.5 0 0 0 5 5l1.4-2 4 1.6v3A1.8 1.8 0 0 1 16.7 19C9.8 18.6 5.4 14.2 5 7.3a1.8 1.8 0 0 1 .5-2.8z" />,
} as const;

export type NomIcone = keyof typeof DESSINS;

export const estIcone = (n: string): n is NomIcone => n in DESSINS;

interface Props {
  nom: NomIcone;
  couleur: string;
  taille?: number;
  epaisseur?: number;
  /** Trait en dégradé (135°) au lieu de `couleur` (qui reste celle des points pleins). */
  degrade?: readonly Arret[];
}

export function Icone({ nom, couleur, taille = 20, epaisseur = 1.75, degrade }: Props) {
  const id = "ico" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const a = axeDegrade(135, 24, 24);
  return (
    <Svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke={degrade ? `url(#${id})` : couleur}
      color={couleur}
      strokeWidth={epaisseur}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {degrade ? (
        <Defs>
          <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1={a.x1 * 24} y1={a.y1 * 24} x2={a.x2 * 24} y2={a.y2 * 24}>
            {degrade.map((s) => (
              <Stop key={s.offset} offset={s.offset} stopColor={s.couleur} stopOpacity={s.opacite ?? 1} />
            ))}
          </LinearGradient>
        </Defs>
      ) : null}
      {DESSINS[nom]}
    </Svg>
  );
}
