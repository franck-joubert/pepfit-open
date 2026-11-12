// Le coffre du téléphone (expo-secure-store) : tout l'appli passe par ici.
import * as SecureStore from "expo-secure-store";

export const getItemAsync: typeof SecureStore.getItemAsync = (cle, options) => SecureStore.getItemAsync(cle, options);

export const setItemAsync: typeof SecureStore.setItemAsync = (cle, valeur, options) => SecureStore.setItemAsync(cle, valeur, options);

export const deleteItemAsync: typeof SecureStore.deleteItemAsync = (cle, options) => SecureStore.deleteItemAsync(cle, options);
