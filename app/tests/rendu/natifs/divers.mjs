// Les petits modules natifs dont la page ne se sert pas à l'écran : ils existent, ils ne font rien.
import { hote, vide } from "./aide.mjs";

export const Camera = hote("Camera");
export const GeoJSONSource = hote("GeoJSONSource");
export const Layer = hote("Layer");
export const Map = hote("Map");
export const Canvas = hote("Canvas");
export const Group = hote("Group");
export const LinearGradient = hote("LinearGradient");
export const RadialGradient = hote("RadialGradient");
export const Rect = hote("Rect");
export const vec = (x, y) => ({ x, y });
export const BlurTargetView = hote("BlurTargetView");
export const BlurView = hote("BlurView");
export const reloadAppAsync = vide;
export const setStatusBarStyle = () => {};
export const StatusBar = hote("StatusBar");
export const activateKeepAwakeAsync = vide;
export const deactivateKeepAwake = () => {};
export const getCalendars = () => [{ calendar: "gregory", uses24hourClock: true, firstWeekday: 2, timeZone: "Europe/Paris" }];
export const getLocales = () => [{ languageCode: "fr", languageTag: "fr-FR", regionCode: "FR", measurementSystem: "metric", temperatureUnit: "celsius" }];
export const ImageManipulator = { manipulate: () => ({}) };
export const SaveFormat = { JPEG: "jpeg", PNG: "png", WEBP: "webp" };
// Un fichier existe une fois écrit (le cache des images de cercle) ; sinon, jamais.
const ecrits = new globalThis.Map();
export class File {
  constructor(...a) { this.uri = a.join("/"); }
  get exists() { return ecrits.has(this.uri); }
  create() {}
  write(octets) { ecrits.set(this.uri, octets); }
  delete() { ecrits.delete(this.uri); }
  static async downloadFileAsync() { throw new Error("pas de réseau dans le test de rendu"); }
}
export class Directory { constructor(...a) { this.uri = a.join("/"); } get exists() { return false; } create() {} toString() { return this.uri; } }
export const FileMode = { ReadOnly: 0, WriteOnly: 1, ReadWrite: 2 };
export const Paths = { document: "/doc", cache: "/cache" };
export const defaultDatabaseDirectory = "/db";
export const openDatabaseAsync = async () => { throw new Error("pas de base dans le test de rendu"); };
export const fetch = (...a) => globalThis.fetch(...a);
export const getDocumentAsync = vide;
// expo-haptics, expo-image-picker, expo-location, expo-notifications, expo-system-ui (importés en « * as »)
export const impactAsync = vide;
export const notificationAsync = vide;
export const selectionAsync = vide;
export const performAndroidHapticsAsync = vide;
export const ImpactFeedbackStyle = { Light: "light", Medium: "medium", Heavy: "heavy", Rigid: "rigid", Soft: "soft" };
export const NotificationFeedbackType = { Success: "success", Warning: "warning", Error: "error" };
export const AndroidHaptics = { Reject: "reject", Segment_Tick: "tick", Gesture_End: "end", Drag_Start: "drag", Confirm: "confirm" };
export const launchImageLibraryAsync = async () => ({ canceled: true, assets: null });
export const launchCameraAsync = async () => ({ canceled: true, assets: null });
export const requestCameraPermissionsAsync = async () => ({ granted: false });
export const getForegroundPermissionsAsync = async () => ({ granted: false, status: "denied", canAskAgain: true });
export const requestForegroundPermissionsAsync = async () => ({ granted: false, status: "denied", canAskAgain: true });
export const getLastKnownPositionAsync = async () => null;
export const getCurrentPositionAsync = async () => { throw new Error("pas de position"); };
export const watchPositionAsync = async () => ({ remove() {} });
export const Accuracy = { Balanced: 3, High: 4 };
export const setBackgroundColorAsync = vide;
export const setNotificationHandler = () => {};
export const setNotificationChannelAsync = vide;
export const setNotificationCategoryAsync = vide;
export const scheduleNotificationAsync = vide;
export const cancelScheduledNotificationAsync = vide;
export const getAllScheduledNotificationsAsync = async () => [];
export const dismissNotificationAsync = vide;
export const getPresentedNotificationsAsync = async () => [];
export const getPermissionsAsync = async () => ({ granted: false });
export const getNotificationChannelsAsync = async () => [];
export const getLastNotificationResponseAsync = async () => null;
export const clearLastNotificationResponseAsync = vide;
export const deleteNotificationChannelAsync = vide;
export const addNotificationResponseReceivedListener = () => ({ remove() {} });
export const addNotificationReceivedListener = () => ({ remove() {} });
export const SchedulableTriggerInputTypes = { DATE: "date", TIME_INTERVAL: "timeInterval", DAILY: "daily" };
export const AndroidImportance = { DEFAULT: 3, LOW: 2, HIGH: 4, MAX: 5, MIN: 1 };
export const AndroidNotificationVisibility = { PUBLIC: 1, PRIVATE: 0, SECRET: -1 };
export const AndroidAudioUsage = { ALARM: 4 };
export const AndroidAudioContentType = { SONIFICATION: 4 };
export const scheduleOnUI = (f) => f?.();
// @shopify/react-native-skia : la désintégration d'une suppression (ui/Desintegration.tsx), jamais jouée à l'écran du test.
export const Atlas = hote("Atlas");
export const makeImageFromView = async () => null;
export const Skia = { XYWHRect: (x, y, w, h) => ({ x, y, w, h }), Color: (c) => c };
export const useColorBuffer = () => ({ value: [] });
export const useRSXformBuffer = () => ({ value: [] });
export const scheduleOnRN = (f, ...a) => f?.(...a);
export const BlurMask = hote("BlurMask");
export const Circle = hote("Circle");
export const DashPathEffect = hote("DashPathEffect");
export const Fill = hote("Fill");
export const Line = hote("Line");
export const Paint = hote("Paint");
export const Path = hote("Path");
export const RoundedRect = hote("RoundedRect");
export const Shader = hote("Shader");
export const ImageFormat = { PNG: 4, JPEG: 3, WEBP: 6 };
export const TileMode = { Clamp: 0, Repeat: 1, Mirror: 2, Decal: 3 };
export const useImage = () => null;
export const Image = hote("SkiaImage");
