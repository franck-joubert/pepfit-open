import React from "react";
import { hote } from "./aide.mjs";

const insets = { top: 24, bottom: 0, left: 0, right: 0 };
export const SafeAreaInsetsContext = React.createContext(insets);
export const SafeAreaView = hote("SafeAreaView");
export const SafeAreaProvider = ({ children }) => children;
export const useSafeAreaInsets = () => insets;
