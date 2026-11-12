// Metro : le personnage 3D et ses clips (.glb) sont des fichiers de l'appli, comme les images (vue 3D, D19).
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push("glb");
module.exports = config;
