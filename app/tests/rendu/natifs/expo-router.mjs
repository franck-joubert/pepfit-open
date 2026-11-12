import { useEffect } from "react";

/** Les ouvertures de page que l'écran a demandées, lues par le test. */
globalThis.__routes = [];
const noter = (k) => (a) => void globalThis.__routes.push({ geste: k, vers: a });
export const router = { push: noter("push"), replace: noter("replace"), navigate: noter("navigate"), back: noter("back"), canGoBack: () => true, setParams: noter("setParams"), dismiss: noter("dismiss") };
export const useRouter = () => router;
export const useFocusEffect = (f) => useEffect(f, [f]);
export const useIsFocused = () => true;
export const useNavigation = () => ({ goBack() {}, addListener: () => () => {}, canGoBack: () => true, setOptions() {} });
export const usePathname = () => "/";
/** Les paramètres de la route que le test pose (globalThis.__params) avant de monter l'écran. */
export const useLocalSearchParams = () => globalThis.__params ?? {};
export const Redirect = () => null;
export const Stack = Object.assign(() => null, { Screen: () => null });
export const Tabs = Object.assign(() => null, { Screen: () => null });
export const usePreventRemove = () => {};
