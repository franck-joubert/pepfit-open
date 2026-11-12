// react-native-gesture-handler : le geste de « tirer pour actualiser » (ui/Actualiser.tsx) n'a pas de doigt dans le test de rendu.
import { hote } from "./aide.mjs";

export const GestureHandlerRootView = hote("GestureHandlerRootView");
export const GestureDetector = ({ children }) => children;
export const usePanGesture = () => ({});
